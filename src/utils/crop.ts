import { PhotoItem } from '../types';

/**
 * Döndürme sonrası fotoğrafın kağıda göre hangi eksende kırpıldığı.
 * Kağıttan genişse yanlardan ('x'), uzunsa üst/alttan ('y') kırpılır — rasterizer.ts ile aynı kural.
 * Kadraj kaydırma (klavye, fare) yalnızca bu eksende etkilidir.
 */
export function getCropAxis(photo: PhotoItem): 'x' | 'y' {
  const rotation = (photo.userRotation || 0) % 360;
  const isRotated90 = rotation === 90 || rotation === 270;
  const effectiveIsLandscape = isRotated90 ? !photo.isLandscape : (photo.isLandscape ?? true);
  const targetRatio = effectiveIsLandscape ? 4 / 3 : 3 / 4;
  const imgW = photo.width || 6000;
  const imgH = photo.height || 4000;
  const effectiveImageRatio = isRotated90 ? imgH / imgW : imgW / imgH;
  return effectiveImageRatio > targetRatio ? 'x' : 'y';
}
