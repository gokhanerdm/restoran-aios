-- Puantaj, fazla mesai ve yıllık izin — 4857 sayılı İş Kanunu uyumu.
--
-- md. 67  : işveren çalışma sürelerini kayıt altında tutmak zorunda (puantaj).
-- md. 63  : haftalık çalışma süresi 45 saat; aşan kısım fazla çalışmadır.
-- md. 41  : fazla çalışma için işçinin YAZILI onayı gerekir ve yılda 270 saati geçemez.
-- md. 53  : yıllık ücretli izin — 1–5 yıl 14 gün, 5–15 yıl 20 gün, 15+ yıl 26 gün.
--
-- Vardiya kaydı (staff_shifts) zaten vardı; eksik olan yasal çerçeveydi.
-- Özlük dosyası eksikliğinin idari para cezası 2025'te 21.213 TL idi.

alter table staff_members add column if not exists hire_date date;
-- 18 yaşından küçük ve 50 yaşından büyük işçiye en az 20 gün izin verilir. Doğum tarihini
-- toplamamak için (gereksiz kişisel veri) bu istisna elle override ile yönetilir.
alter table staff_members add column if not exists annual_leave_override_days int;

create table staff_leaves (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  staff_id      uuid not null references staff_members(id),
  leave_type    text not null default 'yillik'
                  check (leave_type in ('yillik', 'ucretsiz', 'raporlu', 'mazeret')),
  start_date    date not null,
  end_date      date not null,
  note          text,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  check (end_date >= start_date)
);
create index idx_staff_leaves_restaurant on staff_leaves(restaurant_id);
create index idx_staff_leaves_staff on staff_leaves(staff_id);

-- Fazla çalışma onayı: md. 41 gereği yazılı, uygulamada yılda bir alınır.
create table overtime_consents (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id),
  staff_id      uuid not null references staff_members(id),
  consent_year  int not null,
  consented_at  timestamptz not null default now(),
  note          text,
  unique (staff_id, consent_year)
);
create index idx_overtime_consents_restaurant on overtime_consents(restaurant_id);

-- Puantaj cetveli — personel × gün saat tablosu.
-- Gece yarısını geçen vardiya BAŞLADIĞI güne yazılır: restoranda 18:00–02:00 tek bir
-- çalışma günüdür, iki güne bölmek puantajı okunmaz hâle getirir.
create or replace function weekly_timesheet(p_restaurant uuid, p_week_start date)
returns table (
  staff_id  uuid,
  full_name text,
  role      text,
  work_date date,
  hours     numeric
)
language sql
stable
as $$
  select sh.staff_id,
         sm.full_name,
         sm.role,
         (sh.started_at at time zone 'Europe/Istanbul')::date,
         round(sum(extract(epoch from (coalesce(sh.ended_at, now()) - sh.started_at))::numeric) / 3600.0, 2)
  from staff_shifts sh
  join staff_members sm on sm.id = sh.staff_id
  where sh.restaurant_id = p_restaurant
    and (sh.started_at at time zone 'Europe/Istanbul')::date >= p_week_start
    and (sh.started_at at time zone 'Europe/Istanbul')::date < p_week_start + 7
  group by sh.staff_id, sm.full_name, sm.role, (sh.started_at at time zone 'Europe/Istanbul')::date
  order by sm.full_name, 4;
$$;

-- Yasal uyum özeti: haftalık saat, 45 saat aşımı, yazılı onay var mı, yıllık 270 saat
-- sınırına ne kadar kalmış, yıllık izin hakkı / kullanılan / kalan.
create or replace function labor_compliance(p_restaurant uuid, p_week_start date)
returns table (
  staff_id            uuid,
  full_name           text,
  role                text,
  hire_date           date,
  week_hours          numeric,
  overtime_hours      numeric,
  has_consent         boolean,
  year_overtime_hours numeric,
  leave_entitled      int,
  leave_used          int,
  leave_remaining     int
)
language sql
stable
as $$
  with haftalik as (
    select sh.staff_id as sid,
           date_trunc('week', (sh.started_at at time zone 'Europe/Istanbul'))::date as hafta,
           sum(extract(epoch from (coalesce(sh.ended_at, now()) - sh.started_at))::numeric) / 3600.0 as saat
    from staff_shifts sh
    where sh.restaurant_id = p_restaurant
      and (sh.started_at at time zone 'Europe/Istanbul')::date >= date_trunc('year', p_week_start::timestamp)::date
      and (sh.started_at at time zone 'Europe/Istanbul')::date <= p_week_start + 6
    group by 1, 2
  ),
  ozet as (
    select sid,
           coalesce(sum(saat) filter (where hafta = date_trunc('week', p_week_start::timestamp)::date), 0) as bu_hafta,
           coalesce(sum(greatest(0, saat - 45)), 0) as yil_fazla
    from haftalik
    group by sid
  ),
  izin as (
    select l.staff_id as sid,
           sum((l.end_date - l.start_date) + 1) as gun
    from staff_leaves l
    where l.restaurant_id = p_restaurant
      and l.deleted_at is null
      and l.leave_type = 'yillik'
      and extract(year from l.start_date) = extract(year from p_week_start)
    group by l.staff_id
  ),
  hak as (
    select sm.id as sid,
           case
             when sm.annual_leave_override_days is not null then sm.annual_leave_override_days
             when sm.hire_date is null then 0
             when age(p_week_start, sm.hire_date) < interval '1 year'  then 0
             when age(p_week_start, sm.hire_date) <= interval '5 years' then 14
             when age(p_week_start, sm.hire_date) <  interval '15 years' then 20
             else 26
           end as gun
    from staff_members sm
    where sm.restaurant_id = p_restaurant
  )
  select sm.id,
         sm.full_name,
         sm.role,
         sm.hire_date,
         round(coalesce(o.bu_hafta, 0), 2),
         round(greatest(0, coalesce(o.bu_hafta, 0) - 45), 2),
         exists (
           select 1 from overtime_consents oc
           where oc.staff_id = sm.id
             and oc.consent_year = extract(year from p_week_start)::int
         ),
         round(coalesce(o.yil_fazla, 0), 2),
         coalesce(h.gun, 0),
         coalesce(i.gun, 0)::int,
         greatest(0, coalesce(h.gun, 0) - coalesce(i.gun, 0)::int)
  from staff_members sm
  left join ozet o on o.sid = sm.id
  left join izin i on i.sid = sm.id
  left join hak  h on h.sid = sm.id
  where sm.restaurant_id = p_restaurant
    and sm.deleted_at is null
    and sm.active
  order by sm.full_name;
$$;
