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

16. **İlk Fiziksel DNP DS620 Testi (2026-09-19) ve Sahada Bulunan Düzeltmeler:**
    - Dikey, yatay (sürücü otomatik döndürüyor), 90° elle döndürme, 2 kopya ve uygulamadan iptal gerçek yazıcıda doğrulandı. Yazıcıya giden dosya 1800x2400 ve orijinalden üretiliyor (küçük resimle keskinlik karşılaştırması yapıldı).
    - **Linux küçük resim hatası:** `nativeImage.createThumbnailFromPath` yalnızca macOS/Windows'ta var; Linux'ta `media-thumb://` her istekte 500 dönüyordu. Artık `sharp` (libvips) ile EXIF yönü uygulanarak 240/1600px üretilip diske önbellekleniyor; eşzamanlı istekler tek üretimi paylaşıyor. `sharp` yüklenemezse yerel API'ye, o da yoksa orijinale düşülür. `sharp` Vite'ta `external`, electron-builder'da `asarUnpack`.
    - **Akıcı geçiş:** `App.tsx` seçili fotoğrafın komşularının (+1, -1, +2) 1600px önizlemesini önden yüklüyor.
    - **CropViewer yarış durumu:** Önbellekten anında gelen görselde `onLoad`, sıfırlama efektinden önce tetiklenip görseli `opacity:0`'da bırakıyordu; yüklenme durumu artık `loadedPath === photo.path` ile hesaplanıyor.
    - **Yazıcı durumu ayrıştırma:** `lpstat -p` baskı sırasında `now printing`, duraklatılınca `disabled` yazıyor; eski regex bunları tanımadığı için yazıcı listeden düşüp "Yazıcı bulunamadı" görünüyordu. `lpstat` artık `LC_ALL=C` ile çalışıyor.
    - **Kuyruk Duraklat / Devam Ettir butonu:** Yazıcı kartında; `set-printer-enabled` IPC → `cupsdisable`/`cupsenable` (`execFile`). Duraklatılınca işler kâğıda çıkmadan CUPS'ta bekler (kâğıt harcamadan kuru test için). Kullanıcının CUPS yönetici grubunda (`sys`/`lpadmin`) olması gerekir.
    - Açık temada görünmeyen sabit `#fff` metinler `--text-primary`'ye çevrildi.
    - **Ortam notu:** Bu makinedeki CUPS kuyruğu başka bir DS620'nin seri numarasıyla kurulmuştu (`No matching printers found!`); `lpadmin -v gutenprint53+usb://dnp-ds620/<SERİ>` ile düzeltildi. Yazıcı değiştirilince aynı hata beklenmeli.

17. **Sürüm Öncesi Düzeltme Turu (2026-09-19, ikinci tur):**
    - **Döndürülmüş önizleme:** 90/270°'de önizleme baskıyla uyuşmuyordu (kutu dolmuyor, şerit görünüyordu). `.aspect-box` artık container query ile alandan boyutlanır, `<img>` en/boyu değiştirilmiş çizilip döndürülür; kadraj ofsetleri rasterizer'ın döndürmesinin tersiyle `object-position`'a eşlenir. Kuru baskıyla doğrulandı.
    - **Yazıcı/iş hataları arayüzde:** `get-printers` `lpstat -l -p` ile durum mesajı + `printer-state-reasons` okur (Türkçe açıklama, hata ile durma ↔ kullanıcı duraklatması ayrımı `pausedByUser`); `get-cups-queue` `lpstat -l -o` ile iş `Status`/`Alerts` okur (`resources-are-not-ready`). Kenar çubuğu: takılı iş / hata ile durma kırmızı; CUPS'un sonraki başarılı işe kadar sakladığı eski mesaj turuncu "Son baskı denemesinde". Yanlış seri numaralı URI ile gerçek hata üretilerek doğrulandı.
    - **Kalıcı "Basıldı":** `localStorage['cullprint_printed_counts']` (dosya yolu → kopya); klasör açılınca geri yüklenir. İptal edilen iş rozetten ve rulo sayacından düşülür.
    - **Klavye kadraj:** Yukarı/Aşağı fotoğrafın kırpılan ekseninde kaydırır (`src/utils/crop.ts` `getCropAxis`, önizleme + rasterizer ile aynı kural).
    - **Geçici dosyalar:** Küçük resim önbelleği `~/.cache/cullprint/thumbs` (1 GB sınır, açılışta temizlik); spool'da son 20 dosya tutulur.
    - **Gerçek kalan baskı:** Gutenprint'in CUPS'a yazdığı `marker-message` ('147 native prints remaining…') ve `marker-levels` `lpoptions -p` ile okunur (`readPrinterSupply`); kenar çubuğunda gösterilir ve varsa kuyruk çekmecesindeki elle rulo sayacının yerine geçer. Değer son baskı anına aittir.
    - **Dışarıdan iptal edilen işler:** Kuyruktan çıkan iş `get-job-state` IPC'si ile `ipptool -tv ipp://localhost/jobs/<n> get-job-attributes.test` üzerinden sorgulanır (`completed`/`canceled`/`aborted`); iptal edilen iş rozetten ve sayaçtan düşülür. `ipptool` yoksa "tamamlandı" sayılır.
    - PNG/WebP boyut/yön `sharp().metadata()` ile okunur; Ayarlar açıkken `Q` devre dışı.
    - **AppImage testi:** `sharp` paketlenmiş sürümde `app.asar.unpacked` içinden yükleniyor ve küçük resim üretiyor (doğrulandı).
    - **Geliştirme ortamı notu:** `electron/main.ts` değişince vite-plugin-electron'un otomatik yeniden başlatması Linux'ta GPU hatasıyla takılabiliyor; uygulamayı elle yeniden başlat. Preload değişikliği sayfayı yeniden yükler.
    - **Yazdırma arka uçları (2026-09-19):** Yazıcı kodu `electron/print/` altında. `types.ts` içindeki `PrintBackend` arayüzü; `cups.ts` (Linux/macOS), `windows.ts` + `windows.ps1` (Windows), `index.ts` (`process.platform`'a göre seçim). `main.ts`'teki IPC handler'ları yalnızca `printBackend`'e devrediyor; renderer ve IPC kanal adları değişmedi.
    - **Windows arka ucu (2026-09-19, gerçek donanımda henüz test edilmedi):** Tek kalıcı `powershell.exe` (`windowsHide`), satır başına bir çağrı, parametreler base64 JSON, yanıt `<<CP:id>>` + JSON; 20 sn (baskıda 120 sn) zaman aşımında süreç yeniden başlatılır, uygulama kapanınca sonlandırılır. Durum/kuyruk/iptal/duraklatma `System.Printing`; baskı `System.Drawing.PrintDocument` (raster sayfayı kenarsız kaplar, yatay raster için sayfa yatay). Kâğıt: `PrinterSettings.PaperSizes`, değer `w<pt>h<pt>|RawKind`; varsayılan `w432h576` aynı boyuttaki tek parçalı kâğıda eşlenir (`(4x6)x2` gibi bölünmüş kâğıt seçilmez). Yüzey (parlak/mat): sürücünün PrintCapabilities özelliği bulunur, PrintTicket'a yazılır, `PrintTicketConverter` ile DEVMODE'a çevrilip uygulanır. İş kimliği CUPS biçiminde `<yazıcı>-<no>` (belge adıyla bulunur). Kalan baskı sayısı yok. Duraklatma yönetici izni isteyebilir. Tanı: `scripts/windows-tani.ps1`.
    - **Baskıdan sonra ilerleme kaldırıldı (2026-09-19, kullanıcı isteği):** `Space`/`Enter` ve buton (`handlePrint`, eski adı `handlePrintAndNext`) yalnızca basar, aynı fotoğrafta kalır. Tek istisna "Basılmayan" filtresi: basılan fotoğraf listeden çıktığı için komşusu seçilir.
    - **EXIF yön hatası düzeltildi (2026-09-19):** `exifr.parse` `Orientation`'ı metne çeviriyordu ('Rotate 270 CW'), dikey çekimler yatay algılanıyordu; artık `exifr.orientation()` kullanılıyor.
    - **Genelleştirme turu (2026-09-19):** Arayüzden DS620 adları kaldırıldı (başlık "CullPrint", üst çubuk "Seç · Kadrajla · Bas", genel rulo sayacı), README'de "DS620 ile test edildi". Kadraj çerçevesi/ekseni/raster seçili kâğıdın oranını kullanıyor (`src/utils/crop.ts`, `media.ts`); eskiden önizleme 4:3 sabitti, 4x6 vb. seçilince önizleme ≠ baskı oluyordu. Rulo kapasitesi kâğıt boyutu başına düzenlenebilir (varsayılan 6x8 → 200, 4x6 → 400). Uygulama ikonu `build/icon.svg` (`scripts/make-icons.sh` ile `build/icon.png` + `public/icon.png`).
    - **Donmayan baskı (2026-09-19):** Raster ana süreçte sharp ile (`electron/raster.ts`; EXIF + kullanıcı döndürmesi → ortak kırpma → lanczos3 → JPEG q96 4:4:4), canvas yalnızca yedek. İşler `enqueuePrint` ile sırayla arka planda; Space tekrarı (`e.repeat`) ve hazırlanan fotoğrafın tekrar gönderimi engellenir. Seçim, liste değişince görüntülenen fotoğrafta kalır (`viewedPathRef`).

## Sonraki Adımlar
- Sahada gerçek bir düğünde uzun seri baskı testi (yüzlerce fotoğraf, rulo bitişi, ribbon bitişi).
- Sürüm öncesi bilinen açık hata kalmadı; sıradaki adım yeni özellikler.
- **Windows desteği:** Arka uç yazıldı; kullanıcının Windows makinesinde gerçek DS620 + DNP sürücüsüyle test edilecek (yazıcı algılama, USB, kâğıt listesi, parlak/mat, kenarsız baskı ölçeği, kopya, iptal, duraklatma). Yüzey özelliği sürücüde bulunamazsa yedek plan: iki ayrı Windows yazıcı örneği (Parlak/Mat).
