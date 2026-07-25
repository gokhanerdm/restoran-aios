"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import {
  Home,
  LayoutGrid,
  LineChart,
  BarChart3,
  Package,
  BookOpen,
  Users,
  Settings,
  LogOut,
} from "lucide-react";

const nav = [
  { href: "/ana-sayfa", icon: Home, label: "Ana sayfa" },
  { href: "/", icon: LayoutGrid, label: "Kasa" },
  { href: "/gun-sonu", icon: LineChart, label: "Gün sonu" },
  { href: "/raporlar", icon: BarChart3, label: "Raporlar" },
  { href: "/stok", icon: Package, label: "Stok" },
  { href: "/menu", icon: BookOpen, label: "Menü" },
  { href: "/personel", icon: Users, label: "Personel" },
  { href: "/ayarlar", icon: Settings, label: "Ayarlar" },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  // Müşteriye açık menü (QR / site embed), garson mobil sipariş modülü (Faz 2'ye kadar girişsiz)
  // ve giriş ekranının kendisi yönetim kabuğunu/oturum kontrolünü kullanmaz.
  const isPublic = pathname.startsWith("/m/") || pathname.startsWith("/garson") || pathname === "/giris";

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

  const cikisYap = async () => { await supabase.auth.signOut(); router.replace("/giris"); };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav
        style={{
          width: 82,
          background: "var(--rail)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "18px 0",
          gap: 8,
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        <div
          style={{
            width: 41,
            height: 41,
            borderRadius: "50%",
            background: "var(--brand)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600,
            fontSize: 17,
            marginBottom: 12,
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
                width: 59,
                height: 59,
                borderRadius: 16,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                textDecoration: "none",
                background: active ? "rgba(255,255,255,0.14)" : "transparent",
                color: active ? "#fff" : "rgba(255,255,255,0.45)",
              }}
            >
              <Icon size={26} strokeWidth={1.75} />
              <span style={{ fontSize: 11 }}>{item.label}</span>
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
            width: 41,
            height: 41,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.14)",
            color: "rgba(255,255,255,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <LogOut size={19} strokeWidth={1.75} />
        </button>
      </nav>

      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  );
}
