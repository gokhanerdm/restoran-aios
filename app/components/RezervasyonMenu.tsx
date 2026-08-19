"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { LogOut, BarChart3, LayoutGrid, Settings, Users } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

// SOL MENÜNÜN BAŞLIĞI VE ALT GEÇİŞLERİ (Gökhan, 2026-08-15: "salon sayfasını da rezervasyon
// sayfası gibi yap, soldaki butonları sol alta al, işletme ismi ve sayfa ismini aynı boyutlara
// getir"). Rezervasyon listesindeki sol menüyle birebir aynı ölçüler — üst bar kalkınca
// ekranın tepesi asıl işe (salon planına) kalıyor.
const navBtn: React.CSSProperties = { all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: 6, borderRadius: 8, color: "var(--muted)" };

// Menü düğmeleri. "sayfa" alanı Ayarlar'daki rol yetkileriyle eşleşiyor: rolün o sayfası
// işaretli değilse düğme hiç çizilmiyor (Gökhan, 2026-08-17: "kimin hangi sayfayı görüp
// göremeyeceğine ayarlarda işletme karar versin").
const NAV = [
  { href: "/rezervasyon/istatistikler", label: "İstatistikler", sayfa: "istatistik", icon: <BarChart3 size={19} /> },
  { href: "/rezervasyon/salon", label: "Salon", sayfa: "salon", icon: <LayoutGrid size={19} /> },
  { href: "/rezervasyon/posta", label: "Posta", sayfa: "posta", icon: <Users size={19} /> },
  { href: "/rezervasyon/ayarlar", label: "Ayarlar", sayfa: "ayarlar", icon: <Settings size={19} /> },
];

/**
 * Giriş yapanın görebileceği sayfalar. İşletme sahibi hepsini görür; personel rolüne göre
 * görür. Cevap gelene kadar hiçbir düğme çizilmiyor — yetkisiz düğmenin bir an görünüp
 * kaybolması kötü duruyor.
 */
export function useGorunurSayfalar() {
  const [sayfalar, setSayfalar] = useState<string[] | null>(null);
  useEffect(() => {
    let acik = true;
    supabase.rpc("gorebildigim_sayfalar").then(({ data }) => {
      if (acik) setSayfalar((data as string[] | null) ?? []);
    });
    return () => { acik = false; };
  }, []);
  return sayfalar;
}

/**
 * Giriş yapanın rolü. Sayfa yetkileri (yukarıdaki liste) işletmenin ayarlarından geliyor;
 * bu ise kişinin rolünün kendisi — "Akış" gibi tek bir role ait ekranlar buna bakıyor
 * (Gökhan, 2026-08-18: "akış sadece mutfak şefi için"). İşletme sahibinde personel kaydı
 * olmadığı için boş string döner; cevap gelene kadar null.
 */
export function useRolum() {
  const [rol, setRol] = useState<string | null>(null);
  useEffect(() => {
    let acik = true;
    supabase.rpc("personel_rolum").then(({ data }) => {
      if (!acik) return;
      const kayit = (data as { rol: string; durum: string }[] | null)?.[0];
      setRol(kayit && kayit.durum === "onayli" ? kayit.rol : "");
    });
    return () => { acik = false; };
  }, []);
  return rol;
}

/** Menünün tepesi: RZV rozeti + işletme adı + sayfa adı. dar=true ise sadece rozet. */
export function MenuBaslik({ restaurantId, sayfaBaslik, dar, altYazi }: {
  restaurantId: string | null; sayfaBaslik: string; dar?: boolean; altYazi?: React.ReactNode;
}) {
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

  if (dar) return <RzvRozet />;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
      <RzvRozet />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isim || "Rezerve"}
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--muted)", lineHeight: 1.2, marginTop: 2 }}>{sayfaBaslik}</div>
        {altYazi}
      </div>
    </div>
  );
}

// RZV rozeti — rezervasyon listesine döner. Geçiş satırının ilk düğmesi (Gökhan, 2026-08-15:
// "dört butonun yanına rzv butonunu da koy, beş buton olsun yan yana").
export function RzvRozet() {
  return (
    <Link
      href="/rezervasyon" aria-label="Rezervasyonlar" title="Rezervasyonlar"
      style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--brand)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 9.5, letterSpacing: 0.3, flexShrink: 0, textDecoration: "none" }}
    >
      RZV
    </Link>
  );
}

/** Menünün altı: İstatistikler / Salon / Ayarlar / Çıkış. dikey=true ise alt alta (dar menü). */
export function MenuNav({ dikey }: { dikey?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const gorunur = useGorunurSayfalar();
  const cikisYap = async () => {
    await supabase.auth.signOut();
    router.replace("/rezervasyon/giris");
  };
  return (
    <div style={{
      display: "flex", flexDirection: dikey ? "column" : "row", alignItems: "center",
      justifyContent: dikey ? "flex-start" : "space-around", gap: dikey ? 4 : 0, flexShrink: 0,
    }}>
      <RzvRozet />
      {NAV.filter((it) => gorunur === null || gorunur.includes(it.sayfa)).map((it) => {
        const aktif = pathname.startsWith(it.href);
        return (
          <Link
            key={it.href} href={it.href} aria-label={it.label} title={it.label}
            // Dar menüde (40px) yan dolgu kısılıyor, yoksa simgeler kenardan taşıyor.
            style={{ ...navBtn, padding: dikey ? 4 : 6, textDecoration: "none", color: aktif ? "var(--brand)" : "var(--muted)" }}
          >
            {it.icon}
          </Link>
        );
      })}
      <button onClick={cikisYap} aria-label="Çıkış yap" title="Çıkış yap" style={{ ...navBtn, padding: dikey ? 4 : 6 }}>
        <LogOut size={19} />
      </button>
    </div>
  );
}
