// Windows yazdırma arka ucu: tek, kalıcı bir powershell.exe süreci üzerinden Windows Spooler
// (System.Printing: durum, kuyruk, iptal, duraklatma; System.Drawing: baskı). Betik: windows.ps1.
// Her çağrı sabit bir CP-* fonksiyon adı + base64 JSON parametre taşır; shell kullanılmaz,
// betik metnine kullanıcı verisi gömülmez.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import hostScript from './windows.ps1?raw';
import type {
  PrintBackend,
  PrinterOption,
  PrinterOptionsResult,
  PrinterStatusInfo,
  PrintRequest,
  PrintResult,
  QueueJob,
} from './types';

const DEFAULT_TIMEOUT_MS = 20_000;
// Baskı, sürücü işi biriktirene kadar sürer
const PRINT_TIMEOUT_MS = 120_000;

const ERROR_LABELS: Record<string, string> = {
  CP_PRINTER_NOT_FOUND: 'Yazıcı bulunamadı',
};

class PowerShellHost {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private stdoutBuffer = '';
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (data: unknown[]) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();

  private start(): ChildProcessWithoutNullStreams {
    const proc = spawn(
      'powershell.exe',
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', '-'],
      { windowsHide: true }
    );
    proc.stdout.setEncoding('utf8');
    proc.stdout.on('data', (chunk: string) => this.onStdout(chunk));
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk: string) => console.warn('[powershell]', chunk.trim()));
    proc.stdin.on('error', (err) => console.warn('[powershell] stdin:', err));
    proc.on('error', (err) => this.stop(proc, err));
    proc.on('exit', () => this.stop(proc, new Error('PowerShell süreci beklenmedik şekilde kapandı')));

    // -Command - her stdin satırını ayrı komut olarak çalıştırır: betik tek satırda base64 olarak yüklenir
    const script = Buffer.from(hostScript.replace(/^\uFEFF/, ''), 'utf8').toString('base64');
    proc.stdin.write(
      "$ProgressPreference = 'SilentlyContinue'; [Console]::OutputEncoding = [Text.Encoding]::UTF8; " +
        `Invoke-Expression ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${script}')))\n`
    );
    this.proc = proc;
    return proc;
  }

  private stop(proc: ChildProcessWithoutNullStreams, reason: Error) {
    if (this.proc !== proc) return;
    this.proc = null;
    this.stdoutBuffer = '';
    this.pending.forEach((entry) => {
      clearTimeout(entry.timer);
      entry.reject(reason);
    });
    this.pending.clear();
    if (proc.exitCode === null) proc.kill();
  }

  private onStdout(chunk: string) {
    this.stdoutBuffer += chunk;
    let newline: number;
    while ((newline = this.stdoutBuffer.indexOf('\n')) >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      // İşaretçi satır başında olmayabilir (PowerShell 7 terminal kaçış dizileri ekler)
      const match = line.match(/<<CP:(\d+)>>(.*)$/);
      if (!match) continue;
      const entry = this.pending.get(Number(match[1]));
      if (!entry) continue;
      this.pending.delete(Number(match[1]));
      clearTimeout(entry.timer);
      try {
        const response = JSON.parse(match[2]) as { ok: boolean; data?: unknown; error?: string };
        if (response.ok) {
          entry.resolve(toArray(response.data));
        } else {
          const code = response.error ?? '';
          entry.reject(new Error(ERROR_LABELS[code] ?? (code || 'PowerShell hatası')));
        }
      } catch (err) {
        entry.reject(err instanceof Error ? err : new Error(String(err)));
      }
    }
  }

  shutdown() {
    if (this.proc) this.stop(this.proc, new Error('Uygulama kapanıyor'));
  }

  // Fonksiyon çıktısı her zaman diziye sarılır (PowerShell tek elemanlı diziyi açar)
  call(fn: string, params: Record<string, unknown> = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown[]> {
    if (!/^CP-[A-Za-z]+$/.test(fn)) return Promise.reject(new Error(`Geçersiz PowerShell çağrısı: ${fn}`));
    const proc = this.proc ?? this.start();
    const id = this.nextId++;
    const payload = Buffer.from(JSON.stringify(params), 'utf8').toString('base64');
    const line =
      '& { try { ' +
      `$p = ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}'))); ` +
      `$o = @{ ok = $true; data = @(${fn} $p) } ` +
      '} catch { $o = @{ ok = $false; error = $_.Exception.GetBaseException().Message } }; ' +
      `[Console]::Out.WriteLine('<<CP:${id}>>' + (ConvertTo-Json -InputObject $o -Depth 12 -Compress)) }\n`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Takılan bir çağrı (ör. yanıt vermeyen sürücü) sıradaki her şeyi bekletir: süreci yeniden başlat
        this.stop(proc, new Error(`Windows yazdırma sistemi yanıt vermedi (${fn})`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      proc.stdin.write(line);
    });
  }
}

function toArray(data: unknown): unknown[] {
  if (data === null || data === undefined) return [];
  return Array.isArray(data) ? data : [data];
}

const host = new PowerShellHost();
// Uygulama kapanınca PowerShell süreci sahipsiz kalmasın
process.once('exit', () => host.shutdown());

// Periyodik sorgular (yazıcılar 4 sn, kuyruk 3 sn) üst üste binmesin: sürmekte olan çağrı paylaşılır
function coalesce<T>(fn: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    inFlight ??= fn().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}

interface WinPrinter {
  name: string;
  driver: string;
  isDefault: boolean;
  paused: boolean;
  printing: boolean;
  offline: boolean;
  outOfPaper: boolean;
  paperJam: boolean;
  doorOpen: boolean;
  manualFeed: boolean;
  userIntervention: boolean;
  notAvailable: boolean;
  inError: boolean;
  dnpUsb: boolean;
}

const PRINTER_PROBLEM_LABELS: [keyof WinPrinter, string][] = [
  ['outOfPaper', 'Kâğıt bitti'],
  ['paperJam', 'Kâğıt sıkıştı'],
  ['manualFeed', 'Kâğıt takılması gerekiyor'],
  ['doorOpen', 'Yazıcı kapağı açık'],
  ['offline', 'Yazıcıya ulaşılamıyor (açık ve USB ile bağlı mı?)'],
  ['notAvailable', 'Yazıcı kullanılamıyor'],
  ['userIntervention', 'Yazıcı müdahale bekliyor'],
];

const DNP_NAME = /ds620|dnp|dai.?nippon|rx1/i;

const getPrinters = coalesce(async (): Promise<PrinterStatusInfo[]> => {
  try {
    const list = (await host.call('CP-GetPrinters')) as WinPrinter[];
    return list.map((p) => {
      const problems = PRINTER_PROBLEM_LABELS.filter(([flag]) => p[flag]).map(([, label]) => label);
      if (problems.length === 0 && p.inError) problems.push('Yazıcı hata durumunda');
      const isDNP = DNP_NAME.test(p.name) || DNP_NAME.test(p.driver);
      return {
        name: p.name,
        // Windows'ta duraklatma her zaman kullanıcı işidir; hata durumları 'problem' ile bildirilir
        status: p.paused ? 'disabled' : p.printing ? 'printing' : 'idle',
        isDefault: p.isDefault,
        isDNP,
        usbConnected: isDNP ? p.dnpUsb : true,
        pausedByUser: p.paused,
        problem: problems.length > 0 ? problems.join(' · ') : undefined,
        // Kalan baskı sayısı Windows Spooler'da yok (DNP'nin kendi durum aracı gerekir)
        mediaRemaining: undefined,
        markerLevel: undefined,
      };
    });
  } catch (err) {
    console.warn('Windows yazıcı listesi alınamadı:', err);
    return [];
  }
});

interface WinPaper {
  name: string;
  rawKind: number;
  width: number; // inç/100
  height: number;
  isDefault: boolean;
}

interface WinFeature {
  id: string; // '{ad alanı URI}Yerel ad'
  label: string;
  options: { id: string; label: string }[];
  selected: string | null;
}

interface WinCapabilities {
  papers: WinPaper[];
  features: WinFeature[];
}

const MEDIA_OPTION_NAME = 'PageSize';
const FINISH_FEATURE = /laminat|finish|overcoat|gloss|matte|surface|coat/i;
// Aynı boyuttaki çok parçalı kâğıtlar (ör. DNP "(4x6)x2": 6x8 kâğıt ortadan kesilir) tek fotoğraf için seçilmez
const SPLIT_PAPER = /x\s*2\b|2\s*up|split|cut|div/i;

const capabilitiesCache = new Map<string, WinCapabilities>();

function localName(id: string): string {
  return id.slice(id.indexOf('}') + 1);
}

function formatInches(hundredths: number): string {
  return (hundredths / 100).toFixed(1).replace(/\.0$/, '');
}

// Medya değeri rasterizer'ın anladığı CUPS biçimini (w<pt>h<pt>) korur, sürücü kâğıdını '|RawKind' ile ekler
function paperToken(paper: WinPaper): string {
  return `w${Math.round(paper.width * 0.72)}h${Math.round(paper.height * 0.72)}|${paper.rawKind}`;
}

function findFinishFeature(caps: WinCapabilities): WinFeature | undefined {
  return caps.features.find((f) => FINISH_FEATURE.test(f.label) || FINISH_FEATURE.test(localName(f.id)));
}

async function loadCapabilities(printerName: string): Promise<WinCapabilities> {
  const [caps] = (await host.call('CP-GetOptions', { printer: printerName })) as WinCapabilities[];
  const normalized: WinCapabilities = {
    papers: toArray(caps?.papers) as WinPaper[],
    features: (toArray(caps?.features) as WinFeature[]).map((f) => ({
      ...f,
      options: toArray(f.options) as WinFeature['options'],
    })),
  };
  capabilitiesCache.set(printerName, normalized);
  return normalized;
}

async function getPrinterOptions(printerName: string): Promise<PrinterOptionsResult> {
  try {
    const caps = await loadCapabilities(printerName);
    const options: PrinterOption[] = [];
    if (caps.papers.length > 0) {
      options.push({
        name: MEDIA_OPTION_NAME,
        label: 'Kâğıt boyutu',
        choices: caps.papers.map((paper) => ({
          value: paperToken(paper),
          label: `${paper.name} (${formatInches(paper.width)}×${formatInches(paper.height)}")`,
          isDefault: paper.isDefault,
        })),
      });
    }
    for (const feature of caps.features) {
      options.push({
        name: feature.id,
        label: feature.label,
        choices: feature.options.map((o) => ({ value: o.id, label: o.label, isDefault: o.id === feature.selected })),
      });
    }

    const raw = [
      ...caps.papers.map((p) => `Kâğıt ${p.rawKind}: ${p.name} ${p.width}x${p.height}${p.isDefault ? ' *' : ''}`),
      ...caps.features.map(
        (f) =>
          `${f.label} (${f.id}): ` +
          f.options.map((o) => `${o.id === f.selected ? '*' : ''}${o.label} (${localName(o.id)})`).join(', ')
      ),
    ].join('\n');

    return {
      raw,
      printerName,
      options,
      mediaOptionName: caps.papers.length > 0 ? MEDIA_OPTION_NAME : null,
      finishOptionName: findFinishFeature(caps)?.id ?? null,
    };
  } catch (err) {
    console.warn('Windows yazıcı seçenekleri alınamadı:', err);
    return { raw: '', printerName, options: [], mediaOptionName: null, finishOptionName: null };
  }
}

// 'w432h576|258' -> 258; yalnızca 'w432h576' (varsayılan ayar) ise aynı boyuttaki tek parçalı kâğıt aranır
function resolvePaper(mediaSize: string, caps: WinCapabilities): number | undefined {
  const explicit = mediaSize.match(/\|(\d+)$/);
  if (explicit) return Number(explicit[1]);
  const dims = mediaSize.match(/^w(\d+)h(\d+)$/i);
  if (!dims) return undefined;
  const width = (Number(dims[1]) / 72) * 100;
  const height = (Number(dims[2]) / 72) * 100;
  const tolerance = 15; // 0.15 inç: sürücüler taşma payını boyuta katabiliyor
  const candidates = caps.papers
    .map((p) => {
      const portrait = Math.abs(p.width - width) + Math.abs(p.height - height);
      const rotated = Math.abs(p.width - height) + Math.abs(p.height - width);
      return { paper: p, distance: Math.min(portrait, rotated) };
    })
    .filter((c) => c.distance <= tolerance * 2)
    .sort((a, b) => Number(SPLIT_PAPER.test(a.paper.name)) - Number(SPLIT_PAPER.test(b.paper.name)) || a.distance - b.distance);
  return candidates[0]?.paper.rawKind;
}

// Yüzey değeri sürücünün seçenek kimliği olabilir ya da ayarlar hiç açılmadıysa kenar çubuğunun 'Glossy'/'Matte'si
function resolveFinish(
  finishOptionName: string | undefined,
  finish: string,
  caps: WinCapabilities
): { feature: string; option: string } | undefined {
  if (!finish) return undefined;
  const feature = caps.features.find((f) => f.id === finishOptionName) ?? findFinishFeature(caps);
  if (!feature) return undefined;
  const wanted = finish.toLowerCase();
  const option =
    feature.options.find((o) => o.id === finish) ??
    feature.options.find((o) => o.label.toLowerCase() === wanted || localName(o.id).toLowerCase() === wanted) ??
    (/gloss|parlak/i.test(finish)
      ? feature.options.find((o) => /gloss|parlak/i.test(`${o.label} ${localName(o.id)}`))
      : /mat/i.test(finish)
        ? feature.options.find((o) => /matte|\bmat\b/i.test(`${o.label} ${localName(o.id)}`))
        : undefined);
  return option ? { feature: feature.id, option: option.id } : undefined;
}

async function executePrint({
  filePath,
  printerName,
  copies = 1,
  mediaSize = 'w432h576',
  finish = 'Glossy',
  finishOptionName,
}: PrintRequest): Promise<PrintResult> {
  try {
    if (!fs.existsSync(filePath)) {
      return { success: false, output: '', error: 'Baskı dosyası bulunamadı.' };
    }
    const caps = capabilitiesCache.get(printerName) ?? (await loadCapabilities(printerName));
    const paperRawKind = resolvePaper(mediaSize || 'w432h576', caps);
    const finishSelection = resolveFinish(finishOptionName, finish, caps);
    if (finish && !finishSelection) {
      console.warn('Yüzey seçeneği sürücüde bulunamadı, yazıcı varsayılanı kullanılıyor:', finish);
    }

    const docName = `CullPrint ${path.basename(filePath)}`;
    console.log('Windows baskısı:', { printerName, copies, paperRawKind, finishSelection, docName });
    const [result] = (await host.call(
      'CP-Print',
      {
        file: filePath,
        printer: printerName,
        docName,
        copies,
        paperRawKind: paperRawKind ?? null,
        features: finishSelection ? [finishSelection] : [],
      },
      PRINT_TIMEOUT_MS
    )) as { jobId: number | null }[];

    const jobId = result?.jobId;
    return {
      success: true,
      output: jobId != null ? `Windows kuyruğuna gönderildi (iş #${jobId})` : 'Windows kuyruğuna gönderildi',
      // CUPS ile aynı biçim ('<yazıcı>-<numara>'): renderer iş numarasını son '-'den sonra okur
      cupsJobId: jobId != null ? `${printerName}-${jobId}` : undefined,
    };
  } catch (err) {
    console.error('Windows yazdırma işlemi başarısız:', err);
    return { success: false, output: '', error: err instanceof Error ? err.message : String(err) };
  }
}

function parseJobId(jobId: string): { printer: string; id: number } | undefined {
  const match = jobId?.match(/^(.+)-(\d+)$/);
  return match ? { printer: match[1], id: Number(match[2]) } : undefined;
}

async function cancelJob(jobId: string) {
  const parsed = parseJobId(jobId);
  if (!parsed) return { success: false, error: 'Geçersiz iş ID' };
  try {
    // İş kuyrukta yoksa zaten bitmiş/iptal edilmiştir: istenen sonuç gerçekleşmiş sayılır
    await host.call('CP-CancelJob', parsed);
    return { success: true };
  } catch (err) {
    console.warn('Windows iş iptali hatası:', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function setPrinterEnabled(printerName: string, enabled: boolean) {
  try {
    await host.call('CP-SetPaused', { printer: printerName, paused: !enabled });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('Windows kuyruk durumu değiştirilemedi:', err);
    if (/access|denied|erişim|reddedildi|0x80070005/i.test(message)) {
      return {
        success: false,
        error: 'Windows bu yazıcıyı duraklatmak için yönetici izni istiyor. Duraklatmayı Windows yazıcı kuyruğundan yapabilirsiniz.',
      };
    }
    return { success: false, error: message };
  }
}

interface WinJob {
  printer: string;
  id: number;
  name: string;
  user: string;
  size: number;
  submitted: string;
  status: string; // PrintJobStatus bayrakları, ör. "Printing, Spooling"
}

// Kuyruktan çıkan işin nasıl bittiğini Windows saklamaz: son görülen durumdan çıkarılır
const lastSeenJobStatus = new Map<string, string>();

function describeJobProblem(status: string): string | undefined {
  if (/PaperOut/.test(status)) return 'Kâğıt bitti';
  if (/Offline/.test(status)) return 'Yazıcıya ulaşılamıyor (açık ve USB ile bağlı mı?)';
  if (/UserIntervention/.test(status)) return 'Yazıcı müdahale bekliyor';
  if (/Error|Blocked/.test(status)) return `Yazıcı hata bildirdi (${status})`;
  return undefined;
}

const getQueue = coalesce(async (): Promise<QueueJob[]> => {
  try {
    const jobs = (await host.call('CP-GetJobs')) as WinJob[];
    return jobs.map((job) => {
      const id = `${job.printer}-${job.id}`;
      lastSeenJobStatus.set(id, job.status);
      return {
        id,
        printer: job.printer,
        user: job.user,
        size: String(job.size),
        date: job.submitted,
        statusMessage: job.status || undefined,
        problem: describeJobProblem(job.status),
      };
    });
  } catch (err) {
    console.warn('Windows kuyruğu okunamadı:', err);
    return [];
  }
});

async function getJobState(jobId: string): Promise<{ state: string; message?: string }> {
  const status = lastSeenJobStatus.get(jobId);
  lastSeenJobStatus.delete(jobId);
  if (!status) return { state: 'unknown' };
  if (/Deleting|Deleted/.test(status)) return { state: 'canceled' };
  if (/Error/.test(status)) return { state: 'aborted', message: describeJobProblem(status) };
  return { state: 'unknown' };
}

export const windowsBackend: PrintBackend = {
  getPrinters,
  getPrinterOptions,
  executePrint,
  cancelJob,
  setPrinterEnabled,
  getJobState,
  getQueue,
};
