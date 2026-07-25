import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Geliştirme sunucusunu telefon/tablet gibi yerel ağdaki cihazlardan test edebilmek için
  // (garson mobil modülü) — Next.js varsayılan olarak localhost dışı istekleri güvenlik
  // amacıyla engelliyor. IP değişirse burayı güncellemek gerekir (ipconfig ile bakılır).
  allowedDevOrigins: ["192.168.1.104"],
};

export default nextConfig;
