"use client";

// Ortak sayfa çerçevesi (2026-08-27). İki kip:
//
// SABİT (varsayılan) — ekran kuralındaki "tek ekran, scroll yok" kalıbı:
// sayfanın kendisi kaymaz, uzun olabilecek iç kutu kendi içinde kayar.
// Bugüne kadar her sayfanın elle yazdığı padding "26px 28px" +
// height calc(100vh - 4px) buraya çekildi.
//
// KAYAN — akordiyonlu uzun sayfalar (Ayarlar gibi): üstte sabit başlık satırı
// (sağında tek eylem yuvası — tek Kaydet oraya oturur), altında ".sayfa-govde"
// sınıflı kayan gövde. Akordiyon'un "açılan kutuyu başa getir" hesabı ve
// yapışkan başlık merdiveni bu sınıfa ve gövdenin 14px üst boşluğuna bağlı
// (lib/yapiskan.ts) — sınıfın adı değişirse ikisi de bozulur.
//
// Ortak dosyalar kuralı gereği sabit katman DEĞİL: her sayfa kendi return'üne
// kendisi koyar.

export default function SayfaKabugu({
  baslik,
  eylem,
  kayan = false,
  altBosluk = 0,
  children,
}: {
  /** Sayfa başlığı. Verilmezse başlık satırı çizilmez (sabit kipte sayfa kendi başlığını koyabilir). */
  baslik?: string;
  /** Başlık satırının sağındaki tek eylem yuvası — kayan kipte tek Kaydet burada durur. */
  eylem?: React.ReactNode;
  /** true: gövde kayar (akordiyonlu sayfalar). false: tek ekran, scroll yok. */
  kayan?: boolean;
  /** Telefonda alt gezinme çubuğunun payı (çubuk yüksekliği + nefes). */
  altBosluk?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "26px 28px",
        paddingBottom: altBosluk ? altBosluk + 16 : undefined,
        height: "calc(100vh - 4px)",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      }}
    >
      {baslik !== undefined && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: -0.5, color: "var(--ink-green)", flex: 1, minWidth: 0 }}>
            {baslik}
          </h1>
          {eylem}
        </div>
      )}

      {kayan ? (
        <div
          className="sayfa-govde"
          style={{ flex: 1, overflowY: "auto", minHeight: 0, paddingTop: 14 }}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
