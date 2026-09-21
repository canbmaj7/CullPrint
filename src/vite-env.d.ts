/// <reference types="vite/client" />

export interface FileItem {
  name: string;
  path: string;
  size: number;
  lastModified: number;
  orientation?: number;
  width?: number;
  height?: number;
  isLandscape?: boolean;
}

export interface PrinterInfo {
  name: string;
  isDefault: boolean;
  status: string;
  isDNP: boolean;
  usbConnected: boolean;
  stateMessage?: string;
  pausedByUser?: boolean;
  problem?: string;
  mediaRemaining?: number;
  markerLevel?: number;
}

export interface PrintJobParams {
  filePath: string;
  printerName: string;
  copies: number;
  mediaSize: string;
  finish: string;
  mediaOptionName?: string;
  finishOptionName?: string;
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

export interface PrinterCapabilities {
  printerName: string;
  options: PrinterOption[];
  mediaOptionName: string | null;
  finishOptionName: string | null;
  raw?: string;
}

export interface CupsJobInfo {
  id: string;
  printer: string;
  user: string;
  size: string;
  date: string;
  statusMessage?: string;
  problem?: string;
}

export interface IElectronAPI {
  selectFolder: () => Promise<string | null>;
  selectFiles: () => Promise<FileItem[]>;
  readFolder: (folderPath: string) => Promise<FileItem[]>;
  getPrinters: () => Promise<PrinterInfo[]>;
  getPrinterOptions: (printerName: string) => Promise<PrinterCapabilities & { raw: string }>;
  saveTempPrintFile: (base64Data: string) => Promise<string>;
  // Baskı raster'ını ana süreçte sharp ile üretir; sharp yoksa null (canvas yedeği kullanılır)
  renderPrintRaster: (params: {
    filePath: string;
    targetWidth: number;
    targetHeight: number;
    cropOffsetX: number;
    cropOffsetY: number;
    userRotation: number;
    fitMode?: 'fill' | 'fit';
  }) => Promise<string | null>;
  executePrint: (params: PrintJobParams) => Promise<{ success: boolean; output: string; cupsJobId?: string; error?: string }>;
  cancelPrintJob: (jobId: string) => Promise<{ success: boolean; error?: string }>;
  getCupsQueue: () => Promise<CupsJobInfo[]>;
  setPrinterEnabled: (printerName: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>;
  getJobState: (cupsJobId: string) => Promise<{ state: string; message?: string }>;
  getFileInfo: (filePath: string) => Promise<FileItem | null>;
  getFilePath: (file: File) => string;
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
  }
}
