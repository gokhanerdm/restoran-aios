-- QR menüden müşteri siparişi
--
-- Müşteri masadaki karekodu okutup /m/<slug>?masa=<table_id> adresinden kendi siparişini
-- girebiliyor. Bu siparişin MUTFAĞA DOĞRUDAN DÜŞMEMESİ gerekiyor: masaya oturmayan biri
-- (ya da şaka olsun diye karekodu uzaktan okutan biri) mutfağı meşgul edebilir. Bu yüzden
-- QR'dan gelen kalemler "onay bekliyor" olarak işaretlenir, garson/kasa adisyonda görüp
-- "Gönder"e bastığında mutfağa iner (mutfak ekranı zaten sadece sent_at dolu kalemleri
-- gösteriyor — app/mutfak/page.tsx).
--
-- NOT — neden `channel` değil de yeni bir `source`:
-- orders.channel SATIŞ KANALI'nı tutuyor (dine_in | paket | yemeksepeti | getir | trendyol,
-- check constraint'li — bkz. 20260628122949). QR ile verilen sipariş de salonda, masada
-- yenen bir siparişdir, yani kanalı hâlâ 'dine_in'. Sipariş kanalını değil, siparişi KİMİN
-- GİRDİĞİNİ ayırt etmek istiyoruz; bu ayrı bir bilgi. channel'ı 'qr' ile kirletirsek gün
-- sonu/kanal raporları (daily_summary_rpc "kanal" kırılımı) bozulurdu. O yüzden ayrı sütun.

-- Siparişi kim başlattı: 'kasa' (garson/kasa ekranı) | 'qr' (müşteri, masadaki karekod).
-- Nullable bırakıldı: mevcut satırlar NULL kalır ve NULL = 'kasa' = eski davranış demektir,
-- böylece hiçbir mevcut sorgu/rapor etkilenmez.
alter table orders add column source text default 'kasa'
  check (source is null or source in ('kasa', 'qr'));

-- Kalem onay bekliyor mu? QR'dan gelen kalemler true olarak yazılır (ve sent_at boş kalır).
-- Kasadan/garsondan girilen her kalem için false — yani mevcut akış hiç değişmez.
alter table order_items add column needs_approval boolean not null default false;

-- "Onay bekleyen kalemi olan masalar" sorgusu için — tabloda çok az satır true olacağı için
-- kısmi (partial) indeks yeterli ve ucuz.
create index idx_order_items_needs_approval
  on order_items(restaurant_id, order_id)
  where needs_approval;
