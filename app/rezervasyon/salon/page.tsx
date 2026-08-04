"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowLeft, RotateCw } from "lucide-react";
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
  position_x: number | null; position_y: number | null; seat_count: number; shape: Shape; rotated: boolean;
};
type OturanBilgi = { guestName: string; partySize: number };

// Masa şekli ve kişi sayısı AYRI seçilir (Gökhan: "yuvarlak altı kişilik masada olabilir" —
// şekle sabit bir kişi sayısı bağlı olamaz). Sürüklenen kutunun kendisi grid'e oturması için
// hep BOX_W×BOX_H sabit kalıyor (gerçek daire/dikdörtgen yapmak grid'i bozar); şekil, kutunun
// içindeki küçük bir rozetle (durum rengiyle boyalı) gösteriliyor — önceki halde köşe
// yuvarlaklığı denenmişti, "hâlâ kart gibi açılıyor" ve kare seçimi yuvarlak görünüyordu.
const SEKILLER: { shape: Shape; label: string }[] = [
  { shape: "yuvarlak", label: "Yuvarlak" },
  { shape: "kare", label: "Kare" },
  { shape: "dikdortgen", label: "Dikdörtgen" },
];
const KOLTUK_SECENEKLERI = [2, 4, 6, 8];
// Şekil rozeti — gerçek en/boy oranıyla (yuvarlak: eşit kenar + tam yuvarlak, kare: eşit
// kenar + hafif köşe, dikdörtgen: geniş + hafif köşe). Hem seçim ekranında hem masanın
// kendi kutusunda AYNI fonksiyon kullanılıyor ki ikisi birbirini tutsun.
const sekilRozeti = (shape: Shape, taban: number): React.CSSProperties => {
  if (shape === "yuvarlak") return { width: taban, height: taban, borderRadius: "50%" };
  if (shape === "kare") return { width: taban, height: taban, borderRadius: 4 };
  return { width: taban * 1.5, height: taban * 0.7, borderRadius: 4 };
};

const BOX_W = 148;
const BOX_H = 108;
const GAP = 14;
const COLS = 5;

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
  const [newTableShape, setNewTableShape] = useState<Shape>("kare");
  const [newTableSeats, setNewTableSeats] = useState("4");
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
      supabase.from("restaurant_tables").select("id, name, area_id, status, sort_order, position_x, position_y, seat_count, shape, rotated").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
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
    const seats = parseInt(newTableSeats, 10);
    if (!Number.isFinite(seats) || seats < 1 || seats > 50) { setErr("Koltuk sayısı 1 ile 50 arasında olmalı."); return; }
    setErr(null);
    const count = tables.filter((t) => t.area_id === selectedAreaId).length;
    const { error } = await supabase.from("restaurant_tables").insert({
      restaurant_id: restaurantId, name: toTitleTr(newTableName), area_id: selectedAreaId, status: "empty", sort_order: count,
      shape: newTableShape, seat_count: seats,
    });
    if (error) { setErr(error.message); return; }
    setNewTableName(""); setNewTableShape("kare"); setNewTableSeats("4"); setAddingTable(false);
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
  // Sadece dikdörtgen masalarda anlamlı — duvara dayalı masa yatay/dikey durabilsin
  // (Gökhan: "dikdörtgen masalar çevrilebilsin").
  const rotateTable = async (id: string, current: boolean) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, rotated: !current } : t)));
    const { error } = await supabase.from("restaurant_tables").update({ rotated: !current }).eq("id", id);
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
                    onRotate={() => rotateTable(t.id, t.rotated)}
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

      {/* MASA EKLE KATMANI — şekil ve kişi sayısı AYRI seçiliyor (Gökhan: "yuvarlak altı
          kişilik masada olabilir" — sabit eşleşme yanlıştı). Şekil rozetleri gerçek en/boy
          oranıyla çiziliyor (sekilRozeti), kare artık yuvarlak görünmüyor. */}
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
            <div style={{ display: "flex", gap: 10 }}>
              {SEKILLER.map((s) => (
                <button
                  key={s.shape}
                  onClick={() => setNewTableShape(s.shape)}
                  style={{
                    all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                    padding: 10, width: 82, height: 66, borderRadius: 12,
                    border: newTableShape === s.shape ? "2px solid var(--brand-strong)" : "1px solid var(--line-2)",
                    background: newTableShape === s.shape ? "var(--recede)" : "transparent",
                  }}
                >
                  <div style={{ ...sekilRozeti(s.shape, 30), background: "var(--tan-300)", border: "1px solid var(--line-2)" }} />
                  <span style={{ fontSize: 11, color: "var(--ink)" }}>{s.label}</span>
                </button>
              ))}
            </div>

            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 16, marginBottom: 8 }}>Koltuk sayısı</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {KOLTUK_SECENEKLERI.map((n) => (
                <button
                  key={n}
                  onClick={() => setNewTableSeats(String(n))}
                  style={{
                    all: "unset", cursor: "pointer", minWidth: 36, textAlign: "center", padding: "7px 0", borderRadius: 980, fontSize: 13,
                    border: newTableSeats === String(n) ? "2px solid var(--brand-strong)" : "1px solid var(--line-2)",
                    background: newTableSeats === String(n) ? "var(--recede)" : "transparent",
                    color: "var(--ink)", fontWeight: newTableSeats === String(n) ? 600 : 400,
                  }}
                >
                  {n}
                </button>
              ))}
              <input
                value={newTableSeats}
                onChange={(e) => setNewTableSeats(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric" className="tnum"
                style={{ ...inp, width: 56, textAlign: "center", marginLeft: 6 }}
              />
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
  table, x, y, oturan, onMove, onRename, onRotate, onContextMenu,
}: {
  table: TableRow; x: number; y: number; oturan: OturanBilgi | null;
  onMove: (id: string, x: number, y: number) => void; onRename: (v: string) => void; onRotate: () => void; onContextMenu: (x: number, y: number) => void;
}) {
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const [hover, setHover] = useState(false);
  const startRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const occupied = table.status === "occupied";
  const reserved = table.status === "reserved";
  const durumEtiket = occupied ? "Dolu" : reserved ? "Rzv" : "Boş";

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
  // Gökhan: "çektiğim yerde durmalı, otomatik yerleşme kapansın" — artık grid'e yapışmıyor,
  // bırakıldığı tam piksele yerleşiyor (snapCoord kaldırıldı).
  const onPointerUp = () => {
    if (!startRef.current) return;
    const moved = startRef.current.moved;
    const dx = dragOffset?.dx ?? 0;
    const dy = dragOffset?.dy ?? 0;
    startRef.current = null;
    setDragOffset(null);
    if (moved) onMove(table.id, Math.max(0, x + dx), Math.max(0, y + dy));
  };

  const curX = x + (dragOffset?.dx ?? 0);
  const curY = y + (dragOffset?.dy ?? 0);

  // Dış kutu (BOX_W×BOX_H) sadece sürükleme alanı — görünmez. Gerçek görünen şey içindeki
  // ŞEKİL: yuvarlak/kare/dikdörtgen, durum rengiyle boyalı, üstünde masa adı, İÇİNDE durum
  // yazısı (Gökhan: "durumu masanın içinde yazsın boş dolu rzv"). Dikdörtgen masa döndürülünce
  // (Gökhan: "dikdörtgen masalar çevrilebilsin") en/boy takas edilir — duvara dayalı masa
  // yatay ya da dikey durabilsin.
  const dikdortgen = table.shape === "dikdortgen";
  const govde = dikdortgen
    ? (table.rotated ? { width: 66, height: 118 } : { width: 118, height: 66 })
    : { width: 82, height: 82 };
  const govdeRadius = table.shape === "yuvarlak" ? "50%" : 10;
  const zeminRengi = occupied ? "var(--tan-300)" : reserved ? "var(--info-bg)" : "var(--recede)";
  const kenarRengi = occupied ? "var(--brand)" : reserved ? "var(--info)" : "var(--line-2)";
  const durumRengi = occupied ? "var(--brand)" : reserved ? "var(--info)" : "var(--muted-2)";

  return (
    <div
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e.clientX, e.clientY); }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: "absolute", left: curX, top: curY, width: BOX_W, height: BOX_H,
        cursor: "grab", touchAction: "none", userSelect: "none",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5,
      }}
      title={occupied && oturan ? `${oturan.guestName} · ${oturan.partySize} kişi` : undefined}
    >
      <div
        style={{
          ...govde, borderRadius: govdeRadius, position: "relative",
          background: zeminRengi, border: `2px solid ${kenarRengi}`, boxSizing: "border-box",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, padding: 6,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink-green)", textAlign: "center", lineHeight: 1.15, maxWidth: "100%" }} onPointerDown={(e) => e.stopPropagation()}>
          <EditableText value={table.name} onSave={onRename} />
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted-2)" }} className="tnum">{table.seat_count} kişilik</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: durumRengi }}>{durumEtiket}</div>

        {dikdortgen && hover && (
          <button
            onClick={(e) => { e.stopPropagation(); onRotate(); }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Masayı döndür" title="Döndür"
            style={{
              all: "unset", cursor: "pointer", position: "absolute", top: -8, right: -8, width: 22, height: 22, borderRadius: "50%",
              background: "var(--ink-green)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            }}
          >
            <RotateCw size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 10px", fontSize: 13, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0, boxSizing: "border-box" };
const btnSecondary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 16px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13, width: "100%", justifyContent: "center", cursor: "pointer" };
const btnSmall: React.CSSProperties = { border: "none", borderRadius: 10, padding: "9px 14px", background: "var(--ink-green)", color: "#fff", fontSize: 13.5, cursor: "pointer" };
const navBtn: React.CSSProperties = { all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: 6, borderRadius: 8, color: "var(--muted)" };
