import TestRolCubugu from "../components/TestRolCubugu";

// Rezervasyon programının ortak sarmalayıcısı. Şimdilik tek işi test rol çubuğunu bütün
// rezervasyon sayfalarına eklemek (Gökhan, 2026-08-17) — çubuk sadece Ekip'ten bağlanmış
// personelde görünüyor, işletme sahibinde hiç çıkmıyor.
//
// Çubuk GEÇİCİ: yayına çıkmadan bu dosyadan tek satır silinerek kaldırılacak.
export default function RezervasyonLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <TestRolCubugu />
    </>
  );
}
