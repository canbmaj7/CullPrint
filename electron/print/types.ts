// Platformdan bağımsız yazdırma arka ucu sözleşmesi. IPC handler'ları (main.ts) yalnızca buna konuşur;
// Linux/macOS için CUPS (cups.ts), Windows için ayrı bir uygulama seçilir (index.ts).

export interface PrinterStatusInfo {
  name: string;
  status: string;
  isDefault: boolean;
  isDNP: boolean;
  usbConnected: boolean;
  stateMessage?: string;
  pausedByUser: boolean;
  problem?: string;
  mediaRemaining?: number;
  markerLevel?: number;
}

export interface PrinterOptionChoice {
  value: string;
  label: string;
  isDefault: boolean;
}

export interface PrinterOption {
  name: string;
  label: string;
  choices: PrinterOptionChoice[];
}

export interface PrinterOptionsResult {
  raw: string;
  printerName: string;
  options: PrinterOption[];
  mediaOptionName: string | null;
  finishOptionName: string | null;
}

export interface PrintRequest {
  filePath: string;
  printerName: string;
  copies: number;
  mediaSize: string;
  finish: string;
  mediaOptionName?: string;
  finishOptionName?: string;
}

export interface PrintResult {
  success: boolean;
  output: string;
  cupsJobId?: string;
  error?: string;
}

export interface QueueJob {
  id: string;
  printer: string;
  user: string;
  size: string;
  date: string;
  statusMessage?: string;
  problem?: string;
}

export interface PrintBackend {
  getPrinters(): Promise<PrinterStatusInfo[]>;
  getPrinterOptions(printerName: string): Promise<PrinterOptionsResult>;
  executePrint(request: PrintRequest): Promise<PrintResult>;
  cancelJob(jobId: string): Promise<{ success: boolean; error?: string }>;
  setPrinterEnabled(printerName: string, enabled: boolean): Promise<{ success: boolean; error?: string }>;
  getJobState(jobId: string): Promise<{ state: string; message?: string }>;
  getQueue(): Promise<QueueJob[]>;
}
