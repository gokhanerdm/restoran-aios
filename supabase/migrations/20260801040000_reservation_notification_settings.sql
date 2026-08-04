-- Rezervasyon SMS/WhatsApp bildirimleri — sadece TERCİH (hangi kanal, hangi bildirim açık)
-- burada, restaurant_settings'te tutulur (istemciye açık bir tablo). API anahtarı gibi GERÇEK
-- SIR asla buraya yazılmaz — o Edge Function'ın kendi ortam değişkenlerinde durur, tarayıcıya
-- hiç ulaşmaz. Sağlayıcı henüz seçilmediği için channel varsayılan 'kapali'.
alter table restaurant_settings add column if not exists notif_channel text not null default 'kapali'
  check (notif_channel in ('kapali', 'sms', 'whatsapp'));
alter table restaurant_settings add column if not exists notif_onay boolean not null default true;
alter table restaurant_settings add column if not exists notif_hatirlatma boolean not null default true;
