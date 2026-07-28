-- Servis sırası (coursing) — ROADMAP §O5, Gökhan'ın tasarımı.
--
-- "Menüde başlangıç varsa önce başlangıçlar gider... garson müşteriye sorar 'ana yemekler de
-- çıksın mı?' Çıksın derse hemen tıklar, önce başlangıç derse gelince tekrar sorar. Karar
-- müşterinin, tetik garsonun elinde — program araya girip kendi göndermiyor. Sıra kategoriden
-- gelir (Başlangıçlar 1, Ana 2, Tatlı 3), garson uğraşmaz. İçecekler sıraya girmez."
--
-- Model: course_no kategoriye tanımlanır (Ayarlar). course_no=null olan kategoriler (içecekler,
-- ya da restoranın hiç ayarlamadığı kategoriler) her zaman olduğu gibi normal "Gönder" ile
-- gider. course_no=1 de normal "Gönder" ile gider (zaten ilk sırada, bekletmeye gerek yok).
-- course_no>=2 olanlar "Gönder"in DIŞINDA tutulur; garson ekranındaki ayrı "X gönder"
-- butonlarıyla (release_order_course) elle serbest bırakılır. Komple kapatılabilir:
-- restaurant_settings.course_sequencing_enabled false ise sipariş satırına course_no hiç
-- yazılmaz (istemci tarafında), böylece basit/dönerci modu tamamen etkilenmez.

alter table menu_categories add column if not exists course_no int;
alter table order_items add column if not exists course_no int;
alter table order_items add column if not exists course_released_at timestamptz;
alter table restaurant_settings add column if not exists course_sequencing_enabled boolean not null default false;

-- Garsonun "Ana yemekleri gönder" / "Tatlıları gönder" gibi butonlarının çağırdığı RPC.
-- Normal "Gönder" akışının (sendOrder, istemci tarafı) dışında tutulan course_no>=2 kalemleri
-- serbest bırakır: sent_at + course_released_at aynı anda set edilir ki servisler arası süre
-- ("başlangıçtan anaya ortalama 18 dk") sonradan course_released_at farkından hesaplanabilsin.
create or replace function release_order_course(p_order_id uuid, p_course_no int, p_staff_id uuid default null)
returns void
language plpgsql
as $$
begin
  update order_items
  set sent_at = now(),
      course_released_at = now(),
      sent_by_staff_id = coalesce(p_staff_id, sent_by_staff_id)
  where order_id = p_order_id
    and course_no = p_course_no
    and status = 'active'
    and sent_at is null;
end;
$$;
