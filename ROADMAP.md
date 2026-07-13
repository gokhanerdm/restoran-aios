# Restoran AIOS — Ürün Yol Haritası

Kaynak: 2026-07-10 deep-research taraması (Toast/Square/Lightspeed/TouchBistro/SpotOn + Adisyo/Simpra/Karekodgarson/Menulux/SambaPOS modül haritaları, 11.389 Capterra yorumu meta-analizi, GİB mevzuatı, Toast/Meituan büyüme analizleri). Şu 4 çekirdek kaynak doğrudan okunup doğrulandı: Toast büyüme analizi (generativevalue), şikayet meta-analizi (deliverguard), ÖKC mevzuat rehberi (robotpos), AI/fire rehberi (supy). Diğer linkler arama özetlerinden; kullanılmadan önce teyit edilmeli.

## A) Standart modül haritası ve bizim durumumuz

Pazarda "tam paket" sayılmak için beklenen modüller ([upmenu](https://www.upmenu.com/blog/best-restaurant-pos-systems/), [restaurantvelocity](https://restaurantvelocity.com/blog/best-restaurant-pos-systems/), [expertmarket](https://www.expertmarket.com/pos/square-vs-toast-vs-lightspeed)):

| Modül | Pazar durumu | Bizde |
|---|---|---|
| POS / adisyon (masa, sipariş, hesap) | Zorunlu çekirdek | ✅ Var (Kasa+Salonlar, tek panel) |
| Görsel kat planı / masa yönetimi | Standart | ✅ Var (sürükle-bırak, birleştirme, rezerve, süre) |
| Menü + reçete maliyetleme | Toast'ta var, Square'de zayıf — **fark alanımız** | ✅ Var (kâr/food cost dahil) |
| Stok + tedarikçi + kritik seviye | Standart | ✅ Var (beklenen tüketim tahmini dahil) |
| **Ödeme türleri** (nakit/kart ayrımı, kısmi ödeme) | Zorunlu çekirdek | ❌ Yok — hesap tek tuşla kapanıyor |
| **Kişi sayısı zorunlu girişi** | Bizim iş kuralımız (BUSINESS_LOGIC #1) | ❌ UI'da yok (kolon var) |
| **İptal / ikram akışı** | Zorunlu çekirdek (kaçak kontrolü) | ❌ UI'da yok (şema hazır: void/ikram) |
| **KDS (mutfak ekranı)** | Standart (Toast 2. adımda ekledi) | ❌ Yok |
| **Fiş/mutfak yazıcısı çıktısı** | Zorunlu çekirdek (TR'de adisyon kültürü) | ❌ Yok |
| **Gün sonu raporu** | Zorunlu çekirdek | ⚠️ RPC var (daily_summary), ekran iskelet |
| **Sayım ekranı** | Fire/kaçak radarımızın önkoşulu | ❌ Yok (tablolar hazır: inventory_counts) |
| **Personel / PIN / rol / vardiya** | Standart | ❌ İskelet |
| **Raporlar (kâr paneli, fire/kaçak radarı)** | Ciro raporu standart; **kâr raporu fark alanımız** | ❌ İskelet |
| Paket servis entegrasyonu (YS/Getir/Trendyol) | TR'de standart sayılıyor ([adisyo](https://adisyo.com/trendyol-yemek-sepeti-getir-entegrasyon)) | ❌ Yok (orders.channel hazır) |
| e-Fatura / e-Arşiv / ÖKC | TR'de yasal zorunluluk | ❌ Yok (efatura_connections iskeleti var) |
| Çevrimdışı çalışma | En kritik şikayet konusu; Menulux/SambaPOS bununla satıyor | ❌ Yok |
| Rezervasyon (takvim) | Standart ama v1'de not yeterli | ⚠️ Basit not var |
| CRM / sadakat | Olgunluk fazı (Toast 4-5. adımda ekledi) | ❌ Yok (Katman 4) |
| Çoklu şube | Orta-büyük segment | ❌ Yok (şema multi-tenant hazır) |
| Muhasebe entegrasyonu | Olgunluk fazı | ❌ Yok |

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
