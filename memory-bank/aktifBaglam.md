# Aktif Bağlam

## Mevcut Odak
Uygulamanın gereksinimleri, kullanıcı senaryoları, ekran tasarımı ve dağıtım mimarisi üzerinde mutabık kalındı. Şu anki aşama:
1. Uygulama ismi belirleme.
2. İlk geliştirme fazı için teknik hazırlık ve gereksinimlerin netleşmesi.

## Alınan Temel Kararlar
1. **Kod Yazılmadı:** Planlama modundayız; tüm mimari ve UX detayları `memory-bank` içine kalıcı olarak işlendi.
2. **Öncelikli Test Ortamı:** Geliştirme ve ilk testler doğrudan kullanıcının **Linux** makinesinde yapılacak.
3. **Kağıt Formatı & Oran:** Ana format **6x8 inç (15x20 cm)**. 3:2 kamera en-boy oranının 4:3 kağıda basılırken kafa/ayak kesilmesini önlemek için "Canlı Kırpma Kılavuzu" eklenecek.
4. **Hızlı İş Akışı:** Tek laptop üzerinden klavye kısayollarıyla (`Space` = Yazdır & İlerle) seri yazdırma.
5. **Dağıtım:** Tauri tabanlı tek kod tabanı ve GitHub Actions ile Linux (.AppImage, .deb), Windows (.exe) ve macOS (.dmg) otomatik derleme.

## Sonraki Adımlar
1. Uygulama ismine karar vermek.
2. Linux ortamında CUPS ve DNP DS620 yazıcı bağlantısının doğrulanması (`lpstat` vb.).
3. Tauri / Frontend proje iskeletinin oluşturulması için onay alınması.
