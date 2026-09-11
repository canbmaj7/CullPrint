# Sistem Desenleri ve Mimarisi

## Genel Mimari
Uygulama **Electron** üzerine kuruludur (erken planlamada Tauri/Rust değerlendirilmişti, ama gerçek implementasyon Electron + Node.js main process ile ilerledi — bu belge artık gerçek mimariyi yansıtıyor):

```mermaid
flowchart TD
    UI[Renderer: React 19 + Vite + TypeScript] -->|IPC (contextBridge)| Main[Electron Main Process: Node.js + TypeScript]
    Main -->|EXIF & Metadata| ImgProcessor[exifr + JPEG marker okuma]
    Main -->|child_process execFile| PrintBridge[CUPS Yazdırma Köprüsü]
    Main -->|nativeImage.createThumbnailFromPath| ThumbCache[media-thumb:// Önbellek]
    Main -->|fs.readFile| MediaProtocol[media:// Tam Çözünürlük Protokolü]

    PrintBridge -->|lp / lpoptions / lpstat / lsusb| CUPS[CUPS]
    CUPS --> Printer[Bağlı Yazıcı - varsayılan DNP DS620]
```

## Temel Sistem Bileşenleri

### 1. Görsel & Kadrajlama Motoru (Image Engine)
- **İki Kademeli Görsel Sunumu:**
  - `media://` (electron/main.ts, privileged custom protocol): tam orijinal dosyayı olduğu gibi okuyup sunar — **sadece baskı raster üretimi bu şemayı kullanır**, asla küçültülmüş bir proxy değil.
  - `media-thumb://` (aynı dosyada ikinci privileged protocol): `nativeImage.createThumbnailFromPath` ile diskte (`os.tmpdir()/cullprint-thumbs`) SHA-1 hash'lenmiş (yol+mtime+boyut) önbellekli küçük resim üretir. Filmstrip 240px, CropViewer ana ekranı 1600px kullanır. Bu ayrım, 20-45MB'lık orijinal dosyalarda geçiş performansı sorununu (lag) çözmek için eklendi.
- **Yön Algılama (Orientation Detection):** EXIF `Orientation` etiketini (`exifr`, hem renderer'da `getPhotoMetadata` hem main process'te `parseImageInfo` üzerinden) ve piksel en/boy oranını analiz ederek fotoğrafı otomatik dik veya yatay konumlandırır. Manuel `90°` çevirme desteği sağlar.
- **Piksel-Kusursuz (Pixel-Perfect) Hazırlık (`src/utils/rasterizer.ts`):**
  - Hedef piksel boyutu artık **hardcoded değil**, `resolveMediaPixelSize(mediaSizeToken, dpi)` ile dinamik hesaplanıyor: CUPS `wNNNhNNN` token'ları 1/72" puan formülüyle (örn. `w432h576` → 6×8"), isimli boyutlar (`Letter`, `A4` vb.) küçük bir statik tabloyla çözülüyor.
  - DNP DS620 varsayılanı (6x8" @ 300 DPI = 1800×2400 / 2400×1800 px) matematik olarak korunuyor; bu artık genel formülün özel bir durumu.
  - Kullanıcı önizlemede kadrajı kaydırdığında (offset x/y), yazıcıya gönderilmeden önce bu tam piksel ebatında kesilir — her zaman `media://` (tam orijinal) üzerinden, proxy'den asla.

### 2. Yazdırma Köprüsü (Print Bridge) — CUPS
- `lpstat -p -d` ile yazıcılar ve varsayılan yazıcı listelenir; DNP tespiti isim eşleştirmesiyle (`isDNP`) yapılır ama artık zorunlu değil.
- `lpoptions -p <yazici> -l` çıktısı `parseLpOptions` (electron/main.ts) ile yapısal `PrinterOption[]` listesine ayrıştırılır; medya-boyutu ve bitirme/kalite seçenek isimleri regex ile otomatik tespit edilir (`mediaOptionName`, `finishOptionName`).
- `lp -d <yazici> -n <kopya> -o <mediaOptionName>=<deger> -o <finishOptionName>=<deger> <dosya>` ile baskı gönderilir — `execFile` (argüman dizisi, shell interpolasyonu yok) kullanılarak.
- `lsusb` ile DNP'nin fiziksel USB bağlantısı canlı olarak (4 saniyede bir) kontrol edilir.
- Windows desteği plan aşamasında (Win32 Spooler API); şu an aktif geliştirme/test Linux üzerinde.

### 3. Ayarlar Modalı (SettingsModal) — Yazıcı Genelleştirmesi
- Yeni `src/components/SettingsModal.tsx`: seçili yazıcının gerçek CUPS seçeneklerini (medya boyutu, yüzey/kalite, diğer) gösterir, kullanıcı seçimini `localStorage` içinde yazıcı bazlı (`cullprint_printer_settings_<yazici-adi>`) saklar.
- Geriye dönük tam uyumluluk: Ayarlar hiç açılmazsa DNP DS620 için davranış (6x8, Parlak/Mat 2 butonlu seçim) birebir korunur.
- Bitirme/kalite seçeneği ≤2 seçenekliyse PrinterSidebar'da inline 2-buton deneyimi korunur, 3+ ise Ayarlar Modalı'na yönlendirilir.

### 4. Kullanıcı Arayüzü Düzeni (Single-Window Workflow)
- **Üst Bar (Header):** Klasör seçimi, dosya sayısı, filtreler (Tümü / Basılanlar), tema değiştirici, Ayarlar Modalı tetikleyici (dişli ikon), aktif yazıcı adı (DNP ise "DS620 Pro", değilse gerçek yazıcı adı).
- **Merkez Alan (CropViewer):** Büyük fotoğraf gösterici (1600px proxy) + şeffaf kırpma çerçevesi (seçili kağıt oranına göre), fotoğraf geçişinde solma animasyonu.
- **Alt Bar (Filmstrip):** Hızlı kaydırılabilir küçük resim şeridi (240px proxy, lazy-loaded) ve baskı durumu rozetleri.
- **Sağ Panel (PrinterSidebar):** Yazıcı durum kartı, aktif kağıt boyutu/yüzey özeti + "Değiştir" bağlantısı (Ayarlar Modalı'nı açar), kopya sayısı, dev "Yazdır" butonu ve kısayol rehberi.
- **Kuyruk Çekmecesi (QueueDrawer) / Ayarlar Modalı (SettingsModal):** İkisi de aynı slide-over overlay örüntüsünü paylaşır; açıkken arka plandaki fotoğraf klavye kısayolları (Space/ok/R/C) kilitlenir, sadece Escape/Q (queue için) geçerli kalır.

## Tasarım Sistemi (CSS Custom Properties, src/index.css)
- Üç tema (`:root`/dark, `[data-theme="light"]`, `[data-theme="neutral"]`), her biri kendi `--accent-blue` (indigo skala), `--bg-*`, `--text-*` token setini tanımlar.
- Ek skalalar: `--space-1..8` (boşluk), `--radius-sm/md/lg/xl/full` (köşe), `--text-xs..xl` + `--weight-normal/medium/semibold` (tipografi), `--duration-fast/base/slow` + `--ease-standard` (hareket).
- Bileşenler mümkün olduğunca inline style değil, tema token'larını kullanan adlandırılmış CSS sınıfları üzerinden stillendirilir (SettingsModal bu kurala sonradan uydurulmuştur).
