/**
 * Renk ayarı (parlaklık, kontrast, doygunluk, sıcaklık) tek yerde hesaplanır — crop.ts gibi:
 * önizleme (SVG renk matrisi), ana süreçteki sharp yolu ve canvas yedeği AYNI dönüşümü kullanır,
 * böylece ekranda görülen = basılan.
 *
 * Dönüşüm sRGB kodlu 0–255 değerleri üzerinde tek bir afin dönüşümdür: çıkış = M · giriş + o, sonuç 0–255'e kırpılır.
 * Tüm ayarlar 0 iken dönüşüm "nötr"dür ve hiç uygulanmaz (baskı bit düzeyinde eskisiyle aynı kalır).
 */

export interface ColorAdjust {
  brightness: number; // -100..100 (+ aydınlatır)
  contrast: number; // -100..100
  saturation: number; // -100..100 (-100 = siyah-beyaz)
  temperature: number; // -100..100 (+ sıcak/sarı, - soğuk/mavi)
}

export const NEUTRAL_ADJUST: ColorAdjust = { brightness: 0, contrast: 0, saturation: 0, temperature: 0 };

export const ADJUST_RANGE = 100;

export function isNeutralAdjust(adjust: ColorAdjust | null | undefined): boolean {
  return !adjust || (!adjust.brightness && !adjust.contrast && !adjust.saturation && !adjust.temperature);
}

export interface ColorTransform {
  /** Satır öncelikli 3x3 matris: [rr rg rb, gr gg gb, br bg bb] */
  matrix: number[];
  /** Kanal başına toplamsal kayma (0–255 biriminde) */
  offset: number[];
}

// Rec.709 parlaklık ağırlıkları (SVG saturate ile aynı mantık)
const LUMA = [0.2126, 0.7152, 0.0722];
const BRIGHTNESS_SPAN = 50; // ±100 → ±50/255 (~%20) kayma
const CONTRAST_SPAN = 0.6; // ±100 → eğim 0.4..1.6
const TEMPERATURE_SPAN = 0.15; // ±100 → kırmızı ±%15, mavi ∓%15 kazanç

function clampAdjust(value: number): number {
  return Math.max(-ADJUST_RANGE, Math.min(ADJUST_RANGE, Number.isFinite(value) ? value : 0));
}

/** Ayarları matris+kayma çiftine çevirir: önce doygunluk, sonra sıcaklık kazancı, sonra kontrast ve parlaklık. */
export function buildColorTransform(adjust: ColorAdjust): ColorTransform {
  const k = 1 + clampAdjust(adjust.saturation) / ADJUST_RANGE; // doygunluk çarpanı 0..2
  const t = clampAdjust(adjust.temperature) / ADJUST_RANGE;
  const gains = [1 + TEMPERATURE_SPAN * t, 1, 1 - TEMPERATURE_SPAN * t];
  const f = 1 + (CONTRAST_SPAN * clampAdjust(adjust.contrast)) / ADJUST_RANGE;
  const brightness = (BRIGHTNESS_SPAN * clampAdjust(adjust.brightness)) / ADJUST_RANGE;

  const matrix: number[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      // Doygunluk: lum + k·(giriş − lum)  →  lum_col·(1−k) + (row === col ? k : 0)
      const saturation = LUMA[col] * (1 - k) + (row === col ? k : 0);
      matrix.push(f * gains[row] * saturation);
    }
  }
  const offset = [128 * (1 - f) + brightness, 128 * (1 - f) + brightness, 128 * (1 - f) + brightness];
  return { matrix, offset };
}

/** Önizleme için SVG feColorMatrix değerleri (5x4, kayma 0–1 biriminde; alfa değişmez). */
export function toSvgColorMatrix(transform: ColorTransform): string {
  const { matrix: m, offset: o } = transform;
  const rows = [
    [m[0], m[1], m[2], 0, o[0] / 255],
    [m[3], m[4], m[5], 0, o[1] / 255],
    [m[6], m[7], m[8], 0, o[2] / 255],
    [0, 0, 0, 1, 0],
  ];
  return rows.map((r) => r.map((v) => +v.toFixed(5)).join(' ')).join(' ');
}

/**
 * Pikselleri yerinde dönüştürür (sharp ham tamponu ya da canvas ImageData). channels 3 (RGB) ya da 4 (RGBA);
 * alfa dokunulmadan kalır. Uint8ClampedArray'de kırpma otomatiktir, Buffer/Uint8Array için burada yapılır.
 */
export function applyColorTransform(
  data: Uint8Array | Uint8ClampedArray,
  channels: 3 | 4,
  transform: ColorTransform
): void {
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8] = transform.matrix;
  const [o0, o1, o2] = transform.offset;
  for (let i = 0; i + 2 < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const nr = m0 * r + m1 * g + m2 * b + o0;
    const ng = m3 * r + m4 * g + m5 * b + o1;
    const nb = m6 * r + m7 * g + m8 * b + o2;
    data[i] = nr < 0 ? 0 : nr > 255 ? 255 : Math.round(nr);
    data[i + 1] = ng < 0 ? 0 : ng > 255 ? 255 : Math.round(ng);
    data[i + 2] = nb < 0 ? 0 : nb > 255 ? 255 : Math.round(nb);
  }
}
