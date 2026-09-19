// Linux/macOS yazdırma arka ucu: CUPS komut satırı araçları (lp, lpstat, lpoptions, cancel, cupsenable...)
import fs from 'node:fs';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  PrintBackend,
  PrinterOption,
  PrinterOptionChoice,
  PrinterOptionsResult,
  PrinterStatusInfo,
  PrintRequest,
  PrintResult,
  QueueJob,
} from './types';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

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

async function getPrinters(): Promise<PrinterStatusInfo[]> {
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

    const printers: PrinterStatusInfo[] = [];

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
async function getPrinterOptions(printerName: string): Promise<PrinterOptionsResult> {
  try {
    const { stdout } = await execFileAsync('lpoptions', ['-p', printerName, '-l']);
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
}

// 6. Execute Print via CUPS
async function executePrint({
  filePath,
  printerName,
  copies = 1,
  mediaSize = 'w432h576',
  finish = 'Glossy',
  mediaOptionName,
  finishOptionName,
}: PrintRequest): Promise<PrintResult> {
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

// 7. Cancel Print Job via CUPS
async function cancelJob(jobId: string) {
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
}

// 7b. Pause / Resume CUPS queue (cupsdisable / cupsenable)
async function setPrinterEnabled(printerName: string, enabled: boolean) {
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
}

// 8a. Kuyruktan çıkan bir işin nasıl sonlandığı (tamamlandı / iptal / hata). ipptool yoksa 'unknown'.
async function getJobState(cupsJobId: string): Promise<{ state: string; message?: string }> {
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
}

// 8. Get CUPS Active Print Queue
async function getQueue(): Promise<QueueJob[]> {
  try {
    // -l: her iş için "Status:" (backend mesajı) ve "Alerts:" (job-state-reasons) satırları
    const { stdout } = await execFileAsync('lpstat', ['-l', '-o'], {
      env: { ...process.env, LC_ALL: 'C' },
    });
    const jobs: QueueJob[] = [];

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
}

export const cupsBackend: PrintBackend = {
  getPrinters,
  getPrinterOptions,
  executePrint,
  cancelJob,
  setPrinterEnabled,
  getJobState,
  getQueue,
};
