# İlerleme Durumu

## Tamamlanan Aşamalar
- [x] Problem analizi (Düğün fotoğrafçılığı sahadaki seri baskı ihtiyacı).
- [x] DNP DS620 yazıcı karakteristikleri ve 6x8 (15x20 cm) rulo kağıt dinamikleri incelendi.
- [x] EXIF tabanlı yön algılama (yatay/dikey) ve 3:2 -> 4:3 canlı kırpma çözümü tasarlandı.
- [x] Teknisyen/Fotoğrafçı odaklı UX ve klavye kısayolları haritası çıkarıldı.
- [x] Çoklu platform (Linux, Windows, macOS) yazdırma altyapısı (CUPS & WinSpooler) ve GitHub Actions CI/CD dağıtım modeli planlandı.
- [x] `memory-bank` mimari belgeleri oluşturuldu ve güncellendi.

## Yapılacaklar (Yol Haritası)

### Faz 1: Hazırlık & İsimlendirme
- [ ] Uygulama isminin seçilmesi.
- [ ] Linux ortamında CUPS ve DNP DS620 yazıcı komutlarının doğrulanması.

### Faz 2: Çekirdek Proje İskeleti (MVP)
- [ ] Tauri v2 projesinin başlatılması.
- [ ] Karanlık mod (Dark mode) ekran düzeni ve UI bileşenlerinin oluşturulması.
- [ ] Klasör seçimi ve hızlı JPEG küçük resim (thumbnail) listeleme motoru.

### Faz 3: Görsel & Kadrajlama Katmanı
- [ ] EXIF Orientation okuma ve otomatik dikey/yatay yönlendirme.
- [ ] 6x8 canlı kırpma çerçevesi (sürükleme / klavye ile kadraj kaydırma).
- [ ] 1800x2400 piksel-kusursuz raster üretim pipeline'ı.

### Faz 4: CUPS Yazdırma ve Kısayol Entegrasyonu
- [ ] `lp` / CUPS komut köprüsü ile DNP DS620'ye doğrudan baskı gönderme.
- [ ] `Space` / `Enter` ile "Bas ve İlerle" kısayol döngüsü.
- [ ] Basılan fotoğrafların yeşil rozetle işaretlenmesi ve çift basım engelleme.

### Faz 5: Dağıtım & Paketleme
- [ ] GitHub Actions CI/CD workflow dosyalarının hazırlanması (.AppImage, .deb, .exe, .dmg).

## Bilinen Riskler ve Notlar
- Linux'ta DNP DS620'nin Gutenprint sürücüsü kurulu olmalıdır (CUPS yapılandırması kontrol edilmeli).
- SD karttan doğrudan okurken dosya I/O hızını korumak için büyük JPEG'lerin tam boyutunu değil, önizleme için gömülü EXIF küçük resimleri kullanılmalıdır.
