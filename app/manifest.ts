import type { MetadataRoute } from "next";

// PROGRAMIN KENDİ SİMGESİ VE UYGULAMA KİMLİĞİ (Gökhan, 2026-08-18: "kısayol simgesi
// programın rengi olsun, yeşil, üzerinde RZV yazsın; tıklayınca tam ekran açılsın").
//
// Bu dosya tarayıcıya "ben bir uygulamayım" diyor: Chrome'da "Uygulamayı yükle" seçeneği
// çıkıyor, telefonda ana ekrana eklenince de simge ve isim buradan geliyor. Açılış adresi
// doğrudan rezervasyon listesi — oturum yoksa program kendi giriş ekranına düşürüyor.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rezerve — Restoran AIOS",
    short_name: "Rezerve",
    description: "Rezervasyon, salon ve masa yönetimi.",
    start_url: "/rezervasyon",
    scope: "/",
    // Tam ekran: adres çubuğu ve sekmeler görünmüyor, ekranı program kullanıyor.
    display: "fullscreen",
    orientation: "any",
    background_color: "#00704a",
    theme_color: "#00704a",
    lang: "tr",
    icons: [
      { src: "/ikon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/ikon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/ikon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
