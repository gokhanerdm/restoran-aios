"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import TableOrderPanel from "../components/TableOrderPanel";

// Garson mobil modülü — el terminali/telefon için tek işi var: masa seç, sipariş al, hesap kapat.
// Salonlar ekranındaki AYNI salon/masa yapısını kullanır (dining_areas + restaurant_tables.area_id)
// ki garson PC'deki kat planında ne görüyorsa telefonda da onu görsün. Yönetim ekranlarının
// (Raporlar, Stok, Ayarlar vb.) hiçbiri burada yok (bkz. Shell.tsx yönlendirmesi); masa ekleme/
// taşıma/birleştirme gibi düzenleme işleri Salonlar'da (PC) kalır, burada sadece sipariş alınır.
// Bugün girişsiz (PIN yok); Faz 2'de garson kendi şifresiyle girip yetkili olduğu masaları görecek.

type Area = { id: string; name: string; sort_order: number };
type TableStatus = "empty" | "occupied" | "bill_requested" | "reserved";
type TableRow = {
  id: string; name: string; area_id: string | null; status: TableStatus;
  reservation_note: string | null; merged_into_table_id: string | null;
};
type OrderItem = { id: string; quantity: number; unit_price: number; status: string };
type Order = { id: string; table_id: string | null; order_items: OrderItem[] };

const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;
const ALL = "__all__";

export default function GarsonPage() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  // null = henüz seçim yapılmadı → ilk salon varsayılan olur (Salonlar ekranıyla aynı davranış)
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    // Ağ isteği hiç cevap vermeden asılı kalırsa (bağlantı sorunu) 10sn sonra hata göster —
    // aksi halde "Yükleniyor…" sonsuza kadar takılı kalıyordu.
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Bağlantı zaman aşımına uğradı — internete bağlı mısın?")), 10000));
    try {
      const { data: rest, error: restErr } = await Promise.race([
        supabase.from("restaurants").select("id").is("deleted_at", null).limit(1).single(),
        timeout,
      ]);
      if (restErr) { setErr(`İşletme bilgisi çekilemedi: ${restErr.message}`); setLoading(false); return; }
      if (!rest) { setErr("İşletme bulunamadı."); setLoading(false); return; }
      setRestaurantId(rest.id);
      const [{ data: a, error: aErr }, { data: t, error: tErr }, { data: o, error: oErr }] = await Promise.race([
        Promise.all([
          supabase.from("dining_areas").select("id, name, sort_order").eq("restaurant_id", rest.id).is("deleted_at", null).order("sort_order"),
          supabase.from("restaurant_tables").select("id, name, area_id, status, reservation_note, merged_into_table_id").eq("restaurant_id", rest.id).is("deleted_at", null).order("sort_order"),
          supabase.from("orders").select("id, table_id, order_items(id, quantity, unit_price, status)").eq("restaurant_id", rest.id).eq("status", "open"),
        ]),
        timeout,
      ]);
      if (aErr || tErr || oErr) { setErr(`Masalar çekilemedi: ${(aErr ?? tErr ?? oErr)?.message}`); setLoading(false); return; }
      const areaRows = (a as Area[]) ?? [];
      setAreas(areaRows);
      setSelectedAreaId((prev) => prev ?? (areaRows.length ? areaRows[0].id : ALL));
      // "Öksüz" masaları at: area_id dolu ama o alan silinmişse (Salonlar ekranı da bunları hiç göstermez).
      const areaIds = new Set(areaRows.map((x) => x.id));
      setTables(((t as TableRow[]) ?? []).filter((row) => row.area_id && areaIds.has(row.area_id)));
      setOrders((o as unknown as Order[]) ?? []);
      setLoading(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu.");
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const orderForTable = (tableId: string) => orders.find((o) => o.table_id === tableId) ?? null;
  const orderTotal = (order: Order | null) =>
    order ? order.order_items.filter((i) => i.status === "active").reduce((s, i) => s + i.quantity * i.unit_price, 0) : 0;

  // Masa başka bir masaya birleştirildiyse hesabın açık olduğu hedef masayı bul (Salonlar ile aynı mantık).
  const resolveTarget = (t: TableRow): TableRow => {
    let cur = t;
    const seen = new Set<string>();
    while (cur.merged_into_table_id && !seen.has(cur.id)) {
      seen.add(cur.id);
      const next = tables.find((x) => x.id === cur.merged_into_table_id);
      if (!next) break;
      cur = next;
    }
    return cur;
  };

  const visibleTables = selectedAreaId === ALL ? tables : tables.filter((t) => t.area_id === selectedAreaId);
  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;
  const doluSayisi = tables.filter((t) => t.status !== "empty" && !t.merged_into_table_id).length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--canvas)" }}>
      <div style={{ padding: "18px 16px 90px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.4px", color: "var(--ink-green)" }}>Siparişler</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>{loading ? "Yükleniyor…" : `${doluSayisi} masa dolu`}</div>
          </div>
          {err && <button onClick={() => { setLoading(true); load(); }} style={{ border: "1px solid var(--line-2)", borderRadius: 980, padding: "7px 14px", background: "var(--card)", color: "var(--ink-green)", fontSize: 12.5, fontWeight: 600 }}>Yenile</button>}
        </div>
        {err && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 12, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13 }}>{err}</div>}

        {areas.length > 0 && (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", marginTop: 14, paddingBottom: 2 }}>
            <button
              onClick={() => setSelectedAreaId(ALL)}
              style={{ flexShrink: 0, border: "none", borderRadius: 980, padding: "8px 16px", fontSize: 13, fontWeight: 600, background: selectedAreaId === ALL ? "var(--ink-green)" : "var(--card)", color: selectedAreaId === ALL ? "#fff" : "var(--ink-green)" }}
            >Tümü</button>
            {areas.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelectedAreaId(a.id)}
                style={{ flexShrink: 0, border: "none", borderRadius: 980, padding: "8px 16px", fontSize: 13, fontWeight: 600, background: selectedAreaId === a.id ? "var(--ink-green)" : "var(--card)", color: selectedAreaId === a.id ? "#fff" : "var(--ink-green)" }}
              >{a.name}</button>
            ))}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))", gap: 10, marginTop: 16 }}>
          {visibleTables.map((t) => {
            const ord = orderForTable(t.id);
            const total = orderTotal(ord);
            const merged = !!t.merged_into_table_id;
            const occupied = t.status === "occupied" || t.status === "bill_requested";
            const bill = t.status === "bill_requested";
            const reserved = t.status === "reserved";
            const dotColor = merged ? "var(--muted-2)" : bill ? "var(--gold)" : occupied ? "var(--brand)" : reserved ? "var(--info)" : "var(--muted-2)";
            return (
              <button
                key={t.id}
                onClick={() => setSelectedTableId(resolveTarget(t).id)}
                style={{
                  textAlign: "left", borderRadius: 16, padding: 14, minHeight: 88, border: "none",
                  background: merged ? "var(--recede)" : occupied ? "var(--card)" : reserved ? "var(--info-bg)" : "var(--recede)",
                  boxShadow: occupied && !merged ? "0 1px 2px rgba(30,57,50,.05), 0 6px 16px rgba(30,57,50,.07)" : "none",
                  opacity: merged ? 0.6 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, fontSize: 14, color: occupied ? "var(--ink)" : "var(--muted-2)" }}>{t.name}</span>
                </div>
                {merged ? (
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 12 }}>→ {tables.find((x) => x.id === t.merged_into_table_id)?.name ?? "?"}</div>
                ) : occupied ? (
                  <>
                    <div className="tnum" style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.3px", color: "var(--ink-green)", marginTop: 14 }}>{money(total)}</div>
                    <div style={{ fontSize: 11.5, color: bill ? "var(--gold-text)" : "var(--muted)", marginTop: 3 }}>{bill ? "hesap istedi" : "açık"}</div>
                  </>
                ) : reserved ? (
                  <div style={{ fontSize: 11.5, color: "var(--info)", marginTop: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.reservation_note || "Rezerve"}</div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 26 }}>Boş</div>
                )}
              </button>
            );
          })}
          {!loading && !err && visibleTables.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, gridColumn: "1 / -1" }}>Bu salonda henüz masa yok.</div>}
        </div>
      </div>

      {selectedTable && (
        <>
          <div
            className="backdrop-fade-in"
            onClick={() => setSelectedTableId(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", zIndex: 40 }}
          />
          <div className="sheet-slide-up" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50 }}>
            <TableOrderPanel
              variant="sheet"
              restaurantId={restaurantId}
              table={{ id: selectedTable.id, name: selectedTable.name, status: selectedTable.status }}
              onChanged={load}
              onClosed={() => setSelectedTableId(null)}
            />
          </div>
        </>
      )}
    </div>
  );
}
