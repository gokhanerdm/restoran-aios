"use client";

// Telefon yönetim görünümü — Personel başlığının seçim ekranı.

import SecimEkrani from "../SecimEkrani";

export default function Personel() {
  return (
    <SecimEkrani
      baslik="Personel"
      satirlar={[
        { ad: "Personel", href: "/personel" },
        { ad: "Vardiya", href: "/vardiya" },
      ]}
    />
  );
}
