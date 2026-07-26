-- Personel maliyetleri artık Personel sayfasından yönetiliyor — Ana Sayfa'daki Sabit
-- Gider'de "Personel Maaşı"/"SGK Primi" artık elle girilen kalemler değil, buradan
-- otomatik toplanan salt-okunur satırlar (Gökhan kararı, 2026-07-26).
alter table staff_members add column gross_salary numeric(10,2) not null default 0;

-- SGK işveren maliyeti = toplam brüt maaş × bu oran / 100. Oran işletmeye göre
-- değişebildiği (teşvik/indirim vb.) için sabit bir yasal yüzde varsaymıyoruz,
-- işletmeci kendi oranını Personel sayfasından girip düzenler.
alter table restaurant_settings add column sgk_employer_rate numeric(5,2) not null default 0;

-- Bu iki kalem artık Personel sayfasından otomatik hesaplandığı için mevcut
-- restoranlarda elle girilebilen eski kopyaları (varsa) arşivliyoruz — aynı gider
-- iki kere sayılmasın diye.
update business_expenses set deleted_at = now()
where name in ('Personel Maaşı', 'SGK Primi') and deleted_at is null;
