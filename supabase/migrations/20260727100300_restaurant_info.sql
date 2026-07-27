-- Ayarlar sayfası tamamlanıyor: işletme kimlik bilgileri + çalışma saatleri + arka plan tercihi.
-- (ROADMAP §K sonu: "işletme Ayarlar'dan hazır arka planlardan seçebilecek")

-- 1) İşletme kimlik bilgileri — ileride fiş/fatura basımında ve QR menüde lazım olacak.
--    Hepsi nullable: mevcut restoranlar bu alanları doldurmadan çalışmaya devam eder.
alter table restaurants add column if not exists address text;
alter table restaurants add column if not exists phone text;
alter table restaurants add column if not exists tax_office text;   -- vergi dairesi
alter table restaurants add column if not exists tax_number text;   -- vergi numarası
alter table restaurants add column if not exists logo_url text;     -- fiş/menü logosu (yükleme UI'ı sonraki adımda)

comment on column restaurants.tax_office is 'Vergi dairesi adı — fiş/fatura başlığında basılır.';
comment on column restaurants.tax_number is 'Vergi kimlik numarası / TCKN — fiş/fatura başlığında basılır.';
comment on column restaurants.logo_url is 'Fiş ve müşteri menüsünde kullanılacak logo görselinin adresi.';

-- 2) Çalışma saatleri. Gün anahtarları: pzt, sal, car, per, cum, cmt, paz.
--    Örnek: {"pzt":{"acilis":"09:00","kapanis":"23:00","kapali":false}, ...}
--    NULL = henüz girilmemiş; arayüz o durumda 09:00-23:00 varsayılanını gösterir.
alter table restaurant_settings add column if not exists opening_hours jsonb;

comment on column restaurant_settings.opening_hours is
  'Haftalık çalışma saatleri. {"pzt":{"acilis":"09:00","kapanis":"23:00","kapali":false}, "sal":{...}, "car":{...}, "per":{...}, "cum":{...}, "cmt":{...}, "paz":{...}}';

-- 3) Arka plan tercihi (ROADMAP §K). Şimdilik sadece tercih saklanıyor;
--    temanın gerçekten değişmesi ayrı bir iş.
--    Değerler: yesil_kupler (varsayılan) | duz_renk | koyu
--    NULL = hiç seçilmemiş, arayüz 'yesil_kupler' kabul eder.
alter table restaurant_settings add column if not exists background_choice text;

comment on column restaurant_settings.background_choice is
  'Seçili arka plan: yesil_kupler | duz_renk | koyu. NULL ise yesil_kupler (mevcut varsayılan) kabul edilir.';
