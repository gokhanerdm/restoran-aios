"use client";

// Telefonda yönetim görünümünün alt çubuğu (Gökhan, 2026-08-27). Şablon:
// RezervasyonAltNav — aynı yükseklik, aynı koyu yeşil, aynı 40×40 hedefler.
//
// 5 SABİT başlık: Servis, Para, Stok, Personel, Ayarlar. Her başlık kendi
// seçim ekranını açar (/yonetim/...); sayfalar oradan seçilir. Program
// büyüdükçe yeni sayfalar bu beş başlığın seçim ekranlarına dağıtılır —
// çubuğa yeni başlık EKLENMEZ.
//
// Ana sayfa çubukta yok: Ekip'ten girince iniş ekranı o, geri tuşu ona döner.
// Sadece telefonda (≤860px) görünür; masaüstünde Shell'in sol rayı iş görür.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HandPlatter, Wallet, Package, Users, Settings, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { cikisAdresi } from "@/lib/girisYolu";
import { useYatayMobil } from "./RezervasyonAltNav";

export const YONETIM_ALT_NAV_YUKSEKLIK = 58;

// Başlık, kendi seçim ekranı VEYA altındaki bir sayfa açıkken yanar.
const BASLIKLAR: { kod: string; ad: string; href: string; icon: React.ReactNode; yollar: string[] }[] = [
  { kod: "servis", ad: "Servis", href: "/yonetim/servis", icon: <HandPlatter size={22} />, yollar: ["/yonetim/servis", "/adisyon", "/menu", "/sef"] },
  { kod: "para", ad: "Para", href: "/yonetim/para", icon: <Wallet size={22} />, yollar: ["/yonetim/para", "/kasa", "/raporlar"] },
  { kod: "stok", ad: "Stok", href: "/yonetim/stok", icon: <Package size={22} />, yollar: ["/yonetim/stok", "/stok", "/sayim"] },
  { kod: "personel", ad: "Personel", href: "/yonetim/personel", icon: <Users size={22} />, yollar: ["/yonetim/personel", "/personel", "/vardiya"] },
  { kod: "ayarlar", ad: "Ayarlar", href: "/yonetim/ayarlar", icon: <Settings size={22} />, yollar: ["/yonetim/ayarlar", "/ayarlar"] },
];

export default function YonetimAltNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobile, setIsMobile] = useState(false);
  // Telefon yan çevrilince çubuk kalkar — kısa ekranda 58 piksel yer yemesin
  // (RezervasyonAltNav'daki kuralın aynısı).
  const yatay = useYatayMobil();

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  if (!isMobile || yatay) return null;

  const cikisYap = async () => {
    await supabase.auth.signOut();
    router.replace(cikisAdresi("/giris"));
  };

  return (
    <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, height: YONETIM_ALT_NAV_YUKSEKLIK, display: "flex", alignItems: "center", justifyContent: "space-around", background: "var(--rail)", zIndex: 30, boxSizing: "border-box" }}>
      {BASLIKLAR.map((b) => {
        const aktif = b.yollar.some((y) => pathname === y || pathname.startsWith(y + "/"));
        return (
          <Link
            key={b.kod} href={b.href} aria-label={b.ad} title={b.ad}
            style={{
              all: "unset", cursor: "pointer", textDecoration: "none",
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 40, height: 40, borderRadius: 10,
              background: aktif ? "rgba(255,255,255,0.14)" : "transparent",
              color: aktif ? "#fff" : "rgba(255,255,255,0.45)",
            }}
          >
            {b.icon}
          </Link>
        );
      })}
      {/* Çıkış — üst barı olmayan telefon ekranında tek çıkış yolu burası. */}
      <button
        onClick={cikisYap} aria-label="Çıkış yap" title="Çıkış yap"
        style={{
          all: "unset", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          width: 40, height: 40, borderRadius: 10, color: "rgba(255,255,255,0.45)",
        }}
      >
        <LogOut size={22} />
      </button>
    </div>
  );
}
