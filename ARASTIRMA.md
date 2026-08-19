# Özellik araştırması — 16 Ağustos 2026

Bakılan yerler: global büyükler (OpenTable, Resy, SevenRooms, Tock, Eat App, Olo Host), Avrupa yerelleri (CoverManager, Zenchef, aleno, Superb, DinnerBooking, Tablein, resOS, Tableo, Guestplan, Formitable, Teburio, resmio), Asya-Pasifik (TableCheck, Toreta, ebica, Restaurant Board, Air Wait, GATE, Catch Table, Tabling, Now Book It), diğer bölgeler (Meitre-Arjantin, Ontopo/Tabit-İsrail, Restoplace/LeClick-Rusya, Dineplan-Güney Afrika, GetIn-Brezilya, Fourvenues-İspanya, Clubtech/TablelistPro/Mr.Black-gece kulübü, Vemos/IDScan-ABD kapı katmanı, EazyDiner-Hindistan, 美味不用等-Çin), Türkiye pazarı (Rezervem, Reztoran, Simpra, Adisyo, adisyon.ai, FendyChat, RoxPos, UpMekan, Flyby, Quandoo TR), istatistik-analitik katmanı (Tenzo, distil.ai, Avero, Bloom, Restaurant365), yapay zekâ tarafı (Slang.ai, Hostie, Loman, BistroChat, Sira, Tablz, Blackbird) ve komşu sektörler (otel PMS/gelir yönetimi, güzellik-spa, havayolu, konser bileti, hastane randevu).

Kaynak olarak ürün sayfaları, yardım merkezleri, sürüm notları, App Store açıklamaları, G2/Capterra/Şikayetvar yorumları ve resmî mevzuat metinleri kullanıldı. Doğrulanamayan her iddia metin içinde açıkça **"doğrulanmadı"** ya da **"(sektör iddiası — bağımsız ölçüm yok)"** diye işaretlendi.

## Ana sonuç — üç cümle

**Boşluk üç yerde:** (1) **zamanı yönetmek** (gün boyu doluluk çizelgesi, gerçek oturma süresi, boş kalan masa-saat), (2) **eğlence mekânının kendi ekonomisi** (minimum harcama, masa paketi, PR, biletli gece, kapı — Türkiye'de bu yazılım kategorisi boş), (3) **biriken veriyi ekrana çıkarmak** (kapasite freni talebi zaten kaydediyor, hiçbir yerde gösterilmiyor).

## Kopyalanabilirlik — bunu baştan bilmek lazım

Aşağıdaki farklılaştırıcıların çoğu bir ayda kopyalanır. Kopyalanması kolay olanlar (vardiya notu, toplu masa aç/kapat, mesai dışı mesaj, Google/Apple linki, cüzdan kartı) **farklılaştırıcı değil, hijyen** — yapılmalı ama üstüne strateji kurulmamalı.

Gerçekten savunulabilir üç şey var:

1. **Gerçek santim ölçülü salon planı üstüne kurulan her şey** — misafirin masa seçmesi, fiyat bölgesi, koltuk/masa makası, ciro ısı haritası. Rakiplerin masası soyut bir kutu; bunu sonradan kurmak ürünü baştan yazmak demek.
2. **Gece kulübü ekonomisi modülü** — Türkiye'de kategori boş ve girmek için yazılım değil sektör bilgisi lazım.
3. **Biriken veriyle büyüyen şeyler** — kaçırılan talep arşivi, kurtarma oranı, kıyas. Rakip yeni kurulduğunda gösterecek verisi olmaz.

---

## 1. Programda ne eksik

Önem sırasına konuldu. En üsttekiler ya günlük işi doğrudan aksatıyor ya da ilk hedef pazara satış yapmayı engelliyor.

### 1.1 Masa minimum harcaması ve masa paketi kavramı — **zorluk: orta**
**Ne eksik:** Programda masa bir "kapasite"; gece kulübünde ise masa bir **satış sözleşmesi**. Minimum harcama tutarı, masa paketi (sadece masa / masa+şişe / tam paket), bölgeye göre fiyat ve "bu masa taahhüdünü tutturdu mu" takibi hiç yok.
**Şu an ne oluyor:** Kulüp ve localı meyhane bu işi WhatsApp'ta pazarlıkla ve kâğıt defterle yürütüyor; gece sonunda hangi masanın minimumu tutmadığı bilinmiyor.
**Rakiplerde nasıl:** SevenRooms Nightlife, Clubtech ve Discotech'te masaya (kişiye değil) minimum yazılıyor, POS'tan gelen tutarla canlı karşılaştırılıyor, host ekranında "minimum 24.000 / şu an 18.400 / kalan 5.600" görünüyor. CoverExperiences'ta her bölgeye ayrı fiyat, ayrı minimum ve günlük değişen fiyat tanımlanabiliyor. Yunanistan'daki bouzoukia mekânlarında aynı model kişi başı minimum + sahneye yakınlık kademesi olarak zaten çalışıyor.
**Biz nasıl yapmalıyız:** Masa kartına üç alan: fiyat bölgesi (sahne önü / orta / arka), minimum harcama, paket. Rezervasyona "taahhüt" ve "gerçekleşen" sütunu. Gece sonunda "minimumu tutmayan masalar" listesi. Hesap tutarı alanı zaten var — sadece karşısına taahhüdü koymak gerekiyor.
**Not:** Türkiye'de bu kategori boş. "Gece kulübü masa rezervasyon programı, minimum harcama, loca satışı" aramasında Türkçe tek bir yazılım sonucu çıkmıyor. (İstatistik karşılığı: 4.16)

### 1.2 İşletme günü tanımı — gece yarısını aşan gün — **zorluk: kolay (ama her raporun altında)**
**Ne eksik:** Program günü takvim gününe göre sayıyorsa gece kulübünün cumartesi gecesi ikiye bölünüyor: 23:40'ta oturan masa cumartesiye, 00:20'de oturan masa pazara yazılıyor. Bu durumda doluluk, ciro, oturma süresi, kanal, no-show ve gün karşılaştırma raporlarının **TAMAMI** yanlış çıkıyor. İşletmeci ilk baktığı gün "bu rakamlar tutmuyor" diyor ve istatistik sayfasını bir daha açmıyor.
**Rakiplerde nasıl:** POS dünyasında çözülmüş bir konu. Toast işletme gününü varsayılan olarak **sabah 04:00'te** kapatıyor (açık hesapları kapatır, personeli çıkışlar, kart provizyonlarını alır). Lightspeed'de "özel işletme günü" ayarı var. Restaurant365 tüm raporlamayı "business day / workweek" tanımı üstüne kuruyor. Rezervasyon programlarında bu ayarı açıkça veren **bulunamadı.**
**Biz nasıl yapmalıyız:** Ayarlara tek satır — "işletme günü şu saatte başlar" (kulüp/meyhane için 06:00, kahvaltıcı için 00:00). Bu saat LİSTE, SALON PLANI, İSTATİSTİK, GÜN KAPANIŞI ve SABAH ÖZETİ ekranlarının hepsinde tek gün tanımı olsun. Gün kapanışı özelliği zaten var; eksik olan saatin ayarlanabilir olması ve raporların bu saati kullanması.
**Neden acele:** Sonradan düzeltmek geriye dönük tüm veriyi yeniden bölmek demek. Bugün bir satır, altı ay sonra bir göç işi. **4. bölümdeki 25 raporun tamamı buna dayanıyor.**

### 1.3 Zaman çizelgesi (timeline) görünümü — **zorluk: orta**
**Ne eksik:** Salon planı "şu an"ın fotoğrafını veriyor; gecenin tamamını gösteren bir görünüm yok.
**Şu an ne oluyor:** 19:30-21:00 arasında üç masanın boş kalacağı ancak tesadüfen fark ediliyor; telefondaki "yer var mı" sorusuna kafadan cevap veriliyor.
**Rakiplerde nasıl:** OpenTable, Eat App, CoverManager, Tablein: dikeyde masalar, yatayda saatler, her rezervasyon bir çubuk. Çubuk sürüklenerek başka masaya taşınıyor, kenarından çekilerek süre uzatılıyor. Sistem iki rezervasyon arasındaki kullanılamayacak kadar kısa boşlukları ayrıca renklendiriyor.
**Biz nasıl yapmalıyız:** Salon planının yanına ikinci sekme. Gerçek ölçülü plan ve 15 dakikalık saat altyapısı zaten var; bu ekran onun üstüne kurulur. İkinci hedef kitleye geçildiğinde zorunlu olacak.

### 1.4 Oturma süresi sayacı ve "kalktı ama kurulmadı" durumu — **zorluk: kolay**
**Ne eksik:** "Oturdu" damgası var ama masanın üstünde geçen süre görünmüyor; masa kalktıktan sonra toplanana kadar geçen ölü süre hiç ölçülmüyor.
**Şu an ne oluyor:** Masa 22:10'da kalkıyor, 22:35'e kadar kimse kurmuyor, hostes hâlâ "dolu" sanıyor. Mekândaki en görünmez kayıp.
**Rakiplerde nasıl:** Restaurant Board (Japonya) her masanın üstünde "oturduğundan beri geçen süre" yazıyor. Otel PMS'lerinde oda "kirli / temiz / hazır" olarak üç durumda tutuluyor — restoran karşılığı tam bu.
**Biz nasıl yapmalıyız:** (a) Masanın üstünde canlı sayaç — oturdu zaman damgası zaten var, sadece ekranda göstermek gerekiyor. (b) Masaya üçüncü durum: "kalktı / kuruluyor". Bu ikisi iki yeni istatistik doğuruyor (4.14 ölü dakika, 4.15 devir hızı). Emek/kazanç oranı en yüksek maddelerden biri.

### 1.5 Yedek listesine otomatik ve sıralı teklif — **zorluk: orta**
**Ne eksik:** YEDEK rezervasyon var, dolu gün talepleri kaydediliyor — ama biri düştüğünde kimseye otomatik haber gitmiyor. Kaydedilen talep şu an ölü veri.
**Şu an ne oluyor:** Cumartesi 19:00'da gelen iptal ya hiç kimseye teklif edilmiyor ya da personel telefon açmaya vakit bulamıyor; masa boş kalıyor.
**Rakiplerde nasıl:** SevenRooms "Priority Alerts" ile boşalan yeri önce seçilen gruba (VIP, sadık, yüksek harcayan) bildiriyor. Zenchef bildirim gecikmesini ayarlatıyor (hemen / 5 / 10 / 15 dakika) — iptal geri alınırsa mahcup olmamak için. Fresha üç mod veriyor: sıradakine, en yüksek değerliye, herkese aynı anda. DICE teklifi belirli bir süre tutuyor, alınmazsa sıradakine geçiyor.
**Biz nasıl yapmalıyız:** Boşalan yer → gecikme ayarı → kurala göre (sırayla / en yüksek ortalama hesap / hepsine) mesaj → süreli kabul linki → alınmazsa sıradakine. Yedek yapısı zaten kurulu; üstüne konacak en çok para getiren ekleme.

### 1.6 Misafirin kendi rezervasyonunu değiştirmesi veya iptal etmesi — **zorluk: kolay**
**Ne eksik:** Online sayfa tek yönlü; misafir kaydı yaptıktan sonra hiçbir şey yapamıyor.
**Şu an ne oluyor:** "Saati 21'e alabilir miyiz" telefonları hostesi meşgul ediyor; iptal telefonla gelmediği için yer saatlerce dolu görünüyor.
**Rakiplerde nasıl:** Eat App, OpenTable, SevenRooms ve Türkiye'de adisyon.ai: onay mesajındaki linkten giriş yapmadan saat/kişi değiştirme ve iptal. Değişiklik müsaitliğe karşı kontrol ediliyor. "Şu saatten sonra değişiklik yapılamaz" sınırı konabiliyor.
**Biz nasıl yapmalıyız:** Online sayfa girişsiz çalıştığı için altyapı hazır. Üstüne SMS/OTP doğrulaması koyulursa yanlış numara ve şaka rezervasyonu da kesilir. İptal edilen yer anında yedek listesine düşer — 1.5 ile birlikte çalışır.

### 1.7 Kapıda bekleme kuyruğu (sanal sıra) — **zorluk: orta**
**Ne eksik:** Walk-in girişi var ama kapıda bekleyen sırası, süre tahmini ve otomatik çağırma yok. YEDEK rezervasyon farklı bir şey — o belirli bir saat için sıradaki aday; bu ise o an kapıda bekleyen canlı kuyruk.
**Şu an ne oluyor:** Kapıda isim yazan defter. Kimin ne kadar beklediği, kaç kişinin vazgeçip gittiği hiç bilinmiyor.
**Rakiplerde nasıl:** Yelp Guest Manager, Toast Tables, CoverOnTheGo, Catch Table Waiting, Air Wait, Tabling, Waitwhile. Ortak akış: kapıdaki QR ile misafir kendi kaydoluyor → tahmini süre → masa yaklaşınca "neredeyse hazır" mesajı → hazır olunca ikinci mesaj → cevap gelmezse otomatik düşme. Toast'ta host ekranındaki kronometre süreye 5 dakika kala sarıya, aşınca kırmızıya dönüyor.

**Çin'den üç ucuz numara (yeni):** Çin'de sıra almak başlı başına bir yazılım kategorisi (美味不用等 — 200'den fazla şehir, 100 binden fazla restoran). Üçü doğrudan alınabilir:
- **Uzaktan sıra alma:** Misafir mekâna gelmeden, evden ya da yoldan sıra numarası alıyor; sıranın ilerleyişini telefonundan canlı izliyor. Online sayfaya "şu an sıra al" düğmesi koymak yeterli — kapıda kalabalık birikmiyor.
- **"Sıran geçse de düşmezsin":** Çağrıldığında orada değilsen kaydın silinmiyor, **üç sıra geriye** atılıyor. Kuyruk sistemlerinin en büyük öfke kaynağı "iki dakika geç kaldım, sıram gitti" — bu kural onu tek hamlede kaldırıyor. Kaç sıra geriye atılacağı ayar olsun.
- **Beklemenin karşılığı:** Bekleyene ikram/indirim kuralı ve bara yönlendirme. Vazgeçip gitme oranını düşüren tek şey bu.

**Biz nasıl yapmalıyız:** Kapı QR'ı + basit kuyruk ekranı + WhatsApp çağırma. **Süre yerine sıra söylemek daha güvenli** — kuyruk sistemlerinin bir numaralı şikâyeti tutmayan süre tahmini. Süre verilecekse gerçek devir verisinden hesaplanmalı ve tek rakam değil aralık ("25-35 dakika") verilmeli.
**Yan kazanç:** Hiç ölçülemeyen iki sayı doğuyor — kaç kişi bekledi, kaçı vazgeçti (= kaçırılan talep).

### 1.8 Eşzamanlı çalışma koruması: kilit, geri al, çöp kutusu, değişiklik geçmişi — **zorluk: kolay/orta**
**Ne eksik:** Cumartesi akşamı aynı deftere üç kişi birden yazıyor (banko tableti, müdürün telefonu, salondaki garson). Çakışma koruması, geri alma ve "kim değiştirdi" izi yok.
**Rakiplerde nasıl:** Düzgün yapan yok — Capterra/G2'deki en sık şikâyetler tam bunlar: "sistem masaları hep dolu sanıyor", "çift kayıt oluştu", "yanlışlıkla silindi geri gelmedi". Eat App'te bloke edilmiş masaya yeni rezervasyon düşebiliyor.
**Biz nasıl yapmalıyız:** (a) bir kayda dokunulduğunda diğer ekranlarda "bunu şu an Ayşe düzenliyor" ibaresi, (b) silinen rezervasyon 24 saat çöp kutusunda, tek tıkla geri, (c) rezervasyon kartının altında değişiklik geçmişi ("21:00'den 21:30'a — Mehmet, 19:42"), (d) aynı numaraya aynı gün ikinci kayıt açılırken uyarı.
**Neden önemli:** Türkiye'de sistemden vazgeçmenin bir numaralı sebebi "sisteme güvenmiyoruz, biz yine defter tutuyoruz" cümlesi. Bu dördü doğrudan güven kuruyor ve geliştirmesi ucuz.

### 1.9 Vardiya notu (gün notu) — **zorluk: kolay**
**Ne eksik:** "Bu gece mutfakta levrek yok", "DJ 23:00'te başlıyor", "X masasına patronun misafiri geliyor" bilgisi WhatsApp grubunda kayboluyor.
**Rakiplerde nasıl:** OpenTable "Shift Notes", Olo Host, Eat App "Daily Notes", CoverManager "service notes". Not, o vardiya boyunca herkesin ekranının üstünde duruyor. Olo Host'ta not **zamanlanabiliyor** — "saat 22:00'de çık" denince tam o saatte beliriyor.
**Biz nasıl yapmalıyız:** Ana ekranın üstünde not şeridi, tarih/vardiya bazlı, isteğe bağlı saat tetikli. Yazması bir gün.

### 1.10 Serbest not yerine yapılandırılmış özel gün / istek listesi — **zorluk: kolay**
**Ne eksik:** Bilgi serbest metinde duruyor; aranamıyor, sayılamıyor, raporlanamıyor. ("Not algılama bekliyor" konusunun en pratik cevabı bu.)
**Rakiplerde nasıl:** Olo Host'ta iki ayrı alan var — "Özel gün" tek seçimli (doğum günü, yıldönümü, iş yemeği, mezuniyet), "İstekler" çok seçimli (pencere kenarı, sessiz köşe, mama sandalyesi, glutensiz). Toreta "müşteri özellikleri" sözlüğü tutuyor ve sebebini açıkça söylüyor: *"ifade sapmasını önlemek"* — 5 personel aynı şeyi 5 farklı şekilde yazmasın diye. Eat App üç kavramı ayırıyor: etiket kategorisi / misafir etiketi (kişiye yapışır) / rezervasyon etiketi (sadece o geceye ait).
**Biz nasıl yapmalıyız:** Serbest not kalsın, yanına ayarlardan düzenlenebilen iki kapalı liste konsun. **Kritik ayrım:** kişiye "doğum günü" etiketi yapıştırılırsa her gelişinde pasta beklenir — misafir etiketi ile rezervasyon etiketi ayrı olmalı. Müşteri etiketleri zaten var; eksik olan REZERVASYONA ait etiket.
**Alerji ayrı bir alan olmalı:** Bkz. 5.6 — alerji serbest metin değil, tebliğdeki **14 alerjen grubunun kapalı listesi** olmalı; "alkol içermesin / domuz türevi olmasın" ise ayrı bir "misafir hassasiyeti" alanı (KVKK yükü daha hafif, çünkü sağlık verisi değil).
**Yan kazanç:** "Bu ay 42 doğum günü ağırladık", "pencere kenarı isteyenlerin %30'unu karşılayamadık" raporları ve hedefli kampanya.

### 1.11 Masa bazında oturma süresi ve masa doldurma sırası — **zorluk: kolay**
**Ne eksik:** (a) oturma süresi masaya göre değil genel, (b) hangi masanın önce dolacağı işletmecinin elinde değil.
**Rakiplerde nasıl:** aleno 2022'de oturma süresini vardiyadan masaya taşıdı (bar masası 75 dk, salondaki 6'lı 150 dk). DinnerBooking'de "tercih edilen oturtma sırası" var — akşam başında salon dolu görünsün diye önce ön taraf doluyor.
**Biz nasıl yapmalıyız:** Masa kartına iki alan: "kendi oturma süresi" ve "doldurma sıra no". Otomatik yerleşim bu sıraya uysun. Meyhane ve kulüpte boş salon soğuk görünür — bu küçük ayar doğrudan atmosferi etkiliyor.

### 1.12 Alerji ve rezervasyon notunun mutfağa/bara ulaşması — **zorluk: kolay/orta**
**Ne eksik:** Not sadece rezervasyon ekranında duruyor; servisteki kişi oraya bakmıyor, mutfak hiç görmüyor.
**Rakiplerde nasıl:** Eat App'te rezervasyona dokunup yazıcı simgesine basınca termal yazıcıdan fiş çıkıyor (isim, kişi, etiketler, notlar, gizli personel yorumu); standart yazıcılarla çalışıyor (Star TSP143, Zywell). CoverManager 2026 başında Star Micronics entegrasyonunu ekledi. TableCheck POS entegrasyonunda alerji bilgisi sipariş alınmadan önce kasa ekranında açılıyor.
**Biz nasıl yapmalıyız:** Rezervasyon fişi bastırma. Türkiye'de her mekânda zaten termal yazıcı var — donanım maliyeti sıfır. **Notu ALGILAMAK ile notu doğru ekrana ULAŞTIRMAK farklı iki iş; ikincisi daha basit ve daha çok işi kurtarıyor.** Zorunluluk takvimi için bkz. 5.6.

### 1.13 Mükerrer misafir kaydını birleştirme ve otomatik tekilleştirme — **zorluk: orta**
**Ne eksik:** "Aynı numara farklı isim" çözülmüş ama iki ayrı kaydı sonradan birleştirme yok.
**Şu an ne oluyor:** Ahmet / Ahmet Bey / Ahmet Yılmaz üç ayrı kart olarak birikiyor. Kartlar bölününce müdavim etiketi hiç tetiklenmiyor, harcama toplamı yanlış çıkıyor, yapay zekâ kart özeti eksik veriyle yorum yapıyor. **CRM'in en sessiz katili bu ve tüm istatistikleri bozuyor.**
**Rakiplerde nasıl:** Eat App Ekim 2025'te "telefona göre tekil" modu ve günlük otomatik tekilleştirme getirdi, mevcut veritabanı için tek seferlik toplu temizlik sunuyor. aleno kullanıcıları çok şubeli yapıda birleştirme olmamasını "oyunun kurallarını değiştirirdi" diye şikâyet ediyor.
**Biz nasıl yapmalıyız:** Şüpheli çiftleri listeleyen ekran + "birleştir" düğmesi (ziyaret geçmişi, hesap geçmişi, notlar, etiketler tek kartta toplansın) + şubeler arası çalışsın.

### 1.14 Doluyken misafiri eli boş göndermemek — **zorluk: kolay**
**Ne eksik:** Kapasite freni dolunca kayıt almıyor, sadece talebi kaydediyor. İyi ama misafir eli boş gidiyor.
**Rakiplerde nasıl:** CoverManager önce en yakın müsait saatleri öneriyor, olmuyorsa **aynı grubun başka şubesindeki** müsaitliği gösteriyor ve kabul edilirse rezervasyonu oraya açıyor. Restoplace "yakında boşalacak masa"yı ve saatini gösteriyor. ebica'da yönetici tüm şubelerin anlık boşluğunu tek ekranda görüp misafiri yönlendiriyor.
**Biz nasıl yapmalıyız:** Çok şubeli hesap zaten var. "Diğer şubemizde 21:30 boş, ister misiniz?" ekranı bugün eklenebilecek en ucuz gelir artışı. Türkiye'de aynı grubun 3-4 mekânı olması çok yaygın.

### 1.15 Toplu masa açma/kapatma ve kaydedilmiş salon düzenleri — **zorluk: kolay/orta**
**Ne eksik:** Yağmur başlayınca bahçedeki 14 masayı tek tek kapatmak; yaz/kış/canlı müzik düzeni arasında geçmek için masaları elle yeniden dizmek.
**Rakiplerde nasıl:** Olo Host toplu açma/kapatma veriyor. Kaydedilmiş düzen ise Now Book It kullanıcılarının açıkça istediği ama **hiçbir sistemde olmayan** şey.
**Biz nasıl yapmalıyız:** (a) Çoklu seçim + tek hamlede aç/kapat. (b) "Varsayılana döndürme" zaten var; onu adlandırılmış çoklu düzene çevirmek (Yaz terası / Kış / Konser gecesi / Yılbaşı) küçük bir iş.

### 1.16 Mesai dışında arayana otomatik mesaj + kişi başı rezervasyon limiti — **zorluk: kolay**
- **Mesai dışı çağrı:** Kapalıyken gelen çağrıya otomatik WhatsApp: "Şu an kapalıyız, buradan rezervasyon yapabilirsiniz: [link]" (ebica, UMaT). Gece kulübü sabah 11'de aranıyor, kimse yok, misafir kaçıyor.
- **Eşzamanlı rezervasyon limiti:** TableCheck bir misafirin aynı anda kaç açık rezervasyonu olabileceğini sınırlıyor. "Garanti olsun" diye üç geceye üç masa kapatıp ikisini iptal etmek popüler mekânda yaygın ve doluluk tahminini bozuyor. Online ayarlara bir satır.

### 1.17 Raporların dışa aktarılması ve rapor aboneliği — **zorluk: orta**
Excel/CSV çıktısı ve "bu raporu her pazartesi şu kişiye gönder" yok. SevenRooms filtrele-kaydet-tekrarlayan gönder; TableCheck sınırsız özel pano + PDF/Excel/CSV veriyor. Türkiye'de "muhasebeciye Excel gönder" beklentisi pazarlık konusu bile değil. **Detay 4. bölümdeki 1 numaralı tasarım kuralında.**

### 1.18 KVKK'nın üç eksik parçası — **zorluk: kolay**
KVKK metni, anonimleştirme ve saklama süresi var; roller planda. Eksik üç şey:
- **Pazarlama izni rezervasyon onayından AYRI kutu.** Rezervasyon için verilen onay kampanya için kullanılamaz — İYS açısından da şart (5.2).
- **Veri dışa aktarma ayrı bir yetki olmalı.** İşten ayrılan müdür tüm müşteri listesini indirip gitmesin. ebica bunu ayrı izin yapmış; satışta çok güçlü bir cümle.
- **İşlem günlüğü:** kim, hangi veriyi, ne zaman değiştirdi/gördü/dışa aktardı.
Ayrıca ebica'nın bir inceliği: **aynı verinin role göre farklı çıktısı** — mutfak listesinde alerji ve kişi sayısı var ama telefon yok; kapı listesinde isim ve saat var ama menü yok.

### 1.19 POS / adisyon entegrasyonu — **zorluk: zor (ama kaçınılmaz)**
**Ne eksik:** Hesap tutarı elle giriliyor ve "tamamlandı" elle işaretleniyor.
**Şu an ne oluyor:** Yoğun serviste kimse elle "tamamlandı" basmıyor — oturma süresi verisi çöp oluyor, hesap tutarı düzenli girilmiyor. **İstatistik sayfasının en zayıf halkası:** müdavim eşiği, RevPASH, harcama geçmişi ve yapay zekâ kart özeti hepsi bu veriye dayanıyor. (Bu yüzden 4. bölümde "veri kalitesi rozeti" kuralı var.)
**Rakiplerde nasıl:** Eat App "Auto-Finish on Bill Settlement", OpenTable otomatik masa durumu, Toast Tables'ta "sipariş verildi" ve "ödendi" durumları POS'tan otomatik geliyor.
**Biz nasıl yapmalıyız:** Türkiye'de Adisyo'nun hiçbir paketinde rezervasyon modülü yok ama +565 TL/ay'lık API modülü var. Simpra kendi rezervasyon ürününü satıyor. **Adisyo API'siyle entegre olmak hem boşluğu doldurur hem satış kanalı olur.** "Gün kapanışı" özelliği bu sorunun yaması; asıl çözüm burada.

### Planlanana eklenecek detaylar (keşif değil, mevcut planın ince ayarı)

Bunlar zaten planlanmış maddelerin altına yazılacak notlar; ayrı özellik değil:

- **İptal politikası onayı:** KVKK kutusunun yanına ikinci kutu. Kapora veya ceza uygulanacaksa hukuki dayanak budur — **kapora özelliğinden ÖNCE.** ebica'da politika onaylanmadan rezervasyon tamamlanmıyor. ClassPass geç iptal ile hiç haber vermeden gelmemeyi ayrı fiyatlıyor ve işletmeye tek tuşla **"ücreti affet"** hakkı veriyor — affet düğmesi Türkiye için şart.
- **Cevapsız rezervasyonu cezasız düşürme:** MHRS modeli — işlem yapılmayan randevu bir gün önce 20:00'de cezasız iptal ediliyor, ceza sadece onaylayıp gelmeyene işliyor. "MHRS'deki gibi" cümlesi tek başına anlatıyor. Ama MHRS'nin cezası Şikayetvar'da tepki topluyor: bizde ceza değil, sadece serbest bırakma olsun.
- **Çok dillilik — rezervasyon başına dil:** Tablein 20+ dil ve **rezervasyon başına** dil seçimi; garson telefonda "bu misafir İngilizce" diye işaretliyor, o rezervasyonun bütün mesajları İngilizce gidiyor. adisyon.ai Arapça için sağdan-sola yerleşim veriyor. İstanbul, Bodrum, Antalya, Alaçatı için gerekli.
- **Kaporanın kural tablosu:** saate, güne, kişi sayısına, misafire göre (müdavim hiç görmez) — 3.4'ün parçası.

---

## 2. Bizi farklılaştıracak özellikler

Baştaki kopyalanabilirlik uyarısı geçerli: aşağıdakilerin çoğu tek başına savunulabilir değil. Savunulabilir olan, **gerçek ölçülü salon planına bağlı olanlar** (2.1, 2.2) ve **gece kulübü ekonomisine bağlı olanlar** (2.2, 2.3, 2.4).

### 2.1 Misafirin salon planından kendi masasını seçmesi
Online rezervasyonda mekânın gerçek planı açılıyor; müsait masalar renkli, dolular gri. Restoplace (Rusya) üç modda veriyor: salon şeması / masa fotoğrafı kartları / klasik form.
**Neden kimse yapmıyor:** Çoğu sistem masayı soyut kutu olarak tutuyor, gerçek ölçülü planı yok. **Doğrulama notu:** Eat App'in "3D Floor View" özelliğinin misafire masa seçtirdiği sanılıyordu; kaynağa gidildi — o bir **Matterport sanal turu**, misafir masaya tıklayıp seçemiyor. Boşluk sanılandan büyük.
**Neden biz yapabiliriz:** Gerçek santim ölçülü salon planı en büyük teknik yatırımımız; bu, karşılığını aldığımız yer. Gece kulübünde "sahneye yakın masa" talebi doğrudan para eder.

### 2.2 Sahneye yakınlığa göre fiyat bölgesi ve etkinlik gecesi fiyatlaması
Her masaya bir **fiyat bölgesi** etiketi (sahne önü / orta / arka); her etkinlik gecesi için o bölgeye kişi başı tutar giriliyor. Online sayfada misafir masayı seçerken fiyatı anında görüyor.
**Rakiplerde:** Fourvenues'un (İspanya) VIP masa haritasında bölge bazlı fiyat blokajı var; Yunanistan'daki bouzoukia mekânlarında sahne dibi/VIP blok kademesi ve 4 kişilik masaya şişe paketi fiyatı standart. Türkiye'de hiçbir yazılımda yok — mekânlar bunu WhatsApp'ta pazarlıkla yapıyor (Alaçatı'da "kişi başı 7.500 TL'den başlar" deniyor, gerçek fiyat yazışmada belirleniyor).
**Neden biz yapabiliriz:** Plan + masa kartı + rezervasyon üçlüsü zaten bağlı. Kişi başı 7.500 TL × 8 kişi = 60.000 TL; tek yanlış fiyatlama bir yıllık yazılım ücreti eder.
**Uyarı:** Dinamik fiyat tüketici tepkisi çekiyor (Wendy's vakası; Tablz'in "iyi masaya ekstra ücret" modelini restoranlar bile çekingen karşılıyor). Türkiye'de aynı geliri **paket** olarak paketlemek çok daha güvenli: "masa ücreti" değil, "masa + 2 şişe paketi".

### 2.3 İzlenebilir link motoru — tek yazılım, dört kullanım
Tek bir altyapı: **izlenebilir link üret → kimin getirdiğini kaydet → katkıyı ölç.** Dört yerde kullanılıyor:

1. **PR / promoter takibi:** Her PR'a kendi linki (site.com/r/etkinlik?p=alp); o linkten gelen kayıt ilk-temas kuralıyla PR'a yazılıyor. Rapor dört sütun: listeye yazılan, gerçekten gelen, **geliş oranı**, getirdiği ciro. Komisyon kayıt sayısına değil gerçek check-in'e göre.
2. **Otel / concierge / tur firması / influencer:** Her partnere kendi linki. Ay sonunda hangi otel kaç kişi gönderdi, ne kadar ciro, komisyonu ne kadar, ödendi mi. Otel odasındaki QR ile misafir doğrudan mekânın sayfasına düşüyor. **Rezervem 2026'da "Guest Network / Concierge Programı" ile tam bu alana giriyor — acele edilmeli.**
3. **Grup davet linki:** 8 kişilik rezervasyonu yapan kişi bir link alıyor, arkadaş grubuna atıyor; gelenler adını, telefonunu, hassasiyetini ve menü seçimini kendisi giriyor. Üç kazanç: 8 kişilik masadan 1 değil 8 misafir kaydı oluşuyor ve KVKK onayını herkes kendisi veriyor (izin temiz, veritabanı organik büyüyor); mutfak kimin ne yiyeceğini önceden biliyor; son anda düşenler önceden belli oluyor. Kulüpte ayrıca kapıdaki "listede var mı" kontrolünü çözüyor.
4. **"Bu gece yer var" duyurusu:** Akşam 21:00'de hâlâ boş masa varsa tek düğmeyle Instagram story / WhatsApp listesi için o geceye özel link üretmek. Toreta'nın kendi verisi: rezervasyonların %13'ü aynı gün, %40'ı walk-in — misafirin **%53'ü nereye gideceğine o gün karar veriyor.**

**Rakiplerde nasıl (düzeltilmiş):** Özellik özgün değil. **Fourvenues (Valencia, 2018)** PR'a kişisel satış linki veriyor, komisyonu otomatik hesaplıyor, ödemeyi iki tıkla yapıyor; komisyon sabit ya da değişken kurulabiliyor; liste taranırken mükerrer ve liste tipi kontrolü otomatik. GuestlistOnline, TablelistPro, Mr. Black da yapıyor. **Özgün olan tarafımız iki şey:** "liste uzunluğu değil GELİŞ ORANI" vurgusu ve Türkiye'de hiçbir ürünün bunu yapmaması.
**Neden biz yapabiliriz:** Rezervasyona tek bir "getiren kişi" alanı eklemek teknik olarak küçük ama dört ürün özelliği doğuruyor. Türkiye'de kulüp PR ödemeleri "hisle" yapılıyor ve her hafta "o masa benim getirdiğim" tartışması çıkıyor. "150 kişi yazdım" diyen PR'ın 38 kişi getirdiğini gösteren tek ekran, satış görüşmesini tek başına kapatabilir.
(İstatistik karşılığı: 4.18. Otel/concierge kullanımı üst pakete konabilir.)

### 2.4 Sanatçı / DJ gecesi kârlılık karşılaştırması
Her etkinlik gecesine sanatçı adı ve maliyeti giriliyor; sistem o geceyi ölçüyor (doluluk, kişi başı harcama, no-show, talebin gelme hızı, kanal). "14 Mart — Sanatçı A: 28.000 TL maliyet, 96 kişi, kişi başı 3.400 TL, net katkı 298.000 TL / 21 Mart — Sanatçı B: 45.000 TL maliyet, 71 kişi, net katkı 161.000 TL."
**Neden kimse yapmıyor:** Ne rezervasyon programları ne POS'lar sanatçı maliyetini biliyor. Türkiye'de canlı müzik ücretleri 4.000-60.000 TL bandında.
**Neden biz yapabiliriz:** Rezervasyon programı, sanatçı seçiminin getirisini gösterebilecek **tek** sistem — çünkü talep hızını, doluluğu ve kişi başı harcamayı bir arada görüyor. Mekân sahibinin haftada bir verdiği en pahalı karar bu ve şu an hisle veriliyor. (İstatistik karşılığı: 4.17)

### 2.5 Gönüllü saat kaydırma teklifi
Cumartesi 21:00 dolu ve 8 kişilik grup arıyor. Sistem o saatteki uygun rezervasyonlara otomatik mesaj atıyor: "19:30'a geçerseniz tatlı ikramımız / %10 indirim." Kabul eden ilk masa kayıyor, büyük grup yerleşiyor.
**Neden kimse yapmıyor:** Havayolunda standart (Delta check-in sırasında "koltuğundan vazgeçmen için ne istersin" diye teklif topluyor), restoranda hiç uygulanmamış.
**Neden biz yapabiliriz:** Kimse kırılmıyor çünkü teklif gönüllü. Bugün bu iş telefonla, utana sıkıla yapılıyor. Mesaj şablonları zaten planda.

### 2.6 Aynı geceye çift kayıt / hayalet rezervasyon tespiti
Aynı telefon aynı gün aynı saat diliminde ikinci kayıt açtıysa satırın yanına uyarı. Şubeler arası da çalışıyor.
**Rakiplerde:** CoverManager (İspanya) yapıyor ve etkisi ölçülü: Madridli bir işletmeci bir hafta sonunda 20'den fazla masanın 2-4 restoranda birden kayıtlı olduğunu görmüş; o masaları arayınca **%20'si hiç cevap vermemiş ve zaten gelmemiş.**
**Neden biz yapabiliriz:** Tek mekânda bile bedava kazanç; program çok şubeli çalıştığı için şubeler arası kontrol bugün yapılabilir. Riski rezervasyon gününe değil rezervasyon anına çekiyor.

### 2.7 Söz verilen alan garantisi ve ihlal kaydı
"Salon tercihi (mümkünse)" bir üst kademeye çıkıyor: alan tercihi **garantili** (ek ücretli/kaporalı) veya **tercihli** işaretleniyor. Garantili masayı otomatik yerleşim başkasına veremiyor; personel yine de değiştirmek isterse sistem sebep soruyor ve bunu "söz ihlali" olarak kaydediyor.
**Neden kimse yapmıyor:** Quandoo'nun Türkçe App Store yorumunda birebir bu şikâyet var: eşinin doğum günü için deniz kenarı masa ayırtan misafir arkaya alınmış, platform çözememiş.
**Neden biz yapabiliriz:** "Mümkünse" seçeneği ve masa kilitleme zaten var; üstüne bir kademe küçük iş, güven etkisi büyük. İstatistiğe de düşüyor: "bu ay 11 garantili tercihin 3'ü karşılanamadı."

### 2.8 Kural motorunun şeffaflığı — "bu masa neden verilmedi?"
Otomatik yerleşim bir karar verdiğinde gerekçesini tek satırda yazması: "Masa 7 verilmedi: 21:30'da 6 kişilik rezervasyon var" / "Masa 12 seçildi: misafirin her zamanki masası".
**Neden kimse yapmıyor:** En sert şikâyetlerden biri bu — SevenRooms kullanıcıları "kurallar bazen birbiriyle çakışıyor ve NEDEN olduğunu hiç anlamıyorsun" diyor; Resy kullanıcıları "algoritma 3 kişilik masayı müsait göstermiyor ama biz o misafiri alabiliyoruz" diyor.
**Neden biz yapabiliriz:** Akıllı yerleşim bizim kendi kodumuz; gerekçeyi yazdırmak sadece metin üretme işi. Ayrıca **her otomatik karara "yine de al / elle değiştir" seçeneği** konmalı — katı algoritma en çok terk edilen özellik.

### 2.9 Çevrimdışı dayanıklılık
İnternet giderse tarayıcı yerel kopyadan bugünün rezervasyon listesini ve masa planını göstermeye devam etmeli; geldi/oturdu işaretlemeleri yerelde birikip bağlantı gelince eşitlenmeli. Ayrıca "gecenin listesini yazdır/PDF al" düğmesi.
**Neden kimse yapmıyor:** Rakiplerin çoğu saf bulut. LeClick (Rusya) ve Menulux (Türkiye) bunu açık pazarlama başlığı yapmış.
**Neden biz yapabiliriz:** Şikayetvar'da en çok tekrarlanan şikâyet bu (Adisyo'da ~5 saat erişilemezlik, Simpra'da yoğun saatte çökme). Cumartesi 21:00'de 20 dakikalık kesinti bir aylık yazılım ücretinden pahalıya patlıyor. Bu bir özellik değil, **güven** satıyor.

### 2.10 "Veriniz sizin" + içe/dışa aktarma aracı
Excel/CSV'den misafir ve rezervasyon içe aktarma, istediğin an dışa aktarma, kendi alan adın.
**Neden şimdi önemli:** Quandoo kapanıyor ve kapanış listesinde Türkiye de var (5.9). TheFork için "rezervasyonlar otomatik olarak sizin misafir veritabanınıza geçmiyor", Zenchef için "sunucunun verdiği alan adı restorana ait değil" şikâyeti var.
**Neden biz yapabiliriz:** Hazır geçiş aracı olan kazanır. Bir günlük iş, bir kampanyalık değer.

### 2.11 Üç ücretsiz keşif kanalı — ikisi bugün açık, biri kapalı
1. **Google İşletme Profili (bugün, ücretsiz, onaysız):** Google'ın Türkçe yardım sayfası İşletme Profili'ne **kendi rezervasyon bağlantınızı** ekleyebileceğinizi açıkça yazıyor. Hiçbir ortaklık, onay ya da ücret yok. Kurulum sihirbazına bir adım.
2. **Apple Business Connect (bugün, ücretsiz — daha önce hiç bakılmamıştı):** Apple'ın ücretsiz işletme paneli. Apple Haritalar, Siri ve CarPlay'de görünen işletme kartının üstüne **kendi rezervasyon linkini** "özel aksiyon" olarak koyabiliyorsun; üçüncü bir platformla ortak olmana gerek yok. Kurulum sihirbazına ikinci adım. iPhone kullanan üst gelir grubu, eğlence mekânının tam hedef kitlesi.
3. **Instagram'ın kendi "Rezervasyon" düğmesi (bugün KAPALI — bunu bilmek önemli):** Instagram profilindeki native Rezervasyon/Book Now düğmesi serbest link kabul etmiyor; sadece Meta'nın onaylı rezervasyon partnerlerinden seçtiriyor (OpenTable, Resy, Yelp, Booksy, Fresha...). Listede Türk oyuncu yok. Bugün yapılacak şey bio linki + story link etiketi; **orta vadeli hedef Meta'nın rezervasyon partneri listesine girmek.** Girildiği gün Türkiye'deki her müşteri mekânının profilinde o düğme çıkar — tek başına bir pazarlama olayı. Başvuru şartlarını araştırmak bir günlük iş.

*(Gerçek Reserve with Google E2E entegrasyonunun sınırları: sağlayıcı dokümanında en fazla 10 kişi, Google politikası en az 30 günlük müsaitlik; yüzlerce mekânlık portföy gerektiriyor, şimdilik erişilemez. Daha önce dolaşan "en fazla 20 kişi / en fazla 30 gün" bilgileri yanlış çıktı.)*

### 2.12 Rezervasyonu Apple / Google Cüzdan kartına çevirmek
Onay mesajına "Cüzdana ekle" düğmesi. Kart cüzdana girdikten sonra: saat yaklaşınca kilit ekranında beliriyor, mekânın yakınına gelince yine beliriyor, saat/masa değişirse kart sessizce güncelleniyor (yeni mesaj göndermeye gerek kalmıyor), arkasına adres, vale, kıyafet kuralı ve "geliyorum/iptal" düğmeleri konuyor; kulüpte kapı QR'ı da aynı kartta taşınıyor.
**Neden kimse yapmıyor:** Havayolu ve etkinlik dünyasında standart; restoran rezervasyon sistemlerinde neredeyse hiç yok.
**Maliyet (düzeltildi):** "Bedava" değil — Apple Wallet kartı üretmek için Apple Developer Program üyeliği (yıllık ~99 USD) ve pass imzalama sertifikası gerekiyor, güncellemeler APNs üzerinden gidiyor; Google Wallet tarafında da API onboarding var. Doğru cümle: **kurulumu bir kerelik, ama MESAJ BAŞINA ücreti olmayan tek hatırlatma kanalı.**

### 2.13 İftar modu — yılda bir ay, tek oturum, sabit saat
**Ne:** Ramazan'da akşam servisi normal servis gibi çalışmıyor: herkes aynı dakikada oturuyor, oturma süresi tek ve sabit, menü fix, masa değil **koltuk** satılıyor, sahur ayrı bir oturum. Program bunu normal rezervasyon gibi ele alırsa müsaitlik hesabı, oturma süresi ve otomatik yerleşim üçü birden yanlış çalışıyor.
**Ürün karşılığı:** Ayarlarda "tek oturumlu servis" modu — (a) oturum saati (şehre göre iftar vakti otomatik gelsin; il bazlı imsakiye verisi ücretsiz erişilebilir), (b) sabit oturma süresi, (c) kişi başı fix menü fiyatı ve ön ödeme, (d) masa değil koltuk bazlı satış (uzun masaya farklı gruplar), (e) "oturuma X dakika kala gelmeyen masa düşer" kuralı.
**Neden değerli:** İftar masası Türkiye'de kişi başı ön ödemeyle satılıyor (İstanbul'da kişi başı 1.800 TL'ye kadar örnekler var) ve bugün tamamı Excel + Instagram DM ile yürüyor. Yılda bir ay, ama o ay yılın en yoğun ve en peşin ayı.
**Asıl kazanç:** Aynı motor yılbaşı, sahur, konser gecesi, tadım ve düğün sonrası için de çalışıyor. Bir kez "tek oturumlu etkinlik" yazılıyor, beş yerde iş görüyor. **3.2 biletli etkinlik maddesiyle tek modül olarak kurgulanmalı.**
**Rakip:** Yurt dışı sistemlerinde de Türk sistemlerinde de karşılığı yok.

### 2.14 Ücretsiz / küçük başlangıç kademesi ve komisyonsuzluk
**Neden kimse yapmıyor (Türkiye'de):** Rezervem, Simpra Reservation, Check&Place, Reztoran, Yerim Hazır — **hiçbiri fiyatını yayımlamıyor**, hepsi "başvuru formu" duvarı koyuyor. Quandoo kişi başı kuver alıyor ve mekânın no-show oranı yüksek çıkarsa ayrıca ceza kesiyor. Reztoran'ın Exclusive paketinde kalan her ay için 500 TL cayma cezası var.
**Neden biz yapabiliriz:** Sabit aylık ücret + komisyon yok + ceza yok + şeffaf fiyat + gerçek deneme. Yurt dışı örnekleri sınırları da gösteriyor: resOS'un "sonsuza kadar ücretsiz" paketi **ayda sadece 25 rezervasyon** (Türkiye'de bir hafta sonu etmez), Tableo **ayda 100 kuvere kadar** ücretsiz ve çekirdek özelliklerin tamamını veriyor. Doğrusu ikincisine yakın. (Paket tablosu: 6. bölüm.)

### 2.15 Kapıda tanınma ve yapay zekâ ajanlarına görünürlük (ileriye dönük iki not)
- **Kapıda tanınma:** Blackbird (ABD; Resy kurucusunun yeni şirketi) host bankosuna NFC diski koyuyor, misafir telefonunu değdiriyor, kartı açılıyor. Asıl kıymeti: **rezervasyonu olmayan misafiri de tanıyor**, yani walk-in müdavim ilk kez ölçülebiliyor. Türkiye'de temassız ödeme refleksi çok yerleşik; aynı iş masa/kapı QR'ı ile de yapılabilir.
- **Yapay zekâ ajanları:** Google AI Modu 2025'te rezervasyon ajanını 180 ülkede açtı, ChatGPT/Operator rezervasyon yapabiliyor — ama bugün **sadece büyük platformların envanterini görüyorlar.** Görünmek için online sayfada schema.org Restaurant/Reservation etiketleri ve basit bir müsaitlik uç noktası gerekiyor. **Yapısal avantajımız:** mekânların online sayfasını zaten biz üretiyoruz; tek merkezden etiketleme yapıp bütün müşterileri bir gecede görünür kılabiliriz. 12-24 ay içinde gerçek bir kanal olacak.

### 2.16 Komşuluk kuralı — düşük öncelikli
Otomatik yerleşime "tercih" düzeyinde kısıtlar: çocuklu grubu nargile bölgesinin yanına koyma, şu iki grup birbirini görmesin. Kimse modellememiş. **Ama emek/kazanç oranı düşük ve verdiği ders "kuralı katı yapma" yönünde** (Türk otobüs bilet sistemlerinin cinsiyet komşuluk kuralı katı olduğu için yan koltuk boş kalıyor ve yolcu firmayı arayıp özel izin almak zorunda kalıyor). Yapılacaksa "ihlal edilebilir uyarı" olarak, en sona.

---

## 3. Premium özellikler

Fiyat çıpaları: OpenTable 149 / 299 / 499 $ paket **artı kapak başına 1-1,5 $** (ve 2026 başından beri ödemelerde %2 işlem ücreti). SevenRooms fiyat yayımlamıyor; kullanıcı bildirimlerine göre lokasyon başına ~300-2.000+ $/ay **artı 5.000-25.000 $ kurulum**. Rex Reservations **şube başına** 195 / 295 / 395 $/ay. Vemos kapı yazılımı 79 $/ay'dan başlıyor.

**Bunların hangisinin hangi pakete gireceği ve kaç TL olacağı 6. bölümdeki paket tablosunda.**

### 3.1 Gece kulübü modülü (minimum harcama + paket + kapı + PR)
Bölge bazlı minimum, kademeli masa paketi (masa / masa+şişe / tam paket) ve üst üste eklenen ekstralar (ek şişe, pasta, maytap, transfer), kapı modu, PR komisyon takibi.
**Ne kadar para eder:** Bu modül olmadan bir kulüp programı ana sistemi olarak kullanamaz — fiyat sorusu değil, var/yok sorusu.
**Rakip:** SevenRooms Nightlife ayrı ürün hattı (fiyat gizli); Fourvenues, Clubtech ve TablelistPro kulübe özel yazılım olarak satıyor; Türkiye'de karşılığı **yok**.

#### Kapı modülünün eksik yarısı: yaş kontrolü ve kara liste
Şimdiye kadar kapı modu "isim ara, QR okut, kapasite say" ile sınırlı düşünülmüştü. ABD kulüp kapısının standart yazılımı (Vemos, IDScan.net, Patronscan, IDEnforcer) bunun ötesinde üç şey yapıyor:
- **Yaş doğrulama:** Kimlik/pasaport okunuyor; 18 yaş altı ve süresi geçmiş kimlik anında renkli uyarı; aynı kimliğin ikinci kez içeri sokulması (pass-back) yakalanıyor.
- **Kara liste ("86 list"):** Mekânın kendi yasaklı listesi; süreli yasak (3 ay / 1 yıl / süresiz), sebep, kim koydu kaydı. Vemos ayrıca **çevredeki mekânların** yasaklarını da uyarı olarak gösteriyor.
- **Kapı demografisi:** Kimlik okumasından yaş dağılımı, geldiği şehir, ilk kez gelen / geri gelen oranı çıkıyor. Rezervasyonu olmayan misafir ilk kez ölçülebiliyor.

**Türkiye dayanağı (bu özelliği satan cümle):** 18 yaşını doldurmamış kişiye alkollü içki satan işletmeye **65.000 – 320.000 TL** idari para cezası ve satış belgesinin **2 yıl** verilmemesi uygulanıyor. Yani yaş kontrolü "iyi olurdu" değil, **ruhsat riski.** "Kimliğini gördüm" kaydı denetimde ve olay anında işletmecinin tek savunmasıdır.
**Nasıl yapmalıyız:** Türkiye'de kimlik okuyucu donanımı yaygın değil, ama yeni TC kimlik kartının karekodu ve NFC'si telefonla okunabiliyor. İlk sürüm "kimlik gördüm + doğum yılı + kayıt" kadar basit olabilir. **KARA LİSTE ise sıfır donanımla bugün yapılabilir ve gece kulübünün en çok istediği şey** — bugün kapıda "şu adam gelirse alma" bilgisi sadece güvenlik şefinin kafasında duruyor.
**KVKK uyarısı:** Kara liste ve kimlik kaydı kişisel veri. Sebep alanı **serbest metin olmamalı** (sağlık/etnik köken yazılmasın) — kapalı liste olsun: güvenlik olayı / ödeme sorunu / mekân kuralı ihlali. Süreli, dar erişimli ve otomatik imhalı kurgulanmalı.
**Fiyat çıpası:** Vemos ID Scan 79 $/ay'dan başlıyor, sahte kimlik doğrulamalı sürümü 199 $/ay — yani sadece kapı yazılımı ayda 3.000-7.500 TL'lik bir kalem olarak fiyatlanıyor.

### 3.2 Biletli etkinlik / ön ödemeli özel gece paketi
Etkinlik iki türlü kurulabiliyor: masaya bağlı (normal müsaitlikten düşer) veya **biletli** (masa müsaitliğiyle ilgisi yok — konser gecesi, yılbaşı, tadım). Kontenjan, fiyat, ön ödeme ve iade penceresi ayrı tanımlanıyor. Üstüne hediye çeki satışı. **2.13 iftar modu bu modülün içine kurulmalı** — ikisi aynı motor.
**Ne kadar para eder:** Yılbaşı, iftar ve özel geceler Türkiye'de zaten peşin satılıyor ama Excel ve Instagram DM'de yönetiliyor; kim ödedi kim ödemedi karışıyor. Doğrudan nakit akışı yaratıyor. *(Ön ödemeli rezervasyonların %35 daha yüksek harcama yaptığı iddiası — sektör iddiası, bağımsız ölçüm yok.)*
**Rakip:** Tock bu model üzerine kurulmuştu; **11 Ağustos 2026'da Resy'ye devredildi** (6. bölüm). TableCheck "Experiences", OpenTable "Ticketed Experiences", Restoplace ve DinnerBooking bilet+hediye çeki satıyor.

### 3.3 Banket / özel etkinlik satış hattı (teklif → onay → kapora → mutfak emri)
Özel gün talebi bir rezervasyon değil bir satış sürecidir: talep düşer → sorumluya atanır → teklif (menü, kişi başı fiyat, salon, ekstralar, iptal şartları) PDF üretilir → misafir onaylayıp kaporayı öder → onaylı teklif otomatik mutfak/servis emrine döner. Ölçülenler: kaç talep geldi, kaçı teklife döndü, kaçı onaylandı, **ilk cevap kaç saatte verildi.**
**Önemli düzeltme — e-imza değil OTP:** Türkiye'de tüketicide e-imza/mobil imza yaygın değil; misafirden e-imza istemek akışı öldürür. Doğru kurgu: **onay linki + SMS OTP + onaylanan teklif metninin zaman damgalı kaydı.** Hukuki değer aynı yönde (delil), uygulanabilirlik on kat yüksek. Aynı kurgu 3.4'teki delil dosyasıyla uyumlu.
**Ne kadar para eder:** Nişan, doğum günü, şirket yemeği, iftar ve yılbaşı Türkiye'de restoranın en kârlı işi ve tamamı WhatsApp'ta el yordamıyla yürüyor.
**Rakip:** ABD'de ayrı bir yazılım kategorisi (Tripleseat, Perfect Venue). Türk rezervasyon programlarının hiçbirinde yok.

### 3.4 Kapora / kart provizyonu kural motoru + delil dosyası
Kapora tek bir açık/kapalı düğmesi değil, kural tablosu: saate göre (18:00'den sonra kaporalı), güne göre (sadece cuma-cumartesi), kişi sayısına göre (8+ grup), misafire göre (müdavim hiç görmez, ilk kez gelen görür), süreye göre.

**Üç kademe:** (a) kart kaydı, para çekilmez, gelmezse ceza (Catch Table'ın "0 won kaporası"), (b) blokaj/provizyon — para bloke edilir, gelince çözülür (Rezervem'in fine dining'de tutunma sebebi), (c) gerçek tahsilat, **hesaptan düşülecek şekilde** (Meitre-Arjantin: peşin ödeme tartışma yaratmışken tutarın hesaptan düşülmesi kabul edilebilirliği değiştirmiş). *(Bu üç yöntemin no-show'u %65 / %75 / %98 düşürdüğü iddiaları — hepsi sektör iddiası, bağımsız ölçüm yok.)*

#### Kaporanın ikinci yolu: havale + dekont (bugün satılır, ilk yapılacak)
Kaporayı sadece kart üzerinden kurgulamak eksik. Türkiye'de eğlence mekânlarının **bugün fiilen kullandığı** yöntem IBAN'a havale/FAST ve WhatsApp'tan dekont. Kart altyapısı kurulana kadar — ve kurulduktan sonra da — bu akış desteklenmeli:
rezervasyona "kapora bekleniyor" durumu → mekânın IBAN'ı ve rezervasyon numarası açıklama kodu otomatik üretilir → misafir dekontu yükler → personel tek tıkla "kapora alındı" işaretler → ödenmezse X saat sonra rezervasyon kendiliğinden düşer.
**Sıfır entegrasyon, bir günlük iş, bugün satılır. Kart provizyonundan ÖNCE yapılmalı.**

#### Sahte hesap dolandırıcılığı — gerçek bir farklılaştırıcı
Mekân adına açılmış sahte Instagram hesaplarının IBAN'a kapora toplaması Türkiye'de yaygın bir şikâyet konusu; mekânın hem parasını hem itibarını yiyor ve kimsenin çözümü yok.
**Ürün karşılığı:** Kapora **her zaman** mekânın kendi alan adındaki rezervasyon sayfasından isteniyor; sayfada rezervasyon no, mekân adı, tutar ve iptal şartları yazılı; mesaj mekânın onaylı WhatsApp Business numarasından gidiyor. Mekâna verilen tek cümle: *"Kaporayı sadece şu linkten alıyoruz; IBAN'a havale isteyen hesap bize ait değildir."* Mekân bunu bio'suna ve story'sine koyar.
**Bu, ürünü MİSAFİR GÖZÜNDE de görünür kılan tek özellik ve rakiplerin hiçbirinde yok.**

**Delil dosyası:** Kapora alınırken gösterilen iptal metninin o anki hâli, onay saati, IP, iptal talebinin geldiği saat — tek tıkla PDF. Tüketici Hakem Heyeti'ne gidilirse işletmecinin elinde dosya olur. **Rakiplerin hepsi kaporayı tahsilat olarak görüyor, hiçbiri hukuki kanıt olarak görmüyor.**
**Uyarı:** SevenRooms kullanıcıları "iptal ücreti çoğu kart tipinde tahsil edilemiyor" diyor — Türkiye kartlarıyla gerçekten çalıştığı test edilmeli (bkz. 5.4, sağlayıcıya sorulacak üç soru).

### 3.5 Tek gelen kutusu: WhatsApp + Instagram DM + telefon
**Düzeltilmiş konumlandırma:** "WhatsApp'ımız var" artık farklılaştırıcı değil — Eat App'te ve SevenRooms'ta native WhatsApp mesajlaşma zaten var. **Bizim farkımız Instagram DM'i de aynı kutuya almak olmalı.**
**Neden bu sıralamada:** Zenchef'in Call AI ürünü için yapılan bağımsız eleştiri öğretici — *"sadece telefonu açıyor, WhatsApp ve Instagram boş kalıyor; 'glutensiz var mı' gibi rezervasyon dışı bir soru gelince tıkanıyor."*
**Rakamlar:** 2 dakika altı yanıt %40-60 rezervasyona dönüşüyor; 2 saatten geç yanıtta misafirlerin %65'i başka mekâna gidiyor *(sektör iddiası — bağımsız ölçüm yok)*. Türkiye'de eğlence mekânının rezervasyon trafiğinin büyük kısmı Instagram DM'inden geliyor ve gece 02:00'de gelen DM sabah cevaplanıyor.
**Türkiye'de rakip:** FendyChat (ücretsiz / 499 / 1.499 TL), InstaAssist, CreatorFlow, MaviBot — kalabalık ama hiçbiri rezervasyon programının içinde değil.
**Ek fikir — WhatsApp Flows:** Link göndermek yerine mesajın **içinde** açılan çok adımlı form (tarih → kişi → saat → salon → özel gün). Misafir uygulamayı hiç terk etmiyor. En büyük dönüşüm sızıntısı "linke tıklamayan misafir" — özellikle 40 yaş üstünde. Türk rezervasyon programlarının tamamı hâlâ link gönderiyor.

### 3.6 Yapay zekâ telefon resepsiyonu
Telefonu yapay zekâ açıyor, müsaitliğe bakıp rezervasyonu kendisi yazıyor, doluysa alternatif saat veya kardeş şube öneriyor, karar gerektiren konuda çağrıyı personele devrediyor.
**Ölçülmüş rakamlar (sağlayıcı beyanı):** ebica — gelen çağrıların ~%20'si (yoğun saatte %25'i) hiç cevaplanamıyor, bu sistemle kayıp neredeyse sıfırlanıyor. Toreta — aramaların ~%50'sini yapay zekâ karşılıyor, ilgilendiği çağrıların %25'i rezervasyona dönüyor; 5 mağazalı bir zincir sadece mesai dışı aramaları devrederek 1 ayda 1.168 kişilik rezervasyon almış. Slang.ai — 2.000+ restoran lokasyonu.
**Rakip fiyatı:** Toreta'nın ucuz "telesekreter" sürümü aylık 5.500 ¥ + onaylanan rezervasyonda kişi başı 220 ¥ (gerçek giriş ~18.700 ¥/ay); tam sürüm 15.000 ¥/ay + çağrı başına 50 ¥.
**Türkiye:** restoran.asistanim.ai Türkçe konuşan teyit araması yapıyor ve gelemeyecek misafirin yerine bekleme listesindekini davet ediyor.
**Sert uyarı:** Bir restoran müdürü Loman AI için *"4 ay boyunca siparişleri yanlış aldı, 1.000 dolardan fazla çekildi ve iade yok"* demiş. Sesli yapay zekâ satılacaksa **günlük hata raporu, kolay insana devir ve iptal garantisi şart.**
**Yan kazanç:** Çağrı analitiği — her çağrının dökümü ve "insanlar telefonda en çok neyi soruyor" raporu. O beş soru online sayfaya konunca çağrı sayısı düşüyor.

### 3.7 Caller ID / santral entegrasyonu
Telefon çalar çalmaz ekranda misafir kartı açılıyor: geçmiş ziyaretler, notlar, her zamanki masası, no-show riski.
**Rakiplerde (düzeltildi):** Yurt dışında nadir değil — **Eat App'te santral/Caller ID entegrasyonu var**, Zenchef "Zencall" aylık 5 €, Restoplace ve LeClick IP santral entegrasyonu veriyor, TableCheck çağrı süresini %50 kısalttığını söylüyor. Türkiye'de **Rezervem bunu en üst pakete (Müdavim) koymuş** — yani fiyat kabulü test edilmiş.
**Bizde durum:** Telefonla tanıma var ama numara **elle** girildiğinde çalışıyor. Aradaki fark küçük görünüyor ama müdavim algısını tek hamlede değiştiren şey bu.

### 3.8 Otomatik etiket kural motoru ve tetikleyicili kampanya
Etiket elle değil kuralla düşüyor: "son 90 günde 3+ ziyaret VE ortalama hesap üst %20 → yüksek harcayan", "son 6 ayda 2+ gelmedi → riskli", "notlarında 'rakı' geçiyor → rakı sever". SevenRooms 75'ten fazla koşulu birleştiriyor ve hazır bir "en iyi uygulama" kütüphanesi veriyor. Üstüne tetikleyici motoru: tetikleyici (60 gündür gelmedi / doğum gününe 7 gün kaldı) → koşul → bekleme → aksiyon.
**Neden premium:** Motor bir kez yazılınca her yeni istek "ayarlardan kurulur" cevabını alıyor; hatırlatma, kampanya, uyarı ve anket aynı motordan çıkıyor. Üst paketin en savunulabilir gerekçesi bu.
*(Dolaşan rakamlar — "tekrar gelen misafir %27 daha kârlı", "kişiselleştirilmiş e-posta 16 kat gelir", "geri kazanma kampanyası %38 dönüş" — hepsi satıcı blogu kaynaklı, bağımsız ölçüm yok. Müşteri sunumuna konmamalı.)*
**Bizde durum:** Eşikli müdavim / no-show etiketi var ama kuralı kullanıcı yazamıyor.

### 3.9 Yorum yönetimi, ziyaret sonrası anket ve KURTARMA ORANI
Anket iki soruyla başlıyor; düşük puan geldiği **anda** müdürün telefonuna bildirim düşüyor ve doğrudan bir WhatsApp konuşması açılıyor — misafir henüz masadayken. Yüksek puan verene Google'a yazma daveti gidiyor; düşük puan içeride kalıyor. Google/Tripadvisor yorumları tek panele toplanıyor, yapay zekâ cevap taslağı yazıyor, insan onaylıyor.
**Yeni metrik:** "Bu ay 41 mutsuz misafir yakalandı, 28'iyle konuşuldu, 19'u tekrar geldi — kurtarma oranı %46."
**Neden biz yapabiliriz:** Yapay zekâ kart özeti zaten Claude ile çalışıyor; aynı altyapı cevap taslağı üretir. Google puanı Türkiye'de doğrudan müşteri getirdiği için satarken en kolay anlatılan özellik.

### 3.10 Talep tahmini (yarın kaç kişi) ve hava durumu/etkinlik değişkeni
Eldeki rezervasyonların üstüne geçmiş walk-in ve no-show oranı eklenerek beklenen toplam kişi sayısı. "60 rezervasyon var" ile "geçmişe göre 25 walk-in gelecek, 6 kişi gelmeyecek, gerçek sayı 79" arasındaki fark personel ve mal siparişi kararıdır. Tenzo bunun üstüne hava durumu, resmî tatil ve özel etkinlik değişkenlerini koyuyor.
**Türkiye gerçeği:** Yağmurlu cumartesi ile açık cumartesi arasındaki fark yüzde onlarla ölçülür; derbi akşamı meyhane boşalır, maç sonrası dolar.
**İlk sürüm makine öğrenmesi gerektirmez:** aynı haftanın günü + son 4 hafta ortalaması + şu anki rezervasyon durumu makul bir tahmin verir.

### 3.11 Kurumsal cari hesap (firma yemeğini aya bağlamak)
Belirli firmalara hesap açılıyor: kredi limiti, yetkili kişi listesi, fatura dönemi. O firmadan gelen rezervasyon otomatik cari hesaba bağlanıyor, kasadan tahsilat yapılmıyor, ay sonunda tek fatura çıkıyor. Rezervasyon ekranında "bu masa X A.Ş. hesabına, kalan limit 42.000 TL" görünüyor.
**Türkiye gerçeği:** "Cari çalışıyoruz" çok yaygın ve defterle yürüyor; tahsilat kaybı ve tartışma çıkıyor.
**Rakip:** ABD POS'larında standart "house account"; Türk rezervasyon programlarında yok.

### 3.12 KVKK uyum paketi
Yurt dışına veri aktarımı için hazır standart sözleşme ve 5 iş günlük bildirim rehberi, saklama/imha takvimi ve imha kaydı, silme talebi sayacı (30 gün), pazarlama izninin ayrı tutulması, rol bazlı dışa aktarma kısıtı, işlem günlüğü.
**Neden premium:** İşletmecinin aklına gelmeyen ama cezası ağır olan bir yükü kaldırıyor. **Ayrıca bizim kendi riskimizi de kapatıyor:** yapay zekâ kart özeti misafir notlarını Claude API'ye gönderiyor — bu yurt dışına kişisel veri aktarımıdır (5.3).

### 3.13 Rezervasyon anında ek satış ve "masaya sürpriz gönder"
Rezervasyon akışında taban fiyatın üstüne isteğe bağlı eklentiler: karşılama içeceği, pasta, şişe, menü yükseltmesi. Ödeme rezervasyonla birlikte alınıyor. Olo Host'ta ayrıca **üçüncü bir kişi** o masaya önceden ödenmiş bir şişe veya tatlı gönderebiliyor.
**Neden işe yarıyor:** Rezervasyon anı, misafirin cüzdanının en açık olduğu andır. Pasta/şişe siparişi Türkiye'de zaten telefonda alınıyor.
**Uyarı:** Otel dünyasında bu mesajların spam algılanması şikâyet konusu — **ayrı kampanya mesajı gönderme**, düğmeleri onay mesajının içine göm.

### 3.14 Kontrollü fazla kabul ve rezervasyon başına risk göstergesi
**Ne:** Program o gün ve o saat dilimi için geçmiş gelmedi/iptal oranını hesaplayıp öneri veriyor: "bu dilimde %8 fazla kabul edebilirsin, bu 3 masa eder." Oranı işletmeci belirliyor (0 = kapalı). Yanında her rezervasyonun risk göstergesi: kanal, kaç gün önceden yapıldı, grup büyüklüğü, misafirin geçmişi, teyide cevap verdi mi.
**Rakiplerde:** Eat App yapay zekâ ile no-show riskini işaretleyip "yoğun dilimde bilinçli fazla kabul et ya da bu misafirden kapora iste" diyor. Hostie AI fazla kabul seviyesini gerçek zamanlı hesaplayıp kabul oranını otomatik ayarlıyor. Türkiye'de hiçbir üründe yok.
**Neden premium:** Otel ve havayolunda 40 yıllık standart, restoranda yeni. Riskli: tutmazsa misafir kapıda kalır. O yüzden **ÖNERİ olarak sunulmalı, asla otomatik uygulanmamalı**; ve "fazla kabul yüzünden kaç misafir bekletildi" ayrıca ölçülmeli (4.20).
**Bizde durum:** Gelmedi, iptal, kanal ve kaç gün önceden verisi zaten toplanıyor. Hesap 4.8 iptal panosunun yan ürünü.
**Uyarı:** Türkiye'de "overbooking" kelimesini kullanma — havayolu çağrışımı kötü. **"Gelmeyenleri hesaba katan kabul önerisi"** de.

### 3.15 Üyelik / abonelik — gerçek örnekle
Aylık aidatla "öncelikli rezervasyon + garantili masa + kuyruğa girmeme" hakkı.
**Ölçekli örnek (Hindistan — EazyDiner Prime):** EazyDiner 15.000+ restoran, 300+ şehir, "18 saniyede onay" vaadi. Prime üyeliği aylık ~245 ₹'den başlıyor, yıllık ~2.495 ₹; karşılığında 2.000+ restoranda **garantili %25-50 indirim**, ön ödemeli kupon ve puan. Amex Platinum'a hediye olarak veriliyor.
**Türkiye'ye uyarlama:** "Tek mekân üyeliği" değil, **"grup üyeliği"** (aynı sahibin 3 mekânı) olarak kurgulanmalı — Türkiye'de aynı grubun birden çok mekânı olması çok yaygın ve tek mekânlık aidatın değeri düşük kalır.
**Türkiye gerçeği:** Bu zaten enformel olarak var ("patronun adamı"), sadece programlaşmış değil. Hem düzenli nakit hem en sadık misafiri sisteme kilitliyor.
*(Not: Önceki taslakta dayanak olarak Zenoti — güzellik/spa — verisi kullanılmıştı; gece kulübü için kanıt değil, çıkarıldı.)*

---

## 4. İstatistikler sayfası

Ana fikir: **istatistik sayfası "rapor listesi" değil, "para kazandıran ekran" olmalı.** Her rakamın karşısında bir karar durmalı. Aşağıdaki 25 madde öncelik sırasında — üsttekilerin verisi programda **zaten var**, sadece hesap ve ekran eksik.

### Önce yedi tasarım kuralı

1. **Her ekranın altında iki düğme: "listeyi dışa aktar" ve "bu kişilere mesaj at."** Now Book It'in bir numaralı şikâyeti raporu segmentleyip listeye çevirememek. Rapor okunup kapanıyorsa işe yaramamıştır.
2. **Tek ekranda çapraz kırılım.** Toast Reporting Plus kullanıcıları istedikleri tabloyu almak için "iki ayrı rapor çalıştırıp elle birleştirmek" zorunda kalıyor. Gün × kanal × kişi sayısı aynı ekranda seçilebilmeli.
3. **Mobilde okunabilir olmalı.** SevenRooms için "uygulama kullanılamaz halde", Now Book It için "mobilde salon planı yok" şikâyeti var. Mekân sahibi salonda, telefonuyla bakıyor.
4. **Yeni görünüm gelirken eskisi bir süre yanında dursun.** SevenRooms raporlamayı yenileyince kullanıcılar "eskisi daha kolaydı" dedi.
5. **Her rakam tıklanabilir olmalı ve altındaki kayıtları listelemeli.** İşletmecinin yazılıma güvenini bitiren tek şikâyet "raporlar birbirini tutmuyor" (aynı dönem için bir ekranda 103.000 TL, diğerinde 80.000 TL). Çözüm rakamı savunmak değil, **rakamın hangi kayıtlardan çıktığını tek tıkla göstermek.** Ayrıca her ekranın üstünde bir tanım satırı: *"Ciro = tamamlandı işaretli rezervasyonların hesap tutarları toplamı; iptal ve gelmedi hariç."* Tanım yazılı değilse iki ekran er ya da geç çelişir.
6. **Veri kalitesi rozeti.** Her raporun köşesinde tek cümle: *"Bu rapor 412 rezervasyona dayanıyor; 156'sında hesap tutarı girilmemiş (%38)."* RevPASH, kişi başı harcama, müdavim eşiği ve yapay zekâ kart özeti hep elle girilen hesap tutarına dayanıyor (1.19) — rozet olmazsa rapor sessizce yalan söyler ve bir kez yakalanınca istatistik sayfası ölür. Yazması yarım gün.
7. **Karşılaştırma takvim günü değil, HAFTA GÜNÜ olmalı.** 15 Mart'ı 15 Şubat'la karşılaştırmak anlamsızdır; "geçen cumartesi", "son 4 cumartesinin ortalaması", "geçen yılın aynı haftasının cumartesisi" karşılaştırılır. Varsayılan bu olmalı. Ayrıca Ramazan, resmî tatil, derbi ve yılbaşı için **"bu günü karşılaştırma dışı bırak"** işareti — yoksa her yıl bir ay boyunca bütün grafikler bozuk görünür.

**Sıfırıncı kural, 1.2'de anlatıldı:** İşletme gününün saati ayarlanabilir olmadan ve bütün raporlar aynı saati kullanmadan aşağıdaki 25 rapor gece kulübünde yanlış çıkar.

---

### ÖNCELİK A — Veri zaten elimizde, sadece ekran lazım

#### 4.1 Kaçırılan talep raporu — "kaç kişiyi geri çevirdin"
**Hangi rakam:** Kapasite freni devreye girdiğinde kaydedilen talepler; sebebine göre kırılmış — kapasite doldu / o saat kapalı / o kişi sayısına uygun masa yok / gün ufkunun dışında / en büyük grup kuralına takıldı. Yanına gün, saat ve kişi sayısı kırılımı.
**Nasıl gösterilir:** "Bu ay 214 kişilik talebi geri çevirdin. %70'i cumartesi 21:00-22:00 arası, ortalama 4 kişilik gruplar. Tahmini kaçan ciro: 512.000 TL."
**Hangi kararı değiştirir:** Kapasite ayarı, masa karması, ikinci salon açma, saat aralığı ekleme, minimum grup kuralını gevşetme. "Minimum grup 4 kuralı sana ayda 60 misafire mal oldu" cümlesi bir ayarı anında değiştirtir.
**Neden ilk sırada:** **Veri şu an birikiyor ve hiçbir yerde gösterilmiyor.** Ciroyu artıran tek rapor türü budur çünkü henüz olmamış işi gösterir. OpenTable'ın kendi arayüzünde yok; distil.ai adında ayrı bir şirket sırf bu raporu OpenTable verisinin üstüne satıyor.
**Zorluk: kolay.**

#### 4.2 Talep hızı ve tempo — "bu cumartesiye bugün itibarıyla kaç kişi yazıldı"
**Hangi rakam:** İki grafik. (a) **Doluluk eğrisi:** rezervasyonların yüzde kaçı kaç gün önceden alındı. (b) **Tempo:** gelecek bir tarih için bugünkü kayıt sayısı ile son 4 aynı günün **aynı kalan gün sayısındaki** kaydı yan yana.
**Nasıl gösterilir:** "Gelecek cumartesi için elde 140 kişi var; son 4 cumartesinin aynı noktasında ortalama 95 vardı — %47 öndesin." Yavaş kalan tarih kırmızı yanar.
**Hangi kararı değiştirir:** "Bu hafta sonu zayıf mı yoksa daha erken mi?" sorusunun tek doğru cevabı. Zayıfsa 4 gün öncesinden kampanya yapacak vaktin olur. Cumartesi 12 gün önceden doluyorsa fiyat/minimum artırılabilir. Gün ufku ayarı da bu veriye göre belirlenir.
**Not:** Otel gelir yönetiminin standart raporu; restoran tarafında neredeyse hiç yok. Geçen yıl verisi olmadan da çalışır — ilk aydan itibaren iş görür.
**Zorluk: kolay/orta.**

#### 4.3 Gerçek oturma süresi — kişi sayısı, kanal ve masa kırılımlı
**Hangi rakam:** "Oturdu" ile "tamamlandı" arasındaki gerçek süre; 2 / 4 / 6+ kişi ayrımıyla, vardiyaya ve kanala göre. Yanında ayarlardaki varsayılan süre.
**Nasıl gösterilir:** "2 kişilik masalar ortalama 1 sa 18 dk oturuyor, ayarın 2 saat. 4 kişilik masalar 1 sa 52 dk, ayarın 1,5 saat — bu masalarda çakışma riski var."
**Hangi kararı değiştirir:** Planlanan "grup büyüklüğüne göre oturma süresi" ayarının **hangi sayıya** kurulacağını bu rapor söyler; şu an tahminle girilecek. 2 kişilik masaya 2 saat ayırırken gerçek 78 dakikaysa her masada 40 dakika bedava veriliyor.
**Şart:** Ancak "tamamlandı" düzenli işaretlenirse doğru çalışır. Yani 1.4 (sayaç) ve 1.19 (POS) ön koşul; 6 numaralı tasarım kuralı (veri kalitesi rozeti) burada zorunlu.
**Zorluk: orta.**

#### 4.4 RevPASH — koltuk-saat başına ciro
**Hangi rakam:** Ciro ÷ (koltuk sayısı × açık olunan saat). Saat saat çubuk grafik.
**Nasıl gösterilir:** "20:00 dilimi 47 TL/koltuk-saat, 22:00 dilimi 91 TL/koltuk-saat."
**Hangi kararı değiştirir:** "Dün doluyduk" cümlesini ölçülebilir bir cümleye çeviriyor. Klasik örnek: A mekânı %85 doluluk × 55 birim = 47 RevPASH; B mekânı %60 doluluk × 85 birim = 51 RevPASH — **daha boş olan daha çok kazanıyor.** Kulüpte 22:00 öncesi RevPASH düşükse karar hazır: erken saate indirimli menü, geç saate minimum harcama.
**Neden değerli:** Avrupa'da (aleno, CoverManager) ortak dil olmuş, Türkiye'de hiçbir rezervasyon programında yok. **Gereken her şey elimizde:** hesap tutarı, kişi sayısı, koltuk sayısı, çalışma saatleri.
**Zorluk: kolay/orta.**

#### 4.5 Koltuk doluluğu ile masa doluluğunun makası
**Hangi rakam:** Aynı grafikte iki çizgi — masaların yüzde kaçı dolu, koltukların yüzde kaçı dolu.
**Nasıl gösterilir:** "Cumartesi 21:00: masaların %94'ü dolu, koltukların %58'i dolu."
**Hangi kararı değiştirir:** Aradaki makas doğrudan "salon planını değiştir" kararıdır. Yanına **az kişiyle satılan masa listesi**: "Masa 12 (6 kişilik) son 30 günde 41 kez satıldı, ortalama 2,4 kişi oturdu, kaybedilen koltuk-saat 118." Öneri: böl, ya da minimum 4 kişi kuralı koy.
**Neden biz yapabiliriz:** Rakiplerin çoğu masayı soyut kutu olarak tutuyor; bizde gerçek ölçü ve koltuk sayısı var.
**Zorluk: kolay.**

#### 4.6 Masa ve salon bazlı ciro haritası
**Hangi rakam:** Salon planının üstünde ısı haritası — hangi masa ne sıklıkta seçildi VE ortalama ne kadar ciro yaptı. Bölge bazlı kırılım (teras, mezanin, sahne önü, bahçe).
**Hangi kararı değiştirir:** Salon planını değiştirme, terası büyütme kararı; gece kulübünde VIP masa fiyatlamasının dayanağı.
**Bizde durum:** Masa istatistiği var ama **sayı** bazında. Üstüne hesap tutarını koymak bir çarpma işlemi.
**Zorluk: kolay.**

#### 4.7 Kanal dağılımı değil, kanal başına DEĞER
**Hangi rakam:** Her kanal için beş sütun: rezervasyon sayısı, **kişi başı ortalama harcama**, iptal oranı, no-show oranı, **kaç gün önceden yapıldığı**.
**Nasıl gösterilir:** "Instagram linkinden gelenin kişi başı harcaması 480 TL, no-show %14. Telefonla gelenin 720 TL, no-show %3."
**Hangi kararı değiştirir:** Instagram'dan gelene kapora iste; telefona daha çok adam koy; kampanyayı en çok dönüşen kanala yap.
**Ek not:** Kanal/kaynak alanı **kapalı liste** olmalı, serbest metin değil — kategoriler tutarsız girilirse hangi kanalın salonu doldurduğu hiç anlaşılmaz. Kulüp için ek kategoriler: bilet, **ücretsiz/tanıdık girişi (comp)**, PR listesi, VIP rezervasyon, walk-in, personel onayı.
**Zorluk: kolay.**

#### 4.8 İptal panosu: ne kadar önce iptal edildi + no-show'un TL karşılığı
**Hangi rakam:** (a) İptallerin dağılımı: 24 saatten önce / 24-5 saat / son 5 saat / hiç haber vermeden. (b) İptal sebebi dağılımı. (c) Kim iptal etti: yeni misafir mi müdavim mi, hangi kanaldan gelmişti. (d) No-show'un parası: gelmeyen kişi × kişi başı ortalama hesap.
**Nasıl gösterilir:** "Geçen ay no-show kaybın 84.000 TL. İptallerin %41'i son 5 saatte geldi — bu masaların yarısı yedek listesiyle doldurulabilirdi."
**Hangi kararı değiştirir:** İptal politikası eşiğini veriye bağlar; hatırlatma mesajının kaç saat önce atılacağını söyler; ve **kapora özelliğini satan ekran budur.**
*(Dolaşan "kart provizyonu no-show'u %65 düşürür / kapora %55 / SMS %30-50" tablosu sektör iddiası — bağımsız ölçüm yok. Türkiye no-show oranı için dolaşan %18-25 de sadece satıcı bloglarında geçiyor; ekranda kıyas çubuğu koyulacaksa "sektör tahmini" diye yazılmalı.)*
**Zorluk: kolay/orta.**

#### 4.9 Birinci ziyaretten ikinci ziyarete dönüşüm ve kohort tutundurma
**Hangi rakam:** (a) Bu ay ilk kez gelenlerin yüzde kaçı ikinci kez geldi — **en büyük kaçak burada.** (b) Misafirler ziyaret sayısına göre kademelere ayrılıyor (1 / 2-3 / 4+), her kademenin kişi sayısı ve **ciroya katkısı**. (c) Ziyaretler arası ortalama gün. (d) Kohort tablosu.
**Nasıl gösterilir:** "Bu ay 340 yeni misafir geldi, sadece 41'i ikinci kez geldi (%12)."
**Hangi kararı değiştirir:** Instagram reklamının, yeni şefin, yeni menünün işe yarayıp yaramadığını ölçen tek gerçek rakam. "Kaç kişi geldi" herkeste var; "gelenlerin kaçı geri dönüyor" işletme sağlığıdır. Japon kaynaklarının ortak vurgusu: 3. ziyarete ulaşan artık müdavimdir, **asıl savaş 1→2 arasında.**
**Bizde durum:** Ziyaret geçmişi zaten tutuluyor. **İstatistik sayfasına eklenebilecek en değerli tek şey bu olabilir.**
**Zorluk: orta.**

#### 4.10 Uykuya dalan müdavim listesi (RFM)
**Hangi rakam:** Her misafir üç boyutla puanlanıyor: son geliş, sıklık, harcama. En kullanışlı türev: **sıklığı bozulmuş müdavimler** — "eskiden 18 günde bir gelirdi, 47 gündür yok."
**Nasıl gösterilir:** "Geçen yıl ayda iki kez gelen 34 misafiriniz 3 aydır gelmedi. Tahmini kayıp ciro: 246.000 TL." Altında "bu kişilere mesaj at" düğmesi.
**Hangi kararı değiştirir:** Doğrudan aksiyon listesi. Bloom Intelligence'ın tespiti: *ziyaret sıklığındaki düşüş en erken kaçış sinyalidir ve ciro çizgisi hâlâ sağlıklı görünürken ortaya çıkar.*
**Bizde durum:** Müdavim etiketi var ama **statik**. Tersi hiç hesaplanmıyor: müdavimken susan kişi. RFM verisini yapay zekâ kart özetine beslemek özeti çok güçlendirir.
**Zorluk: orta.**

#### 4.11 30 dakikalık saat dilimi ısı haritası
**Hangi rakam:** Haftanın günü × saat matrisi, hücrede o dilimde masaya oturan kişi sayısı.
**Hangi kararı değiştirir:** Planlanan **vardiya** özelliğinin veri temeli tam olarak bu. Ayrıca personel planı, mutfak hazırlığı ve "erken saate indirim" kararı.
**Bizde durum:** Veri hazır, sadece görselleştirme. **Zorluk: kolay.**

#### 4.12 Yedek / bekleme listesi kurtarma metriği
**Hangi rakam:** İptal edilen rezervasyonların kaçı yedekten dolduruldu, kurtarılan tahmini ciro; yedeklerin kaçı gerçekten masaya geçti; kaç yedek boşuna bekletildi. Kuyruk açılırsa: söylenen süre vs gerçek süre, vazgeçip gidenlerin oranı.
**Nasıl gösterilir:** "Bu ay iptal edilen 220 rezervasyonun 134'ü yedekten dolduruldu (%61). Kurtarılan tahmini ciro: 402.000 TL."
**Hangi kararı değiştirir:** Bu bir karar raporundan çok **yenileme raporu**. YEDEK rezervasyon özelliği pazarda benzersiz ama ölçülmediği için görünmez. "Geçen yıl bu program size 402.000 TL kurtardı" cümlesi, aboneliği yenileten tek cümledir.
**Zorluk: orta.**

#### 4.13 Online rezervasyon dönüşüm hunisi
**Hangi rakam:** Sayfayı kaç kişi açtı → kaçı saat seçti → kaçı tamamladı → kaçı doluluğa çarptı → kaçı yarıda bıraktı. Kanal kırılımlı.
**Nasıl gösterilir:** "Bu ay 180 kişi rezervasyon denedi, 47'si dolu diye döndü, 26'sı KVKK onayında bıraktı."
**Hangi kararı değiştirir:** Kapasite ayarı, form uzunluğu, hangi adımın misafiri kaçırdığı. **KVKK dikkat:** yarıda bırakana mesaj atabilmek için iletişim onayının telefon alanından önce alınmış olması gerekir; onay yoksa sadece istatistik tutulur.
**Zorluk: kolay.**

#### 4.14 Boşa giden masa-saat ve ölü dakika
**Hangi rakam:** (a) İki rezervasyon arasında kalan, yeni grup sığmayacak kadar kısa boşlukların toplamı. (b) Masa kalktıktan sonra yeniden hazır olana kadar geçen ölü süre.
**Nasıl gösterilir:** "Bu akşam 14 masa-saat boşa gitti, en çok 19:30-20:30 arası ve en çok 4'lü masalarda." / "Gecede 14 masa × 18 dakika ölü süre = 4 saat kayıp servis."
**Hangi kararı değiştirir:** Doluluk oranı yanıltıcıdır — %80 doluluk, aralardaki 40 dakikalık deliklerle birlikte gerçekte %60 olabilir.
**Not:** OpenTable boşlukları çizelgede **görsel** olarak işaretliyor ama sayısal rapora çeviren bir sistem **bulunamadı — doğrulanmadı.** Ölü dakika için 1.4'teki "kalktı/kuruluyor" durumu ön koşul.
**Zorluk: orta.**

#### 4.15 Masa devir hızı — gecede kaç tur
**Hangi rakam:** Masa başına ve salon başına, servis boyunca kaç ayrı grup oturdu. Gün, masa boyu ve saat kırılımlı.
**Neden ayrı bir madde:** RevPASH parayı ölçüyor, oturma süresi tek masayı ölçüyor; devir hızı ikisinin arasındaki **operasyon** rakamı ve personelin anlayacağı tek sayı: "bu masa dün 2,4 kere döndü, bugün 1,6." Uzak Doğu'da restoran yönetiminin ana göstergesi; Türkiye'de kimse bakmıyor çünkü kimse ölçmüyor.
**Bizde durum:** Oturdu/tamamlandı damgaları ve masa kimliği var; sadece sayma işi. 1.4'teki "kalktı/kuruluyor" eklenince gerçek devir ile teorik devir arasındaki fark da çıkıyor — "bu masa 3 kere dönebilirdi, 2 kere döndü, aradaki farkın 40 dakikası toplama gecikmesi."
**Zorluk: kolay.**

---

### ÖNCELİK B — Eğlence mekânına özel (ilk hedef pazarın kalbi)

#### 4.16 Minimum harcama gerçekleşme raporu
(Özellik anlatımı: 1.1.) Masa masa taahhüt / gerçekleşen / fark; gece sonunda "minimumu tutmayan masalar" listesi; bölgeye göre ortalama gerçekleşme.
**Sektörden itiraf:** Gece kulübü yazılımı karşılaştırmalarında bile mekânların minimumları gerçekleşen hesaplarla eşleştirmek için hâlâ "pazartesi sabahı CSV export" alıp elle karşılaştırdığı yazıyor — **hiçbir üründe düzgün raporlanmıyor.** **Zorluk: orta.**

#### 4.17 Sanatçı / DJ gecesi karşılaştırması
(Özellik anlatımı: 2.4.) Etkinlik satırlı tablo — maliyet, kişi, kişi başı harcama, doluluk, talebin gelme hızı, no-show, net katkı. Sıralanabilir. **Zorluk: orta.**

#### 4.18 PR / promoter performansı
(Özellik anlatımı: 2.3.) PR başına listeye yazılan, gelen, **geliş oranı**, ciro, hak ediş; CSV çıktısı; her satır "bekliyor / ödendi". **Zorluk: orta.**

#### 4.19 Kapılar açılmadan bugünün garantili cirosu
**Hangi rakam:** Onaylanmış masalar + alınan kaporalar + taahhüt edilen minimumlar = bu gecenin garanti altındaki cirosu. Gece boyunca canlı güncellenen bir gelir haritası; salon planının üstünde masa masa para.
**Hangi kararı değiştirir:** Akşam 20:00'de "bu gece iyi mi kötü mü" sorusunun cevabı; ekstra PR çağırma, DJ'i uzatma, bar personelini eve gönderme kararı.
**Neden ayrı:** İstatistik sayfasını "dün ne oldu"dan "şu an ne oluyor"a taşıyan fikir. **Zorluk: orta.**

#### 4.20 Fazla kabul isabet raporu
(Özellik anlatımı: 3.14.) Önerilen fazla kabul oranı ile gerçekleşen no-show'un karşılaştırması; kaç kez tuttu, kaç kez misafir bekletildi, ortalama bekletme süresi. **Özelliğin kendisini işletmeciye güvendiren tek ekran** — bu rapor olmadan 3.14 satılmamalı. **Zorluk: orta.**

---

### ÖNCELİK C — Personel, para ve tahmin

#### 4.21 Personel bazlı iki rakam
- **"Rezervasyonu kim aldı":** personel başına aldığı rezervasyon, gelen kişi, no-show oranı, getirdiği ciro. Aynı 100 çağrının birinde 60, diğerinde 35 rezervasyona döndüğünü görmek eğitim ve prim kararı doğurur.
- **Karşılama ve ilk servis süresi:** "geldi → oturdu" ve "oturdu → ilk sipariş" farkları; saat, salon ve garson kırılımlı. Türkiye'de kötü Google yorumlarının içinde en çok geçen cümle "kimse ilgilenmedi". Bu iki sayı bugüne kadar hiç ölçülmedi. (İkinci yarısı için POS'tan ilk sipariş saati gerekiyor.)
**Uyarı:** Personel ölçümü hassas konu; sıralama tablosu oyunlaştırma olarak konumlanmalı. **Zorluk: orta.**

#### 4.22 Vardiya tahmini ve önerilen personel
**Hangi rakam:** Yarın/gelecek hafta için beklenen kişi (rezervasyon + tahmini walk-in − tahmini no-show), saat dilimi başına gereken personel (mekânın kendi girdiği "bir garson kaç kişiye bakar" katsayısıyla), planlanan personel ve fark. Gün sonunda tek satır: **kapak başına işçilik maliyeti.**
**Hangi kararı değiştirir:** "Bu gece kaç kişi çağıralım" kararı bugün tamamen sezgiyle veriliyor. *(Tahmine dayalı planlamanın işçiliği %15 düşürdüğü iddiası sektör iddiası — bağımsız ölçüm yok.)*
**Zorluk: orta.**

#### 4.23 Şubeler arası karşılaştırma
**Hangi rakam:** Tüm şubeler yan yana: gerçekleşen vs tahmin, doluluk, kişi başı ortalama harcama ve **yön oku**, no-show, yorum puanı. "En kötü 3 şube" tek tıkla.
**Bizde durum:** Çok şubeli hesap ve gün karşılaştırma var ama **şubeler arası** karşılaştırma yok. İki mekânı olan sahibin en çok bakacağı ekran bu ve zincire satarken ilk sorulan şey.
**Ek ihtiyaç:** aleno kullanıcılarının şikâyeti — çok şubeli yapıda bir misafiri bulmak için her şubeyi ayrı aramak gerekiyor. **Şubeler arası tek misafir görünümü** de bu başlığın parçası. **Zorluk: orta.**

#### 4.24 Sabah özeti ve mobil canlı skor kartı
**Hangi rakam:** Tek sayfa, sabah gönderilen özet: dün ne oldu (kişi, ciro, no-show, iptal, en yoğun saat), bugün ne bekleniyor, dikkat edilecekler (VIP'ler, özel günler, riskli rezervasyonlar), **geçen haftanın aynı günüyle** karşılaştırma (7 numaralı tasarım kuralı). Ayrıca müdürün telefonunda vardiya sırasında canlı skor kartı.
**Neden değerli:** İşletmeci rapor ekranına girmez; rapor ona gelmelidir. Tenzo'nun ölçümü: bu özeti elle hazırlamak müdürün günde 20-45 dakikasını alıyor. OpenTable Pro'nun 499 $/ay pakete koyduğu "huddle report" tam olarak bunun vardiya öncesi hâli.
**Türkiye'ye uyarlaması:** E-posta değil **WhatsApp**. Bu, ürünü her sabah hatırlatan bir alışkanlık yaratır. **Zorluk: orta.**

#### 4.25 Anomali uyarısı ve doğal dille soru sorma
**Hangi rakam:** Grafik değil, cümle. "Salı 21:00'de 6 kişilik masa talebi karşılanamıyor, iki masayı birleştirilebilir yap." / "Servis hızı puanın son 3 haftadır düşüyor." Yanında öneriyi doğrulayan veri.
**İkinci parça:** Kutuya "geçen ay cumartesileri neden düştü?" yazıp cevap alabilmek.
**Neden biz yapabiliriz:** **Claude entegrasyonu zaten çalışıyor** (kart özeti). Aynı motoru istatistik verisine bağlamak, en düşük maliyetli premium özellik adayı. İşletmeci grafik okumak istemiyor, ne yapacağını öğrenmek istiyor. **Zorluk: orta.**

---

## 5. Türkiye gerçekleri

### 5.1 WhatsApp maliyeti — SMS'ten çok ucuz
Meta 1 Temmuz 2025'ten beri **teslim edilen şablon mesaj başına** faturalıyor. **1 Nisan 2026'da** (daha önce yanlışlıkla 1 Ocak yazılmıştı) utility ve authentication tarifeleri düşürüldü; Türkiye önceki 0,0053 USD'den 0,0009 USD'ye indi (%80+ indirim).

| Kategori | Birim (USD) | ≈ TL |
|---|---|---|
| Utility (onay, hatırlatma, teyit) | **0,0009 – 0,0014** (kaynaklar çelişiyor) | ~0,04 – 0,06 TL |
| Authentication | 0,0009 | ~0,04 TL |
| Marketing (kampanya) | **~0,0118** | ~0,53 TL |
| Service — misafirin başlattığı 24 saatlik pencere | **ücretsiz** | 0 |

**Utility ile marketing arasındaki fark 8 ila 13 kat.** Kesin rakam seçilecek BSP'den **yazılı alınmalı**; ürün içine tek sabit rakam yazılmamalı. Kural net: utility'de **hiçbir tanıtım cümlesi olamaz.** "Rezervasyonunuz onaylandı: 21:00, 4 kişi" utility'dir; "…bu akşam kokteyllerde %20 indirim var" cümlesi mesajı marketing'e çevirir. **Şablon ekranına "bu mesaj tanıtım içeriyor mu?" kilidi konmalı** — hem maliyet hem İYS yükümlülüğü buna bağlı.

Karşılaştırma — toplu SMS: iletiMerkezi'nde 10.000'lik pakette ~0,088 TL, 500'lük pakette 0,378 TL; Netgsm'de 1.000 SMS 899 TL yani ~0,90 TL. **Sağlayıcılar arasında 10 kata kadar fark var.**
**Hesap:** Ayda 1.000 rezervasyona 3 mesaj gönderen mekân — SMS ile ~2.700 TL, WhatsApp utility ile ~100-150 TL. Aylık ~2.600 TL tasarruf; yazılımın kendi bedelini çıkarıyor.

**Düğmeli mesaj destekleniyor:** şablon başına en fazla 3 hızlı yanıt düğmesi, düğme metni en fazla 25 karakter. Planlanan "5 saat önce hatırlatma + Geliyorum/İptal" teknik olarak mümkün ve utility'de kalabilir. **En değerli detay:** misafir düğmeye bastığı anda 24 saatlik ücretsiz pencere açılıyor.

**Şablon onayı:** Utility şablonları çoğunlukla dakikalar içinde onaylanıyor. En sık ret sebebi yanlış kategori ve belirsiz değişken. **Metni değiştirmek yeniden onay gerektirir, değişken sayısını değiştirmek yeni şablon demektir** — kullanıcı şablon metnini serbestçe düzenleyememeli.
**Sağlayıcı seçerken sor:** "Meta'da BSP misiniz yoksa alt bayi mi?" ve "Meta tarifesinin üstüne ne ekliyorsunuz?"

### 5.2 İYS — rezervasyon mesajları kapsam DIŞI
Yönetmelik, "satın alma, teslimat veya benzeri durumlara ilişkin bildirimleri" önceden onay aranmayan iletiler arasında sayıyor; şart tek: *"bu tür bildirimlerde herhangi bir mal veya hizmet özendirilemez veya tanıtımı yapılamaz."* Ayrıca alıcı kendisiyle iletişime geçilmesi için iletişim bilgisini verdiyse, temin edilen hizmete ilişkin iletiler için ayrıca onay aranmıyor — online forma telefonunu yazan misafir tam bu durumda.

- **İYS gerekmez:** rezervasyon onayı, hatırlatma, masa hazır bildirimi, iptal teyidi.
- **İYS + izin şart:** doğum günü kutlaması, "yeni menümüz çıktı", "bu cuma DJ var", memnuniyet anketi.

**Satışta kullan:** Rakiplerin çoğu "İYS lazım" diye korkutuyor; rezervasyon mesajları için gerekmediğini net söylemek fark yaratır.

**Ceza (2026):** Onaysız veya onaya aykırı ileti **2.859 – 14.309 TL**; gönderici/içerik bilgisi olmaması 2.859 – 28.620 TL. **Asıl tehlike:** bir defada birden fazla kişiye gönderilen iletilerde ceza **on katına kadar** artırılabiliyor — toplu kampanya SMS'i **143.090 TL'ye kadar.**
**Süreler:** Elektronik alınan onay 3 iş günü içinde İYS'ye yüklenmezse **kanunen geçersiz.** Ret talebinde 3 iş günü içinde gönderim durmalı. Kayıtlar **10 yıl** saklanmalı.
**Maliyet:** VatanSMS üzerinden Temel Hizmetler (manuel, sınırsız) ücretsiz; İLETİ-5 (5.000 adres) yıllık 4.601 TL. Tek şubeli mekân için ücretsiz kademe yeter.
**Belirsiz alan:** Kanun "kısa mesaj hizmeti **gibi** vasıtalar" diyor — yani WhatsApp'tan gönderilen pazarlama mesajı hukuken ticari elektronik iletidir, ama İYS'nin teknik kanalları sadece SMS, e-posta ve arama. Ticaret Bakanlığı'nın WhatsApp'a özel görüşü bulunamadı — **doğrulanmadı.** Güvenli yol: pazarlama WhatsApp'ı için de izin al ve sakla.
**Ürün karşılığı:** Müşteri kartında "İYS: izinli / izinsiz / ret" rozeti; toplu mesaj ekranında "seçili 420 kişiden 118'i izinsiz, gönderilmeyecek" uyarısı; pazarlama izni rezervasyon onayından **ayrı kutu.**

### 5.3 KVKK — üç önemli değişiklik
**VERBİS eşiği çok yükseldi:** Muafiyet şartı 50'den az çalışan **ve 100 milyon TL'den az** yıllık bilanço. Yani tek şubeli, 50'den az çalışanlı bir gece kulübü/meyhane VERBİS'e kayıt olmak zorunda değil. Ama muafiyet **imha yükümlülüğünü kaldırmıyor.**

**Cezalar (2026 — ürün içi metinlerde bunlar kullanılmalı):**

| İhlal | Alt | Üst |
|---|---|---|
| Aydınlatma yükümlülüğü | 85.437 TL | 1.709.200 TL |
| Veri güvenliği tedbirleri | 256.357 TL | 17.092.242 TL |
| Kurul kararını uygulamama | 427.263 TL | 17.092.242 TL |
| VERBİS kayıt/bildirim | 341.809 TL | 17.092.242 TL |

*(Not: "izinsiz SMS" cezası KVKK değil, 6563 sayılı e-Ticaret Kanunu kapsamındadır — 5.2.)*

**Saklama süresi:** Mevzuatta rezervasyon verisi için sabit bir süre **yok.** İşletme kendi politikasında belirler. **Ürün karşılığı:** süreyi işletmeye seçtireceğiz, otomatik uygulayacağız ve **imha kaydını loglayacağız** (denetimde istenir). Silme talebine en geç **30 gün** içinde cevap zorunlu.

**⚠️ En önemli madde — yurt dışına veri aktarımı:** 7499 sayılı Kanun'la KVKK m.9 değişti (01.06.2024). Artık "açık rıza ile yurt dışına aktarım" genel kural değil, **istisna**; uygun güvence yöntemi **standart sözleşme** ve imzalardan itibaren **5 iş günü içinde Kurum'a bildirim zorunlu.**
**Bu doğrudan bizi ilgilendiriyor:** Yapay zekâ kart özeti misafir notlarını Claude API'ye (ABD) gönderiyor. Aynı şey yurt dışı bulut sunucusu ve WhatsApp altyapısı için de geçerli.
**İki çözüm:** (a) AI'a giden veriyi **maskele** — isim ve telefon çıkar, "SADIK misafir, 12 ziyaret, ortalama 4.200 TL, notlar: …" gibi gönder; (b) müşteriye hazır standart sözleşme + bildirim rehberi ver (satılabilir premium, 3.12).

**Alerji notu ayrı bir konu:** Alerji bilgisi KVKK m.6 kapsamında **özel nitelikli sağlık verisi** — ayrı açık rıza, dar erişim ve maskeleme gerektiriyor. Doğru kurgu: ayrı "sağlık notu" alanı, ayrı onay, sadece yetkili rollerin görmesi, dışa aktarımda maskeleme. "KVKK m.6 uyumlu alerji yönetimi" satılabilir bir başlık — **rakiplerin hiçbiri bunu ürün özelliği olarak konumlandırmamış.**

### 5.4 Kapora ve kart provizyonu
**Ön provizyon (para bloke edilir, çekilmez) üç yerli altyapıda var:** iyzico, PayTR, Param. iyzico kullanım alanı olarak otel rezervasyonu ve etkinlik teyidini sayıyor — restoran kaporası bunun aynısı.

**Sözleşme öncesi yazılı sorulacak üç soru (üçünün de açık dokümanında yok):**
1. **Blokaj kaç gün geçerli?** İleri tarihli rezervasyonda blokaj düşerse kaporası olmayan rezervasyon kalır. Kısa çıkarsa akış "gerçek tahsilat + iade" olarak kurulmalı.
2. **Kısmi çekim mümkün mü?** No-show'da tutarın bir kısmını almak isteyebiliriz.
3. **İptalde blokaj kaç günde çözülür?** "Param neden hâlâ bloke" telefonu doğrudan restorana gidiyor.

**Komisyon:** PayTR %0,99-1,49; iyzico %1,95 (12 taksitte %3,45). Komisyon tek başına yetmez — **işlem başı sabit ücret, bloke süresi ve vade** birlikte bakılmalı.
**3D Secure:** Türkiye'de e-ticaret için yasal olarak mutlak zorunlu değil (kaynaklar çelişiyor — **doğrulanmadı, avukata teyit ettirilmeli**), ama çoğu sanal POS sözleşmesi şart koşuyor. **Pratik karar: kapora akışını 3D zorunlu kur.**
**Ödeme sağlayıcısına kilitlenme:** Now Book It'in şikâyeti sadece Stripe kullanılabilmesi. Türkiye için: iyzico / PayTR / banka sanal POS seçenekli olsun.
**Kültürel not:** Türk misafiri peşin para vermeye direniyor ama **blokajı ve "kart kaydet, gelirsen bir şey olmaz"ı kabul ediyor.** Kaporayı "ceza" değil "peşinat" olarak kurgulamak kabul edilebilirliği değiştiriyor. **Havale + dekont akışı ise bugün fiilen kullanılan yöntem — bkz. 3.4.**

### 5.5 e-Adisyon — bizi ilgilendiren tek vergi başlığı
e-Adisyon VUK 509 sayılı Tebliğ ile düzenlendi; kapsam **lokanta, restoran, kafe, bar ve benzeri masa servisli işletmeler** — yani birincil hedef kitlemiz. 2026'da henüz herkes için zorunlu değil; e-Fatura/e-Arşiv mükellefi olan yiyecek-içecek işletmeleri ve GİB'in bildirdiği mükellefler kapsamda, zorunluluk geldiğinde en az 3 ay geçiş süresi veriliyor. 10 yıl dijital saklama şartı var.
*(Ceza: kaynaklarda "elektronik düzenlenmesi gereken belgenin uygun formatta düzenlenmemesi hâlinde belge başına 17.000 TL" geçiyor; kaynak bir yazılım firması blogu, GİB metni doğrudan görülmedi — **doğrulanmadı**, satış argümanı yapılmamalı.)*

**Bizim için anlamı:** e-Adisyon yaygınlaştıkça adisyonu POS açacak. **"Bu masa şu rezervasyona ait" bilgisini POS'a vermek ve hesap tutarını geri almak** doğal bir entegrasyon noktası doğuruyor — elle girilen hesap tutarı sorununun (1.19) asıl çözümü bu. Ayrıca kapora alınırsa e-Arşiv faturası kesilip mekâna gelindiğinde hesaba mahsup edilmesi gerekiyor.

**Düzeltme:** Önceki taslakta "konaklama ve yiyecek-içecek sektöründe e-Fatura eşiği 500 bin TL, yani hedef müşterilerimizin neredeyse tamamı zaten mükellef" yazıyordu — **yanlış.** 500.000 TL eşiği e-ticaret, gayrimenkul, motorlu taşıt ticareti ve internet reklamcılığı için. Yiyecek-içecek için özel eşik yok: genel kural 2025 brüt satış hasılatı **3 milyon TL ve üzeri → 1 Temmuz 2026.** (Konaklama tarafında ayrı kural var: Bakanlık/belediye belgeli konaklama tesisleri ciro şartı aranmaksızın e-Fatura mükellefi.) e-Fatura ve e-Defter muhasebenin işi, rezervasyon programının değil.

### 5.6 Menüde alerjen ve kalori zorunluluğu — takvim ve 14 grup
**Takvim:** Ulusal zincirler **1 Temmuz 2026**; aynı ilde 3+ şubeli işletmeler ve diğerleri alerjen **31 Aralık 2026**, kalori **31 Aralık 2027**. Sunum serbest (basılı menü, tahta, dijital ekran veya karekod).

**Eksik kalan iki zorunluluk:** Menüde ürünün **alkol içerip içermediği** ve **domuz türevi içerip içermediği** de beyan edilmek zorunda. Ayrıca **14 alerjen grubu** tanımlı: gluten, kabuklu deniz ürünleri, yumurta, balık, yer fıstığı, soya, süt, sert kabuklu meyveler, kereviz, hardal, susam, sülfitler, lupen, yumuşakçalar.

**Ürün karşılığı (raporda daha önce yoktu):**
- Rezervasyon notundaki "alerji" alanı serbest metin değil **bu 14 grubun kapalı listesi** olmalı.
- Alkol/domuz türevi tercihi **ayrı bir "misafir hassasiyeti" alanı** olmalı — helal hassasiyeti Türkiye'de sık ve bu **alerji değil**, yani sağlık verisi sayılmıyor, KVKK yükü çok daha hafif. Bu ayrım yapılmazsa her helal tercihi özel nitelikli veri gibi işlenmiş olur.
- Rezervasyondaki alerjen bilgisinin mutfağın alerjen tablosuyla eşleşip "bu masada fıstık alerjisi var, şu ürünler verilmez" şeklinde düşmesi, rezervasyon programının mutfakla konuştuğu ilk gerçek nokta olabilir — **rakiplerin hiçbiri bu düzenlemeyi ürüne bağlamamış.**

### 5.7 SMS ve yemek kartları — iki satır
- **SMS:** 1 Nisan 2026'da SMS gönderim panellerine e-imza ile giriş zorunluluğu geldiği söyleniyor (kaynak bir e-imza satıcısı, BTK karar metni bulunamadı — **doğrulanmadı**). Stratejik olarak zaten WhatsApp'a yaslanıyoruz; SMS ikincil kanal. Tek pratik not: operatör spam filtreleri aynı metnin toplu gönderimini engelliyor, **metin varyantları arasında rastgele seçim** teslim oranını yükseltiyor (Restoplace'in numarası) — şablon yapısına baştan koymak ucuz.
- **Yemek kartları (Multinet, Pluxee, Edenred, Setcard, Metropol, Ticket):** Gece kulübü/meyhanede düşük öncelikli, gün boyu işleyen işletmelere geçince kritik. Bugünden yapılacak tek şey: **hesap tutarı girilirken ödeme tipi seçimi (nakit / kart / yemek kartı)** — sonra "yemek kartı cirosu ve komisyon yükü" raporu kendiliğinden çıkar. *(Not: Sodexo 2024'te Pluxee oldu; arayüzde "Sodexo" yazmak bizi eski gösterir.)*

### 5.8 Pazar penceresi: Quandoo Türkiye kapanıyor
Quandoo faaliyet gösterdiği **tüm pazarlarda** (Türkiye dâhil) kapanıyor: duyuru 24 Mart 2026, **son rezervasyon günü 30 Eylül 2026**, tüketici servisleri 1 Ekim 2026'da durdu, altyapı 31 Aralık 2026'da tamamen kapanıyor. Sadakat puanları 30 Haziran 2026'ya kadar kazanılıyordu. *(Önceki taslaktaki "son 6 ay hizmet bedelleri sıfırlanmış" iddiası doğrulanamadı — çıkarıldı.)*

**Stratejik düzeltme — pencere sanıldığı kadar boş değil:** aleno, Carbonara, Sugarvine, RestoManager ve Tavooli çoktan "Quandoo alternatifi" sayfası açmış. **Ama Türkçe böyle bir sayfa yok.**
**Doğru aksiyon:** İngilizce göç yarışına girmek değil, **"Quandoo kapanıyor — Türkçe geçiş rehberi + ücretsiz veri aktarımı"** sayfasını Türkçe açmak. Yanına Excel/CSV içe aktarma aracı (2.10). Ayrıca Quandoo'nun kişi başı kuver + no-show cezası modeli, "sabit ücret, komisyon yok, ceza yok" konumlandırmamız için hazır bir karşıt örnek.

---

## 6. Fiyat ve paketleme

### Önerilen paket yapısı (tartışılmak üzere)

|  | GİRİŞ | STANDART | KULÜP / PRO |
|---|---|---|---|
| **Kime** | 20-40 masalık meyhane/restoran | 40-80 masa, çok kanal | gece kulübü, çok şube |
| **Fiyat bandı** | 0 – 690 TL | 1.290 – 1.790 TL | 2.900 – 4.900 TL |
| **İçerik** | rezervasyon, salon planı, **online rezervasyon sayfası**, kişi kartı, temel istatistik, Google + Apple linki, çevrimdışı çalışma | + WhatsApp mesaj katmanı, yedek otomasyonu, kuyruk, yapılandırılmış etiket, dışa aktarma, **istatistiklerin tamamı**, çok dil | + minimum harcama & masa paketi & fiyat bölgesi, PR takibi, kapı modu + kara liste, bilet/ön ödeme + iftar modu, kapora motoru, tek gelen kutusu, AI özet + anomali, şubeler arası, API |

**Mantık:**
1. **Online rezervasyon sayfası GİRİŞ pakete konsun.** Pazar lideri Rezervem onu ORTA pakete koymuş — satış görüşmesinde doğrudan söylenecek cümle bu.
2. **Para gece kulübü modülünden, ödemeden ve istatistik/AI'dan gelsin.**
3. **Fiyat yayımlansın.** Türkiye'deki rezervasyon oyuncularının hiçbiri yayımlamıyor.
4. **Sezonluk mekân** (beach club, yazlık) için "kapalı ayda ödeme yok".

### Pazar konsolide oluyor — bu bizim lehimize
2025-2026'da olanlar tek tabloda:
- **Quandoo tamamen kapandı** (30 Eylül 2026 son rezervasyon, 31 Aralık 2026'da altyapı).
- **Tock, Amex'in Resy'si içinde eritildi** — 11 Ağustos 2026'da Tock envanteri Resy'ye geçti, Tock'un sitesi ve uygulaması kapandı, restoran yazılımı Resy'nin parçası olarak devam ediyor. Resy 25.000+ mekâna çıktı; OpenTable 60.000+ ile hâlâ lider.
- **SevenRooms artık DoorDash'in.** (Rapor boyunca SevenRooms'un zayıf yanları sayılıyor ama arkasında bir dağıtım devi var — hafife alınmamalı.)
- **OpenTable 2025'te SevenRooms entegrasyonunu tek taraflı kesti.**

**Anlamı:** Yazılım seçmek giderek "bir ekosisteme bağlanmak" kararına dönüşüyor ve işletmeci bundan rahatsız. *"Bizim pazar yerimiz yok, komisyon yok, misafir listesi sizin, ayrılırsanız verinizi tek tıkla alırsınız"* konumlandırması tam bu tabloya karşı yazılmış gibi duruyor. **Satış sunumunun ilk sayfası bu tablo olmalı.**

### Türkiye — POS / adisyon tarafı (KDV hariç, aylık)

| Sistem | Aylık | Öne çıkan |
|---|---|---|
| PixelPOS | 650 TL | En ucuz giriş |
| Menulux | 875 – 2.200 TL | **Çevrimdışı çalışmayı pazarlama başlığı yapmış** |
| Adisyo | 1.040 / 1.540 / 2.150 TL | **Hiçbir pakette rezervasyon YOK.** API modülü 565 TL |
| vRest | 1.200 / 1.800 / 2.500 TL | Yasal takvim içeriğiyle öne çıkıyor |
| Karekodgarson | 1.500 TL | Sadeleştirilmiş |
| ikas | 1.500 – 2.800 TL + 3.000 TL kurulum | |
| Logo | 2.500 – 4.000 TL + 5.000-15.000 TL kurulum | Kurumsal |
| Simpra | ~50 EUR/ay (doğrulanmadı) | Simpra Reservation ayrı ürün |

### Türkiye — rezervasyon / mesaj tarafı

| Sistem | Fiyat | Not |
|---|---|---|
| **Rezervem** | **Yayımlanmıyor** | Giriş: rezervasyon, CRM, raporlar, ön ödeme. Orta: **+ online rezervasyon**. Üst: + geri bildirim, **waitlist, Caller ID**, pazarlama, API |
| Reztoran | Yayımlanmıyor | Exclusive pakette kalan her ay için 500 TL cayma cezası |
| Quandoo TR | Sabit + **kişi başı kuver** + no-show cezası | 30 Eylül 2026'da kapandı |
| FendyChat | 0 / 499 / 1.499 TL | Rezervasyon programı değil, mesaj katmanı |
| adisyon.ai | 18.000 TL/yıl veya işlem başına 1 TL | **doğrulanmadı** — taahhütsüz model fikri değerli |

### Yurt dışı çıpaları

| Sistem | Fiyat | Not |
|---|---|---|
| OpenTable | 149 / 299 / 499 $/ay **+ kapak başına 1-1,5 $** | **En ucuz pakette kat planı, bekleme listesi ve etiketleme YOK** |
| SevenRooms | ~300 – 2.000+ $/ay/lokasyon **+ 5.000-25.000 $ kurulum** | DoorDash'in; fiyat yayımlanmıyor |
| Rex Reservations | **şube başına** 195 / 295 / 395 $/ay | İşlem komisyonu yok |
| Vemos (kapı/ID) | 79 $/ay'dan; sahte kimlik doğrulamalı 199 $/ay | Sadece kapı yazılımı için |
| Tableo | Ayda **100 kuvere kadar ücretsiz** | Ücretsizde kat planı, Google, otomatik mesaj var |
| resOS | Ayda **25 rezervasyona kadar ücretsiz**, sonra 45 €/ay | 25 rezervasyon Türkiye'de bir hafta sonu bile etmez |
| Zenchef Zencall | 5 €/ay | Ek modül fiyatı için iyi bir çıpa |
| EazyDiner Prime (Hindistan) | ~245 ₹/ay, ~2.495 ₹/yıl | Misafir üyeliği modeli çıpası (3.15) |

### Nereye konumlanmalıyız
1. **Saf rezervasyon programı için 800 – 1.800 TL/ay bandı "makul" algılanıyor.** 2.500 TL üstü POS'la kıyaslanmaya başlıyor.
2. **Sabit aylık ücret, kişi başı komisyon yok, ceza yok, misafir listesi sizin.** Bu dört cümle tek başına satış argümanı.
3. **Kademeyi kapasiteye bağla.** 20 masalık meyhaneyle 120 masalık gece kulübüne aynı fiyat verilmez.

---

## 7. İşletmecilerin şikâyetleri — bizim için kontrol listesi

Gerçek kullanıcı yorumlarından (Capterra, G2, App Store, Şikayetvar) süzülen liste. Ayrıntıları 1. ve 2. bölümde ilgili maddelerin altında; burada sadece kontrol listesi:

**Para ve sözleşme** — kişi başı kuver ücreti (OpenTable 1,5 €/kişi, Quandoo 3,5 €/kişi), gizli kurulum ücretleri, otomatik yenilenen sözleşme, cayma cezası, fiyat şeffaflığının hiç olmaması.

**Güvenilirlik** — yoğun saatte çökme (Adisyo'da ~5 saat), destek kuyruğunda 32 dakika bekleme, "her güncelleme yeni sorun getiriyor", **raporların birbirini tutmaması** (aynı dönem bir ekranda 103.000 TL diğerinde 80.000 TL — güveni bitiren tek şey bu), abonelik iptal edildiği hâlde tahsilatın sürmesi.

**Kullanım** — mobil uygulama kötü ya da yok ("uygulama kullanılamaz halde", mobilde salon planı görünmüyor), servis anında donma, **karmaşık kurulum** (OpenTable'da bekleme listesi kurulumu o kadar zor ki bir kullanıcı "hâlâ kâğıt liste kullanıyoruz" demiş — **karmaşık özellik = kullanılmayan özellik**), ayarların toplu uygulanamaması, bildirimlerin hiç gelmemesi.

**Kurallar ve motor** — "sistem masaları sürekli fazla rezerve edilmiş sanıyor", "kurallar çakışıyor ve NEDEN olduğunu anlamıyorsun", otomatik yerleşimin işletmeciden katı olması, bloke masaya rezervasyon düşebilmesi.

**Raporlama (bizim vurgu alanımız)** — "raporlama bölümünü kullanmak epey zor", "filtreler düzgün çalışmıyor", panel özelleştirilemiyor, istenen tablo için iki rapor çalıştırıp elle birleştirmek gerekiyor, online formdaki özel soruların cevapları raporlanamıyor, segmentleme yok. OpenTable'ın raporlaması o kadar yetersiz ki **distil.ai** adında ayrı bir şirket onun verisi üstüne pano satıyor.

**Veri sahipliği** — "rezervasyonlar misafir veritabanınıza geçmiyor" (TheFork), platform ekosistemine bağımlılık, platform kapanınca veriyle ortada kalmak (Quandoo), büyüklerin birbirini kesmesi.

**Misafir tarafı** — söz verilen masanın verilmemesi, kapora iadesinin alınamaması, kuyrukta verilen sürenin tutmaması.

**Bir de olumlu bir şikâyet:** Hostme kullanıcılarının en çok övdüğü şey *"uygulamayı sadece ihtiyacın olan işi yapacak şekilde kısabiliyorsun — masa seçimi istemiyor musun? Kapat."* Rakiplerin hepsi tüm özellikleri dayatıyor. **Özellik kapatabilmek bizim için çok ucuz bir farklılaşma.**

---

## 8. Önerim: hangi sırayla

Mantık: önce **elimizdeki veriyi görünür kılan ve güveni kuran** ucuz işler, sonra **ilk hedef pazarı açan** modül, en sonda **premium ve ağır entegrasyonlar.**

**0. Bugün, tek satır: işletme günü saati ayarı (1.2).**
Hepsinden önce. Bir satırlık iş, altı ay sonra bir göç işi. Bunu yapmadan aşağıdaki hiçbir rapor gece kulübünde doğru çıkmaz.

**1. Küçük ve bedava kazançlar paketi — 1-2 hafta**
Masada oturma süresi sayacı, "kalktı/kuruluyor" durumu, vardiya notu, toplu masa aç/kapat, kaydedilmiş salon düzenleri, mesai dışı arayana otomatik mesaj, kişi başı eşzamanlı rezervasyon limiti.
*Neden önce:* Hepsi bir-iki günlük iş ve bir kısmı sonraki maddelerin verisini **bugünden** üretmeye başlıyor.

**2. Güven katmanı: çakışma koruması, geri al, çöp kutusu, değişiklik geçmişi — küçük/orta**
*Neden burada:* Türkiye'de sistemden vazgeçmenin bir numaralı sebebi güvensizlik. Ayrıca "kim değiştirdi" izi rol/yetki sistemine giden yolun yarısı.

**3. Kaçırılan talep + talep hızı + kanal başına değer + veri kalitesi rozeti — küçük**
*Neden burada:* Veri zaten birikiyor, sadece ekran yok. **İstatistik sayfasını satılabilir hâle getiren ilk üç ekran bunlar.** Rozet ve "her rakam tıklanabilir" kuralı buraya baştan konmalı — sonradan eklemek her ekranı yeniden yazmak demek.

**4. Yedek listesine otomatik teklif + misafirin kendi rezervasyonunu değiştirmesi — orta**
*Neden burada:* İkisi tek bir döngü: misafir kendi iptal ediyor → yer anında yedeğe açılıyor → süreli teklif zinciri dönüyor → masa doluyor. 4.12'deki kurtarma metriği buradan doğuyor.

**5. Yapılandırılmış özel gün / istek / rezervasyon etiketi + 14 alerjen kapalı listesi + mutfağa fiş — küçük**
*Neden burada:* "Not algılama" konusunun cevabı. Metni algılamaya çalışmak yerine bilgiyi baştan yapılandırılmış almak hem daha güvenilir hem daha ucuz. Alerjen zorunluluğunun (5.6) da ön hazırlığı. Bundan sonraki tüm raporlar bu yapılandırılmış veriden besleniyor.

**6. WhatsApp mesaj katmanı: onay, hatırlatma, düğmeli teyit, cevapsızı otomatik düşürme — orta**
*Neden burada:* Utility mesaj 4-6 kuruş, düğme destekleniyor, rezervasyon mesajları İYS kapsamı dışında. Şablon ekranına baştan "tanıtım içeriyor mu?" kilidi ve mesaj tipi ayrımı konmalı.

**7. Kapora — önce havale/dekont akışı, sonra kart — küçük + büyük**
*Neden buraya çekildi:* Havale + dekont akışı **bir günlük iş ve bugün satılır** (3.4); kart provizyonunu beklemeye gerek yok. Sırası: iptal politikası onay kutusu → havale/dekont → sahte hesap karşıtı "tek resmî kapora linki" mesajı → kart provizyonu. Sağlayıcıya üç soru sorulmadan kart kodu yazılmamalı.

**8. Gece kulübü modülü: minimum harcama + masa paketi + fiyat bölgesi + PR takibi + kapı modu + KARA LİSTE — büyük**
*Neden burada:* İlk hedef pazarın kalbi ve Türkiye'de kategori boş. Bu modül bittiğinde elimizde **kimsenin satmadığı bir ürün** oluyor. Kara liste bu paketin en ucuz ve en çok istenen parçası; yaş kontrolü ruhsat riskine dayandığı için satış cümlesi hazır.

**9. Zaman çizelgesi + koltuk/masa makası + boşa giden masa-saat + devir hızı — orta**
*Neden burada:* Gecenin tamamını görme yeteneği. 8. adımda kulüpler geldiğinde "bu masa bu gece kaç kere döner" sorusu kaçınılmaz.

**10. İstatistik ikinci dalgası: gerçek oturma süresi, RevPASH, masa ciro haritası, 1→2 dönüşümü, uykuya dalan müdavim, iptal panosu — orta**
*Neden burada:* 1-6 arası adımlar bu raporların hammaddesini üretti. Her ekranın altına "dışa aktar" ve "bu kişilere mesaj at" düğmesi.

**11. Otomatik etiket kural motoru + tetikleyicili kampanya + sabah WhatsApp özeti — orta**
*Neden burada:* Motor bir kez yazılınca sonraki her istek "ayarlardan kurulur" cevabını alıyor. Sabah özeti ürünü her gün hatırlatan alışkanlığı kuruyor. Ön koşul: KVKK pazarlama izninin ayrı kutu olması (6. adım).

**12. Biletli etkinlik + iftar modu (tek modül) — orta/büyük**
*Neden burada:* Ramazan'dan en az 3 ay önce bitmiş olmalı; yılbaşı ve konser gecesi aynı motoru kullanıyor. Tek oturumlu servis mantığı normal müsaitlik hesabından ayrı yazılmalı.

**13. POS / adisyon entegrasyonu (Adisyo API ile başla) — büyük**
*Neden en sonda:* Teknik olarak en ağır ve dış bağımlılığı en yüksek iş; ama e-Adisyon takvimi ilerledikçe kaçınılmaz. 10. adımdaki raporların yarısı ancak bununla tam doğru çalışıyor.

### Sıraya girmeyen ama hemen yapılacak üç şey
- **Google İşletme Profili + Apple Business Connect linki:** kurulum sihirbazına iki adım, sıfır maliyet, bugün.
- **Quandoo göçü:** Türkçe "geçiş rehberi" sayfası + Excel/CSV içe aktarma aracı. İngilizce yarışa girme, Türkçe boşluğu al.
- **Yapay zekâ kart özetine giden veriyi maskelemek:** Yurt dışına aktarım kuralı 01.06.2024'ten beri yürürlükte. Maskeleme küçük bir iş, sonradan düzeltmek büyük bir iş.

### 12-24 ay sonraya bırakılanlar (bugün satılabilir değil)
- **Kıyas (benchmark) raporu:** "senin gelmedi oranın %11, bölge ortalaması %7". OpenTable veriyor ama gizlilik için havuzda **en az 25 işletme** olmadan göstermiyor. Bizde de 25+ müşteri olmadan çalışmaz. Uzun vadede kopyalanamayan bir üstünlük — ama bugün bir premium madde değil.
- **Yeni misafir kazanma maliyeti / LTV oranı:** Maliyet kalemlerini (Instagram reklamı, ikram, influencer) işletmeci elle girmeyecek; girmezse rapor boş çıkar ve boş çıkan rapor ürünü kötü gösterir. POS/reklam entegrasyonundan sonra.
- **Yeniden rezervasyon oranı:** ("Hesap kapanırken haftaya aynı gün ayırayım mı?") Güzellik sektörünün metriği; gece kulübünde karşılığı yok. İkinci hedef kitleye ertelendi.
- **Meta rezervasyon partneri listesine girmek:** Girildiği gün her müşteri mekânının Instagram profilinde native "Rezervasyon" düğmesi çıkar. Başvuru şartlarını araştırmak bir günlük iş, girmek uzun.

### Bir sonraki araştırma turunun listesi — hiç bakılmamış bölgeler

**Yunanistan / Balkanlar — EN ÖNEMLİSİ, çünkü birebir bizim pazarımız.** Atina'daki "bouzoukia" (canlı müzikli gece mekânı) modeli Türk gazino/kulüp modelinin aynısı: kişi başı minimum tüketim, sahneye yakınlığa göre kademe (sahne dibi masalar ünlülere ayrılıyor), 4 kişilik masaya şişe paketi fiyatı, VIP blokta 8 kişiye kadar sabit masa minimumu, sanatçıya göre değişen kişi başı fiyat. **1.1 ve 2.2 maddelerinin dünyada zaten çalışan hâli burada.** İncelenecekler: e-table.gr, TableMe, mekânların kendi rezervasyon sayfaları.

**İspanya — Fourvenues** (Valencia, 2018): bilet + misafir listesi + VIP masa + POS tek panelde, PR'a kişisel satış linki ve otomatik komisyon. Bu tur yüzeysel bakıldı; ürün akışları detaylı incelenmeli.

**Körfez / Suudi Arabistan** — Ramazan yoğunluğu, aile bölümü ayrımı, nargile alanı: Türkiye'ye en yakın operasyon kültürü. Hiç bakılmadı.

**Kore / Japonya KTV ve özel oda rezervasyonu** — saatlik oda satışı + oda başına minimum harcama. "Loca satışı"nın birebir teknik karşılığı. Hiç bakılmadı.

**Polonya / Ukrayna** (Poster, Choice QR, Restik) ve **Mısır / Lübnan** — hiç bakılmadı.

**ABD kapı katmanı** (Vemos, IDScan.net, Patronscan, IDEnforcer) — bu turda ilk kez bakıldı (3.1), ama fiyatlama ve KVKK'ya uyarlama tarafı derinleştirilmeli.
