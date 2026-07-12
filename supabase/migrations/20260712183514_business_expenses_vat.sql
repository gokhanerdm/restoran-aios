-- Sabit giderler artık KDV dahil tutar + KDV oranı ile girilir; KDV hariç tutar hesaplanır (Gökhan onayı, 2026-07-12).
-- monthly_amount bundan sonra KDV DAHİL tutar anlamına gelir (önceki kayıtlar dokunulmadan aynı kalır).

alter table business_expenses add column vat_rate numeric(5,2) not null default 20;
