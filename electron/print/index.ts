import { cupsBackend } from './cups';
import { unsupportedBackend } from './unsupported';
import type { PrintBackend } from './types';

// Linux ve macOS CUPS kullanır; Windows arka ucu (Spooler) eklenene kadar yer tutucu
export const printBackend: PrintBackend = process.platform === 'win32' ? unsupportedBackend : cupsBackend;
