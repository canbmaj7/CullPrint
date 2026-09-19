# CullPrint 🖨️

> **Fast Photo Culling & Direct Print Station for DNP DS620**  
> Düğün ve etkinlik fotoğrafçıları için sahada tek tuşla, sıfır hatayla seri fotoğraf baskı istasyonu.

---

## 🎯 Çözülen Problem
Düğün ve etkinliklerde makineden çıkan 3:2 oranındaki fotoğrafların **6x8 inç (15x20 cm, 4:3 oran)** kağıda basılırken gelinin duvağının veya damadın kafasının kesilmesini önlemek, EXIF verisiyle yönü (yatay/dikey) otomatik anlamak ve fare aramadan klavyeden `Space` ile seri baskı almak.

## 🚀 Temel Özellikler
- **Otomatik Yön Algılama:** EXIF sensör verisiyle fotoğrafın dikey mi yatay mı olduğunu anında algılar.
- **6x8 Akıllı Kırpma Kılavuzu:** Kağıt dışına taşan alanları şeffaf maske ile gösterir; `Yukarı/Aşağı` veya `Sağ/Sol` ok tuşlarıyla kadrajı kaydırıp kafaları kurtarabilirsiniz.
- **Tek Tuşla Baskı (`Space` / `Enter`):** Fotoğrafı CUPS üzerinden doğrudan DNP DS620'ye gönderir, üzerine "✓ Basıldı" damgası vurur ve beklemeden sonraki fotoğrafa geçer.
- **Piksel-Kusursuz (Pixel-Perfect) 300 DPI:** Yazıcıya göndermeden önce tam 1800x2400 (veya 2400x1800) piksel raster üretir; yazıcı sürücüsünün kafasına göre kırpmasını engeller.
- **Çoklu Platform:** Linux (.AppImage, .deb), macOS (.dmg) ve Windows (.exe).
- **Profesyonel Tasarım:** Capture One / Leica stüdyo tarzı sade karanlık mod.

## ⌨️ Klavye Kısayolları

| Kısayol | İşlev |
| :--- | :--- |
| **`Space`** veya **`Enter`** | **Yazdır** (aynı fotoğrafta kalır) |
| **`←` / `→`** | Önceki / Sonraki Fotoğraf |
| **`↑` / `↓`** | Dikey Kadrajı Kaydır (Kafayı / Duvağı Kurtar) |
| **`R`** | 90° Saat Yönünde Döndür |
| **`C`** | Kadrajı Merkeze Sıfırla |
| **`1` - `9`** | Kopya Adedini Belirle |

## 🛠️ Çalıştırma (Development)

```bash
# Bağımlılıkları yükleyin
npm install

# Geliştirme modunda başlatın
npm run dev

# Linux paketini (.AppImage) derleyin
npm run build:linux
```
