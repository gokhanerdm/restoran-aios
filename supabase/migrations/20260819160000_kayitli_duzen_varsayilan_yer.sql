-- KAYITLI DÜZEN (Gökhan, 2026-08-19: "her seferinde başka bir şey çıkıyor" — masalar boş
-- olmasına rağmen her Yerleşim yap / Varsayılana getir turunda dizilim biraz daha kayıyordu).
--
-- Sebep: masanın "evi" ayrı bir yerde tutulmuyordu. normal_x/normal_y sadece "program bu masayı
-- birleştirme için oynatmadan önce buradaydı" demek; raptiye düğmesi de bu alanları SİLİYORDU,
-- yani ev = "masa şu an neredeyse orası". Masa tam yerine dönemediği her turda o yanlış yer bir
-- sonraki turun evi oluyor, kayma birikiyordu.
--
-- Artık işletmenin dizdiği düzen kendi alanlarında duruyor: raptiye bunları yazar, "Varsayılana
-- getir" hep bunlara döner, yerleşim/birleştirme/çevirme bunlara asla dokunmaz.
alter table public.restaurant_tables
  add column if not exists varsayilan_x numeric,
  add column if not exists varsayilan_y numeric,
  add column if not exists varsayilan_rotated boolean;

comment on column public.restaurant_tables.varsayilan_x is
  'Isletmenin kaydettigi duzen: masanin kalici yeri (X). Raptiye dugmesi yazar.';
comment on column public.restaurant_tables.varsayilan_y is
  'Isletmenin kaydettigi duzen: masanin kalici yeri (Y). Raptiye dugmesi yazar.';
comment on column public.restaurant_tables.varsayilan_rotated is
  'Isletmenin kaydettigi duzen: masanin kalici durusu. Raptiye dugmesi yazar.';
