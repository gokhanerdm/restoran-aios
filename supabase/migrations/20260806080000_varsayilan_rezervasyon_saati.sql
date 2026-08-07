-- Varsayılan rezervasyon saati (Gökhan, 2026-08-06).
--
-- Öğle/akşam dönem ayrımı rezervasyon programından kaldırıldı: "bu programı öncelik olarak
-- eğlence mekanlarına yapıyoruz, sadece akşamı baz alacağız." Gün artık tek havuz.
-- Yeni rezervasyon penceresi bu saatle açılır; saat geçmişse bir sonraki tam saate atlar.
-- İşletme kendi saatini yazabilsin diye ayar (Gökhan: "varsayılan saat de ayarlanabilsin").
--
-- Not: restaurant_settings.evening_start_hour silinmedi — restoran AIOS'un kendi ayarlar
-- ekranı (app/ayarlar) onu hâlâ kullanıyor, silmek orayı bozardı. Rezervasyon tarafında
-- artık hiçbir yerde okunmuyor.
alter table restaurant_settings
  add column if not exists varsayilan_rezervasyon_saati text not null default '19:00';
