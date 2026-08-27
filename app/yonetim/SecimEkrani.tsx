"use client";

// Telefon yönetim görünümünün seçim ekranı kalıbı: alt çubuktaki bir başlığa
// basınca açılır, altındaki sayfalar alt alta kutular hâlinde listelenir
// (No63 akordiyon kutusu görünümü). Kutuya basınca sayfa açılır; telefonun
// geri tuşu bu ekrana döndürür. Beş başlığın sayfası da bu kalıbı kullanır.

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import SayfaKabugu from "@/app/components/SayfaKabugu";
import { YONETIM_ALT_NAV_YUKSEKLIK } from "@/app/components/YonetimAltNav";
import { kart } from "@/lib/olcu";

export type SecimSatiri = { ad: string; href: string; aciklama?: string };

export default function SecimEkrani({ baslik, satirlar }: { baslik: string; satirlar: SecimSatiri[] }) {
  return (
    <SayfaKabugu baslik={baslik} altBosluk={YONETIM_ALT_NAV_YUKSEKLIK}>
      <div style={{ display: "grid", gap: 10, marginTop: 14, maxWidth: 640, alignContent: "start" }}>
        {satirlar.map((s) => (
          <Link
            key={s.href} href={s.href}
            style={{
              ...kart, textDecoration: "none", color: "var(--ink)",
              minHeight: 44, display: "flex", alignItems: "center", gap: 10, padding: "8px 14px",
              boxSizing: "border-box",
            }}
            className="tap-feedback"
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 15.5 }}>{s.ad}</span>
              {s.aciklama && <span style={{ display: "block", fontSize: 11.5, color: "var(--muted-2)" }}>{s.aciklama}</span>}
            </span>
            <ChevronRight size={18} strokeWidth={1.75} color="var(--muted)" />
          </Link>
        ))}
      </div>
    </SayfaKabugu>
  );
}
