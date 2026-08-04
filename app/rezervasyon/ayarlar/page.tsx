"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { resolveRestaurantIdBySlug } from "@/lib/supabase/publicRestaurant";
import { toUpperTr, toTitleTr } from "@/lib/text";
import { Plus, Trash2, ChevronDown, ChevronRight, ArrowLeft } from "lucide-react";
import { useConfirm } from "../../components/useConfirm";
import EditableText from "../../components/EditableText";
import { ListHeader, HeaderCell, HeaderSep, ListRow, RowSep, Cell, Spacer, ActionsCell } from "../../components/ListRow";

// REZERVASYON > AYARLAR — programın kendi ayar ekranı (Gökhan onayı, 2026-08-04).
//
// Rezervasyon AIOS'tan ayrıldı ve tek başına satılacak. Bugüne kadar masalar ve çalışma
// saatleri AIOS'un Ayarlar/Adisyon ekranlarından yönetiliyordu — o ekranlar bu programda
// yok. Program AIOS'suz çalışamıyordu; bu ekran o bağı kesiyor, her şeyin önkoşulu.
//
// Tabloların hiçbiri yeni değil: masalar restaurant_tables, salonlar dining_areas,
// saatler/KVKK/dönem restaurant_settings, işletme bilgileri restaurants. Sadece varsayılan
// oturma süresi yeni eklendi (bkz. 20260804120000).
//
// Sol panel masalar (satır tabanlı liste, salon başlıklarıyla gruplu — PAGE_STANDARDS #3/#4),
// sağ panel diğer ayarlar (tek Kaydet — PAGE_STANDARDS #2).

type Area = { id: string; name: string; sort_order: number };
type Table = { id: string; name: string; area_id: string | null; seat_count: number; sort_order: number };

type DayKey = "pzt" | "sal" | "car" | "per" | "cum" | "cmt" | "paz";
type DayHours = { acilis: string; kapanis: string; kapali: boolean };
type OpeningHours = Record<DayKey, DayHours>;

// AIOS Ayarlar'daki liste ile birebir aynı — aynı jsonb alanını paylaşıyorlar, gün
// anahtarları farklılaşırsa iki ekran birbirinin verisini bozar.
const DAYS: { k: DayKey; l: string }[] = [
  { k: "pzt", l: "Pazartesi" },
  { k: "sal", l: "Salı" },
  { k: "car", l: "Çarşamba" },
  { k: "per", l: "Perşembe" },
  { k: "cum", l: "Cuma" },
  { k: "cmt", l: "Cumartesi" },
  { k: "paz", l: "Pazar" },
];
const DEFAULT_DAY: DayHours = { acilis: "09:00", kapanis: "23:00", kapali: false };
const defaultHours = (): OpeningHours => {
  const out = {} as OpeningHours;
  for (const d of DAYS) out[d.k] = { ...DEFAULT_DAY };
  return out;
};
// DB'de gün eksik/bozuksa varsayılanla tamamla — ekran hiçbir durumda boş kalmasın.
const mergeHours = (raw: unknown): OpeningHours => {
  const base = defaultHours();
  if (!raw || typeof raw !== "object") return base;
  const src = raw as Partial<Record<DayKey, Partial<DayHours>>>;
  for (const d of DAYS) {
    const v = src[d.k];
    if (!v) continue;
    base[d.k] = {
      acilis: typeof v.acilis === "string" ? v.acilis : DEFAULT_DAY.acilis,
      kapanis: typeof v.kapanis === "string" ? v.kapanis : DEFAULT_DAY.kapanis,
      kapali: Boolean(v.kapali),
    };
  }
  return base;
};

// Salonu olmayan masalar kaybolmasın diye otomatik grup (PAGE_STANDARDS #4).
const DIGER = "__diger__";

export default function RezervasyonAyarlarPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--canvas)" }} />}>
      <AyarlarInner />
    </Suspense>
  );
}

function AyarlarInner() {
  const searchParams = useSearchParams();
  const rSlug = searchParams.get("r");
  const geriLink = rSlug ? `/rezervasyon?r=${rSlug}` : "/rezervasyon";

  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kaydedildi, setKaydedildi] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [areas, setAreas] = useState<Area[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [kapali, setKapali] = useState<Set<string>>(new Set());

  const [newAreaName, setNewAreaName] = useState("");
  // Hangi salona masa ekleniyor — satır içi mini form, ayrı pencere değil.
  const [addingTableFor, setAddingTableFor] = useState<string | null>(null);
  const [newTableName, setNewTableName] = useState("");
  const [newTableSeats, setNewTableSeats] = useState("4");

  const [isim, setIsim] = useState("");
  const [telefon, setTelefon] = useState("");
  const [adres, setAdres] = useState("");
  const [hours, setHours] = useState<OpeningHours>(defaultHours());
  const [aksamBaslangic, setAksamBaslangic] = useState("17");
  const [oturmaSuresi, setOturmaSuresi] = useState("90");
  const [kvkkNotice, setKvkkNotice] = useState("");

  useEffect(() => {
    let active = true;
    resolveRestaurantIdBySlug(rSlug).then((res) => {
      if (!active) return;
      if ("error" in res) { setErr(res.error); return; }
      setRestaurantId(res.id);
    });
    return () => { active = false; };
  }, [rSlug]);

  const load = useCallback(async (restId: string) => {
    const [{ data: a }, { data: t }, { data: r }, { data: s }] = await Promise.all([
      supabase.from("dining_areas").select("id, name, sort_order").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("restaurant_tables").select("id, name, area_id, seat_count, sort_order").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("restaurants").select("name, phone, address").eq("id", restId).maybeSingle(),
      supabase.from("restaurant_settings").select("opening_hours, evening_start_hour, kvkk_notice, default_duration_minutes").eq("restaurant_id", restId).maybeSingle(),
    ]);
    setAreas((a as Area[]) ?? []);
    setTables((t as Table[]) ?? []);
    const rRow = r as { name: string; phone: string | null; address: string | null } | null;
    setIsim(rRow?.name ?? "");
    setTelefon(rRow?.phone ?? "");
    setAdres(rRow?.address ?? "");
    const sRow = s as { opening_hours: unknown; evening_start_hour: number; kvkk_notice: string | null; default_duration_minutes: number } | null;
    setHours(mergeHours(sRow?.opening_hours));
    setAksamBaslangic(String(sRow?.evening_start_hour ?? 17));
    setOturmaSuresi(String(sRow?.default_duration_minutes ?? 90));
    setKvkkNotice(sRow?.kvkk_notice ?? "");
  }, []);

  useEffect(() => { if (restaurantId) load(restaurantId); }, [restaurantId, load]);

  const yenile = async () => { if (restaurantId) await load(restaurantId); };

  // --- Salonlar ---
  const addArea = async () => {
    if (!restaurantId || !newAreaName.trim()) return;
    setErr(null);
    const { error } = await supabase.from("dining_areas").insert({
      restaurant_id: restaurantId, name: toUpperTr(newAreaName), sort_order: areas.length,
    });
    if (error) { setErr(error.message); return; }
    setNewAreaName("");
    await yenile();
  };
  const renameArea = async (id: string, name: string) => {
    if (!name.trim()) return;
    setErr(null);
    const { error } = await supabase.from("dining_areas").update({ name: toUpperTr(name) }).eq("id", id);
    if (error) { setErr(error.message); return; }
    await yenile();
  };
  const deleteArea = async (a: Area) => {
    const icindeki = tables.filter((t) => t.area_id === a.id).length;
    if (icindeki > 0) {
      const ok = await confirm(`"${a.name}" içinde ${icindeki} masa var. Salon silinince masalar "Diğer" grubuna düşer. Silinsin mi?`, { confirmLabel: "Sil" });
      if (!ok) return;
    }
    setErr(null);
    const { error } = await supabase.from("dining_areas").update({ deleted_at: new Date().toISOString() }).eq("id", a.id);
    if (error) { setErr(error.message); return; }
    await yenile();
  };

  // --- Masalar ---
  const addTable = async (areaId: string | null) => {
    if (!restaurantId || !newTableName.trim()) return;
    const koltuk = parseInt(newTableSeats, 10);
    if (!Number.isFinite(koltuk) || koltuk < 1 || koltuk > 50) { setErr("Koltuk sayısı 1 ile 50 arasında olmalı."); return; }
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").insert({
      restaurant_id: restaurantId, name: toTitleTr(newTableName), area_id: areaId,
      seat_count: koltuk, status: "empty", sort_order: tables.filter((t) => t.area_id === areaId).length,
    });
    if (error) { setErr(error.message); return; }
    setNewTableName(""); setNewTableSeats("4"); setAddingTableFor(null);
    await yenile();
  };
  const renameTable = async (id: string, name: string) => {
    if (!name.trim()) return;
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").update({ name: toTitleTr(name) }).eq("id", id);
    if (error) { setErr(error.message); return; }
    await yenile();
  };
  const setSeats = async (id: string, raw: string) => {
    const n = parseInt(raw.replace(/\D/g, ""), 10);
    if (!Number.isFinite(n) || n < 1 || n > 50) { setErr("Koltuk sayısı 1 ile 50 arasında olmalı."); return; }
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").update({ seat_count: n }).eq("id", id);
    if (error) { setErr(error.message); return; }
    await yenile();
  };
  const deleteTable = async (t: Table) => {
    const ok = await confirm(`"${t.name}" silinsin mi?`, { confirmLabel: "Sil" });
    if (!ok) return;
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").update({ deleted_at: new Date().toISOString() }).eq("id", t.id);
    if (error) { setErr(error.message); return; }
    await yenile();
  };
  const moveTableToArea = async (tableId: string, areaId: string | null) => {
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").update({ area_id: areaId }).eq("id", tableId);
    if (error) { setErr(error.message); return; }
    await yenile();
  };

  // --- Tek Kaydet (PAGE_STANDARDS #2): sağ paneldeki her şey birlikte kaydedilir ---
  const kaydet = async () => {
    if (!restaurantId) return;
    setBusy(true); setErr(null); setKaydedildi(false);
    const saat = Math.max(0, Math.min(23, parseInt(aksamBaslangic.replace(/\D/g, ""), 10) || 0));
    const sure = Math.max(15, Math.min(600, parseInt(oturmaSuresi.replace(/\D/g, ""), 10) || 90));

    const { error: rErr } = await supabase.from("restaurants").update({
      name: isim.trim() || "İşletme",
      phone: telefon.trim() || null,
      address: adres.trim() || null,
    }).eq("id", restaurantId);
    if (rErr) { setBusy(false); setErr(rErr.message); return; }

    const { error: sErr } = await supabase.from("restaurant_settings").upsert({
      restaurant_id: restaurantId,
      opening_hours: hours,
      evening_start_hour: saat,
      default_duration_minutes: sure,
      kvkk_notice: kvkkNotice.trim() || null,
    }, { onConflict: "restaurant_id" });
    setBusy(false);
    if (sErr) { setErr(sErr.message); return; }
    setAksamBaslangic(String(saat));
    setOturmaSuresi(String(sure));
    setKaydedildi(true);
    setTimeout(() => setKaydedildi(false), 3000);
  };

  const setDay = (k: DayKey, patch: Partial<DayHours>) => setHours((h) => ({ ...h, [k]: { ...h[k], ...patch } }));

  const toggleGrup = (id: string) => setKapali((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Salonlar + sonda "Diğer" (salonu olmayan masalar). Diğer sadece içinde masa varsa görünür.
  const digerMasalar = tables.filter((t) => !t.area_id || !areas.some((a) => a.id === t.area_id));
  const gruplar: { id: string; name: string; gercek: boolean; masalar: Table[] }[] = [
    ...areas.map((a) => ({ id: a.id, name: a.name, gercek: true, masalar: tables.filter((t) => t.area_id === a.id) })),
    ...(digerMasalar.length > 0 ? [{ id: DIGER, name: "DİĞER", gercek: false, masalar: digerMasalar }] : []),
  ];

  const toplamKoltuk = tables.reduce((s, t) => s + t.seat_count, 0);

  if (!restaurantId) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--canvas)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 380, textAlign: "center", fontSize: 13.5, color: err ? "var(--danger)" : "var(--muted)", lineHeight: 1.6 }}>
          {err ?? "Yükleniyor…"}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--canvas)", padding: "20px 24px", height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      {confirmDialog}

      <div style={{ marginBottom: 14, flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
        <Link href={geriLink} aria-label="Rezervasyon listesine dön" style={{ ...navBtn, textDecoration: "none" }}><ArrowLeft size={18} /></Link>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>Ayarlar</div>
        {isim && <div style={{ fontSize: 13, color: "var(--muted)" }}>{isim}</div>}
      </div>

      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10, flexShrink: 0 }}>{err}</div>}

      <div style={{ display: "flex", gap: 20, flex: 1, minHeight: 0 }}>

        {/* SOL — MASALAR */}
        <div style={{ flex: 1.15, minWidth: 380, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexShrink: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-green)" }}>Masalar</div>
            <div style={{ fontSize: 12, color: inkSoft }}>
              <span className="tnum">{tables.length}</span> masa · toplam <span className="tnum">{toplamKoltuk}</span> kişilik
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexShrink: 0 }}>
            <input
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addArea()}
              placeholder="Yeni salon adı (Bahçe, Teras…)"
              style={{ ...inp, flex: 1 }}
            />
            <button onClick={addArea} disabled={!newAreaName.trim()} style={{ ...btnPrimary, opacity: !newAreaName.trim() ? 0.5 : 1 }}><Plus size={14} /> Salon ekle</button>
          </div>

          <ListHeader>
            <HeaderCell width={200} marginLeft={10}>Masa</HeaderCell>
            <HeaderSep />
            <HeaderCell width={70} align="center">Koltuk</HeaderCell>
            <HeaderSep />
            <HeaderCell width={150} align="center">Salon</HeaderCell>
            <Spacer />
            <HeaderCell width={40} align="center">Sil</HeaderCell>
          </ListHeader>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {gruplar.length === 0 && (
              <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0", lineHeight: 1.6 }}>
                Henüz salon yok. Önce bir salon ekle (Bahçe, Teras, İç salon…), sonra içine masaları gir.
              </div>
            )}

            {gruplar.map((g) => {
              const acik = !kapali.has(g.id);
              const grupKoltuk = g.masalar.reduce((s, t) => s + t.seat_count, 0);
              return (
                <div key={g.id} style={{ marginBottom: 6 }}>
                  {/* Salon başlığı — tıklayınca açılır/kapanır, adı çift tıklayınca düzenlenir. */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--recede)", borderRadius: 10 }}>
                    <button onClick={() => toggleGrup(g.id)} aria-label={acik ? "Kapat" : "Aç"} style={{ ...navBtn, padding: 2 }}>
                      {acik ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    {g.gercek ? (
                      <EditableText
                        value={g.name}
                        onSave={(next) => renameArea(g.id, next)}
                        style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.4, color: "var(--ink)" }}
                      />
                    ) : (
                      <span title="Salonu olmayan masalar" style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.4, color: inkSoft }}>{g.name}</span>
                    )}
                    <span style={{ fontSize: 11.5, color: inkSoft }}>
                      · <span className="tnum">{g.masalar.length}</span> masa, <span className="tnum">{grupKoltuk}</span> kişilik
                    </span>
                    <Spacer />
                    {g.gercek && (
                      <>
                        <button onClick={() => { setAddingTableFor(g.id); setNewTableName(""); setNewTableSeats("4"); }} style={btnGhostRow}>Masa ekle</button>
                        <button onClick={() => deleteArea(areas.find((a) => a.id === g.id)!)} aria-label="Salonu sil" style={{ ...navBtn, padding: 4, color: "var(--danger)" }}><Trash2 size={15} /></button>
                      </>
                    )}
                  </div>

                  {acik && addingTableFor === g.id && (
                    <div style={{ display: "flex", gap: 8, padding: "8px 10px 4px" }}>
                      <input
                        autoFocus value={newTableName}
                        onChange={(e) => setNewTableName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addTable(g.gercek ? g.id : null)}
                        placeholder="Masa adı (1, 2, Köşe…)" style={{ ...inp, flex: 1 }}
                      />
                      <input
                        value={newTableSeats}
                        onChange={(e) => setNewTableSeats(e.target.value.replace(/\D/g, ""))}
                        onKeyDown={(e) => e.key === "Enter" && addTable(g.gercek ? g.id : null)}
                        placeholder="Koltuk" inputMode="numeric" className="tnum" style={{ ...inp, width: 70, textAlign: "right" }}
                      />
                      <button onClick={() => addTable(g.gercek ? g.id : null)} disabled={!newTableName.trim()} style={{ ...btnPrimary, opacity: !newTableName.trim() ? 0.5 : 1 }}>Ekle</button>
                      <button onClick={() => setAddingTableFor(null)} style={btnGhost}>Vazgeç</button>
                    </div>
                  )}

                  {acik && g.masalar.length === 0 && addingTableFor !== g.id && (
                    <div style={{ fontSize: 12, color: "var(--muted-2)", padding: "8px 10px" }}>Bu salonda masa yok.</div>
                  )}

                  {acik && g.masalar.map((t) => (
                    <ListRow key={t.id}>
                      <Cell width={200} marginLeft={10}>
                        <EditableText
                          value={t.name}
                          onSave={(next) => renameTable(t.id, next)}
                          style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        />
                      </Cell>
                      <RowSep />
                      <Cell width={70} align="center">
                        <EditableText
                          value={String(t.seat_count)}
                          onSave={(next) => setSeats(t.id, next)}
                          style={{ fontSize: 12.5, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}
                        />
                      </Cell>
                      <RowSep />
                      <Cell width={150} align="center">
                        {/* Masayı başka salona taşımak — ayrı bir ekran açmadan, olduğu yerde. */}
                        <select
                          value={t.area_id ?? ""}
                          onChange={(e) => moveTableToArea(t.id, e.target.value || null)}
                          style={{ ...inp, width: "100%", padding: "4px 6px", fontSize: 12 }}
                        >
                          <option value="">Diğer</option>
                          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </Cell>
                      <Spacer />
                      <ActionsCell width={40} align="center">
                        <button onClick={() => deleteTable(t)} aria-label="Masayı sil" style={{ ...navBtn, padding: 4, color: "var(--danger)" }}><Trash2 size={15} /></button>
                      </ActionsCell>
                    </ListRow>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* SAĞ — İŞLETME VE ÇALIŞMA AYARLARI (tek Kaydet) */}
        <div style={{ flex: 1, minWidth: 340, maxWidth: 480, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-green)", marginBottom: 12, flexShrink: 0 }}>İşletme</div>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            <label style={lbl}>İşletme adı</label>
            <input value={isim} onChange={(e) => setIsim(e.target.value)} style={{ ...inp, width: "100%", marginBottom: 10 }} />

            <label style={lbl}>Telefon</label>
            <input value={telefon} onChange={(e) => setTelefon(e.target.value)} inputMode="tel" style={{ ...inp, width: "100%", marginBottom: 10 }} />

            <label style={lbl}>Adres</label>
            <input value={adres} onChange={(e) => setAdres(e.target.value)} style={{ ...inp, width: "100%", marginBottom: 16 }} />
            <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: -10, marginBottom: 16, lineHeight: 1.6 }}>
              Bu bilgiler misafirin kendi rezervasyonunu yaptığı sayfada görünür.
            </div>

            {/* Çalışma saatleri — misafir sayfası bu saatlerin dışına rezervasyon aldırmayacak. */}
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)", marginBottom: 8 }}>Çalışma saatleri</div>
            {DAYS.map((d) => {
              const v = hours[d.k];
              return (
                <div key={d.k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 82, fontSize: 13, color: v.kapali ? inkSoft : "var(--ink)" }}>{d.l}</span>
                  <input
                    type="time" value={v.acilis} disabled={v.kapali}
                    onChange={(e) => setDay(d.k, { acilis: e.target.value })}
                    style={{ ...inp, width: 92, opacity: v.kapali ? 0.45 : 1 }}
                  />
                  <span style={{ fontSize: 12, color: inkSoft }}>–</span>
                  <input
                    type="time" value={v.kapanis} disabled={v.kapali}
                    onChange={(e) => setDay(d.k, { kapanis: e.target.value })}
                    style={{ ...inp, width: 92, opacity: v.kapali ? 0.45 : 1 }}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: inkSoft, cursor: "pointer", marginLeft: "auto" }}>
                    <input type="checkbox" checked={v.kapali} onChange={(e) => setDay(d.k, { kapali: e.target.checked })} /> Kapalı
                  </label>
                </div>
              );
            })}

            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)", marginTop: 18, marginBottom: 8 }}>Rezervasyon</div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13.5 }}>Varsayılan oturma süresi:</span>
              <input
                value={oturmaSuresi}
                onChange={(e) => setOturmaSuresi(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric" className="tnum" style={{ ...inp, width: 62, textAlign: "right" }}
              />
              <span style={{ fontSize: 13.5 }}>dakika</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginBottom: 12, lineHeight: 1.6 }}>
              Bir masanın ortalama ne kadar dolu kaldığı. Aynı masaya ikinci rezervasyon
              alınabilir mi hesabı buna dayanacak.
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13.5 }}>Akşam dönemi şu saatte başlar:</span>
              <input
                value={aksamBaslangic}
                onChange={(e) => setAksamBaslangic(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric" className="tnum" style={{ ...inp, width: 50, textAlign: "right" }}
              />
              <span style={{ fontSize: 13.5 }}>:00</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginBottom: 16, lineHeight: 1.6 }}>
              Kapasite hesabı günü tek havuzda saymaz: bu saatten önceki (öğle) ve sonraki
              (akşam) diye iki ayrı dönem sayar — öğlenin dolması akşamı dolu göstermesin diye.
            </div>

            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)", marginBottom: 8 }}>KVKK aydınlatma metni</div>
            <textarea
              value={kvkkNotice}
              onChange={(e) => setKvkkNotice(e.target.value)}
              rows={5}
              placeholder="Misafirin telefonunu alırken gösterilecek aydınlatma metni…"
              style={{ ...inp, width: "100%", resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }}
            />
            <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 6, marginBottom: 8, lineHeight: 1.6 }}>
              Boş bırakılırsa misafir sayfasında ve rezervasyon formunda uyarı çıkar.
            </div>
          </div>

          {/* Tek Kaydet — sağ paneldeki her şey birlikte kaydedilir (PAGE_STANDARDS #2). */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 12, flexShrink: 0 }}>
            <button onClick={kaydet} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
            {kaydedildi && <span style={{ fontSize: 12.5, color: "var(--brand)" }}>Kaydedildi.</span>}
            <Spacer />
            <span style={{ fontSize: 11.5, color: "var(--muted-2)" }}>Masalar anında kaydedilir, butona gerek yok.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 10px", fontSize: 13, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0, boxSizing: "border-box" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 };
const btnPrimary: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, border: "none", borderRadius: 980, padding: "9px 14px", background: "var(--brand-strong)", color: "#fff", fontSize: 13, fontWeight: 500, flexShrink: 0, cursor: "pointer" };
const btnGhost: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "7px 12px", background: "var(--card)", color: "var(--ink)", fontSize: 12, flexShrink: 0, cursor: "pointer" };
const btnGhostRow: React.CSSProperties = { ...btnGhost, padding: "4px 12px" };
const inkSoft = "#5c5c58";
const navBtn: React.CSSProperties = { all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: 6, borderRadius: 8, color: "var(--muted)" };
