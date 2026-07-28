-- KVKK uyum katmanı.
-- Rezervasyon ekranı isim + telefon topluyor, QR menü müşteri siparişi alıyor: bu, işletmeyi
-- 6698 sayılı kanun anlamında "veri sorumlusu" yapıyor. Aydınlatma yükümlülüğüne aykırılığın
-- idari para cezası 2026 itibarıyla 100.000 – 1.000.000 TL bandında.
--
-- Üç eksik parça kapatılıyor: (1) aydınlatma metninin müşteriye gösterilmesi ve onayın
-- kaydı, (2) saklama süresi tanımı, (3) süresi dolan kişisel verinin anonimleştirilmesi.

alter table restaurant_settings add column if not exists kvkk_notice text;
alter table restaurant_settings add column if not exists kvkk_retention_days int not null default 365;

-- Onay zamanı: müşteri/işletmeci aydınlatma metnini görüp kaydı oluşturduğu an.
alter table reservations add column if not exists consent_at timestamptz;
-- Anonimleştirilmiş kayıtlar silinmez — istatistik (kaç kişi, hangi saat, geldi mi) kişisel
-- veri değil; sadece kimliği taşıyan alanlar temizlenir.
alter table reservations add column if not exists anonymized_at timestamptz;

create index if not exists idx_reservations_anonymized on reservations(anonymized_at);

-- Saklama süresi dolmuş kişisel verinin durumu — Ayarlar'da "kaç kayıt bekliyor" için.
create or replace function personal_data_status(p_restaurant uuid)
returns table (
  retention_days   int,
  total_records    bigint,
  expired_pending  bigint,
  anonymized_count bigint,
  oldest_record    date
)
language sql
stable
as $$
  with s as (
    select coalesce(kvkk_retention_days, 365) as days
    from restaurant_settings where restaurant_id = p_restaurant
  ),
  d as (select coalesce((select days from s), 365) as days)
  select (select days from d)::int,
         count(*),
         count(*) filter (
           where r.anonymized_at is null
             and r.reserved_at < now() - ((select days from d) || ' days')::interval
         ),
         count(*) filter (where r.anonymized_at is not null),
         min((r.reserved_at at time zone 'Europe/Istanbul')::date)
  from reservations r
  where r.restaurant_id = p_restaurant and r.deleted_at is null;
$$;

-- Süresi dolanları anonimleştir. Geri alınamaz; Ayarlar'dan açık onayla çağrılır.
create or replace function anonymize_expired_personal_data(p_restaurant uuid)
returns int
language plpgsql
as $$
declare
  v_days int;
  v_count int;
begin
  select coalesce(kvkk_retention_days, 365) into v_days
  from restaurant_settings where restaurant_id = p_restaurant;
  v_days := coalesce(v_days, 365);

  with hedef as (
    select id from reservations
    where restaurant_id = p_restaurant
      and deleted_at is null
      and anonymized_at is null
      and reserved_at < now() - (v_days || ' days')::interval
  )
  update reservations r
  set guest_name = 'Anonimleştirildi',
      guest_phone = null,
      note = null,
      anonymized_at = now()
  from hedef h
  where r.id = h.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Örnek aydınlatma metni — hukuki danışmanlıkla kontrol edilmesi gereken bir ŞABLONDUR.
-- İşletmeci Ayarlar'dan kendi metnini yazar; boş bırakılırsa arayüzde uyarı çıkar.
update restaurant_settings
set kvkk_notice = 'KİŞİSEL VERİLERİN KORUNMASI HAKKINDA AYDINLATMA

Rezervasyon ve sipariş işlemleriniz sırasında paylaştığınız ad, soyad ve telefon
numarası bilgileriniz; 6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında,
işletmemiz tarafından yalnızca rezervasyonunuzun oluşturulması, size ulaşılabilmesi
ve siparişinizin hazırlanması amacıyla işlenmektedir.

Bilgileriniz bu amaçlar dışında kullanılmaz, üçüncü kişilerle paylaşılmaz ve yasal
saklama süresi sonunda anonim hâle getirilir.

Kanunun 11. maddesi uyarınca kişisel verilerinize erişme, düzeltilmesini veya
silinmesini isteme haklarına sahipsiniz. Taleplerinizi işletmemize iletebilirsiniz.'
where kvkk_notice is null;
