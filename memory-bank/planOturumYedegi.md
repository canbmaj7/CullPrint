# Plan: Oturum Yedeği ve Çökme Sonrası Kurtarma

> **Durum:** Yalnızca plan — henüz kodlanmadı (kullanıcıyla 2026-09-19'da konuşuldu, "ileride tekrar konuşuruz").
> Uygulamaya geçmeden önce aşağıdaki **açık sorular** kullanıcıyla netleştirilmeli.

## Neden
Uygulama bir çekim/etkinlik için açılır: fotoğraflar klasörden, tek tek seçilerek ya da sürükle-bırakla yüklenir,
kadrajlanır, basılır. İş bitince o çekimin kayıtlarını görmenin anlamı yoktur; yeni açılış temiz başlamalıdır.
Ama çekim **sürerken** uygulama kapanır ya da çökerse kaldığı yerden devam edebilmek gerekir:
hangi fotoğraflar açıktı, hangileri basıldı, hangi kadraj/döndürme ayarları yapılmıştı.

## Şu anki durum (2026-09-19 itibarıyla)
- Baskı kuyruğu/geçmişi **kalıcı değil**, her açılış temiz (`cullprint_queue` kaldırıldı).
- Geçici JPEG'ler (baskı raster'ları, küçük resimler) kapanışta ve açılışta siliniyor; tek örnek kilidi var.
- **Kalıcı kalanlar:** rulo sayacı (fiziksel rulo), yazıcı ayarları, tema, rulo kapasitesi, ve
  **"Basıldı" rozetleri** (`cullprint_printed_counts`, dosya yolu → baskı sayısı, localStorage).
  Rozet kaydı sınırsız büyür ve eski çekimlere ait yolları da tutar; oturum yedeği gelince oturum dosyasına taşınacak.

## Kavram: Oturum
- **Oturum = bir çekim.** İlk fotoğraflar yüklendiğinde başlar.
- Biter: kullanıcı "Yeni Çekim / Oturumu Bitir" dediğinde (öneri). Uygulamayı normal kapatmak oturumu
  bitirmez mi, bitirir mi → açık soru 1.
- Aynı anda tek oturum vardır.

## Saklanacaklar (fotoğrafların kendisi değil, yalnızca bilgiler)
`userData/sessions/current.json` (Linux: `~/.config/CullPrint/...`, Windows: `%APPDATA%\CullPrint\...`):

```jsonc
{
  "version": 1,
  "id": "2026-09-19T20-41-05",
  "createdAt": "...", "updatedAt": "...",
  "closedCleanly": false,              // normal kapanışta true; açılışta false ise çökme vardı
  "source": { "type": "folder" | "files", "folderPath": "...", "filePaths": ["..."] },
  "photos": [
    { "path": "...", "name": "DSCF1429.JPG", "size": 123, "mtimeMs": 0,   // dosya değişti/silindi mi kontrolü
      "userRotation": 0, "cropOffsetX": 0, "cropOffsetY": -40,
      "printCount": 2, "lastPrintedAt": "..." }
  ],
  "jobs": [                              // baskı günlüğü (tarih-saat, dosya, kopya, yüzey, kâğıt, yazıcı, sonuç)
    { "at": "...", "photoPath": "...", "copies": 1, "finish": "Glossy", "mediaSize": "w432h576",
      "printer": "...", "status": "completed" | "cancelled" | "failed" }
  ],
  "view": { "selectedPath": "...", "filterMode": "all" },
  "printerSettings": { "printer": "...", "mediaSize": "...", "finish": "..." }
}
```

## Yazma stratejisi (çökmeye dayanıklı)
- Ana süreçte yazılır (renderer IPC ile değişiklik bildirir), **debounce ~1 sn** + baskı gönderildiği an hemen.
- **Atomik yazma:** `current.json.tmp`'ye yaz → `fsync` → `rename`. Yarım yazılmış dosya asla okunmaz.
- Normal kapanışta (`will-quit`) son hâl yazılır ve `closedCleanly: true`.
- Renderer çökmesi (`render-process-gone`) ana süreçte yakalanıp son bilinen hâl korunur.

## Açılışta kurtarma akışı
1. `current.json` yoksa → temiz başla.
2. Varsa kullanıcıya sor: **"Son çekime devam et?"** — tarih/saat, klasör, fotoğraf sayısı, basılan sayısı,
   ve `closedCleanly=false` ise "Uygulama beklenmedik şekilde kapandı" notu. Seçenekler: **Devam Et** / **Yeni Çekim**.
3. Devam Et: fotoğraflar yollarından yeniden yüklenir; eksik/değişmiş dosyalar işaretlenir
   (ör. SD kart takılı değil → "12 fotoğraf bulunamadı, kartı takıp tekrar deneyin").
4. Kadraj, döndürme, basıldı sayıları ve seçili fotoğraf geri gelir. Kuyruk günlüğü "Geçmiş" sekmesinde görünür.
5. Çökme anında yazıcı kuyruğuna gönderilmiş işler: yazıcı sistemi zaten basmaya devam eder; bunlar günlükte
   "gönderildi" olarak durur (ayrıca CUPS/Windows kuyruğundan eşleştirilebilir — ileri adım).

## Oturumu bitirme
- "Yeni Çekim" düğmesi: onay ister, `current.json`'u arşive taşır ya da siler (açık soru 3), ekranı temizler.
- Global `cullprint_printed_counts` kaldırılır; "Basıldı" bilgisi yalnızca oturumda yaşar.

## Açık sorular (kullanıcıya sorulacak)
1. Uygulamayı **normal kapatmak** oturumu bitirsin mi, yoksa bir sonraki açılışta yine "devam et?" sorulsun mu?
   (Öneri: sorulsun — gün içinde bilgisayarı kapatıp açmak yaygın; kapatmak ≠ çekim bitti.)
2. Devam sorusu her açılışta mı, yalnızca çökmeden sonra mı? Otomatik devam seçeneği?
3. Biten oturumlar silinsin mi, son N tanesi arşivlensin mi? (Ör. fatura/sayım için "bu düğünde 142 baskı" özeti,
   CSV dışa aktarma.)
4. Kaynak SD kartsa: kart çıkarılınca oturum işe yaramaz. Fotoğrafları diske **kopyalama** seçeneği olsun mu?
   (Şu an kullanıcı fotoğrafların saklanmasını istemiyor → varsayılan: kopyalanmaz.)
5. Oturum sırasında başka klasör açmak: yeni oturum mu, mevcut oturuma ekleme mi?
6. Rulo sayacı global mi kalsın (öneri: evet, fiziksel rulo), yoksa oturuma mı bağlansın?

## Etkilenecek dosyalar (tahmini)
- `electron/main.ts` (veya yeni `electron/session.ts`): oturum dosyası okuma/yazma, IPC, `will-quit`.
- `electron/preload.ts`, `src/vite-env.d.ts`: `loadSession` / `saveSession` / `endSession` API'si.
- `src/App.tsx`: açılışta kurtarma diyaloğu, değişiklikleri bildirme, `cullprint_printed_counts` yerine oturum.
- Yeni bileşen: kurtarma diyaloğu ("Son çekime devam et?"); başlıkta "Yeni Çekim" düğmesi.
