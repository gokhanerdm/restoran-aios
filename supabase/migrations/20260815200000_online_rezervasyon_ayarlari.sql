-- ONLINE REZERVASYON AYARLARI + REZERVASYON GÜN UFKU (Gökhan, 2026-08-15)
--
-- Araştırma sonrası kararlaştırılan ilk paket. Gökhan'ın çizgisi: sert limit yok, her şey
-- ayara dönüşür, işletme açar. Doluluk hızı (pacing) BİLEREK YOK ("bunun bir sınırı yok...
-- limit yok burası Türkiye").
--
-- Kararlar:
--   1  En fazla kaç gün öncesinden rezervasyon → Rezervasyon ayarları
--   2  Saate kala sınırı YOK — yer varsa alınır
--   3  Online en küçük/en büyük grup → Online rezervasyon ayarları
--   4  Kaç kişiden sonrası telefonla → Online rezervasyon ayarları
--   5  Saat aralığı 15 dakika
--   22 Online yapıp gelmeyen bir daha online yapamaz, telefonla dener
--   35 Misafir online salon seçebilsin (işletme kararı)
--   36 Hangi salonlar online açık (işletme kararı)
--   37 Salon tercihi garanti değil, "mümkünse"

alter table public.restaurant_settings
  -- Bugünden itibaren kaç gün ileriye rezervasyon alınabilir. 0 = sınırsız.
  add column if not exists rezervasyon_gun_ufku integer not null default 60,
  add column if not exists online_acik boolean not null default true,
  add column if not exists online_min_kisi integer not null default 1,
  add column if not exists online_max_kisi integer not null default 12,
  -- Bu sayıdan büyük gruplar online alınmaz, misafirden aranması istenir. 0 = sınır yok.
  add column if not exists online_telefon_esigi integer not null default 12,
  add column if not exists online_slot_dakika integer not null default 15,
  add column if not exists online_salon_secimi boolean not null default false,
  add column if not exists online_gelmeyen_engeli boolean not null default true;

-- Hangi salonlar online listede görünecek (Gökhan: "işletme kararı").
alter table public.dining_areas
  add column if not exists online_acik boolean not null default true;

-- Misafirin online seçtiği salon. GARANTİ DEĞİL (Gökhan: "mümkünse") — yerleşim bunu notta
-- salon adı yazılmış gibi değerlendirir; o salonda yer yoksa program kendi kararıyla başka
-- salona atmaz, işletmeye sorar.
alter table public.reservations
  add column if not exists tercih_alan_id uuid references public.dining_areas(id) on delete set null;

-- ————————————————————————————————————————————————————————————————————————
-- Girişsiz sayfanın gördüğü bilgi. Sayfa hiçbir tabloya doğrudan bakmıyor (veri kilidi,
-- 2026-08-10) — form kurallarını da buradan öğreniyor.
-- ————————————————————————————————————————————————————————————————————————
create or replace function public.online_rezervasyon_bilgi(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'telefon', nullif(concat(coalesce(r.ulke_kodu, '+90'), ' ', r.phone), coalesce(r.ulke_kodu, '+90') || ' '),
    'kvkk_notice', s.kvkk_notice,
    'online_acik', coalesce(s.online_acik, true),
    'gun_ufku', coalesce(s.rezervasyon_gun_ufku, 60),
    'min_kisi', coalesce(s.online_min_kisi, 1),
    'max_kisi', coalesce(s.online_max_kisi, 12),
    'telefon_esigi', coalesce(s.online_telefon_esigi, 12),
    'slot_dakika', coalesce(s.online_slot_dakika, 15),
    'salon_secimi', coalesce(s.online_salon_secimi, false),
    'opening_hours', s.opening_hours,
    'salonlar', case when coalesce(s.online_salon_secimi, false) then (
      select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name) order by a.sort_order, a.name), '[]'::jsonb)
      from public.dining_areas a
      where a.restaurant_id = r.id and a.deleted_at is null and a.online_acik
    ) else '[]'::jsonb end
  )
  from public.restaurants r
  left join public.restaurant_settings s on s.restaurant_id = r.id
  where r.slug = p_slug and r.deleted_at is null
  limit 1;
$function$;

grant execute on function public.online_rezervasyon_bilgi(text) to anon, authenticated;

-- ————————————————————————————————————————————————————————————————————————
-- Kayıt açma. Kurallar SUNUCUDA da denetleniyor — formu atlayıp doğrudan çağıran olursa
-- ayarlar yine geçerli olsun.
-- ————————————————————————————————————————————————————————————————————————
drop function if exists public.online_rezervasyon_olustur(text, text, text, integer, timestamptz, text);

create or replace function public.online_rezervasyon_olustur(
  p_slug text, p_ad text, p_telefon text, p_kisi integer,
  p_zaman timestamp with time zone, p_not text default null::text,
  p_alan_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_restoran uuid;
  v_id uuid;
  v_gun date;
  v_koltuk int;
  v_dolu int;
  v_ayar public.restaurant_settings%rowtype;
  v_tel text;
  v_alan uuid;
begin
  select id into v_restoran from public.restaurants where slug = p_slug and deleted_at is null;
  if v_restoran is null then
    raise exception 'İşletme bulunamadı';
  end if;
  if coalesce(btrim(p_ad), '') = '' or coalesce(btrim(p_telefon), '') = ''
     or p_kisi is null or p_kisi <= 0 or p_kisi > 100 or p_zaman is null then
    raise exception 'Eksik ya da geçersiz bilgi';
  end if;

  select * into v_ayar from public.restaurant_settings where restaurant_id = v_restoran;

  if not coalesce(v_ayar.online_acik, true) then
    raise exception 'ONLINE_KAPALI';
  end if;

  v_gun := (p_zaman at time zone 'Europe/Istanbul')::date;

  -- Geçmişe kayıt açılmaz; gün ufku aşılamaz.
  if v_gun < (now() at time zone 'Europe/Istanbul')::date then
    raise exception 'GECMIS_GUN';
  end if;
  if coalesce(v_ayar.rezervasyon_gun_ufku, 60) > 0
     and v_gun > (now() at time zone 'Europe/Istanbul')::date + coalesce(v_ayar.rezervasyon_gun_ufku, 60) then
    raise exception 'GUN_UFKU';
  end if;

  if p_kisi < coalesce(v_ayar.online_min_kisi, 1) then
    raise exception 'GRUP_KUCUK';
  end if;
  if p_kisi > coalesce(v_ayar.online_max_kisi, 12) then
    raise exception 'GRUP_BUYUK';
  end if;
  if coalesce(v_ayar.online_telefon_esigi, 0) > 0 and p_kisi > v_ayar.online_telefon_esigi then
    raise exception 'TELEFONLA';
  end if;

  -- Online yapıp gelmeyen (Gökhan, 22): bir daha online alamaz, telefonla dener.
  v_tel := right(regexp_replace(p_telefon, '\D', '', 'g'), 10);
  if coalesce(v_ayar.online_gelmeyen_engeli, true) and length(v_tel) = 10 and exists (
    select 1 from public.reservations x
    where x.restaurant_id = v_restoran and x.deleted_at is null
      and x.source = 'online' and x.status = 'gelmedi'
      and right(regexp_replace(coalesce(x.guest_phone, ''), '\D', '', 'g'), 10) = v_tel
  ) then
    raise exception 'ONLINE_ENGEL';
  end if;

  -- Salon tercihi: sadece o işletmenin, silinmemiş ve online'a açık salonu kabul edilir.
  if p_alan_id is not null then
    select a.id into v_alan from public.dining_areas a
    where a.id = p_alan_id and a.restaurant_id = v_restoran and a.deleted_at is null and a.online_acik;
  end if;

  select coalesce(sum(seat_count), 0) into v_koltuk
  from public.restaurant_tables
  where restaurant_id = v_restoran and deleted_at is null;

  select coalesce(sum(party_size), 0) into v_dolu
  from public.reservations
  where restaurant_id = v_restoran and deleted_at is null and yedek = false
    and status in ('bekleniyor', 'geldi', 'oturdu')
    and (reserved_at at time zone 'Europe/Istanbul')::date = v_gun;

  -- Masası hiç tanımlanmamış işletmede fren çalışmaz; yoksa hiç rezervasyon alınamazdı.
  if v_koltuk > 0 and v_dolu + p_kisi > v_koltuk then
    insert into public.dolu_gun_talepleri (restaurant_id, gun, kisi, ad, telefon, kanal)
    values (v_restoran, v_gun, p_kisi, btrim(p_ad), btrim(p_telefon), 'online');
    raise exception 'KAPASITE_DOLU';
  end if;

  insert into public.reservations (
    restaurant_id, guest_name, guest_phone, party_size, reserved_at, note,
    status, source, iletisim_kanali, consent_at, tercih_alan_id
  ) values (
    v_restoran, btrim(p_ad), btrim(p_telefon), p_kisi, p_zaman, nullif(btrim(p_not), ''),
    'bekleniyor', 'online', 'online', now(), v_alan
  ) returning id into v_id;

  return v_id;
end $function$;

grant execute on function public.online_rezervasyon_olustur(text, text, text, integer, timestamptz, text, uuid) to anon, authenticated;
