"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

// Rezervasyon üst kimlik satırı — RZV rozeti + işletme adı + Çıkış, ana rezervasyon
// sayfasındaki satırla aynı, artık her sekmede (Gökhan, 2026-08-08: "rzv işletme ismi
// çıkış satırını da bütün sekmelere taşıyalım"). RZV rozetine dokununca rezervasyon
// listesine döner.
export default function RezervasyonUstBar({ restaurantId, sayfaBaslik }: { restaurantId: string | null; sayfaBaslik?: string }) {
  const router = useRouter();
  const [isim, setIsim] = useState("");

  useEffect(() => {
    if (!restaurantId) return;
    let active = true;
    supabase.from("restaurants").select("name").eq("id", restaurantId).maybeSingle().then(({ data }) => {
      if (!active) return;
      setIsim((data as { name: string } | null)?.name ?? "");
    });
    return () => { active = false; };
  }, [restaurantId]);

  const cikisYap = async () => {
    await supabase.auth.signOut();
    router.replace("/rezervasyon/giris");
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexShrink: 0 }}>
      <Link href="/rezervasyon" aria-label="Rezervasyonlar" style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--brand)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 10.5, letterSpacing: 0.3, flexShrink: 0, textDecoration: "none" }}>
        RZV
      </Link>
      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>
        {isim || "Rezerve"}
        {sayfaBaslik && <span style={{ color: "var(--muted)", fontWeight: 500 }}> · {sayfaBaslik}</span>}
      </div>
      <div style={{ flex: 1 }} />
      <button onClick={cikisYap} aria-label="Çıkış yap" title="Çıkış yap" style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: 6, borderRadius: 8, color: "var(--muted)" }}>
        <LogOut size={19} />
      </button>
    </div>
  );
}
