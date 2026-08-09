"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, BarChart3, Settings } from "lucide-react";

// Rezervasyon mobil alt nav — her /rezervasyon sayfasında aynı (Gökhan, 2026-08-08: "nav
// mobildeki her sayfada olacak ve geçişler navdan yapılacak"). Sıra: RZV, Salon,
// İstatistikler, Ayarlar. Sadece mobilde (≤860px, Adisyon'daki eşikle aynı) görünür,
// masaüstünde hiç render olmaz — kendi genişlik ölçümünü kendi yapar, sayfaların ayrı ayrı
// isMobile geçirmesine gerek yok.
//
// Taban rengi var(--rail) — AIOS'un kendi sol menü kabuğuyla (Shell.tsx) AYNI koyu yeşil
// (Gökhan, 2026-08-08: "nav taban renginin yeşil olmasını istiyorum"). İkon renkleri de
// Shell.tsx'teki aynı kalıp: koyu zemin üstünde soluk beyaz (pasif) / dolu beyaz + hafif
// beyaz vurgu (aktif) — önceki "gri/koyu yeşil" ayrımı beyaz zeminde tasarlanmıştı, koyu
// yeşil zeminde neredeyse görünmüyordu.
export const ALT_NAV_YUKSEKLIK = 58;

export default function RezervasyonAltNav() {
  const pathname = usePathname();
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  if (!isMobile) return null;

  const items = [
    { href: "/rezervasyon", label: "Rezervasyonlar", active: pathname === "/rezervasyon", icon: null },
    { href: "/rezervasyon/salon", label: "Salon", active: pathname.startsWith("/rezervasyon/salon"), icon: <LayoutGrid size={22} /> },
    { href: "/rezervasyon/istatistikler", label: "İstatistikler", active: pathname.startsWith("/rezervasyon/istatistikler"), icon: <BarChart3 size={22} /> },
    { href: "/rezervasyon/ayarlar", label: "Ayarlar", active: pathname.startsWith("/rezervasyon/ayarlar"), icon: <Settings size={22} /> },
  ];

  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, height: ALT_NAV_YUKSEKLIK, display: "flex", alignItems: "center", justifyContent: "space-around", background: "var(--rail)", zIndex: 30, boxSizing: "border-box" }}>
      {items.map((it) => (
        <Link
          key={it.href} href={it.href} aria-label={it.label} title={it.label}
          style={{
            all: "unset", cursor: "pointer", textDecoration: "none",
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 40, height: 40, borderRadius: 10,
            background: it.active ? "rgba(255,255,255,0.14)" : "transparent",
            color: it.active ? "#fff" : "rgba(255,255,255,0.45)",
          }}
        >
          {it.icon ?? (
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: it.active ? "#fff" : "rgba(255,255,255,0.45)", color: "var(--rail)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 6.5, letterSpacing: 0.2 }}>RZV</div>
          )}
        </Link>
      ))}
    </div>
  );
}
