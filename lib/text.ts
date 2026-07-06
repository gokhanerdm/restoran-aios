// Her ekranda ortak kural: başlıklar tamamı büyük, ürün/isim alanları kelime başı büyük.
// CapsLock fark etmez, Türkçe harfe duyarlı (i/İ, ı/I).
export const toUpperTr = (s: string) => s.trim().toLocaleUpperCase("tr-TR");

export const toTitleTr = (s: string) =>
  s
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toLocaleUpperCase("tr-TR") + w.slice(1).toLocaleLowerCase("tr-TR") : w))
    .join(" ");
