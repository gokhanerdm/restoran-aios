-- Vale — ROADMAP §O4.
--
-- Gökhan: "vale plaka ile kayıt girsin, isim soyisim alsın, sonra eşleşmeyi program yapar,
-- sistem çalışır. Hesap istendiğinde vale'ye bildirim gitsin, araba kapıya çekilsin."
--
-- Eşleştirme iki katmanlı, dürüstçe: (1) vale kaydı açılırken program aynı isimde
-- 'oturdu' durumundaki bir bekleme listesi kaydı varsa OTOMATİK bağlar (isim aynıysa).
-- (2) İsim tutmuyorsa (bekleme listesi kullanılmadan direkt oturtulmuş müşteri, ya da
-- vale'ye söylenen isim farklı yazılmış) elle seçim gerekir — Gökhan'ın öngördüğü açık uç,
-- vale ekranından masa seçilerek kapatılır.

create table valet_entries (
  id               uuid primary key default gen_random_uuid(),
  restaurant_id    uuid not null references restaurants(id),
  guest_name       text not null,
  plate_no         text not null,
  status           text not null default 'bekliyor' check (status in ('bekliyor', 'cagrildi', 'teslim_edildi')),
  matched_table_id uuid references restaurant_tables(id),
  parked_at        timestamptz not null default now(),
  called_at        timestamptz,
  delivered_at     timestamptz
);
create index idx_valet_entries_restaurant on valet_entries(restaurant_id, status, parked_at);

-- Vale kaydı açılırken otomatik eşleştirme dener (aynı isimde oturmuş bir bekleme kaydı varsa).
create or replace function add_valet_entry(p_restaurant uuid, p_guest_name text, p_plate_no text)
returns uuid
language plpgsql
as $$
declare
  v_table uuid;
  v_id uuid;
begin
  select w.seated_table_id into v_table
  from waitlist_entries w
  where w.restaurant_id = p_restaurant and w.status = 'oturdu'
    and lower(trim(w.guest_name)) = lower(trim(p_guest_name))
  order by w.seated_at desc
  limit 1;

  insert into valet_entries (restaurant_id, guest_name, plate_no, matched_table_id)
  values (p_restaurant, p_guest_name, p_plate_no, v_table)
  returning id into v_id;

  return v_id;
end;
$$;

-- Masa hesap istediğinde (bill_requested) eşleşen vale kaydı varsa otomatik "çağrıldı" olur —
-- araba müşteri kapıya gelmeden hazırlanmaya başlasın diye. Mevcut masa-durum trigger'ına
-- (trg_log_table_status_change) dokunmadan, AYRI bir trigger olarak ekleniyor.
create or replace function trg_notify_valet_on_bill_requested()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'bill_requested' and old.status is distinct from 'bill_requested' then
    update valet_entries
    set status = 'cagrildi', called_at = now()
    where matched_table_id = new.id and status = 'bekliyor';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_valet_notify on restaurant_tables;
create trigger trg_valet_notify
after update on restaurant_tables
for each row execute function trg_notify_valet_on_bill_requested();
