-- Vardiya / mesai takibi — gerçek işçilik maliyetinin ön koşulu.
-- Bugüne kadar personel maliyeti sadece aylık brüt maaş olarak biliniyordu (staff_members.gross_salary,
-- Ana Sayfa'daki Sabit Gider'e oradan yansıyor). O rakam AYLIK ve sabit olduğu için "bugün mutfakta
-- kaç saat işçilik yandı" sorusunu cevaplayamıyor; dolayısıyla günlük prime cost (malzeme + işçilik)
-- tam doğru hesaplanamıyordu. Bu migration mesai kaydını ekler; gross_salary'ye DOKUNMAZ.

create table staff_shifts (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  staff_id      uuid not null references staff_members(id),
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,                                  -- null = halen mesaide
  note          text,
  created_at    timestamptz not null default now()
);

create index idx_staff_shifts_restaurant on staff_shifts(restaurant_id);
create index idx_staff_shifts_staff on staff_shifts(staff_id);

-- Bir personelin aynı anda iki açık vardiyası olamaz. Ekran zaten izin vermiyor ama
-- çift tıklama / iki cihazdan aynı anda başlatma gibi durumlarda veri bozulmasın diye
-- kural veritabanında da duruyor.
create unique index uniq_staff_shifts_open on staff_shifts(staff_id) where ended_at is null;

-- Saatlik çalışan (part-time, ekstra eleman) için saat ücreti. null = saatlik ücreti yok,
-- maliyet aylık brüt maaştan yaklaşık hesaplanır.
alter table staff_members add column hourly_rate numeric(10,2);

-- Verilen aralıkta personel başına toplam çalışma saati ve işçilik maliyeti.
-- Aralığın dışına taşan vardiyalar kırpılır (least/greatest), açık vardiyalar now()'a kadar sayılır.
-- Maliyet iki yoldan biriyle bulunur ve hangisinin kullanıldığı 'yontem' sütununda döner:
--   'saatlik'        → hourly_rate girilmiş, saat × hourly_rate (gerçek rakam)
--   'maastan_tahmin' → hourly_rate yok, aylık brüt maaş / 30 gün / 8 saat × saat (YAKLAŞIK)
create or replace function staff_shift_cost(p_restaurant_id uuid, p_from timestamptz, p_to timestamptz)
returns table (
  staff_id    uuid,
  full_name   text,
  role        text,
  toplam_saat numeric,
  maliyet     numeric,
  yontem      text
)
language sql
stable
as $$
  with sure as (
    select
      sh.staff_id as sid,
      sum(
        greatest(
          0,
          extract(epoch from (
            least(coalesce(sh.ended_at, now()), p_to) - greatest(sh.started_at, p_from)
          ))
        )::numeric
      ) / 3600.0 as saat
    from staff_shifts sh
    where sh.restaurant_id = p_restaurant_id
      and sh.started_at < p_to
      and coalesce(sh.ended_at, now()) > p_from
    group by sh.staff_id
  )
  select
    sm.id,
    sm.full_name,
    sm.role,
    round(sure.saat, 2) as toplam_saat,
    round(
      case
        when coalesce(sm.hourly_rate, 0) > 0 then sure.saat * sm.hourly_rate
        else sure.saat * (coalesce(sm.gross_salary, 0) / 30.0 / 8.0)
      end
    , 2) as maliyet,
    case when coalesce(sm.hourly_rate, 0) > 0 then 'saatlik' else 'maastan_tahmin' end as yontem
  from sure
  join staff_members sm on sm.id = sure.sid
  order by sm.full_name;
$$;
