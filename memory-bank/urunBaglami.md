# Ürün Bağlamı

## Neden Bu Ürün Var?
Düğün fotoğrafçılığında en kritik anlardan biri, çekimler tamamlandıktan sonra fotoğrafların misafirlere veya aileye hızla basılı teslim edilmesidir. Bu süreçte:
1. Zaman çok kısıtlıdır; dakikalar içinde onlarca fotoğraf seçilip yazıcıya gönderilmelidir.
2. Hata toleransı sıfırdır; yanlış kağıt boyutu, yanlış yön (dikey fotoğrafın yatay kesilmesi) veya gelinin tacının/damadın başının kesilmesi kağıt, ribbon ve zaman israfına yol açar.
3. Mevcut yazılımlar ya sadece Windows'a hapsolmuştur ya da yüzlerce dolarlık gereksiz özelliklerle doludur.

## Hedef Kullanıcı
- Sahada bir foto yazıcı (öncelikli olarak DNP DS620, ama artık CUPS'a kayıtlı herhangi bir yazıcı) kullanan düğün ve etkinlik fotoğrafçıları.
- İşletim sistemi olarak Linux (ana geliştirme/kullanım ortamı), Windows veya macOS kullanan profesyoneller.

## Kullanıcı Deneyimi (UX) Hedefleri
- **Karanlık Mod (Dark Mode):** Düğün salonlarında ve loş ortamlarda gözü yormayan arayüz. Koyu/Açık/Nötr üç tema modu ve indigo vurgu renkli, token-tabanlı tutarlı bir tasarım sistemiyle destekleniyor.
- **Yıldırım Hızı (Culling & Printing):** Klasördeki fotoğrafların önbellekli küçük resimlerini (`media-thumb://`, 240px filmstrip / 1600px ana ekran proxy) saniyeler içinde dizme; büyük (20-45MB) orijinal dosyalarda bile geçişlerde takılma olmaması özellikle test edildi ve düzeltildi.
- **Klavyeden Ayrılmayan Eller:** Fare aramadan sadece `Space`, `Oklar`, `R` ve rakam tuşlarıyla tüm baskı operasyonunu yönetebilme. Kuyruk Çekmecesi veya Ayarlar Modalı açıkken bu kısayollar arka plandaki fotoğrafı yanlışlıkla etkilemeyecek şekilde kilitleniyor.
- **Güven Veren Önizleme:** 3:2 çekilmiş fotoğrafın seçili kağıt boyutuna (varsayılan 4:3 / 6x8) otururken neresinin kesileceğini net olarak gösterip, kafa kesilmelerini önleme.
- **Çift Baskı Koruması:** Basılan fotoğrafların belirgin yeşil rozetlerle işaretlenmesi, karışıklığı önler.
- **Esneklik:** Ayarlar Modalı ile fotoğrafçı, elindeki yazıcı ne olursa olsun (DS620 dışında bir model dahil) gerçek CUPS seçeneklerini görüp yapılandırabilir; DS620 kullanıcıları için varsayılan davranış (6x8, Parlak/Mat) hiç değişmedi.
