-- SALON ÖĞELERİNDE ÇEVİRME (Gökhan, 2026-08-18: "öğe ekledim, çevirme özelliği yok")
--
-- Kolon, Servis ve Kapı sabit boyda tek parça; 90 derece döndürülünce eni boyu takas oluyor
-- (kapıyı yan duvara, servisi dikey koymak için). Duvar ve Bar iki ucundan çekilerek
-- yönlendiriliyor, onlarda da çevirme kısayolu olsun diye alan hepsi için ortak.
alter table public.salon_ogeleri
  add column if not exists rotated boolean not null default false;

comment on column public.salon_ogeleri.rotated is
  '90 derece cevrilmis mi — sabit boyda ogelerde en/boy takas edilerek cizilir.';
