"use client";

import TekOturum from "../components/TekOturum";

// Rezervasyon programının ortak kabuğu. Tek işi var: tek oturum bekçisini bütün alt
// ekranlara (rezervasyon, salon, ayarlar, kurulum, ekip panelleri) tek yerden takmak.
// Görsel bir şey eklemiyor — sayfaların kendi düzenine dokunmuyor.
export default function RezervasyonLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TekOturum />
      {children}
    </>
  );
}
