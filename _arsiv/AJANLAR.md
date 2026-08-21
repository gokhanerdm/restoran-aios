# Ajan panosu — kim nerede çalışıyor

## Durum (2026-08-10)

Paralel ajan düzeni denendi, şimdilik **tek pencereye** dönüldü. Ayrı çalışma kopyaları
(ayarlar, hesap, panel, istatistikler) kaldırıldı. Salon kopyasının işi asıl projeye alındı.

| Kopya | Adres | Durum |
|---|---|---|
| Asıl proje | 3001 | Çalışılan yer |
| salon | 3002 | İşi alındı, boşta duruyor |

Yeniden birden fazla ajan açılırsa aşağıdaki kurallar geçerli.

## Kurallar

1. **Bir sayfa = bir ajan.** Her sayfanın telefon ve masaüstü hali aynı dosyada; ikisi de
   o sayfanın sahibinin işi, ayrı ajana bölünmez.
   Tek istisna: şifre sıfırlama, giriş ekranının parçası sayılıyor (Gökhan kararı).
2. Sadece kendi sahip olduğun dosyalara dokun.
3. Ortak dosya veya veritabanı değişikliği gerekiyorsa yapma — dur, söyle.
4. İş geldiğinde önce ne anladığını ve ne yapacağını özetle; Gökhan "onaylıyorum" demeden
   hiçbir şey yazma.
5. Sunucuyu sen başlatma; Gökhan başlatır.
6. Başlamadan `günaydın.md` (çalışma tarzı) ve `PAGE_STANDARDS.md` (ekran kuralları) okunur.
7. Bitince sadece "bitti" ve nereye bakılacağı yazılır.

## Kimsenin tek başına dokunamayacağı dosyalar

Bunlar bütün ekranların ortak malı; birinde yapılan değişiklik hepsini birden bozabilir.

- `app/components/` — ortak bileşenler (ListRow, EditableText, Shell, DatePicker, alt nav...)
- `lib/` — ortak yardımcılar ve Supabase bağlantıları
- `app/globals.css` — renkler ve genel görünüm
- `app/rezervasyon/masaOlcu.ts` ve `app/rezervasyon/masaPlan.ts` — salon, rezervasyon
  listesi ve rezervasyon ayarları sayfaları bu ikisini **birlikte** kullanıyor
- `supabase/migrations/` — veritabanı. Bütün kopyalar **aynı** veritabanına bakıyor;
  tablo/kolon değişikliği anında herkesi birden etkiler. Aynı anda tek ajan yazar.

## Not — brif yazarken

Ajana iş verilirken "önce ne anladığını özetle, onay almadan yazma" cümlesi **brifin içinde
açıkça** bulunmalı. `günaydın.md`'de yazıyor olması yetmiyor; brifte istenmezse atlanıyor
(2026-08-10'da bir kez atlandı).
