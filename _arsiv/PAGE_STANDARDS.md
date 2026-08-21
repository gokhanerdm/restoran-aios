# Sayfa Standartları — her yeni ekranda otomatik uygulanır

Bu dosya, Gökhan'ın tekrar söylemesine gerek kalmadan her sayfada uygulanacak kuralları listeler. Yeni bir ekran (Raporlar, Personel, Ayarlar...) kurulmadan önce bu dosya okunur; kararlaştırılmış her şey baştan uygulanır.

## 1. Tek ekran, scroll yok
- Sayfa kendisi kaymaz. `height: calc(100vh - ...)`, `boxSizing: border-box`.
- Uzun olabilecek tek kısım (liste vb.) kendi içinde `overflowY: auto` ile kayar, sayfa değil.
- **Sık yapılan hata:** `flex: column` içindeki kayan kutuya sadece `overflowY: auto` yazıp `flex: 1` unutmak. `flex: 1` olmadan kutu içeriğe göre büyür, hiç kırpılmaz/kaymaz, panel de büyüyüp sayfayı iter. Her kayan iç kutuda `{ flex: 1, overflowY: "auto", minHeight: 0 }` üçlüsü birlikte olmalı.
- İkinci panel/bölge çok uzunsa (ör. ürün detayında birden fazla bölüm), az kullanılan bölümler `collapsible` (varsayılan kapalı) yapılır ki panel varsayılan halde scroll'suz sığsın (bkz. Menü'deki `Section` bileşeni).

- **İstatistikler ekranı bu kuralı denedi ve geri döndü** (Gökhan, 2026-08-11): bir gün
  "bölümler alt alta, kaydırarak gez" düzenine geçildi, ertesi gün kaldırıldı — "o kadar
  kaydırmaya sekmeye ihtiyaç yok, tek ekranda göreceğim bir tablo istiyorum". Ekran şimdi
  tek çizelge: solda ölçüler, sütunlarda Gün/Hafta/Ay + seçilen günlerin tarihleri. Kural
  burada da geçerli — bu ekranı tekrar kaydırmalı yapmayın.

## 1b. Her "ekle" formunda Enter ile kaydetme zorunlu
- Yeni kayıt ekleme mini-formlarında (ürün, malzeme, masa, başlık vb.) tüm metin/sayı input'ları **Enter'a basınca da kaydetmeli**, sadece fare ile butona tıklayınca değil.
- **Üç ayrı ekranda (Menü, Stok, Salonlar) bu unutulup aynı hata tekrarlandı** — kullanıcı yazıp Enter'a basıyor, hiçbir şey olmuyor, "kaydetmiyor" sanılıyor. Artık mimari kural: her yeni "ekle" formu yazılırken `submit` fonksiyonu tek yerde tanımlanır, tüm input'lara `onKeyDown={(e) => e.key === "Enter" && submit()}` eklenir, buton da aynı `submit`i çağırır.

## 2. Tek Kaydet mantığı
- Bir kayıt/form için birden fazla "Kaydet" butonu olmaz. Ne kadar alan varsa (fiyat, kalori, tedarikçi vb.) tek buton hepsini birlikte kaydeder.

## 3. Satır tabanlı liste, kart yığını değil
- Listelerde bilgiler yan yana, tek satırda (isim | tür | tedarikçi | sayı gibi kolonlar). Stacked kart kullanılmaz.
- Başlık satırı (kolon adları) listenin en üstünde bir kez gösterilir.

## 4. Başlıklı/gruplu yapı (Menü ve Stok gibi hiyerarşik ekranlarda)
- Kullanıcı kendi başlığını açabilir (Menü: kategori, Stok: Mutfak/Bar/Depo gibi).
- Başlığa tıklayınca aşağı doğru açılır/kapanır (accordion) — ayrı ekrana geçilmez, "nerede olduğun" hep görünür.
- Sürükle-bırak ile sıralanabilir (dnd-kit, tutma koluyla — mouse'ta tıkla-sürükle, dokunmatikte basılı tut-sürükle).
- Başlığı olmayan kayıtlar "Diğer" adlı otomatik bir gruba düşer, kaybolmaz. "Diğer" de çift tıklayıp isim verilince gerçek başlığa dönüşür (içindekiler oraya taşınır).
- Boş kategori/başlık silinmeden önce, içinde kayıt varsa uyarı sorulur ("X kayıt var, silinsin mi?").

## 5. Çift tıkla düzenleme — her isim/başlıkta
- Ekranda görünen her isim ve başlık metni çift tıklanınca düzenlenebilir input'a döner (bkz. `app/components/EditableText.tsx`, ortak bileşen).
- Enter veya dışarı tıklama = kaydet. Escape = vazgeç.
- Sistem tarafından üretilen sahte/placeholder satırlar (örn. "Diğer" ilk halinde) hariç.

## 6. Büyük/küçük harf kuralı — her metin girişinde
- **Başlık/kategori adları** (Menü kategorisi, Stok başlığı): kayıt anında tamamı **BÜYÜK HARF**e çevrilir.
- **İsim alanları** (ürün adı, malzeme adı, tedarikçi adı, kişi adı vb.): kayıt anında **Her Kelimenin İlk Harfi Büyük** olacak şekilde çevrilir.
- CapsLock açık/kapalı fark etmez, kullanıcı ne yazarsa yazsın kurala göre normalize edilir.
- Kaynak: `lib/text.ts` — `toUpperTr()` ve `toTitleTr()`. Yeni ekranlarda bu fonksiyonlar import edilir, yerel kopya yazılmaz.

## 7. Görsel kimlik (Starbucks × Apple)
- Renkler: `app/globals.css` içindeki CSS değişkenleri (`--brand`, `--ink-green`, `--canvas`, `--recede`, `--line` vb.) kullanılır, hardcoded hex yazılmaz.
- Sol zümrüt kabuk (`app/components/Shell.tsx`) her sayfada sabit, yeni sayfa eklenince oraya da menü linki eklenir.
- Bol boşluk, ince tipografi, hap (pill) butonlar, minimum çizgi/ayraç. Kart yığını yerine satır + ince çizgi ayrımı tercih edilir (bkz. madde 3).
- Para/sayı alanlarında `className="tnum"` (tabular rakam) kullanılır.

## 8. Veri ve mutasyon kuralları
- Birden fazla tabloyu etkileyen/atomik olması gereken işlemler (sipariş kapatma, stok girişi gibi) Supabase RPC ile yapılır, ayrı ayrı client insert'lerle değil.
- Basit CRUD (kategori/ürün/malzeme ekle-sil-yeniden adlandır) bu projede doğrudan client insert/update ile yapılır — bu projenin kendi geleneği, Angora'nın "her şey RPC" kuralından farklı, bilerek.
- Soft delete: `deleted_at` alanı olan tablolarda silme = `deleted_at` set etmek, gerçek DELETE değil.

## 9. Mobil + masaüstü
- Her ekran hem PC'de hem telefonda (aynı Wi-Fi, LAN IP üzerinden) test edilir.
- Müşteriye açık sayfalar (`/m/[slug]` gibi) server component olarak yazılır (JS'siz de yüklenir, hydration sorunu yaşanmaz) — bu proje daha önce bu yüzden mobilde açılmama sorunu yaşadı.

## 10. Doğrulama
- Yeni/değişen her sayfa `curl`/PowerShell ile HTTP 200 + "Module not found / Failed to compile" kontrolünden geçirilir, ekrana "hazır" denmeden önce.
- Değişmeyen diğer sayfalar da (Kasa, Menü, Gün sonu, Stok) aynı kontrolden geçirilip bozulmadığı doğrulanır.

## 11. Referans sayfa: Rezervasyon listesi
- Tasarımla ilgili özel bir talimat verilmediğinde referans **rezervasyon listesi sayfası** (`app/rezervasyon/page.tsx`, satır bileşenleri `app/components/ListRow.tsx`) olur — Gökhan'ın "bitmiş" kabul ettiği sayfa budur.
- Yazının kutu/satır içinde nereden başladığı, hizalama, boşluk, yazı boyutu gibi her küçük kararda oradaki kalıp esas alınır, yeniden icat edilmez.
- Bu, hem şu an üzerinde çalışılan sayfa hem de bundan sonra kurulacak her yeni sayfa için geçerli.

---

Bu dosya güncellenebilir — yeni bir kural kararlaştırıldığında buraya eklenir, tekrar sorulmasına gerek kalmaz.
