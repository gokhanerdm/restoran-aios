-- Remote'ta uygulanmış, repoda eksikti — supabase_migrations.schema_migrations.statements'tan birebir kazandırıldı (2026-07-06).
-- 1) Kişi sayısı: sipariş açılırken zorunlu, +/- ile güncellenebilir
alter table orders add column party_size int not null default 1 check (party_size > 0);

-- 2) Malzeme kategorisi: gida (reçetede) / sarf (kişi başı tüketilen, kürdan vb.)
alter table ingredients add column category text not null default 'gida'
  check (category in ('gida', 'sarf'));

-- 3) Tedarikçi (gerçek tablo — purchases.supplier_name düz metinden yükseltiliyor)
create table suppliers (
  id                 uuid primary key default gen_random_uuid(),
  restaurant_id      uuid not null references restaurants(id),
  name               text not null,
  contact            text,
  delivery_frequency text not null default 'weekly'
    check (delivery_frequency in ('daily', 'weekly', 'custom')),
  delivery_days      int[] not null default '{}',  -- 1=Pzt ... 7=Paz (weekly/custom için)
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);
create index idx_suppliers_restaurant on suppliers(restaurant_id);

alter table ingredients add column supplier_id uuid references suppliers(id);

-- purchases zaten var; gerçek tedarikçiye bağla, serbest metni koru (geçmiş kayıtlar için)
alter table purchases add column supplier_id uuid references suppliers(id);

-- 4) Fatura/stok girişi kaynağı — manuel / e-fatura / ai foto, iz için referans
alter table purchases add column source text not null default 'manuel'
  check (source in ('manuel', 'e_fatura', 'ai_foto'));
alter table purchases add column invoice_ref text;

-- 5) Eksik tespiti → yönetici onayı → tedarik kuyruğu
create table purchase_requests (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id),
  ingredient_id  uuid not null references ingredients(id),
  supplier_id    uuid references suppliers(id),
  suggested_qty  numeric(12,4) not null,
  reason         text,
  status         text not null default 'bekliyor'
    check (status in ('bekliyor', 'onaylandi', 'siparis_verildi', 'reddedildi')),
  approved_by    uuid references profiles(id),
  approved_at    timestamptz,
  created_at     timestamptz not null default now()
);
create index idx_purchase_requests_restaurant on purchase_requests(restaurant_id);
create index idx_purchase_requests_status on purchase_requests(status);

-- 6) E-fatura bağlantı iskeleti — gerçek anahtar YOK, sadece durum/tip
create table efatura_connections (
  id             uuid primary key default gen_random_uuid(),
  restaurant_id  uuid not null references restaurants(id),
  provider       text not null check (provider in ('gib', 'entegrator')),
  provider_name  text,
  status         text not null default 'bagli_degil'
    check (status in ('bagli_degil', 'kuruluyor', 'aktif', 'hata')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_efatura_connections_restaurant on efatura_connections(restaurant_id);

-- 7) Resmi tatil takvimi — referans veri
create table public_holidays (
  id       uuid primary key default gen_random_uuid(),
  holiday_date date not null unique,
  name     text not null
);
