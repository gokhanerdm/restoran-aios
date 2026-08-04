-- Rezervasyon programının kendi ayar ekranı (Gökhan onayı, 2026-08-04).
--
-- Program artık AIOS'tan ayrı satılacak, dolayısıyla ayarlarını da kendi ekranından
-- yönetmeli. Gereken alanların çoğu zaten var ve aynen kullanılıyor:
--   restaurant_settings.opening_hours      -> haftalık çalışma saatleri + kapalı gün
--   restaurant_settings.evening_start_hour -> öğle/akşam dönem sınırı
--   restaurant_settings.kvkk_notice        -> aydınlatma metni
--   restaurants.name / phone / address     -> işletme bilgileri (misafir sayfasında görünür)
--   restaurant_tables / dining_areas       -> masalar ve salonlar
--
-- Eksik olan tek şey varsayılan oturma süresiydi: reservations.duration_minutes'ın
-- varsayılanı tabloya 90 diye gömülüydü, işletme değiştiremiyordu. Masa devri hesabı
-- (aynı masaya ikinci servis) bu süreye dayanacağı için ayarlanabilir olması şart.
alter table restaurant_settings
  add column if not exists default_duration_minutes int not null default 90
  check (default_duration_minutes between 15 and 600);

comment on column restaurant_settings.default_duration_minutes is
  'Yeni rezervasyonun varsayılan oturma süresi (dakika). Masa devri hesabının temeli.';
