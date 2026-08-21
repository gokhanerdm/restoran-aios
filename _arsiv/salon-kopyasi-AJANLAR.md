# Ajan panosu — kim nerede çalışıyor

Aynı anda birden fazla ajan çalışıyor. Herkes kendi **çalışma kopyasında** oturuyor; bir
kopyada yapılan değişiklik diğerini etkilemiyor. Bu dosya kimin hangi ekranın sahibi
olduğunu gösterir — **başka ajanın sahasına girilmez.**

Panoyu komuta penceresi günceller.

## Şu anki dağılım

| Kopya | Adres | Saha | Sahibi olduğu dosyalar |
|---|---|---|---|
| Asıl proje | 3001 | QR menü + rezervasyon-yap + rezervasyon listesi | `app/m/[slug]/`, `app/rezervasyon-yap/`, `app/rezervasyon/page.tsx`, `lib/supabase/publicRestaurant.ts` |
| salon | 3002 | Salon (masa yerleşimi) | `app/rezervasyon/salon/page.tsx` |
| isletme | 3003 | Ayarlar | `app/rezervasyon/ayarlar/page.tsx` |
| istatistik | 3006 | İstatistikler | `app/rezervasyon/istatistikler/page.tsx` |
| hesap | 3004 | Giriş / hesap açma + şifre sıfırlama | `app/rezervasyon/giris/page.tsx`, `app/rezervasyon/sifre-sifirla/page.tsx` |
| panel | 3005 | Platform paneli — Gökhan'ın bütün işletmeleri gördüğü yer (sıfırdan) | `app/yonetim/` (yeni klasör, başkası açmaz) |

Her sayfanın **telefon ve masaüstü hali aynı dosyada** — ikisi de o sayfanın sahibinin işi,
ayrı ajana bölünmez. Kural: **bir sayfa = bir ajan.**

Tek istisna: şifre sıfırlama, giriş ekranının parçası sayılıyor (Gökhan kararı) — ikisi
`hesap` kopyasında birlikte.

İşletmeci paneli birden fazla sayfaya yayılacağı için tek bir ajana verilmez; sırası
gelince komuta penceresi parçalara böler, her parçayı sayfa sahibine yollar.

## Kimsenin tek başına dokunamayacağı dosyalar

Bunlar bütün ekranların ortak malı; birinde yapılan değişiklik hepsini birden bozabilir.
Değişiklik gerekiyorsa ajan **yapmaz**, durur ve komuta penceresine söyler; sıra oradan verilir.

- `app/components/` — ortak bileşenler (ListRow, EditableText, Shell, DatePicker, alt nav...)
- `lib/` — ortak yardımcılar ve Supabase bağlantıları
- `app/globals.css` — renkler ve genel görünüm
- `app/rezervasyon/masaOlcu.ts` ve `app/rezervasyon/masaPlan.ts` — salon, rezervasyon
  listesi ve rezervasyon ayarları sayfaları bu ikisini **birlikte** kullanıyor
- `supabase/migrations/` — veritabanı. Bütün kopyalar **aynı** veritabanına bakıyor;
  tablo/kolon değişikliği anında herkesi birden etkiler. Aynı anda tek ajan yazar.

## Kurallar

1. Sadece kendi sahip olduğun dosyalara dokun.
2. Ortak dosya veya veritabanı değişikliği gerekiyorsa yapma — dur, söyle.
3. İş geldiğinde önce ne anladığını ve ne yapacağını özetle; Gökhan "onaylıyorum" demeden
   hiçbir şey yazma.
4. Sunucuyu sen başlatma; Gökhan başlatır.
5. Başlamadan `günaydın.md` (çalışma tarzı) ve `PAGE_STANDARDS.md` (ekran kuralları) okunur.
6. Bitince sadece "bitti" ve nereye bakılacağı yazılır.
