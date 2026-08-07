import { redirect } from "next/navigation";

// Kök adres artık doğrudan RZV'ye açılır (Gökhan, 2026-08-07: "bizim linkimizin direkt
// rzv yi açması gerek"). Eski Adisyon sayfası /adisyon'a taşındı, Shell.tsx'teki menü
// linki de oraya güncellendi — hiçbir işlev kaybolmadı, sadece kök adresin hedefi değişti.
export default function Home() {
  redirect("/rezervasyon");
}
