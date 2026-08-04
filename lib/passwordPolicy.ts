// Rezervasyon programının güçlü parola standardı — kayıt VE şifre sıfırlama ekranı
// aynı kuralı kullanıyor (Gökhan, 2026-08-04). Kabul gören yaygın kural: en az 8
// karakter, büyük harf, küçük harf, rakam, sembol.
export const SIFRE_KURALLARI: { label: string; test: (pw: string) => boolean }[] = [
  { label: "8+ karakter", test: (pw) => pw.length >= 8 },
  { label: "Büyük harf", test: (pw) => /[A-ZÇĞİÖŞÜ]/.test(pw) },
  { label: "Küçük harf", test: (pw) => /[a-zçğıöşü]/.test(pw) },
  { label: "Rakam", test: (pw) => /[0-9]/.test(pw) },
  { label: "Sembol", test: (pw) => /[^A-Za-zÇĞİÖŞÜçğıöşü0-9]/.test(pw) },
];

export const sifreGecerliMi = (pw: string) => SIFRE_KURALLARI.every((k) => k.test(pw));

// "Güçlü şifre öner" — SIFRE_KURALLARI'ndaki her kuraldan en az bir karakter garanti edip
// geri kalanı rastgele dolduruyor, sonra karıştırıyor. Okunabilirlik için karışan I/O gibi
// harfler havuzdan çıkarıldı.
export function gucluSifreOner(): string {
  const buyuk = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const kucuk = "abcdefghijkmnopqrstuvwxyz";
  const rakam = "23456789";
  const sembol = "!@#$%^&*-_=+?";
  const rastgele = (havuz: string) => havuz[Math.floor(Math.random() * havuz.length)];
  const karakterler = [rastgele(buyuk), rastgele(kucuk), rastgele(rakam), rastgele(sembol)];
  const tumHavuz = buyuk + kucuk + rakam + sembol;
  while (karakterler.length < 12) karakterler.push(rastgele(tumHavuz));
  for (let i = karakterler.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [karakterler[i], karakterler[j]] = [karakterler[j], karakterler[i]];
  }
  return karakterler.join("");
}
