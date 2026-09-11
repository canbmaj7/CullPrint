import { app, BrowserWindow, ipcMain, dialog, protocol, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import exifr from 'exifr';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

function getJpegDimensions(buffer: Buffer) {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      return { width, height };
    }
    const len = buffer.readUInt16BE(offset + 2);
    offset += 2 + len;
  }
  return null;
}

async function parseImageInfo(filePath: string) {
  let orientation = 1;
  let width = 6000;
  let height = 4000;

  try {
    const fd = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.alloc(65536);
    await fd.read(buffer, 0, 65536, 0);
    await fd.close();

    // 1. JPEG binary marker boyutları
    const dims = getJpegDimensions(buffer);
    if (dims) {
      width = dims.width;
      height = dims.height;
    }

    // 2. EXIF yön bilgisi (Buffer üzerinden exifr)
    try {
      const data = await exifr.parse(buffer, ['Orientation']);
      if (data?.Orientation) {
        orientation = data.Orientation;
      }
    } catch {
      // EXIF yoksa varsayılan devam
    }
  } catch (err) {
    console.warn('Metadata okuma hatası:', filePath, err);
  }

  if (orientation === 6 || orientation === 8) {
    const tmp = width;
    width = height;
    height = tmp;
  }
  const isLandscape = width >= height;

  return { orientation, width, height, isLandscape };
}

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
  {
    scheme: 'media-thumb',
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

  // F12 veya Ctrl+Shift+I ile konsolu açabilme
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow?.webContents.toggleDevTools();
    }
  });

  // Remove default menu for maximum workspace & clean look
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  // Register 'media://' protocol handler with direct fs reading
  protocol.handle('media', async (request) => {
    try {
      // Strip 'media://' or 'media:///'
      let raw = request.url.replace(/^media:\/\/+/, '');
      if (process.platform !== 'win32' && !raw.startsWith('/')) {
        raw = '/' + raw;
      }
      let filePath = decodeURIComponent(raw);

      // On Windows: /C:/path -> C:/path
      if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(filePath)) {
        filePath = filePath.slice(1);
      }

      if (!fs.existsSync(filePath)) {
        console.error('CullPrint: Dosya diskte bulunamadı:', filePath);
        return new Response('File not found: ' + filePath, { status: 404 });
      }

      const buffer = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp',
      };

      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': mimeTypes[ext] || 'image/jpeg',
          'Content-Length': String(buffer.length),
        },
      });
    } catch (err) {
      console.error('CullPrint Media Protocol Hatası:', err);
      return new Response('Media load error', { status: 500 });
    }
  });

  // Register 'media-thumb://' protocol handler for cached thumbnail generation
  protocol.handle('media-thumb', async (request) => {
    try {
      const url = new URL(request.url);
      const rawPath = url.searchParams.get('path');
      const sizeParam = url.searchParams.get('size');

      if (!rawPath) {
        return new Response('File path missing', { status: 400 });
      }

      let filePath = rawPath;
      try {
        filePath = decodeURIComponent(rawPath);
      } catch {
        filePath = rawPath;
      }

      if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(filePath)) {
        filePath = filePath.slice(1);
      }

      if (!fs.existsSync(filePath) && fs.existsSync(rawPath)) {
        filePath = rawPath;
      }

      if (!fs.existsSync(filePath)) {
        console.error('CullPrint: Dosya diskte bulunamadı:', filePath);
        return new Response('File not found: ' + filePath, { status: 404 });
      }

      const size = parseInt(sizeParam || '240', 10) || 240;
      const stat = await fs.promises.stat(filePath);
      const cacheDir = path.join(os.tmpdir(), 'cullprint-thumbs');
      if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
      }

      const hash = crypto
        .createHash('sha1')
        .update(`${filePath}:${stat.mtimeMs}:${size}`)
        .digest('hex');
      const cachePath = path.join(cacheDir, `${hash}.jpg`);

      if (fs.existsSync(cachePath)) {
        const cachedBuffer = await fs.promises.readFile(cachePath);
        return new Response(cachedBuffer, {
          status: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Length': String(cachedBuffer.length),
          },
        });
      }

      const img = await nativeImage.createThumbnailFromPath(filePath, { width: size, height: size });
      const buffer = img.toJPEG(86);
      await fs.promises.writeFile(cachePath, buffer);

      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Length': String(buffer.length),
        },
      });
    } catch (err) {
      console.error('CullPrint Thumbnail Protocol Hatası:', err);
      return new Response('Thumbnail load error', { status: 500 });
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
      const meta = await parseImageInfo(filePath);
      files.push({
        name: path.basename(filePath),
        path: filePath,
        size: stat.size,
        lastModified: stat.mtimeMs,
        ...meta,
      });
    } catch (e) {
      console.error('Dosya okunamadı:', filePath, e);
    }
  }
  return files;
});

// 1.8. Get Single File Info (Drag & Drop için)
ipcMain.handle('get-file-info', async (_event, filePath: string) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = await fs.promises.stat(filePath);
    const meta = await parseImageInfo(filePath);
    return {
      name: path.basename(filePath),
      path: filePath,
      size: stat.size,
      lastModified: stat.mtimeMs,
      ...meta,
    };
  } catch (err) {
    console.error('get-file-info hatası:', filePath, err);
    return null;
  }
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
          const meta = await parseImageInfo(fullPath);
          files.push({
            name: entry.name,
            path: fullPath,
            size: stat.size,
            lastModified: stat.mtimeMs,
            ...meta,
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

      // Build lp command args for DNP DS620
      // -d <printer>
      // -n <copies>
      // -o media=w432h576 (6x8 inç)
      // -o StpLaminate=Glossy or Matte
      const args = ['-d', printerName, '-n', String(copies)];
      const mediaOption = mediaSize ? `media=${mediaSize}` : 'media=w432h576';
      args.push('-o', mediaOption);
      if (finish) {
        args.push('-o', `StpLaminate=${finish}`);
      }
      args.push(filePath);

      console.log('Baskı komutu çalıştırılıyor: lp', args.join(' '));
      const { stdout, stderr } = await execFileAsync('lp', args);

      // Parse CUPS Job ID (e.g. "request id is Dai_Nippon_Printing_DP-DS620-42 (1 file(s))")
      let cupsJobId: string | undefined;
      const match = stdout.match(/request id is ([^\s]+)/i);
      if (match) {
        cupsJobId = match[1];
      }

      return {
        success: true,
        output: stdout.trim(),
        cupsJobId,
        error: stderr ? stderr.trim() : undefined,
      };
    } catch (err: unknown) {
      console.error('Yazdırma işlemi başarısız:', err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { success: false, output: '', error: errorMsg };
    }
  }
);

// 7. Cancel Print Job via CUPS
ipcMain.handle('cancel-print-job', async (_event, jobId: string) => {
  try {
    if (!jobId) return { success: false, error: 'Geçersiz iş ID' };
    const sanitizedId = jobId.replace(/[^a-zA-Z0-9_-]/g, '');
    await execFileAsync('cancel', [sanitizedId]);
    return { success: true };
  } catch (err: unknown) {
    console.warn('CUPS iş iptali hatası:', err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
});

// 8. Get CUPS Active Print Queue
ipcMain.handle('get-cups-queue', async () => {
  try {
    const { stdout } = await execAsync('lpstat -o');
    const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    const jobs = [];

    for (const line of lines) {
      // Format: "Dai_Nippon_Printing_DP-DS620-42 username 1024 Fri 11 Sep 17:00:00 2026"
      const parts = line.split(/\s+/);
      if (parts.length >= 4) {
        const id = parts[0];
        const user = parts[1];
        const size = parts[2];
        const date = parts.slice(3).join(' ');
        const printer = id.replace(/-\d+$/, '');
        jobs.push({ id, printer, user, size, date });
      }
    }
    return jobs;
  } catch (err) {
    console.warn('CUPS kuyruğu okunamadı:', err);
    return [];
  }
});
