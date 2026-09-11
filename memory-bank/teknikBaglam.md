# Teknik Bağlam

## Teknoloji Stack'i
- **Uygulama İskeleti:** Electron v34 + Vite + React 19 + TypeScript.
- **Kullanıcı Arayüzü:** Özel CSS Tasarım Sistemi (3 Tema: Koyu Stüdyo, Açık Stüdyo, %18 Nötr Gri Stüdyo Modu).
- **Görsel & EXIF İşleme:** `exifr` (ultra hızlı başlık/header okuma) + HTML5 Canvas 300 DPI piksel-kusursuz rasterizer (1800x2400 / 2400x1800).
- **Yazdırma Altyapısı (OS Düzeyi):**
  - **Linux / macOS:** CUPS (Common Unix Printing System) - `lp`, `lpoptions`, `lpstat`.
  - **Fiziksel USB Durumu:** `lsusb` üzerinden donanımın takılı olup olmadığının canlı tespiti (DNP vendor `1208`).
  - **Windows:** Win32 Spooler API.

## Dağıtım ve CI/CD (GitHub Actions)
Geliştirme birincil olarak Linux üzerinde yapılır. Çoklu platform paketleri bulut otomasyonuyla oluşturulur:
- **`ubuntu-latest` Runner:** `.AppImage` (portable) üretir.
- **`windows-latest` Runner:** `.exe` (NSIS kurulum sihirbazı veya standalone) üretir.
- **`macos-latest` Runner:** `.dmg` (Universal binary) üretir.

## Donanım ve Çevre Birimi Özellikleri
- **Hedef Yazıcı:** DNP DS620 Dye-Sublimation Photo Printer
- **Kağıt Formatı:** 6x8 inç (15x20 cm) Rulo Kağıt (CUPS: `w432h576` / 1800 x 2400 px @ 300 DPI)
- **Baskı Yüzeyleri:** Glossy (Parlak), Matte (Mat)
- **Veri Kaynağı:** Sürükle-bırak (Drag & Drop), tekil/çoklu dosya seçici veya Klasör/SD Kart tarayıcı.
