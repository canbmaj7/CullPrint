# Proje Özeti

## Kapsam ve Amaç
Bu proje; düğün, mezuniyet ve etkinlik fotoğrafçılarının sahada (laptop başında) hızlı, hatasız ve pratik bir şekilde fotoğraf seçip doğrudan bağlı bir foto yazıcıya göndermesini sağlayan masaüstü uygulamasıdır.

Başlangıçta yalnızca **DNP DS620** termal süblimasyon (dye-sub) yazıcısına özel olarak tasarlanmıştı; artık CUPS'a kayıtlı **herhangi bir yazıcıyı** destekleyecek şekilde genelleştirildi (bkz. Ayarlar Modalı) — DS620 hâlâ öntanımlı/öncelikli yazıcı olarak özel muamele görüyor, ama artık tek desteklenen model değil.

Piyasadaki hantal, karmaşık veya pahalı yazılımların (Darkroom, DNP HFP vb.) aksine; sadece fotoğrafçının hızına ayak uyduracak hafiflikte, klavye odaklı ve çapraz platform (Linux, macOS, Windows) çalışan bir iş istasyonu olarak tasarlanmıştır.

## Temel Problem ve Çözüm
- **Problem:** Sahada yüzlerce fotoğraf arasından hızlıca seçim yapmak ve doğru yönlendirmeyle (yatay/dikey) kağıt ziyan etmeden seri baskı almak. Özellikle 3:2 kamera oranının 6x8 (4:3) kağıda basılırken kafaların/ayakların kesilmesi riski.
- **Çözüm:**
  - EXIF tabanlı otomatik dikey/yatay algılama.
  - Seçilen kağıt boyutuna göre canlı kırpma kılavuzu (varsayılan 6x8 / 15x20 cm, ama artık herhangi bir CUPS medya boyutu desteklenebiliyor).
  - Tek tuşla (`Space` / `Enter`) yazdırıp anında sonraki fotoğrafa geçme.
  - Çift baskıyı önleyen durum takipçisi (rozetler).
  - Ayarlar Modalı üzerinden yazıcıya özel kağıt boyutu, yüzey/kalite ve diğer CUPS seçeneklerinin gerçek zamanlı (lpoptions ile) sorgulanıp yapılandırılması.
  - Büyük (20-45MB) orijinal fotoğraflar için önbellekli küçük resim/proxy hattı (`media-thumb://`) sayesinde takılmasız gezinme; baskı anında yine tam çözünürlüklü orijinal kullanılıyor.

## Çıktı ve Dağıtım Hedefleri
- **Linux:** `.AppImage` (Bağımsız, kurulumsuz) ve `.deb` (Öncelikli geliştirme ve test ortamı).
- **Windows:** Taşınabilir (portable) `.exe` ve kurulum sihirbazı.
- **macOS:** `.dmg` (Apple Silicon & Intel).
- **Otomasyon:** GitHub Actions üzerinden bulutta otomatik çoklu platform derlemesi.
