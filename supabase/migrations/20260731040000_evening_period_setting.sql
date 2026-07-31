-- Öğle/Akşam dönem sınırı — Karşılama'nın kapasite/Yedek hesabı için (Gökhan, 2026-07-31):
-- "akşam ve öğleyi ayırıp ikisine de rezervasyon alabiliriz, gün olarak değil dönem olarak
-- takip edeceğiz... akşam 17 sonrası bir dönem, öncesi bir dönem." Sabit kod yerine
-- değiştirilebilir (Ayarlar'dan) — her işletmenin akşam servisi aynı saatte başlamayabilir.
alter table restaurant_settings add column if not exists evening_start_hour int not null default 17
  check (evening_start_hour >= 0 and evening_start_hour <= 23);
