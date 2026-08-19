"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutGrid, BarChart3, Settings, Users, LogOut, ChefHat, ClipboardList } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useGorunurSayfalar, useRolum } from "./RezervasyonMenu";

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

// Telefon YAN çevrilmiş mi? Rezervasyon sayfalarının ortak ölçüsü — kimlik satırı, alt menü
// ve kenar boşlukları hep buna bakıyor, her sayfa kendi eşiğini uydurmasın diye tek yerde.
// Yükseklik eşiği 700: 560 iken adres çubuğu gizlenince ekran yükselip kural düşüyordu.
// Dokunmatik şartı, masaüstünde kısa pencerede yanlışlıkla açılmasını engelliyor.
export function useYatayMobil() {
  const [yatay, setYatay] = useState(false);
  useEffect(() => {
    const dokunmatik = window.matchMedia("(pointer: coarse)").matches;
    const update = () => {
      const g = window.innerWidth, y = window.innerHeight;
      setYatay(dokunmatik && g > y && y <= 700 && g <= 1100);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return yatay;
}

export default function RezervasyonAltNav() {
  const pathname = usePathname();
  const router = useRouter();
  const gorunur = useGorunurSayfalar();
  const rolum = useRolum();
  const [isMobile, setIsMobile] = useState(false);
  // Telefon YAN çevrildiğinde nav da kalkar — o hâlde ekranda sadece rezervasyon listesi
  // kalsın, 58 piksellik çubuk kısa ekranın dörtte birini yemesin (Gökhan, 2026-08-10:
  // "yan döndüğünde navda kalksın, sadece rezervasyon listesi görünsün"). Dik tutunca döner.
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
    router.replace("/rezervasyon/giris");
  };

  // Rolün göremeyeceği sayfa alt menüde de çizilmiyor (Gökhan, 2026-08-17). Sayfa anahtarları
  // Ayarlar'daki yetki tablosuyla aynı.
  const items = [
    { href: "/rezervasyon", label: "Rezervasyonlar", sayfa: "rezervasyon", active: pathname === "/rezervasyon", icon: null },
    { href: "/rezervasyon/salon", label: "Salon", sayfa: "salon", active: pathname.startsWith("/rezervasyon/salon"), icon: <LayoutGrid size={22} /> },
    // Posta artık kendi yetkisi (Gökhan, 2026-08-17: "salon ekranını görmelerine gerek yok,
    // zaten postadan görecekler") — garson, PR ve şefte salon kapalı, posta açık.
    // Tam eşleşme: /rezervasyon/postalar ayrı bir sayfa, o açıkken bu simge yanmasın.
    { href: "/rezervasyon/posta", label: "Posta", sayfa: "posta", active: pathname === "/rezervasyon/posta", icon: <Users size={22} /> },
    { href: "/rezervasyon/istatistikler", label: "İstatistikler", sayfa: "istatistik", active: pathname.startsWith("/rezervasyon/istatistikler"), icon: <BarChart3 size={22} /> },
    { href: "/rezervasyon/ayarlar", label: "Ayarlar", sayfa: "ayarlar", active: pathname.startsWith("/rezervasyon/ayarlar"), icon: <Settings size={22} /> },
  ].filter((it) => gorunur === null || gorunur.includes(it.sayfa));

  // AKIŞ — sadece mutfak şefinde çıkar (Gökhan, 2026-08-18: "akış sadece mutfak şefi için").
  // Ayarlardaki sayfa yetkileri listesinde yok; işletmenin seçimine değil, rolün kendisine
  // bağlı. Rezervasyonların hemen yanında duruyor, ikisi arasında tek dokunuşla geçiliyor.
  if (rolum === "mutfak") {
    items.splice(1, 0, {
      href: "/rezervasyon/akis", label: "Akış", sayfa: "akis",
      active: pathname.startsWith("/rezervasyon/akis"), icon: <ChefHat size={22} />,
    });
  }

  // GARSON — posta planı Salon ekranına taşındı (Gökhan, 2026-08-19: "garsonun posta ekranını
  // salona geçir"). Nav'da artık ayrı posta simgesi yok, Salon simgesi var; garson oraya
  // basınca düzenleyiciyi değil kendi posta planını görüyor. İşletmenin yetki tablosunda
  // salon kapalı olsa bile bu simge duruyor — garsonun salonu görmesi rolün kendisinden.
  if (rolum === "garson") {
    const postaSira = items.findIndex((it) => it.sayfa === "posta");
    if (postaSira >= 0) items.splice(postaSira, 1);
    if (!items.some((it) => it.sayfa === "salon")) {
      items.splice(1, 0, {
        href: "/rezervasyon/salon", label: "Salon", sayfa: "salon",
        active: pathname.startsWith("/rezervasyon/salon"), icon: <LayoutGrid size={22} />,
      });
    }
  }

  // POSTA LİSTESİ — sadece salon şefinde (Gökhan, 2026-08-18: "yeni bir sayfa açıyoruz şefe,
  // nava koyuyoruz"). Planlı ekran artık "Posta salon" adıyla sadece gösteriyor; seçme,
  // listeleme ve garson atama bu yeni sayfada. İkisi nav'da yan yana duruyor.
  if (rolum === "salon_sefi") {
    const sira = items.findIndex((it) => it.sayfa === "posta");
    if (sira >= 0) {
      items[sira] = { ...items[sira], label: "Posta salon" };
      items.splice(sira + 1, 0, {
        href: "/rezervasyon/postalar", label: "Posta", sayfa: "postalar",
        active: pathname.startsWith("/rezervasyon/postalar"), icon: <ClipboardList size={22} />,
      });
    }
  }

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
      {/* ÇIKIŞ — telefonda her sayfada navın en sağında (Gökhan, 2026-08-17). Üst barı
          olmayan ekranlarda tek çıkış yolu burası. */}
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
