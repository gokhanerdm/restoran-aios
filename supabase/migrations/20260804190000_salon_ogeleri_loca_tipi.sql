-- Loca eklendi ama CHECK constraint'e unutulmuştu (Gökhan: "locada koy") — kısıtı genişletiyoruz.
alter table salon_ogeleri drop constraint salon_ogeleri_type_check;
alter table salon_ogeleri add constraint salon_ogeleri_type_check
  check (type in ('duvar', 'bar', 'kolon', 'servis', 'kapi', 'loca'));
