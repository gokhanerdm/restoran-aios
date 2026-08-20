-- KURULUM SİHİRBAZI + TEK OTURUM (Gökhan, 2026-08-20)
--
-- Gökhan: "işletme kaydolduktan sonra karşımıza tüm program için geçerli bu ayarlar ekranı
-- gelmeli ve tüm ayarlar burada yapılmalı sonra işletme programı kullanmaya başlamalı."
-- Kurulum KİLİTLİ: zorunlu adımlar bitmeden rezervasyon ekranı açılmıyor. Yarıda bırakılırsa
-- kaldığı adımdan devam ediyor.

alter table public.restaurant_settings
  -- Zorunlu adımlar bitti mi. false ise /rezervasyon kuruluma geri gönderir.
  add column if not exists kurulum_tamam boolean not null default false,
  -- Kaldığı adımın anahtarı (Gökhan: "kaldığı yerden gelsin").
  add column if not exists kurulum_adim text not null default 'isletme',
  -- SALONSUZ ÇALIŞMA (Gökhan, 2026-08-20: "salon ve masa ayarı yapmayan rezervasyon alabilsin
  -- ama yerleşim yapamasın... kapasiteyi yazsın devam etsin"). Salon kurulmadıysa doluluk bu
  -- sayıyla tutulur; masa ataması ve otomatik yerleşim kapalıdır.
  add column if not exists kapasite_kisi integer not null default 0,
  -- Bizim kullanım sözleşmemiz/KVKK aydınlatmamız onaylandı mı.
  add column if not exists kvkk_sozlesme_onay boolean not null default false,
  add column if not exists kvkk_sozlesme_onay_at timestamptz,
  -- İşletmenin KENDİ misafirine göstereceği KVKK metnini onayladı mı (metin: kvkk_notice).
  add column if not exists kvkk_metin_onay boolean not null default false,
  add column if not exists kvkk_metin_onay_at timestamptz;

comment on column public.restaurant_settings.kapasite_kisi is
  'Salon kurulmadan çalışan işletmenin toplam kişi kapasitesi. 0 ve masası varsa masalardan sayılır.';

-- Bugüne kadar kurulmuş işletmeler kuruluma düşmesin — onlar zaten çalışıyor.
update public.restaurant_settings set kurulum_tamam = true, kurulum_adim = 'bitti'
where kurulum_tamam = false;

-- TEK OTURUM (Gökhan, 2026-08-20: "bir profil sadece bir yerde açık olabilecek").
-- Giriş yapan her cihaz buraya kendi kodunu yazar; kod değişince eski cihaz kendini kapatır
-- ve "başka bir cihazda açıldı" ekranını gösterir. Son giren kazanır.
create table if not exists public.aktif_oturumlar (
  user_id uuid primary key references auth.users(id) on delete cascade,
  oturum_kodu text not null,
  cihaz text,
  guncellendi timestamptz not null default now()
);

alter table public.aktif_oturumlar enable row level security;

drop policy if exists kendi_oturumum_okur on public.aktif_oturumlar;
create policy kendi_oturumum_okur on public.aktif_oturumlar
  for select to authenticated using (user_id = auth.uid());

drop policy if exists kendi_oturumum_yazar on public.aktif_oturumlar;
create policy kendi_oturumum_yazar on public.aktif_oturumlar
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists kendi_oturumum_gunceller on public.aktif_oturumlar;
create policy kendi_oturumum_gunceller on public.aktif_oturumlar
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Girişte çağrılır: bu cihazın kodunu yazar, önceki cihazın kodunu geçersiz kılar.
create or replace function public.oturumu_devral(p_kod text, p_cihaz text default null)
returns void
language sql
security definer
set search_path = public
as $function$
  insert into public.aktif_oturumlar (user_id, oturum_kodu, cihaz, guncellendi)
  values (auth.uid(), p_kod, p_cihaz, now())
  on conflict (user_id) do update
    set oturum_kodu = excluded.oturum_kodu,
        cihaz = excluded.cihaz,
        guncellendi = now();
$function$;

grant execute on function public.oturumu_devral(text, text) to authenticated;
