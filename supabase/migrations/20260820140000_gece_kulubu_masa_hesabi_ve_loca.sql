-- GECE KULÜBÜ: MASA HESABI, MASA STOĞU VE LOCA KURALLARI (Gökhan, 2026-08-20)
-- Veritabanına uygulanan göçün dosya karşılığı. Ayrıntılı gerekçe kolon yorumlarında.
alter table public.restaurant_settings
  add column if not exists masa_hesabi_acik boolean not null default false,
  add column if not exists masa_en_fazla_kisi integer not null default 5,
  add column if not exists sinir_asilinca text not null default 'sor',
  add column if not exists masa_stogu_adet integer not null default 0,
  add column if not exists masa_stogu_kisi integer not null default 5,
  add column if not exists stok_bitince_arka_sira boolean not null default true,
  add column if not exists loca_kapora_acik boolean not null default false,
  add column if not exists loca_kapora_tutar numeric,
  add column if not exists loca_kapora_zorunlu boolean not null default false,
  add column if not exists loca_satis_yetkisi text not null default 'herkes',
  add column if not exists loca_walkin_acik boolean not null default true,
  add column if not exists loca_paket_zorunlu boolean not null default false;

alter table public.masa_gruplari add column if not exists en_fazla_kisi integer;
alter table public.restaurant_tables add column if not exists en_fazla_kisi integer;

alter table public.masa_paketleri
  add column if not exists sise_adedi integer,
  add column if not exists masa_hakki integer not null default 1,
  add column if not exists loca_paketi boolean not null default false;

alter table public.reservations
  add column if not exists stok_masa integer not null default 0,
  add column if not exists kapora_tutar numeric,
  add column if not exists kapora_alindi boolean not null default false,
  add column if not exists masa_paketi_id uuid references public.masa_paketleri(id);

-- İşletme türü listesine "gece kulübü — canlı müzik" eklendi, canlı müzik akşam mekanı
-- 18:00–01:00'e çekildi ve türlerin varsayılanına masa_hesabi_acik girdi. Fonksiyonların
-- tam gövdesi veritabanında; buradaki dosya alan göçünü belgeliyor.

-- Hangi masa grubunun loca olduğu (Gökhan, 2026-08-20). Loca kuralları bu işaretli gruplara
-- uygulanıyor; isimden tahmin edilmiyor.
alter table public.masa_gruplari add column if not exists loca boolean not null default false;
