// Her ekranda ortak kural: başlıklar tamamı büyük, ürün/isim alanları kelime başı büyük.
// CapsLock fark etmez, Türkçe harfe duyarlı (i/İ, ı/I).
export const toUpperTr = (s: string) => s.trim().toLocaleUpperCase("tr-TR");

// Notlar gibi serbest yazılarda sadece ilk harf büyür — kelime başı büyütmek cümleyi
// bozardı (Gökhan: "yazılarda büyük harfle başlasın").
export const ilkHarfBuyukTr = (s: string) => {
  const t = s.trim();
  return t ? t.charAt(0).toLocaleUpperCase("tr-TR") + t.slice(1) : t;
};

export const toTitleTr = (s: string) =>
  s
    .trim()
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toLocaleUpperCase("tr-TR") + w.slice(1).toLocaleLowerCase("tr-TR") : w))
    .join(" ");
