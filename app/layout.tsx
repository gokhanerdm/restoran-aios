import type { Metadata } from "next";
import "./globals.css";
import Shell from "./components/Shell";

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
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
