-- Koltuk kapasitesi — RevPASH ve koltuk devir hızının ön koşulu.
--
-- RevPASH (Revenue Per Available Seat Hour), restoran verimliliğinin standart ölçüsüdür:
-- ciroyu masaya değil, "kaç koltuk kaç saat açık kaldı" tabanına böler. Ciro aynı kalsa bile
-- RevPASH düşüyorsa masalar boş oturuyor ya da devir yavaşlıyor demektir. Saatlik yoğunluk
-- grafiği "ne zaman kalabalık" der; RevPASH "kapasiteni ne kadar kullanıyorsun" der.
--
-- Varsayılan 4: Türkiye'de restoran masalarının tipik oturma düzeni. İşletmeci masaya
-- sağ tıklayıp kendi kapasitesini girer.
alter table restaurant_tables add column if not exists seat_count int not null default 4
  check (seat_count > 0 and seat_count <= 50);
