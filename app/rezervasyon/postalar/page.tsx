"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { getMyReservationRestaurantId } from "@/lib/supabase/reservationAccount";
import RezervasyonUstBar from "../../components/RezervasyonUstBar";
import RezervasyonAltNav, { ALT_NAV_YUKSEKLIK, useYatayMobil } from "../../components/RezervasyonAltNav";
import { MenuNav, useRolum } from "../../components/RezervasyonMenu";

// POSTA — SALON ŞEFİNİN ATAMA EKRANI (Gökhan, 2026-08-18).
//
// DÜZEN (Gökhan'ın tarifi): üstte yan yana üç kutu — ilkinde salonlar, ikincisinde postalar,
// üçüncüsünde garsonlar; salon ekranındaki kutuların aynısı ama küçük değil, standart
// ölçülerde. Her seçim bir sonrakini daraltır: salon seçilir, o salonun postaları listelenir;
// posta seçilir, garson kutusu açılır. Kutuların altında atama listesi durur — şu salon, şu
// posta, şu garson ya da garsonlar.
//
// Garson kutusundan bir isme dokunmak atamayı ANINDA yapar, ayrı bir "ekle" düğmesi yok;
// aynı isme tekrar dokunmak postadan çıkarır.
//
// Ekran salon şefine ait. Yönetici ve işletme sahibi şimdilik postaları ve garsonları salon
// planından görüyor. Posta kurmak asıl olarak salon ekranında (masaları plandan seçmek
// kolay); burada da kurulabiliyor, masaları isminden veriliyor.

type Posta = { id: string; ad: string; renk: string; sira: number };
type Personel = { id: string; ad_soyad: string; rol: string };
type Masa = { id: string; name: string; area_id: string | null };
type Salon = { id: string; name: string };

// Posta renkleri plan ekranındakiyle aynı sıra — iki ekranda aynı posta aynı renkte.
const RENKLER = ["#3F7CAC", "#5E8C61", "#B4654A", "#8E6BA8", "#C08A2E", "#A34D6B", "#4F7A78", "#7A6A55"];

// "Ahmet Yılmaz" → "Ahmet Y." (salon ekranındaki kısaltmanın aynısı).
const kisaAd = (adSoyad: string) => {
  const parcalar = adSoyad.trim().split(/\s+/);
  if (parcalar.length < 2) return adSoyad;
  return `${parcalar[0]} ${parcalar.slice(1).map((p) => p[0].toLocaleUpperCase("tr") + ".").join(" ")}`;
};

const SALONSUZ = "salonsuz";

export default function PostaListesiSayfasi() {
  const router = useRouter();
  const rolum = useRolum();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [postalar, setPostalar] = useState<Posta[]>([]);
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [masalar, setMasalar] = useState<Masa[]>([]);
  const [salonlar, setSalonlar] = useState<Salon[]>([]);
  const [masaPostasi, setMasaPostasi] = useState<Record<string, string>>({});
  const [postaGarsonlari, setPostaGarsonlari] = useState<Record<string, string[]>>({});
  const [seciliSalon, setSeciliSalon] = useState<string>("");   // "" = tüm salonlar
  const [seciliPosta, setSeciliPosta] = useState<string>("");
  const [acikKutu, setAcikKutu] = useState<"salon" | "posta" | "garson" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const yatayMobil = useYatayMobil();

  // Salon şefinin ekranı — başkası adresi elle yazarsa salon ekranına düşer.
  useEffect(() => {
    if (rolum !== null && rolum !== "salon_sefi") router.replace("/rezervasyon/posta");
  }, [rolum, router]);

  useEffect(() => {
    let acik = true;
    getMyReservationRestaurantId().then((id) => {
      if (!acik) return;
      if (!id) { router.replace("/rezervasyon/giris"); return; }
      setRestaurantId(id);
    });
    return () => { acik = false; };
  }, [router]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const uygula = () => setIsMobile(mq.matches);
    uygula();
    mq.addEventListener("change", uygula);
    return () => mq.removeEventListener("change", uygula);
  }, []);

  const yukle = useCallback(async (restId: string) => {
    const [{ data: po }, { data: p }, { data: m }, { data: a }] = await Promise.all([
      supabase.from("postalar").select("id, ad, renk, sira").eq("restaurant_id", restId).is("deleted_at", null).order("sira"),
      supabase.rpc("isletme_personeli", { p_restaurant: restId }),
      supabase.from("restaurant_tables").select("id, name, area_id").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("dining_areas").select("id, name").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
    ]);
    const liste = (po as Posta[]) ?? [];
    setPostalar(liste);
    // Postaya sadece garson atanır — salon ekranındaki kuralın aynısı.
    setPersoneller(((p as Personel[]) ?? []).filter((k) => k.rol === "garson"));
    setMasalar((m as Masa[]) ?? []);
    setSalonlar((a as Salon[]) ?? []);

    if (liste.length === 0) { setMasaPostasi({}); setPostaGarsonlari({}); return; }
    const idler = liste.map((x) => x.id);
    const [{ data: pm }, { data: pp }] = await Promise.all([
      supabase.from("posta_masalari").select("posta_id, table_id").in("posta_id", idler),
      supabase.from("posta_personelleri").select("posta_id, personel_id").in("posta_id", idler),
    ]);
    const masaHarita: Record<string, string> = {};
    ((pm as { posta_id: string; table_id: string }[]) ?? []).forEach((x) => { masaHarita[x.table_id] = x.posta_id; });
    setMasaPostasi(masaHarita);
    const garsonHarita: Record<string, string[]> = {};
    ((pp as { posta_id: string; personel_id: string }[]) ?? []).forEach((x) => {
      (garsonHarita[x.posta_id] ??= []).push(x.personel_id);
    });
    setPostaGarsonlari(garsonHarita);
  }, []);

  useEffect(() => {
    if (!restaurantId) return;
    yukle(restaurantId);
  }, [restaurantId, yukle]);

  const postaMasalari = (postaId: string) => masalar.filter((m) => masaPostasi[m.id] === postaId);
  const salonAdi = (areaId: string | null) => salonlar.find((s) => s.id === areaId)?.name ?? "Salonu olmayanlar";
  /** Postanın salonu masalarından çıkıyor; masaları birden fazla salondaysa hepsi yazılıyor. */
  const postaSalonu = (postaId: string) => {
    const adlar = [...new Set(postaMasalari(postaId).map((m) => salonAdi(m.area_id)))];
    return adlar.length > 0 ? adlar.join(" · ") : "Masası yok";
  };
  /** Postanın garsonları — atanma sırasına göre. */
  const postaninGarsonlari = (postaId: string) =>
    (postaGarsonlari[postaId] ?? [])
      .map((pid) => personeller.find((k) => k.id === pid))
      .filter((k): k is Personel => !!k);
  const postaGarsonAdlari = (postaId: string) => postaninGarsonlari(postaId).map((k) => kisaAd(k.ad_soyad));

  // 1. KUTU salonu seçer; 2. kutu ve aşağıdaki her şey ona göre daralır. Masası olmayan posta
  // her salonda görünür — yoksa yeni kurulan posta hiçbir yerde açılmazdı.
  const salonunMasalari = seciliSalon === ""
    ? masalar
    : masalar.filter((m) => (seciliSalon === SALONSUZ ? !m.area_id : m.area_id === seciliSalon));
  const gorunenPostalar = postalar.filter((po) => {
    if (seciliSalon === "") return true;
    const kendi = postaMasalari(po.id);
    return kendi.length === 0 || kendi.some((m) => salonunMasalari.some((x) => x.id === m.id));
  });

  const secili = postalar.find((x) => x.id === seciliPosta) ?? null;
  const salonSecenekleri = [
    { id: "", ad: "Tüm salonlar" },
    ...salonlar.map((s) => ({ id: s.id, ad: s.name })),
    ...(masalar.some((m) => !m.area_id) ? [{ id: SALONSUZ, ad: "Salonu olmayanlar" }] : []),
  ];
  const seciliSalonAdi = salonSecenekleri.find((s) => s.id === seciliSalon)?.ad ?? "Tüm salonlar";

  const kutuAc = (hangi: "salon" | "posta" | "garson") => setAcikKutu((v) => (v === hangi ? null : hangi));
  // Salon değişince posta ve garson seçimi düşer — zincir baştan kurulur.
  const salonSec = (id: string) => { setSeciliSalon(id); setSeciliPosta(""); setAcikKutu(null); };
  const postaSec = (id: string) => { setSeciliPosta((s) => (s === id ? "" : id)); setAcikKutu(null); };

  // GARSON EKLE / ÇIKAR — dokunulunca anında. Aynı postada birden fazla garson olabiliyor.
  const garsonDegistir = async (personelId: string) => {
    if (busy || !restaurantId || !secili) return;
    const postaId = secili.id;
    const varMi = (postaGarsonlari[postaId] ?? []).includes(personelId);
    setBusy(true); setErr(null);
    setAcikKutu(null);
    setPostaGarsonlari((h) => {
      const eski = h[postaId] ?? [];
      return { ...h, [postaId]: varMi ? eski.filter((x) => x !== personelId) : [...eski, personelId] };
    });
    const { error } = varMi
      ? await supabase.from("posta_personelleri").delete().eq("posta_id", postaId).eq("personel_id", personelId)
      : await supabase.from("posta_personelleri").insert({ posta_id: postaId, personel_id: personelId });
    setBusy(false);
    if (error) { setErr(error.message); yukle(restaurantId); }
  };

  // MASA EKLE / ÇIKAR — bir masa tek postada olur, başka postadaysa oradan alınıyor.
  const masaDegistir = async (masaId: string) => {
    if (busy || !restaurantId || !secili) return;
    const postaId = secili.id;
    const bizde = masaPostasi[masaId] === postaId;
    setBusy(true); setErr(null);
    setMasaPostasi((h) => {
      const n = { ...h };
      if (bizde) delete n[masaId]; else n[masaId] = postaId;
      return n;
    });
    await supabase.from("posta_masalari").delete().eq("table_id", masaId);
    const { error } = bizde ? { error: null } : await supabase.from("posta_masalari").insert({ posta_id: postaId, table_id: masaId });
    setBusy(false);
    if (error) { setErr(error.message); yukle(restaurantId); }
  };

  const adKaydet = async (ad: string) => {
    const temiz = ad.trim();
    if (!temiz || !restaurantId || !secili || temiz === secili.ad) return;
    const postaId = secili.id;
    setPostalar((l) => l.map((x) => (x.id === postaId ? { ...x, ad: temiz } : x)));
    const { error } = await supabase.from("postalar").update({ ad: temiz }).eq("id", postaId);
    if (error) { setErr(error.message); yukle(restaurantId); }
  };

  const postaSil = async () => {
    if (busy || !restaurantId || !secili) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from("postalar").delete().eq("id", secili.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setSeciliPosta("");
    yukle(restaurantId);
  };

  // POSTA KUR — posta hemen kuruluyor ve seçili hâle geliyor; masaları en alttan veriliyor.
  const postaKur = async () => {
    if (busy || !restaurantId) return;
    setBusy(true); setErr(null);
    const sira = postalar.length;
    const { data, error } = await supabase.from("postalar")
      .insert({ restaurant_id: restaurantId, ad: `Posta ${sira + 1}`, renk: RENKLER[sira % RENKLER.length], sira })
      .select("id, ad, renk, sira").single();
    setBusy(false);
    if (error || !data) { setErr(error?.message ?? "Posta kurulamadı"); return; }
    setPostalar((l) => [...l, data as Posta]);
    setSeciliPosta((data as Posta).id);
  };

  if (!restaurantId || rolum !== "salon_sefi") {
    return (
      <div style={{ minHeight: "100vh", background: "var(--canvas)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 13.5, color: "var(--muted)" }}>Yükleniyor…</div>
      </div>
    );
  }

  return (
    <div className="postalar-sayfa" style={{
      background: "var(--canvas)", padding: "20px 24px",
      paddingBottom: yatayMobil ? 12 : (isMobile ? ALT_NAV_YUKSEKLIK + 16 : 24),
      height: isMobile ? undefined : "calc(100vh - 4px)",
      display: "flex", flexDirection: "column", boxSizing: "border-box",
    }}>
      {isMobile && <style>{`
        .postalar-sayfa { height: calc(100vh - 4px); height: calc(100svh - 4px); height: calc(100dvh - 4px); }
      `}</style>}

      <RezervasyonUstBar restaurantId={restaurantId} sayfaBaslik="Posta" />

      <div style={{ display: "flex", flex: 1, minHeight: 0, gap: isMobile ? 0 : 12 }}>
        {!isMobile && (
          <aside style={{
            width: 226, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10,
            border: "1px solid var(--line)", borderRadius: 16, background: "var(--card)",
            padding: 12, boxSizing: "border-box", overflowY: "auto",
          }}>
            <MenuNav />
          </aside>
        )}

        <div style={{
          background: "var(--card)", border: "1px solid var(--line)",
          borderRadius: yatayMobil ? 10 : 16, padding: yatayMobil ? "8px 10px" : 18,
          flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0, gap: 10,
        }}>
          {err && <div style={{ fontSize: 12.5, color: "var(--danger)", flexShrink: 0 }}>{err}</div>}

          {/* KUTULAR — üst satırda salon ve posta yan yana, garson bir satır altta (Gökhan,
              2026-08-18). Açılan liste kutunun altına düşüyor, aşağıdaki listeyi itmiyor. */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexShrink: 0, position: "relative", zIndex: 21 }}>
            <div style={sutun}>
              <button onClick={() => kutuAc("salon")} style={kutuBtn(acikKutu === "salon")}>
                <span style={kutuYazi}>{seciliSalonAdi}</span>
                <ChevronDown size={15} style={{ transform: acikKutu === "salon" ? "rotate(180deg)" : undefined, transition: "transform .15s", flexShrink: 0 }} />
              </button>
              {acikKutu === "salon" && (
                <div style={listeKutu}>
                  {salonSecenekleri.map((s) => (
                    <button key={s.id || "tumu"} onClick={() => salonSec(s.id)} style={satirBtn(seciliSalon === s.id)}>
                      <span style={satirYazi}>{s.ad}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={sutun}>
              <button onClick={() => kutuAc("posta")} style={kutuBtn(acikKutu === "posta")}>
                <span style={kutuYazi}>{secili?.ad ?? "Postalar"}</span>
                <ChevronDown size={15} style={{ transform: acikKutu === "posta" ? "rotate(180deg)" : undefined, transition: "transform .15s", flexShrink: 0 }} />
              </button>
              {acikKutu === "posta" && (
                <div style={listeKutu}>
                  {gorunenPostalar.length === 0 && (
                    <div style={bosYazi}>{postalar.length === 0 ? "Henüz posta kurulmadı." : "Bu salonda posta yok."}</div>
                  )}
                  {gorunenPostalar.map((po) => (
                    <button key={po.id} onClick={() => postaSec(po.id)} style={satirBtn(seciliPosta === po.id)}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: po.renk, flexShrink: 0 }} />
                      <span style={satirYazi}>{po.ad}</span>
                      <span className="tnum" style={satirSayi}>{postaMasalari(po.id).length}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

          </div>

          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexShrink: 0, position: "relative", zIndex: 20 }}>
            <div style={sutun}>
              {/* Garson kutusu ancak posta seçilince iş görür — zincirin son halkası. */}
              <button
                onClick={() => secili && kutuAc("garson")}
                title={secili ? undefined : "Önce posta seç"}
                style={{ ...kutuBtn(acikKutu === "garson"), opacity: secili ? 1 : 0.5 }}
              >
                <span style={kutuYazi}>Garsonlar</span>
                <ChevronDown size={15} style={{ transform: acikKutu === "garson" ? "rotate(180deg)" : undefined, transition: "transform .15s", flexShrink: 0 }} />
              </button>
              {acikKutu === "garson" && secili && (
                <div style={listeKutu}>
                  {personeller.length === 0 && <div style={bosYazi}>Bağlı garson yok.</div>}
                  {personeller.map((k) => {
                    const bizde = (postaGarsonlari[secili.id] ?? []).includes(k.id);
                    const baskaPostalar = postalar.filter((po) => po.id !== secili.id && (postaGarsonlari[po.id] ?? []).includes(k.id));
                    return (
                      <button key={k.id} onClick={() => garsonDegistir(k.id)} disabled={busy} style={satirBtn(bizde)}>
                        <span style={satirYazi}>{kisaAd(k.ad_soyad)}</span>
                        {/* Başka postası varsa yazıyor — aynı garsonu iki yere vermek bilerek olsun. */}
                        <span style={satirSayi}>{bizde ? "bu postada" : baskaPostalar.map((po) => po.ad).join(", ")}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div style={cizgi} />

          {/* ATAMA LİSTESİ — şu salon, şu posta, şu garson(lar). Üstünde başlık yok
              (Gökhan, 2026-08-18: "atamalar yazısını kaldır"); liste kendini anlatıyor.
              "Posta kur" da buradan kaldırıldı — posta kurmak salon ekranında. */}
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 6, scrollbarWidth: "none" }}>
            {gorunenPostalar.length === 0 && (
              <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "6px 0" }}>
                {postalar.length === 0 ? "Henüz posta kurulmadı." : "Bu salonda posta yok."}
              </div>
            )}
            {gorunenPostalar.map((po) => {
              const garsonlar = postaGarsonAdlari(po.id);
              const secilidir = seciliPosta === po.id;
              return (
                <div
                  key={po.id}
                  style={{
                    flexShrink: 0, borderRadius: 10, borderLeft: `4px solid ${po.renk}`,
                    background: secilidir ? "var(--recede)" : "var(--tan-100)",
                    outline: secilidir ? "1px solid var(--brand)" : undefined,
                  }}
                >
                  <button
                    onClick={() => postaSec(po.id)}
                    style={{
                      all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                      width: "100%", boxSizing: "border-box", padding: "12px 14px",
                    }}
                  >
                    <span style={{ fontSize: 12.5, color: "var(--muted)", flexShrink: 0, maxWidth: "34%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {postaSalonu(po.id)}
                    </span>
                    <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)", flexShrink: 0, whiteSpace: "nowrap" }}>{po.ad}</span>
                    <span style={{ fontSize: 13, color: garsonlar.length > 0 ? "var(--ink)" : "var(--muted-2)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {garsonlar.length > 0 ? garsonlar.join(" · ") : "Garson atanmadı"}
                    </span>
                    <span className="tnum" style={{ fontSize: 12.5, color: inkSoft, flexShrink: 0 }}>{postaMasalari(po.id).length} masa</span>
                  </button>

                  {/* Postaya dokununca SADECE O POSTANIN garsonları altında açılıyor (Gökhan,
                      2026-08-18: "o postaya ait garsonlar açılacak") — bütün garson listesi
                      değil. Garson eklemek/çıkarmak üstteki garson kutusundan. */}
                  {secilidir && (
                    <div style={{ padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
                      {postaninGarsonlari(po.id).length === 0
                        ? <div style={bosYazi}>Garson atanmadı.</div>
                        : postaninGarsonlari(po.id).map((k) => (
                          <div key={k.id} style={{ ...satirBtn(false), cursor: "default" }}>
                            <span style={satirYazi}>{k.ad_soyad}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </div>

      <RezervasyonAltNav />
    </div>
  );
}

// Kutular salon ekranındaki akordeonların aynısı, sadece standart ölçüde: yazı 14, dolgu
// 10/12 (PAGE_STANDARDS madde 11 — ölçüler rezervasyon listesinden).
const sutun: React.CSSProperties = { flex: 1, minWidth: 0, position: "relative" };
const kutuBtn = (acik: boolean): React.CSSProperties => ({
  all: "unset", cursor: "pointer", width: "100%", boxSizing: "border-box",
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6,
  border: `1px solid ${acik ? "var(--brand-strong)" : "var(--line-2)"}`,
  borderRadius: 10, padding: "10px 12px",
  background: acik ? "var(--recede)" : "var(--card)",
  color: acik ? "var(--brand-strong)" : "var(--ink)",
});
const kutuYazi: React.CSSProperties = { fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const listeKutu: React.CSSProperties = {
  position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", zIndex: 30,
  border: "1px solid var(--line)", borderRadius: 12, background: "var(--card)",
  boxShadow: "0 8px 24px rgba(30,25,15,0.16)", padding: 4,
  maxHeight: "46vh", overflowY: "auto",
  display: "flex", flexDirection: "column", gap: 2,
};
const satirBtn = (secili: boolean): React.CSSProperties => ({
  all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
  padding: "9px 10px", borderRadius: 8, fontSize: 13.5, boxSizing: "border-box",
  background: secili ? "var(--recede)" : "transparent",
  color: secili ? "var(--brand)" : "var(--ink)",
  fontWeight: secili ? 600 : 400,
});
const satirYazi: React.CSSProperties = { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const satirSayi: React.CSSProperties = { color: "var(--muted-2)", fontSize: 11.5, flexShrink: 0, maxWidth: "45%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const bosYazi: React.CSSProperties = { fontSize: 12.5, color: "var(--muted-2)", padding: "6px 8px" };
const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 10px", fontSize: 16, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0 };
const kucukBtn: React.CSSProperties = { display: "inline-flex", alignItems: "center", border: "1px solid var(--line-2)", borderRadius: 980, padding: "7px 12px", background: "var(--card)", color: "var(--ink)", fontSize: 13, flexShrink: 0, cursor: "pointer" };
const cizgi: React.CSSProperties = { height: 1, background: "var(--line)", flexShrink: 0 };
const hapSatir: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6 };
const hap = (secili: boolean): React.CSSProperties => ({
  all: "unset", cursor: "pointer", flexShrink: 0, padding: "7px 12px", borderRadius: 980,
  border: `1px solid ${secili ? "var(--brand)" : "var(--line-2)"}`,
  background: secili ? "var(--recede)" : "var(--card)",
  color: secili ? "var(--brand)" : "var(--muted)", fontSize: 13, fontWeight: 600,
  display: "inline-flex", alignItems: "center",
});
const inkSoft = "#5c5c58";
