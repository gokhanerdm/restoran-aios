// SALON KURALLARI — TEK YER (Gökhan, 2026-08-13).
//
// "Salonların kurallarının hepsinin kendine göre olması doğru değil. Salonun kuralı olur, açılan
// her salona aynı kurallar uygulanır. Yapılan her yeni kuralı da bütün salonlara uygulanacak
// şekilde ayarla — adam her yeni üyede yeni salon kuralları ile uğraşamaz."
//
// Bu yüzden salonun DAVRANIŞI buraya toplandı. Salona özel olan tek şey odanın en/boyu; kural
// aynı, sonuç odanın ölçüsüne göre çıkıyor. Yeni bir kural buraya yazılınca bütün salonlarda,
// bütün işletmelerde kendiliğinden geçerli olur — salon salon ayar yapılmaz.
//
// Buraya BAKAN yerler: Salon ekranı (app/rezervasyon/salon/page.tsx) ve yerleşim (masaPlan.ts,
// salonDuzen.ts). Masa gövde ölçüleri masaOlcu.ts'te, yerleşim hesabı masaPlan.ts'te.

import { BOX_W, BOX_H } from "./masaOlcu";
export { AYRI_MESAFE as MASA_ARASI_MESAFE } from "./masaPlan";

/** Izgara ve tuval kenar payı (px). */
export const KENAR_PAYI = 14;

/**
 * Salonu çevreleyen yeşil çizginin kalınlığı (px). Sınır çizginin DIŞI değil İÇİdir: masa
 * çizginin üstüne bile çıkmaz (Gökhan, 2026-08-13: "yeşil salon çizgisinin üzerine de çıkmasın,
 * sınır o çizginin içi olsun"). Çizgi burada tanımlı, salon ekranı da bu kalınlıkla çiziyor —
 * biri değişirse ikisi birden değişsin diye.
 */
export const SALON_CIZGISI = 3;

/** Salon ölçüsü girilmemişken kullanılan ızgara genişliği. */
const VARSAYILAN_SUTUN = 5;

export type Govde = { width: number; height: number };

// ————————————————————————————————————————————————————————————————
// 1) YENİ MASA NEREYE KONUR
// Izgara salonun İÇİNE sığar: sütun sayısı odanın eninden, satır sayısı boyundan çıkar. Salon
// dolduğunda ızgara dışarı taşmaz, son gözde kalır — taşarsa tuval büyüyor, ekranın kenarında
// kaydırma çubuğu beliriyor ve ortalanmış salon kayıyordu.
// ————————————————————————————————————————————————————————————————
export const izgaraDuzeni = (odaEn: number | null, odaBoy: number | null) => ({
  sutun: odaEn ? Math.max(1, Math.floor((odaEn - KENAR_PAYI) / (BOX_W + KENAR_PAYI))) : VARSAYILAN_SUTUN,
  satir: odaBoy ? Math.max(1, Math.floor((odaBoy - KENAR_PAYI) / (BOX_H + KENAR_PAYI))) : 0, // 0 = sınırsız
});

export const izgaraYeri = (i: number, sutun: number, satir: number) => {
  const s = Math.floor(i / sutun);
  return {
    x: (i % sutun) * (BOX_W + KENAR_PAYI) + KENAR_PAYI,
    y: (satir > 0 ? Math.min(s, satir - 1) : s) * (BOX_H + KENAR_PAYI) + KENAR_PAYI,
  };
};

// ————————————————————————————————————————————————————————————————
// 2) MASA SALON ÇİZGİSİNİN İÇİNDE KALIR
// Sürüklerken de, çoğaltırken de, yerleşim yaparken de aynı kural. Hesap masanın GÖVDE
// kenarlarıyla yapılır; position_x sürükleme kutusunun sol kenarı, gövde kutunun ortasında.
// ————————————————————————————————————————————————————————————————
export const govdePayi = (govde: Govde) => ({ sol: (BOX_W - govde.width) / 2, ust: (BOX_H - govde.height) / 2 });

export const duvarIcinde = (x: number, y: number, govde: Govde, odaEn: number | null, odaBoy: number | null) => {
  const pay = govdePayi(govde);
  const c = SALON_CIZGISI;
  return {
    x: odaEn ? Math.min(Math.max(x, c - pay.sol), odaEn - c - govde.width - pay.sol) : Math.max(0, x),
    y: odaBoy ? Math.min(Math.max(y, c - pay.ust), odaBoy - c - govde.height - pay.ust) : Math.max(0, y),
  };
};

export const duvarIcindeMi = (x: number, y: number, govde: Govde, odaEn: number | null, odaBoy: number | null) => {
  const pay = govdePayi(govde);
  const c = SALON_CIZGISI;
  return x + pay.sol >= c && y + pay.ust >= c
    && (!odaEn || x + pay.sol + govde.width <= odaEn - c)
    && (!odaBoy || y + pay.ust + govde.height <= odaBoy - c);
};

/** Bir yöne dizilirken satır/sütun başının duvara dayandığı nokta. */
export const satirBasi = (govde: Govde, odaEn: number | null, odaBoy: number | null) => {
  const pay = govdePayi(govde);
  const c = SALON_CIZGISI;
  return {
    sol: c - pay.sol,
    sag: odaEn ? odaEn - c - govde.width - pay.sol : null,
    ust: c - pay.ust,
    alt: odaBoy ? odaBoy - c - govde.height - pay.ust : null,
  };
};

// ————————————————————————————————————————————————————————————————
// 3) EKRANDAKİ YÖN İLE PLANDAKİ YÖN
// Dikey bir salon yatay ekranda 90 derece çevrik gösteriliyor. O zaman ekranda sağa gitmek
// planda yukarı gitmek demek. Sürükleme de, çoğaltma oku da bu çeviriden geçer — kullanıcı
// hangi salonda olursa olsun gördüğü yönü alır.
// Tuval şöyle duruyor: translate(boy,0) rotate(90deg) → ekranX = boy - planY, ekranY = planX.
// ————————————————————————————————————————————————————————————————
export const ekranYonunuPlanaCevir = (dx: number, dy: number, cevir: boolean) =>
  (cevir ? { dx: dy, dy: -dx } : { dx, dy });

// ————————————————————————————————————————————————————————————————
// 4) YENİ SALON
// İlk salonun ölçüsüyle açılır. Uzun kenarı bulma, ekrana sığdırma, duvara dayanma… hepsi
// ölçüye bağlı; ölçüsüz açılan salon farklı davranıyordu. Hiç salon yoksa boş kalır, işletme
// kendi ölçüsünü girer.
// ————————————————————————————————————————————————————————————————
export type SalonOlcusu = { genislik_cm: number | null; derinlik_cm: number | null };
export const yeniSalonOlcusu = (ilkSalon: SalonOlcusu | null | undefined): SalonOlcusu => ({
  genislik_cm: ilkSalon?.genislik_cm ?? null,
  derinlik_cm: ilkSalon?.derinlik_cm ?? null,
});

// ————————————————————————————————————————————————————————————————
// 5) SALON ADI NOTTA TANINIR
// Ayrı bir kelime listesi yok: nota bir salonun adı yazılırsa program o salona yerleştirir.
// Adı doğrudan salonun kendisinden okunur (bkz. notKurallari.ts), yeni salon açılınca ya da
// adı değişince ayrıca yapılacak bir şey olmaz.
// ————————————————————————————————————————————————————————————————

