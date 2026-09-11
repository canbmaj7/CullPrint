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

## Yapılacaklar (Sonraki İyileştirmeler)
- [ ] Sahada DNP DS620 ile ilk fiziksel baskı testi.
- [ ] İsteğe bağlı: Fotoğraf üzerine stüdyo logosu / filigran basma seçeneği.
- [ ] İsteğe bağlı: Hafif pozlama / kontrast telafisi ayarı.
