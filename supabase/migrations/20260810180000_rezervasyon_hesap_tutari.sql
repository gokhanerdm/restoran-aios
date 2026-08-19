-- Rezervasyona hesap tutarı — Gökhan, 2026-08-10.
--
-- RZV'nin işi misafir masaya oturduğunda bitiyor; adisyon/ödeme bu üründe yok. Ama işletme
-- isterse, iş bittikten sonra o masanın ödediği tutarı elle girebilsin istiyor:
-- "sonuçta kartta görmek ister, hangi müşteri harcıyor, başka bir şekilde göremez".
--
-- ZORUNLU DEĞİL (Gökhan kararı): garsonu masa başında oyalamamak için "kalktı" akışına
-- eklenmedi. Sonradan, rezervasyon kartından girilir. Bu yüzden istatistiklerde para
-- rakamlarının yanında "kaç masada tutar girildiği" de gösterilecek — yarısı boşken
-- "ciro şu kadar" demek yanıltıcı olur.
--
-- AIOS tarafında adisyon açılmışsa (seated_order_id) gerçek tutar oradan gelir; bu alan
-- rezervasyonun kendi kaydı, tek başına satılan RZV ürünü için.

alter table public.reservations
  add column if not exists hesap_tutari numeric(12,2);

comment on column public.reservations.hesap_tutari is
  'Masanın ödediği tutar (TL). İsteğe bağlı, iş bittikten sonra elle girilir. Boş = girilmemiş, sıfır değil.';

-- Kişi kartında "bu misafir ne harcıyor" hesabı bu kolondan çıkıyor; misafir bazlı
-- toplama sık yapılacağı için kişi kartı kimliğine göre indeks.
create index if not exists reservations_kisi_karti_tutar_idx
  on public.reservations (kisi_karti_id)
  where hesap_tutari is not null and deleted_at is null;
