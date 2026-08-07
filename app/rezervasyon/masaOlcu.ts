// Masa gövde ölçüleri — TEK kaynak. Hem Salon ekranı çizerken hem de planlayıcı birleşen
// masaları yan yana koyarken aynı ölçüyü kullanmalı; iki yerde ayrı hesap tutulursa masalar
// planda üst üste ya da aralıklı çıkar.
//
// Ölçüler gerçek santim: 2 kişilik kare ~70cm, 4 kişilik dikdörtgen 120x70 gibi yaygın
// değerler. Piksele PX_PER_CM ile çevriliyor ki büyük masa küçükten GERÇEKTEN büyük görünsün.

export type Shape = "yuvarlak" | "kare" | "dikdortgen" | "loca";

export const PX_PER_CM = 0.8;
// Salon planında masanın sürükleme kutusu — gövde bunun ortasında çizilir. Konum (position_x)
// bu kutunun sol kenarıdır, o yüzden sağ sınır hesabında kutu genişliği kullanılır.
export const BOX_W = 148;
export const BOX_H = 108;
export const KOLTUK_SECENEKLERI = [2, 4, 6, 8];
export const MIN_GOVDE_PX = 46;

export const CM_OLCU: Record<Shape, Record<number, { w: number; h: number }>> = {
  yuvarlak: { 2: { w: 70, h: 70 }, 4: { w: 90, h: 90 }, 6: { w: 150, h: 150 }, 8: { w: 180, h: 180 } },
  kare: { 2: { w: 70, h: 70 }, 4: { w: 90, h: 90 }, 6: { w: 110, h: 110 }, 8: { w: 140, h: 140 } },
  loca: { 2: { w: 110, h: 90 }, 4: { w: 150, h: 110 }, 6: { w: 190, h: 120 }, 8: { w: 230, h: 130 } },
  dikdortgen: { 2: { w: 70, h: 60 }, 4: { w: 120, h: 70 }, 6: { w: 180, h: 70 }, 8: { w: 220, h: 70 } },
};

// En yakın tanımlı kişi sayısına yuvarlar — 2/4/6/8 arası serbest sayı da girilebiliyor
// (ör. 5 kişilik masa 4'ün ölçüsünü kullanır, tam santim hassasiyeti önemli değil).
export const enYakinKoltuk = (seats: number) =>
  KOLTUK_SECENEKLERI.reduce((a, b) => (Math.abs(b - seats) < Math.abs(a - seats) ? b : a));

// İşletmeye özel ölçü (Ayarlar > masa ölçüleri) girilmişse varsayılanın yerine geçer.
export type MasaOlcusu = { shape: Shape; seat_tier: number; width_cm: number; height_cm: number };

export const govdeOlcusu = (shape: Shape, seats: number, ozelOlculer: MasaOlcusu[] = []): { width: number; height: number } => {
  const tier = enYakinKoltuk(seats);
  const ozel = ozelOlculer.find((o) => o.shape === shape && o.seat_tier === tier);
  const cm = ozel ? { w: ozel.width_cm, h: ozel.height_cm } : CM_OLCU[shape][tier];
  return {
    width: Math.max(MIN_GOVDE_PX, Math.round(cm.w * PX_PER_CM)),
    height: Math.max(MIN_GOVDE_PX, Math.round(cm.h * PX_PER_CM)),
  };
};

// Dikdörtgen masa çevrilmişse en/boy yer değiştirir.
export const govdeCizim = (shape: Shape, seats: number, rotated: boolean, ozelOlculer: MasaOlcusu[] = []) => {
  const o = govdeOlcusu(shape, seats, ozelOlculer);
  return shape === "dikdortgen" && rotated ? { width: o.height, height: o.width } : o;
};
