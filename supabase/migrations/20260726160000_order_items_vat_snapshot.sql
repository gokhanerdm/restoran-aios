-- Sipariş kalemi, satıldığı andaki KDV oranını kendi üzerinde saklar (unit_price'ın
-- zaten yaptığı gibi). Önceden order_items.vat_rate yoktu, raporlar menu_items'in GÜNCEL
-- oranına bakıyordu — ürünün KDV'si ileride değişirse geçmiş siparişler de yanlışlıkla
-- yeni oranla görünürdü. Mevcut kayıtlar, elimizdeki en iyi tahmin olan ürünün şu anki
-- oranıyla dolduruluyor; bundan sonrası uygulama tarafında satış anında yazılacak.
alter table order_items add column vat_rate numeric(4,1);

update order_items oi set vat_rate = mi.vat_rate
from menu_items mi
where oi.menu_item_id = mi.id and oi.vat_rate is null;

alter table order_items alter column vat_rate set default 10;
alter table order_items alter column vat_rate set not null;
