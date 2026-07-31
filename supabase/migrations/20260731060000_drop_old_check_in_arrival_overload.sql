-- Onceki migration (20260731050000) check_in_arrival'a p_guest_phone/p_note ekledi ama
-- "create or replace" farkli parametre listesini AYNI fonksiyon saymadigi icin eskisini
-- degistirmek yerine yanina ikinci bir asiri yuklenmis (overload) surum ekledi. Sonuc: 3
-- parametreyle cagrilinca (add_valet_entry'nin ic cagrisi gibi) Postgres hangisini
-- kastettigimizi ayirt edemiyor - "is not unique" hatasi (Gokhan canli testte yakaladi).
-- Eski 3 parametreli surumu siliyoruz, tek gecerli fonksiyon 5 parametreli (defaultlu) kalsin.
drop function if exists check_in_arrival(uuid, text, int);
