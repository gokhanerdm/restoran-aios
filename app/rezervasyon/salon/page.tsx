"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import PostaPaneli from "../posta/PostaPaneli";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Copy, Trash2, ArrowLeft, ArrowRight, ArrowUp, ArrowDown, RotateCw, Maximize2, LayoutGrid, ChevronLeft, ChevronRight, Pin, Users } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { getMyReservationRestaurantId } from "@/lib/supabase/reservationAccount";
import { toUpperTr, toTitleTr } from "@/lib/text";
import EditableText from "../../components/EditableText";
import { useConfirm } from "../../components/useConfirm";
import RezervasyonAltNav, { ALT_NAV_YUKSEKLIK, useYatayMobil } from "../../components/RezervasyonAltNav";
import RezervasyonUstBar from "../../components/RezervasyonUstBar";
import { MenuBaslik, MenuNav, useRolum } from "../../components/RezervasyonMenu";
import { PX_PER_CM, KOLTUK_SECENEKLERI, BOX_W, BOX_H, govdeOlcusu, govdeCizim, type Shape as MasaSekli, type MasaOlcusu } from "../masaOlcu";
import { salonDuzeniniTazele, yerlesimYap, bugunIstanbulGun } from "../salonDuzen";
import { AYRI_MESAFE } from "../masaPlan";
import { izgaraDuzeni, izgaraYeri, duvarIcinde, duvarIcindeMi, ekranYonunuPlanaCevir, yeniSalonOlcusu, satirBasi, SALON_CIZGISI } from "../salonKurallari";

// REZERVASYON > SALON — görsel masa planı (Gökhan, 2026-08-04: "sürükleyip yerleştirebileceğim,
// salon düzeninin aynısını yapabileceğim bir ekran"). AIOS'un Kasa/Adisyon ekranındaki kat planıyla
// (app/page.tsx) BİREBİR AYNI mekanik — sürükleme, grid'e yapışma, sağ tık menüsü — buradan kopyalandı.
// Fark: burada para/adisyon/sipariş yok. Masa sadece boş/rezerve/dolu durumunu gösterir; dolu/rezerve
// olan masada BUGÜN kimin olduğu (reservations'tan) ayrıca gösterilir.
//
// Aynı restaurant_tables/dining_areas tabloları — Ayarlar'daki liste editörüyle aynı veriyi
// paylaşıyor, position_x/position_y de zaten AIOS'tan beri var olan kolonlar, yeni migration
// gerekmedi. Ayarlar'daki liste duruyor (hızlı toplu ekleme için), bu ekran görsel yerleşim için.

// genislik_cm/derinlik_cm — salonun gerçek en/boy ölçüsü (Gökhan: "salonun gerçek oturumunu
// minyatürde görmek"). İsteğe bağlı; girilmezse tuval eskisi gibi otomatik büyür.
type Area = { id: string; name: string; sort_order: number; genislik_cm: number | null; derinlik_cm: number | null };
// Loca gerçek bir masa şekli (Gökhan: "locayı masa ekleye koyacağız" — dekoratif öğe değil,
// doğrudan kişi sayısı/rezervasyon durumu taşıyan bir masa gibi işlem görsün).
type Shape = MasaSekli;
type TableRow = {
  id: string; name: string; area_id: string | null; status: string; sort_order: number;
  position_x: number | null; position_y: number | null; seat_count: number; shape: Shape; rotated: boolean; grup_id: string | null;
};
type OturanBilgi = { guestName: string; partySize: number; status: string };

// Masa dışı salon öğeleri (Gökhan, 2026-08-04: "bar ikonu koyarız duvar koyarız... kolon
// koyalım bide servis koyalım kapı koyalım"). Rezervasyon/durum takibi yok, sadece salonun
// gerçek halini çizmek için. Duvar/Bar iki uçtan çekilip uzatılır; Kolon/Servis/Kapı sabit
// boyda, tek noktadan sürüklenir. restaurant_tables'a KARIŞTIRILMADI — oradaki kapasite/
// rezervasyon hesaplarını bozmasın diye ayrı bir tablo (salon_ogeleri). Loca burada YOK —
// o gerçek bir masa (yukarıdaki Shape), çünkü rezervasyon/durum taşıması gerekiyordu.
type OgeType = "duvar" | "bar" | "kolon" | "servis" | "kapi";
type SalonOge = {
  id: string; area_id: string; type: OgeType; name: string;
  x1: number; y1: number; x2: number | null; y2: number | null;
  // 90 derece çevrilmiş mi (Gökhan, 2026-08-18: "öğe ekledim, çevirme özelliği yok").
  // Kolon/Servis/Kapı'da en ile boy takas edilir; Duvar/Bar'da çubuk uçlarından döndürülür.
  rotated: boolean;
};
const CEKME_TIPLERI: { type: OgeType; label: string }[] = [
  { type: "duvar", label: "Duvar" },
  { type: "bar", label: "Bar" },
];
const SABIT_TIPLERI: { type: OgeType; label: string }[] = [
  { type: "kolon", label: "Kolon" },
  { type: "servis", label: "Servis" },
  { type: "kapi", label: "Kapı" },
];
// 1cm gerçek ölçünün piksel karşılığı ve masa gövde ölçüleri artık ../masaOlcu.ts'te —
// planlayıcı birleşen masaları yan yana koyarken aynı ölçüyü kullanıyor, iki kopya kalmasın.
// Duvar/Bar kalınlığı — standart duvar ~20cm, bar tezgahı ~60cm derinlik (yaygın tezgah
// ölçüsü). Uzunlukları (x1,y1)-(x2,y2) çekilerek serbest belirlenir, kalınlık sabit.
const CEKME_GORUNUM: Record<string, { renk: string; kalinlik: number }> = {
  duvar: { renk: "var(--ink)", kalinlik: Math.round(20 * PX_PER_CM) },
  bar: { renk: "var(--gold)", kalinlik: Math.round(60 * PX_PER_CM) },
};
// Sabit tiplerin görünümü — her biri kendi rengi/boyutuyla ayırt edilsin diye.
const SABIT_GORUNUM: Record<string, { renk: string; genislik: number; yukseklik: number }> = {
  kolon: { renk: "var(--muted-2)", genislik: 44, yukseklik: 44 },
  servis: { renk: "var(--gold)", genislik: 74, yukseklik: 50 },
  kapi: { renk: "var(--danger)", genislik: 54, yukseklik: 26 },
};
// Hizalama kılavuz çizgisi kaldırıldı (Gökhan, 2026-08-13: "referans çizgileri de görünmesin").
// Masanın komşusunun hizasına yapışması duruyor, sadece çizgi çizilmiyor.

// Masa şekli ve kişi sayısı AYRI seçilir (Gökhan: "yuvarlak altı kişilik masada olabilir" —
// şekle sabit bir kişi sayısı bağlı olamaz). Sürüklenen kutunun kendisi grid'e oturması için
// hep BOX_W×BOX_H sabit kalıyor (gerçek daire/dikdörtgen yapmak grid'i bozar); şekil, kutunun
// içindeki küçük bir rozetle (durum rengiyle boyalı) gösteriliyor — önceki halde köşe
// yuvarlaklığı denenmişti, "hâlâ kart gibi açılıyor" ve kare seçimi yuvarlak görünüyordu.
const SEKILLER: { shape: Shape; label: string }[] = [
  { shape: "yuvarlak", label: "Yuvarlak" },
  { shape: "kare", label: "Kare" },
  { shape: "dikdortgen", label: "Dikdörtgen" },
  { shape: "loca", label: "Loca" },
];
// Şekil rozeti — gerçek en/boy oranıyla (yuvarlak: eşit kenar + tam yuvarlak, kare: eşit
// kenar + hafif köşe, dikdörtgen: geniş + hafif köşe). Seçim ekranındaki küçük önizleme
// ikonu için — masanın kendi kutusu artık govdeOlcusu'nu kullanıyor.
const sekilRozeti = (shape: Shape, taban: number): React.CSSProperties => {
  if (shape === "yuvarlak") return { width: taban, height: taban, borderRadius: "50%" };
  if (shape === "kare") return { width: taban, height: taban, borderRadius: 4 };
  if (shape === "loca") return { width: taban * 1.35, height: taban, borderRadius: 12 };
  return { width: taban * 1.5, height: taban * 0.7, borderRadius: 4 };
};

const GAP = 14;

const bugunIstanbul = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const bugunSiniri = () => {
  const gun = bugunIstanbul();
  const start = `${gun}T00:00:00+03:00`;
  const d = new Date(`${gun}T12:00:00+03:00`);
  d.setDate(d.getDate() + 1);
  const end = `${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d)}T00:00:00+03:00`;
  return { start, end };
};

// useSearchParams kullanan sayfa Suspense içinde olmak zorunda — yoksa üretim derlemesi
// (next build) "should be wrapped in a suspense boundary" diye patlıyor. Garson ve Mutfak
// ekranlarındaki desenin aynısı.
export default function SalonPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--canvas)" }} />}>
      <SalonInner />
    </Suspense>
  );
}

function SalonInner() {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  // Alt nav mobilde sabit — içerik onun altında kalmasın diye boşluk bırakılıyor
  // (Gökhan, 2026-08-08: "sayfalarda navın altında bir şeylerin kalmadığından emin ol").
  const [darEkran, setDarEkran] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const update = () => setDarEkran(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  // Yan çevrilmiş telefon hâlâ telefondur: genişlik 860'ı aşınca salon da masaüstü düzenine
  // geçiyor, plan tam ekran kaplamıyordu (Gökhan, 2026-08-10: "salon yan çevirince tam ekran
  // yapmıyor"). Rezervasyon listesindeki kuralın aynısı.
  const yatayMobil = useYatayMobil();
  const isMobile = darEkran || yatayMobil;
  const [areas, setAreas] = useState<Area[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [oturanlar, setOturanlar] = useState<Record<string, OturanBilgi>>({});
  // Masası olan rezervasyonların KİŞİ toplamı. Rezervasyon başına bir kez sayılır — birleşik
  // masada aynı grup iki masada göründüğü için masa masa toplamak çift sayardı.
  const [doluKisi, setDoluKisi] = useState(0);
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [addingArea, setAddingArea] = useState(false);
  // Yeni salonun ölçüsü, salon açılırken giriliyor (Gökhan, 2026-08-13: "salon açılırken
  // ölçüleri de girilir"). Boş bırakılırsa ilk salonun ölçüsü kullanılır.
  const [yeniEn, setYeniEn] = useState("");
  const [yeniBoy, setYeniBoy] = useState("");
  const [newAreaName, setNewAreaName] = useState("");
  const [addingTable, setAddingTable] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [newTableShape, setNewTableShape] = useState<Shape>("kare");
  const [newTableSeats, setNewTableSeats] = useState("4");
  const [koltukInput, setKoltukInput] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; table: TableRow | null } | null>(null);
  // Ayarlar > Salon ve masa'da tanımlanan gruplar; masaya buradan atanıyor.
  const [masaGruplari, setMasaGruplari] = useState<{ id: string; ad: string; renk: string }[]>([]);
  // POSTAM — giriş yapan garsonun bugün baktığı masalar (Gökhan, 2026-08-17: "postasını salon
  // ekranında görür, verilen posta yanar"). İşletme sahibinde boş döner, hiçbir masa yanmaz.
  const [postam, setPostam] = useState<Set<string>>(new Set());
  // POSTA KİPİ — masaüstünde salon ekranının içinde açılıyor (Gökhan, 2026-08-17: "posta
  // webde salon sayfasında olacak"). Telefonda ayrı sayfa var, nav'dan gidiliyor.
  const [postaKipi, setPostaKipi] = useState(false);
  // Giriş yapanın rolü — telefonda garson bu sayfada salon düzenleyicisini değil, posta
  // planını görüyor (Gökhan, 2026-08-19). Aşağıda, bütün kancalardan sonra ayrılıyor.
  const rolum = useRolum();
  // Grup seçme modu: adres ?grup=<id> ile geliniyor (Ayarlar'daki "Masalar" kutusu).
  const grupParam = useSearchParams().get("grup");
  const [grupSecim, setGrupSecim] = useState<Set<string>>(new Set());
  const [grupHazir, setGrupHazir] = useState(false);
  const [grupBusy, setGrupBusy] = useState(false);
  const grupModu = grupParam ? masaGruplari.find((g) => g.id === grupParam) ?? null : null;
  // SEÇİLİ MASA (Gökhan, 2026-08-19: "önce masa seçelim sonra çoğalt butonuna basalım").
  // Masaya sol tık artık pencere açmıyor, masayı SEÇİYOR; sol menüdeki "Masa çoğalt" ve
  // "Masa sil" hep bu seçili masaya çalışıyor. Aynı masaya tekrar tıklamak seçimi bırakır.
  const [seciliMasaId, setSeciliMasaId] = useState<string | null>(null);
  // Hızlı masa çoğaltma (Gökhan: "bir masa açtım, yön seçtim, adet ve aralık girdim, o
  // yönde o kadar masa açtı") — sol menüdeki "Masa çoğalt" düğmesinin altında açılan mini form.
  const [cogaltAcik, setCogaltAcik] = useState(false);
  const [cogaltYon, setCogaltYon] = useState<"sag" | "sol" | "yukari" | "asagi">("sag");
  const [cogaltAdet, setCogaltAdet] = useState("3");
  // Çoğaltmada masalar arası varsayılan aralık: programın kendi masa arası mesafesi (Gökhan,
  // 2026-08-12: "çoğalttım ama hepsi bitişik, bunun varsayılan aralığı vardı"). 0 yazılıydı,
  // kopyalar dip dibe çıkıyordu. Aynı ölçüyü kullanınca yerleşim sonradan bu masaları
  // itmek zorunda kalmıyor — kopyalar zaten doğru aralıkta doğuyor.
  const [cogaltAralik, setCogaltAralik] = useState(String(Math.round(AYRI_MESAFE / PX_PER_CM)));
  const [ogeler, setOgeler] = useState<SalonOge[]>([]);
  // İşletmeye özel masa ölçüleri (Ayarlar > Masa Ölçüleri'nde girilir) — girilmeyen
  // kombinasyonlar CM_OLCU varsayılanını kullanmaya devam eder.
  const [ozelOlculer, setOzelOlculer] = useState<MasaOlcusu[]>([]);
  // "Öğe ekle" açılır listesi. Sol menü kendi içinde kaydırılabilir bir kutu (overflow:auto);
  // liste kutunun içine mutlak yerleştirilince alt kenardan taşan kısmı kırpılıyordu —
  // düğmeler çoğalınca liste hiç görünmez oldu (Gökhan, 2026-08-19: "öğe ekle dediğimde sol
  // menü aşağıya inmiyor"). Artık sağ tık menüleri gibi ekrana sabitleniyor, düğmenin altına
  // açılıyor, yer yoksa yukarı taşıyor.
  const [ogeMenuAcik, setOgeMenuAcik] = useState(false);
  const [ogeMenuKonum, setOgeMenuKonum] = useState<{ x: number; y: number } | null>(null);
  const [ogeCtxMenu, setOgeCtxMenu] = useState<{ x: number; y: number; oge: SalonOge } | null>(null);
  // Salon ölçeklendirme (Gökhan: "salon ölçeklendirmeyi nasıl yapacağız") — gerçek en/boy (m)
  // girişi + yakınlaştırma. olcuInput sadece salon değişince senkronlanır (poll her 6sn'de
  // areas'ı tazeliyor — sürekli senkronlarsak yazarken input elinden kayar).
  const [olcuInput, setOlcuInput] = useState<{ genislik: string; derinlik: string }>({ genislik: "", derinlik: "" });
  const [zoom, setZoom] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  const panStart = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const pendingAnchor = useRef<{ contentX: number; contentY: number; clientX: number; clientY: number } | null>(null);
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  // Ref değil state — react-hooks/refs kuralı render sırasında ref okuma/yazmayı da yasaklıyor,
  // bu yüzden "bu salon ziyaretinde bir kez sığdırdım" bayrağı da state olarak tutuluyor.
  // SADECE salon değişince sıfırlanır (aşağıda) — viewportSize'a bağlı DEĞİL, yoksa
  // yakınlaşınca beliren kaydırma çubuğu viewportSize'ı değiştirip zoom'u sürekli "tüm salonu
  // göster" seviyesine geri çekiyordu (Gökhan: "mouse ile uzaklaşıyor ama yaklaşmıyor").
  const [autoFitDone, setAutoFitDone] = useState(false);
  // Masalar/öğeler daha gelmeden sığdırma yapılırsa tuval boş sayılıp yanlış (fazla büyük)
  // bir oran seçiliyor, sonra masalar gelince plan taşıyordu. Sığdırma ilk veri geldikten
  // sonra çalışsın diye.
  const [yuklendi, setYuklendi] = useState(false);
  const [prevCevir, setPrevCevir] = useState(false);
  // Sığdırmanın hangi kutu ölçüsüyle yapıldığı — ekran döndüğünde yenilemek için.
  const [prevViewport, setPrevViewport] = useState({ w: 0, h: 0 });
  // Planın o anki büyüklüğü — değişince sığdırma yenilenir (masa eklendi/silindi, ölçü değişti).
  const [prevPlanImza, setPrevPlanImza] = useState("");
  // Kullanıcı elle yakınlaştırdı mı — yaptıysa program zoom'a karışmaz.
  const [elleZoom, setElleZoom] = useState(false);
  // Salon adına sağ tıklayınca çıkan küçük menü — silme buradan.
  const [alanMenu, setAlanMenu] = useState<{ x: number; y: number; area: Area } | null>(null);
  // Sol menü (Gökhan, 2026-08-13: "salon sayfasına bir sol menü yapalım, bütün butonları
  // ayarları oraya alalım — işletme ismi satırı hariç"). Açık başlar, gizleme düğmesiyle
  // sola saklanır; tercih tarayıcıda kalır. Telefonda sol menü yok, orası kendi düzeninde.
  const [menuAcik, setMenuAcik] = useState(() => {
    try { return localStorage.getItem("rzv_salon_menu") !== "kapali"; } catch { return true; }
  });
  const menuDegistir = () => {
    setMenuAcik((v) => {
      const yeni = !v;
      try { localStorage.setItem("rzv_salon_menu", yeni ? "acik" : "kapali"); } catch { /* gizli sekmede kalıcı olmaz, sorun değil */ }
      return yeni;
    });
  };
  // Çevir düğmesi: programın otomatik kararını elle ters çevirir. Tek adım — basınca yatay,
  // tekrar basınca dikey. Salon değiştirilince sıfırlanır (aşağıdaki setSelectedAreaId'lerde).
  const [elleCevrildi, setElleCevrildi] = useState(false);

  // Salon değişince ölçü kutusu ve zoom sıfırlanır — bunu bir effect yerine render sırasında
  // yapıyoruz (React'in "prop değişince state sıfırla" deseni), yoksa react-hooks/set-state-in-effect
  // uyarısı tetikleniyordu.
  const [prevAreaId, setPrevAreaId] = useState<string | null | undefined>(undefined);
  if (selectedAreaId !== prevAreaId) {
    setPrevAreaId(selectedAreaId);
    const a = areas.find((x) => x.id === selectedAreaId);
    setOlcuInput({
      genislik: a?.genislik_cm ? String(Math.round(a.genislik_cm) / 100) : "",
      derinlik: a?.derinlik_cm ? String(Math.round(a.derinlik_cm) / 100) : "",
    });
    setZoom(1);
    setElleZoom(false);
    setAutoFitDone(false);
    // Salon değişince elle çevirme tercihi sıfırlanır — yeni salonun kendi doğru yönü var.
    setElleCevrildi(false);
  }

  useEffect(() => {
    let active = true;
    getMyReservationRestaurantId().then((id) => {
      if (!active) return;
      if (!id) { router.replace("/rezervasyon/giris"); return; }
      setRestaurantId(id);
    });
    return () => { active = false; };
  }, [router]);

  const load = useCallback(async (restId: string) => {
    const { start, end } = bugunSiniri();
    const [{ data: a }, { data: t }, { data: r }, { data: o }, { data: m }, { data: g }] = await Promise.all([
      supabase.from("dining_areas").select("id, name, sort_order, genislik_cm, derinlik_cm").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("restaurant_tables").select("id, name, area_id, status, sort_order, position_x, position_y, seat_count, shape, rotated, grup_id").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      // Sadece oturanlar değil, masası ayrılmış BEKLEYENLER de gösteriliyor — garson planda
      // hangi masada kimin olduğunu görsün (Gökhan: "masaların üzerinde rezervasyon isimleri
      // yazsın"). reservation_tables üzerinden gidiliyor ki birleştirilmiş masaların HEPSİNDE
      // isim çıksın, sadece birincil masada değil.
      supabase.from("reservations").select("id, guest_name, party_size, status, reservation_tables(table_id)")
        .eq("restaurant_id", restId).is("deleted_at", null)
        .in("status", ["bekleniyor", "geldi", "oturdu"])
        .gte("reserved_at", start).lt("reserved_at", end),
      supabase.from("salon_ogeleri").select("id, area_id, type, name, x1, y1, x2, y2, rotated").eq("restaurant_id", restId).is("deleted_at", null),
      supabase.from("masa_olculeri").select("shape, seat_tier, width_cm, height_cm").eq("restaurant_id", restId),
      // Masa grupları Ayarlar'da tanımlanıyor (loca, sahne önü, normal); hangi masanın hangi
      // grupta olduğu BURADA seçiliyor — masaya sağ tıkla (Gökhan, 2026-08-16).
      supabase.from("masa_gruplari").select("id, ad, renk").eq("restaurant_id", restId).is("deleted_at", null).order("sira"),
    ]);
    const areaRows = (a as Area[]) ?? [];
    setAreas(areaRows);
    setTables((t as TableRow[]) ?? []);
    setMasaGruplari((g as { id: string; ad: string; renk: string }[]) ?? []);
    const { data: pst } = await supabase.rpc("postam");
    setPostam(new Set(((pst as string[] | null) ?? [])));
    setOgeler((o as SalonOge[]) ?? []);
    setOzelOlculer((m as MasaOlcusu[]) ?? []);
    const map: Record<string, OturanBilgi> = {};
    let kisiToplam = 0;
    ((r as { guest_name: string; party_size: number; status: string; reservation_tables: { table_id: string }[] | null }[]) ?? []).forEach((row) => {
      const masalari = row.reservation_tables ?? [];
      if (masalari.length > 0) kisiToplam += row.party_size;
      masalari.forEach((rt) => {
        map[rt.table_id] = { guestName: row.guest_name, partySize: row.party_size, status: row.status };
      });
    });
    setOturanlar(map);
    setDoluKisi(kisiToplam);
    setSelectedAreaId((prev) => prev ?? (areaRows.length ? areaRows[0].id : null));
    setYuklendi(true);
  }, []);

  useEffect(() => { if (restaurantId) load(restaurantId); }, [restaurantId, load]);
  // Salon ekranına girildiğinde düzen bir kez tazelenir: biten rezervasyonların masaları
  // asıl yerine döner, bugünün birleşik masaları dip dibe gelir (Gökhan, 2026-08-10:
  // "salon sayfasına basınca kendi düzenine alsın sayfayı"). Masa ataması YAPMAZ, sadece
  // yerleri toparlar; düzenleme modunda çalışmaz ki masa sürüklerken altından oynamasın.
  // "Yerleşim yap" — salonu sıfırdan dizer. Sonuç kısa bir uyarı kutusuyla bildirilir;
  // masası bulunamayan rezervasyon varsa adı yazılır.
  const [yerlesimBusy, setYerlesimBusy] = useState(false);
  const yerlesimYapTikla = async () => {
    if (!restaurantId || yerlesimBusy) return;
    setYerlesimBusy(true);
    setErr(null);
    try {
      const sonuc = await yerlesimYap(restaurantId, bugunIstanbulGun());
      await load(restaurantId);
      // Notunda salon yazan ama o salonda yer olmayanlar işletmeye sorulur — program kendi
      // kafasına göre başka salona atmaz (Gökhan, 2026-08-12).
      const uyarilar = [
        sonuc.sorulacaklar.length > 0
          ? `Notunda istenen salonda yer yok, başka salona alınsın mı: ${sonuc.sorulacaklar.join(", ")}`
          : "",
        sonuc.yerlesemeyenler.length > 0 ? `Masa bulunamayan rezervasyon: ${sonuc.yerlesemeyenler.join(", ")}` : "",
      ].filter(Boolean);
      if (uyarilar.length > 0) setErr(uyarilar.join(" · "));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Yerleşim yapılamadı.");
    }
    setYerlesimBusy(false);
  };

  // "Varsayılana getir" — bütün masaları ASIL yerlerine döndürür (Gökhan, 2026-08-12).
  // Birleştirme/kaydırma yüzünden oynamış masalar normal_x/normal_y'ye geri konur, o iz de
  // silinir. Masa ataması ve rezervasyonlar değişmez; sadece salonun fiziksel düzeni sıfırlanır.
  const [sifirlaBusy, setSifirlaBusy] = useState(false);
  const varsayilanaGetir = async () => {
    if (!restaurantId || sifirlaBusy) return;
    const ok = await confirm(
      "Salon sıfırlanacak: masalar asıl yerlerine dönecek ve bugünkü masa atamaları kalkacak. Kilitli masalar olduğu gibi kalır. Rezervasyonlar silinmez, masasız kalır. Devam edilsin mi?",
      { danger: false },
    );
    if (!ok) return;
    setSifirlaBusy(true);
    setErr(null);

    // 1) Bugünün masa atamaları kalkar — salon boşalır, rezervasyonlar listede masasız kalır.
    const gunBas = new Date(`${bugunIstanbulGun()}T00:00:00+03:00`).toISOString();
    const gunSon = new Date(`${bugunIstanbulGun()}T00:00:00+03:00`);
    gunSon.setDate(gunSon.getDate() + 1);
    // KİLİTLİ REZERVASYONA DOKUNULMAZ (Gökhan, 2026-08-12): "masa kilitliyse varsayılana bile
    // getirsen, tamamlandı işaretlenmeden o kilitli masa hep orada olacak". Kilit, müşteriye
    // söz verilmiş masa demek: sıfırlama onun ATAMASINI bozmaz, masa yine o rezervasyonundur.
    // Masanın plandaki yeri ise düzelir — kayıtlı düzene döner (Gökhan, 2026-08-14).
    const { data: gunRez } = await supabase.from("reservations")
      .select("id, masa_kilit, reservation_tables(table_id)")
      .eq("restaurant_id", restaurantId).is("deleted_at", null)
      .gte("reserved_at", gunBas).lt("reserved_at", gunSon.toISOString());
    type GunKayit = { id: string; masa_kilit: boolean; reservation_tables: { table_id: string }[] | null };
    const kayitlar = (gunRez as GunKayit[]) ?? [];
    // Kilitli rezervasyonun masaları YERİNE döner ama ATAMASI durur — durumu "boş" yazılmaz,
    // yoksa masa rezervasyon üstündeyken boş rengine dönüyordu (Gökhan, 2026-08-14: "rengi gitti,
    // kilitli rezervasyon hâlâ orada ama renk boş masa rengi").
    const kilitliMasaIds = new Set(
      kayitlar.filter((r) => r.masa_kilit).flatMap((r) => (r.reservation_tables ?? []).map((x) => x.table_id)),
    );
    const rezIds = kayitlar.filter((r) => !r.masa_kilit).map((r) => r.id);
    if (rezIds.length > 0) {
      await supabase.from("reservation_tables").delete().in("reservation_id", rezIds);
      await supabase.from("reservations").update({ table_id: null }).in("id", rezIds);
    }

    // 2) Masalar asıl yerlerine döner ve boşalır.
    const { data } = await supabase.from("restaurant_tables")
      .select("id, normal_x, normal_y")
      .eq("restaurant_id", restaurantId).is("deleted_at", null);

    // Kilitli masalar yerinden oynamıyor; onların KAPLADIĞI alan dolu sayılır. Asıl yerine
    // dönecek bir masa oraya denk geliyorsa gönderilmez, olduğu yerde bırakılır — yoksa
    // üst üste binerler (Gökhan, 2026-08-12: "varsayılana alınca yerine geliyor, orada masa
    // varsa gelmemeli").
    const kutu = (t: TableRow, x: number, y: number) => {
      const o = govdeCizim(t.shape, t.seat_count, t.rotated, ozelOlculer);
      return {
        sol: x + (BOX_W - o.width) / 2, sag: x + (BOX_W + o.width) / 2,
        ust: y + (BOX_H - o.height) / 2, alt: y + (BOX_H + o.height) / 2,
      };
    };
    const cakisir = (a: ReturnType<typeof kutu>, b: ReturnType<typeof kutu>) =>
      a.sol < b.sag && b.sol < a.sag && a.ust < b.alt && b.ust < a.alt;
    // HER SALON KENDİ İÇİNDE. Eskiden bütün salonların masaları tek listede karşılaştırılıyordu;
    // ayrı salonların tuvalleri ayrı olduğu için koordinatlar çakışıyor ve TERAS'taki bir masa,
    // MERKEZ'deki kilitli masaya çarpmış sayılıp kenara itiliyordu. Ekranda her şey yerli
    // yerindeyken "3 masa asıl yerine dönemedi" uyarısı bundan çıkıyordu (Gökhan, 2026-08-12:
    // "masalar yerinde aslında, bu saçma").
    const ayni = (a: TableRow | undefined, b: TableRow) => !!a && a.area_id === b.area_id;
    // Bu turda kenara konmuş masalar da engeldir. Eskiden her masa tek başına hesaplanıyordu:
    // aynı kilitli masaya çarpan masaların HEPSİ aynı noktaya ("kilitlinin sağına 26 px")
    // gönderiliyor, üst üste biniyorlardı — üç masa planda kayboluyordu (Gökhan, 2026-08-12).
    const konulanlar: { masa: TableRow; k: ReturnType<typeof kutu> }[] = [];
    // HENÜZ YERİNE DÖNMEMİŞ masaların gidecekleri yerler de doludur. Yoksa sıradaki masa,
     // birazdan başka bir masanın oturacağı noktaya konuyor ve ikisi üst üste biniyordu
     // (Gökhan, 2026-08-14 ekran görüntüsü: Bahçe 41 ile Bahçe 1 iç içe).
    const hedefler = ((data as { id: string; normal_x: number | null; normal_y: number | null }[]) ?? [])
      .map((d) => {
        const m = tables.find((x) => x.id === d.id);
        if (!m) return null;
        const hx = d.normal_x ?? m.position_x ?? 0;
        const hy = d.normal_y ?? m.position_y ?? 0;
        return { id: d.id, masa: m, k: kutu(m, hx, hy) };
      })
      .filter((x): x is { id: string; masa: TableRow; k: ReturnType<typeof kutu> } => !!x);
    let engellenen = 0;

    for (const t of (data as { id: string; normal_x: number | null; normal_y: number | null }[]) ?? []) {
      // KİLİTLİ MASA DA YERİNE DÖNER. Kilit, masanın başkasına verilmesini ve programın onu
      // kendiliğinden oynatmasını engeller; ama bu düğme işletmenin açık emri: "her şeyi
      // kayıtlı düzene döndür". Kilitliler hariç tutulunca yanlış yere park etmiş bir kilitli
      // masa bir daha asla düzelmiyor, üstelik başkasının yerini işgal ediyordu
      // (Gökhan, 2026-08-14: "yerine gitmeyen masa kilitli masa"). Rezervasyonun masası
      // değişmiyor, sadece masanın planındaki yeri düzeliyor.
      const masa = tables.find((x) => x.id === t.id);
      if (masa && t.normal_x !== null && t.normal_y !== null) {
        const hedef = kutu(masa, t.normal_x, t.normal_y);
        // Sadece AYNI SALONDAKİ doluluklar engel sayılır.
        const dolular = [
          ...konulanlar.filter((c) => ayni(c.masa, masa)).map((c) => c.k),
          // Kendisi hariç, yerine dönecek öteki masaların hedefleri.
          ...hedefler.filter((h) => h.id !== t.id && ayni(h.masa, masa)).map((h) => h.k),
        ];
        if (dolular.some((k) => cakisir(hedef, k))) {
          // Asıl yeri kilitli masayla dolu. Masa dışarıda bırakılmaz — KENDİ SIRASINDA, salonun
          // içinde en yakın boş noktaya konur (Gökhan, 2026-08-12: "orada masa varsa gelmemeli"
          // ama dışarıda da kalmamalı). Kilitli masaların sağından başlanır, sığmazsa solu denenir.
          const sirada = tables.filter((x) => ayni(x, masa) && Math.abs((x.position_y ?? 0) - (t.normal_y ?? 0)) <= 60);
          const sagSinir = Math.max(...sirada.map((x) => kutu(x, x.position_x ?? 0, 0).sag));
          const solSinir = Math.min(...sirada.map((x) => kutu(x, x.position_x ?? 0, 0).sol));
          const gen = hedef.sag - hedef.sol;
          // Aynı salondaki, aynı sıradaki dolu yerler.
          const ayniSiradaDolu = dolular
            .filter((k) => k.ust < hedef.alt && hedef.ust < k.alt)
            .sort((a, b) => a.sol - b.sol);
          let sol = hedef.sol;
          for (let d = 0; d < ayniSiradaDolu.length + 1; d++) {
            const carpan = ayniSiradaDolu.find((k) => sol < k.sag && k.sol < sol + gen);
            if (!carpan) break;
            sol = carpan.sag + 26;
          }
          if (sol + gen > sagSinir) {
            // Sağda yer kalmadı — soldan dene.
            sol = solSinir;
            for (let d = 0; d < ayniSiradaDolu.length + 1; d++) {
              const carpan = ayniSiradaDolu.find((k) => sol < k.sag && k.sol < sol + gen);
              if (!carpan) break;
              sol = carpan.sag + 26;
            }
          }
          const govdeEn = govdeCizim(masa.shape, masa.seat_count, masa.rotated, ozelOlculer).width;
          const yeniX = Math.round(sol - (BOX_W - govdeEn) / 2);
          await supabase.from("restaurant_tables")
            .update({ position_x: yeniX, position_y: t.normal_y, normal_x: null, normal_y: null,
              ...(kilitliMasaIds.has(t.id) ? {} : { status: "empty" }) })
            .eq("id", t.id);
          konulanlar.push({ masa, k: kutu(masa, yeniX, t.normal_y) });
          // Uyarı sadece masa GERÇEKTEN yerinden olduğunda anlamlı. Bir tık yana kaymışsa
          // (yerini kaybetmemiş, komşusuna yaslanmış) kimseyi meşgul etmeye gerek yok
          // (Gökhan, 2026-08-12: "sadece birisi yanındakine bitişmiş, sorun yok aslında").
          if (Math.abs(yeniX - t.normal_x) > BOX_W / 2) engellenen++;
          continue;
        }
      }
      const bosalt = kilitliMasaIds.has(t.id) ? {} : { status: "empty", reservation_note: null };
      const geri = t.normal_x !== null && t.normal_y !== null
        ? { position_x: t.normal_x, position_y: t.normal_y, normal_x: null, normal_y: null, ...bosalt }
        : bosalt;
      await supabase.from("restaurant_tables").update(geri).eq("id", t.id);
      // Yerine oturan masa da bundan sonrakiler için doludur.
      if (masa) {
        const x = t.normal_x ?? masa.position_x ?? 0;
        const y = t.normal_y ?? masa.position_y ?? 0;
        konulanlar.push({ masa, k: kutu(masa, x, y) });
      }
    }

    if (engellenen > 0) {
      // Sebep her zaman kilit değil: iki masanın kayıtlı varsayılan yeri aynıysa da biri kenara
       // kayıyor (Gökhan, 2026-08-14: "kilitli masa yok zaten"). Metin artık suçlu göstermiyor.
      setErr(`${engellenen} masa kendi yerine dönemedi — orası doluydu, kendi sırasında en yakın boş yere kondu.`);
    }
    // Kilitli rezervasyonun masaları hâlâ o rezervasyonun: hepsi kendi yerine döndükten
    // sonra düzen tazelenir ve o masalar çıpanın yanında yeniden birleşir. Kilitli bir masa
    // ancak eşiyle birleştiği için yerinden çıkar; tek başınaysa zaten kendi yerindedir
    // (Gökhan, 2026-08-14).
    await salonDuzeniniTazele(restaurantId, bugunIstanbulGun());
    await load(restaurantId);
    // Kayıtlı düzen geri geldiğinde EKRAN da kendi ölçeğine döner — elle yakınlaştırılmış
    // hâlde kalırsa işletme getirdiği düzeni göremiyor (Gökhan, 2026-08-13: "varsayılanı getir,
    // salonu büyüttüğünde geri getirmiyor").
    setElleZoom(false);
    setAutoFitDone(false);
    setSifirlaBusy(false);
  };

  // BOŞTA OLAN REZERVASYONLAR — masaya oturtulacak adaylar (Gökhan, 2026-08-12: "masaya
  // tıkladığımda rezervasyon listesi açılsın, orada seçsin oturtacağı rezervasyonu").
  // Yedekler listede yok — masa tutmazlar. Zaten oturmuş rezervasyonlar da yok.
  // 2026-08-19'dan beri ayrı pencerede değil, masanın SAĞ TIK menüsünün üstünde duruyor.
  type OturtAdayi = { id: string; guest_name: string; party_size: number; reserved_at: string; status: string };
  const [oturtMasa, setOturtMasa] = useState<TableRow | null>(null);
  const [oturtAdaylar, setOturtAdaylar] = useState<OturtAdayi[] | null>(null);
  const [oturtBusy, setOturtBusy] = useState(false);

  const oturtmaAc = async (t: TableRow) => {
    if (!restaurantId) return;
    setOturtMasa(t);
    setOturtAdaylar(null);
    const g = bugunIstanbulGun();
    const bas = new Date(`${g}T00:00:00+03:00`).toISOString();
    const bit = new Date(new Date(`${g}T00:00:00+03:00`).getTime() + 86400000).toISOString();
    const { data, error } = await supabase.from("reservations")
      .select("id, guest_name, party_size, reserved_at, status")
      .eq("restaurant_id", restaurantId).is("deleted_at", null).eq("yedek", false)
      .in("status", ["bekleniyor", "geldi"])
      .gte("reserved_at", bas).lt("reserved_at", bit)
      .order("reserved_at", { ascending: true });
    if (error) { setErr(error.message); return; }
    setOturtAdaylar((data as OturtAdayi[]) ?? []);
  };

  // SADECE MASA ATAR — misafiri gelmiş saymaz (Gökhan, 2026-08-12: "direkt geldi olarak
  // aldı"). Salon akşam öncesi düzenlenirken kimse gelmiş sayılmamalı.
  //
  // Seçilen masa gruba yetmiyorsa program KENDİ TAMAMLAR: en yakın boş masaları, önce aynı
  // sıradakileri, kişi sayısı karşılanana kadar ekler ve hepsini birleştirir (Gökhan,
  // 2026-08-12: "12 kişilik rezervasyona 2 kişilik masayı seçtim, yanındakileri birleştirmedi
  // ya da 12 kişiyi buraya alabilir miyim diye bakmadı"). Yetmiyorsa hiç atama yapmaz, söyler.
  const oturtSec = async (rez: OturtAdayi) => {
    if (!oturtMasa || oturtBusy) return;
    setOturtBusy(true);
    setErr(null);

    // Masa BAŞKASINDA mı? Üstüne yazmak yok — sorulur, onay verilirse eski rezervasyondan
    // alınır (Gökhan, 2026-08-12: "dolu masaya başka rezervasyon ekledim, üzerine eklendi").
    const g0 = bugunIstanbulGun();
    const bas0 = new Date(`${g0}T00:00:00+03:00`).toISOString();
    const bit0 = new Date(new Date(`${g0}T00:00:00+03:00`).getTime() + 86400000).toISOString();
    const { data: gunRez } = await supabase.from("reservations")
      .select("id, guest_name, party_size, table_id, reservation_tables(table_id)")
      .eq("restaurant_id", restaurantId!).is("deleted_at", null).eq("yedek", false)
      .in("status", ["bekleniyor", "geldi", "oturdu"])
      .gte("reserved_at", bas0).lt("reserved_at", bit0);
    type GunRez = { id: string; guest_name: string; party_size: number; table_id: string | null; reservation_tables: { table_id: string }[] | null };
    const hepsi = (gunRez as GunRez[]) ?? [];
    const eskiSahip = hepsi.find((r) => r.id !== rez.id && (r.reservation_tables ?? []).some((x) => x.table_id === oturtMasa.id));
    if (eskiSahip) {
      setOturtBusy(false);
      const ok = await confirm(
        `${oturtMasa.name} şu an ${eskiSahip.guest_name} (${eskiSahip.party_size} kişi) rezervasyonunda. Ondan alınıp ${rez.guest_name} için mi ayrılsın?`,
        { danger: true },
      );
      if (!ok) return;
      setOturtBusy(true);
      const kalan = (eskiSahip.reservation_tables ?? []).map((x) => x.table_id).filter((id) => id !== oturtMasa.id);
      await supabase.from("reservation_tables").delete().eq("reservation_id", eskiSahip.id).eq("table_id", oturtMasa.id);
      if (eskiSahip.table_id === oturtMasa.id) {
        await supabase.from("reservations").update({ table_id: kalan[0] ?? null }).eq("id", eskiSahip.id);
      }
    }

    const secilen: TableRow[] = [oturtMasa];
    let koltuk = oturtMasa.seat_count ?? 0;
    // Tamamlama: en yakın masa değil, KALANI EN AZ İSRAFLA kapatan masa seçilir; öncelik hep
    // aynı sıra (Gökhan, 2026-08-12: "8 kişilik için 6'lık seçtim, yanındaki 4'lüğü aldı,
    // aynı sıradan 2 kişilik çekmesi gerekiyordu"). Yakınlık artık son ölçüt.
    const bos = tables.filter((t) => t.id !== oturtMasa.id && !oturanlar[t.id]);
    const ayniSira = (m: TableRow) => Math.abs((m.position_y ?? 0) - (oturtMasa.position_y ?? 0)) <= 60;
    while (koltuk < rez.party_size && bos.length > 0) {
      const kalan = rez.party_size - koltuk;
      const uyum = (m: TableRow) => {
        const s = m.seat_count ?? 0;
        return s >= kalan ? s - kalan : 100 + (kalan - s); // tam kapatan önce, küçükler sonra
      };
      bos.sort((a, b) => {
        const ra = ayniSira(a) ? 0 : 1, rb = ayniSira(b) ? 0 : 1;
        if (ra !== rb) return ra - rb;
        const fa = uyum(a), fb = uyum(b);
        if (fa !== fb) return fa - fb;
        return Math.abs((a.position_x ?? 0) - (oturtMasa.position_x ?? 0))
             - Math.abs((b.position_x ?? 0) - (oturtMasa.position_x ?? 0));
      });
      const sec = bos.shift()!;
      secilen.push(sec);
      koltuk += sec.seat_count ?? 0;
    }
    if (koltuk < rez.party_size) {
      setOturtBusy(false);
      setErr(`${rez.guest_name} (${rez.party_size} kişi) için yeterli boş masa yok — en fazla ${koltuk} kişilik yer çıktı.`);
      return;
    }

    const { error } = await supabase.rpc("assign_reservation_tables", {
      p_reservation_id: rez.id, p_table_ids: secilen.map((t) => t.id),
    });
    setOturtBusy(false);
    if (error) { setErr(error.message); return; }
    if (secilen.length > 1) {
      setErr(`${rez.guest_name} için ${secilen.length} masa birleştirildi: ${secilen.map((t) => t.name).join(", ")}.`);
    }
    setOturtMasa(null); setOturtAdaylar(null); setCtxMenu(null);
    // Birleşen masalar planda da yan yana gelsin — atama tek başına masaları oynatmıyordu,
    // sadece rengi değişip ismi yazıyordu (Gökhan, 2026-08-12: "birleşmedi, sadece renk
    // değişti"). Salon düzenini tazeleyen fonksiyon masaları dip dibe getiriyor.
    if (restaurantId) {
      await salonDuzeniniTazele(restaurantId, bugunIstanbulGun());
      await load(restaurantId);
    }
  };

  // Salon ekranına girildiğinde düzen bir kez tazelenir. Tazeleme BİTMEDEN plan çizilmez:
  // yoksa masalar önce veritabanındaki ham (dağınık) yerleriyle görünüyor, birkaç saniye sonra
  // yerlerine oturuyordu (Gökhan, 2026-08-14: "ilk açışta kaymalar oluyor, dağınık geliyor,
  // 5-6 saniye sonra düzeliyor").
  const [duzenHazir, setDuzenHazir] = useState(false);
  const duzenTazelendi = useRef(false);
  useEffect(() => {
    if (!restaurantId || duzenTazelendi.current) return;
    duzenTazelendi.current = true;
    salonDuzeniniTazele(restaurantId, bugunIstanbulGun())
      .then(() => load(restaurantId))
      .finally(() => setDuzenHazir(true));
  }, [restaurantId, load]);
  // Plan canlı kalsın — rezervasyon ekranında kişi sayısı değişince ya da program masaları
  // yeniden dizince salon kendiliğinden güncellensin (Gökhan: "bunlar canlı yansımalı").
  //
  // AMA MASA SÜRÜKLENİRKEN DURUR. Eskiden bu korumayı "düzenleme modu" sağlıyordu; o mod
  // kalkınca tazeleme sürüklemenin altından çalışmaya başladı: elindeki masa veritabanındaki
  // eski yerine geri sıçrıyor, düzen bozuk görünüyordu (Gökhan, 2026-08-13: "masa düzenleri
  // bozuk geliyor, kendiliğinden değişiyor, masalar yerinden kayıyor"). Sürükleme bitince
  // tazeleme kaldığı yerden devam eder.
  const surukleniyor = useRef(false);
  useEffect(() => {
    if (!restaurantId) return;
    const id = setInterval(() => { if (!surukleniyor.current) load(restaurantId); }, 6000);
    return () => clearInterval(id);
  }, [restaurantId, load]);

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // İki parmak SADECE plan kutusunu yakınlaştırsın, sayfanın kendisini değil (Gökhan,
  // 2026-08-10: "parmakla küçültüp büyütme tüm ekrana uygulanıyor, sadece masaların olduğu
  // kutuya değil"). İki ayrı fren gerekiyor: sayfa kökündeki touchAction (aşağıda) Android/
  // Chrome tarafını kesiyor, iPhone Safari ise sayfa yakınlaştırmasını ayrı "gesture"
  // olaylarıyla yapıyor — onlar da burada durduruluyor. Sadece bu sayfa açıkken geçerli.
  useEffect(() => {
    if (!isMobile) return;
    const engelle = (e: Event) => e.preventDefault();
    const olaylar = ["gesturestart", "gesturechange", "gestureend"];
    olaylar.forEach((ad) => document.addEventListener(ad, engelle, { passive: false }));
    return () => olaylar.forEach((ad) => document.removeEventListener(ad, engelle));
  }, [isMobile]);

  // Fare tekerleğiyle yakınlaştırırken imlecin altındaki nokta yerinde kalsın diye — zoom
  // state değiştikten SONRA (DOM yeni ölçekle güncellendikten sonra) kaydırma konumu ayarlanıyor.
  useEffect(() => {
    const anchor = pendingAnchor.current;
    const el = viewportRef.current;
    if (!anchor || !el) return;
    el.scrollLeft = anchor.contentX * zoom - anchor.clientX;
    el.scrollTop = anchor.contentY * zoom - anchor.clientY;
    pendingAnchor.current = null;
  }, [zoom]);

  // Görünür tuval kutusunun piksel boyutu — "tüm salonu göster" hesabı için gerekli.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box) setViewportSize({ w: box.width, h: box.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [selectedAreaId]);

  // İki parmakla yakınlaştırma (tablet) — Pointer Events masa sürüklemesiyle karışmasın diye
  // ayrı, native touch event dinleyicileri (React'ın sentetik pointer capture akışının dışında).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    let baslangicMesafe = 0;
    let baslangicZoom = 1;
    const mesafe = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) { baslangicMesafe = mesafe(e.touches); baslangicZoom = zoomRef.current; }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && baslangicMesafe > 0) {
        e.preventDefault();
        setElleZoom(true);
        setZoom(Math.min(6, Math.max(0.1, baslangicZoom * (mesafe(e.touches) / baslangicMesafe))));
      }
    };
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => { el.removeEventListener("touchstart", onTouchStart); el.removeEventListener("touchmove", onTouchMove); };
  }, [selectedAreaId]);

  // Fare tekerleği ile yakınlaştır — React'in onWheel JSX prop'u tarayıcıda PASİF olarak
  // bağlanıyor, preventDefault sessizce yok sayılıyor ve native sayfa kaydırması zoom'la
  // birlikte çalışıp çakışıyordu (Gökhan: "mouse ile yaklaştırmada da problem var") — bu
  // yüzden native, passive:false bir dinleyici gerekiyor.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const prevZoom = zoomRef.current;
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = Math.min(6, Math.max(0.1, prevZoom * factor));
      pendingAnchor.current = {
        contentX: (e.clientX - rect.left + el.scrollLeft) / prevZoom,
        contentY: (e.clientY - rect.top + el.scrollTop) / prevZoom,
        clientX: e.clientX - rect.left,
        clientY: e.clientY - rect.top,
      };
      setElleZoom(true);
      setZoom(newZoom);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [selectedAreaId]);

  const saveOlcu = async () => {
    if (!selectedAreaId) return;
    const g = parseFloat(olcuInput.genislik.replace(",", "."));
    const d = parseFloat(olcuInput.derinlik.replace(",", "."));
    const genislik_cm = Number.isFinite(g) && g > 0 ? Math.round(g * 100) : null;
    const derinlik_cm = Number.isFinite(d) && d > 0 ? Math.round(d * 100) : null;
    const { error } = await supabase.from("dining_areas").update({ genislik_cm, derinlik_cm }).eq("id", selectedAreaId);
    if (error) { setErr(error.message); return; }
    if (restaurantId) await load(restaurantId);
    // Ölçü girilir girilmez salon doğru yöne dönsün ve ekranda en büyük hâline geçsin —
    // düzenlemeyi bitirmeyi beklemeden (Gökhan, 2026-08-12: "rakamı girdi, hemen salon en
    // büyük görüntüsüne geçecek"). Elle çevirme tercihi de sıfırlanır; yeni ölçüyle program
    // kendi doğru kararını versin.
    setElleCevrildi(false);
    setAutoFitDone(false);
  };

  // BU DÜZENİ VARSAYILAN YAP — masaların şu anki yerleri salonun kalıcı düzeni olur
  // (Gökhan, 2026-08-13: "varsayılan oradan belirlensin"). Masanın hatırlanan eski yeri
  // silinir; bundan sonra program masayı birleştirme için oynattığında BURAYA geri döndürür.
  const [varsayilanBusy, setVarsayilanBusy] = useState(false);
  const varsayilanYap = async () => {
    if (!restaurantId || !selectedAreaId || varsayilanBusy) return;
    const buSalon = tables.filter((t) => t.area_id === selectedAreaId);
    const ok = await confirm(
      `Bu salondaki ${buSalon.length} masanın şu anki yeri kalıcı düzen olarak kaydedilecek. Bundan sonra masalar buraya döner. Onaylıyor musun?`,
      { danger: false },
    );
    if (!ok) return;
    setVarsayilanBusy(true); setErr(null);
    const { error } = await supabase.from("restaurant_tables")
      .update({ normal_x: null, normal_y: null })
      .eq("restaurant_id", restaurantId).eq("area_id", selectedAreaId).is("deleted_at", null);
    setVarsayilanBusy(false);
    if (error) { setErr(error.message); return; }
    await load(restaurantId);
  };

  const renameArea = async (id: string, name: string) => {
    await supabase.from("dining_areas").update({ name: toUpperTr(name) }).eq("id", id);
    // Nota yazılan salon adı doğrudan salonun kendi adından okunuyor; ad değişince kural da
    // kendiliğinden değişmiş olur, ayrıca yapılacak bir şey yok.
    if (restaurantId) await load(restaurantId);
  };
  const deleteArea = async (a: Area) => {
    const count = tables.filter((t) => t.area_id === a.id).length;
    if (count > 0) {
      const ok = await confirm(`Bu salonda ${count} masa var. Silersen masalar da silinir. Yine de silinsin mi?`, { confirmLabel: "Sil" });
      if (!ok) return;
    }
    setErr(null);
    const simdi = new Date().toISOString();
    // SALON SİLİNİNCE İÇİNDEKİ MASALAR DA SİLİNİR (Gökhan, 2026-08-15: "salon silindiyse
    // masalar da silinmiştir"). Eskiden sadece salon siliniyordu; masalar ait oldukları salon
    // olmadan ortada kalıyordu — hiçbir ekranda görünmüyor ama kapasiteye sayılıyor ve
    // rezervasyon alabiliyordu. Silinen bir BAHÇE salonunun 4 masası tam böyle kalmıştı.
    const masaIds = tables.filter((t) => t.area_id === a.id).map((t) => t.id);
    if (masaIds.length > 0) {
      // Önce bağları kopar — rezervasyon silinmiş masayı tutmaya devam etmesin.
      await supabase.from("reservation_tables").delete().in("table_id", masaIds);
      await supabase.from("reservations").update({ table_id: null }).in("table_id", masaIds);
      const { error: mErr } = await supabase.from("restaurant_tables")
        .update({ deleted_at: simdi, status: "empty", reservation_note: null })
        .in("id", masaIds);
      if (mErr) { setErr(mErr.message); return; }
    }
    const { error } = await supabase.from("dining_areas").update({ deleted_at: simdi }).eq("id", a.id);
    if (error) { setErr(error.message); return; }
    if (selectedAreaId === a.id) setSelectedAreaId(null);
    if (restaurantId) await load(restaurantId);
  };
  const addArea = async () => {
    if (!restaurantId || !newAreaName.trim()) return;
    setErr(null);
    // Ölçü salon açılırken giriliyor (Gökhan, 2026-08-13: "salon açılırken ölçüleri de girilir").
    // Girilmezse İLK SALONUN ölçüsüyle açılır — uzun kenarı bulma, ekrana sığdırma, duvara
    // dayanma… hepsi ölçüye bağlı; ölçüsüz açılan salon farklı davranıyordu.
    const m = (v: string) => {
      const n = parseFloat(v.replace(",", "."));
      return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
    };
    const elle = { genislik_cm: m(yeniEn), derinlik_cm: m(yeniBoy) };
    const olcu = elle.genislik_cm && elle.derinlik_cm ? elle : yeniSalonOlcusu(areas[0]);
    const { data, error } = await supabase.from("dining_areas").insert({
      restaurant_id: restaurantId, name: toUpperTr(newAreaName), sort_order: areas.length, ...olcu,
    }).select("id").single();
    if (error) { setErr(error.message); return; }
    setNewAreaName(""); setYeniEn(""); setYeniBoy(""); setAddingArea(false);
    await load(restaurantId);
    if (data) setSelectedAreaId(data.id);
  };

  const addTable = async () => {
    if (!restaurantId || !selectedAreaId || !newTableName.trim()) return;
    const seats = parseInt(newTableSeats, 10);
    if (!Number.isFinite(seats) || seats < 1 || seats > 50) { setErr("Koltuk sayısı 1 ile 50 arasında olmalı."); return; }
    setErr(null);
    const count = tables.filter((t) => t.area_id === selectedAreaId).length;
    const { error } = await supabase.from("restaurant_tables").insert({
      restaurant_id: restaurantId, name: toTitleTr(newTableName), area_id: selectedAreaId, status: "empty", sort_order: count,
      shape: newTableShape, seat_count: seats,
    });
    if (error) { setErr(error.message); return; }
    setNewTableName(""); setNewTableShape("kare"); setNewTableSeats("4"); setAddingTable(false);
    await load(restaurantId);
  };
  const renameTable = async (id: string, name: string) => {
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").update({ name: toTitleTr(name) }).eq("id", id);
    if (error) { setErr(error.message); return; }
    if (restaurantId) await load(restaurantId);
  };
  // Grup seçme modu açıldığında hâlihazırda o grupta olan masalar işaretli gelir; işletme
  // ekleyip çıkarır, Kaydet'te fark yazılır. Salon değiştirse de seçim korunur.
  useEffect(() => {
    if (!grupParam || grupHazir || tables.length === 0) return;
    const t = setTimeout(() => {
      setGrupSecim(new Set(tables.filter((x) => x.grup_id === grupParam).map((x) => x.id)));
      setGrupHazir(true);
    }, 0);
    return () => clearTimeout(t);
  }, [grupParam, grupHazir, tables]);

  const grupMasaSec = (id: string) => setGrupSecim((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const grupIptal = () => router.push("/rezervasyon/ayarlar");

  const grupKaydet = async () => {
    if (!grupParam || grupBusy) return;
    setGrupBusy(true); setErr(null);
    // Seçilenler gruba bağlanır, gruptan çıkarılanların bağı koparılır.
    const eklenecek = tables.filter((t) => grupSecim.has(t.id) && t.grup_id !== grupParam).map((t) => t.id);
    const cikacak = tables.filter((t) => !grupSecim.has(t.id) && t.grup_id === grupParam).map((t) => t.id);
    if (eklenecek.length > 0) {
      const { error } = await supabase.from("restaurant_tables").update({ grup_id: grupParam }).in("id", eklenecek);
      if (error) { setGrupBusy(false); setErr(error.message); return; }
    }
    if (cikacak.length > 0) {
      const { error } = await supabase.from("restaurant_tables").update({ grup_id: null }).in("id", cikacak);
      if (error) { setGrupBusy(false); setErr(error.message); return; }
    }
    setGrupBusy(false);
    router.push("/rezervasyon/ayarlar");
  };

  // Masayı bir gruba bağlar ya da grubundan çıkarır. Minimum harcama/fiyat o gruptan geliyor.
  const grubaAta = async (id: string, grupId: string | null) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, grup_id: grupId } : t)));
    setCtxMenu((m) => (m && m.table ? { ...m, table: { ...m.table, grup_id: grupId } } : m));
    const { error } = await supabase.from("restaurant_tables").update({ grup_id: grupId }).eq("id", id);
    if (error) { setErr(error.message); if (restaurantId) await load(restaurantId); }
  };

  const saveSeatCount = async (id: string) => {
    const n = parseInt(koltukInput, 10);
    if (!Number.isFinite(n) || n < 1 || n > 50) { setErr("Koltuk sayısı 1 ile 50 arasında olmalı."); return; }
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").update({ seat_count: n }).eq("id", id);
    if (error) { setErr(error.message); return; }
    setCtxMenu(null);
    if (restaurantId) await load(restaurantId);
  };
  // Masa silme. Eskiden rezervasyona AYRILMIŞ masa da silinmiyordu; program "silinemez" deyip
  // geri çeviriyordu, işletme sildiğini sanıp masayı tekrar karşısında buluyordu (Gökhan,
  // 2026-08-14: "fazlalık masaları silsen de tekrar kayıtta kalıyor"). Artık sadece MİSAFİR
  // OTURUYORSA silinmiyor; ayrılmış masa rezervasyonundan çıkarılıp siliniyor.
  const deleteTable = async (t: TableRow) => {
    if (t.status === "occupied") { setErr("Bu masada misafir oturuyor — önce kalkması gerekiyor."); return; }
    const ayrilmis = t.status === "reserved";
    const ok = await confirm(
      ayrilmis
        ? `"${t.name}" bir rezervasyona ayrılmış. Masa rezervasyondan çıkarılıp silinsin mi?`
        : `"${t.name}" silinsin mi?`,
      { confirmLabel: "Sil" },
    );
    if (!ok) return;
    setErr(null);
    // Önce bağları kopar — rezervasyon silinmiş masayı tutmaya devam etmesin.
    await supabase.from("reservation_tables").delete().eq("table_id", t.id);
    await supabase.from("reservations").update({ table_id: null }).eq("table_id", t.id);
    const { error } = await supabase.from("restaurant_tables")
      .update({ deleted_at: new Date().toISOString(), status: "empty", reservation_note: null })
      .eq("id", t.id);
    if (error) { setErr(error.message); return; }
    if (restaurantId) await load(restaurantId);
  };
  // Yön→adım vektörü — sağ/sol X'te, yukarı/aşağı Y'de gerçek masa boyu + aralık kadar kayar.
  // Bu ok EKRANDA görülen yön. Plan 90 derece çevrikken (dikey salon, yatay ekran) planın kendi
  // ekseni ekrandakiyle aynı değil: ekranda sola gitmek planda aşağı gitmek demek. Ok aynen
  // uygulanınca "sol" dedin, masalar yukarıdan aşağıya diziliyordu (Gökhan, 2026-08-13: "bahçe
  // salonuna sol ok seçiyorum, yukarıdan aşağıya açıyor"). Sürüklemede kullanılan çeviri burada
  // da uygulanıyor — hangi salonda olursan ol ok, ekranda gördüğün yönü gösteriyor.
  const COGALT_ADIM: Record<string, { dx: number; dy: number }> = {
    sag: { dx: 1, dy: 0 }, sol: { dx: -1, dy: 0 }, asagi: { dx: 0, dy: 1 }, yukari: { dx: 0, dy: -1 },
  };
  // İsimdeki sondaki sayıyı bulup artırır (Masa 1 → Masa 2, Masa 3…); sayı yoksa " 2", " 3"
  // diye ekler. i (döngü sayacı) 0'dan başlıyor, bu yüzden +1 şart — yoksa ilk kopya
  // kaynakla AYNI adı alıyordu (Gökhan: "masa 1 çoğalt dedim, sonraki masa 2 olmalı,
  // şuan masa 1 diye başlıyor").
  const cogaltIsimUret = (isim: string, i: number) => {
    const m = isim.match(/^(.*?)(\d+)$/);
    if (m) return `${m[1]}${parseInt(m[2], 10) + i + 1}`;
    return `${isim} ${i + 1}`;
  };
  const cogaltTable = async (kaynak: TableRow, baseX: number, baseY: number) => {
    if (!restaurantId || !selectedAreaId) return;
    const adet = parseInt(cogaltAdet, 10);
    const aralikCm = parseFloat(cogaltAralik.replace(",", "."));
    if (!Number.isFinite(adet) || adet < 1 || adet > 50) { setErr("Çoğaltma adedi 1 ile 50 arasında olmalı."); return; }
    if (!Number.isFinite(aralikCm) || aralikCm < 0) { setErr("Aralık geçerli bir sayı olmalı."); return; }
    setErr(null);
    const olcu = govdeOlcusu(kaynak.shape, kaynak.seat_count, ozelOlculer);
    const govde = kaynak.shape === "dikdortgen" && kaynak.rotated ? { width: olcu.height, height: olcu.width } : olcu;
    // Ekranda seçilen yön planın kendi eksenine çevrilir (plan çevrikse ekran-sol = plan-aşağı).
    const ekranYon = COGALT_ADIM[cogaltYon];
    const adim = surukleFarki(ekranYon.dx, ekranYon.dy, cevir);
    const stepX = adim.dx * (govde.width + aralikCm * PX_PER_CM);
    const stepY = adim.dy * (govde.height + aralikCm * PX_PER_CM);
    const sayac = tablesInArea.length;

    // SALONA SIĞDIRARAK DİZ. Eskiden her kopya tek tek Math.max(0, …) ile sıfıra çekiliyordu:
    // sola çoğaltınca eksiye düşen bütün masalar aynı noktaya yığılıyordu (Gökhan, 2026-08-12:
    // "sol yönü seçtim, masaları üst üste açtı"). Artık masa duvara dayanınca bir alt satıra
    // (dikey çoğaltmada yan sütuna) geçip oradan devam ediyor — kaynak masaya dokunulmuyor.
    const solPay = (BOX_W - govde.width) / 2;
    const ustPay = (BOX_H - govde.height) / 2;
    const sagDuvar = odaGenislikPx, altDuvar = odaDerinlikPx;
    const sigar = (x: number, y: number) => duvarIcindeMi(x, y, govde, sagDuvar, altDuvar);
    // Satır/sütun başı: gidiş yönünün başladığı duvar.
    const bas = satirBasi(govde, sagDuvar, altDuvar);
    const satirBasiX = adim.dx > 0 ? bas.sol : bas.sag ?? baseX;
    const satirBasiY = adim.dy > 0 ? bas.ust : bas.alt ?? baseY;
    const yatay = adim.dx !== 0;
    const satirAtla = yatay ? govde.height + aralikCm * PX_PER_CM : govde.width + aralikCm * PX_PER_CM;

    const yerler: { x: number; y: number }[] = [];
    let tasan = 0;
    // Salonun ölçüsü girilmişse duvara dayanınca alt satıra geçilir. Ölçü yoksa duvarın nerede
    // olduğu bilinmiyor; o zaman dizilim bozulmasın diye BÜTÜN grup birlikte kaydırılır —
    // tek tek sıfıra çekmek masaları üst üste bindiriyordu.
    const duvarVar = yatay ? !!sagDuvar : !!altDuvar;
    if (!duvarVar) {
      for (let i = 1; i <= adet; i++) yerler.push({ x: baseX + stepX * i, y: baseY + stepY * i });
      const kaydirX = Math.max(0, -Math.min(...yerler.map((p) => p.x + solPay)));
      const kaydirY = Math.max(0, -Math.min(...yerler.map((p) => p.y + ustPay)));
      yerler.forEach((p) => { p.x += kaydirX; p.y += kaydirY; });
    } else {
      let x = baseX, y = baseY;
      for (let i = 0; i < adet; i++) {
        x += stepX; y += stepY;
        if (!sigar(x, y)) {
          // Duvara dayandı — bir sonraki satıra/sütuna geçilir ve oradan devam edilir.
          if (yatay) { x = satirBasiX; y += satirAtla; } else { y = satirBasiY; x += satirAtla; }
          // Yeni satır da sığmıyorsa salon dolmuş demektir; masa yine de üst üste binmez,
          // dizilim devam eder ve aşağıda haber verilir.
          if (!sigar(x, y)) { x = Math.max(x, -solPay); y = Math.max(y, -ustPay); tasan++; }
        }
        yerler.push({ x, y });
      }
    }

    const rows = yerler.map((p, i) => ({
      restaurant_id: restaurantId, area_id: selectedAreaId, name: toTitleTr(cogaltIsimUret(kaynak.name, i)),
      status: "empty", sort_order: sayac + i, shape: kaynak.shape, seat_count: kaynak.seat_count, rotated: kaynak.rotated,
      // Çoğaltılan masalar kaynağın grubunu da alır — yan yana dizilen localar tek tek
      // gruplanmasın (Gökhan, 2026-08-16).
      grup_id: kaynak.grup_id,
      position_x: Math.round(p.x), position_y: Math.round(p.y),
    }));
    const { error } = await supabase.from("restaurant_tables").insert(rows);
    if (error) { setErr(error.message); return; }
    if (tasan > 0) setErr(`${tasan} masa salona sığmadı, çizginin dışında kaldı — yerlerini elle ayarlayabilir ya da silebilirsin.`);
    setCtxMenu(null);
    setCogaltAcik(false);
    await load(restaurantId);
  };
  const moveTable = async (id: string, x: number, y: number) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, position_x: x, position_y: y } : t)));
    const { error } = await supabase.from("restaurant_tables").update({ position_x: x, position_y: y }).eq("id", id);
    if (error) setErr(error.message);
  };
  // Sadece dikdörtgen masalarda anlamlı — duvara dayalı masa yatay/dikey durabilsin
  // (Gökhan: "dikdörtgen masalar çevrilebilsin").
  const rotateTable = async (id: string, current: boolean) => {
    setTables((prev) => prev.map((t) => (t.id === id ? { ...t, rotated: !current } : t)));
    const { error } = await supabase.from("restaurant_tables").update({ rotated: !current }).eq("id", id);
    if (error) setErr(error.message);
  };

  // Salon öğeleri (Duvar/Bar/Kolon/Servis/Kapı/Loca) — tıklanınca hemen eklenir, kullanıcı
  // sürükleyip yerine çeker (Gökhan: "onları ekleyim çekiştirirler olabilir mi"). Çekilebilen
  // tipler (duvar/bar) x2/y2 ile 120px'lik bir uçla açılır, sabit tipler tek nokta.
  const ogelerInArea = ogeler.filter((o) => o.area_id === selectedAreaId);
  const addOge = async (type: OgeType) => {
    if (!restaurantId || !selectedAreaId) return;
    const label = [...CEKME_TIPLERI, ...SABIT_TIPLERI].find((t) => t.type === type)?.label ?? type;
    const sayac = ogelerInArea.filter((o) => o.type === type).length;
    const baseX = 40 + sayac * 24;
    const baseY = 40 + sayac * 24;
    const cekilebilen = type === "duvar" || type === "bar";
    const payload: { restaurant_id: string; area_id: string; type: OgeType; name: string; x1: number; y1: number; x2?: number; y2?: number } = {
      restaurant_id: restaurantId, area_id: selectedAreaId, type, name: label, x1: baseX, y1: baseY,
    };
    if (cekilebilen) { payload.x2 = baseX + 120; payload.y2 = baseY; }
    const { error } = await supabase.from("salon_ogeleri").insert(payload);
    if (error) { setErr(error.message); return; }
    setOgeMenuAcik(false);
    await load(restaurantId);
  };
  const renameOge = async (id: string, name: string) => {
    setErr(null);
    const { error } = await supabase.from("salon_ogeleri").update({ name }).eq("id", id);
    if (error) { setErr(error.message); return; }
    if (restaurantId) await load(restaurantId);
  };
  const deleteOge = async (o: SalonOge) => {
    const ok = await confirm(`"${o.name}" silinsin mi?`, { confirmLabel: "Sil" });
    if (!ok) return;
    setErr(null);
    const { error } = await supabase.from("salon_ogeleri").update({ deleted_at: new Date().toISOString() }).eq("id", o.id);
    if (error) { setErr(error.message); return; }
    setOgeCtxMenu(null);
    if (restaurantId) await load(restaurantId);
  };
  // ÇEVİR (Gökhan, 2026-08-18). Sabit boyda öğede (Kolon/Servis/Kapı) sadece işaret
  // değişiyor, çizim eni-boyu takas ediyor. Duvar/Bar'da çubuğun kendisi başlangıç
  // noktası sabit kalacak şekilde 90 derece dönüyor — dikey duvar yatay oluyor.
  const cevirOge = async (o: SalonOge) => {
    setOgeCtxMenu(null);
    setErr(null);
    const cekme = o.type === "duvar" || o.type === "bar";
    if (cekme) {
      const x2 = o.x2 ?? o.x1 + 120, y2 = o.y2 ?? o.y1;
      // (x1,y1) etrafında 90 derece: uzunluk aynı kalır, yön değişir.
      const yeniX2 = Math.max(0, o.x1 + (o.y1 - y2));
      const yeniY2 = Math.max(0, o.y1 + (x2 - o.x1));
      setOgeler((prev) => prev.map((x) => (x.id === o.id ? { ...x, x2: yeniX2, y2: yeniY2, rotated: !x.rotated } : x)));
      const { error } = await supabase.from("salon_ogeleri")
        .update({ x2: yeniX2, y2: yeniY2, rotated: !o.rotated }).eq("id", o.id);
      if (error) setErr(error.message);
      return;
    }
    setOgeler((prev) => prev.map((x) => (x.id === o.id ? { ...x, rotated: !x.rotated } : x)));
    const { error } = await supabase.from("salon_ogeleri").update({ rotated: !o.rotated }).eq("id", o.id);
    if (error) setErr(error.message);
  };

  // Sabit tipler (Kolon/Servis/Kapı/Loca) — tek nokta taşınır.
  const moveOge = async (id: string, x1: number, y1: number) => {
    setOgeler((prev) => prev.map((o) => (o.id === id ? { ...o, x1, y1 } : o)));
    const { error } = await supabase.from("salon_ogeleri").update({ x1, y1 }).eq("id", id);
    if (error) setErr(error.message);
  };
  // Çekilebilen tiplerin (Duvar/Bar) gövdesinden tutup taşımak — iki uç da aynı miktar kayar.
  const moveOgeBody = async (id: string, x1: number, y1: number, x2: number, y2: number) => {
    setOgeler((prev) => prev.map((o) => (o.id === id ? { ...o, x1, y1, x2, y2 } : o)));
    const { error } = await supabase.from("salon_ogeleri").update({ x1, y1, x2, y2 }).eq("id", id);
    if (error) setErr(error.message);
  };
  // Tek bir ucundan tutup çekmek — uzunluk/açı değişir.
  const moveOgeEndpoint = async (id: string, which: 1 | 2, x: number, y: number) => {
    setOgeler((prev) => prev.map((o) => (o.id === id ? (which === 1 ? { ...o, x1: x, y1: y } : { ...o, x2: x, y2: y }) : o)));
    const patch = which === 1 ? { x1: x, y1: y } : { x2: x, y2: y };
    const { error } = await supabase.from("salon_ogeleri").update(patch).eq("id", id);
    if (error) setErr(error.message);
  };

  // Salon ölçeklendirme (Gökhan: "salonun gerçek oturumunu minyatürde görmek") — girilen
  // gerçek en/boy (m), masalarla AYNI PX_PER_CM oranıyla piksele çevrilip çerçeve olarak çizilir.
  const selectedArea = areas.find((a) => a.id === selectedAreaId) ?? null;
  const odaGenislikPx = selectedArea?.genislik_cm ? selectedArea.genislik_cm * PX_PER_CM : null;
  const odaDerinlikPx = selectedArea?.derinlik_cm ? selectedArea.derinlik_cm * PX_PER_CM : null;

  const tablesInArea = tables.filter((t) => t.area_id === selectedAreaId).sort((x, y) => x.sort_order - y.sort_order);
  // Sol menüdeki Masa çoğalt / Masa sil bu masaya çalışır. Masa silinir ya da başka salona
  // geçilirse seçim kendiliğinden düşer — düğmeler o zaman "önce bir masa seç" der.
  const seciliMasa = tablesInArea.find((t) => t.id === seciliMasaId) ?? null;
  // Esc her şeyi bırakır: masa seçimi, çoğaltma formu ve açık sağ tık menüsü.
  useEffect(() => {
    const kapat = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSeciliMasaId(null);
      setCogaltAcik(false);
      setCtxMenu(null);
      setOturtMasa(null);
      setOturtAdaylar(null);
    };
    window.addEventListener("keydown", kapat);
    return () => window.removeEventListener("keydown", kapat);
  }, []);
  // Yeni masa salonun İÇİNE konur: ızgaranın sütun sayısı salonun enine göre çıkar. Eskiden
  // sabit beş sütundu; dar bir salonda yeni masa çizginin dışına düşüyor, tuval büyüyor ve
  // ortalanmış salon kayıyordu (Gökhan, 2026-08-13: "masa sildim ekledim, salon yer değiştirdi").
  const { sutun: sutunSayisi, satir: satirSayisi } = izgaraDuzeni(odaGenislikPx, odaDerinlikPx);
  // Izgara salonun DIŞINA taşmaz: satır sayısı salonun boyuyla sınırlı. Sınırsızken salon
  // dolduğunda boş yer arayan ızgara aşağı doğru yürüyüp salonu aşıyor, ekranın sağında kaydırma
  // çubuğu beliriyordu (Gökhan, 2026-08-13: "4. sırayı açınca sağda kaydırma çubuğu çıktı").
  const defaultPos = (i: number) => izgaraYeri(i, sutunSayisi, satirSayisi);
  const placed = tablesInArea.filter((t) => t.position_x != null && t.position_y != null)
    .map((t) => ({ table: t, x: t.position_x as number, y: t.position_y as number }));
  const isFree = (x: number, y: number) => !placed.some((p) => Math.abs(p.x - x) < BOX_W / 2 && Math.abs(p.y - y) < BOX_H / 2);
  // Salon dolduysa boş yer aramak sonsuza gitmesin — son gözde bırakılır, masa hiç değilse
  // salonun içinde kalır.
  const enFazlaGoz = satirSayisi > 0 ? sutunSayisi * satirSayisi : 500;
  let nextSlot = 0;
  for (const t of tablesInArea.filter((t) => t.position_x == null || t.position_y == null)) {
    let d = defaultPos(nextSlot);
    let deneme = 0;
    while (!isFree(d.x, d.y) && deneme++ < enFazlaGoz) { nextSlot++; d = defaultPos(nextSlot); }
    placed.push({ table: t, x: d.x, y: d.y });
    nextSlot++;
  }
  const positioned = tablesInArea.map((t) => placed.find((p) => p.table.id === t.id)!);
  // Hizalama kılavuzları (Gökhan: "bir masayı aynı hizaya koyarken yardımcı olmalı") — her
  // masanın sol/orta/sağ (X) ve üst/orta/alt (Y) kenarları, sürüklenen masa bunlara
  // yaklaşınca yapışması için aday çizgiler olarak TableBox'lara veriliyor.
  const hizaVerisi = positioned.map(({ table: t, x, y }) => {
    const olcu = govdeOlcusu(t.shape, t.seat_count, ozelOlculer);
    const g = t.shape === "dikdortgen" && t.rotated ? { width: olcu.height, height: olcu.width } : olcu;
    return { id: t.id, left: x, centerX: x + g.width / 2, right: x + g.width, top: y, centerY: y + g.height / 2, bottom: y + g.height };
  });
  let addSlot = nextSlot;
  let addBoxPos = defaultPos(addSlot);
  let addDeneme = 0;
  while (!isFree(addBoxPos.x, addBoxPos.y) && addDeneme++ < enFazlaGoz) { addSlot++; addBoxPos = defaultPos(addSlot); }
  // Çevrilmiş sabit öğede en/boy takas — tuval sınırı hesabı da bunu bilmeli.
  const ogeYukseklik = (o: SalonOge) => (o.type === "duvar" || o.type === "bar"
    ? CEKME_GORUNUM[o.type].kalinlik
    : (o.rotated ? SABIT_GORUNUM[o.type]?.genislik : SABIT_GORUNUM[o.type]?.yukseklik) ?? 0);
  const ogeGenislik = (o: SalonOge) => (o.type === "duvar" || o.type === "bar"
    ? CEKME_GORUNUM[o.type].kalinlik
    : (o.rotated ? SABIT_GORUNUM[o.type]?.yukseklik : SABIT_GORUNUM[o.type]?.genislik) ?? 0);
  const ogeAltSinirlari = ogelerInArea.map((o) => Math.max(o.y1, o.y2 ?? o.y1) + ogeYukseklik(o) + GAP);
  const ogeSagSinirlari = ogelerInArea.map((o) => Math.max(o.x1, o.x2 ?? o.x1) + ogeGenislik(o) + GAP);


  // 600/360 taban değeri sadece gerçek ölçü YOKKEN uygulanıyor — varsa tuval gerçek odaya
  // sıkı otursun (Gökhan: "ölçeklemede problem var, masalar ve salon aynı oranda değiller" —
  // sabit taban gerçek küçük bir salonu gereksiz büyütüp oranı bozuyordu).
  //
  // ÖLÇÜSÜ OLAN SALONDA TUVAL SABİTTİR: masaların kapladığı yere göre büyüyüp küçülmez. Eskiden
  // büyüyordu; masa eklenip silinince tuvalin boyu değişiyor, ortalanmış salon gözle görülür
  // biçimde kayıyordu (Gökhan, 2026-08-13: "masa sildim ekledim, salon yer değiştirdi").
  // Salon çizgisinin dışına düşmüş eski bir masa varsa kaydırarak yine görülebiliyor.
  const containerWidth = odaGenislikPx
    ? Math.max(odaGenislikPx, ...ogeSagSinirlari)
    : Math.max(600, ...positioned.map((p) => p.x + BOX_W + GAP), addBoxPos.x + BOX_W + GAP, ...ogeSagSinirlari);
  const containerHeight = odaDerinlikPx
    ? Math.max(odaDerinlikPx, ...ogeAltSinirlari)
    : Math.max(360, ...positioned.map((p) => p.y + BOX_H + GAP), addBoxPos.y + BOX_H + GAP, ...ogeAltSinirlari);

  // SIĞDIRMA HEDEFİ — sığdırılacak şey TUVAL değil, ekranda gerçekten görünen SALON.
  // Tuval (containerWidth/Height) salondan büyük oluyor, çünkü içinde iki görünmez pay var:
  // (1) "bir masa daha eklenirse buraya düşer" diye ayrılan boş yer, (2) her masanın
  // gövdesinden geniş olan sürükleme kutusu (148×108, gövde çoğu zaman 56–96).
  // MERKEZ salonunda ölçüldü: salon 640 nokta, tuval 824 nokta — sığdırma tuvale göre
  // yapıldığı için salon telefonda ekranın %77'sinde kalıyordu (Gökhan, 2026-08-10:
  // "salon ortada duruyor, benim sığmasını istediğim kutu ekranın çoğunluğunu kaplayan
  // kutu"). Hedef artık: gerçek ölçü çerçevesi + masaların GÖVDE sınırları + öğeler.
  // Dışarı taşmış bir masa varsa o da hesaba katıldığı için hiçbir şey ekran dışında kalmaz.
  const govdeSagSinirlari = positioned.map(({ table: t, x }) => x + (BOX_W + govdeCizim(t.shape, t.seat_count, t.rotated, ozelOlculer).width) / 2);
  const govdeAltSinirlari = positioned.map(({ table: t, y }) => y + (BOX_H + govdeCizim(t.shape, t.seat_count, t.rotated, ozelOlculer).height) / 2);
  // Salonun ölçüsü belliyse SIĞDIRILACAK ŞEY SALONDUR — dışarıda kalmış tek bir masa yüzünden
  // hedef büyüyüp salon ekranda küçücük kalmasın (Gökhan, 2026-08-13: "salon gösteriminde
  // büyümüyor"). Eski bir kaymadan ötürü çizginin dışında duran masa varsa kaydırarak görülür.
  // Ölçü girilmemişse eskisi gibi masaların kapladığı yere bakılır.
  const fitGenislik = odaGenislikPx
    ? Math.max(1, odaGenislikPx, ...ogeSagSinirlari)
    : Math.max(1, ...govdeSagSinirlari, ...ogeSagSinirlari);
  const fitYukseklik = odaDerinlikPx
    ? Math.max(1, odaDerinlikPx, ...ogeAltSinirlari)
    : Math.max(1, ...govdeAltSinirlari, ...ogeAltSinirlari);

  // PLANI ÇEVİRME (Gökhan, 2026-08-10: "salonun eni geniş ise geniş tarafa yerleşecek, boyu
  // geniş ise boyu yerleşecek — kullanıcı salonu tam kutunun içinde görecek"). Yatık bir
  // salon (ör. 8×4 m) dik telefon ekranına sığdırılınca eni kenara dayanıyor ama boyu
  // ekranın ancak dörtte birini kaplıyordu; salonun uzun kenarını ekranın uzun kenarına
  // getirince plan kutunun tamamını dolduruyor. Masa/öğe yazıları ters yöne çevrilerek
  // düz okunur tutuluyor.
  //
  const salonYatik = fitGenislik > fitYukseklik;
  const kutuYatik = viewportSize.w > viewportSize.h;
  // Salonun uzun kenarı, görünür kutunun uzun kenarına denk gelmiyorsa plan 90 derece döner.
  const yonFarkli = viewportSize.w > 0 && salonYatik !== kutuYatik;
  // Program salonu kendisi çeviriyor: salon yatık, ekran dikse plan 90 derece dönüyor.
  // Çevir düğmesi bu kararı ELLE ters çevirir — tek adım, yatay/dikey arası gidip gelir,
  // 360 derece dönme yok (Gökhan, 2026-08-10). Salon değişince tercih sıfırlanır, program
  // yeni salonda yine kendi doğru kararını verir.
  // Telefon şartı KALKTI (Gökhan, 2026-08-12: "salon ölçüsü girildiğinde salonun uzun tarafı
  // ekrandaki kutunun uzun tarafına göre yerleşecekti, bu gerçekleşmedi") — kural masaüstünde
  // de aynı: salon hangi yöne uzunsa, görünür kutunun uzun tarafına o yön gelir.
  // Düzenleme modunda da çevrilir: işletmeci ölçüyü girer girmez salonu doğru yönde ve en
  // büyük hâlinde görmeli, masaları ondan sonra yerleştiriyor (Gökhan, 2026-08-12: "rakamı
  // girdi, hemen salon en büyük görüntüsüne geçecek, düzenlemeyi bitirmeyi beklemeyecek").
  // Çevrik plandaki sürükleme ayrıca düzeltildi (aşağıda surukleFarki) — yoksa parmağın
  // gittiği yön masanın gittiği yön olmuyordu.
  const cevir = elleCevrildi ? !yonFarkli : yonFarkli;

  // "Tüm salonu göster" — salonun tamamı görünür kutuya sığacak zoom oranı (gerekirse
  // yakınlaştırarak da, küçük bir salon büyük bir ekranda kaybolmasın).
  // Tam kenara oturtmak yerine 4px pay bırakılıyor — kenarda kalan yarım pikselden kaydırma
  // çubuğu belirip görünür kutuyu tekrar daraltmasın.
  const fitZoom = () => {
    if (!viewportSize.w || !viewportSize.h) return 1;
    const payli = (n: number) => Math.max(1, n - 4);
    // Plan çevrildiyse salonun eni ekranın boyuna, boyu ekranın enine denk geliyor.
    const hedefEn = cevir ? fitYukseklik : fitGenislik;
    const hedefBoy = cevir ? fitGenislik : fitYukseklik;
    return Math.max(0.05, Math.min(payli(viewportSize.w) / hedefEn, payli(viewportSize.h) / hedefBoy));
  };
  // Kullanıcının kendi yaptığı yakınlaştırma. Bir kez elle zoom yapıldıysa program artık
  // araya girmez; "Tüm salonu göster" bunu sıfırlar.
  const zoomUygula = (yeni: number) => { setElleZoom(true); setZoom(Math.min(6, Math.max(0.1, yeni))); };
  const tumunuGoster = () => {
    setElleZoom(false);
    setZoom(Math.min(6, Math.max(0.1, fitZoom())));
    if (viewportRef.current) { viewportRef.current.scrollLeft = 0; viewportRef.current.scrollTop = 0; }
  };

  // Boş tuval alanından tutup kaydırma (pan) — sadece tıklanan yer gerçekten boşluksa
  // (bir masa/öğeye değil doğrudan tuvale tıklandıysa) başlar.
  const onCanvasPanDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || !viewportRef.current) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* dokunmatik/senkron olmayan işaretçilerde yakalama başarısız olabilir, sürükleme yine de çalışır */ }
    panStart.current = { x: e.clientX, y: e.clientY, scrollLeft: viewportRef.current.scrollLeft, scrollTop: viewportRef.current.scrollTop };
  };
  const onCanvasPanMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panStart.current || !viewportRef.current) return;
    viewportRef.current.scrollLeft = panStart.current.scrollLeft - (e.clientX - panStart.current.x);
    viewportRef.current.scrollTop = panStart.current.scrollTop - (e.clientY - panStart.current.y);
  };
  const onCanvasPanUp = () => { panStart.current = null; };

  // Gerçek ölçü girilmiş bir salon açıldığında (ya da ölçü az önce girildiğinde) varsayılan
  // görünüm doğrudan "tüm salonu göster" olsun (Gökhan: "salonun minyatürünü görecek, sonra
  // zoom yaparak istediği masaya gidecek") — zoom=1 ile açılıp elle sığdırması beklenmesin.
  // Bu SALON ZİYARETİNDE bir kez çalışır (autoFitDone yukarıda salon değişince sıfırlanır) —
  // Effect değil render-sırası koşullu setState, react-hooks/set-state-in-effect'i tetiklememek
  // için.
  //
  // TELEFONDA ölçü girilmemiş salonlarda da sığdırılıyor (Gökhan, 2026-08-10: "salonumu
  // görebileceğim en büyük halde görmek isterim") — ölçü şartı arandığında ölçüsü olmayan
  // salon telefonda %100'de açılıp sadece bir köşesi görünüyordu. Masaüstünde eski şart
  // aynen duruyor.
  const olcuVar = Boolean(selectedArea?.genislik_cm && selectedArea?.derinlik_cm);
  // Plan çevrildiğinde/düzeldiğinde (kalem düğmesi, telefonun yan çevrilmesi) sığdırma
  // baştan yapılır — yoksa çevrilmiş plan eski orana takılı kalıyor.
  if (cevir !== prevCevir) {
    setPrevCevir(cevir);
    setAutoFitDone(false);
  }
  // Telefon çevrilince görünür kutunun eni/boyu değişiyor; sığdırma yenilenmezse plan eski
  // orana takılı kalıyor ve ekranı doldurmuyordu (Gökhan, 2026-08-10: "yan çevirince tam
  // ekran yapmıyor, tekrar dike alıncaya kadar"). Kutu ölçüsü kayda değer değiştiyse
  // (10 pikselden fazla) sığdırma baştan yapılır.
  if (viewportSize.w > 0 && (Math.abs(viewportSize.w - prevViewport.w) > 10 || Math.abs(viewportSize.h - prevViewport.h) > 10)) {
    setPrevViewport({ w: viewportSize.w, h: viewportSize.h });
    // Elle yakınlaştırma yapıldıysa sığdırma yenilenmez: yakınlaşınca kaydırma çubuğu beliriyor,
    // görünür kutu değişiyor, program da zoom'u "tüm salonu göster" seviyesine geri çekiyordu —
    // fare ile uzaklaşılıyor ama yaklaşılamıyordu (Gökhan, 2026-08-13).
    if (!elleZoom) setAutoFitDone(false);
  }
  // PLAN DEĞİŞTİYSE SIĞDIRMA YENİLENİR — HANGİ SALON OLURSA OLSUN AYNI KURAL (Gökhan,
  // 2026-08-13: "salonun kuralı olur, açılan her salona aynı kurallar uygulanır").
  // Masa eklenip silinince, salon ölçüsü değişince plan büyüyüp küçülüyordu ama oran eski
  // kalıyor, salon kutuya sığmayıp kenarda kaydırma çubuğu çıkıyordu. Sen elle yakınlaştırma
  // yaptıysan karışılmaz — o zaman kaydırma çubuğu zaten senin istediğin şey.
  const planImza = `${Math.round(containerWidth)}x${Math.round(containerHeight)}x${positioned.length}`;
  if (planImza !== prevPlanImza) {
    setPrevPlanImza(planImza);
    if (!elleZoom) setAutoFitDone(false);
  }
  if (!autoFitDone && cevir === prevCevir && selectedAreaId && yuklendi && (olcuVar || isMobile) && viewportSize.w > 0 && viewportSize.h > 0) {
    setAutoFitDone(true);
    setZoom(Math.min(6, Math.max(0.1, fitZoom())));
  }

  // Sağ tık menüsü ekran dışına taşmasın (Gökhan: "menü sağ alta açılıyor, ekran dışına
  // açılmasın, taşarsa başka yöne açılsın") — tıklanan noktanın sağında/altında yeterli
  // yer yoksa sola/yukarı açılıyor. Menü DOM'a henüz eklenmediği için boyutu ölçülemiyor,
  // tahmini (gerçekte olabileceğinden büyük) bir üst sınırla hesaplanıyor.
  const menuKonum = (clientX: number, clientY: number, tahminiGenislik: number, tahminiYukseklik: number) => {
    const kenar = 8;
    const x = clientX + tahminiGenislik > window.innerWidth - kenar ? Math.max(kenar, clientX - tahminiGenislik) : clientX;
    const y = clientY + tahminiYukseklik > window.innerHeight - kenar ? Math.max(kenar, clientY - tahminiYukseklik) : clientY;
    return { x, y };
  };

  // "Öğe ekle" listesi düğmenin altına, ekrana sabitlenerek açılıyor — sol menünün kaydırma
  // kutusuna hapsolup kırpılmasın diye (Gökhan, 2026-08-19).
  const ogeMenuAc = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!selectedAreaId) return;
    if (ogeMenuAcik) { setOgeMenuAcik(false); return; }
    const r = e.currentTarget.getBoundingClientRect();
    setOgeMenuKonum(menuKonum(r.left, r.bottom + 6, 190, 300));
    setOgeMenuAcik(true);
  };

  const toplamKoltuk = tables.reduce((s, t) => s + t.seat_count, 0);
  const doluSayisi = tables.filter((t) => t.status !== "empty").length;

  // Telefon tarayıcısı, yazısı 16'dan küçük bir yazı kutusuna dokunulduğunda sayfayı
  // KENDİLİĞİNDEN yakınlaştırıyor — sayfa o anda telefon ekranını taşıyor, sağa sola
  // kayıyor ve öyle kalıyor (Gökhan, 2026-08-10: "masa ekle ya da salon ekleye tıkladığımda
  // ekran telefon ekranını taşıyor, sayfada nereye tıklarsam tıklayayım ekran sabit
  // kalacak"). Telefonda bütün yazı kutuları 16 punto yapılıyor; tarayıcının yakınlaştırma
  // eşiği bu, 16'da hiç yakınlaştırmıyor. Masaüstünde punto değişmiyor.
  const kutuYazi = (n: number) => (isMobile ? 16 : n);
  const kutuEn = (n: number) => (isMobile ? Math.round(n * 1.2) : n);

  if (!restaurantId) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--canvas)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 380, textAlign: "center", fontSize: 13.5, color: err ? "var(--danger)" : "var(--muted)", lineHeight: 1.6 }}>{err ?? "Yükleniyor…"}</div>
      </div>
    );
  }

  // GARSON VE ŞEFİN SALON EKRANI (Gökhan, 2026-08-19: "garsonun posta ekranını salona geçir,
  // salon ayarlarında bozulma olmasın" / "şefin salon ekranı yöneticiyle aynı, dün yaptığımız
  // salon ekranına çevir"). İkisi de telefonda salonu düzenlemiyor; masaların planını, kimin
  // nerede oturduğunu ve postaları görüyorlar. Aradaki fark panelin kendi içinde: şef posta
  // kurabiliyor, garson sadece bakıyor. Garson kendi postasını yanmış hâlde görüyor.
  // Garson ve şef posta kurma dışında bir şey değiştirmiyor; seçme, listeleme ve garson atama
  // ayrı Posta listesi ekranında (bkz. atamaVar). Salon düzenleyicisi aşağıda olduğu gibi
  // duruyor, bu dal ona hiç karışmıyor — yönetici, karşılama ve işletme sahibi onu görüyor.
  if (isMobile && (rolum === "garson" || rolum === "salon_sefi")) {
    return (
      <div className="salon-sayfa" style={{
        padding: "8px 8px", paddingBottom: yatayMobil ? 8 : ALT_NAV_YUKSEKLIK + 8,
        display: "flex", flexDirection: "column", boxSizing: "border-box", overflow: "hidden",
        background: "var(--canvas)", touchAction: "pan-x pan-y",
      }}>
        <style>{`
          .salon-sayfa { height: calc(100vh - 4px); height: calc(100svh - 4px); height: calc(100dvh - 4px); }
        `}</style>
        <RezervasyonUstBar restaurantId={restaurantId} sayfaBaslik="Salon" />
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <PostaPaneli restaurantId={restaurantId} atamaVar={false} />
        </div>
        <RezervasyonAltNav />
      </div>
    );
  }

  return (
    // TELEFON YERLEŞİMİ (Gökhan, 2026-08-10: "telefondan ekranı açtığımda salonumu
    // görebileceğim en büyük halde ve düzenli görmek isterim") — telefonda kenar boşlukları
    // daraltıldı, RZV/işletme adı satırı gizlendi (aynı geçişler zaten alt nav'da) ve üstteki
    // düğme kalabalığı tek satıra indirildi; kalan bütün yükseklik plana veriliyor.
    // Yükseklikte svh kullanılıyor: telefon tarayıcısının adres çubuğu yüzünden 100vh gerçek
    // görünen alandan büyük çıkıyor, planın altı nav'ın arkasında kalıyordu.
    // TARAYICININ KENDİ SAĞ TIK MENÜSÜ BU SAYFADA ÇIKMIYOR (Gökhan, 2026-08-19: "windows
    // menüsü açılmasın"). Masanın kenarına, boş tuvale ya da açık bir pencerenin perdesine
    // sağ tıklayınca Chrome'un menüsü açılıyordu; program menüsünü beklerken "Geri / Yeniden
    // yükle" listesi çıkıyordu. Yazı kutuları hariç — orada kes/kopyala/yapıştır lazım.
    <div
      className="salon-sayfa"
      onContextMenu={(e) => {
        const hedef = e.target as HTMLElement | null;
        const yaziKutusu = hedef?.closest("input, textarea, select, [contenteditable='true']");
        if (!yaziKutusu) e.preventDefault();
      }}
      style={{ padding: isMobile ? "8px 8px" : "20px 24px", paddingBottom: yatayMobil ? 8 : (isMobile ? ALT_NAV_YUKSEKLIK + 8 : 24), height: isMobile ? undefined : "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box", overflow: "hidden", background: "var(--canvas)", touchAction: isMobile ? "pan-x pan-y" : undefined }}>
      {/* Yukarıdaki kutuYazi() tek tek ulaşabildiğim kutuları 16 puntoya çekiyor; bu kural da
          ulaşamadıklarını (masa/öğe adı çift dokununca açılan kutu — ortak bileşen, ona
          dokunmuyorum) yakalıyor. Amaç aynı: telefon tarayıcısı hiçbir kutuda sayfayı
          kendiliğinden yakınlaştırmasın, ekran sağa sola kaymasın. Sadece bu sayfaya ait. */}
      {/* SAYFA YÜKSEKLİĞİ — nav ekranın sınırı, altında hiçbir şey kalmayacak (Gökhan,
          2026-08-10). Üç satır üst üste yazılıyor, tarayıcı hangisini anlıyorsa onu
          kullanıyor: vh her tarayıcıda var ama telefonda adres çubuğunu saymıyor, dvh o an
          gerçekten görünen yüksekliği veriyor — alttaki sabit nav da tam oraya oturuyor.
          Bu yüzden yükseklik telefonda satır içinde DEĞİL burada veriliyor; satır içi yazım
          tek değer alıyor, yedekli yazılamıyor. */}
      {isMobile && <style>{`
        .salon-sayfa { height: calc(100vh - 4px); height: calc(100svh - 4px); height: calc(100dvh - 4px); }
        .salon-sayfa input, .salon-sayfa textarea, .salon-sayfa select { font-size: 16px; }
      `}</style>}
      {confirmDialog}

      {/* MASAYA OTURT penceresi kaldırıldı (Gökhan, 2026-08-19). Sol tık artık masayı seçiyor;
          "boşta olan rezervasyonlar" listesi masanın SAĞ TIK menüsünün üstünde duruyor. */}

      {/* RZV + işletme adı + Salon + Çıkış satırı telefonda da duruyor (Gökhan, 2026-08-10:
          "onları yerine tekrar koy, salona kaldığı kadar yer kalsın"). Plan bu satırdan
          arta kalan yüksekliğe sığdırılıyor. */}
      {/* Masa/koltuk sayacı başlığın yanında (Gökhan, 2026-08-13: "varsayılana getirin altındaki
          yazı salon yazısının yanına gitsin") — sol menüde yer kaplamasın. */}
      {/* MASAÜSTÜNDE ÜST BAR YOK (Gökhan, 2026-08-15: "sağ ekranda yukarı kadar büyüsün") —
          işletme adı, sayfa adı ve geçiş simgeleri sol menüye taşındı, salon planı ekranın
          tepesinden başlıyor. Telefonda düzen aynı kaldı. */}
      {isMobile && (
        <RezervasyonUstBar
          restaurantId={restaurantId} sayfaBaslik="Salon"
          yanIcerik={<span style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>{doluSayisi}/{tables.length} masa dolu · {doluKisi}/{toplamKoltuk} koltuk</span>}
        />
      )}

      {/* TELEFON — tek satır: salonlar (yana kayar) + yakınlaştırma + düzenleme anahtarı.
          Düzenleme açıkken araçlar ikinci bir satırda beliriyor, kapalıyken (telefonda
          varsayılan) sadece bu satır duruyor. */}
      {isMobile && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0, overflowX: "auto", scrollbarWidth: "none" }}>
              {/* Hiç salon yokken "Salon ekle" düzenleme moduna girmeden de burada durur —
                  yoksa ilk kurulumda telefonda hiçbir şey eklenemiyor. */}
              {areas.length === 0 && (
                <button onClick={() => { setNewAreaName(""); setAddingArea(true); }} style={{ ...btnSecondaryHeader, padding: "7px 11px", fontSize: 12.5, flexShrink: 0 }}><Plus size={13} /> Salon ekle</button>
              )}
              {areas.map((a) => (
                <div
                  key={a.id}
                  onClick={() => setSelectedAreaId(a.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 2, flexShrink: 0, cursor: "pointer",
                    borderRadius: 980, padding: "6px 4px 6px 12px",
                    background: selectedAreaId === a.id ? "var(--recede)" : "var(--card)", border: "1px solid var(--line-2)",
                    fontSize: 12.5, fontWeight: selectedAreaId === a.id ? 600 : 500,
                    color: selectedAreaId === a.id ? "var(--brand)" : "var(--ink)", whiteSpace: "nowrap",
                  }}
                >
                  {a.name}
                  {/* Telefonda sağ tık yok — silme simgesi burada durur. */}
                  <button onClick={(e) => { e.stopPropagation(); deleteArea(a); }} aria-label="salonu sil" style={{ all: "unset", cursor: "pointer", padding: "0 6px", display: "flex", color: "var(--muted-2)" }}><Trash2 size={11} /></button>
                </div>
              ))}
            </div>
            {selectedAreaId && (
              <>
                <button onClick={() => zoomUygula(zoom / 1.25)} aria-label="Uzaklaştır" style={mobilIkonBtn}>−</button>
                <button onClick={() => zoomUygula(zoom * 1.25)} aria-label="Yakınlaştır" style={mobilIkonBtn}>+</button>
                <button onClick={tumunuGoster} aria-label="Tüm salonu göster" style={mobilIkonBtn}><Maximize2 size={14} /></button>
                {/* Çevir — tek adım: yatay ↔ dikey. Programın kendi kararını ters çevirir,
                    serbest döndürme yok (Gökhan, 2026-08-10). */}
                <button
                  onClick={() => { setElleCevrildi((v) => !v); setAutoFitDone(false); }}
                  aria-label="Salonu çevir" title="Salonu çevir"
                  style={{ ...mobilIkonBtn, background: elleCevrildi ? "var(--recede)" : "var(--card)", color: elleCevrildi ? "var(--brand-strong)" : "var(--ink-green)" }}
                >
                  <RotateCw size={14} />
                </button>
              </>
            )}
            {/* Yerleşim yap — telefonda da lazım (Gökhan, 2026-08-10). Yazı yerine simge:
                üst şerit dar, düğme adı satırı taşırıyor. Düzenleme modunda gizli, orada
                masa sürükleniyor, altından dizilim değişmesin. */}
            {(
              <button
                onClick={yerlesimYapTikla}
                disabled={yerlesimBusy}
                aria-label="Yerleşim yap"
                title="Yerleşim yap"
                style={{ ...mobilIkonBtn, opacity: yerlesimBusy ? 0.5 : 1 }}
              >
                <LayoutGrid size={14} />
              </button>
            )}
          </div>

          {(
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexShrink: 0, flexWrap: "wrap", rowGap: 6 }}>
              <button
                onClick={() => { if (!selectedAreaId) return; setAddingTable(true); setErr(null); }}
                disabled={!selectedAreaId}
                style={{ ...btnSmall, padding: "7px 11px", fontSize: 12.5, opacity: !selectedAreaId ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <Plus size={13} /> Masa
              </button>
              <div style={{ position: "relative" }}>
                <button
                  onClick={ogeMenuAc}
                  disabled={!selectedAreaId}
                  style={{ ...btnSecondaryHeader, padding: "7px 11px", fontSize: 12.5, opacity: !selectedAreaId ? 0.5 : 1 }}
                >
                  <Plus size={13} /> Öğe
                </button>
                {ogeMenuAcik && (
                  <>
                    <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setOgeMenuAcik(false)} />
                    <div style={{ position: "fixed", left: ogeMenuKonum?.x ?? 0, top: ogeMenuKonum?.y ?? 0, zIndex: 61, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 8px 24px rgba(30,25,15,0.18)", padding: 6, minWidth: 150 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted-2)", padding: "6px 10px 2px" }}>Çekip uzatılır</div>
                      {CEKME_TIPLERI.map((t) => (<button key={t.type} onClick={() => addOge(t.type)} style={ogeMenuBtn}>{t.label}</button>))}
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted-2)", padding: "8px 10px 2px", borderTop: "1px solid var(--line)", marginTop: 4 }}>Sürüklenir</div>
                      {SABIT_TIPLERI.map((t) => (<button key={t.type} onClick={() => addOge(t.type)} style={ogeMenuBtn}>{t.label}</button>))}
                    </div>
                  </>
                )}
              </div>
              {selectedAreaId && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--muted)" }}>
                  <input
                    value={olcuInput.genislik}
                    onChange={(e) => setOlcuInput((v) => ({ ...v, genislik: e.target.value.replace(/[^0-9.,]/g, "") }))}
                    onBlur={saveOlcu} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    placeholder="en" inputMode="decimal" className="tnum"
                    style={{ border: "1px solid var(--line-2)", borderRadius: 8, padding: "6px 7px", fontSize: kutuYazi(12.5), width: kutuEn(40), background: "var(--card)", color: "var(--ink)", outline: "none" }}
                  />
                  <span>×</span>
                  <input
                    value={olcuInput.derinlik}
                    onChange={(e) => setOlcuInput((v) => ({ ...v, derinlik: e.target.value.replace(/[^0-9.,]/g, "") }))}
                    onBlur={saveOlcu} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    placeholder="boy" inputMode="decimal" className="tnum"
                    style={{ border: "1px solid var(--line-2)", borderRadius: 8, padding: "6px 7px", fontSize: kutuYazi(12.5), width: kutuEn(40), background: "var(--card)", color: "var(--ink)", outline: "none" }}
                  />
                  <span>m</span>
                </div>
              )}
              <button onClick={() => { setNewAreaName(""); setAddingArea(true); }} style={{ ...btnSecondaryHeader, padding: "7px 11px", fontSize: 12.5 }}><Plus size={13} /> Salon</button>
            </div>
          )}
        </>
      )}


      {/* POSTA KİPİ — salonun üstünde açılıp kapanan panel. Yükseklik kesin veriliyor: plan
          kendini karta sığdırırken kartın boyunu bilmesi gerekiyor (Gökhan, 2026-08-17). */}
      {postaKipi && !isMobile && (
        <div style={{
          flexShrink: 0, marginBottom: 10,
          display: "flex", flexDirection: "column", height: "52vh",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)", flex: 1 }}>Posta</span>
            <button onClick={() => setPostaKipi(false)} style={{ ...btnSecondaryHeader, padding: "6px 12px", fontSize: 12.5 }}>Kapat</button>
          </div>
          {restaurantId && <PostaPaneli restaurantId={restaurantId} />}
        </div>
      )}

      {/* GRUP SEÇME ŞERİDİ (Gökhan, 2026-08-16). Ayarlar > Masa grupları > "Masalar"a basınca
          bu ekrana ?grup=… ile geliniyor: salonu seç, masalara tıkla, Kaydet. Bu moddayken
          masaya tıklamak rezervasyon listesini açmaz, masayı seçer. */}
      {grupModu && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          marginBottom: isMobile ? 6 : 10, padding: "9px 12px", borderRadius: 12,
          border: `1px solid ${grupModu.renk}`, background: `${grupModu.renk}18`,
        }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, background: grupModu.renk, flexShrink: 0 }} />
          <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{grupModu.ad}</span>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
            — bu gruba ait masalara tıkla. Seçili: <span className="tnum">{grupSecim.size}</span>
          </span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button onClick={grupIptal} style={{ ...btnSecondaryHeader, padding: "7px 12px", fontSize: 12.5 }}>Vazgeç</button>
            <button
              onClick={grupKaydet} disabled={grupBusy}
              style={{ border: "none", borderRadius: 980, padding: "7px 16px", background: "var(--brand-strong)", color: "#fff", fontSize: 12.5, fontWeight: 500, cursor: "pointer", opacity: grupBusy ? 0.6 : 1 }}
            >
              {grupBusy ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </div>
      )}

      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: isMobile ? 6 : 10, flexShrink: 0 }}>{err}</div>}

      <div style={{ display: "flex", flex: 1, minHeight: 0, gap: isMobile ? 0 : 12 }}>
      {!isMobile && (
      <aside style={{
        width: menuAcik ? 226 : 40, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10,
        alignItems: menuAcik ? "stretch" : "center", overflowY: "auto", overflowX: "hidden",
        border: "1px solid var(--line)", borderRadius: 16, background: "var(--card)", padding: menuAcik ? 12 : 6,
        boxSizing: "border-box",
      }}>
        {/* Menünün tepesi — rezervasyon listesindeki sol menüyle aynı: RZV rozeti, işletme
            adı, altında sayfa adı, onun da altında masa/koltuk sayacı (Gökhan, 2026-08-15).
            Menü daraltılmışsa sadece rozet kalıyor. */}
        {/* Başlık satırının sağındaki ok — rezervasyon listesindeki menüyle birebir aynı
            yer ve aynı simge (Gökhan, 2026-08-18). */}
        {menuAcik ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <MenuBaslik restaurantId={restaurantId} sayfaBaslik="Salon" />
            </div>
            <button
              onClick={menuDegistir}
              aria-label="Menüyü daralt" title="Menüyü daralt"
              style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: 4, borderRadius: 8, flexShrink: 0, color: "var(--muted)" }}
            >
              <ChevronLeft size={18} />
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={menuDegistir}
              aria-label="Menüyü aç" title="Menüyü aç"
              style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: 6, borderRadius: 8, color: "var(--muted)" }}
            >
              <ChevronRight size={19} />
            </button>
            <MenuBaslik restaurantId={restaurantId} sayfaBaslik="Salon" dar />
          </>
        )}

        {/* Diğer ekranlar — sayfa adının altındaki çizginin hemen altında (Gökhan,
            2026-08-15). Rezervasyon ekranındaki menüyle aynı yer. */}
        <div style={{ height: 1, background: "var(--line)", flexShrink: 0, alignSelf: "stretch" }} />
        <MenuNav dikey={!menuAcik} />
        <div style={{ height: 1, background: "var(--line)", flexShrink: 0, alignSelf: "stretch" }} />

        {/* Menüyü aç/kapa oku artık başlığın yanında — rezervasyon listesiyle aynı
            (Gökhan, 2026-08-18). Tercih tarayıcıda kalıyor. */}
        {menuAcik && (
        <>
        {/* Yerleşim yap — rezervasyon listesinden buraya taşındı (Gökhan, 2026-08-10).
            Salonu gözünle görürken dizdirmek daha doğal. Sıfırdan kurar: masalar bugünün
            rezervasyonlarına baştan dağıtılır. Oturmuş ve kilitli masalara dokunmaz. */}
        <button onClick={yerlesimYapTikla} disabled={yerlesimBusy} style={{ ...btnSecondaryHeader, opacity: yerlesimBusy ? 0.5 : 1 }}>
          {yerlesimBusy ? "Diziliyor…" : "Yerleşim yap"}
        </button>

        {/* Masaları asıl yerlerine döndürür — düzen bozulduğunda tek tıkla toparlanır. */}
        <button onClick={varsayilanaGetir} disabled={sifirlaBusy} style={{ ...btnSecondaryHeader, opacity: sifirlaBusy ? 0.5 : 1 }}>
          {sifirlaBusy ? "Getiriliyor…" : "Varsayılana getir"}
        </button>

        {/* Salonlar. Çöp kutusu satırdan kalktı; silme salon adına sağ tıklayınca çıkıyor
            (Gökhan, 2026-08-13). Salon ekle + var olan salonlar — sol kutu kalktı, hepsi burada (Gökhan,
            2026-08-08: "salon ekle butonunu salon düzenlemenin yanına al, salonun olduğu
            kutuyu kaldır, sadece ekli salon salon eklenin yanında görünsün"). */}
        {areas.map((a) => (
          <div
            key={a.id}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setAlanMenu({ ...menuKonum(e.clientX, e.clientY, 160, 60), area: a }); }}
            // Salon adları da öteki düğmelerle aynı kutu: aynı köşe, aynı yükseklik
            // (Gökhan, 2026-08-15: "farklı olanı da aynı ölçülere getir").
            style={{ display: "flex", alignItems: "center", borderRadius: 10, padding: "calc(9px - 1.5mm) 14px", background: selectedAreaId === a.id ? "var(--recede)" : "var(--card)", border: "1px solid var(--line-2)" }}
          >
            <div onClick={() => setSelectedAreaId(a.id)} style={{ cursor: "pointer", fontSize: 13.5, fontWeight: selectedAreaId === a.id ? 600 : 500, color: selectedAreaId === a.id ? "var(--brand)" : "var(--ink)" }}>
              <EditableText value={a.name} onSave={(v) => renameArea(a.id, v)} />
            </div>
          </div>
        ))}
        <button onClick={() => { setNewAreaName(""); setAddingArea(true); }} style={btnSecondaryHeader}><Plus size={14} /> Salon ekle</button>
        {/* POSTA — masaüstünde salonun içinde açılıyor (Gökhan, 2026-08-17). */}
        <button
          onClick={() => setPostaKipi((v) => !v)}
          style={{ ...btnSecondaryHeader, background: postaKipi ? "var(--recede)" : "var(--card)", color: postaKipi ? "var(--brand)" : "var(--ink-green)" }}
        >
          <Users size={14} /> Posta
        </button>

        {/* Görünüm araçları — düzenleme modu kapalıyken de kullanılabilir. Diğer düğmelerle
            aynı hizada dursun diye "Tüm salonu göster" tam genişlikte, yakınlaştırma ve
            çevirme onun altında bir satırda (Gökhan, 2026-08-13). */}
        {selectedAreaId && (
        <>
          <button onClick={tumunuGoster} style={btnSecondaryHeader}>Tüm salonu göster</button>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => zoomUygula(zoom / 1.25)} aria-label="Uzaklaştır" style={zoomBtn}>−</button>
            <span className="tnum" style={{ fontSize: 12, width: 38, textAlign: "center", color: "var(--muted)" }}>{Math.round(zoom * 100)}%</span>
            <button onClick={() => zoomUygula(zoom * 1.25)} aria-label="Yakınlaştır" style={zoomBtn}>+</button>
            <div style={{ flex: 1 }} />
            {/* Çevir — programın kendi kararını elle ters çevirir. */}
            <button
              onClick={() => { setElleCevrildi((v) => !v); setAutoFitDone(false); }}
              aria-label="Salonu çevir" title="Salonu çevir"
              style={{ ...btnSecondaryHeader, padding: "6px 10px", background: elleCevrildi ? "var(--recede)" : "var(--card)", color: elleCevrildi ? "var(--brand-strong)" : "var(--ink-green)" }}
            >
              <RotateCw size={14} />
            </button>
            {/* VARSAYILAN YAP — masaların ŞU ANKİ yerleri salonun kalıcı düzeni olur
                (Gökhan, 2026-08-13). Program bir masayı birleştirme için oynattığında eski
                yerini hatırlıyor ve iş bitince oraya döndürüyor; buna basınca o hafıza silinir. */}
            <button
              onClick={varsayilanYap} disabled={varsayilanBusy}
              aria-label="Bu düzeni varsayılan yap" title="Bu düzeni varsayılan yap"
              style={{ ...btnSecondaryHeader, padding: "6px 10px", opacity: varsayilanBusy ? 0.5 : 1 }}
            >
              <Pin size={14} />
            </button>
          </div>
        </>
        )}


        {/* DÜZENLEME MODU KALKTI (Gökhan, 2026-08-13: "salon düzenleyi komple kaldır, masa ekle
            ve öğe ekleyi buton olarak sol menüye koy"). Masa her zaman sürüklenebilir; masaya
            tıklayıp bırakmak (sürüklemeden) yine o masanın rezervasyon listesini açar. */}
        {/* Masa ekle — tuvale sağ tıkla da eklenebiliyor, düğme görünür olsun diye burada. */}
        <button
          onClick={() => { if (!selectedAreaId) return; setAddingTable(true); setErr(null); }}
          disabled={!selectedAreaId}
          style={{ ...btnSecondaryHeader, opacity: !selectedAreaId ? 0.5 : 1 }}
        >
          <Plus size={14} /> Masa ekle
        </button>

        {/* MASA ÇOĞALT ve MASA SİL — ikisi de "önce masayı seç, sonra düğmeye bas" ile
            çalışıyor (Gökhan, 2026-08-19: "önce masa seçelim sonra çoğalt butonuna basalım,
            menü butonun altına açılsın"). Çoğaltma eskiden masanın sağ tık menüsündeydi. */}
        {seciliMasa && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)", padding: "0 2px" }}>
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Seçili: <span style={{ color: "var(--ink-green)", fontWeight: 600 }}>{seciliMasa.name}</span>
            </span>
            <button
              onClick={() => { setSeciliMasaId(null); setCogaltAcik(false); }}
              title="Seçimi bırak"
              style={{ all: "unset", cursor: "pointer", color: "var(--muted-2)", fontSize: 15, lineHeight: 1, padding: "0 2px" }}
            >
              ×
            </button>
          </div>
        )}
        <button
          onClick={() => {
            if (!seciliMasa) { setErr("Önce çoğaltmak istediğin masaya tıkla."); return; }
            setErr(null);
            setCogaltAcik((v) => !v);
          }}
          disabled={!selectedAreaId}
          style={{ ...btnSecondaryHeader, opacity: !selectedAreaId ? 0.5 : 1 }}
        >
          <Copy size={14} /> Masa çoğalt
        </button>

        {/* Çoğaltma seçenekleri düğmenin hemen altında — yön, adet, aralık. */}
        {cogaltAcik && seciliMasa && (
          <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 10, background: "var(--card)", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Yön</div>
            <div style={{ display: "flex", gap: 4 }}>
              {([["sag", ArrowRight], ["sol", ArrowLeft], ["yukari", ArrowUp], ["asagi", ArrowDown]] as const).map(([y, Icon]) => (
                <button
                  key={y} onClick={() => setCogaltYon(y)}
                  style={{
                    all: "unset", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    width: 28, height: 28, borderRadius: 8,
                    border: cogaltYon === y ? "2px solid var(--brand-strong)" : "1px solid var(--line-2)",
                    color: cogaltYon === y ? "var(--brand-strong)" : "var(--ink)",
                  }}
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 4 }}>Adet</div>
                <input
                  value={cogaltAdet} onChange={(e) => setCogaltAdet(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric" className="tnum"
                  style={{ border: "1px solid var(--line-2)", borderRadius: 8, padding: "6px 8px", fontSize: kutuYazi(13), width: kutuEn(44), background: "var(--card)", color: "var(--ink)", outline: "none" }}
                />
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 4 }}>Aralık (cm)</div>
                <input
                  value={cogaltAralik} onChange={(e) => setCogaltAralik(e.target.value.replace(/[^0-9.,]/g, ""))}
                  inputMode="decimal" className="tnum"
                  style={{ border: "1px solid var(--line-2)", borderRadius: 8, padding: "6px 8px", fontSize: kutuYazi(13), width: kutuEn(56), background: "var(--card)", color: "var(--ink)", outline: "none" }}
                />
              </div>
            </div>
            <button
              onClick={() => {
                const pos = placed.find((p) => p.table.id === seciliMasa.id);
                cogaltTable(seciliMasa, pos?.x ?? seciliMasa.position_x ?? 0, pos?.y ?? seciliMasa.position_y ?? 0);
              }}
              style={{ border: "none", borderRadius: 8, padding: "7px 12px", background: "var(--brand-strong)", color: "#fff", fontSize: 12.5, cursor: "pointer", width: "100%" }}
            >
              Ekle
            </button>
          </div>
        )}

        <button
          onClick={() => {
            if (!seciliMasa) { setErr("Önce silmek istediğin masaya tıkla."); return; }
            setErr(null);
            void deleteTable(seciliMasa);
          }}
          disabled={!selectedAreaId}
          style={{ ...btnSecondaryHeader, opacity: !selectedAreaId ? 0.5 : 1, color: "var(--danger)" }}
        >
          <Trash2 size={14} /> Masa sil
        </button>

        {/* Duvar/Bar/Kolon/Servis/Kapı/Loca — tıklanınca hemen eklenir, sürükleyip yerine
            çekilir (Gökhan: "onları ekleyim çekiştirirler olabilir mi"). */}
        <div style={{ position: "relative" }}>
              <button
                onClick={ogeMenuAc}
                disabled={!selectedAreaId}
                style={{ ...btnSecondaryHeader, opacity: !selectedAreaId ? 0.5 : 1 }}
              >
                <Plus size={14} /> Öğe ekle
              </button>
              {ogeMenuAcik && (
                <>
                  <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setOgeMenuAcik(false)} />
                  <div style={{ position: "fixed", left: ogeMenuKonum?.x ?? 0, top: ogeMenuKonum?.y ?? 0, zIndex: 61, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 8px 24px rgba(30,25,15,0.18)", padding: 6, minWidth: 160 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted-2)", padding: "6px 10px 2px" }}>Çekip uzatılır</div>
                    {CEKME_TIPLERI.map((t) => (
                      <button key={t.type} onClick={() => addOge(t.type)} style={ogeMenuBtn}>{t.label}</button>
                    ))}
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted-2)", padding: "8px 10px 2px", borderTop: "1px solid var(--line)", marginTop: 4 }}>Sürüklenir</div>
                    {SABIT_TIPLERI.map((t) => (
                      <button key={t.type} onClick={() => addOge(t.type)} style={ogeMenuBtn}>{t.label}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
        </>
        )}
      </aside>
      )}
        {/* Kat planı — sürükle bırak, sağ tık menü, ölçekli yakınlaştırma. Sol kutu kalktı,
            salonlar artık üstteki başlık satırında (Gökhan, 2026-08-08) — kat planı tam
            genişlik, sola ve sağa yaslı. */}
        <div style={{ position: "relative", flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {/* Masa/koltuk sayacı planın ÜSTÜNDE (Gökhan, 2026-08-15: "salonda kapasite yazısı
              yine ekranın üstünde kalsaydı") — sol menüde değil, plana bakarken göz hizasında. */}
          {/* Tuval kendisi flex — plan görünür kutudan küçük kaldığında (sığdırma sonrası dar
              kenarda hep boşluk kalır) ortada dursun, sol üst köşeye yapışıp yamuk
              görünmesin. Plan kutudan büyükken auto kenar boşlukları sıfırlanır, kaydırma
              eskisi gibi çalışır. */}
          {/* Masa/koltuk sayacı kutunun İÇİNDE, sol üst köşede (Gökhan, 2026-08-15: "yazı
              kutunun içinde olsun"). Kutunun ÜSTÜNE serilir — akışta yer kaplasaydı planı
              sağa iterdi (ilk denemede tam bu oldu). Tıklamayı da engellemiyor. */}
          {!isMobile && (
            <div style={{ position: "absolute", top: 10, left: 14, zIndex: 5, fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap", pointerEvents: "none" }}>
              {doluSayisi}/{tables.length} masa dolu · {doluKisi}/{toplamKoltuk} koltuk
            </div>
          )}
          <div
            ref={viewportRef}
            style={{
              position: "relative", flex: 1, overflow: "auto", display: "flex",
              border: "1px solid var(--line)", borderRadius: isMobile ? 14 : 16, background: "var(--card)",
              // Sol üstteki doluluk yazısına yer — plan onun altından başlar, üstüne binmez
              // (Gökhan, 2026-08-15: "onun üstüne çıkmasın").
              paddingTop: isMobile ? 0 : 30, boxSizing: "border-box",
            }}
          >
            {/* Çevrilmiş planda dış kutunun eni/boyu yer değiştiriyor; içerideki tuval 90°
                döndürülüp kendi boyu kadar sağa kaydırılıyor ki sol üst köşeden başlasın. */}
            {!selectedAreaId ? (
              <div style={{ padding: 24, color: "var(--muted-2)", fontSize: 13 }}>Önce yukarıdan bir salon seç ya da ekle.</div>
            ) : !duzenHazir ? (
              <div style={{ margin: "auto", color: "var(--muted-2)", fontSize: 13 }}>Salon hazırlanıyor…</div>
            ) : (
              <div style={{ position: "relative", flexShrink: 0, margin: "auto", width: (cevir ? containerHeight : containerWidth) * zoom, height: (cevir ? containerWidth : containerHeight) * zoom }}>
                <div
                  onPointerDown={onCanvasPanDown} onPointerMove={onCanvasPanMove} onPointerUp={onCanvasPanUp}
                  // Boşluğa tıklamak masa seçimini bırakır — masaya değil tuvale denk gelen
                  // tıklamada seçim asılı kalmasın (Gökhan, 2026-08-19).
                  onClick={(e) => { if (e.target === e.currentTarget) { setSeciliMasaId(null); setCogaltAcik(false); } }}
                  style={{
                    position: "absolute", left: 0, top: 0, width: containerWidth, height: containerHeight,
                    transform: cevir ? `translate(${containerHeight * zoom}px, 0px) rotate(90deg) scale(${zoom})` : `scale(${zoom})`,
                    transformOrigin: "0 0", cursor: "grab",
                  }}
                >
                  {/* Salonun gerçek ölçüsü girildiyse çerçeve — "gerçek oturumun minyatürü"
                      (Gökhan: "salonun gerçek oturumunu minyatürde görmek"). */}
                  {odaGenislikPx && odaDerinlikPx && (
                    // Çerçevenin sol üstündeki ölçü yazısı kaldırıldı (Gökhan, 2026-08-15:
                    // "yeşil çizginin sol üstünde ölçü yazıyor onu sil") — ölçü zaten
                    // aşağıdaki özet şeridinde duruyor.
                    <div style={{ position: "absolute", left: 0, top: 0, width: odaGenislikPx, height: odaDerinlikPx, border: `${SALON_CIZGISI}px solid var(--brand-strong)`, borderRadius: 20, boxSizing: "border-box", pointerEvents: "none" }} />
                  )}
                  {/* Salon öğeleri masaların ALTINDA çiziliyor — duvar/bar arka planda dursun,
                      masalar hep tıklanabilir üstte kalsın. */}
                  {ogelerInArea.filter((o) => o.type === "duvar" || o.type === "bar").map((o) => (
                    <CekilebilirOge
                      key={o.id} oge={o} zoom={zoom} cevir={cevir}
                      onMoveBody={(x1, y1, x2, y2) => moveOgeBody(o.id, x1, y1, x2, y2)}
                      onMoveEndpoint={(which, x, y) => moveOgeEndpoint(o.id, which, x, y)}
                      onRename={(v) => renameOge(o.id, v)}
                      onContextMenu={(x2, y2) => setOgeCtxMenu({ ...menuKonum(x2, y2, 210, 60), oge: o })}
                    />
                  ))}
                  {ogelerInArea.filter((o) => o.type !== "duvar" && o.type !== "bar").map((o) => (
                    <SabitOge
                      key={o.id} oge={o} zoom={zoom} cevir={cevir}
                      onMove={(x1, y1) => moveOge(o.id, x1, y1)}
                      onRename={(v) => renameOge(o.id, v)}
                      onContextMenu={(x2, y2) => setOgeCtxMenu({ ...menuKonum(x2, y2, 210, 60), oge: o })}
                      onCevir={() => cevirOge(o)}
                    />
                  ))}
                  {/* Masalar. Sol tık masayı SEÇER — sol menüdeki "Masa çoğalt" ve "Masa sil"
                      seçili masaya çalışır. Sağ tık, üstte boşta olan rezervasyonlar olmak
                      üzere masa menüsünü açar (Gökhan, 2026-08-19). */}
                  {positioned.map(({ table: t, x, y }) => (
                    <TableBox
                      key={t.id}
                      table={t}
                      x={x} y={y} zoom={zoom}
                      hizaXNoktalari={hizaVerisi.filter((h) => h.id !== t.id).flatMap((h) => [h.left, h.centerX, h.right])}
                      hizaYNoktalari={hizaVerisi.filter((h) => h.id !== t.id).flatMap((h) => [h.top, h.centerY, h.bottom])}
                      ozelOlculer={ozelOlculer}
                      oturan={oturanlar[t.id] ?? null}
                      grup={masaGruplari.find((g) => g.id === t.grup_id) ?? null}
                      cevir={cevir}
                      odaW={odaGenislikPx} odaH={odaDerinlikPx}
                      onSurukleme={(v) => { surukleniyor.current = v; }}
                      onMove={moveTable}
                      onRename={(v) => renameTable(t.id, v)}
                      onRotate={() => rotateTable(t.id, t.rotated)}
                      onContextMenu={(x2, y2) => { setKoltukInput(String(t.seat_count ?? 4)); setCtxMenu({ ...menuKonum(x2, y2, 250, 430), table: t }); void oturtmaAc(t); }}
                      onKullanimTikla={() => (grupModu ? grupMasaSec(t.id) : setSeciliMasaId((s) => (s === t.id ? null : t.id)))}
                      secili={seciliMasaId === t.id}
                      grupSecili={grupModu ? grupSecim.has(t.id) : null}
                      postada={postam.has(t.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {alanMenu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setAlanMenu(null)} onContextMenu={(e) => { e.preventDefault(); setAlanMenu(null); }} />
          <div style={{ position: "fixed", left: alanMenu.x, top: alanMenu.y, zIndex: 61, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 8px 24px rgba(30,25,15,0.18)", padding: 6, minWidth: 160 }}>
            <button
              onClick={() => { const a = alanMenu.area; setAlanMenu(null); deleteArea(a); }}
              style={{ ...ogeMenuBtn, color: "var(--danger)", display: "flex", alignItems: "center", gap: 8 }}
            >
              <Trash2 size={13} /> Salonu sil
            </button>
          </div>
        </>
      )}

      {ctxMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 60 }}
            onClick={() => { setCtxMenu(null); setOturtMasa(null); setOturtAdaylar(null); }}
            onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); setOturtMasa(null); setOturtAdaylar(null); }}
          />
          <div style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 61, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 8px 24px rgba(30,25,15,0.18)", padding: 6, minWidth: 160 }}>
            {ctxMenu.table && (
              <>
                {/* BOŞTA OLAN REZERVASYONLAR — bugünün, henüz oturmamış rezervasyonları
                    (Gökhan, 2026-08-19: "sağ tıkladığımda boşta olan rezervasyonların listesi
                    açılsın"). Birine basınca masa o rezervasyona verilir; masa yetmezse
                    program yanındaki boş masalarla tamamlar. */}
                <div style={{ padding: "8px 12px 9px", width: 226, boxSizing: "border-box" }}>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 5 }}>Boşta olan rezervasyonlar</div>
                  <div style={{ maxHeight: 196, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
                    {oturtAdaylar === null && <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Yükleniyor…</div>}
                    {oturtAdaylar !== null && oturtAdaylar.length === 0 && (
                      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Bugün oturtulacak rezervasyon yok.</div>
                    )}
                    {(oturtAdaylar ?? []).map((r) => (
                      <button
                        key={r.id} onClick={() => oturtSec(r)} disabled={oturtBusy}
                        style={{
                          all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 7,
                          border: "1px solid var(--line-2)", borderRadius: 9, padding: "7px 9px",
                          background: "var(--card)", opacity: oturtBusy ? 0.5 : 1, boxSizing: "border-box",
                        }}
                      >
                        <span className="tnum" style={{ fontSize: 11.5, color: "var(--muted)", flexShrink: 0 }}>
                          {new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" }).format(new Date(r.reserved_at))}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.guest_name}
                        </span>
                        <span className="tnum" style={{ fontSize: 12.5, fontWeight: 600, color: r.party_size > (ctxMenu.table?.seat_count ?? 0) ? "var(--danger)" : "var(--brand-strong)", flexShrink: 0 }}>
                          {r.party_size}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ padding: "9px 12px", borderTop: "1px solid var(--line)" }}>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 5 }}>Koltuk sayısı</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      value={koltukInput}
                      onChange={(e) => setKoltukInput(e.target.value.replace(/\D/g, ""))}
                      onKeyDown={(e) => e.key === "Enter" && saveSeatCount(ctxMenu.table!.id)}
                      inputMode="numeric" className="tnum"
                      style={{ border: "1px solid var(--line-2)", borderRadius: 8, padding: "6px 8px", fontSize: kutuYazi(13), width: kutuEn(56), background: "var(--card)", color: "var(--ink)", outline: "none" }}
                    />
                    <button onClick={() => saveSeatCount(ctxMenu.table!.id)} style={{ border: "none", borderRadius: 8, padding: "6px 12px", background: "var(--ink-green)", color: "#fff", fontSize: 12.5, cursor: "pointer" }}>Kaydet</button>
                  </div>
                </div>

                {/* MASA GRUBU (Gökhan, 2026-08-16). Minimum harcama ve fiyat masaya tek tek
                    değil gruba giriliyor; grupların kendisi Ayarlar > Salon ve masa'da
                    tanımlanıyor, masanın hangi gruba ait olduğu burada seçiliyor. */}
                {masaGruplari.length > 0 && (
                  <div style={{ padding: "9px 12px", borderTop: "1px solid var(--line)" }}>
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 5 }}>Masa grubu</div>
                    <select
                      value={ctxMenu.table.grup_id ?? ""}
                      onChange={(e) => grubaAta(ctxMenu.table!.id, e.target.value || null)}
                      style={{ border: "1px solid var(--line-2)", borderRadius: 8, padding: "6px 8px", fontSize: kutuYazi(13), width: "100%", boxSizing: "border-box", background: "var(--card)", color: "var(--ink)", outline: "none" }}
                    >
                      <option value="">Grubu yok</option>
                      {masaGruplari.map((g) => <option key={g.id} value={g.id}>{g.ad}</option>)}
                    </select>
                  </div>
                )}

                {/* Çoğaltma ve silme buradan kalktı — ikisi de sol menüde, "önce masayı seç,
                    sonra düğmeye bas" akışında (Gökhan, 2026-08-19). */}
              </>
            )}
          </div>
        </>
      )}

      {ogeCtxMenu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setOgeCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setOgeCtxMenu(null); }} />
          <div style={{ position: "fixed", left: ogeCtxMenu.x, top: ogeCtxMenu.y, zIndex: 61, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 8px 24px rgba(30,25,15,0.18)", padding: 6, minWidth: 160 }}>
            {/* ÇEVİR — sabit öğede en/boy takas olur, duvar/barda çubuk 90 derece döner
                (Gökhan, 2026-08-18). */}
            <button
              onClick={() => cevirOge(ogeCtxMenu.oge)}
              style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, fontSize: 13.5, color: "var(--ink)" }}
            >
              <RotateCw size={14} /> Çevir
            </button>
            <button
              onClick={() => { const o = ogeCtxMenu.oge; setOgeCtxMenu(null); deleteOge(o); }}
              style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, fontSize: 13.5, color: "var(--danger)" }}
            >
              <Trash2 size={14} /> {[...CEKME_TIPLERI, ...SABIT_TIPLERI].find((t) => t.type === ogeCtxMenu.oge.type)?.label} sil
            </button>
          </div>
        </>
      )}

      {/* SALON EKLE PENCERESİ — eskiden başlık satırının içinde açılan bir yazı kutusuydu;
          iki sorun çıkardı (Gökhan, 2026-08-10): satır büyüyüp yerleşimi kaydırıyordu ve
          salon eklemeden geri çıkmanın yolu yoktu. Artık Masa ekle ile aynı biçimde ayrı bir
          pencere: Vazgeç, Escape ve dışına dokunma — üçü de kapatıyor. */}
      {addingArea && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => { setAddingArea(false); setNewAreaName(""); setYeniEn(""); setYeniBoy(""); }}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: isMobile ? 16 : 22, width: "min(360px, 92vw)", boxSizing: "border-box" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 14 }}>Salon ekle</div>
            {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{err}</div>}
            <input
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addArea(); if (e.key === "Escape") { setAddingArea(false); setNewAreaName(""); setYeniEn(""); setYeniBoy(""); } }}
              placeholder="Salon adı (Merkez, Teras…)" style={{ ...inp, fontSize: kutuYazi(13), width: "100%" }} autoFocus
              autoComplete="off" autoCorrect="off" spellCheck={false}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: "var(--muted)" }}>
              <span>Ölçü:</span>
              <input
                value={yeniEn} onChange={(e) => setYeniEn(e.target.value.replace(/[^0-9.,]/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") addArea(); }}
                placeholder="en" inputMode="decimal" className="tnum"
                style={{ ...inp, fontSize: kutuYazi(13), width: kutuEn(56), textAlign: "center" }}
              />
              <span>×</span>
              <input
                value={yeniBoy} onChange={(e) => setYeniBoy(e.target.value.replace(/[^0-9.,]/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") addArea(); }}
                placeholder="boy" inputMode="decimal" className="tnum"
                style={{ ...inp, fontSize: kutuYazi(13), width: kutuEn(56), textAlign: "center" }}
              />
              <span>m</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 8, lineHeight: 1.5 }}>
              Salonun gerçek en ve boyu. Boş bırakırsan ilk salonunun ölçüsüyle açılır, sonra
              değiştirebilirsin.
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={() => { setAddingArea(false); setNewAreaName(""); setYeniEn(""); setYeniBoy(""); }} style={{ ...btnSecondary, width: "auto", padding: "9px 16px" }}>Vazgeç</button>
              <button onClick={addArea} disabled={!newAreaName.trim()} style={{ border: "none", borderRadius: 980, padding: "9px 16px", background: "var(--brand-strong)", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: !newAreaName.trim() ? 0.5 : 1 }}>Ekle</button>
            </div>
          </div>
        </div>
      )}

      {/* MASA EKLE KATMANI — şekil ve kişi sayısı AYRI seçiliyor (Gökhan: "yuvarlak altı
          kişilik masada olabilir" — sabit eşleşme yanlıştı). Şekil rozetleri gerçek en/boy
          oranıyla çiziliyor (sekilRozeti), kare artık yuvarlak görünmüyor. */}
      {addingTable && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => { setAddingTable(false); setNewTableName(""); }}>
          {/* Genişlik telefonda ekrana göre daralıyor (referans: rezervasyon listesindeki
              "Yeni rezervasyon" penceresi) — sabit 340px dar telefonlarda taşıyordu. */}
          <div style={{ background: "var(--card)", borderRadius: 16, padding: isMobile ? 16 : 22, width: "min(420px, 94vw)", maxHeight: "calc(100svh - 48px)", overflowY: "auto", boxSizing: "border-box" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 14 }}>Masa ekle</div>
            {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{err}</div>}

            <input
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addTable(); if (e.key === "Escape") { setAddingTable(false); setNewTableName(""); } }}
              placeholder="Masa adı (Masa 9, Teras 2…)" style={{ ...inp, fontSize: kutuYazi(13), width: "100%" }} autoFocus
              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
            />

            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 14, marginBottom: 8 }}>Masa şekli</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {SEKILLER.map((s) => (
                <button
                  key={s.shape}
                  onClick={() => setNewTableShape(s.shape)}
                  style={{
                    all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
                    padding: 10, width: 82, height: 66, borderRadius: 12,
                    border: newTableShape === s.shape ? "2px solid var(--brand-strong)" : "1px solid var(--line-2)",
                    background: newTableShape === s.shape ? "var(--recede)" : "transparent",
                  }}
                >
                  <div style={{ ...sekilRozeti(s.shape, 30), background: "var(--tan-300)", border: "1px solid var(--line-2)" }} />
                  <span style={{ fontSize: 11, color: "var(--ink)" }}>{s.label}</span>
                </button>
              ))}
            </div>

            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 16, marginBottom: 8 }}>Koltuk sayısı</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {KOLTUK_SECENEKLERI.map((n) => (
                <button
                  key={n}
                  onClick={() => setNewTableSeats(String(n))}
                  style={{
                    all: "unset", cursor: "pointer", minWidth: 36, textAlign: "center", padding: "7px 0", borderRadius: 980, fontSize: 13,
                    border: newTableSeats === String(n) ? "2px solid var(--brand-strong)" : "1px solid var(--line-2)",
                    background: newTableSeats === String(n) ? "var(--recede)" : "transparent",
                    color: "var(--ink)", fontWeight: newTableSeats === String(n) ? 600 : 400,
                  }}
                >
                  {n}
                </button>
              ))}
              <input
                value={newTableSeats}
                onChange={(e) => setNewTableSeats(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric" className="tnum"
                style={{ ...inp, width: kutuEn(56), fontSize: kutuYazi(13), textAlign: "center", marginLeft: 6 }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => { setAddingTable(false); setNewTableName(""); }} style={btnSecondary}>Vazgeç</button>
              <button onClick={addTable} disabled={!newTableName.trim()} style={{ border: "none", borderRadius: 980, padding: "9px 16px", background: "var(--brand-strong)", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: !newTableName.trim() ? 0.5 : 1 }}>Ekle</button>
            </div>
          </div>
        </div>
      )}
      <RezervasyonAltNav />
    </div>
  );
}

// Plan 90 derece çevriliyken parmağın EKRANDAKİ hareketi, masanın PLANDAKİ hareketiyle aynı
// yön değildir: ekranda sağa gitmek planda yukarı gitmek demektir. Sürükleme farkı bu yüzden
// çevrilir — yoksa masa çekilen yere gitmiyor, elden kaçıyor (Gökhan, 2026-08-12).
// Tuval şöyle duruyor: translate(boy,0) rotate(90deg) — yani ekranX = boy - planY,
// ekranY = planX. Tersi: planX farkı = ekranY farkı, planY farkı = -ekranX farkı.
const surukleFarki = ekranYonunuPlanaCevir;

function TableBox({
  table, x, y, zoom, hizaXNoktalari, hizaYNoktalari, ozelOlculer, oturan, grup, grupSecili, secili, postada, cevir, odaW, odaH, onSurukleme, onMove, onRename, onRotate, onContextMenu, onKullanimTikla,
}: {
  table: TableRow; x: number; y: number; zoom: number; hizaXNoktalari: number[]; hizaYNoktalari: number[]; ozelOlculer: MasaOlcusu[]; oturan: OturanBilgi | null; grup: { id: string; ad: string; renk: string } | null; grupSecili: boolean | null; secili: boolean; postada: boolean;
  cevir: boolean; odaW: number | null; odaH: number | null; onSurukleme: (v: boolean) => void;
  onMove: (id: string, x: number, y: number) => void; onRename: (v: string) => void; onRotate: () => void; onContextMenu: (x: number, y: number) => void;
  onKullanimTikla: () => void;
}) {
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const [hover, setHover] = useState(false);
  const startRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const occupied = table.status === "occupied";
  const reserved = table.status === "reserved";
  const durumEtiket = occupied ? "Dolu" : reserved ? "Rzv" : "Boş";

  // Dış kutu (BOX_W×BOX_H) sadece sürükleme alanı — görünmez. Gerçek görünen şey içindeki
  // ŞEKİL: yuvarlak/kare/dikdörtgen, durum rengiyle boyalı, üstünde masa adı, İÇİNDE durum
  // yazısı (Gökhan: "durumu masanın içinde yazsın boş dolu rzv"). Dikdörtgen masa döndürülünce
  // (Gökhan: "dikdörtgen masalar çevrilebilsin") en/boy takas edilir — duvara dayalı masa
  // yatay ya da dikey durabilsin.
  const dikdortgen = table.shape === "dikdortgen";
  const olcu = govdeOlcusu(table.shape, table.seat_count, ozelOlculer);
  const govde = dikdortgen && table.rotated ? { width: olcu.height, height: olcu.width } : olcu;

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* dokunmatik/senkron olmayan işaretçilerde yakalama başarısız olabilir, sürükleme yine de çalışır */ }
    startRef.current = { x: e.clientX, y: e.clientY, moved: false };
    onSurukleme(true); // tazeleme dursun, masa elden kaçmasın
    setDragOffset({ dx: 0, dy: 0 });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) startRef.current.moved = true;
    setDragOffset(surukleFarki(dx, dy, cevir));
  };

  // Hizaya yapışma (Gökhan: "bir masayı aynı hizaya koyarken yardımcı olmalı, program aynı
  // sıraya koyulduğunu anladığında hizaya almalı") — sürüklenen masanın sol/orta/sağ ve
  // üst/orta/alt kenarları başka bir masanınkine yakınsa tam o değere yapışıyor. Eşik ekranda
  // sabit kalsın diye zoom'a bölünüyor.
  //
  // KILAVUZ ÇİZGİSİ ÇİZİLMİYOR (Gökhan, 2026-08-13: "referans çizgileri de görünmesin").
  // Yapışma duruyor, sadece kırmızı çizgi kalktı.
  const rawX = x + (dragOffset?.dx ?? 0) / zoom;
  const rawY = y + (dragOffset?.dy ?? 0) / zoom;
  let snapX = rawX, snapY = rawY;
  if (dragOffset) {
    // Yapışma eşiği ekranda 8 piksel; ama uzaklaşılmış planda 8/zoom büyüyüp yanındaki her
    // çizgiye yapışmaya başlıyordu — kılavuz çizgisi masayla birlikte oradan oraya zıplıyor,
    // masa istenen yere konamıyordu (Gökhan, 2026-08-12: "çizgiler stabil değil, çok hassas").
    // Üst sınır kondu.
    const ESIK = Math.min(8 / zoom, 12);
    let enIyiX = ESIK;
    for (const kenar of [rawX, rawX + govde.width / 2, rawX + govde.width]) {
      for (const hedef of hizaXNoktalari) {
        const fark = Math.abs(kenar - hedef);
        if (fark <= enIyiX) { enIyiX = fark; snapX = rawX + (hedef - kenar); }
      }
    }
    let enIyiY = ESIK;
    for (const kenar of [rawY, rawY + govde.height / 2, rawY + govde.height]) {
      for (const hedef of hizaYNoktalari) {
        const fark = Math.abs(kenar - hedef);
        if (fark <= enIyiY) { enIyiY = fark; snapY = rawY + (hedef - kenar); }
      }
    }
  }

  // Gökhan: "çektiğim yerde durmalı, otomatik yerleşme kapansın" — artık grid'e yapışmıyor,
  // bırakıldığı tam piksele yerleşiyor (snapCoord kaldırıldı) — hizalama kılavuzu hariç.
  // Düzenleme modu kapalıyken sürükleme yok — tıklamak (Gökhan: "masaya tıkladığında
  // rezervasyon listesi açılsın") o masanın rezervasyon listesini açar.
  // SALON ÇİZGİSİNİN İÇİNDE KALIR (Gökhan, 2026-08-12: "sürüklerken bile salonun çizgisinden
  // çıkmasın masalar"). Gövde kenarları salonun dışına taşamaz; masa duvara dayanır ve orada
  // durur. Salon ölçüsü girilmemişse eski davranış (sadece eksiye düşmesin).
  // Bu aynı zamanda tuvalin sürükleme sırasında büyümesini de engelliyor: masa dışarı
  // çıkabildiğinde tuval genişliyor, kaydırma çubuğu beliriyor, sığdırma yeniden çalışıp plan
  // gözün önünde geri zıplıyordu ("tıkladığımda salon geri gidiyor").
  const { x: sinirX, y: sinirY } = duvarIcinde(snapX, snapY, govde, odaW, odaH);

  const onPointerUp = () => {
    if (!startRef.current) return;
    const moved = startRef.current.moved;
    startRef.current = null;
    onSurukleme(false);
    setDragOffset(null);
    // Sürüklendiyse yerine bırakılır; sürüklenmeden tek dokunuşsa rezervasyon listesi açılır.
    if (moved) onMove(table.id, sinirX, sinirY);
    else onKullanimTikla();
  };

  const curX = sinirX;
  const curY = sinirY;

  const govdeRadius = table.shape === "yuvarlak" ? "50%" : table.shape === "loca" ? 16 : 10;
  // MASA GRUBUNUN RENGİ (Gökhan, 2026-08-16: "o gruba ait oluyor o masa, rengi değişiyor, adı
  // yazıyor"). Grup rengi masa BOŞKEN geçerli — dolu/rezerve durumu her zaman önce gelir,
  // yoksa gecenin ortasında hangi masanın dolu olduğu görünmez olur.
  const zeminRengi = occupied ? "var(--tan-300)" : reserved ? "var(--info-bg)"
    : grup ? `${grup.renk}22` : "var(--recede)";
  const kenarRengi = occupied ? "var(--brand)" : reserved ? "var(--info)"
    : grup ? grup.renk : "var(--line-2)";
  const durumRengi = occupied ? "var(--brand)" : reserved ? "var(--info)" : "var(--muted-2)";
  // Yazılar masanın boyutuna göre ölçekleniyor (Gökhan: "2 kişilik kare masada bilgiler
  // dışarı taşmış, bütün masaların içinde kalacak şekilde ölçeklendirilecek") — 64px (4
  // kişilik kare masanın gövdesi) referans "tam boy" alınıyor, küçük masalarda küçülüyor.
  const yaziOlcek = Math.max(0.55, Math.min(1, Math.min(govde.width, govde.height) / 64));
  const govdePadding = Math.max(2, Math.round(6 * yaziOlcek));
  const govdeGap = Math.max(1, Math.round(2 * yaziOlcek));

  return (
    <>
      <div
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e.clientX, e.clientY); }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        // KUTU ARTIK MASANIN KENDİSİ KADAR. Eskiden hep 148×108'di; iki kişilik masanın gövdesi
        // ise 56×56. Aradaki görünmez pay iki sorun çıkarıyordu:
        //  1) O boşluk da tutulabiliyordu — komşu masaya bastığını sanırken yanındaki masanın boş
        //     kenarını tutuyordun, o masa oynuyordu (Gökhan, 2026-08-13).
        //  2) Gövde salonun içindeyken bile bu görünmez kutu duvarı aşıyor, tuval taşıyor ve
        //     ekranın kenarında kaydırma çubuğu beliriyordu (Gökhan, 2026-08-13: "bahçe salonunda
        //     sağda kaydırma imleci duruyor, sayfa tam sayfa, ona ihtiyaç yok").
        // Konum yine sürükleme kutusunun sol üstünden hesaplanıyor (position_x/y değişmedi),
        // sadece kutunun kendisi gövdeye indi.
        position: "absolute",
        left: curX + (BOX_W - govde.width) / 2, top: curY + (BOX_H - govde.height) / 2,
        width: govde.width, height: govde.height,
        cursor: "grab", touchAction: "none", userSelect: "none",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}
      title={occupied && oturan ? `${oturan.guestName} · ${oturan.partySize} kişi` : "Rezervasyon listesini aç"}
    >
      <div
        style={{
          ...govde, borderRadius: govdeRadius, position: "relative",
          background: zeminRengi, border: `2px solid ${kenarRengi}`, boxSizing: "border-box", overflow: "hidden",
          // POSTA: giriş yapan garsonun masası yanıyor — altın halka + hafif parıltı. Grup
          // seçme modunda bu vurgu devreye girmiyor, orada seçim vurgusu geçerli.
          ...(grupSecili === null && postada
            ? { boxShadow: "0 0 0 3px var(--gold), 0 0 14px rgba(201,162,39,.45)" }
            : {}),
          // Grup seçme modunda seçili masa kalın çerçeveyle işaretli, seçilmeyen soluk kalıyor.
          ...(grupSecili === null ? {} : grupSecili
            ? { boxShadow: "0 0 0 3px var(--brand-strong)" }
            : { opacity: 0.4 }),
          // SEÇİLİ MASA — sol tıkla seçilen masa (Gökhan, 2026-08-19). Sol menüdeki çoğalt/sil
          // buna çalıştığı için hangi masa olduğu gözle görünmeli; en son o yazılıyor ki
          // posta/grup vurgusunun üstünde kalsın.
          ...(secili ? { boxShadow: "0 0 0 3px var(--brand-strong), 0 0 12px rgba(0,112,74,.35)" } : {}),
        }}
      >
      {/* Yazılar ayrı bir katmanda: plan 90° çevrildiğinde bu katman ters yöne çevrilip
          yazılar düz okunur kalıyor. Çevrilince en/boy da yer değiştiriyor ki katman
          gövdenin üstüne birebir otursun. */}
      <div
        style={{
          position: "absolute", left: "50%", top: "50%",
          width: cevir ? govde.height : govde.width, height: cevir ? govde.width : govde.height,
          transform: cevir ? "translate(-50%, -50%) rotate(-90deg)" : "translate(-50%, -50%)",
          boxSizing: "border-box",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: govdeGap, padding: govdePadding, overflow: "hidden",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13.5 * yaziOlcek, color: "var(--ink-green)", textAlign: "center", lineHeight: 1.15, maxWidth: "100%" }} onPointerDown={(e) => e.stopPropagation()}>
          <EditableText value={table.name} onSave={onRename} />
        </div>
        {/* Masanın kendi kapasitesi HER ZAMAN yazar — rezervasyonun kişi sayısını onun yerine
            yazınca 2 kişilik masada "4 kişi" görünüyor, masa 4 kişilikmiş gibi okunuyordu
            (Gökhan). Rezervasyon varsa ismi ayrı satırda, kişi sayısı isminin yanında. */}
        <div style={{ fontSize: 10.5 * yaziOlcek, color: "var(--muted-2)" }} className="tnum">{table.seat_count} kişilik</div>
        {/* Grubun adı — masa hangi gruba aitse planda görünsün (Gökhan, 2026-08-16).
            Masa doluyken misafirin adına yer açmak için gizleniyor. */}
        {grup && !oturan && (
          <div style={{ fontSize: 10 * yaziOlcek, fontWeight: 600, color: grup.renk, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {grup.ad}
          </div>
        )}
        {oturan ? (
          <div style={{ fontSize: 11 * yaziOlcek, fontWeight: 600, color: "var(--ink)", textAlign: "center", lineHeight: 1.1, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {oturan.guestName} <span className="tnum" style={{ color: "var(--muted-2)", fontWeight: 400 }}>({oturan.partySize})</span>
          </div>
        ) : (
          <div style={{ fontSize: 11 * yaziOlcek, fontWeight: 700, color: durumRengi }}>{durumEtiket}</div>
        )}
      </div>

        {/* Döndürme düğmesi yazı katmanının DIŞINDA — sadece düzenleme modunda görünüyor,
            orada plan zaten çevrilmiyor. */}
        {dikdortgen && hover && (
          <button
            onClick={(e) => { e.stopPropagation(); onRotate(); }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Masayı döndür" title="Döndür"
            style={{
              all: "unset", cursor: "pointer", position: "absolute", top: -8, right: -8, width: 22, height: 22, borderRadius: "50%",
              background: "var(--ink-green)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            }}
          >
            <RotateCw size={12} />
          </button>
        )}
      </div>
      </div>
    </>
  );
}

// Sabit boydaki öğeler (Kolon/Servis/Kapı/Loca) — tek noktadan (x1,y1) sürüklenir, rezervasyon/
// durum takibi yok, sadece salonun gerçek halini göstersin diye. TableBox'la aynı Pointer Events
// sürükleme deseni.
function SabitOge({
  oge, zoom, cevir, onMove, onRename, onContextMenu, onCevir,
}: {
  oge: SalonOge; zoom: number; cevir: boolean; onMove: (x1: number, y1: number) => void; onRename: (v: string) => void; onContextMenu: (x: number, y: number) => void; onCevir: () => void;
}) {
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  // Çevirme düğmesi öğenin üstüne gelince çıkıyor — masalardaki döndürme düğmesiyle aynı
  // (Gökhan, 2026-08-19: "kapıyı ekledim ama hâlâ çevirme özelliği yok"). Sağ tık menüsündeki
  // "Çevir" duruyor, bu onun göze görünen hali.
  const [hover, setHover] = useState(false);
  const startRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const olcu = SABIT_GORUNUM[oge.type];
  // Çevrilmişse en ile boy yer değiştiriyor — kapı yan duvara, servis dikey oturuyor.
  const gorunum = oge.rotated
    ? { ...olcu, genislik: olcu.yukseklik, yukseklik: olcu.genislik }
    : olcu;

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* dokunmatik/senkron olmayan işaretçilerde yakalama başarısız olabilir, sürükleme yine de çalışır */ }
    startRef.current = { x: e.clientX, y: e.clientY, moved: false };
    setDragOffset({ dx: 0, dy: 0 });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) startRef.current.moved = true;
    setDragOffset(surukleFarki(dx, dy, cevir));
  };
  const onPointerUp = () => {
    if (!startRef.current) return;
    const moved = startRef.current.moved;
    const dx = (dragOffset?.dx ?? 0) / zoom;
    const dy = (dragOffset?.dy ?? 0) / zoom;
    startRef.current = null;
    setDragOffset(null);
    if (moved) onMove(Math.max(0, oge.x1 + dx), Math.max(0, oge.y1 + dy));
  };

  const curX = oge.x1 + (dragOffset?.dx ?? 0) / zoom;
  const curY = oge.y1 + (dragOffset?.dy ?? 0) / zoom;

  return (
    <div
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e.clientX, e.clientY); }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: "absolute", left: curX, top: curY, width: gorunum.genislik, height: gorunum.yukseklik,
        cursor: "grab", touchAction: "none", userSelect: "none", boxSizing: "border-box",
        borderRadius: oge.type === "kapi" ? 6 : 10, background: gorunum.renk, opacity: 0.82,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 4,
        pointerEvents: "auto",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", textAlign: "center", lineHeight: 1.15, transform: cevir ? "rotate(-90deg)" : undefined }} onPointerDown={(e) => e.stopPropagation()}>
        <EditableText value={oge.name} onSave={onRename} />
      </div>
      {/* ÇEVİR — üstüne gelince köşede beliren düğme. Kapıyı yan duvara, servisi dikey
          koymak için en/boy takas ediyor. */}
      {hover && (
        <button
          onClick={(e) => { e.stopPropagation(); onCevir(); }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Öğeyi çevir" title="Çevir"
          style={{
            all: "unset", cursor: "pointer", position: "absolute", top: -8, right: -8, width: 22, height: 22, borderRadius: "50%",
            background: "var(--ink-green)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          }}
        >
          <RotateCw size={12} />
        </button>
      )}
    </div>
  );
}

// Çekip uzatılan öğeler (Duvar/Bar) — iki uçtan (x1,y1)-(x2,y2) tanımlı bir çubuk, açısı ve
// uzunluğu uçlardan bağımsız çekilerek değişir. Üç ayrı sürükleme alanı var: gövdenin kendisi
// (ikisi de aynı miktar kayar — moveOgeBody) ve iki uç tutamacı (tek taraf uzar/kısalır —
// moveOgeEndpoint). Tutamaçlar kendi Pointer Events'lerini gövdeninkine karışmasın diye
// stopPropagation ile izole ediyor.
function CekilebilirOge({
  oge, zoom, cevir, onMoveBody, onMoveEndpoint, onRename, onContextMenu,
}: {
  oge: SalonOge;
  zoom: number;
  cevir: boolean;
  onMoveBody: (x1: number, y1: number, x2: number, y2: number) => void;
  onMoveEndpoint: (which: 1 | 2, x: number, y: number) => void;
  onRename: (v: string) => void;
  onContextMenu: (x: number, y: number) => void;
}) {
  const [bodyDrag, setBodyDrag] = useState<{ dx: number; dy: number } | null>(null);
  const bodyStart = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [endDrag, setEndDrag] = useState<{ which: 1 | 2; dx: number; dy: number } | null>(null);
  const endStart = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const gorunum = CEKME_GORUNUM[oge.type];
  const x1 = oge.x1, y1 = oge.y1;
  const x2 = oge.x2 ?? oge.x1 + 120, y2 = oge.y2 ?? oge.y1;

  const bDx = (bodyDrag?.dx ?? 0) / zoom, bDy = (bodyDrag?.dy ?? 0) / zoom;
  const e1Dx = endDrag?.which === 1 ? endDrag.dx / zoom : 0, e1Dy = endDrag?.which === 1 ? endDrag.dy / zoom : 0;
  const e2Dx = endDrag?.which === 2 ? endDrag.dx / zoom : 0, e2Dy = endDrag?.which === 2 ? endDrag.dy / zoom : 0;

  const curX1 = x1 + bDx + e1Dx, curY1 = y1 + bDy + e1Dy;
  const curX2 = x2 + bDx + e2Dx, curY2 = y2 + bDy + e2Dy;

  const uzunluk = Math.max(20, Math.hypot(curX2 - curX1, curY2 - curY1));
  const aci = Math.atan2(curY2 - curY1, curX2 - curX1) * (180 / Math.PI);
  const ortaX = (curX1 + curX2) / 2, ortaY = (curY1 + curY2) / 2;

  const onBodyPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* dokunmatik/senkron olmayan işaretçilerde yakalama başarısız olabilir, sürükleme yine de çalışır */ }
    bodyStart.current = { x: e.clientX, y: e.clientY, moved: false };
    setBodyDrag({ dx: 0, dy: 0 });
  };
  const onBodyPointerMove = (e: React.PointerEvent) => {
    if (!bodyStart.current) return;
    const dx = e.clientX - bodyStart.current.x;
    const dy = e.clientY - bodyStart.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) bodyStart.current.moved = true;
    setBodyDrag(surukleFarki(dx, dy, cevir));
  };
  const onBodyPointerUp = () => {
    if (!bodyStart.current) return;
    const moved = bodyStart.current.moved;
    const dx = (bodyDrag?.dx ?? 0) / zoom, dy = (bodyDrag?.dy ?? 0) / zoom;
    bodyStart.current = null;
    setBodyDrag(null);
    if (moved) onMoveBody(Math.max(0, x1 + dx), Math.max(0, y1 + dy), Math.max(0, x2 + dx), Math.max(0, y2 + dy));
  };

  const endPointerDown = (which: 1 | 2, e: React.PointerEvent) => {
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* dokunmatik/senkron olmayan işaretçilerde yakalama başarısız olabilir, sürükleme yine de çalışır */ }
    endStart.current = { x: e.clientX, y: e.clientY, moved: false };
    setEndDrag({ which, dx: 0, dy: 0 });
  };
  const endPointerMove = (which: 1 | 2, e: React.PointerEvent) => {
    e.stopPropagation();
    if (!endStart.current) return;
    const dx = e.clientX - endStart.current.x;
    const dy = e.clientY - endStart.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) endStart.current.moved = true;
    setEndDrag({ which, ...surukleFarki(dx, dy, cevir) });
  };
  const endPointerUp = (which: 1 | 2, e: React.PointerEvent) => {
    e.stopPropagation();
    if (!endStart.current) return;
    const moved = endStart.current.moved;
    const dx = (endDrag?.dx ?? 0) / zoom, dy = (endDrag?.dy ?? 0) / zoom;
    endStart.current = null;
    setEndDrag(null);
    if (moved) {
      const baseX = which === 1 ? x1 : x2;
      const baseY = which === 1 ? y1 : y2;
      onMoveEndpoint(which, Math.max(0, baseX + dx), Math.max(0, baseY + dy));
    }
  };

  const handleStyle = (x: number, y: number): React.CSSProperties => ({
    position: "absolute", left: x - 6, top: y - 6, width: 12, height: 12, borderRadius: "50%",
    background: "var(--ink-green)", border: "2px solid #fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
    cursor: "grab", touchAction: "none",
  });

  // İsim etiketi gövdeyle birlikte döner — ters açılarda (90°'den büyük) baş aşağı olmasın
  // diye 180° geri döndürülüyor, hep yatay okunur kalıyor. Plan çevrildiyse buna ek olarak
  // 90° geri alınıyor.
  const etiketTersMi = aci > 90 || aci < -90;
  const etiketAci = (etiketTersMi ? 180 : 0) + (cevir ? -90 : 0);

  return (
    <>
      <div
        onPointerDown={onBodyPointerDown} onPointerMove={onBodyPointerMove} onPointerUp={onBodyPointerUp}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e.clientX, e.clientY); }}
        style={{
          position: "absolute", left: ortaX - uzunluk / 2, top: ortaY - gorunum.kalinlik / 2,
          width: uzunluk, height: gorunum.kalinlik, transform: `rotate(${aci}deg)`, transformOrigin: "center",
          background: gorunum.renk, borderRadius: oge.type === "bar" ? 6 : 3, opacity: 0.85,
          cursor: "grab", touchAction: "none", userSelect: "none", boxSizing: "border-box",
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "auto",
        }}
      >
        <div
          style={{ fontSize: 11, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", transform: etiketAci ? `rotate(${etiketAci}deg)` : undefined }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <EditableText value={oge.name} onSave={onRename} />
        </div>
      </div>
      {(
        <>
          <div onPointerDown={(e) => endPointerDown(1, e)} onPointerMove={(e) => endPointerMove(1, e)} onPointerUp={(e) => endPointerUp(1, e)} style={handleStyle(curX1, curY1)} />
          <div onPointerDown={(e) => endPointerDown(2, e)} onPointerMove={(e) => endPointerMove(2, e)} onPointerUp={(e) => endPointerUp(2, e)} style={handleStyle(curX2, curY2)} />
        </>
      )}
    </>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 10px", fontSize: 13, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0, boxSizing: "border-box" };
const btnSecondary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 16px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13, width: "100%", justifyContent: "center", cursor: "pointer" };
const btnSmall: React.CSSProperties = { border: "none", borderRadius: 10, padding: "9px 14px", background: "var(--ink-green)", color: "#fff", fontSize: 13.5, cursor: "pointer" };
// Sol menüdeki düğme kutuları 3 mm alçaltıldı (Gökhan, 2026-08-15: "buton kutularını 3'er mm
// küçült") — üstten ve alttan 1,5'er mm. Salon adları da bu ölçüye getirildi, hepsi aynı.
const btnSecondaryHeader: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid var(--line-2)", borderRadius: 10, padding: "calc(9px - 1.5mm) 14px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13.5, cursor: "pointer" };
const ogeMenuBtn: React.CSSProperties = { all: "unset", cursor: "pointer", display: "block", width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 13, color: "var(--ink)" };
// Telefon kontrol satırındaki yuvarlak ikon düğmeleri — parmakla basılabilecek kadar büyük
// (32px), ama üstteki satır tek sıra kalsın diye yazısız.
const mobilIkonBtn: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, width: 32, height: 32, flexShrink: 0, background: "var(--card)", color: "var(--ink-green)", fontSize: 16, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1 };
const zoomBtn: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 8, width: 26, height: 26, background: "var(--card)", color: "var(--ink-green)", fontSize: 15, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1 };
