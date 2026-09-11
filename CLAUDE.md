# CullPrint — Claude için notlar

Bu dosya sadece Claude'un otomatik yüklediği, projeye özel kritik kurallar ve tuzaklar içindir. Genel mimari/ilerleme için `memory-bank/` (Claude + Gemini ortak, elle güncellenen) klasörüne bakın — orası araçtan bağımsız, burası Claude'a özel.

## Kesinlikle uyulması gereken kurallar

- **`media-thumb://` asla baskı raster'ında kullanılmaz.** `src/App.tsx`'teki `handlePrintAndNext`/`handleReprintJob` ve `src/utils/rasterizer.ts`'nin `imageUrl` parametresi her zaman `media://` (tam çözünürlüklü orijinal) kullanmalı. `media-thumb://` sadece `Filmstrip.tsx` (240px) ve `CropViewer.tsx` (1600px) önizlemeleri içindir — baskı kalitesini asla etkilememeli.
- **Yazıcıyı DNP DS620'ye özel hardcode etme.** Yazıcı desteği genelleştirildi (bkz. `SettingsModal.tsx`, `parseLpOptions`). DNP varsayılan/öncelikli davranış olarak korunur ama yeni kod herhangi bir CUPS yazıcısıyla çalışmalı.
- **`execute-print`/`cancel-print-job` her zaman `execFile` (argüman dizisi) kullanır, `exec` (shell string) değil** — shell injection riski. Sadece salt-okunur `lpstat`/`lpoptions`/`lsusb` çağrıları `exec` kalabilir.

## İş akışı

- Kod değişikliğinden sonra **her zaman** `npm run compile` (`tsc && vite build`) ile doğrula, hata yoksa commit at.
- Bu proje hem Claude hem **Gemini (Antigravity CLI / `agy`, MCP köprüsü üzerinden)** tarafından geliştiriliyor — `mcp__antigravity__use_antigravity` ile görev gönderilip `git diff` + derleme ile doğrulanıyor. Gemini'nin çıktısını asla kör kabul etme.
- Önemli bir mimari/özellik değişikliğinden sonra `memory-bank/aktifBaglam.md` ve `ilerleme.md`'yi güncelle (bu ikisi hem Claude hem Gemini tarafından güncel tutulmalı).
- Şu an gerçek bir DNP DS620 veya ikinci bir CUPS yazıcısı bağlı değil — fiziksel/uçtan uca baskı testi henüz yapılmadı, sadece derleme + kod incelemesiyle doğrulanabiliyor.

## Bilinen küçük eksik

- Ayarlar Modalı açıkken `Q` tuşuna basmak Kuyruk Çekmecesi'ni de açabiliyor (iki modal üst üste gelebilir). İşlevsel bir hata değil, düzeltilmedi.
