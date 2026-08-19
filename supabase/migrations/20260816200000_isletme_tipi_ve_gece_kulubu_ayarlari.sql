-- İŞLETME TİPİ + GECE KULÜBÜ AYARLARI (Gökhan, 2026-08-16)
--
-- Gökhan: "program ayarlarına gece kulübü, restoran, canlı müzik, meyhane olarak seçenekler
-- koyalım, hangisi kullanacaksa ayarlarda seçsin, ona göre varsayılan ayarlansın, işletme
-- istediği yerleri değiştirsin."
--
-- Tip SADECE varsayılanı basar; sonrasında her ayar tek tek değiştirilebilir. Tip sonradan
-- değişirse mevcut ayarlara dokunulmaz (ekran sorar).
--
-- İkinci araştırma turunun (ARASTIRMA-2-GECE-KULUBU.md) iki yapısal bulgusu buraya girdi:
--   1) Tek "minimum harcama" yetmiyor — masa grubunun FİYATLAMA MODU olmalı: paket satışı /
--      masa başı minimum / kişi başı minimum / sabit ücret. Yunanistan, Körfez ve İstanbul
--      yılbaşı fiyatlaması üçü de bu yapıyı gösteriyor.
--   2) Gecenin kimliği yok — gece "Cuma" değil, "Cuma · falanca sanatçı" olarak satılıyor.
--      Fiyat da doluluk da buna bağlı. ozel_geceler tablosu bunun karşılığı.
--
-- HUKUK NOTU (aynı rapor): Ticaret Bakanlığı minimum harcamanın yasal dayanağı olmadığını
-- söyledi. Özellik duruyor ama program bunu "önceden bildirilmiş ve onaylanmış paket" olarak
-- kaydediyor. Kadın/erkek sayısı hiçbir otomatik ret kuralına bağlanmıyor.

-- ————————————————————————————— restaurant_settings —————————————————————————————
alter table public.restaurant_settings
  -- 'gece_kulubu' | 'restoran' | 'canli_muzik' | 'meyhane'
  add column if not exists isletme_tipi text not null default 'restoran',
  -- Günün bittiği saat. Takvim günü değil işletme günü: 01:00 ise gece 00:30'daki misafir hâlâ
  -- dünün gecesidir. Varsayılan 01:00 (Gökhan).
  add column if not exists isletme_gunu_saati text not null default '01:00',

  -- Menü
  add column if not exists fix_menu_acik boolean not null default false,
  add column if not exists karma_fix_alakart boolean not null default false,

  -- Fiyatlandırma
  add column if not exists minimum_harcama_acik boolean not null default false,
  add column if not exists masa_paketi_acik boolean not null default false,
  add column if not exists ozel_gece_acik boolean not null default false,

  -- PR (promoter)
  add column if not exists pr_acik boolean not null default false,
  -- 'kisi' | 'masa' | 'yuzde' — işletmeye göre değişiyor (Gökhan)
  add column if not exists pr_komisyon_tipi text not null default 'kisi',
  add column if not exists pr_komisyon_tutar numeric not null default 0,
  -- PR kendi getirdiğinin gelip gelmediğini ve harcamasını görsün mü
  add column if not exists pr_kendi_gorsun boolean not null default false,
  -- Komisyon listeye yazılana değil GELENE ödenir (araştırma 2)
  add column if not exists pr_sadece_gelene boolean not null default true,

  -- Kapı
  add column if not exists guest_list_acik boolean not null default false,

  -- Rezervasyon listesi
  add column if not exists rezervasyon_alan_gorunsun boolean not null default true,
  add column if not exists yapilandirilmis_not_acik boolean not null default true,

  -- Yetkiler — 'yonetici' | 'salon_sefi' | 'karsilama' | 'herkes'
  add column if not exists silme_yetkisi text not null default 'yonetici',
  add column if not exists hesap_girme_yetkisi text not null default 'yonetici',
  add column if not exists ayar_yetkisi text not null default 'yonetici',

  -- Yapay zekâ kart özeti
  add column if not exists ai_ozet_acik boolean not null default true,
  -- KVKK: yurt dışına aktarım. İsim soyisim maskelenir, telefon zaten gitmiyor (Gökhan).
  add column if not exists ai_isim_maskele boolean not null default true,

  -- Salon ekranındaki "Varsayılana getir" düğmesi açık mı (Gökhan: operasyon öncesi
  -- kullanılıyor, ayardan kapatılabilsin)
  add column if not exists varsayilana_getir_acik boolean not null default true;

-- ————————————————————————————— masa grupları —————————————————————————————
-- Loca, sahne önü, normal… Minimum harcama ve fiyat bu gruba giriliyor (Gökhan: "gruba").
create table if not exists public.masa_gruplari (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  ad text not null,
  -- 'yok' | 'masa_minimum' | 'kisi_minimum' | 'paket' | 'sabit_ucret'
  fiyatlama_modu text not null default 'yok',
  tutar numeric not null default 0,
  -- Fiyata dahil kişi sayısı; aşan kişi başına ek ücret (araştırma 2: Yunanistan modeli)
  dahil_kisi integer,
  asan_kisi_ucreti numeric,
  sira integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_masa_gruplari_restoran on public.masa_gruplari(restaurant_id);

alter table public.restaurant_tables
  add column if not exists grup_id uuid references public.masa_gruplari(id) on delete set null;

-- ————————————————————————————— fix menüler —————————————————————————————
create table if not exists public.fix_menuler (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  ad text not null,
  kisi_basi_fiyat numeric not null default 0,
  aciklama text,
  sira integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_fix_menuler_restoran on public.fix_menuler(restaurant_id);

-- ————————————————————————————— masa paketleri —————————————————————————————
-- "Loca paketi · 25.000 TL · 1 şişe viski, 4 meze, 6 kişiye kadar" (Gökhan)
create table if not exists public.masa_paketleri (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  ad text not null,
  fiyat numeric not null default 0,
  icindekiler text,
  kisi_tavani integer,
  sira integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_masa_paketleri_restoran on public.masa_paketleri(restaurant_id);

-- ————————————————————————————— özel geceler —————————————————————————————
-- Gecenin kimliği: "31 Aralık · Yılbaşı" ya da "12 Eylül · falanca sanatçı".
create table if not exists public.ozel_geceler (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  gun date not null,
  ad text not null,
  sanatci text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_ozel_geceler_restoran on public.ozel_geceler(restaurant_id, gun);

-- O geceye özel fiyat — masa grubu ya da paket bazında (ikisi de boşsa gecenin geneli).
create table if not exists public.ozel_gece_fiyatlari (
  id uuid primary key default gen_random_uuid(),
  ozel_gece_id uuid not null references public.ozel_geceler(id) on delete cascade,
  grup_id uuid references public.masa_gruplari(id) on delete cascade,
  paket_id uuid references public.masa_paketleri(id) on delete cascade,
  tutar numeric not null default 0
);
create index if not exists idx_ozel_gece_fiyat on public.ozel_gece_fiyatlari(ozel_gece_id);

-- ————————————————————————————— rezervasyon etiketleri —————————————————————————————
-- Alerji, çocuk sandalyesi, doğum günü… Serbest nottan ALGILAMAYA çalışmak yerine kutucukla
-- işaretlenir (Gökhan, 2026-08-16 — "not algılama" sorusunun cevabı bu).
create table if not exists public.rezervasyon_etiketleri (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  ad text not null,
  -- İşaretlenince mutfak ekranına düşsün mü (alerji için evet, doğum günü için hayır)
  mutfaga_gitsin boolean not null default false,
  -- Listede kırmızı uyarı olarak çıksın mı
  uyari boolean not null default false,
  sira integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_rez_etiket_restoran on public.rezervasyon_etiketleri(restaurant_id);

-- ————————————————————————————— RLS —————————————————————————————
-- Hepsi not_kurallari ile aynı desen: işletmenin kendi verisi, giriş yapmış kullanıcı.
do $$
declare t text;
begin
  foreach t in array array[
    'masa_gruplari', 'fix_menuler', 'masa_paketleri', 'ozel_geceler', 'rezervasyon_etiketleri'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists isletme_erisimi on public.%I', t);
    execute format($f$create policy isletme_erisimi on public.%I for all to authenticated
      using (public.yonetici_mi() or restaurant_id in (select public.erisilen_restoranlar()))
      with check (public.yonetici_mi() or restaurant_id in (select public.erisilen_restoranlar()))$f$, t);
  end loop;
end $$;

-- Özel gece fiyatları restaurant_id taşımıyor, üstündeki geceden türetiyor.
alter table public.ozel_gece_fiyatlari enable row level security;
drop policy if exists isletme_erisimi on public.ozel_gece_fiyatlari;
create policy isletme_erisimi on public.ozel_gece_fiyatlari for all to authenticated
  using (exists (
    select 1 from public.ozel_geceler g where g.id = ozel_gece_id
      and (public.yonetici_mi() or g.restaurant_id in (select public.erisilen_restoranlar()))
  ))
  with check (exists (
    select 1 from public.ozel_geceler g where g.id = ozel_gece_id
      and (public.yonetici_mi() or g.restaurant_id in (select public.erisilen_restoranlar()))
  ));
