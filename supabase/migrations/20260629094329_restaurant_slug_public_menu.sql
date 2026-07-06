-- Remote'ta uygulanmış, repoda eksikti — supabase_migrations.schema_migrations.statements'tan birebir kazandırıldı (2026-07-06).
alter table restaurants add column slug text unique;
update restaurants set slug = 'merkez' where slug is null;
