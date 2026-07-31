"use client";

// Ortak liste satırı — PAGE_STANDARDS #3 ("satır tabanlı liste, kart yığını değil") için
// TEK bir kalıp: sabit genişlikli hücreler + esneyen bir "ana" hücre + sağda işlemler.
// Farklı ekranlarda (Karşılama, Vale, ileride Personel/Stok) veri farklı olsa da dilimler
// hep bu üçlüden kurulur: ListHeader (kolon adları, bir kez) + ListRow + ListCell (her dilim).

export function ListHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 0 8px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
      {children}
    </div>
  );
}

export function HeaderCell({ width, flex, align = "left", children }: { width?: number; flex?: boolean; align?: "left" | "right"; children: React.ReactNode }) {
  return (
    <span style={{
      width: flex ? undefined : width, flex: flex ? 1 : undefined, flexShrink: 0, minWidth: 0,
      textAlign: align, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted-2)",
    }}>
      {children}
    </span>
  );
}

export function ListRow({ highlight, muted, children }: { highlight?: boolean; muted?: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--line)",
      opacity: muted ? 0.5 : 1,
      background: highlight ? "var(--danger-bg)" : "transparent",
      borderRadius: highlight ? 10 : 0, paddingLeft: highlight ? 10 : 0, paddingRight: highlight ? 10 : 0,
    }}>
      {children}
    </div>
  );
}

export function Cell({ width, flex, align = "left", children }: { width?: number; flex?: boolean; align?: "left" | "right"; children: React.ReactNode }) {
  return (
    <div style={{ width: flex ? undefined : width, flex: flex ? 1 : undefined, flexShrink: 0, minWidth: 0, textAlign: align }}>
      {children}
    </div>
  );
}

export function ActionsCell({ width, children }: { width?: number; children: React.ReactNode }) {
  return (
    <div style={{ width, flexShrink: 0, display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
      {children}
    </div>
  );
}
