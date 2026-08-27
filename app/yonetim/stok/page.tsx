"use client";

// Telefon yönetim görünümü — Stok başlığının seçim ekranı.
// İleride buraya eklenecekler: tedarik.

import SecimEkrani from "../SecimEkrani";

export default function Stok() {
  return (
    <SecimEkrani
      baslik="Stok"
      satirlar={[
        { ad: "Stok", href: "/stok" },
        { ad: "Sayım", href: "/sayim" },
      ]}
    />
  );
}
