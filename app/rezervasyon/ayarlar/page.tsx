"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getMyReservationRestaurantId, getMyReservationRestaurants, isMultiBranchAccount, setAktifSube, type ReservationBranch } from "@/lib/supabase/reservationAccount";
import { toUpperTr, toTitleTr } from "@/lib/text";
import { eslesenIller, eslesenIlceler } from "@/lib/turkeyLocations";
import { Plus, Trash2, ChevronDown, ChevronRight, ArrowLeft, Store } from "lucide-react";
import { useConfirm } from "../../components/useConfirm";
import RezervasyonAltNav, { ALT_NAV_YUKSEKLIK } from "../../components/RezervasyonAltNav";
import RezervasyonUstBar from "../../components/RezervasyonUstBar";
import EditableText from "../../components/EditableText";
import { ListHeader, HeaderCell, HeaderSep, ListRow, RowSep, Cell, Spacer, ActionsCell } from "../../components/ListRow";

// REZERVASYON > AYARLAR — programın kendi ayar ekranı (Gökhan onayı, 2026-08-04).
//
// Rezervasyon AIOS'tan ayrıldı ve tek başına satılacak. Bugüne kadar masalar ve çalışma
// saatleri AIOS'un Ayarlar/Adisyon ekranlarından yönetiliyordu — o ekranlar bu programda
// yok. Program AIOS'suz çalışamıyordu; bu ekran o bağı kesiyor, her şeyin önkoşulu.
//
// Tabloların hiçbiri yeni değil: masalar restaurant_tables, salonlar dining_areas,
// saatler/KVKK restaurant_settings, işletme bilgileri restaurants. Sadece varsayılan
// oturma süresi yeni eklendi (bkz. 20260804120000).
//
// Sol panel masalar (satır tabanlı liste, salon başlıklarıyla gruplu — PAGE_STANDARDS #3/#4),
// sağ panel diğer ayarlar (tek Kaydet — PAGE_STANDARDS #2).

type Area = { id: string; name: string; sort_order: number };
type Table = { id: string; name: string; area_id: string | null; seat_count: number; sort_order: number };

// Masa ölçüleri (Gökhan, 2026-08-05: "masa ölçülerini de girsinler ayarlardan, hangi
// masaları varsa onları seçip ölçü girsin") — Salon ekranındaki (app/rezervasyon/salon)
// standart değerlerle AYNI, işletme burada kendi ölçüsünü girmezse bunlar kullanılır.
type MasaSekli = "yuvarlak" | "kare" | "dikdortgen" | "loca";
const MASA_SEKILLERI: { shape: MasaSekli; label: string }[] = [
  { shape: "yuvarlak", label: "Yuvarlak" },
  { shape: "kare", label: "Kare" },
  { shape: "dikdortgen", label: "Dikdörtgen" },
  { shape: "loca", label: "Loca" },
];
const MASA_KOLTUK_TIERLERI = [2, 4, 6, 8];
const VARSAYILAN_OLCU: Record<MasaSekli, Record<number, { w: number; h: number }>> = {
  yuvarlak: { 2: { w: 70, h: 70 }, 4: { w: 90, h: 90 }, 6: { w: 150, h: 150 }, 8: { w: 180, h: 180 } },
  kare: { 2: { w: 70, h: 70 }, 4: { w: 90, h: 90 }, 6: { w: 110, h: 110 }, 8: { w: 140, h: 140 } },
  loca: { 2: { w: 110, h: 90 }, 4: { w: 150, h: 110 }, 6: { w: 190, h: 120 }, 8: { w: 230, h: 130 } },
  dikdortgen: { 2: { w: 70, h: 60 }, 4: { w: 120, h: 70 }, 6: { w: 180, h: 70 }, 8: { w: 220, h: 70 } },
};
type MasaOlcusu = { shape: MasaSekli; seat_tier: number; width_cm: number; height_cm: number };

type DayKey = "pzt" | "sal" | "car" | "per" | "cum" | "cmt" | "paz";
type DayHours = { acilis: string; kapanis: string; kapali: boolean };
type OpeningHours = Record<DayKey, DayHours>;

// AIOS Ayarlar'daki liste ile birebir aynı — aynı jsonb alanını paylaşıyorlar, gün
// anahtarları farklılaşırsa iki ekran birbirinin verisini bozar.
const DAYS: { k: DayKey; l: string }[] = [
  { k: "pzt", l: "Pazartesi" },
  { k: "sal", l: "Salı" },
  { k: "car", l: "Çarşamba" },
  { k: "per", l: "Perşembe" },
  { k: "cum", l: "Cuma" },
  { k: "cmt", l: "Cumartesi" },
  { k: "paz", l: "Pazar" },
];
const DEFAULT_DAY: DayHours = { acilis: "09:00", kapanis: "23:00", kapali: false };
const defaultHours = (): OpeningHours => {
  const out = {} as OpeningHours;
  for (const d of DAYS) out[d.k] = { ...DEFAULT_DAY };
  return out;
};
// DB'de gün eksik/bozuksa varsayılanla tamamla — ekran hiçbir durumda boş kalmasın.
const mergeHours = (raw: unknown): OpeningHours => {
  const base = defaultHours();
  if (!raw || typeof raw !== "object") return base;
  const src = raw as Partial<Record<DayKey, Partial<DayHours>>>;
  for (const d of DAYS) {
    const v = src[d.k];
    if (!v) continue;
    base[d.k] = {
      acilis: typeof v.acilis === "string" ? v.acilis : DEFAULT_DAY.acilis,
      kapanis: typeof v.kapanis === "string" ? v.kapanis : DEFAULT_DAY.kapanis,
      kapali: Boolean(v.kapali),
    };
  }
  return base;
};

// Salonu olmayan masalar kaybolmasın diye otomatik grup (PAGE_STANDARDS #4).
const DIGER = "__diger__";

// Kapanış saati açılıştan önceyse gece yarısını geçmiş demektir (gece kulübü 23:00–04:00,
// meyhane 18:00–01:00 gibi) — ayrı bir "ertesi gün" kutucuğu yok, saatlerden çıkarılıyor.
// Giriş ekranındaki (app/rezervasyon/giris) aynı isimli fonksiyonla aynı mantık.
const kapanisErtesiGun = (acilis: string, kapanis: string) => Boolean(acilis) && Boolean(kapanis) && kapanis < acilis;

export default function RezervasyonAyarlarPage() {
  const router = useRouter();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kaydedildi, setKaydedildi] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();
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

  const [areas, setAreas] = useState<Area[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [kapali, setKapali] = useState<Set<string>>(new Set());

  const [masaOlculeri, setMasaOlculeri] = useState<MasaOlcusu[]>([]);
  const [duzenlenenHucre, setDuzenlenenHucre] = useState<{ shape: MasaSekli; tier: number } | null>(null);
  const [taslakGenislik, setTaslakGenislik] = useState("");
  const [taslakBoy, setTaslakBoy] = useState("");

  const [newAreaName, setNewAreaName] = useState("");
  // Hangi salona masa ekleniyor — satır içi mini form, ayrı pencere değil.
  const [addingTableFor, setAddingTableFor] = useState<string | null>(null);
  const [newTableName, setNewTableName] = useState("");
  const [newTableSeats, setNewTableSeats] = useState("4");

  const [isim, setIsim] = useState("");
  const [telefon, setTelefon] = useState("");
  const [adres, setAdres] = useState("");
  const [hours, setHours] = useState<OpeningHours>(defaultHours());
  // Yeni rezervasyon penceresinin açılış saati (Gökhan: "varsayılan saat de ayarlanabilsin").
  const [varsayilanSaat, setVarsayilanSaat] = useState("19:00");
  const [oturmaSuresi, setOturmaSuresi] = useState("90");
  const [kvkkNotice, setKvkkNotice] = useState("");
  // Otomatik yerleşme (Gökhan: "kullanmak isteyen kullanacak, istemeyen kullanmayacak") —
  // açıkken kişi sayısı büyüyüp masa yetmeyince program masayı kendi tamamlıyor.
  const [otoYerlesme, setOtoYerlesme] = useState(false);
  // Saate göre masa hesabı — isteğe bağlı, varsayılan kapalı. Kapalıyken günün tamamı tek
  // havuz sayılır (öğle/akşam ayrımı kaldırıldı — program eğlence mekanlarına yapılıyor).
  const [saateGore, setSaateGore] = useState(false);
  const [masaArasiPay, setMasaArasiPay] = useState("0");
  // Kişi kartındaki "Müdavim"/"No-show riski" etiketleri bu eşiklere göre otomatik hesaplanır
  // (Gökhan: "eşikler sabit kodlanmasın, ileride ayarlardan değiştirilebilecek mantıkta olsun").
  const [esikMudavim, setEsikMudavim] = useState("5");
  const [esikNoShow, setEsikNoShow] = useState("30");

  // Şubeler — sadece çok şubeli hesapta gösterilir (Gökhan, 2026-08-04: "çok şubeli
  // işletmede şube ekle olmalı, girilen bilgiler aynı olmalı, değişkenlik gösteren
  // bilgiler girilmeli" — marka bilgisi tekrar sorulmaz, sadece şubeye özgü alanlar).
  const [cokSubeli, setCokSubeli] = useState(false);
  const [subeler, setSubeler] = useState<ReservationBranch[]>([]);
  const [subeEkleAcik, setSubeEkleAcik] = useState(false);
  const [subeBusy, setSubeBusy] = useState(false);
  const [subeErr, setSubeErr] = useState<string | null>(null);
  const [bAdi, setBAdi] = useState("");
  const [bTelefon, setBTelefon] = useState("");
  const [bIl, setBIl] = useState("");
  const [bIlce, setBIlce] = useState("");
  const [bAdres, setBAdres] = useState("");
  const [bIlOnerileriAcik, setBIlOnerileriAcik] = useState(false);
  const [bIlceOnerileriAcik, setBIlceOnerileriAcik] = useState(false);
  const [bAcikGunler, setBAcikGunler] = useState<Set<DayKey>>(new Set(DAYS.map((d) => d.k)));
  const [bAcilis, setBAcilis] = useState("09:00");
  const [bKapanis, setBKapanis] = useState("23:00");

  useEffect(() => {
    let active = true;
    getMyReservationRestaurantId().then((id) => {
      if (!active) return;
      if (!id) { router.replace("/rezervasyon/giris"); return; }
      setRestaurantId(id);
    });
    isMultiBranchAccount().then((v) => { if (active) setCokSubeli(v); });
    getMyReservationRestaurants().then((list) => { if (active) setSubeler(list); });
    return () => { active = false; };
  }, [router]);

  const subeleriYenile = async () => setSubeler(await getMyReservationRestaurants());

  const subeDegistir = (id: string) => {
    setAktifSube(id);
    window.location.assign("/rezervasyon/ayarlar");
  };

  const bGunToggle = (k: DayKey) => setBAcikGunler((s) => {
    const next = new Set(s);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  const subeEkle = async () => {
    if (!restaurantId || subeBusy) return;
    if (!bAdi.trim() || !bIl.trim() || !bIlce.trim() || !bAdres.trim()) {
      setSubeErr("Şube adı, il, ilçe ve açık adres gerekli.");
      return;
    }
    if (bAcikGunler.size === 0) { setSubeErr("En az bir çalışma günü seçmelisin."); return; }
    setSubeErr(null); setSubeBusy(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setSubeBusy(false); setSubeErr("Oturum bulunamadı."); return; }

    const opening_hours = {} as OpeningHours;
    for (const d of DAYS) {
      opening_hours[d.k] = bAcikGunler.has(d.k)
        ? { acilis: bAcilis, kapanis: bKapanis, kapali: false }
        : { acilis: bAcilis, kapanis: bKapanis, kapali: true };
    }

    const { data: yeniId, error } = await supabase.rpc("add_reservation_branch", {
      p_user_id: session.user.id,
      p_branch_name: toTitleTr(bAdi),
      p_branch_phone: bTelefon.trim(),
      p_il: toTitleTr(bIl),
      p_ilce: toTitleTr(bIlce),
      p_address: toTitleTr(bAdres),
      p_opening_hours: opening_hours,
    });
    setSubeBusy(false);
    if (error) { setSubeErr(error.message); return; }

    setBAdi(""); setBTelefon(""); setBIl(""); setBIlce(""); setBAdres("");
    setBAcikGunler(new Set(DAYS.map((d) => d.k))); setBAcilis("09:00"); setBKapanis("23:00");
    setSubeEkleAcik(false);
    await subeleriYenile();
    if (yeniId) subeDegistir(yeniId as string);
  };

  const load = useCallback(async (restId: string) => {
    const [{ data: a }, { data: t }, { data: r }, { data: s }, { data: mo }] = await Promise.all([
      supabase.from("dining_areas").select("id, name, sort_order").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("restaurant_tables").select("id, name, area_id, seat_count, sort_order").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("restaurants").select("name, phone, address").eq("id", restId).maybeSingle(),
      supabase.from("restaurant_settings").select("opening_hours, kvkk_notice, default_duration_minutes, auto_seating, saate_gore_masa, masa_arasi_pay, varsayilan_rezervasyon_saati, musteri_sadakat_ziyaret_esigi, musteri_no_show_risk_yuzde").eq("restaurant_id", restId).maybeSingle(),
      supabase.from("masa_olculeri").select("shape, seat_tier, width_cm, height_cm").eq("restaurant_id", restId),
    ]);
    setAreas((a as Area[]) ?? []);
    setTables((t as Table[]) ?? []);
    const rRow = r as { name: string; phone: string | null; address: string | null } | null;
    setIsim(rRow?.name ?? "");
    setTelefon(rRow?.phone ?? "");
    setAdres(rRow?.address ?? "");
    const sRow = s as {
      opening_hours: unknown; kvkk_notice: string | null; default_duration_minutes: number; auto_seating: boolean; saate_gore_masa: boolean; masa_arasi_pay: number;
      varsayilan_rezervasyon_saati: string; musteri_sadakat_ziyaret_esigi: number; musteri_no_show_risk_yuzde: number;
    } | null;
    setHours(mergeHours(sRow?.opening_hours));
    setVarsayilanSaat(sRow?.varsayilan_rezervasyon_saati ?? "19:00");
    setOturmaSuresi(String(sRow?.default_duration_minutes ?? 90));
    setKvkkNotice(sRow?.kvkk_notice ?? "");
    setOtoYerlesme(sRow?.auto_seating ?? false);
    setSaateGore(sRow?.saate_gore_masa ?? false);
    setMasaArasiPay(String(sRow?.masa_arasi_pay ?? 0));
    setEsikMudavim(String(sRow?.musteri_sadakat_ziyaret_esigi ?? 5));
    setEsikNoShow(String(sRow?.musteri_no_show_risk_yuzde ?? 30));
    setMasaOlculeri((mo as MasaOlcusu[]) ?? []);
  }, []);

  useEffect(() => { if (restaurantId) load(restaurantId); }, [restaurantId, load]);

  const yenile = async () => { if (restaurantId) await load(restaurantId); };

  // --- Masa ölçüleri ---
  const masaOlcusuBul = (shape: MasaSekli, tier: number) => masaOlculeri.find((o) => o.shape === shape && o.seat_tier === tier);
  const hucreDuzenlemeyeBasla = (shape: MasaSekli, tier: number) => {
    const mevcut = masaOlcusuBul(shape, tier);
    setTaslakGenislik(String(mevcut?.width_cm ?? VARSAYILAN_OLCU[shape][tier].w));
    setTaslakBoy(String(mevcut?.height_cm ?? VARSAYILAN_OLCU[shape][tier].h));
    setErr(null);
    setDuzenlenenHucre({ shape, tier });
  };
  const hucreKaydet = async () => {
    if (!restaurantId || !duzenlenenHucre) return;
    const w = parseFloat(taslakGenislik.replace(",", "."));
    const h = parseFloat(taslakBoy.replace(",", "."));
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) { setErr("Genişlik ve boy geçerli birer sayı olmalı."); return; }
    setErr(null);
    const { error } = await supabase.from("masa_olculeri").upsert({
      restaurant_id: restaurantId, shape: duzenlenenHucre.shape, seat_tier: duzenlenenHucre.tier,
      width_cm: w, height_cm: h, updated_at: new Date().toISOString(),
    }, { onConflict: "restaurant_id,shape,seat_tier" });
    if (error) { setErr(error.message); return; }
    setDuzenlenenHucre(null);
    await yenile();
  };
  const hucreSifirla = async (shape: MasaSekli, tier: number) => {
    if (!restaurantId) return;
    setErr(null);
    const { error } = await supabase.from("masa_olculeri").delete()
      .eq("restaurant_id", restaurantId).eq("shape", shape).eq("seat_tier", tier);
    if (error) { setErr(error.message); return; }
    setDuzenlenenHucre(null);
    await yenile();
  };

  // --- Salonlar ---
  const addArea = async () => {
    if (!restaurantId || !newAreaName.trim()) return;
    setErr(null);
    const { error } = await supabase.from("dining_areas").insert({
      restaurant_id: restaurantId, name: toUpperTr(newAreaName), sort_order: areas.length,
    });
    if (error) { setErr(error.message); return; }
    setNewAreaName("");
    await yenile();
  };
  const renameArea = async (id: string, name: string) => {
    if (!name.trim()) return;
    setErr(null);
    const { error } = await supabase.from("dining_areas").update({ name: toUpperTr(name) }).eq("id", id);
    if (error) { setErr(error.message); return; }
    await yenile();
  };
  const deleteArea = async (a: Area) => {
    const icindeki = tables.filter((t) => t.area_id === a.id).length;
    if (icindeki > 0) {
      const ok = await confirm(`"${a.name}" içinde ${icindeki} masa var. Salon silinince masalar "Diğer" grubuna düşer. Silinsin mi?`, { confirmLabel: "Sil" });
      if (!ok) return;
    }
    setErr(null);
    const { error } = await supabase.from("dining_areas").update({ deleted_at: new Date().toISOString() }).eq("id", a.id);
    if (error) { setErr(error.message); return; }
    await yenile();
  };

  // --- Masalar ---
  const addTable = async (areaId: string | null) => {
    if (!restaurantId || !newTableName.trim()) return;
    const koltuk = parseInt(newTableSeats, 10);
    if (!Number.isFinite(koltuk) || koltuk < 1 || koltuk > 50) { setErr("Koltuk sayısı 1 ile 50 arasında olmalı."); return; }
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").insert({
      restaurant_id: restaurantId, name: toTitleTr(newTableName), area_id: areaId,
      seat_count: koltuk, status: "empty", sort_order: tables.filter((t) => t.area_id === areaId).length,
    });
    if (error) { setErr(error.message); return; }
    setNewTableName(""); setNewTableSeats("4"); setAddingTableFor(null);
    await yenile();
  };
  const renameTable = async (id: string, name: string) => {
    if (!name.trim()) return;
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").update({ name: toTitleTr(name) }).eq("id", id);
    if (error) { setErr(error.message); return; }
    await yenile();
  };
  const setSeats = async (id: string, raw: string) => {
    const n = parseInt(raw.replace(/\D/g, ""), 10);
    if (!Number.isFinite(n) || n < 1 || n > 50) { setErr("Koltuk sayısı 1 ile 50 arasında olmalı."); return; }
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").update({ seat_count: n }).eq("id", id);
    if (error) { setErr(error.message); return; }
    await yenile();
  };
  const deleteTable = async (t: Table) => {
    const ok = await confirm(`"${t.name}" silinsin mi?`, { confirmLabel: "Sil" });
    if (!ok) return;
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").update({ deleted_at: new Date().toISOString() }).eq("id", t.id);
    if (error) { setErr(error.message); return; }
    await yenile();
  };
  const moveTableToArea = async (tableId: string, areaId: string | null) => {
    setErr(null);
    const { error } = await supabase.from("restaurant_tables").update({ area_id: areaId }).eq("id", tableId);
    if (error) { setErr(error.message); return; }
    await yenile();
  };

  // --- Tek Kaydet (PAGE_STANDARDS #2): sağ paneldeki her şey birlikte kaydedilir ---
  const kaydet = async () => {
    if (!restaurantId) return;
    setBusy(true); setErr(null); setKaydedildi(false);
    const sure = Math.max(15, Math.min(600, parseInt(oturmaSuresi.replace(/\D/g, ""), 10) || 90));

    const { error: rErr } = await supabase.from("restaurants").update({
      name: isim.trim() ? toTitleTr(isim) : "İşletme",
      phone: telefon.trim() || null,
      address: adres.trim() ? toTitleTr(adres) : null,
    }).eq("id", restaurantId);
    if (rErr) { setBusy(false); setErr(rErr.message); return; }

    const { error: sErr } = await supabase.from("restaurant_settings").upsert({
      restaurant_id: restaurantId,
      opening_hours: hours,
      default_duration_minutes: sure,
      kvkk_notice: kvkkNotice.trim() || null,
      auto_seating: otoYerlesme,
      saate_gore_masa: saateGore,
      masa_arasi_pay: Math.max(0, parseInt(masaArasiPay, 10) || 0),
      varsayilan_rezervasyon_saati: /^\d{2}:\d{2}$/.test(varsayilanSaat) ? varsayilanSaat : "19:00",
      musteri_sadakat_ziyaret_esigi: Math.max(1, parseInt(esikMudavim, 10) || 5),
      musteri_no_show_risk_yuzde: Math.max(0, Math.min(100, parseInt(esikNoShow, 10) || 30)),
    }, { onConflict: "restaurant_id" });
    setBusy(false);
    if (sErr) { setErr(sErr.message); return; }
    setOturmaSuresi(String(sure));
    setKaydedildi(true);
    setTimeout(() => setKaydedildi(false), 3000);
  };

  const setDay = (k: DayKey, patch: Partial<DayHours>) => setHours((h) => ({ ...h, [k]: { ...h[k], ...patch } }));

  const toggleGrup = (id: string) => setKapali((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  // Salonlar + sonda "Diğer" (salonu olmayan masalar). Diğer sadece içinde masa varsa görünür.
  const digerMasalar = tables.filter((t) => !t.area_id || !areas.some((a) => a.id === t.area_id));
  const gruplar: { id: string; name: string; gercek: boolean; masalar: Table[] }[] = [
    ...areas.map((a) => ({ id: a.id, name: a.name, gercek: true, masalar: tables.filter((t) => t.area_id === a.id) })),
    ...(digerMasalar.length > 0 ? [{ id: DIGER, name: "DİĞER", gercek: false, masalar: digerMasalar }] : []),
  ];

  const toplamKoltuk = tables.reduce((s, t) => s + t.seat_count, 0);

  if (!restaurantId) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--canvas)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ maxWidth: 380, textAlign: "center", fontSize: 13.5, color: err ? "var(--danger)" : "var(--muted)", lineHeight: 1.6 }}>
          {err ?? "Yükleniyor…"}
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "var(--canvas)", padding: "20px 24px", paddingBottom: isMobile ? ALT_NAV_YUKSEKLIK + 16 : 24, height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      {confirmDialog}

      <RezervasyonUstBar restaurantId={restaurantId} sayfaBaslik="Ayarlar" />

      <div style={{ marginBottom: 14, flexShrink: 0, display: "flex", alignItems: "center", gap: 12 }}>
        <Link href="/rezervasyon" aria-label="Rezervasyon listesine dön" style={{ ...navBtn, textDecoration: "none" }}><ArrowLeft size={18} /></Link>
      </div>

      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10, flexShrink: 0 }}>{err}</div>}

      <div style={{ display: "flex", gap: 20, flex: 1, minHeight: 0 }}>

        {/* SOL — MASALAR */}
        <div style={{ flex: 1.15, minWidth: 380, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexShrink: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-green)" }}>Masalar</div>
            <div style={{ fontSize: 12, color: inkSoft }}>
              <span className="tnum">{tables.length}</span> masa · toplam <span className="tnum">{toplamKoltuk}</span> kişilik
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexShrink: 0 }}>
            <input
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addArea()}
              placeholder="Yeni salon adı (Bahçe, Teras…)"
              style={{ ...inp, flex: 1 }}
            />
            <button onClick={addArea} disabled={!newAreaName.trim()} style={{ ...btnPrimary, opacity: !newAreaName.trim() ? 0.5 : 1 }}><Plus size={14} /> Salon ekle</button>
          </div>

          <ListHeader>
            <HeaderCell width={200} marginLeft={10}>Masa</HeaderCell>
            <HeaderSep />
            <HeaderCell width={70} align="center">Koltuk</HeaderCell>
            <HeaderSep />
            <HeaderCell width={150} align="center">Salon</HeaderCell>
            <Spacer />
            <HeaderCell width={40} align="center">Sil</HeaderCell>
          </ListHeader>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {gruplar.length === 0 && (
              <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0", lineHeight: 1.6 }}>
                Henüz salon yok. Önce bir salon ekle (Bahçe, Teras, İç salon…), sonra içine masaları gir.
              </div>
            )}

            {gruplar.map((g) => {
              const acik = !kapali.has(g.id);
              const grupKoltuk = g.masalar.reduce((s, t) => s + t.seat_count, 0);
              return (
                <div key={g.id} style={{ marginBottom: 6 }}>
                  {/* Salon başlığı — tıklayınca açılır/kapanır, adı çift tıklayınca düzenlenir. */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--recede)", borderRadius: 10 }}>
                    <button onClick={() => toggleGrup(g.id)} aria-label={acik ? "Kapat" : "Aç"} style={{ ...navBtn, padding: 2 }}>
                      {acik ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    {g.gercek ? (
                      <EditableText
                        value={g.name}
                        onSave={(next) => renameArea(g.id, next)}
                        style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.4, color: "var(--ink)" }}
                      />
                    ) : (
                      <span title="Salonu olmayan masalar" style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.4, color: inkSoft }}>{g.name}</span>
                    )}
                    <span style={{ fontSize: 11.5, color: inkSoft }}>
                      · <span className="tnum">{g.masalar.length}</span> masa, <span className="tnum">{grupKoltuk}</span> kişilik
                    </span>
                    <Spacer />
                    {g.gercek && (
                      <>
                        <button onClick={() => { setAddingTableFor(g.id); setNewTableName(""); setNewTableSeats("4"); }} style={btnGhostRow}>Masa ekle</button>
                        <button onClick={() => deleteArea(areas.find((a) => a.id === g.id)!)} aria-label="Salonu sil" style={{ ...navBtn, padding: 4, color: "var(--danger)" }}><Trash2 size={15} /></button>
                      </>
                    )}
                  </div>

                  {acik && addingTableFor === g.id && (
                    <div style={{ display: "flex", gap: 8, padding: "8px 10px 4px" }}>
                      <input
                        autoFocus value={newTableName}
                        onChange={(e) => setNewTableName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && addTable(g.gercek ? g.id : null)}
                        placeholder="Masa adı (1, 2, Köşe…)" style={{ ...inp, flex: 1 }}
                      />
                      <input
                        value={newTableSeats}
                        onChange={(e) => setNewTableSeats(e.target.value.replace(/\D/g, ""))}
                        onKeyDown={(e) => e.key === "Enter" && addTable(g.gercek ? g.id : null)}
                        placeholder="Koltuk" inputMode="numeric" className="tnum" style={{ ...inp, width: 70, textAlign: "right" }}
                      />
                      <button onClick={() => addTable(g.gercek ? g.id : null)} disabled={!newTableName.trim()} style={{ ...btnPrimary, opacity: !newTableName.trim() ? 0.5 : 1 }}>Ekle</button>
                      <button onClick={() => setAddingTableFor(null)} style={btnGhost}>Vazgeç</button>
                    </div>
                  )}

                  {acik && g.masalar.length === 0 && addingTableFor !== g.id && (
                    <div style={{ fontSize: 12, color: "var(--muted-2)", padding: "8px 10px" }}>Bu salonda masa yok.</div>
                  )}

                  {acik && g.masalar.map((t) => (
                    <ListRow key={t.id}>
                      <Cell width={200} marginLeft={10}>
                        <EditableText
                          value={t.name}
                          onSave={(next) => renameTable(t.id, next)}
                          style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        />
                      </Cell>
                      <RowSep />
                      <Cell width={70} align="center">
                        <EditableText
                          value={String(t.seat_count)}
                          onSave={(next) => setSeats(t.id, next)}
                          style={{ fontSize: 12.5, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}
                        />
                      </Cell>
                      <RowSep />
                      <Cell width={150} align="center">
                        {/* Masayı başka salona taşımak — ayrı bir ekran açmadan, olduğu yerde. */}
                        <select
                          value={t.area_id ?? ""}
                          onChange={(e) => moveTableToArea(t.id, e.target.value || null)}
                          style={{ ...inp, width: "100%", padding: "4px 6px", fontSize: 12 }}
                        >
                          <option value="">Diğer</option>
                          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </Cell>
                      <Spacer />
                      <ActionsCell width={40} align="center">
                        <button onClick={() => deleteTable(t)} aria-label="Masayı sil" style={{ ...navBtn, padding: 4, color: "var(--danger)" }}><Trash2 size={15} /></button>
                      </ActionsCell>
                    </ListRow>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* SAĞ — İŞLETME VE ÇALIŞMA AYARLARI (tek Kaydet) */}
        <div style={{ flex: 1, minWidth: 340, maxWidth: 480, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-green)", marginBottom: 12, flexShrink: 0 }}>İşletme</div>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            <label style={lbl}>İşletme adı</label>
            <input value={isim} onChange={(e) => setIsim(e.target.value)} style={{ ...inp, width: "100%", marginBottom: 10 }} />

            <label style={lbl}>Telefon</label>
            <input value={telefon} onChange={(e) => setTelefon(e.target.value)} inputMode="tel" style={{ ...inp, width: "100%", marginBottom: 10 }} />

            <label style={lbl}>Adres</label>
            <input value={adres} onChange={(e) => setAdres(e.target.value)} style={{ ...inp, width: "100%", marginBottom: 16 }} />
            <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: -10, marginBottom: 16, lineHeight: 1.6 }}>
              Bu bilgiler misafirin kendi rezervasyonunu yaptığı sayfada görünür.
            </div>

            {/* Şubeler — sadece çok şubeli hesapta. Marka bilgisi (işletme türü, yetkili)
                kayıtta zaten girildi, tekrar sorulmuyor; şube eklerken sadece değişen alanlar
                (ad, telefon, il, ilçe, adres, çalışma saatleri) istenir. */}
            {cokSubeli && (
              <>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)", marginBottom: 8 }}>Şubeler</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
                  {subeler.map((s) => (
                    <button
                      key={s.id} onClick={() => s.id !== restaurantId && subeDegistir(s.id)}
                      style={{
                        all: "unset", cursor: s.id === restaurantId ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6,
                        padding: "7px 10px", borderRadius: 8,
                        background: s.id === restaurantId ? "var(--recede)" : "transparent",
                        fontSize: 13, color: s.id === restaurantId ? "var(--brand-strong)" : "var(--ink)",
                      }}
                    >
                      <Store size={13} style={{ flexShrink: 0 }} />
                      {s.name}
                      {(s.il || s.ilce) && <span style={{ color: "var(--muted-2)", fontSize: 11 }}>· {[s.il, s.ilce].filter(Boolean).join(" / ")}</span>}
                      {s.id === restaurantId && <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 700 }}>ŞU AN</span>}
                    </button>
                  ))}
                </div>

                {!subeEkleAcik ? (
                  <button onClick={() => setSubeEkleAcik(true)} style={{ ...btnGhostRow, marginBottom: 16 }}><Plus size={12} style={{ marginRight: 4 }} />Şube ekle</button>
                ) : (
                  <div style={{ border: "1px solid var(--line-2)", borderRadius: 12, padding: 14, marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                    {subeErr && <div style={{ fontSize: 12, color: "var(--danger)" }}>{subeErr}</div>}
                    <input value={bAdi} onChange={(e) => setBAdi(e.target.value)} onBlur={(e) => setBAdi(toTitleTr(e.target.value))} placeholder="Şube adı" style={inp} />
                    <input value={bTelefon} onChange={(e) => setBTelefon(e.target.value)} inputMode="tel" placeholder="Şube telefon numarası (opsiyonel)" style={inp} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <div style={{ flex: 1, position: "relative" }}>
                        <input
                          value={bIl} onChange={(e) => { setBIl(e.target.value); setBIlOnerileriAcik(true); }}
                          onFocus={() => setBIlOnerileriAcik(true)}
                          onBlur={(e) => { setBIl(toTitleTr(e.target.value)); setBIlOnerileriAcik(false); }}
                          placeholder="İl" style={inp}
                        />
                        {bIlOnerileriAcik && eslesenIller(bIl).length > 0 && (
                          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--card)", overflow: "hidden", zIndex: 5, boxShadow: "0 4px 14px rgba(0,0,0,0.08)" }}>
                            {eslesenIller(bIl).map((o) => (
                              <button key={o} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setBIl(o); setBIlOnerileriAcik(false); }} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", padding: "8px 12px", boxSizing: "border-box", fontSize: 13, color: "var(--ink)" }}>{o}</button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1, position: "relative" }}>
                        <input
                          value={bIlce} onChange={(e) => { setBIlce(e.target.value); setBIlceOnerileriAcik(true); }}
                          onFocus={() => setBIlceOnerileriAcik(true)}
                          onBlur={(e) => { setBIlce(toTitleTr(e.target.value)); setBIlceOnerileriAcik(false); }}
                          placeholder="İlçe" style={inp}
                        />
                        {bIlceOnerileriAcik && eslesenIlceler(bIl, bIlce).length > 0 && (
                          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--card)", overflow: "hidden", zIndex: 5, boxShadow: "0 4px 14px rgba(0,0,0,0.08)" }}>
                            {eslesenIlceler(bIl, bIlce).map((o) => (
                              <button key={o} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setBIlce(o); setBIlceOnerileriAcik(false); }} style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", padding: "8px 12px", boxSizing: "border-box", fontSize: 13, color: "var(--ink)" }}>{o}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <input value={bAdres} onChange={(e) => setBAdres(e.target.value)} onBlur={(e) => setBAdres(toTitleTr(e.target.value))} placeholder="Açık adres" style={inp} />
                    <div style={{ display: "flex", gap: 5 }}>
                      {DAYS.map((d) => {
                        const acik = bAcikGunler.has(d.k);
                        return (
                          <button key={d.k} onClick={() => bGunToggle(d.k)} style={{
                            flex: 1, border: "1px solid var(--line-2)", borderRadius: 8, padding: "6px 0", fontSize: 11.5, cursor: "pointer",
                            background: acik ? "var(--brand-strong)" : "var(--card)", color: acik ? "#fff" : "var(--muted)",
                          }}>
                            {d.l.slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="time" value={bAcilis} onChange={(e) => setBAcilis(e.target.value)} style={{ ...inp, flex: 1 }} />
                      <span style={{ fontSize: 13, color: "var(--muted)" }}>–</span>
                      <input type="time" value={bKapanis} onChange={(e) => setBKapanis(e.target.value)} style={{ ...inp, flex: 1 }} />
                    </div>
                    {kapanisErtesiGun(bAcilis, bKapanis) && (
                      <div style={{ fontSize: 11, color: "var(--gold-text)" }}>Kapanış ertesi güne sarkıyor.</div>
                    )}
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button onClick={() => { setSubeEkleAcik(false); setSubeErr(null); }} style={btnSecondary}>Vazgeç</button>
                      <button onClick={subeEkle} disabled={subeBusy} style={{ ...btnPrimary, opacity: subeBusy ? 0.6 : 1 }}>{subeBusy ? "…" : "Şubeyi ekle"}</button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Masa ölçüleri (Gökhan: "masa ölçülerini de girsinler ayarlardan, hangi
                masaları varsa onları seçip ölçü girsin") — hücreye tıkla, düzenle, kaydet.
                Değiştirmezsen standart ölçü (VARSAYILAN_OLCU) kullanılmaya devam eder. */}
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)", marginBottom: 4 }}>Masa ölçüleri</div>
            <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginBottom: 8, lineHeight: 1.5 }}>
              Salon ekranındaki masaların gerçek santim (en×boy) ölçüsü. Değiştirmezsen standart ölçüler kullanılır.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "62px repeat(4, 1fr)", gap: 4, marginBottom: 10, fontSize: 11 }}>
              <div />
              {MASA_KOLTUK_TIERLERI.map((tier) => (
                <div key={tier} className="tnum" style={{ textAlign: "center", color: inkSoft, fontWeight: 600 }}>{tier} kişi</div>
              ))}
              {MASA_SEKILLERI.map((s) => (
                <Fragment key={s.shape}>
                  <div style={{ color: inkSoft, fontWeight: 600, display: "flex", alignItems: "center" }}>{s.label}</div>
                  {MASA_KOLTUK_TIERLERI.map((tier) => {
                    const ozel = masaOlcusuBul(s.shape, tier);
                    const v = ozel ?? { width_cm: VARSAYILAN_OLCU[s.shape][tier].w, height_cm: VARSAYILAN_OLCU[s.shape][tier].h };
                    const secili = duzenlenenHucre?.shape === s.shape && duzenlenenHucre?.tier === tier;
                    return (
                      <button
                        key={tier}
                        onClick={() => hucreDuzenlemeyeBasla(s.shape, tier)}
                        className="tnum"
                        title={ozel ? "Özel ölçü girildi" : "Standart ölçü kullanılıyor"}
                        style={{
                          all: "unset", cursor: "pointer", textAlign: "center", padding: "6px 2px", borderRadius: 6, boxSizing: "border-box",
                          background: secili ? "var(--recede)" : ozel ? "var(--info-bg)" : "transparent",
                          border: secili ? "1px solid var(--brand-strong)" : "1px solid var(--line-2)",
                          color: ozel ? "var(--brand-strong)" : "var(--ink)", fontWeight: ozel ? 700 : 400,
                        }}
                      >
                        {v.width_cm}×{v.height_cm}
                      </button>
                    );
                  })}
                </Fragment>
              ))}
            </div>
            {duzenlenenHucre && (
              <div style={{ border: "1px solid var(--line-2)", borderRadius: 12, padding: 12, marginBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {MASA_SEKILLERI.find((s) => s.shape === duzenlenenHucre.shape)?.label} · <span className="tnum">{duzenlenenHucre.tier}</span> kişilik — santim
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    value={taslakGenislik} onChange={(e) => setTaslakGenislik(e.target.value.replace(/[^0-9.,]/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && hucreKaydet()}
                    placeholder="En" inputMode="decimal" className="tnum" autoFocus style={{ ...inp, width: 70 }}
                  />
                  <span style={{ color: "var(--muted-2)" }}>×</span>
                  <input
                    value={taslakBoy} onChange={(e) => setTaslakBoy(e.target.value.replace(/[^0-9.,]/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && hucreKaydet()}
                    placeholder="Boy" inputMode="decimal" className="tnum" style={{ ...inp, width: 70 }}
                  />
                  <span style={{ fontSize: 12, color: "var(--muted-2)" }}>cm</span>
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  {masaOlcusuBul(duzenlenenHucre.shape, duzenlenenHucre.tier) && (
                    <button onClick={() => hucreSifirla(duzenlenenHucre.shape, duzenlenenHucre.tier)} style={{ ...btnSecondary, color: "var(--danger)" }}>Standarda dön</button>
                  )}
                  <button onClick={() => setDuzenlenenHucre(null)} style={btnSecondary}>Vazgeç</button>
                  <button onClick={hucreKaydet} style={btnPrimary}>Kaydet</button>
                </div>
              </div>
            )}

            {/* Çalışma saatleri — misafir sayfası bu saatlerin dışına rezervasyon aldırmayacak. */}
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)", marginBottom: 8 }}>Çalışma saatleri</div>
            {DAYS.map((d) => {
              const v = hours[d.k];
              return (
                <div key={d.k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 82, fontSize: 13, color: v.kapali ? inkSoft : "var(--ink)" }}>{d.l}</span>
                  <input
                    type="time" value={v.acilis} disabled={v.kapali}
                    onChange={(e) => setDay(d.k, { acilis: e.target.value })}
                    style={{ ...inp, width: 92, opacity: v.kapali ? 0.45 : 1 }}
                  />
                  <span style={{ fontSize: 12, color: inkSoft }}>–</span>
                  <input
                    type="time" value={v.kapanis} disabled={v.kapali}
                    onChange={(e) => setDay(d.k, { kapanis: e.target.value })}
                    style={{ ...inp, width: 92, opacity: v.kapali ? 0.45 : 1 }}
                  />
                  {!v.kapali && kapanisErtesiGun(v.acilis, v.kapanis) && (
                    <span title="Kapanış ertesi güne sarkıyor" style={{ fontSize: 10.5, fontWeight: 700, color: "var(--gold-text)", border: "1px solid var(--gold)", borderRadius: 4, padding: "1px 4px", flexShrink: 0 }}>ERTESİ GÜN</span>
                  )}
                  <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: inkSoft, cursor: "pointer", marginLeft: "auto" }}>
                    <input type="checkbox" checked={v.kapali} onChange={(e) => setDay(d.k, { kapali: e.target.checked })} /> Kapalı
                  </label>
                </div>
              );
            })}

            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)", marginTop: 18, marginBottom: 8 }}>Rezervasyon</div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13.5 }}>Varsayılan oturma süresi:</span>
              <input
                value={oturmaSuresi}
                onChange={(e) => setOturmaSuresi(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric" className="tnum" style={{ ...inp, width: 62, textAlign: "right" }}
              />
              <span style={{ fontSize: 13.5 }}>dakika</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginBottom: 12, lineHeight: 1.6 }}>
              Bir masanın ortalama ne kadar dolu kaldığı. Aynı masaya ikinci rezervasyon
              alınabilir mi hesabı buna dayanacak.
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13.5 }}>Varsayılan rezervasyon saati:</span>
              <input
                type="time"
                value={varsayilanSaat}
                onChange={(e) => setVarsayilanSaat(e.target.value)}
                className="tnum" style={{ ...inp, width: 110 }}
              />
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginBottom: 16, lineHeight: 1.6 }}>
              Yeni rezervasyon penceresi bu saatle açılır. Bugün için bu saat geçmişse pencere
              bir sonraki tam saatle açılır.
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={saateGore} onChange={(e) => setSaateGore(e.target.checked)} />
              <span style={{ fontSize: 13.5 }}>Saate göre masa hesabı</span>
            </label>
            <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginBottom: 10, lineHeight: 1.6 }}>
              Kapalıyken günün tamamı tek havuz sayılır: o günkü bütün rezervasyonlar aynı masa
              havuzunu paylaşır. Açıkken masa sadece oturma süresi boyunca dolu sayılır —
              {"19:00'a verilen masa süresi dolunca 21:00'e gelene açık olur."}
            </div>
            {saateGore && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13.5 }}>Masa arası pay:</span>
                <input
                  value={masaArasiPay}
                  onChange={(e) => setMasaArasiPay(e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric" className="tnum" style={{ ...inp, width: 62, textAlign: "right" }}
                />
                <span style={{ fontSize: 13.5 }}>dakika</span>
              </div>
            )}
            {saateGore && (
              <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginBottom: 16, lineHeight: 1.6 }}>
                Masa boşaldıktan sonra yeni misafir alınana kadar bırakılacak süre — temizlik ve
                hazırlık payı. 0 yazılırsa masa boşalır boşalmaz yeni rezervasyona açılır.
              </div>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={otoYerlesme} onChange={(e) => setOtoYerlesme(e.target.checked)} />
              <span style={{ fontSize: 13.5 }}>Otomatik yerleşme</span>
            </label>
            <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginBottom: 16, lineHeight: 1.6 }}>
              Bir rezervasyonun kişi sayısı büyüyüp masası yetmez hale gelince program beklemeden
              masayı tamamlar: önce o masanın kendi sırasındaki yan masayı dener, doluysa oradaki
              rezervasyonu başka uygun masaya taşıyıp yeri açar. Kilitli masalara hiç dokunmaz.
              Kapalıyken program kimsenin masasını kendiliğinden oynatmaz.
            </div>

            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)", marginBottom: 8 }}>Müşteri etiketleri</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13.5 }}>Müdavim sayılması için ziyaret sayısı:</span>
              <input
                value={esikMudavim}
                onChange={(e) => setEsikMudavim(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric" className="tnum" style={{ ...inp, width: 62, textAlign: "right" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13.5 }}>No-show riski sayılması için gelmeme yüzdesi:</span>
              <input
                value={esikNoShow}
                onChange={(e) => setEsikNoShow(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric" className="tnum" style={{ ...inp, width: 62, textAlign: "right" }}
              />
              <span style={{ fontSize: 13.5 }}>%</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginBottom: 16, lineHeight: 1.6 }}>
              Kişi kartındaki etiketler bu eşiklere göre kendiliğinden hesaplanır — kayıt tutmaya
              gerek yok. VIP ayrı: işletmenin kendi kararıdır, kartın kendisinden işaretlenir.
            </div>

            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)", marginBottom: 8 }}>KVKK aydınlatma metni</div>
            <textarea
              value={kvkkNotice}
              onChange={(e) => setKvkkNotice(e.target.value)}
              rows={5}
              placeholder="Misafirin telefonunu alırken gösterilecek aydınlatma metni…"
              style={{ ...inp, width: "100%", resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }}
            />
            <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 6, marginBottom: 8, lineHeight: 1.6 }}>
              Boş bırakılırsa misafir sayfasında ve rezervasyon formunda uyarı çıkar.
            </div>
          </div>

          {/* Tek Kaydet — sağ paneldeki her şey birlikte kaydedilir (PAGE_STANDARDS #2). */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 12, flexShrink: 0 }}>
            <button onClick={kaydet} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
            {kaydedildi && <span style={{ fontSize: 12.5, color: "var(--brand)" }}>Kaydedildi.</span>}
            <Spacer />
            <span style={{ fontSize: 11.5, color: "var(--muted-2)" }}>Masalar anında kaydedilir, butona gerek yok.</span>
          </div>
        </div>
      </div>
      <RezervasyonAltNav />
    </div>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 10px", fontSize: 13, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0, boxSizing: "border-box" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 };
const btnPrimary: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, border: "none", borderRadius: 980, padding: "9px 14px", background: "var(--brand-strong)", color: "#fff", fontSize: 13, fontWeight: 500, flexShrink: 0, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 16px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13, cursor: "pointer" };
const btnGhost: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "7px 12px", background: "var(--card)", color: "var(--ink)", fontSize: 12, flexShrink: 0, cursor: "pointer" };
const btnGhostRow: React.CSSProperties = { ...btnGhost, padding: "4px 12px" };
const inkSoft = "#5c5c58";
const navBtn: React.CSSProperties = { all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: 6, borderRadius: 8, color: "var(--muted)" };
