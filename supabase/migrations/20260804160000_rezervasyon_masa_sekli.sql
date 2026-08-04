-- Salon ekranında masa eklerken görsel şekil seçimi (Gökhan, 2026-08-04: "masa ekle
-- deyince kart değil masa şekli çıksın"). Yuvarlak/kare/dikdörtgen — kat planındaki
-- kutu buna göre çiziliyor. Konsept bazlı otomatik öneri şimdilik yok, seçim elle.
alter table restaurant_tables add column if not exists shape text not null default 'kare'
  check (shape in ('yuvarlak', 'kare', 'dikdortgen'));
