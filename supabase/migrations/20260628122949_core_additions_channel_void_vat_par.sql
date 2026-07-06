-- Remote'ta uygulanmış, repoda eksikti — supabase_migrations.schema_migrations.statements'tan birebir kazandırıldı (2026-07-06).
-- Kanal: salon mu paket mi delivery mi (kâr/fire hesabı tüm kanalları kapsasın)
alter table orders add column channel text not null default 'dine_in'
  check (channel in ('dine_in', 'paket', 'yemeksepeti', 'getir', 'trendyol'));

-- İptal / ikram takibi (kaçak çoğu zaman kasada: ikram + iptal)
alter table order_items drop constraint if exists order_items_status_check;
alter table order_items add constraint order_items_status_check
  check (status in ('active', 'void', 'ikram'));
alter table order_items add column voided_by uuid references profiles(id);
alter table order_items add column void_reason text;
alter table order_items add column voided_at timestamptz;

-- KDV oranı (net kâr doğru olsun)
alter table menu_items add column vat_rate numeric(4,1) not null default 10;

-- Par level: minimum stok eşiği — Katman 2 otomatik sipariş için
alter table ingredients add column par_level numeric(12,4) not null default 0;
