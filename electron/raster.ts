// Baskı raster'ı ana süreçte sharp (libvips) ile: arayüz iş parçacığını dondurmaz, orijinal dosyadan okur.
// Kırpma hesabı önizlemeyle ortaktır (src/utils/crop.ts → computeCropRect): ekranda görülen = basılan.
import { computeCropRect } from '../src/utils/crop';

export interface RasterRequest {
  filePath: string;
  targetWidth: number;
  targetHeight: number;
  cropOffsetX: number;
  cropOffsetY: number;
  userRotation: number;
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

  // 2. Önizlemeyle aynı kırpma hesabı, hedef boyuta ölçekleme
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

  await sharp(rotated.data, {
    raw: { width: rotated.info.width, height: rotated.info.height, channels: rotated.info.channels },
  })
    .extract({ left, top, width, height })
    .resize(req.targetWidth, req.targetHeight, { fit: 'fill', kernel: 'lanczos3' })
    // 4:4:4 KULLANMA: CUPS'un imagetoraster filtresi renk alt örneklemesi olmayan JPEG'i açamıyor,
    // sessizce 0 baytlık raster üretiyor ve iş "canceled-at-device" ile düşüyor (gerçek DS620 ile
    // doğrulandı: 4:2:0 ve 4:2:2 çalışıyor, 4:4:4 çalışmıyor). 300 DPI dye-sub baskıda 4:2:2'nin
    // görünür bir kaybı yok.
    .jpeg({ quality: 96, chromaSubsampling: '4:2:2' })
    .toFile(outPath);
}
