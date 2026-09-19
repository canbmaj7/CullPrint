# CullPrint

<img src="build/icon.png" alt="CullPrint ikonu" width="96" align="right" />

> **Hızlı fotoğraf seçme ve doğrudan baskı istasyonu**
> Düğün ve etkinlik fotoğrafçıları için sahada klavyeden, tek tuşla, seri fotoğraf baskısı.

**Test edilen yazıcı:** DNP DS620 (Linux'ta CUPS + Gutenprint ile fiziksel olarak test edildi). Uygulama yazıcıya özel değildir: Linux/macOS'ta herhangi bir CUPS yazıcısıyla, Windows'ta herhangi bir Windows yazıcısıyla çalışır; kâğıt boyutu ve yüzey (parlak/mat) seçenekleri yazıcı sürücüsünden okunur. DNP yazıcılar bulunduğunda varsayılan olarak seçilir. Windows desteği yenidir ve henüz gerçek yazıcıyla doğrulanmamıştır.

---

## Çözülen problem
Makineden çıkan 3:2 oranındaki fotoğrafları farklı oranlı foto kâğıtlarına (ör. 6x8 inç / 15x20 cm, 4:3) basarken gelinin duvağının ya da damadın kafasının kesilmesini önlemek, EXIF verisiyle yönü (yatay/dikey) otomatik anlamak ve fare aramadan `Space` ile seri baskı almak.

## Temel özellikler
- **Otomatik yön algılama:** EXIF verisiyle fotoğrafın dikey mi yatay mı olduğunu anında algılar.
- **Akıllı kırpma kılavuzu:** Seçili kâğıdın oranına göre kâğıt dışında kalan alanı şeffaf maskeyle gösterir; ok tuşları ya da fareyle kadrajı kaydırıp kafaları kurtarabilirsiniz. Ekranda görülen, basılanla birebir aynıdır.
- **Tek tuşla baskı (`Space` / `Enter`):** Fotoğrafı yazıcı kuyruğuna gönderir ve "✓ Basıldı" damgası vurur. Baskı arka planda hazırlanır; beklemeden başka fotoğrafa geçip basmaya devam edebilirsiniz.
- **Piksel-kusursuz 300 DPI:** Seçili kâğıt boyutunda tam piksel ölçüsünde raster üretir (ör. 6x8 için 1800x2400); yazıcı sürücüsünün kendi kafasına göre kırpmasını engeller.
- **Kuyruk ve rulo takibi:** Baskı kuyruğu, iptal, tekrar basma; yazıcı bildiriyorsa kalan baskı sayısı, bildirmiyorsa elle rulo sayacı.
- **Çoklu platform:** Linux (.AppImage), macOS (.dmg) ve Windows (.exe).

## Klavye kısayolları

| Kısayol | İşlev |
| :--- | :--- |
| **`Space`** veya **`Enter`** | **Yazdır** (aynı fotoğrafta kalır) |
| **`←` / `→`** | Önceki / Sonraki Fotoğraf |
| **`↑` / `↓`** | Kadrajı Kaydır (Kafayı / Duvağı Kurtar) |
| **`R`** | 90° Saat Yönünde Döndür |
| **`C`** | Kadrajı Merkeze Sıfırla |
| **`1` - `9`** | Kopya Adedini Belirle |
| **`Q`** | Baskı Kuyruğu |

## Çalıştırma (geliştirme)

```bash
# Bağımlılıkları yükleyin
npm install

# Geliştirme modunda başlatın
npm run dev

# Linux paketini (.AppImage) derleyin
npm run build:linux
```

Uygulama ikonu `build/icon.svg` dosyasıdır; PNG'leri yeniden üretmek için `scripts/make-icons.sh`.
