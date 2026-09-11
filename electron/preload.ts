import { contextBridge, ipcRenderer, webUtils } from 'electron';

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
  usbConnected: boolean;
}

export interface PrintJobParams {
  filePath: string;
  printerName: string;
  copies: number;
  mediaSize: string; // e.g., 'w432h576'
  finish: string;    // e.g., 'Glossy', 'Matte'
}

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke('select-folder'),
  selectFiles: (): Promise<FileItem[]> => ipcRenderer.invoke('select-files'),
  readFolder: (folderPath: string): Promise<FileItem[]> => ipcRenderer.invoke('read-folder', folderPath),
  getPrinters: (): Promise<PrinterInfo[]> => ipcRenderer.invoke('get-printers'),
  getPrinterOptions: (printerName: string) => ipcRenderer.invoke('get-printer-options', printerName),
  saveTempPrintFile: (base64Data: string): Promise<string> => ipcRenderer.invoke('save-temp-print-file', base64Data),
  executePrint: (params: PrintJobParams): Promise<{ success: boolean; output: string; error?: string }> =>
    ipcRenderer.invoke('execute-print', params),
  getFilePath: (file: File): string => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return '';
    }
  },
});
