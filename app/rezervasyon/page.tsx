"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getMyRestaurantId } from "@/lib/supabase/restaurant";
import { useConfirm } from "../components/useConfirm";
import { toTitleTr } from "@/lib/text";
import EditableText from "../components/EditableText";
import { Plus, Trash2, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";

// Rezervasyon takvimi — "kim, kaç kişi, ne zaman geliyor" tek ekranda.
// Masa durumuna (empty/occupied/reserved) BİLEREK dokunulmaz: masa durumu Kasa
// ekranından yönetilir. Burada sadece rezervasyon kaydının kendi durumu değişir.

type Rez = {
  id: string;
  table_id: string | null;
  guest_name: string;
  guest_phone: string | null;
  party_size: number;
  reserved_at: string;
  duration_minutes: number;
  status: string;
  note: string | null;
};
type TableRow = { id: string; name: string; area_id: string | null };
type Area = { id: string; name: string; sort_order: number };

const bugunIstanbul = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

const gunSiniri = (gun: string) => {
  const start = `${gun}T00:00:00+03:00`;
  const d = new Date(`${gun}T12:00:00+03:00`);
  d.setDate(d.getDate() + 1);
  const end = `${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d)}T00:00:00+03:00`;
  return { start, end };
};

const gunKaydir = (gun: string, delta: number) => {
  const d = new Date(`${gun}T12:00:00+03:00`);
  d.setDate(d.getDate() + delta);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);
};

const saatFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Istanbul" });
const saat = (iso: string) => saatFmt.format(new Date(iso));
const uzunTarih = (gun: string) =>
  new Intl.DateTimeFormat("tr-TR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Istanbul" })
    .format(new Date(`${gun}T12:00:00+03:00`));

// İki rezervasyon aralığı kesişiyor mu (başlangıç ms + süre dk)
const cakisiyor = (aStart: number, aDur: number, bStart: number, bDur: number) =>
  aStart < bStart + bDur * 60000 && bStart < aStart + aDur * 60000;

const DURUMLAR: Record<string, { label: string; color: string }> = {
  bekliyor: { label: "Bekliyor", color: "var(--muted)" },
  geldi: { label: "Geldi", color: "var(--brand)" },
  gelmedi: { label: "Gelmedi", color: "var(--gold-text)" },
  iptal: { label: "İptal", color: "var(--danger)" },
};

export default function Rezervasyon() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [gun, setGun] = useState("");
  const [rows, setRows] = useState<Rez[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // yeni rezervasyon formu
  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fParty, setFParty] = useState("2");
  const [fDate, setFDate] = useState("");
  const [fTime, setFTime] = useState("19:00");
  const [fDur, setFDur] = useState("90");
  const [fTable, setFTable] = useState("");
  const [fNote, setFNote] = useState("");
  const [formCakisma, setFormCakisma] = useState<string | null>(null);
  // KVKK: misafirin adı ve telefonu kişisel veri. Kaydı oluşturmadan önce aydınlatma
  // metninin gösterildiği onaylanır, onay zamanı consent_at'e yazılır.
  const [kvkkNotice, setKvkkNotice] = useState("");
  const [kvkkAcik, setKvkkAcik] = useState(false);

  useEffect(() => {
    const t = bugunIstanbul();
    setGun(t);
    setFDate(t);
  }, []);

  // Gün değişince form tarihi de takip etsin — kullanıcı baktığı güne kayıt giriyor.
  const gunDegistir = (next: string) => { setGun(next); setFDate(next); };

  const load = useCallback(async () => {
    if (!gun) return;
    const restId = await getMyRestaurantId();
    if (!restId) return;
    setRestaurantId(restId);
    const { start, end } = gunSiniri(gun);
    const [{ data: rez }, { data: t }, { data: a }, { data: kv }] = await Promise.all([
      supabase
        .from("reservations")
        .select("id, table_id, guest_name, guest_phone, party_size, reserved_at, duration_minutes, status, note")
        .eq("restaurant_id", restId)
        .is("deleted_at", null)
        .gte("reserved_at", start)
        .lt("reserved_at", end)
        .order("reserved_at"),
      supabase.from("restaurant_tables").select("id, name, area_id").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("dining_areas").select("id, name, sort_order").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("restaurant_settings").select("kvkk_notice").eq("restaurant_id", restId).maybeSingle(),
    ]);
    setRows((rez as Rez[]) ?? []);
    setTables((t as TableRow[]) ?? []);
    setAreas((a as Area[]) ?? []);
    setKvkkNotice((kv as { kvkk_notice: string | null } | null)?.kvkk_notice ?? "");
  }, [gun]);

  useEffect(() => { load(); }, [load]);

  const tableName = useCallback((id: string | null) => (id ? tables.find((t) => t.id === id)?.name ?? "—" : null), [tables]);

  // Formdaki masa+saat, o masanın o günkü diğer rezervasyonlarıyla çakışıyor mu?
  // Engellemez, sadece uyarır (işletmeci bilerek üst üste koyabilir).
  useEffect(() => {
    if (!restaurantId || !fTable || !fDate || !fTime) { setFormCakisma(null); return; }
    let alive = true;
    (async () => {
      const { start, end } = gunSiniri(fDate);
      const { data } = await supabase
        .from("reservations")
        .select("guest_name, reserved_at, duration_minutes")
        .eq("restaurant_id", restaurantId)
        .eq("table_id", fTable)
        .is("deleted_at", null)
        .neq("status", "iptal")
        .gte("reserved_at", start)
        .lt("reserved_at", end);
      if (!alive) return;
      const baslangic = new Date(`${fDate}T${fTime}:00+03:00`).getTime();
      const sure = parseInt(fDur, 10) || 90;
      const hit = ((data as { guest_name: string; reserved_at: string; duration_minutes: number }[]) ?? []).find((r) =>
        cakisiyor(baslangic, sure, new Date(r.reserved_at).getTime(), r.duration_minutes),
      );
      setFormCakisma(hit ? `${tableName(fTable) ?? "Masa"} — ${saat(hit.reserved_at)} ${hit.guest_name} rezervasyonuyla çakışıyor. Yine de kaydedebilirsin.` : null);
    })();
    return () => { alive = false; };
  }, [restaurantId, fTable, fDate, fTime, fDur, tableName]);

  // Listede çakışan satırları işaretle (aynı masa + kesişen saat)
  const cakisanIds = useMemo(() => {
    const s = new Set<string>();
    const list = rows.filter((r) => r.table_id && r.status !== "iptal");
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.table_id !== b.table_id) continue;
        if (cakisiyor(new Date(a.reserved_at).getTime(), a.duration_minutes, new Date(b.reserved_at).getTime(), b.duration_minutes)) {
          s.add(a.id); s.add(b.id);
        }
      }
    }
    return s;
  }, [rows]);

  const aktifler = rows.filter((r) => r.status !== "iptal");
  const toplamKisi = aktifler.reduce((s, r) => s + Number(r.party_size), 0);
  const gelen = rows.filter((r) => r.status === "geldi").length;
  const gelmeyen = rows.filter((r) => r.status === "gelmedi").length;
  const iptalSayisi = rows.filter((r) => r.status === "iptal").length;

  const patch = async (id: string, values: Record<string, unknown>) => {
    const { error } = await supabase.from("reservations").update(values).eq("id", id);
    if (error) { setErr(error.message); return; }
    setErr(null);
    await load();
  };

  // Sadece rezervasyon kaydının durumu değişir; masanın status'una DOKUNULMAZ.
  // Aynı butona tekrar basmak "bekliyor"a geri döndürür (yanlış işaretlemeyi düzeltmek için).
  const durumDegistir = (r: Rez, next: string) => patch(r.id, { status: r.status === next ? "bekliyor" : next });

  const submit = async () => {
    if (!restaurantId) return;
    const kisi = parseInt(fParty, 10);
    if (!fName.trim() || !fDate || !fTime || !kisi || kisi <= 0) {
      setErr("Misafir adı, tarih, saat ve kişi sayısı gerekli.");
      return;
    }
    setErr(null);
    const { error } = await supabase.from("reservations").insert({
      restaurant_id: restaurantId,
      table_id: fTable || null,
      guest_name: toTitleTr(fName),
      guest_phone: fPhone.trim() || null,
      party_size: kisi,
      reserved_at: new Date(`${fDate}T${fTime}:00+03:00`).toISOString(),
      duration_minutes: parseInt(fDur, 10) || 90,
      note: fNote.trim() || null,
      // Telefon alındıysa aydınlatma yükümlülüğü doğar; onay anını kayda geçiriyoruz.
      consent_at: fPhone.trim() ? new Date().toISOString() : null,
    });
    if (error) { setErr(error.message); return; }
    setFName(""); setFPhone(""); setFNote(""); setFTable(""); setFormCakisma(null);
    if (fDate !== gun) gunDegistir(fDate); // eklenen kayıt hangi güne düştüyse orayı göster
    else await load();
  };

  const sil = async (r: Rez) => {
    const ok = await confirm(`${r.guest_name} (${saat(r.reserved_at)}) rezervasyonu silinsin mi?`);
    if (!ok) return;
    await patch(r.id, { deleted_at: new Date().toISOString() });
  };

  const masaSecenekleri = () => {
    const gruplu = areas.map((a) => ({ a, list: tables.filter((t) => t.area_id === a.id) })).filter((g) => g.list.length > 0);
    const diger = tables.filter((t) => !t.area_id || !areas.some((a) => a.id === t.area_id));
    return (
      <>
        {gruplu.map((g) => (
          <optgroup key={g.a.id} label={g.a.name}>
            {g.list.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </optgroup>
        ))}
        {diger.length > 0 && (
          <optgroup label="Diğer">
            {diger.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </optgroup>
        )}
      </>
    );
  };

  return (
    <div style={{ padding: "26px 28px", height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      {confirmDialog}

      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>Rezervasyon</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 7 }}>{gun ? uzunTarih(gun) : "…"}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {gun && gun !== bugunIstanbul() && (
            <button onClick={() => gunDegistir(bugunIstanbul())} style={btnGhost}>Bugün</button>
          )}
          <button onClick={() => gun && gunDegistir(gunKaydir(gun, -1))} aria-label="Önceki gün" title="Önceki gün" style={navBtn}><ChevronLeft size={17} /></button>
          <input
            type="date"
            value={gun}
            onChange={(e) => e.target.value && gunDegistir(e.target.value)}
            style={{ border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 12px", fontSize: 13.5, background: "var(--card)", color: "var(--ink)", outline: "none" }}
          />
          <button onClick={() => gun && gunDegistir(gunKaydir(gun, 1))} aria-label="Sonraki gün" title="Sonraki gün" style={navBtn}><ChevronRight size={17} /></button>
        </div>
      </div>

      {/* GÜN ÖZETİ */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexShrink: 0, flexWrap: "wrap" }}>
        <Ozet l="Rezervasyon" v={String(aktifler.length)} />
        <Ozet l="Toplam kişi" v={String(toplamKisi)} />
        <Ozet l="Gelen" v={String(gelen)} color="var(--brand)" />
        <Ozet l="Gelmeyen" v={String(gelmeyen)} color={gelmeyen > 0 ? "var(--gold-text)" : undefined} />
        <Ozet l="İptal" v={String(iptalSayisi)} color={iptalSayisi > 0 ? "var(--danger)" : undefined} />
      </div>

      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 20, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        {/* KOLON BAŞLIKLARI */}
        <div style={{ display: "flex", fontSize: 11, color: "var(--muted-2)", padding: "0 0 8px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
          <span style={{ width: 66 }}>Saat</span>
          <span style={{ flex: 1.3, minWidth: 120 }}>Misafir</span>
          <span style={{ width: 118 }}>Telefon</span>
          <span style={{ width: 46, textAlign: "right" }}>Kişi</span>
          <span style={{ width: 150, paddingLeft: 12 }}>Masa</span>
          <span style={{ width: 76 }}>Durum</span>
          <span style={{ width: 214 }} />
        </div>

        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {rows.map((r) => {
            const durum = DURUMLAR[r.status] ?? DURUMLAR.bekliyor;
            const iptalMi = r.status === "iptal";
            return (
              <div key={r.id} style={{ padding: "9px 0", borderBottom: "1px solid var(--line)", opacity: iptalMi ? 0.55 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", fontSize: 13.5 }}>
                  <span style={{ width: 66, display: "flex", flexDirection: "column" }}>
                    <span className="tnum" style={{ fontWeight: 600, color: "var(--ink-green)", textDecoration: iptalMi ? "line-through" : "none" }}>{saat(r.reserved_at)}</span>
                    <span style={{ fontSize: 11, color: "var(--muted-2)" }}>
                      <EditableText
                        value={String(r.duration_minutes)}
                        onSave={(v) => patch(r.id, { duration_minutes: parseInt(v, 10) > 0 ? parseInt(v, 10) : 90 })}
                        inputWidth={34}
                        style={{ display: "inline-block" }}
                      />{" dk"}
                    </span>
                  </span>

                  <span style={{ flex: 1.3, minWidth: 120, color: "var(--ink)", fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                    <EditableText value={r.guest_name} onSave={(v) => patch(r.id, { guest_name: toTitleTr(v) })} inputWidth={150} />
                    {cakisanIds.has(r.id) && (
                      <span title="Aynı masada saatleri çakışan başka bir rezervasyon var." style={{ display: "inline-flex", color: "var(--gold-text)" }}>
                        <AlertTriangle size={14} />
                      </span>
                    )}
                  </span>

                  <span style={{ width: 118, color: "var(--muted)", fontSize: 12.5 }}>
                    <EditableText
                      value={r.guest_phone ?? "—"}
                      onSave={(v) => patch(r.id, { guest_phone: v === "—" ? null : v })}
                      inputWidth={100}
                      style={{ display: "inline-block" }}
                    />
                  </span>

                  <span className="tnum" style={{ width: 46, textAlign: "right" }}>
                    <EditableText
                      value={String(r.party_size)}
                      onSave={(v) => patch(r.id, { party_size: parseInt(v, 10) > 0 ? parseInt(v, 10) : r.party_size })}
                      inputWidth={34}
                      style={{ display: "inline-block" }}
                    />
                  </span>

                  <span style={{ width: 150, paddingLeft: 12 }}>
                    <select
                      value={r.table_id ?? ""}
                      onChange={(e) => patch(r.id, { table_id: e.target.value || null })}
                      style={selMini}
                    >
                      <option value="">Masa atanmadı</option>
                      {masaSecenekleri()}
                    </select>
                  </span>

                  <span style={{ width: 76, fontSize: 12.5, color: durum.color, fontWeight: 500 }}>{durum.label}</span>

                  <span style={{ width: 214, display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                    <button onClick={() => durumDegistir(r, "geldi")} style={pill(r.status === "geldi", "var(--brand)")}>Geldi</button>
                    <button onClick={() => durumDegistir(r, "gelmedi")} style={pill(r.status === "gelmedi", "var(--gold-text)")}>Gelmedi</button>
                    <button onClick={() => durumDegistir(r, "iptal")} style={pill(r.status === "iptal", "var(--danger)")}>İptal</button>
                    <button onClick={() => sil(r)} aria-label="sil" title="Sil" style={{ all: "unset", cursor: "pointer", color: "var(--muted-2)", display: "inline-flex" }}><Trash2 size={14} /></button>
                  </span>
                </div>

                <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 3, paddingLeft: 66 }}>
                  <EditableText
                    value={r.note ?? "not…"}
                    onSave={(v) => patch(r.id, { note: v === "not…" ? null : v })}
                    inputWidth={260}
                    style={{ display: "inline-block" }}
                  />
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "12px 0" }}>Bu gün için rezervasyon yok.</div>}
        </div>

        {/* YENİ REZERVASYON */}
        <div style={{ flexShrink: 0, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
          {err && <div style={{ marginBottom: 8, fontSize: 12.5, color: "var(--danger)" }}>{err}</div>}
          {formCakisma && (
            <div style={{ marginBottom: 8, fontSize: 12.5, color: "var(--gold-text)", display: "flex", alignItems: "center", gap: 6 }}>
              <AlertTriangle size={14} />{formCakisma}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input value={fName} onChange={(e) => setFName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Misafir adı" style={{ ...inp, flex: "1 1 150px" }} />
            <input value={fPhone} onChange={(e) => setFPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Telefon" inputMode="tel" style={{ ...inp, width: 130 }} />
            <input value={fParty} onChange={(e) => setFParty(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Kişi" inputMode="numeric" style={{ ...inp, width: 62 }} />
            <input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...inp, width: 148 }} />
            <input type="time" value={fTime} onChange={(e) => setFTime(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...inp, width: 108 }} />
            <input value={fDur} onChange={(e) => setFDur(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Süre" inputMode="numeric" style={{ ...inp, width: 70 }} title="Süre (dakika)" />
            <select value={fTable} onChange={(e) => setFTable(e.target.value)} style={{ ...inp, width: 150 }}>
              <option value="">Masa (opsiyonel)</option>
              {masaSecenekleri()}
            </select>
            <input value={fNote} onChange={(e) => setFNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Not" style={{ ...inp, flex: "1 1 120px" }} />
            <button onClick={submit} style={btnSmall}><Plus size={15} /></button>
          </div>
          {/* KVKK aydınlatma — telefon alındığında yükümlülük doğuyor, metni bir tık uzakta
              tutuyoruz ki misafir sorduğunda okunabilsin. */}
          <div style={{ marginTop: 8 }}>
            {kvkkNotice.trim() ? (
              <button onClick={() => setKvkkAcik((v) => !v)} style={{ all: "unset", cursor: "pointer", fontSize: 11.5, color: "var(--brand)" }}>
                {kvkkAcik ? "KVKK aydınlatma metnini gizle" : "KVKK aydınlatma metni"}
              </button>
            ) : (
              <span style={{ fontSize: 11.5, color: "var(--danger)" }}>
                KVKK aydınlatma metni girilmemiş — Ayarlar &gt; İşletme bölümünden ekleyin.
              </span>
            )}
            {kvkkAcik && kvkkNotice.trim() && (
              <div style={{ marginTop: 8, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 12, background: "var(--recede)", fontSize: 12, color: "var(--muted)", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 200, overflowY: "auto" }}>
                {kvkkNotice}
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 8, lineHeight: 1.5 }}>
            Rezervasyon masayı doldurmaz — masa durumu (boş/dolu/ayrılmış) Kasa ekranından yönetilir. Misafir adı, telefon, kişi, süre ve not çift tıklayarak düzenlenir.
          </div>
        </div>
      </div>
    </div>
  );
}

function Ozet({ l, v, color }: { l: string; v: string; color?: string }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "10px 16px", minWidth: 108 }}>
      <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{l}</div>
      <div className="tnum" style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.5px", color: color ?? "var(--ink-green)", marginTop: 2 }}>{v}</div>
    </div>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "9px 12px", fontSize: 14, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0 };
const selMini: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 8, padding: "4px 6px", fontSize: 12.5, background: "var(--card)", color: "var(--ink)", outline: "none", width: 138 };
const btnSmall: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, border: "none", borderRadius: 10, padding: "9px 14px", background: "var(--ink-green)", color: "#fff", fontSize: 13.5 };
const btnGhost: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "7px 14px", background: "var(--card)", color: "var(--ink-green)", fontSize: 12.5, cursor: "pointer" };
const navBtn: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "6px 8px", background: "var(--card)", color: "var(--ink-green)", cursor: "pointer", display: "inline-flex", alignItems: "center" };
const pill = (active: boolean, color: string): React.CSSProperties => ({
  border: `1px solid ${active ? color : "var(--line-2)"}`,
  borderRadius: 980,
  padding: "4px 10px",
  background: active ? color : "var(--card)",
  color: active ? "#fff" : "var(--muted)",
  fontSize: 11.5,
  cursor: "pointer",
  whiteSpace: "nowrap",
});
