-- Ana Sayfa v1: başabaş hesabı için gider kalemleri (Gökhan onayı, 2026-07-10).
-- Sabit gider: aylık tutar girilir, günlüğe "o ayın gün sayısı"na bölünerek yansıtılır.

create table business_expenses (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  name          text not null,
  monthly_amount numeric(12,2) not null default 0 check (monthly_amount >= 0),
  active        boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index idx_business_expenses_restaurant on business_expenses(restaurant_id);

-- Günlük gidere bölünürken varsayılan "o ayın gün sayısı"dır; işletme isterse sabit bir sayı zorlayabilir
-- (örn. haftada 1 gün kapalıysa 26 gün gibi).
alter table restaurant_settings add column fixed_cost_days_override int;
