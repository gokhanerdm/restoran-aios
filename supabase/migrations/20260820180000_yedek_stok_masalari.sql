-- YEDEK MASA STOĞU — GERÇEK MASA OLARAK (Gökhan, 2026-08-20)
--
-- Bugüne kadar stok yalnızca bir SAYAÇtı: rezervasyona kaç masa eklendiği yazılıyor, kapasite
-- ondan düşüyordu. Ama yerleşim motoru stoktan habersizdi ve 6-7-8 kişi gelince YANDAKİ masayı
-- birleştiriyordu — o masa başka misafirin (Gökhan: "birleştirmeyi yanındaki masa ile yaptı,
-- gece kulübüne özel yedek masadan çekecekti").
--
-- Artık stok masası gerçek bir masa satırı: depodan çıkarılınca S1, S2… adıyla salona giriyor,
-- rezervasyona veriliyor, boşalırsa gece boyunca salonda kalıyor (başka misafire de verilebilir),
-- gece kapanışında siliniyor.
alter table public.restaurant_tables
  add column if not exists stok boolean not null default false,
  add column if not exists stok_gun date;

comment on column public.restaurant_tables.stok is
  'Depodan çıkarılmış yedek masa (S1, S2…). Salonun kalıcı masası değildir, gece sonunda silinir.';
comment on column public.restaurant_tables.stok_gun is
  'Masanın çıkarıldığı işletme günü. Bu günden eski stok masaları temizlenir.';

create index if not exists restaurant_tables_stok_idx
  on public.restaurant_tables (restaurant_id, stok_gun) where stok;
