"use client";

// Ortak liste satırı — PAGE_STANDARDS #3 ("satır tabanlı liste, kart yığını değil") için
// TEK bir kalıp: sabit genişlikli hücreler + esneyen bir "ana" hücre + sağda işlemler.
// Farklı ekranlarda (Karşılama, Vale, ileride Personel/Stok) veri farklı olsa da dilimler
// hep bu üçlüden kurulur: ListHeader (kolon adları, bir kez) + ListRow + ListCell (her dilim).
//
// Kolonlar birbirine yakın/sıkı durur (küçük sabit aralık); tek esnek boşluk (Spacer)
// sadece en sona, son kolonu (genelde durum/işlem) sağa iterken kullanılır — Gökhan:
// "sütunları sağa kaydır, aralarda aşırı boşluk olmasın, sadece durum olduğu yerde kalsın."

type Align = "left" | "right" | "center";

// gap: kolonlar arası boşluk. Sütun aralarını ayraçların kendi genişliğiyle veren ekranlar
// (rezervasyon listesi) 0 verir — böylece kolonun yeri sadece genişliğiyle belirlenir.
export function ListHeader({ gap = 10, children }: { gap?: number; children: React.ReactNode }) {
  // Gökhan: "başlıklar ve liste arasında bir çizgi var onu kaldır" — satırlar artık kendi
  // renkli kartları olduğu için ayırıcı çizgiye gerek kalmadı.
  return (
    <div style={{ display: "flex", alignItems: "center", gap, padding: "0 0 8px", flexShrink: 0 }}>
      {children}
    </div>
  );
}

// paddingRight: sağa yaslı başlıklarda kenar boşluğu — altındaki düğmelerle aynı hizada
// dursun diye (Gökhan, 2026-08-18).
export function HeaderCell({ width, flex, align = "left", marginLeft, paddingRight, paddingLeft, children }: { width?: number; flex?: boolean; align?: Align; marginLeft?: number | string; paddingRight?: number | string; paddingLeft?: number | string; children: React.ReactNode }) {
  return (
    <span style={{
      width: flex ? undefined : width, flex: flex ? 1 : undefined, flexShrink: 0, minWidth: 0, marginLeft,
      boxSizing: "border-box", paddingRight, paddingLeft,
      textAlign: align, fontSize: 12.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--ink)",
    }}>
      {children}
    </span>
  );
}

// Kolon başlıkları arasına konan ince ayraç ("Zaman – Misafir – Telefon...").
// genislik verilirse ayraç o genişlikte bir yuva olur ve çizgi yuvanın tam ortasına oturur —
// yani iki kolonun tam arasına (Gökhan, 2026-08-18: "başlık arası çizgileri doğru yerlerine
// koy"). Kolonların yeri kaydıkça çizgi de onlarla birlikte gider, ayrıca ayar gerekmez.
export function HeaderSep({ genislik }: { genislik?: number }) {
  return (
    <span aria-hidden style={{ flexShrink: 0, width: genislik, textAlign: "center", fontSize: 12.5, fontWeight: 700, color: "var(--line-2)" }}>–</span>
  );
}
// HeaderSep ile AYNI genişlikte ama görünmez — satırlarda kolonlar başlıklarla hizalı
// kalsın diye (ayraç sadece başlıkta görünür, hizalamayı bozmadan).
export function RowSep({ genislik }: { genislik?: number }) {
  return <span aria-hidden style={{ visibility: "hidden", flexShrink: 0, width: genislik, fontSize: 12.5, fontWeight: 700 }}>–</span>;
}

// Gökhan (2026-08-01): "satırların köşeleri oval olsun, her duruma bir renk verelim" —
// eski sık/bitişik liste görünümünden, her satırın kendi durumuna göre renkli, yuvarlak
// köşeli bir "kart" olduğu daha modern bir görünüme geçildi. Kutular şu anki genişlikten
// FAZLA yer kaplamasın diye sağ/sol padding yok (tam genişlik, diğer başlıklarla aynı hizada
// kalıyor) — sadece arka plan rengi + köşe + satırlar arası 1mm boşluk (eskiden ayıran
// çizginin yerini şimdi bu boşluk alıyor, çizgiye gerek kalmadı).
// yukseklik: varsayılan 44. Çok satırlı çizelgelerde (İstatistikler) satırlar inceltilip
// ekrana sığdırılabilsin diye dışarıdan verilebiliyor (Gökhan, 2026-08-12).
export function ListRow({ bg, muted, yukseklik = 44, gap = 10, children }: { bg?: string; muted?: boolean; yukseklik?: number; gap?: number; children: React.ReactNode }) {
  // Yükseklik içerikten (buton mu düz yazı mı) bağımsız, SABİT — kenarlık/satır yüksekliği
  // farkı yüzünden padding'i ne kadar inceltirsem inceltim buton içeren satırlar hep birkaç
  // piksel kalın kalıyordu (Gökhan: "hâlâ düzelmedi, aynı yükseklikte değil"). Sabit yükseklik
  // + ortalanmış içerik bunu kesin çözer — hepsi tam aynı boyda.
  return (
    <div style={{
      display: "flex", alignItems: "center", gap, height: yukseklik, marginBottom: "1mm", boxSizing: "border-box", overflow: "hidden",
      opacity: muted ? 0.5 : 1,
      background: bg ?? "var(--recede)",
      borderRadius: 10,
    }}>
      {children}
    </div>
  );
}

export function Cell({ width, flex, align = "left", marginLeft, children }: { width?: number; flex?: boolean; align?: Align; marginLeft?: number | string; children: React.ReactNode }) {
  return (
    <div style={{ width: flex ? undefined : width, flex: flex ? 1 : undefined, flexShrink: 0, minWidth: 0, textAlign: align, marginLeft }}>
      {children}
    </div>
  );
}

// Tek esnek boşluk — kolonları sola sıkıştırıp geri kalan tüm alanı burada toplar,
// böylece bir sonraki (sabit genişlikli) kolon satırın sağına itilmiş olur.
export function Spacer() {
  return <div style={{ flex: 1 }} />;
}

// gap: düğmeler arası boşluk. Rezervasyon listesinde durum düğmeleri bitişik isteniyor
// (Gökhan, 2026-08-18: "birbirine değsin, aralarında boşluk kalmasın") — orada 0 veriliyor.
// paddingRight: sağa yaslı düğmelerin satır kenarına bırakacağı boşluk (Gökhan, 2026-08-18:
// "en sağa yanaştır ama kutunun sonu ile aralarında 7 mm olsun").
export function ActionsCell({ width, align = "right", gap = 6, paddingRight, children }: { width?: number; align?: "right" | "center"; gap?: number; paddingRight?: number | string; children: React.ReactNode }) {
  return (
    <div style={{ width, flexShrink: 0, boxSizing: "border-box", paddingRight, display: "flex", gap, justifyContent: align === "center" ? "center" : "flex-end", alignItems: "center" }}>
      {children}
    </div>
  );
}
