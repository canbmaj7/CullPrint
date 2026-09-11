# Teknik Bağlam

## Teknoloji Stack'i
- **Uygulama İskeleti:** Tauri v2 (Rust + Webview) - Düşük bellek tüketimi, 15-20 MB dağıtım boyutu, yüksek yerel I/O hızı.
- **Kullanıcı Arayüzü:** Vite + React / TypeScript (veya Svelte) + TailwindCSS veya saf Vanilla CSS (Karanlık tema tasarım sistemi).
- **Görsel & EXIF İşleme:** Rust `image` ve `kamadak-exif` crate'leri (veya ultra hızlı yerel thumbnail decode kütüphaneleri).
- **Yazdırma Altyapısı (OS Düzeyi):**
  - **Linux / macOS:** CUPS (Common Unix Printing System) + Gutenprint / DNP backend.
  - **Windows:** Win32 Spooler API.

## Dağıtım ve CI/CD (GitHub Actions)
Geliştirme birincil olarak Linux üzerinde yapılır. Çoklu platform paketleri bulut otomasyonuyla oluşturulur:
- **`ubuntu-latest` Runner:** `.AppImage` (portable) ve `.deb` üretir.
- **`windows-latest` Runner:** `.exe` (NSIS kurulum sihirbazı veya standalone) üretir.
- **`macos-latest` Runner:** `.dmg` (Universal binary: ARM64 + x64) üretir.

## Donanım ve Çevre Birimi Özellikleri
- **Hedef Yazıcı:** DNP DS620 Dye-Sublimation Photo Printer
- **Kağıt Formatı:** 6x8 inç (15x20 cm) Rulo Kağıt (432 x 576 pt / 1800 x 2400 px @ 300 DPI)
- **Baskı Yüzeyleri:** Glossy (Parlak), Matte (Mat), Luster, Fine Matte
- **Veri Kaynağı:** SD Kart / Kart Okuyucu veya Yerel Disk Klasörü (DCIM / Fotoğraflar)
