"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getMyRestaurantId } from "@/lib/supabase/restaurant";
import { getStaffSession } from "@/lib/supabase/staffSession";
import { toTitleTr } from "@/lib/text";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { useConfirm } from "../components/useConfirm";
import DatePicker from "../components/DatePicker";
import EditableText from "../components/EditableText";
import { ListHeader, HeaderCell, HeaderSep, ListRow, RowSep, Cell, Spacer, ActionsCell } from "../components/ListRow";

// Karşılama — ROADMAP §O2, birleşik akış (2026-07-31, Gökhan onayı).
// Eskiden Rezervasyon (ileri tarih, isim/telefon/saat) ve Karşılama (bekleme listesi, "şimdi")
// AYRI ekranlar ve ayrı tablolardı — aynı işi yapıyorlardı, kafa karıştırıyordu. Artık tek
// tablo (reservations), tek ekran: rezervasyon da al, kapıdan doğrudan gireni de al, ikisi de
// aynı listede aynı durum zincirinden geçer: bekleniyor -> geldi -> oturdu (ya da gelmedi/iptal).
//
// "bekleniyor" = misafir henüz gelmedi (ileri tarih/saat rezervasyonu). "geldi" = misafir kapıda,
// masa bekliyor (vale'den ya da doğrudan buradan girilmiş olabilir) — eski iki sistemdeki "bekliyor"
// kelimesinin ters anlamlarını karıştırmamak için bilerek farklı etiketler.
//
// Vale entegrasyonu: vale girişte isim+kişi sayısı girince (add_valet_entry p_party_size ile)
// sistem bugünün "bekleniyor" rezervasyonlarıyla eşleştirmeyi dener; bulamazsa rezervasyonsuz
// yeni bir "geldi" kaydı açar. İkisi de burada, aynı listede, öne çıkarak belirir.

type Rez = {
  id: string; guest_name: string; guest_phone: string | null; party_size: number;
  reserved_at: string; status: string; note: string | null; table_id: string | null;
  arrived_at: string | null; created_at: string; cancel_reason: string | null; source: string;
};
type TableRow = { id: string; name: string; seat_count: number; status: string };

const gunIstanbul = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(iso));
const bugunIstanbul = () => gunIstanbul(new Date().toISOString());
const gunKaydir = (gun: string, delta: number) => {
  const d = new Date(`${gun}T12:00:00+03:00`);
  d.setDate(d.getDate() + delta);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);
};
const gunSiniri = (gun: string) => {
  const start = `${gun}T00:00:00+03:00`;
  const d = new Date(`${gun}T12:00:00+03:00`);
  d.setDate(d.getDate() + 1);
  const end = `${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d)}T00:00:00+03:00`;
  return { start, end };
};
const saatFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Istanbul" });
const saat = (iso: string) => saatFmt.format(new Date(iso));
const bekleyenSure = (from: string, now: number) => {
  const dk = Math.max(0, Math.round((now - Date.parse(from)) / 60000));
  return dk < 60 ? `${dk} dk` : `${Math.floor(dk / 60)}s ${dk % 60}dk`;
};
// Kapasite/Yedek hesabı gün tek havuz değil, öğle/akşam diye iki ayrı dönem sayar (Gökhan:
// "akşam 17 sonrası bir dönem, öncesi bir dönem" — sınır Ayarlar'dan değiştirilebilir).
const saatIstanbul = (iso: string) => parseInt(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Istanbul" }).format(new Date(iso)), 10);
const donem = (iso: string, aksamBaslangic: number): "ogle" | "aksam" => (saatIstanbul(iso) >= aksamBaslangic ? "aksam" : "ogle");

// bg — satır kartının arka planı (Gökhan: "her duruma bir renk verelim"). İlk halde
// mavi/kırmızı/yeşil karışımıydı — "renk skalamızla alakası yok" dendi, açık kahve
// tonlarının (--tan-100..400) dereceli ailesine çevrildi; hepsi aynı konseptin içinde.
// geldi, bekleniyor ile AYNI tonu kullanıyor — rezervasyon dışı (kapıdan doğrudan) gelen
// misafirler de bu durumda düşüyor, Gökhan bunların "normal liste ile aynı" görünmesini
// istedi (öne çıkan renk yerine düz durmalı) — zaten "X dk önce geldi" notu ve
// Oturdu/İptal butonları o satırı yeterince ayırt ediyor, renge gerek yok.
const DURUM_INFO: Record<string, { label: string; color: string; bg: string }> = {
  bekleniyor: { label: "Bekleniyor", color: "var(--ink)", bg: "var(--tan-100)" },
  geldi: { label: "Geldi", color: "var(--danger)", bg: "var(--tan-100)" },
  oturdu: { label: "Oturdu", color: "var(--brand)", bg: "var(--tan-300)" },
  gelmedi: { label: "Gelmedi", color: "var(--gold-text)", bg: "var(--tan-400)" },
  // İptal artık arşive gizlenmiyor, ana listede en altta duruyor (Gökhan: "iptalleri de
  // renklendirip aşağıda sıralayalım... olağan sıralamada iptaller en altta, gelmediler onun
  // üstünde") — kahve skalasının en koyu tonu, en "bitmiş" durum.
  iptal: { label: "İptal", color: "var(--ink)", bg: "var(--tan-500)" },
};
// Bu rezervasyon gerçek bir rezervasyon mu, yoksa kapıdan doğrudan mı girildi — istatistik
// için önemli, kayıt oluşurken bir kere yazılıyor (bkz. check_in_arrival RPC). Sadece
// sonuçlanmış (aktif olmayan) satırlarda gösteriliyor — bekleniyor/geldi'de zaten üç-dört
// buton var, dördüncü bir etiket sığmaz.
const SOURCE_INFO: Record<string, { label: string; color: string }> = {
  rezervasyon: { label: "RVZ", color: "var(--brand)" },
  kapi: { label: "Kapı", color: "var(--gold-text)" },
};

// Yeni "geldi" olan kaydı fark edince kısa bir bip — mutfak/garson bildirimiyle (Faz 10) aynı
// kalıp: Web Audio API, ilk dokunuşta izin alınır, dosya yok.
let sharedAudioCtx: AudioContext | null = null;
function getAudioCtxCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
}
function unlockAudio() {
  const Ctx = getAudioCtxCtor();
  if (!Ctx) return;
  if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
  if (sharedAudioCtx.state === "suspended") sharedAudioCtx.resume().catch(() => {});
}
function playArrivalBeep() {
  try {
    const ctx = sharedAudioCtx;
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch { /* Web Audio desteklenmiyor olabilir — sessizce geç */ }
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([150, 80, 150]);
}

export default function KarsilamaPage() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [gun, setGun] = useState("");
  const [rows, setRows] = useState<Rez[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [now, setNow] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kvkkNotice, setKvkkNotice] = useState("");
  const [kvkkAcik, setKvkkAcik] = useState(false);
  const [aksamBaslangic, setAksamBaslangic] = useState(17);
  // Kapasite tam bu kayıtla dolduğunda gösterilen, kendiliğinden kapanan bilgi notu (Gökhan:
  // "kapasite bu rezervasyonla doluyor, alacağınız rezervasyonlar yedek olarak kaydedilecektir
  // demeli"). Yedek olan tek bir kayıt içinse onay penceresi (confirm) kullanılıyor.
  const [capacityNotice, setCapacityNotice] = useState<string | null>(null);
  const bildirCapacityNotice = (msg: string) => {
    setCapacityNotice(msg);
    setTimeout(() => setCapacityNotice(null), 7000);
  };
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Yeni rezervasyon formu — buton tıklanınca açılan katman (Gökhan: satır her zaman açık
  // durmasın, "Yeni rezervasyon" butonu üstte olsun, Ekle ile kayıt gerçekleşsin).
  const [newResOpen, setNewResOpen] = useState(false);
  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fParty, setFParty] = useState("2");
  const [fDate, setFDate] = useState("");
  const [fTime, setFTime] = useState("");
  const [fNote, setFNote] = useState("");

  // Kayıtsız doğrudan gir (rezervasyonsuz, kapıdan) — küçük bir pencere, ayrı panel değil.
  // Rezervasyon formuyla aynı bilgileri toplar (telefon, not) — sadece tarih/saat yok, "şimdi"
  // (Gökhan: "rezervasyon dışı kayıt ekranı da rezervasyonda alınan bilgileri almalı").
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [wName, setWName] = useState("");
  const [wPhone, setWPhone] = useState("");
  const [wParty, setWParty] = useState("2");
  const [wNote, setWNote] = useState("");

  // Masa ata (satır bazlı, inline seçim — Vale ekranındaki "Masaya bağla" ile aynı desen)
  const [assigningId, setAssigningId] = useState<string | null>(null);
  // Oturt katmanı (masa seçimi — sadece boş masalar)
  const [seatingFor, setSeatingFor] = useState<Rez | null>(null);
  // İptal artık ayrı bir arşive gizlenmiyor — ana listede en altta, kendi renginde duruyor.
  // İptal — sebep sormadan direkt onaya gitmiyor (Gökhan: "iptal edilenlere iptal sebebi
  // girilsin"). Sebep boş bırakılabilir, zorunlu değil.
  const [iptalFor, setIptalFor] = useState<Rez | null>(null);
  const [iptalReason, setIptalReason] = useState("");
  // Sağ üst filtre — iptal artık ana listede gizli olmadığı için, günü kalabalıklaştırmadan
  // belirli bir gruba (rezervasyonlar/kapı/gelmedi/iptal) bakabilmek için (Gökhan: "sağ üstte
  // filtre koyalım, ordan seçilsin rezervasyonlar iptaller rezervasyonsuz gelenler gelmediler").
  const [filtre, setFiltre] = useState("tumu");

  const notifiedGeldi = useRef<Set<string>>(new Set());

  const load = useCallback(async (targetGun: string) => {
    const restId = await getMyRestaurantId();
    if (!restId) return;
    setRestaurantId(restId);
    const { start, end } = gunSiniri(targetGun);
    const [{ data: r, error }, { data: t }, { data: s }] = await Promise.all([
      supabase.from("reservations").select("id, guest_name, guest_phone, party_size, reserved_at, status, note, table_id, arrived_at, created_at, cancel_reason, source")
        .eq("restaurant_id", restId).is("deleted_at", null)
        .gte("reserved_at", start).lt("reserved_at", end)
        .order("created_at"),
      supabase.from("restaurant_tables").select("id, name, seat_count, status").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("restaurant_settings").select("kvkk_notice, evening_start_hour").eq("restaurant_id", restId).maybeSingle(),
    ]);
    if (error) { setErr(error.message); return; }
    const list = (r as Rez[]) ?? [];
    setRows(list);
    setTables((t as TableRow[]) ?? []);
    const settingsRow = s as { kvkk_notice: string | null; evening_start_hour: number } | null;
    setKvkkNotice(settingsRow?.kvkk_notice ?? "");
    setAksamBaslangic(settingsRow?.evening_start_hour ?? 17);
    setErr(null);

    if (targetGun === bugunIstanbul()) {
      let yeni = false;
      list.forEach((row) => {
        if (row.status === "geldi") {
          if (!notifiedGeldi.current.has(row.id)) { notifiedGeldi.current.add(row.id); yeni = true; }
        } else {
          notifiedGeldi.current.delete(row.id);
        }
      });
      if (yeni) playArrivalBeep();
    }
  }, []);

  useEffect(() => { const g = bugunIstanbul(); setGun(g); }, []);
  useEffect(() => {
    if (!gun) return;
    load(gun);
    const id = setInterval(() => load(gun), 6000);
    return () => clearInterval(id);
  }, [gun, load]);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  useEffect(() => {
    const onFirstTouch = () => { unlockAudio(); document.removeEventListener("pointerdown", onFirstTouch); };
    document.addEventListener("pointerdown", onFirstTouch);
    return () => document.removeEventListener("pointerdown", onFirstTouch);
  }, []);

  const gunDegistir = (g: string) => setGun(g);

  // DatePicker eskiden sadece görünüşte "gün"ü gösterip fDate'i boş bırakıyordu — kutu dolu
  // GÖRÜNÜYOR ama gerçek değeri boştu, Ekle'ye basınca sessizce reddediliyordu. Artık pencere
  // açılırken fDate gerçekten görünen güne eşitleniyor.
  const openNewRes = () => {
    setFName(""); setFPhone(""); setFParty("2"); setFDate(gun); setFTime("19:00"); setFNote("");
    setErr(null);
    setNewResOpen(true);
  };

  const submit = async () => {
    if (!restaurantId) return;
    const kisi = parseInt(fParty, 10);
    if (!fName.trim() || !fDate || !fTime || !kisi || kisi <= 0) {
      setErr("Misafir adı, tarih, saat ve kişi sayısı gerekli.");
      return;
    }
    setErr(null);

    // Kapasite kontrolü — sadece şu an görüntülenen gün için (elimizde başka günün verisi yok).
    // Bu rezervasyon kapasiteyi aşıyorsa Yedek olacağını GİRİŞ ANINDA söyleriz (Gökhan).
    let mevcut = 0;
    if (fDate === gun) {
      mevcut = donemDoluPax(new Date(`${fDate}T${fTime}:00+03:00`).toISOString());
      if (mevcut + kisi > toplamKapasite) {
        const ok = await confirm(`Kapasite dolu (${mevcut}/${toplamKapasite} pax) — bu rezervasyon Yedek olarak kaydedilecek. Devam edilsin mi?`, { danger: false });
        if (!ok) return;
      }
    }

    setBusy(true);
    const { error } = await supabase.from("reservations").insert({
      restaurant_id: restaurantId,
      guest_name: toTitleTr(fName),
      guest_phone: fPhone.trim() || null,
      party_size: kisi,
      reserved_at: new Date(`${fDate}T${fTime}:00+03:00`).toISOString(),
      note: fNote.trim() || null,
      consent_at: fPhone.trim() ? new Date().toISOString() : null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setNewResOpen(false);
    if (fDate === gun && mevcut < toplamKapasite && mevcut + kisi >= toplamKapasite) {
      bildirCapacityNotice(`Kapasite bu rezervasyonla doldu (${toplamKapasite}/${toplamKapasite} pax) — bundan sonraki rezervasyonlar Yedek olarak kaydedilecek.`);
    }
    if (fDate !== gun) gunDegistir(fDate); else await load(gun);
  };

  const dogrudanGir = async () => {
    if (!restaurantId || !wName.trim()) return;
    const kisi = Math.max(1, parseInt(wParty, 10) || 1);
    setErr(null);

    let mevcut = 0;
    if (bugunMu) {
      mevcut = donemDoluPax(new Date().toISOString());
      if (mevcut + kisi > toplamKapasite) {
        const ok = await confirm(`Kapasite dolu (${mevcut}/${toplamKapasite} pax) — bu misafir Yedek olarak kaydedilecek. Devam edilsin mi?`, { danger: false });
        if (!ok) return;
      }
    }

    setBusy(true);
    const { error } = await supabase.rpc("check_in_arrival", {
      p_restaurant: restaurantId, p_guest_name: toTitleTr(wName), p_party_size: kisi,
      p_guest_phone: wPhone.trim() || null, p_note: wNote.trim() || null,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setWName(""); setWPhone(""); setWParty("2"); setWNote(""); setWalkInOpen(false);
    if (bugunMu && mevcut < toplamKapasite && mevcut + kisi >= toplamKapasite) {
      bildirCapacityNotice(`Kapasite bu misafirle doldu (${toplamKapasite}/${toplamKapasite} pax) — bundan sonraki rezervasyonlar Yedek olarak kaydedilecek.`);
    }
    if (gun !== bugunIstanbul()) gunDegistir(bugunIstanbul()); else await load(gun);
  };

  // Durum değişikliği (Geldi/Gelmedi/İptal) RPC üzerinden — Gelmedi/İptal olunca atanmış
  // masa hâlâ "reserved" ise (henüz oturtulmadıysa) otomatik boşa çıkar (set_reservation_status).
  const durumDegistir = async (r: Rez, next: string, cancelReason?: string) => {
    setErr(null);
    const { error } = await supabase.rpc("set_reservation_status", { p_reservation_id: r.id, p_status: next, p_cancel_reason: cancelReason ?? null });
    if (error) { setErr(error.message); return; }
    await load(gun);
  };

  const iptalEt = (r: Rez) => { setIptalReason(""); setIptalFor(r); };
  const iptalOnayla = async () => {
    if (!iptalFor) return;
    await durumDegistir(iptalFor, "iptal", iptalReason);
    setIptalFor(null);
  };

  // Masa ata — SADECE bugün için anlamlı (Gökhan: "işletme masa planını aynı gün yapar,
  // ileri tarihli rezervasyona masa atamaz"). Atanan masa hemen "rezerve" görünür görünmez
  // (assign_reservation_table RPC'si restaurant_tables.status/reservation_note'u da günceller).
  const masaAta = async (r: Rez, tableId: string) => {
    setErr(null);
    const { error } = await supabase.rpc("assign_reservation_table", { p_reservation_id: r.id, p_table_id: tableId });
    setAssigningId(null);
    if (error) { setErr(error.message); return; }
    await load(gun);
  };

  const oturt = async (tableId: string) => {
    if (!seatingFor) return;
    setBusy(true); setErr(null);
    const staff = getStaffSession();
    const { error } = await supabase.rpc("seat_reservation", { p_reservation_id: seatingFor.id, p_table_id: tableId, p_staff_id: staff?.id ?? null });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setSeatingFor(null);
    await load(gun);
  };

  // Rezervasyona zaten bir masa atanmışsa Geldi/Oturt tek tıkla o masaya oturtur — pratiklik
  // için varsayılan "rezerve edilen masaya oturdu" (Gökhan). Misafir başka masa isterse
  // personel Masa hücresine tıklayıp ataması değiştirir, sonra Geldi/Oturt YENİ masaya oturtur.
  const oturtDirekt = async (r: Rez) => {
    if (!r.table_id) return;
    setBusy(true); setErr(null);
    const staff = getStaffSession();
    const { error } = await supabase.rpc("seat_reservation", { p_reservation_id: r.id, p_table_id: r.table_id, p_staff_id: staff?.id ?? null });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await load(gun);
  };

  // Kayıt sonrası düzenleme — yanlışlık yapılmış olabilir (Gökhan). Çift tıkla düzenleme
  // (PAGE_STANDARDS #5, EditableText) isim/telefon/kişi/not/saat için.
  const updateField = async (r: Rez, patch: Partial<Pick<Rez, "guest_name" | "guest_phone" | "party_size" | "note" | "reserved_at">>) => {
    setErr(null);
    const { error } = await supabase.from("reservations").update(patch).eq("id", r.id);
    if (error) { setErr(error.message); return; }
    await load(gun);
  };

  const bosMasalar = tables.filter((t) => t.status === "empty");
  const tableName = (id: string | null) => tables.find((t) => t.id === id)?.name ?? null;
  const bugunMu = gun === bugunIstanbul();
  // Artık hiçbir şey ayrı bir arşiv penceresine gizlenmiyor — hepsi ana listede, kendi
  // renginde (Gökhan: "iptalleri de renklendirip aşağıda sıralayalım"). Sıralama üç
  // kademeli: normal akış (bekleniyor/geldi/oturdu) üstte kendi created_at sırasında,
  // gelmedi onun altında, iptal en altta (Gökhan: "olağan sıralamada iptaller en altta,
  // gelmedilerde onun üstünde"). Array.sort stable olduğu için her kademe içinde created_at
  // sırası bozulmuyor.
  const siraKademe = (s: string) => (s === "iptal" ? 2 : s === "gelmedi" ? 1 : 0);
  const visibleRows = [...rows].sort((a, b) => siraKademe(a.status) - siraKademe(b.status));
  // Filtre — "Rezervasyonlar"/"Rezervasyonsuz gelenler" sadece hâlâ akıştaki (iptal/gelmedi
  // olmayan) kayıtları gösterir; onlar zaten kendi ayrı seçeneklerinde. Her satır tam olarak
  // bir gruba düşsün diye (Gökhan: "rezervasyonlar iptaller rezervasyonsuz gelenler gelmediler").
  const filtreliRows = visibleRows.filter((r) => {
    if (filtre === "tumu") return true;
    if (filtre === "gelmedi") return r.status === "gelmedi";
    if (filtre === "iptal") return r.status === "iptal";
    if (filtre === "rezervasyon" || filtre === "kapi") {
      return r.source === filtre && r.status !== "iptal" && r.status !== "gelmedi";
    }
    return true;
  });

  // Kapasite/Yedek — günü tek havuz değil öğle/akşam diye iki dönem sayar. Sadece gerçekten
  // yer kaplayan durumlar (bekleniyor/geldi/oturdu) kapasiteye girer; gelmedi/iptal saymaz.
  // Öncelik SAAT sırasına göre değil, KAYIT sırasına (created_at) göre — "kim önce rezervasyon
  // yaptırdıysa o avantajlı" (Gökhan). Saat sırasına göre sıralasaydık, sonradan aranıp erken
  // saate rezervasyon yaptıran biri, önceden aranıp geç saate rezervasyon yaptıranın önüne
  // geçerdi — bu yanlış, gerçek hayatta ilk arayan ilk kazanır.
  const toplamKapasite = tables.reduce((s, t) => s + t.seat_count, 0);
  const kapasiteliRows = rows.filter((r) => r.status === "bekleniyor" || r.status === "geldi" || r.status === "oturdu");
  const yedekIds = new Set<string>();
  (["ogle", "aksam"] as const).forEach((d) => {
    let toplam = 0;
    kapasiteliRows
      .filter((r) => donem(r.reserved_at, aksamBaslangic) === d)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .forEach((r) => {
        toplam += r.party_size;
        if (toplam > toplamKapasite) yedekIds.add(r.id);
      });
  });
  const donemPax = (d: "ogle" | "aksam") => kapasiteliRows.filter((r) => donem(r.reserved_at, aksamBaslangic) === d).reduce((s, r) => s + r.party_size, 0);
  // Bugün + o dönem için, YENİ bir rezervasyon eklenecek olsa şu an kaç pax dolu — ekleme
  // formlarında "bu rezervasyon Yedek olacak" uyarısı için (sadece bugünü görüntülerken anlamlı).
  const donemDoluPax = (iso: string) => {
    const d = donem(iso, aksamBaslangic);
    return donemPax(d);
  };

  // 17:00'i (ya da ayarlanan saati) geçtiyse ve akşam rezervasyonu olan bir masaya önceden
  // masa atanmışsa ama o masa hâlâ "occupied" ise (hesap kapanmadı) — Karşılama'ya uyarı
  // (Gökhan: "saat 5 olduğunda akşam rezervasyonu olan masada hâlâ birileri oturuyorsa
  // hesap kapanmamışsa uyarı gider karşılamaya").
  const suAnSaat = bugunMu ? saatIstanbul(new Date().toISOString()) : -1;
  const masaHalaDolu = (r: Rez) =>
    bugunMu && suAnSaat >= aksamBaslangic && donem(r.reserved_at, aksamBaslangic) === "aksam"
    && !!r.table_id && (r.status === "bekleniyor" || r.status === "geldi")
    && tables.find((t) => t.id === r.table_id)?.status === "occupied";

  return (
    <div style={{ padding: "26px 28px", height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      {confirmDialog}

      <div style={{ marginBottom: 16, flexShrink: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>Rezervasyonlar</div>
      </div>

      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10, flexShrink: 0 }}>{err}</div>}
      {capacityNotice && (
        <div style={{ fontSize: 12.5, color: "var(--gold-text)", background: "var(--recede)", border: "1px solid var(--gold)", borderRadius: 10, padding: "8px 12px", marginBottom: 10, flexShrink: 0 }}>
          {capacityNotice}
        </div>
      )}

      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {/* Tarih gezinmesi + ekleme yolları burada, listenin hemen üstünde — sayfa başlığından
            ayrı, doğrudan listenin kontrolleri (Gökhan: "tarihi buraya al"). */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {!bugunMu && <button onClick={() => gunDegistir(bugunIstanbul())} style={btnGhost}>Bugün</button>}
            <button onClick={() => gun && gunDegistir(gunKaydir(gun, -1))} aria-label="Önceki gün" style={navBtn}><ChevronLeft size={17} /></button>
            <DatePicker value={gun} onChange={gunDegistir} />
            <button onClick={() => gun && gunDegistir(gunKaydir(gun, 1))} aria-label="Sonraki gün" style={navBtn}><ChevronRight size={17} /></button>
          </div>
          <button onClick={openNewRes} style={btnPrimary}><Plus size={14} /> Yeni rezervasyon</button>
          <button onClick={() => { setWName(""); setWPhone(""); setWParty("2"); setWNote(""); setErr(null); setWalkInOpen(true); }} style={btnPrimary}><Plus size={14} /> Rezervasyon dışı</button>
          <select value={filtre} onChange={(e) => setFiltre(e.target.value)} style={{ ...inp, marginLeft: "auto", width: 190 }}>
            <option value="tumu">Tümü</option>
            <option value="rezervasyon">Rezervasyonlar</option>
            <option value="kapi">Rezervasyonsuz gelenler</option>
            <option value="gelmedi">Gelmediler</option>
            <option value="iptal">İptaller</option>
          </select>
        </div>
        {/* Kapasite özeti — gün tek havuz değil öğle/akşam diye iki dönem (Gökhan). Biz sadece
            bilgilendiririz, engellemeyiz. Sayaç kapasitede DURUR, kapasite üstü "Yedek" olarak
            ayrı sayılır (Gökhan: "kapasite dolduğunda dursun, yanına yedek olarak saymaya başlasın"). */}
        <div style={{ display: "flex", gap: 18, marginBottom: 10, flexShrink: 0, fontSize: 12.5 }}>
          {(["ogle", "aksam"] as const).map((d) => {
            const toplam = donemPax(d);
            const onayli = Math.min(toplam, toplamKapasite);
            const yedekPax = Math.max(0, toplam - toplamKapasite);
            return (
              <span key={d} style={{ color: yedekPax > 0 ? "var(--gold-text)" : inkSoft }}>
                {d === "ogle" ? "Öğle" : "Akşam"}: <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)" }}>{onayli}</span> / <span className="tnum">{toplamKapasite}</span> pax
                {onayli >= toplamKapasite && <span style={{ fontWeight: 600 }}> (dolu)</span>}
                {yedekPax > 0 && ` · ${yedekPax} pax Yedek`}
              </span>
            );
          })}
        </div>
        <ListHeader>
          <HeaderCell width={46} marginLeft="1cm">Zaman</HeaderCell>
          <HeaderSep />
          <HeaderCell width={170} marginLeft={14}>Misafir</HeaderCell>
          <HeaderSep />
          <HeaderCell width={110} align="center">Telefon</HeaderCell>
          <HeaderSep />
          <HeaderCell width={40} align="center">Pax</HeaderCell>
          <HeaderSep />
          <HeaderCell width={150} align="center" marginLeft={38}>Masa</HeaderCell>
          <HeaderSep />
          <HeaderCell width={160}>Not</HeaderCell>
          <HeaderSep />
          <Spacer />
          <HeaderCell width={210} align="center">Rezervasyon durumu</HeaderCell>
        </ListHeader>
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {filtreliRows.length === 0 && (
            <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>
              {visibleRows.length === 0 ? "Bu gün için kayıt yok." : "Bu filtreye uyan kayıt yok."}
            </div>
          )}
          {filtreliRows.map((r) => {
            const info = DURUM_INFO[r.status] ?? DURUM_INFO.bekleniyor;
            const canli = r.status === "geldi";
            const aktif = r.status === "bekleniyor" || r.status === "geldi";
            const yedek = yedekIds.has(r.id);
            const doluUyari = masaHalaDolu(r);
            return (
              <ListRow key={r.id} bg={info.bg} muted={r.status === "gelmedi" || r.status === "iptal"}>
                <Cell width={46} marginLeft="1cm">
                  <EditableText
                    value={saat(r.reserved_at)}
                    onSave={(next) => {
                      const m = next.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
                      if (!m) return;
                      const yeniIso = new Date(`${gunIstanbul(r.reserved_at)}T${m[1].padStart(2, "0")}:${m[2]}:00+03:00`).toISOString();
                      updateField(r, { reserved_at: yeniIso });
                    }}
                    style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)", fontVariantNumeric: "tabular-nums" }}
                  />
                </Cell>
                <RowSep />
                <Cell width={170} marginLeft={14}>
                  {/* "X dk önce geldi" eskiden ismin altında ayrı bir satırdı — sadece "geldi"
                      durumundaki satırları (rezervasyonsuz gelenler + az önce gelmiş rezervasyonlar)
                      tek başına kalınlaştırıyordu (Gökhan: "satır kalınlıkları farklı, ayarla").
                      Artık ismin yanında, aynı satırda — bilgi kayıp değil, satır tek satır kalıyor. */}
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <EditableText
                      value={r.guest_name}
                      onSave={(next) => updateField(r, { guest_name: toTitleTr(next) })}
                      style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    />
                    {yedek && <span title="Kapasite dolduktan sonra alınmış" style={{ fontSize: 9.5, fontWeight: 700, color: "var(--gold-text)", border: "1px solid var(--gold)", borderRadius: 4, padding: "1px 4px", flexShrink: 0 }}>YEDEK</span>}
                    {canli && r.arrived_at && (
                      <span style={{ fontSize: 11, color: inkSoft, flexShrink: 0 }}>· {bekleyenSure(r.arrived_at, now)} önce geldi</span>
                    )}
                  </div>
                  {doluUyari && (
                    <div style={{ fontSize: 11, color: "var(--danger)", fontWeight: 600 }}>⚠ Masa hâlâ dolu</div>
                  )}
                </Cell>
                <RowSep />
                <Cell width={110} align="center">
                  <EditableText
                    value={r.guest_phone || "—"}
                    onSave={(next) => updateField(r, { guest_phone: next.replace(/[^\d+ ]/g, "").trim() || null })}
                    style={{ fontSize: 12.5, color: "var(--ink)" }}
                  />
                </Cell>
                <RowSep />
                <Cell width={40} align="center">
                  <EditableText
                    value={String(r.party_size)}
                    onSave={(next) => { const n = parseInt(next.replace(/\D/g, ""), 10); if (n > 0) updateField(r, { party_size: n }); }}
                    style={{ fontSize: 12.5, color: "var(--ink)" }}
                  />
                </Cell>
                <RowSep />
                <Cell width={150} align="center" marginLeft={38}>
                  {/* Masa atama YERİNDE olur — tıklanınca bu hücrenin içi, atandığında adının
                      yazacağı aynı yerde, açılır seçime döner (Gökhan: doğru yer burası).
                      Atanmış olsa bile bugün+aktifken tıklanabilir — misafir rezerve edilen
                      masayı istemezse personel buradan değiştirir. */}
                  {assigningId === r.id ? (
                    <select autoFocus onBlur={() => setAssigningId(null)} onChange={(e) => masaAta(r, e.target.value)} defaultValue="" style={{ ...inp, width: "100%", padding: "5px 8px", fontSize: 12.5 }}>
                      <option value="" disabled>Masa seç…</option>
                      {bosMasalar.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.seat_count} pax)</option>)}
                    </select>
                  ) : tableName(r.table_id) ? (
                    bugunMu && aktif ? (
                      <button onClick={() => setAssigningId(r.id)} style={{ all: "unset", cursor: "pointer", fontSize: 12.5, color: "var(--ink)", textDecoration: "underline", textDecorationColor: "var(--line-2)" }}>{tableName(r.table_id)}</button>
                    ) : (
                      <span style={{ fontSize: 12.5, color: "var(--ink)" }}>{tableName(r.table_id)}</span>
                    )
                  ) : bugunMu && aktif ? (
                    <button onClick={() => setAssigningId(r.id)} style={btnGhostRow}>Masa ata</button>
                  ) : (
                    <span style={{ fontSize: 12.5, color: inkSoft }}>—</span>
                  )}
                </Cell>
                <RowSep />
                <Cell width={160}>
                  <EditableText
                    value={r.note || "—"}
                    allowEmpty
                    onSave={(next) => updateField(r, { note: !next || next === "—" ? null : next })}
                    style={{ fontSize: 12, color: "var(--ink)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  />
                </Cell>
                <RowSep />
                <Spacer />
                <ActionsCell width={210} align="center">
                  {/* Karşılama "geldi" dedikten sonra iş bitmiş olmalı — ayrı bir "Oturt"
                      adımı çıkmasın (Gökhan: "geldi dedikten sonra işi bitmeli, müşteriyi
                      garsona yönlendirdikten ya da yerine oturttuktan sonra zaten geldi
                      diyecek"). Masa zaten atanmışsa Geldi/Oturt tek tıkla o masaya oturtur
                      (pratiklik); atanmamışsa masa seçim penceresi açılır. "geldi" durumu
                      sadece vale/kapıdan otomatik eşleşmede ayrı görünür (orada arrival
                      host'un elinden bağımsız gerçekleşiyor). */}
                  {bugunMu && r.status === "bekleniyor" && (
                    <>
                      <button onClick={() => r.table_id ? oturtDirekt(r) : setSeatingFor(r)} disabled={!r.table_id && bosMasalar.length === 0} style={{ ...btnSmallRow, opacity: !r.table_id && bosMasalar.length === 0 ? 0.5 : 1 }}>Geldi</button>
                      <button onClick={() => durumDegistir(r, "gelmedi")} style={btnGhostRow}>Gelmedi</button>
                    </>
                  )}
                  {bugunMu && r.status === "geldi" && (
                    <button onClick={() => r.table_id ? oturtDirekt(r) : setSeatingFor(r)} disabled={!r.table_id && bosMasalar.length === 0} style={{ ...btnSmallRow, opacity: !r.table_id && bosMasalar.length === 0 ? 0.5 : 1 }}>Oturdu</button>
                  )}
                  {aktif ? (
                    <button onClick={() => iptalEt(r)} style={btnGhostRow}>İptal</button>
                  ) : (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span title={r.status === "iptal" ? r.cancel_reason ?? undefined : undefined} style={{ fontSize: 11, fontWeight: 700, color: info.color }}>{info.label}</span>
                      {/* Kaynak etiketi — rezervasyon mu, kapıdan mı (Gökhan: "oturdunun
                          yanında RVZ yazsın, diğerinin yanında da kapı, ikisinin rengi de
                          farklı olsun"). Sadece sonuçlanmış satırlarda — bekleniyor/geldi'de
                          zaten 2-3 buton var, sığmaz. */}
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: SOURCE_INFO[r.source]?.color ?? inkSoft }}>
                        ({SOURCE_INFO[r.source]?.label ?? r.source})
                      </span>
                    </span>
                  )}
                </ActionsCell>
              </ListRow>
            );
          })}
        </div>
      </div>

      {/* YENİ REZERVASYON KATMANI */}
      {newResOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setNewResOpen(false)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, minWidth: 340, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 14 }}>Yeni rezervasyon</div>
            {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{err}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input autoFocus value={fName} onChange={(e) => setFName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="İsim soyisim" style={inp} />
              <input value={fPhone} onChange={(e) => setFPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Telefon (opsiyonel)" inputMode="tel" style={inp} />
              <div style={{ display: "flex", gap: 8 }}>
                <input value={fParty} onChange={(e) => setFParty(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Kişi sayısı" inputMode="numeric" style={{ ...inp, flex: 1 }} />
                <DatePicker value={fDate} onChange={setFDate} style={{ flex: 1 }} />
                <input type="time" value={fTime} onChange={(e) => setFTime(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...inp, flex: 1 }} />
              </div>
              <input value={fNote} onChange={(e) => setFNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Özel not (opsiyonel)" style={inp} />
            </div>

            <div style={{ marginTop: 10 }}>
              {kvkkNotice.trim() ? (
                <button onClick={() => setKvkkAcik((v) => !v)} style={{ all: "unset", cursor: "pointer", fontSize: 11.5, color: "var(--brand)" }}>
                  {kvkkAcik ? "KVKK aydınlatma metnini gizle" : "KVKK aydınlatma metni"}
                </button>
              ) : (
                <span style={{ fontSize: 11.5, color: "var(--danger)" }}>KVKK aydınlatma metni girilmemiş — Ayarlar &gt; İşletme bölümünden ekleyin.</span>
              )}
              {kvkkAcik && kvkkNotice.trim() && (
                <div style={{ marginTop: 8, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 12, background: "var(--recede)", fontSize: 12, color: "var(--muted)", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 140, overflowY: "auto" }}>
                  {kvkkNotice}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={() => setNewResOpen(false)} style={btnSecondary}>Vazgeç</button>
              <button onClick={submit} disabled={busy || !fName.trim()} style={{ ...btnPrimary, opacity: !fName.trim() ? 0.5 : 1 }}>Ekle</button>
            </div>
          </div>
        </div>
      )}

      {/* REZERVASYONSUZ GİR KATMANI */}
      {walkInOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setWalkInOpen(false)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, minWidth: 320, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 4 }}>Rezervasyon dışı</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, lineHeight: 1.5 }}>
              Kayıt zorunlu değil — hiç kaydetmeden de bir masaya doğrudan oturtabilirsin. Buradan
              girersen bugünün listesinde &quot;Geldi&quot; olarak görünür.
            </div>
            {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{err}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input autoFocus value={wName} onChange={(e) => setWName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && dogrudanGir()} placeholder="İsim soyisim" style={{ ...inp, flex: 1 }} />
                <input value={wParty} onChange={(e) => setWParty(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && dogrudanGir()} placeholder="Kişi" inputMode="numeric" style={{ ...inp, width: 70 }} />
              </div>
              <input value={wPhone} onChange={(e) => setWPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && dogrudanGir()} placeholder="Telefon (opsiyonel)" inputMode="tel" style={inp} />
              <input value={wNote} onChange={(e) => setWNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && dogrudanGir()} placeholder="Özel not (opsiyonel)" style={inp} />
            </div>

            <div style={{ marginTop: 10 }}>
              {kvkkNotice.trim() ? (
                <button onClick={() => setKvkkAcik((v) => !v)} style={{ all: "unset", cursor: "pointer", fontSize: 11.5, color: "var(--brand)" }}>
                  {kvkkAcik ? "KVKK aydınlatma metnini gizle" : "KVKK aydınlatma metni"}
                </button>
              ) : (
                <span style={{ fontSize: 11.5, color: "var(--danger)" }}>KVKK aydınlatma metni girilmemiş — Ayarlar &gt; İşletme bölümünden ekleyin.</span>
              )}
              {kvkkAcik && kvkkNotice.trim() && (
                <div style={{ marginTop: 8, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 12, background: "var(--recede)", fontSize: 12, color: "var(--muted)", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 140, overflowY: "auto" }}>
                  {kvkkNotice}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={() => setWalkInOpen(false)} style={btnSecondary}>Vazgeç</button>
              <button onClick={dogrudanGir} disabled={busy || !wName.trim()} style={{ ...btnPrimary, opacity: !wName.trim() ? 0.5 : 1 }}>Ekle</button>
            </div>
          </div>
        </div>
      )}

      {/* OTURT KATMANI */}
      {seatingFor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setSeatingFor(null)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, minWidth: 320, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 4 }}>{seatingFor.guest_name}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Hangi masaya oturtuyorsun?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
              {bosMasalar.map((t) => (
                <button key={t.id} onClick={() => oturt(t.id)} disabled={busy} style={{ ...btnSecondary, justifyContent: "space-between", display: "flex" }}>
                  <span>{t.name}</span>
                  <span className="tnum" style={{ color: "var(--muted)" }}>{t.seat_count} pax</span>
                </button>
              ))}
            </div>
            <button onClick={() => setSeatingFor(null)} style={{ all: "unset", cursor: "pointer", fontSize: 13, color: "var(--muted)", marginTop: 14, display: "block" }}>Vazgeç</button>
          </div>
        </div>
      )}

      {/* İPTAL KATMANI — sebep sormadan direkt iptal etmiyor (Gökhan: "iptal edilenlere
          iptal sebebi girilsin"). Sebep opsiyonel, boş bırakılabilir. */}
      {iptalFor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setIptalFor(null)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, minWidth: 320, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 4 }}>{iptalFor.guest_name} rezervasyonu iptal edilsin mi?</div>
            <input
              autoFocus value={iptalReason} onChange={(e) => setIptalReason(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && iptalOnayla()}
              placeholder="İptal sebebi (opsiyonel)" style={{ ...inp, width: "100%", marginTop: 12 }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={() => setIptalFor(null)} style={btnSecondary}>Hayır</button>
              <button onClick={iptalOnayla} style={btnPrimary}>Evet</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 10px", fontSize: 13, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0 };
const btnPrimary: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 980, padding: "9px 14px", background: "var(--brand-strong)", color: "#fff", fontSize: 13, fontWeight: 500, flexShrink: 0 };
const btnSecondary: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 16px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13, cursor: "pointer" };
const btnSmall: React.CSSProperties = { border: "none", borderRadius: 980, padding: "7px 14px", background: "var(--ink-green)", color: "#fff", fontSize: 12.5, flexShrink: 0, cursor: "pointer" };
const btnGhost: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "7px 12px", background: "var(--card)", color: "var(--ink)", fontSize: 12, flexShrink: 0, cursor: "pointer" };
// Liste satırı içindeki butonlar (Masa ata, Geldi/Oturdu, Gelmedi, İptal) — sıradaki dikey
// padding'le (7px) düz yazı hücrelerinden belirgin kalın duruyordu (Gökhan: "yeni rezervasyon
// ve rezervasyonsuz gelen müşteri satırları kalın, diğerlerine göre ayarla" — masa atanmamış/
// aktif satırlarda buton var, diğerlerinde düz yazı). Aynı butonlar, sadece dikeyde daha ince.
const btnSmallRow: React.CSSProperties = { ...btnSmall, padding: "4px 14px" };
const btnGhostRow: React.CSSProperties = { ...btnGhost, padding: "4px 12px" };
// Soluk yeşilimsi gri (var(--muted)) yerine — Gökhan: "siyah ve tonlarını kullan." Sadece
// gerçekten ikincil (tarih/boş yer tutucu gibi) küçük bilgiler için, ana metin var(--ink).
const inkSoft = "#5c5c58";
const navBtn: React.CSSProperties = { all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: 6, borderRadius: 8, color: "var(--muted)" };
