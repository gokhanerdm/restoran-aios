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

export function ListHeader({ children }: { children: React.ReactNode }) {
  // Gökhan: "başlıklar ve liste arasında bir çizgi var onu kaldır" — satırlar artık kendi
  // renkli kartları olduğu için ayırıcı çizgiye gerek kalmadı.
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 0 8px", flexShrink: 0 }}>
      {children}
    </div>
  );
}

export function HeaderCell({ width, flex, align = "left", marginLeft, children }: { width?: number; flex?: boolean; align?: Align; marginLeft?: number | string; children: React.ReactNode }) {
  return (
    <span style={{
      width: flex ? undefined : width, flex: flex ? 1 : undefined, flexShrink: 0, minWidth: 0, marginLeft,
      textAlign: align, fontSize: 12.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--ink)",
    }}>
      {children}
    </span>
  );
}

// Kolon başlıkları arasına konan ince ayraç ("Zaman - Misafir - Telefon...").
export function HeaderSep() {
  return <span aria-hidden style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: "var(--line-2)" }}>–</span>;
}
// HeaderSep ile AYNI genişlikte ama görünmez — satırlarda kolonlar başlıklarla hizalı
// kalsın diye (ayraç sadece başlıkta görünür, hizalamayı bozmadan).
export function RowSep() {
  return <span aria-hidden style={{ visibility: "hidden", flexShrink: 0, fontSize: 12.5, fontWeight: 700 }}>–</span>;
}

// Gökhan (2026-08-01): "satırların köşeleri oval olsun, her duruma bir renk verelim" —
// eski sık/bitişik liste görünümünden, her satırın kendi durumuna göre renkli, yuvarlak
// köşeli bir "kart" olduğu daha modern bir görünüme geçildi. Kutular şu anki genişlikten
// FAZLA yer kaplamasın diye sağ/sol padding yok (tam genişlik, diğer başlıklarla aynı hizada
// kalıyor) — sadece arka plan rengi + köşe + satırlar arası 1mm boşluk (eskiden ayıran
// çizginin yerini şimdi bu boşluk alıyor, çizgiye gerek kalmadı).
export function ListRow({ bg, muted, children }: { bg?: string; muted?: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 0", marginBottom: "1mm", boxSizing: "border-box",
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

export function ActionsCell({ width, align = "right", children }: { width?: number; align?: "right" | "center"; children: React.ReactNode }) {
  return (
    <div style={{ width, flexShrink: 0, display: "flex", gap: 6, justifyContent: align === "center" ? "center" : "flex-end", alignItems: "center" }}>
      {children}
    </div>
  );
}
