# Proje Özeti

## Kapsam ve Amaç
Bu proje; düğün, mezuniyet ve etkinlik fotoğrafçılarının sahada (laptop başında) hızlı, hatasız ve pratik bir şekilde fotoğraf seçip doğrudan **DNP DS620** termal süblimasyon (dye-sub) yazıcısına göndermesini sağlayan masaüstü uygulamasıdır.

Piyasadaki hantal, karmaşık veya pahalı yazılımların (Darkroom, DNP HFP vb.) aksine; sadece fotoğrafçının hızına ayak uyduracak hafiflikte, klavye odaklı ve çapraz platform (Linux, macOS, Windows) çalışan bir iş istasyonu olarak tasarlanmıştır.

## Temel Problem ve Çözüm
- **Problem:** Sahada yüzlerce fotoğraf arasından hızlıca seçim yapmak ve doğru yönlendirmeyle (yatay/dikey) kağıt ziyan etmeden seri baskı almak. Özellikle 3:2 kamera oranının 6x8 (4:3) kağıda basılırken kafaların/ayakların kesilmesi riski.
- **Çözüm:**
  - EXIF tabanlı otomatik dikey/yatay algılama.
  - 6x8 (15x20 cm) canlı kırpma kılavuzu (canlı kadraj önizleme ve anında düzeltme).
  - Tek tuşla (`Space` / `Enter`) yazdırıp anında sonraki fotoğrafa geçme.
  - Çift baskıyı önleyen durum takipçisi (rozetler).
  - DNP DS620 yazıcı ayarları kontrolü (Kağıt boyutu, Parlak/Mat yüzey, kopya sayısı).

## Çıktı ve Dağıtım Hedefleri
- **Linux:** `.AppImage` (Bağımsız, kurulumsuz) ve `.deb` (Öncelikli geliştirme ve test ortamı).
- **Windows:** Taşınabilir (portable) `.exe` ve kurulum sihirbazı.
- **macOS:** `.dmg` (Apple Silicon & Intel).
- **Otomasyon:** GitHub Actions üzerinden bulutta otomatik çoklu platform derlemesi.
