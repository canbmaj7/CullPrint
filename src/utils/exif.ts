import exifr from 'exifr';

export interface ExifInfo {
  orientation: number;
  width: number;
  height: number;
  isLandscape: boolean;
}

/**
 * Dosya yolundan veya URL'sinden EXIF yön ve boyut bilgilerini ayrıştırır.
 * exifr, dosyanın tamamını indirmeden sadece başlık (header) baytlarını okur.
 */
export async function getPhotoMetadata(mediaUrl: string): Promise<ExifInfo> {
  try {
    const data = await exifr.parse(mediaUrl, ['Orientation', 'ImageWidth', 'ImageHeight', 'ExifImageWidth', 'ExifImageHeight']);

    const orientation = data?.Orientation ?? 1;
    let width = data?.ExifImageWidth || data?.ImageWidth || 6000;
    let height = data?.ExifImageHeight || data?.ImageHeight || 4000;

    // Eğer EXIF oryantasyonu 90 veya 270 derece döndürülmüşse (6 veya 8)
    if (orientation === 6 || orientation === 8) {
      const temp = width;
      width = height;
      height = temp;
    }

    const isLandscape = width >= height;

    return {
      orientation,
      width,
      height,
      isLandscape,
    };
  } catch (err) {
    console.warn('EXIF okunamadı, varsayılan yatay kabul ediliyor:', err);
    return {
      orientation: 1,
      width: 6000,
      height: 4000,
      isLandscape: true,
    };
  }
}
