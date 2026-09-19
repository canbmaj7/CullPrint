export interface PhotoItem {
  name: string;
  path: string;
  size: number;
  lastModified: number;
  orientation?: number; // EXIF: 1 = normal, 6 = 90 CW, 8 = 270 CW, 3 = 180
  isLandscape?: boolean;
  width?: number;
  height?: number;
  printed: boolean;
  printCount: number;
  cropOffsetY: number; // -100 to 100 percentage offset for vertical crop
  cropOffsetX: number; // -100 to 100 percentage offset for horizontal crop
  userRotation: number; // 0, 90, 180, 270
}

export type FilterMode = 'all' | 'unprinted' | 'printed';

export type ThemeMode = 'dark' | 'light' | 'neutral';

export interface PrinterState {
  name: string;
  isDefault: boolean;
  status: string;
  isDNP: boolean;
  usbConnected?: boolean;
  stateMessage?: string;
  pausedByUser?: boolean;
  problem?: string;
}

export interface PrintJob {
  id: string;
  cupsJobId?: string;
  photoName: string;
  photoPath: string;
  copies: number;
  finish: string;
  mediaSize: string;
  timestamp: number;
  status: 'queued' | 'printing' | 'completed' | 'failed' | 'cancelled';
  errorMessage?: string;
  cropOffsetX: number;
  cropOffsetY: number;
  userRotation: number;
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
}

export interface PrinterSettings {
  mediaSize: string;
  finishOptionName?: string;
  finishValue?: string;
}

export interface CupsJob {
  id: string;
  printer: string;
  user: string;
  size: string;
  date: string;
}
