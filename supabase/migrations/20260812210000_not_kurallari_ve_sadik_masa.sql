-- NOT KURALLARI + SADIK MİSAFİRİN MASASI (Gökhan, 2026-08-12)
--
-- İki iş bir arada:
--
-- 1) Nota yazılan kelime. "Notlarda geçen salon ismini büyük küçük harf fark etmeden tanıyacak
--    ve manuel seçilmediği sürece o salona atacak." Hangi kelimenin ne yapacağı sabit kodlanmıyor,
--    işletme kendi listesini tutuyor (Gökhan: "ayarlara içinde geçecek kelimeleri koyacağımız bir
--    alan yapabiliriz, şu yazılırsa nota şunu yap gibi"). Şimdilik iki iş var:
--      salon            -> rezervasyon o salona yerleşir (alan_id dolu)
--      her_zamanki_masa -> misafirin kendi masası aranır
--
-- 2) Sadık misafirin masası. En az iki kez gelmiş, üçüncüye ya da fazlasına geliyorsa sadıktır;
--    son gelişlerinde EN AZ İKİ KEZ aynı masada oturmuşsa o masa onun masasıdır (Gökhan: "en çok
--    hangi masaya oturduysa o... geldiği iki seferde de aynı masaya oturduysa o masayı sevmiştir").
--    Kaç gelişine bakılacağı ayardan gelir.

create table if not exists public.not_kurallari (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  kelime text not null,
  -- 'salon' | 'her_zamanki_masa'
  tip text not null,
  -- tip='salon' ise hangi salon
  alan_id uuid references public.dining_areas(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_not_kurallari_restoran on public.not_kurallari(restaurant_id);

alter table public.not_kurallari enable row level security;
drop policy if exists isletme_erisimi on public.not_kurallari;
create policy isletme_erisimi on public.not_kurallari for all to authenticated
  using (public.yonetici_mi() or restaurant_id in (select public.erisilen_restoranlar()))
  with check (public.yonetici_mi() or restaurant_id in (select public.erisilen_restoranlar()));

-- Sadık misafirin masası aranırken geriye kaç gelişine bakılacağı. 0 = hepsine bakılır.
alter table public.restaurant_settings
  add column if not exists sadik_masa_gecmis_sayisi integer not null default 3;

-- Var olan salonlar kural listesine hazır gelsin — işletme tek tek yazmak zorunda kalmasın.
insert into public.not_kurallari (restaurant_id, kelime, tip, alan_id, sort_order)
select a.restaurant_id, a.name, 'salon', a.id, a.sort_order
from public.dining_areas a
where a.deleted_at is null
  and not exists (
    select 1 from public.not_kurallari k
    where k.restaurant_id = a.restaurant_id and k.alan_id = a.id and k.deleted_at is null
  );
