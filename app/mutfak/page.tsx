"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { resolveRestaurantIdBySlug } from "@/lib/supabase/publicRestaurant";
import StaffLoginGate from "../components/StaffLoginGate";
import { getStaffSession } from "@/lib/supabase/staffSession";

// Mutfak/Bar ekranı (KDS v1) — garson "Gönder"e basınca buraya düşer.
// Girişsiz, tablet/ekran için (bkz. app/garson/page.tsx aynı desen). Gerçek zamanlı değil,
// birkaç saniyede bir kendini tazeler (v1 — ileride Supabase realtime'a yükseltilebilir).
// İstasyon (Mutfak/Bar/Pastane) yönlendirmesi: ürünün kendi override'ı yoksa kategorisinin
// varsayılan istasyonu kullanılır (bkz. Menü ekranı — concept_templates ile aynı katman değil,
// ayrı bir stations tablosu).

type Station = { id: string; name: string; sort_order: number };
type TableRow = { id: string; name: string };
type Card = {
  id: string; tableId: string | null; name: string; quantity: number;
  stationId: string | null; sentAt: string; preparingAt: string | null; readyAt: string | null;
  prepMinutes: number | null;
};

const ALL = "__all__";

export default function MutfakPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--canvas)" }} />}>
      <MutfakInner />
    </Suspense>
  );
}

function MutfakInner() {
  const searchParams = useSearchParams();
  const rSlug = searchParams.get("r");
  const istasyonParam = searchParams.get("istasyon");
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedStation, setSelectedStation] = useState<string>(ALL);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  // Link ?istasyon=Bar gibi bir kod taşıyorsa, ilk veri gelince sekmeyi otomatik ona kilitle
  // (bar tableti hep Bar'ı görsün, her seferinde sekmeye dokunması gerekmesin) — ama sadece bir kez,
  // kullanıcı sonradan "Tümü"ne geçerse her 4sn'lik tazelemede geri zıplamasın.
  const autoSelected = useRef(false);

  const load = useCallback(async () => {
    try {
      const rest = await resolveRestaurantIdBySlug(rSlug);
      if ("error" in rest) { setErr(rest.error); setLoading(false); return; }
      const restId = rest.id;
      setRestaurantId(restId);

      const [{ data: t, error: tErr }, { data: st, error: stErr }, { data: cats, error: cErr }, { data: items, error: iErr }, { data: orders, error: oErr }] = await Promise.all([
        supabase.from("restaurant_tables").select("id, name").eq("restaurant_id", restId).is("deleted_at", null),
        supabase.from("stations").select("id, name, sort_order").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
        supabase.from("menu_categories").select("id, default_station_id").eq("restaurant_id", restId).is("deleted_at", null),
        supabase.from("menu_items").select("id, name, category_id, station_override_id, prep_minutes").eq("restaurant_id", restId).is("deleted_at", null),
        supabase.from("orders").select("id, table_id, order_items(id, quantity, menu_item_id, status, sent_at, preparing_at, ready_at, served_at)").eq("restaurant_id", restId).eq("status", "open"),
      ]);
      const anyErr = tErr ?? stErr ?? cErr ?? iErr ?? oErr;
      if (anyErr) { setErr(anyErr.message); setLoading(false); return; }

      setTables((t as TableRow[]) ?? []);
      const stationRows = (st as Station[]) ?? [];
      setStations(stationRows);
      if (istasyonParam && !autoSelected.current) {
        const match = stationRows.find((s) => s.name.toLocaleLowerCase("tr") === istasyonParam.toLocaleLowerCase("tr"));
        if (match) { setSelectedStation(match.id); autoSelected.current = true; }
      }

      const catStation = new Map<string, string | null>();
      (cats as { id: string; default_station_id: string | null }[] ?? []).forEach((c) => catStation.set(c.id, c.default_station_id));
      const itemInfo = new Map<string, { name: string; stationId: string | null; prepMinutes: number | null }>();
      (items as { id: string; name: string; category_id: string | null; station_override_id: string | null; prep_minutes: number | null }[] ?? []).forEach((m) => {
        const stationId = m.station_override_id ?? (m.category_id ? catStation.get(m.category_id) ?? null : null);
        itemInfo.set(m.id, { name: m.name, stationId, prepMinutes: m.prep_minutes });
      });

      type OI = { id: string; quantity: number; menu_item_id: string; status: string; sent_at: string | null; preparing_at: string | null; ready_at: string | null; served_at: string | null };
      type OrderRow = { id: string; table_id: string | null; order_items: OI[] };
      const list: Card[] = [];
      ((orders as unknown as OrderRow[]) ?? []).forEach((o) => {
        o.order_items.forEach((oi) => {
          if (oi.status !== "active" || !oi.sent_at || oi.served_at) return;
          const info = itemInfo.get(oi.menu_item_id);
          list.push({
            id: oi.id, tableId: o.table_id, name: info?.name ?? "?", quantity: oi.quantity,
            stationId: info?.stationId ?? null, sentAt: oi.sent_at, preparingAt: oi.preparing_at, readyAt: oi.ready_at,
            prepMinutes: info?.prepMinutes ?? null,
          });
        });
      });
      list.sort((a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt));
      setCards(list);
      setErr(null);
      setLoading(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu.");
      setLoading(false);
    }
  }, [rSlug, istasyonParam]);

  // Veri + "şu an" (bekleme dakikası için) aynı döngüde tazelenir — ayrı bir saniyelik
  // sayaç tüm kart listesini boşuna saniyede bir yeniden çizdiriyordu, kaldırıldı.
  useEffect(() => {
    setNow(Date.now());
    load();
    const id = setInterval(() => { setNow(Date.now()); load(); }, 4000);
    return () => clearInterval(id);
  }, [load]);

  const setStage = async (id: string, field: "preparing_at" | "ready_at" | "served_at") => {
    const patch: Record<string, string> = { [field]: new Date().toISOString() };
    // Kim hazırlamaya başladıysa (ilk gerçek aksiyon) profil/özet sayfası için etiketlenir.
    if (field === "preparing_at") {
      const staff = getStaffSession();
      if (staff) patch.prepared_by_staff_id = staff.id;
    }
    await supabase.from("order_items").update(patch).eq("id", id);
    await load();
  };

  const tableName = (id: string | null) => tables.find((t) => t.id === id)?.name ?? "?";
  const visible = selectedStation === ALL ? cards : cards.filter((c) => c.stationId === selectedStation);
  const screenTitle = selectedStation === ALL ? "Sipariş Ekranı" : stations.find((s) => s.id === selectedStation)?.name ?? "Sipariş Ekranı";
  const elapsedMin = (sentAt: string) => Math.max(0, Math.floor(((now || Date.parse(sentAt)) - Date.parse(sentAt)) / 60000));

  // Masa masa grupla — her masanın bir kartı, içinde her ürün kendi aşama butonuyla.
  const byTable = new Map<string, Card[]>();
  visible.forEach((c) => {
    const key = c.tableId ?? "__yok__";
    (byTable.get(key) ?? byTable.set(key, []).get(key)!).push(c);
  });
  const tableGroups = Array.from(byTable.entries())
    .map(([tableId, items]) => {
      const preps = items.map((i) => i.prepMinutes).filter((p): p is number => p != null);
      return { tableId, items, oldestSentAt: Math.min(...items.map((i) => Date.parse(i.sentAt))), maxPrep: preps.length ? Math.max(...preps) : null };
    })
    .sort((a, b) => a.oldestSentAt - b.oldestSentAt);
  // Bir masanın tüm ürünleri aynı anda çıksın diye: en uzun pişme süresi olan ürün hemen başlar,
  // kısa sürenler o kadar geç başlar ki hepsi birlikte biter. Sadece bilgi amaçlı — buton kilitlenmez.
  const startHint = (c: Card, maxPrep: number | null): string | null => {
    if (c.prepMinutes == null || maxPrep == null) return null;
    const startAt = Date.parse(c.sentAt) + (maxPrep - c.prepMinutes) * 60000;
    const diffMin = Math.round(((now || Date.now()) - startAt) / 60000);
    return diffMin >= 0 ? "Şimdi başlat" : `${-diffMin} dk sonra başlat`;
  };

  return (
    <StaffLoginGate restaurantId={restaurantId} roles={["mutfak", "bar"]}>
    <div style={{ minHeight: "100vh", background: "var(--canvas)" }}>
      <div style={{ padding: "18px 16px 40px" }}>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.4px", color: "var(--ink-green)" }}>{screenTitle}</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>{loading ? "Yükleniyor…" : `${tableGroups.length} masa · ${visible.length} bekleyen kalem`}</div>
        {err && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 12, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13 }}>{err}</div>}

        {stations.length > 0 && (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", marginTop: 14, paddingBottom: 2 }}>
            <button onClick={() => setSelectedStation(ALL)} style={tabBtn(selectedStation === ALL)}>Tümü</button>
            {stations.map((s) => (
              <button key={s.id} onClick={() => setSelectedStation(s.id)} style={tabBtn(selectedStation === s.id)}>{s.name}</button>
            ))}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12, marginTop: 16 }}>
          {tableGroups.map((g) => {
            const oldestMin = Math.max(0, Math.floor(((now || g.oldestSentAt) - g.oldestSentAt) / 60000));
            return (
              <div key={g.tableId} style={{ borderRadius: 16, padding: 16, background: "var(--card)", border: "1px solid var(--line)", boxShadow: "0 1px 2px rgba(30,57,50,.05), 0 6px 16px rgba(30,57,50,.07)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid var(--line)" }}>
                  <span style={{ fontWeight: 600, fontSize: 15, color: "var(--ink-green)" }}>{tableName(g.tableId === "__yok__" ? null : g.tableId)}</span>
                  <span className="tnum" style={{ fontSize: 12, color: oldestMin >= 10 ? "var(--danger)" : "var(--muted)" }}>{oldestMin} dk</span>
                </div>
                {g.items.map((c) => {
                  const stage = c.readyAt ? "hazir" : c.preparingAt ? "hazirlaniyor" : "yeni";
                  const mins = elapsedMin(c.sentAt);
                  const hint = stage === "yeni" ? startHint(c, g.maxPrep) : null;
                  return (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14 }}><span className="tnum">{c.quantity}×</span> {c.name}</div>
                        <div className="tnum" style={{ fontSize: 11, color: mins >= 10 ? "var(--danger)" : "var(--muted-2)" }}>{mins} dk{hint && <span style={{ color: hint === "Şimdi başlat" ? "var(--brand)" : "var(--muted-2)", fontWeight: hint === "Şimdi başlat" ? 700 : 400 }}> · {hint}</span>}</div>
                      </div>
                      {stage === "yeni" && <button onClick={() => setStage(c.id, "preparing_at")} style={stageBtnSm}>Hazırlanıyor</button>}
                      {stage === "hazirlaniyor" && <button onClick={() => setStage(c.id, "ready_at")} style={stageBtnSm}>Hazır</button>}
                      {stage === "hazir" && <button onClick={() => setStage(c.id, "served_at")} style={{ ...stageBtnSm, background: "var(--brand-strong)" }}>Teslim edildi</button>}
                    </div>
                  );
                })}
              </div>
            );
          })}
          {!loading && !err && tableGroups.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, gridColumn: "1 / -1" }}>Bekleyen kalem yok.</div>}
        </div>
      </div>
    </div>
    </StaffLoginGate>
  );
}

const tabBtn = (active: boolean): React.CSSProperties => ({
  flexShrink: 0, border: "none", borderRadius: 980, padding: "8px 16px", fontSize: 13, fontWeight: 600,
  background: active ? "var(--ink-green)" : "var(--card)", color: active ? "#fff" : "var(--ink-green)",
});
const stageBtnSm: React.CSSProperties = { flexShrink: 0, border: "none", borderRadius: 980, padding: "7px 12px", background: "var(--ink-green)", color: "#fff", fontSize: 12.5, fontWeight: 500 };
