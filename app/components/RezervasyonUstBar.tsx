"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { LogOut, BarChart3, LayoutGrid, Settings } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useYatayMobil } from "./RezervasyonAltNav";

// Rezervasyon üst kimlik satırı — RZV rozeti + işletme adı + Çıkış, ana rezervasyon
// sayfasındaki satırla aynı, artık her sekmede (Gökhan, 2026-08-08: "rzv işletme ismi
// çıkış satırını da bütün sekmelere taşıyalım"). RZV rozetine dokununca rezervasyon
// listesine döner.
// Rezervasyon listesindeki üst satırla birebir aynı stil (bkz. app/rezervasyon/page.tsx,
// `navBtn`) — PAGE_STANDARDS madde 11: tasarım kararları oradan kopyalanır.
const navBtn: React.CSSProperties = { all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: 6, borderRadius: 8, color: "var(--muted)" };

const NAV = [
  { href: "/rezervasyon/istatistikler", label: "İstatistikler", icon: <BarChart3 size={19} /> },
  { href: "/rezervasyon/salon", label: "Salon", icon: <LayoutGrid size={19} /> },
  { href: "/rezervasyon/ayarlar", label: "Ayarlar", icon: <Settings size={19} /> },
];

// yanIcerik: sayfaya özel küçük denetimler (İstatistikler'deki gün süzgeci gibi) bu satıra
// konabilsin diye — ekranda ayrı bir şerit açmaya değmeyen şeyler burada durur
// (Gökhan, 2026-08-12: "gün süzgecini işletme ismi sırasına alabiliriz").
export default function RezervasyonUstBar({ restaurantId, sayfaBaslik, yanIcerik }: { restaurantId: string | null; sayfaBaslik?: string; yanIcerik?: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isim, setIsim] = useState("");
  // Alt nav ile aynı eşik (860px): telefonda simgeler altta, masaüstünde burada.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const uygula = () => setIsMobile(mq.matches);
    uygula();
    mq.addEventListener("change", uygula);
    return () => mq.removeEventListener("change", uygula);
  }, []);

  useEffect(() => {
    if (!restaurantId) return;
    let active = true;
    supabase.from("restaurants").select("name").eq("id", restaurantId).maybeSingle().then(({ data }) => {
      if (!active) return;
      setIsim((data as { name: string } | null)?.name ?? "");
    });
    return () => { active = false; };
  }, [restaurantId]);

  // Telefon yan çevrildiğinde kimlik satırı hiç çizilmez — rezervasyon listesindeki kuralın
  // aynısı, salon/istatistik/ayarlar sayfalarında da geçerli (Gökhan, 2026-08-10). Kısa
  // ekranda 34 piksellik rozet + başlık satırı, asıl işi yapan ekranın yerini yiyor.
  const yatay = useYatayMobil();

  const cikisYap = async () => {
    await supabase.auth.signOut();
    router.replace("/rezervasyon/giris");
  };

  if (yatay) return null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexShrink: 0 }}>
      <Link href="/rezervasyon" aria-label="Rezervasyonlar" style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--brand)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 10.5, letterSpacing: 0.3, flexShrink: 0, textDecoration: "none" }}>
        RZV
      </Link>
      {/* İşletme adı kısalmaz; yer darsa sayfa adı kısalır (Gökhan, 2026-08-17). */}
      <div style={{ display: "flex", alignItems: "center", minWidth: 0, fontSize: 24, letterSpacing: "-0.5px", lineHeight: 1 }}>
        <span style={{ fontWeight: 600, color: "var(--ink-green)", flexShrink: 0, whiteSpace: "nowrap" }}>{isim || "Rezerve"}</span>
        {sayfaBaslik && (
          <span style={{ color: "var(--muted)", fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            &nbsp;· {sayfaBaslik}
          </span>
        )}
      </div>
      {/* Sayfaya özel denetimler başlığın hemen yanında durur (Gökhan, 2026-08-12: "gün
          butonları İstatistikler yazısı tarafında olsun") — sağdaki simgelerin yanında değil. */}
      {yanIcerik}
      <div style={{ flex: 1 }} />
      {/* İstatistikler / Salon / Ayarlar simgeleri — rezervasyon listesindeki satırın aynısı,
          aynı sıra ve aynı stil. Mobilde alt nav'a taşınmışlardı ama diğer sekmelerin üst
          barına masaüstü için hiç eklenmemişti; Salon'dayken PC'de İstatistikler'e geçmenin
          yolu kalmıyordu (Gökhan, 2026-08-10: "nava alınca webdekiler kaybolmuş"). */}
      {!isMobile && NAV.map((it) => {
        const aktif = pathname.startsWith(it.href);
        return (
          <Link
            key={it.href} href={it.href} aria-label={it.label} title={it.label}
            style={{ ...navBtn, marginTop: 2, textDecoration: "none", color: aktif ? "var(--brand)" : "var(--muted)" }}
          >
            {it.icon}
          </Link>
        );
      })}
      <button onClick={cikisYap} aria-label="Çıkış yap" title="Çıkış yap" style={{ ...navBtn, marginTop: 2 }}>
        <LogOut size={19} />
      </button>
    </div>
  );
}
