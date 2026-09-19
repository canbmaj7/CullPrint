import { cupsBackend } from './cups';
import { windowsBackend } from './windows';
import type { PrintBackend } from './types';

// Linux ve macOS CUPS kullanır, Windows yerel Spooler'ı (PowerShell üzerinden)
export const printBackend: PrintBackend = process.platform === 'win32' ? windowsBackend : cupsBackend;
