"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getMyRestaurantId } from "@/lib/supabase/restaurant";
import SayfaKabugu from "@/app/components/SayfaKabugu";
import { kart } from "@/lib/olcu";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

// Şef paneli — ROADMAP §O9. Programın kendi izlediği aksaklıklar; kimseyi fişlemez,
// "hangi görevde tıkanma var" sorusuna cevap verir. İşletmeci isterse bakar, buraya
// PIN'siz erişilir (diğer yönetim ekranları gibi Auth ile korunur).

type Alert = { alert_type: string; subject: string; since: string; minutes_late: number };
// ROADMAP §O8 ölçüsü: hazır olduktan kaç dakika sonra masaya gitti — mutfak mı yavaş,
// servis mi yavaş ayrımı. Bugünkü (Europe/Istanbul) teslim edilmiş kalemler üzerinden.
type ServiceSpeed = { avg_prep_minutes: number | null; avg_service_minutes: number | null; items_measured: number };

const TYPE_INFO: Record<string, { label: string; renk: string }> = {
  siparis_alinmadi: { label: "Sipariş alınmadı", renk: "var(--gold-text)" },
  hazir_bekliyor: { label: "Hazır, servise bekliyor", renk: "var(--danger)" },
  hesap_bekliyor: { label: "Hesap istendi, kapanmadı", renk: "var(--gold-text)" },
  kalem_suresi_asti: { label: "Pişirme süresini aştı", renk: "var(--danger)" },
  masa_toplanmadi: { label: "Masa toplanmadı", renk: "var(--gold-text)" },
  kasa_onayi_gecikti: { label: "Kasa onayı gecikti", renk: "var(--danger)" },
  baslangic_bekletiliyor: { label: "Başlangıç bitti, sonraki servis gönderilmedi", renk: "var(--danger)" },
  garson_molada_masa_var: { label: "Garson molada, masaları sahipsiz", renk: "var(--gold-text)" },
};

const dkFmt = (n: number) => (n < 60 ? `${Math.round(n)} dk` : `${Math.floor(n / 60)}s ${Math.round(n % 60)}dk`);

export default function SefPaneli() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [speed, setSpeed] = useState<ServiceSpeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const restId = await getMyRestaurantId();
    if (!restId) { setLoading(false); return; }
    const [{ data, error }, { data: sp }] = await Promise.all([
      supabase.rpc("operational_alerts_live", { p_restaurant: restId }),
      supabase.rpc("service_speed_today", { p_restaurant: restId }),
    ]);
    if (error) { setErr(error.message); setLoading(false); return; }
    setAlerts((data as Alert[]) ?? []);
    setSpeed(((sp as ServiceSpeed[]) ?? [])[0] ?? null);
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
    <SayfaKabugu baslik="Şef paneli">
      <div style={{ fontSize: 13, color: "var(--muted)", margin: "7px 0 14px", flexShrink: 0 }}>
        {loading ? "Yükleniyor…" : alerts.length === 0 ? "Şu an açık bir aksaklık yok." : `${alerts.length} aksaklık`}
      </div>

      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10, flexShrink: 0 }}>{err}</div>}

      {/* ROADMAP §O8: "yemek hazır olduktan kaç dakika sonra masaya gitti — mutfak mı yavaş,
          servis mi yavaş, şu an ayrılamıyor." İki ayrı ortalamayla ayrıştırılır. */}
      {speed && speed.items_measured > 0 && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, flexShrink: 0 }}>
          <div style={{ ...kart, flex: 1, padding: "12px 16px" }}>
            <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 3 }}>Mutfak hazırlama (bugün, ort.)</div>
            <div className="tnum" style={{ fontSize: 19, fontWeight: 600, color: "var(--ink-green)" }}>{speed.avg_prep_minutes ?? "—"} dk</div>
          </div>
          <div style={{ ...kart, flex: 1, padding: "12px 16px" }}>
            <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 3 }}>Servis — hazırdan masaya (bugün, ort.)</div>
            <div className="tnum" style={{ fontSize: 19, fontWeight: 600, color: "var(--ink-green)" }}>{speed.avg_service_minutes ?? "—"} dk</div>
          </div>
          <div style={{ ...kart, flex: 1, padding: "12px 16px" }}>
            <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 3 }}>Ölçülen kalem</div>
            <div className="tnum" style={{ fontSize: 19, fontWeight: 600, color: "var(--ink)" }}>{speed.items_measured}</div>
          </div>
        </div>
      )}

      {!loading && alerts.length === 0 && (
        <div style={{ ...kart, display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", border: "1px solid var(--brand)" }}>
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
            <div style={kart}>
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
    </SayfaKabugu>
  );
}
