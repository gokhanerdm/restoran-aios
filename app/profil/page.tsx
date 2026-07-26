"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getMyRestaurantId } from "@/lib/supabase/restaurant";

// Yönetici (PC, gerçek giriş) buradan herhangi bir personelin GÜNLÜK özetini tam veriyle görür
// (toplam ciro dahil). staff_daily_summary RPC'si aynı zamanda garson/mutfak ekranındaki
// "Profilim" panelini de besliyor — orada kişi kendi verisini görür, kıyas ayarlıysa yüzdeyi de.
type Summary = {
  full_name: string; role: string; own_sales: number; own_orders_served: number;
  own_items_prepared: number; comparison_enabled: boolean; sales_percent: number | null;
};
const roleLabel = (v: string) => ({ garson: "Garson", mutfak: "Mutfak", bar: "Bar", kasa: "Kasa", sef: "Şef", yonetici: "Yönetici" }[v] ?? v);
const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;

export default function ProfilPage() {
  return (
    <Suspense fallback={null}>
      <ProfilInner />
    </Suspense>
  );
}

function ProfilInner() {
  const staffId = useSearchParams().get("staff");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!staffId) return;
    const restId = await getMyRestaurantId();
    if (!restId) { setErr("Giriş yapılmamış."); return; }
    const { data, error } = await supabase.rpc("staff_daily_summary", { p_restaurant_id: restId, p_staff_id: staffId });
    if (error) { setErr(error.message); return; }
    setSummary((data as Summary[])?.[0] ?? null);
  }, [staffId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ padding: "26px 28px", height: "calc(100vh - 4px)", boxSizing: "border-box" }}>
      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", marginBottom: 20 }}>Profil</div>
      {err && <div style={{ padding: "10px 14px", borderRadius: 12, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13, maxWidth: 420 }}>{err}</div>}
      {!err && summary && (
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 22, maxWidth: 420 }}>
          <div style={{ fontSize: 19, fontWeight: 600, color: "var(--ink-green)", marginBottom: 2 }}>{summary.full_name}</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 18 }}>{roleLabel(summary.role)} · bugün</div>

          {summary.role === "garson" ? (
            <>
              <Row label="Bugünkü satışı" value={money(summary.own_sales)} strong />
              <Row label="Hizmet ettiği masa sayısı" value={String(summary.own_orders_served)} />
              {summary.comparison_enabled && summary.sales_percent != null && (
                <Row label="Garsonlar arası satış payı" value={`%${summary.sales_percent}`} />
              )}
              {!summary.comparison_enabled && (
                <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 10 }}>Personel karşılaştırması Ayarlar'dan kapalı — sadece kendi rakamı görünür.</div>
              )}
            </>
          ) : (
            <Row label="Bugün hazırladığı ürün sayısı" value={String(summary.own_items_prepared)} strong />
          )}
        </div>
      )}
      {!err && !summary && <div style={{ color: "var(--muted-2)", fontSize: 13 }}>Yükleniyor…</div>}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ fontSize: 13.5, color: "var(--muted)" }}>{label}</span>
      <span className="tnum" style={{ fontSize: strong ? 18 : 14, fontWeight: strong ? 700 : 500, color: strong ? "var(--brand)" : "var(--ink)" }}>{value}</span>
    </div>
  );
}
