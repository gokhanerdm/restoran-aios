"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { kutuDar, kutuAyakta, dugmeAnaSatir, dugmeSilik, dugmeKucuk, dugmeAnaAyakta, dugmeIkincilAyakta, dugmeKucukAyakta, dugmeSilikAyakta } from "@/lib/olcu";
import { resolveRestaurantIdBySlug } from "@/lib/supabase/publicRestaurant";
import { toTitleTr, toUpperTr } from "@/lib/text";
import { Plus } from "lucide-react";
import { ListHeader, HeaderCell, ListRow, Cell, ActionsCell } from "../components/ListRow";
import StaffLoginGate, { StaffProfileBadge } from "../components/StaffLoginGate";

// Vale — ROADMAP §O4. Gökhan: "vale plaka ile kayıt girsin, isim soyisim alsın, sonra
// eşleşmeyi program yapar. Hesap istendiğinde vale'ye bildirim gitsin, araba kapıya
// çekilsin." Eşleştirme add_valet_entry RPC'sinde otomatik denenir (aynı isimde oturmuş
// bir kayıt varsa); tutmazsa burada elle "Masaya bağla" ile kapatılır.
//
// 2026-07-31: vale artık GİRİŞTE de devrede — "müşteri geldi, vale anahtarı aldı, bilgileri
// girdi, rezervasyon karşısına çıktı, geldi işaretlendi, karşılama ekranına düştü" (Gökhan).
// Kişi sayısı da alınıyor ki Karşılama'da bilgi tam düşsün, misafire tekrar sorulmasın.
//
// Aynı gün: "bence de öyle, ikisi de olabilir" (kulübede sabit tablet ya da elde telefon) —
// Vale, Garson/Mutfak gibi girişsiz link+PIN modeline geçti (önceden tam hesap girişi
// gerektiren bir yönetici ekranıydı, telefonla paylaşılan bir link olarak açılamıyordu).

type Valet = { id: string; guest_name: string; plate_no: string; status: string; matched_table_id: string | null; parked_at: string; called_at: string | null };
type TableRow = { id: string; name: string };
// Bugünün beklenen rezervasyonları — vale'nin isim yazınca eşleşmenin arka planda olup
// olmadığını GÖREBİLMESİ için (Gökhan: "eklenen rezervasyon valeye de görünmeli"). Sadece
// henüz gelmemiş ("bekleniyor") olanlar — geldiği an listeden düşer: valeden geldiyse zaten
// aşağıdaki araç listesinde görünüyor, valeye uğramadan geldiyse arabası yok demektir, vale
// ekranıyla artık işi yok (Gökhan: "valeye uğramadan gelenlerin arabası yok demektir").
type Beklenen = { id: string; guest_name: string; party_size: number; reserved_at: string };

const STATUS_INFO: Record<string, { label: string; renk: string }> = {
  bekliyor: { label: "Bekliyor", renk: "var(--muted)" },
  cagrildi: { label: "Çağrıldı — araba hazırlanıyor", renk: "var(--danger)" },
  teslim_edildi: { label: "Teslim edildi", renk: "var(--muted-2)" },
};

const sureFmt = (from: string, now: number) => {
  const dk = Math.max(0, Math.round((now - Date.parse(from)) / 60000));
  return dk < 60 ? `${dk} dk` : `${Math.floor(dk / 60)}s ${dk % 60}dk`;
};
const saatFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Istanbul" });
const saat = (iso: string) => saatFmt.format(new Date(iso));
const bugunSiniri = () => {
  const bugun = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  const start = `${bugun}T00:00:00+03:00`;
  const d = new Date(`${bugun}T12:00:00+03:00`);
  d.setDate(d.getDate() + 1);
  const end = `${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d)}T00:00:00+03:00`;
  return { start, end };
};

export default function ValePaneli() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--canvas)" }} />}>
      <ValeInner />
    </Suspense>
  );
}

function ValeInner() {
  const rSlug = useSearchParams().get("r");
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [entries, setEntries] = useState<Valet[]>([]);
  const [beklenenler, setBeklenenler] = useState<Beklenen[]>([]);
  const [occupiedTables, setOccupiedTables] = useState<TableRow[]>([]);
  const [now, setNow] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [fName, setFName] = useState("");
  const [fPlate, setFPlate] = useState("");
  const [fParty, setFParty] = useState("");
  const [linkingId, setLinkingId] = useState<string | null>(null);
  // İşletmenin kararı: vale kulübede sabit bir tabletle de çalışabilir, elde telefonla dolaşarak
  // da (Gökhan: "ikisi de olabilir"). Cihaz türü yerine gerçek ekran genişliğine bakılır — Adisyon
  // ile aynı eşik (860px) — hangi cihazdan açılırsa açılsın doğru düzen otomatik gelir.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const load = useCallback(async () => {
    const rest = await resolveRestaurantIdBySlug(rSlug);
    if ("error" in rest) { setErr(rest.error); return; }
    setErr(null);
    const restId = rest.id;
    setRestaurantId(restId);
    const { start, end } = bugunSiniri();
    const [{ data: v }, { data: t }, { data: b }] = await Promise.all([
      supabase.from("valet_entries").select("id, guest_name, plate_no, status, matched_table_id, parked_at, called_at")
        .eq("restaurant_id", restId).neq("status", "teslim_edildi").order("parked_at"),
      supabase.from("restaurant_tables").select("id, name")
        .eq("restaurant_id", restId).eq("status", "occupied").is("deleted_at", null).order("sort_order"),
      supabase.from("reservations").select("id, guest_name, party_size, reserved_at")
        .eq("restaurant_id", restId).is("deleted_at", null).eq("status", "bekleniyor")
        .gte("reserved_at", start).lt("reserved_at", end).order("reserved_at"),
    ]);
    setEntries((v as Valet[]) ?? []);
    setOccupiedTables((t as TableRow[]) ?? []);
    setBeklenenler((b as Beklenen[]) ?? []);
  }, [rSlug]);

  useEffect(() => { load(); const id = setInterval(load, 10000); return () => clearInterval(id); }, [load]);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);

  const addEntry = async () => {
    if (!restaurantId || !fName.trim() || !fPlate.trim()) return;
    setBusy(true); setErr(null);
    const kisi = fParty.trim() ? Math.max(1, parseInt(fParty, 10) || 1) : null;
    const { error } = await supabase.rpc("add_valet_entry", {
      p_restaurant: restaurantId, p_guest_name: toTitleTr(fName), p_plate_no: toUpperTr(fPlate.trim()), p_party_size: kisi,
    });
    if (error) { setErr(error.message); setBusy(false); return; }
    setFName(""); setFPlate(""); setFParty(""); setBusy(false);
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
    <StaffLoginGate restaurantId={restaurantId} roles={["vale"]}>
    <div style={{ padding: isMobile ? "16px 14px" : "26px 28px", height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, flexShrink: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>Vale</div>
        <StaffProfileBadge restaurantId={restaurantId} />
      </div>
      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10, flexShrink: 0 }}>{err}</div>}

      {beklenenler.length > 0 && (
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18, marginBottom: 14, flexShrink: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>Bugün beklenenler</div>
          {isMobile ? (
            beklenenler.map((b) => (
              <div key={b.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{b.guest_name}</span>
                  <span className="tnum" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)", flexShrink: 0 }}>{saat(b.reserved_at)} · {b.party_size} kişi</span>
                </div>
                <button onClick={() => { setFName(b.guest_name); setFParty(String(b.party_size)); }} style={btnGhostMobile}>Formu doldur</button>
              </div>
            ))
          ) : (
            <>
              <ListHeader>
                <HeaderCell width={46}>Zaman</HeaderCell>
                <HeaderCell flex>Misafir</HeaderCell>
                <HeaderCell width={40} align="right">Pax</HeaderCell>
                <HeaderCell width={120} align="right">İşlem</HeaderCell>
              </ListHeader>
              {beklenenler.map((b) => (
                <ListRow key={b.id}>
                  <Cell width={46}><span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)" }}>{saat(b.reserved_at)}</span></Cell>
                  <Cell flex><span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{b.guest_name}</span></Cell>
                  <Cell width={40} align="right"><span className="tnum" style={{ fontSize: 12.5, color: "var(--muted)" }}>{b.party_size}</span></Cell>
                  <ActionsCell width={120}>
                    <button onClick={() => { setFName(b.guest_name); setFParty(String(b.party_size)); }} title="İsim ve kişi sayısını araç kaydı formuna doldurur" style={btnGhost}>Formu doldur</button>
                  </ActionsCell>
                </ListRow>
              ))}
            </>
          )}
        </div>
      )}

      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18, marginBottom: 14, flexShrink: 0 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 }}>Araç kaydı ekle</div>
        {isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input value={fName} onChange={(e) => setFName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEntry()} placeholder="Misafir isim soyisim" style={inpMobile} />
            <input value={fPlate} onChange={(e) => setFPlate(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEntry()} placeholder="Plaka" className="tnum" style={inpMobile} />
            <input value={fParty} onChange={(e) => setFParty(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && addEntry()} placeholder="Kişi sayısı" inputMode="numeric" style={inpMobile} title="Kişi sayısı — Karşılama'ya düşecek bilgi" />
            <button onClick={addEntry} disabled={busy || !fName.trim() || !fPlate.trim()} style={{ ...btnPrimaryMobile, opacity: !fName.trim() || !fPlate.trim() ? 0.5 : 1 }}><Plus size={16} /> Ekle</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={fName} onChange={(e) => setFName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEntry()} placeholder="Misafir isim soyisim" style={{ ...inp, flex: "1 1 200px" }} />
            <input value={fPlate} onChange={(e) => setFPlate(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addEntry()} placeholder="Plaka" className="tnum" style={{ ...inp, width: 140 }} />
            <input value={fParty} onChange={(e) => setFParty(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && addEntry()} placeholder="Kişi" inputMode="numeric" style={{ ...inp, width: 70 }} title="Kişi sayısı — Karşılama'ya düşecek bilgi" />
            <button onClick={addEntry} disabled={busy || !fName.trim() || !fPlate.trim()} style={{ ...btnPrimary, opacity: !fName.trim() || !fPlate.trim() ? 0.5 : 1 }}><Plus size={14} /> Ekle</button>
          </div>
        )}
        <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 8 }}>
          Kişi sayısı girilirse sistem bugünün rezervasyonlarıyla ismine göre eşleştirmeyi dener — bulursa
          o rezervasyonu &quot;geldi&quot; yapar, bulamazsa Karşılama&apos;ya rezervasyonsuz yeni bir kayıt düşürür.
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18 }}>
        {!isMobile && (
          <ListHeader>
            <HeaderCell flex>Misafir</HeaderCell>
            <HeaderCell width={220}>Durum</HeaderCell>
            <HeaderCell width={200} align="right">İşlem</HeaderCell>
          </ListHeader>
        )}
        {entries.length === 0 ? (
          <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>Bekleyen araç yok.</div>
        ) : entries.map((v) => {
          const info = STATUS_INFO[v.status] ?? STATUS_INFO.bekliyor;
          const eslesikMasa = tableName(v.matched_table_id);
          if (isMobile) {
            return (
              <div key={v.id} style={{ padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}>{v.guest_name}</span>
                  <span className="tnum" style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)", flexShrink: 0 }}>{v.plate_no}</span>
                </div>
                <div style={{ fontSize: 12.5, color: info.renk, fontWeight: v.status === "cagrildi" ? 700 : 400, marginBottom: 10 }}>
                  {info.label} · {sureFmt(v.parked_at, now)}
                  {eslesikMasa && <span style={{ color: "var(--muted-2)", fontWeight: 400 }}> · {eslesikMasa}</span>}
                  {!v.matched_table_id && <span style={{ color: "var(--gold-text)", fontWeight: 400 }}> · masa eşleşmedi</span>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setLinkingId(linkingId === v.id ? null : v.id)} style={{ ...btnSecondaryMobile, flex: 1 }}>{eslesikMasa ? "Değiştir" : "Masaya bağla"}</button>
                  <button onClick={() => markDelivered(v.id)} style={{ ...btnSmallMobile, flex: 1 }}>Teslim edildi</button>
                </div>
                {linkingId === v.id && (
                  <select autoFocus onChange={(e) => linkTable(v.id, e.target.value)} defaultValue="" style={{ ...inpMobile, marginTop: 10 }}>
                    <option value="" disabled>Masa seç…</option>
                    {occupiedTables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
              </div>
            );
          }
          return (
            <div key={v.id}>
              <ListRow>
                <Cell flex><span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{v.guest_name}</span> <span className="tnum" style={{ fontSize: 12.5, fontWeight: 400, color: "var(--muted)" }}>· {v.plate_no}</span></Cell>
                <Cell width={220}>
                  <span style={{ fontSize: 11.5, color: info.renk, fontWeight: v.status === "cagrildi" ? 700 : 400 }}>
                    {info.label} · {sureFmt(v.parked_at, now)}
                    {eslesikMasa && <span style={{ color: "var(--muted-2)", fontWeight: 400 }}> · {eslesikMasa}</span>}
                    {!v.matched_table_id && <span style={{ color: "var(--gold-text)", fontWeight: 400 }}> · masa eşleşmedi</span>}
                  </span>
                </Cell>
                <ActionsCell width={200}>
                  <button onClick={() => setLinkingId(linkingId === v.id ? null : v.id)} style={btnSecondary}>{eslesikMasa ? "Değiştir" : "Masaya bağla"}</button>
                  <button onClick={() => markDelivered(v.id)} style={btnSmall}>Teslim edildi</button>
                </ActionsCell>
              </ListRow>
              {linkingId === v.id && (
                <div style={{ padding: "0 0 10px" }}>
                  <select autoFocus onChange={(e) => linkTable(v.id, e.target.value)} defaultValue="" style={{ ...inp, width: 220 }}>
                    <option value="" disabled>Masa seç…</option>
                    {occupiedTables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
    </StaffLoginGate>
  );
}

// Ölçüler ölçü merkezinden türetilir (lib/olcu.ts): geniş ekranda oturan takım,
// telefonda ayakta takımı (vale dışarıda tek elle kullanıyor).
const inp: React.CSSProperties = kutuDar;
const btnPrimary: React.CSSProperties = { ...dugmeAnaSatir, gap: 6 };
const btnSecondary: React.CSSProperties = { ...dugmeSilik, color: "var(--ink-green)", fontSize: 12.5 };
const btnSmall: React.CSSProperties = dugmeKucuk;
const btnGhost: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "7px 12px", background: "var(--card)", color: "var(--muted)", fontSize: 12, flexShrink: 0, cursor: "pointer" };

// Mobil (dışarıda, tek elle, dokunarak kullanım) — daha büyük yazı ve dokunma alanı, aynı
// desen genişte de var ama burada parmak ucu hedefleri (min ~44px) gözetilir.
const inpMobile: React.CSSProperties = kutuAyakta;
const btnPrimaryMobile: React.CSSProperties = dugmeAnaAyakta;
const btnSecondaryMobile: React.CSSProperties = { ...dugmeIkincilAyakta, minWidth: 0, width: undefined };
const btnSmallMobile: React.CSSProperties = { ...dugmeKucukAyakta, textAlign: "center" };
const btnGhostMobile: React.CSSProperties = { ...dugmeSilikAyakta, color: "var(--muted)", width: "100%", textAlign: "center" };
