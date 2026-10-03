/**
 * Çekim bilgisinin ekranda gösterilecek metinleri (CropViewer üst çubuğu).
 * takenAt saat dilimsiz yazılan EXIF saatidir: UTC alanlarıyla "olduğu gibi" biçimlenir, yerel saat dilimine kaydırılmaz.
 */
import type { PhotoItem } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');

export interface ShotText {
  dateTime?: string; // 03.10.2026 16:55:05
  camera?: string;
  lens?: string;
  exposure?: string; // 1/200 · f/2.8 · ISO 100 · 24 mm
}

export function formatShot(shot: PhotoItem['shot']): ShotText {
  if (!shot) return {};
  const parts: string[] = [];
  if (shot.exposureTime) {
    parts.push(shot.exposureTime >= 1 ? `${+shot.exposureTime.toFixed(1)} sn` : `1/${Math.round(1 / shot.exposureTime)}`);
  }
  if (shot.fNumber) parts.push(`f/${+shot.fNumber.toFixed(1)}`);
  if (shot.iso) parts.push(`ISO ${Math.round(shot.iso)}`);
  if (shot.focalLength) parts.push(`${Math.round(shot.focalLength)} mm`);

  let dateTime: string | undefined;
  if (shot.takenAt) {
    const d = new Date(shot.takenAt);
    dateTime =
      `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ` +
      `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  }
  return { dateTime, camera: shot.camera, lens: shot.lens, exposure: parts.length ? parts.join(' · ') : undefined };
}
