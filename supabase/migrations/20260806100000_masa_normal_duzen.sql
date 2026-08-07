-- Salonun NORMAL DÜZENİ (Gökhan, 2026-08-06: "gün bittiğinde düzen başa dönecek").
--
-- Planlayıcı birleşen masaları salon planında yan yana getiriyor — garson planı görüp masaları
-- fiilen o hâle getirsin diye. Ama bu her akşam tekrarlanırsa salonun normal hâli zamanla
-- kaybolur. Bu yüzden masanın "asıl yeri" ayrıca tutuluyor: program masayı ilk oynattığında
-- o anki yeri buraya yazılıyor, gün kapanınca masalar buradan geri konuyor.
--
-- Boş (null) olması "bu masa hiç oynatılmadı, yeri zaten normal" demek.
alter table restaurant_tables
  add column if not exists normal_x numeric,
  add column if not exists normal_y numeric;
