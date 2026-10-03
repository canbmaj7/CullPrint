// Çekim bilgisi (EXIF): tarih-saat, kamera, lens, pozlama. electron'a bağımlı değildir (test edilebilir).
import fs from 'node:fs';
import exifr from 'exifr';
import type { PhotoItem } from '../src/types';

export type ShotInfo = NonNullable<PhotoItem['shot']>;

/**
 * Çekim bilgisi (EXIF): tarih-saat, kamera, lens, pozlama. İlk 64 KB yeter (JPEG ve ARW'de de ~2 ms).
 * RAW'da özgün dosyadan okunur (çıkarılmış gömülü JPEG yalnızca yön taşır). Yoksa/okunamazsa undefined.
 */
export async function readShotInfo(filePath: string): Promise<ShotInfo | undefined> {
  try {
    const fd = await fs.promises.open(filePath, 'r');
    let head: Buffer;
    try {
      const buffer = Buffer.alloc(65536);
      const { bytesRead } = await fd.read(buffer, 0, 65536, 0);
      head = buffer.subarray(0, bytesRead);
    } finally {
      await fd.close();
    }
    const d = await exifr.parse(head, {
      pick: ['DateTimeOriginal', 'Make', 'Model', 'LensModel', 'ExposureTime', 'FNumber', 'ISO', 'FocalLength'],
    });
    if (!d) return undefined;

    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);
    const make = typeof d.Make === 'string' ? d.Make.trim() : '';
    const model = typeof d.Model === 'string' ? d.Model.trim() : '';
    const titleMake = make ? make.charAt(0).toUpperCase() + make.slice(1).toLowerCase() : '';
    // "FUJIFILM X-S20" gibi model adı markayı zaten içeriyorsa tekrarlama; "ILCE-7M5" gibilerde markayı başa ekle
    const camera = model
      ? make && !model.toLowerCase().includes(make.toLowerCase())
        ? `${titleMake} ${model}`
        : model
      : titleMake || undefined;

    const shot: ShotInfo = {
      takenAt: d.DateTimeOriginal instanceof Date ? d.DateTimeOriginal.getTime() : undefined,
      camera,
      lens: typeof d.LensModel === 'string' && d.LensModel.trim() ? d.LensModel.trim() : undefined,
      exposureTime: num(d.ExposureTime),
      fNumber: num(d.FNumber),
      iso: num(d.ISO),
      focalLength: num(d.FocalLength),
    };
    return Object.values(shot).some((v) => v !== undefined) ? shot : undefined;
  } catch {
    return undefined;
  }
}

