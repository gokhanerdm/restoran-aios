-- Kişi kartı derinleştirme (Gökhan, 2026-08-07): isim yazarken aday listesi, seçilince
-- REZERVASYON O KİŞİNİN ID'SİYLE devam etsin — "aynı isimli kişiler karışmaz" (telefon metni
-- değişse/silinse bile bağ kopmaz). Ayrıca doğum günü + VIP anahtarı, ve "Müdavim"/"No-show
-- riski" etiketleri için sabit kodlanmayan, ayarlardan değişebilecek eşikler.

alter table reservations add column if not exists kisi_karti_id uuid references kisi_kartlari(id);
create index if not exists idx_reservations_kisi_karti on reservations(kisi_karti_id);

alter table kisi_kartlari add column if not exists dogum_gunu date;
alter table kisi_kartlari add column if not exists vip boolean not null default false;

alter table restaurant_settings add column if not exists musteri_sadakat_ziyaret_esigi integer not null default 5;
alter table restaurant_settings add column if not exists musteri_no_show_risk_yuzde integer not null default 30;
