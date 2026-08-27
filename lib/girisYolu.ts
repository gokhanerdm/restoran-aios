// Giriş yolu — kişi programa HANGİ kapıdan girdi? Çıkışta aynı kapıya dönsün
// (Gökhan, 2026-08-26: Ekip'ten giren personel çıkışta işletme girişine düşüyordu).
//
// BİLEREK sıfır bağımlılık: rezervasyon modülü ayrı ürün olarak kopyalanırken
// bu dosya olduğu gibi birlikte kopyalanır, başka hiçbir şeye bağlanmaz.

export type GirisKapisi = "giris" | "rezervasyon" | "ekip";

const ANAHTAR = "giris-yolu";

/** Giriş ekranları oturum açarken çağırır. */
export function girisYoluKaydet(kapi: GirisKapisi) {
  try { localStorage.setItem(ANAHTAR, kapi); } catch {}
}

/** Çıkış düğmeleri kişiyi bu adrese döndürür. Kayıt yoksa çağıranın varsayılanı. */
export function cikisAdresi(varsayilan: string = "/rezervasyon/giris"): string {
  try {
    const k = localStorage.getItem(ANAHTAR);
    if (k === "ekip") return "/ekip";
    if (k === "giris") return "/giris";
    if (k === "rezervasyon") return "/rezervasyon/giris";
  } catch {}
  return varsayilan;
}
