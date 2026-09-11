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

export interface PrinterState {
  name: string;
  isDefault: boolean;
  status: string;
  isDNP: boolean;
}
