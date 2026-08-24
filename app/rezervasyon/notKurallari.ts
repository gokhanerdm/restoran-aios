// NOTA YAZILAN KELİME + SADIK MİSAFİRİN MASASI (Gökhan, 2026-08-12)
//
// İki kural bir arada, ikisi de "Yerleşim yap"a basıldığında işliyor:
//
//  1) Nota salon adı yazılırsa rezervasyon o salona yerleşir. Büyük/küçük harf ve Türkçe
//     karakter farkı yutulur — "TERAS", "teras", "Teras" hepsi aynı.
//  2) Nota "her zamanki masası" gibi bir şey yazılırsa misafirin kendi masası aranır. Ayrıca
//     notta hiçbir şey yazmasa bile SADIK misafir kendi masasına oturtulur.
//
// AYARDA LİSTE YOK (Gökhan, 2026-08-13: "notlarda salonlardan birinin ismi geçerse o salona
// yönlendirecek, bir yerlere bir şeyler yazmaya gerek kalmasın"). Salon adları zaten sistemde;
// not doğrudan onlarla karşılaştırılır. Yeni salon açılınca hiçbir şey yapılmaz, kendiliğinden
// tanınır. "Her zamanki masası" kalıpları da aşağıda gömülü — işletme hiçbir yere yazmaz.

export type Salon = { id: string; name: string };

// Karşılaştırma için sadeleştirme: Türkçe harfler düz karşılıklarına iner, hepsi küçük harf
// olur. "TERAS" ile "teras", "BAHÇE" ile "bahce" aynı sayılsın diye.
export const sadelestir = (s: string): string =>
  s
    .replace(/[İIı]/g, "i").replace(/[şŞ]/g, "s").replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u").replace(/[öÖ]/g, "o").replace(/[çÇ]/g, "c")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

// Kelime notun içinde geçiyor mu? Kelimenin başı ve sonu harf/rakam olmamalı — "terastaki"
// gibi bir kelimenin içinde tesadüfen yakalanmasın diye değil (o zaten "teras" ile başlıyor),
// asıl derdi "materas" gibi içinde geçen başka bir kelimeye takılmamak.
const HARF = /[a-z0-9]/;
export const notGeciyorMu = (not: string | null, kelime: string): boolean => {
  const n = sadelestir(not ?? "");
  const k = sadelestir(kelime);
  if (!n || !k) return false;
  let i = n.indexOf(k);
  while (i >= 0) {
    const onceki = i > 0 ? n[i - 1] : "";
    const sonraki = i + k.length < n.length ? n[i + k.length] : "";
    if (!HARF.test(onceki) && !HARF.test(sonraki)) return true;
    i = n.indexOf(k, i + 1);
  }
  return false;
};

/**
 * Notta adı geçen salon. Birden fazla salon adı geçiyorsa en uzun eşleşme kazanır — "ANA SALON"
 * ile "SALON" birlikte varsa doğru olan seçilsin.
 */
export const nottakiSalon = (not: string | null, salonlar: Salon[]): string | null => {
  const uyanlar = salonlar
    .filter((s) => s.name && notGeciyorMu(not, s.name))
    .sort((a, b) => sadelestir(b.name).length - sadelestir(a.name).length);
  return uyanlar[0]?.id ?? null;
};

/**
 * Rezervasyonun gitmesi istenen salon. İki kaynak var, ikisi de aynı ağırlıkta:
 *   - misafirin online formda seçtiği salon (tercih_alan_id)
 *   - notta geçen salon adı
 * Online seçim GARANTİ DEĞİL (Gökhan, 2026-08-15: "mümkünse") — nota salon adı yazılmış gibi
 * davranılır: o salon denenir, yer yoksa program başka salona atmaz, işletmeye sorar.
 */
export const istenenSalon = (
  r: { note: string | null; tercih_alan_id?: string | null },
  salonlar: Salon[],
): string | null => {
  const tercih = r.tercih_alan_id ?? null;
  if (tercih && salonlar.some((s) => s.id === tercih)) return tercih;
  return nottakiSalon(r.note, salonlar);
};

// ————————————————————————————————————————————————————————————————————————
// LOCA (Gökhan, 2026-08-24: "notlardaki loca kelimesini algılayacak ya da localara verilen
// isim neyse onu algılayacak")
//
// Otomatik yerleşim locaya oturtmuyor. Tek istisna: notta loca isteniyorsa. İki yol var,
// ikisi de ayara yazılmadan çalışır:
//   1) Notta "loca" kelimesi geçiyor → rezervasyon localardan yer arar.
//   2) Notta bir loca masasının KENDİ ADI geçiyor ("L1", "VIP 2") → doğrudan o masa aranır.
// Salon adı kuralındaki gibi büyük/küçük harf ve Türkçe karakter farkı yutulur.
// ————————————————————————————————————————————————————————————————————————

export type LocaMasasi = { id: string; name: string };

// TEK KARAKTERLİK ADA BAKILMAZ: locaya "1" adı verilmişse, notta geçen her "1" (saat, kişi
// sayısı, adres) locaya yönlendirir. İki karakterden kısa adlar aranmıyor.
const adAranir = (ad: string) => sadelestir(ad).length >= 2;

/** Notta loca isteniyor mu — kelimenin kendisi ya da bir loca masasının adı. */
export const nottaLoca = (not: string | null, locaMasalari: LocaMasasi[] = []): boolean =>
  notGeciyorMu(not, "loca") || locaMasalari.some((m) => m.name && adAranir(m.name) && notGeciyorMu(not, m.name));

/**
 * Notta adı geçen loca masası. Birden fazla ad geçiyorsa en uzun eşleşme kazanır — "LOCA 1"
 * ile "LOCA" birlikte varsa doğru olan seçilsin.
 */
export const nottakiLocaMasasi = (not: string | null, locaMasalari: LocaMasasi[]): string | null => {
  const uyanlar = locaMasalari
    .filter((m) => m.name && adAranir(m.name) && notGeciyorMu(not, m.name))
    .sort((a, b) => sadelestir(b.name).length - sadelestir(a.name).length);
  return uyanlar[0]?.id ?? null;
};

// "Her zamanki masası" kalıpları — programın kendi bildiği liste, ayardan gelmez.
const HER_ZAMANKI = [
  "her zamanki masa", "her zamanki masasi", "her zamanki masasina", "her zamanki yer",
  "her zamanki yeri", "her zamanki yerine", "her zamanki", "her zaman oturdugu",
  "hep oturdugu masa", "oturdugu masa", "kendi masasi", "kendi masasina",
  "alisik oldugu masa", "alistigi masa", "masasi hazir", "bildigimiz masa",
];

/** Notta "her zamanki masası" gibi bir şey yazıyor mu? */
export const nottaHerZamankiMasa = (not: string | null): boolean => {
  const n = sadelestir(not ?? "");
  return n.length > 0 && HER_ZAMANKI.some((k) => n.includes(k));
};

// ————————————————————————————————————————————————————————————————————————
// SADIK MİSAFİRİN MASASI
//
// Gökhan (2026-08-12): "iki kez gelmiş ve üçüncüye geliyorsa ya da fazlası sadıktır; geldiği
// iki seferde de aynı masaya oturduysa o masayı sevmiştir diye anlıyoruz ve o masaya alıyoruz.
// Son gelişlerinde 2 defa aynı masada oturduysa o masa olur, yoksa değişik masalarda oturduysa
// devam otomatik yerleşime."
//
// Yani: gerçekten gelmiş en az 2 ziyaret + o ziyaretlerde en az 2 kez aynı masa. Şart tutmazsa
// hiçbir şey zorlanmaz, normal yerleşim çalışır.
// ————————————————————————————————————————————————————————————————————————

export type Ziyaret = { tarih: string; masaIds: string[] };

export const SADIK_EN_AZ_ZIYARET = 2; // bu kadar gelmiş olan, bir sonrakinde sadıktır
const AYNI_MASA_EN_AZ = 2;            // o ziyaretlerin en az bu kadarında aynı masa

/**
 * Misafirin "her zamanki masası". gecmisSayisi kadar SON ziyarete bakılır (0 = hepsi).
 * En çok oturduğu masa döner; eşitlikte en son oturduğu kazanır. Şart tutmazsa null.
 */
export const herZamankiMasa = (ziyaretler: Ziyaret[], gecmisSayisi = 3): string | null => {
  const sirali = [...ziyaretler].sort((a, b) => (a.tarih < b.tarih ? 1 : a.tarih > b.tarih ? -1 : 0));
  const bakilan = gecmisSayisi > 0 ? sirali.slice(0, gecmisSayisi) : sirali;
  if (bakilan.length < SADIK_EN_AZ_ZIYARET) return null;

  const sayim = new Map<string, number>();
  const sonGorulme = new Map<string, number>();
  bakilan.forEach((z, i) => {
    // Aynı ziyarette birleştirilmiş masalar varsa her biri o ziyaret için BİR kez sayılır.
    [...new Set(z.masaIds)].forEach((id) => {
      sayim.set(id, (sayim.get(id) ?? 0) + 1);
      if (!sonGorulme.has(id)) sonGorulme.set(id, i); // liste yeniden eskiye, küçük olan yeni
    });
  });

  let enIyi: string | null = null;
  sayim.forEach((adet, id) => {
    if (adet < AYNI_MASA_EN_AZ) return;
    if (enIyi === null) { enIyi = id; return; }
    const oncekiAdet = sayim.get(enIyi) ?? 0;
    if (adet > oncekiAdet) { enIyi = id; return; }
    if (adet === oncekiAdet && (sonGorulme.get(id) ?? 0) < (sonGorulme.get(enIyi) ?? 0)) enIyi = id;
  });
  return enIyi;
};
