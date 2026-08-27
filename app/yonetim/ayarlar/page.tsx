"use client";

// Telefon yönetim görünümü — Ayarlar başlığının seçim ekranı.
// İleride buraya eklenecekler: şube, çoklu dil, kiosk yönetimi gibi kurulum işleri.

import SecimEkrani from "../SecimEkrani";

export default function AyarlarSecim() {
  return (
    <SecimEkrani
      baslik="Ayarlar"
      satirlar={[
        { ad: "Ayarlar", href: "/ayarlar" },
      ]}
    />
  );
}
