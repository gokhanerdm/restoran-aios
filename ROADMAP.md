# Restoran AIOS — Ürün Yol Haritası

Kaynak: 2026-07-10 deep-research taraması (Toast/Square/Lightspeed/TouchBistro/SpotOn + Adisyo/Simpra/Karekodgarson/Menulux/SambaPOS modül haritaları, 11.389 Capterra yorumu meta-analizi, GİB mevzuatı, Toast/Meituan büyüme analizleri). Şu 4 çekirdek kaynak doğrudan okunup doğrulandı: Toast büyüme analizi (generativevalue), şikayet meta-analizi (deliverguard), ÖKC mevzuat rehberi (robotpos), AI/fire rehberi (supy). Diğer linkler arama özetlerinden; kullanılmadan önce teyit edilmeli.

## A) Standart modül haritası ve bizim durumumuz

Pazarda "tam paket" sayılmak için beklenen modüller ([upmenu](https://www.upmenu.com/blog/best-restaurant-pos-systems/), [restaurantvelocity](https://restaurantvelocity.com/blog/best-restaurant-pos-systems/), [expertmarket](https://www.expertmarket.com/pos/square-vs-toast-vs-lightspeed)):

> Durum sütunu **2026-07-28'de güncellendi.** Önceki hâli 2026-07-10 tarihliydi ve aradan
> geçen sürede yapılanları göstermiyordu (KDS, sayım, raporlar, personel vb. "❌ Yok" olarak
> duruyordu).

| Modül | Pazar durumu | Bizde |
|---|---|---|
| POS / adisyon (masa, sipariş, hesap) | Zorunlu çekirdek | ✅ Var (Kasa+Salonlar, tek panel) |
| Görsel kat planı / masa yönetimi | Standart | ✅ Var (sürükle-bırak, birleştirme, rezerve, süre, koltuk sayısı) |
| Menü + reçete maliyetleme | Toast'ta var, Square'de zayıf — **fark alanımız** | ✅ Var (kâr/food cost dahil) |
| Stok + tedarikçi + kritik seviye | Standart | ✅ Var (beklenen tüketim tahmini dahil) |
| **Ödeme türleri** (nakit/kart ayrımı, kısmi ödeme) | Zorunlu çekirdek | ✅ Var (nakit/kart/yemek kartı, kısmi, hesap bölme, bahşiş) |
| **Kişi sayısı zorunlu girişi** | Bizim iş kuralımız (BUSINESS_LOGIC #1) | ✅ Var |
| **İptal / ikram akışı** | Zorunlu çekirdek (kaçak kontrolü) | ✅ Var (sebepli iptal + ikram) |
| **KDS (mutfak ekranı)** | Standart (Toast 2. adımda ekledi) | ✅ Var (istasyon bazlı, yatay şerit, hazırlama süreleri) |
| **Fiş/mutfak yazıcısı çıktısı** | Zorunlu çekirdek (TR'de adisyon kültürü) | ❌ Yok |
| **Gün sonu raporu** | Zorunlu çekirdek | ✅ Var (Kasa ekranı — tek ekranda kapanış hükmü) |
| **Sayım ekranı** | Fire/kaçak radarımızın önkoşulu | ✅ Var (`/sayim` — teorik vs sayılan, onaylı işleme) |
| **Personel / PIN / rol / vardiya** | Standart | ✅ Var (PIN, roller, maaş/SGK, vardiya, puantaj, izin) |
| **Raporlar (kâr paneli, fire/kaçak radarı)** | Ciro raporu standart; **kâr raporu fark alanımız** | ✅ Var (6 sütun: kârlılık, menü mühendisliği, kapasite, iptal/ikram, personel, kasa) |
| **Hakediş mutabakatı** (kart/yemek kartı → bankaya yatan) | Şikayet listesinin 1 numarası (§B/2) | ✅ Var (Kasa "Yoldaki para" — komisyon, valör, gecikme) |
| **Mevzuat: alerjen / kalori** | 31.12.2026 ve 31.12.2027'de zorunlu | ✅ Var (14 alerjen, reçeteden kalori, QR menüde beyan) |
| **Mevzuat: KVKK** | Aydınlatma ihlali 100.000–1.000.000 TL | ✅ Var (aydınlatma metni, saklama süresi, anonimleştirme) |
| **Mevzuat: İş Kanunu puantaj** | md.67 kayıt zorunlu | ✅ Var (haftalık cetvel, 45 saat, fazla mesai onayı, yıllık izin) |
| **Satış tahmini + personel planı** | Nory/7shifts'in ana silahı | ✅ Var (14 gün, takvim farkındalıklı, işçilik oranı hedefi) |
| Paket servis entegrasyonu (YS/Getir/Trendyol) | TR'de standart sayılıyor ([adisyo](https://adisyo.com/trendyol-yemek-sepeti-getir-entegrasyon)) | ❌ Yok (orders.channel hazır) |
| e-Fatura / e-Arşiv / ÖKC / **e-Adisyon** | TR'de yasal zorunluluk | ❌ Yok (efatura_connections iskeleti var) — **ticari giriş bileti, bkz. §N** |
| Çevrimdışı çalışma | En kritik şikayet konusu; Menulux/SambaPOS bununla satıyor | ❌ Yok |
| Rezervasyon (takvim) | Standart ama v1'de not yeterli | ✅ Var (gün bazlı takvim, çakışma uyarısı, KVKK onayı) |
| Muhasebe entegrasyonu (Paraşüt/Logo/Mikro) | Olgunluk fazı; şikayet listesinin 3. sırası | ❌ Yok |
| CRM / sadakat | Olgunluk fazı (Toast 4-5. adımda ekledi) | ❌ Yok (Katman 4) |
| Çoklu şube | Orta-büyük segment | ❌ Yok (şema multi-tenant hazır) |

## B) Kullanıcı memnuniyeti kalite ilkeleri (şikayet analizinden)

[11.389 Capterra yorumu meta-analizi](https://www.deliverguard.io/research/restaurant-software-pain-points-2026) (✅ doğrulandı) + Toast/TouchBistro/SpotOn yorum sayfalarından çıkan en sık şikayetler → bizim ilkelerimiz:

Analizin ana bulgusu: **kullanıcıların istediği daha çok analitik değil, "paranın alındığını doğrulayabildikleri" bir sistem.** Olumsuz yorumların ~1/8'i banka yatışı uyuşmazlığı; "tek bir günü kapatmak için 3 rapor gerekiyor" tipik şikayet.

1. **Gizli ücret yok** → zaten bedava model; premium sınırları baştan şeffaf yazılacak.
2. **Mutabakat tutarlılığı** (şikayet listesinin 1 numarası) → ödeme türü kaydı + gün sonu raporu kuruşu kuruşuna adisyonlarla bağlanacak; kapanış TEK rapor, TEK ekran; her hesap kapama iz bırakacak.
3. **Yavaşlamama** (TouchBistro şikayeti: "gittikçe yavaşladı") → her ekran <200ms hedefi; sipariş ekleme tek dokunuş.
4. **Mesai saatinde zorunlu güncelleme yok** → dağıtım sessiz, geriye uyumlu.
5. **Ulaşılabilir destek** → hata mesajları Türkçe/anlaşılır; sessizce yutulan hata yok (her supabase çağrısında hata gösterimi — Ayarlar'da başlandı, tüm ekranlara yayılacak).
6. **Çevrimdışı dayanıklılık** → Faz 5'te PWA/yerel kuyruk; o zamana kadar en azından bağlantı koptu uyarısı.
7. Toast dersi ([CNBC](https://www.cnbc.com/2021/09/25/toast-built-a-30-billion-business-by-defying-silicon-valley-vcs.html)): kurucular restoran personelini yüzlerce saat gölgeledi → her fazın sonunda gerçek restoranda saha testi.

## C) Türkiye'ye özgü zorunluluklar

- **ÖKC (yeni nesil yazarkasa) entegrasyonu** (✅ mevzuat rehberi doğrulandı): 3100 sayılı Kanun + 426/483/507 Sıra No'lu VUK Tebliğleri; restoran/kafe/fast-food/paket servis ve online platform satışları dahil zorunlu; ÖKC anlık/düzenli GİB'e veri iletir, uzun kesinti cezalı. Yazılım tarafında gereksinimler: EFT-POS entegre yeni nesil cihazla eşleşme (Hugin/Ingenico vb.), **adisyon kapanışında otomatik fiş üretimi**, otomatik KDV oranı yönetimi (✅ bizde ayarlanabilir), e-belge uyumu ([robotpos rehberi](https://www.robotpos.com/blog_new/restoranda-yazarkasa-okc-entegrasyonu-2026-mevzuat-rehberi), [GİB YN ÖKC SSS](https://ynokc.gib.gov.tr/Home/SSS)). Arama özetindeki "125.000 TL ceza" rakamı doğrulanamadı — ceza tutarları yıllık güncelleniyor, uygulama öncesi GİB'den teyit edilecek.
- **e-Fatura / e-Arşiv**: entegratör API'siyle ([optimuspos örneği](https://www.optimuspos.com/e-belge-entegrasyonlari/)); `efatura_connections` iskeletimiz bunun için.
- **Paket servis entegrasyonları**: Yemeksepeti/Getir/Trendyol/Migros Yemek TR'de "olmazsa olmaz" algısında; kendimiz yazmak yerine [POSEntegra](https://posentegra.com/) gibi aracı API kullanma seçeneği değerlendirilecek.
- KDV oranları ayarlanabilir (✅ zaten yapıldı — kategori/ürün bazlı).

## D) Farklılaştırıcı fırsatlar (çekirdek farkı derinleştirme)

- **Fire/kaçak radarı = variance tracking** (✅ supy doğrulandı): WISK/Supy bu alanda lider; tahmin-gerçek karşılaştırmasıyla "kronik aşırı hazırlık" ve "sürekli fazla sipariş edilen ürünler" otomatik tespit ediliyor. Gerçekçi değer iddiası: gıda maliyetinde %1-2 düşüş bile ölçekte ciddi marj geri kazanımı ([supy](https://supy.io/blog/ai-in-restaurants-the-clear-2026-guide-to-forecasting-ordering-waste-reduction-menu-profitability), [wisk](https://www.wisk.ai/blog/what-is-the-best-way-for-restaurants-to-use-ai-for-demand-forecasting)). Supy'nin uygulama sırası bizim fazlarımızla uyumlu: önce talep görünürlüğü → sipariş hizalama + haftalık fire analizi → menü ayarlamaları. Bizim vizyonun birebir doğrulaması — Faz 3'ün yıldızı.
- **AI talep tahmini**: manuel tahmine göre %15-20 doğruluk artışı iddiası ([gitnexa](https://www.gitnexa.com/blogs/ai-demand-forecasting-for-restaurants)); mevcut `ingredient_expected_usage` + `daily_prep_report` RPC'lerimiz bunun tohumu.
- **Tahmin → KDS entegrasyonu**: 30 dakikalık talep tahminine göre mutfağa hazırlık talimatı ([smartbridge](https://smartbridge.com/qsr-digital-transformation-restaurant-technology-roadmap/)) — Faz 6 adayı.
- **QR self-servis sipariş**: `/m/[slug]` menümüzün sipariş verebilir hale gelmesi (Katman 4 ile birlikte).
- Dinamik fiyatlama: müşteri kabulü sorunlu ([menusifu](https://www.menusifu.com/blog/restaurant-tech-trends-2025-ai-automation)) — yapmıyoruz.

## E) Geliştirme sırası (fazlar)

Toast şablonu (✅ doğrulandı, [generativevalue](https://www.generativevalue.com/p/toast-a-recipe-for-building-a-system)): 2013-15 POS + **KDS + sipariş yönlendirme** (KDS'i çok erken, 2. adımda eklediler — bizim Faz 1 kararını güçlendiriyor) → 2015-16 sadakat/hediye kartı + online sipariş + stok/gıda maliyeti → 2016+ API ekosistemi, bordro, pazarlama, Toast Capital. İlkeleri: "kritik verinin sahibi ol (siparişler) → otomatikleştir → en acı sorunu çöz → platformlaştır → genişle". Meituan şablonu ([kr-asia](https://kr-asia.com/meituan-to-b-or-not-to-b)): bedava SaaS girişi → tedarik/kredi/reklam cross-sell. Bizim sıralama:

- **Faz 0 — POS çekirdeğini kusursuzlaştır (şimdi)**
  - [ ] Kişi sayısı zorunlu + sonradan +/- (BUSINESS_LOGIC #1; kolon hazır)
  - [ ] Adisyon kaleminde iptal (void, sebep sorarak) ve ikram (şema hazır)
  - [ ] Aynı üründen adet artırma (2 ×, 3 ×)
  - [ ] Ödeme türü: nakit/kart/karışık (bölünmüş ödeme) — şema eklenecek
  - [ ] Hesap bölme (kişi/kalem bazlı) — masa birleştirmenin tersi
  - [ ] Gün Sonu ekranını gerçek rapora bağla (daily_summary RPC hazır)
- **Faz 1 — KDS (mutfak ekranı)**: sipariş kalemi mutfağa düşer; hazırlanıyor/hazır durumları; garson el terminali zaten responsive web. Fiş yazıcısı araştırması (ESC/POS) bu fazda.
- **Faz 2 — Personel**: PIN girişi, roller (admin/şef/garson hazır), masa-garson ataması, vardiya temel. Rol görünürlüğü ayarları zaten hazır.
- **Faz 3 — Kâr paneli + Fire/Kaçak radarı (ÇEKİRDEK FARK)**: sayım ekranı → teorik-gerçek varyans → TL karşılığı → Raporlar sayfası. FIFO tüketimin close_order'a bağlanması.
- **Faz 4 — Türkiye zorunlulukları**: e-Fatura/e-Arşiv entegratör bağlantısı, ÖKC eşleşme planı, paket servis entegrasyonu (aracı API değerlendirmesi).
- **Faz 5 — Dayanıklılık**: çevrimdışı mod (PWA + yerel kuyruk), RLS açılması, çoklu şube.
- **Faz 6 — Büyüme katmanı**: CRM/sadakat, QR self-servis sipariş, AI tahmin→KDS, tedarikçi marketplace (Katman 3 geliri).

Her faz sonunda: build + lint + gerçek veriyle tarayıcı testi + sahada kullanıcı gözlemi.

## F) Çalışma şemaları (programın işleyiş mimarisi)

Olgun POS'ların ortak işleyişi, bizim şemamıza oturtulmuş hali:

### 1. Sipariş yaşam döngüsü
```
Masa seç (Salonlar/Kasa)
  → Kişi sayısı gir (zorunlu) → orders INSERT (status=open, party_size, channel=dine_in)
  → restaurant_tables.status = occupied
  → Ürün ekle → order_items INSERT (status=active; varyant/modifier kopyalanır)
      ↳ [Faz 1] KDS'e düşer (order_items üzerinden; hazırlanıyor→hazır durumları)
  → Kalem işlemleri: adet ±, iptal (status=void + sebep + voided_at), ikram (status=ikram)
  → Hesap iste → tables.status = bill_requested
  → [Faz 0] Ödeme al: order_payments INSERT (tür: nakit/kart; kısmi ödeme desteği)
  → close_order RPC (ATOMİK): ciro=active kalemler; stok düşümü=active+ikram
      (reçete × adet → stock_movements consumption) → orders.status=closed → masa boşalır
```
İlke: durum değiştiren her adım DB'de iz bırakır (kim, ne zaman, neden) — mutabakat bu izlerden kurulur.

### 2. Mutfak (KDS) akışı — Faz 1
```
order_items INSERT → KDS ekranında yeni kalem kartı (Supabase realtime abonelik)
  → Mutfak "hazırlanıyor" → "hazır" işaretler (order_items'a preparing_at/ready_at)
  → Garson ekranında "hazır" bildirimi → servis edildi
İstasyon yönlendirme: kategori → istasyon eşlemesi (İçecekler→Bar, Pizza→Fırın) [ayarlanabilir]
```

### 3. Ödeme ve mutabakat akışı — Faz 0
```
order_payments: id, order_id, amount, method(nakit/kart/yemek_karti), paid_at, [ileride: okc_ref]
Kısmi ödeme: birden çok satır; kalan = toplam − ödenen; kalan 0 olunca kapanabilir
Gün Sonu = Σ adisyonlar = Σ ödemeler (yöntem kırılımlı) — kuruş farkı = uyarı
[Faz 4] Her kapanış → ÖKC fişi + gerekirse e-Fatura/e-Arşiv belgesi
```

### 4. Stok / fire-kaçak döngüsü (çekirdek fark) — Faz 3
```
Alış (add_stock_purchase) → stok +, parti kaydı (purchase_items.remaining_quantity → FIFO hazır)
Satış kapanışı → teorik tüketim (reçete bazlı consumption) → stok −
Sayım (inventory_counts UI) → gerçek stok
RADAR: (dönem başı + alışlar − teorik tüketim) vs sayım
  → fark, waste_tolerance_percent ile kıyaslanır → normal / FİRE / KAÇAK + TL karşılığı
Sarf malzemesi: reçeteye değil kişi sayısına bağlı beklenen kullanım (party_size toplamı) vs gerçek
```

### 5. Gün sonu akışı — Faz 0
```
daily_summary RPC (hazır): ciro, maliyet, adisyon sayısı, kanal kırılımı, ürün kâr sıralaması
+ ödeme yöntemi kırılımı (order_payments'tan) + iptal/ikram dökümü (void/ikram kalemler)
→ Gün Sonu ekranı bu raporu tarih seçimiyle gösterir; WhatsApp özeti ileride buradan beslenir
```

## G) İskelet çalışma planı (dosya seviyesinde)

**Faz 0 kalanı:**
1. ✅ Kişi sayısı + iptal/ikram + adet (TableOrderPanel — yapıldı, 2026-07-10)
2. Ödeme: `order_payments` migration (onay bekliyor) → TableOrderPanel'e "Hesap kapat" yerine ödeme adımı (tutar önerili nakit/kart butonları, kısmi ödeme listesi) → close_order çağrısı ödemeler tamamlanınca
3. Gün Sonu: `app/gun-sonu/page.tsx` → daily_summary RPC'ye bağla; tarih seçici; ödeme/iptal/ikram kırılımı için RPC güncellemesi
4. Hesap bölme: kalem bazlı (seçilen kalemleri ayrı ödemeye bağla) — order_payments üstünde, ek şema gerekmez

**Faz 1 (KDS):**
5. Migration: order_items'a `preparing_at, ready_at, served_at` + kategori→istasyon eşleme tablosu
6. `app/mutfak/page.tsx`: realtime abonelikli kart panosu; Shell'e link
7. Garson tarafında "hazır" rozeti (Salonlar masa kutusunda)

**Faz 2 (Personel):** `profiles` PIN alanı + basit giriş ekranı + rol bazlı görünürlük (restaurant_settings.role_visibility zaten hazır) + masa-garson ataması (Salonlar'a)

**Faz 3 (Radar):** sayım ekranı (`app/sayim` veya Stok sekmesi) → varyans RPC → Raporlar sayfası (kâr paneli + radar). FIFO'nun close_order'a bağlanması.

## H) Gün Sonu ekranı — işletmeci şartnamesi (Gökhan, 2026-07-10)

Uzun analiz ekranı DEĞİL; işletmecinin gece kasadan kalkmadan baktığı **kapanış kontrol paneli**. Net, hızlı, uyarı odaklı, karar verdiren. Üç ana soru + tek hüküm:

### Soru 1 — "Bugün gerçekten kâr ettim mi, yoksa sadece ciro mu yaptım?"
Toplam ciro · KDV hariç net satış · reçete maliyeti · sarf maliyeti · sabit gider payı · indirimler · ikramlar · iptaller · **tahmini gerçek operasyon kârı** · kâr marjı.
Ekranın ilk cümlesi: "Bugün kasaya X girdi ama bunun Y'si gerçekten kâr."

### Soru 2 — "Parayı hangi ürünler kazandırdı, hangileri kârı yedi?"
"En çok satan" ≠ "en çok kazandıran" — ekran bunu AYIRIR. Listeler: en çok satanlar · en çok kâr bırakanlar · çok satıp az kâr bırakanlar · zarar ettirenler · food cost'u yüksek ürünler · reçetesiz (kâr hesabı güvenilmez) ürünler · alış maliyeti değiştiği için fiyatı gözden geçirilmesi gerekenler.

### Soru 3 — "Kasada, stokta, operasyonda açık var mı?"
- **Kasa**: beklenen nakit vs girilen (sayılan) nakit → fark; kart satışları; açık hesaplar; tahsil edilmemiş adisyonlar; indirim/ikram/iptal etkileri.
- **Stok**: teorik tüketim vs sayım farkı; tolerans içi normal fire vs tolerans üstü kaçak şüphesi; kritik stoklar.
- **Operasyon**: açık masa; hesap istemiş ama kapanmamış masa; mutfak/barda tamamlanmamış sipariş; onay bekleyen indirim/ikram/iptal; rezervasyon no-show.

### Hüküm satırı
Her şey normalse: "Kasa tutuyor, açık masa yok, tolerans üstü stok farkı yok — gün kapatılabilir."
Sorun varsa: "Kasada 200 TL eksik, 3 stok kaleminde tolerans üstü fark, 1 masa açık."

### Katmanlı yapım sırası (bağımlılıklar dürüstçe)
| Parça | Veri kaynağı | Durum |
|---|---|---|
| Ciro/net/reçete maliyeti/ikram/iptal/kâr | orders + order_items + reçeteler + daily_summary | ✅ Veri hazır — hemen yapılabilir |
| Ödeme kırılımı + beklenen nakit | order_payments | ✅ Veri hazır |
| Girilen nakit (kasa sayımı girişi) | Yeni: gün kapanış kaydı | Gün Sonu v1 ile eklenecek |
| Sarf + sabit gider payı | restaurant_settings varsayılanları | ✅ Yaklaşık hesap hazır |
| İndirimler | **İndirim özelliği henüz YOK** | Faz 0'a eklendi (aşağıda) |
| Stok varyans/kaçak | Sayım ekranı gerekli | Faz 3 — ekranda "yakında" |
| Mutfak tamamlanmamış sipariş | KDS gerekli | Faz 1 — ekranda "yakında" |
| Onay bekleyen işlemler | Yetki sistemi gerekli | Faz 2 — ekranda "yakında" |
| No-show | Rezervasyon takvimi gerekli | Sonraki faz |

**Faz 0'a eklenen yeni madde: İndirim** (Gökhan kararı: "standart yap, çalışmaya göre değerlendiririz") — hem kalem hem adisyon bazlı, tutar veya yüzde; her indirim sebep+zaman kaydıyla izlenir. Yetki **ayarlanabilir**: işletmeci Ayarlar'dan hangi rolün indirim yapabileceğini seçer (yapı şimdi kurulur, Faz 2'de PIN ile gerçekten kilitlenir).

**Faz 0'a eklenen yeni madde: Kasa defteri** (Gökhan kararı) — kasa canlı bakiye tutar: devir + nakit satışlar (order_payments'tan otomatik) + elle girişler − çıkışlar (tedarikçi ödemesi, masraf, bankaya götürme; tutar+açıklama ile). Gece kapanışta sayım girilir → beklenen vs sayılan farkı → gün kapanış kaydı → kalan, ertesi güne devir. "Kasada neden eksik var?" sorusu tahminle değil hareket dökümüyle cevaplanır.

## I) İş modeli teyidi (Gökhan, 2026-07-10)

Üç aşamalı ekosistem, üç kullanıcı tipi: **işletme** (bedava program — şu anki tüm iş), **tedarikçi** (satın almalar program üzerinden — gelir kaynağı), **son kullanıcı** (eklenti uygulama; işletmeler kampanya yapar). VISION.md'deki 4 katmanla uyumlu; para yazılımdan değil, üzerine kurulan tedarik + kampanya ekosisteminden kazanılacak.

## J) Tasarım ilkesi (Gökhan, 2026-07-10)

"Kullanışlı ve kolay yönetilebilen ama basit görünmeyen" — sade + rafine. Mevcut renk paleti (beyaz zemin, zümrüt yeşili, altın vurgu) korunacak. Modern referans seçimi Claude'a bırakıldı; ilk uygulama alanı Gün Sonu ekranı olacak (tasarım örneği + en öncelikli ekran aynı anda).

## K) Rakip pano değerlendirmesi ve eklenenler (2026-07-12)

Kullanıcı yorumlarında tasarımı/kolaylığı en çok övülen sistemler incelendi: **Toast** (pano tasarımı sektör referansı: 4 ana kart — satış, işçilik, müşteri sayısı, en çok satanlar; her rakamın yanında geçen dönemle % karşılaştırma), **Square** (kurulum basitliği), Türkiye'de **Adisyo** (eğitimsiz kullanım). Ortak övgü: az sayıda büyük rakam + karşılaştırma yüzdesi + tıklayınca detaya inme.

**Bugün eklenenler (Ana Sayfa):**
- Bugünkü ciro kartına **geçen hafta aynı güne göre % değişim** + **bugünkü müşteri sayısı** (party_size toplamı)
- **En çok satanlar (son 7 gün)** paneli — adet + ciro, satır listesi
- **Bugünün saatlik yoğunluğu** — kapanan hesapların saat saat mini çubuk grafiği
- Sabit giderlerde **KDV dahil giriş + KDV oranı** alanı; KDV hariç otomatik hesap (migration: business_expenses_vat)

**Değerlendirilen ama sonraya bırakılanlar:**
- İşçilik maliyeti kartı (Toast'un 4 ana kartından biri) → Personel/PIN fazıyla birlikte (Faz 2) — personel-vardiya verisi yokken boş kalır
- Kartlardan tıklayıp detay rapora inme (drill-down) → Raporlar sayfası zenginleşince
- Karşılaştırma dönemi seçimi (geçen hafta / geçen yıl aynı hafta) → veri biriktikçe
- Haftalık özet görünümü (Toast varsayılanı haftalık kadans) → Raporlar sayfasına

**Tema kararı (Gökhan, 2026-07-13):** Yeşil palet (#fffeef / #9fd700 / #446158 / #272c1a) + yeşil küpler arka plan fotoğrafı onaylandı. İleride **arka plan seçenekleri** eklenecek: işletme Ayarlar'dan hazır arka planlardan seçebilecek veya kendi görselini yükleyebilecek (isteyen istediğini kullanır).

## L) "İşletme Beyni" Vizyonu — Fire/Kaçak, Para Takibi, Tedarik Ajanı, Satış Tahmini, Personel (Gökhan, 2026-07-13)

Gökhan 10 yıl işletmecilik yapmış, 15 mekan açmış biri. Programın "sıradan kasa/stok yazılımı" olmasını istemiyor — **aktif, gözlemci bir sistem** istiyor: veriyi sadece tutan değil, kendi kendine yorumlayıp sorun gördüğünde **kendisi haber veren** bir program. "Program patronun eli ayağı olacak" — patron ekranından her şeye hakim olacak, personel araya girip kağıda dökmeyecek. Fark: **pasif** bir program (veriyi tutar, sen bakıp anlarsın) değil, **aktif/gözlemci** bir program (veriyi tutar, kendisi anlar, sana söyler).

**"İşletme beyni" — büyük çerçeve (Gökhan, birkaç sohbet turunun özeti):** "Program bir işletme beyni olacak, işletme kullanır kullanmaz onun bileceği işi ama biz yapacağız... müşteri siparişini verdi, parayı ödedi, sonra olan her şeyi program takip edecek, işletecek." Yani ödeme kapandıktan sonraki zincir (stok düşümü, maliyet/kâr hesabı, fire/kaçak karşılaştırması, tedarik tetikleme) elle araya girilmeden otomatik akmalı. Aşağıdaki beş parça (fire/kaçak, para takibi, tedarik ajanı, satış tahmini, personel) bu tek çerçevenin farklı yüzleri.

**Somut örnek (peçete, Gökhan'ın kendi anlatımı):** "Sarf malzemeleri sayılmaz, kontrol edemezsin ama ne geldiğini bilirsin. Fatura sisteme girilir, mekana gelen müşteri belli. 500 peçete alınmış, şu ana kadar 100 müşteri girmiş — müşteri başına 5 peçete. Stok var mı bilmiyoruz, sayılana kadar tahmin yürütmemiz gerekiyor. Yeni sipariş geldi, 500 peçete daha — 1000 peçetemiz oldu, müşteri 300 oldu — öğreniyoruz ki şu an müşteri başına düşen peçete 3.33. Böyle devam ediyor, öğreniyor... 1 sene böyle gitti, sonra bir baktık peçete 5 tane gidiyor 6 tane gidiyor — program bunu görecek, diyecek ki sorun var." Yani: **öğrenilen referans oran** (müşteri başına düşen sarf miktarı) zamanla oturur; bu orandan **sapma başladığı an** program kendisi uyarmalı — işletmeci bunu bir yıl sonra tesadüfen değil, o anda öğrenmeli.

**İki büyük parça (ikisi de yapılacak; Gökhan: "ikisinide kuracağız, önceliği önemli değil, plan işi sende"):**

- **(A) Genelleştirilmiş fire/kaçak radarı** — "her üründe bunu uygulayacağız, bizim programımızda kaçak imkansız olacak." Sadece peçete değil, sisteme giren **her fatura/malzeme** — mutfak gereçleri, sandalye dahil ("su, meşrubat bunlar sayılmaz, patronda çok sallamaz" — restoranlarda önemli olabilir dedi, ucuz/önemsiz kalemler hariç tutulabilir). Program kendine kaydedilen her faturayı saymaya başlayacak.
- **(B) Uçtan uca para takibi** — "diğer programlar kasa tutmaz, biz kasada tutacağız, ödemede tutacağız, para bizim programımıza giriyor, banka kesintilerine kadar hesaplayacağız. Şu an bankada bu kadar olması gerek diyecek, çekilen parayı girecek sisteme, ileri seviyelerde biz hesap bağlantısı sağlayacağız. Nakit çıkışları, kasa kalanı, her şeyi bilecek." Hedef: **"belki ön muhasebe denen şeye gerek kalmayacak"**, "program 3-4 personel ihtiyacını ortadan kaldıracak, bu da bizi kullanımda önceliğe çekecek" (rekabet avantajı).

Ayrıca ikincil bir istek: teknik/spesifik sorularda yardımcı olan bir **chat bot** olursa fena olmaz — ama asıl omurga sessiz çalışan, kendi kendine sorun bulan gözlemci sistem (2. seçenek, konuşan bir asistan değil).

**(C) Tedarik ajanı / sipariş otomasyonu** — "sistem stoklardan ihtiyacı çıkaracak, tedarikçinin zamanına göre... meşrubat grubu haftada bir gelir, sebze günlük, sarf istediğin zaman — sistem bunları bilecek ve siparişini buna göre ayarlayacak, sonra patron ekranına düşecek ya da yetki kimdeyse ona manuel 'şuraya siparişi ver' diyecek ya da siparişi ver diyecek." İki ayrı yol: **manuel mod** işletmenin kendi mevcut tedarikçileri için geçerli, sipariş **WhatsApp mesajı** ile gider; platformun kendi tedarikçi ağı ("bizim tedarikçilerimiz") ayrı bir **tedarikçi modülü**ne düşer. Bilinçli strateji (Gökhan): "manuel olarak kendi tedarikçilerine vermesi zor olacak, zamanla bizimkilere kayacak" — platform tedarikçi ağı kolay/varsayılan yol, kendi tedarikçisine sipariş kasıtlı olarak biraz daha zahmetli. Bu, bölüm I'deki "tedarik sistemi komisyonu" iş modeliyle birebir örtüşüyor; platform tedarikçileri fiyat/kalitede rekabet edecek, şikayet alan tedarikçi sistemden atılacak.

**(D) Satışa dayalı, çok faktörlü talep tahmini** — "program siparişleri öğrendiği satışlara göre çıkaracak... ertesi gün satış olma ihtimali olan yemekleri çıkaracak, ona göre liste hazırlayacak." Sadece aynı gün paterni değil, **genel** değerlendirme: tam takvim farkındalığı — "o gün bayram mı geliyor, geçen bayram ne olmuştu, yas mı, alkollü restoran ise Ramazan mı" — artı menü ve tedarik zamanlaması. **Kritik doğruluk kuralı** (Gökhan'ın kendi tabiriyle): "2 tabak yemek satılıyor, yemek menüden ne olursa olsun zeytin şu kadar gider, marul bu kadar gider, her satılan salataya ayrı ürün hesaplanmayacak ama ortak ürün dikkate alınacak — **stok şişmeyecek yani**" (reçete patlatma / bill-of-materials: ortak malzemeler tek seferde toplanır, yemek başına tekrar sayılmaz). **Tolerans:** "sonuç itibarıyla her ürünün en az 3-4 gün süresi var" — tahminin kusursuz olması gerekmiyor, doğal bir stok/teslimat tamponu var. **Soğuk başlangıç** (onaylandı — "evet"): yeterli geçmiş satış verisi olmayan yeni işletmede sistem elle girişe düşer, veri birikince öğrenme devralır (Ana Sayfa'daki mevcut "tahmin için yeterli veri yok" düşüş mantığıyla aynı desen).

**(E) Personel modülü** — "personel eklenecek, personel giderleri eklenecek, personel yemeği, kıyafeti, içtiği, geri dönüşüm." Kalemler: **personel giderleri** (maaş, SGK/prim, mesai — (B) para takibinin gider tarafına bağlanacak); **personel yemeği ve içtiği** (stoktan düşecek ama **satış değil gider** olarak işlenecek — bu ayrım kritik, aksi halde hem maliyet gizli kalır hem de (A)'daki "müşteri başı tüketim" oranı bozulur); **kıyafet/forma** (personel başına dönemsel gider); **geri dönüşüm** (kullanılmış yağ satışı gibi küçük ek gelir kalemleri de olabilir — detay netleşmedi, ileride sorulacak).

**(F) Personel mobil modülü + otomatik giriş-çıkış** — "zamanla her çalışanın telefonuna indireceği bir modül yaparız, onlara bildirimler gider, telefonları internet ağına bağlanır, ne zaman geldiler ne zaman çıktılar bilir." Bildirim altyapısı + işyeri ağına bağlanmadan mesai/puantaj tespiti. **Teknik not:** iOS ham WiFi SSID okumaya OS kısıtlaması getiriyor (özel izin gerekiyor, güvenilir değil), Android daha kolay — bu faza gelindiğinde GPS/konum tabanlı geofence (iki platformda güvenilir) ilk sürüm, WiFi tabanlı algılama mümkün olan yerde ikinci katman olarak değerlendirilecek.

**Çalışma şekli teyidi (bu konuşmada tekrar netleşti):** Gökhan kendi cümleleriyle anlatır, Claude anlayıp doğru terimlerle plana döker ve onayını alır, kod yazılır, Gökhan kullanıp test eder, sıkıntılı yerler düzeltilir.

### Mevcut altyapı taraması (2026-07-13 itibarıyla kod/şema okunarak doğrulandı)

Şemanın büyük kısmı zaten var, hiç kullanılmıyor/bağlanmamış durumda:
- `ingredients.category` = `'gida'` (reçeteli) / `'sarf'` (kişi başı tüketilen) — peçete ayrımı zaten var.
- `ingredients.waste_tolerance_percent` — "et %3 → 10 kg'da 300 gr eksik normal, fazlası kaçak uyarısı" yorumuyla eklenmiş ama hiçbir yerde kullanılmıyor.
- `purchases` + `purchase_items` — fatura/alış tablosu var ama şu an sadece **tek malzemeli** giriş destekleniyor (`add_stock_purchase` RPC, `app/stok/page.tsx`). Stok sayfasında zaten not var: "Manuel giriş. E-fatura ve AI foto ile giriş yakında."
- `stock_movements` — purchase/consumption/waste/count_adjustment hareket defteri, ledger hazır.
- `suppliers`, `purchase_requests`, `efatura_connections` — tedarikçi + eksik-tespiti-onay akışı + e-fatura bağlantı iskeleti var, çoğu henüz UI'sız.
- `ingredient_expected_usage` RPC — var ama bu **ileriye dönük tüketim tahmini** (son 28 gün ortalaması × gün sayısı, tedarik için), fire/kaçak karşılaştırması değil.
- Para tarafında bu oturumda kurulanlar: `order_payments`, `order_discounts`, `cash_movements`, `day_closures`, `close_order` RPC, Kasa ekranındaki "Kasa hareketi". (B)'nin nakit/kasa temeli kısmen atılmış; banka entegrasyonu ve ön-muhasebe seviyesi henüz yok.
- `public_holidays` tablosu + `daily_prep_report.resmi_tatil` — (D)'nin takvim farkındalığı için resmi tatil kısmı **zaten var**; yas günü ve Ramazan-özel mantığı yeni eklenecek.

**Personel/HR altyapısı (2026-07-13 taraması):**
- `profiles` tablosu var: `id` (auth.users FK), `restaurant_id`, `full_name`, `role` (`admin`/`garson`/`sef`) — personel kimliğinin temeli hazır.
- **Auth hiç bağlı değil** — `lib/supabase/client.ts` sadece anon-key browser client, RLS bilinçli olarak V0'da kapalı, `middleware.ts` yok. `app/garson/page.tsx` bugün girişsiz.
- `app/personel/page.tsx` **placeholder** (`<Soon>`): "Kullanıcılar, roller, PIN girişleri burada yönetilecek" — Faz 2'de zaten scope edilmiş, henüz kodlanmamış.
- `business_expenses` tablosu var ve kullanımda ama sadece sabit aylık gider (kira, fatura); personele/kişiye özel değil, mesai/vardiyaya bağlı değil.
- **Bildirim/push altyapısı tamamen yok** — greenfield.

**Sonuç:** (A) için asıl eksik — çok kalemli fatura girişi ekranı ve "öğrenen oran + sapma tespiti" hesaplaması + uyarı yüzeyi. Şema hazır, mantık ve UI yok. Personel modülünün kimlik (profiles.role) ve para (business_expenses, cash_movements) temelleri kısmen hazır; asıl eksik auth/PIN girişi, kişiye bağlı gider/tüketim kaydı ve mobil app + bildirim + konum altyapısının tamamı.

### Önerilen fazlı yol haritası (2026-07-13, sıralama bağımlılığa göre — Gökhan: "plan işi sende", istediği an değiştirebilir)

Kapsam tek seferde kurulamayacak kadar büyük; her faz kendi başına test edilebilir bir kazanım vermeli.

1. **Fire/kaçak radarı v1 (sarf malzemeleri)** — çok kalemli fatura girişi ekranı (`purchases`/`purchase_items` zaten uygun, sadece UI + çoklu-satır insert lazım) + "müşteri başına oran" öğrenme/sapma hesaplaması (`category='sarf'` malzemeler için kümülatif alım / kümülatif party_size, geçmiş dönemle karşılaştırma) + Ana Sayfa'da "Fire/Kaçak Uyarıları" paneli. En hazır altyapı, en somut fark yaratan özellik — flagship.
2. **Personel kimlik temeli** — PIN login + rol bazlı erişim (mevcut `profiles.role` üzerine), masa-garson ataması. Hem kendi başına değerli (zaten bekleyen "Faz 2"), hem de personel mobil modülünün (adım 8) ön koşulu.
3. **Fire/kaçak radarı v2 (gıda + demirbaş)** — `waste_tolerance_percent` bazlı reçeteli malzeme fire hesabı; mutfak gereçleri/demirbaş için aynı öğrenen-oran mantığı.
4. **Personel gider/tüketim ayrımı** — maaş/SGK/prim gideri kaydı (kişiye bağlı, `profiles.id` üzerinden), personel yemeği/içeceği için stoktan düşüp **satış değil gider** işaretleyen ayrı bir hareket tipi (mevcut `stock_movements` üzerine yeni movement_type), kıyafet gideri. Adım 1'in oran hesaplamasının personel tüketimini yanlışlıkla müşteri satışına katmamasını burada garanti ederiz.
5. **Para takibi derinleştirme** — banka hesabı entegrasyonu, "bankada şu an şu kadar olmalı" karşılaştırması, ön-muhasebe seviyesi.
6. **Tedarik ajanı v1** — mevcut `ingredient_expected_usage` + `suppliers.delivery_frequency` ile stok eşiğine dayalı sipariş önerisi, manuel onay ekranı (`purchase_requests` üzerine), WhatsApp'a mesaj gönderimi (kendi tedarikçileri için).
7. **Satış tahmini + takvim farkındalığı** — çok faktörlü talep modeli, reçete patlatma (ortak malzeme tekilleştirme), soğuk-başlangıç fallback. Tedarik ajanını v1'den v2'ye (reaktif → öngörülü) yükseltir.
8. **Personel mobil modülü** — bildirimler, konum/geofence tabanlı otomatik giriş-çıkış.
9. **Platform tedarikçi ağı / tedarikçi modülü** — pazaryeri tarafı, komisyon modeli. En büyük iş modeli parçası, muhtemelen ayrı bir proje gibi ele alınmalı.

Mantık: önce en hazır altyapıyla en çok fark yaratan şey (1), sonra ileride tekrar tekrar lazım olacak temel kimlik katmanı (2), sonra aynı radar mantığını genişletmek (3-4), sonra para (5), sonra otomasyon zincirinin gövdesi (6-7), en son cihaz/donanım bağımlı ve iş-modeli/pazaryeri gerektiren en karmaşık parçalar (8-9).

## M) Dünya + Türkiye pazar taraması ve sayfa-sayfa boşluk analizi (2026-07-27)

Gökhan'ın isteğiyle yapılan kapsamlı tarama: dünyada ve Türkiye'de kim lider, ne yapıyor; bizim hangi sayfalarımız boş, dokunduklarımızda ne eksik kaldı, neyi fazladan/erken ekledik.

> **Kaynak güvenilirliği notu:** Aşağıdaki linklerden yalnızca [Türkiye karşılaştırma](https://karekodgarson.com/blog/en-iyi-restoran-yazilimlari-2026-kapsamli-karsilastirma) sayfası doğrudan açılıp okundu. Diğerleri arama sonucu özetlerinden derlendi — **rakam ve iddiaları (müşteri sayısı, pazar payı, tasarruf yüzdeleri) karar dayanağı yapmadan önce teyit et.** Buna karşılık "kod tarafı" bulguları (§4) doğrudan bu depoda `grep`/dosya okumasıyla doğrulandı, onlar kesin.

### M1) Ülke ülke liderler

| Bölge | Lider(ler) | Ayırt edici yanı |
|---|---|---|
| ABD/Kanada | **Toast**, Square, SpotOn, TouchBistro, Lightspeed | Toast pano tasarımı sektör referansı (bkz. §K); ödeme işlemciliğinden para kazanıyor |
| Almanya | **orderbird**, **gastronovi** | TSE (fiskal donanım) sertifikalı — yasal zorunluluk yerel oyuncuyu koruyor |
| İrlanda/UK | **Nory** | Bizim vizyonun birebir rakibi — ayrı başlık, §M2 |
| MENA | **Foodics** (Suudi) | Bölgesel all-in-one, hızlı büyüyor |
| Hindistan | **Petpooja**, **UrbanPiper** | UrbanPiper POS↔yemek platformları arası "middleware" olarak konumlanmış |
| Türkiye | **Adisyo** (7.000+ müşteri), **Simpra** (22 ülke/3.000+ işletme), Menülux, SambaPOS, Karekodgarson | Adisyo yaygınlık lideri; Simpra kurumsal; Karekodgarson "130+ modül + AI satış tahmini + personel İK" iddiasıyla saldırıyor |

Pazar büyüklüğü: global ~6 milyar $ (2026); Avrupa %30, Asya-Pasifik %25 pay.

### M2) En kritik bulgu — Nory

İrlanda merkezli, 2021 kurulmuş, 2026'da ABD'ye açılıyor. Konumlandırması **§L'deki "işletme beyni" cümlesinin birebir aynısı**: *"raporlayan değil, işi kendisi yapan"* — tahmin, vardiya planlama, sipariş verme, fatura işleme, bordro ve uyumu yöneten bir AI asistan ekibi. İddiaları: %8-20 işçilik tasarrufu, %50'ye varan fire azalması.

İki sonuç:
- **İyi haber:** vizyon doğru, pazar bunu satın alıyor — Gökhan'ın sezgisi sektörle örtüşüyor.
- **Uyarı:** bu fikir artık "bulunmamış" değil. Avantajımız Türkiye'ye özgü derinlik (ÖKC/fiskal uyum, yerel tedarik zinciri, yerel çalışma kültürü) ve bedava+tedarik-komisyonu iş modeli (§I) olmalı. Jenerik "AI'lı restoran yazılımı" başlığında yarışamayız.

### M3) Kaçırdığımız 1 numaralı sektör kavramı — Prime Cost

Sektörün tek en önemli yönetim metriği bu ve **bizde yok**:

```
Prime Cost = (Malzeme maliyeti + İşçilik maliyeti) ÷ Ciro
```

Sektör hedefleri: fast food %55-60, normal restoran %60-65, fine dining %68'e kadar. İşçilik tek başına %25-35 olmalı.

Neden önemli: kira/fatura kontrol edilemez, ama bu ikisi **edilir** — dünyada işletmeciler günlük olarak buna bakıyor. Bizde food cost oranı zaten var, personel maaşı da eklendi (§M4'teki tarih) — **iki parça da elimizde, sadece birleştirip tek satır olarak göstermiyoruz.** Ana Sayfa'ya eklenecek en yüksek getirili tek şey bu.

> Uyarı: tam doğru prime cost **günlük işçilik** ister; bizde maaş aylık sabit girildiği ve vardiya takibi olmadığı için (§M4) ilk sürüm yaklaşık olacak. Vardiya modülü gelene kadar "aylık maaş ÷ gün sayısı" ile tahmini gösterilmeli, bu varsayım ekranda belirtilmeli.

### M4) Sayfa sayfa durum (kod tarafı — bu depoda doğrulandı)

**Hiç dokunmadıklarımız:**

| Sayfa | Durum | Olması gereken |
|---|---|---|
| **Raporlar** | 10 satır, tamamen boş placeholder | **En büyük boşluk.** Garson satış, ürün kârlılığı, saatlik yoğunluk, iptal/ikram raporu, dönem karşılaştırma |
| **Profil** | 79 satır, sadece "bugün" özeti | Gökhan'ın "içi detaylandırılacak" dediği yer — hâlâ açık. Haftalık/aylık geçmiş, maaş/avans hareketleri, vardiya geçmişi |
| **QR Menü** (`/m/[slug]`) | 138 satır, sadece görüntüleme | Müşteri masadan QR ile sipariş verebilmeli — sektörde artık standart |
| **Ayarlar** | Var ama yarım | Restoran bilgisi (ad/adres/vergi no), çalışma saatleri, yedekleme, arka plan seçimi (§K sonu) |
| **Gün Sonu** | 395 satır, dolu ama simüle edilmedi | Test edilmeli |

**Dokunduklarımızda eksik kalanlar:**

- **Hesap bölme (split bill)** — masa birleştirmenin tersi, hiç yok. Sektörde zorunlu çekirdek.
- **Vardiya/mesai takibi** — kodda `shift`/`mesai`/`clock_in` diye tek satır yok. Bu yüzden işçilik maliyeti günlük hesaplanamıyor → **prime cost tam çalışmaz** (§M3).
- **Bahşiş yönetimi** — hiç yok. Sektörde en sık şikayet edilen eksiklerden.
- **Rezervasyon takvimi** — sadece masada `reserved` durumu var, takvim yok.
- **Fiş/mutfak yazıcısı (ESC/POS)** — kodda hiç yok. Türkiye'de adisyon kültürü açısından kritik.
- **Sayım ekranı** — `inventory_counts` tablosu ilk migration'dan beri duruyor, UI hiç yazılmamış. **Fire/kaçak radarının ön koşulu** — yani §L'deki en çok istenen özellik bu eksik yüzünden kurulamıyor.
- **Çevrimdışı çalışma** — yok. Sektördeki 1 numaralı şikayet konusu.
- **Paket servis entegrasyonu** — yok.

**Fazla/erken eklediklerimiz:**

- **"Tahmini günlük satış payı %"** (menü ürününe elle girilen) — sistem bunu satış geçmişinden kendisi öğrenebilir. Veri birikince gereksizleşecek; zararsız ama geçici.
- **Konsept şablonları** — sadece "Pizzacı" var, tek örnekle yarım kaldı; ya çoğaltılmalı ya beklemeye alınmalı.
- **Personel karşılaştırma/gamification** — "fazla" diye değerlendirilmişti, ama Karekodgarson tam da bunu satış argümanı yapıyor; **doğru bir bahis çıkmış.**

### M5) Önerilen sıradaki 3 iş — ✅ üçü de tamamlandı (2026-07-28 itibarıyla)

1. ~~**Prime cost satırı**~~ — Ana Sayfa'da var (malzeme + işçilik / ciro).
2. ~~**Sayım ekranı**~~ — `/sayim` var: teorik stok vs sayılan, fark tutarı, onaylı işleme.
3. ~~**Raporlar sayfası**~~ — 6 sütunlu tam rapor ekranı.

**Kaynaklar:** [Nory 2026 rehberi](https://www.nory.ai/blog/restaurant-tech-stack-2026) · [Nory ABD açılımı](https://restauranttechnologynews.com/2026/03/nory-expands-into-u-s-as-restaurants-seek-ai-tools-to-manage-rising-costs/) · [Restaurant365 prime cost](https://www.restaurant365.com/blog/how-to-calculate-prime-cost-in-a-restaurant/) · [Lightspeed KPI listesi](https://www.lightspeedhq.com/blog/restaurant-kpis/) · [Almanya POS liderleri](https://www.zendikt.com/top-10-restaurant-pos-software/germany/) · [Türkiye karşılaştırma](https://karekodgarson.com/blog/en-iyi-restoran-yazilimlari-2026-kapsamli-karsilastirma) · [Restoran tech büyüme](https://www.landbase.com/blog/fastest-growing-restaurant-tech) · [POS eksik özellik şikayetleri](https://getquantic.com/restaurant-pos-system-features/)

## N) Mevzuat uyumu + kapasite/personel analizi — 8 boşluk kapatıldı (2026-07-28)

§M'de yarım kalan pazar kıyas araştırması tamamlandı; envanterle karşılaştırılıp gerçekten
eksik olan 8 madde bulundu ve kapatıldı. Aşağıdakiler **yapıldı**, §A tablosuna da işlendi.

### N1) Ticari bulgu — e-Adisyon giriş biletidir

Ürünü satılabilir kılan asıl kaldıraç mevzuat zorunluluğu:

- **e-Adisyon**, masa servisli lokanta/kafe/bar için **1 Temmuz 2022'den beri zorunlu**;
  e-Fatura veya e-Arşiv mükellefi olan her yeme-içme işletmesi otomatik kapsama giriyor.
  2026 e-Fatura eşiği 3 milyon TL ciro (e-ticaret yapanlarda 500 bin TL). Uyumsuzluk cezası
  **belge başına 17.000 TL**.
- 7524 sayılı Kanun gereği adisyon yazılımının yeni nesil ÖKC ile entegre çalışması şart.
- **Kritik teknik detay:** GİB özel entegratörü olmaya gerek yok — mevcut bir entegratörün
  API'sine bağlanmak yeterli. BİS raporu, bağımsız denetim ve GİB başvurusu yükü entegratörde.
- Pazar: ~113.540 yeme-içme işletmesi. Rakip fiyatları: Menulux 250–1.250 TL/ay,
  robotPOS 3.000–5.000 TL/ay/şube.

**Konumlandırma uyarısı:** Pazar kalabalık (robotPOS, Menulux, Adisyo, vRest, OxyMenu,
Tabpad, EnoMenu). "Bir adisyon programı daha" olarak girilirse kaybedilir. Satış cümlesi
*"kaçağını bulan sistem, e-Adisyon zaten içinde"* olmalı — §L'deki fire/kaçak radarı
farklılaştırıcı, e-Adisyon giriş bileti.

### N2) Yapılanlar

| # | İş | Nerede |
|---|---|---|
| 1 | **Hakediş mutabakatı** — sağlayıcı bazlı komisyon/valör, beklenen vs yatan, gecikme alarmı | Kasa "Yoldaki para", Ayarlar sağlayıcı tablosu, ödeme anında sağlayıcı seçimi |
| 2 | **Alerjen** — eksik 4 grup (Kereviz, Sülfit, Acı bakla, Yumuşakça) eklendi, 14 tamamlandı | `lib/allergens.ts`, Menü uyum bandı, QR menü |
| 3 | **Kalori** — eksik ürünleri gösteren uyum paneli | Menü |
| 4 | **KVKK** — aydınlatma metni, saklama süresi, anonimleştirme | Ayarlar, Rezervasyon, QR menü |
| 5 | **Puantaj** — haftalık cetvel, 45 saat aşımı, fazla mesai onayı, 270 saat tavanı, yıllık izin | Vardiya > Puantaj & izin |
| 6 | **Menü mühendisliği** — Kasavana-Smith 4 kadran + kadran başına aksiyon | Raporlar sütun 2 |
| 7 | **RevPASH** — koltuk-saat başına ciro, devir hızı, ortalama masa süresi | Raporlar sütun 3, masaya `seat_count` |
| 8 | **Satış tahmini + personel planı** — 14 gün, takvim farkındalıklı, hedef işçilik oranı | Vardiya > Plan |

Ayrıca: mutfak/bar ekranında adisyonlar yatay şeride alındı (alta düşmüyor), üstte
kapanmamış/kapanmış sayacı eklendi.

### N3) Alerjen beyanında güvenlik kuralı

QR menüde **"Alerjen içermez" yalnızca işletmeci listeyi bilerek onayladıysa** (ya da reçetede
etiketli malzeme varsa) yazılır. Sadece reçetesi olmak yetmez: malzemeler etiketlenmemişse
reçeteden boş liste çıkar, bu "yok" değil **"bilinmiyor"**dur. İlk sürümde bu ayrım yoktu ve
ununda gluten, peynirinde süt olan pizzaya "Alerjen içermez" yazdı — çölyak hastası için
hiçbir şey yazmamaktan tehlikeli. Emin olunmayan durumda ekran susar, eksik Menü'deki uyum
panelinde işletmeciye söylenir. **Bu kural bozulmamalı.**

### N4) Bilinen eksikler (bu turda kapatılmadı)

- **Dini bayram tarihleri hesaplanmış değerlerdir**, Diyanet takvimiyle bir gün oynayabilir;
  yas günü ve Ramazan ayı için `public_holidays`'e kayıt girecek ekran yok.
- **Personel yemeği/içeceği** hâlâ satıştan ayrışmıyor (§L(E)) — fire/kaçak oranını ve satış
  tahminini bozmaya devam ediyor.
- Fiş/ESC-POS yazıcı, paket servis entegrasyonu, çevrimdışı çalışma, muhasebe entegrasyonu:
  değişmedi.
- Proje genelinde ~40 lint hatası var (`react-hooks/set-state-in-effect`); bugünkü işten
  değil, mevcut desenin sonucu — toplu düzeltme ayrı bir iş.

## O) Masa servisi simülasyonu — karar defteri (2026-07-28 gecesi)

Gökhan'la "müşteri içeri girdiği andan çıkana kadar tüm yolları çıkaralım" sohbetinin
kararları. **Yöntem (Gökhan):** önce yazılı simülasyon, tüm yolların eksiği çıkar, tek
seferde yapılır, en son canlı simülasyon. Masa servisiyle başlandı; bitince diğer
sektörlere (kafe/self servis, dönerci, paket) uyarlanacak. Tasarım en lüks restorana
göre yapılıyor, aşağı doğru sadeleşecek.

### O0) ANA İLKE — bu bölümün tamamını yöneten kural

> **Otomatikleştirilebilecek her şey otomatik olacak. Manuel alternatif tasarlanmayacak.**
> Gökhan'ın kendi sözleri: *"bana manuel sistemlerle gelme… biz gereken özellikleri
> koyacağız, kullanmak işletmeye kalmış."* Her özelliğin kapatma seçeneği zaten olacak;
> ama tasarım hep otomatik olandan başlayacak. Mevcut Türkiye programları sipariş + stok +
> raporlamadan ibaret, gerisi manuel — farkımız tam burada.

### O1) Masa durumu zinciri

Bugünkü `empty / occupied / bill_requested / reserved` yetmiyor. Yeni zincir:

hazır → (karşılama oturtur) dolu → hesap istendi → müşteri gitti / kasa bekliyor
→ toplanacak → (garson temizler, "hazır" der) hazır

- Hesap kapanınca masa **boş değil "toplanacak"** olur.
- Garson toplayıp kurunca **"hazır"** işaretler. Karşılama **sadece hazır** masaları görür.
- Oturtma ile adisyon açma **ayrılıyor** — müşteri oturur, masa dolu görünür, sipariş sonra.
- "Hazır"a düşünce karşılamaya sinyal gider (hesap istendiğinde değil).
- Masanın toplanma süresi ölçülür → devir hızı analizine girer.

**Üç mod (işletme seçer):**
1. *Basit* — hesap kapanınca masa direkt boş (dönerci, hızlı işleyen yer)
2. *Garson takipli* — toplanacak → hazır, karşılama yok
3. *Karşılamalı* — tam zincir

### O2) Karşılama modülü ve bekleme listesi

- Bekleme listesi: **isim soyisim + kişi sayısı** zorunlu, **telefon** alınabilirse (vale için
  de gerekiyor).
- Sıra sırayla ilerler ama **son karar karşılamada** — yoğunsa 4 kişilik masaya 2 kişi
  almayabilir.
- Bekleme süresini şimdilik karşılama söyler ("şu kadar kişi var"). Mesaj/bildirim,
  müşteri uygulaması geldiğinde eklenecek.
- Müşteri kaydı: zorlama yok. Asıl yol **müşteri uygulaması** — restoran teşvikle
  yönlendirir ("uygulamamızı indirirseniz tatlı bizden"). KVKK da müşterinin kendi
  onayıyla çözülmüş olur.

### O3) Garson ataması ve mola

- Masalar garsonlara **atanacak** (bölge sistemi).
- Sipariş alınmamış dolu masa **ayrı renkte** görünür.
- Bildirim gider; garson kapatabilir, titreşim/sessiz seçebilir.
- **Mola özelliği (Gökhan'ın fikri):** garson "mola" seçer → masaları ya herkese ya da
  yardımcısına açılır. Hem mola görünür olur hem masa sahipsiz kalmaz. Puantaja bağlanır.

### O4) Vale

- Vale kaydı: **plaka + isim soyisim**.
- Eşleştirmeyi **program yapar** (bekleme listesi/rezervasyondaki isimle).
- **Hesap istendiği anda vale'ye bildirim** → araba müşteri kapıya gelmeden hazır.
- Açık uç: ismini vermeden gelen müşteride eşleşme tutmaz, elle seçim gerekecek.

### O5) Servis sırası (coursing) — Gökhan'ın tasarımı

- Menüde başlangıç varsa **önce başlangıçlar** gider.
- Garsonun masa ekranında **"Ana yemekler" / "Tatlılar" butonları** durur.
- Garson müşteriye sorar: *"ana yemekler de çıksın mı?"* Çıksın derse hemen tıklar;
  "önce başlangıç" derse, başlangıç gelince tekrar sorup ona göre tıklar.
- **Karar müşterinin, tetik garsonun elinde** — program araya girip kendi göndermiyor.
- Sıra **kategoriden** gelir (Başlangıçlar 1, Ana 2, Tatlı 3); garson uğraşmaz.
- **İçecekler sıraya girmez**, bar siparişi hep anında gider.
- Mutfakta bekleyen servis **soluk** görünür (hazırlık için), işlem yapılamaz.
- **Mutfağa sesli bildirim** — yeni servis düşünce sesle haber verir. Detayı sonra.
- Komple kapatılabilir (dönerci modu).
- Servisler arası süre ölçülür ("başlangıçtan anaya ortalama 18 dk").

### O6) Sipariş kararları

- **Kişi bazlı sipariş YOK.** Hesap kalem kalem bölünmeye devam. Uzun iş ama nadir;
  çok bölen bir işletme çıkarsa o zaman bakılır.
- Kişi sayısı sonradan değiştirilebiliyor (mevcut, çalışıyor).
- Masa taşıma çalışıyor.

### O7) Ürün bitti (86)

- **Program otomatik yapacak.** Stoktan hesaplayıp **son 3 siparişe yetecek kadar
  kaldığında uyarmaya başlar**, bitince ürünü kapatır.
- Kapanan ürün garson ekranında ve QR menüde kapalı görünür, sipariş verilemez.
- Gün kapanınca kendiliğinden geri açılır (kalıcı `is_active` ile karıştırılmayacak).
- Stokta görünmeyen durumlar (bozulma, hazırlanan ürünün tükenmesi) için elle "bitti" de kalır.

### O8) Mutfak → garson bildirimi

- Yemek hazır olunca garson ekranında **renk değişir** + **sesli/titreşimli bildirim**.
- **Not:** garsonlara kulaklık verilip programın sesli konuşması fikri (Gökhan) — ileride.
- Kazanılacak ölçü: **yemek hazır olduktan kaç dakika sonra masaya gitti** — mutfak mı
  yavaş, servis mi yavaş, şu an ayrılamıyor.

### O9) Programın izleyeceği aksaklıklar → ŞEFE

Uyarılar **şefe** gider. Ayrıca bir **aksaklık raporu** tutulur — ama **fişleme aracı
değil**: amaç "kim suçlu" değil "hangi görevde tıkanma var". İşletmeci isterse bakar.
Mevcut sistemlerde bu ya hiç yok ya da uzun rapor incelemeleriyle sonradan anlaşılıyor.

İzlenecekler:
- Müşteri oturdu, sipariş alınmadı
- Yemek hazır, pastada bekliyor
- Hesap istendi, kimse gitmedi
- Başlangıç teslim edildi, ana yemek gönderilmedi
- Masa kalktı, toplanmadı (bekleme listesinde insan varken)
- Uygun masa hazır ama karşılama fark etmemiş
- Garson molada, masaları sahipsiz
- Kalem kendi pişirme süresini aştı

### O10) Hesap zinciri

Hesap istendiği anda program aynı anda:
- **Vale'ye bildirim** (araba kapıya)
- **Kasaya hesap düşer**
- **Süre sayacı başlar** → kimse gitmediyse şefe uyarı

*(Mutfağa haber ve bekleme listesine sinyal GEREKMİYOR — Gökhan düzeltti: sipariş
tamamlanınca adisyon zaten geriye düşüyor; bekleme listesine sinyal masa "hazır"a
düşünce gider.)*

### O11) KASA ENTEGRASYONU — en kritik yeni kural

> **Garson parayı kasaya teslim etmeden masa kapanmaz.**

Zincir: açık → garson ödemeyi aldı → **KASA ONAYLADI** → kapandı. Masa ancak kasa
onayından sonra "toplanacak"a düşer.

**Neden (Gökhan):** *"müşteri gitmeden gidip kasadan da kapattırması gerekli ki yanlış
almışsa ortaya çıksın. Dalgınlık oluyor, yanlış sayılıyor, yanlış çekiliyor."* Hem nakitte
hem kartta. Bu, gün sonu mutabakatını **masa masa** yapmak demek — hata müşteri hâlâ
masadayken çıkar, gece kasa sayımında değil.

Ek: masa bu arada **"müşteri gitti, kasa bekliyor"** diye ayrı görünür (karşılama
birazdan boşalacağını bilir). Program garsonun üstünde bekleyen parayı gösterir:
*"Ahmet'te 2 adisyon, 1.240 ₺ teslim edilmedi."*

### O12) Bahşiş — puan-saat kuralı

İşletmeler genelde karışmaz, ama özellik duracak; isteyen kullanır.

**Kural:**
1. Bahşiş **günlük** havuzlanır (haftalık değil).
2. Ayarlanmışsa **mutfak yüzdesi** önce ayrılır (bazı yerler verir, bazısı vermez).
3. Kalan, o gün çalışanların **puan × çalışma saati** toplamına bölünür.
4. Herkes kendi puan-saati kadar alır.

Puan **göreve göre** tanımlanır (garson 3, komi 2, bulaşık 1 gibi), işletme kendi
rakamını girer.

**Neden günlük ve saatli:** gelmediğin gün havuzda yoksun — "kesilsin mi" tartışması
kendiliğinden bitiyor. Yarım gün çalışan yarım pay alıyor. Vardiya kaydı zaten var,
ekstra giriş yok.

*Örnek:* Gün bahşişi 3.000 ₺, mutfak %20 → 600 ₺ mutfağa, 2.400 ₺ salona.
2 garson (3 puan) 8'er saat = 48, 1 komi (2 puan) 8 saat = 16 → 64 puan-saat.
Puan-saat = 37,5 ₺. Garsonlar 900'er ₺, komi 600 ₺.

Herkes kendi profilinde günlük/aylık bahşişini **hesabın nasıl çıktığıyla** görür.

### O13) Henüz konuşulmadı — simülasyonun kalanı

- Çıkış sonrası ve gün sonu akışı
- Paket servis / gel-al
- Personel yemeğinin **mutfaktan** girişi (Gökhan: *"personel yemeğinin masada ne işi var,
  mutfaktan girilir"* — akış tasarlanmadı)
- Karşılama–garson bildirim detayları
- Diğer sektörlere uyarlama
