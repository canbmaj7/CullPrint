import { contextBridge, ipcRenderer, webUtils } from 'electron';

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
}

export interface PrintJobParams {
  filePath: string;
  printerName: string;
  copies: number;
  mediaSize: string; // e.g., 'w432h576'
  finish: string;    // e.g., 'Glossy', 'Matte'
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
}

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke('select-folder'),
  selectFiles: (): Promise<FileItem[]> => ipcRenderer.invoke('select-files'),
  readFolder: (folderPath: string): Promise<FileItem[]> => ipcRenderer.invoke('read-folder', folderPath),
  getPrinters: (): Promise<PrinterInfo[]> => ipcRenderer.invoke('get-printers'),
  getPrinterOptions: (printerName: string): Promise<PrinterCapabilities & { raw: string }> =>
    ipcRenderer.invoke('get-printer-options', printerName),
  saveTempPrintFile: (base64Data: string): Promise<string> => ipcRenderer.invoke('save-temp-print-file', base64Data),
  executePrint: (params: PrintJobParams): Promise<{ success: boolean; output: string; cupsJobId?: string; error?: string }> =>
    ipcRenderer.invoke('execute-print', params),
  cancelPrintJob: (jobId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('cancel-print-job', jobId),
  getCupsQueue: (): Promise<CupsJobInfo[]> => ipcRenderer.invoke('get-cups-queue'),
  setPrinterEnabled: (printerName: string, enabled: boolean): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('set-printer-enabled', printerName, enabled),
  getFileInfo: (filePath: string): Promise<FileItem | null> => ipcRenderer.invoke('get-file-info', filePath),
  getFilePath: (file: File): string => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
});
