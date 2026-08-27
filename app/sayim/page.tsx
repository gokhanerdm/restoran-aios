"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getMyRestaurantId } from "@/lib/supabase/restaurant";
import { useConfirm } from "../components/useConfirm";
import SayfaKabugu from "@/app/components/SayfaKabugu";
import { kart, kutuDar, dugmeAna, dugmeAnaSatir, dugmeIkincil } from "@/lib/olcu";
import { ArrowLeft, ClipboardList, Plus, Search, Wrench } from "lucide-react";

// SAYIM — fire/kaçak radarının ön koşulu.
// Sistem "teorik stok"u bilir (alımlar + reçete tüketimi = stock_movements toplamı).
// Sayım "gerçek stok"u söyler. İkisi arasındaki fark = fire/kaçak.
// Sayım kaydı stoğu KENDİLİĞİNDEN düzeltmez; düzeltme ayrı ve onaylı bir adımdır.

type Item = {
  ingredient_id: string;
  ingredient_name: string;
  category: "gida" | "sarf";
  unit: string;
  par_level: number;
  current_unit_cost: number;
  current_stock: number;
  avg_daily_usage: number;
  expected_usage: number;
  supplier_id: string | null;
  supplier_name: string | null;
  stock_group_id: string | null;
  stock_group_name: string | null;
  sort_order: number;
};
type CountRow = { id: string; counted_at: string; note: string | null; kalem: number };
type IngLite = { id: string; name: string; unit: string; current_unit_cost: number };
type DetailRow = { ingredient_id: string; name: string; unit: string; unit_cost: number; teorik: number; sayilan: number };
type Detail = { count: CountRow; rows: DetailRow[]; islendi: boolean };

const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;
const num = (n: number) => Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
const toNum = (s: string) => parseFloat(s.replace(",", ".")) || 0;
const EPS = 0.0001;
const UNGROUPED = "__ungrouped";

const dateFmt = new Intl.DateTimeFormat("tr-TR", {
  timeZone: "Europe/Istanbul", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const tarih = (iso: string) => dateFmt.format(new Date(iso));

// Teorik stok = stock_movements'taki işaretli miktarların toplamı — app/stok/page.tsx'in
// kullandığı ingredient_expected_usage RPC'siyle birebir aynı mantık. Geçmiş bir sayımın
// o günkü teorik stoğu için occurred_at <= sayım anı filtresi uygulanır.
// PostgREST sayfa başına en fazla ~1000 satır döndüğü için sayfalanarak toplanır.
async function movementSums(restId: string, untilIso: string | null): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const PAGE = 1000;
  for (let from = 0; from < 500000; from += PAGE) {
    let q = supabase.from("stock_movements").select("ingredient_id, quantity").eq("restaurant_id", restId);
    if (untilIso) q = q.lte("occurred_at", untilIso);
    const { data, error } = await q.order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (error || !data) break;
    for (const r of data as { ingredient_id: string; quantity: number }[]) {
      map.set(r.ingredient_id, (map.get(r.ingredient_id) ?? 0) + Number(r.quantity));
    }
    if (data.length < PAGE) break;
  }
  return map;
}

export default function SayimPage() {
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [counts, setCounts] = useState<CountRow[]>([]);
  const [view, setView] = useState<"liste" | "yeni" | "detay">("liste");
  const [err, setErr] = useState<string | null>(null);

  // yeni sayım
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [groupId, setGroupId] = useState<string>("");
  const [cat, setCat] = useState<"tumu" | "gida" | "sarf">("tumu");
  const [bosSifir, setBosSifir] = useState(false);
  const [saving, setSaving] = useState(false);
  const inputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  // detay
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [processing, setProcessing] = useState(false);

  const loadCounts = useCallback(async (restId: string) => {
    const { data, error } = await supabase
      .from("inventory_counts")
      .select("id, counted_at, note, inventory_count_items(count)")
      .eq("restaurant_id", restId)
      .order("counted_at", { ascending: false });
    if (!error && data) {
      setCounts(
        (data as unknown as { id: string; counted_at: string; note: string | null; inventory_count_items: { count: number }[] | null }[])
          .map((c) => ({ id: c.id, counted_at: c.counted_at, note: c.note, kalem: c.inventory_count_items?.[0]?.count ?? 0 })),
      );
      return;
    }
    // Gömülü sayım desteklenmezse sade listeye düş
    const { data: plain } = await supabase
      .from("inventory_counts").select("id, counted_at, note")
      .eq("restaurant_id", restId).order("counted_at", { ascending: false });
    setCounts(((plain as { id: string; counted_at: string; note: string | null }[]) ?? []).map((c) => ({ ...c, kalem: 0 })));
  }, []);

  const load = useCallback(async () => {
    const restId = await getMyRestaurantId();
    if (!restId) return;
    setRestaurantId(restId);
    const { data: usage } = await supabase.rpc("ingredient_expected_usage", { p_restaurant: restId, p_days_ahead: 7 });
    setItems((usage as Item[]) ?? []);
    await loadCounts(restId);
  }, [loadCounts]);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const m = new Map<string, string>();
    items.forEach((i) => { if (i.stock_group_id) m.set(i.stock_group_id, i.stock_group_name ?? "—"); });
    const list = [...m.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "tr"));
    if (items.some((i) => !i.stock_group_id)) list.push({ id: UNGROUPED, name: "DİĞER" });
    return list;
  }, [items]);

  const visible = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase("tr-TR");
    return items
      .filter((i) => (cat === "tumu" ? true : i.category === cat))
      .filter((i) => (!groupId ? true : groupId === UNGROUPED ? !i.stock_group_id : i.stock_group_id === groupId))
      .filter((i) => (!needle ? true : i.ingredient_name.toLocaleLowerCase("tr-TR").includes(needle)))
      .sort((a, b) => {
        const ga = a.stock_group_name ?? "ZZZ", gb = b.stock_group_name ?? "ZZZ";
        if (ga !== gb) return ga.localeCompare(gb, "tr");
        return a.sort_order - b.sort_order;
      });
  }, [items, q, groupId, cat]);

  // Girilen değerlere göre anlık fark özeti
  const yeniOzet = useMemo(() => {
    let eksik = 0, fazla = 0, girilen = 0;
    for (const i of visible) {
      const raw = values[i.ingredient_id];
      if (raw === undefined || raw.trim() === "") continue;
      girilen++;
      const fark = toNum(raw) - Number(i.current_stock);
      const tutar = fark * Number(i.current_unit_cost);
      if (fark < -EPS) eksik += tutar; else if (fark > EPS) fazla += tutar;
    }
    return { eksik, fazla, net: eksik + fazla, girilen };
  }, [visible, values]);

  const startNew = () => {
    setValues({}); setNote(""); setQ(""); setGroupId(""); setCat("tumu");
    setBosSifir(false); setErr(null); setView("yeni");
  };

  const backToList = () => { setErr(null); setDetail(null); setView("liste"); };

  const focusNext = (idx: number) => {
    const next = visible[idx + 1];
    if (next) inputsRef.current[next.ingredient_id]?.focus();
  };

  const openDetail = async (c: CountRow) => {
    if (!restaurantId) return;
    setErr(null); setDetail(null); setDetailBusy(true); setView("detay");
    const { data: rowsData, error: rowsErr } = await supabase
      .from("inventory_count_items")
      .select("ingredient_id, counted_quantity")
      .eq("restaurant_id", restaurantId)
      .eq("count_id", c.id);
    if (rowsErr) { setDetailBusy(false); setErr(`Sayım detayı okunamadı: ${rowsErr.message}`); return; }
    const rows = (rowsData as { ingredient_id: string; counted_quantity: number }[]) ?? [];
    const ids = rows.map((r) => r.ingredient_id);

    let ings: IngLite[] = [];
    if (ids.length > 0) {
      const { data } = await supabase.from("ingredients").select("id, name, unit, current_unit_cost").in("id", ids);
      ings = (data as IngLite[]) ?? [];
    }
    const sums = await movementSums(restaurantId, c.counted_at);
    // Bu sayımın farkları daha önce stoğa işlendi mi? (aynı sayımın iki kez işlenmesini engeller)
    const { data: adj } = await supabase.from("stock_movements").select("id")
      .eq("restaurant_id", restaurantId).eq("source_type", "count").eq("source_id", c.id).limit(1);

    const byId = new Map(ings.map((x) => [x.id, x]));
    const detayRows: DetailRow[] = rows.map((r) => {
      const ing = byId.get(r.ingredient_id);
      return {
        ingredient_id: r.ingredient_id,
        name: ing?.name ?? "(silinmiş malzeme)",
        unit: ing?.unit ?? "",
        unit_cost: Number(ing?.current_unit_cost ?? 0),
        teorik: sums.get(r.ingredient_id) ?? 0,
        sayilan: Number(r.counted_quantity),
      };
    }).sort((a, b) => (a.sayilan - a.teorik) * a.unit_cost - (b.sayilan - b.teorik) * b.unit_cost);

    setDetail({ count: c, rows: detayRows, islendi: ((adj as { id: string }[]) ?? []).length > 0 });
    setDetailBusy(false);
  };

  const saveCount = async () => {
    if (!restaurantId || saving) return;
    const kalemler = visible
      .map((i) => {
        const raw = values[i.ingredient_id];
        const bos = raw === undefined || raw.trim() === "";
        if (bos && !bosSifir) return null;
        return { ingredient_id: i.ingredient_id, counted_quantity: Math.max(0, bos ? 0 : toNum(raw)) };
      })
      .filter((x): x is { ingredient_id: string; counted_quantity: number } => x !== null);

    if (kalemler.length === 0) { setErr("En az bir malzemeye sayılan miktar girilmeli."); return; }
    setSaving(true); setErr(null);

    const { data: c, error: cErr } = await supabase
      .from("inventory_counts")
      .insert({ restaurant_id: restaurantId, counted_at: new Date().toISOString(), note: note.trim() || null })
      .select("id, counted_at, note")
      .single();
    if (cErr || !c) { setSaving(false); setErr(`Sayım kaydedilemedi: ${cErr?.message ?? "bilinmeyen hata"}`); return; }

    const { error: iErr } = await supabase.from("inventory_count_items").insert(
      kalemler.map((k) => ({ restaurant_id: restaurantId, count_id: c.id, ...k })),
    );
    setSaving(false);
    if (iErr) { setErr(`Sayım kalemleri kaydedilemedi: ${iErr.message}`); return; }

    const saved = c as { id: string; counted_at: string; note: string | null };
    await loadCounts(restaurantId);
    await openDetail({ id: saved.id, counted_at: saved.counted_at, note: saved.note, kalem: kalemler.length });
  };

  const detailOzet = useMemo(() => {
    let eksik = 0, fazla = 0;
    for (const r of detail?.rows ?? []) {
      const tutar = (r.sayilan - r.teorik) * r.unit_cost;
      if (tutar < -EPS) eksik += tutar; else if (tutar > EPS) fazla += tutar;
    }
    return { eksik, fazla, net: eksik + fazla };
  }, [detail]);

  // Farkları stoğa işle — sayım kaydı tek başına stoğu DEĞİŞTİRMEZ, bu ayrı ve onaylı adım değiştirir.
  const processDiffs = async () => {
    if (!restaurantId || !detail || processing || detail.islendi) return;
    const hareketler = detail.rows
      .map((r) => ({ r, fark: r.sayilan - r.teorik }))
      .filter(({ fark }) => Math.abs(fark) > EPS)
      .map(({ r, fark }) => ({
        restaurant_id: restaurantId,
        ingredient_id: r.ingredient_id,
        movement_type: "count_adjustment",
        quantity: fark,
        unit_cost: r.unit_cost,
        source_type: "count",
        source_id: detail.count.id,
      }));
    if (hareketler.length === 0) { setErr("İşlenecek fark yok — sayım teorik stokla birebir aynı."); return; }

    const ok = await confirm(
      `${hareketler.length} malzemede fark var. Stok, sayımdaki gerçek miktara çekilecek (net ${money(detailOzet.net)}). ` +
      `Bu işlem geri alınamaz, devam edilsin mi?`,
    );
    if (!ok) return;

    setProcessing(true); setErr(null);
    const { error } = await supabase.from("stock_movements").insert(hareketler);
    setProcessing(false);
    if (error) { setErr(`Farklar stoğa işlenemedi: ${error.message}`); return; }
    setDetail({ ...detail, islendi: true });
    await load();
  };

  return (
    <SayfaKabugu>
      {confirmDialog}

      {/* ---------- BAŞLIK ---------- */}
      <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 16, flexShrink: 0 }}>
        {view !== "liste" && (
          <button onClick={backToList} aria-label="geri" style={{ all: "unset", cursor: "pointer", color: "var(--muted)", display: "inline-flex", marginRight: 12, paddingBottom: 4 }}>
            <ArrowLeft size={20} />
          </button>
        )}
        <div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>
            {view === "yeni" ? "Yeni sayım" : view === "detay" ? "Sayım detayı" : "Sayım"}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 7 }}>
            {view === "liste" && `${counts.length} sayım · ${items.length} malzeme`}
            {view === "yeni" && `${visible.length} malzeme listede · ${yeniOzet.girilen} tanesine değer girildi`}
            {view === "detay" && detail && `${tarih(detail.count.counted_at)} · ${detail.rows.length} kalem`}
          </div>
        </div>
        {view === "liste" && (
          <button onClick={startNew} style={{ ...dugmeAnaSatir, marginLeft: "auto", gap: 7 }}>
            <Plus size={15} /> Yeni sayım başlat
          </button>
        )}
      </div>

      {err && (
        <div style={{ marginBottom: 12, padding: "9px 13px", borderRadius: 10, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13, flexShrink: 0 }}>{err}</div>
      )}

      {/* ---------- 1) GEÇMİŞ SAYIMLAR ---------- */}
      {view === "liste" && (
        <div style={{ ...kart, display: "flex", flexDirection: "column", flex: 1, minHeight: 0, maxWidth: 880 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", padding: "16px 20px 12px", flexShrink: 0 }}>
            Sistem teorik stoğu bilir (alımlar eksi reçete tüketimi). Sayım gerçek stoğu söyler.
            Aradaki fark fire/kaçaktır. Sayım kaydetmek stoğu kendiliğinden düzeltmez — düzeltme ayrı bir adımdır.
          </div>
          <div style={{ display: "flex", fontSize: 11, color: "var(--muted-2)", padding: "0 20px 8px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
            <span style={{ flex: 1.2 }}>Tarih</span>
            <span style={{ flex: 1.4 }}>Not</span>
            <span style={{ width: 90, textAlign: "right" }}>Kalem</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {counts.map((c) => (
              <div
                key={c.id}
                onClick={() => openDetail(c)}
                style={{ display: "flex", alignItems: "center", padding: "11px 20px", borderBottom: "1px solid var(--line)", fontSize: 13.5, cursor: "pointer" }}
              >
                <span style={{ flex: 1.2, color: "var(--ink)", fontWeight: 500 }}>{tarih(c.counted_at)}</span>
                <span style={{ flex: 1.4, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.note || "—"}</span>
                <span className="tnum" style={{ width: 90, textAlign: "right", color: "var(--muted)" }}>{c.kalem || "—"}</span>
              </div>
            ))}
            {counts.length === 0 && (
              <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "18px 20px", display: "flex", alignItems: "center", gap: 8 }}>
                <ClipboardList size={15} /> Henüz sayım yapılmadı. İlk sayımı başlatınca fire/kaçak takibi çalışmaya başlar.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- 2) YENİ SAYIM ---------- */}
      {view === "yeni" && (
        <div style={{ ...kart, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--line)", flexShrink: 0, flexWrap: "wrap" }}>
            <span style={{ position: "relative", display: "inline-flex", alignItems: "center", flex: 1.2, minWidth: 160 }}>
              <Search size={14} style={{ position: "absolute", left: 11, color: "var(--muted-2)" }} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Malzeme ara" style={{ ...kutuDar, paddingLeft: 32 }} />
            </span>
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)} style={{ ...kutuDar, width: 170 }}>
              <option value="">Tüm başlıklar</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <div style={{ display: "flex", gap: 6, background: "var(--recede)", padding: 3, borderRadius: 980 }}>
              {(["tumu", "gida", "sarf"] as const).map((f) => (
                <button key={f} onClick={() => setCat(f)} style={{
                  fontSize: 12.5, padding: "6px 14px", borderRadius: 980, border: "none",
                  background: cat === f ? "var(--ink-green)" : "transparent",
                  color: cat === f ? "#fff" : "var(--muted)",
                }}>
                  {f === "tumu" ? "Tümü" : f === "gida" ? "Gıda" : "Sarf"}
                </button>
              ))}
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveCount()} placeholder="Sayım notu (opsiyonel)" style={{ ...kutuDar, flex: 1, minWidth: 150 }} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", fontSize: 11, color: "var(--muted-2)", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
            <span style={{ flex: 1.6 }}>Malzeme</span>
            <span style={{ width: 55 }}>Birim</span>
            <span style={{ width: 95, textAlign: "right" }}>Teorik stok</span>
            <span style={{ width: 110, textAlign: "right" }}>Sayılan</span>
            <span style={{ width: 95, textAlign: "right" }}>Fark</span>
            <span style={{ width: 100, textAlign: "right" }}>Fark tutarı</span>
          </div>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {visible.map((i, idx) => {
              const raw = values[i.ingredient_id] ?? "";
              const dolu = raw.trim() !== "";
              const fark = dolu ? toNum(raw) - Number(i.current_stock) : 0;
              const tutar = fark * Number(i.current_unit_cost);
              const eksi = dolu && fark < -EPS;
              const grupBasi = idx === 0 || (visible[idx - 1].stock_group_name ?? "") !== (i.stock_group_name ?? "");
              return (
                <div key={i.ingredient_id}>
                  {grupBasi && (
                    <div style={{ padding: "9px 16px 5px", fontSize: 11, fontWeight: 600, color: "var(--muted-2)", background: "var(--recede)" }}>
                      {i.stock_group_name ?? "DİĞER"}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 16px", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
                    <span style={{ flex: 1.6, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--ink)", fontWeight: 500 }}>{i.ingredient_name}</span>
                    <span style={{ width: 55, fontSize: 12, color: "var(--muted)" }}>{i.unit}</span>
                    <span className="tnum" style={{ width: 95, textAlign: "right", color: "var(--muted)" }}>{num(i.current_stock)}</span>
                    <span style={{ width: 110, display: "flex", justifyContent: "flex-end" }}>
                      <input
                        ref={(el) => { inputsRef.current[i.ingredient_id] = el; }}
                        value={raw}
                        onChange={(e) => setValues((v) => ({ ...v, [i.ingredient_id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); focusNext(idx); } }}
                        placeholder="—"
                        inputMode="decimal"
                        style={{ ...kutuDar, width: 100, textAlign: "right" }}
                      />
                    </span>
                    <span className="tnum" style={{ width: 95, textAlign: "right", color: eksi ? "var(--danger)" : "var(--muted)", fontWeight: eksi ? 600 : 400 }}>
                      {dolu ? `${fark > 0 ? "+" : ""}${num(fark)}` : "—"}
                    </span>
                    <span className="tnum" style={{ width: 100, textAlign: "right", color: eksi ? "var(--danger)" : "var(--muted)", fontWeight: eksi ? 600 : 400 }}>
                      {dolu && Math.abs(tutar) > EPS ? `${tutar > 0 ? "+" : ""}${money(tutar)}` : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
            {visible.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "18px 16px" }}>Bu filtreye uyan malzeme yok.</div>}
          </div>

          {/* 3) ÖZET + KAYDET */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", borderTop: "1px solid var(--line)", flexShrink: 0, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              Eksik <b className="tnum" style={{ color: "var(--danger)" }}>{money(Math.abs(yeniOzet.eksik))}</b>
            </span>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              Fazla <b className="tnum" style={{ color: "var(--ink)" }}>{money(yeniOzet.fazla)}</b>
            </span>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              Net <b className="tnum" style={{ color: yeniOzet.net < -EPS ? "var(--danger)" : "var(--ink-green)" }}>{money(yeniOzet.net)}</b>
            </span>
            <label style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--muted)" }}>
              <input type="checkbox" checked={bosSifir} onChange={(e) => setBosSifir(e.target.checked)} />
              Boş bırakılanları 0 say (listedeki tüm malzemeler kaydedilir)
            </label>
            <button onClick={saveCount} disabled={saving} style={{ ...dugmeAna, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Kaydediliyor…" : "Sayımı kaydet"}
            </button>
          </div>
        </div>
      )}

      {/* ---------- 4) SAYIM DETAYI + FARKLARI STOĞA İŞLE ---------- */}
      {view === "detay" && (
        <div style={{ ...kart, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          {detailBusy && <div style={{ color: "var(--muted)", fontSize: 13, padding: "18px 16px" }}>Farklar hesaplanıyor…</div>}

          {!detailBusy && detail && (
            <>
              <div style={{ fontSize: 12, color: "var(--muted)", padding: "14px 16px 10px", flexShrink: 0 }}>
                {detail.count.note ? `Not: ${detail.count.note} · ` : ""}
                Teorik stok, sayım anına (<span className="tnum">{tarih(detail.count.counted_at)}</span>) kadar olan stok hareketlerinden hesaplandı.
                {detail.islendi && <b style={{ color: "var(--brand)" }}> · Farklar stoğa işlendi.</b>}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 16px", fontSize: 11, color: "var(--muted-2)", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
                <span style={{ flex: 1.6 }}>Malzeme</span>
                <span style={{ width: 55 }}>Birim</span>
                <span style={{ width: 95, textAlign: "right" }}>Teorik</span>
                <span style={{ width: 95, textAlign: "right" }}>Sayılan</span>
                <span style={{ width: 95, textAlign: "right" }}>Fark</span>
                <span style={{ width: 100, textAlign: "right" }}>Fark tutarı</span>
              </div>

              <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                {detail.rows.map((r) => {
                  const fark = r.sayilan - r.teorik;
                  const tutar = fark * r.unit_cost;
                  const eksi = fark < -EPS;
                  return (
                    <div key={r.ingredient_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
                      <span style={{ flex: 1.6, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--ink)", fontWeight: 500 }}>{r.name}</span>
                      <span style={{ width: 55, fontSize: 12, color: "var(--muted)" }}>{r.unit}</span>
                      <span className="tnum" style={{ width: 95, textAlign: "right", color: "var(--muted)" }}>{num(r.teorik)}</span>
                      <span className="tnum" style={{ width: 95, textAlign: "right" }}>{num(r.sayilan)}</span>
                      <span className="tnum" style={{ width: 95, textAlign: "right", color: eksi ? "var(--danger)" : "var(--muted)", fontWeight: eksi ? 600 : 400 }}>
                        {Math.abs(fark) > EPS ? `${fark > 0 ? "+" : ""}${num(fark)}` : "—"}
                      </span>
                      <span className="tnum" style={{ width: 100, textAlign: "right", color: eksi ? "var(--danger)" : "var(--muted)", fontWeight: eksi ? 600 : 400 }}>
                        {Math.abs(tutar) > EPS ? `${tutar > 0 ? "+" : ""}${money(tutar)}` : "—"}
                      </span>
                    </div>
                  );
                })}
                {detail.rows.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "18px 16px" }}>Bu sayımda kalem yok.</div>}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 16px", borderTop: "1px solid var(--line)", flexShrink: 0, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  Eksik <b className="tnum" style={{ color: "var(--danger)" }}>{money(Math.abs(detailOzet.eksik))}</b>
                </span>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  Fazla <b className="tnum" style={{ color: "var(--ink)" }}>{money(detailOzet.fazla)}</b>
                </span>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  Net <b className="tnum" style={{ color: detailOzet.net < -EPS ? "var(--danger)" : "var(--ink-green)" }}>{money(detailOzet.net)}</b>
                </span>
                <button
                  onClick={processDiffs}
                  disabled={processing || detail.islendi}
style={{ ...dugmeIkincil, marginLeft: "auto", gap: 7, color: detail.islendi ? "var(--muted-2)" : "var(--ink-green)", fontWeight: 500, opacity: processing ? 0.6 : 1 }}
                >
                  <Wrench size={15} /> {detail.islendi ? "Farklar işlendi" : processing ? "İşleniyor…" : "Farkları stoğa işle"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </SayfaKabugu>
  );
}

