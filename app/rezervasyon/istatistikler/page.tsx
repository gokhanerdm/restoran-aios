"use client";

// İSTATİSTİKLER (Gökhan, 2026-08-07) — rezervasyon programının rapor sayfası. Üstte ortak
// tarih filtresi (Bugün/Dün/Bu Hafta/Bu Ay/Geçen Ay/Özel), altında 8 sekme. Her sekme aynı
// tarih aralığını kullanır. "No-show" yerine hep "Gelmedi" — Türkçe kullanıyoruz.
//
// Bekleme listesi (Yedek) şu an ürün olarak yok (Gökhan bilerek simülasyon için kaldırdı,
// ileride geri gelecek) — Bekleme & Walk-in sekmesinde Walk-in çalışır, bekleme kısmı o özellik
// dönene kadar boş/placeholder.
//
// Personel bazlı performans: rezervasyonu kim aldıysa (created_by, oturumdan otomatik) artık
// kaydediliyor, ama rezervasyon programının şu anki giriş modeli işletme başına TEK hesap
// (restaurants.owner_user_id) — birden fazla personel ayrı ayrı giriş yapmıyor. Bu yüzden
// "personel bazlı karşılaştırma" şimdilik anlamlı değil (hep aynı tek hesabı gösterir); veri
// alt yapısı hazır, gerçek personel girişleri eklenince Rezervasyonlar sekmesine eklenir.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { getMyReservationRestaurantId, getMyReservationRestaurants } from "@/lib/supabase/reservationAccount";
import DatePicker from "../../components/DatePicker";
import RezervasyonAltNav, { ALT_NAV_YUKSEKLIK } from "../../components/RezervasyonAltNav";
import RezervasyonUstBar from "../../components/RezervasyonUstBar";
import { ListHeader, HeaderCell, HeaderSep, ListRow, RowSep, Cell } from "../../components/ListRow";

type Donem = "bugun" | "dun" | "hafta" | "ay" | "gecen_ay" | "ozel";
type Sekme = "genel" | "rezervasyon" | "doluluk" | "musteri" | "iptal" | "kanal" | "bekleme" | "sube";

const SEKMELER: { k: Sekme; l: string }[] = [
  { k: "genel", l: "Genel Bakış" },
  { k: "rezervasyon", l: "Rezervasyonlar" },
  { k: "doluluk", l: "Doluluk & Masalar" },
  { k: "musteri", l: "Müşteriler" },
  { k: "iptal", l: "İptal & Gelmedi" },
  { k: "kanal", l: "Kanallar" },
  { k: "bekleme", l: "Bekleme & Walk-in" },
  { k: "sube", l: "Şubeler" },
];

// page.tsx'teki ILETISIM_KANALI_ADI ile aynı — ayrı modül olduğu için burada tekrar tanımlı.
const ILETISIM_KANALI_ADI: Record<string, string> = {
  telefon: "Telefon", whatsapp: "WhatsApp", instagram: "Instagram", google: "Google",
  web_sitesi: "Web sitesi", yuz_yuze: "Yüz yüze", online: "Online", diger: "Diğer",
};

// Takvim günü (YYYY-MM-DD) aritmetiği — Türkiye 2016'dan beri yaz saati uygulamadığı için
// UTC-tabanlı gün ekleme/çıkarma gerçek Europe/Istanbul takvimiyle her zaman örtüşür.
const parseGun = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmtGun = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const gunEkle = (s: string, delta: number) => { const d = parseGun(s); d.setUTCDate(d.getUTCDate() + delta); return fmtGun(d); };
const bugunIstanbul = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
// Bir takvim günü aralığını ([baslangicGun, bitisGunHaric)) ISO zaman damgasına çevirir.
const gunAraligiIso = (baslangicGun: string, bitisGunHaric: string) => ({
  start: new Date(`${baslangicGun}T00:00:00+03:00`).toISOString(),
  end: new Date(`${bitisGunHaric}T00:00:00+03:00`).toISOString(),
});
const tarihGoster = (s: string) => new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "short" }).format(new Date(`${s}T12:00:00+03:00`));

export default function IstatistiklerPage() {
  const router = useRouter();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Alt nav mobilde sabit — içerik onun altında kalmasın diye boşluk bırakılıyor
  // (Gökhan, 2026-08-08: "sayfalarda navın altında bir şeylerin kalmadığından emin ol").
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const [donem, setDonem] = useState<Donem>("ay");
  const [ozelBaslangic, setOzelBaslangic] = useState(bugunIstanbul());
  const [ozelBitis, setOzelBitis] = useState(bugunIstanbul());
  const [sekme, setSekme] = useState<Sekme>("genel");

  useEffect(() => {
    let active = true;
    getMyReservationRestaurantId().then((id) => {
      if (!active) return;
      if (!id) { router.replace("/rezervasyon/giris"); return; }
      setRestaurantId(id);
    });
    return () => { active = false; };
  }, [router]);

  // Seçili döneme göre [baslangicGun, bitisGunHaric) — ve aynı uzunlukta hemen ÖNCEKİ dönem.
  const donemGunleri = (): { baslangicGun: string; bitisGunHaric: string } => {
    const bugun = bugunIstanbul();
    if (donem === "bugun") return { baslangicGun: bugun, bitisGunHaric: gunEkle(bugun, 1) };
    if (donem === "dun") return { baslangicGun: gunEkle(bugun, -1), bitisGunHaric: bugun };
    if (donem === "hafta") {
      const haftaGunu = (parseGun(bugun).getUTCDay() + 6) % 7; // Pazartesi=0
      return { baslangicGun: gunEkle(bugun, -haftaGunu), bitisGunHaric: gunEkle(bugun, 1) };
    }
    if (donem === "ay") {
      const [y, m] = bugun.split("-");
      return { baslangicGun: `${y}-${m}-01`, bitisGunHaric: gunEkle(bugun, 1) };
    }
    if (donem === "gecen_ay") {
      const [y, m] = bugun.split("-").map(Number);
      const oncekiAyBaslangic = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, "0")}-01`;
      return { baslangicGun: oncekiAyBaslangic, bitisGunHaric: `${y}-${String(m).padStart(2, "0")}-01` };
    }
    // özel
    const [bas, bit] = ozelBaslangic <= ozelBitis ? [ozelBaslangic, ozelBitis] : [ozelBitis, ozelBaslangic];
    return { baslangicGun: bas, bitisGunHaric: gunEkle(bit, 1) };
  };

  const { baslangicGun, bitisGunHaric } = donemGunleri();
  const uzunlukGun = Math.round((parseGun(bitisGunHaric).getTime() - parseGun(baslangicGun).getTime()) / 86400000);
  const oncekiBaslangicGun = gunEkle(baslangicGun, -uzunlukGun);
  const oncekiBitisGunHaric = baslangicGun;

  const araGun = gunAraligiIso(baslangicGun, bitisGunHaric);
  const oncekiAraGun = gunAraligiIso(oncekiBaslangicGun, oncekiBitisGunHaric);

  // Rezervasyonlar sekmesindeki gün/hafta/ay özet tablosunun referans tarihi — üstteki
  // tarih filtresinin TÜRÜNDEN bağımsız, hep "bugün" (Gökhan: "varsayılan şimdiki zaman
  // olacak"). Tek istisna Özel Tarih: orada geçmişe gidilebiliyor (Gökhan: "ama filtreleyip
  // geçmişi görebilecek"). Diğer hazır filtreler (Bu Hafta/Bu Ay/Geçen Ay) o dönemin
  // BAŞLANGICINI referans alırsa (ör. ayın 1'i) o günün/haftasının verisi boş çıkabiliyordu
  // — bu yüzden onlara bağlanmıyor.
  const referansIso = donem === "ozel" ? gunAraligiIso(ozelBaslangic, ozelBaslangic).start : gunAraligiIso(bugunIstanbul(), bugunIstanbul()).start;

  if (!restaurantId) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--canvas)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 380, textAlign: "center", fontSize: 13.5, color: err ? "var(--danger)" : "var(--muted)", lineHeight: 1.6 }}>{err ?? "Yükleniyor…"}</div>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--canvas)", padding: "20px 24px", paddingBottom: isMobile ? ALT_NAV_YUKSEKLIK + 16 : 24, minHeight: "100vh", boxSizing: "border-box" }}>
      <RezervasyonUstBar restaurantId={restaurantId} sayfaBaslik="İstatistikler" />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <Link href="/rezervasyon" aria-label="Rezervasyon listesine dön" style={{ ...navBtn, textDecoration: "none" }}><ArrowLeft size={18} /></Link>
        <div style={{ flex: 1 }} />
        {/* Tarih filtresi — bütün sekmeler aynısını kullanır. */}
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {([["bugun", "Bugün"], ["dun", "Dün"], ["hafta", "Bu Hafta"], ["ay", "Bu Ay"], ["gecen_ay", "Geçen Ay"], ["ozel", "Özel Tarih"]] as [Donem, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setDonem(k)} style={donemBtnStil(donem === k)}>{l}</button>
          ))}
        </div>
      </div>

      {donem === "ozel" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <DatePicker value={ozelBaslangic} onChange={setOzelBaslangic} style={{ width: 140 }} />
          <span style={{ color: "var(--muted)" }}>–</span>
          <DatePicker value={ozelBitis} onChange={setOzelBitis} style={{ width: 140 }} />
        </div>
      )}

      <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginBottom: 14 }}>
        {tarihGoster(baslangicGun)} – {tarihGoster(gunEkle(bitisGunHaric, -1))}
        <span style={{ marginLeft: 8 }}>· önceki dönem: {tarihGoster(oncekiBaslangicGun)} – {tarihGoster(gunEkle(oncekiBitisGunHaric, -1))}</span>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 18, borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
        {SEKMELER.map((s) => (
          <button key={s.k} onClick={() => setSekme(s.k)} style={sekmeBtnStil(sekme === s.k)}>{s.l}</button>
        ))}
      </div>

      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{err}</div>}

      {sekme === "genel" && <GenelBakis restaurantId={restaurantId} baslangic={araGun.start} bitis={araGun.end} oncekiBaslangic={oncekiAraGun.start} oncekiBitis={oncekiAraGun.end} setErr={setErr} />}
      {sekme === "rezervasyon" && <Rezervasyonlar restaurantId={restaurantId} baslangic={araGun.start} bitis={araGun.end} referansIso={referansIso} setErr={setErr} />}
      {sekme === "doluluk" && <DolulukMasalar restaurantId={restaurantId} baslangic={araGun.start} bitis={araGun.end} setErr={setErr} />}
      {sekme === "musteri" && <Musteriler restaurantId={restaurantId} baslangic={araGun.start} bitis={araGun.end} setErr={setErr} />}
      {sekme === "iptal" && <IptalGelmedi restaurantId={restaurantId} baslangic={araGun.start} bitis={araGun.end} setErr={setErr} />}
      {sekme === "kanal" && <Kanallar restaurantId={restaurantId} baslangic={araGun.start} bitis={araGun.end} setErr={setErr} />}
      {sekme === "bekleme" && <BeklemeWalkin restaurantId={restaurantId} baslangic={araGun.start} bitis={araGun.end} setErr={setErr} />}
      {sekme === "sube" && <Subeler baslangic={araGun.start} bitis={araGun.end} setErr={setErr} />}
      {!["genel", "rezervasyon", "doluluk", "musteri", "iptal", "kanal", "bekleme", "sube"].includes(sekme) && <Yakinda baslik={SEKMELER.find((s) => s.k === sekme)!.l} />}
      <RezervasyonAltNav />
    </div>
  );
}

function Yakinda({ baslik }: { baslik: string }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 32, textAlign: "center", color: "var(--muted)", fontSize: 13.5 }}>
      {baslik} yakında.
    </div>
  );
}

type GenelOzet = {
  toplamRezervasyon: number; toplamMisafir: number;
  gelenRezervasyon: number; gelenMisafir: number;
  iptalSayisi: number; gelmediSayisi: number; walkinSayisi: number;
  ortalamaKisi: number | null; dolulukOrani: number | null;
  yeniMusteriSayisi: number; tekrarOrani: number | null;
  oncekiToplamRezervasyon: number; oncekiToplamMisafir: number;
};

function GenelBakis({
  restaurantId, baslangic, bitis, oncekiBaslangic, oncekiBitis, setErr,
}: { restaurantId: string; baslangic: string; bitis: string; oncekiBaslangic: string; oncekiBitis: string; setErr: (e: string | null) => void }) {
  const [ozet, setOzet] = useState<GenelOzet | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);

  const yukle = useCallback(async () => {
    setYukleniyor(true);
    const { data, error } = await supabase.rpc("istatistik_genel_ozet", {
      p_restaurant: restaurantId, p_baslangic: baslangic, p_bitis: bitis,
      p_onceki_baslangic: oncekiBaslangic, p_onceki_bitis: oncekiBitis,
    });
    setYukleniyor(false);
    if (error) { setErr(error.message); return; }
    const row = (data as {
      toplam_rezervasyon: number; toplam_misafir: number; gelen_rezervasyon: number; gelen_misafir: number;
      iptal_sayisi: number; gelmedi_sayisi: number; walkin_sayisi: number; ortalama_kisi: number | null;
      doluluk_orani: number | null; yeni_musteri_sayisi: number; tekrar_orani: number | null;
      onceki_toplam_rezervasyon: number; onceki_toplam_misafir: number;
    }[] | null)?.[0];
    if (!row) { setOzet(null); return; }
    setOzet({
      toplamRezervasyon: row.toplam_rezervasyon, toplamMisafir: row.toplam_misafir,
      gelenRezervasyon: row.gelen_rezervasyon, gelenMisafir: row.gelen_misafir,
      iptalSayisi: row.iptal_sayisi, gelmediSayisi: row.gelmedi_sayisi, walkinSayisi: row.walkin_sayisi,
      ortalamaKisi: row.ortalama_kisi === null ? null : Number(row.ortalama_kisi),
      dolulukOrani: row.doluluk_orani === null ? null : Number(row.doluluk_orani),
      yeniMusteriSayisi: row.yeni_musteri_sayisi,
      tekrarOrani: row.tekrar_orani === null ? null : Number(row.tekrar_orani),
      oncekiToplamRezervasyon: row.onceki_toplam_rezervasyon, oncekiToplamMisafir: row.onceki_toplam_misafir,
    });
  }, [restaurantId, baslangic, bitis, oncekiBaslangic, oncekiBitis, setErr]);

  useEffect(() => { yukle(); }, [yukle]);

  if (yukleniyor && !ozet) return <div style={{ color: "var(--muted)", fontSize: 13 }}>Yükleniyor…</div>;
  if (!ozet) return null;

  const misafirFark = ozet.oncekiToplamMisafir > 0
    ? Math.round(((ozet.toplamMisafir - ozet.oncekiToplamMisafir) / ozet.oncekiToplamMisafir) * 1000) / 10
    : null;
  const rezFark = ozet.oncekiToplamRezervasyon > 0
    ? Math.round(((ozet.toplamRezervasyon - ozet.oncekiToplamRezervasyon) / ozet.oncekiToplamRezervasyon) * 1000) / 10
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        <Kutu baslik="Toplam rezervasyon" deger={String(ozet.toplamRezervasyon)} fark={rezFark} />
        <Kutu baslik="Toplam misafir" deger={String(ozet.toplamMisafir)} fark={misafirFark} />
        <Kutu baslik="Gelen rezervasyon" deger={String(ozet.gelenRezervasyon)} />
        <Kutu baslik="Gelen misafir" deger={String(ozet.gelenMisafir)} />
        <Kutu baslik="İptal edilen" deger={String(ozet.iptalSayisi)} />
        <Kutu baslik="Gelmedi" deger={String(ozet.gelmediSayisi)} />
        <Kutu baslik="Walk-in" deger={String(ozet.walkinSayisi)} />
        <Kutu baslik="Ort. rezervasyon kişi" deger={ozet.ortalamaKisi !== null ? String(ozet.ortalamaKisi) : "—"} />
        <Kutu baslik="Doluluk oranı" deger={ozet.dolulukOrani !== null ? `%${ozet.dolulukOrani}` : "—"} />
        <Kutu baslik="Yeni müşteri" deger={String(ozet.yeniMusteriSayisi)} />
        <Kutu baslik="Tekrar gelen oranı" deger={ozet.tekrarOrani !== null ? `%${ozet.tekrarOrani}` : "—"} />
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted-2)" }}>
        Önceki dönem: <span className="tnum">{ozet.oncekiToplamRezervasyon}</span> rezervasyon, <span className="tnum">{ozet.oncekiToplamMisafir}</span> misafir.
      </div>
    </div>
  );
}

function Kutu({ baslik, deger, fark }: { baslik: string; deger: string; fark?: number | null }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 600 }}>{baslik}</div>
      <div className="tnum" style={{ fontSize: 22, fontWeight: 700, color: "var(--ink-green)" }}>{deger}</div>
      {fark !== undefined && fark !== null && (
        <div className="tnum" style={{ fontSize: 12, fontWeight: 600, color: fark >= 0 ? "var(--brand)" : "var(--danger)" }}>
          {fark >= 0 ? "+" : ""}{fark}%
        </div>
      )}
    </div>
  );
}

const GUN_ADI_KISA = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const GUN_ADI_UZUN = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];

type RezOzet = {
  gunlukDagilim: { gun: string; rezervasyon: number; misafir: number }[];
  saatlikDagilim: { saat: number; rezervasyon: number }[];
  haftaninGunuDagilim: { gun_no: number; rezervasyon: number }[];
  ortalamaOncedenGun: number | null; ayniGunOrani: number | null;
  grup12: number; grup34: number; grup56: number; grup7Plus: number;
};

function Rezervasyonlar({ restaurantId, baslangic, bitis, referansIso, setErr }: { restaurantId: string; baslangic: string; bitis: string; referansIso: string; setErr: (e: string | null) => void }) {
  const [ozet, setOzet] = useState<RezOzet | null>(null);

  const yukle = useCallback(async () => {
    const { data, error } = await supabase.rpc("istatistik_rezervasyon", { p_restaurant: restaurantId, p_baslangic: baslangic, p_bitis: bitis });
    if (error) { setErr(error.message); return; }
    const row = (data as {
      gunluk_dagilim: { gun: string; rezervasyon: number; misafir: number }[];
      saatlik_dagilim: { saat: number; rezervasyon: number }[];
      haftanin_gunu_dagilim: { gun_no: number; rezervasyon: number }[];
      ortalama_onceden_gun: number | null; ayni_gun_orani: number | null;
      grup_1_2: number; grup_3_4: number; grup_5_6: number; grup_7_plus: number;
    }[] | null)?.[0];
    if (!row) { setOzet(null); return; }
    setOzet({
      gunlukDagilim: row.gunluk_dagilim ?? [], saatlikDagilim: row.saatlik_dagilim ?? [], haftaninGunuDagilim: row.haftanin_gunu_dagilim ?? [],
      ortalamaOncedenGun: row.ortalama_onceden_gun === null ? null : Number(row.ortalama_onceden_gun),
      ayniGunOrani: row.ayni_gun_orani === null ? null : Number(row.ayni_gun_orani),
      grup12: row.grup_1_2, grup34: row.grup_3_4, grup56: row.grup_5_6, grup7Plus: row.grup_7_plus,
    });
  }, [restaurantId, baslangic, bitis, setErr]);

  useEffect(() => { yukle(); }, [yukle]);

  if (!ozet) return <div style={{ color: "var(--muted)", fontSize: 13 }}>Yükleniyor…</div>;

  const saatMap = new Map(ozet.saatlikDagilim.map((s) => [s.saat, s.rezervasyon]));
  const saatVeri = Array.from({ length: 24 }, (_, saat) => ({ label: String(saat), value: saatMap.get(saat) ?? 0 }));
  const gunMap = new Map(ozet.haftaninGunuDagilim.map((g) => [g.gun_no, g.rezervasyon]));
  const haftaVeri = GUN_ADI_KISA.map((l, i) => ({ label: l, value: gunMap.get(i) ?? 0 }));
  const enYogunGun = haftaVeri.reduce((en, g) => (g.value > en.value ? g : en), haftaVeri[0]);
  const enYogunSaat = saatVeri.reduce((en, s) => (s.value > en.value ? s : en), saatVeri[0]);
  const toplamGrup = ozet.grup12 + ozet.grup34 + ozet.grup56 + ozet.grup7Plus;
  const grupYuzde = (n: number) => (toplamGrup > 0 ? Math.round((n / toplamGrup) * 100) : 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <RezervasyonOzetSatiri restaurantId={restaurantId} referans={referansIso} setErr={setErr} />
      {toplamGrup > 0 && (
        <div style={{ fontSize: 13, color: "var(--ink)", background: "var(--recede)", borderRadius: 12, padding: "10px 14px" }}>
          En yoğun gününüz <b>{GUN_ADI_UZUN[haftaVeri.indexOf(enYogunGun)]}</b>. En yoğun rezervasyon saatiniz <b className="tnum">{enYogunSaat.label}:00</b> civarı.
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        <Kutu baslik="Ort. kaç gün önceden" deger={ozet.ortalamaOncedenGun !== null ? `${ozet.ortalamaOncedenGun} gün` : "—"} />
        <Kutu baslik="Aynı gün rezervasyon oranı" deger={ozet.ayniGunOrani !== null ? `%${ozet.ayniGunOrani}` : "—"} />
      </div>

      <div>
        <SekmeBaslik baslik="Haftanın günlerine göre rezervasyon" />
        <BarGrafik veri={haftaVeri} />
      </div>
      <div>
        <SekmeBaslik baslik="Saate göre rezervasyon" />
        <BarGrafik veri={saatVeri} kucukEtiket />
      </div>
      {ozet.gunlukDagilim.length > 0 && (
        <div>
          <SekmeBaslik baslik="Güne göre rezervasyon" />
          <BarGrafik veri={ozet.gunlukDagilim.map((g) => ({ label: tarihGoster(g.gun), value: g.rezervasyon }))} kucukEtiket />
        </div>
      )}

      <div>
        <SekmeBaslik baslik="Grup büyüklüğü dağılımı" />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <GrupCubugu etiket="1–2 kişi" adet={ozet.grup12} yuzde={grupYuzde(ozet.grup12)} />
          <GrupCubugu etiket="3–4 kişi" adet={ozet.grup34} yuzde={grupYuzde(ozet.grup34)} />
          <GrupCubugu etiket="5–6 kişi" adet={ozet.grup56} yuzde={grupYuzde(ozet.grup56)} />
          <GrupCubugu etiket="7+ kişi (büyük grup)" adet={ozet.grup7Plus} yuzde={grupYuzde(ozet.grup7Plus)} />
        </div>
      </div>
    </div>
  );
}

// Rezervasyonlar sekmesinin en üstündeki özet tablo — seçili tarih filtresinin başlangıcını
// referans alır (Gökhan: "varsayılan şimdiki zaman ama filtreleyip geçmişi görebilecek"),
// o günü/haftayı/ayı gösterir. Sıra Gökhan'ın belirlediği gibi: Rezervasyonlar (toplam),
// Geldi, Gelmedi, İptal, Bekleyen.
const OZET_KATEGORILERI: { k: string; l: string }[] = [
  { k: "toplam", l: "Rezervasyonlar" },
  { k: "geldi", l: "Geldi" },
  { k: "gelmedi", l: "Gelmedi" },
  { k: "iptal", l: "İptal" },
  { k: "bekleyen", l: "Bekleyen" },
];

type GunKarsSatir = { gun: string; toplam: number; geldi: number; gelmedi: number; iptal: number; bekleyen: number };

// Tek tablo: Gün/Hafta/Ay sütunlarının yanına, seçili haftanın günlerine göre (Gökhan:
// "cuma cumartesiyi seçip ikisini de değerlendirebilsin") son 10 günü de aynı satırlara
// sütun olarak ekliyoruz — ayrı bir liste değil, aynı kutuların devamı (Gökhan: "ayrı bir
// liste yapmayacaktık yukarıdaki kutulara ekleyecektik").
function RezervasyonOzetSatiri({ restaurantId, referans, setErr }: { restaurantId: string; referans: string; setErr: (e: string | null) => void }) {
  const [satirlar, setSatirlar] = useState<Record<string, { gunluk: number; haftalik: number; aylik: number }> | null>(null);
  const [seciliGunler, setSeciliGunler] = useState<Set<number>>(new Set([0, 1, 2, 3, 4, 5, 6]));
  const [karsSatirlar, setKarsSatirlar] = useState<GunKarsSatir[] | null>(null);

  const yukle = useCallback(async () => {
    const { data, error } = await supabase.rpc("istatistik_rezervasyon_ozet_satirlari", { p_restaurant: restaurantId, p_referans: referans });
    if (error) { setErr(error.message); return; }
    const rows = (data as { kategori: string; gunluk: number; haftalik: number; aylik: number }[] | null) ?? [];
    setSatirlar(Object.fromEntries(rows.map((r) => [r.kategori, { gunluk: r.gunluk, haftalik: r.haftalik, aylik: r.aylik }])));
  }, [restaurantId, referans, setErr]);

  useEffect(() => { yukle(); }, [yukle]);

  const gunToggle = (g: number) => setSeciliGunler((s) => {
    const next = new Set(s);
    if (next.has(g)) next.delete(g); else next.add(g);
    return next;
  });

  const yukleKars = useCallback(async () => {
    if (seciliGunler.size === 0) { setKarsSatirlar([]); return; }
    const hedefGunler: string[] = [];
    let g = bugunIstanbul();
    let guard = 0;
    while (hedefGunler.length < 10 && guard < 400) {
      const haftaGunu = (parseGun(g).getUTCDay() + 6) % 7;
      if (seciliGunler.has(haftaGunu)) hedefGunler.push(g);
      g = gunEkle(g, -1);
      guard++;
    }
    hedefGunler.reverse();
    const { data, error } = await supabase.rpc("istatistik_rezervasyon_gun_karsilastirma", { p_restaurant: restaurantId, p_gunler: hedefGunler });
    if (error) { setErr(error.message); return; }
    const rows = (data as GunKarsSatir[] | null) ?? [];
    const gorePucu = new Map(rows.map((r) => [r.gun, r]));
    setKarsSatirlar(hedefGunler.map((gun) => gorePucu.get(gun) ?? { gun, toplam: 0, geldi: 0, gelmedi: 0, iptal: 0, bekleyen: 0 }));
  }, [restaurantId, seciliGunler, setErr]);

  useEffect(() => { yukleKars(); }, [yukleKars]);

  if (!satirlar) return null;

  const ortalama = (vals: number[]) => (vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : 0);
  const yon = (vals: number[]) => {
    if (vals.length < 4) return "—";
    const yari = Math.floor(vals.length / 2);
    const ilkYari = ortalama(vals.slice(0, yari));
    const sonYari = ortalama(vals.slice(vals.length - yari));
    if (sonYari > ilkYari * 1.05) return "↑";
    if (sonYari < ilkYari * 0.95) return "↓";
    return "→";
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Gün karşılaştır:</span>
        <div style={{ display: "flex", gap: 5 }}>
          {GUN_ADI_KISA.map((l, i) => (
            <button key={i} onClick={() => gunToggle(i)} style={{
              border: "1px solid var(--line-2)", borderRadius: 8, padding: "5px 9px", fontSize: 11.5, cursor: "pointer",
              background: seciliGunler.has(i) ? "var(--brand-strong)" : "var(--card)",
              color: seciliGunler.has(i) ? "#fff" : "var(--muted)",
            }}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {/* ListRow'un kendi "overflow:hidden"ı (bkz. app/components/ListRow.tsx) satırı kendi
          kutusunun genişliğinde kırpıyor — çok sütunlu bu tabloda başlık kayarken satırlardaki
          rakamlar görünmez oluyordu (Gökhan: "rezervasyon sayıları tarihlerin altında değil").
          İç kutuyu içeriğin gerçek genişliğine sabitleyip (width: max-content) kaydırmayı DIŞ
          kutuya bırakınca satırın kendisi hiç taşmıyor, kırpılacak bir şey kalmıyor. */}
      <div style={{ overflowX: "auto" }}>
      <div style={{ width: "max-content", minWidth: "100%" }}>
        <ListHeader>
          <HeaderCell flex>{null}</HeaderCell>
          <HeaderSep />
          <HeaderCell width={90} align="center">Gün</HeaderCell>
          <HeaderSep />
          <HeaderCell width={90} align="center">Hafta</HeaderCell>
          <HeaderSep />
          <HeaderCell width={90} align="center">Ay</HeaderCell>
          {(karsSatirlar ?? []).map((s) => (
            <HeaderCell key={s.gun} width={70} align="center">{tarihGoster(s.gun)}</HeaderCell>
          ))}
          {karsSatirlar && karsSatirlar.length > 0 && (
            <>
              <HeaderSep />
              <HeaderCell width={56} align="center">Ort.</HeaderCell>
              <HeaderSep />
              <HeaderCell width={44} align="center">Yön</HeaderCell>
            </>
          )}
        </ListHeader>
        {OZET_KATEGORILERI.map(({ k, l }) => {
          const s = satirlar[k] ?? { gunluk: 0, haftalik: 0, aylik: 0 };
          const karsVals = (karsSatirlar ?? []).map((r) => r[k as keyof GunKarsSatir] as number);
          return (
            <ListRow key={k} bg="var(--card)">
              <Cell flex marginLeft="1cm"><span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{l}</span></Cell>
              <RowSep />
              <Cell width={90} align="center"><span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)" }}>{s.gunluk}</span></Cell>
              <RowSep />
              <Cell width={90} align="center"><span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)" }}>{s.haftalik}</span></Cell>
              <RowSep />
              <Cell width={90} align="center"><span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)" }}>{s.aylik}</span></Cell>
              {(karsSatirlar ?? []).map((r, i) => (
                <Cell key={r.gun} width={70} align="center"><span className="tnum" style={{ fontSize: 13, color: "var(--ink)" }}>{karsVals[i]}</span></Cell>
              ))}
              {karsSatirlar && karsSatirlar.length > 0 && (
                <>
                  <RowSep />
                  <Cell width={56} align="center"><span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)" }}>{ortalama(karsVals)}</span></Cell>
                  <RowSep />
                  <Cell width={44} align="center"><span style={{ fontSize: 13 }}>{yon(karsVals)}</span></Cell>
                </>
              )}
            </ListRow>
          );
        })}
      </div>
      </div>
    </div>
  );
}

function SekmeBaslik({ baslik }: { baslik: string }) {
  return <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)", marginBottom: 8 }}>{baslik}</div>;
}

function GrupCubugu({ etiket, adet, yuzde }: { etiket: string; adet: number; yuzde: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 130, fontSize: 12.5, color: "var(--ink)", flexShrink: 0 }}>{etiket}</span>
      <div style={{ flex: 1, height: 10, background: "var(--recede)", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ width: `${yuzde}%`, height: "100%", background: "var(--brand-strong)", borderRadius: 6 }} />
      </div>
      <span className="tnum" style={{ width: 70, fontSize: 12, color: "var(--muted)", textAlign: "right", flexShrink: 0 }}>{adet} (%{yuzde})</span>
    </div>
  );
}

// Basit dikey çubuk grafik — dış kütüphane yok, bu uygulamanın hafif stiline uygun.
function BarGrafik({ veri, kucukEtiket }: { veri: { label: string; value: number }[]; kucukEtiket?: boolean }) {
  const maks = Math.max(1, ...veri.map((v) => v.value));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: kucukEtiket ? 2 : 6, height: 120, overflowX: "auto", paddingBottom: 4 }}>
      {veri.map((v, i) => (
        <div key={i} title={`${v.label}: ${v.value}`} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0, minWidth: kucukEtiket ? 14 : 22 }}>
          <div className="tnum" style={{ fontSize: 9.5, color: "var(--muted-2)", visibility: v.value > 0 ? "visible" : "hidden" }}>{v.value}</div>
          <div style={{
            width: kucukEtiket ? 10 : 18, height: Math.max(2, (v.value / maks) * 88), background: v.value > 0 ? "var(--brand-strong)" : "var(--line-2)", borderRadius: 3,
          }} />
          <div style={{ fontSize: kucukEtiket ? 9 : 10.5, color: "var(--muted-2)", whiteSpace: "nowrap" }}>{v.label}</div>
        </div>
      ))}
    </div>
  );
}

type MasaOzet = {
  masaPerformans: { id: string; ad: string; kapasite: number; kullanim: number; toplam_oturan: number; ortalama_kisi: number | null; ortalama_dakika: number | null }[];
  salonPerformans: { salon: string; kullanim: number; misafir: number; ortalama_dakika: number | null }[];
  isiHaritasi: { gun_no: number; saat: number; adet: number }[];
  kalis2: number | null; kalis34: number | null; kalis5Plus: number | null;
  kaybedilenIptalKisi: number; kaybedilenGelmediKisi: number;
};

function DolulukMasalar({ restaurantId, baslangic, bitis, setErr }: { restaurantId: string; baslangic: string; bitis: string; setErr: (e: string | null) => void }) {
  const [ozet, setOzet] = useState<MasaOzet | null>(null);

  const yukle = useCallback(async () => {
    const { data, error } = await supabase.rpc("istatistik_masa", { p_restaurant: restaurantId, p_baslangic: baslangic, p_bitis: bitis });
    if (error) { setErr(error.message); return; }
    const row = (data as {
      masa_performans: MasaOzet["masaPerformans"]; salon_performans: MasaOzet["salonPerformans"]; isi_haritasi: MasaOzet["isiHaritasi"];
      kalis_2: number | null; kalis_3_4: number | null; kalis_5_plus: number | null;
      kaybedilen_iptal_kisi: number; kaybedilen_gelmedi_kisi: number;
    }[] | null)?.[0];
    if (!row) { setOzet(null); return; }
    setOzet({
      masaPerformans: row.masa_performans ?? [], salonPerformans: row.salon_performans ?? [], isiHaritasi: row.isi_haritasi ?? [],
      kalis2: row.kalis_2 === null ? null : Number(row.kalis_2),
      kalis34: row.kalis_3_4 === null ? null : Number(row.kalis_3_4),
      kalis5Plus: row.kalis_5_plus === null ? null : Number(row.kalis_5_plus),
      kaybedilenIptalKisi: row.kaybedilen_iptal_kisi, kaybedilenGelmediKisi: row.kaybedilen_gelmedi_kisi,
    });
  }, [restaurantId, baslangic, bitis, setErr]);

  useEffect(() => { yukle(); }, [yukle]);

  if (!ozet) return <div style={{ color: "var(--muted)", fontSize: 13 }}>Yükleniyor…</div>;

  const enCok = ozet.masaPerformans.length > 0 ? ozet.masaPerformans[0] : null;
  const enAz = ozet.masaPerformans.length > 0 ? [...ozet.masaPerformans].sort((a, b) => a.kullanim - b.kullanim)[0] : null;
  const isiMap = new Map(ozet.isiHaritasi.map((h) => [`${h.gun_no}-${h.saat}`, h.adet]));
  const isiMaks = Math.max(1, ...ozet.isiHaritasi.map((h) => h.adet));
  const saatler = Array.from({ length: 24 }, (_, i) => i).filter((s) => ozet.isiHaritasi.some((h) => h.saat === s));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        <Kutu baslik="2 kişilik ort. kalış" deger={ozet.kalis2 !== null ? `${ozet.kalis2} dk` : "—"} />
        <Kutu baslik="3–4 kişilik ort. kalış" deger={ozet.kalis34 !== null ? `${ozet.kalis34} dk` : "—"} />
        <Kutu baslik="5+ kişilik ort. kalış" deger={ozet.kalis5Plus !== null ? `${ozet.kalis5Plus} dk` : "—"} />
        <Kutu baslik="İptalle kaybedilen kişi" deger={String(ozet.kaybedilenIptalKisi)} />
        <Kutu baslik="Gelmedi ile kaybedilen kişi" deger={String(ozet.kaybedilenGelmediKisi)} />
      </div>

      {enCok && enCok.kullanim > 0 && (
        <div style={{ fontSize: 13, color: "var(--ink)", background: "var(--recede)", borderRadius: 12, padding: "10px 14px" }}>
          En çok kullanılan masa <b>{enCok.ad}</b> (<span className="tnum">{enCok.kullanim}</span> kez).
          {enAz && enAz.kullanim === 0 && <> Hiç kullanılmayan masa(lar) var.</>}
        </div>
      )}

      {ozet.salonPerformans.length > 1 && (
        <div>
          <SekmeBaslik baslik="Salon / bölüm performansı" />
          <Tablo
            basliklar={["Salon", "Kullanım", "Misafir", "Ort. dakika"]}
            satirlar={ozet.salonPerformans.map((s) => [s.salon, String(s.kullanim), String(s.misafir), s.ortalama_dakika !== null ? String(s.ortalama_dakika) : "—"])}
          />
        </div>
      )}

      <div>
        <SekmeBaslik baslik="Masa performansı" />
        <Tablo
          basliklar={["Masa", "Kapasite", "Kullanım", "Toplam oturan", "Ort. kişi", "Ort. dakika"]}
          satirlar={ozet.masaPerformans.map((m) => [
            m.ad, String(m.kapasite), String(m.kullanim), String(m.toplam_oturan),
            m.ortalama_kisi !== null ? String(m.ortalama_kisi) : "—", m.ortalama_dakika !== null ? String(m.ortalama_dakika) : "—",
          ])}
          vurguSatir={(i) => ozet.masaPerformans[i].kullanim === 0}
        />
      </div>

      {ozet.isiHaritasi.length > 0 && (
        <div>
          <SekmeBaslik baslik="Gün × saat yoğunluk" />
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", fontSize: 10.5 }}>
              <thead>
                <tr>
                  <th style={{ padding: 3 }} />
                  {saatler.map((s) => <th key={s} className="tnum" style={{ padding: 3, color: "var(--muted-2)", fontWeight: 500 }}>{s}</th>)}
                </tr>
              </thead>
              <tbody>
                {GUN_ADI_KISA.map((gAd, gNo) => (
                  <tr key={gNo}>
                    <td style={{ padding: 3, color: "var(--ink)", fontWeight: 600 }}>{gAd}</td>
                    {saatler.map((s) => {
                      const adet = isiMap.get(`${gNo}-${s}`) ?? 0;
                      const yogunluk = adet / isiMaks;
                      return (
                        <td key={s} title={`${adet}`} style={{ padding: 0 }}>
                          <div className="tnum" style={{
                            width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center",
                            background: adet === 0 ? "var(--recede)" : `rgba(60,120,80,${0.15 + yogunluk * 0.75})`,
                            color: yogunluk > 0.6 ? "#fff" : "var(--ink)", fontSize: 9.5, borderRadius: 4,
                          }}>
                            {adet > 0 ? adet : ""}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Tablo({ basliklar, satirlar, vurguSatir }: { basliklar: string[]; satirlar: string[][]; vurguSatir?: (i: number) => boolean }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--line)", borderRadius: 12 }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
        <thead>
          <tr style={{ background: "var(--recede)" }}>
            {basliklar.map((b, i) => <th key={i} style={{ textAlign: i === 0 ? "left" : "right", padding: "8px 12px", color: "var(--muted)", fontWeight: 600, fontSize: 11 }}>{b}</th>)}
          </tr>
        </thead>
        <tbody>
          {satirlar.map((satir, i) => (
            <tr key={i} style={{ borderTop: "1px solid var(--line)", color: vurguSatir?.(i) ? "var(--muted-2)" : "var(--ink)" }}>
              {satir.map((h, j) => <td key={j} className={j > 0 ? "tnum" : undefined} style={{ textAlign: j === 0 ? "left" : "right", padding: "7px 12px" }}>{h}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type MusteriOzet = {
  toplamKayitliMusteri: number; vipSayisi: number;
  donemMusteriSayisi: number; yeniMusteriSayisi: number; uzunSuredirGelmeyenSayisi: number;
  ortalamaZiyaretSikligiGun: number | null; ortalamaZiyaretSayisi: number | null; musteriBasinaRezervasyon: number | null;
  ilkKez: number; ikinciKez: number; ucBes: number; altiOn: number; onPlus: number;
  enSikGelenler: { isim: string; telefon: string | null; ziyaret: number }[];
  enCokKisiGetirenler: { isim: string; telefon: string | null; kisi: number }[];
};

function Musteriler({ restaurantId, baslangic, bitis, setErr }: { restaurantId: string; baslangic: string; bitis: string; setErr: (e: string | null) => void }) {
  const [ozet, setOzet] = useState<MusteriOzet | null>(null);

  const yukle = useCallback(async () => {
    const { data, error } = await supabase.rpc("istatistik_musteri", { p_restaurant: restaurantId, p_baslangic: baslangic, p_bitis: bitis });
    if (error) { setErr(error.message); return; }
    const row = (data as {
      toplam_kayitli_musteri: number; vip_sayisi: number; donem_musteri_sayisi: number; yeni_musteri_sayisi: number;
      uzun_suredir_gelmeyen_sayisi: number; ortalama_ziyaret_sikligi_gun: number | null; ortalama_ziyaret_sayisi: number | null;
      musteri_basina_rezervasyon: number | null;
      ilk_kez: number; ikinci_kez: number; uc_bes: number; alti_on: number; on_plus: number;
      en_sik_gelenler: MusteriOzet["enSikGelenler"]; en_cok_kisi_getirenler: MusteriOzet["enCokKisiGetirenler"];
    }[] | null)?.[0];
    if (!row) { setOzet(null); return; }
    setOzet({
      toplamKayitliMusteri: row.toplam_kayitli_musteri, vipSayisi: row.vip_sayisi,
      donemMusteriSayisi: row.donem_musteri_sayisi, yeniMusteriSayisi: row.yeni_musteri_sayisi, uzunSuredirGelmeyenSayisi: row.uzun_suredir_gelmeyen_sayisi,
      ortalamaZiyaretSikligiGun: row.ortalama_ziyaret_sikligi_gun === null ? null : Number(row.ortalama_ziyaret_sikligi_gun),
      ortalamaZiyaretSayisi: row.ortalama_ziyaret_sayisi === null ? null : Number(row.ortalama_ziyaret_sayisi),
      musteriBasinaRezervasyon: row.musteri_basina_rezervasyon === null ? null : Number(row.musteri_basina_rezervasyon),
      ilkKez: row.ilk_kez, ikinciKez: row.ikinci_kez, ucBes: row.uc_bes, altiOn: row.alti_on, onPlus: row.on_plus,
      enSikGelenler: row.en_sik_gelenler ?? [], enCokKisiGetirenler: row.en_cok_kisi_getirenler ?? [],
    });
  }, [restaurantId, baslangic, bitis, setErr]);

  useEffect(() => { yukle(); }, [yukle]);

  if (!ozet) return <div style={{ color: "var(--muted)", fontSize: 13 }}>Yükleniyor…</div>;

  const toplamRetention = ozet.ilkKez + ozet.ikinciKez + ozet.ucBes + ozet.altiOn + ozet.onPlus;
  const rYuzde = (n: number) => (toplamRetention > 0 ? Math.round((n / toplamRetention) * 100) : 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        <Kutu baslik="Toplam kayıtlı müşteri" deger={String(ozet.toplamKayitliMusteri)} />
        <Kutu baslik="VIP müşteri" deger={String(ozet.vipSayisi)} />
        <Kutu baslik="Bu dönem gelen müşteri" deger={String(ozet.donemMusteriSayisi)} />
        <Kutu baslik="Yeni müşteri" deger={String(ozet.yeniMusteriSayisi)} />
        <Kutu baslik="90+ gündür gelmeyen" deger={String(ozet.uzunSuredirGelmeyenSayisi)} />
        <Kutu baslik="Ort. ziyaret sıklığı" deger={ozet.ortalamaZiyaretSikligiGun !== null ? `${ozet.ortalamaZiyaretSikligiGun} günde bir` : "—"} />
        <Kutu baslik="Ort. ziyaret sayısı" deger={ozet.ortalamaZiyaretSayisi !== null ? String(ozet.ortalamaZiyaretSayisi) : "—"} />
        <Kutu baslik="Müşteri başına rezervasyon" deger={ozet.musteriBasinaRezervasyon !== null ? String(ozet.musteriBasinaRezervasyon) : "—"} />
      </div>

      <div>
        <SekmeBaslik baslik="Geri dönüş dağılımı (bu dönemde gelenlerin toplam geçmişine göre)" />
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <GrupCubugu etiket="İlk kez gelen" adet={ozet.ilkKez} yuzde={rYuzde(ozet.ilkKez)} />
          <GrupCubugu etiket="İkinci kez gelen" adet={ozet.ikinciKez} yuzde={rYuzde(ozet.ikinciKez)} />
          <GrupCubugu etiket="3–5 ziyaret" adet={ozet.ucBes} yuzde={rYuzde(ozet.ucBes)} />
          <GrupCubugu etiket="6–10 ziyaret" adet={ozet.altiOn} yuzde={rYuzde(ozet.altiOn)} />
          <GrupCubugu etiket="10+ ziyaret (müdavim)" adet={ozet.onPlus} yuzde={rYuzde(ozet.onPlus)} />
        </div>
      </div>

      {ozet.enSikGelenler.length > 0 && (
        <div>
          <SekmeBaslik baslik="En sık gelen müşteriler" />
          <Tablo basliklar={["İsim", "Telefon", "Ziyaret"]} satirlar={ozet.enSikGelenler.map((m) => [m.isim, m.telefon ?? "—", String(m.ziyaret)])} />
        </div>
      )}
      {ozet.enCokKisiGetirenler.length > 0 && (
        <div>
          <SekmeBaslik baslik="En çok kişi getiren müşteriler" />
          <Tablo basliklar={["İsim", "Telefon", "Toplam kişi"]} satirlar={ozet.enCokKisiGetirenler.map((m) => [m.isim, m.telefon ?? "—", String(m.kisi)])} />
        </div>
      )}
    </div>
  );
}

type IptalOzet = {
  toplamRezervasyon: number;
  toplamIptal: number; iptalOrani: number | null; iptalKapasite: number;
  ortalamaIptalSaatOnce: number | null; ayniGunIptalOrani: number | null;
  iptalGunDagilimi: { gun_no: number; adet: number }[]; iptalSaatDagilimi: { saat: number; adet: number }[];
  toplamGelmedi: number; gelmediOrani: number | null; gelmediKapasite: number;
  tekrarlayanGelmediMusteri: number;
  gelmediGunDagilimi: { gun_no: number; adet: number }[]; gelmediSaatDagilimi: { saat: number; adet: number }[];
  gelmediGrupDagilimi: { grup: string; adet: number }[];
};

function IptalGelmedi({ restaurantId, baslangic, bitis, setErr }: { restaurantId: string; baslangic: string; bitis: string; setErr: (e: string | null) => void }) {
  const [ozet, setOzet] = useState<IptalOzet | null>(null);

  const yukle = useCallback(async () => {
    const { data, error } = await supabase.rpc("istatistik_iptal_gelmedi", { p_restaurant: restaurantId, p_baslangic: baslangic, p_bitis: bitis });
    if (error) { setErr(error.message); return; }
    const row = (data as {
      toplam_rezervasyon: number; toplam_iptal: number; iptal_orani: number | null; iptal_kapasite: number;
      ortalama_iptal_saat_once: number | null; ayni_gun_iptal_orani: number | null;
      iptal_gun_dagilimi: IptalOzet["iptalGunDagilimi"]; iptal_saat_dagilimi: IptalOzet["iptalSaatDagilimi"];
      toplam_gelmedi: number; gelmedi_orani: number | null; gelmedi_kapasite: number; tekrarlayan_gelmedi_musteri: number;
      gelmedi_gun_dagilimi: IptalOzet["gelmediGunDagilimi"]; gelmedi_saat_dagilimi: IptalOzet["gelmediSaatDagilimi"];
      gelmedi_grup_dagilimi: IptalOzet["gelmediGrupDagilimi"];
    }[] | null)?.[0];
    if (!row) { setOzet(null); return; }
    setOzet({
      toplamRezervasyon: row.toplam_rezervasyon,
      toplamIptal: row.toplam_iptal, iptalOrani: row.iptal_orani === null ? null : Number(row.iptal_orani), iptalKapasite: row.iptal_kapasite,
      ortalamaIptalSaatOnce: row.ortalama_iptal_saat_once === null ? null : Number(row.ortalama_iptal_saat_once),
      ayniGunIptalOrani: row.ayni_gun_iptal_orani === null ? null : Number(row.ayni_gun_iptal_orani),
      iptalGunDagilimi: row.iptal_gun_dagilimi ?? [], iptalSaatDagilimi: row.iptal_saat_dagilimi ?? [],
      toplamGelmedi: row.toplam_gelmedi, gelmediOrani: row.gelmedi_orani === null ? null : Number(row.gelmedi_orani), gelmediKapasite: row.gelmedi_kapasite,
      tekrarlayanGelmediMusteri: row.tekrarlayan_gelmedi_musteri,
      gelmediGunDagilimi: row.gelmedi_gun_dagilimi ?? [], gelmediSaatDagilimi: row.gelmedi_saat_dagilimi ?? [],
      gelmediGrupDagilimi: row.gelmedi_grup_dagilimi ?? [],
    });
  }, [restaurantId, baslangic, bitis, setErr]);

  useEffect(() => { yukle(); }, [yukle]);

  if (!ozet) return <div style={{ color: "var(--muted)", fontSize: 13 }}>Yükleniyor…</div>;

  const gunVeri = (dagilim: { gun_no: number; adet: number }[]) => {
    const m = new Map(dagilim.map((d) => [d.gun_no, d.adet]));
    return GUN_ADI_KISA.map((l, i) => ({ label: l, value: m.get(i) ?? 0 }));
  };
  const saatVeri = (dagilim: { saat: number; adet: number }[]) => {
    const m = new Map(dagilim.map((d) => [d.saat, d.adet]));
    return Array.from({ length: 24 }, (_, s) => ({ label: String(s), value: m.get(s) ?? 0 }));
  };
  const grupToplam = ozet.gelmediGrupDagilimi.reduce((s, g) => s + g.adet, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <SekmeBaslik baslik="İptal" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 14 }}>
          <Kutu baslik="Toplam iptal" deger={String(ozet.toplamIptal)} />
          <Kutu baslik="İptal oranı" deger={ozet.iptalOrani !== null ? `%${ozet.iptalOrani}` : "—"} />
          <Kutu baslik="Kaybedilen kapasite" deger={`${ozet.iptalKapasite} kişi`} />
          <Kutu baslik="Ort. kaç saat önce iptal" deger={ozet.ortalamaIptalSaatOnce !== null ? `${ozet.ortalamaIptalSaatOnce} sa` : "—"} />
          <Kutu baslik="Aynı gün iptal oranı" deger={ozet.ayniGunIptalOrani !== null ? `%${ozet.ayniGunIptalOrani}` : "—"} />
        </div>
        {ozet.toplamIptal > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div><div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Güne göre iptal</div><BarGrafik veri={gunVeri(ozet.iptalGunDagilimi)} /></div>
            <div><div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Saate göre iptal</div><BarGrafik veri={saatVeri(ozet.iptalSaatDagilimi)} kucukEtiket /></div>
          </div>
        )}
      </div>

      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 20 }}>
        <SekmeBaslik baslik="Gelmedi" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 14 }}>
          <Kutu baslik="Toplam gelmedi" deger={String(ozet.toplamGelmedi)} />
          <Kutu baslik="Gelmedi oranı" deger={ozet.gelmediOrani !== null ? `%${ozet.gelmediOrani}` : "—"} />
          <Kutu baslik="Kaybedilen kapasite" deger={`${ozet.gelmediKapasite} kişi`} />
          <Kutu baslik="Tekrarlayan gelmedi müşteri" deger={String(ozet.tekrarlayanGelmediMusteri)} />
        </div>
        {ozet.toplamGelmedi > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div><div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Güne göre gelmedi</div><BarGrafik veri={gunVeri(ozet.gelmediGunDagilimi)} /></div>
            <div><div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Saate göre gelmedi</div><BarGrafik veri={saatVeri(ozet.gelmediSaatDagilimi)} kucukEtiket /></div>
            {grupToplam > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 320 }}>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>Grup büyüklüğüne göre gelmedi</div>
                {ozet.gelmediGrupDagilimi.map((g) => (
                  <GrupCubugu key={g.grup} etiket={`${g.grup} kişi`} adet={g.adet} yuzde={Math.round((g.adet / grupToplam) * 100)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

type KanalSatir = { kanal: string; rezervasyon: number; misafir: number; geldi: number; iptal: number; gelmedi: number; gerceklesen_orani: number | null };

function Kanallar({ restaurantId, baslangic, bitis, setErr }: { restaurantId: string; baslangic: string; bitis: string; setErr: (e: string | null) => void }) {
  const [satirlar, setSatirlar] = useState<KanalSatir[] | null>(null);

  const yukle = useCallback(async () => {
    const { data, error } = await supabase.rpc("istatistik_kanal", { p_restaurant: restaurantId, p_baslangic: baslangic, p_bitis: bitis });
    if (error) { setErr(error.message); return; }
    setSatirlar((data as KanalSatir[] | null) ?? []);
  }, [restaurantId, baslangic, bitis, setErr]);

  useEffect(() => { yukle(); }, [yukle]);

  if (!satirlar) return <div style={{ color: "var(--muted)", fontSize: 13 }}>Yükleniyor…</div>;
  if (satirlar.length === 0) return <div style={{ color: "var(--muted)", fontSize: 13 }}>Bu dönemde rezervasyon yok.</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 11.5, color: "var(--muted-2)" }}>
        Hangi kanaldan gelenler daha çok gerçekleşiyor, hangileri daha çok iptal/gelmedi oluyor — burada görürsün.
      </div>
      <Tablo
        basliklar={["Kanal", "Rezervasyon", "Misafir", "Geldi", "İptal", "Gelmedi", "Gerçekleşen"]}
        satirlar={satirlar.map((s) => [
          ILETISIM_KANALI_ADI[s.kanal] ?? s.kanal, String(s.rezervasyon), String(s.misafir), String(s.geldi),
          String(s.iptal), String(s.gelmedi), s.gerceklesen_orani !== null ? `%${s.gerceklesen_orani}` : "—",
        ])}
      />
    </div>
  );
}

type WalkinOzet = {
  toplamRezervasyon: number; toplamWalkin: number; toplamWalkinKisi: number;
  gunDagilimi: { gun_no: number; adet: number }[]; saatDagilimi: { saat: number; adet: number }[];
  salonDagilimi: { salon: string; adet: number }[];
};

function BeklemeWalkin({ restaurantId, baslangic, bitis, setErr }: { restaurantId: string; baslangic: string; bitis: string; setErr: (e: string | null) => void }) {
  const [ozet, setOzet] = useState<WalkinOzet | null>(null);

  const yukle = useCallback(async () => {
    const { data, error } = await supabase.rpc("istatistik_walkin", { p_restaurant: restaurantId, p_baslangic: baslangic, p_bitis: bitis });
    if (error) { setErr(error.message); return; }
    const row = (data as {
      toplam_rezervasyon: number; toplam_walkin: number; toplam_walkin_kisi: number;
      gun_dagilimi: WalkinOzet["gunDagilimi"]; saat_dagilimi: WalkinOzet["saatDagilimi"]; salon_dagilimi: WalkinOzet["salonDagilimi"];
    }[] | null)?.[0];
    if (!row) { setOzet(null); return; }
    setOzet({
      toplamRezervasyon: row.toplam_rezervasyon, toplamWalkin: row.toplam_walkin, toplamWalkinKisi: row.toplam_walkin_kisi,
      gunDagilimi: row.gun_dagilimi ?? [], saatDagilimi: row.saat_dagilimi ?? [], salonDagilimi: row.salon_dagilimi ?? [],
    });
  }, [restaurantId, baslangic, bitis, setErr]);

  useEffect(() => { yukle(); }, [yukle]);

  if (!ozet) return <div style={{ color: "var(--muted)", fontSize: 13 }}>Yükleniyor…</div>;

  const walkinOrani = ozet.toplamRezervasyon > 0 ? Math.round((ozet.toplamWalkin / ozet.toplamRezervasyon) * 1000) / 10 : null;
  const gunMap = new Map(ozet.gunDagilimi.map((g) => [g.gun_no, g.adet]));
  const gunVeri = GUN_ADI_KISA.map((l, i) => ({ label: l, value: gunMap.get(i) ?? 0 }));
  const saatMap = new Map(ozet.saatDagilimi.map((s) => [s.saat, s.adet]));
  const saatVeri = Array.from({ length: 24 }, (_, s) => ({ label: String(s), value: saatMap.get(s) ?? 0 }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <SekmeBaslik baslik="Walk-in" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 14 }}>
          <Kutu baslik="Walk-in sayısı" deger={String(ozet.toplamWalkin)} />
          <Kutu baslik="Walk-in kişi" deger={String(ozet.toplamWalkinKisi)} />
          <Kutu baslik="Rezervasyona oranı" deger={walkinOrani !== null ? `%${walkinOrani}` : "—"} />
        </div>
        {ozet.toplamWalkin > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div><div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Güne göre walk-in</div><BarGrafik veri={gunVeri} /></div>
            <div><div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>Saate göre walk-in</div><BarGrafik veri={saatVeri} kucukEtiket /></div>
            {ozet.salonDagilimi.length > 0 && (
              <div>
                <SekmeBaslik baslik="Hangi salonlara oturtuldu" />
                <Tablo basliklar={["Salon", "Adet"]} satirlar={ozet.salonDagilimi.map((s) => [s.salon, String(s.adet)])} />
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 20 }}>
        <SekmeBaslik baslik="Bekleme listesi" />
        <div style={{ fontSize: 12.5, color: "var(--muted)", background: "var(--recede)", borderRadius: 12, padding: "14px 16px" }}>
          Bekleme listesi (Yedek) özelliği şu an kapalı — geri geldiğinde bu bölüm dolacak.
        </div>
      </div>
    </div>
  );
}

// Şube karşılaştırması ayrı bir RPC istemiyor — her şube için zaten var olan Genel Bakış
// RPC'sini tek tek çağırıp yan yana koyuyoruz (Gökhan, 2026-08-07).
function Subeler({ baslangic, bitis, setErr }: { baslangic: string; bitis: string; setErr: (e: string | null) => void }) {
  const [satirlar, setSatirlar] = useState<{ ad: string; ozet: GenelOzet }[] | null>(null);

  const yukle = useCallback(async () => {
    const subeler = await getMyReservationRestaurants();
    if (subeler.length < 2) { setSatirlar([]); return; }
    const sonuclar = await Promise.all(subeler.map(async (s) => {
      const { data, error } = await supabase.rpc("istatistik_genel_ozet", {
        p_restaurant: s.id, p_baslangic: baslangic, p_bitis: bitis, p_onceki_baslangic: baslangic, p_onceki_bitis: bitis,
      });
      if (error) { setErr(error.message); return null; }
      const row = (data as Record<string, number | null>[] | null)?.[0];
      if (!row) return null;
      const ozet: GenelOzet = {
        toplamRezervasyon: Number(row.toplam_rezervasyon), toplamMisafir: Number(row.toplam_misafir),
        gelenRezervasyon: Number(row.gelen_rezervasyon), gelenMisafir: Number(row.gelen_misafir),
        iptalSayisi: Number(row.iptal_sayisi), gelmediSayisi: Number(row.gelmedi_sayisi), walkinSayisi: Number(row.walkin_sayisi),
        ortalamaKisi: row.ortalama_kisi === null ? null : Number(row.ortalama_kisi),
        dolulukOrani: row.doluluk_orani === null ? null : Number(row.doluluk_orani),
        yeniMusteriSayisi: Number(row.yeni_musteri_sayisi),
        tekrarOrani: row.tekrar_orani === null ? null : Number(row.tekrar_orani),
        oncekiToplamRezervasyon: 0, oncekiToplamMisafir: 0,
      };
      return { ad: s.name, ozet };
    }));
    setSatirlar(sonuclar.filter((x): x is { ad: string; ozet: GenelOzet } => x !== null));
  }, [baslangic, bitis, setErr]);

  useEffect(() => { yukle(); }, [yukle]);

  if (!satirlar) return <div style={{ color: "var(--muted)", fontSize: 13 }}>Yükleniyor…</div>;
  if (satirlar.length === 0) return <div style={{ color: "var(--muted)", fontSize: 13 }}>Bu hesap tek şubeli — karşılaştırılacak başka şube yok.</div>;

  return (
    <Tablo
      basliklar={["Şube", "Rezervasyon", "Misafir", "Doluluk", "İptal", "Gelmedi", "Walk-in", "Tekrar oranı"]}
      satirlar={satirlar.map((s) => [
        s.ad, String(s.ozet.toplamRezervasyon), String(s.ozet.toplamMisafir),
        s.ozet.dolulukOrani !== null ? `%${s.ozet.dolulukOrani}` : "—",
        String(s.ozet.iptalSayisi), String(s.ozet.gelmediSayisi), String(s.ozet.walkinSayisi),
        s.ozet.tekrarOrani !== null ? `%${s.ozet.tekrarOrani}` : "—",
      ])}
    />
  );
}

const navBtn: React.CSSProperties = { all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: 6, borderRadius: 8, color: "var(--muted)" };
const donemBtnStil = (secili: boolean): React.CSSProperties => ({
  border: "1px solid var(--line-2)", borderRadius: 980, padding: "6px 12px", fontSize: 12.5, cursor: "pointer",
  background: secili ? "var(--brand-strong)" : "var(--card)", color: secili ? "#fff" : "var(--ink)",
});
const sekmeBtnStil = (secili: boolean): React.CSSProperties => ({
  all: "unset", cursor: "pointer", padding: "8px 14px", fontSize: 13, fontWeight: 600,
  color: secili ? "var(--brand-strong)" : "var(--muted)",
  borderBottom: secili ? "2px solid var(--brand-strong)" : "2px solid transparent",
});
