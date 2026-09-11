/// <reference types="vite/client" />

export interface FileItem {
  name: string;
  path: string;
  size: number;
  lastModified: number;
}

export interface PrinterInfo {
  name: string;
  isDefault: boolean;
  status: string;
  isDNP: boolean;
}

export interface PrintJobParams {
  filePath: string;
  printerName: string;
  copies: number;
  mediaSize: string;
  finish: string;
}

export interface IElectronAPI {
  selectFolder: () => Promise<string | null>;
  readFolder: (folderPath: string) => Promise<FileItem[]>;
  getPrinters: () => Promise<PrinterInfo[]>;
  getPrinterOptions: (printerName: string) => Promise<{ raw: string }>;
  saveTempPrintFile: (base64Data: string) => Promise<string>;
  executePrint: (params: PrintJobParams) => Promise<{ success: boolean; output: string; error?: string }>;
}

declare global {
  interface Window {
    electronAPI?: IElectronAPI;
  }
}
