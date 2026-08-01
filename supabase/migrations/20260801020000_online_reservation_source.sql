-- Misafirin kendi kendine (girişsiz genel sayfadan) yaptığı rezervasyon üçüncü bir kaynak —
-- personelin telefonla girdiği 'rezervasyon'dan ve kapıdan doğrudan gelen 'kapi'den ayrı.
-- İstatistikte hangi kanaldan kaç rezervasyon geldiğini görebilelim diye (Gökhan).
alter table reservations drop constraint reservations_source_check;
alter table reservations add constraint reservations_source_check
  check (source in ('rezervasyon', 'kapi', 'online'));
