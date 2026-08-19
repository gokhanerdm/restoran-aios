-- MESAJLAR (Gökhan, 2026-08-18) — yol haritası 3. adım.
--
-- Kararlar:
--   * Kanal WhatsApp. İşletme programı kullanmaya başlarken hesabı varsa bağlanır, yoksa
--     işlemler başlatılır. O yüzden burada sadece kuyruk ve kayıt tutuluyor; gerçek gönderim
--     bağlantı gelince takılacak.
--   * Rezervasyon onayı ANINDA gider.
--   * Teyit mesajı günde bir kez, belirlenen saat aralığında: o an mevcut bütün
--     rezervasyonlara gider. O saatten sonra alınan rezervasyonlar teyitli sayılır.
--   * Gece 23:00 ve sabah 09:00 gönderim yok — dönüş alma ihtimali en yüksek saat seçilir.
--   * Misafir iptal ederse mesaj YOK. İşletme iptal ederse mesaj değil, ARANIR.
--   * Anket için yer hazır dursun, şimdilik gönderilmiyor.
--   * Kapıda bekleyen misafire mesaj yok (zaten içeride).

alter table public.restaurant_settings
  add column if not exists mesaj_acik boolean not null default false,
  add column if not exists mesaj_kanal text not null default 'whatsapp',
  add column if not exists mesaj_onay_acik boolean not null default true,
  add column if not exists mesaj_onay_metni text,
  add column if not exists mesaj_teyit_acik boolean not null default true,
  add column if not exists mesaj_teyit_saat time not null default '12:00',
  add column if not exists mesaj_teyit_bitis time not null default '13:00',
  add column if not exists mesaj_teyit_metni text,
  add column if not exists mesaj_sessiz_baslangic time not null default '23:00',
  add column if not exists mesaj_sessiz_bitis time not null default '09:00',
  add column if not exists mesaj_anket_acik boolean not null default false,
  add column if not exists mesaj_anket_metni text;

alter table public.reservations
  add column if not exists teyit_durumu text not null default 'yok',
  add column if not exists teyit_zamani timestamptz;

comment on column public.reservations.teyit_durumu is
  'yok | bekliyor (mesaj gitti, cevap yok) | geliyor | iptal | sayildi (teyit saatinden sonra alındı)';

create table if not exists public.mesajlar (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete cascade,
  tur text not null,
  kanal text not null default 'whatsapp',
  telefon text,
  metin text not null,
  planlanan_zaman timestamptz not null default now(),
  durum text not null default 'kuyrukta',
  gonderim_zamani timestamptz,
  hata text,
  cevap text,
  cevap_zamani timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mesajlar_kuyruk_idx
  on public.mesajlar (restaurant_id, durum, planlanan_zaman);
create index if not exists mesajlar_rezervasyon_idx
  on public.mesajlar (reservation_id);

alter table public.mesajlar enable row level security;

drop policy if exists mesajlar_kendi_isletmesi on public.mesajlar;
create policy mesajlar_kendi_isletmesi on public.mesajlar
  for all
  using (restaurant_id in (select id from public.restaurants where owner_user_id = auth.uid()))
  with check (restaurant_id in (select id from public.restaurants where owner_user_id = auth.uid()));
