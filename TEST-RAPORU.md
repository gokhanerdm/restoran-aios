# Test raporu — 16 Ağustos 2026

Gece boyunca programın 10 ayrı alanı test edildi: istatistikler, online rezervasyon, kişi kartı, veri bütünlüğü, salon düzeni, rezervasyonun doğumundan kapanışına kadarki zinciri, zaman/gün kapanışı, masa planı ve masa seçimi, ayarlar ekranı, ve yetki/güvenlik.

Nasıl test edildi: her alan için gerçek işletmelerin verisine dokunulmadan ayrı test işletmeleri kuruldu (zztest-... adıyla), veritabanı fonksiyonları gerçek çağrılarla çalıştırıldı, ekranların hesap mantığı ayrı ayrı koşturuldu. Bazı yerlerde on binlerce kombinasyon denendi (masa dizme için ~46.000 salon senaryosu, online saat listesi için ~18.000 açılış/kapanış kombinasyonu). Gerçek verideki bozukluklar sadece okunarak tespit edildi, hiçbir şey değiştirilmedi.

Sonuç: 191 bulgu çıktı. Hepsi tek tek kodun ilgili satırına bakılarak doğrulandı. 17 tanesi senin daha önce verdiğin bilinçli kararların sonucu olduğu için hata sayılmadı, 1 tanesi yanlış çıktı, 1 tanesi hakkında emin olunamadı. Geriye 172 doğrulanmış bulgu kaldı; bunların çoğu aynı kökten geldiği için birleştirilerek aşağıdaki listeye indirildi.

Genel durum: programın hesap mantığı ve temel akışı sağlam, asıl kırılmalar üç yerde toplanıyor — "gün" kavramının gece yarısında bitmesi, telefon numarasının kimlik olarak tutarsız kullanılması, ve masaların kimin elinde olduğunun tek bir yerden takip edilmemesi.

---

## Önce bunlar (yüksek)

**1. "Varsayılana getir" düğmesi o günün bitmiş ziyaretlerinin masa kaydını da siliyor**
- Ne oluyor: Salon ekranındaki bu düğme, o güne ait bütün rezervasyonların masa bağını koparıyor — akşamı tamamlanmış, kapanmış ziyaretler dahil. O ziyaretlerin hangi masada olduğu bilgisi kalıcı olarak gidiyor. Gook Haan'da 14 Ağustos'ta 35 ziyaretin masası bu yüzden kayboldu.
- Ne zaman görürsün: Bir akşam masaları dağıt, misafirler otursun, ziyaretleri kapat. Aynı gün seçiliyken Salon > "Varsayılana getir"e bas. Sonra o günün ziyaretlerine bak — masaları boş.
- Nerede: Salon ekranı, "Varsayılana getir" düğmesi (app/rezervasyon/salon/page.tsx:326-342)

**2. Eski/unutulmuş bir kaydı kapatmak, o masada ŞU AN oturan misafirin masasını boşaltıyor**
- Ne oluyor: Dünden kalmış, kapatılmayı unutulmuş bir rezervasyon 5 numaralı masaya bağlıysa; bugün 5 numaralı masaya başka misafir oturmuşsa; dünkü kaydı "gelmedi" ya da "iptal" yaptığın anda bugünkü misafirin masası boş renge dönüyor. Program o masada birinin oturup oturmadığına hiç bakmıyor.
- Ne zaman görürsün: Dünkü açık bir kaydı listede kapat, sonra salon planına bak — bugünkü misafirin masası boşalmış.
- Nerede: Rezervasyon listesi, durum değiştirme (veritabanı: set_reservation_status)

**3. Gece yarısı geçince program, hâlâ masada oturan misafirleri "tamamlandı" yapıp masalarını boşaltıyor**
- Ne oluyor: Program "gün"ü takvim gününe eşitliyor. 23:00–04:00 çalışan bir mekânda saat 00:00'ı geçince, o gecenin bütün kayıtları "geçmiş günden kalmış" sayılıyor. Ayar "Kendisi kapatsın" ise hiç sormadan kapatıyor, masalar boşalıyor, servis ortasında salon planı çöküyor.
- Ne zaman görürsün: Çalışma saatini 23:00–04:00 yap, 23:30'a misafir oturt, saat 00:05'te Salon'a geçip Rezervasyonlar'a dön (ya da tableti yenile).
- Nerede: Rezervasyon listesi, sayfa açılışındaki geçmiş gün denetimi (app/rezervasyon/page.tsx:2149-2187)

**4. Birleşik masaya oturan grubun ikinci masasına başka grup da oturtulabiliyor**
- Ne oluyor: 8 kişilik gruba M3+M4 birleşik verildiğinde program kaydın masasını sadece "M3" diye tutuyor. Sonra ikinci bir grup M4'e oturtulmak istendiğinde koruma devreye girmiyor — aynı masada iki grup görünüyor.
- Ne zaman görürsün: Bir gruba iki masayı birleştirip oturt, sonra ikinci masaya başka bir misafiri oturtmayı dene. İzin veriyor.
- Nerede: Misafiri oturtma (veritabanı: seat_reservation)

**5. Hızlı masa rezervasyonu masayı sonsuza kadar "rezerve" bırakıyor**
- Ne oluyor: Adisyon ya da Salon ekranından masaya sağ tıklayıp verilen hızlı rezervasyon, masa bağını ara kayda hiç yazmıyor. Sonra o rezervasyon iptal edilse bile masa "ayrılmış" renginde kalıyor ve bir daha hiç boşalmıyor. Üstelik aynı masaya aynı saate ikinci bir hızlı rezervasyon da uyarısız kabul ediliyor, çakışma koruması bu masaları hiç görmüyor.
- Ne zaman görürsün: Adisyon kat planında bir masaya hızlı rezervasyon aç, sonra o rezervasyonu iptal et. Masa hâlâ rezerve.
- Nerede: Adisyon kat planı ve Salon ekranı, hızlı rezervasyon (veritabanı: quick_reserve_table)

**6. İleri tarihli bir rezervasyona masa atanınca o masa BUGÜN de dolu görünüyor**
- Ne oluyor: 3 gün sonrasına rezervasyon alındığında program o günün planını kurup masaları "rezerve" yapıyor, ama bu işarette tarih bilgisi yok. Bugüne dönünce o masalar boş masa listesinden düşmüş oluyor ve bugünkü misafire verilemiyor.
- Ne zaman görürsün: Otomatik yerleşme açıkken 3 gün sonrasına 4 kişilik rezervasyon al, sonra bugüne dön ve masa seçmeye çalış.
- Nerede: Rezervasyon ekranı, masa seçme (app/rezervasyon/page.tsx:1650 ve 1921)

**7. Yerleşimde açıkta kalan rezervasyonun eski masası silinmiyor — aynı masa iki misafire birden bağlanıyor**
- Ne oluyor: "Yerleşim yap"ta bir rezervasyona yer bulunamazsa, o kaydın eski masa bağı temizlenmiyor. Yeni plan o masayı başkasına verdiği için masa iki misafire birden bağlı kalıyor.
- Ne zaman görürsün: Salonu tam doldurup "Yerleşim yap"a bas; açıkta kalan bir kayıt varsa onun eski masasına bak.
- Nerede: Salon ekranı, "Yerleşim yap" (app/rezervasyon/salonDuzen.ts:268-270)

**8. Adisyon ekranından salon silinince içindeki masalar silinmiyor — hayalet masalar kapasiteye sayılmaya devam ediyor**
- Ne oluyor: Adisyon "salonu silersen masaları da silinir" diye onay soruyor ama sadece salonu siliyor. Masalar veritabanında kalıyor ve online rezervasyon kapasitesinde koltuk olarak sayılmaya devam ediyor. Aynı iş Salon ekranında doğru yapılıyor — iki ekran farklı davranıyor.
- Ne zaman görürsün: Adisyon'dan bir salon sil, sonra online rezervasyon kapasitesine bak — koltuklar hâlâ orada.
- Nerede: Adisyon ekranı, salon silme (app/adisyon/page.tsx:134-144)

**9. Kapasite dolunca misafire "talebin işletmeye iletildi" deniyor ama hiçbir yere yazılmıyor**
- Ne oluyor: Gün dolduğunda program talebi "dolu gün talepleri" listesine yazıyor, hemen ardından hata veriyor — ve o hata az önce yazdığı satırı da geri alıyor. Sonuç: misafir "talebin iletildi" yazısını görüyor, işletmeye hiçbir şey ulaşmıyor, liste sonsuza kadar boş. (Aynı sorun 6 ayrı testte çıktı.)
- Ne zaman görürsün: Bir günü doldur, online sayfadan o güne rezervasyon dene. Mesajı gördükten sonra dolu gün talepleri tablosuna bak — boş.
- Nerede: Online rezervasyon (supabase/migrations/20260815200000_online_rezervasyon_ayarlari.sql:168-172)

**10. Online rezervasyon mevcut işletmelerde kendiliğinden AÇIK geldi**
- Ne oluyor: Ayarın varsayılanı "açık" olduğu için, hiç kurulum yapmamış işletmelerin online sayfası şu anda canlı. Osteria Bella'nın sayfası açık ve çalışma saati hiç girilmediği için haftanın yedi günü 09:00–22:45 açık görünüyor.
- Ne zaman görürsün: /rezervasyon-yap/merkez adresini aç — sayfa çalışıyor.
- Nerede: Online rezervasyon ayarları (restaurant_settings.online_acik varsayılanı)

**11. Girişsiz online form hiçbir doğrulama yapmıyor — 30 sahte çağrıyla bir aylık takvim kapatılabiliyor**
- Ne oluyor: Sunucu tarafında sadece "isim ve telefon boş olmasın" kontrolü var. Telefon alanına "abc" yazan kabul ediliyor, 100.000 harflik not kabul ediliyor, aynı rezervasyon 6 kez üst üste gönderilebiliyor, tekrar ya da hız freni yok. Bu sahte kayıtlar kapasiteye gerçek gibi sayıldığı için gerçek misafir "gün doldu" cevabı alıyor. Ayrıca "gelmeyen misafir engeli" numaranın sonuna bir rakam eklenerek ya da bir rakam eksik yazılarak aşılabiliyor.
- Ne zaman görürsün: Online forma telefon yerine "abc" yaz, gönder — kabul ediliyor.
- Nerede: Online rezervasyon sayfası ve sunucu fonksiyonu (app/rezervasyon-yap/[slug]/page.tsx:160-178)

**12. Gece yarısından sonra gelen misafir kapıda tanınmıyor: ikinci kayıt açılıyor, misafir haksız yere "gelmedi" damgası yiyor**
- Ne oluyor: 23:30'a rezervasyon yaptıran misafir 00:20'de kapıya gelirse, program rezervasyonu bulamıyor (takvim günü değişti) ve yeni bir kapı kaydı açıyor. Asıl rezervasyon bekliyor kalıyor, gün kapanışında "gelmedi" oluyor. Rezervasyonu online yapmışsa numarası bir daha online rezervasyona kapanıyor.
- Ne zaman görürsün: Dün 23:30'a bir rezervasyon gir, bugün gece yarısından sonra kapı girişinden aynı ismi yaz.
- Nerede: Kapı girişi (veritabanı: check_in_arrival)

**13. Gece yarısını aşan mekânda kapasite ikiye bölünüyor — aynı geceye salonun iki katı rezervasyon alınabiliyor**
- Ne oluyor: 23:00–04:00 çalışan bir mekânda 23:30 kaydı bir güne, 01:00 kaydı ertesi güne yazılıyor. Kapasite freni takvim gününe baktığı için aynı geceye iki kat rezervasyon giriyor. Ters yönde de oluyor: ertesi gece bomboşken "dolu" cevabı veriliyor.
- Ne zaman görürsün: Çalışma saatini 23:00–04:00 yap, salonda 4 koltuk olsun. Cuma 23:30'a 4 kişi, Cumartesi 01:00'e 4 kişi al — ikisi de kabul ediliyor.
- Nerede: Online rezervasyon kapasite freni ve rezervasyon listesi gün sınırı

**14. Yanlışlıkla basılan "Gelmedi" geri alınamıyor; misafirin numarası kalıcı olarak engelleniyor**
- Ne oluyor: "Gelmedi" düğmesi "Geldi"nin hemen yanında, onay penceresi yok, tek dokunuş yetiyor. Basıldıktan sonra o satırda hiçbir düğme kalmıyor — geri dönüş yolu yok. Misafir online rezervasyon yapmışsa numarası süresiz olarak online rezervasyona kapanıyor.
- Ne zaman görürsün: Bir kayda "Gelmedi" bas, sonra geri almayı dene.
- Nerede: Rezervasyon listesi (app/rezervasyon/page.tsx:2912)

**15. Yedeğe (bekleme listesine) yazılan misafirler gün kapanışında "gelmedi" damgası yiyor**
- Ne oluyor: Gün kapanışı bekleyen her kaydı "gelmedi" yapıyor, yedek olup olmadığına hiç bakmıyor. Hiç aranmamış, hiç çağrılmamış misafir "gelmedi" sayılıyor ve kişi kartına "gelmeme riski" etiketi basılıyor.
- Ne zaman görürsün: Bugüne yedek bir kayıt gir, akşam "Günü kapat"a bas, sonra o misafirin kartına bak.
- Nerede: Rezervasyon listesi, gün kapanışı (app/rezervasyon/page.tsx:2159-2195)

**16. Yedeğe yazılıp kapıdan gelen misafir istatistiklerde hiç görünmüyor — gün bomboş yazıyor**
- Ne oluyor: Yedekteki misafir akşam yine de gelirse, kapı girişi onu buluyor ve "geldi" yapıyor ama yedek işaretini kaldırmıyor. İstatistikler yedek işaretli kayıtları baştan dışarıda bıraktığı için o akşamın misafiri, cirosu ve doluluğu hiçbir yere yazılmıyor; ekranın üst cümlesi "Bugün için rezervasyon yok" diyor.
- Ne zaman görürsün: Yedek bir kayıt gir, akşam kapı girişinden aynı ismi yaz, misafiri oturt. Sonra İstatistikler'e bak.
- Nerede: Kapı girişi + İstatistikler (check_in_arrival ve istatistik_rzv_olculer)

**17. Yedek rezervasyona elle masa verilirse, yerleşim o masayı gerçek bir rezervasyona da veriyor**
- Ne oluyor: Yedek satırında "Masa seç" düğmesi açık ve masa verilebiliyor. Ama "Yerleşim yap" yedekleri hiç görmediği için o masayı boş sanıp başka bir misafire de veriyor.
- Ne zaman görürsün: Yedek bir kayda T1 masasını ver, sonra Salon > "Yerleşim yap"a bas.
- Nerede: Salon ekranı, "Yerleşim yap" (app/rezervasyon/salonDuzen.ts:133)

**18. Aynı numara farklı yazılınca ikinci bir boş kişi kartı açılıyor — alerji notu ve VIP işareti kayboluyor**
- Ne oluyor: Program kartı OKURKEN numaranın son 10 hanesine bakıyor (doğru kartı buluyor), ama KAYDEDERKEN yazılan metnin birebir aynısına bakıyor. "0532 111 22 33" ile "+90 532 111 22 33" iki ayrı kart oluyor. Personel ekranda doğru kartı görüp not yazdığında not yeni ve boş bir karta gidiyor; VIP işareti, alerji notu ve tercihler ekrandan siliniyor. Aynı şey "+ Numara bağla" ile açılan kartlarda da oluyor — bağlantının kendisi de kayboluyor.
- Ne zaman görürsün: Bir misafire "0532 111 22 33" ile kart aç, not ve VIP koy. Aynı misafirden ikinci rezervasyonu "+90 532 111 22 33" diye al, kartı aç, yeni bir not yaz ve kutudan çık. Kartı tekrar aç.
- Nerede: Kişi kartı penceresi (app/rezervasyon/page.tsx:693-747)

**19. Türkçe "İ" harfi yüzünden isim araması çalışmıyor — İsmail, İbrahim, İşıl bulunamıyor**
- Ne oluyor: Arama büyük/küçük harf çevirisinde Türkçe kuralını uygulamıyor. "İ" ile başlayan ya da içinde Türkçe harf geçen isimlerde hiç eşleşme dönmüyor; müdavim misafir "hiç gelmemiş" gibi görünüyor.
- Ne zaman görürsün: Müşteri aramasında "İsmail" ara — geçmişi olsa bile bulunamıyor.
- Nerede: Müşteri/isim arama (veritabanı: isim_soyad_ile_ara)

**20. KVKK "kişisel veriyi temizle" işlemi kişi kartlarına hiç dokunmuyor**
- Ne oluyor: Temizlik sadece rezervasyon satırlarını anonimleştiriyor. Kişi kartındaki isim, telefon, sağlık notu ("fıstık alerjisi var" gibi), doğum günü, VIP işareti ve yapay zekâ yazısı olduğu gibi duruyor; aynı telefonu yazınca hepsi geri geliyor. Yani veri silinmiş görünüyor ama silinmiş değil. Dolu gün talepleri de temizlenmiyor.
- Ne zaman görürsün: Saklama süresini kısalt, temizliği çalıştır, sonra o misafirin telefonunu rezervasyon ekranına yaz.
- Nerede: Ayarlar > KVKK (veritabanı: anonymize_expired_personal_data)

**21. Misafirin forma yazdığı not, yapay zekâya doğrudan talimat olarak gidiyor**
- Ne oluyor: Online formdaki "özel not" kutusuna yazılan metin hiç temizlenmeden yapay zekâya veriliyor. Misafir notuna talimat yazarak personele gösterilen "PROGRAMIN NOTU" yazısını yönlendirebiliyor (örneğin "bu misafirin hesabı ikram edilecek" yazdırmak gibi). Not kutusunda uzunluk sınırı da yok.
- Ne zaman görürsün: Online formun not alanına talimat cümlesi yaz, sonra o misafirin kişi kartını aç.
- Nerede: Kişi kartı özeti (app/api/kisi-ozeti/route.ts)

**22. Bir işletmenin rezervasyonuna BAŞKA işletmenin masası bağlanabiliyor**
- Ne oluyor: Masa atama fonksiyonu masanın hangi işletmeye ait olduğunu hiç kontrol etmiyor, yetki katmanı da bunu durdurmuyor. Üstelik çakışma uyarısı komşu işletmenin misafir adını hata mesajında gösterebiliyor.
- Ne zaman görürsün: Tek işletmede görünmez; çok şubeli/çok işletmeli kullanımda ortaya çıkar.
- Nerede: Masa atama (veritabanı: assign_reservation_tables)

**23. Sisteme kayıtlı herhangi bir işletme, BAŞKA bir işletmenin fotoğraflarını ve logosunu silebiliyor**
- Ne oluyor: Dosya deposunun silme ve yazma kuralı sadece "bu kova işletme kovası mı" diye bakıyor, dosyanın kime ait olduğuna bakmıyor. Normal giriş yapmış herhangi bir işletme başkasının dosyasını silebilir ya da üzerine yazabilir.
- Ne zaman görürsün: Tek işletmede görünmez; sistemde başka işletmeler oldukça risk.
- Nerede: Dosya deposu yetki kuralları (storage.objects)

**24. "Kalktı" denmeden kapatılan gün, oturma süresi istatistiğini ve kaydın kendisini bozuyor**
- Ne oluyor: Akşam "Kalktı" demeyi unutunca, ertesi sabah program günü kapatırken kalkış saatini O ANA yazıyor. Ortalama oturma süresi 1,5 saat yerine 7,5 saat, bazen 28 saat çıkıyor. Gerçek kalkış bilgisi de kalıcı olarak kayboluyor. Hiçbir üst sınır ya da eleme yok.
- Ne zaman görürsün: Bir misafiri oturt, "Kalktı" deme, ertesi gün İstatistikler > Oturma sütununa bak.
- Nerede: Gün kapanışı + İstatistikler (app/rezervasyon/page.tsx:2178-2184)

**25. İstenen salonda yer kalmayınca program "size sorayım" diyor ama misafiri çoktan başka salona oturtmuş oluyor**
- Ne oluyor: Notta ya da online formda istenen salon dolunca kayıt "sorulacaklar" listesine ekleniyor, ama genel dağıtımdan çıkarılmıyor. Sonuçta hem "sana soracağım" diyor hem de başka salondan masa veriyor.
- Ne zaman görürsün: Bahçe'de 5 masa varken 8 rezervasyonun notuna "Bahçe olsun" yaz, "Yerleşim yap"a bas.
- Nerede: Salon ekranı, "Yerleşim yap" (app/rezervasyon/salonDuzen.ts:237-255)

**26. Salon planına hiç sürüklenmemiş masalarda bir rezervasyona iki-üç ayrı salondan masa veriliyor**
- Ne oluyor: "Masa ekle" ile eklenip plana sürüklenmemiş masaların konumu boş kalıyor. Program bu masaların hepsini tek bir sanal sıraya topluyor ve orada salon ayrımı yapmıyor. Kalabalık bir gruba Teras'tan bir, Bahçe'den bir masa verilebiliyor. Osteria Bella'da şu anda böyle masalar var.
- Ne zaman görürsün: Masa ekle, sürükleme, sonra kalabalık bir gruba yerleşim yaptır.
- Nerede: Salon planı (app/rezervasyon/masaPlan.ts:213-222)

**27. Alt alta birleşen masalar salon planında birbirinin üstüne biniyor, hatta başka masanın üstüne oturup kayboluyor**
- Ne oluyor: Masaların yan yana dizilmesinde ölçü çevrimi yapılıyor, alt alta dizilmesinde yapılmıyor. Farklı boydaki iki masa alt alta birleştiğinde araları eksiye düşüp üst üste biniyor. Ayrıca dikey birleşmede o şeritte başka masa var mı diye hiç bakılmıyor — birleşen masa başka bir rezervasyonun masasının tam üstüne oturabiliyor ve o masa planda kayboluyor.
- Ne zaman görürsün: Bir salona farklı boyda iki masa koy (2 kişilik çevrilmiş dikdörtgen + 4 kişilik loca), ikisini tek 6 kişilik rezervasyona ver.
- Nerede: Salon planı (app/rezervasyon/masaPlan.ts:686-699)

**28. "Fazla masayı boş yere gönder" adımı, yeri varken masayı salonun dışına atıyor**
- Ne oluyor: Boşta kalan masa taşınırken salonun sağ sınırı hiç kontrol edilmiyor, taşınacak deliğin masaya yetip yetmediğine de bakılmıyor. Salon yarı boşken masa ekranın dışına çıkabiliyor.
- Ne zaman görürsün: Alt sıradan bir masayı üst sıraya çeken bir birleşim kur, sonra yerleşimi çalıştır.
- Nerede: Salon planı (app/rezervasyon/masaPlan.ts:918)

**29. Nota Türkçe ekiyle yazılan salon adı tanınmıyor**
- Ne oluyor: "Teras" yazarsan çalışıyor ama "Terasa alalım", "Terasta olsun", "Bahçede olsun", "Ana salona alalım" hiçbiri tanınmıyor — yani Türkçede en doğal yazılışların hepsi işe yaramıyor.
- Ne zaman görürsün: Bir rezervasyonun notuna "Terasa alalım" yaz, "Yerleşim yap"a bas.
- Nerede: Not kuralları (app/rezervasyon/notKurallari.ts:30-43)

---

## Orta

**30. Çalışma saatleri ve kapalı günler sunucuda hiç denetlenmiyor** — Kapalı güne, kapanış saatinden sonrasına, hatta gecenin 4'üne online rezervasyon düşebiliyor; bugünün geçmiş saatleri de kabul ediliyor. Formu atlayıp doğrudan çağıran biri için hiçbir koruma yok. (Online rezervasyon sunucu fonksiyonu)

**31. Silinmiş salonun ve silinmiş masaların koltukları kapasiteye sayılmaya devam ediyor** — İşletme artık var olmayan koltuklara misafir kabul ediyor. Ayrıca silinmiş masalar hâlâ rezervasyona atanabiliyor; veride bu yüzden 90 tane "artık olmayan masaya bağlı" kayıt birikmiş.

**32. Bir grup kalkınca, aynı masayı hâlâ kullanan başka bir grubun masası da boş renge dönüyor** — Masa boşaltılırken masayı tutan başka aktif rezervasyon var mı diye bakılmıyor.

**33. Silinmiş bir rezervasyon masayı görünmez şekilde sonsuza kadar kilitliyor** — Oturma korumasında "silinmiş kayıtları sayma" şartı yok; silinmiş bir "oturdu" kaydı masayı kalıcı olarak bloke ediyor.

**34. Gece yarısını aşan iki rezervasyona aynı masa verilebiliyor** — Çakışma kontrolü takvim gününe bağlı, saate bakmıyor. 23:30 ile ertesi gün 00:30 farklı günlere düştüğü için engel çalışmıyor.

**35. Gece yarısından sonra rezervasyon ekranı "geçmiş gün"e düşüyor** — Geç kalan misafir sayacı ve kapasite kontrolü susuyor; program o geceyi artık bugün saymıyor.

**36. Ayarlardaki "Geçmiş gün açık kalırsa: Kendisi kapatsın" seçeneği hiç çalışmıyor** — Program her seferinde soruyor. Ayar veritabanından geç geldiği için denetim onu hiç göremiyor.

**37. Gün kapanışı tek seferde en fazla 200 kayıt kapatıyor, kalanları sessizce bırakıyor** — Kalanlar en eski günler oluyor ve aynı oturumda ikinci kez denenmiyor.

**38. Misafirin geliş saati hiç kaydedilmiyor** — Listede "Geldi" adımı atlanıp doğrudan oturtulduğu için geliş saati boş kalıyor; kalış süresi ölçen her hesap boş dönüyor.

**39. Masası atanmış rezervasyonu oturturken kaç kişi geldiği hiç sorulmuyor** — "Gelen kişi" alanı boş kaldığı için "eksik/fazla kişi" ölçüsü normal akışta hep sıfır çıkıyor.

**40. Hesap tutarına "1500.50" yazılırsa 150.050 TL kaydediliyor** — Bütün noktalar binlik ayıracı sayılıp siliniyor. Uyarı yok, kontrol yok.

**41. Aynı salonda iki masaya aynı ad verilebiliyor** — Gook Haan'da şu anda iki "Bahçe 21" ve iki "Teras 10" var; personel hangisi olduğunu bilemiyor, istatistikler de ikisini tek masa sayıyor.

**42. Bir masa silinince o masada geçmişte oturmuş bütün rezervasyonların masa bilgisi de siliniyor** — Silme işlemi tarih/durum ayrımı yapmıyor, geçmişi de kapsıyor.

**43. Masa geri bırakılınca "kilit" işareti üzerinde kalıyor** — Masası olmayan ama kilitli görünen rezervasyonlar oluşuyor.

**44. Telefonu eksik yazılmış rezervasyonda kişi kartı penceresi bomboş açılıyor** — Numara 10 haneden kısaysa bileşen hiçbir şey çizmeden çıkıyor; geçmiş var ama ekrana hiç gelmiyor.

**45. Farklı ülkeden gelen bir misafirin numarası Türk misafirin kartını açıyor** — Eşleştirme numaranın son 10 hanesine bakıyor. +1 ve +44 numaralarda çakışma mümkün; alerji notu, doğum tarihi ve hesap tutarları yanlış kişiye görünüyor.

**46. Numara bağlarken bir hane yanlış yazılırsa iki yabancı misafirin geçmişi tek kartta birleşiyor** — "+ Numara bağla" girilen numaranın başkasına ait olup olmadığını kontrol etmiyor, ekranda silme/düzeltme düğmesi de yok. Bağlanan numaranın bütün geçmişi karta katılıyor.

**47. Online alınan rezervasyonlar kişi kartına hiç bağlanmıyor** — VIP müdavimin adının yanında listede yıldız çıkmıyor, "her zamanki masası" kuralı online kayıtlarda hiç çalışmıyor.

**48. Aynı isimde bekleyen rezervasyon varsa kapıdaki misafir onun üstüne yazılıyor** — Eşleşme sadece isme bakıyor, telefonu hiç karşılaştırmıyor; kapıda girilen kişi sayısı, telefon ve not sessizce siliniyor. Gelmemiş başka bir misafirin rezervasyonu "geldi" olup kapıdakinin kartına bağlanabiliyor.

**49. "Gelmeme riski" etiketi, misafirin durumu kötüleştikçe sönüyor** — Oran hesabında payda, iptalleri ve yedekleri de sayıyor. Çok iptal eden ya da dolu günlerde yedeğe yazılan misafirde uyarı kayboluyor.

**50. Misafir masası ikinci bir ziyaret gibi sayılıyor** — Bir gecede iki masa açan misafirin ziyaret sayısı ikiye katlanıyor, ortalama kişi sayısı yarıya düşüyor, geliş aralığı yanlış çıkıyor.

**51. Kişi kartındaki isim alanı hiçbir zaman doldurulmuyor** — Kart hep telefonla açılıyor; yapay zekâ bilgilendirmesi misafirin adını bilmeden yazıyor.

**52. Sadık misafirin "her zamanki masası", notta açıkça istenen salonu sessizce eziyor** — Sadık masa adımı önce çalışıp tercihi doldurunca, "Bahçe olsun" notu hiç okunmuyor ve kimseye sorulmuyor.

**53. "Teras olmasın" yazan misafir Teras'a oturtuluyor** — Not okuma sadece salon adının geçip geçmediğine bakıyor, olumsuz cümleyi anlamıyor.

**54. Misafirin şu an oturduğu masa "Yerleşim yap"ta yerinden oynatılıyor** — Sadece kilitli masalar korunuyor; oturan misafirin kilitsiz masası fiziksel olarak taşınıyor.

**55. Misafir masasının yakın/uzak tercihi "Yerleşim yap"ta yok sayılıyor** — Salon ekranından yapılan yerleşim ile rezervasyon ekranından yapılan farklı sonuç üretiyor.

**56. Tek bir grup açıkta kalacak olsa bile program bütün tercihleri topluca çöpe atıyor** — Sadık misafirin masası ve notta istenen salon iptal ediliyor, kimseye haber verilmiyor. Kodun kendi niyeti "tercihler korunur" diyor ama korunmuyor.

**57. Salonda yer varken "yer yok" deyip rezervasyonu geri çeviriyor** — Kalabalık gruplarda aday masa dizilimleri salon ayrımı yapılmadan ilk 20 ile kesiliyor; sığan dizilim listenin dışında kalabiliyor.

**58. Ayarlar > Masa ölçüleri'ne girilen gerçek santim ölçüsü yerleşim hesabında kullanılmıyor** — Salon ekranı özel ölçüyle çiziyor, yerleşim hesabı varsayılan ölçüyle hesaplıyor; masalar planda üst üste biniyor.

**59. "Saate göre masa hesabı" ayarı masa atamasını hiç etkilemiyor** — Aynı masa aynı güne ikinci bir saate atanamıyor. Ayar açıklaması saat bazlı boşalma vaat ediyor, atama tarafı sadece güne bakıyor.

**60. Masa ölçüsü kaydedince veya fotoğraf ekleyip silince, o ana kadarki diğer bütün ayar değişiklikleri sessizce geri alınıyor** — Bu işlemler ekranı veritabanından tazeliyor ve kaydedilmemiş düzenlemeleri uyarısız siliyor.

**61. Telefon eşiği alt grup sınırından küçük yazılırsa online rezervasyon tamamen kilitleniyor** — Hiçbir kişi sayısı iki koşulun arasına düşemiyor, hiçbir uyarı da çıkmıyor.

**62. Saat 23:00'dan sonra yeni rezervasyon penceresi 23 saat geçmiş bir saatle açılıyor** — Varsayılan saat 00:00'a sarıyor ama tarih ilerletilmiyor.

**63. Online sayfada saat kutusu her zaman günün ilk saatinde açık geliyor** — Gece kapanan işletmelerde önceki gecenin kuyruğu listenin başına düştüğü için 00:00 seçili geliyor ve misafir farkına varmadan onu gönderiyor.

**64. Geçmiş günlerin doluluğu bugünkü masa sayısına göre yeniden hesaplanıyor** — Masa ekleyip çıkarınca geçmiş aylardaki bütün oranlar geriye dönük değişiyor.

**65. "Doluluk" ve "Boş" sütunları masa değil rezervasyon sayıyor** — Gece boyu boş kalan masa "Boş 0" görünüyor, 3 masayı birden kullanan büyük grup salonu "%75 boş" gösteriyor.

**66. İstatistik sütunları yan yana duruyor ama birbirini tutmuyor** — Kişi sütunundaki rakam ile yanındaki yüzde farklı tabandan geliyor (30 kişi yanında %55). Kişi, Gelen kişi ve Eksik/Fazla üç farklı kümeden hesaplandığı için toplanmıyor (8 + 2 = 14 çıkıyor). Masa/kişi sütunu kapıdan gelenleri kişiye ekliyor ama masaya eklemiyor, "masa başına 22 kişi" yazabiliyor.

**67. Ekranın en üstündeki hüküm cümlesi, işletmenin daha var olmadığı günleri "0 kişi" sayıp ortalamaya katıyor** — "Ortalamanın %67 üstünde" diyorken gün aslında ortalamanın kendisi ya da altında olabiliyor.

**68. Hüküm bandı kapıdan gelen misafirleri hiç saymıyor** — Salon kapıdan gelenlerle doluyken "Henüz gelen yok" yazıyor; hiç rezervasyon yoksa "rezervasyon yok" deyip kapıyı hiç anmıyor.

**69. Salon ve masa performansı istatistiği yanlış** — Birleşik masaya oturan grup masa sayısı kadar tekrar sayılıyor, silinmiş masadaki geçmiş ziyaretler hiç sayılmıyor.

**70. Anonimleştirilen eski müşteriler istatistikte tek bir "Anonimleştirildi" müşterisinde birleşiyor** — Kartı olmayan bütün eski kayıtlar tek kişi gibi toplanıyor ve sadakat listesine giriyor.

**71. KVKK ekranına rezervasyon programı hesaplarıyla ulaşılamıyor** — Saklama süresi ve temizleme sadece diğer modülün ayarlarında; rezervasyon menüsünde bu bölüm yok. Yani süresi dolan veriyi temizlemenin pratikte yolu yok.

**72. KVKK aydınlatma metni boş bırakılınca vaat edilen uyarı hiçbir yerde çıkmıyor** — Ayarlar "boş bırakılırsa uyarı çıkar" diyor ama sadece bağlantı gizleniyor; misafir metinsiz onay veriyor.

---

## Küçük

**73.** Şemada eksik kısıtlar ve indeksler var — işletme sayısı arttıkça günlük liste sorgusu bütün işletmelerin kayıtlarını tarayacak, bozuk satır oluşmasını engelleyecek koruma yok. Bugün etkisi yok.

**74.** Geçmiş bir güne sonradan kayıt girilince "Önceden" sütununda eksi gün çıkıyor ve o kayıt "Aynı gün" oranına da giriyor.

**75.** Rezervasyon ve Kişi sayfalarında sütun başlığına tıklamak sıralama yapmıyor; üstelik başlıkta "sıralamak için tıkla" yazıyor ve o sıralama Karşılaştırma sayfasına sızıyor.

**76.** Karşılaştırma sayfasında iki ayrı sütunun başlığı da "Doluluk" — aynı satırda biri %25, diğeri %75 diyor.

**77.** "Bu ay" ile "Geçen ay" farklı uzunlukta dönemler; iş birebir aynı olsa bile ekran %58 düşüş gösterebiliyor.

**78.** Kişi ₺ sütunu 1000 liranın üstünü en yakın bine yuvarlıyor — 1500 ₺ "2b" görünüyor.

**79.** Hüküm cümlesinde gün eki bozuk: "Geçen pazarya göre", "Geçen perşembeya göre".

**80.** Yedek sayacı, rezervasyona çevrilen yedekleri unutuyor — "Yedek 1, Yerleşen 2" gibi imkânsız bir satır çıkabiliyor.

**81.** Ülke koduyla kayıtlı ve yabancı telefon numaraları aday listesinde maskelenmeden, tam haliyle görünüyor.

**82.** Rezervasyon geçmişinin altındaki "+N kayıt daha" yazısı 30'da takılıyor, gerçek sayıyı söylemiyor.

**83.** Kartta KVKK süresi dolan kayıtlar yüzünden "Bu numarayla gelenler: ... Anonimleştirildi" yazıyor ve yapay zekâya "birden fazla isim" uyarısı gidiyor.

**84.** "Geldi" düğmesine hızlı iki kez basılınca işlem başarılı olduğu hâlde kırmızı hata yazısı çıkıyor (düğmede işlem kilidi yok).

**85.** Ayarlarda müdavim eşiğine ya da gelmeme riski yüzdesine 0 yazılırsa sessizce 5 ve 30 kaydediliyor; ekranda hâlâ 0 görünüyor.

**86.** Ayarlar çelişkili grup aralığı kaydettiriyor: "4-8 kişi" yazıyor ama telefon eşiği daha küçükse 7 ve 8 kişi hiçbir zaman alınmıyor.

**87.** İki ayar ekranda hiç yok, değiştirilemiyorlar: masa başına ek sandalye ve online saat aralığı.

**88.** Geçmiş saate online rezervasyon açılabiliyor — sunucu sadece güne bakıyor, saate bakmıyor.

**89.** "Misafir salon seçebilsin" kapalıyken bile sunucu salon tercihini kabul edip kaydediyor; geçersiz ya da silinmiş salon tercihi de sessizce düşüyor, misafire hiçbir şey söylenmiyor.

**90.** Kapanışa 15 dakika kala rezervasyon saati teklif ediliyor (oturma süresi ayarı saat listesine hiç girmiyor).

**91.** Akşam kapanıştan sonra online sayfaya girenler kapalı bir form görüyor; program otomatik olarak ertesi güne atlamıyor.

**92.** Bomboş küçük bir mekân, masasına sığmayan gruba "seçtiğin gün doldu" diyor — mesaj yanlış, sorun grup büyüklüğü.

**93.** Notta iki salon adı geçince kazanan, notun yazılışına değil salon sıralamasına göre belirleniyor.

**94.** Nota "her zamanki masası" yazmak, kayıt bir kişi kartına bağlı değilse hiçbir şey yapmıyor ve uyarı da vermiyor.

**95.** Oturma süresi ayarı değiştirilince geçmişte alınmış rezervasyonlar da yeni süreye göre sayılıyor; işletme adı boş bırakılınca isim sessizce "İşletme" oluyor.

**96.** Aynı misafir müşteri aday listesinde iki kez, birbirinin aynı görünen iki satır olarak çıkabiliyor.

**97.** İşletmenin saat dilimi alanı veritabanında var ama hiçbir yerde okunmuyor; saat farkı 41 ayrı yerde "+03:00" olarak elle yazılmış. Bugün sonuç doğru, ileride temizlenmesi gereken bir borç.

**98.** not_kurallari tablosu veritabanında duruyor ama program hiçbir yerde kullanmıyor.

**99.** Program topladığı verinin bir kısmını hiç göstermiyor: dolu gün talepleri, online rezervasyon kırılımı, bekleyen sayısı ve 11 istatistik hesabından 8'i hiçbir ekranda kullanılmıyor. Kullanılmayan bu hesaplarda ayrıca hatalar da var (masa istatistiği "Geldi" işaretli masaları görmüyor, müşteri listesi seçilen döneme bakmıyor, haftalık/aylık özet henüz yaşanmamış günleri kapsıyor, kanal istatistiğinde "telefon" iki kere dönüyor). Ekrana taşınmadan önce düzeltilmeli.

---

## Emin olamadıklarımız

**100.** Program günü kendi kapattığında masaların akşamki yerlerinde kalıp normal yerlerine dönmemesi. Kod tarafı doğrulandı — masaları normale alma işlemi yalnızca elle "Günü kapat"a basıldığında çalışıyor, otomatik kapanışta çalışmıyor. Ancak bunun istenen davranış mı yoksa eksik mi olduğu belirsiz; senin kararına bağlı.

---

## Bilerek böyle (hata değil)

Aşağıdakiler test sırasında hata gibi göründü ama koddaki notlarda senin verdiğin kararlar olarak yazılı; rapora alınmadı:

- Kapasite freni günü tek havuz sayıyor (öğle dolunca akşama da alınmıyor) — "program eğlence mekanlarına yapılıyor, sadece akşamı baz alacağız" kararı.
- Gelmeyen misafirin online engeli süresiz; affetmenin tek yolu ayarı kapatmak — "online yapıp gelmeyen bir daha online yapamaz, telefonla dener" kararı.
- "Yerleşim yap" elle seçilen masayı korumuyor; koruma yolu masa kilidi.
- "Her zamanki masası" için en az 2 ziyaret ve en az 2'sinde aynı masa şartı — ayara 1 yazılınca özellik kapanıyor.
- Kart geçmişinde yıl yazmıyor — mobilde taşmasın diye alınan karar.
- Aynı isimli iki farklı kişinin geçmişi birleşiyor — telefonu olmayan kayıtlar için isimle geçmiş gösterme kararı.
- Personel PIN'i bir güvenlik katmanı değil, kolaylık; bilerek dışarıda bırakılmış.
- İptal yüzdesinin paydası "alınan rezervasyon" — 12 Ağustos'ta verilen karar.

---

## Test edildi, sorun çıkmadı

- **Tarih aritmetiği:** ay sonu, yıl sonu, 29 Şubat 2028, artık yıl olmayan yıllar ve yaz saati geçiş günleri — altı ayrı saat diliminde tutarlı çıktı.
- **Online sayfanın saat listesi:** ~18.000 açılış/kapanış/adım kombinasyonu ve 1.095 günlük takvim taraması yapıldı; ilan edilen çalışma penceresinin dışına hiç saat sızmadı, gece yarısını aşan vardiya ertesi güne doğru taşınıyor, önceki gün kapalıysa kuyruk gelmiyor.
- **Grup aralığı / telefon eşiği / gün ufku kuralları:** 1.728 kombinasyonluk matriste form kuralları ile sunucu kuralları birebir uyumlu çıktı, çelişki yok.
- **İstatistiklerin aritmetiği:** temel istatistik fonksiyonunun 28 alanının 28'i de kendi tanımıyla birebir tuttu. Hatalar hesapta değil, "neyin sayıldığı"nda.
- **Masa seçim kalitesi ve hızı:** ~46.000 salon senaryosu, ~200.000 masa geçirildi; tek masa yeterken gereksiz birleştirme yok, 3/5/7 gibi tek sayılı gruplarda koltuk israfı yok, başlangıç dizilimi temiz.
- **Yetki ve gizlilik:** girişsiz (anon) anahtarla yaklaşık 25 tablonun doğrudan okunması denendi — hepsi boş dönüyor. Girişsiz yazma çağrıları da engelli, kişi kartı bilgisi girişsiz kullanıcıya hiç sızmıyor.
- **Kötü niyetli metin girdileri:** SQL benzeri metinler ve emoji içeren isimler sorun çıkarmadı.
- **Normal masa devri:** tamamlanan bir masanın yeni rezervasyona açılması doğru çalışıyor.
- **Yapay zekâ ucu:** anahtar tanımlı değilken doğru hata dönüyor ve ekran kırılmıyor.
- **Ayarlar:** izlenen ayarların 20 senaryosu doğru çalıştı; ekranda ne yazıyorsa veritabanına o yazılıyor ve okuyan taraf onu kullanıyor.
