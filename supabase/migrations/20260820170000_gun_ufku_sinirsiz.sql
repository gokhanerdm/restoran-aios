-- GÜN UFKU SORULMUYOR (Gökhan, 2026-08-20: "isterse seneye bile rezervasyon alır, saçma,
-- kapat onu"). Kutu hem kurulumdan hem Ayarlar'dan kaldırıldı; alan duruyor ama pratikte
-- sınırsız. 0 "sınır yok" anlamına geliyordu ama online sayfada gün listesi üretmek için bir
-- sayı gerekiyor — bu yüzden 0 değil, 10 yıl yazıyoruz.
alter table public.restaurant_settings alter column rezervasyon_gun_ufku set default 3650;
update public.restaurant_settings set rezervasyon_gun_ufku = 3650 where rezervasyon_gun_ufku < 3650;
