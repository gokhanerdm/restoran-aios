-- SADECE ANA PANEL REZERVASYON ALSIN (Gökhan, 2026-08-18)
--
-- Bazı işletmelerde rezervasyonu tek elden almak isteniyor: telefondan giren personel
-- (garson, PR, salon şefi, mutfak) rezervasyon açamasın, kayıt hep ana panelden girilsin.
-- Varsayılanı KAPALI — açmak işletmenin kararı (ortak çizgi: sert kural yok, ayara döner).
alter table public.restaurant_settings
  add column if not exists sadece_ana_panel_rezervasyon boolean not null default false;
