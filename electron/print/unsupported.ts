// Henüz yazdırma arka ucu olmayan platformlar (şimdilik Windows): uygulamanın geri kalanı çalışır,
// yazıcı listesi boş gelir ve baskı denemesi açık bir hata döner.
import type { PrintBackend } from './types';

const NOT_SUPPORTED = 'Bu platformda yazdırma desteği henüz yok.';

export const unsupportedBackend: PrintBackend = {
  getPrinters: async () => [],
  getPrinterOptions: async (printerName) => ({
    raw: '',
    printerName,
    options: [],
    mediaOptionName: null,
    finishOptionName: null,
  }),
  executePrint: async () => ({ success: false, output: '', error: NOT_SUPPORTED }),
  cancelJob: async () => ({ success: false, error: NOT_SUPPORTED }),
  setPrinterEnabled: async () => ({ success: false, error: NOT_SUPPORTED }),
  getJobState: async () => ({ state: 'unknown' }),
  getQueue: async () => [],
};
