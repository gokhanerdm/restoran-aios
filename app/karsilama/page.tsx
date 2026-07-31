"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getMyRestaurantId } from "@/lib/supabase/restaurant";
import { getStaffSession } from "@/lib/supabase/staffSession";
import { toTitleTr } from "@/lib/text";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useConfirm } from "../components/useConfirm";
import DatePicker from "../components/DatePicker";
import { ListHeader, HeaderCell, HeaderSep, ListRow, RowSep, Cell, Spacer, ActionsCell } from "../components/ListRow";

// Karşılama — ROADMAP §O2, birleşik akış (2026-07-31, Gökhan onayı).
// Eskiden Rezervasyon (ileri tarih, isim/telefon/saat) ve Karşılama (bekleme listesi, "şimdi")
// AYRI ekranlar ve ayrı tablolardı — aynı işi yapıyorlardı, kafa karıştırıyordu. Artık tek
// tablo (reservations), tek ekran: rezervasyon da al, kapıdan doğrudan gireni de al, ikisi de
// aynı listede aynı durum zincirinden geçer: bekleniyor -> geldi -> oturdu (ya da gelmedi/iptal).
//
// "bekleniyor" = misafir henüz gelmedi (ileri tarih/saat rezervasyonu). "geldi" = misafir kapıda,
// masa bekliyor (vale'den ya da doğrudan buradan girilmiş olabilir) — eski iki sistemdeki "bekliyor"
// kelimesinin ters anlamlarını karıştırmamak için bilerek farklı etiketler.
//
// Vale entegrasyonu: vale girişte isim+kişi sayısı girince (add_valet_entry p_party_size ile)
// sistem bugünün "bekleniyor" rezervasyonlarıyla eşleştirmeyi dener; bulamazsa rezervasyonsuz
// yeni bir "geldi" kaydı açar. İkisi de burada, aynı listede, öne çıkarak belirir.

type Rez = {
  id: string; guest_name: string; guest_phone: string | null; party_size: number;
  reserved_at: string; status: string; note: string | null; table_id: string | null;
  arrived_at: string | null;
};
type TableRow = { id: string; name: string; seat_count: number; status: string };

const bugunIstanbul = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const gunKaydir = (gun: string, delta: number) => {
  const d = new Date(`${gun}T12:00:00+03:00`);
  d.setDate(d.getDate() + delta);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);
};
const gunSiniri = (gun: string) => {
  const start = `${gun}T00:00:00+03:00`;
  const d = new Date(`${gun}T12:00:00+03:00`);
  d.setDate(d.getDate() + 1);
  const end = `${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d)}T00:00:00+03:00`;
  return { start, end };
};
const saatFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Istanbul" });
const saat = (iso: string) => saatFmt.format(new Date(iso));
const bekleyenSure = (from: string, now: number) => {
  const dk = Math.max(0, Math.round((now - Date.parse(from)) / 60000));
  return dk < 60 ? `${dk} dk` : `${Math.floor(dk / 60)}s ${dk % 60}dk`;
};

const DURUM_INFO: Record<string, { label: string; color: string }> = {
  bekleniyor: { label: "Bekleniyor", color: "var(--ink)" },
  geldi: { label: "Geldi", color: "var(--danger)" },
  oturdu: { label: "Oturdu", color: "var(--brand)" },
  gelmedi: { label: "Gelmedi", color: "var(--gold-text)" },
  iptal: { label: "İptal", color: "var(--ink)" },
};

// Yeni "geldi" olan kaydı fark edince kısa bir bip — mutfak/garson bildirimiyle (Faz 10) aynı
// kalıp: Web Audio API, ilk dokunuşta izin alınır, dosya yok.
let sharedAudioCtx: AudioContext | null = null;
function getAudioCtxCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
}
function unlockAudio() {
  const Ctx = getAudioCtxCtor();
  if (!Ctx) return;
  if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
  if (sharedAudioCtx.state === "suspended") sharedAudioCtx.resume().catch(() => {});
}
function playArrivalBeep() {
  try {
    const ctx = sharedAudioCtx;
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch { /* Web Audio desteklenmiyor olabilir — sessizce geç */ }
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([150, 80, 150]);
}

export default function KarsilamaPage() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [gun, setGun] = useState("");
  const [rows, setRows] = useState<Rez[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [now, setNow] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kvkkNotice, setKvkkNotice] = useState("");
  const [kvkkAcik, setKvkkAcik] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Yeni rezervasyon formu — buton tıklanınca açılan katman (Gökhan: satır her zaman açık
  // durmasın, "Yeni rezervasyon" butonu üstte olsun, Ekle ile kayıt gerçekleşsin).
  const [newResOpen, setNewResOpen] = useState(false);
  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fParty, setFParty] = useState("2");
  const [fDate, setFDate] = useState("");
  const [fTime, setFTime] = useState("");
  const [fNote, setFNote] = useState("");

  // Kayıtsız doğrudan gir (rezervasyonsuz, kapıdan) — küçük bir pencere, ayrı panel değil.
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [wName, setWName] = useState("");
  const [wParty, setWParty] = useState("2");

  // Masa ata (satır bazlı, inline seçim — Vale ekranındaki "Masaya bağla" ile aynı desen)
  const [assigningId, setAssigningId] = useState<string | null>(null);
  // Oturt katmanı (masa seçimi — sadece boş masalar)
  const [seatingFor, setSeatingFor] = useState<Rez | null>(null);

  const notifiedGeldi = useRef<Set<string>>(new Set());

  const load = useCallback(async (targetGun: string) => {
    const restId = await getMyRestaurantId();
    if (!restId) return;
    setRestaurantId(restId);
    const { start, end } = gunSiniri(targetGun);
    const [{ data: r, error }, { data: t }, { data: s }] = await Promise.all([
      supabase.from("reservations").select("id, guest_name, guest_phone, party_size, reserved_at, status, note, table_id, arrived_at")
        .eq("restaurant_id", restId).is("deleted_at", null)
        .gte("reserved_at", start).lt("reserved_at", end)
        .order("reserved_at"),
      supabase.from("restaurant_tables").select("id, name, seat_count, status").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("restaurant_settings").select("kvkk_notice").eq("restaurant_id", restId).maybeSingle(),
    ]);
    if (error) { setErr(error.message); return; }
    const list = (r as Rez[]) ?? [];
    setRows(list);
    setTables((t as TableRow[]) ?? []);
    setKvkkNotice((s as { kvkk_notice: string | null } | null)?.kvkk_notice ?? "");
    setErr(null);

    if (targetGun === bugunIstanbul()) {
      let yeni = false;
      list.forEach((row) => {
        if (row.status === "geldi") {
          if (!notifiedGeldi.current.has(row.id)) { notifiedGeldi.current.add(row.id); yeni = true; }
        } else {
          notifiedGeldi.current.delete(row.id);
        }
      });
      if (yeni) playArrivalBeep();
    }
  }, []);

  useEffect(() => { const g = bugunIstanbul(); setGun(g); }, []);
  useEffect(() => {
    if (!gun) return;
    load(gun);
    const id = setInterval(() => load(gun), 6000);
    return () => clearInterval(id);
  }, [gun, load]);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  useEffect(() => {
    const onFirstTouch = () => { unlockAudio(); document.removeEventListener("pointerdown", onFirstTouch); };
    document.addEventListener("pointerdown", onFirstTouch);
    return () => document.removeEventListener("pointerdown", onFirstTouch);
  }, []);

  const gunDegistir = (g: string) => setGun(g);

  // DatePicker eskiden sadece görünüşte "gün"ü gösterip fDate'i boş bırakıyordu — kutu dolu
  // GÖRÜNÜYOR ama gerçek değeri boştu, Ekle'ye basınca sessizce reddediliyordu. Artık pencere
  // açılırken fDate gerçekten görünen güne eşitleniyor.
  const openNewRes = () => {
    setFName(""); setFPhone(""); setFParty("2"); setFDate(gun); setFTime(""); setFNote("");
    setErr(null);
    setNewResOpen(true);
  };

  const submit = async () => {
    if (!restaurantId) return;
    const kisi = parseInt(fParty, 10);
    if (!fName.trim() || !fDate || !fTime || !kisi || kisi <= 0) {
      setErr("Misafir adı, tarih, saat ve kişi sayısı gerekli.");
      return;
    }
    setErr(null); setBusy(true);
    const { error } = await supabase.from("reservations").insert({
      restaurant_id: restaurantId,
      guest_name: toTitleTr(fName),
      guest_phone: fPhone.trim() || null,
      party_size: kisi,
      reserved_at: new Date(`${fDate}T${fTime}:00+03:00`).toISOString(),
      note: fNote.trim() || null,
      consent_at: fPhone.trim() ? new Date().toISOString() : null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setNewResOpen(false);
    if (fDate !== gun) gunDegistir(fDate); else await load(gun);
  };

  const dogrudanGir = async () => {
    if (!restaurantId || !wName.trim()) return;
    const kisi = Math.max(1, parseInt(wParty, 10) || 1);
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("check_in_arrival", { p_restaurant: restaurantId, p_guest_name: toTitleTr(wName), p_party_size: kisi });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setWName(""); setWParty("2"); setWalkInOpen(false);
    if (gun !== bugunIstanbul()) gunDegistir(bugunIstanbul()); else await load(gun);
  };

  // Durum değişikliği (Geldi/Gelmedi/İptal) RPC üzerinden — Gelmedi/İptal olunca atanmış
  // masa hâlâ "reserved" ise (henüz oturtulmadıysa) otomatik boşa çıkar (set_reservation_status).
  const durumDegistir = async (r: Rez, next: string) => {
    setErr(null);
    const { error } = await supabase.rpc("set_reservation_status", { p_reservation_id: r.id, p_status: next });
    if (error) { setErr(error.message); return; }
    await load(gun);
  };

  const iptalEt = async (r: Rez) => {
    const ok = await confirm(`${r.guest_name} rezervasyonu iptal edilsin mi?`);
    if (!ok) return;
    await durumDegistir(r, "iptal");
  };

  // Masa ata — SADECE bugün için anlamlı (Gökhan: "işletme masa planını aynı gün yapar,
  // ileri tarihli rezervasyona masa atamaz"). Atanan masa hemen "rezerve" görünür görünmez
  // (assign_reservation_table RPC'si restaurant_tables.status/reservation_note'u da günceller).
  const masaAta = async (r: Rez, tableId: string) => {
    setErr(null);
    const { error } = await supabase.rpc("assign_reservation_table", { p_reservation_id: r.id, p_table_id: tableId });
    setAssigningId(null);
    if (error) { setErr(error.message); return; }
    await load(gun);
  };

  const oturt = async (tableId: string) => {
    if (!seatingFor) return;
    setBusy(true); setErr(null);
    const staff = getStaffSession();
    const { error } = await supabase.rpc("seat_reservation", { p_reservation_id: seatingFor.id, p_table_id: tableId, p_staff_id: staff?.id ?? null });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setSeatingFor(null);
    await load(gun);
  };

  const bosMasalar = tables.filter((t) => t.status === "empty");
  const tableName = (id: string | null) => tables.find((t) => t.id === id)?.name ?? null;
  const bugunMu = gun === bugunIstanbul();

  return (
    <div style={{ padding: "26px 28px", height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      {confirmDialog}

      <div style={{ marginBottom: 16, flexShrink: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>Rezervasyonlar</div>
      </div>

      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10, flexShrink: 0 }}>{err}</div>}

      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {/* Tarih gezinmesi + ekleme yolları burada, listenin hemen üstünde — sayfa başlığından
            ayrı, doğrudan listenin kontrolleri (Gökhan: "tarihi buraya al"). */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {!bugunMu && <button onClick={() => gunDegistir(bugunIstanbul())} style={btnGhost}>Bugün</button>}
            <button onClick={() => gun && gunDegistir(gunKaydir(gun, -1))} aria-label="Önceki gün" style={navBtn}><ChevronLeft size={17} /></button>
            <DatePicker value={gun} onChange={gunDegistir} />
            <button onClick={() => gun && gunDegistir(gunKaydir(gun, 1))} aria-label="Sonraki gün" style={navBtn}><ChevronRight size={17} /></button>
          </div>
          <button onClick={openNewRes} style={btnPrimary}><Plus size={14} /> Yeni rezervasyon</button>
          <button onClick={() => setWalkInOpen(true)} style={btnPrimary}><Plus size={14} /> Rezervasyon dışı</button>
        </div>
        <ListHeader>
          <HeaderCell width={46}>Zaman</HeaderCell>
          <HeaderSep />
          <HeaderCell width={170} marginLeft={14}>Misafir</HeaderCell>
          <HeaderSep />
          <HeaderCell width={110}>Telefon</HeaderCell>
          <HeaderSep />
          <HeaderCell width={40} align="center">Pax</HeaderCell>
          <HeaderSep />
          <HeaderCell width={150} align="center" marginLeft={76}>Masa</HeaderCell>
          <HeaderSep />
          <HeaderCell width={160}>Not</HeaderCell>
          <HeaderSep />
          <Spacer />
          <HeaderCell width={210} align="center">Rezervasyon durumu</HeaderCell>
        </ListHeader>
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {rows.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>Bu gün için kayıt yok.</div>}
          {rows.map((r) => {
            const info = DURUM_INFO[r.status] ?? DURUM_INFO.bekleniyor;
            const canli = r.status === "geldi";
            const aktif = r.status === "bekleniyor" || r.status === "geldi";
            return (
              <ListRow key={r.id} highlight={canli} muted={r.status === "gelmedi" || r.status === "iptal"}>
                <Cell width={46}><span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)" }}>{saat(r.reserved_at)}</span></Cell>
                <RowSep />
                <Cell width={170} marginLeft={14}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.guest_name}</div>
                  {canli && r.arrived_at && (
                    <div style={{ fontSize: 11, color: inkSoft }}>{bekleyenSure(r.arrived_at, now)} önce geldi</div>
                  )}
                </Cell>
                <RowSep />
                <Cell width={110}><span className="tnum" style={{ fontSize: 12.5, color: "var(--ink)" }}>{r.guest_phone || "—"}</span></Cell>
                <RowSep />
                <Cell width={40} align="center"><span className="tnum" style={{ fontSize: 12.5, color: "var(--ink)" }}>{r.party_size}</span></Cell>
                <RowSep />
                <Cell width={150} align="center" marginLeft={76}>
                  {/* Masa atama YERİNDE olur — tıklanınca bu hücrenin içi, atandığında adının
                      yazacağı aynı yerde, açılır seçime döner (Gökhan: doğru yer burası). */}
                  {assigningId === r.id ? (
                    <select autoFocus onBlur={() => setAssigningId(null)} onChange={(e) => masaAta(r, e.target.value)} defaultValue="" style={{ ...inp, width: "100%", padding: "5px 8px", fontSize: 12.5 }}>
                      <option value="" disabled>Masa seç…</option>
                      {bosMasalar.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.seat_count} koltuk)</option>)}
                    </select>
                  ) : tableName(r.table_id) ? (
                    <span style={{ fontSize: 12.5, color: "var(--ink)" }}>{tableName(r.table_id)}</span>
                  ) : bugunMu && aktif ? (
                    <button onClick={() => setAssigningId(r.id)} style={btnGhost}>Masa ata</button>
                  ) : (
                    <span style={{ fontSize: 12.5, color: inkSoft }}>—</span>
                  )}
                </Cell>
                <RowSep />
                <Cell width={160}>
                  <span style={{ fontSize: 12, color: "var(--ink)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.note ?? undefined}>
                    {r.note || "—"}
                  </span>
                </Cell>
                <RowSep />
                <Spacer />
                <ActionsCell width={210} align="center">
                  {/* Karşılama "geldi" dedikten sonra iş bitmiş olmalı — ayrı bir "Oturt"
                      adımı çıkmasın (Gökhan: "geldi dedikten sonra işi bitmeli, müşteriyi
                      garsona yönlendirdikten ya da yerine oturttuktan sonra zaten geldi
                      diyecek"). "Geldi" tıklanınca doğrudan masa seçip oturtur — tek adım.
                      "geldi" durumu sadece vale/kapıdan otomatik eşleşmede ayrı görünür
                      (orada arrival host'un elinden bağımsız gerçekleşiyor). */}
                  {bugunMu && r.status === "bekleniyor" && (
                    <>
                      <button onClick={() => setSeatingFor(r)} disabled={bosMasalar.length === 0} style={{ ...btnSmall, opacity: bosMasalar.length === 0 ? 0.5 : 1 }}>Geldi</button>
                      <button onClick={() => durumDegistir(r, "gelmedi")} style={btnGhost}>Gelmedi</button>
                    </>
                  )}
                  {bugunMu && r.status === "geldi" && (
                    <button onClick={() => setSeatingFor(r)} disabled={bosMasalar.length === 0} style={{ ...btnSmall, opacity: bosMasalar.length === 0 ? 0.5 : 1 }}>Oturt</button>
                  )}
                  {aktif ? (
                    <button onClick={() => iptalEt(r)} style={btnGhost}>İptal</button>
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 700, color: info.color }}>{info.label}</span>
                  )}
                </ActionsCell>
              </ListRow>
            );
          })}
        </div>
      </div>

      {/* YENİ REZERVASYON KATMANI */}
      {newResOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setNewResOpen(false)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, minWidth: 340, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 14 }}>Yeni rezervasyon</div>
            {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{err}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input autoFocus value={fName} onChange={(e) => setFName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="İsim soyisim" style={inp} />
              <input value={fPhone} onChange={(e) => setFPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Telefon (opsiyonel)" inputMode="tel" style={inp} />
              <div style={{ display: "flex", gap: 8 }}>
                <input value={fParty} onChange={(e) => setFParty(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Kişi sayısı" inputMode="numeric" style={{ ...inp, flex: 1 }} />
                <DatePicker value={fDate} onChange={setFDate} style={{ flex: 1 }} />
                <input type="time" value={fTime} onChange={(e) => setFTime(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...inp, flex: 1 }} />
              </div>
              <input value={fNote} onChange={(e) => setFNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Özel not (opsiyonel)" style={inp} />
            </div>

            <div style={{ marginTop: 10 }}>
              {kvkkNotice.trim() ? (
                <button onClick={() => setKvkkAcik((v) => !v)} style={{ all: "unset", cursor: "pointer", fontSize: 11.5, color: "var(--brand)" }}>
                  {kvkkAcik ? "KVKK aydınlatma metnini gizle" : "KVKK aydınlatma metni"}
                </button>
              ) : (
                <span style={{ fontSize: 11.5, color: "var(--danger)" }}>KVKK aydınlatma metni girilmemiş — Ayarlar &gt; İşletme bölümünden ekleyin.</span>
              )}
              {kvkkAcik && kvkkNotice.trim() && (
                <div style={{ marginTop: 8, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 12, background: "var(--recede)", fontSize: 12, color: "var(--muted)", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 140, overflowY: "auto" }}>
                  {kvkkNotice}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={() => setNewResOpen(false)} style={btnSecondary}>Vazgeç</button>
              <button onClick={submit} disabled={busy || !fName.trim()} style={{ ...btnPrimary, opacity: !fName.trim() ? 0.5 : 1 }}>Ekle</button>
            </div>
          </div>
        </div>
      )}

      {/* REZERVASYONSUZ GİR KATMANI */}
      {walkInOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setWalkInOpen(false)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, minWidth: 320, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 4 }}>Rezervasyon dışı</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, lineHeight: 1.5 }}>
              Kayıt zorunlu değil — hiç kaydetmeden de bir masaya doğrudan oturtabilirsin. Buradan
              girersen bugünün listesinde &quot;Geldi&quot; olarak görünür.
            </div>
            {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <input autoFocus value={wName} onChange={(e) => setWName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && dogrudanGir()} placeholder="İsim soyisim" style={{ ...inp, flex: 1 }} />
              <input value={wParty} onChange={(e) => setWParty(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && dogrudanGir()} placeholder="Kişi" inputMode="numeric" style={{ ...inp, width: 70 }} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={() => setWalkInOpen(false)} style={btnSecondary}>Vazgeç</button>
              <button onClick={dogrudanGir} disabled={busy || !wName.trim()} style={{ ...btnPrimary, opacity: !wName.trim() ? 0.5 : 1 }}>Ekle</button>
            </div>
          </div>
        </div>
      )}

      {/* OTURT KATMANI */}
      {seatingFor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setSeatingFor(null)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, minWidth: 320, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 4 }}>{seatingFor.guest_name}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Hangi masaya oturtuyorsun?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
              {bosMasalar.map((t) => (
                <button key={t.id} onClick={() => oturt(t.id)} disabled={busy} style={{ ...btnSecondary, justifyContent: "space-between", display: "flex" }}>
                  <span>{t.name}</span>
                  <span className="tnum" style={{ color: "var(--muted)" }}>{t.seat_count} koltuk</span>
                </button>
              ))}
            </div>
            <button onClick={() => setSeatingFor(null)} style={{ all: "unset", cursor: "pointer", fontSize: 13, color: "var(--muted)", marginTop: 14, display: "block" }}>Vazgeç</button>
          </div>
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 10px", fontSize: 13, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0 };
const btnPrimary: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 980, padding: "9px 14px", background: "var(--brand-strong)", color: "#fff", fontSize: 13, fontWeight: 500, flexShrink: 0 };
const btnSecondary: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 16px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13, cursor: "pointer" };
const btnSmall: React.CSSProperties = { border: "none", borderRadius: 980, padding: "7px 14px", background: "var(--ink-green)", color: "#fff", fontSize: 12.5, flexShrink: 0, cursor: "pointer" };
const btnGhost: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "7px 12px", background: "var(--card)", color: "var(--ink)", fontSize: 12, flexShrink: 0, cursor: "pointer" };
// Soluk yeşilimsi gri (var(--muted)) yerine — Gökhan: "siyah ve tonlarını kullan." Sadece
// gerçekten ikincil (tarih/boş yer tutucu gibi) küçük bilgiler için, ana metin var(--ink).
const inkSoft = "#5c5c58";
const navBtn: React.CSSProperties = { all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: 6, borderRadius: 8, color: "var(--muted)" };
