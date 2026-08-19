import type { NextConfig } from "next";
import { networkInterfaces } from "os";

// Geliştirme sunucusuna telefon/tabletten (aynı ağdan) bağlanabilmek için — Next.js
// varsayılan olarak localhost dışı istekleri güvenlik amacıyla engelliyor.
//
// Eskiden buraya IP ELLE yazılıyordu ("192.168.1.102"). Modem yeniden başlayınca ya da
// telefonun hotspot'una geçilince IP değişiyor, telefondaki link ölüyor ve dosyayı elle
// güncellemek gerekiyordu (Gökhan, 2026-08-12: "ip değişti"). Artık bilgisayarın o anki
// yerel adresleri her sunucu açılışında kendiliğinden bulunuyor; elle bakılacak bir şey yok.
const yerelAdresler = (): string[] => {
  const out = new Set<string>();
  for (const arayuz of Object.values(networkInterfaces())) {
    for (const a of arayuz ?? []) {
      if (a.family === "IPv4" && !a.internal) out.add(a.address);
    }
  }
  return [...out];
};

const nextConfig: NextConfig = {
  allowedDevOrigins: yerelAdresler(),
};

export default nextConfig;
