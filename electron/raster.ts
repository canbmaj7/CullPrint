// Baskı raster'ı ana süreçte sharp (libvips) ile: arayüz iş parçacığını dondurmaz, orijinal dosyadan okur.
// Kırpma hesabı önizlemeyle ortaktır (src/utils/crop.ts → computeCropRect): ekranda görülen = basılan.
import { computeCropRect, FIT_BACKGROUND } from '../src/utils/crop';
import { applyColorTransform, buildColorTransform, isNeutralAdjust, type ColorAdjust } from '../src/utils/adjust';
import type { FitMode } from '../src/types';

export interface RasterRequest {
  filePath: string;
  targetWidth: number;
  targetHeight: number;
  cropOffsetX: number;
  cropOffsetY: number;
  userRotation: number;
  fitMode?: FitMode; // 'fit' = kırpma yok, kenarlarda beyaz şerit; varsayılan 'fill'
  adjust?: ColorAdjust; // renk ayarı; yoksa ya da nötrse hiç uygulanmaz
}

export async function renderPrintRasterFile(
  sharp: typeof import('sharp'),
  req: RasterRequest,
  outPath: string
): Promise<void> {
  // 1. EXIF yönü + kullanıcı döndürmesi uygulanmış tam çözünürlüklü ara görüntü (saydamlık beyaza)
  const rotated = await sharp(req.filePath, { limitInputPixels: false })
    .autoOrient()
    .rotate(req.userRotation || 0)
    .flatten({ background: '#ffffff' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const source = sharp(rotated.data, {
    raw: { width: rotated.info.width, height: rotated.info.height, channels: rotated.info.channels },
  });

  // 2a. Sığdırma modu: kırpma yok, fotoğrafın tamamı kâğıda ortalanır, artan kenarlar beyaz kalır
  if (req.fitMode === 'fit' && !isNeutralAdjust(req.adjust)) {
    // Renk ayarı yalnızca fotoğrafa uygulanır, beyaz şeritlere değil: önce sığdır (boşluksuz), ayarla, sonra beyaza ortala
    const photo = await adjustColors(sharp, source.resize(req.targetWidth, req.targetHeight, { fit: 'inside', kernel: 'lanczos3' }), req.adjust);
    await writeJpeg(
      photo.resize(req.targetWidth, req.targetHeight, { fit: 'contain', background: FIT_BACKGROUND, kernel: 'lanczos3' }),
      outPath
    );
    return;
  }
  if (req.fitMode === 'fit') {
    await writeJpeg(
      source.resize(req.targetWidth, req.targetHeight, {
        fit: 'contain',
        background: FIT_BACKGROUND,
        kernel: 'lanczos3',
      }),
      outPath
    );
    return;
  }

  // 2b. Doldurma modu: önizlemeyle aynı kırpma hesabı, hedef boyuta ölçekleme
  const crop = computeCropRect(
    rotated.info.width,
    rotated.info.height,
    req.targetWidth,
    req.targetHeight,
    req.cropOffsetX || 0,
    req.cropOffsetY || 0
  );
  const left = Math.max(0, Math.min(rotated.info.width - 1, Math.round(crop.x)));
  const top = Math.max(0, Math.min(rotated.info.height - 1, Math.round(crop.y)));
  const width = Math.max(1, Math.min(rotated.info.width - left, Math.round(crop.width)));
  const height = Math.max(1, Math.min(rotated.info.height - top, Math.round(crop.height)));

  const filled = source
    .extract({ left, top, width, height })
    .resize(req.targetWidth, req.targetHeight, { fit: 'fill', kernel: 'lanczos3' });
  await writeJpeg(await adjustColors(sharp, filled, req.adjust), outPath);
}

/**
 * Renk ayarını (src/utils/adjust.ts) hedef boyuta indirilmiş görüntüye uygular: tam çözünürlükte değil, baskı boyutunda
 * (≈4 MP) çalıştığı için hızlıdır. Ayar nötrse görüntüye dokunmadan aynı hattı döndürür.
 */
async function adjustColors(
  sharp: typeof import('sharp'),
  pipeline: import('sharp').Sharp,
  adjust: ColorAdjust | undefined
): Promise<import('sharp').Sharp> {
  if (isNeutralAdjust(adjust) || !adjust) return pipeline;
  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  applyColorTransform(data, info.channels === 4 ? 4 : 3, buildColorTransform(adjust));
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } });
}

/**
 * Baskı JPEG'ini diske yazar. Her iki kadraj modu da buradan geçer: withMetadata kuralı tek yerde kalsın.
 *
 * withMetadata ŞART: sharp başlıksız JPEG yazıyor (SOI'den sonra doğrudan DQT). CUPS'un
 * imagetoraster filtresi böyle bir dosyayı açamıyor, sessizce 0 baytlık raster üretiyor ve iş
 * "canceled-at-device" ile düşüyor — hiçbir hata görünmeden. withMetadata bir APP başlığı
 * (density) yazdırır ve filtre dosyayı tanır. Gerçek DS620 ile doğrulandı.
 */
function writeJpeg(pipeline: import('sharp').Sharp, outPath: string): Promise<unknown> {
  return pipeline
    .withMetadata({ density: 300 })
    .jpeg({ quality: 96, chromaSubsampling: '4:4:4' })
    .toFile(outPath);
}
