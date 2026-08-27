"use client";

// Telefon yönetim görünümü — Servis başlığının seçim ekranı.
// İleride buraya eklenecekler: paket servis, kampanya.

import SecimEkrani from "../SecimEkrani";

export default function Servis() {
  return (
    <SecimEkrani
      baslik="Servis"
      satirlar={[
        { ad: "Adisyon", href: "/adisyon" },
        { ad: "Menü", href: "/menu" },
        { ad: "Şef paneli", href: "/sef" },
        { ad: "Rezervasyon", href: "/rezervasyon", aciklama: "Kendi ekranında açılır" },
      ]}
    />
  );
}
