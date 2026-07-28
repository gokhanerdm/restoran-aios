"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getMyRestaurantId } from "@/lib/supabase/restaurant";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

// Şef paneli — ROADMAP §O9. Programın kendi izlediği aksaklıklar; kimseyi fişlemez,
// "hangi görevde tıkanma var" sorusuna cevap verir. İşletmeci isterse bakar, buraya
// PIN'siz erişilir (diğer yönetim ekranları gibi Auth ile korunur).
//
// Henüz kapsam dışı (altyapısı yok): "başlangıç teslim edildi, ana yemek gönderilmedi"
// (servis sırası/coursing) ve "garson molada, masaları sahipsiz" (garson ataması/mola).
// Bunlar eklenince operational_alerts_live RPC'sine yeni UNION ALL blokları olarak girer.

type Alert = { alert_type: string; subject: string; since: string; minutes_late: number };

const TYPE_INFO: Record<string, { label: string; renk: string }> = {
  siparis_alinmadi: { label: "Sipariş alınmadı", renk: "var(--gold-text)" },
  hazir_bekliyor: { label: "Hazır, servise bekliyor", renk: "var(--danger)" },
  hesap_bekliyor: { label: "Hesap istendi, kapanmadı", renk: "var(--gold-text)" },
  kalem_suresi_asti: { label: "Pişirme süresini aştı", renk: "var(--danger)" },
  masa_toplanmadi: { label: "Masa toplanmadı", renk: "var(--gold-text)" },
  kasa_onayi_gecikti: { label: "Kasa onayı gecikti", renk: "var(--danger)" },
};

const dkFmt = (n: number) => (n < 60 ? `${Math.round(n)} dk` : `${Math.floor(n / 60)}s ${Math.round(n % 60)}dk`);

export default function SefPaneli() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const restId = await getMyRestaurantId();
    if (!restId) { setLoading(false); return; }
    const { data, error } = await supabase.rpc("operational_alerts_live", { p_restaurant: restId });
    if (error) { setErr(error.message); setLoading(false); return; }
    setAlerts((data as Alert[]) ?? []);
    setErr(null);
    setLoading(false);
  }, []);

  // Canlı izleme ekranı — kısa aralıkla kendini tazeler (mutfak ekranıyla aynı desen).
  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  const grouped = Object.keys(TYPE_INFO).map((t) => ({
    type: t, info: TYPE_INFO[t], items: alerts.filter((a) => a.alert_type === t),
  })).filter((g) => g.items.length > 0);

  return (
    <div style={{ padding: "26px 28px", height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <div style={{ marginBottom: 14, flexShrink: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>Şef paneli</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 7 }}>
          {loading ? "Yükleniyor…" : alerts.length === 0 ? "Şu an açık bir aksaklık yok." : `${alerts.length} aksaklık`}
        </div>
      </div>

      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10, flexShrink: 0 }}>{err}</div>}

      {!loading && alerts.length === 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderRadius: 14, background: "var(--card)", border: "1px solid var(--brand)" }}>
          <CheckCircle2 size={20} color="var(--brand)" />
          <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink-green)" }}>Her şey yolunda — açık bir tıkanma görünmüyor.</span>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
        {grouped.map((g) => (
          <div key={g.type} style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <AlertTriangle size={15} color={g.info.renk} />
              <span style={{ fontSize: 13.5, fontWeight: 600, color: g.info.renk }}>{g.info.label}</span>
              <span className="tnum" style={{ fontSize: 11.5, color: "var(--muted-2)" }}>({g.items.length})</span>
            </div>
            <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden" }}>
              {g.items.map((a, i) => (
                <div key={`${a.subject}-${a.since}-${i}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: i < g.items.length - 1 ? "1px solid var(--line)" : "none", fontSize: 13.5 }}>
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink)" }}>{a.subject}</span>
                  <span className="tnum" style={{ fontWeight: 600, color: g.info.renk, flexShrink: 0, marginLeft: 12 }}>{dkFmt(a.minutes_late)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
