# Restoran AIOS

Türkiye'ye özgü, AI-first restoran işletim sistemi.
Model: önce kusursuz bedava yazılım → sonra ekosistem (Meituan / Toast / Square modeli).

## 4 Katmanlı Vizyon

1. **Restoran OS** (bedava, kusursuz) — sipariş, masa, stok, reçete, kâr/fire raporu. **← Şu an buradayız (MVP)**
2. **AI Modül** — stok analizi, eksik tespiti, tedarikçiye otomatik sipariş önerisi.
3. **Tedarikçi Marketplace** — siparişler tedarikçiye düşer, komisyon geliri.
4. **Müşteri Katmanı** — yıldız, kupon, indirim, hediye; müşteri verisi.

Gelir sırası: Katman 1 bedava (kurulum hizmeti + premium abonelik ile erken nakit) → asıl büyük para Katman 3 komisyonu.

Premium abonelik adayı (ileri fikir, henüz ücretlendirilmedi): dijital menünün görsel tasarım tipi (fotoğraflı vs listeli sade — `restaurant_settings.default_menu_design`). Şu an ayarlanabilir ama ücretsiz; ileride fotoğraflı/gelişmiş tasarımlar premium katmana taşınabilir.

## Çekirdek Fark — "Ciro değil, kâr"

Rakipler (Adisyo, Simpra, Karekodgarson) ciro raporu verir, kâr vermez.
Bizim silahımız: **reçete bazlı kâr + fire/kaçak radarı**.

### Fire/kaçak mantığı
- Her malzemede `waste_tolerance_percent` (örn. et %3 → 10 kg'da 300 gr eksik normal).
- **Günlük reçete kullanım raporu** = teorik tüketim (satılanlardan otomatik): "bu kadar kullanılmalıydı, bu kadar kalmalıydı".
- **Sayım girildiğinde** (sayımı sahibi yapar): `(dönem başı + alışlar − teorik tüketim)` vs gerçek sayım → fark toleransla kıyaslanır → normal mı, kaçak mı.

## Şema (Katman 1 MVP — `supabase/migrations/0001_core_schema.sql`)

| Grup | Tablolar |
|------|----------|
| İşletme & kullanıcı | `restaurants`, `profiles` |
| Menü | `menu_categories`, `menu_items` |
| Stok & reçete | `ingredients`, `recipe_items`, `stock_movements` |
| Alış / tedarik (Katman 3 köprüsü) | `purchases`, `purchase_items` |
| Sayım | `inventory_counts`, `inventory_count_items` |
| Operasyon | `restaurant_tables`, `orders`, `order_items` |

**Otomatik akış:** Sipariş kapanınca RPC, reçeteye göre `stock_movements`'a `consumption` yazar (atomik). Teorik tüketim böyle birikir; kâr paneli ve WhatsApp özeti bu veriden hesaplanır.

## Teknik

- Next.js 16 (App Router) + Supabase (PostgreSQL, RPC pattern) + TypeScript
- Dark theme, Türkçe UI, `Europe/Istanbul` timezone
- Mutasyonlar RPC üzerinden (Angora pattern'i) — atomiklik DB'de
- RLS V0'da kapalı, V1'de `restaurant_id` bazlı eklenecek

## Salonlar ekranı — plan ve rakip araştırması

### Plan (iskelet fazı, auth/PIN yok)
- Ana sol menünün yanında ikinci bir dikey menü: salon isimleri, en altta "+ Salon ekle".
- Seçili salonun masaları yan yana kutular (grid) olarak gösterilir; varsayılan sıralı dizilim, isteyen sürükleyip serbest yerleşim yapabilir (pozisyon hatırlanır). Sağ altta "+ Masa ekle" kutusu.
- Masa kutusunda: ad/numara, hesap tutarı, kişi sayısı, durum rengi (boş/dolu/hesap istedi/**rezerve**), **masa süresi göstergesi** (aşağıya bakın).
- Boş masaya tıkla → sipariş ekranı (menüden ekleme, "Gönder"). Dolu masaya tıkla → sipariş devam/hesap alma ekranı. **Bu ekran Kasa (`/`) ile aynı ekran** — iki yerden de (masaüstü Kasa terminali + garsonların el terminalleri) aynı masaya aynı şekilde ulaşılır, aynı hesap.
- Masa birleştirme: iki masa seçilir, sistem "hangisinde birleşsin" diye sorar.
- Rezervasyon: basit "rezerve olarak işaretle" + not alanı (tarih/saat takvimi yok — ihtiyaç görülürse sonra büyütülür).
- Garson atama alt yapısı var ama **auth/PIN girişi, yetkilendirme, el terminali girişi Personel fazına ertelendi** — şu an programın iskeletindeyiz, önce tek-kullanıcı modunda kat planı + sipariş akışı kuruluyor.

### Rakip/pazar araştırması (2026-07-06, deep-research — doğrulama aşaması rate limit'e takıldı, kaynaklar birincil sayfa/pazarlama metni, çapraz doğrulanmadı)
- **Masa süresi/oturma süresi göstergesi** (kutu üzerinde "45 dk" + renkli uyarı) — Karekodgarson bunu rakiplerine karşı öne çıkardığı bir fark olarak pazarlıyor ([karekodgarson.com/rakipler](https://karekodgarson.com/rakipler)); SevenRooms "turn time labeling" olarak kutuda gösteriyor. **Plana eklendi, öncelikli.**
- Hesap bölme (split bill) — Simpra/Lightspeed'de var ([simprasuite.com](https://simprasuite.com/restaurant-software/pos-system/restaurant/)). Orta öncelik, masa birleştirmeden sonraki doğal adım — sonraki faz.
- Tam rezervasyon modülü (takvim/saat, no-show) — Simpra/SevenRooms'da ayrı modül. Düşük öncelik, şimdiki basit not+rezerve kararı korunuyor.
- Bekleme listesi (waitlist, SMS'li dijital sıra) — SevenRooms/SpotOn'da var. Düşük öncelik — rezervasyon ağırlıklı batı tipi restoranlarda yaygın, bizim segmentte daha az kritik; ileride premium özellik adayı.
- Masa şekli/boyut özelleştirme (kapasiteye göre farklı kutu) — Square/Lightspeed/Odoo/Epos Now'da standart. Düşük öncelik, kutular şimdilik eşit boyut.
- Turn-time / doluluk analitiği (RevPASH, saatlik covers) — bağımsız karşılaştırma sitelerinde standart. **Salonlar'a değil, Raporlar sayfasına ait** — oraya not düşüldü.
- Rol bazlı ayrı personel uygulamaları (garson/mutfak/runner/kasiyer/karşılamacı) — Karekodgarson 5 ayrı native app sunuyor. Bizim "aynı ekran + PIN, sonraki faz" kararımızı doğruluyor.
- QR ile müşterinin kendi siparişini girmesi — Adisyo'da var. Salonlar kapsamı dışı, ayrı büyük özellik (güvenlik/yetki gerektirir) — ileri fikir olarak not edildi.

## Durum

- [x] Katman 1 çekirdek şema (0001)
- [ ] Sipariş kapanış + stok düşüm RPC'si
- [ ] Fire/kaçak hesap RPC'si (sayım bazlı)
- [ ] Next.js iskelet
- [ ] Kâr paneli + gün sonu raporu
