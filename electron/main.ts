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

// 3. Get CUPS Printers & USB Connection Check
// CUPS durum nedenleri (printer-state-reasons) → kullanıcıya gösterilecek Türkçe açıklama
const PRINTER_REASON_LABELS: [RegExp, string][] = [
  [/^media-empty/, 'Kâğıt bitti'],
  [/^media-jam/, 'Kâğıt sıkıştı'],
  [/^media-needed/, 'Kâğıt takılması gerekiyor'],
  [/^marker-supply-empty/, 'Ribbon bitti'],
  [/^(cover|door)-open/, 'Yazıcı kapağı açık'],
  [/^offline/, 'Yazıcıya ulaşılamıyor (açık ve USB ile bağlı mı?)'],
];
// Backend'in durum mesajında hata belirten ifadeler ("Printing page 1, 100%" gibi ilerleme mesajları hariç)
const ERROR_MESSAGE = /fail|error|empty|jam|not found|no matching|unable|offline/i;
// Kuyruğu kullanıcı duraklattıysa CUPS mesajı boş, "Paused" ya da bizim yazdığımız neden olur
const USER_PAUSE_MESSAGE = /^(CullPrint|Paused|$)/i;

function describePrinterProblem(reasons: string[], message: string, disabled: boolean): string | undefined {
  const problems: string[] = [];
  for (const reason of reasons) {
    const label = PRINTER_REASON_LABELS.find(([re]) => re.test(reason))?.[1];
    if (label && !problems.includes(label)) problems.push(label);
  }
  if (disabled && !USER_PAUSE_MESSAGE.test(message)) {
    problems.push(`Yazıcı hata nedeniyle durdu: ${message}`);
  } else if (ERROR_MESSAGE.test(message)) {
    problems.push(message);
  }
  return problems.length > 0 ? problems.join(' · ') : undefined;
}

// Gutenprint backend'i yazıcının bildirdiği sarf durumunu CUPS'a yazar (son baskı anındaki değer):
//   marker-message='147 native prints remaining on 6x8 (A5) media'  marker-levels=73
async function readPrinterSupply(printerName: string): Promise<{ mediaRemaining?: number; markerLevel?: number }> {
  try {
    const { stdout } = await execFileAsync('lpoptions', ['-p', printerName]);
    const remaining = stdout.match(/marker-message='?(\d+)\s+(?:native\s+)?prints?\s+remaining/i);
    const level = stdout.match(/marker-levels=(-?\d+)/);
    return {
      mediaRemaining: remaining ? Number(remaining[1]) : undefined,
      // CUPS'ta negatif seviye "bilinmiyor" demektir
      markerLevel: level && Number(level[1]) >= 0 ? Number(level[1]) : undefined,
    };
  } catch {
    return {};
  }
}

ipcMain.handle('get-printers', async () => {
  try {
    // -l: durum mesajı ve "Alerts:" (printer-state-reasons) satırlarını da verir
    const { stdout } = await execFileAsync('lpstat', ['-l', '-p', '-d'], {
      env: { ...process.env, LC_ALL: 'C' },
    });
    const lines = stdout.split('\n');
    let defaultPrinter = '';

    // Check physical USB connection via lsusb
    let isUsbPhysicallyConnected = false;
    try {
      const { stdout: lsusbOut } = await execAsync('lsusb');
      // 1452 = Dai Nippon Printing USB vendor ID; cihaz adıyla da eşleştir
      isUsbPhysicallyConnected = /\b1452:|ds620|dai nippon|dnp/i.test(lsusbOut);
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

    // Biçim (LC_ALL=C, -l):
    //   printer X is idle.  enabled since ...        | now printing X-42. | disabled since ...
    //   \t<durum mesajı>                            (varsa; ör. "Printer open failure (...)")
    //   \tForm mounted: ...
    //   \tAlerts: media-empty-error offline-report   (printer-state-reasons)
    type Parsed = { name: string; status: string; message: string; reasons: string[]; seenFields: boolean };
    const parsed: Parsed[] = [];
    for (const line of lines) {
      const match = line.match(/^printer\s+(\S+)\s+(.*)$/);
      if (match) {
        const rest = match[2];
        const status = /^now printing/.test(rest)
          ? 'printing'
          : /^disabled/.test(rest)
            ? 'disabled'
            : (rest.match(/^is\s+([^.]+)/)?.[1] ?? rest).trim();
        parsed.push({ name: match[1], status, message: '', reasons: [], seenFields: false });
        continue;
      }
      const current = parsed[parsed.length - 1];
      if (!current || !/^\s/.test(line)) continue;
      const trimmed = line.trim();
      if (trimmed.startsWith('Alerts:')) {
        current.reasons = trimmed.slice('Alerts:'.length).trim().split(/\s+/).filter((r) => r && r !== 'none');
      } else if (/^[A-Z][\w ]*:/.test(trimmed)) {
        current.seenFields = true;
      } else if (!current.seenFields && !current.message) {
        // Alanlardan önce gelen ilk girintili satır durum mesajıdır
        current.message = trimmed;
      }
    }

    for (const p of parsed) {
      const isDNP = /ds620|dnp|dai_nippon|rx1/i.test(p.name);
      const supply = await readPrinterSupply(p.name);
      const disabled = p.status === 'disabled';
      printers.push({
        name: p.name,
        status: p.status,
        isDefault: p.name === defaultPrinter,
        isDNP,
        usbConnected: isDNP ? isUsbPhysicallyConnected : true,
        stateMessage: p.message || undefined,
        pausedByUser: disabled && USER_PAUSE_MESSAGE.test(p.message),
        problem: describePrinterProblem(p.reasons, p.message, disabled),
        mediaRemaining: supply.mediaRemaining,
        markerLevel: supply.markerLevel,
      });
    }

    return printers;
  } catch (err) {
    console.warn('lpstat komutu çalıştırılamadı:', err);
    return [];
  }
});

interface PrinterOptionChoice {
  value: string;
  label: string;
  isDefault: boolean;
}

interface PrinterOption {
  name: string;
  label: string;
  choices: PrinterOptionChoice[];
}

const STATIC_NAMED_SIZES: Record<string, [number, number]> = {
  letter: [8.5, 11],
  a4: [8.27, 11.69],
  legal: [8.5, 14],
  '4x6': [4, 6],
  '5x7': [5, 7],
  '8x10': [8, 10],
};

function formatDim(num: number): string {
  return num.toFixed(1).replace(/\.0$/, '');
}

function getChoiceLabel(value: string): string {
  const match = value.match(/^w(\d+)h(\d+)$/i);
  if (match) {
    const widthIn = formatDim(Number(match[1]) / 72);
    const heightIn = formatDim(Number(match[2]) / 72);
    return `${widthIn}×${heightIn}"`;
  }
  const named = STATIC_NAMED_SIZES[value.toLowerCase()];
  if (named) {
    const widthIn = formatDim(named[0]);
    const heightIn = formatDim(named[1]);
    return `${widthIn}×${heightIn}"`;
  }
  return value;
}

function parseLpOptions(raw: string): PrinterOption[] {
  const options: PrinterOption[] = [];
  const lines = raw.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes(':')) continue;

    const colonIdx = trimmed.indexOf(':');
    const left = trimmed.slice(0, colonIdx).trim();
    const rightTokens = trimmed.slice(colonIdx + 1).trim().split(/\s+/).filter(Boolean);

    const name = left.includes('/') ? left.split('/')[0].trim() : left;
    const label = left.includes('/') ? left.split('/')[1].trim() : left;

    const choices: PrinterOptionChoice[] = rightTokens.map((token) => {
      const isDefault = token.startsWith('*');
      const value = isDefault ? token.slice(1) : token;
      return {
        value,
        label: getChoiceLabel(value),
        isDefault,
      };
    });

    options.push({ name, label, choices });
  }

  return options;
}

// 4. Get Printer Options (Media size, laminate finish, etc.)
ipcMain.handle('get-printer-options', async (_event, printerName: string) => {
  try {
    const { stdout } = await execAsync(`lpoptions -p "${printerName}" -l`);
    const options = parseLpOptions(stdout);
    const mediaOption = options.find((opt) => /^(PageSize|media)$/i.test(opt.name));
    const finishOption = options.find((opt) => /laminate|finish|quality|glosslevel/i.test(opt.name));

    return {
      raw: stdout,
      printerName,
      options,
      mediaOptionName: mediaOption ? mediaOption.name : null,
      finishOptionName: finishOption ? finishOption.name : null,
    };
  } catch (err) {
    console.warn('lpoptions sorgulanamadı:', err);
    return {
      raw: '',
      printerName,
      options: [],
      mediaOptionName: null,
      finishOptionName: null,
    };
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
      mediaOptionName,
      finishOptionName,
    }: {
      filePath: string;
      printerName: string;
      copies: number;
      mediaSize: string;
      finish: string;
      mediaOptionName?: string;
      finishOptionName?: string;
    }
  ) => {
    try {
      if (!fs.existsSync(filePath)) {
        return { success: false, output: '', error: 'Baskı dosyası bulunamadı.' };
      }

      // Build lp command args
      const args = ['-d', printerName, '-n', String(copies)];
      const mediaOption = mediaSize || 'w432h576';
      args.push('-o', `${mediaOptionName || 'media'}=${mediaOption}`);
      if (finish) {
        args.push('-o', `${finishOptionName || 'StpLaminate'}=${finish}`);
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
    // İş zaten iptal edilmişse (ör. çift tıklama) istenen sonuç gerçekleşmiştir
    const stderr = (err as { stderr?: string })?.stderr ?? '';
    if (/already cancel/i.test(stderr)) {
      return { success: true };
    }
    console.warn('CUPS iş iptali hatası:', err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
});

// 7b. Pause / Resume CUPS queue (cupsdisable / cupsenable)
ipcMain.handle('set-printer-enabled', async (_event, printerName: string, enabled: boolean) => {
  try {
    // Seçenek enjeksiyonunu engelle: yazıcı adı '-' ile başlayamaz
    if (!printerName || printerName.startsWith('-')) {
      return { success: false, error: 'Geçersiz yazıcı adı' };
    }
    if (enabled) {
      await execFileAsync('cupsenable', [printerName]);
    } else {
      await execFileAsync('cupsdisable', ['-r', 'CullPrint: kuyruk duraklatıldı', printerName]);
    }
    return { success: true };
  } catch (err: unknown) {
    console.warn('CUPS kuyruk durumu değiştirilemedi:', err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
});

// 8a. Kuyruktan çıkan bir işin nasıl sonlandığı (tamamlandı / iptal / hata). ipptool yoksa 'unknown'.
ipcMain.handle('get-job-state', async (_event, cupsJobId: string) => {
  const num = cupsJobId?.match(/-(\d+)$/)?.[1];
  if (!num) return { state: 'unknown' };
  try {
    const { stdout } = await execFileAsync('ipptool', ['-tv', `ipp://localhost/jobs/${num}`, 'get-job-attributes.test']);
    const state = stdout.match(/job-state \(enum\) = (\S+)/)?.[1] ?? 'unknown';
    const message = stdout.match(/job-state-message \([^)]*\) = (.+)/)?.[1]?.trim();
    return { state, message };
  } catch {
    return { state: 'unknown' };
  }
});

// 8. Get CUPS Active Print Queue
ipcMain.handle('get-cups-queue', async () => {
  try {
    // -l: her iş için "Status:" (backend mesajı) ve "Alerts:" (job-state-reasons) satırları
    const { stdout } = await execFileAsync('lpstat', ['-l', '-o'], {
      env: { ...process.env, LC_ALL: 'C' },
    });
    const jobs: {
      id: string;
      printer: string;
      user: string;
      size: string;
      date: string;
      statusMessage?: string;
      problem?: string;
    }[] = [];

    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue;
      const current = jobs[jobs.length - 1];
      if (/^\s/.test(line)) {
        if (!current) continue;
        const trimmed = line.trim();
        if (trimmed.startsWith('Status:')) {
          current.statusMessage = trimmed.slice('Status:'.length).trim() || undefined;
        } else if (trimmed.startsWith('Alerts:')) {
          const alerts = trimmed.slice('Alerts:'.length).trim().split(/\s+/);
          // Bugün yaşanan durum: yazıcı "idle" görünürken iş "resources-are-not-ready" ile takılı kalıyordu
          if (alerts.includes('resources-are-not-ready') || ERROR_MESSAGE.test(current.statusMessage ?? '')) {
            current.problem = current.statusMessage || 'Yazıcı hazır değil, iş bekliyor';
          }
        }
        continue;
      }
      // Format: "Dai_Nippon_Printing_DP-DS620-42 username 1024 Fri 11 Sep 17:00:00 2026"
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 4) {
        const id = parts[0];
        jobs.push({
          id,
          printer: id.replace(/-\d+$/, ''),
          user: parts[1],
          size: parts[2],
          date: parts.slice(3).join(' '),
        });
      }
    }
    return jobs;
  } catch (err) {
    console.warn('CUPS kuyruğu okunamadı:', err);
    return [];
  }
});
