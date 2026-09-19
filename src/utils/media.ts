// Kâğıt boyutu değerini inç cinsinden çözer. DOM kullanmaz: hem renderer hem ana süreç (sharp raster) kullanır.
// Değerler: CUPS 'w432h576' (1/72 inç), Windows 'w432h576|258' (boyut + sürücü RawKind), adlandırılmış boyutlar.

const STATIC_NAMED_SIZES: Record<string, [number, number]> = {
  letter: [8.5, 11],
  a4: [8.27, 11.69],
  legal: [8.5, 14],
  '4x6': [4, 6],
  '5x7': [5, 7],
  '8x10': [8, 10],
};

export function resolveMediaPixelSize(mediaSizeToken: string): { widthIn: number; heightIn: number } {
  if (mediaSizeToken) {
    const match = mediaSizeToken.match(/^w(\d+)h(\d+)(?:\|\d+)?$/i);
    if (match) {
      return {
        widthIn: Number(match[1]) / 72,
        heightIn: Number(match[2]) / 72,
      };
    }
    const named = STATIC_NAMED_SIZES[mediaSizeToken.toLowerCase()];
    if (named) {
      return {
        widthIn: named[0],
        heightIn: named[1],
      };
    }
  }

  console.warn('Bilinmeyen medya boyutu, 6x8 varsayılana dönülüyor:', mediaSizeToken);
  return { widthIn: 6, heightIn: 8 };
}

function formatNumber(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '');
}

// Kâğıt boyutunun okunur adı, dikey yazılır: 'w432h576' → '6x8 (15x20 cm)', A4 → '8.3x11.7 (21x30 cm)'
export function formatPaperSize(mediaSizeToken: string): string {
  const { widthIn, heightIn } = resolveMediaPixelSize(mediaSizeToken);
  const short = Math.min(widthIn, heightIn);
  const long = Math.max(widthIn, heightIn);
  return `${formatNumber(short)}x${formatNumber(long)} (${Math.round(short * 2.54)}x${Math.round(long * 2.54)} cm)`;
}

// Elle rulo sayacının varsayılan kapasitesi: 6x8 rulosu 4x6'da ikiye bölünür (ör. DS620: 200 / 400 baskı).
// Yazıcı ve kâğıda göre değiştiği için kuyruk çekmecesinden düzenlenebilir.
export function defaultRollCapacity(mediaSizeToken: string): number {
  const { widthIn, heightIn } = resolveMediaPixelSize(mediaSizeToken);
  return Math.max(widthIn, heightIn) <= 6.1 ? 400 : 200;
}
