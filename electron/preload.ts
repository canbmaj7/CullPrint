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
  // Çekim bilgisi (EXIF); takenAt, saat dilimsiz yazılan çekim saatinin UTC alanlarıyla ms karşılığıdır (olduğu gibi gösterilir)
  shot?: {
    takenAt?: number;
    camera?: string;
    lens?: string;
    exposureTime?: number;
    fNumber?: number;
    iso?: number;
    focalLength?: number;
  };
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
  statusMessage?: string;
  problem?: string;
}

export interface RenderRasterParams {
  filePath: string;
  targetWidth: number;
  targetHeight: number;
  cropOffsetX: number;
  cropOffsetY: number;
  userRotation: number;
  fitMode?: 'fill' | 'fit';
  adjust?: { brightness: number; contrast: number; saturation: number; temperature: number };
}

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke('select-folder'),
  selectFiles: (): Promise<FileItem[]> => ipcRenderer.invoke('select-files'),
  readFolder: (folderPath: string): Promise<FileItem[]> => ipcRenderer.invoke('read-folder', folderPath),
  // Klasör/dosya yüklenirken ilerleme (tamamlanan / toplam)
  onLoadProgress: (callback: (progress: { done: number; total: number }) => void): (() => void) => {
    const listener = (_event: unknown, progress: { done: number; total: number }) => callback(progress);
    ipcRenderer.on('load-progress', listener);
    return () => ipcRenderer.removeListener('load-progress', listener);
  },
  watchFolder: (folderPath: string): Promise<boolean> => ipcRenderer.invoke('watch-folder', folderPath),
  unwatchFolder: (): Promise<void> => ipcRenderer.invoke('unwatch-folder'),
  onFolderNewFiles: (callback: (files: FileItem[]) => void): (() => void) => {
    const listener = (_event: unknown, files: FileItem[]) => callback(files);
    ipcRenderer.on('folder-new-files', listener);
    return () => ipcRenderer.removeListener('folder-new-files', listener);
  },
  onFolderRemovedFiles: (callback: (paths: string[]) => void): (() => void) => {
    const listener = (_event: unknown, paths: string[]) => callback(paths);
    ipcRenderer.on('folder-removed-files', listener);
    return () => ipcRenderer.removeListener('folder-removed-files', listener);
  },
  getPrinters: (): Promise<PrinterInfo[]> => ipcRenderer.invoke('get-printers'),
  getPrinterOptions: (printerName: string): Promise<PrinterCapabilities & { raw: string }> =>
    ipcRenderer.invoke('get-printer-options', printerName),
  saveTempPrintFile: (base64Data: string): Promise<string> => ipcRenderer.invoke('save-temp-print-file', base64Data),
  renderPrintRaster: (params: RenderRasterParams): Promise<string | null> =>
    ipcRenderer.invoke('render-print-raster', params),
  executePrint: (params: PrintJobParams): Promise<{ success: boolean; output: string; cupsJobId?: string; error?: string }> =>
    ipcRenderer.invoke('execute-print', params),
  cancelPrintJob: (jobId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('cancel-print-job', jobId),
  getCupsQueue: (): Promise<CupsJobInfo[]> => ipcRenderer.invoke('get-cups-queue'),
  getJobState: (cupsJobId: string): Promise<{ state: string; message?: string }> =>
    ipcRenderer.invoke('get-job-state', cupsJobId),
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
