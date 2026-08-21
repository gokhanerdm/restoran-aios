---
paths:
  - "lib/**"
  - "app/components/**"
  - "app/globals.css"
  - "supabase/migrations/**"
  - "app/rezervasyon/masaOlcu.ts"
  - "app/rezervasyon/masaPlan.ts"
---

# Ortak dosyalar

Şu an açtığın dosya tek bir ekrana ait değil. Bütün ekranların ortak malı — buradaki bir değişiklik hepsini birden bozabilir.

- `app/components/` — ortak bileşenler (liste satırı, çift tıkla düzenleme, kabuk, tarih seçici)
- `lib/` — ortak yardımcılar ve veritabanı bağlantıları
- `app/globals.css` — renkler ve genel görünüm
- `supabase/migrations/` — veritabanı; değişiklik anında her yeri etkiler
- `app/rezervasyon/masaOlcu.ts` ve `masaPlan.ts` — salon, rezervasyon listesi ve rezervasyon ayarları bu ikisini **birlikte** kullanıyor; birini değiştirince diğer iki ekran bozulur

Değiştirmeden önce hangi ekranların etkilendiğine bak. İş bitince neyi etkilediğini söyle.

Yeni ortak bileşen eklerken her sayfa kendi yerine koyar; tüm ekranlara tek bir sabit katman olarak eklenmez. (2026-07-26: personel rozeti öyle kurulmuştu, üst üste binme hatası üç kez çıktı.)
