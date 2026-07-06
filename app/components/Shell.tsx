"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Grid2x2,
  LayoutGrid,
  LineChart,
  BarChart3,
  Package,
  BookOpen,
  Users,
  Settings,
} from "lucide-react";

const nav = [
  { href: "/ana-sayfa", icon: Home, label: "Ana sayfa" },
  { href: "/salonlar", icon: Grid2x2, label: "Salonlar" },
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

  // Müşteriye açık menü (QR / site embed) yönetim kabuğunu kullanmaz
  if (pathname.startsWith("/m/")) return <>{children}</>;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <nav
        style={{
          width: 64,
          background: "var(--rail)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "18px 0",
          gap: 6,
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "var(--brand)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 600,
            fontSize: 13,
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
                width: 46,
                height: 46,
                borderRadius: 13,
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
              <Icon size={20} strokeWidth={1.75} />
              <span style={{ fontSize: 9 }}>{item.label}</span>
            </Link>
          );
        })}

        <div
          style={{
            marginTop: "auto",
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.14)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          A
        </div>
      </nav>

      <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  );
}
