-- Faz 0: Ödeme kaydı — nakit/kart ayrımı, kısmi/bölünmüş ödeme desteği.
-- Mutabakat ilkesi (ROADMAP B/2): her hesap kapama iz bırakır; gün sonu = Σ adisyon = Σ ödeme.
-- Kullanıcı onayıyla oluşturuldu (2026-07-10).

create table order_payments (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  order_id      uuid not null references orders(id),
  amount        numeric(12,2) not null check (amount > 0),
  method        text not null check (method in ('nakit', 'kart', 'yemek_karti')),
  paid_at       timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index idx_order_payments_restaurant on order_payments(restaurant_id);
create index idx_order_payments_order on order_payments(order_id);
create index idx_order_payments_paid_at on order_payments(paid_at);
