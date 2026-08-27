"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { cikisAdresi } from "@/lib/girisYolu";
import YonetimAltNav, { YONETIM_ALT_NAV_YUKSEKLIK } from "./YonetimAltNav";
import {
  Home,
  LayoutGrid,
  Wallet,
  BarChart3,
  Package,
  ClipboardList,
  BookOpen,
  Users,
  Clock,
  Settings,
  LogOut,
  AlertTriangle,
} from "lucide-react";

// Adisyon = servis (salon/masa/açık hesap, hesap alma).
// Kasa = adisyon kapandıktan sonrası (nakit giriş/çıkış, sayım, gün kapatma).
// Dönemsel raporların tamamı — satış da kasa da — Raporlar'da (Gökhan kararı, 2026-07-27).
const nav = [
  { href: "/ana-sayfa", icon: Home, label: "Ana sayfa" },
  { href: "/adisyon", icon: LayoutGrid, label: "Adisyon" },
  { href: "/kasa", icon: Wallet, label: "Kasa" },
  { href: "/raporlar", icon: BarChart3, label: "Raporlar" },
  { href: "/sef", icon: AlertTriangle, label: "Şef paneli" },
  { href: "/stok", icon: Package, label: "Stok" },
  { href: "/sayim", icon: ClipboardList, label: "Sayım" },
  { href: "/menu", icon: BookOpen, label: "Menü" },
  { href: "/personel", icon: Users, label: "Personel" },
  { href: "/vardiya", icon: Clock, label: "Vardiya" },
  { href: "/ayarlar", icon: Settings, label: "Ayarlar" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  // TELEFONDA SOL RAY YOK (Gökhan, 2026-08-27): 107 piksellik ray dar ekranın
  // üçte birini yiyordu. ≤860px'te (RezervasyonAltNav'daki eşik) ray yerine
  // alttaki 5 başlıklı yönetim çubuğu (YonetimAltNav) çıkar. İlk render
  // masaüstü varsayımıyla; ölçüm gelene kadar ray çizilmez ("ray parlaması"
  // olmasın diye null'dan başlanmıyor — ray sadece isMobile false'a OTURUNCA
  // çizilse ilk karede masaüstünde titreme olurdu, bu yüzden ters mantık:
  // mobil kesinleşince ray kalkar).
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Müşteriye açık menü (QR / site embed), garson mobil sipariş modülü, mutfak/bar, vale
  // (kulübe tableti/telefon — link+PIN modeli, Gökhan 2026-07-31), REZERVASYON (2026-08-04'te
  // ayrı program oldu — /rezervasyon ve /rezervasyon-yap), EKİP (2026-08-16'da personel
  // uygulamasının kabuğu olarak ayrıldı — /ekip) ve giriş ekranının kendisi yönetim
  // kabuğunu/oturum kontrolünü kullanmaz.
  const isPublic = pathname.startsWith("/m/") || pathname.startsWith("/rezervasyon") || pathname.startsWith("/ekip") || pathname.startsWith("/garson") || pathname.startsWith("/mutfak") || pathname.startsWith("/vale") || pathname === "/giris";

  useEffect(() => {
    // isPublic ise render zaten aşağıda erken dönüyor (authChecked/hasSession hiç okunmuyor).
    if (isPublic) return;
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      if (!session) { router.replace("/giris"); return; }
      setHasSession(true);
      setAuthChecked(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/giris");
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [isPublic, router]);

  if (isPublic) return <>{children}</>;

  if (!authChecked || !hasSession) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: 13 }}>Yükleniyor…</div>;
  }

  // Çıkış, girilen kapıya döner (lib/girisYolu.ts) — Ekip'ten giren Ekip'e.
  const cikisYap = async () => { await supabase.auth.signOut(); router.replace(cikisAdresi("/giris")); };

  // Telefon: sol ray yok, altta 5 başlıklı yönetim çubuğu. İçeriğe çubuğun payı
  // kadar alt boşluk veriliyor ki son satırlar çubuğun altında kalmasın.
  if (isMobile) {
    return (
      <div style={{ minHeight: "100vh", paddingBottom: YONETIM_ALT_NAV_YUKSEKLIK, boxSizing: "border-box" }}>
        <main style={{ minWidth: 0 }}>{children}</main>
        <YonetimAltNav />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav
        style={{
          width: 107,
          background: "var(--rail)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "10px 0",
          // Sekme araları: eski 3px + Gökhan'ın istediği 2mm (CSS'te 1mm = 96/25.4px)
          gap: "calc(3px + 2mm)",
          position: "sticky",
          top: 0,
          height: "100vh",
          // 11 sekme tek ekrana sığsın diye kutular ve aralıklar daraltıldı
          // (~860px → ~650px). overflowY yine de duruyor: çok kısa ekranlarda
          // veya ileride sekme eklenirse son sekmeler kaybolmasın.
          overflowY: "auto",
        }}
      >
        <div
          style={{
            width: 53,
            height: 53,
            borderRadius: "50%",
            background: "var(--brand)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600,
            fontSize: 22,
            marginBottom: 6,
          }}
        >
          R
        </div>

        {nav.map((item) => {
          const active = item.href === pathname;
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-label={item.label}
              title={item.label}
              style={{
                width: 94,
                // Seçili sekmenin kutusu 2mm uzun ve bu boy AŞAĞIDAN YUKARI eklenir:
                // alt kenar yerinde kalır, üst kenar 2mm yukarı çıkar. marginTop:-2mm
                // eklenen boyu akıştan geri alıyor, böylece alttaki sekmeler yerinden
                // oynamaz — yoksa sayfa değiştikçe menü zıplardı.
                height: active ? "calc(44px + 2mm)" : 44,
                marginTop: active ? "-2mm" : 0,
                flexShrink: 0, // ray kayabilir hale geldi; sekmeler sıkışıp ezilmesin
                borderRadius: 18,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                textDecoration: "none",
                background: active ? "rgba(255,255,255,0.14)" : "transparent",
                color: active ? "#fff" : "rgba(255,255,255,0.45)",
              }}
            >
              <Icon size={26} strokeWidth={1.75} />
              {/* "Rezervasyon" gibi uzun etiketler iki satıra kırılıp kutuyu taşırmasın.
                  Yazı 11px: kutu yüksekliği (44) değişmediği için üstü budanmadan
                  sığabilen en büyük değer — 12'de simgeyle birlikte taşıyor. */}
              <span style={{ fontSize: 11, whiteSpace: "nowrap" }}>{item.label}</span>
            </Link>
          );
        })}

        <button
          onClick={cikisYap}
          aria-label="Çıkış yap"
          title="Çıkış yap"
          style={{
            all: "unset",
            cursor: "pointer",
            marginTop: "auto",
            flexShrink: 0,
            width: 49,
            height: 49,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.14)",
            color: "rgba(255,255,255,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <LogOut size={25} strokeWidth={1.75} />
        </button>
      </nav>

      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  );
}
