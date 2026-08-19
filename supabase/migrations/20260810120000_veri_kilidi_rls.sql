-- Veri kilidi (RLS) — Gökhan, 2026-08-10: "veri kilidini açalım".
--
-- Bugüne kadar bütün tablolar kilitsizdi: giriş yapmış herhangi bir kullanıcı, teknik
-- olarak başka bir işletmenin rezervasyonlarını, misafir bilgilerini, cirosunu çekebiliyordu.
-- Program bunu ekranda göstermiyordu ama engel de yoktu. Farklı işletmeler kendi üyeliklerini
-- açmaya başlamadan önce kapatılması gereken açık buydu.
--
-- Kurulan düzen:
--   * Her tablo "bu satır hangi işletmenin?" diye sorar; cevap kullanıcının işletmesi değilse
--     satır hiç dönmez. Ne okuma ne yazma.
--   * Bir kullanıcının işletmeleri iki yoldan gelir: restaurants.owner_user_id (rezervasyon
--     tarafının kendi oturum çözücüsü, bkz. lib/supabase/reservationAccount.ts) ve
--     profiles.restaurant_id (AIOS tarafı).
--   * Platform yöneticisi (Gökhan) hepsini görür — yönetim ekranı ve destek için.
--   * Girişsiz iki genel yüzey açık kalır ama tabloya doğrudan değil, aşağıdaki denetimli
--     görünüm/fonksiyonlar üzerinden: dijital menü (/m/[slug]) ve online rezervasyon
--     (/rezervasyon-yap/[slug]). İkisi de sadece o işletmenin dışarıya açık verisini verir;
--     maliyet, tedarikçi, misafir listesi gibi iç bilgiye ulaşamaz.
--
-- Bilerek dışarıda bırakılan: QR sipariş (/m/[slug]?masa=), garson, mutfak ve vale ekranları
-- bugüne kadar hiç giriş istemeden çalışıyordu. Kilit sonrası oturum isteyecekler. Bunları
-- girişsiz bırakmak, sipariş ve masa tablolarını herkese açmak demekti — kilidin kendisini
-- anlamsız kılardı. Doğru çözümü personel/PIN sistemi (sıradaki iş).

-- ---------------------------------------------------------------------------
-- 1) Platform yöneticisi
-- ---------------------------------------------------------------------------

create table if not exists public.platform_yoneticileri (
  user_id uuid primary key references auth.users(id) on delete cascade,
  eklendi_at timestamptz not null default now()
);

-- RLS açık ve TEK BİR politika bile yok: bu tabloyu normal kullanıcı ne okur ne yazar.
-- Sadece aşağıdaki güvenli fonksiyonlar (security definer) ve sunucu anahtarı görür —
-- yani kimse "ben yöneticiyim" satırı ekleyemez.
alter table public.platform_yoneticileri enable row level security;

insert into public.platform_yoneticileri (user_id)
select id from auth.users where email = 'gerdem.kayen@gmail.com'
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2) Kimlik çözücüler — politikaların hepsi bu ikisine dayanır
-- ---------------------------------------------------------------------------

create or replace function public.yonetici_mi()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_yoneticileri y where y.user_id = auth.uid());
$$;

create or replace function public.erisilen_restoranlar()
returns setof uuid language sql stable security definer set search_path = public as $$
  select r.id from public.restaurants r
   where r.owner_user_id = auth.uid() and r.deleted_at is null
  union
  select p.restaurant_id from public.profiles p
   where p.id = auth.uid() and p.restaurant_id is not null;
$$;

-- ---------------------------------------------------------------------------
-- 3) Girişsiz genel yüzeyler — tabloya değil, bunlara erişilir
-- ---------------------------------------------------------------------------

-- Dijital menü ve online rezervasyon sayfaları işletmeyi koduna (slug) göre bulur ve
-- sadece adını gösterir. Vergi numarası, adres, telefon gibi alanlar bu görünümde yok.
-- Online rezervasyon sayfasının açılışta ihtiyacı olan tek şey: işletme adı ve KVKK metni.
-- restaurant_settings tablosunun tamamı dışarıya kapalı olduğu için buradan verilir.
create or replace function public.online_rezervasyon_bilgi(p_slug text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id,
    'name', r.name,
    'kvkk_notice', (select s.kvkk_notice from public.restaurant_settings s where s.restaurant_id = r.id)
  )
  from public.restaurants r
  where r.slug = p_slug and r.deleted_at is null
  limit 1;
$$;

grant execute on function public.online_rezervasyon_bilgi(text) to anon, authenticated;

-- QR menünün tamamı tek çağrıda: işletme + menü tasarımı + kategoriler + ürünler
-- (alerjen/kalori için tarif satırlarıyla) + canlı stok + (varsa) masa doğrulaması.
-- Ürün maliyeti, tedarikçi, stok miktarı gibi iç bilgi bilerek dışarıda.
create or replace function public.qr_menu(p_slug text, p_masa uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with r as (
    select id, name from public.restaurants where slug = p_slug and deleted_at is null limit 1
  )
  select jsonb_build_object(
    'restaurant', jsonb_build_object('id', r.id, 'name', r.name),
    'settings', (
      select jsonb_build_object('default_menu_design', s.default_menu_design, 'kvkk_notice', s.kvkk_notice)
        from public.restaurant_settings s where s.restaurant_id = r.id
    ),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'parent_id', c.parent_id)
                       order by c.sort_order, c.name)
        from public.menu_categories c
       where c.restaurant_id = r.id and c.deleted_at is null
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'name', m.name, 'sale_price', m.sale_price, 'vat_rate', m.vat_rate,
               'category_id', m.category_id, 'calorie_override', m.calorie_override,
               'description', m.description, 'image_url', m.image_url,
               'ingredients_text', m.ingredients_text, 'allergens_override', m.allergens_override,
               'recipe_items', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'quantity', ri.quantity,
                          'ingredients', case when ing.id is null then null else jsonb_build_object(
                            'name', ing.name, 'kcal_per_unit', ing.kcal_per_unit,
                            'diet_class', ing.diet_class, 'allergens', ing.allergens) end))
                   from public.recipe_items ri
                   left join public.ingredients ing on ing.id = ri.ingredient_id and ing.deleted_at is null
                  where ri.menu_item_id = m.id
               ), '[]'::jsonb))
             order by m.sort_order, m.name)
        from public.menu_items m
       where m.restaurant_id = r.id and m.is_active and m.available_dine_in and m.deleted_at is null
    ), '[]'::jsonb),
    'stock', coalesce((
      select jsonb_agg(jsonb_build_object('menu_item_id', s.menu_item_id, 'servings_left', s.servings_left,
                                          'is_86d', s.is_86d, 'low_stock', s.low_stock))
        from public.menu_items_stock_status(r.id) s
    ), '[]'::jsonb),
    'table', (
      select jsonb_build_object('id', t.id, 'name', t.name)
        from public.restaurant_tables t
       where t.id = p_masa and t.restaurant_id = r.id and t.deleted_at is null
    )
  )
  from r;
$$;

grant execute on function public.qr_menu(text, uuid) to anon, authenticated;

-- Misafirin kendi açtığı online rezervasyon. Tabloya doğrudan yazma izni vermek yerine
-- buradan geçer: hangi işletmeye yazılacağına kod (slug) karar verir, kayıt her zaman
-- "bekleniyor / online" olarak düşer, başka hiçbir alan dışarıdan belirlenemez.
create or replace function public.online_rezervasyon_olustur(
  p_slug text, p_ad text, p_telefon text, p_kisi integer, p_zaman timestamptz, p_not text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_restoran uuid;
  v_id uuid;
begin
  select id into v_restoran from public.restaurants where slug = p_slug and deleted_at is null;
  if v_restoran is null then
    raise exception 'İşletme bulunamadı';
  end if;
  if coalesce(btrim(p_ad), '') = '' or coalesce(btrim(p_telefon), '') = ''
     or p_kisi is null or p_kisi <= 0 or p_kisi > 100 or p_zaman is null then
    raise exception 'Eksik ya da geçersiz bilgi';
  end if;

  insert into public.reservations (
    restaurant_id, guest_name, guest_phone, party_size, reserved_at, note,
    status, source, iletisim_kanali, consent_at
  ) values (
    v_restoran, btrim(p_ad), btrim(p_telefon), p_kisi, p_zaman, nullif(btrim(p_not), ''),
    'bekleniyor', 'online', 'online', now()
  ) returning id into v_id;

  return v_id;
end $$;

grant execute on function public.online_rezervasyon_olustur(text, text, text, integer, timestamptz, text)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) İşletmeye ait tablolar — hepsi aynı kurala bağlanır
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  tablolar text[] := array[
    'business_expenses', 'cash_movements', 'day_closures', 'dining_areas', 'efatura_connections',
    'ingredients', 'inventory_count_items', 'inventory_counts', 'kisi_kartlari', 'masa_olculeri',
    'menu_categories', 'menu_item_modifier_groups', 'menu_items', 'modifier_groups', 'modifiers',
    'order_discounts', 'order_item_modifiers', 'order_items', 'order_payments', 'orders',
    'overtime_consents', 'payment_providers', 'product_variants', 'purchase_items',
    'purchase_requests', 'purchases', 'recipe_items', 'reservations', 'restaurant_settings',
    'restaurant_tables', 'salon_ogeleri', 'settlement_receipts', 'staff_leaves', 'staff_members',
    'staff_shifts', 'stations', 'stock_groups', 'stock_movements', 'suppliers',
    'table_status_events', 'valet_entries'
  ];
begin
  foreach t in array tablolar loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists isletme_erisimi on public.%I', t);
    execute format(
      'create policy isletme_erisimi on public.%I for all to authenticated
         using (public.yonetici_mi() or restaurant_id in (select public.erisilen_restoranlar()))
         with check (public.yonetici_mi() or restaurant_id in (select public.erisilen_restoranlar()))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5) Kendine has tablolar
-- ---------------------------------------------------------------------------

-- İşletme kaydı: sahibi, personeli ve yönetici görür. Yeni kayıt açan kullanıcı kendi
-- adına satır ekleyebilir (bkz. bootstrap_reservation_account) — başkası adına ekleyemez.
alter table public.restaurants enable row level security;
drop policy if exists isletme_erisimi on public.restaurants;
create policy isletme_erisimi on public.restaurants for all to authenticated
  using (public.yonetici_mi() or owner_user_id = auth.uid() or id in (select public.erisilen_restoranlar()))
  with check (public.yonetici_mi() or owner_user_id = auth.uid());

-- Çok şubeli hesabın şirket satırı.
alter table public.companies enable row level security;
drop policy if exists isletme_erisimi on public.companies;
create policy isletme_erisimi on public.companies for all to authenticated
  using (public.yonetici_mi() or owner_user_id = auth.uid())
  with check (public.yonetici_mi() or owner_user_id = auth.uid());

-- Kullanıcı profili: kendi satırı + aynı işletmedekiler.
alter table public.profiles enable row level security;
drop policy if exists isletme_erisimi on public.profiles;
create policy isletme_erisimi on public.profiles for all to authenticated
  using (public.yonetici_mi() or id = auth.uid() or restaurant_id in (select public.erisilen_restoranlar()))
  with check (public.yonetici_mi() or id = auth.uid() or restaurant_id in (select public.erisilen_restoranlar()));

-- Rezervasyon-masa bağı: kendi restaurant_id'si yok, bağlı olduğu rezervasyondan türer.
alter table public.reservation_tables enable row level security;
drop policy if exists isletme_erisimi on public.reservation_tables;
create policy isletme_erisimi on public.reservation_tables for all to authenticated
  using (public.yonetici_mi() or exists (
    select 1 from public.reservations v
     where v.id = reservation_id and v.restaurant_id in (select public.erisilen_restoranlar())))
  with check (public.yonetici_mi() or exists (
    select 1 from public.reservations v
     where v.id = reservation_id and v.restaurant_id in (select public.erisilen_restoranlar())));

-- Kişi kartı bağlantıları: bağlı olduğu kişi kartından türer.
alter table public.kisi_kart_baglantilari enable row level security;
drop policy if exists isletme_erisimi on public.kisi_kart_baglantilari;
create policy isletme_erisimi on public.kisi_kart_baglantilari for all to authenticated
  using (public.yonetici_mi() or exists (
    select 1 from public.kisi_kartlari k
     where k.id = kisi_karti_id and k.restaurant_id in (select public.erisilen_restoranlar())))
  with check (public.yonetici_mi() or exists (
    select 1 from public.kisi_kartlari k
     where k.id = kisi_karti_id and k.restaurant_id in (select public.erisilen_restoranlar())));

-- ---------------------------------------------------------------------------
-- 6) Ortak tablolar — işletmeye ait değil, herkese aynı gelir
-- ---------------------------------------------------------------------------
-- Konsept şablonları (hazır menü/reçete paketleri) ve resmî tatil listesi: her işletme
-- okur, kimse değiştiremez — içerik bizden gelir.

do $$
declare
  t text;
  tablolar text[] := array[
    'concept_categories', 'concept_ingredients', 'concept_items', 'concept_recipe_items',
    'concept_templates', 'public_holidays'
  ];
begin
  foreach t in array tablolar loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists ortak_okuma on public.%I', t);
    execute format('drop policy if exists yonetici_yazma on public.%I', t);
    execute format('create policy ortak_okuma on public.%I for select to authenticated using (true)', t);
    execute format('create policy yonetici_yazma on public.%I for all to authenticated
                      using (public.yonetici_mi()) with check (public.yonetici_mi())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7) Yeni işletme kaydı
-- ---------------------------------------------------------------------------
-- Kayıt akışı kilidin altında kalan tek akıştı: e-posta onayı açıkken signUp henüz oturum
-- açmıyor, dolayısıyla kaydı yapan tarafın kimliği yok — kilit de haklı olarak "sen kimsin"
-- deyip reddediyordu. AIOS tarafında ayrıca işletme satırı sahipsiz açılıyor (bağ profiles
-- üzerinden kuruluyor) ve işletme kodu üretilirken bütün kodların görülmesi gerekiyor.
--
-- İki fonksiyon da kilidin üstüne çıkarıldı, kimin adına kayıt açıldığı iki kapıya bağlandı:
--   * Oturum varsa: sadece kendi kimliğine kayıt açabilir.
--   * Oturum yoksa: ancak az önce (15 dk içinde) oluşmuş bir kullanıcı için çalışır — yani
--     gerçekten yeni kayıt akışı. Rastgele bir kullanıcı kimliğiyle çağrılamaz.
--
-- Gövdelerin geri kalanı olduğu gibi; buraya kopyalanmaları sadece güvenlik kapısı ve
-- security definer için. Tam metinleri canlıda tutulan halleriyle aynı:
--   bootstrap_reservation_account, bootstrap_restaurant_account
-- (bkz. 20260810 tarihli veri_kilidi_yeni_kayit_akisi / veri_kilidi_aios_kayit_akisi.)

-- ---------------------------------------------------------------------------
-- 8) Kilidi delen eski kapılar
-- ---------------------------------------------------------------------------
-- Bu üç fonksiyon SECURITY DEFINER — yani satır kilidini atlarlar — ama içlerinde
-- "bu işletme senin mi?" kontrolü hiç yoktu. Kilit kurulduktan sonra tek açık kapı
-- bunlardı: başka bir işletmenin personelini ekleyebilir, PIN'ini değiştirebilir,
-- siparişini bölebilirdin.
--
-- verify_staff_pin bilerek olduğu gibi bırakıldı: PIN doğrulaması yapan taraf henüz
-- kimliksiz (personel oturumu yok) ve sadece ad/rol döndürüyor, veriye açılmıyor.
-- Personel/PIN sistemi yazılırken orada ele alınacak.

create or replace function public.add_staff_member(p_restaurant_id uuid, p_full_name text, p_pin text, p_role text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_id uuid;
begin
  if not (public.yonetici_mi() or p_restaurant_id in (select public.erisilen_restoranlar())) then
    raise exception 'Bu işletmede personel ekleme yetkiniz yok';
  end if;
  insert into staff_members (restaurant_id, full_name, pin_hash, role)
  values (p_restaurant_id, p_full_name, crypt(p_pin, gen_salt('bf')), p_role)
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.set_staff_pin(p_staff_id uuid, p_new_pin text)
returns void language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_restoran uuid;
begin
  select restaurant_id into v_restoran from staff_members where id = p_staff_id;
  if v_restoran is null then
    raise exception 'Personel bulunamadı';
  end if;
  if not (public.yonetici_mi() or v_restoran in (select public.erisilen_restoranlar())) then
    raise exception 'Bu personelin şifresini değiştirme yetkiniz yok';
  end if;
  update staff_members set pin_hash = crypt(p_new_pin, gen_salt('bf')) where id = p_staff_id;
end;
$function$;

-- split_order'ın tek değişikliği baştaki yetki kontrolü; gerisi olduğu gibi duruyor.
create or replace function public.split_order(p_order_id uuid, p_item_ids uuid[], p_new_table_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_source orders%rowtype;
  v_new_order_id uuid;
  v_moved int;
begin
  select * into v_source from orders where id = p_order_id and status = 'open';
  if not found then
    raise exception 'Açık sipariş bulunamadı';
  end if;

  if not (public.yonetici_mi() or v_source.restaurant_id in (select public.erisilen_restoranlar())) then
    raise exception 'Bu siparişe erişim yetkiniz yok';
  end if;

  if p_item_ids is null or array_length(p_item_ids, 1) is null then
    raise exception 'Ayrılacak kalem seçilmedi';
  end if;

  if p_new_table_id is not null
     and exists (select 1 from orders where table_id = p_new_table_id and status = 'open') then
    raise exception 'Hedef masada zaten açık bir sipariş var';
  end if;

  insert into orders (restaurant_id, table_id, status, channel, party_size,
                      split_from_order_id, split_from_table_id)
  values (v_source.restaurant_id, p_new_table_id, 'open', v_source.channel, 1,
          v_source.id, v_source.table_id)
  returning id into v_new_order_id;

  update order_items
  set order_id = v_new_order_id,
      original_table_id = coalesce(original_table_id, v_source.table_id)
  where order_id = p_order_id and id = any(p_item_ids);

  get diagnostics v_moved = row_count;
  if v_moved = 0 then
    delete from orders where id = v_new_order_id;
    raise exception 'Seçilen kalemler bu siparişte bulunamadı';
  end if;

  update order_discounts
  set order_id = v_new_order_id
  where order_id = p_order_id and order_item_id = any(p_item_ids);

  if p_new_table_id is not null then
    update restaurant_tables set status = 'occupied', updated_at = now() where id = p_new_table_id;
  end if;

  return v_new_order_id;
end;
$function$;
