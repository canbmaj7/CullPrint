import { app, BrowserWindow, ipcMain, dialog, protocol, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import exifr from 'exifr';
import { printBackend } from './print';
import type { PrintRequest } from './print/types';

// sharp (libvips) opsiyonel: yüklenemezse platformun yerel küçük resim API'sine, o da yoksa orijinale düşülür
let sharpModule: typeof import('sharp') | null | undefined;
async function loadSharp() {
  if (sharpModule === undefined) {
    try {
      sharpModule = (await import('sharp')).default;
    } catch (err) {
      console.warn('CullPrint: sharp yüklenemedi, yedek küçük resim yoluna düşülüyor:', err);
      sharpModule = null;
    }
  }
  return sharpModule;
}

const thumbJobs = new Map<string, Promise<Buffer>>();

async function generateThumbnail(filePath: string, size: number, cachePath: string): Promise<Buffer> {
  let buffer: Buffer;
  const sharp = await loadSharp();
  if (sharp) {
    // rotate(): EXIF yönünü piksellere uygular, önizleme baskı raster'ıyla tutarlı kalır
    buffer = await sharp(filePath)
      .rotate()
      .resize(size, size, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 86 })
      .toBuffer();
  } else if (typeof nativeImage.createThumbnailFromPath === 'function') {
    const img = await nativeImage.createThumbnailFromPath(filePath, { width: size, height: size });
    buffer = img.toJPEG(86);
  } else {
    // Linux'ta yerel API yok: orijinali sun (yavaş ama doğru), önbelleğe yazma
    return fs.promises.readFile(filePath);
  }
  await fs.promises.writeFile(cachePath, buffer);
  return buffer;
}

// Küçük resim önbelleği diskte tutulur: /tmp birçok dağıtımda RAM (tmpfs) üzerindedir
const THUMB_CACHE_DIR =
  process.platform === 'linux'
    ? path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'), 'cullprint', 'thumbs')
    : path.join(app.getPath('userData'), 'thumb-cache');
const THUMB_CACHE_MAX_BYTES = 1024 * 1024 * 1024; // 1 GB
const THUMB_CACHE_TARGET_BYTES = 800 * 1024 * 1024; // temizlikten sonra hedef

const SPOOL_DIR = path.join(os.tmpdir(), 'cullprint-spool');
// Son baskı dosyaları inceleme/hata ayıklama için tutulur; CUPS dosyayı lp anında kendi dizinine kopyalar
const SPOOL_KEEP_COUNT = 20;

// Dizindeki dosyaları en eskiden başlayarak, toplam boyut hedefe inene kadar siler
async function pruneThumbCache() {
  try {
    const names = await fs.promises.readdir(THUMB_CACHE_DIR);
    const files = await Promise.all(
      names.map(async (name) => {
        const filePath = path.join(THUMB_CACHE_DIR, name);
        const stat = await fs.promises.stat(filePath);
        return { filePath, size: stat.size, mtimeMs: stat.mtimeMs };
      })
    );
    let total = files.reduce((sum, f) => sum + f.size, 0);
    if (total <= THUMB_CACHE_MAX_BYTES) return;
    files.sort((a, b) => a.mtimeMs - b.mtimeMs);
    for (const f of files) {
      if (total <= THUMB_CACHE_TARGET_BYTES) break;
      await fs.promises.unlink(f.filePath).catch(() => {});
      total -= f.size;
    }
  } catch (err) {
    console.warn('Küçük resim önbelleği temizlenemedi:', err);
  }
}

async function pruneSpoolDir() {
  try {
    const names = (await fs.promises.readdir(SPOOL_DIR)).filter((n) => n.startsWith('spool_'));
    const files = await Promise.all(
      names.map(async (name) => {
        const filePath = path.join(SPOOL_DIR, name);
        return { filePath, mtimeMs: (await fs.promises.stat(filePath)).mtimeMs };
      })
    );
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    await Promise.all(files.slice(SPOOL_KEEP_COUNT).map((f) => fs.promises.unlink(f.filePath).catch(() => {})));
  } catch {
    // dizin henüz yoksa sorun değil
  }
}

function getJpegDimensions(buffer: Buffer) {
  let offset = 2;
  // SOF segmenti tamponun (ilk 64 KB) dışındaysa null döner; büyük EXIF'li dosyalarda (ör. Fujifilm) olur
  while (offset + 9 <= buffer.length) {
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

    // 1. JPEG binary marker boyutları; bulunamazsa (PNG/WebP vb.) sharp ile başlık okunur
    const dims = getJpegDimensions(buffer);
    if (dims) {
      width = dims.width;
      height = dims.height;
    } else {
      const sharp = await loadSharp();
      if (sharp) {
        try {
          const meta = await sharp(filePath).metadata();
          if (meta.width && meta.height) {
            width = meta.width;
            height = meta.height;
          }
          if (meta.orientation) orientation = meta.orientation;
        } catch {
          // okunamazsa varsayılan boyutlar kalır
        }
      }
    }

    // 2. EXIF yön bilgisi (Buffer üzerinden exifr)
    try {
      // exifr.parse değeri metne çevirir ('Rotate 270 CW'); orientation() sayıyı (1-8) verir
      const exifOrientation = await exifr.orientation(buffer);
      if (exifOrientation) {
        orientation = exifOrientation;
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
  fs.mkdirSync(THUMB_CACHE_DIR, { recursive: true });
  fs.mkdirSync(SPOOL_DIR, { recursive: true });
  // Açılışta arka planda temizlik (önbellek sınırı, eski baskı dosyaları); eski /tmp önbelleğini kaldır
  void pruneThumbCache();
  void pruneSpoolDir();
  fs.promises.rm(path.join(os.tmpdir(), 'cullprint-thumbs'), { recursive: true, force: true }).catch(() => {});

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

      const hash = crypto
        .createHash('sha1')
        .update(`${filePath}:${stat.mtimeMs}:${size}`)
        .digest('hex');
      const cachePath = path.join(THUMB_CACHE_DIR, `${hash}.jpg`);

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

      // Aynı küçük resim için eşzamanlı istekler (önden yükleme + gerçek istek) tek üretimi paylaşır
      let pending = thumbJobs.get(cachePath);
      if (!pending) {
        pending = generateThumbnail(filePath, size, cachePath).finally(() => thumbJobs.delete(cachePath));
        thumbJobs.set(cachePath, pending);
      }
      const buffer = await pending;

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

// 3–8. Yazıcı işlemleri platforma göre seçilen arka uca devredilir (electron/print/)
ipcMain.handle('get-printers', () => printBackend.getPrinters());
ipcMain.handle('get-printer-options', (_event, printerName: string) => printBackend.getPrinterOptions(printerName));

// 5. Save Temporary Rendered Crop for Printing
ipcMain.handle('save-temp-print-file', async (_event, base64Data: string) => {
  try {
    // base64Data: "data:image/jpeg;base64,..."
    const matches = base64Data.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
    if (!matches) throw new Error('Geçersiz Base64 görsel verisi');

    const ext = matches[1] === 'png' ? 'png' : 'jpg';
    const buffer = Buffer.from(matches[2], 'base64');

    await fs.promises.mkdir(SPOOL_DIR, { recursive: true });
    const fileName = `spool_${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
    const filePath = path.join(SPOOL_DIR, fileName);

    await fs.promises.writeFile(filePath, buffer);
    void pruneSpoolDir();
    return filePath;
  } catch (err) {
    console.error('Geçici baskı dosyası kaydedilemedi:', err);
    throw err;
  }
});

ipcMain.handle('execute-print', (_event, request: PrintRequest) => printBackend.executePrint(request));
ipcMain.handle('cancel-print-job', (_event, jobId: string) => printBackend.cancelJob(jobId));
ipcMain.handle('set-printer-enabled', (_event, printerName: string, enabled: boolean) =>
  printBackend.setPrinterEnabled(printerName, enabled)
);
ipcMain.handle('get-job-state', (_event, jobId: string) => printBackend.getJobState(jobId));
ipcMain.handle('get-cups-queue', () => printBackend.getQueue());
