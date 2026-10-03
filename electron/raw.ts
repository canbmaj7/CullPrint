// RAW (ARW) desteği: dosyanın içine gömülü tam boyutlu kamera JPEG'ini çıkarır.
// Harici çözücü gerekmez (Windows'ta da çalışır). Sony ARW bir TIFF kabıdır; IFD'leri gezip en büyük gömülü JPEG'i alırız
// (Sony A7 V'te JpgFromRaw 7008×4672, yani 6x8" baskı için fazlasıyla yeterli). Gerçek RAW çözme (demosaic) yapılmaz:
// ekranda ve baskıda görülen, kameranın kendi JPEG işlemesidir.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const RAW_EXTENSIONS = new Set(['.arw']);

export function isRawFile(filePath: string): boolean {
  return RAW_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

interface RawJpeg {
  jpeg: Buffer;
  orientation: number; // EXIF yön (1-8); gömülü JPEG genelde yön bilgisi taşımaz, IFD0'dan alınır
}

const TAG_ORIENTATION = 0x0112;
const TAG_SUB_IFDS = 0x014a;
const TAG_JPEG_OFFSET = 0x0201;
const TAG_JPEG_LENGTH = 0x0202;
const MAX_IFDS = 16; // bozuk dosyada sonsuz döngüye karşı
const MAX_JPEG_BYTES = 128 * 1024 * 1024;

async function readAt(fd: fs.promises.FileHandle, position: number, length: number): Promise<Buffer> {
  const buffer = Buffer.alloc(length);
  const { bytesRead } = await fd.read(buffer, 0, length, position);
  return bytesRead === length ? buffer : buffer.subarray(0, bytesRead);
}

/** TIFF/ARW içindeki en büyük gömülü JPEG'i ve IFD0 yönünü okur; bulunamazsa null. */
export async function extractRawJpeg(rawPath: string): Promise<RawJpeg | null> {
  const fd = await fs.promises.open(rawPath, 'r');
  try {
    const stat = await fd.stat();
    const header = await readAt(fd, 0, 8);
    if (header.length < 8) return null;
    const little = header.toString('latin1', 0, 2) === 'II';
    if (!little && header.toString('latin1', 0, 2) !== 'MM') return null;
    const u16 = (b: Buffer, o: number) => (little ? b.readUInt16LE(o) : b.readUInt16BE(o));
    const u32 = (b: Buffer, o: number) => (little ? b.readUInt32LE(o) : b.readUInt32BE(o));
    if (u16(header, 2) !== 42) return null;

    const queue: number[] = [u32(header, 4)];
    const seen = new Set<number>();
    let orientation = 1;
    let isFirstIfd = true;
    const candidates: { offset: number; length: number }[] = [];

    while (queue.length > 0 && seen.size < MAX_IFDS) {
      const ifdOffset = queue.shift() as number;
      if (ifdOffset === 0 || ifdOffset + 2 > stat.size || seen.has(ifdOffset)) continue;
      seen.add(ifdOffset);

      const countBuf = await readAt(fd, ifdOffset, 2);
      if (countBuf.length < 2) continue;
      const count = u16(countBuf, 0);
      const body = await readAt(fd, ifdOffset + 2, count * 12 + 4);
      if (body.length < count * 12 + 4) continue;

      let jpegOffset = 0;
      let jpegLength = 0;
      for (let i = 0; i < count; i++) {
        const e = i * 12;
        const tag = u16(body, e);
        const type = u16(body, e + 2);
        const n = u32(body, e + 4);
        if (tag === TAG_ORIENTATION && isFirstIfd && type === 3) orientation = u16(body, e + 8);
        else if (tag === TAG_JPEG_OFFSET) jpegOffset = u32(body, e + 8);
        else if (tag === TAG_JPEG_LENGTH) jpegLength = u32(body, e + 8);
        else if (tag === TAG_SUB_IFDS && type === 4 && n > 0 && n <= 8) {
          if (n === 1) queue.push(u32(body, e + 8));
          else {
            const list = await readAt(fd, u32(body, e + 8), n * 4);
            for (let k = 0; k + 4 <= list.length; k += 4) queue.push(u32(list, k));
          }
        }
      }
      if (jpegOffset > 0 && jpegLength > 0 && jpegOffset + jpegLength <= stat.size) {
        candidates.push({ offset: jpegOffset, length: jpegLength });
      }
      queue.push(u32(body, count * 12)); // sonraki IFD (IFD0 → IFD1 → ...)
      isFirstIfd = false;
    }

    candidates.sort((a, b) => b.length - a.length);
    for (const c of candidates) {
      if (c.length > MAX_JPEG_BYTES) continue;
      const jpeg = await readAt(fd, c.offset, c.length);
      if (jpeg.length === c.length && jpeg[0] === 0xff && jpeg[1] === 0xd8) return { jpeg, orientation };
    }
    return null;
  } finally {
    await fd.close();
  }
}

/** JPEG'e yalnızca yön içeren bir EXIF APP1 yazar (eski EXIF APP1'leri atılır). Piksel verisine dokunulmaz, kayıpsızdır. */
function withExifOrientation(jpeg: Buffer, orientation: number): Buffer {
  const exif = Buffer.from([
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // TIFF başlığı (little-endian), IFD0 ofseti 8
    0x01, 0x00, // 1 giriş
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation & 0xff, 0x00, 0x00, 0x00, // Orientation (SHORT)
    0x00, 0x00, 0x00, 0x00, // sonraki IFD yok
  ]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1, 0x00, exif.length + 2]), exif]);

  const head: Buffer[] = []; // APP0 (JFIF) SOI'den hemen sonra kalmalı
  const rest: Buffer[] = [];
  let offset = 2;
  while (offset + 4 <= jpeg.length && jpeg[offset] === 0xff && jpeg[offset + 1] !== 0xda) {
    const marker = jpeg[offset + 1];
    const end = offset + 2 + jpeg.readUInt16BE(offset + 2);
    if (end > jpeg.length) break;
    const segment = jpeg.subarray(offset, end);
    const isExif = marker === 0xe1 && segment.toString('latin1', 4, 8) === 'Exif';
    if (!isExif) (marker === 0xe0 ? head : rest).push(segment);
    offset = end;
  }
  return Buffer.concat([jpeg.subarray(0, 2), ...head, app1, ...rest, jpeg.subarray(offset)]);
}

const inFlight = new Map<string, Promise<string>>();

/**
 * Uygulamanın her yolunun (önizleme, küçük resim, baskı) okuyacağı gerçek dosya yolunu verir:
 * RAW değilse aynı yol; RAW ise önbellekteki çıkarılmış JPEG. Kimlik (liste, rozet, kuyruk) hep özgün RAW yolunda kalır.
 */
export async function resolveImageSource(filePath: string, cacheDir: string): Promise<string> {
  if (!isRawFile(filePath)) return filePath;

  const stat = await fs.promises.stat(filePath);
  const key = crypto.createHash('sha1').update(`${filePath}:${stat.mtimeMs}:${stat.size}`).digest('hex');
  const cachePath = path.join(cacheDir, `${key}.jpg`);
  if (fs.existsSync(cachePath)) return cachePath;

  let pending = inFlight.get(cachePath);
  if (!pending) {
    pending = (async () => {
      const raw = await extractRawJpeg(filePath);
      if (!raw) throw new Error(`RAW içinde gömülü JPEG bulunamadı: ${filePath}`);
      await fs.promises.mkdir(cacheDir, { recursive: true });
      const tmp = `${cachePath}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, withExifOrientation(raw.jpeg, raw.orientation));
      await fs.promises.rename(tmp, cachePath);
      return cachePath;
    })().finally(() => inFlight.delete(cachePath));
    inFlight.set(cachePath, pending);
  }
  return pending;
}
