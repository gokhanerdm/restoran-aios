-- ONLINE REZERVASYON ONAY ŞARTI (Gökhan, 2026-08-16: "onay gereksin")
--
-- Misafirin gönderdiği istek doğrudan rezervasyona dönmez; "onay bekliyor" olarak listeye
-- düşer, işletme masayı verip vermeyeceğine karar verdikten sonra kesinleşir. Masa satılan
-- gecelerde tanımadığı birinin locayı kapatmasını engelliyor.
--
-- NOT: Ayar 2026-08-16'da Ayarlar ekranına konmuştu ama sütun açılmamıştı — Kaydet
-- "column online_onay_gerekli does not exist" hatası veriyordu. Bu göç o eksiği kapatıyor.
-- Kuralın online_rezervasyon_olustur içinde uygulanması (status = 'onay_bekliyor') ayrı bir iş.

alter table public.restaurant_settings
  add column if not exists online_onay_gerekli boolean not null default true;
