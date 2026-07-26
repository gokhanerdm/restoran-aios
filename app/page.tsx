"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getMyRestaurantId } from "@/lib/supabase/restaurant";
import { Plus, Trash2 } from "lucide-react";
import EditableText from "./components/EditableText";
import { toUpperTr, toTitleTr } from "@/lib/text";
import TableOrderPanel from "./components/TableOrderPanel";
import { useConfirm } from "./components/useConfirm";

// Kasa — masa/sipariş ekranı. Eskiden Kasa (düz masa listesi) ve Salonlar (görsel kat planı)
// ayrı sekmelerdi; aynı işi iki farklı görünümde yapıyorlardı. Artık tek ekran: kat planı +
// salon sekmeleri + kasa hareketi (nakit giriş/çıkış) bir arada (Gökhan kararı, 2026-07-13).

type Area = { id: string; name: string; sort_order: number };
type TableStatus = "empty" | "occupied" | "bill_requested" | "reserved";
type TableRow = {
  id: string; name: string; area_id: string | null; status: TableStatus; sort_order: number;
  position_x: number | null; position_y: number | null;
  reservation_note: string | null; merged_into_table_id: string | null;
};
type OrderItem = { id: string; quantity: number; unit_price: number; status: string };
type OrderRow = { id: string; table_id: string | null; opened_at: string; party_size: number; order_items: OrderItem[] };

const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;
const BOX_W = 148;
const BOX_H = 108;
const GAP = 14;
const COLS = 5;
// Masayı bıraktığında en yakın kutu hizasına yapıştırır — yan yana getirince otomatik hizalanır.
const snapCoord = (v: number, size: number) => Math.max(0, GAP + Math.round((v - GAP) / (size + GAP)) * (size + GAP));

export default function KasaPage() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [addingArea, setAddingArea] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeFirst, setMergeFirst] = useState<string | null>(null);
  const [mergeChoice, setMergeChoice] = useState<{ a: TableRow; b: TableRow } | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [addingTable, setAddingTable] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  // Sağ tık menüsü: boş alanda "Masa ekle" (table: null), bir masa üzerinde "Masa sil" (table dolu)
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; table: TableRow | null } | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Kasa hareketi (nakit giriş/çıkış) — eski Kasa ekranının kendine has özelliği
  const [addingCm, setAddingCm] = useState(false);
  const [cmType, setCmType] = useState<"cikis" | "giris">("cikis");
  const [cmAmount, setCmAmount] = useState("");
  const [cmNote, setCmNote] = useState("");
  const [cmMsg, setCmMsg] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const load = useCallback(async () => {
    const restId = await getMyRestaurantId();
    if (!restId) return;
    setRestaurantId(restId);
    const [{ data: a }, { data: t }, { data: o }] = await Promise.all([
      supabase.from("dining_areas").select("id, name, sort_order").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("restaurant_tables").select("id, name, area_id, status, sort_order, position_x, position_y, reservation_note, merged_into_table_id").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("orders").select("id, table_id, opened_at, party_size, order_items(id, quantity, unit_price, status)").eq("restaurant_id", restId).eq("status", "open"),
    ]);
    const areaRows = (a as Area[]) ?? [];
    setAreas(areaRows);
    setTables((t as TableRow[]) ?? []);
    setOrders((o as unknown as OrderRow[]) ?? []);
    setSelectedAreaId((prev) => prev ?? (areaRows.length ? areaRows[0].id : null));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);

  const orderForTable = (tableId: string) => orders.find((o) => o.table_id === tableId) ?? null;
  const orderTotal = (o: OrderRow | null) => (o ? o.order_items.filter((i) => i.status === "active").reduce((s, i) => s + i.quantity * i.unit_price, 0) : 0);
  const durationLabel = (o: OrderRow | null) => {
    if (!o || now == null) return null;
    const mins = Math.max(0, Math.round((now - new Date(o.opened_at).getTime()) / 60000));
    return mins < 60 ? `${mins} dk` : `${Math.floor(mins / 60)}s ${mins % 60}dk`;
  };

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

  const renameArea = async (id: string, name: string) => { await supabase.from("dining_areas").update({ name: toUpperTr(name) }).eq("id", id); await load(); };
  const deleteArea = async (a: Area) => {
    const count = tables.filter((t) => t.area_id === a.id).length;
    if (count > 0) {
      const ok = await confirm(`Bu salonda ${count} masa var. Silersen masalar da silinir. Yine de silinsin mi?`);
      if (!ok) return;
    }
    setErr(null);
    const { error } = await supabase.from("dining_areas").update({ deleted_at: new Date().toISOString() }).eq("id", a.id);
    if (error) { setErr(error.message); return; }
    if (selectedAreaId === a.id) setSelectedAreaId(null);
    await load();
  };
  const addArea = async () => {
    if (!restaurantId || !newAreaName.trim()) return;
    setErr(null);
    const { data, error } = await supabase.from("dining_areas").insert({ restaurant_id: restaurantId, name: toUpperTr(newAreaName), sort_order: areas.length }).select("id").single();
    if (error) { setErr(error.message); return; }
    setNewAreaName(""); setAddingArea(false);
    await load();
    if (data) setSelectedAreaId(data.id);
  };

  const addTable = async () => {
    if (!restaurantId || !selectedAreaId || !newTableName.trim()) return;
    setErr(null);
    const count = tables.filter((t) => t.area_id === selectedAreaId).length;
    const { error } = await supabase.from("restaurant_tables").insert({ restaurant_id: restaurantId, name: toTitleTr(newTableName), area_id: selectedAreaId, status: "empty", sort_order: count });
    if (error) { setErr(error.message); return; }
    setNewTableName(""); setAddingTable(false);
    await load();
  };
  const renameTable = async (id: string, name: string) => {
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").update({ name: toTitleTr(name) }).eq("id", id);
    if (error) { setErr(error.message); return; }
    await load();
  };
  const deleteTable = async (t: TableRow) => {
    const ok = await confirm(`"${t.name}" silinsin mi?`);
    if (!ok) return;
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").update({ deleted_at: new Date().toISOString() }).eq("id", t.id);
    if (error) { setErr(error.message); return; }
    if (selectedTableId === t.id) setSelectedTableId(null);
    await load();
  };
  const moveTable = async (id: string, x: number, y: number) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, position_x: x, position_y: y } : t)));
    const { error } = await supabase.from("restaurant_tables").update({ position_x: x, position_y: y }).eq("id", id);
    if (error) setErr(error.message);
  };
  const reserveTable = async (id: string) => {
    const note = window.prompt("Rezervasyon notu (isim, saat vb. — opsiyonel):", "");
    if (note == null) return; // Vazgeç'e basıldı
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").update({ status: "reserved", reservation_note: note || null }).eq("id", id);
    if (error) { setErr(error.message); return; }
    await load();
  };
  const unreserveTable = async (id: string) => {
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").update({ status: "empty", reservation_note: null }).eq("id", id);
    if (error) { setErr(error.message); return; }
    await load();
  };
  const unmergeTable = async (id: string) => {
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").update({ merged_into_table_id: null }).eq("id", id);
    if (error) { setErr(error.message); return; }
    await load();
  };
  // Kaynağın açık siparişi varsa kalemleri/kişi sayısı hedefe taşınır, kaynak hemen boşalır
  // (bkz. transfer_table_order RPC) — sadece iki boş masa birleşiyorsa eski yönlendirme yeterli.
  const mergeInto = async (sourceId: string, targetId: string) => {
    setErr(null);
    const { error } = await supabase.rpc("transfer_table_order", { p_source_table_id: sourceId, p_target_table_id: targetId });
    if (error) { setErr(error.message); return; }
    setMergeChoice(null);
    await load();
  };

  const handleTableClick = (t: TableRow) => {
    if (mergeMode) {
      if (!mergeFirst) { setMergeFirst(t.id); return; }
      if (mergeFirst === t.id) { setMergeFirst(null); return; }
      const a = tables.find((x) => x.id === mergeFirst);
      if (a) { setMergeChoice({ a, b: t }); setMergeMode(false); setMergeFirst(null); }
      return;
    }
    const target = resolveTarget(t);
    setSelectedTableId(target.id);
  };

  const addCashMove = async () => {
    if (!restaurantId) return;
    const amount = parseFloat(cmAmount.replace(",", ".")) || 0;
    if (amount <= 0) return;
    const { error } = await supabase.from("cash_movements").insert({ restaurant_id: restaurantId, movement_type: cmType, amount, note: cmNote || null });
    if (error) { setCmMsg(error.message); return; }
    setCmMsg(`${cmType === "cikis" ? "Çıkış" : "Giriş"} kaydedildi: ${money(amount)}`);
    setCmAmount(""); setCmNote(""); setAddingCm(false);
  };

  const tablesInArea = tables.filter((t) => t.area_id === selectedAreaId).sort((x, y) => x.sort_order - y.sort_order);
  const defaultPos = (i: number) => ({ x: (i % COLS) * (BOX_W + GAP) + GAP, y: Math.floor(i / COLS) * (BOX_H + GAP) + GAP });
  // Konumu elle sürüklenmiş masalar (position_x/y dolu) sabit kalır. Konumu olmayanlar (yeni eklenenler)
  // sırayla varsayılan grid hücrelerine yerleştirilir ama dolu bir hücreye (sürüklenmiş bir masanın
  // üstüne) denk gelirse bir sonraki boş hücreyi arar — aksi halde yeni masa eskisinin üstüne biniyordu.
  const placed = tablesInArea.filter((t) => t.position_x != null && t.position_y != null)
    .map((t) => ({ table: t, x: t.position_x as number, y: t.position_y as number }));
  const isFree = (x: number, y: number) => !placed.some((p) => Math.abs(p.x - x) < BOX_W / 2 && Math.abs(p.y - y) < BOX_H / 2);
  let nextSlot = 0;
  for (const t of tablesInArea.filter((t) => t.position_x == null || t.position_y == null)) {
    let d = defaultPos(nextSlot);
    while (!isFree(d.x, d.y)) { nextSlot++; d = defaultPos(nextSlot); }
    placed.push({ table: t, x: d.x, y: d.y });
    nextSlot++;
  }
  const positioned = tablesInArea.map((t) => placed.find((p) => p.table.id === t.id)!);
  let addSlot = nextSlot;
  let addBoxPos = defaultPos(addSlot);
  while (!isFree(addBoxPos.x, addBoxPos.y)) { addSlot++; addBoxPos = defaultPos(addSlot); }
  const containerHeight = Math.max(360, ...positioned.map((p) => p.y + BOX_H + GAP), addBoxPos.y + BOX_H + GAP);

  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;
  const doluSayisi = tables.filter((t) => t.status !== "empty" && !t.merged_into_table_id).length;
  const acikToplam = tables.reduce((s, t) => s + orderTotal(orderForTable(t.id)), 0);

  return (
    <div style={{ padding: isMobile ? "16px 14px" : "26px 28px", height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      {confirmDialog}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: isMobile ? 16 : 20, flexWrap: "wrap", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>Kasa</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 7 }}>{doluSayisi} masa dolu · {money(acikToplam)} açık hesap</div>
        </div>
        {!addingCm ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {cmMsg && <span style={{ fontSize: 12.5, color: "var(--brand)" }}>{cmMsg}</span>}
            <button onClick={() => { setAddingCm(true); setCmMsg(null); }} style={{ border: "1px solid var(--line-2)", borderRadius: 980, padding: "7px 14px", background: "var(--card)", color: "var(--ink-green)", fontSize: 12.5, fontWeight: 600 }}>Kasa hareketi</button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {([["cikis", "Çıkış"], ["giris", "Giriş"]] as const).map(([v, l]) => (
              <button key={v} onClick={() => setCmType(v)} style={{ border: "none", borderRadius: 980, padding: "6px 12px", fontSize: 12, background: cmType === v ? "var(--ink-green)" : "var(--recede)", color: cmType === v ? "#fff" : "var(--muted)" }}>{l}</button>
            ))}
            <input value={cmAmount} onChange={(e) => setCmAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCashMove()} placeholder="Tutar ₺" inputMode="decimal" autoFocus style={{ border: "1px solid var(--line-2)", borderRadius: 10, padding: "7px 10px", fontSize: 13, width: 85, background: "var(--card)", color: "var(--ink)", outline: "none" }} />
            <input value={cmNote} onChange={(e) => setCmNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCashMove()} placeholder="Açıklama (manav ödemesi)" style={{ border: "1px solid var(--line-2)", borderRadius: 10, padding: "7px 10px", fontSize: 13, width: 170, background: "var(--card)", color: "var(--ink)", outline: "none" }} />
            <button onClick={addCashMove} style={{ border: "none", borderRadius: 10, padding: "7px 13px", background: "var(--ink-green)", color: "#fff", fontSize: 12.5 }}>Kaydet</button>
            <button onClick={() => { setAddingCm(false); setCmAmount(""); setCmNote(""); }} style={{ border: "none", borderRadius: 10, padding: "7px 10px", background: "transparent", color: "var(--muted)", fontSize: 12.5 }}>Vazgeç</button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 22, flex: 1, minHeight: 0 }}>
        {/* salon menüsü — dar ekranda yatay sekme şeridine döner (masaüstü sol menüyle aynı hizadan taşıp
            kat planının üzerine binmesini önler; telefon zaten /garson mobil modülünü kullanır) */}
        {isMobile ? (
          <div style={{ flexShrink: 0, display: "flex", gap: 8, overflowX: "auto", paddingBottom: 2 }}>
            {areas.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelectedAreaId(a.id)}
                style={{ flexShrink: 0, border: "none", borderRadius: 980, padding: "8px 16px", fontSize: 13, fontWeight: 600, background: selectedAreaId === a.id ? "var(--ink-green)" : "var(--card)", color: selectedAreaId === a.id ? "#fff" : "var(--ink-green)" }}
              >{a.name}</button>
            ))}
            {!addingArea ? (
              <button onClick={() => setAddingArea(true)} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4, border: "1px dashed var(--line-2)", borderRadius: 980, padding: "8px 14px", background: "transparent", color: "var(--muted)", fontSize: 13 }}><Plus size={14} /> Salon</button>
            ) : (
              <div style={{ flexShrink: 0, display: "flex", gap: 6 }}>
                <input value={newAreaName} onChange={(e) => setNewAreaName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addArea()} placeholder="Salon adı" style={{ ...inp, width: 130 }} autoFocus />
                <button onClick={addArea} style={btnSmall}>Ekle</button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ width: 180, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ flex: 1, overflowY: "auto", minHeight: 0, border: "1px solid var(--line)", borderRadius: 16, background: "var(--card)", padding: 6 }}>
              {areas.map((a) => (
                <div key={a.id} style={{ display: "flex", alignItems: "center", borderRadius: 10, background: selectedAreaId === a.id ? "var(--recede)" : "transparent" }}>
                  <div onClick={() => setSelectedAreaId(a.id)} style={{ cursor: "pointer", flex: 1, padding: "10px 10px", fontSize: 13.5, fontWeight: selectedAreaId === a.id ? 600 : 500, color: selectedAreaId === a.id ? "var(--brand)" : "var(--ink)", minWidth: 0 }}>
                    <EditableText value={a.name} onSave={(v) => renameArea(a.id, v)} />
                  </div>
                  <button onClick={() => deleteArea(a)} aria-label="salonu sil" style={{ all: "unset", cursor: "pointer", padding: "0 8px", color: "var(--muted-2)" }}><Trash2 size={12} /></button>
                </div>
              ))}
              {areas.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 12.5, padding: 10 }}>Henüz salon yok</div>}
            </div>
            <div style={{ flexShrink: 0, marginTop: 10 }}>
              {!addingArea ? (
                <button onClick={() => setAddingArea(true)} style={btnSecondary}><Plus size={14} /> Salon ekle</button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <input value={newAreaName} onChange={(e) => setNewAreaName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addArea()} placeholder="Salon adı" style={inp} autoFocus />
                  <button onClick={addArea} style={btnSmall}>Ekle</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* kat planı — sol menüyle aynı hizada başlar */}
        <div style={{ flex: 1.6, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ position: "relative", flex: 1, overflow: "auto", border: "1px solid var(--line)", borderRadius: 16, background: "var(--card)" }}>
            <div
              style={{ position: "relative", width: "100%", height: containerHeight }}
              onContextMenu={(e) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, table: null }); }}
            >
              {positioned.map(({ table: t, x, y }) => (
                <TableBox
                  key={t.id}
                  table={t}
                  x={x}
                  y={y}
                  order={orderForTable(t.id)}
                  targetName={t.merged_into_table_id ? (tables.find((x2) => x2.id === t.merged_into_table_id)?.name ?? null) : null}
                  selected={selectedTableId === resolveTarget(t).id}
                  mergeSelected={mergeFirst === t.id}
                  mergeMode={mergeMode}
                  durationLabel={durationLabel(orderForTable(t.id))}
                  total={orderTotal(orderForTable(t.id))}
                  onClick={() => handleTableClick(t)}
                  onMove={moveTable}
                  onDelete={() => deleteTable(t)}
                  onRename={(v) => renameTable(t.id, v)}
                  onReserve={() => reserveTable(t.id)}
                  onUnreserve={() => unreserveTable(t.id)}
                  onUnmerge={() => unmergeTable(t.id)}
                  onContextMenu={(x2, y2) => setCtxMenu({ x: x2, y: y2, table: t })}
                />
              ))}
              {/* Masa ekleme artık sağ tık menüsünden — burada sadece form açılınca görünür. */}
              {addingTable && (
                <div
                  style={{
                    position: "absolute", left: addBoxPos.x, top: addBoxPos.y, width: BOX_W, height: BOX_H,
                    border: "1px solid var(--line-2)", borderRadius: 14, background: "var(--card)", boxSizing: "border-box",
                    display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "center", gap: 6, padding: 10,
                  }}
                >
                  <input
                    value={newTableName}
                    onChange={(e) => setNewTableName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") addTable(); if (e.key === "Escape") { setAddingTable(false); setNewTableName(""); } }}
                    placeholder="Masa 9"
                    style={{ ...inp, fontSize: 13, padding: "6px 8px" }}
                    autoFocus
                  />
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={addTable} style={{ ...btnSmall, flex: 1, fontSize: 12.5, padding: "6px 8px" }}>Ekle</button>
                    <button onClick={() => { setAddingTable(false); setNewTableName(""); }} style={{ ...btnSecondary, width: "auto", flex: 1, fontSize: 12.5, padding: "6px 8px" }}>Vazgeç</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, flexShrink: 0 }}>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{tablesInArea.length} masa</div>
            <button
              onClick={() => { setMergeMode((m) => !m); setMergeFirst(null); }}
              style={{ ...btnSecondary, width: "auto", background: mergeMode ? "var(--ink-green)" : "var(--card)", color: mergeMode ? "#fff" : "var(--ink-green)" }}
            >
              {mergeMode ? "Birleştirmeyi iptal et" : "Masa birleştir"}
            </button>
          </div>
          {mergeMode && <div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 8, flexShrink: 0 }}>İki masaya sırayla tıkla, sonra hangisinde birleşeceğini seç.</div>}
          {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginTop: 8, flexShrink: 0 }}>{err}</div>}
        </div>

        {/* sipariş paneli — masaüstünde sabit sütun */}
        {!isMobile && (
          <div style={{ flexShrink: 0 }}>
            <TableOrderPanel
              restaurantId={restaurantId}
              table={selectedTable ? { id: selectedTable.id, name: selectedTable.name, status: selectedTable.status } : null}
              onChanged={load}
              onClosed={() => setSelectedTableId(null)}
            />
          </div>
        )}
      </div>

      {/* sipariş paneli — mobilde alttan açılan panel */}
      {isMobile && selectedTable && (
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

      {ctxMenu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} />
          <div style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 61, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 8px 24px rgba(30,25,15,0.18)", padding: 6, minWidth: 160 }}>
            {!ctxMenu.table ? (
              <button
                onClick={() => { setCtxMenu(null); setAddingTable(true); setErr(null); }}
                style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, fontSize: 13.5, color: "var(--ink)" }}
              >
                <Plus size={14} /> Masa ekle
              </button>
            ) : ctxMenu.table.status === "occupied" || ctxMenu.table.status === "bill_requested" ? (
              <div style={{ padding: "9px 12px", fontSize: 12.5, color: "var(--muted-2)", maxWidth: 200 }}>Bu masa dolu — silmeden önce hesabı kapatın.</div>
            ) : (
              <button
                onClick={() => { const t = ctxMenu.table!; setCtxMenu(null); deleteTable(t); }}
                style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, fontSize: 13.5, color: "var(--danger)" }}
              >
                <Trash2 size={14} /> Masa sil
              </button>
            )}
          </div>
        </>
      )}

      {mergeChoice && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(30,25,15,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setMergeChoice(null)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, minWidth: 300 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--ink-green)" }}>Hangi masada birleşsin?</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14 }}>{mergeChoice.a.name} ve {mergeChoice.b.name} birleşecek.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => mergeInto(mergeChoice.b.id, mergeChoice.a.id)} style={{ ...btnPrimary, flex: 1 }}>{mergeChoice.a.name}</button>
              <button onClick={() => mergeInto(mergeChoice.a.id, mergeChoice.b.id)} style={{ ...btnPrimary, flex: 1 }}>{mergeChoice.b.name}</button>
            </div>
            <button onClick={() => setMergeChoice(null)} style={{ ...btnSecondary, marginTop: 12 }}>İptal</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TableBox({
  table, x, y, order, targetName, selected, mergeSelected, mergeMode, durationLabel, total,
  onClick, onMove, onDelete, onRename, onReserve, onUnreserve, onUnmerge, onContextMenu,
}: {
  table: TableRow; x: number; y: number; order: OrderRow | null; targetName: string | null;
  selected: boolean; mergeSelected: boolean; mergeMode: boolean; durationLabel: string | null; total: number;
  onClick: () => void; onMove: (id: string, x: number, y: number) => void; onDelete: () => void; onRename: (v: string) => void;
  onReserve: () => void; onUnreserve: () => void; onUnmerge: () => void; onContextMenu: (x: number, y: number) => void;
}) {
  const [hover, setHover] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const startRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const merged = !!table.merged_into_table_id;
  const occupied = table.status === "occupied" || table.status === "bill_requested";
  const reserved = table.status === "reserved";

  const dotColor = merged ? "var(--muted-2)" : table.status === "bill_requested" ? "var(--gold)" : table.status === "occupied" ? "var(--brand)" : reserved ? "var(--info)" : "var(--muted-2)";

  const onPointerDown = (e: React.PointerEvent) => {
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* dokunmatik/senkron olmayan işaretçilerde yakalama başarısız olabilir, sürükleme yine de çalışır */ }
    startRef.current = { x: e.clientX, y: e.clientY, moved: false };
    // Birleştirme modunda sürükleme tamamen kapalı — aksi halde tıklarken 4px'ten fazla
    // kayan bir parmak/mouse "sürükleme" sayılıp masa birleştirme seçimi yerine yer değiştiriyordu.
    if (!mergeMode) setDragOffset({ dx: 0, dy: 0 });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current || mergeMode) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) startRef.current.moved = true;
    setDragOffset({ dx, dy });
  };
  const onPointerUp = () => {
    if (!startRef.current) return;
    const moved = startRef.current.moved;
    const dx = dragOffset?.dx ?? 0;
    const dy = dragOffset?.dy ?? 0;
    startRef.current = null;
    setDragOffset(null);
    if (mergeMode) { onClick(); return; }
    if (moved) onMove(table.id, snapCoord(x + dx, BOX_W), snapCoord(y + dy, BOX_H));
    else onClick();
  };

  const curX = x + (dragOffset?.dx ?? 0);
  const curY = y + (dragOffset?.dy ?? 0);

  return (
    <div
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e.clientX, e.clientY); }}
      style={{
        position: "absolute", left: curX, top: curY, width: BOX_W, height: BOX_H, borderRadius: 14, padding: 12,
        cursor: mergeMode ? "pointer" : "grab", touchAction: "none", userSelect: "none",
        background: occupied ? "var(--card)" : reserved ? "var(--info-bg)" : "var(--recede)",
        border: mergeSelected ? "2px solid var(--ink-green)" : selected ? "2px solid var(--brand)" : "1px solid var(--line)",
        boxSizing: "border-box", opacity: merged ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
        <div style={{ fontWeight: 600, fontSize: 14, minWidth: 0, flex: 1 }} onPointerDown={(e) => e.stopPropagation()}>
          <EditableText value={table.name} onSave={onRename} />
        </div>
      </div>

      {merged ? (
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 14 }}>→ {targetName ?? "?"}</div>
      ) : occupied ? (
        <>
          <div className="tnum" style={{ fontSize: 17, fontWeight: 600, color: "var(--ink-green)", marginTop: 10 }}>{money(total)}</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            <span>{order?.party_size ?? 1} kişi</span>
            <span className="tnum">{durationLabel}</span>
          </div>
        </>
      ) : reserved ? (
        <div style={{ fontSize: 12, color: "var(--info)", marginTop: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{table.reservation_note || "Rezerve"}</div>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--muted-2)", marginTop: 14 }}>Boş</div>
      )}

      {hover && !mergeMode && (
        <div style={{ position: "absolute", bottom: 6, right: 6, display: "flex", gap: 4 }} onPointerDown={(e) => e.stopPropagation()}>
          {merged && <button onClick={onUnmerge} title="Ayır" style={miniBtn}>Ayır</button>}
          {!merged && !occupied && !reserved && <button onClick={onReserve} title="Rezerve et" style={miniBtn}>Rzv</button>}
          {!merged && reserved && <button onClick={onUnreserve} title="Rezervasyonu kaldır" style={miniBtn}>Kaldır</button>}
          {!merged && !occupied && <button onClick={onDelete} title="Sil" style={miniBtn}><Trash2 size={11} /></button>}
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "9px 12px", fontSize: 14, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0 };
const btnSecondary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 16px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13, width: "100%", justifyContent: "center" };
const btnSmall: React.CSSProperties = { border: "none", borderRadius: 10, padding: "9px 14px", background: "var(--ink-green)", color: "#fff", fontSize: 13.5 };
const btnPrimary: React.CSSProperties = { border: "none", borderRadius: 980, padding: "10px 18px", background: "var(--brand-strong)", color: "#fff", fontSize: 14, fontWeight: 500 };
const miniBtn: React.CSSProperties = { border: "none", borderRadius: 8, padding: "4px 7px", background: "var(--ink-green)", color: "#fff", fontSize: 10.5, cursor: "pointer" };
