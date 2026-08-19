"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { getMyReservationRestaurantId } from "@/lib/supabase/reservationAccount";
import { toTitleTr } from "@/lib/text";
import { Plus, RefreshCw, X } from "lucide-react";

// GARSON PANELİ (Gökhan, 2026-08-16).
//
// Kararlar:
//  - Garson TÜM SALONU görür, ayrıca KENDİ baktığı masalar ayrı sekmede çıkar. Hangi masaya
//    baktığını salon şefi belirler (masa_garson tablosu, günlük).
//  - Garson rezervasyonun DURUMUNU DEĞİŞTİREMEZ — "o karşılamanın işi". Sadece görür.
//  - Rezervasyon GİREBİLİR: "bütün paneller girebilir". Girdiği kayıt kendi üstüne yazılır
//    (alan_personel_id), böylece rezervasyonu kimin aldığı belli olur.
//  - Herkes kendi telefonunda kullanacak → ekran mobil önceliklidir.
//
// PIN YOK (Gökhan, 2026-08-16: "şimdilik pin olmasın"). Program "ben kimim" bilgisini
// bilmediği için üstte isim seçici var; seçim o cihazda saklanıyor. PIN gelince bu seçici
// kalkacak, yerini girişe bırakacak.

type Personel = { id: string; full_name: string };
type Masa = { id: string; name: string; area_id: string | null };
type Salon = { id: string; name: string };
type Rez = {
  id: string; guest_name: string; party_size: number; reserved_at: string; status: string;
  note: string | null; yedek: boolean; alan_personel_id: string | null;
  reservation_tables: { table_id: string }[] | null;
};

const CIHAZ_ANAHTARI = "rzv-garson-id";

const saatYaz = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const bugunIstanbul = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

// Gün sınırı: çalışma saatleri gece yarısını aşabildiği için gün 06:00'da başlatılıyor —
// gecenin 02:00'sindeki misafir hâlâ dün geceye ait (bkz. Ayarlar > Çalışma saatleri).
const gunSiniri = (tarih: string) => ({
  start: new Date(`${tarih}T06:00:00+03:00`).toISOString(),
  end: new Date(new Date(`${tarih}T06:00:00+03:00`).getTime() + 24 * 3600 * 1000).toISOString(),
});

const DURUM_ETIKET: Record<string, { ad: string; renk: string; zemin: string }> = {
  bekleniyor: { ad: "Bekleniyor", renk: "var(--muted)", zemin: "var(--recede)" },
  geldi: { ad: "Geldi", renk: "var(--info)", zemin: "var(--info-bg)" },
  oturdu: { ad: "Oturdu", renk: "var(--brand-strong)", zemin: "var(--tan-300)" },
  tamamlandi: { ad: "Kalktı", renk: "var(--muted-2)", zemin: "transparent" },
  gelmedi: { ad: "Gelmedi", renk: "var(--danger)", zemin: "transparent" },
  iptal: { ad: "İptal", renk: "var(--danger)", zemin: "transparent" },
};

export default function GarsonEkraniTaslak() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [benId, setBenId] = useState<string>("");
  const [masalar, setMasalar] = useState<Masa[]>([]);
  const [salonlar, setSalonlar] = useState<Salon[]>([]);
  const [rezler, setRezler] = useState<Rez[]>([]);
  const [benimMasalarim, setBenimMasalarim] = useState<Set<string>>(new Set());
  const [sekme, setSekme] = useState<"tum" | "benim">("tum");

  // Yeni rezervasyon
  const [ekleAcik, setEkleAcik] = useState(false);
  const [fAd, setFAd] = useState("");
  const [fTel, setFTel] = useState("");
  const [fKisi, setFKisi] = useState("2");
  const [fSaat, setFSaat] = useState("21:00");
  const [fNot, setFNot] = useState("");
  const [kaydediliyor, setKaydediliyor] = useState(false);

  useEffect(() => {
    let acik = true;
    getMyReservationRestaurantId().then((id) => { if (acik) setRestaurantId(id); });
    // Cihazda saklı seçim effect gövdesinde DOĞRUDAN yazılmıyor: senkron setState zincirleme
    // render uyarısı veriyor (react-hooks/set-state-in-effect). Bir tik sonraya alınıyor.
    const t = setTimeout(() => {
      const kayitli = window.localStorage.getItem(CIHAZ_ANAHTARI);
      if (kayitli) setBenId(kayitli);
    }, 0);
    return () => { acik = false; clearTimeout(t); };
  }, []);

  const yukle = useCallback(async (restId: string) => {
    const gun = bugunIstanbul();
    const { start, end } = gunSiniri(gun);
    const [{ data: p }, { data: m }, { data: a }, { data: r }, { data: mg }] = await Promise.all([
      supabase.from("staff_members").select("id, full_name").eq("restaurant_id", restId)
        .eq("role", "garson").eq("active", true).is("deleted_at", null).order("full_name"),
      supabase.from("restaurant_tables").select("id, name, area_id").eq("restaurant_id", restId)
        .is("deleted_at", null).order("sort_order"),
      supabase.from("dining_areas").select("id, name").eq("restaurant_id", restId)
        .is("deleted_at", null).order("sort_order"),
      supabase.from("reservations")
        .select("id, guest_name, party_size, reserved_at, status, note, yedek, alan_personel_id, reservation_tables(table_id)")
        .eq("restaurant_id", restId).is("deleted_at", null)
        .gte("reserved_at", start).lt("reserved_at", end)
        .order("reserved_at"),
      supabase.from("masa_garson").select("table_id, staff_id").eq("restaurant_id", restId).eq("gun", gun),
    ]);
    setPersoneller((p as Personel[]) ?? []);
    setMasalar((m as Masa[]) ?? []);
    setSalonlar((a as Salon[]) ?? []);
    setRezler((r as Rez[]) ?? []);
    const atamalar = (mg as { table_id: string; staff_id: string }[]) ?? [];
    setBenimMasalarim(new Set(atamalar.filter((x) => x.staff_id === benId).map((x) => x.table_id)));
    setYukleniyor(false);
  }, [benId]);

  useEffect(() => {
    if (!restaurantId) return;
    const t = setTimeout(() => { yukle(restaurantId); }, 0);
    return () => clearTimeout(t);
  }, [restaurantId, yukle]);

  // Yarım dakikada bir tazeleniyor — garson elini sürmeden salonun son hâlini görsün.
  useEffect(() => {
    if (!restaurantId) return;
    const t = setInterval(() => { yukle(restaurantId); }, 30000);
    return () => clearInterval(t);
  }, [restaurantId, yukle]);

  const beniSec = (id: string) => {
    setBenId(id);
    window.localStorage.setItem(CIHAZ_ANAHTARI, id);
  };

  const masaAdi = (r: Rez) => {
    const idler = (r.reservation_tables ?? []).map((x) => x.table_id);
    const adlar = idler.map((id) => masalar.find((m) => m.id === id)?.name).filter(Boolean);
    return adlar.length > 0 ? adlar.join(" + ") : "—";
  };
  const salonAdi = (r: Rez) => {
    const ilk = (r.reservation_tables ?? [])[0]?.table_id;
    const masa = ilk ? masalar.find((m) => m.id === ilk) : null;
    return masa ? salonlar.find((s) => s.id === masa.area_id)?.name ?? "" : "";
  };
  const benimMi = (r: Rez) => (r.reservation_tables ?? []).some((x) => benimMasalarim.has(x.table_id));

  const gosterilen = rezler
    .filter((r) => r.status !== "iptal")
    .filter((r) => (sekme === "benim" ? benimMi(r) : true));

  const kaydet = async () => {
    if (!restaurantId || kaydediliyor) return;
    const kisi = parseInt(fKisi, 10) || 0;
    if (!fAd.trim() || kisi <= 0) { setErr("İsim ve kişi sayısı gerekli."); return; }
    setKaydediliyor(true); setErr(null);
    const { error } = await supabase.from("reservations").insert({
      restaurant_id: restaurantId,
      guest_name: toTitleTr(fAd),
      guest_phone: fTel.replace(/\D/g, "") || null,
      party_size: kisi,
      reserved_at: new Date(`${bugunIstanbul()}T${fSaat}:00+03:00`).toISOString(),
      note: fNot.trim() || null,
      status: "bekleniyor",
      source: "rezervasyon",
      // Rezervasyonu kimin aldığı panelden belli oluyor (Gökhan, 2026-08-16).
      alan_personel_id: benId || null,
    });
    setKaydediliyor(false);
    if (error) { setErr(error.message); return; }
    setFAd(""); setFTel(""); setFKisi("2"); setFNot(""); setEkleAcik(false);
    await yukle(restaurantId);
  };

  if (!restaurantId && !yukleniyor) {
    return (
      <div style={sayfa}>
        <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13.5, paddingTop: 60 }}>
          İşletme bulunamadı. <Link href="/rezervasyon/giris" style={{ color: "var(--brand)" }}>Giriş yap</Link>
        </div>
      </div>
    );
  }

  const ben = personeller.find((p) => p.id === benId);

  return (
    <div style={sayfa}>
      {/* ÜST ŞERİT — kim olduğu ve tazeleme. PIN gelince isim seçici kalkacak. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink-green)", letterSpacing: "-0.3px" }}>Garson</div>
        <select
          value={benId} onChange={(e) => beniSec(e.target.value)}
          style={{ ...inp, flex: 1, minWidth: 0, maxWidth: 200 }}
        >
          <option value="">Kim olduğunu seç</option>
          {personeller.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
        </select>
        <button
          onClick={() => restaurantId && yukle(restaurantId)}
          aria-label="Tazele"
          style={{ ...inp, width: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 8 }}>{err}</div>}

      {/* SEKMELER */}
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {([["tum", "Tüm salon"], ["benim", "Masalarım"]] as const).map(([k, ad]) => (
          <button
            key={k} onClick={() => setSekme(k)}
            style={{
              all: "unset", cursor: "pointer", flex: 1, textAlign: "center", padding: "8px 0",
              borderRadius: 10, fontSize: 13.5,
              border: sekme === k ? "1px solid var(--brand-strong)" : "1px solid var(--line-2)",
              background: sekme === k ? "var(--recede)" : "var(--card)",
              color: sekme === k ? "var(--brand-strong)" : "var(--ink)",
              fontWeight: sekme === k ? 600 : 400,
            }}
          >
            {ad}
          </button>
        ))}
      </div>

      {sekme === "benim" && !benId && (
        <div style={bilgiKutu}>Masalarını görmek için yukarıdan kendi adını seç.</div>
      )}
      {sekme === "benim" && benId && benimMasalarim.size === 0 && (
        <div style={bilgiKutu}>{ben?.full_name ?? "Sana"} bugün için masa atanmamış. Salon şefi masaları dağıtınca burada görünecek.</div>
      )}

      {/* LİSTE */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, overflowY: "auto", minHeight: 0 }}>
        {gosterilen.length === 0 && !yukleniyor && (
          <div style={bilgiKutu}>Bugün için rezervasyon yok.</div>
        )}
        {gosterilen.map((r) => {
          const d = DURUM_ETIKET[r.status] ?? DURUM_ETIKET.bekleniyor;
          const bende = benimMi(r);
          return (
            <div
              key={r.id}
              style={{
                border: bende ? "1px solid var(--brand-strong)" : "1px solid var(--line-2)",
                borderRadius: 12, padding: "9px 11px", background: "var(--card)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="tnum" style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink-green)", flexShrink: 0 }}>{saatYaz(r.reserved_at)}</span>
                <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.guest_name}
                </span>
                <span className="tnum" style={{ fontSize: 12.5, color: "var(--muted)", flexShrink: 0 }}>{r.party_size} pax</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: d.renk, background: d.zemin, borderRadius: 6, padding: "2px 7px", flexShrink: 0 }}>
                  {r.yedek ? "Yedek" : d.ad}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {masaAdi(r)}{salonAdi(r) ? ` · ${salonAdi(r)}` : ""}
                </span>
                {bende && <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--brand-strong)" }}>SENİN MASAN</span>}
              </div>
              {r.note && (
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.4 }}>{r.note}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* YENİ REZERVASYON — durum değiştirme yok, sadece kayıt açma (Gökhan). */}
      {!ekleAcik ? (
        <button onClick={() => setEkleAcik(true)} style={{ ...anaBtn, marginTop: 10 }}>
          <Plus size={15} style={{ marginRight: 5 }} />Rezervasyon ekle
        </button>
      ) : (
        <div style={{ border: "1px solid var(--line-2)", borderRadius: 12, padding: 12, marginTop: 10, background: "var(--card)" }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>Yeni rezervasyon</span>
            <button onClick={() => setEkleAcik(false)} style={{ all: "unset", cursor: "pointer", color: "var(--muted-2)" }}><X size={15} /></button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <input value={fAd} onChange={(e) => setFAd(e.target.value)} placeholder="İsim soyisim" style={inp} />
            <input value={fTel} onChange={(e) => setFTel(e.target.value.replace(/\D/g, ""))} placeholder="Telefon" inputMode="tel" className="tnum" style={inp} />
            <div style={{ display: "flex", gap: 7 }}>
              <input value={fKisi} onChange={(e) => setFKisi(e.target.value.replace(/\D/g, ""))} placeholder="Kişi" inputMode="numeric" className="tnum" style={{ ...inp, flex: 1, textAlign: "center" }} />
              <input type="time" value={fSaat} onChange={(e) => setFSaat(e.target.value)} className="tnum" style={{ ...inp, flex: 1 }} />
            </div>
            <input value={fNot} onChange={(e) => setFNot(e.target.value)} placeholder="Not (isteğe bağlı)" style={inp} />
          </div>
          <button onClick={kaydet} disabled={kaydediliyor} style={{ ...anaBtn, marginTop: 10, opacity: kaydediliyor ? 0.6 : 1 }}>
            {kaydediliyor ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      )}
    </div>
  );
}

const sayfa: React.CSSProperties = {
  background: "var(--canvas)", minHeight: "100vh", padding: "14px 12px 20px",
  display: "flex", flexDirection: "column", boxSizing: "border-box", maxWidth: 620, margin: "0 auto",
};
const inp: React.CSSProperties = {
  border: "1px solid var(--line-2)", borderRadius: 10, padding: "1mm 10px", fontSize: 14,
  lineHeight: 1.4, background: "var(--card)", color: "var(--ink)", outline: "none",
  minWidth: 0, boxSizing: "border-box",
};
const anaBtn: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", width: "100%",
  border: "none", borderRadius: 980, padding: "12px 16px", background: "var(--brand-strong)",
  color: "#fff", fontSize: 14.5, fontWeight: 500, cursor: "pointer", flexShrink: 0,
};
const bilgiKutu: React.CSSProperties = {
  fontSize: 12.5, color: "var(--muted)", background: "var(--card)",
  border: "1px solid var(--line-2)", borderRadius: 12, padding: "12px 14px", lineHeight: 1.5,
};
