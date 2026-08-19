-- BİRLEŞİRKEN ÇEVRİLEN MASANIN ASIL YÖNÜ (Gökhan, 2026-08-19: "o birleştirmeyi yapabilir ama
-- masayı çevirmesi gerekir").
--
-- Kümedeki masalar farklı duruyorsa (biri enine, biri dikine) katılan masa çıpanın yönüne
-- çevriliyor. Masanın asıl yeri normal_x/normal_y'de saklanıyordu; asıl YÖNÜ de saklanmalı ki
-- birleşme bitince masa evine dönerken eski duruşuna dönebilsin. Boş kalması "çevrilmedi"
-- demektir — hatırlanacak bir şey yok.
alter table public.restaurant_tables
  add column if not exists normal_rotated boolean;

comment on column public.restaurant_tables.normal_rotated is
  'Birlestirme icin cevrilmeden onceki asil yon; eve donunce buraya geri donulur.';
