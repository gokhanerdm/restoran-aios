"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getMyRestaurantId } from "@/lib/supabase/restaurant";
import { toTitleTr, toUpperTr } from "@/lib/text";
import { Plus } from "lucide-react";

// Vale — ROADMAP §O4. Gökhan: "vale plaka ile kayıt girsin, isim soyisim alsın, sonra
// eşleşmeyi program yapar. Hesap istendiğinde vale'ye bildirim gitsin, araba kapıya
// çekilsin." Eşleştirme add_valet_entry RPC'sinde otomatik denenir (aynı isimde oturmuş
// bekleme kaydı varsa); tutmazsa burada elle "Masaya bağla" ile kapatılır.

type Valet = { id: string; guest_name: string; plate_no: string; status: string; matched_table_id: string | null; parked_at: string; called_at: string | null };
type TableRow = { id: string; name: string };

const STATUS_INFO: Record<string, { label: string; renk: string }> = {
  bekliyor: { label: "Bekliyor", renk: "var(--muted)" },
  cagrildi: { label: "Çağrıldı — araba hazırlanıyor", renk: "var(--danger)" },
  teslim_edildi: { label: "Teslim edildi", renk: "var(--muted-2)" },
};

const sureFmt = (from: string, now: number) => {
  const dk = Math.max(0, Math.round((now - Date.parse(from)) / 60000));
  return dk < 60 ? `${dk} dk` : `${Math.floor(dk / 60)}s ${dk % 60}dk`;
};

export default function ValePaneli() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Valet[]>([]);
  const [occupiedTables, setOccupiedTables] = useState<TableRow[]>([]);
  const [now, setNow] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [fName, setFName] = useState("");
  const [fPlate, setFPlate] = useState("");
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const restId = await getMyRestaurantId();
    if (!restId) return;
    setRestaurantId(restId);
    const [{ data: v }, { data: t }] = await Promise.all([
      supabase.from("valet_entries").select("id, guest_name, plate_no, status, matched_table_id, parked_at, called_at")
        .eq("restaurant_id", restId).neq("status", "teslim_edildi").order("parked_at"),
      supabase.from("restaurant_tables").select("id, name")
        .eq("restaurant_id", restId).eq("status", "occupied").is("deleted_at", null).order("sort_order"),
    ]);
    setEntries((v as Valet[]) ?? []);
    setOccupiedTables((t as TableRow[]) ?? []);
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 10000); return () => clearInterval(id); }, [load]);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);

  const addEntry = async () => {
    if (!restaurantId || !fName.trim() || !fPlate.trim()) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("add_valet_entry", {
      p_restaurant: restaurantId, p_guest_name: toTitleTr(fName), p_plate_no: toUpperTr(fPlate.trim()),
    });
    if (error) { setErr(error.message); setBusy(false); return; }
    setFName(""); setFPlate(""); setBusy(false);
    await load();
  };

  const linkTable = async (entryId: string, tableId: string) => {
    await supabase.from("valet_entries").update({ matched_table_id: tableId || null }).eq("id", entryId);
    setLinkingId(null);
    await load();
  };

  const markDelivered = async (id: string) => {
    await supabase.from("valet_entries").update({ status: "teslim_edildi", delivered_at: new Date().toISOString() }).eq("id", id);
    await load();
  };

  const tableName = (id: string | null) => occupiedTables.find((t) => t.id === id)?.name ?? null;

  return (
    <div style={{ padding: "26px 28px", height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1, marginBottom: 14, flexShrink: 0 }}>Vale</div>
      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10, flexShrink: 0 }}>{err}</div>}

      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18, marginBottom: 14, flexShrink: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>Araç kaydı ekle</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input value={fName} onChange={(e) => setFName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEntry()} placeholder="Misafir isim soyisim" style={{ ...inp, flex: "1 1 200px" }} />
          <input value={fPlate} onChange={(e) => setFPlate(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEntry()} placeholder="Plaka" className="tnum" style={{ ...inp, width: 140 }} />
          <button onClick={addEntry} disabled={busy || !fName.trim() || !fPlate.trim()} style={{ ...btnPrimary, opacity: !fName.trim() || !fPlate.trim() ? 0.5 : 1 }}><Plus size={14} /> Ekle</button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18 }}>
        {entries.length === 0 ? (
          <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>Bekleyen araç yok.</div>
        ) : entries.map((v) => {
          const info = STATUS_INFO[v.status] ?? STATUS_INFO.bekliyor;
          const eslesikMasa = tableName(v.matched_table_id);
          return (
            <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{v.guest_name} <span className="tnum" style={{ fontWeight: 400, color: "var(--muted)" }}>· {v.plate_no}</span></div>
                <div style={{ fontSize: 11.5, color: info.renk, fontWeight: v.status === "cagrildi" ? 700 : 400 }}>
                  {info.label} · {sureFmt(v.parked_at, now)}
                  {eslesikMasa && <span style={{ color: "var(--muted-2)", fontWeight: 400 }}> · {eslesikMasa}</span>}
                  {!v.matched_table_id && <span style={{ color: "var(--gold-text)", fontWeight: 400 }}> · masa eşleşmedi</span>}
                </div>
              </div>

              {linkingId === v.id ? (
                <select autoFocus onChange={(e) => linkTable(v.id, e.target.value)} defaultValue="" style={{ ...inp, width: 160 }}>
                  <option value="" disabled>Masa seç…</option>
                  {occupiedTables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              ) : (
                <button onClick={() => setLinkingId(v.id)} style={btnSecondary}>{eslesikMasa ? "Değiştir" : "Masaya bağla"}</button>
              )}
              <button onClick={() => markDelivered(v.id)} style={btnSmall}>Teslim edildi</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 10px", fontSize: 13, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0 };
const btnPrimary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, border: "none", borderRadius: 980, padding: "9px 16px", background: "var(--brand-strong)", color: "#fff", fontSize: 13, fontWeight: 500, flexShrink: 0 };
const btnSecondary: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "7px 14px", background: "var(--card)", color: "var(--ink-green)", fontSize: 12.5, flexShrink: 0, cursor: "pointer" };
const btnSmall: React.CSSProperties = { border: "none", borderRadius: 980, padding: "7px 14px", background: "var(--ink-green)", color: "#fff", fontSize: 12.5, flexShrink: 0, cursor: "pointer" };
