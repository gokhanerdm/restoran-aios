-- Rezervasyon takvimi (Gökhan onayı, 2026-07-27).
-- Bugüne kadar rezervasyon sadece restaurant_tables.status = 'reserved' + reservation_note
-- ile "şu an" tutuluyordu; ileri tarih/saat taşıyan gerçek bir takvim yoktu.
--
-- ÖNEMLİ: Bu tablo masa DURUMUNU yönetmez. Masanın empty/occupied/reserved olması
-- Kasa ekranının işidir; rezervasyon kaydı sadece "kim, kaç kişi, ne zaman geliyor"
-- bilgisini tutar. İkisi bilerek ayrı — bir masaya ileri tarihli rezervasyon girmek
-- o masayı bugün doldurmamalı.

create table reservations (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references restaurants(id),
  table_id         uuid references restaurant_tables(id),   -- null = masa henüz atanmadı
  guest_name       text not null,
  guest_phone      text,
  party_size       int not null check (party_size > 0),
  reserved_at      timestamptz not null,                    -- rezervasyon zamanı
  duration_minutes int not null default 90,
  status           text not null default 'bekliyor'
                     check (status in ('bekliyor', 'geldi', 'gelmedi', 'iptal')),
  note             text,
  created_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create index idx_reservations_restaurant on reservations(restaurant_id);
create index idx_reservations_reserved_at on reservations(reserved_at);

-- Aynı masaya çakışan saatte rezervasyon ENGELLENMEZ: işletmeci bilerek üst üste
-- koyabilir (masa birleştirme, hızlı devir vb.). Çakışma sadece ekranda uyarı olarak
-- gösterilir — bu yüzden burada exclusion constraint yok.
