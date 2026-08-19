"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

// TEST ROL ÇUBUĞU (Gökhan, 2026-08-17): "hangi role bakacaksam oradan geçeyim, hangisine
// geçersem rolüm o olsun."
//
// SADECE GELİŞTİRME/DEMO ARACI — yayına çıkmadan silinecek. Personel normalde kendi rolünü
// değiştiremez; rolü işletme verir. Bu çubuk arka planda test_rolumu_degistir'i çağırıyor,
// o da yalnızca kişinin KENDİ kaydının rolünü değiştiriyor.
//
// Çubuk sadece EKİP'ten bağlanmış personelde çıkıyor: işletme sahibinin personel kaydı
// olmadığı için onda hiç görünmüyor.
//
// YERİ (Gökhan, 2026-08-18): ekranın altındaydı, sayfanın altını kapatıyordu. Yukarı alındı;
// işletme isminin üstüne biniyor. Sayfaların düzenine karışmıyor, üstlerinde duruyor.

const ROLLER: { anahtar: string; kisa: string }[] = [
  { anahtar: "garson", kisa: "GRSN" },
  { anahtar: "salon_sefi", kisa: "ŞEF" },
  { anahtar: "mutfak", kisa: "MUT" },
  { anahtar: "karsilama", kisa: "KAR" },
  { anahtar: "pr", kisa: "PR" },
  { anahtar: "yonetici", kisa: "YÖN" },
];

export default function TestRolCubugu() {
  const [rol, setRol] = useState<string | null>(null);
  const [ad, setAd] = useState("");
  const [busy, setBusy] = useState(false);
  const [acik, setAcik] = useState(true);

  const oku = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const { data } = await supabase.rpc("personel_rolum");
    const r = (data as { rol: string; durum: string; ad_soyad: string }[] | null)?.[0];
    if (r && r.durum === "onayli") { setRol(r.rol); setAd(r.ad_soyad); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { oku(); }, 0);
    return () => clearTimeout(t);
  }, [oku]);

  if (!rol) return null;

  const degistir = async (yeni: string) => {
    if (busy || yeni === rol) return;
    setBusy(true);
    const { error } = await supabase.rpc("test_rolumu_degistir", { p_rol: yeni });
    setBusy(false);
    if (error) return;
    setRol(yeni);
    // Menüler ve yetkiler açılışta okunuyor; en temizi sayfayı tazelemek.
    window.location.reload();
  };

  if (!acik) {
    return (
      <button
        onClick={() => setAcik(true)} title="Test rol çubuğunu aç"
        style={{ ...kapali, position: "fixed", left: 10, top: 2, zIndex: 250 }}
      >
        rol
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", left: 10, top: 2, zIndex: 250,
      display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", maxWidth: "calc(100vw - 20px)",
      background: "var(--card)", border: "1px dashed var(--gold)", borderRadius: 12,
      padding: "6px 8px", boxShadow: "0 6px 18px rgba(0,0,0,.14)",
    }}>
      <span style={{ fontSize: 10.5, color: "var(--gold-text)", fontWeight: 700, marginRight: 2 }}>
        TEST · {ad.split(" ")[0]}
      </span>
      {ROLLER.map((r) => {
        const secili = r.anahtar === rol;
        return (
          <button
            key={r.anahtar} onClick={() => degistir(r.anahtar)} disabled={busy}
            style={{
              all: "unset", cursor: "pointer", fontSize: 11, fontWeight: 700,
              padding: "4px 8px", borderRadius: 8,
              background: secili ? "var(--brand-strong)" : "var(--recede)",
              color: secili ? "#fff" : "var(--ink)",
              opacity: busy ? 0.5 : 1,
            }}
          >
            {r.kisa}
          </button>
        );
      })}
      <button onClick={() => setAcik(false)} title="Gizle" style={{ ...kapali, marginLeft: 2 }}>×</button>
    </div>
  );
}

const kapali: React.CSSProperties = {
  all: "unset", cursor: "pointer", fontSize: 11, color: "var(--muted-2)",
  border: "1px dashed var(--line-2)", borderRadius: 8, padding: "4px 8px",
  background: "var(--card)",
};
