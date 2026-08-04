-- Salon ölçeklendirme (Gökhan, 2026-08-04: "programın verdiğim ölçülere göre masaları da
-- aynı oranda küçültmesini istiyorum... salonun gerçek oturumunu minyatürde görmek").
-- Santim cinsinden, isteğe bağlı — girilmezse eski davranış (otomatik büyüyen tuval) sürer.
alter table dining_areas add column if not exists genislik_cm numeric;
alter table dining_areas add column if not exists derinlik_cm numeric;
