# Aktif Bağlam

## Mevcut Odak
**CullPrint** MVP sürümü başarıyla kodlandı, derlendi ve Linux AppImage paketi üretildi.

## Tamamlanan Geliştirme Adımları
1. **İsim:** `CullPrint` (*Fast Photo Culling & Direct Print for DNP DS620*) olarak belirlendi.
2. **Mimari & Proje Kurulumu:**
   - Electron v34 + Vite + React 19 + TypeScript + Vanilla CSS karanlık tema mimarisi kuruldu.
   - `cullprint-media://` güvenli yerel dosya ve SD kart protokolü tanımlandı.
3. **CUPS Yazdırma Köprüsü:**
   - `lpstat -p -d` ile `Dai_Nippon_Printing_DP-DS620` otomatik tespit edildi.
   - `w432h576` (6x8 inç / 15x20 cm) ve `Glossy/Matte` seçenekleri doğrudan CUPS komut kuyruğuna bağlandı.
4. **Fotoğraf & EXIF Motoru:**
   - `exifr` kütüphanesi ile JPEG EXIF `Orientation` etiketi ve boyutlar okunup otomatik dikey/yatay yönlendirme sağlandı.
5. **6x8 Canlı Kadraj & Akıllı Kırpıcı:**
   - 3:2 sensör oranını 4:3 (6x8) kağıda göre gösteren şeffaf kadrajlama arayüzü yazıldı.
   - Klavye yön tuşları (`Yukarı`/`Aşağı` veya `Sağ`/`Sol`) ve fareyle sürükleme ile kadraj ofseti ayarlama (gelin tacı / damat kafası kesilmesini önleme) eklendi.
   - 90° çevirme (`R`) ve kadraj sıfırlama (`C`) eklendi.
   - Yazdırma öncesinde tam **1800 x 2400 piksel @ 300 DPI** piksel-kusursuz raster üretim motoru (`src/utils/rasterizer.ts`) yazıldı.
6. **Klavye Odaklı Seri İş Akışı:**
   - `Space` / `Enter` ile fotoğrafı yazıcıya gönderip, "✓ BASILDI" damgası vurup anında bir sonraki fotoğrafa geçme akışı sağlandı.
   - Rakam tuşları (`1-9`) ile anında kopya adedi belirleme entegre edildi.
7. **Tasarım & Çoklu Tema:**
   - 3 Farklı Tema Modu: **Koyu Stüdyo** (varsayılan), **Açık Stüdyo** (Lightroom tarzı) ve **%18 Nötr Gri** (renk doğruluğu modu).
   - Kullanıcı tercihi `localStorage` içine kaydedilir.
8. **Esnek Fotoğraf Alma (Drag & Drop + Tekil Seçim):**
   - Klasör zorunluluğu kaldırıldı: Masaüstünden veya dosya yöneticisinden fotoğraf sürükleyip bırakma (Drag & Drop) ve "Fotoğraf Ekle" butonu eklendi.
9. **Gerçek USB Donanım Takibi:**
   - CUPS kuyruk durumu ("idle") ile fiziksel USB bağlantısı ayrıştırıldı (`lsusb` kontrolü). Kablo takılı olmadığında panelde açıkça `⚠️ USB Kablosu Takılı Değil` uyarısı verilir ve kablo takıldığı an canlı olarak yeşile döner.
10. **Dağıtım ve CI/CD:**
   - `.github/workflows/release.yml` ile Linux, Windows ve macOS için bulut derleme pipeline'ı kuruldu.
   - Yerel Linux `CullPrint-1.0.0.AppImage` paketi başarıyla derlendi ve test edildi.
11. **Baskı Kuyruğu & Geçmişi Çekmecesi (Queue Drawer):**
   - `Q` tuşu veya üst bar rozeti `[ 📋 Kuyruk (n) ]` ile sağdan açılan şık slide-over panel.
   - CUPS kuyruğu ile arka plan senkronizasyonu (`lpstat -o`) ve anında iş iptali (`cancel <job_id>`).
   - Tek tıkla "⟲ Tekrar Bas (Reprint)" akışı: Önceki kadraj ve yüzey ayarlarını koruyarak anında ek baskı gönderme.
   - DNP DS620 6x8 rulo kağıt tüketim göstergesi (`X / 200 baskı`) ve yeni rulo sıfırlama sayacı.

## Sonraki Adımlar
- Kullanıcının sahada / bilgisayarında uygulamayı test etmesi (`npm run dev` veya doğrudan AppImage ile).
