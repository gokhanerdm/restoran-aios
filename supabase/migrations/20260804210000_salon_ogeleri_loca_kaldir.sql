-- Loca artık dekoratif öğe değil, gerçek masa şekli (bkz. restaurant_tables_loca_sekli
-- migration'ı) — buradaki tip listesinden çıkarılıyor, kod tarafı da eşleşiyor.
alter table salon_ogeleri drop constraint salon_ogeleri_type_check;
alter table salon_ogeleri add constraint salon_ogeleri_type_check
  check (type in ('duvar', 'bar', 'kolon', 'servis', 'kapi'));
