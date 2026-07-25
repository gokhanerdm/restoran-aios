-- Pişme/hazırlanma süresi (dk) — işletmeci kendi ürünleri için girer. Bir masanın tüm ürünleri
-- aynı anda çıksın diye (uzun süren önce başlar, kısa süren sonra) mutfak ekranındaki zamanlama
-- önerisinin temel verisi. Boşsa (mevcut ürünlerde varsayılan) öneri hesaplanmaz, davranış değişmez.
alter table menu_items add column prep_minutes int;
