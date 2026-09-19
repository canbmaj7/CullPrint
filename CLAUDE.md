# CullPrint — Claude için notlar

Bu dosya sadece Claude'un otomatik yüklediği, projeye özel kritik kurallar ve tuzaklar içindir. Genel mimari/ilerleme için `memory-bank/` (Claude + Gemini ortak, elle güncellenen) klasörüne bakın — orası araçtan bağımsız, burası Claude'a özel.

## Kesinlikle uyulması gereken kurallar

- **`media-thumb://` asla baskı raster'ında kullanılmaz.** `src/App.tsx`'teki `handlePrintAndNext`/`handleReprintJob` ve `src/utils/rasterizer.ts`'nin `imageUrl` parametresi her zaman `media://` (tam çözünürlüklü orijinal) kullanmalı. `media-thumb://` sadece `Filmstrip.tsx` (240px) ve `CropViewer.tsx` (1600px) önizlemeleri içindir — baskı kalitesini asla etkilememeli.
- **Yazıcıyı DNP DS620'ye özel hardcode etme.** Yazıcı desteği genelleştirildi (bkz. `SettingsModal.tsx`, `parseLpOptions`). DNP varsayılan/öncelikli davranış olarak korunur ama yeni kod herhangi bir CUPS yazıcısıyla çalışmalı.
- **`execute-print`/`cancel-print-job` her zaman `execFile` (argüman dizisi) kullanır, `exec` (shell string) değil** — shell injection riski. Sadece salt-okunur `lpstat`/`lpoptions`/`lsusb` çağrıları `exec` kalabilir.
- **Yazıcı kodu `electron/print/` altındadır** (`PrintBackend`: `cups.ts` Linux/macOS, `windows.ts` + `windows.ps1` Windows). `main.ts`'e yazıcı komutu ekleme; iki arka ucu da güncelle.
- **Windows arka ucu tek, kalıcı bir `powershell.exe` sürecidir.** Parametreler yalnızca base64 JSON olarak gider; `windows.ps1`'e ya da komut satırına kullanıcı verisi (yazıcı adı, dosya yolu) asla string olarak gömülmez. Kullanıcıya gösterilen metinler `windows.ts`'tedir, `.ps1` yalnızca `CP_*` kodu atar. `windows.ps1` UTF-8 **BOM** ile kaydedilir (PowerShell 5.1). PowerShell'i Linux'ta test etmek için taşınabilir `pwsh` scratchpad'e indirilebilir (sözdizimi + protokol; System.Printing yok).
- Windows medya değeri `w<pt>h<pt>|<RawKind>` biçimindedir (rasterizer boyutu okur, arka uç sürücü kâğıdını RawKind ile seçer).

## İş akışı

- Kod değişikliğinden sonra **her zaman** `npm run compile` (`tsc && vite build`) ile doğrula, hata yoksa commit at.
- Bu proje hem Claude hem **Gemini (Antigravity CLI / `agy`, MCP köprüsü üzerinden)** tarafından geliştiriliyor — `mcp__antigravity__use_antigravity` ile görev gönderilip `git diff` + derleme ile doğrulanıyor. Gemini'nin çıktısını asla kör kabul etme.
- Önemli bir mimari/özellik değişikliğinden sonra `memory-bank/aktifBaglam.md` ve `ilerleme.md`'yi güncelle (bu ikisi hem Claude hem Gemini tarafından güncel tutulmalı).
- Gerçek DNP DS620 ile fiziksel test 2026-09-19'da yapıldı (Gutenprint, `gutenprint53+usb://dnp-ds620/<SERİ>`). Kullanıcı `sys` grubunda: `lpadmin`/`cupsdisable`/`cupsenable` sudo'suz çalışır (`sudo` Claude Code içinde şifre soramaz).
- **Kâğıt harcamadan test (kuru baskı):** `cupsdisable -r "CullPrint kuru test" <yazıcı>` → uygulamadan bas → `/tmp/cullprint-spool/` içindeki son JPEG'i incele → işleri `cancel` ile sil. **`cupsenable`'dan önce mutlaka `lpstat -o` ile kuyruğun boş olduğunu doğrula** — bekleyen iş anında basılır.
- Yazıcı değişirse CUPS kuyruğu eski seri numarasını arar ("No matching printers found!"); `lpadmin -p <yazıcı> -v gutenprint53+usb://dnp-ds620/<YENİ_SERİ>` (seri: `lsusb -v -d 1452:` → iSerial).

## Bilinen küçük eksik

- (Düzeltildi 2026-09-19) Ayarlar Modalı açıkken `Q` artık Kuyruk Çekmecesini açmıyor.
