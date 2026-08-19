-- KAPI GİRİŞİ BEKLEME SIRASI (Gökhan, 2026-08-18)
--
-- Kapıya gelen misafire o an yer yoksa geri çevirmek yerine sıraya alınıyor. Bekleyen
-- masa TUTMAZ, kapasiteye girmez; sadece sırada durur. Masa boşalınca karşılamanın önüne
-- "şu masa boşaldı, sıradaki şu misafir sığıyor" kutusu çıkar.
--
-- Bekleyen oturunca ayrı bir kayıt açılmaz: aynı satır kapı girişi olarak devam eder
-- (Gökhan: "evet, kapı girişi olarak kaydedilsin"), ne kadar beklediği de kayda geçer —
-- akşam sonunda "kaç kişi ne kadar bekledi" sorusunun cevabı burada.
alter table public.reservations
  add column if not exists bekleme boolean not null default false,
  add column if not exists bekleme_baslangic timestamptz,
  add column if not exists bekleme_dakika integer;

comment on column public.reservations.bekleme is
  'Kapıda sıra bekleyen misafir. Masa tutmaz, kapasiteye girmez. Oturunca false olur.';
comment on column public.reservations.bekleme_baslangic is 'Sıraya alındığı an.';
comment on column public.reservations.bekleme_dakika is 'Oturana kadar kaç dakika beklediği.';

create index if not exists reservations_bekleme_idx
  on public.reservations (restaurant_id, bekleme)
  where bekleme = true;
