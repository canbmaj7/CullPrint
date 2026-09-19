import { PhotoItem } from '../types';
import { resolveMediaPixelSize } from './media';

/**
 * Seçili kâğıdın dikey konumdaki en/boy oranı (ör. 6x8 → 0.75, 4x6 → 0.667).
 * Önizleme çerçevesi, kadraj ekseni ve baskı raster'ı hep bu orandan hesaplanır.
 */
export function getPaperPortraitRatio(mediaSize: string): number {
  const { widthIn, heightIn } = resolveMediaPixelSize(mediaSize);
  return Math.min(widthIn, heightIn) / Math.max(widthIn, heightIn);
}

/** Kâğıdın fotoğrafın etkin yönüne göre çevrilmiş oranı (genişlik / yükseklik) */
export function getTargetRatio(effectiveIsLandscape: boolean, mediaSize: string): number {
  const portrait = getPaperPortraitRatio(mediaSize);
  return effectiveIsLandscape ? 1 / portrait : portrait;
}

/**
 * Döndürme sonrası fotoğrafın kağıda göre hangi eksende kırpıldığı.
 * Kağıttan genişse yanlardan ('x'), uzunsa üst/alttan ('y') kırpılır — computeCropRect ile aynı kural.
 * Kadraj kaydırma (klavye, fare) yalnızca bu eksende etkilidir.
 */
export function getCropAxis(photo: PhotoItem, mediaSize: string): 'x' | 'y' {
  const rotation = (photo.userRotation || 0) % 360;
  const isRotated90 = rotation === 90 || rotation === 270;
  const effectiveIsLandscape = isRotated90 ? !photo.isLandscape : (photo.isLandscape ?? true);
  const targetRatio = getTargetRatio(effectiveIsLandscape, mediaSize);
  const imgW = photo.width || 6000;
  const imgH = photo.height || 4000;
  const effectiveImageRatio = isRotated90 ? imgH / imgW : imgW / imgH;
  return effectiveImageRatio > targetRatio ? 'x' : 'y';
}

/**
 * Döndürülmüş (etkin) görsel üzerinde basılacak alan. Ofsetler -100 (sol/üst) ile +100 (sağ/alt) arası yüzde.
 * Hem canvas rasterizer'ı hem ana süreçteki sharp yolu bunu kullanır: önizleme = baskı.
 */
export function computeCropRect(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  cropOffsetX: number,
  cropOffsetY: number
): { x: number; y: number; width: number; height: number } {
  const targetRatio = targetWidth / targetHeight;
  if (sourceWidth / sourceHeight > targetRatio) {
    // Görsel kağıttan daha geniş: sağdan ve soldan kesilir
    const width = sourceHeight * targetRatio;
    const maxShift = (sourceWidth - width) / 2;
    return { x: maxShift + (cropOffsetX / 100) * maxShift, y: 0, width, height: sourceHeight };
  }
  // Görsel kağıttan daha uzun: üstten ve alttan kesilir
  const height = sourceWidth / targetRatio;
  const maxShift = (sourceHeight - height) / 2;
  return { x: 0, y: maxShift + (cropOffsetY / 100) * maxShift, width: sourceWidth, height };
}

/** Kâğıt boyutu ve etkin yöne göre baskı raster'ının piksel boyutu */
export function getRasterSize(
  mediaSize: string,
  effectiveIsLandscape: boolean,
  dpi = 300
): { width: number; height: number } {
  const { widthIn, heightIn } = resolveMediaPixelSize(mediaSize);
  const short = Math.round(Math.min(widthIn, heightIn) * dpi);
  const long = Math.round(Math.max(widthIn, heightIn) * dpi);
  return effectiveIsLandscape ? { width: long, height: short } : { width: short, height: long };
}
