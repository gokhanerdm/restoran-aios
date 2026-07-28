-- Garson ataması ve mola — ROADMAP §O3.
--
-- Gökhan'ın fikri: "garson mola seçer, mola seçen garsonun masaları herkese açılır ya da
-- yardımcısına açılır — hem molayı görürsün hem masalar sahipsiz kalmaz." Bu turda "herkese
-- açılır" tarafı uygulanıyor: mola'daki garsonun masaları uygulama katmanında "sahipsiz"
-- sayılır (bildirim/renk mantığı bunu dikkate alır); belirli bir yardımcıya devretme daha
-- ince bir akış ister, sonraya bırakıldı.

alter table restaurant_tables add column if not exists assigned_staff_id uuid references staff_members(id);

alter table staff_members add column if not exists on_break boolean not null default false;
alter table staff_members add column if not exists break_started_at timestamptz;

create or replace function toggle_staff_break(p_staff_id uuid)
returns boolean
language plpgsql
as $$
declare
  v_new boolean;
begin
  update staff_members
  set on_break = not on_break,
      break_started_at = case when not on_break then now() else null end
  where id = p_staff_id
  returning on_break into v_new;
  return v_new;
end;
$$;
