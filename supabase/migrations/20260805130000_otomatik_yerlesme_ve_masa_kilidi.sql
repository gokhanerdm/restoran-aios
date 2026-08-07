-- Otomatik yerleşme + masa kilidi (Gökhan, 2026-08-05).
--
-- Otomatik yerleşme: bir rezervasyonun kişi sayısı büyüyüp masası yetmez hale gelince
-- program bekletmeden kendi hallediyor — önce o masanın kendi sırasındaki yan masayı
-- deniyor, gerekirse oradaki rezervasyonu başka masaya taşıyıp yeri açıyor. Herkesin
-- isteyeceği bir davranış olmadığı için ayardan açılıp kapanıyor: "kullanmak isteyen
-- kullanacak, istemeyen kullanmayacak." Varsayılan KAPALI — program kimsenin masasını
-- habersiz oynatmasın.
alter table restaurant_settings
  add column if not exists auto_seating boolean not null default false;

-- Masa kilidi: "müşteri o masayı istemiştir, söz verilmiştir" — kilitli rezervasyonun
-- masasını otomatik yerleşme asla oynatmaz, taşımaz, birleştirmez. Kilidi işletme açar/kapar.
alter table reservations
  add column if not exists masa_kilit boolean not null default false;
