-- Bir masada aynı anda sadece 1 açık sipariş olabilir. "Sipariş başlat" tekrar tekrar tıklanınca
-- eskisi kapanmadan yenisi açılabiliyordu (loadOrder .maybeSingle() birden fazla satırda sessizce
-- hata veriyor, masa "sipariş başlatılamıyor" gibi görünüyordu). DB seviyesinde engelliyoruz.
create unique index idx_orders_one_open_per_table on orders(table_id) where status = 'open';
