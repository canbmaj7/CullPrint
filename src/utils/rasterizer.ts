/**
 * CullPrint baskı raster'ı: seçili kâğıt boyutunda, 300 DPI, piksel-kusursuz JPEG.
 * Örn. 6x8 inç → dikey 1800 x 2400, yatay 2400 x 1800 piksel.
 *
 * Asıl yol ana süreçteki sharp'tır (libvips, arayüzü dondurmaz, orijinal dosyadan okur).
 * sharp yüklenemezse renderer'da canvas ile üretilir (tam çözünürlüklü media:// orijinalinden).
 */
import { computeCropRect, getRasterSize } from './crop';

export { resolveMediaPixelSize } from './media';

export interface PrintRasterParams {
  filePath: string;
  isLandscape: boolean; // kullanıcı döndürmesi sonrası etkin yön
  cropOffsetX: number; // -100 ile 100 arası yüzde
  cropOffsetY: number; // -100 ile 100 arası yüzde
  userRotation: number; // 0, 90, 180, 270
  mediaSizeToken: string;
  dpi?: number;
}

/** Baskı dosyasını üretip spool dizinine yazar, yolunu döndürür */
export async function createPrintFile(params: PrintRasterParams): Promise<string> {
  const { width, height } = getRasterSize(params.mediaSizeToken, params.isLandscape, params.dpi ?? 300);
  const spoolPath = await window.electronAPI!.renderPrintRaster({
    filePath: params.filePath,
    targetWidth: width,
    targetHeight: height,
    cropOffsetX: params.cropOffsetX,
    cropOffsetY: params.cropOffsetY,
    userRotation: params.userRotation,
  });
  if (spoolPath) return spoolPath;

  // Yedek yol — NEVER use media-thumb:// here: raster tam çözünürlüklü orijinalden üretilmeli
  const base64 = await generatePrintRaster({
    imageUrl: `media://${encodeURI(params.filePath)}`,
    targetWidth: width,
    targetHeight: height,
    cropOffsetX: params.cropOffsetX,
    cropOffsetY: params.cropOffsetY,
    userRotation: params.userRotation,
  });
  return window.electronAPI!.saveTempPrintFile(base64);
}

interface CanvasRasterParams {
  imageUrl: string;
  targetWidth: number;
  targetHeight: number;
  cropOffsetX: number;
  cropOffsetY: number;
  userRotation: number;
}

function generatePrintRaster({
  imageUrl,
  targetWidth,
  targetHeight,
  cropOffsetX,
  cropOffsetY,
  userRotation,
}: CanvasRasterParams): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('Canvas 2D context oluşturulamadı');
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Görselin doğal boyutları (tarayıcı EXIF yönünü uygulamış olarak verir)
        const imgW = img.naturalWidth || img.width;
        const imgH = img.naturalHeight || img.height;

        // Manuel döndürme varsa en ve boy yer değiştirir
        const isRotated90or270 = userRotation === 90 || userRotation === 270;
        const effectiveImgW = isRotated90or270 ? imgH : imgW;
        const effectiveImgH = isRotated90or270 ? imgW : imgH;

        const crop = computeCropRect(effectiveImgW, effectiveImgH, targetWidth, targetHeight, cropOffsetX, cropOffsetY);

        // Geçici bir sanal canvas üzerinde döndürmeyi uygula
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = effectiveImgW;
        tempCanvas.height = effectiveImgH;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) throw new Error('Temp canvas hatası');

        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';

        tempCtx.save();
        if (userRotation === 90) {
          tempCtx.translate(effectiveImgW, 0);
          tempCtx.rotate((90 * Math.PI) / 180);
        } else if (userRotation === 180) {
          tempCtx.translate(effectiveImgW, effectiveImgH);
          tempCtx.rotate((180 * Math.PI) / 180);
        } else if (userRotation === 270) {
          tempCtx.translate(0, effectiveImgH);
          tempCtx.rotate((270 * Math.PI) / 180);
        }
        tempCtx.drawImage(img, 0, 0);
        tempCtx.restore();

        ctx.drawImage(tempCanvas, crop.x, crop.y, crop.width, crop.height, 0, 0, targetWidth, targetHeight);

        // Yüksek kaliteli JPEG çıktısı (0.96)
        resolve(canvas.toDataURL('image/jpeg', 0.96));
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = (err) => reject(new Error('Görsel yüklenemedi: ' + String(err)));
    img.src = imageUrl;
  });
}
