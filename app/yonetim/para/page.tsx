"use client";

// Telefon yönetim görünümü — Para başlığının seçim ekranı.
// İleride buraya eklenecekler: muhasebe, e-belgeler, sanal pos, yemek kartı, döviz.

import SecimEkrani from "../SecimEkrani";

export default function Para() {
  return (
    <SecimEkrani
      baslik="Para"
      satirlar={[
        { ad: "Kasa", href: "/kasa" },
        { ad: "Raporlar", href: "/raporlar" },
      ]}
    />
  );
}
