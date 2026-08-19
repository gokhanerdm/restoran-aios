-- MİSAFİR MASASI (Gökhan, 2026-08-15). Bir misafir kendine bir masa, misafirlerine ikinci
-- bir masa açtırabiliyor. İkinci masa aynı numara + aynı isim + aynı gün olduğunda program
-- bunu misafir masası sayar; listede ismin yanında "MİSAFİR" yazar.
--   misafir_masasi : bu kayıt ikinci (misafir) masa mı
--   misafir_yakin  : true → iki masa olabildiğince yakın (ama birleşmez)
--                    false → olabildiğince uzak (önce başka salon)
--                    null → misafir masası değil
-- Rezervasyonlar birbirine BAĞLANMAZ; eşleşme her plan hesabında numara+isim+günden bulunur.
-- Misafir, ev sahibinin kartında kalır (numara onun numarası). Numara değişirse normal
-- akış devreye girer, o numaranın kartı açılır ve kayıt oraya geçer.
alter table reservations add column if not exists misafir_masasi boolean not null default false;
alter table reservations add column if not exists misafir_yakin boolean;
