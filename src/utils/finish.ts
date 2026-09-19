// Baskı yüzeyi (overcoat) seçenekleri için fareyle üzerine gelince gösterilen açıklamalar.
// Değer CUPS'ta 'Glossy'/'Matte', Windows'ta sürücü kimliği ('{uri}Matte') olabilir; etiketle birlikte aranır.

export const FINISH_SECTION_HINT =
  'Yazıcı renkleri bastıktan sonra fotoğrafın üstüne şeffaf bir koruma katmanı kaplar. Bu seçim yalnızca o katmanın yüzey dokusunu belirler; kâğıt ve ribbon aynıdır, ek sarf gerekmez.';

const FINISH_HINTS: [RegExp, string][] = [
  [
    /fine\s*matte/i,
    'İnce Mat: Mat yüzeyin daha ince dokulu hâli. Yansıma yapmaz, parmak izini gizler; normal mata göre biraz daha keskin görünür.',
  ],
  [
    /fine\s*luster/i,
    'İnce Saten: Saten yüzeyin daha ince dokulu hâli. Parlak ile mat arası, hafif ışıltılı.',
  ],
  [
    /luster|lustre|satin|saten/i,
    'Saten (Luster): Parlak ile mat arası. Hafif ışıltılı, yansıması ve parmak izi parlak yüzeye göre azdır.',
  ],
  [
    /matt?e|\bmat\b/i,
    'Mat: Yansıma yapmaz, her açıdan rahat bakılır; parmak izini ve küçük çizikleri gizler. Renkler ve kontrast biraz daha yumuşak görünür. Elden ele dolaşacak baskılar için uygun.',
  ],
  [
    /gloss|parlak/i,
    'Parlak: Renkler daha canlı, siyahlar daha derin, kontrast yüksek. Işığı yansıtır; parmak izi ve leke kolay görünür. Çerçeve ve vitrin için uygun.',
  ],
];

export function describeFinish(value: string, label?: string): string | undefined {
  const text = `${label ?? ''} ${value.slice(value.indexOf('}') + 1)}`;
  return FINISH_HINTS.find(([pattern]) => pattern.test(text))?.[1];
}

const FINISH_NAMES: [RegExp, string][] = [
  [/^fine\s*matte$/i, 'İnce Mat'],
  [/^fine\s*lust(er|re)$/i, 'İnce Saten'],
  [/^(lust(er|re)|satin)$/i, 'Saten'],
  [/^matt?e$/i, 'Mat'],
  [/^gloss(y)?$/i, 'Parlak'],
];

// Kullanıcıya gösterilecek yüzey adı: 'Glossy' / '{uri}Glossy' -> 'Parlak'; bilinmeyen değer olduğu gibi kalır
export function finishDisplayName(value: string, label?: string): string {
  const text = (label || value.slice(value.indexOf('}') + 1)).trim();
  return FINISH_NAMES.find(([pattern]) => pattern.test(text))?.[1] ?? text;
}
