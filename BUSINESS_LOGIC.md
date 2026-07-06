# Stok / Tüketim / Tedarik — İş Mantığı Notları

Bu dosya Gökhan'ın anlattığı iş kurallarının ham notudur. Şema ve kod bu kurallara göre kurulur, test edilirken buraya bakılır. Kural değişirse burası da güncellenir.

## 1. Kişi sayısı (party size)

- Sipariş açılırken garson kişi sayısını girmeden sipariş başlatamaz — zorunlu alan.
- Kişi sayısı **değişken**: yanında +/- butonu olacak, masaya sonradan gelen/ayrılan olursa güncellenir.
- Günlük toplam müşteri sayısı ayrı bir yerde tutulmaz — o günün siparişlerindeki kişi sayılarının toplamından hesaplanır (tek kaynak kuralı).

## 2. Sarf malzemesi tüketimi (kürdan, tuvalet kağıdı, peçete vb.)

- Bu malzemeler reçeteye bağlı değil, **müşteri sayısına bağlı** düşer.
- Sabit yüzde tolerans (et/fire'daki gibi) **kullanılmayacak** — çünkü o zaman diğer malzemelerden farkı kalmaz.
- Bunun yerine sistem geçmiş veriden **"kullanım ihtimali" (beklenen tüketim)** çıkarır, gerçek kullanımla farkını gösterir. Fark hem adet hem TL karşılığı olarak gösterilecek.
- Örnek uyarı senaryosu: geçen hafta 100 müşteri girdi, 100 kürdan kullanıldı. Bu hafta 150 müşteri girdi ama 300 kürdan kullanıldı — bu anormal, işaretlenmeli.

## 3. Yemek malzemesi tüketimi ve öğrenme

- Sistem satın alma ile çıkan yemek arasındaki ilişkiyi de öğrenecek: "10 kg et alındı, bu kadar yemek çıktı" gibi verim oranlarını zamanla çıkarır.
- Bu, hem fire tespitinde hem talep tahmininde kullanılacak.

## 4. Günlük hazırlık raporu (her akşam)

- Her akşam **yarının hazırlık raporu** üretilir.
- Geçmiş haftaların **aynı günleri** kıyaslanır (orantı/trend), o günün satış ihtimali çıkarılır.
- Diğer etkenler de değerlendirilir: resmi tatil, mevsimsellik vb.
- Amaç: "yarın ne eksik olacak, ne kadar lazım" sorusuna cevap.
- Bu rapor canlı hesaplanır (ayrı, bayatlayabilecek bir tabloya yazılmaz) — kaynak veri: siparişler, stok hareketleri, geçmiş satın almalar.

## 5. Tedarikçi / sipariş sıklığı mantığı (ÖNEMLİ — yanlış anlaşılmıştı, düzeltildi)

- Her tedarikçinin kendine ait **teslimat sıklığı** var: bazısı günlük (örn. manav), bazısı haftalık (örn. Cola grubu).
- Bu sıklık sisteme **tedarikçi bazında** girilecek.
- Hangi malzeme hangi tedarikçiden geliyor, sistem bilecek (malzeme ↔ tedarikçi eşlemesi).
- Sipariş miktarı hesaplanırken: **tek bir yemeğin kaç tabak satılacağına göre değil**, o malzemeyi kullanan **tüm yemeklerin toplam beklenen satışına göre** malzeme ihtiyacı toplanır.
  - Yanlış yaklaşım: "200 tabak yemek satılıyor, her yemekten 200 tabak çıkacakmış gibi sipariş ver."
  - Doğru yaklaşım: malzeme bazında düşün — bir malzeme kaç farklı yemekte kullanılıyorsa, o yemeklerin hepsinin beklenen satışı toplanıp o malzemenin toplam ihtiyacı çıkarılır.
- Sipariş tedarikçinin sıklığına göre zamanlanır (günlük tedarikçiye günlük öneri, haftalık tedarikçiye haftalık öneri).

## 6. Fatura / stok girişi — üç yol

1. **Manuel** — elle giriş, her zaman var olacak.
2. **E-fatura** — restoranın aldığı fatura otomatik okunup stoğa toplu işlenir. Öncelik: güçlü yol (entegratör API), ama başlangıçta GİB'in ücretsiz/kısıtlı portalı da denenecek. **İkisinin altyapısı da kurulacak**, restoran hangisini kullanacağına sonra karar verir.
3. **AI foto** — öncelik sırası: (a) fatura/fiş fotoğrafı okuma (OCR, güvenilir, önce bu), (b) raf/ürün sayımı (görsel sayım, deneysel, sonra).

## 7. Anormallik / sapma gösterimi

- Şimdilik **Raporlar** sayfasında gösterilecek (yerleşim sonra netleşir).
- Her anormal durum görünür olacak.
- Fiyat (TL) karşılığı da gösterilecek — sadece adet değil.

## 8. Güvenlik notu

- E-fatura entegratör API anahtarı gibi gerçek secret'lar bu aşamada toplanmayacak/yazılmayacak. Sadece altyapı (bağlantı tipi, durum alanı) hazırlanacak; gerçek anahtar girişi ayrı, güvenli bir adımda yapılacak.

## 9. Masaüstü ekran / müşteri menüsü + reklam (ileri fikir, henüz kapsamda değil)

- Masalara konan ekran (tablet/kiosk benzeri) üzerinden müşteriye menü gösterilecek.
- Aynı ekran **reklam alanı** olarak da kullanılabilir — tedarikçi/marka reklamı gösterip gelir kapısı olabilir (Katman 4 — müşteri katmanı ile ilişkili).
- Şu an QR menü (`/m/[slug]`) var; bu, onun masaüstü/donanımlı bir sonraki adımı olarak düşünülüyor. MVP kapsamına alınmadı, sadece not.

## 10. Ürün performansı / ödül sistemi (ileri fikir, henüz kapsamda değil)

- Menü sayfasındaki ürün bazlı satış/kârlılık verisi ileride bir **ödül sistemiyle** bağlanabilir: garson/şef/barmen için ürün satış hedefleri (ör. "bu ayki Tiramisu hedefi X adet") tanımlanıp performansa göre teşvik verilebilir.
- Şimdilik ödül mekanizması kurulmadı — sadece ürün bazlı satış verisinin bu amaçla kullanılabileceği not edildi.
