-- Saate göre masa hesabı — isteğe bağlı (Gökhan, 2026-08-05).
--
-- Varsayılan hesap DÖNEM üzerinden yürüyor: gün öğle/akşam diye ikiye bölünüyor, bir dönemdeki
-- bütün rezervasyonlar aynı masa havuzunu paylaşıyor. Gökhan: "dönem mantıklı, öyle devam
-- ediyoruz." Ama isteyen işletme için saate göre hesap da olsun: o zaman bir masa sadece
-- rezervasyonun oturma süresi boyunca dolu sayılır, süre bitince gerçekten boşalır —
-- 19:00'a verilen masa 21:00'e gelene açık olur.
alter table restaurant_settings
  add column if not exists saate_gore_masa boolean not null default false;

-- Masa arası pay: bir masa boşaldıktan sonra kaç dakika sonra yeni misafir alınabilir
-- (temizlik/hazırlık). Sadece saate göre hesap açıkken anlamlı.
alter table restaurant_settings
  add column if not exists masa_arasi_pay integer not null default 0;
