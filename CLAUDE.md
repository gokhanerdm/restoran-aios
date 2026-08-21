@AGENTS.md

# Restoran AIOS

Restoran işletme programı. Next.js (app router), TypeScript, Supabase. Ekranlar `app/` altında her biri kendi klasöründe, ortak yardımcılar `lib/`, veritabanı `supabase/migrations/`.

İki modül ayrı ürün olarak çıkacak, şimdilik bu programın içinde duruyor: **Rezervasyon** (yayında kendi Supabase projesine kopyalanıyor) ve **Ekip** (personel uygulamasının kabuğu, `/ekip`). İkisi de programın geri kalanına bağlanmadan, sökülebilir kalacak şekilde yazılır.

## Veri
Birden fazla tabloyu etkileyen ya da atomik olması gereken işlemler (sipariş kapatma, stok girişi) Supabase RPC ile yapılır, ayrı ayrı client insert'lerle değil.

Basit CRUD (kategori/ürün/malzeme ekle, sil, yeniden adlandır) doğrudan client insert/update ile yapılır. Bu projenin kendi geleneği — Angora'daki "her şey RPC" kuralından bilerek farklı, düzeltilecek bir şey değil.

Silme, `deleted_at` alanını doldurmaktır. O alana sahip tabloda gerçek DELETE yok.

Veritabanı bütün çalışma kopyaları için ortak. Tablo veya kolon değişikliği anında her yeri etkiler.

## Kontrol
Kodu değiştirdikten sonra iş sırasında `npx tsc --noEmit` çalıştır — hatayı ilerlerken yakala, sona bırakma.

Tur bitiminde çalışan otomatik kontrol ayrı bir iştir; o son ağdır. Ona güvenip iş sırasındaki kontrolü atlama.

## Gönderim
İş bitip kontrol geçince o işin dosyaları commit'lenip push edilir, ayrıca sorulmaz. Dal `master`, Vercel oradan yayına alıyor.

`git add -A` kullanılmaz — aynı depoda ikinci bir pencere çalışıyor olabilir, onun yarım işini de süpürür. Sadece o işe ait dosyalar tek tek eklenir.

`git push --force` kullanılmaz. Gönderim öncesi `git pull --rebase`.

Her iş kendi commit'i olur, başlığı ne değiştiğini Türkçe söyler. Gün sonunda tek büyük commit yok.
