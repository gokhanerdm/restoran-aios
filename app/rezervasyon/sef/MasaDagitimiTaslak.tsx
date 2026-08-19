"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { getMyReservationRestaurantId } from "@/lib/supabase/reservationAccount";
import { RefreshCw } from "lucide-react";

// SALON ŞEFİ PANELİ — İLK PARÇA: MASA DAĞITIMI (Gökhan, 2026-08-16).
//
// "Garsonun hangi masalara bakacağını da şef kendi panelinden belirlesin."
// Dağıtım GÜNLÜK: her gece değişebiliyor, dünün dağılımı bugüne taşınmıyor (masa_garson.gun).
// Bir masaya aynı gün tek garson bakar — masaya tıklayınca seçili garsona geçer, aynı garson
// seçiliyken tekrar tıklanınca masa boşa düşer.
//
// PIN yok (Gökhan): ekran şimdilik açık. Panelin geri kalanı (rezervasyon görünümü) sonra.

type Personel = { id: string; ad_soyad: string; rol: string };
type Masa = { id: string; name: string; area_id: string | null; seat_count: number };
type Salon = { id: string; name: string };

const bugunIstanbul = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

// Garson renkleri — hangi masanın kimde olduğu tek bakışta görünsün.
const RENKLER = ["#3F7CAC", "#5E8C61", "#B4654A", "#8E6BA8", "#C08A2E", "#A34D6B", "#4F7A78", "#7A6A55"];

export default function MasaDagitimiTaslak() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  const [garsonlar, setGarsonlar] = useState<Personel[]>([]);
  const [masalar, setMasalar] = useState<Masa[]>([]);
  const [salonlar, setSalonlar] = useState<Salon[]>([]);
  const [atamalar, setAtamalar] = useState<Record<string, string>>({}); // masaId -> garsonId
  const [seciliGarson, setSeciliGarson] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let acik = true;
    getMyReservationRestaurantId().then((id) => { if (acik) setRestaurantId(id); });
    return () => { acik = false; };
  }, []);

  const yukle = useCallback(async (restId: string) => {
    const gun = bugunIstanbul();
    const [{ data: p }, { data: m }, { data: a }, { data: mg }] = await Promise.all([
      // Ekip'ten bağlanmış ONAYLI personel — masa dağıtımı artık onlara yapılıyor
      // (Gökhan, 2026-08-17). Eski AIOS personel listesi kullanılmıyor.
      supabase.rpc("isletme_personeli", { p_restaurant: restId }),
      supabase.from("restaurant_tables").select("id, name, area_id, seat_count").eq("restaurant_id", restId)
        .is("deleted_at", null).order("sort_order"),
      supabase.from("dining_areas").select("id, name").eq("restaurant_id", restId)
        .is("deleted_at", null).order("sort_order"),
      supabase.from("masa_garson").select("table_id, personel_id").eq("restaurant_id", restId).eq("gun", gun),
    ]);
    const gList = (p as Personel[]) ?? [];
    setGarsonlar(gList);
    setMasalar((m as Masa[]) ?? []);
    setSalonlar((a as Salon[]) ?? []);
    const harita: Record<string, string> = {};
    ((mg as { table_id: string; personel_id: string }[]) ?? []).forEach((x) => { if (x.personel_id) harita[x.table_id] = x.personel_id; });
    setAtamalar(harita);
    setSeciliGarson((s) => s || gList[0]?.id || "");
    setYukleniyor(false);
  }, []);

  useEffect(() => {
    if (!restaurantId) return;
    const t = setTimeout(() => { yukle(restaurantId); }, 0);
    return () => clearTimeout(t);
  }, [restaurantId, yukle]);

  const renkOf = (garsonId: string) => {
    const i = garsonlar.findIndex((g) => g.id === garsonId);
    return i < 0 ? "var(--line-2)" : RENKLER[i % RENKLER.length];
  };

  // Masaya tıkla: seçili garsona ver. Zaten ondaysa geri al.
  const masaTikla = async (masaId: string) => {
    if (!restaurantId || !seciliGarson || busy) return;
    setBusy(true); setErr(null);
    const gun = bugunIstanbul();
    const mevcut = atamalar[masaId];

    if (mevcut === seciliGarson) {
      setAtamalar((a) => { const n = { ...a }; delete n[masaId]; return n; });
      const { error } = await supabase.from("masa_garson").delete().eq("table_id", masaId).eq("gun", gun);
      if (error) setErr(error.message);
    } else {
      setAtamalar((a) => ({ ...a, [masaId]: seciliGarson }));
      // Aynı masa aynı gün tek garsonda: önce varsa siliniyor, sonra yazılıyor.
      await supabase.from("masa_garson").delete().eq("table_id", masaId).eq("gun", gun);
      const { error } = await supabase.from("masa_garson")
        .insert({ restaurant_id: restaurantId, table_id: masaId, personel_id: seciliGarson, gun });
      if (error) setErr(error.message);
    }
    setBusy(false);
  };

  const salonuVer = async (salonId: string | null) => {
    if (!restaurantId || !seciliGarson || busy) return;
    setBusy(true); setErr(null);
    const gun = bugunIstanbul();
    const hedef = masalar.filter((m) => m.area_id === salonId).map((m) => m.id);
    if (hedef.length === 0) { setBusy(false); return; }
    setAtamalar((a) => { const n = { ...a }; hedef.forEach((id) => { n[id] = seciliGarson; }); return n; });
    await supabase.from("masa_garson").delete().in("table_id", hedef).eq("gun", gun);
    const { error } = await supabase.from("masa_garson").insert(
      hedef.map((id) => ({ restaurant_id: restaurantId, table_id: id, personel_id: seciliGarson, gun })),
    );
    if (error) setErr(error.message);
    setBusy(false);
  };

  const temizle = async () => {
    if (!restaurantId || busy) return;
    setBusy(true); setErr(null);
    setAtamalar({});
    const { error } = await supabase.from("masa_garson").delete().eq("restaurant_id", restaurantId).eq("gun", bugunIstanbul());
    if (error) setErr(error.message);
    setBusy(false);
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

  const gruplar: { salon: Salon | null; masalar: Masa[] }[] = [
    ...salonlar.map((s) => ({ salon: s, masalar: masalar.filter((m) => m.area_id === s.id) })),
    { salon: null, masalar: masalar.filter((m) => !m.area_id) },
  ].filter((g) => g.masalar.length > 0);

  return (
    <div style={sayfa}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink-green)", letterSpacing: "-0.3px", flex: 1 }}>
          Salon şefi — masa dağıtımı
        </div>
        <button
          onClick={() => restaurantId && yukle(restaurantId)} aria-label="Tazele"
          style={{ ...inp, width: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 8 }}>{err}</div>}

      {garsonlar.length === 0 ? (
        <div style={bilgiKutu}>Bağlı personel yok. Ekip'ten kodla bağlanıp onayladığınız personel burada çıkar.</div>
      ) : (
        <>
          {/* GARSON SEÇİMİ — önce garsonu seç, sonra masalara tıkla. */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {garsonlar.map((g) => {
              const secili = seciliGarson === g.id;
              const adet = Object.values(atamalar).filter((x) => x === g.id).length;
              return (
                <button
                  key={g.id} onClick={() => setSeciliGarson(g.id)}
                  style={{
                    all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                    padding: "7px 11px", borderRadius: 10, fontSize: 13,
                    border: secili ? `2px solid ${renkOf(g.id)}` : "1px solid var(--line-2)",
                    background: secili ? "var(--recede)" : "var(--card)",
                    fontWeight: secili ? 600 : 400,
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: renkOf(g.id), flexShrink: 0 }} />
                  {g.ad_soyad}
                  <span className="tnum" style={{ color: "var(--muted-2)", fontSize: 11.5 }}>{adet}</span>
                </button>
              );
            })}
            <button onClick={temizle} style={{ ...inp, cursor: "pointer", padding: "7px 11px", fontSize: 12.5, color: "var(--danger)", width: "auto" }}>
              Tümünü temizle
            </button>
          </div>

          <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginBottom: 10, lineHeight: 1.5 }}>
            Bugün için geçerli. Masaya tıkla, seçili garsona geçsin; aynı garsondayken tekrar tıkla, boşa düşsün.
          </div>

          {/* SALON SALON MASALAR */}
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {gruplar.map((g) => (
              <div key={g.salon?.id ?? "salonsuz"} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)" }}>{g.salon?.name ?? "Salonu olmayanlar"}</span>
                  <button
                    onClick={() => salonuVer(g.salon?.id ?? null)}
                    style={{ all: "unset", cursor: "pointer", fontSize: 11.5, color: "var(--brand)", border: "1px solid var(--line-2)", borderRadius: 8, padding: "3px 9px" }}
                  >
                    Hepsini ver
                  </button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(78px, 1fr))", gap: 6 }}>
                  {g.masalar.map((m) => {
                    const sahip = atamalar[m.id];
                    const renk = sahip ? renkOf(sahip) : null;
                    return (
                      <button
                        key={m.id} onClick={() => masaTikla(m.id)}
                        style={{
                          all: "unset", cursor: "pointer", boxSizing: "border-box", textAlign: "center",
                          padding: "9px 4px", borderRadius: 10,
                          border: renk ? `2px solid ${renk}` : "1px solid var(--line-2)",
                          background: renk ? `${renk}1F` : "var(--card)",
                        }}
                      >
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink)" }}>{m.name}</div>
                        <div className="tnum" style={{ fontSize: 10.5, color: "var(--muted-2)" }}>{m.seat_count} kişilik</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const sayfa: React.CSSProperties = {
  background: "var(--canvas)", minHeight: "100vh", padding: "14px 12px 20px",
  display: "flex", flexDirection: "column", boxSizing: "border-box", maxWidth: 760, margin: "0 auto",
};
const inp: React.CSSProperties = {
  border: "1px solid var(--line-2)", borderRadius: 10, padding: "1mm 10px", fontSize: 13.5,
  lineHeight: 1.4, background: "var(--card)", color: "var(--ink)", outline: "none",
  minWidth: 0, boxSizing: "border-box",
};
const bilgiKutu: React.CSSProperties = {
  fontSize: 12.5, color: "var(--muted)", background: "var(--card)",
  border: "1px solid var(--line-2)", borderRadius: 12, padding: "12px 14px", lineHeight: 1.5,
};
