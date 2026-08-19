"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { ChevronDown, ChevronLeft, ChevronRight, Maximize2, Minimize2, Plus, Trash2 } from "lucide-react";
import SalonPlani, { type PlanMasasi } from "./SalonPlani";
import type { MasaOlcusu } from "../masaOlcu";

// POSTA (Gökhan, 2026-08-17). "Garsona verilen masa grubuna posta denir."
//
// Tek bileşen, iki yerde: masaüstünde Salon ekranının içinde bir kip olarak, telefonda
// nav'daki ayrı Posta ekranı olarak.
//
// İKİ AYRI İŞ (Gökhan, 2026-08-17):
//   1) POSTA KURMA — seyrek. Sağ üstteki "Posta ekle"ye basılır, ekran TAM EKRAN olur
//      (bu işin en çok ihtiyacı olan şey büyük plan), masalar seçilir, "Ekle" denir, posta
//      kurulur ve ekran normale döner. Postalar KALICI: bir daha girilmedikçe öyle kalır.
//   2) GARSON ATAMA — günlük, hızlı. Postalar akordeonundan posta, yanındaki Garsonlar
//      akordeonundan kişi seçilir, "Tamam" denir. Kimse dokunmazsa en son bırakılan düzen
//      geçerli kalır.
//
// Normal kipte plandaki masalara dokunmak hiçbir şeyi değiştirmez — günlük kullanımda
// bölme yanlışlıkla bozulmaz.
//
// ROLE GÖRE:
//   şef / yönetici / işletme sahibi → posta kurar, garson atar
//   garson                          → kendi postası altın çerçeveyle yanar, dokunamaz
//   PR / karşılama                  → hangi masa hangi postada, görür

type Personel = { id: string; ad_soyad: string; rol: string };
// Postanın garsonu artık burada değil, ayrı tabloda ve birden fazla olabiliyor (Gökhan,
// 2026-08-18: "aynı postaya 2 garson da atanabilsin") — bkz. postaGarsonlari.
type Posta = { id: string; ad: string; renk: string; sira: number };
type Masa = PlanMasasi & { area_id: string | null };
type Salon = { id: string; name: string; genislik_cm: number | null; derinlik_cm: number | null };
type Oturan = { table_id: string; guest_name: string; party_size: number };

const bugunIstanbul = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const gunSiniri = (tarih: string) => ({
  start: new Date(`${tarih}T06:00:00+03:00`).toISOString(),
  end: new Date(new Date(`${tarih}T06:00:00+03:00`).getTime() + 24 * 3600 * 1000).toISOString(),
});

// Postalar tek bakışta ayrılsın diye — yeni posta sıradaki rengi alır.
const RENKLER = ["#3F7CAC", "#5E8C61", "#B4654A", "#8E6BA8", "#C08A2E", "#A34D6B", "#4F7A78", "#7A6A55"];

// Akordeon başlığına sığsın diye soyadı kısaltılıyor: "Ahmet Yılmaz" → "Ahmet Y."
// (Gökhan, 2026-08-17: "garsonda isim görünsün, soy isim kısaltma").
const kisaAd = (adSoyad: string) => {
  const parcalar = adSoyad.trim().split(/\s+/);
  if (parcalar.length < 2) return adSoyad;
  return `${parcalar[0]} ${parcalar.slice(1).map((p) => p[0].toLocaleUpperCase("tr") + ".").join(" ")}`;
};

// atamaVar=false: ekran sadece gösteriyor — posta seçme, garson atama ve posta silme
// kalkıyor, plan ve "Posta kur" kalıyor (Gökhan, 2026-08-18: "salon planında sadece o
// postanın garsonunu ve postayı görecek, seçme ve listeleme işlemlerini yeni sayfaya
// götüreceğiz"). Telefondaki Posta salon ekranı böyle açılıyor; masaüstünde Salon ekranının
// içindeki kip eskisi gibi tam yetkili.
export default function PostaPaneli({ restaurantId, atamaVar = true }: { restaurantId: string; atamaVar?: boolean }) {
  const [err, setErr] = useState<string | null>(null);
  const [personeller, setPersoneller] = useState<Personel[]>([]);
  const [postalar, setPostalar] = useState<Posta[]>([]);
  const [masaPostasi, setMasaPostasi] = useState<Record<string, string>>({}); // masaId -> postaId
  const [postaGarsonlari, setPostaGarsonlari] = useState<Record<string, string[]>>({}); // postaId -> personelId[]
  const [seciliPosta, setSeciliPosta] = useState<string>("");
  const [seciliGarson, setSeciliGarson] = useState<string>("");
  const [masalar, setMasalar] = useState<Masa[]>([]);
  const [salonlar, setSalonlar] = useState<Salon[]>([]);
  const [ozelOlculer, setOzelOlculer] = useState<MasaOlcusu[]>([]);
  // Telefonda salonlar arasında sağa sola kaydırarak da geçiliyor (Gökhan, 2026-08-17).
  const [salonSira, setSalonSira] = useState(0);
  const dokunusX = useRef<number | null>(null);
  const [acikAkordeon, setAcikAkordeon] = useState<"salon" | "garson" | "posta" | null>(null);
  // Posta kurma kipi — açıkken ekran tam ekran, masalara dokunulunca seçime girer/çıkar.
  const [ekleKipi, setEkleKipi] = useState(false);
  const [yeniMasalar, setYeniMasalar] = useState<Set<string>>(new Set());
  const [oturanlar, setOturanlar] = useState<Record<string, Oturan>>({});
  const [benimPostam, setBenimPostam] = useState<Set<string>>(new Set());
  const [dagitabilir, setDagitabilir] = useState(false);
  // Ayar: garson sadece postasının bulunduğu salonları görsün mü (Gökhan, 2026-08-17).
  const [sadeceKendiSalonu, setSadeceKendiSalonu] = useState(true);
  // Plan elle yakınlaştırıldıysa tek parmak salon değiştirmez, planı gezdirir.
  const [planZoom, setPlanZoom] = useState(1);
  const zoomDegisti = useCallback((oran: number) => setPlanZoom(oran), []);
  const [tamEkran, setTamEkran] = useState(false);
  const [busy, setBusy] = useState(false);

  const yukle = useCallback(async () => {
    const gun = bugunIstanbul();
    const { start, end } = gunSiniri(gun);
    const [{ data: p }, { data: m }, { data: a }, { data: po }, { data: pst }, { data: rol }, { data: mo }, { data: ayar }, { data: rez }] = await Promise.all([
      supabase.rpc("isletme_personeli", { p_restaurant: restaurantId }),
      supabase.from("restaurant_tables").select("id, name, area_id, seat_count, shape, rotated, position_x, position_y")
        .eq("restaurant_id", restaurantId).is("deleted_at", null).order("sort_order"),
      supabase.from("dining_areas").select("id, name, genislik_cm, derinlik_cm").eq("restaurant_id", restaurantId)
        .is("deleted_at", null).order("sort_order"),
      supabase.from("postalar").select("id, ad, renk, sira")
        .eq("restaurant_id", restaurantId).is("deleted_at", null).order("sira"),
      supabase.rpc("postam"),
      supabase.rpc("personel_rolum"),
      supabase.from("masa_olculeri").select("shape, seat_tier, width_cm, height_cm").eq("restaurant_id", restaurantId),
      supabase.from("restaurant_settings").select("garson_sadece_kendi_salonu").eq("restaurant_id", restaurantId).maybeSingle(),
      // Bugünün rezervasyonları — sadece oturanlar değil, henüz gelmeyenler de masada
      // yazıyor (Gökhan, 2026-08-17: "posta ekranlarında rezervasyonları göremiyorum").
      supabase.from("reservations").select("guest_name, party_size, reserved_at, status, table_id, reservation_tables(table_id)")
        .eq("restaurant_id", restaurantId).is("deleted_at", null)
        .not("status", "in", "(iptal,gelmedi)")
        .gte("reserved_at", start).lt("reserved_at", end)
        .order("reserved_at"),
    ]);

    // Postaya sadece garson atanır (Gökhan, 2026-08-17: "sadece garson profilleri garson
    // olarak görünsün") — şef, PR, mutfak, karşılama bu listede çıkmıyor.
    setPersoneller(((p as Personel[]) ?? []).filter((k) => k.rol === "garson"));
    setMasalar((m as Masa[]) ?? []);
    setSalonlar((a as Salon[]) ?? []);
    setOzelOlculer((mo as MasaOlcusu[]) ?? []);
    setSadeceKendiSalonu((ayar as { garson_sadece_kendi_salonu: boolean } | null)?.garson_sadece_kendi_salonu ?? true);

    const liste = (po as Posta[]) ?? [];
    setPostalar(liste);

    if (liste.length > 0) {
      const idler = liste.map((x) => x.id);
      const [{ data: pm }, { data: pp }] = await Promise.all([
        supabase.from("posta_masalari").select("posta_id, table_id").in("posta_id", idler),
        supabase.from("posta_personelleri").select("posta_id, personel_id").in("posta_id", idler),
      ]);
      const harita: Record<string, string> = {};
      ((pm as { posta_id: string; table_id: string }[]) ?? []).forEach((x) => { harita[x.table_id] = x.posta_id; });
      setMasaPostasi(harita);
      const garsonHarita: Record<string, string[]> = {};
      ((pp as { posta_id: string; personel_id: string }[]) ?? []).forEach((x) => {
        (garsonHarita[x.posta_id] ??= []).push(x.personel_id);
      });
      setPostaGarsonlari(garsonHarita);
    } else {
      setMasaPostasi({});
      setPostaGarsonlari({});
    }

    setBenimPostam(new Set(((pst as string[] | null) ?? [])));

    // Posta kurma / atama yetkisi: işletme sahibinin personel kaydı yoktur (rol boş gelir).
    // Personelden sadece salon şefi ve yönetici.
    const benimRolum = (rol as { rol: string }[] | null)?.[0]?.rol ?? null;
    setDagitabilir(benimRolum === null || benimRolum === "salon_sefi" || benimRolum === "yonetici");

    const oturanHarita: Record<string, Oturan> = {};
    ((rez as {
      guest_name: string; party_size: number; reserved_at: string; status: string;
      table_id: string | null; reservation_tables: { table_id: string }[] | null;
    }[]) ?? [])
      .forEach((r) => {
        // Masa hem reservation_tables'ta (birleşen masalar) hem tek alanda tutuluyor.
        const masaIdler = new Set<string>((r.reservation_tables ?? []).map((rt) => rt.table_id));
        if (r.table_id) masaIdler.add(r.table_id);
        const saat = new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })
          .format(new Date(r.reserved_at));
        masaIdler.forEach((id) => {
          oturanHarita[id] = { table_id: id, guest_name: `${saat} ${r.guest_name}`, party_size: r.party_size };
        });
      });
    setOturanlar(oturanHarita);
  }, [restaurantId]);

  useEffect(() => {
    const t = setTimeout(() => { yukle(); }, 0);
    return () => clearTimeout(t);
  }, [yukle]);

  const postaRengi = (postaId: string) => postalar.find((x) => x.id === postaId)?.renk ?? "var(--line-2)";
  /** Bir postanın garsonları — atanma sırasına göre. */
  const postaninGarsonlari = (postaId: string) =>
    (postaGarsonlari[postaId] ?? [])
      .map((pid) => personeller.find((k) => k.id === pid))
      .filter((k): k is Personel => !!k);
  /** Postanın garsonlarının kısa adları: "Ahmet Y. · Mehmet K." */
  const postaGarsonAdi = (postaId: string) => {
    const isimler = postaninGarsonlari(postaId).map((k) => kisaAd(k.ad_soyad));
    return isimler.length > 0 ? isimler.join(" · ") : null;
  };
  // Masaya bakan garsonun kısa adı — masanın üstünde yazıyor (Gökhan, 2026-08-17).
  // İki garsonlu postada ikisi de yazıyor, alt alta değil yan yana.
  const masaGarsonu = (masaId: string) => {
    const postaId = masaPostasi[masaId];
    return postaId ? postaGarsonAdi(postaId) : null;
  };
  const yeniRenk = RENKLER[postalar.length % RENKLER.length];

  // POSTA EKLE — tam ekran açılır, masalar seçilir, "Ekle" ile posta kurulur.
  const ekleyeBasla = () => {
    if (!dagitabilir) return;
    setYeniMasalar(new Set());
    setAcikAkordeon(null);
    setEkleKipi(true);
    setTamEkran(true);
  };
  const ekleyiBitir = () => { setEkleKipi(false); setTamEkran(false); setYeniMasalar(new Set()); };

  const postayiKur = async () => {
    if (!dagitabilir || busy || yeniMasalar.size === 0) return;
    setBusy(true); setErr(null);
    const sira = postalar.length;
    const { data, error } = await supabase.from("postalar")
      .insert({ restaurant_id: restaurantId, ad: `Posta ${sira + 1}`, renk: yeniRenk, sira })
      .select("id, ad, renk, sira").single();
    if (error || !data) { setBusy(false); setErr(error?.message ?? "Posta kurulamadı"); return; }
    const yeni = data as Posta;
    const idler = [...yeniMasalar];
    // Masa başka postadaysa oradan alınır — bir masa tek postada olur.
    await supabase.from("posta_masalari").delete().in("table_id", idler);
    const { error: hata } = await supabase.from("posta_masalari")
      .insert(idler.map((id) => ({ posta_id: yeni.id, table_id: id })));
    setBusy(false);
    if (hata) { setErr(hata.message); return; }
    setPostalar((l) => [...l, yeni]);
    setMasaPostasi((h) => { const n = { ...h }; idler.forEach((id) => { n[id] = yeni.id; }); return n; });
    setSeciliPosta(yeni.id);
    ekleyiBitir();
  };

  const postaSil = async (id: string) => {
    if (!dagitabilir || busy) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from("postalar").delete().eq("id", id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setPostalar((l) => l.filter((x) => x.id !== id));
    setMasaPostasi((h) => {
      const n: Record<string, string> = {};
      Object.entries(h).forEach(([masa, posta]) => { if (posta !== id) n[masa] = posta; });
      return n;
    });
    setSeciliPosta((s) => (s === id ? "" : s));
  };

  /** Seçili garson seçili postada zaten var mı — düğmenin "Ekle" mi "Çıkar" mı olacağı buna bakıyor. */
  const seciliAtanmis = !!seciliPosta && !!seciliGarson && (postaGarsonlari[seciliPosta] ?? []).includes(seciliGarson);

  // GARSON ATAMA — posta + kişi seçili, "Ekle". Bir postaya birden fazla garson verilebildiği
  // için (Gökhan, 2026-08-18) atama artık üzerine yazmıyor, ekliyor. Postada zaten olan bir
  // garson seçilirse aynı düğme "Çıkar"a dönüp onu postadan alıyor — ayrı bir silme düğmesi yok.
  const atamayiUygula = async () => {
    if (!dagitabilir || !seciliPosta || !seciliGarson || busy) return;
    setBusy(true); setErr(null);
    const cikar = seciliAtanmis;
    setPostaGarsonlari((h) => {
      const eski = h[seciliPosta] ?? [];
      return { ...h, [seciliPosta]: cikar ? eski.filter((x) => x !== seciliGarson) : [...eski, seciliGarson] };
    });
    const { error } = cikar
      ? await supabase.from("posta_personelleri").delete().eq("posta_id", seciliPosta).eq("personel_id", seciliGarson)
      : await supabase.from("posta_personelleri").insert({ posta_id: seciliPosta, personel_id: seciliGarson });
    setBusy(false);
    // Yazma tutmadıysa ekranda kalan iyimser değişiklik yanıltmasın — liste tazeden okunuyor.
    if (error) { setErr(error.message); yukle(); return; }
    setSeciliPosta(""); setSeciliGarson(""); setAcikAkordeon(null);
  };

  const masaTikla = (masaId: string) => {
    if (!ekleKipi) return;
    setYeniMasalar((s) => {
      const n = new Set(s);
      if (n.has(masaId)) n.delete(masaId); else n.add(masaId);
      return n;
    });
  };

  const gruplar: { salon: Salon | null; masalar: Masa[] }[] = [
    ...salonlar.map((s) => ({ salon: s, masalar: masalar.filter((m) => m.area_id === s.id) })),
    { salon: null, masalar: masalar.filter((m) => !m.area_id) },
  ]
    .filter((g) => g.masalar.length > 0)
    // Ayar açıksa ve kişi posta kurmuyorsa (garson, PR…), sadece postasının olduğu salonlar
    // görünür. Postası hiç yoksa süzgeç uygulanmaz — bomboş ekran kalmasın.
    .filter((g) => !sadeceKendiSalonu || dagitabilir || benimPostam.size === 0
      || g.masalar.some((m) => benimPostam.has(m.id)));
  const acikSira = Math.min(salonSira, Math.max(0, gruplar.length - 1));
  const acikGrup = gruplar[acikSira] ?? null;
  const secili = postalar.find((x) => x.id === seciliPosta) ?? null;
  const seciliKisi = personeller.find((k) => k.id === seciliGarson) ?? null;
  const akordeonAc = (hangi: "salon" | "garson" | "posta") =>
    setAcikAkordeon((v) => (v === hangi ? null : hangi));

  // POSTALAR SEÇİLİ SALONA GÖRE SÜZÜLÜR (Gökhan, 2026-08-18: "ilk kutuda seçili salona göre
  // ikinci kutudaki postalar açılacak, yani bahçe salonuna ait postalar açılacak orada").
  // Bir postanın salonu, masalarının bulunduğu salondur. Masası kalmamış posta (masalar
  // silinmiş olabilir) her salonda görünür — yoksa hiçbir yerde açılmaz, şef onu silemezdi.
  const salonPostalari = postalar.filter((po) => {
    const masaIdler = Object.keys(masaPostasi).filter((mid) => masaPostasi[mid] === po.id);
    if (masaIdler.length === 0 || !acikGrup) return true;
    return acikGrup.masalar.some((m) => masaIdler.includes(m.id));
  });

  // Salon değişince posta seçimi de düşer: başka salonun postası seçili kalırsa kutunun
  // başlığında, listede olmayan bir isim asılı kalıyordu.
  const salonaGec = (yeni: number | ((i: number) => number)) => {
    setSalonSira(yeni);
    setSeciliPosta("");
  };

  return (
    <div style={{
      display: "flex", flexDirection: "column", minHeight: 0, flex: 1, position: "relative",
      // TAM EKRAN — plan bütün ekranı kaplasın diye panelin kendisi sayfanın üstüne alınıyor;
      // alt nav dahil her şeyin önünde duruyor. Posta kurarken kendiliğinden açılıyor.
      ...(tamEkran ? {
        position: "fixed" as const, inset: 0, zIndex: 90, background: "var(--canvas)",
        padding: 10, boxSizing: "border-box" as const,
      } : null),
    }}>
      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 8 }}>{err}</div>}

      {ekleKipi ? (
        /* POSTA KURMA ŞERİDİ — plana en çok yer kalsın diye tek satır. */
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexShrink: 0 }}>
          <span style={{ width: 12, height: 12, borderRadius: 4, background: yeniRenk, flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-green)", flex: 1, minWidth: 0 }}>
            Yeni posta — masaları seç
            <span className="tnum" style={{ color: "var(--muted-2)", fontWeight: 400, marginLeft: 6 }}>{yeniMasalar.size}</span>
          </span>
          <button onClick={ekleyiBitir} style={kucukBtn}>Vazgeç</button>
          <button
            onClick={postayiKur} disabled={busy || yeniMasalar.size === 0}
            style={{ ...kucukBtn, color: yeniMasalar.size === 0 ? "var(--muted-2)" : "var(--brand-strong)", borderColor: "var(--brand-strong)" }}
          >
            Ekle
          </button>
        </div>
      ) : !dagitabilir ? (
        /* GARSON / PR / KARŞILAMA EKRANI — şef düzenlemeleri buraya karışmıyor (Gökhan,
           2026-08-17: "garson posta ekranını şef ekranına başladığımız andan hemen önceki
           hâline getir"). Sadece salon adı, salon geçişi ve tam ekran; altında plan. */
        acikGrup && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexShrink: 0 }}>
            {gruplar.length > 1 && (
              <button onClick={() => salonaGec((i) => (i - 1 + gruplar.length) % gruplar.length)} style={okBtn} aria-label="Önceki salon">
                <ChevronLeft size={16} />
              </button>
            )}
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)", flex: 1, textAlign: gruplar.length > 1 ? "center" : "left" }}>
              {acikGrup.salon?.name ?? "Salonu olmayanlar"}
              {gruplar.length > 1 && (
                <span className="tnum" style={{ fontSize: 11.5, color: "var(--muted-2)", marginLeft: 6 }}>
                  {salonSira + 1}/{gruplar.length}
                </span>
              )}
            </span>
            <button onClick={() => setTamEkran((v) => !v)} style={okBtn} aria-label={tamEkran ? "Tam ekrandan çık" : "Tam ekran"}>
              {tamEkran ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            {gruplar.length > 1 && (
              <button onClick={() => salonaGec((i) => (i + 1) % gruplar.length)} style={okBtn} aria-label="Sonraki salon">
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        )
      ) : (
        <>
          {/* ÜST SATIR — posta kurma, atamayı bağlayan Ekle ve tam ekran (Gökhan,
              2026-08-17: "salon seçerim, posta seçerim, garson seçerim, sonra yukarıdaki
              ekle tuşuna basar hepsini birbirine eklerim"). */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexShrink: 0 }}>
            {/* Ekle solda (Gökhan, 2026-08-17) — seçimleri birbirine bağlayan düğme. */}
            {dagitabilir && atamaVar && (
              <button
                onClick={atamayiUygula} disabled={busy || !seciliPosta || !seciliGarson}
                style={{
                  ...kucukBtn,
                  // Zaten atanmış garson seçiliyse düğme çıkarmaya dönüyor; rengi de öyle.
                  color: !seciliPosta || !seciliGarson ? "var(--muted-2)" : seciliAtanmis ? "var(--danger)" : "var(--brand-strong)",
                  borderColor: !seciliPosta || !seciliGarson ? "var(--line-2)" : seciliAtanmis ? "var(--danger)" : "var(--brand-strong)",
                }}
              >
                {seciliAtanmis ? "Çıkar" : "Ekle"}
              </button>
            )}
            <span style={{ flex: 1 }} />
            {dagitabilir && (
              <button onClick={ekleyeBasla} style={kucukBtn}>
                <Plus size={12} style={{ marginRight: 4 }} />Posta kur
              </button>
            )}
            {/* Silme, kurmanın yanında (Gökhan, 2026-08-17) — seçili postayı siler. */}
            {dagitabilir && atamaVar && (
              <button
                onClick={() => secili && postaSil(secili.id)} disabled={busy || !secili}
                style={{ ...kucukBtn, color: secili ? "var(--danger)" : "var(--muted-2)" }}
              >
                <Trash2 size={12} style={{ marginRight: 4 }} />Posta sil
              </button>
            )}
            <button onClick={() => setTamEkran((v) => !v)} style={okBtn} aria-label={tamEkran ? "Tam ekrandan çık" : "Tam ekran"}>
              {tamEkran ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          </div>

          {/* ÜÇ AKORDEON — yan yana; her biri kendi altına liste açıyor (Gökhan, 2026-08-17).
              Başlıkta seçili olanın adı yazıyor. Seçme ve atama kalkınca (atamaVar=false) bu
              satır hiç çizilmiyor, ekran plana kalıyor. */}
          {atamaVar && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 6, flexShrink: 0, position: "relative", zIndex: 20 }}>
            <div style={sutun}>
              <button onClick={() => akordeonAc("salon")} style={akordeonBtn(acikAkordeon === "salon")}>
                <span style={baslikYazi}>{acikGrup?.salon?.name ?? (acikGrup ? "Salonu olmayanlar" : "Salonlar")}</span>
                <ChevronDown size={13} style={{ transform: acikAkordeon === "salon" ? "rotate(180deg)" : undefined, transition: "transform .15s", flexShrink: 0 }} />
              </button>
              {acikAkordeon === "salon" && (
                <div style={listeKutu}>
                  {gruplar.map((g, i) => (
                    <button
                      key={g.salon?.id ?? "salonsuz"}
                      onClick={() => { salonaGec(i); setAcikAkordeon(null); }}
                      style={satirBtn(i === acikSira)}
                    >
                      <span style={satirYazi}>{g.salon?.name ?? "Salonu olmayanlar"}</span>
                      <span className="tnum" style={satirSayi}>{g.masalar.length}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={sutun}>
              <button onClick={() => akordeonAc("posta")} style={akordeonBtn(acikAkordeon === "posta")}>
                <span style={baslikYazi}>{secili?.ad ?? "Postalar"}</span>
                <ChevronDown size={13} style={{ transform: acikAkordeon === "posta" ? "rotate(180deg)" : undefined, transition: "transform .15s", flexShrink: 0 }} />
              </button>
              {acikAkordeon === "posta" && (
                <div style={listeKutu}>
                  {salonPostalari.length === 0 && (
                    <div style={bosYazi}>{postalar.length === 0 ? "Henüz posta kurulmadı." : "Bu salonda posta yok."}</div>
                  )}
                  {salonPostalari.map((po) => {
                    const adet = Object.values(masaPostasi).filter((x) => x === po.id).length;
                    const garsonlar = postaGarsonAdi(po.id);
                    return (
                      <button
                        key={po.id}
                        onClick={() => { setSeciliPosta((s) => (s === po.id ? "" : po.id)); setAcikAkordeon(null); }}
                        style={satirBtn(seciliPosta === po.id)}
                      >
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: po.renk, flexShrink: 0 }} />
                        <span style={satirYazi}>{po.ad}{garsonlar ? ` · ${garsonlar}` : ""}</span>
                        <span className="tnum" style={satirSayi}>{adet}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={sutun}>
              <button onClick={() => akordeonAc("garson")} style={akordeonBtn(acikAkordeon === "garson")}>
                <span style={baslikYazi}>{seciliKisi ? kisaAd(seciliKisi.ad_soyad) : "Garsonlar"}</span>
                <ChevronDown size={13} style={{ transform: acikAkordeon === "garson" ? "rotate(180deg)" : undefined, transition: "transform .15s", flexShrink: 0 }} />
              </button>
              {acikAkordeon === "garson" && (
                <div style={listeKutu}>
                  {personeller.length === 0 && <div style={bosYazi}>Bağlı personel yok.</div>}
                  {personeller.map((k) => {
                    const kendiPostalari = postalar.filter((po) => (postaGarsonlari[po.id] ?? []).includes(k.id));
                    const kendiPostasi = kendiPostalari[0] ?? null;
                    return (
                      <button
                        key={k.id}
                        onClick={() => { setSeciliGarson((s) => (s === k.id ? "" : k.id)); setAcikAkordeon(null); }}
                        style={satirBtn(seciliGarson === k.id)}
                      >
                        <span style={{
                          width: 9, height: 9, borderRadius: 3, flexShrink: 0,
                          background: kendiPostasi ? kendiPostasi.renk : "transparent",
                        }} />
                        <span style={satirYazi}>{kisaAd(k.ad_soyad)}</span>
                        {/* Bir garson birden fazla postaya da verilebiliyor — hepsi yazıyor. */}
                        <span style={satirSayi}>{kendiPostalari.length > 0 ? kendiPostalari.map((po) => po.ad).join(", ") : "—"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          )}
        </>
      )}

      {/* BEYAZ KART — plan burada. Akordeon paneli bunun ÜSTÜNE biniyor, planı küçültmüyor. */}
      <div
        style={{
          flex: 1, minHeight: 0, overflow: "hidden", boxSizing: "border-box", position: "relative",
          display: "flex", flexDirection: "column",
          background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 16,
        }}
        onTouchStart={(e) => { dokunusX.current = e.touches.length === 1 ? e.touches[0].clientX : null; }}
        onTouchEnd={(e) => {
          if (dokunusX.current === null || gruplar.length < 2 || planZoom > 1) return;
          const fark = e.changedTouches[0].clientX - dokunusX.current;
          dokunusX.current = null;
          if (Math.abs(fark) < 50) return;
          salonaGec((i) => (fark < 0 ? (i + 1) % gruplar.length : (i - 1 + gruplar.length) % gruplar.length));
        }}
      >
        {acikGrup && (
          <SalonPlani
            key={acikGrup.salon?.id ?? "salonsuz"}
            onZoomDegisti={zoomDegisti}
            masalar={acikGrup.masalar}
            ozelOlculer={ozelOlculer}
            genislikCm={acikGrup.salon?.genislik_cm ?? null}
            derinlikCm={acikGrup.salon?.derinlik_cm ?? null}
            renkOf={(id) => (ekleKipi && yeniMasalar.has(id) ? yeniRenk : masaPostasi[id] ? postaRengi(masaPostasi[id]) : null)}
            // Kurarken seçilen masalar, günlük kullanımda kendi postam altın çerçeveyle yanar.
            benimPostam={ekleKipi ? yeniMasalar : benimPostam}
            // Masada en fazla üç satır olsun diye: rezervasyon varsa ikinci satır o, garson
            // üçüncü satıra iner; rezervasyon yoksa garson ikinci satırda, o da yoksa
            // kapasite yazar (Gökhan, 2026-08-17).
            altYazi={(id) => oturanlar[id]?.guest_name
              ?? masaGarsonu(id)
              ?? `${masalar.find((m) => m.id === id)?.seat_count ?? 0} kişilik`}
            garsonYazi={(id) => (oturanlar[id] ? masaGarsonu(id) : null)}
            onMasaTikla={ekleKipi ? masaTikla : undefined}
          />
        )}

      </div>
    </div>
  );
}

const akordeonBtn = (acik: boolean): React.CSSProperties => ({
  all: "unset", cursor: "pointer", flex: 1, minWidth: 0, boxSizing: "border-box",
  display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4,
  border: `1px solid ${acik ? "var(--brand-strong)" : "var(--line-2)"}`,
  borderRadius: 10, padding: "calc(7px - 1.5mm) 10px",
  background: acik ? "var(--recede)" : "var(--card)",
  color: acik ? "var(--brand-strong)" : "var(--ink)",
});
const baslikYazi: React.CSSProperties = {
  fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
// Akordeonun kendi sütunu — açılan liste bu sütunun altına, planın üstüne düşüyor.
const sutun: React.CSSProperties = { flex: 1, minWidth: 0, position: "relative" };
const listeKutu: React.CSSProperties = {
  position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", zIndex: 30,
  border: "1px solid var(--line)", borderRadius: 12, background: "var(--card)",
  boxShadow: "0 8px 24px rgba(30,25,15,0.16)", padding: 4,
  maxHeight: "46vh", overflowY: "auto",
  display: "flex", flexDirection: "column", gap: 2,
};
const satirBtn = (secili: boolean): React.CSSProperties => ({
  all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
  padding: "7px 8px", borderRadius: 8, fontSize: 12.5, boxSizing: "border-box",
  background: secili ? "var(--recede)" : "transparent",
  fontWeight: secili ? 600 : 400,
});
const satirYazi: React.CSSProperties = {
  flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
const satirSayi: React.CSSProperties = { color: "var(--muted-2)", fontSize: 11.5, flexShrink: 0 };
const bosYazi: React.CSSProperties = { fontSize: 12.5, color: "var(--muted-2)", padding: "6px 8px" };
const okBtn: React.CSSProperties = {
  all: "unset", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  width: 30, height: 30, borderRadius: 9, border: "1px solid var(--line-2)",
  color: "var(--ink)", flexShrink: 0,
};
const kucukBtn: React.CSSProperties = {
  all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center",
  border: "1px solid var(--line-2)", borderRadius: 8, padding: "5px 10px",
  fontSize: 11.5, color: "var(--muted)", flexShrink: 0,
};
