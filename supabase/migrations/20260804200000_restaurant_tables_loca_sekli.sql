-- Loca gerçek bir masa şekli oldu (Gökhan: "locayı masa ekleye koyacağız") — dekoratif
-- salon_ogeleri'nden çıkarıldı, doğrudan restaurant_tables.shape'e taşındı ki kişi sayısı/
-- rezervasyon durumu (boş/dolu/rzv) diğer masalar gibi işlensin.
alter table restaurant_tables drop constraint restaurant_tables_shape_check;
alter table restaurant_tables add constraint restaurant_tables_shape_check
  check (shape in ('yuvarlak', 'kare', 'dikdortgen', 'loca'));
