-- KDS (mutfak ekranı) — Faz 1, ROADMAP F.2.
-- Sipariş kalemi yaşam döngüsü: eklendi (unsent) → gönderildi (sent_at) → hazırlanıyor (preparing_at)
-- → hazır (ready_at) → teslim alındı (served_at, mutfak ekranından kaybolur).
alter table order_items add column sent_at timestamptz;
alter table order_items add column preparing_at timestamptz;
alter table order_items add column ready_at timestamptz;
alter table order_items add column served_at timestamptz;
