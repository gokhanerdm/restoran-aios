---
paths:
  - "app/**/*.tsx"
---

# Ekran kuralları

Yeni ekran kurarken ya da var olanı değiştirirken bunlar sorulmadan uygulanır.

## Tek ekran, scroll yok
Sayfanın kendisi kaymaz: `height: calc(100vh - ...)`, `boxSizing: border-box`. Uzun olabilecek tek kısım (liste) kendi içinde kayar.

Sık yapılan hata: kayan kutuya `overflowY: auto` yazıp `flex: 1` unutmak — kutu içeriğe göre büyür, hiç kırpılmaz, paneli ve sayfayı iter. Her kayan iç kutuda üçü birlikte olmalı: `{ flex: 1, overflowY: "auto", minHeight: 0 }`.

İkinci panel çok uzunsa az kullanılan bölümler varsayılan kapalı açılır-kapanır yapılır (bkz. Menü'deki `Section`).

İstatistikler ekranı bir gün kaydırmalı düzene geçirilip ertesi gün geri alındı (2026-08-11): "tek ekranda göreceğim bir tablo istiyorum". Onu tekrar kaydırmalı yapma.

## Her "ekle" formunda Enter
Yeni kayıt formlarındaki tüm metin ve sayı kutuları Enter'a basınca da kaydeder. `submit` tek yerde tanımlanır, tüm kutulara `onKeyDown={(e) => e.key === "Enter" && submit()}` eklenir, düğme de aynı `submit`i çağırır.

Menü, Stok ve Salonlar ekranlarında bu üç kez unutuldu — kullanıcı yazıp Enter'a basıyor, hiçbir şey olmuyor, "kaydetmiyor" sanılıyor.

## Tek Kaydet
Bir form için birden fazla Kaydet düğmesi olmaz. Kaç alan varsa tek düğme hepsini birlikte kaydeder.

## Satır tabanlı liste
Bilgiler yan yana, tek satırda (isim | tür | tedarikçi | sayı). Kart yığını kullanılmaz. Kolon adları listenin en üstünde bir kez gösterilir.

## Başlıklı/gruplu yapı
Kullanıcı kendi başlığını açar. Başlığa tıklayınca açılır ve kapanır — ayrı ekrana geçilmez, nerede olduğu hep görünür. Sürükle-bırakla sıralanır (dnd-kit, tutma koluyla).

Başlığı olmayan kayıtlar "Diğer" grubuna düşer, kaybolmaz. "Diğer"e çift tıklayıp isim verilince gerçek başlığa döner.

İçinde kayıt olan başlık silinmeden önce sorulur ("X kayıt var, silinsin mi?").

## Çift tıkla düzenleme
Ekrandaki her isim ve başlık çift tıklanınca düzenlenebilir kutuya döner (`app/components/EditableText.tsx`). Enter veya dışarı tıklama kaydeder, Escape vazgeçer. Sistemin ürettiği sahte satırlar hariç.

## Büyük/küçük harf
Başlık ve kategori adları kayıt anında tamamı BÜYÜK HARF olur. İsim alanları (ürün, malzeme, tedarikçi, kişi) Her Kelimenin İlk Harfi Büyük olur. Kullanıcı ne yazarsa yazsın kurala göre çevrilir.

Kaynak `lib/text.ts` — `toUpperTr()` ve `toTitleTr()`. Yerel kopya yazılmaz.

## Görsel kimlik
Renkler `app/globals.css` içindeki değişkenlerden alınır (`--brand`, `--ink-green`, `--canvas`, `--recede`, `--line`), hardcoded hex yazılmaz.

Sol zümrüt kabuk (`app/components/Shell.tsx`) her sayfada sabit; yeni sayfa eklenince oraya da menü bağlantısı eklenir.

Bol boşluk, ince tipografi, hap düğmeler, minimum çizgi. Para ve sayı alanlarında `className="tnum"`.

## Mobil
Her ekran hem bilgisayarda hem telefonda çalışır. Telefon testi yayın adresinden yapılır.

Müşteriye açık sayfalar (`/m/[slug]` gibi) server component olarak yazılır — JS'siz de yüklenir. Proje daha önce bu yüzden mobilde açılmama sorunu yaşadı.

## Referans sayfa
Tasarımla ilgili özel talimat yoksa referans, rezervasyon listesi sayfasıdır (`app/rezervasyon/page.tsx`, satırlar `app/components/ListRow.tsx`). Gökhan'ın "bitmiş" saydığı sayfa budur. Hizalama, boşluk, yazı boyutu gibi her küçük kararda oradaki kalıp esas alınır, yeniden icat edilmez.
