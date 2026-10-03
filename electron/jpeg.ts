// JPEG boyutunu dosyadan okur: bölümleri uzunluklarına göre atlayarak SOF işaretine gider, bölüm içeriklerini okumaz.
// Büyük EXIF/önizleme taşıyan dosyalarda (Sony, Fujifilm) SOF ilk 64 KB'ın dışındadır; sharp.metadata'ya düşmek
// dosya başına ~60 ms tutuyordu, bu yol birkaç küçük okumadır.
import type fs from 'node:fs';

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const MAX_SEGMENTS = 64; // bozuk dosyada sonsuz döngüye karşı

export async function readJpegDimensions(fd: fs.promises.FileHandle): Promise<{ width: number; height: number } | null> {
  const { size } = await fd.stat();
  const head = Buffer.alloc(2);
  if ((await fd.read(head, 0, 2, 0)).bytesRead < 2 || head[0] !== 0xff || head[1] !== 0xd8) return null;

  let offset = 2;
  const header = Buffer.alloc(9); // işaret (2) + uzunluk (2) + SOF için hassasiyet (1) + yükseklik (2) + genişlik (2)
  for (let i = 0; i < MAX_SEGMENTS && offset + 4 <= size; i++) {
    const { bytesRead } = await fd.read(header, 0, 9, offset);
    if (bytesRead < 4 || header[0] !== 0xff) return null;
    const marker = header[1];
    if (SOF_MARKERS.has(marker)) {
      if (bytesRead < 9) return null;
      return { height: header.readUInt16BE(5), width: header.readUInt16BE(7) };
    }
    if (marker === 0xd9 || marker === 0xda) return null; // SOF görülmeden veri başladı
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2; // uzunluksuz işaretler
      continue;
    }
    offset += 2 + header.readUInt16BE(2);
  }
  return null;
}
