"use client";

// İSTATİSTİKLER — TEK TABLO (Gökhan, 2026-08-12).
//
// Ölçüler SÜTUN, tarihler SATIR. Sebebi: insan zaman serisini yukarıdan aşağı okur; ayrıca
// ölçüler sayılı ama tarihler sonsuz — sonsuz olan dikeye alınınca tablo sağa taşmıyor,
// sadece aşağı uzuyor ve kendi kutusunda kayıyor.
//
// Üstte sabit kıyas satırları (Bugün, Dün, Bu hafta, Geçen hafta, Bu ay, Geçen ay, Geçen yıl
// bu ay), altında gün gün liste. Hepsi aynı sütunlardan geçtiği için kıyas göz aşağı inerken
// kendiliğinden oluyor.
//
// Üç şey tabloyu "okunacak rakam yığını" olmaktan çıkarır:
//   1) SAPANI BOYAR — bir gün kendi ortalamasından belirgin ayrılıyorsa hücre renklenir.
//      İşletmeci tabloyu okumaz, göze batanı görür.
//   2) KAPI OLUR — gün satırına tıklayınca o günün rezervasyon listesi açılır.
//   3) SIRALAR — sütun başlığına tıklayınca gün satırları o ölçüye göre sıralanır.
//
// Bütün rakamlar tek bir veritabanı hesabından gelir (istatistik_rzv_olculer); kıyas satırları
// ve gün satırları aynı kaynağı kullanır, biri diğerini tutmazlık edemez.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getMyReservationRestaurantId } from "@/lib/supabase/reservationAccount";
import RezervasyonAltNav, { ALT_NAV_YUKSEKLIK, useYatayMobil } from "../../components/RezervasyonAltNav";
import RezervasyonUstBar from "../../components/RezervasyonUstBar";
import { ListHeader, HeaderCell, ListRow, Cell } from "../../components/ListRow";

// Takvim günü aritmetiği — Türkiye yaz saati uygulamadığı için UTC tabanı Europe/Istanbul
// takvimiyle her zaman örtüşür.
const parseGun = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmtGun = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
const gunEkle = (s: string, delta: number) => { const d = parseGun(s); d.setUTCDate(d.getUTCDate() + delta); return fmtGun(d); };
const bugunIstanbul = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const GUN_ADI_KISA = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
const haftaGunu = (g: string) => (parseGun(g).getUTCDay() + 6) % 7; // Pazartesi = 0
const gunEtiket = (g: string) =>
  `${new Intl.DateTimeFormat("tr-TR", { timeZone: "UTC", day: "2-digit", month: "2-digit" }).format(parseGun(g))} ${GUN_ADI_KISA[haftaGunu(g)]}`;

type Bicim = "sayi" | "yuzde" | "sure" | "ondalik" | "para";
const bicimle = (v: number | null, b: Bicim): string => {
  if (v === null || Number.isNaN(v)) return "—";
  if (b === "yuzde") return `%${Math.round(v)}`;
  if (b === "ondalik") return String(Math.round(v * 10) / 10);
  if (b === "para") return v >= 1000 ? `${Math.round(v / 1000)}b` : String(Math.round(v));
  if (b === "sure") {
    if (v <= 0) return "—";
    const s = Math.floor(v / 60), d = Math.round(v % 60);
    return s > 0 ? `${s}s${String(d).padStart(2, "0")}` : `${d}dk`;
  }
  return new Intl.NumberFormat("tr-TR").format(v);
};

// Ham ölçüler veritabanından; türetilenler (rez başı kişi, gelmedi oranı) burada hesaplanır —
// aynı rakamlardan çıktıkları için ayrı bir kaynak sayılmaz.
type HamAnahtar =
  | "dolu_masa" | "dolu_oran" | "bos_masa" | "bos_oran" | "geldi_kap" | "kapi_kap" | "toplam" | "alinan" | "misafir" | "geldi" | "gelmedi" | "iptal" | "kapidan" | "yedek"
  | "yedekten" | "onceden_gun" | "ayni_gun_oran" | "son_dk_adet" | "son_dk_iptal"
  | "gelen_kisi" | "sapma_kisi"
  | "doluluk" | "masa_doluluk" | "ort_sure" | "masa_oturma" | "ciro" | "kisi_basi";
type Anahtar = HamAnahtar | "rez_kisi"
  | "geldi_oran" | "gelmedi_oran" | "iptal_oran" | "kapidan_oran" | "yedek_oran";

// yanYuzde: rakamın yanında küçük punto ile gösterilecek yüzde ölçüsü (Rez sütununda
// kapasitenin ne kadarının dolduğu — Gökhan, 2026-08-12).
// Başlıklar sütun genişliğine göre ortalanır — altlarındaki beyaz kutular da sütunu tam
// doldurup ortalandığı için ikisi üst üste oturuyor (Gökhan, 2026-08-12).
type SutunGrup = "rezervasyon" | "kisi";
type Sutun = { k: Anahtar; l: string; b: Bicim; en: number; grup: SutunGrup; kotu?: boolean; ipucu: string; yanYuzde?: Anahtar };

// Sütunlar iki öbeğe ayrıldı ve üstlerine ortak başlık bandı kondu (Gökhan, 2026-08-12:
// "rezervasyon ve kişiyi ayıralım, önce rezervasyon sonra kişi, başlıklarla ayırabiliriz").
const GRUP_ADI: Record<SutunGrup, string> = { rezervasyon: "Rezervasyon", kisi: "Kişi" };

type Sayfa = SutunGrup | "karsilastirma";
const SAYFA_ADI: Record<Sayfa, string> = {
  rezervasyon: "Rezervasyon", kisi: "Kişi", karsilastirma: "Karşılaştırma",
};
const SAYFALAR: Sayfa[] = ["rezervasyon", "kisi", "karsilastirma"];

const ETIKET_EN = 100;
// Bütün ölçü sütunları EŞİT genişlikte, en geniş içeriğe göre ayarlı (Gökhan, 2026-08-12:
// "genişlikleri en genişe göre ayarlansın ama hepsi eşit olsun"). En geniş içerik yan
// yüzdeli hücreler: "146 - %59".
const SUTUN_EN = 72;

// kotu: ARTIŞIN kötü olduğu sütunlar — sapma boyaması bunlarda ters çalışır.
const SUTUNLAR: Sutun[] = [
  // Doluluk en başta: içeride dolan toplam masa (rezerve + kapı) ve işletme kapasitesine
  // oranı (Gökhan, 2026-08-12: "sütunların başına doluluk geliyor, ikisinin toplamı yazıyor").
  { grup: "rezervasyon", k: "dolu_masa", l: "Doluluk", b: "sayi", en: SUTUN_EN, yanYuzde: "dolu_oran", ipucu: "Dolan masa — rezerve + kapı · işletme kapasitesine oranı" },
  { grup: "rezervasyon", k: "toplam", l: "RZV", b: "sayi", en: SUTUN_EN, yanYuzde: "masa_doluluk", ipucu: "Geçerli rezervasyon, kapı girişi hariç · masa kapasitesine oranı" },
  { grup: "kisi", k: "misafir", l: "Kişi", b: "sayi", en: SUTUN_EN, yanYuzde: "doluluk", ipucu: "Toplam kişi sayısı · yanında koltuk kapasitesinin doluluğu" },
  { grup: "kisi", k: "rez_kisi", l: "Masa/kişi", b: "ondalik", en: SUTUN_EN, ipucu: "Masa başına ortalama kişi" },
  { grup: "kisi", k: "gelen_kisi", l: "Gelen kişi", b: "sayi", en: SUTUN_EN, ipucu: "Kapıda gerçekten gelen kişi sayısı" },
  { grup: "kisi", k: "sapma_kisi", l: "Eksik/Fazla", b: "sayi", en: SUTUN_EN, ipucu: "Gelen kişi ile rezervasyondaki sayının farkı (+ fazla, − eksik)" },
  { grup: "rezervasyon", k: "geldi", l: "Geldi", b: "sayi", en: SUTUN_EN, yanYuzde: "geldi_kap", ipucu: "Rezervasyonla dolan masa · kapasiteye oranı" },
  { grup: "rezervasyon", k: "gelmedi", l: "Gelmedi", b: "sayi", en: SUTUN_EN, kotu: true, yanYuzde: "gelmedi_oran", ipucu: "Gelmeyen rezervasyon · geçerli rezervasyona oranı" },
  { grup: "rezervasyon", k: "kapidan", l: "Kapı", b: "sayi", en: SUTUN_EN, yanYuzde: "kapi_kap", ipucu: "Kapıdan dolan masa · kapasiteye oranı" },
  { grup: "rezervasyon", k: "bos_masa", l: "Boş", b: "sayi", en: SUTUN_EN, kotu: true, yanYuzde: "bos_oran", ipucu: "Hiç dolmayan masa · kapasiteye oranı. Geldi + Kapı + Boş = %100" },
  { grup: "rezervasyon", k: "yedek", l: "Yedek", b: "sayi", en: SUTUN_EN, yanYuzde: "yedek_oran", ipucu: "Yedek yazılan · geçerli rezervasyona oranı" },
  { grup: "rezervasyon", k: "yedekten", l: "Yerleşen", b: "sayi", en: SUTUN_EN, ipucu: "Yedek sıradan yerleştirilen rezervasyon" },
  { grup: "rezervasyon", k: "iptal", l: "İptal", b: "sayi", en: SUTUN_EN, kotu: true, yanYuzde: "iptal_oran", ipucu: "İptal edilen · ALINAN rezervasyona oranı" },
  { grup: "rezervasyon", k: "onceden_gun", l: "Önceden", b: "ondalik", en: SUTUN_EN, ipucu: "Rezervasyon ortalama kaç gün önceden alınmış" },
  { grup: "rezervasyon", k: "ayni_gun_oran", l: "Aynı gün", b: "yuzde", en: SUTUN_EN, ipucu: "Aynı gün alınan rezervasyonların oranı" },
  { grup: "rezervasyon", k: "son_dk_adet", l: "Son dk iptal", b: "sayi", en: SUTUN_EN, kotu: true, yanYuzde: "son_dk_iptal", ipucu: "Aynı gün iptal edilen · alınan rezervasyona oranı" },
  { grup: "kisi", k: "doluluk", l: "Doluluk", b: "yuzde", en: SUTUN_EN, ipucu: "Gelen misafir / (koltuk × gün)" },
  { grup: "kisi", k: "ort_sure", l: "Oturma", b: "sure", en: SUTUN_EN, ipucu: "Ortalama oturma süresi" },
  { grup: "kisi", k: "masa_oturma", l: "Devir", b: "ondalik", en: SUTUN_EN, ipucu: "Masa başına oturma sayısı" },
  // Ciro sütunu kaldırıldı (Gökhan, 2026-08-12): "ciro bize bu programda gerekli değil,
  // biz rezervasyonun harcamasıyla ilgileniyoruz" — para tarafı işletme cirosu olarak değil,
  // misafirin kartında "bu müşteri harcıyor" bilgisi olarak duruyor.
  { grup: "kisi", k: "kisi_basi", l: "Kişi ₺", b: "para", en: SUTUN_EN, ipucu: "Rezervasyon başına kişi harcaması" },
];

// Sütunlar önce Rezervasyon, sonra Kişi öbeğinde sıralanır — dizideki yazım sırası ne olursa
// olsun ekranda öbekler bitişik durur.
const SIRALI_SUTUNLAR: Sutun[] = (["rezervasyon", "kisi"] as SutunGrup[]).flatMap(
  (g) => SUTUNLAR.filter((s) => s.grup === g),
);

// Satırlar inceltildi ve gün listesi kısaltıldı ki tablo tek ekrana sığsın (Gökhan,
// 2026-08-12: "satırları incelt ve aynı ekrana sığdır").
const SATIR_YUKSEKLIK = 28;
const GUN_ADEDI = 20;

type Olcum = Partial<Record<HamAnahtar, number | null>>;
type Satir = { anahtar: string; etiket: string; gun?: string } & Record<string, unknown> & { deger: Partial<Record<Anahtar, number | null>> };

// Veritabanından gelen BÜTÜN ham ölçüler — sütun listesinde görünmeyenler de (masa_doluluk
// gibi yan gösterimler) buradan okunur. Eskiden sadece SUTUNLAR üzerinden okunuyordu, bu
// yüzden yan yüzde hiç gelmiyordu (Gökhan, 2026-08-12: "gelmedi ama").
const HAM_ANAHTARLAR: HamAnahtar[] = [
  "dolu_masa", "dolu_oran", "bos_masa", "bos_oran", "geldi_kap", "kapi_kap", "toplam", "alinan", "misafir", "geldi", "gelmedi", "iptal", "kapidan", "yedek",
  "yedekten", "onceden_gun", "ayni_gun_oran", "son_dk_adet", "son_dk_iptal",
  "gelen_kisi", "sapma_kisi",
  "doluluk", "masa_doluluk", "ort_sure", "masa_oturma", "ciro", "kisi_basi",
];

const say = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// Türetilmiş sütunları ham ölçüden çıkarır.
const degerKur = (o: Olcum): Partial<Record<Anahtar, number | null>> => {
  const d: Partial<Record<Anahtar, number | null>> = { ...o };
  const t = o.toplam ?? null, m = o.misafir ?? null;
  d.rez_kisi = t && t > 0 && m !== null ? m / t : null;
  // Oranlar GEÇERLİ rezervasyona göre (iptaller düşülmüş). Tek istisna iptalin kendisi:
  // o "alınan" rezervasyona göre hesaplanır (Gökhan, 2026-08-12).
  const pay = (v: number | null | undefined, taban: number | null) =>
    taban && taban > 0 && v !== null && v !== undefined ? (v / taban) * 100 : null;
  d.geldi_oran = pay(o.geldi, t);
  d.gelmedi_oran = pay(o.gelmedi, t);
  d.kapidan_oran = pay(o.kapidan, t);
  d.yedek_oran = pay(o.yedek, t);
  d.iptal_oran = pay(o.iptal, o.alinan ?? null);
  return d;
};

const DONEM_ADI: Record<string, string> = {
  bugun: "Bugün", gecen_hafta_gun: "Geçen hafta bugün",
  dun: "Dün", gecen_hafta_dun: "Geçen hafta dün",
  bu_hafta: "Bu hafta", gecen_hafta: "Geçen hafta", gecen_yil_hafta: "Geçen yıl bu hafta",
  bu_ay: "Bu ay", gecen_ay: "Geçen ay", gecen_yil_ay: "Geçen yıl bu ay",
};

const GUN_ADI_UZUN = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const yuzdeFark = (simdi: number | null, onceki: number | null): number | null =>
  simdi === null || onceki === null || onceki <= 0 ? null : Math.round(((simdi - onceki) / onceki) * 100);

export default function IstatistiklerPage() {
  const router = useRouter();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const yatayMobil = useYatayMobil();
  // Gün süzgeci üst bara (işletme ismi satırına) taşındı; içeriğini tablo doldurur.
  const [suzgec, setSuzgec] = useState<React.ReactNode>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let active = true;
    getMyReservationRestaurantId().then((id) => {
      if (!active) return;
      if (!id) { router.replace("/rezervasyon/giris"); return; }
      setRestaurantId(id);
    });
    return () => { active = false; };
  }, [router]);

  if (!restaurantId) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--canvas)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 380, textAlign: "center", fontSize: 13.5, color: err ? "var(--danger)" : "var(--muted)", lineHeight: 1.6 }}>{err ?? "Yükleniyor…"}</div>
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--canvas)", padding: "20px 24px",
      paddingBottom: yatayMobil ? 10 : (isMobile ? ALT_NAV_YUKSEKLIK + 16 : 24),
      height: "calc(100vh - 4px)", boxSizing: "border-box",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <RezervasyonUstBar
        restaurantId={restaurantId}
        sayfaBaslik="İstatistikler"
        yanIcerik={suzgec}
      />
      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10, flexShrink: 0 }}>{err}</div>}
      <Tablo restaurantId={restaurantId} setErr={setErr} onSuzgec={setSuzgec} />
      <RezervasyonAltNav />
    </div>
  );
}

// HÜKÜM BANDI — ekrana girer girmez ne olduğunu düz Türkçeyle söyler; altındaki dört büyük
// rakam bugünü geçen haftanın AYNI GÜNÜYLE kıyaslar (dünle kıyas yanıltır: salı ile pazartesi
// aynı şey değil). Gökhan, 2026-08-12: "ekranda hüküm yok, rakam var".
function HukumBandi({ bugun, gecenHaftaGun, gecmisOrt, gecmisAdet, sadeceGun }: {
  bugun?: Satir; gecenHaftaGun?: Satir;
  gecmisOrt: number | null; gecmisAdet: number; sadeceGun: string;
}) {
  if (!bugun) return null;
  const b = bugun.deger, o = gecenHaftaGun?.deger;
  const gunAdi = GUN_ADI_UZUN[haftaGunu(bugunIstanbul())];
  const rez = b.toplam ?? 0, mis = b.misafir ?? 0, gelen = b.geldi ?? 0;
  const fark = yuzdeFark(b.misafir ?? null, o?.misafir ?? null);

  // Geçmiş günlerin ortalaması ve bugünün o ortalamaya göre yeri (Gökhan, 2026-08-12).
  // Ortalamaya BUGÜN dahil değil — akşam daha yaşanmadı, kendi eksik rakamı ortalamayı bozar.
  const ortFark = gecmisOrt !== null && gecmisOrt > 0 ? Math.round(((mis - gecmisOrt) / gecmisOrt) * 100) : null;
  const ortCumle = gecmisOrt === null
    ? ""
    : ` Son ${gecmisAdet} ${sadeceGun} ortalaması ${Math.round(gecmisOrt)} kişi`
      + (ortFark === null ? "." : ` — bugün ortalamanın %${Math.abs(ortFark)} ${ortFark >= 0 ? "üstünde" : "altında"}.`);

  const cumle = rez === 0
    ? `Bugün için rezervasyon yok.${ortCumle}`
    : `Bugün ${rez} rezervasyon, ${mis} kişi.`
      + (fark === null ? "" : ` Geçen ${gunAdi.toLocaleLowerCase("tr")}ya göre ${fark >= 0 ? "%" + fark + " fazla" : "%" + Math.abs(fark) + " az"}.`)
      + ortCumle
      + (gelen === 0 ? " Henüz gelen yok." : ` ${gelen} masa ağırlandı.`);

  // Dört büyük rakam kutusu kaldırıldı (Gökhan, 2026-08-12: "anlamsız oldu, biz listeyi
  // şekillendirelim") — hüküm cümlesi kaldı, gerisi tablonun işi.
  return (
    <div style={{ flexShrink: 0, marginBottom: 12 }}>
      <div style={{ fontSize: 14.5, lineHeight: 1.45, color: "var(--ink)", background: "var(--recede)", borderRadius: 12, padding: "11px 15px" }}>
        {cumle}
      </div>
    </div>
  );
}

function Tablo({ restaurantId, setErr, onSuzgec }: {
  restaurantId: string; setErr: (e: string | null) => void; onSuzgec: (n: React.ReactNode) => void;
}) {
  const router = useRouter();
  const [donemler, setDonemler] = useState<Satir[] | null>(null);
  const [gunSatirlari, setGunSatirlari] = useState<Satir[] | null>(null);
  const [seciliGunler, setSeciliGunler] = useState<Set<number>>(new Set([0, 1, 2, 3, 4, 5, 6]));
  const [sirala, setSirala] = useState<{ k: Anahtar; artan: boolean } | null>(null);
  // ÜÇ SAYFA, tek düğmeden seçilir (Gökhan, 2026-08-12: "kişileri ayrı bir sayfaya alıyoruz,
  // soldaki butona bir de kişi ekliyoruz; kişi sayfası rezervasyon sayfasının aynısı ama kişi
  // olarak"). Rezervasyon ve Kişi aynı dönem satırlarını kendi sütunlarıyla gösterir;
  // Karşılaştırma gün gün listedir ve bütün sütunları taşır.
  const [aktifGrup, setAktifGrup] = useState<Sayfa>("rezervasyon");
  const [menuAcik, setMenuAcik] = useState(false);
  const gorunenSutunlar = aktifGrup === "karsilastirma"
    ? SIRALI_SUTUNLAR
    : SUTUNLAR.filter((s) => s.grup === aktifGrup);

  const yukleDonemler = useCallback(async () => {
    const { data, error } = await supabase.rpc("istatistik_rzv_donemler", {
      p_restaurant: restaurantId, p_bugun: bugunIstanbul(),
    });
    if (error) { setErr(error.message); return; }
    const rows = (data as Record<string, unknown>[] | null) ?? [];
    setDonemler(rows.map((r) => {
      const ham: Olcum = {};
      for (const k of HAM_ANAHTARLAR) if (r[k] !== undefined) ham[k] = say(r[k]);
      return { anahtar: String(r.anahtar), etiket: DONEM_ADI[String(r.anahtar)] ?? String(r.anahtar), deger: degerKur(ham) };
    }));
  }, [restaurantId, setErr]);

  useEffect(() => { yukleDonemler(); }, [yukleDonemler]);

  // Gün listesi: hepsi seçiliyken son 30 gün; bir kısmı seçiliyken sadece o hafta günlerinin
  // son 20 tarihi (Gökhan: "cumartesiyi tıkladım, son 10 cumartesi görünecek").
  const yukleGunler = useCallback(async () => {
    const hepsi = seciliGunler.size === 7;
    const hedefAdet = GUN_ADEDI;
    const hedef: string[] = [];
    let g = bugunIstanbul();
    let guard = 0;
    while (hedef.length < hedefAdet && guard < 500) {
      if (hepsi || seciliGunler.has(haftaGunu(g))) hedef.push(g);
      g = gunEkle(g, -1);
      guard++;
    }
    const { data, error } = await supabase.rpc("istatistik_rezervasyon_gun_karsilastirma", {
      p_restaurant: restaurantId, p_gunler: hedef,
    });
    if (error) { setErr(error.message); return; }
    const rows = (data as Record<string, unknown>[] | null) ?? [];
    const gore = new Map(rows.map((r) => [String(r.gun), r]));
    setGunSatirlari(hedef.map((gun) => {
      const r = gore.get(gun);
      const ham: Olcum = {};
      for (const k of HAM_ANAHTARLAR) if (r && r[k] !== undefined) ham[k] = say(r[k]);
      return { anahtar: gun, etiket: gunEtiket(gun), gun, deger: degerKur(ham) };
    }));
  }, [restaurantId, seciliGunler, setErr]);

  useEffect(() => { yukleGunler(); }, [yukleGunler]);

  const gunToggle = (g: number) => setSeciliGunler((s) => {
    if (s.size === 7) return new Set([g]);
    const next = new Set(s);
    if (next.has(g)) next.delete(g); else next.add(g);
    return next.size === 0 ? new Set([0, 1, 2, 3, 4, 5, 6]) : next;
  });

  // SAPMA BOYAMASI — her sütunun kendi ortalaması alınır; ortalamadan %35'ten fazla ayrılan
  // gün hücresi renklenir. Amaç rakam okutmak değil, göze batırmak.
  const ortalamalar = useMemo(() => {
    const out: Partial<Record<Anahtar, number>> = {};
    for (const s of SIRALI_SUTUNLAR) {
      const v = (gunSatirlari ?? []).map((r) => r.deger[s.k] ?? null).filter((x): x is number => x !== null && x > 0);
      if (v.length >= 4) out[s.k] = v.reduce((a, b) => a + b, 0) / v.length;
    }
    return out;
  }, [gunSatirlari]);

  const sapmaRengi = (s: Sutun, v: number | null): string | undefined => {
    const ort = ortalamalar[s.k];
    if (v === null || ort === undefined || ort <= 0) return undefined;
    const fark = (v - ort) / ort;
    if (Math.abs(fark) < 0.35) return undefined;
    const iyi = s.kotu ? fark < 0 : fark > 0;
    return iyi ? "rgba(159, 215, 0, 0.20)" : "rgba(214, 69, 69, 0.14)";
  };

  // AYNI GÜNÜN GEÇMİŞİ (Gökhan, 2026-08-12: "geçmiş gün derken aynı günün geçmişi") —
  // bugün çarşambaysa geçmiş çarşambalar. Son 30 takvim gününün ortalaması yanıltıyordu:
  // içinde cumartesiler de var, salıyla kıyaslanmaz. Bugün dışarıda — akşam yaşanmadan
  // kendi eksik rakamı ortalamaya girmemeli. Ekrandaki gün süzgecinden bağımsız çalışır.
  const [aynıGunGecmis, setAyniGunGecmis] = useState<{ ort: number | null; adet: number }>({ ort: null, adet: 0 });

  const yukleAyniGun = useCallback(async () => {
    const bugun = bugunIstanbul();
    const hedefGun = haftaGunu(bugun);
    const tarihler: string[] = [];
    let g = gunEkle(bugun, -7);
    let guard = 0;
    while (tarihler.length < 10 && guard < 200) {
      if (haftaGunu(g) === hedefGun) tarihler.push(g);
      g = gunEkle(g, -1);
      guard++;
    }
    const { data, error } = await supabase.rpc("istatistik_rezervasyon_gun_karsilastirma", {
      p_restaurant: restaurantId, p_gunler: tarihler,
    });
    if (error) { setErr(error.message); return; }
    const v = ((data as Record<string, unknown>[] | null) ?? [])
      .map((r) => say(r.misafir)).filter((x): x is number => x !== null);
    setAyniGunGecmis({ ort: v.length >= 3 ? v.reduce((a, b) => a + b, 0) / v.length : null, adet: v.length });
  }, [restaurantId, setErr]);

  useEffect(() => { yukleAyniGun(); }, [yukleAyniGun]);

  const siraliGunler = useMemo(() => {
    const list = [...(gunSatirlari ?? [])];
    if (!sirala) return list; // varsayılan: en yeni gün en üstte
    return list.sort((a, b) => {
      const x = a.deger[sirala.k], y = b.deger[sirala.k];
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return sirala.artan ? x - y : y - x;
    });
  }, [gunSatirlari, sirala]);

  const basligaTikla = (k: Anahtar) =>
    setSirala((s) => (s && s.k === k ? (s.artan ? null : { k, artan: true }) : { k, artan: false }));

  // Gün süzgeci üst bara (işletme ismi satırına) veriliyor — tabloda başlıkla listenin
  // arasına giriyordu (Gökhan, 2026-08-12). Sadece Karşılaştırma listesinde anlamlı.
  useEffect(() => {
    if (aktifGrup !== "karsilastirma") { onSuzgec(null); return; }
    onSuzgec(
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {GUN_ADI_KISA.map((l, i) => (
          <button key={i} onClick={() => gunToggle(i)} style={{
            border: "1px solid var(--line-2)", borderRadius: 8, padding: "4px 8px", fontSize: 11, cursor: "pointer",
            background: seciliGunler.has(i) ? "var(--brand-strong)" : "var(--card)",
            color: seciliGunler.has(i) ? "#fff" : "var(--muted)",
          }}>
            {l}
          </button>
        ))}
        {sirala && (
          <button onClick={() => setSirala(null)} style={{
            border: "1px solid var(--line-2)", borderRadius: 980, padding: "3px 10px", fontSize: 11,
            cursor: "pointer", background: "var(--card)", color: "var(--muted)",
          }}>
            Sıralamayı kaldır
          </button>
        )}
      </div>,
    );
    return () => onSuzgec(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktifGrup, seciliGunler, sirala]);

  if (!donemler) return <div style={{ color: "var(--muted)", fontSize: 13 }}>Yükleniyor…</div>;

  const sutunlar = gorunenSutunlar;
  const satirCiz = (r: Satir, tip: "donem" | "gun") => (
    // İki listenin kutu rengi aynı — karşılaştırma satırları beyaz kalıyordu, rezervasyon
    // satırlarıyla ayrı bir ekran gibi duruyordu (Gökhan, 2026-08-12).
    <ListRow key={r.anahtar} bg="var(--recede)" yukseklik={SATIR_YUKSEKLIK}>
      <Cell width={ETIKET_EN} marginLeft={10}>
        <span
          onClick={r.gun ? () => router.push(`/rezervasyon?gun=${r.gun}`) : undefined}
          title={r.gun ? "Bu günün rezervasyon listesini aç" : undefined}
          style={{
            fontSize: 12.5, fontWeight: tip === "donem" ? 700 : 500,
            color: tip === "donem" ? "var(--ink)" : "var(--ink-green)",
            whiteSpace: "nowrap", cursor: r.gun ? "pointer" : undefined,
          }}
        >
          {r.etiket}
        </span>
      </Cell>
      {sutunlar.map((s, i) => {
        const v = r.deger[s.k] ?? null;
        const bg = tip === "gun" ? sapmaRengi(s, v) : undefined;
        return (
          <Cell key={s.k} width={s.en} align="center" marginLeft={i === 0 ? "1cm" : undefined}>
            {/* Her rakam kendi beyaz kutusunda — satır zemininden ayrılsın diye
                (Gökhan, 2026-08-12). Sapma boyaması varsa kutunun rengi o olur. */}
            <span className="tnum" style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              minWidth: "100%", height: SATIR_YUKSEKLIK - 6, padding: "0 5px", borderRadius: 7,
              background: bg ?? "var(--card)", border: "1px solid var(--line)",
              boxSizing: "border-box",
              fontSize: 12.5, fontWeight: tip === "donem" ? 600 : 500,
              color: v === null ? "var(--muted-2)" : "var(--ink)", whiteSpace: "nowrap",
            }}>
              {/* Yan yüzdeli sütunda tire hep aynı hizada durur: rakam tireye kadar sağa,
                  yüzde tireden sonra sola yaslanır — sütun tireye göre ortalanmış olur
                  (Gökhan, 2026-08-12). */}
              {s.yanYuzde ? (
                <span style={{ display: "flex", alignItems: "baseline", justifyContent: "center", width: "100%" }}>
                  <span style={{ flex: 1, textAlign: "right" }}>{bicimle(v, s.b)}</span>
                  <span style={{ padding: "0 4px" }}>-</span>
                  <span style={{ flex: 1, textAlign: "left" }}>{bicimle(r.deger[s.yanYuzde] ?? null, "yuzde")}</span>
                </span>
              ) : bicimle(v, s.b)}
            </span>
          </Cell>
        );
      })}
    </ListRow>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <HukumBandi
        bugun={donemler.find((d) => d.anahtar === "bugun")}
        gecenHaftaGun={donemler.find((d) => d.anahtar === "gecen_hafta_gun")}
        gecmisOrt={aynıGunGecmis.ort}
        gecmisAdet={aynıGunGecmis.adet}
        sadeceGun={GUN_ADI_UZUN[haftaGunu(bugunIstanbul())].toLocaleLowerCase("tr")}
      />
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <div style={{ width: "max-content", minWidth: "100%" }}>
          {/* Sütun başlıkları kaydırırken üstte sabit kalır — uzun listede hangi sütuna
              baktığın kaybolmasın diye (Gökhan, 2026-08-12). Arka plan opak, satırlar
              altından geçerken başlığın içinden görünmesin. */}
          <div style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--canvas)", paddingTop: 2 }}>
          {/* ÖBEK BANDI — sütun başlıklarının üstünde, hangi sütunların rezervasyon hangilerinin
              kişi tarafı olduğunu gösterir. */}
          {aktifGrup === "karsilastirma" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 4 }}>
            <span style={{ width: ETIKET_EN, marginLeft: 10, flexShrink: 0 }} />
            {(["rezervasyon", "kisi"] as SutunGrup[]).map((g, gi) => {
              const adet = SIRALI_SUTUNLAR.filter((s) => s.grup === g).length;
              if (adet === 0) return null;
              return (
                <span key={g} style={{
                  width: adet * SUTUN_EN + (adet - 1) * 10, marginLeft: gi === 0 ? "1cm" : undefined,
                  flexShrink: 0, textAlign: "center", fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                  textTransform: "uppercase", color: "var(--brand)",
                  borderBottom: "1px solid var(--line-2)", paddingBottom: 3,
                }}>
                  {GRUP_ADI[g]}
                </span>
              );
            })}
          </div>
          )}
          <ListHeader>
            <HeaderCell width={ETIKET_EN} marginLeft={10}>
              <span style={{ position: "relative", display: "inline-block" }}>
                <span
                  onClick={() => setMenuAcik((v) => !v)}
                  title="Sayfa değiştir"
                  style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, color: "var(--brand)", whiteSpace: "nowrap" }}
                >
                  {SAYFA_ADI[aktifGrup]}
                  <span aria-hidden style={{ fontSize: 9, color: "var(--muted-2)" }}>{menuAcik ? "▴" : "▾"}</span>
                </span>
                {menuAcik && (
                  <span style={{
                    position: "absolute", top: "100%", left: 0, marginTop: 5, zIndex: 10,
                    display: "flex", flexDirection: "column", minWidth: 130,
                    background: "var(--card)", border: "1px solid var(--line-2)", borderRadius: 10,
                    boxShadow: "0 4px 14px rgba(0,0,0,0.10)", overflow: "hidden",
                  }}>
                    {SAYFALAR.map((sf) => (
                      <span
                        key={sf}
                        onClick={() => { setAktifGrup(sf); setMenuAcik(false); }}
                        style={{
                          cursor: "pointer", padding: "7px 12px", fontSize: 12.5, textTransform: "none",
                          letterSpacing: 0, fontWeight: sf === aktifGrup ? 700 : 500,
                          color: sf === aktifGrup ? "var(--brand)" : "var(--ink)",
                          background: sf === aktifGrup ? "var(--recede)" : "transparent",
                        }}
                      >
                        {SAYFA_ADI[sf]}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </HeaderCell>
            {/* Rakam sütunları soldaki ölçü adından 1 cm ayrı başlar; sol başlıklar yerinde
                kalır, sadece rakam bloğu sağa kayar (Gökhan, 2026-08-12). */}
            {gorunenSutunlar.map((s, i) => {
              const aktif = sirala?.k === s.k;
              return (
                <HeaderCell key={s.k} width={s.en} align="center" marginLeft={i === 0 ? "1cm" : undefined}>
                  <span
                    onClick={() => basligaTikla(s.k)}
                    title={`${s.ipucu} — sıralamak için tıkla`}
                    style={{ cursor: "pointer", color: aktif ? "var(--brand)" : undefined, whiteSpace: "nowrap" }}
                  >
                    {s.l}{aktif ? (sirala!.artan ? " ↑" : " ↓") : ""}
                  </span>
                </HeaderCell>
              );
            })}
          </ListHeader>
          </div>

          {aktifGrup !== "karsilastirma" && donemler.map((r) => satirCiz(r, "donem"))}

          {aktifGrup === "karsilastirma" && (siraliGunler ?? []).map((r) => satirCiz(r, "gun"))}
        </div>
      </div>
    </div>
  );
}
