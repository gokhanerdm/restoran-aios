"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ArrowLeft, RotateCw } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { getMyReservationRestaurantId } from "@/lib/supabase/reservationAccount";
import { toUpperTr, toTitleTr } from "@/lib/text";
import EditableText from "../../components/EditableText";
import { useConfirm } from "../../components/useConfirm";

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
type Shape = "yuvarlak" | "kare" | "dikdortgen" | "loca";
type TableRow = {
  id: string; name: string; area_id: string | null; status: string; sort_order: number;
  position_x: number | null; position_y: number | null; seat_count: number; shape: Shape; rotated: boolean;
};
type OturanBilgi = { guestName: string; partySize: number };

// Masa dışı salon öğeleri (Gökhan, 2026-08-04: "bar ikonu koyarız duvar koyarız... kolon
// koyalım bide servis koyalım kapı koyalım"). Rezervasyon/durum takibi yok, sadece salonun
// gerçek halini çizmek için. Duvar/Bar iki uçtan çekilip uzatılır; Kolon/Servis/Kapı sabit
// boyda, tek noktadan sürüklenir. restaurant_tables'a KARIŞTIRILMADI — oradaki kapasite/
// rezervasyon hesaplarını bozmasın diye ayrı bir tablo (salon_ogeleri). Loca burada YOK —
// o gerçek bir masa (yukarıdaki Shape), çünkü rezervasyon/durum taşıması gerekiyordu.
type OgeType = "duvar" | "bar" | "kolon" | "servis" | "kapi";
type SalonOge = { id: string; area_id: string; type: OgeType; name: string; x1: number; y1: number; x2: number | null; y2: number | null };
const CEKME_TIPLERI: { type: OgeType; label: string }[] = [
  { type: "duvar", label: "Duvar" },
  { type: "bar", label: "Bar" },
];
const SABIT_TIPLERI: { type: OgeType; label: string }[] = [
  { type: "kolon", label: "Kolon" },
  { type: "servis", label: "Servis" },
  { type: "kapi", label: "Kapı" },
];
// 1cm gerçek ölçünün piksel karşılığı — masa (Loca dahil) ve Duvar/Bar kalınlığı aynı oranı
// kullanır ki büyük/küçük karşılaştırması tutarlı olsun.
const PX_PER_CM = 0.8;
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
const KOLTUK_SECENEKLERI = [2, 4, 6, 8];

// Standart masa ölçüleri (Gökhan: "standart masa ölçüleri bul ona göre işle") — restoran
// mobilyası literatüründeki yaygın santim değerleri (ör. 2 kişilik kare ~60×60, 8 kişilik
// dikdörtgen ~220×90). Piksele PX_PER_CM ile çevriliyor ki büyük masa küçükten GERÇEKTEN
// büyük görünsün — önceki halde her masa şekli sabit tek boyuttaydı, kişi sayısının hiç
// etkisi yoktu. Loca ~150×110cm banket standardından (duvara dayalı çift banket + masa).
const CM_OLCU: Record<Shape, Record<number, { w: number; h: number }>> = {
  yuvarlak: { 2: { w: 70, h: 70 }, 4: { w: 90, h: 90 }, 6: { w: 150, h: 150 }, 8: { w: 180, h: 180 } },
  kare: { 2: { w: 60, h: 60 }, 4: { w: 80, h: 80 }, 6: { w: 110, h: 110 }, 8: { w: 140, h: 140 } },
  loca: { 2: { w: 110, h: 90 }, 4: { w: 150, h: 110 }, 6: { w: 190, h: 120 }, 8: { w: 230, h: 130 } },
  dikdortgen: { 2: { w: 70, h: 60 }, 4: { w: 120, h: 70 }, 6: { w: 180, h: 75 }, 8: { w: 220, h: 90 } },
};
const MIN_GOVDE_PX = 46;
// En yakın tanımlı kişi sayısına yuvarlar (2/4/6/8 arası serbest sayı da girilebiliyor —
// örn. 5 kişilik masa 4'ün ölçüsünü kullanır, tam santim hassasiyeti önemli değil).
const enYakinKoltuk = (seats: number) => KOLTUK_SECENEKLERI.reduce((a, b) => (Math.abs(b - seats) < Math.abs(a - seats) ? b : a));
const govdeOlcusu = (shape: Shape, seats: number): { width: number; height: number } => {
  const cm = CM_OLCU[shape][enYakinKoltuk(seats)];
  return { width: Math.max(MIN_GOVDE_PX, Math.round(cm.w * PX_PER_CM)), height: Math.max(MIN_GOVDE_PX, Math.round(cm.h * PX_PER_CM)) };
};
// Şekil rozeti — gerçek en/boy oranıyla (yuvarlak: eşit kenar + tam yuvarlak, kare: eşit
// kenar + hafif köşe, dikdörtgen: geniş + hafif köşe). Seçim ekranındaki küçük önizleme
// ikonu için — masanın kendi kutusu artık govdeOlcusu'nu kullanıyor.
const sekilRozeti = (shape: Shape, taban: number): React.CSSProperties => {
  if (shape === "yuvarlak") return { width: taban, height: taban, borderRadius: "50%" };
  if (shape === "kare") return { width: taban, height: taban, borderRadius: 4 };
  if (shape === "loca") return { width: taban * 1.35, height: taban, borderRadius: 12 };
  return { width: taban * 1.5, height: taban * 0.7, borderRadius: 4 };
};

const BOX_W = 148;
const BOX_H = 108;
const GAP = 14;
const COLS = 5;

const bugunIstanbul = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const bugunSiniri = () => {
  const gun = bugunIstanbul();
  const start = `${gun}T00:00:00+03:00`;
  const d = new Date(`${gun}T12:00:00+03:00`);
  d.setDate(d.getDate() + 1);
  const end = `${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d)}T00:00:00+03:00`;
  return { start, end };
};

export default function SalonPage() {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [oturanlar, setOturanlar] = useState<Record<string, OturanBilgi>>({});
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [addingArea, setAddingArea] = useState(false);
  const [newAreaName, setNewAreaName] = useState("");
  const [addingTable, setAddingTable] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [newTableShape, setNewTableShape] = useState<Shape>("kare");
  const [newTableSeats, setNewTableSeats] = useState("4");
  const [koltukInput, setKoltukInput] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; table: TableRow | null } | null>(null);
  const [ogeler, setOgeler] = useState<SalonOge[]>([]);
  const [ogeMenuAcik, setOgeMenuAcik] = useState(false);
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
    setAutoFitDone(false);
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
    const [{ data: a }, { data: t }, { data: r }, { data: o }] = await Promise.all([
      supabase.from("dining_areas").select("id, name, sort_order, genislik_cm, derinlik_cm").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("restaurant_tables").select("id, name, area_id, status, sort_order, position_x, position_y, seat_count, shape, rotated").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("reservations").select("table_id, guest_name, party_size").eq("restaurant_id", restId).eq("status", "oturdu")
        .gte("reserved_at", start).lt("reserved_at", end),
      supabase.from("salon_ogeleri").select("id, area_id, type, name, x1, y1, x2, y2").eq("restaurant_id", restId).is("deleted_at", null),
    ]);
    const areaRows = (a as Area[]) ?? [];
    setAreas(areaRows);
    setTables((t as TableRow[]) ?? []);
    setOgeler((o as SalonOge[]) ?? []);
    const map: Record<string, OturanBilgi> = {};
    ((r as { table_id: string | null; guest_name: string; party_size: number }[]) ?? []).forEach((row) => {
      if (row.table_id) map[row.table_id] = { guestName: row.guest_name, partySize: row.party_size };
    });
    setOturanlar(map);
    setSelectedAreaId((prev) => prev ?? (areaRows.length ? areaRows[0].id : null));
  }, []);

  useEffect(() => { if (restaurantId) load(restaurantId); }, [restaurantId, load]);
  useEffect(() => {
    if (!restaurantId) return;
    const id = setInterval(() => load(restaurantId), 6000);
    return () => clearInterval(id);
  }, [restaurantId, load]);

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

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
  };

  const renameArea = async (id: string, name: string) => { await supabase.from("dining_areas").update({ name: toUpperTr(name) }).eq("id", id); if (restaurantId) await load(restaurantId); };
  const deleteArea = async (a: Area) => {
    const count = tables.filter((t) => t.area_id === a.id).length;
    if (count > 0) {
      const ok = await confirm(`Bu salonda ${count} masa var. Silersen masalar da silinir. Yine de silinsin mi?`, { confirmLabel: "Sil" });
      if (!ok) return;
    }
    setErr(null);
    const { error } = await supabase.from("dining_areas").update({ deleted_at: new Date().toISOString() }).eq("id", a.id);
    if (error) { setErr(error.message); return; }
    if (selectedAreaId === a.id) setSelectedAreaId(null);
    if (restaurantId) await load(restaurantId);
  };
  const addArea = async () => {
    if (!restaurantId || !newAreaName.trim()) return;
    setErr(null);
    const { data, error } = await supabase.from("dining_areas").insert({ restaurant_id: restaurantId, name: toUpperTr(newAreaName), sort_order: areas.length }).select("id").single();
    if (error) { setErr(error.message); return; }
    setNewAreaName(""); setAddingArea(false);
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
  const saveSeatCount = async (id: string) => {
    const n = parseInt(koltukInput, 10);
    if (!Number.isFinite(n) || n < 1 || n > 50) { setErr("Koltuk sayısı 1 ile 50 arasında olmalı."); return; }
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").update({ seat_count: n }).eq("id", id);
    if (error) { setErr(error.message); return; }
    setCtxMenu(null);
    if (restaurantId) await load(restaurantId);
  };
  const deleteTable = async (t: TableRow) => {
    if (t.status !== "empty") { setErr("Dolu ya da rezerve bir masa silinemez — önce boşalması gerekiyor."); return; }
    const ok = await confirm(`"${t.name}" silinsin mi?`, { confirmLabel: "Sil" });
    if (!ok) return;
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").update({ deleted_at: new Date().toISOString() }).eq("id", t.id);
    if (error) { setErr(error.message); return; }
    if (restaurantId) await load(restaurantId);
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

  const tablesInArea = tables.filter((t) => t.area_id === selectedAreaId).sort((x, y) => x.sort_order - y.sort_order);
  const defaultPos = (i: number) => ({ x: (i % COLS) * (BOX_W + GAP) + GAP, y: Math.floor(i / COLS) * (BOX_H + GAP) + GAP });
  const placed = tablesInArea.filter((t) => t.position_x != null && t.position_y != null)
    .map((t) => ({ table: t, x: t.position_x as number, y: t.position_y as number }));
  const isFree = (x: number, y: number) => !placed.some((p) => Math.abs(p.x - x) < BOX_W / 2 && Math.abs(p.y - y) < BOX_H / 2);
  let nextSlot = 0;
  for (const t of tablesInArea.filter((t) => t.position_x == null || t.position_y == null)) {
    let d = defaultPos(nextSlot);
    while (!isFree(d.x, d.y)) { nextSlot++; d = defaultPos(nextSlot); }
    placed.push({ table: t, x: d.x, y: d.y });
    nextSlot++;
  }
  const positioned = tablesInArea.map((t) => placed.find((p) => p.table.id === t.id)!);
  let addSlot = nextSlot;
  let addBoxPos = defaultPos(addSlot);
  while (!isFree(addBoxPos.x, addBoxPos.y)) { addSlot++; addBoxPos = defaultPos(addSlot); }
  const ogeYukseklik = (o: SalonOge) => (o.type === "duvar" || o.type === "bar" ? CEKME_GORUNUM[o.type].kalinlik : SABIT_GORUNUM[o.type]?.yukseklik ?? 0);
  const ogeGenislik = (o: SalonOge) => (o.type === "duvar" || o.type === "bar" ? CEKME_GORUNUM[o.type].kalinlik : SABIT_GORUNUM[o.type]?.genislik ?? 0);
  const ogeAltSinirlari = ogelerInArea.map((o) => Math.max(o.y1, o.y2 ?? o.y1) + ogeYukseklik(o) + GAP);
  const ogeSagSinirlari = ogelerInArea.map((o) => Math.max(o.x1, o.x2 ?? o.x1) + ogeGenislik(o) + GAP);

  // Salon ölçeklendirme (Gökhan: "salonun gerçek oturumunu minyatürde görmek") — girilen
  // gerçek en/boy (m), masalarla AYNI PX_PER_CM oranıyla piksele çevrilip çerçeve olarak
  // çizilir; tuval en az bu çerçeveyi kapsayacak kadar büyür.
  const selectedArea = areas.find((a) => a.id === selectedAreaId) ?? null;
  const odaGenislikPx = selectedArea?.genislik_cm ? selectedArea.genislik_cm * PX_PER_CM : null;
  const odaDerinlikPx = selectedArea?.derinlik_cm ? selectedArea.derinlik_cm * PX_PER_CM : null;

  // 600/360 taban değeri sadece gerçek ölçü YOKKEN uygulanıyor — varsa tuval gerçek odaya
  // sıkı otursun (Gökhan: "ölçeklemede problem var, masalar ve salon aynı oranda değiller" —
  // sabit taban gerçek küçük bir salonu gereksiz büyütüp oranı bozuyordu).
  const containerWidth = Math.max(odaGenislikPx ? 0 : 600, ...positioned.map((p) => p.x + BOX_W + GAP), addBoxPos.x + BOX_W + GAP, ...ogeSagSinirlari, odaGenislikPx ?? 0);
  const containerHeight = Math.max(odaDerinlikPx ? 0 : 360, ...positioned.map((p) => p.y + BOX_H + GAP), addBoxPos.y + BOX_H + GAP, ...ogeAltSinirlari, odaDerinlikPx ?? 0);

  // "Tüm salonu göster" — tuvalin tamamı görünür kutuya sığacak zoom oranı (gerekirse
  // yakınlaştırarak da, küçük bir salon büyük bir ekranda kaybolmasın).
  const fitZoom = () => {
    if (!viewportSize.w || !viewportSize.h) return 1;
    return Math.max(0.05, Math.min(viewportSize.w / containerWidth, viewportSize.h / containerHeight));
  };
  const zoomUygula = (yeni: number) => setZoom(Math.min(6, Math.max(0.1, yeni)));
  const tumunuGoster = () => {
    zoomUygula(fitZoom());
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
  if (!autoFitDone && selectedAreaId && selectedArea?.genislik_cm && selectedArea?.derinlik_cm && viewportSize.w > 0 && viewportSize.h > 0) {
    setAutoFitDone(true);
    zoomUygula(fitZoom());
  }

  const toplamKoltuk = tables.reduce((s, t) => s + t.seat_count, 0);
  const doluSayisi = tables.filter((t) => t.status !== "empty").length;

  if (!restaurantId) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--canvas)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 380, textAlign: "center", fontSize: 13.5, color: err ? "var(--danger)" : "var(--muted)", lineHeight: 1.6 }}>{err ?? "Yükleniyor…"}</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 24px", height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box", overflow: "hidden", background: "var(--canvas)" }}>
      {confirmDialog}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexShrink: 0, flexWrap: "wrap", rowGap: 8 }}>
        <Link href="/rezervasyon" aria-label="Rezervasyon listesine dön" style={{ ...navBtn, textDecoration: "none" }}><ArrowLeft size={18} /></Link>
        <div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>Salon</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>{doluSayisi}/{tables.length} masa dolu · {toplamKoltuk} koltuk</div>
        </div>
        <div style={{ flex: 1 }} />
        {/* Sağ tık gizli kalıyordu (Gökhan: "masa ekleyemiyorum", "masa ekleyi sağ üste koy")
            — görünür buton başlıkta, sağ tık da hâlâ çalışıyor. */}
        <button
          onClick={() => { if (!selectedAreaId) return; setAddingTable(true); setErr(null); }}
          disabled={!selectedAreaId}
          style={{ ...btnSmall, opacity: !selectedAreaId ? 0.5 : 1, display: "inline-flex", alignItems: "center", gap: 5 }}
        >
          <Plus size={14} /> Masa ekle
        </button>

        {/* Salon ölçeklendirme (Gökhan: "salon ölçeklendirmeyi nasıl yapacağız") — Masa ekle'nin
            yanında, ayrı bir satır açıp tuvali küçültmesin diye (Gökhan: "üstten butonlar
            eklediğin için salon ekranımız küçülmüş"). */}
        {selectedAreaId && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)" }}>
              <span>Ölçü:</span>
              <input
                value={olcuInput.genislik}
                onChange={(e) => setOlcuInput((v) => ({ ...v, genislik: e.target.value.replace(/[^0-9.,]/g, "") }))}
                onBlur={saveOlcu} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                placeholder="en" inputMode="decimal" className="tnum"
                style={{ border: "1px solid var(--line-2)", borderRadius: 8, padding: "5px 7px", fontSize: 12.5, width: 44, background: "var(--card)", color: "var(--ink)", outline: "none" }}
              />
              <span>×</span>
              <input
                value={olcuInput.derinlik}
                onChange={(e) => setOlcuInput((v) => ({ ...v, derinlik: e.target.value.replace(/[^0-9.,]/g, "") }))}
                onBlur={saveOlcu} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                placeholder="boy" inputMode="decimal" className="tnum"
                style={{ border: "1px solid var(--line-2)", borderRadius: 8, padding: "5px 7px", fontSize: 12.5, width: 44, background: "var(--card)", color: "var(--ink)", outline: "none" }}
              />
              <span>m</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => zoomUygula(zoom / 1.25)} aria-label="Uzaklaştır" style={zoomBtn}>−</button>
              <span className="tnum" style={{ fontSize: 12, width: 38, textAlign: "center", color: "var(--muted)" }}>{Math.round(zoom * 100)}%</span>
              <button onClick={() => zoomUygula(zoom * 1.25)} aria-label="Yakınlaştır" style={zoomBtn}>+</button>
              <button onClick={tumunuGoster} style={{ ...btnSecondaryHeader, padding: "6px 12px", fontSize: 12.5 }}>Tüm salonu göster</button>
            </div>
          </>
        )}

        {/* Duvar/Bar/Kolon/Servis/Kapı/Loca — tıklanınca hemen eklenir, sürükleyip yerine
            çekilir (Gökhan: "onları ekleyim çekiştirirler olabilir mi"). */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => { if (!selectedAreaId) return; setOgeMenuAcik((v) => !v); }}
            disabled={!selectedAreaId}
            style={{ ...btnSecondaryHeader, opacity: !selectedAreaId ? 0.5 : 1 }}
          >
            <Plus size={14} /> Öğe ekle
          </button>
          {ogeMenuAcik && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setOgeMenuAcik(false)} />
              <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 6, zIndex: 61, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 8px 24px rgba(30,25,15,0.18)", padding: 6, minWidth: 160 }}>
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
      </div>

      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10, flexShrink: 0 }}>{err}</div>}

      <div style={{ display: "flex", gap: 20, flex: 1, minHeight: 0 }}>
        {/* Salon menüsü — Kasa'daki desenle aynı: tıkla geç, çift tıkla düzenle, sil. */}
        <div style={{ width: 180, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0, border: "1px solid var(--line)", borderRadius: 16, background: "var(--card)", padding: 6 }}>
            {areas.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", borderRadius: 10, background: selectedAreaId === a.id ? "var(--recede)" : "transparent" }}>
                <div onClick={() => setSelectedAreaId(a.id)} style={{ cursor: "pointer", flex: 1, padding: "10px 10px", fontSize: 13.5, fontWeight: selectedAreaId === a.id ? 600 : 500, color: selectedAreaId === a.id ? "var(--brand)" : "var(--ink)", minWidth: 0 }}>
                  <EditableText value={a.name} onSave={(v) => renameArea(a.id, v)} />
                </div>
                <button onClick={() => deleteArea(a)} aria-label="salonu sil" style={{ all: "unset", cursor: "pointer", padding: "0 8px", color: "var(--muted-2)" }}><Trash2 size={12} /></button>
              </div>
            ))}
            {areas.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 12.5, padding: 10 }}>Henüz salon yok</div>}
          </div>
          <div style={{ flexShrink: 0, marginTop: 10 }}>
            {!addingArea ? (
              <button onClick={() => setAddingArea(true)} style={btnSecondary}><Plus size={14} /> Salon ekle</button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <input value={newAreaName} onChange={(e) => setNewAreaName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addArea()} placeholder="Salon adı" style={inp} autoFocus />
                <button onClick={addArea} style={btnSmall}>Ekle</button>
              </div>
            )}
          </div>
        </div>

        {/* Kat planı — sürükle bırak, sağ tık menü, ölçekli yakınlaştırma. */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div
            ref={viewportRef}
            style={{ position: "relative", flex: 1, overflow: "auto", border: "1px solid var(--line)", borderRadius: 16, background: "var(--card)" }}
          >
            {!selectedAreaId ? (
              <div style={{ padding: 24, color: "var(--muted-2)", fontSize: 13 }}>Önce solda bir salon seç ya da ekle.</div>
            ) : (
              <div style={{ position: "relative", width: containerWidth * zoom, height: containerHeight * zoom }}>
                <div
                  onPointerDown={onCanvasPanDown} onPointerMove={onCanvasPanMove} onPointerUp={onCanvasPanUp}
                  style={{
                    position: "absolute", left: 0, top: 0, width: containerWidth, height: containerHeight,
                    transform: `scale(${zoom})`, transformOrigin: "0 0", cursor: "grab",
                  }}
                >
                  {/* Salonun gerçek ölçüsü girildiyse çerçeve — "gerçek oturumun minyatürü"
                      (Gökhan: "salonun gerçek oturumunu minyatürde görmek"). */}
                  {odaGenislikPx && odaDerinlikPx && (
                    <div style={{ position: "absolute", left: 0, top: 0, width: odaGenislikPx, height: odaDerinlikPx, border: "3px solid var(--brand-strong)", borderRadius: 20, boxSizing: "border-box", pointerEvents: "none" }}>
                      <div className="tnum" style={{ position: "absolute", top: -22, left: -3, fontSize: 12, fontWeight: 700, color: "var(--ink-green)" }}>
                        {(selectedArea!.genislik_cm! / 100).toFixed(1)} × {(selectedArea!.derinlik_cm! / 100).toFixed(1)} m
                      </div>
                    </div>
                  )}
                  {/* Salon öğeleri masaların ALTINDA çiziliyor — duvar/bar arka planda dursun,
                      masalar hep tıklanabilir üstte kalsın. */}
                  {ogelerInArea.filter((o) => o.type === "duvar" || o.type === "bar").map((o) => (
                    <CekilebilirOge
                      key={o.id} oge={o} zoom={zoom}
                      onMoveBody={(x1, y1, x2, y2) => moveOgeBody(o.id, x1, y1, x2, y2)}
                      onMoveEndpoint={(which, x, y) => moveOgeEndpoint(o.id, which, x, y)}
                      onRename={(v) => renameOge(o.id, v)}
                      onContextMenu={(x2, y2) => setOgeCtxMenu({ x: x2, y: y2, oge: o })}
                    />
                  ))}
                  {ogelerInArea.filter((o) => o.type !== "duvar" && o.type !== "bar").map((o) => (
                    <SabitOge
                      key={o.id} oge={o} zoom={zoom}
                      onMove={(x1, y1) => moveOge(o.id, x1, y1)}
                      onRename={(v) => renameOge(o.id, v)}
                      onContextMenu={(x2, y2) => setOgeCtxMenu({ x: x2, y: y2, oge: o })}
                    />
                  ))}
                  {positioned.map(({ table: t, x, y }) => (
                    <TableBox
                      key={t.id}
                      table={t}
                      x={x} y={y} zoom={zoom}
                      oturan={oturanlar[t.id] ?? null}
                      onMove={moveTable}
                      onRename={(v) => renameTable(t.id, v)}
                      onRotate={() => rotateTable(t.id, t.rotated)}
                      onContextMenu={(x2, y2) => { setKoltukInput(String(t.seat_count ?? 4)); setCtxMenu({ x: x2, y: y2, table: t }); }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 10, flexShrink: 0 }}>{tablesInArea.length} masa · boş bir yere sağ tıklayıp da ekleyebilirsin</div>
        </div>
      </div>

      {ctxMenu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} />
          <div style={{ position: "fixed", left: ctxMenu.x, top: ctxMenu.y, zIndex: 61, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 8px 24px rgba(30,25,15,0.18)", padding: 6, minWidth: 160 }}>
            {ctxMenu.table && (
              <>
                <div style={{ padding: "8px 12px 9px" }}>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 5 }}>Koltuk sayısı</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      value={koltukInput}
                      onChange={(e) => setKoltukInput(e.target.value.replace(/\D/g, ""))}
                      onKeyDown={(e) => e.key === "Enter" && saveSeatCount(ctxMenu.table!.id)}
                      inputMode="numeric" autoFocus className="tnum"
                      style={{ border: "1px solid var(--line-2)", borderRadius: 8, padding: "6px 8px", fontSize: 13, width: 56, background: "var(--card)", color: "var(--ink)", outline: "none" }}
                    />
                    <button onClick={() => saveSeatCount(ctxMenu.table!.id)} style={{ border: "none", borderRadius: 8, padding: "6px 12px", background: "var(--ink-green)", color: "#fff", fontSize: 12.5, cursor: "pointer" }}>Kaydet</button>
                  </div>
                </div>
                {ctxMenu.table.status !== "empty" ? (
                  <div style={{ padding: "9px 12px", fontSize: 12.5, color: "var(--muted-2)", maxWidth: 200, borderTop: "1px solid var(--line)" }}>
                    Bu masa {ctxMenu.table.status === "occupied" ? "dolu" : "rezerve"} — silmeden önce boşalması gerekiyor.
                  </div>
                ) : (
                  <button
                    onClick={() => { const t = ctxMenu.table!; setCtxMenu(null); deleteTable(t); }}
                    style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, fontSize: 13.5, color: "var(--danger)", borderTop: "1px solid var(--line)" }}
                  >
                    <Trash2 size={14} /> Masa sil
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      {ogeCtxMenu && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setOgeCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setOgeCtxMenu(null); }} />
          <div style={{ position: "fixed", left: ogeCtxMenu.x, top: ogeCtxMenu.y, zIndex: 61, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 8px 24px rgba(30,25,15,0.18)", padding: 6, minWidth: 160 }}>
            <button
              onClick={() => { const o = ogeCtxMenu.oge; setOgeCtxMenu(null); deleteOge(o); }}
              style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, width: "100%", boxSizing: "border-box", padding: "9px 12px", borderRadius: 8, fontSize: 13.5, color: "var(--danger)" }}
            >
              <Trash2 size={14} /> {[...CEKME_TIPLERI, ...SABIT_TIPLERI].find((t) => t.type === ogeCtxMenu.oge.type)?.label} sil
            </button>
          </div>
        </>
      )}

      {/* MASA EKLE KATMANI — şekil ve kişi sayısı AYRI seçiliyor (Gökhan: "yuvarlak altı
          kişilik masada olabilir" — sabit eşleşme yanlıştı). Şekil rozetleri gerçek en/boy
          oranıyla çiziliyor (sekilRozeti), kare artık yuvarlak görünmüyor. */}
      {addingTable && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => { setAddingTable(false); setNewTableName(""); }}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, minWidth: 340, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 14 }}>Masa ekle</div>
            {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{err}</div>}

            <input
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addTable(); if (e.key === "Escape") { setAddingTable(false); setNewTableName(""); } }}
              placeholder="Masa adı (Masa 9, Teras 2…)" style={inp} autoFocus
            />

            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 14, marginBottom: 8 }}>Masa şekli</div>
            <div style={{ display: "flex", gap: 10 }}>
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
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
                style={{ ...inp, width: 56, textAlign: "center", marginLeft: 6 }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => { setAddingTable(false); setNewTableName(""); }} style={btnSecondary}>Vazgeç</button>
              <button onClick={addTable} disabled={!newTableName.trim()} style={{ border: "none", borderRadius: 980, padding: "9px 16px", background: "var(--brand-strong)", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", opacity: !newTableName.trim() ? 0.5 : 1 }}>Ekle</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TableBox({
  table, x, y, zoom, oturan, onMove, onRename, onRotate, onContextMenu,
}: {
  table: TableRow; x: number; y: number; zoom: number; oturan: OturanBilgi | null;
  onMove: (id: string, x: number, y: number) => void; onRename: (v: string) => void; onRotate: () => void; onContextMenu: (x: number, y: number) => void;
}) {
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const [hover, setHover] = useState(false);
  const startRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const occupied = table.status === "occupied";
  const reserved = table.status === "reserved";
  const durumEtiket = occupied ? "Dolu" : reserved ? "Rzv" : "Boş";

  const onPointerDown = (e: React.PointerEvent) => {
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* dokunmatik/senkron olmayan işaretçilerde yakalama başarısız olabilir, sürükleme yine de çalışır */ }
    startRef.current = { x: e.clientX, y: e.clientY, moved: false };
    setDragOffset({ dx: 0, dy: 0 });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) startRef.current.moved = true;
    setDragOffset({ dx, dy });
  };
  // Gökhan: "çektiğim yerde durmalı, otomatik yerleşme kapansın" — artık grid'e yapışmıyor,
  // bırakıldığı tam piksele yerleşiyor (snapCoord kaldırıldı). Ekran-piksel farkı zoom'a
  // bölünüyor — tuval ölçeklenince (Gökhan: "salon ölçeklendirme") imleçle 1:1 hareket etsin.
  const onPointerUp = () => {
    if (!startRef.current) return;
    const moved = startRef.current.moved;
    const dx = (dragOffset?.dx ?? 0) / zoom;
    const dy = (dragOffset?.dy ?? 0) / zoom;
    startRef.current = null;
    setDragOffset(null);
    if (moved) onMove(table.id, Math.max(0, x + dx), Math.max(0, y + dy));
  };

  const curX = x + (dragOffset?.dx ?? 0) / zoom;
  const curY = y + (dragOffset?.dy ?? 0) / zoom;

  // Dış kutu (BOX_W×BOX_H) sadece sürükleme alanı — görünmez. Gerçek görünen şey içindeki
  // ŞEKİL: yuvarlak/kare/dikdörtgen, durum rengiyle boyalı, üstünde masa adı, İÇİNDE durum
  // yazısı (Gökhan: "durumu masanın içinde yazsın boş dolu rzv"). Dikdörtgen masa döndürülünce
  // (Gökhan: "dikdörtgen masalar çevrilebilsin") en/boy takas edilir — duvara dayalı masa
  // yatay ya da dikey durabilsin.
  const dikdortgen = table.shape === "dikdortgen";
  const olcu = govdeOlcusu(table.shape, table.seat_count);
  const govde = dikdortgen && table.rotated ? { width: olcu.height, height: olcu.width } : olcu;
  const govdeRadius = table.shape === "yuvarlak" ? "50%" : table.shape === "loca" ? 16 : 10;
  const zeminRengi = occupied ? "var(--tan-300)" : reserved ? "var(--info-bg)" : "var(--recede)";
  const kenarRengi = occupied ? "var(--brand)" : reserved ? "var(--info)" : "var(--line-2)";
  const durumRengi = occupied ? "var(--brand)" : reserved ? "var(--info)" : "var(--muted-2)";

  return (
    <div
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); onContextMenu(e.clientX, e.clientY); }}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: "absolute", left: curX, top: curY, width: BOX_W, height: BOX_H,
        cursor: "grab", touchAction: "none", userSelect: "none",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5,
      }}
      title={occupied && oturan ? `${oturan.guestName} · ${oturan.partySize} kişi` : undefined}
    >
      <div
        style={{
          ...govde, borderRadius: govdeRadius, position: "relative",
          background: zeminRengi, border: `2px solid ${kenarRengi}`, boxSizing: "border-box",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, padding: 6,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--ink-green)", textAlign: "center", lineHeight: 1.15, maxWidth: "100%" }} onPointerDown={(e) => e.stopPropagation()}>
          <EditableText value={table.name} onSave={onRename} />
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted-2)" }} className="tnum">{table.seat_count} kişilik</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: durumRengi }}>{durumEtiket}</div>

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
  );
}

// Sabit boydaki öğeler (Kolon/Servis/Kapı/Loca) — tek noktadan (x1,y1) sürüklenir, rezervasyon/
// durum takibi yok, sadece salonun gerçek halini göstersin diye. TableBox'la aynı Pointer Events
// sürükleme deseni.
function SabitOge({
  oge, zoom, onMove, onRename, onContextMenu,
}: {
  oge: SalonOge; zoom: number; onMove: (x1: number, y1: number) => void; onRename: (v: string) => void; onContextMenu: (x: number, y: number) => void;
}) {
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const startRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const gorunum = SABIT_GORUNUM[oge.type];

  const onPointerDown = (e: React.PointerEvent) => {
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* dokunmatik/senkron olmayan işaretçilerde yakalama başarısız olabilir, sürükleme yine de çalışır */ }
    startRef.current = { x: e.clientX, y: e.clientY, moved: false };
    setDragOffset({ dx: 0, dy: 0 });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) startRef.current.moved = true;
    setDragOffset({ dx, dy });
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
      style={{
        position: "absolute", left: curX, top: curY, width: gorunum.genislik, height: gorunum.yukseklik,
        cursor: "grab", touchAction: "none", userSelect: "none", boxSizing: "border-box",
        borderRadius: oge.type === "kapi" ? 6 : 10, background: gorunum.renk, opacity: 0.82,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 4,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "#fff", textAlign: "center", lineHeight: 1.15 }} onPointerDown={(e) => e.stopPropagation()}>
        <EditableText value={oge.name} onSave={onRename} />
      </div>
    </div>
  );
}

// Çekip uzatılan öğeler (Duvar/Bar) — iki uçtan (x1,y1)-(x2,y2) tanımlı bir çubuk, açısı ve
// uzunluğu uçlardan bağımsız çekilerek değişir. Üç ayrı sürükleme alanı var: gövdenin kendisi
// (ikisi de aynı miktar kayar — moveOgeBody) ve iki uç tutamacı (tek taraf uzar/kısalır —
// moveOgeEndpoint). Tutamaçlar kendi Pointer Events'lerini gövdeninkine karışmasın diye
// stopPropagation ile izole ediyor.
function CekilebilirOge({
  oge, zoom, onMoveBody, onMoveEndpoint, onRename, onContextMenu,
}: {
  oge: SalonOge;
  zoom: number;
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
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* dokunmatik/senkron olmayan işaretçilerde yakalama başarısız olabilir, sürükleme yine de çalışır */ }
    bodyStart.current = { x: e.clientX, y: e.clientY, moved: false };
    setBodyDrag({ dx: 0, dy: 0 });
  };
  const onBodyPointerMove = (e: React.PointerEvent) => {
    if (!bodyStart.current) return;
    const dx = e.clientX - bodyStart.current.x;
    const dy = e.clientY - bodyStart.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) bodyStart.current.moved = true;
    setBodyDrag({ dx, dy });
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
    setEndDrag({ which, dx, dy });
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
  // diye 180° geri döndürülüyor, hep yatay okunur kalıyor.
  const etiketTersMi = aci > 90 || aci < -90;

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
        }}
      >
        <div
          style={{ fontSize: 11, fontWeight: 700, color: "#fff", whiteSpace: "nowrap", transform: etiketTersMi ? "rotate(180deg)" : undefined }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <EditableText value={oge.name} onSave={onRename} />
        </div>
      </div>
      <div onPointerDown={(e) => endPointerDown(1, e)} onPointerMove={(e) => endPointerMove(1, e)} onPointerUp={(e) => endPointerUp(1, e)} style={handleStyle(curX1, curY1)} />
      <div onPointerDown={(e) => endPointerDown(2, e)} onPointerMove={(e) => endPointerMove(2, e)} onPointerUp={(e) => endPointerUp(2, e)} style={handleStyle(curX2, curY2)} />
    </>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 10px", fontSize: 13, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0, boxSizing: "border-box" };
const btnSecondary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 16px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13, width: "100%", justifyContent: "center", cursor: "pointer" };
const btnSmall: React.CSSProperties = { border: "none", borderRadius: 10, padding: "9px 14px", background: "var(--ink-green)", color: "#fff", fontSize: 13.5, cursor: "pointer" };
const navBtn: React.CSSProperties = { all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: 6, borderRadius: 8, color: "var(--muted)" };
const btnSecondaryHeader: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, border: "1px solid var(--line-2)", borderRadius: 10, padding: "9px 14px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13.5, cursor: "pointer" };
const ogeMenuBtn: React.CSSProperties = { all: "unset", cursor: "pointer", display: "block", width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, fontSize: 13, color: "var(--ink)" };
const zoomBtn: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 8, width: 26, height: 26, background: "var(--card)", color: "var(--ink-green)", fontSize: 15, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, lineHeight: 1 };
