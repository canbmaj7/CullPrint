# Teknik Bağlam

## Teknoloji Stack'i
- **Uygulama İskeleti:** Electron v34 + Vite + React 19 + TypeScript (electron-builder ile paketleme).
- **Kullanıcı Arayüzü:** Özel CSS Tasarım Sistemi (3 Tema: Koyu Stüdyo, Açık Stüdyo, %18 Nötr Gri Stüdyo Modu), indigo vurgu rengi ve tutarlı boşluk/köşe/tipografi/hareket token'ları (`src/index.css`).
- **Görsel & EXIF İşleme:**
  - `exifr` (ultra hızlı başlık/header okuma) — hem renderer (`src/utils/exif.ts`) hem main process (`electron/main.ts`, `parseImageInfo`) tarafında.
  - HTML5 Canvas rasterizer (`src/utils/rasterizer.ts`) — hedef piksel boyutu artık dinamik (`resolveMediaPixelSize`, CUPS medya token'ından + DPI'dan hesaplanıyor), DNP DS620 varsayılanı (1800x2400 / 2400x1800 @ 300 DPI) bu genel formülün özel durumu.
  - `nativeImage.createThumbnailFromPath` (Electron yerleşik API, ek bağımlılık yok) — `media-thumb://` önbellekli küçük resim/proxy hattı için (240px filmstrip, 1600px CropViewer ana ekran).
- **Yazdırma Altyapısı (OS Düzeyi):**
  - **Linux / macOS:** CUPS (Common Unix Printing System) - `lp`, `lpoptions`, `lpstat`. `execute-print`/`cancel-print-job` IPC handler'ları `execFile` (argüman dizisi, shell injection riski yok) kullanır.
  - **Yazıcı Yetenek Keşfi:** `lpoptions -p <yazici> -l` çıktısı `parseLpOptions` ile yapısal veriye ayrıştırılır; herhangi bir CUPS yazıcısının medya boyutu/yüzey seçenekleri `SettingsModal` üzerinden yapılandırılabilir.
  - **Fiziksel USB Durumu:** `lsusb` üzerinden donanımın takılı olup olmadığının canlı tespiti (DNP vendor `1208`).
  - **Windows:** Win32 Spooler API (henüz aktif geliştirilmedi, plan aşamasında).

## Dağıtım ve CI/CD (GitHub Actions)
Geliştirme birincil olarak Linux üzerinde yapılır. Çoklu platform paketleri bulut otomasyonuyla oluşturulur:
- **`ubuntu-latest` Runner:** `.AppImage` (portable) üretir.
- **`windows-latest` Runner:** `.exe` (NSIS kurulum sihirbazı veya standalone) üretir.
- **`macos-latest` Runner:** `.dmg` (Universal binary) üretir.

## Donanım ve Çevre Birimi Özellikleri
- **Öntanımlı/Öncelikli Yazıcı:** DNP DS620 Dye-Sublimation Photo Printer (tespit edilirse özel muamele: "DS620 Pro" başlığı, varsayılan 6x8/Parlak-Mat).
- **Genel Yazıcı Desteği:** CUPS'a kayıtlı herhangi bir yazıcı `SettingsModal` üzerinden gerçek `lpoptions` seçenekleriyle yapılandırılabilir.
- **Kağıt Formatı:** Varsayılan 6x8 inç (15x20 cm) (CUPS: `w432h576` / 1800x2400 px @ 300 DPI); Ayarlar Modalı'ndan değiştirilebilir.
- **Baskı Yüzeyleri:** Yazıcıya bağlı — DNP için Glossy (Parlak)/Matte (Mat), diğer yazıcılar için CUPS'un bildirdiği gerçek seçenekler.
- **Veri Kaynağı:** Sürükle-bırak (Drag & Drop, çoklu dosya desteği doğrulandı), tekil/çoklu dosya seçici veya Klasör/SD Kart tarayıcı.

## Geliştirme Geçmişinden Notlar (Claude + Gemini orkestrasyonu, 2026-09-11/12)
- 7 kritik hata (fotoğraf atlama, tainted-canvas, sürükle-bırak stale-reference, cancel job ID, drawer klavye kilidi, dragleave titremesi, execFile güvenliği), performans (media-thumb proxy), yazıcı genelleştirmesi ve tasarım yenilemesi — Gemini 3.8 Flash (Antigravity CLI, MCP köprüsü üzerinden) tarafından uygulandı, her adım Claude tarafından `git diff` + `npm run compile` ile doğrulandı.
- Bilinen küçük eksik: Ayarlar Modalı açıkken `Q` tuşuna basmak Kuyruk Çekmecesi'ni de açabiliyor (iki modal üst üste gelebilir) — işlevsel bir hata değil, ileride ince bir düzeltme adayı.
- Henüz gerçek bir DNP DS620 veya ikinci bir CUPS yazıcısıyla fiziksel/uçtan uca test yapılmadı.
