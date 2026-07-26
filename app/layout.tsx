import type { Metadata } from "next";
import "./globals.css";
import Shell from "./components/Shell";
import EnableTouchActive from "./components/EnableTouchActive";

export const metadata: Metadata = {
  title: "Restoran AIOS",
  description: "Restoran işletim sistemi",
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
