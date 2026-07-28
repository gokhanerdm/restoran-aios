// Türk Gıda Kodeksi Gıda Etiketleme ve Tüketicileri Bilgilendirme Yönetmeliği
// (Resmî Gazete 26.01.2017 / 29960) uyarınca menüde bildirilmesi zorunlu 14 alerjen grubu.
//
// Takvim: aynı ilde 3+ şubeli ulusal zincirlerde 1 Temmuz 2026, tüm toplu tüketim
// yerlerinde 31 Aralık 2026'dan itibaren alerjen bildirimi zorunlu. Kalori bildirimi
// 31 Aralık 2027'de zorunlu oluyor. QR menü, yönetmelikçe kabul edilen sunum yöntemi.
//
// ÖNEMLİ: `key` değerleri veritabanında ingredients.allergens ve menu_items.allergens_override
// içinde metin olarak duruyor. İlk 10'u uygulamada zaten kullanılıyordu — mevcut veriyi
// bozmamak için o etiketler birebir korundu, eksik 4 grup sona eklendi.

export type Allergen = { key: string; legal: string };

export const ALLERGENS: Allergen[] = [
  { key: "Gluten", legal: "Gluten içeren tahıllar (buğday, çavdar, arpa, yulaf)" },
  { key: "Süt", legal: "Süt ve süt ürünleri (laktoz dahil)" },
  { key: "Yumurta", legal: "Yumurta ve yumurta ürünleri" },
  { key: "Sert kabuklu", legal: "Sert kabuklu yemişler (fındık, ceviz, badem, antep fıstığı vb.)" },
  { key: "Yer fıstığı", legal: "Yer fıstığı ve yer fıstığı ürünleri" },
  { key: "Soya", legal: "Soya fasulyesi ve ürünleri" },
  { key: "Balık", legal: "Balık ve balık ürünleri" },
  { key: "Kabuklu deniz", legal: "Kabuklu deniz hayvanları (karides, yengeç, ıstakoz vb.)" },
  { key: "Susam", legal: "Susam tohumu ve ürünleri" },
  { key: "Hardal", legal: "Hardal ve hardal ürünleri" },
  // --- Yönetmelikte olup uygulamada eksik olan 4 grup (2026-07-28'de eklendi) ---
  { key: "Kereviz", legal: "Kereviz ve kereviz ürünleri" },
  { key: "Sülfit", legal: "Kükürt dioksit ve sülfitler (10 mg/kg üzeri)" },
  { key: "Acı bakla", legal: "Acı bakla (lupin) ve ürünleri" },
  { key: "Yumuşakça", legal: "Yumuşakçalar (midye, salyangoz, kalamar, ahtapot vb.)" },
];

export const ALLERGEN_KEYS = ALLERGENS.map((a) => a.key);

export const allergenLegal = (key: string) =>
  ALLERGENS.find((a) => a.key === key)?.legal ?? key;

// Mevzuat son tarihleri — uyum panelinde geri sayım için tek kaynak.
export const ALERJEN_SON_TARIH = "2026-12-31";
export const KALORI_SON_TARIH = "2027-12-31";

export function kalanGun(sonTarih: string): number {
  const bugun = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  const ms = new Date(`${sonTarih}T00:00:00+03:00`).getTime() - new Date(`${bugun}T00:00:00+03:00`).getTime();
  return Math.ceil(ms / 86400000);
}
