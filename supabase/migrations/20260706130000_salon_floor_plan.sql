-- Salonlar v1 (görsel kat planı) için gereken alanlar.
-- Kullanıcı onayıyla oluşturuldu (2026-07-06). Uygulanmadan önce ayrıca canlı DB onayı istenir.

-- Serbest sürükle-bırak yerleşimi (boşsa varsayılan sıralı grid — sort_order — kullanılır)
alter table restaurant_tables add column position_x numeric;
alter table restaurant_tables add column position_y numeric;

-- Basit rezervasyon notu (tarih/saat takvimi yok, sonraki faz)
alter table restaurant_tables add column reservation_note text;

-- Masa birleştirme: bu masa başka bir masaya birleştirildiyse hedef masanın id'si burada tutulur.
-- Doluysa kutuya tıklayınca hedef masanın siparişi/hesabı açılır (aynı hesap).
alter table restaurant_tables add column merged_into_table_id uuid references restaurant_tables(id);

-- Masa durumuna "rezerve" eklendi
alter table restaurant_tables drop constraint restaurant_tables_status_check;
alter table restaurant_tables add constraint restaurant_tables_status_check
  check (status in ('empty', 'occupied', 'bill_requested', 'reserved'));
