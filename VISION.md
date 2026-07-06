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

## Durum

- [x] Katman 1 çekirdek şema (0001)
- [ ] Sipariş kapanış + stok düşüm RPC'si
- [ ] Fire/kaçak hesap RPC'si (sayım bazlı)
- [ ] Next.js iskelet
- [ ] Kâr paneli + gün sonu raporu
