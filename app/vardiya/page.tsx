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

// --- Puantaj / yasal uyum (20260728120000_timesheet_overtime_leave.sql) ---
// 4857 sayılı İş Kanunu md.67 çalışma sürelerinin kayıt altına alınmasını zorunlu kılıyor;
// md.63 haftalık sınırı 45 saat, md.41 fazla çalışma için yazılı onay ve yılda 270 saat tavanı,
// md.53 yıllık izin sürelerini belirliyor. Vardiya kaydı vardı, yasal çerçeve eksikti.
type TimesheetRow = { staff_id: string; full_name: string; role: string; work_date: string; hours: number };
type ComplianceRow = {
  staff_id: string; full_name: string; role: string; hire_date: string | null;
  week_hours: number; overtime_hours: number; has_consent: boolean; year_overtime_hours: number;
  leave_entitled: number; leave_used: number; leave_remaining: number;
};
type Leave = { id: string; staff_id: string; leave_type: string; start_date: string; end_date: string; note: string | null };

const HAFTA_GUN = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const LEAVE_TYPES: { v: string; l: string }[] = [
  { v: "yillik", l: "Yıllık izin" },
  { v: "ucretsiz", l: "Ücretsiz" },
  { v: "raporlu", l: "Raporlu" },
  { v: "mazeret", l: "Mazeret" },
];
const HAFTALIK_SINIR = 45;   // İş Kanunu md.63
const YILLIK_FAZLA_TAVAN = 270; // İş Kanunu md.41

// --- Satış tahmini / personel planı (20260728140000_sales_forecast_staffing.sql) ---
// Tahmin, aynı hafta gününün son 8 haftalık ağırlıklı ortalaması. Bilerek basit: işletmeci
// rakamın nereden geldiğini göremezse güvenmez, güvenmediği plana da uymaz.
type PlanRow = {
  forecast_date: string; weekday: number;
  predicted_covers: number; predicted_revenue: number;
  covers_per_staff_hour: number | null; suggested_staff_hours: number | null;
  suggested_staff_count: number | null; estimated_labor_cost: number | null;
  labor_percent: number | null; target_labor_percent: number; confidence: string;
  holiday_name: string | null; basis: string;
};
// Tahmin rakamının nereden geldiği. İşletmeci "bu sayı nereden çıktı" diyebilmeli,
// yoksa güvenmez; güvenmediği plana da uymaz.
const BASIS_ETIKET: Record<string, string> = {
  hafta_gunu: "hafta günü ortalaması",
  benzer_tatil: "geçmiş bayramlardan",
  tatil_veri_yok: "bayram — geçmiş veri yok",
};
const GUVEN: Record<string, { l: string; renk: string }> = {
  yuksek: { l: "yüksek", renk: "var(--brand)" },
  orta: { l: "orta", renk: "var(--gold-text)" },
  dusuk: { l: "düşük", renk: "var(--muted-2)" },
};
// isodow: 1 = Pazartesi … 7 = Pazar
const GUN_ADI = ["", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;
const r2 = (n: number) => Math.round(n * 100) / 100;

const ROLES: Record<string, string> = {
  garson: "Garson", mutfak: "Mutfak", bar: "Bar", kasa: "Kasa", sef: "Şef", yonetici: "Yönetici",
  karsilama: "Karşılama", vale: "Vale", bulasik: "Bulaşık",
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

// Puantaj haftası pazartesi başlar (Postgres date_trunc('week') ile aynı kural).
const haftaBasi = (gun: string) => {
  const d = new Date(`${gun}T12:00:00+03:00`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return istGun(d);
};
const gunEkle = (gun: string, n: number) => {
  const d = new Date(`${gun}T12:00:00+03:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return istGun(d);
};
const kisaTarih = (gun: string) => `${gun.slice(8, 10)}.${gun.slice(5, 7)}`;

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

  // Puantaj görünümü — vardiya kaydıyla aynı veriden beslenir, ayrı ekran açmamak için
  // aynı sayfada sekme olarak duruyor.
  const [gorunum, setGorunum] = useState<"vardiya" | "puantaj" | "plan">("vardiya");
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [hedefIscilik, setHedefIscilik] = useState("30");
  const [hafta, setHafta] = useState("");
  const [timesheet, setTimesheet] = useState<TimesheetRow[]>([]);
  const [compliance, setCompliance] = useState<ComplianceRow[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [izinFor, setIzinFor] = useState<string | null>(null);
  const [izinTip, setIzinTip] = useState("yillik");
  const [izinBas, setIzinBas] = useState("");
  const [izinBit, setIzinBit] = useState("");

  useEffect(() => { setFrom(gunOnce(6)); setTo(bugunIstanbul()); setHafta(haftaBasi(bugunIstanbul())); }, []);
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

  const loadPuantaj = useCallback(async () => {
    if (!hafta || gorunum !== "puantaj") return;
    const restId = await getMyRestaurantId();
    if (!restId) return;
    setRestaurantId(restId);
    const [{ data: ts }, { data: lc }, { data: lv }] = await Promise.all([
      supabase.rpc("weekly_timesheet", { p_restaurant: restId, p_week_start: hafta }),
      supabase.rpc("labor_compliance", { p_restaurant: restId, p_week_start: hafta }),
      supabase.from("staff_leaves").select("id, staff_id, leave_type, start_date, end_date, note")
        .eq("restaurant_id", restId).is("deleted_at", null)
        .gte("end_date", `${hafta.slice(0, 4)}-01-01`).order("start_date", { ascending: false }),
    ]);
    setTimesheet((ts as TimesheetRow[]) ?? []);
    setCompliance((lc as ComplianceRow[]) ?? []);
    setLeaves((lv as Leave[]) ?? []);
  }, [hafta, gorunum]);

  useEffect(() => { loadPuantaj(); }, [loadPuantaj]);

  const loadPlan = useCallback(async () => {
    if (gorunum !== "plan") return;
    const restId = await getMyRestaurantId();
    if (!restId) return;
    setRestaurantId(restId);
    const [{ data: pl }, { data: st }] = await Promise.all([
      supabase.rpc("staffing_plan", { p_restaurant: restId, p_days_ahead: 14 }),
      supabase.from("restaurant_settings").select("target_labor_percent").eq("restaurant_id", restId).maybeSingle(),
    ]);
    setPlan((pl as PlanRow[]) ?? []);
    setHedefIscilik(String((st as { target_labor_percent: number } | null)?.target_labor_percent ?? 30));
  }, [gorunum]);

  useEffect(() => { loadPlan(); }, [loadPlan]);

  const hedefKaydet = async () => {
    if (!restaurantId) return;
    const n = Math.min(99, Math.max(1, parseFloat(hedefIscilik.replace(",", ".")) || 30));
    await supabase.from("restaurant_settings").upsert(
      { restaurant_id: restaurantId, target_labor_percent: n }, { onConflict: "restaurant_id" },
    );
    await loadPlan();
  };

  const haftaGunleri = useMemo(() => (hafta ? Array.from({ length: 7 }, (_, i) => gunEkle(hafta, i)) : []), [hafta]);
  // personel × gün → saat
  const puantajMap = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    timesheet.forEach((r) => { (m[r.staff_id] ??= {})[r.work_date] = Number(r.hours); });
    return m;
  }, [timesheet]);

  const izinKaydet = async () => {
    if (!restaurantId || !izinFor || !izinBas || !izinBit) return;
    setErr(null);
    if (izinBit < izinBas) { setErr("İzin bitişi başlangıçtan önce olamaz."); return; }
    const { error } = await supabase.from("staff_leaves").insert({
      restaurant_id: restaurantId, staff_id: izinFor, leave_type: izinTip,
      start_date: izinBas, end_date: izinBit,
    });
    if (error) { setErr(error.message); return; }
    setIzinFor(null); setIzinBas(""); setIzinBit(""); setIzinTip("yillik");
    await loadPuantaj();
  };

  const izinSil = async (id: string) => {
    await supabase.from("staff_leaves").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    await loadPuantaj();
  };

  // İş Kanunu md.41: fazla çalışma işçinin yazılı onayına bağlı, onay yılda bir alınır.
  const onayDegistir = async (staffId: string, varMi: boolean) => {
    if (!restaurantId || !hafta) return;
    setErr(null);
    const yil = parseInt(hafta.slice(0, 4), 10);
    if (varMi) {
      await supabase.from("overtime_consents").delete().eq("staff_id", staffId).eq("consent_year", yil);
    } else {
      const { error } = await supabase.from("overtime_consents").insert({ restaurant_id: restaurantId, staff_id: staffId, consent_year: yil });
      if (error) { setErr(error.message); return; }
    }
    await loadPuantaj();
  };

  const iseGirisKaydet = async (staffId: string, v: string) => {
    await supabase.from("staff_members").update({ hire_date: v || null }).eq("id", staffId);
    await loadPuantaj();
  };

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
          <div style={{ display: "flex", gap: 4, background: "var(--recede)", borderRadius: 980, padding: 3, marginRight: 4 }}>
            {([["vardiya", "Vardiya"], ["puantaj", "Puantaj & izin"], ["plan", "Plan"]] as const).map(([v, l]) => (
              <button key={v} onClick={() => setGorunum(v)} style={{
                border: "none", borderRadius: 980, padding: "6px 14px", fontSize: 12.5, cursor: "pointer",
                background: gorunum === v ? "var(--ink-green)" : "transparent",
                color: gorunum === v ? "#fff" : "var(--muted)",
              }}>{l}</button>
            ))}
          </div>
          {gorunum === "vardiya" ? (
            <>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Aralık</span>
              <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} style={inp} />
              <span style={{ fontSize: 12.5, color: "var(--muted-2)" }}>–</span>
              <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} style={inp} />
            </>
          ) : gorunum === "plan" ? (
            <>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Hedef işçilik</span>
              <input value={hedefIscilik} onChange={(e) => setHedefIscilik(e.target.value)} onKeyDown={(e) => e.key === "Enter" && hedefKaydet()} onBlur={hedefKaydet} inputMode="decimal" className="tnum" style={{ ...inp, width: 56, textAlign: "right" }} />
              <span style={{ fontSize: 12.5, color: "var(--muted-2)" }}>% ciro</span>
            </>
          ) : (
            <>
              <button onClick={() => setHafta((h) => gunEkle(h, -7))} style={btnSecondary}>‹</button>
              <span className="tnum" style={{ fontSize: 12.5, color: "var(--muted)", minWidth: 116, textAlign: "center" }}>
                {hafta ? `${kisaTarih(hafta)} – ${kisaTarih(gunEkle(hafta, 6))}` : "—"}
              </span>
              <button onClick={() => setHafta((h) => gunEkle(h, 7))} style={btnSecondary}>›</button>
              <button onClick={() => setHafta(haftaBasi(bugunIstanbul()))} style={btnSecondary}>Bu hafta</button>
            </>
          )}
        </div>
      </div>

      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10, flexShrink: 0 }}>{err}</div>}

      {gorunum === "vardiya" && (<>
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
      </>)}

      {gorunum === "puantaj" && (
        <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
          {/* PUANTAJ CETVELİ — İş Kanunu md.67 gereği tutulması zorunlu kayıt */}
          <div style={{ ...card, flex: 1.5, minWidth: 420, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <SectionLabel>Puantaj cetveli</SectionLabel>
            <div style={{ display: "flex", fontSize: 11, color: "var(--muted-2)", padding: "0 0 8px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
              <span style={{ flex: 1.4, minWidth: 0 }}>Personel</span>
              {haftaGunleri.map((g, i) => (
                <span key={g} style={{ width: 46, textAlign: "right" }}>{HAFTA_GUN[i]}</span>
              ))}
              <span style={{ width: 58, textAlign: "right" }}>Toplam</span>
            </div>
            <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {compliance.map((c) => {
                const gunler = puantajMap[c.staff_id] ?? {};
                const asim = Number(c.week_hours) > HAFTALIK_SINIR;
                return (
                  <div key={c.staff_id} style={{ display: "flex", alignItems: "center", fontSize: 13, padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ flex: 1.4, minWidth: 0 }}>
                      <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.full_name}</span>
                      <span style={{ fontSize: 11, color: "var(--muted-2)" }}>{roleLabel(c.role)}</span>
                    </span>
                    {haftaGunleri.map((g) => {
                      const s = gunler[g] ?? 0;
                      return (
                        <span key={g} className="tnum" style={{ width: 46, textAlign: "right", color: s > 0 ? "var(--ink)" : "var(--muted-2)" }}>
                          {s > 0 ? r2(s).toLocaleString("tr-TR") : "—"}
                        </span>
                      );
                    })}
                    <span className="tnum" style={{ width: 58, textAlign: "right", fontWeight: 600, color: asim ? "var(--danger)" : "var(--ink)" }}>
                      {r2(Number(c.week_hours)).toLocaleString("tr-TR")}
                    </span>
                  </div>
                );
              })}
              {compliance.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>Aktif personel yok.</div>}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted-2)", lineHeight: 1.5, paddingTop: 10, borderTop: "1px solid var(--line)", marginTop: 4, flexShrink: 0 }}>
              İş Kanunu md.67 çalışma sürelerinin kayıt altına alınmasını zorunlu kılar.
              Gece yarısını geçen vardiya başladığı güne yazılır (18:00–02:00 tek çalışma günüdür).
            </div>
          </div>

          {/* YASAL UYUM + İZİN */}
          <div style={{ ...card, flex: 1, minWidth: 340, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <SectionLabel>Yasal uyum ve izin</SectionLabel>
            <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {compliance.map((c) => {
                const fazla = Number(c.overtime_hours);
                const yilFazla = Number(c.year_overtime_hours);
                const tavanAsim = yilFazla > YILLIK_FAZLA_TAVAN;
                const izinleri = leaves.filter((l) => l.staff_id === c.staff_id);
                return (
                  <div key={c.staff_id} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.full_name}</span>
                      <span className="tnum" style={{ fontSize: 12.5, color: fazla > 0 ? "var(--danger)" : "var(--muted-2)", flexShrink: 0 }}>
                        {fazla > 0 ? `+${r2(fazla).toLocaleString("tr-TR")} sa fazla` : "45 saat içinde"}
                      </span>
                    </div>

                    {fazla > 0 && (
                      <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, marginTop: 5, cursor: "pointer", color: c.has_consent ? "var(--muted)" : "var(--danger)" }}>
                        <input type="checkbox" checked={c.has_consent} onChange={() => onayDegistir(c.staff_id, c.has_consent)} />
                        {hafta.slice(0, 4)} yılı fazla çalışma yazılı onayı alındı
                      </label>
                    )}

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginTop: 5, color: tavanAsim ? "var(--danger)" : "var(--muted-2)" }}>
                      <span>Yıllık fazla çalışma</span>
                      <span className="tnum">{r2(yilFazla).toLocaleString("tr-TR")} / {YILLIK_FAZLA_TAVAN} sa</span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginTop: 3, color: "var(--muted-2)" }}>
                      <span>Yıllık izin (hak / kullanılan / kalan)</span>
                      <span className="tnum">{c.leave_entitled} / {c.leave_used} / {c.leave_remaining}</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                      <span style={{ fontSize: 11.5, color: "var(--muted-2)", flexShrink: 0 }}>İşe giriş</span>
                      <input type="date" value={c.hire_date ?? ""} onChange={(e) => iseGirisKaydet(c.staff_id, e.target.value)} style={{ ...inp, padding: "4px 7px", fontSize: 12 }} />
                      {!c.hire_date && <span style={{ fontSize: 11, color: "var(--gold-text)" }}>izin hakkı hesaplanamıyor</span>}
                    </div>

                    {izinleri.length > 0 && (
                      <div style={{ marginTop: 5 }}>
                        {izinleri.map((l) => (
                          <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5, color: "var(--muted)", padding: "2px 0" }}>
                            <span>{LEAVE_TYPES.find((t) => t.v === l.leave_type)?.l ?? l.leave_type} · {kisaTarih(l.start_date)}–{kisaTarih(l.end_date)}</span>
                            <button onClick={() => izinSil(l.id)} title="Sil" style={{ all: "unset", cursor: "pointer", color: "var(--muted-2)", fontSize: 11 }}>sil</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {izinFor === c.staff_id ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
                        {/* PAGE_STANDARDS #1b: ekle formunda her alan Enter'a basınca da kaydeder. */}
                        <select value={izinTip} onChange={(e) => setIzinTip(e.target.value)} onKeyDown={(e) => e.key === "Enter" && izinKaydet()} style={{ ...inp, padding: "5px 8px", fontSize: 12, width: 108 }}>
                          {LEAVE_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
                        </select>
                        <input type="date" value={izinBas} onChange={(e) => setIzinBas(e.target.value)} onKeyDown={(e) => e.key === "Enter" && izinKaydet()} style={{ ...inp, padding: "5px 7px", fontSize: 12 }} />
                        <input type="date" value={izinBit} onChange={(e) => setIzinBit(e.target.value)} onKeyDown={(e) => e.key === "Enter" && izinKaydet()} style={{ ...inp, padding: "5px 7px", fontSize: 12 }} />
                        <button onClick={izinKaydet} style={btnSmall}>Kaydet</button>
                        <button onClick={() => setIzinFor(null)} style={{ all: "unset", cursor: "pointer", fontSize: 12, color: "var(--muted)" }}>Vazgeç</button>
                      </div>
                    ) : (
                      <button onClick={() => { setIzinFor(c.staff_id); setIzinBas(bugunIstanbul()); setIzinBit(bugunIstanbul()); }} style={{ all: "unset", cursor: "pointer", fontSize: 12, color: "var(--brand)", paddingTop: 5 }}>+ İzin ekle</button>
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted-2)", lineHeight: 1.5, paddingTop: 10, borderTop: "1px solid var(--line)", marginTop: 4, flexShrink: 0 }}>
              Haftalık sınır 45 saat (md.63). Fazla çalışma yazılı onaya bağlıdır ve yılda 270 saati
              geçemez (md.41). Yıllık izin: 1–5 yıl 14 gün, 5–15 yıl 20 gün, 15+ yıl 26 gün (md.53) —
              işe giriş tarihinden hesaplanır.
            </div>
          </div>
        </div>
      )}

      {gorunum === "plan" && (
        <div style={{ ...card, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <SectionLabel>Önümüzdeki 14 gün — tahmin ve personel planı</SectionLabel>
          {plan.length === 0 ? (
            <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>Tahmin için yeterli geçmiş satış verisi yok.</div>
          ) : (
            <>
              {plan[0]?.covers_per_staff_hour == null && (
                <div style={{ padding: "10px 13px", borderRadius: 11, background: "var(--danger-bg)", border: "1px solid var(--gold)", fontSize: 12.5, color: "var(--gold-text)", marginBottom: 12, lineHeight: 1.55 }}>
                  Personel önerisi hesaplanamıyor: son 8 haftada vardiya kaydı yok.
                  Mesai başlat/bitir kullanılmaya başlandığında öneri kendiliğinden gelir —
                  sistem &quot;bir personel-saat kaç misafire yetiyor&quot; oranını geçmişten öğreniyor.
                </div>
              )}
              <div style={{ display: "flex", fontSize: 11, color: "var(--muted-2)", padding: "0 0 8px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
                <span style={{ flex: 1.2, minWidth: 0 }}>Gün</span>
                <span style={{ width: 74, textAlign: "right" }}>Misafir</span>
                <span style={{ width: 96, textAlign: "right" }}>Ciro tahmini</span>
                <span style={{ width: 78, textAlign: "right" }}>Personel-saat</span>
                <span style={{ width: 62, textAlign: "right" }}>Kişi</span>
                <span style={{ width: 96, textAlign: "right" }}>İşçilik</span>
                <span style={{ width: 74, textAlign: "right" }}>Oran</span>
                <span style={{ width: 62, textAlign: "right" }}>Güven</span>
              </div>
              <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                {plan.map((p) => {
                  const oran = p.labor_percent;
                  const hedef = Number(p.target_labor_percent);
                  const asim = oran != null && oran > hedef;
                  const g = GUVEN[p.confidence] ?? GUVEN.dusuk;
                  return (
                    <div key={p.forecast_date} style={{ display: "flex", alignItems: "center", fontSize: 13, padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
                      <span style={{ flex: 1.2, minWidth: 0 }}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {GUN_ADI[p.weekday] ?? "—"}
                          {p.holiday_name && <span style={{ fontSize: 11, fontWeight: 600, color: "var(--gold-text)", marginLeft: 6 }}>{p.holiday_name}</span>}
                        </span>
                        <span className="tnum" style={{ fontSize: 11, color: "var(--muted-2)" }}>
                          {kisaTarih(p.forecast_date)} · {BASIS_ETIKET[p.basis] ?? p.basis}
                        </span>
                      </span>
                      <span className="tnum" style={{ width: 74, textAlign: "right" }}>{Math.round(Number(p.predicted_covers)).toLocaleString("tr-TR")}</span>
                      <span className="tnum" style={{ width: 96, textAlign: "right", fontWeight: 500 }}>{money(Number(p.predicted_revenue))}</span>
                      <span className="tnum" style={{ width: 78, textAlign: "right", color: "var(--muted)" }}>
                        {p.suggested_staff_hours != null ? r2(Number(p.suggested_staff_hours)).toLocaleString("tr-TR") : "—"}
                      </span>
                      <span className="tnum" style={{ width: 62, textAlign: "right", fontWeight: 600, color: "var(--ink-green)" }}>
                        {p.suggested_staff_count != null ? r2(Number(p.suggested_staff_count)).toLocaleString("tr-TR") : "—"}
                      </span>
                      <span className="tnum" style={{ width: 96, textAlign: "right", color: "var(--muted)" }}>
                        {p.estimated_labor_cost != null ? money(Number(p.estimated_labor_cost)) : "—"}
                      </span>
                      <span className="tnum" style={{ width: 74, textAlign: "right", fontWeight: 600, color: oran == null ? "var(--muted-2)" : asim ? "var(--danger)" : "var(--brand)" }}>
                        {oran != null ? `%${r2(oran).toLocaleString("tr-TR")}` : "—"}
                      </span>
                      <span style={{ width: 62, textAlign: "right", fontSize: 11.5, color: g.renk }}>{g.l}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-2)", lineHeight: 1.55, paddingTop: 10, borderTop: "1px solid var(--line)", marginTop: 4, flexShrink: 0 }}>
                Normal günlerde tahmin, aynı hafta gününün son 8 haftalık ağırlıklı ortalamasıdır
                (son 4 hafta çift ağırlıklı) ve bu ortalamaya geçmiş bayramlar karışmaz.
                Resmi tatil ve bayram günleri ise hafta gününe değil, geçmişteki aynı tür
                tatillere bakılarak tahmin edilir; her satırın altında hangi yöntemin
                kullanıldığı yazıyor. Dini bayram tarihleri hesaplanmış değerlerdir, Diyanet
                takvimiyle bir gün oynayabilir.
                Güven: 4+ örnek ve düşük dalgalanma varsa yüksek, dalgalanma büyükse orta, 2 örnekten azsa düşük.
                Personel önerisi geçmişteki &quot;bir personel-saat kaç misafire yetiyor&quot; oranından çıkar,
                kişi sayısı 8 saatlik vardiya varsayımıyla verilir. Oran hedefin üstündeyse kırmızı —
                o gün ya fazla personel planlanmış ya da ciro beklentisi düşük.
                Tatil, hava durumu ve özel gün etkisi bu modelde yok; onları sen düzelteceksin.
              </div>
            </>
          )}
        </div>
      )}
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
