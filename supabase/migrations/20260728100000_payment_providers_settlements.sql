-- Hakediş mutabakatı — "yoldaki para".
-- Dünyada restoran yazılımı şikayetlerinin 1 numarası (11.389 Capterra yorumunun ~%12,5'i):
-- POS'ta görünen satış ile bankaya yatan tutar tutmuyor. Kasa ekranı bunu NAKİT için zaten
-- yapıyordu (beklenen / sayılan / fark); aynı mantık karta ve yemek kartına genişletiliyor.
--
-- Türkiye'de sorun daha sert: kredi kartı valörü azami 40 gün, banka kartı 15 gün; yemek kartı
-- sağlayıcıları (Multinet Up, Pluxee, Edenred, Setcard, Metropol) farklı vade ve komisyonla öder.

-- 1) Sağlayıcı tanımları — komisyon oranı ve valör (kaç gün sonra yatıyor).
create table payment_providers (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id),
  name            text not null,
  method          text not null check (method in ('kart', 'yemek_karti')),
  commission_rate numeric(5,2) not null default 0 check (commission_rate >= 0 and commission_rate < 100),
  settlement_days int not null default 1 check (settlement_days >= 0),
  is_default      boolean not null default false,
  is_active       boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index idx_payment_providers_restaurant on payment_providers(restaurant_id);
-- Her ödeme türü için tek varsayılan: sağlayıcısı işaretlenmemiş (eski) ödemeler buraya düşer.
create unique index uq_payment_providers_default
  on payment_providers(restaurant_id, method) where is_default and deleted_at is null;

-- 2) Ödeme hangi sağlayıcıdan geçti. Boş olabilir — o zaman türün varsayılanı sayılır.
alter table order_payments add column provider_id uuid references payment_providers(id);
create index idx_order_payments_provider on order_payments(provider_id);

-- 3) Bankaya fiilen yatan tutarlar. İşletmeci ekstreye bakıp girer; sistem beklenenle kıyaslar.
create table settlement_receipts (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  provider_id   uuid not null references payment_providers(id),
  received_date date not null,
  amount        numeric(12,2) not null check (amount > 0),
  note          text,
  created_at    timestamptz not null default now()
);
create index idx_settlement_receipts_restaurant on settlement_receipts(restaurant_id);
create index idx_settlement_receipts_provider on settlement_receipts(provider_id);

-- 4) Hakediş durumu.
--    Eşleştirme gün gün DEĞİL, sağlayıcı bazında cari hesap mantığıyla yapılır: para sırayla
--    yatar, bu yüzden "beklenen toplam − yatan toplam = yolda". Valörü geçmiş ama hâlâ yatmamış
--    kısım "gecikmiş" olarak ayrıca çıkar — asıl alarm o.
create or replace function settlement_status(p_restaurant uuid, p_day date default null)
returns table (
  provider_id        uuid,
  provider_name      text,
  method             text,
  commission_rate    numeric,
  settlement_days    int,
  day_gross          numeric,
  day_net            numeric,
  day_due_date       date,
  expected_net_total numeric,
  received_total     numeric,
  outstanding        numeric,
  overdue            numeric
)
language sql
stable
as $$
  with defaults as (
    select method, id
    from payment_providers
    where restaurant_id = p_restaurant and is_default and deleted_at is null
  ),
  pay as (
    select coalesce(op.provider_id, d.id) as pid,
           (op.paid_at at time zone 'Europe/Istanbul')::date as sale_date,
           op.amount
    from order_payments op
    left join defaults d on d.method = op.method
    where op.restaurant_id = p_restaurant
      and op.method in ('kart', 'yemek_karti')
  ),
  pay_p as (
    select p.pid, p.sale_date, p.amount, pp.commission_rate, pp.settlement_days
    from pay p
    join payment_providers pp on pp.id = p.pid and pp.deleted_at is null
  ),
  agg as (
    select pid,
           sum(amount * (1 - commission_rate / 100.0)) as expected_net_total,
           sum(amount * (1 - commission_rate / 100.0))
             filter (where sale_date + settlement_days <= current_date) as overdue_net,
           sum(amount) filter (where sale_date = p_day) as day_gross,
           sum(amount * (1 - commission_rate / 100.0)) filter (where sale_date = p_day) as day_net
    from pay_p
    group by pid
  ),
  rec as (
    select sr.provider_id, sum(sr.amount) as received_total
    from settlement_receipts sr
    where sr.restaurant_id = p_restaurant
    group by sr.provider_id
  )
  select pp.id,
         pp.name,
         pp.method,
         pp.commission_rate,
         pp.settlement_days,
         round(coalesce(a.day_gross, 0), 2),
         round(coalesce(a.day_net, 0), 2),
         (p_day + pp.settlement_days)::date,
         round(coalesce(a.expected_net_total, 0), 2),
         round(coalesce(r.received_total, 0), 2),
         round(coalesce(a.expected_net_total, 0) - coalesce(r.received_total, 0), 2),
         round(greatest(0, coalesce(a.overdue_net, 0) - coalesce(r.received_total, 0)), 2)
  from payment_providers pp
  left join agg a on a.pid = pp.id
  left join rec r on r.provider_id = pp.id
  where pp.restaurant_id = p_restaurant and pp.deleted_at is null and pp.is_active
  order by pp.method, pp.sort_order, pp.name;
$$;

-- 5) Mevcut restoranlara Türkiye'de yaygın sağlayıcılar kurulur; oranlar/valörler işletmeci
--    kendi sözleşmesine göre Ayarlar'dan düzeltir. Varsayılan işaretliler, sağlayıcısı boş
--    eski ödemelerin düşeceği yerdir.
insert into payment_providers (restaurant_id, name, method, commission_rate, settlement_days, is_default, sort_order)
select r.id, v.name, v.method, v.rate, v.days, v.is_def, v.ord
from restaurants r
cross join (values
  ('Banka POS',   'kart',        1.80, 1,  true,  0),
  ('Multinet Up', 'yemek_karti', 6.00, 15, true,  1),
  ('Pluxee',      'yemek_karti', 6.00, 15, false, 2),
  ('Edenred',     'yemek_karti', 6.00, 15, false, 3),
  ('Setcard',     'yemek_karti', 6.00, 15, false, 4),
  ('Metropol',    'yemek_karti', 6.00, 15, false, 5)
) as v(name, method, rate, days, is_def, ord)
where r.deleted_at is null;
