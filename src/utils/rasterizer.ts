/**
 * CullPrint 6x8 (15x20 cm) Piksel-Kusursuz Raster Üretici
 * 
 * DNP DS620 6x8 inç @ 300 DPI:
 * - Dikey: 1800 x 2400 piksel (4:3 oran)
 * - Yatay: 2400 x 1800 piksel (4:3 oran)
 */

interface RenderParams {
  imageUrl: string;
  isLandscape: boolean;
  cropOffsetX: number; // -100 ile 100 arası yüzde
  cropOffsetY: number; // -100 ile 100 arası yüzde
  userRotation: number; // 0, 90, 180, 270
}

export async function generatePrintRaster({
  imageUrl,
  isLandscape,
  cropOffsetX,
  cropOffsetY,
  userRotation,
}: RenderParams): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        // DNP DS620 6x8 Kağıt Boyutu:
        // Yatay kağıt: 2400w x 1800h (4:3)
        // Dikey kağıt: 1800w x 2400h (3:4)
        const targetWidth = isLandscape ? 2400 : 1800;
        const targetHeight = isLandscape ? 1800 : 2400;

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('Canvas 2D context oluşturulamadı');
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Görselin doğal boyutları
        let imgW = img.naturalWidth || img.width;
        let imgH = img.naturalHeight || img.height;

        // Manuel döndürme varsa en ve boy yer değiştirir
        const isRotated90or270 = userRotation === 90 || userRotation === 270;
        const effectiveImgW = isRotated90or270 ? imgH : imgW;
        const effectiveImgH = isRotated90or270 ? imgW : imgH;

        // Hedef en/boy oranı (4:3 veya 3:4)
        const targetRatio = targetWidth / targetHeight;
        const imageRatio = effectiveImgW / effectiveImgH;

        let sourceW = effectiveImgW;
        let sourceH = effectiveImgH;
        let sourceX = 0;
        let sourceY = 0;

        if (imageRatio > targetRatio) {
          // Görsel kağıttan daha geniş (sağdan ve soldan kesilecek)
          sourceW = effectiveImgH * targetRatio;
          const maxShiftX = (effectiveImgW - sourceW) / 2;
          // cropOffsetX: -100 (tam sol) ile +100 (tam sağ) arası
          const shift = (cropOffsetX / 100) * maxShiftX;
          sourceX = (effectiveImgW - sourceW) / 2 + shift;
        } else {
          // Görsel kağıttan daha uzun (üstten ve alttan kesilecek)
          sourceH = effectiveImgW / targetRatio;
          const maxShiftY = (effectiveImgH - sourceH) / 2;
          // cropOffsetY: -100 (tam üst - kafa kurtar) ile +100 (tam alt - ayak kurtar)
          const shift = (cropOffsetY / 100) * maxShiftY;
          sourceY = (effectiveImgH - sourceH) / 2 + shift;
        }

        // Geçici bir sanal canvas üzerinde kırpma ve döndürmeyi uygula
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = effectiveImgW;
        tempCanvas.height = effectiveImgH;
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) throw new Error('Temp canvas hatası');

        tempCtx.imageSmoothingEnabled = true;
        tempCtx.imageSmoothingQuality = 'high';

        // Döndürme işlemi
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

        // Şimdi asıl 1800x2400 canvas'a kaynak koordinatlarından çiz
        ctx.drawImage(
          tempCanvas,
          sourceX,
          sourceY,
          sourceW,
          sourceH,
          0,
          0,
          targetWidth,
          targetHeight
        );

        // Yüksek kaliteli JPEG çıktısı (0.96)
        const base64 = canvas.toDataURL('image/jpeg', 0.96);
        resolve(base64);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = (err) => reject(new Error('Görsel yüklenemedi: ' + String(err)));
    img.src = imageUrl;
  });
}
