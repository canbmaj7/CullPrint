# İlerleme Durumu

## Tamamlanan Aşamalar
- [x] Problem analizi (Düğün fotoğrafçılığı sahadaki seri baskı ihtiyacı).
- [x] DNP DS620 yazıcı karakteristikleri ve 6x8 (15x20 cm) rulo kağıt dinamikleri incelendi.
- [x] EXIF tabanlı yön algılama (yatay/dikey) ve 3:2 -> 4:3 canlı kırpma çözümü tasarlandı.
- [x] Teknisyen/Fotoğrafçı odaklı UX ve klavye kısayolları haritası çıkarıldı.
- [x] Çoklu platform (Linux, Windows, macOS) yazdırma altyapısı (CUPS & WinSpooler) ve GitHub Actions CI/CD dağıtım modeli planlandı.
- [x] `memory-bank` mimari belgeleri oluşturuldu ve güncellendi.
- [x] İsim belirlendi: **CullPrint**
- [x] Electron + Vite + React 19 + TypeScript çekirdek projesi ayağa kaldırıldı.
- [x] CUPS `lp` / `lpstat` / `lpoptions` yazdırma motoru entegre edildi.
- [x] `exifr` ile EXIF yön ve boyut çözümleme modülü yazıldı.
- [x] 6x8 canlı kırpma, kaydırma ve 1800x2400 @ 300 DPI rasterizer motoru tamamlandı.
- [x] `Space`/`Enter` ile "Bas & Geç" seri iş akışı ve çift basım önleme rozetleri uygulandı.
- [x] Capture One / Leica tarzı minimalist karanlık stüdyo teması oluşturuldu.
- [x] Linux AppImage derlendi ve doğrulandı (`release/CullPrint-1.0.0.AppImage`).
- [x] GitHub Actions çapraz platform dağıtım iş akışı (`release.yml`) hazırlandı.
- [x] Baskı Kuyruğu & Geçmişi Çekmecesi (QueueDrawer, CUPS senkronizasyonu, tek tıkla tekrar basma, rulo sayacı) tamamlandı.
- [x] 7 kritik kararlılık ve güvenlik hatası giderildi (fotoğraf atlama, tainted canvas, drag-drop await kaybı, cancel job ID, drawer klavye kilitleri, dragleave titremesi, execFileAsync dönüşümü).
- [x] Yüksek çözünürlüklü fotoğraflar (20-45MB) için `media-thumb://` önbellekli thumbnail & proxy boru hattı uygulandı.
- [x] Genel CUPS yazıcı yetenekleri (`lpoptions -l` ayrıştırma), dinamik rasterizer piksel boyutu ve `SettingsModal` ayarlar yönetimi uygulandı.
- [x] Tasarım Sistemi ve Görsel Yenileme (Design Tokens: Indigo aksan, Spacing, Radius, Typography, Motion, buton geri bildirimi, CropViewer fotoğraf geçiş kararması ve SettingsModal CSS temizliği) tamamlandı.

- [x] DNP DS620 ile ilk fiziksel baskı testi (2026-09-19): dikey/yatay/döndürme/kopya/iptal doğrulandı; Linux küçük resim (`sharp`), akıcı geçiş (önden yükleme), önizleme yarış durumu, `lpstat` durum ayrıştırma ve açık tema metin hataları düzeltildi; kuyruk duraklat/devam butonu eklendi.

- [x] AppImage'da `sharp` doğrulandı; gerçek kalan baskı sayısı (Gutenprint marker), dışarıdan iptal edilen işlerin doğru gösterimi, PNG/WebP boyutları, Ayarlar+Q (2026-09-19).
- [x] Sürüm öncesi düzeltme turu (2026-09-19): döndürülmüş önizleme, yazıcı/iş hatalarının arayüzde gösterimi, kalıcı "Basıldı" durumu, yatay fotoğrafta klavye kadrajı, geçici dosyaların RAM'de birikmesi, DNP USB kimliği.
- [x] Yazdırma katmanı platform arka uçlarına ayrıldı (`electron/print/`, 2026-09-19) — Windows desteğinin 1. adımı.

## Yapılacaklar (Sonraki İyileştirmeler)

- [x] Windows yazdırma arka ucu yazıldı (`electron/print/windows.ts` + `windows.ps1`, 2026-09-19); protokol ve PrintTicket yardımcıları Linux'ta `pwsh` ile test edildi.
- [x] **Linux'ta hiçbir baskının çıkmaması çözüldü (2026-09-20):** sharp başlıksız JPEG yazıyordu, CUPS
      `imagetoraster` dosyayı tanımayıp 0 baytlık raster üretiyor ve iş sessizce `canceled-at-device` ile
      düşüyordu. `.withMetadata({ density: 300 })` eklendi (`5814fde`); gerçek DS620 ile doğrulandı.
      Ayrıntı ve teşhis yöntemi: `aktifBaglam.md`.
- [ ] Windows'ta gerçek DS620 ile test (2026-09-20'de başladı, sürüyor). **Açık sorun:** baskı çalışıyor
      ama işler kuyrukta "sırada" görünmüyor, anında "Basıldı" oluyor ve İptal Et çıkmıyor; iş numarası
      alınıyor, `System.Printing` işleri görüyor. İki düzeltme denendi (`8933dca`, `372d4d1`), ikisi de
      yetmedi. Devam etmeden önce ölçüm yapılacak — ayrıntı ve komut: `aktifBaglam.md`. Yazıcı/kâğıt/durum algılama doğrulandı;
      kalan baskı sayısının Windows'ta okunamadığı kesinleşti (bkz. `aktifBaglam.md` → Windows Testi — Bulgular),
      elle sayaç kalıyor ve rulo kartında bunu belirten not eklendi.
- [ ] Oturum yedeği ve çökme sonrası kurtarma (plan: `planOturumYedegi.md`; önce açık sorular kullanıcıyla netleşecek).

- [ ] İsteğe bağlı: Fotoğraf üzerine stüdyo logosu / filigran basma seçeneği.
- [ ] İsteğe bağlı: Hafif pozlama / kontrast telafisi ayarı.
