"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { getMyReservationRestaurantId } from "@/lib/supabase/reservationAccount";
import { toUpperTr, toTitleTr } from "@/lib/text";
import EditableText from "../../components/EditableText";
import { useConfirm } from "../../components/useConfirm";

// REZERVASYON > SALON — görsel masa planı (Gökhan, 2026-08-04: "sürükleyip yerleştirebileceğim,
// salon düzeninin aynısını yapabileceğim bir ekran"). AIOS'un Kasa/Adisyon ekranındaki kat planıyla
// (app/page.tsx) BİREBİR AYNI mekanik — sürükleme, grid'e yapışma, sağ tık menüsü — buradan kopyalandı.
// Fark: burada para/adisyon/sipariş yok. Masa sadece boş/rezerve/dolu durumunu gösterir; dolu/rezerve
// olan masada BUGÜN kimin olduğu (reservations'tan) ayrıca gösterilir.
//
// Aynı restaurant_tables/dining_areas tabloları — Ayarlar'daki liste editörüyle aynı veriyi
// paylaşıyor, position_x/position_y de zaten AIOS'tan beri var olan kolonlar, yeni migration
// gerekmedi. Ayarlar'daki liste duruyor (hızlı toplu ekleme için), bu ekran görsel yerleşim için.

type Area = { id: string; name: string; sort_order: number };
type Shape = "yuvarlak" | "kare" | "dikdortgen";
type TableRow = {
  id: string; name: string; area_id: string | null; status: string; sort_order: number;
  position_x: number | null; position_y: number | null; seat_count: number; shape: Shape;
};
type OturanBilgi = { guestName: string; partySize: number };

// Masa eklerken seçilen şekil+kişi sayısı ön tanımları (Gökhan, 2026-08-04: "kart değil
// masa şekli çıksın"). Konsepte göre otomatik öneri şimdilik yok — seçim elle, ileride
// concept_templates'e bağlanabilir.
const MASA_ONTANIMLARI: { shape: Shape; seats: number; label: string }[] = [
  { shape: "yuvarlak", seats: 2, label: "Yuvarlak · 2" },
  { shape: "yuvarlak", seats: 4, label: "Yuvarlak · 4" },
  { shape: "kare", seats: 4, label: "Kare · 4" },
  { shape: "dikdortgen", seats: 6, label: "Dikdörtgen · 6" },
  { shape: "dikdortgen", seats: 8, label: "Dikdörtgen · 8" },
];
// Şekle göre kutu köşe yuvarlaklığı — gerçek daire/dikdörtgen değil (grid hizası bozulmasın
// diye kutu boyutu hep BOX_W×BOX_H sabit), ama üç şekil görsel olarak ayırt edilebiliyor.
const SEKIL_RADIUS: Record<Shape, number> = { yuvarlak: 999, kare: 14, dikdortgen: 6 };

const BOX_W = 148;
const BOX_H = 108;
const GAP = 14;
const COLS = 5;
const snapCoord = (v: number, size: number) => Math.max(0, GAP + Math.round((v - GAP) / (size + GAP)) * (size + GAP));

const bugunIstanbul = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const bugunSiniri = () => {
  const gun = bugunIstanbul();
  const start = `${gun}T00:00:00+03:00`;
  const d = new Date(`${gun}T12:00:00+03:00`);
  d.setDate(d.getDate() + 1);
  const end = `${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d)}T00:00:00+03:00`;
  return { start, end };
};

export default function SalonPage() {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [oturanlar, setOturanlar] = useState<Record<string, OturanBilgi>>({});
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [addingArea, setAddingArea] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [addingTable, setAddingTable] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [newTableSecim, setNewTableSecim] = useState(0); // MASA_ONTANIMLARI içindeki index
  const [koltukInput, setKoltukInput] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; table: TableRow | null } | null>(null);

  useEffect(() => {
    let active = true;
    getMyReservationRestaurantId().then((id) => {
      if (!active) return;
      if (!id) { router.replace("/rezervasyon/giris"); return; }
      setRestaurantId(id);
    });
    return () => { active = false; };
  }, [router]);

  const load = useCallback(async (restId: string) => {
    const { start, end } = bugunSiniri();
    const [{ data: a }, { data: t }, { data: r }] = await Promise.all([
      supabase.from("dining_areas").select("id, name, sort_order").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("restaurant_tables").select("id, name, area_id, status, sort_order, position_x, position_y, seat_count, shape").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("reservations").select("table_id, guest_name, party_size").eq("restaurant_id", restId).eq("status", "oturdu")
        .gte("reserved_at", start).lt("reserved_at", end),
    ]);
    const areaRows = (a as Area[]) ?? [];
    setAreas(areaRows);
    setTables((t as TableRow[]) ?? []);
    const map: Record<string, OturanBilgi> = {};
    ((r as { table_id: string | null; guest_name: string; party_size: number }[]) ?? []).forEach((row) => {
      if (row.table_id) map[row.table_id] = { guestName: row.guest_name, partySize: row.party_size };
    });
    setOturanlar(map);
    setSelectedAreaId((prev) => prev ?? (areaRows.length ? areaRows[0].id : null));
  }, []);

  useEffect(() => { if (restaurantId) load(restaurantId); }, [restaurantId, load]);
  useEffect(() => {
    if (!restaurantId) return;
    const id = setInterval(() => load(restaurantId), 6000);
    return () => clearInterval(id);
  }, [restaurantId, load]);

  const renameArea = async (id: string, name: string) => { await supabase.from("dining_areas").update({ name: toUpperTr(name) }).eq("id", id); if (restaurantId) await load(restaurantId); };
  const deleteArea = async (a: Area) => {
    const count = tables.filter((t) => t.area_id === a.id).length;
    if (count > 0) {
      const ok = await confirm(`Bu salonda ${count} masa var. Silersen masalar da silinir. Yine de silinsin mi?`, { confirmLabel: "Sil" });
      if (!ok) return;
    }
    setErr(null);
    const { error } = await supabase.from("dining_areas").update({ deleted_at: new Date().toISOString() }).eq("id", a.id);
    if (error) { setErr(error.message); return; }
    if (selectedAreaId === a.id) setSelectedAreaId(null);
    if (restaurantId) await load(restaurantId);
  };
  const addArea = async () => {
    if (!restaurantId || !newAreaName.trim()) return;
    setErr(null);
    const { data, error } = await supabase.from("dining_areas").insert({ restaurant_id: restaurantId, name: toUpperTr(newAreaName), sort_order: areas.length }).select("id").single();
    if (error) { setErr(error.message); return; }
    setNewAreaName(""); setAddingArea(false);
    await load(restaurantId);
    if (data) setSelectedAreaId(data.id);
  };

  const addTable = async () => {
    if (!restaurantId || !selectedAreaId || !newTableName.trim()) return;
    setErr(null);
    const count = tables.filter((t) => t.area_id === selectedAreaId).length;
    const secim = MASA_ONTANIMLARI[newTableSecim];
    const { error } = await supabase.from("restaurant_tables").insert({
      restaurant_id: restaurantId, name: toTitleTr(newTableName), area_id: selectedAreaId, status: "empty", sort_order: count,
      shape: secim.shape, seat_count: secim.seats,
    });
    if (error) { setErr(error.message); return; }
    setNewTableName(""); setNewTableSecim(0); setAddingTable(false);
    await load(restaurantId);
  };
  const renameTable = async (id: string, name: string) => {
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").update({ name: toTitleTr(name) }).eq("id", id);
    if (error) { setErr(error.message); return; }
    if (restaurantId) await load(restaurantId);
  };
  const saveSeatCount = async (id: string) => {
    const n = parseInt(koltukInput, 10);
    if (!Number.isFinite(n) || n < 1 || n > 50) { setErr("Koltuk sayısı 1 ile 50 arasında olmalı."); return; }
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").update({ seat_count: n }).eq("id", id);
    if (error) { setErr(error.message); return; }
    setCtxMenu(null);
    if (restaurantId) await load(restaurantId);
  };
  const deleteTable = async (t: TableRow) => {
    if (t.status !== "empty") { setErr("Dolu ya da rezerve bir masa silinemez — önce boşalması gerekiyor."); return; }
    const ok = await confirm(`"${t.name}" silinsin mi?`, { confirmLabel: "Sil" });
    if (!ok) return;
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").update({ deleted_at: new Date().toISOString() }).eq("id", t.id);
    if (error) { setErr(error.message); return; }
    if (restaurantId) await load(restaurantId);
  };
  const moveTable = async (id: string, x: number, y: number) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, position_x: x, position_y: y } : t)));
    const { error } = await supabase.from("restaurant_tables").update({ position_x: x, position_y: y }).eq("id", id);
    if (error) setErr(error.message);
  };

  const tablesInArea = tables.filter((t) => t.area_id === selectedAreaId).sort((x, y) => x.sort_order - y.sort_order);
  const defaultPos = (i: number) => ({ x: (i % COLS) * (BOX_W + GAP) + GAP, y: Math.floor(i / COLS) * (BOX_H + GAP) + GAP });
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

  const toplamKoltuk = tables.reduce((s, t) => s + t.seat_count, 0);
  const doluSayisi = tables.filter((t) => t.status !== "empty").length;

  if (!restaurantId) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--canvas)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 380, textAlign: "center", fontSize: 13.5, color: err ? "var(--danger)" : "var(--muted)", lineHeight: 1.6 }}>{err ?? "Yükleniyor…"}</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 24px", height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box", overflow: "hidden", background: "var(--canvas)" }}>
      {confirmDialog}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexShrink: 0 }}>
        <Link href="/rezervasyon" aria-label="Rezervasyon listesine dön" style={{ ...navBtn, textDecoration: "none" }}><ArrowLeft size={18} /></Link>
        <div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>Salon</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>{doluSayisi}/{tables.length} masa dolu · {toplamKoltuk} koltuk</div>
        </div>
        <div style={{ flex: 1 }} />
        {/* Sağ tık gizli kalıyordu (Gökhan: "masa ekleyemiyorum", "masa ekleyi sağ üste koy")
            — görünür buton başlıkta, sağ tık da hâlâ çalışıyor. */}
        <button
          onClick={() => { if (!selectedAreaId) return; setAddingTable(true); setErr(null); }}
          disabled={!selectedAreaId}
          style={{ ...btnSmall, opacity: !selectedAreaId ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          <Plus size={14} /> Masa ekle
        </button>
      </div>

      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10, flexShrink: 0 }}>{err}</div>}

      <div style={{ display: "flex", gap: 20, flex: 1, minHeight: 0 }}>
        {/* Salon menüsü — Kasa'daki desenle aynı: tıkla geç, çift tıkla düzenle, sil. */}
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

        {/* Kat planı — sürükle bırak, sağ tık menü. */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ position: "relative", flex: 1, overflow: "auto", border: "1px solid var(--line)", borderRadius: 16, background: "var(--card)" }}>
            {!selectedAreaId ? (
              <div style={{ padding: 24, color: "var(--muted-2)", fontSize: 13 }}>Önce solda bir salon seç ya da ekle.</div>
            ) : (
              <div style={{ position: "relative", width: "100%", height: containerHeight }}>
                {positioned.map(({ table: t, x, y }) => (
                  <TableBox
                    key={t.id}
                    table={t}
                    x={x} y={y}
                    oturan={oturanlar[t.id] ?? null}
                    onMove={moveTable}
                    onRename={(v) => renameTable(t.id, v)}
                    onContextMenu={(x2, y2) => { setKoltukInput(String(t.seat_count ?? 4)); setCtxMenu({ x: x2, y: y2, table: t }); }}
                  />
                ))}
              </div>
            )}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 10, flexShrink: 0 }}>{tablesInArea.length} masa · boş bir yere sağ tıklayıp da ekleyebilirsin</div>
        </div>
      </div>

      {ctxMenu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} />
          <div style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 61, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 8px 24px rgba(30,25,15,0.18)", padding: 6, minWidth: 160 }}>
            {ctxMenu.table && (
              <>
                <div style={{ padding: "8px 12px 9px" }}>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 5 }}>Koltuk sayısı</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      value={koltukInput}
                      onChange={(e) => setKoltukInput(e.target.value.replace(/\D/g, ""))}
                      onKeyDown={(e) => e.key === "Enter" && saveSeatCount(ctxMenu.table!.id)}
                      inputMode="numeric" autoFocus className="tnum"
                      style={{ border: "1px solid var(--line-2)", borderRadius: 8, padding: "6px 8px", fontSize: 13, width: 56, background: "var(--card)", color: "var(--ink)", outline: "none" }}
                    />
                    <button onClick={() => saveSeatCount(ctxMenu.table!.id)} style={{ border: "none", borderRadius: 8, padding: "6px 12px", background: "var(--ink-green)", color: "#fff", fontSize: 12.5, cursor: "pointer" }}>Kaydet</button>
                  </div>
                </div>
                {ctxMenu.table.status !== "empty" ? (
                  <div style={{ padding: "9px 12px", fontSize: 12.5, color: "var(--muted-2)", maxWidth: 200, borderTop: "1px solid var(--line)" }}>
                    Bu masa {ctxMenu.table.status === "occupied" ? "dolu" : "rezerve"} — silmeden önce boşalması gerekiyor.
                  </div>
                ) : (
                  <button
                    onClick={() => { const t = ctxMenu.table!; setCtxMenu(null); deleteTable(t); }}
                    style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, fontSize: 13.5, color: "var(--danger)", borderTop: "1px solid var(--line)" }}
                  >
                    <Trash2 size={14} /> Masa sil
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* MASA EKLE KATMANI — kart değil, gerçek masa şekli seçiliyor (Gökhan, 2026-08-04:
          "masa ekle deyince kart değil masa şekli çıksın"). Şekil × kişi sayısı ön tanımlı
          5 seçenek, her biri kendi görseliyle (yuvarlak/kare/dikdörtgen). */}
      {addingTable && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => { setAddingTable(false); setNewTableName(""); }}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, minWidth: 340, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 14 }}>Masa ekle</div>
            {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{err}</div>}

            <input
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addTable(); if (e.key === "Escape") { setAddingTable(false); setNewTableName(""); } }}
              placeholder="Masa adı (Masa 9, Teras 2…)" style={inp} autoFocus
            />

            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 14, marginBottom: 8 }}>Masa şekli</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {MASA_ONTANIMLARI.map((secim, i) => (
                <button
                  key={secim.label}
                  onClick={() => setNewTableSecim(i)}
                  style={{
                    all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                    padding: 10, borderRadius: 12,
                    border: newTableSecim === i ? "2px solid var(--brand-strong)" : "1px solid var(--line-2)",
                    background: newTableSecim === i ? "var(--recede)" : "transparent",
                  }}
                >
                  <div style={{
                    width: secim.shape === "dikdortgen" ? 44 : 32, height: secim.shape === "yuvarlak" ? 32 : secim.shape === "kare" ? 32 : 26,
                    borderRadius: SEKIL_RADIUS[secim.shape], background: "var(--tan-300)", border: "1px solid var(--line-2)",
                  }} />
                  <span style={{ fontSize: 11, color: "var(--ink)", whiteSpace: "nowrap" }}>{secim.label}</span>
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => { setAddingTable(false); setNewTableName(""); }} style={btnSecondary}>Vazgeç</button>
              <button onClick={addTable} disabled={!newTableName.trim()} style={{ border: "none", borderRadius: 980, padding: "9px 16px", background: "var(--brand-strong)", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: !newTableName.trim() ? 0.5 : 1 }}>Ekle</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TableBox({
  table, x, y, oturan, onMove, onRename, onContextMenu,
}: {
  table: TableRow; x: number; y: number; oturan: OturanBilgi | null;
  onMove: (id: string, x: number, y: number) => void; onRename: (v: string) => void; onContextMenu: (x: number, y: number) => void;
}) {
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const startRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const occupied = table.status === "occupied";
  const reserved = table.status === "reserved";
  const dotColor = occupied ? "var(--brand)" : reserved ? "var(--info)" : "var(--muted-2)";

  const onPointerDown = (e: React.PointerEvent) => {
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* dokunmatik/senkron olmayan işaretçilerde yakalama başarısız olabilir, sürükleme yine de çalışır */ }
    startRef.current = { x: e.clientX, y: e.clientY, moved: false };
    setDragOffset({ dx: 0, dy: 0 });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
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
    if (moved) onMove(table.id, snapCoord(x + dx, BOX_W), snapCoord(y + dy, BOX_H));
  };

  const curX = x + (dragOffset?.dx ?? 0);
  const curY = y + (dragOffset?.dy ?? 0);

  return (
    <div
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e.clientX, e.clientY); }}
      style={{
        position: "absolute", left: curX, top: curY, width: BOX_W, height: BOX_H, borderRadius: SEKIL_RADIUS[table.shape] ?? 14, padding: 12,
        cursor: "grab", touchAction: "none", userSelect: "none",
        background: occupied ? "var(--tan-300)" : reserved ? "var(--info-bg)" : "var(--recede)",
        border: "1px solid var(--line)", boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
        <div style={{ fontWeight: 600, fontSize: 14, minWidth: 0, flex: 1 }} onPointerDown={(e) => e.stopPropagation()}>
          <EditableText value={table.name} onSave={onRename} />
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 2 }} className="tnum">{table.seat_count} kişilik</div>
      {occupied ? (
        <div style={{ fontSize: 12, color: "var(--ink-green)", fontWeight: 600, marginTop: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {oturan ? `${oturan.guestName} · ${oturan.partySize} kişi` : "Dolu"}
        </div>
      ) : reserved ? (
        <div style={{ fontSize: 12, color: "var(--info)", marginTop: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Rezerve</div>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--muted-2)", marginTop: 10 }}>Boş</div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 10px", fontSize: 13, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0, boxSizing: "border-box" };
const btnSecondary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 16px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13, width: "100%", justifyContent: "center", cursor: "pointer" };
const btnSmall: React.CSSProperties = { border: "none", borderRadius: 10, padding: "9px 14px", background: "var(--ink-green)", color: "#fff", fontSize: 13.5, cursor: "pointer" };
const navBtn: React.CSSProperties = { all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: 6, borderRadius: 8, color: "var(--muted)" };
