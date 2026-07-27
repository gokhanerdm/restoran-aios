"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getMyRestaurantId } from "@/lib/supabase/restaurant";
import EditableText from "../components/EditableText";
import { Play, Square, Pencil } from "lucide-react";

// Vardiya — gerçek işçilik maliyetinin ön koşulu. Aylık brüt maaş (Personel sayfası) "bu ay ne
// ödüyorum" sorusunu cevaplar ama "bugün kaç saat işçilik yandı" sorusunu cevaplayamaz; günlük
// prime cost (malzeme + işçilik) için mesai kaydı şart. Bu ekran o kaydı tutar.

type Staff = {
  id: string;
  full_name: string;
  role: string;
  active: boolean;
  gross_salary: number;
  hourly_rate: number | null;
  deleted_at: string | null;
};
type Shift = { id: string; staff_id: string; started_at: string; ended_at: string | null };
type CostRow = { staff_id: string; full_name: string; role: string; toplam_saat: number; maliyet: number; yontem: string };

const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;
const r2 = (n: number) => Math.round(n * 100) / 100;

const ROLES: Record<string, string> = {
  garson: "Garson", mutfak: "Mutfak", bar: "Bar", kasa: "Kasa", sef: "Şef", yonetici: "Yönetici",
};
const roleLabel = (v: string) => ROLES[v] ?? v;

const istGun = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);
const bugunIstanbul = () => istGun(new Date());
const gunOnce = (n: number) => istGun(new Date(Date.now() - n * 86400000));
// Türkiye 2016'dan beri yıl boyu UTC+03 (yaz saati yok) — projede gün sınırları bu ofsetle kuruluyor.
const gunBasi = (gun: string) => new Date(`${gun}T00:00:00+03:00`);
const gunSonu = (gun: string) => {
  const d = new Date(`${gun}T12:00:00+03:00`);
  d.setDate(d.getDate() + 1);
  return new Date(`${istGun(d)}T00:00:00+03:00`);
};

const sureLabel = (ms: number) => {
  const mins = Math.max(0, Math.floor(ms / 60000));
  return mins < 60 ? `${mins} dk` : `${Math.floor(mins / 60)}s ${mins % 60}dk`;
};
const tarihSaat = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const saatSadece = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

// datetime-local her zaman İstanbul saatiyle gösterilir/okunur — cihazın saat dilimi ne olursa olsun.
const toInputValue = (iso: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}`;
};
const fromInputValue = (v: string) => {
  if (!v) return null;
  const d = new Date(`${v.length === 16 ? `${v}:00` : v}+03:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

export default function Vardiya() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [openShifts, setOpenShifts] = useState<Shift[]>([]);
  const [history, setHistory] = useState<Shift[]>([]);
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [now, setNow] = useState<number | null>(null);
  const [selected, setSelected] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setFrom(gunOnce(6)); setTo(bugunIstanbul()); }, []);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const range = useMemo(() => {
    if (!from || !to) return null;
    return { fromMs: gunBasi(from).getTime(), toMs: gunSonu(to).getTime() };
  }, [from, to]);

  const load = useCallback(async () => {
    if (!from || !to) return;
    const restId = await getMyRestaurantId();
    if (!restId) return;
    setRestaurantId(restId);
    const fromIso = gunBasi(from).toISOString();
    const toIso = gunSonu(to).toISOString();

    const [{ data: st }, { data: open }, { data: hist }, { data: cost, error: costErr }] = await Promise.all([
      supabase.from("staff_members").select("id, full_name, role, active, gross_salary, hourly_rate, deleted_at").eq("restaurant_id", restId).order("full_name"),
      supabase.from("staff_shifts").select("id, staff_id, started_at, ended_at").eq("restaurant_id", restId).is("ended_at", null).order("started_at"),
      supabase.from("staff_shifts").select("id, staff_id, started_at, ended_at").eq("restaurant_id", restId)
        .lt("started_at", toIso).or(`ended_at.is.null,ended_at.gt.${fromIso}`).order("started_at", { ascending: false }),
      supabase.rpc("staff_shift_cost", { p_restaurant_id: restId, p_from: fromIso, p_to: toIso }),
    ]);

    setStaff((st as Staff[]) ?? []);
    setOpenShifts((open as Shift[]) ?? []);
    setHistory((hist as Shift[]) ?? []);
    setCosts((cost as CostRow[]) ?? []);
    if (costErr) setErr(`Maliyet özeti alınamadı: ${costErr.message}`);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const staffMap = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s] as const)) as Record<string, Staff>, [staff]);
  const costMap = useMemo(() => Object.fromEntries(costs.map((c) => [c.staff_id, c] as const)) as Record<string, CostRow>, [costs]);
  const openIds = useMemo(() => new Set(openShifts.map((s) => s.staff_id)), [openShifts]);
  const secilebilir = useMemo(
    () => staff.filter((s) => s.active && !s.deleted_at && !openIds.has(s.id)),
    [staff, openIds],
  );

  // Saat ücreti girilmişse gerçek rakam; yoksa aylık brüt maaştan yaklaşık (30 gün × 8 saat).
  const saatUcreti = (s: Staff | undefined) => {
    if (!s) return 0;
    const hr = Number(s.hourly_rate ?? 0);
    return hr > 0 ? hr : Number(s.gross_salary ?? 0) / 30 / 8;
  };
  // Aralığın dışına taşan vardiya kırpılır, açık vardiya "şu an"a kadar sayılır — RPC ile aynı kural.
  const kirpilmisMs = (sh: Shift) => {
    if (!range || now == null) return 0;
    const st = Math.max(new Date(sh.started_at).getTime(), range.fromMs);
    const en = Math.min(sh.ended_at ? new Date(sh.ended_at).getTime() : now, range.toMs);
    return Math.max(0, en - st);
  };
  const satirMaliyet = (sh: Shift) => (kirpilmisMs(sh) / 3600000) * saatUcreti(staffMap[sh.staff_id]);
  const adOf = (id: string) => staffMap[id]?.full_name ?? costMap[id]?.full_name ?? "—";

  const toplamSaat = costs.reduce((s, c) => s + Number(c.toplam_saat), 0);
  const toplamMaliyet = costs.reduce((s, c) => s + Number(c.maliyet), 0);
  const tahminliVar = costs.some((c) => c.yontem === "maastan_tahmin" && Number(c.toplam_saat) > 0);

  // Özet listesi RPC sonucu + aktif personel birleşimi: aralıkta hiç çalışmamış olan da görünsün ki
  // saat ücreti buradan girilebilsin, aralıkta çalışmış ama artık pasif olan da kaybolmasın.
  const ozet = useMemo(() => {
    const rows = staff
      .filter((s) => s.active && !s.deleted_at)
      .map((s) => ({
        staff_id: s.id,
        full_name: s.full_name,
        toplam_saat: Number(costMap[s.id]?.toplam_saat ?? 0),
        maliyet: Number(costMap[s.id]?.maliyet ?? 0),
        yontem: costMap[s.id]?.yontem ?? (Number(s.hourly_rate ?? 0) > 0 ? "saatlik" : "maastan_tahmin"),
      }));
    costs.forEach((c) => {
      if (rows.some((r) => r.staff_id === c.staff_id)) return;
      rows.push({ staff_id: c.staff_id, full_name: c.full_name, toplam_saat: Number(c.toplam_saat), maliyet: Number(c.maliyet), yontem: c.yontem });
    });
    return rows.sort((a, b) => b.maliyet - a.maliyet || a.full_name.localeCompare(b.full_name, "tr"));
  }, [staff, costs, costMap]);

  const startShift = async () => {
    if (!restaurantId || !selected) return;
    setErr(null);
    const { error } = await supabase.from("staff_shifts").insert({ restaurant_id: restaurantId, staff_id: selected });
    if (error) {
      setErr(error.message.includes("uniq_staff_shifts_open") ? "Bu personelin zaten açık bir vardiyası var." : error.message);
      return;
    }
    setSelected("");
    await load();
  };

  const endShift = async (sh: Shift) => {
    setErr(null);
    const { error } = await supabase.from("staff_shifts").update({ ended_at: new Date().toISOString() }).eq("id", sh.id);
    if (error) { setErr(error.message); return; }
    await load();
  };

  const startEdit = (sh: Shift) => {
    setErr(null);
    setEditingId(sh.id);
    setEditStart(toInputValue(sh.started_at));
    setEditEnd(sh.ended_at ? toInputValue(sh.ended_at) : "");
  };

  const saveEdit = async () => {
    if (!editingId) return;
    setErr(null);
    const st = fromInputValue(editStart);
    if (!st) { setErr("Başlangıç saati geçersiz."); return; }
    const en = editEnd ? fromInputValue(editEnd) : null;
    if (editEnd && !en) { setErr("Bitiş saati geçersiz."); return; }
    if (en && new Date(en).getTime() <= new Date(st).getTime()) { setErr("Bitiş, başlangıçtan sonra olmalı."); return; }
    const { error } = await supabase.from("staff_shifts").update({ started_at: st, ended_at: en }).eq("id", editingId);
    if (error) {
      setErr(error.message.includes("uniq_staff_shifts_open") ? "Bu personelin başka bir açık vardiyası var — önce onu bitir." : error.message);
      return;
    }
    setEditingId(null);
    await load();
  };

  const saveRate = async (staffId: string, v: string) => {
    const n = parseFloat(v.replace(",", ".")) || 0;
    await supabase.from("staff_members").update({ hourly_rate: n > 0 ? n : null }).eq("id", staffId);
    await load();
  };

  return (
    <div style={{ padding: "26px 28px", height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>Vardiya</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 7 }}>
            {openShifts.length > 0 ? `${openShifts.length} kişi şu an mesaide` : "Şu an mesaide kimse yok"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Aralık</span>
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} style={inp} />
          <span style={{ fontSize: 12.5, color: "var(--muted-2)" }}>–</span>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} style={inp} />
        </div>
      </div>

      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10, flexShrink: 0 }}>{err}</div>}

      {/* ŞU AN MESAİDE + MESAİ BAŞLAT */}
      <div style={{ ...card, flexShrink: 0, marginBottom: 16 }}>
        <SectionLabel>Şu an mesaide</SectionLabel>
        <div style={{ maxHeight: "28vh", overflowY: "auto" }}>
          {openShifts.map((sh) => (
            <div key={sh.id} style={{ display: "flex", alignItems: "center", fontSize: 13.5, padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
              <span style={{ flex: 1.2, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{adOf(sh.staff_id)}</span>
              <span style={{ flex: 0.8, color: "var(--muted)" }}>{roleLabel(staffMap[sh.staff_id]?.role ?? "")}</span>
              <span className="tnum" style={{ width: 110, color: "var(--muted)" }}>{saatSadece(sh.started_at)}&apos;te başladı</span>
              <span className="tnum" style={{ width: 90, textAlign: "right", fontWeight: 600, color: "var(--brand)" }}>
                {now == null ? "—" : sureLabel(now - new Date(sh.started_at).getTime())}
              </span>
              <span style={{ width: 118, display: "flex", justifyContent: "flex-end" }}>
                <button onClick={() => endShift(sh)} style={btnSecondary}><Square size={12} /> Mesai bitir</button>
              </span>
            </div>
          ))}
          {openShifts.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "8px 0" }}>Açık vardiya yok.</div>}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && startShift()}
            style={{ ...inp, width: 260 }}
          >
            <option value="">Personel seç…</option>
            {secilebilir.map((s) => <option key={s.id} value={s.id}>{s.full_name} · {roleLabel(s.role)}</option>)}
          </select>
          <button onClick={startShift} disabled={!selected} style={{ ...btnPrimary, opacity: selected ? 1 : 0.45 }}><Play size={13} /> Mesai başlat</button>
          {secilebilir.length === 0 && staff.length > 0 && (
            <span style={{ fontSize: 12, color: "var(--muted-2)" }}>Aktif personelin tamamı zaten mesaide.</span>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
        {/* GEÇMİŞ VARDİYALAR */}
        <div style={{ ...card, flex: 1.6, minWidth: 380, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <SectionLabel>Vardiya kaydı</SectionLabel>
          <div style={{ display: "flex", fontSize: 11, color: "var(--muted-2)", padding: "0 0 8px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
            <span style={{ flex: 1.2 }}>Personel</span>
            <span style={{ width: 168 }}>Başlangıç</span>
            <span style={{ width: 168 }}>Bitiş</span>
            <span style={{ width: 78, textAlign: "right" }}>Süre</span>
            <span style={{ width: 90, textAlign: "right" }}>Maliyet</span>
            <span style={{ width: 30 }} />
          </div>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {history.map((sh) => {
              const duzenleniyor = editingId === sh.id;
              return (
                <div key={sh.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", alignItems: "center", fontSize: 13 }}>
                    <span style={{ flex: 1.2, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{adOf(sh.staff_id)}</span>
                    {duzenleniyor ? (
                      <>
                        <span style={{ width: 168 }}>
                          <input type="datetime-local" value={editStart} onChange={(e) => setEditStart(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEdit()} style={{ ...inp, width: 158, padding: "5px 7px", fontSize: 12.5 }} />
                        </span>
                        <span style={{ width: 168 }}>
                          <input type="datetime-local" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEdit()} style={{ ...inp, width: 158, padding: "5px 7px", fontSize: 12.5 }} />
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="tnum" style={{ width: 168, color: "var(--muted)" }}>{tarihSaat(sh.started_at)}</span>
                        <span className="tnum" style={{ width: 168, color: sh.ended_at ? "var(--muted)" : "var(--brand)" }}>
                          {sh.ended_at ? tarihSaat(sh.ended_at) : "sürüyor"}
                        </span>
                      </>
                    )}
                    <span className="tnum" style={{ width: 78, textAlign: "right", fontWeight: 500 }}>{now == null ? "—" : sureLabel(kirpilmisMs(sh))}</span>
                    <span className="tnum" style={{ width: 90, textAlign: "right" }}>{now == null ? "—" : money(satirMaliyet(sh))}</span>
                    <span style={{ width: 30, display: "flex", justifyContent: "flex-end" }}>
                      {!duzenleniyor && (
                        <button onClick={() => startEdit(sh)} aria-label="saatleri düzelt" title="Saatleri düzelt" style={{ all: "unset", cursor: "pointer", color: "var(--muted-2)", display: "inline-flex" }}>
                          <Pencil size={13} />
                        </button>
                      )}
                    </span>
                  </div>
                  {duzenleniyor && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7 }}>
                      <span style={{ fontSize: 11.5, color: "var(--muted-2)", flex: 1 }}>Bitişi boş bırakırsan vardiya açık kalır (halen mesaide).</span>
                      <button onClick={saveEdit} style={btnSmall}>Kaydet</button>
                      <button onClick={() => setEditingId(null)} style={btnSecondary}>Vazgeç</button>
                    </div>
                  )}
                </div>
              );
            })}
            {history.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>Bu aralıkta vardiya kaydı yok.</div>}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 0 0", borderTop: "1px solid var(--line)", marginTop: 4, flexShrink: 0 }}>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{history.length} vardiya · toplam <span className="tnum">{r2(toplamSaat).toLocaleString("tr-TR")}</span> saat</span>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              Toplam işçilik: <span className="tnum" style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.4px", color: "var(--ink-green)" }}>{money(toplamMaliyet)}</span>
            </span>
          </div>
        </div>

        {/* KİŞİ BAZLI ÖZET */}
        <div style={{ ...card, flex: 1, minWidth: 300, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <SectionLabel>Kişi bazında işçilik</SectionLabel>
          <div style={{ display: "flex", fontSize: 11, color: "var(--muted-2)", padding: "0 0 8px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
            <span style={{ flex: 1 }}>Personel</span>
            <span style={{ width: 74, textAlign: "right" }}>Saat ücreti</span>
            <span style={{ width: 58, textAlign: "right" }}>Saat</span>
            <span style={{ width: 84, textAlign: "right" }}>Maliyet</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {costs.map((c) => (
              <div key={c.staff_id} style={{ display: "flex", alignItems: "center", fontSize: 13, padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.full_name}</span>
                  <span style={{ fontSize: 11, color: c.yontem === "saatlik" ? "var(--muted-2)" : "var(--gold-text)" }}>
                    {c.yontem === "saatlik" ? "saatlik ücret" : "maaştan tahmin"}
                  </span>
                </span>
                <span style={{ width: 74, textAlign: "right" }}>
                  <EditableText
                    value={String(r2(Number(staffMap[c.staff_id]?.hourly_rate ?? 0)))}
                    onSave={(v) => saveRate(c.staff_id, v)}
                    style={{ display: "inline-block", color: Number(staffMap[c.staff_id]?.hourly_rate ?? 0) > 0 ? "var(--ink)" : "var(--muted-2)" }}
                    inputWidth={58}
                  />
                </span>
                <span className="tnum" style={{ width: 58, textAlign: "right" }}>{r2(Number(c.toplam_saat)).toLocaleString("tr-TR")}</span>
                <span className="tnum" style={{ width: 84, textAlign: "right", fontWeight: 500 }}>{money(Number(c.maliyet))}</span>
              </div>
            ))}
            {costs.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>Bu aralıkta çalışma kaydı yok.</div>}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted-2)", lineHeight: 1.5, paddingTop: 10, borderTop: "1px solid var(--line)", marginTop: 4, flexShrink: 0 }}>
            Saat ücretini çift tıklayıp yazabilirsin. 0 bırakılırsa maliyet aylık brüt maaştan
            (30 gün × 8 saat) yaklaşık hesaplanır.
            {tahminliVar ? " Bu aralıkta en az bir kişi tahminle hesaplandı — gerçek rakam için saat ücretini gir." : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10, flexShrink: 0 }}>{children}</div>;
}

const card: React.CSSProperties = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18 };
const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 10px", fontSize: 13, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0 };
const btnPrimary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, border: "none", borderRadius: 980, padding: "9px 16px", background: "var(--brand-strong)", color: "#fff", fontSize: 13, fontWeight: 500, flexShrink: 0 };
const btnSecondary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid var(--line-2)", borderRadius: 980, padding: "6px 12px", background: "var(--card)", color: "var(--ink-green)", fontSize: 12.5, flexShrink: 0 };
const btnSmall: React.CSSProperties = { border: "none", borderRadius: 10, padding: "7px 13px", background: "var(--ink-green)", color: "#fff", fontSize: 12.5, flexShrink: 0 };
