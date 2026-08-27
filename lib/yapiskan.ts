// Yapışkan başlık merdiveni (No63'ten, 2026-08-27'de AIOS'a alındı).
//
// Açık olan akordiyonun başlığı ekranın üstüne yapışıyor; onun içinde başka bir
// akordiyon açıksa o da bir basamak aşağıya yapışıyor. Böylece aşağı kaydırırken
// baktığın bilginin hangi başlığın altında olduğu hep görünür kalıyor
// (Gökhan, 2026-08-16).
//
// Seviye 1: sayfanın ana bölümü (Ayarlar'daki bir kutu)
// Seviye 2: bölümün içindeki kutu (bir personel, bir kategori)
// Seviye 3: kutunun içindeki akordiyon (bir kaydın ayrıntısı)
//
// Basamak yüksekliği bütün başlıklarda aynı: 44 piksel. Sayfa gövdesinin üst
// boşluğu (14) çıkarılıyor ki en üstteki başlık kenara tam otursun, üstünde
// içerik akan bir şerit kalmasın. Başka bir kaydırma alanının içindeyken o
// alanın kendi üst boşluğu veriliyor.
const BASLIK_YUKSEKLIGI = 44;
const GOVDE_UST_BOSLUGU = 14;

export function yapiskanBaslik(seviye: 1 | 2 | 3, ustBosluk = GOVDE_UST_BOSLUGU) {
  return {
    position: "sticky" as const,
    top: (seviye - 1) * BASLIK_YUKSEKLIGI - ustBosluk,
    // Üstteki başlık alttakinin üzerinde kalıyor.
    zIndex: 5 - seviye,
    // Zemin şart: arkadan içerik akmasın. Başlığın KENDİ kenarlığı ve köşe
    // yuvarlaması yok — çerçeveyi kutu çiziyor. Başlığa ayrıca çerçeve
    // verilince kutununkiyle üst üste biniyor ve köşede aralık kalıyor.
    background: "var(--card)",
    borderBottom: "1px solid var(--line)",
  };
}
