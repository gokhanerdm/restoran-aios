import type { Metadata } from "next";
import "./globals.css";
import Shell from "./components/Shell";
import EnableTouchActive from "./components/EnableTouchActive";

export const metadata: Metadata = {
  title: "Restoran AIOS",
  description: "Restoran işletim sistemi",
  // Sekme ve kısayol simgesi: yeşil zeminde RZV (Gökhan, 2026-08-18).
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "64x64" },
      { url: "/rzv.ico", sizes: "any" },
    ],
    apple: "/ikon-192.png",
  },
};

// Tam ekran uygulamada üst şerit rengi de programın yeşili olsun.
export const viewport = {
  themeColor: "#00704a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body>
        <EnableTouchActive />
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
