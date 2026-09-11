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
12. **Kararlılık ve Güvenlik Düzeltmeleri (7 Onaylı Hata Çözümü):**
    - **Fotoğraf Atlama Hatası:** `filterMode==='unprinted'` modunda basılan fotoğraf filtreden düştüğünde sonraki fotoğrafın atlanması sorunu `nextTargetPathRef` ve `useEffect` ile çözüldü.
    - **Tainted Canvas Riski:** `rasterizer.ts` içindeki gereksiz `img.crossOrigin = 'anonymous'` kaldırılarak `media://` şemasında güvenlik hatası riski bertaraf edildi.
    - **Sürükle-Bırak Çoklu Dosya Kaybı:** Chromium'daki async await sonrası `e.dataTransfer.files` erişim kaybı `Array.from()` kopyalaması ile giderildi.
    - **CUPS İş İptali Güvenilirliği:** Henüz CUPS ID almamış işlerin sahte dahili ID ile iptale gönderilmesi engellendi; `onCancelJob` `PrintJob` nesnesi alacak şekilde güncellendi.
    - **Kuyruk Arkası Klavye Kısayolları:** Çekmece açıkken arka plandaki fotoğrafın yön tuşları veya space ile etkilenmesi engellendi (yalnızca `Escape` ve `Q` aktif).
    - **Sürükle-Bırak Titremesi:** Çocuk elementler arası geçişte `handleDragLeave` titremesi `dragCounterRef` sayacı ile çözüldü.
    - **Güvenli Komut Çağrısı:** `execute-print` (`lp`) ve `cancel-print-job` (`cancel`) IPC işleyicileri `execAsync` yerine `execFileAsync` ve argüman dizisi kullanacak şekilde güncellendi.
13. **Thumbnail & Proxy Önbellek Boru Hattı (`media-thumb://`):**
    - Yüksek çözünürlüklü (20-45MB) ham JPEG dosyalarının filmstrip ve ana sahne geçişlerinde oluşturduğu gecikme (lag) çözüldü.
    - Electron dahili `nativeImage.createThumbnailFromPath` API'si ve disk önbelleği (`os.tmpdir()/cullprint-thumbs`) kullanılarak bağımlılıksız `media-thumb://` şeması eklendi.
    - `Filmstrip` 240px küçük resimler, `CropViewer` 1600px proxy önizleme için bu şemayı kullanırken, `App.tsx` içindeki baskı raster motoru (`generatePrintRaster`) orijinal tam çözünürlüklü `media://` şemasını korudu.
14. **Genel CUPS Yazıcı Yetenekleri & Ayarlar Modalı (SettingsModal):**
    - Hardcoded DNP DS620 bağımlılığı genelleştirildi; `lpoptions -p <printer> -l` çıktısı `parseLpOptions` ile yapısal `PrinterOption` ve `PrinterCapabilities` nesnelerine dönüştürüldü.
    - Medya boyutları dinamik çözümlenerek (`resolveMediaPixelSize`) rasterizer motoru hedef piksel boyutlarını seçilen medya boyutuna ve DPI'a göre otomatik hesaplayacak şekilde uyarlandı.
    - Yeni `SettingsModal` bileşeni ile kağıt boyutları, yüzey/kalite ve diğer CUPS seçenekleri yapılandırılabilir hale getirildi.
    - Ayarlar yazıcı bazında `localStorage` içine kaydedilirken, geriye dönük tam uyumluluk (DNP DS620 için 6x8 ve Parlak/Mat varsayılanları) korundu.
15. **Tasarım Sistemi & Görsel Yenileme (Design Tokens & Visual Re-skin):**
    - **Indigo Vurgu Skalası:** Koyu, Açık ve Nötr temalardaki `--accent-blue` ve `--border-focus` renkleri indigo tonlarına retune edildi; semantik durum renkleri korundu.
    - **Boşluk (Spacing), Yarıçap (Radius) ve Tipografi Skalası:** `--space-1` .. `--space-8`, `--radius-xl`, `--radius-full`, `--text-xs` .. `--text-xl` ile `--weight-normal/medium/semibold` tokenları tanımlandı ve ana yüzeylere uygulandı.
    - **Hareket (Motion) & Animasyonlar:** Buton basma geri bildirimi (`:active { transform: scale(0.97) }`), CropViewer fotoğraf geçiş kararması (`imgLoaded` + `.stage-photo.is-loading`), kuyruk çekmecesi yumuşak kayışı (`--duration-slow` + `--ease-standard`) ve baskı durumu bildirim animasyonu (`bannerEnter`) entegre edildi.
    - **SettingsModal Temizliği:** `SettingsModal.tsx` içindeki ~40 satır içi `style={{...}}` bloğu tamamen kaldırılarak `src/index.css` içindeki tokenlaştırılmış sınıflarla değiştirildi.

## Sonraki Adımlar
- Kullanıcının sahada / bilgisayarında uygulamayı test etmesi (`npm run dev` veya doğrudan AppImage ile).
