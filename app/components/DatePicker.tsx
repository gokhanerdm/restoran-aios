"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Tarayıcının kendi native <input type="date"> takvimi yerine — o, sayfanın değil
// tarayıcının/işletim sisteminin kendi katmanı, ekranın üstünden "iniyor" ve programın
// tasarımıyla hiç uyuşmuyor. Bu bileşen aynı işi görür ama tamamen kendi görünümümüzle,
// tetikleyici butonun hemen altında (createPortal — menü kırpılmasın diye body'ye basılır).

type Props = {
  value: string; // "YYYY-MM-DD"
  onChange: (v: string) => void;
  style?: React.CSSProperties;
};

const AY_ADI = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const GUN_KISA = ["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pa"];

const parse = (v: string) => {
  const [y, m, d] = (v || "").split("-").map(Number);
  const today = new Date();
  return { y: y || today.getFullYear(), m: m || today.getMonth() + 1, d: d || today.getDate() };
};
const fmt = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
// Yıl iki hane — dar ekranda "8 Ağustos 2026" düğmeye sığmayıp üç satıra bölünüyordu
// (Gökhan, 2026-08-08: "tarihte 2026'yı 26 olarak değiştirebilirsin").
const display = (v: string) => {
  if (!v) return "Tarih seç";
  const { y, m, d } = parse(v);
  return `${d} ${AY_ADI[m - 1]} ${String(y).slice(-2)}`;
};
// Pazartesi=0 ... Pazar=6 sıralamasıyla ayın ilk gününün haftanın kaçıncı günü olduğu.
const ayinIlkGunu = (y: number, m: number) => (new Date(y, m - 1, 1).getDay() + 6) % 7;
const ayinGunSayisi = (y: number, m: number) => new Date(y, m, 0).getDate();

export default function DatePicker({ value, onChange, style }: Props) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const sel = parse(value);
  const [viewY, setViewY] = useState(sel.y);
  const [viewM, setViewM] = useState(sel.m);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc); };
  }, [open]);

  const openPicker = () => {
    const r = btnRef.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: r.left });
    const p = parse(value);
    setViewY(p.y); setViewM(p.m);
    setOpen(true);
  };

  const gecAy = (delta: number) => {
    let m = viewM + delta, y = viewY;
    if (m < 1) { m = 12; y -= 1; } else if (m > 12) { m = 1; y += 1; }
    setViewM(m); setViewY(y);
  };

  const secGun = (d: number) => { onChange(fmt(viewY, viewM, d)); setOpen(false); };

  const ilkGun = ayinIlkGunu(viewY, viewM);
  const gunSayisi = ayinGunSayisi(viewY, viewM);
  const bugun = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        style={{
          border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 12px", fontSize: 13.5,
          background: "var(--card)", color: "var(--ink)", cursor: "pointer", textAlign: "left",
          // Tarih hiçbir koşulda satırlara bölünmez — dar kutuda kelime kelime alt alta
          // düşüyordu (Gökhan, 2026-08-08: "tarih de sığmamış, 3 satır halinde duruyor").
          whiteSpace: "nowrap", flexShrink: 0,
          ...style,
        }}
      >
        {display(value)}
      </button>

      {mounted && open && createPortal(
        <div
          ref={popRef}
          style={{
            position: "fixed", top: pos.top, left: pos.left, zIndex: 1000,
            background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14,
            boxShadow: "0 8px 24px rgba(30,57,50,.15)", padding: 12, width: 240,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <button type="button" onClick={() => gecAy(-1)} aria-label="Önceki ay" style={navBtn}><ChevronLeft size={15} /></button>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)" }}>{AY_ADI[viewM - 1]} {viewY}</span>
            <button type="button" onClick={() => gecAy(1)} aria-label="Sonraki ay" style={navBtn}><ChevronRight size={15} /></button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
            {GUN_KISA.map((g) => (
              <div key={g} style={{ textAlign: "center", fontSize: 10.5, color: "var(--muted-2)", padding: "2px 0" }}>{g}</div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {Array.from({ length: ilkGun }).map((_, i) => <div key={`bos-${i}`} />)}
            {Array.from({ length: gunSayisi }).map((_, i) => {
              const d = i + 1;
              const iso = fmt(viewY, viewM, d);
              const secili = iso === value;
              const bugunMu = iso === bugun;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => secGun(d)}
                  style={{
                    all: "unset", cursor: "pointer", textAlign: "center", padding: "6px 0", borderRadius: 8,
                    fontSize: 12.5, fontWeight: secili ? 700 : 400,
                    background: secili ? "var(--brand-strong)" : "transparent",
                    color: secili ? "#fff" : bugunMu ? "var(--brand)" : "var(--ink)",
                  }}
                >
                  {d}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

const navBtn: React.CSSProperties = { all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: 4, borderRadius: 8, color: "var(--muted)" };
