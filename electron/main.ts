import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const execAsync = promisify(exec);

// Custom protocol for serving local media securely
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0d0f12',
    title: 'CullPrint - DNP DS620 Fast Print',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Remove default menu for maximum workspace & clean look
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  // Register 'media://' protocol handler
  protocol.handle('media', (request) => {
    try {
      // Decode the URL path
      // media:///home/user/photo.jpg -> /home/user/photo.jpg
      const urlObj = new URL(request.url);
      let filePath = decodeURIComponent(urlObj.pathname);

      // On Windows or certain URL formats, strip leading slash if needed
      if (process.platform === 'win32' && filePath.startsWith('/')) {
        filePath = filePath.slice(1);
      }

      return net.fetch(pathToFileURL(filePath).toString());
    } catch (err) {
      console.error('Error handling media protocol:', err);
      return new Response('File not found', { status: 404 });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers

// 1. Select Folder Dialog
ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Fotoğraf Klasörü Seçin (SD Kart / Disk)',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// 1.5. Select Multiple Files Dialog (Doğrudan Fotoğraf Ekleme)
ipcMain.handle('select-files', async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: 'Fotoğraf Seçin (Tek veya Çoklu)',
    filters: [
      { name: 'Fotoğraflar', extensions: ['jpg', 'jpeg', 'png', 'webp', 'JPG', 'JPEG', 'PNG'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return [];

  const files = [];
  for (const filePath of result.filePaths) {
    try {
      const stat = await fs.promises.stat(filePath);
      files.push({
        name: path.basename(filePath),
        path: filePath,
        size: stat.size,
        lastModified: stat.mtimeMs,
      });
    } catch (e) {
      console.error('Dosya okunamadı:', filePath, e);
    }
  }
  return files;
});

// 2. Read Folder for Images
ipcMain.handle('read-folder', async (_event, folderPath: string) => {
  try {
    if (!fs.existsSync(folderPath)) return [];

    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);

    const files = [];
    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (imageExtensions.has(ext)) {
          const fullPath = path.join(folderPath, entry.name);
          const stat = await fs.promises.stat(fullPath);
          files.push({
            name: entry.name,
            path: fullPath,
            size: stat.size,
            lastModified: stat.mtimeMs,
          });
        }
      }
    }

    // Sort naturally by file name (e.g. IMG_0001, IMG_0002)
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    return files;
  } catch (err) {
    console.error('Klasör okuma hatası:', err);
    return [];
  }
});

// 3. Get CUPS Printers & USB Connection Check
ipcMain.handle('get-printers', async () => {
  try {
    const { stdout } = await execAsync('lpstat -p -d');
    const lines = stdout.split('\n');
    let defaultPrinter = '';

    // Check physical USB connection via lsusb
    let isUsbPhysicallyConnected = false;
    try {
      const { stdout: lsusbOut } = await execAsync('lsusb');
      // 1208 is DNP vendor ID, or match device strings
      isUsbPhysicallyConnected = /1208:|ds620|dai nippon|dnp/i.test(lsusbOut);
    } catch {
      // ignore if lsusb not available
    }

    const printers = [];

    // Parse default printer: "system default destination: Printer_Name"
    for (const line of lines) {
      if (line.includes('default destination:')) {
        const parts = line.split('default destination:');
        if (parts[1]) defaultPrinter = parts[1].trim();
      }
    }

    // Parse printer status: "printer Dai_Nippon_Printing_DP-DS620 is idle. enabled since..."
    for (const line of lines) {
      const match = line.match(/^printer\s+([^\s]+)\s+is\s+([^.]+)/);
      if (match) {
        const name = match[1];
        const status = match[2].trim();
        const isDNP = /ds620|dnp|dai_nippon|rx1/i.test(name);

        printers.push({
          name,
          status,
          isDefault: name === defaultPrinter,
          isDNP,
          usbConnected: isDNP ? isUsbPhysicallyConnected : true,
        });
      }
    }

    return printers;
  } catch (err) {
    console.warn('lpstat komutu çalıştırılamadı:', err);
    return [];
  }
});

// 4. Get Printer Options (Media size, laminate finish, etc.)
ipcMain.handle('get-printer-options', async (_event, printerName: string) => {
  try {
    const { stdout } = await execAsync(`lpoptions -p "${printerName}" -l`);
    return { raw: stdout };
  } catch (err) {
    console.warn('lpoptions sorgulanamadı:', err);
    return { raw: '' };
  }
});

// 5. Save Temporary Rendered Crop for Printing
ipcMain.handle('save-temp-print-file', async (_event, base64Data: string) => {
  try {
    // base64Data: "data:image/jpeg;base64,..."
    const matches = base64Data.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
    if (!matches) throw new Error('Geçersiz Base64 görsel verisi');

    const ext = matches[1] === 'png' ? 'png' : 'jpg';
    const buffer = Buffer.from(matches[2], 'base64');

    const tmpDir = path.join(os.tmpdir(), 'cullprint-spool');
    if (!fs.existsSync(tmpDir)) {
      await fs.promises.mkdir(tmpDir, { recursive: true });
    }

    const fileName = `spool_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
    const filePath = path.join(tmpDir, fileName);

    await fs.promises.writeFile(filePath, buffer);
    return filePath;
  } catch (err) {
    console.error('Geçici baskı dosyası kaydedilemedi:', err);
    throw err;
  }
});

// 6. Execute Print via CUPS
ipcMain.handle(
  'execute-print',
  async (
    _event,
    {
      filePath,
      printerName,
      copies = 1,
      mediaSize = 'w432h576',
      finish = 'Glossy',
    }: {
      filePath: string;
      printerName: string;
      copies: number;
      mediaSize: string;
      finish: string;
    }
  ) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, output: '', error: 'Baskı dosyası bulunamadı.' };
      }

      // Build lp command with options for DNP DS620
      // -d <printer>
      // -n <copies>
      // -o media=w432h576 (6x8 inç)
      // -o StpLaminate=Glossy or Matte
      const finishOption = finish ? `-o StpLaminate=${finish}` : '';
      const mediaOption = mediaSize ? `-o media=${mediaSize}` : '-o media=w432h576';
      const cmd = `lp -d "${printerName}" -n ${copies} ${mediaOption} ${finishOption} "${filePath}"`;

      console.log('Baskı komutu çalıştırılıyor:', cmd);
      const { stdout, stderr } = await execAsync(cmd);

      return {
        success: true,
        output: stdout.trim(),
        error: stderr ? stderr.trim() : undefined,
      };
    } catch (err: unknown) {
      console.error('Yazdırma işlemi başarısız:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, output: '', error: errorMsg };
    }
  }
);
