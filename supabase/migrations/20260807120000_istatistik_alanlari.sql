-- İSTATİSTİKLER sayfası için ön koşul alanlar (Gökhan, 2026-08-07):
-- 1) created_by — rezervasyonu kim aldı, oturumdan otomatik (elle seçim yok).
-- 2) iletisim_kanali — kanal bazlı rapor için Telefon/WhatsApp/Instagram/Google/Yüz yüze/
--    Online/Diğer ayrımı. "source" (rezervasyon/kapi/online) zaten var ama personel telefonla
--    girdiğinde HANGİ mecradan geldiğini ayırt etmiyordu — kapı ve online için otomatik
--    dolduruluyor (soru sorulmaz), sadece personel eliyle girerken sorulur.
alter table reservations add column if not exists created_by uuid references auth.users(id);
alter table reservations add column if not exists iletisim_kanali text;

-- Var olan kayıtları makul varsayılanla doldur — geriye dönük raporlarda boş kalmasın.
update reservations set iletisim_kanali = case
  when source = 'kapi' then 'yuz_yuze'
  when source = 'online' then 'online'
  else 'telefon'
end
where iletisim_kanali is null;
