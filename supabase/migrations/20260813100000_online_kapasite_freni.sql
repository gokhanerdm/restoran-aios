-- ONLINE REZERVASYONDA KAPASİTE FRENİ (Gökhan, 2026-08-13)
--
-- "Kapasite dolunca rezervasyon alınmasın, kapasite dolu desin, ama kayıt tutulsun."
--
-- Dışarıdan (Instagram linki, web sitesi) gelen rezervasyon bugüne kadar kapasiteye hiç
-- bakmıyordu; dolu bir güne sınırsız kayıt düşebiliyordu. Artık o gün için ayrılabilecek koltuk
-- kalmamışsa kayıt açılmaz, misafire "o gün doldu" denir ve talep dolu_gun_talepleri'ne yazılır —
-- işletme "kapasite dolduktan sonra kaç kişi aradı" bilgisini görebilsin.
--
-- Buradaki hesap KABA bir üst sınırdır: salonun toplam koltuğu ile o günün rezervasyon kişileri
-- karşılaştırılır. Programın kendi masa hesabı (masa boyuna göre dağıtım) tarayıcıda çalışıyor;
-- burada amaç ince ayar değil, dolu güne dışarıdan sınırsız kayıt düşmesini engellemek.
-- Yedek kayıtlar masa tutmadığı için sayılmaz.

create or replace function public.online_rezervasyon_olustur(
  p_slug text, p_ad text, p_telefon text, p_kisi integer,
  p_zaman timestamp with time zone, p_not text default null::text
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
begin
  select id into v_restoran from public.restaurants where slug = p_slug and deleted_at is null;
  if v_restoran is null then
    raise exception 'İşletme bulunamadı';
  end if;
  if coalesce(btrim(p_ad), '') = '' or coalesce(btrim(p_telefon), '') = ''
     or p_kisi is null or p_kisi <= 0 or p_kisi > 100 or p_zaman is null then
    raise exception 'Eksik ya da geçersiz bilgi';
  end if;

  v_gun := (p_zaman at time zone 'Europe/Istanbul')::date;

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
    status, source, iletisim_kanali, consent_at
  ) values (
    v_restoran, btrim(p_ad), btrim(p_telefon), p_kisi, p_zaman, nullif(btrim(p_not), ''),
    'bekleniyor', 'online', 'online', now()
  ) returning id into v_id;

  return v_id;
end $function$;

-- Girişsiz sayfa bu fonksiyonu çağırabilmeli (eskisi gibi).
grant execute on function public.online_rezervasyon_olustur(text, text, text, integer, timestamptz, text) to anon, authenticated;
