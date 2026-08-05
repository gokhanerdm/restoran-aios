"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getMyReservationRestaurantId, getMyReservationRestaurants, setAktifSube, type ReservationBranch } from "@/lib/supabase/reservationAccount";
import { toTitleTr } from "@/lib/text";
import { Plus, ChevronLeft, ChevronRight, ChevronDown, LayoutGrid, Settings, LogOut, User, Search, X } from "lucide-react";
import { useConfirm } from "../components/useConfirm";
import DatePicker from "../components/DatePicker";
import EditableText from "../components/EditableText";
import { ListHeader, HeaderCell, HeaderSep, ListRow, RowSep, Cell, Spacer, ActionsCell } from "../components/ListRow";

// REZERVASYON — kendi başına çalışan ayrı program (Gökhan onayı, 2026-08-04).
//
// Eskiden bu ekran AIOS'un içindeydi (/karsilama), sol menüden açılıyordu ve misafir
// oturunca adisyon açıyordu. Karar değişti: rezervasyon ayrı satılabilecek bir ürün, AIOS
// ile işi yok. Bu yüzden:
//   - AIOS sol menüsü yok. Kendi girişi var (/rezervasyon/giris) — AIOS'un profiles/
//     bootstrap_restaurant_account'ından tamamen ayrı bir hesap sistemi (restaurants.
//     owner_user_id). Oturum yoksa buraya değil /rezervasyon/giris'e düşülür.
//   - Hesap/adisyon yok. Akış kendi içinde kapanır: bekleniyor -> geldi -> oturdu -> kalktı
//   - Masayı bu program yönetir: oturunca dolu, kalkınca boş (bkz. seat_reservation ve
//     end_reservation_visit — artık orders tablosuna hiç dokunmuyorlar).
//
// "bekleniyor" = misafir henüz gelmedi. "geldi" = kapıda, masa bekliyor. "oturdu" = masada.
// "kalktı" = masa boşaldı. Kapıdan rezervasyonsuz gelen de aynı listeye, aynı zincire girer.

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
const saatIstanbul = (iso: string) => parseInt(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Istanbul" }).format(new Date(iso)), 10);
const donem = (iso: string, aksamBaslangic: number): "ogle" | "aksam" => (saatIstanbul(iso) >= aksamBaslangic ? "aksam" : "ogle");

// Satır kartının arka planı — açık kahve tonlarının dereceli ailesi (--tan-100..500).
// Sıra "ne kadar bitmiş" mantığında: aktif olanlar en açık, iptal en koyu.
// "kalktı" masası boşalmış ama normal biten bir ziyaret — oturdu ile gelmedi arasında.
const DURUM_INFO: Record<string, { label: string; color: string; bg: string }> = {
  bekleniyor: { label: "Bekleniyor", color: "var(--ink)", bg: "var(--tan-100)" },
  geldi: { label: "Geldi", color: "var(--danger)", bg: "var(--tan-100)" },
  oturdu: { label: "Oturdu", color: "var(--brand)", bg: "var(--tan-300)" },
  kalkti: { label: "Kalktı", color: "var(--ink)", bg: "var(--tan-200)" },
  gelmedi: { label: "Gelmedi", color: "var(--gold-text)", bg: "var(--tan-400)" },
  iptal: { label: "İptal", color: "var(--ink)", bg: "var(--tan-500)" },
};
// Kayıt nereden geldi — istatistik için kayıt anında bir kere yazılır, sonra değişmez.
const SOURCE_INFO: Record<string, { label: string; color: string }> = {
  rezervasyon: { label: "RVZ", color: "var(--brand)" },
  kapi: { label: "Kapı", color: "var(--gold-text)" },
  online: { label: "Online", color: "var(--ink-green)" },
};

// Yeni "geldi" olan kaydı fark edince kısa bir bip — dosya yok, Web Audio ile üretiliyor,
// izin ilk dokunuşta alınıyor (tarayıcılar sesi kullanıcı hareketi olmadan başlatmıyor).
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

// Kişi Kartı (Gökhan, 2026-08-05: "sistem müşteriyi tanıyacak... kişi kartında beraber
// geldikleri gibi bir seçenek olacak") — telefon numarasına bağlı geçmiş (geldi/gelmedi/
// iptal sayıları), kalıcı not ve elle bağlanmış diğer numaralar. Telefon 10 haneye ulaşınca
// 500ms bekleyip sorar (her tuşta sorgu atmasın).
type KisiKarti = {
  kartId: string | null; isim: string | null; kartNotu: string | null;
  ziyaretSayisi: number; gelmediSayisi: number; iptalSayisi: number; sonZiyaret: string | null;
  baglantilar: { id: string; telefon: string; aciklama: string | null }[];
} | null;
function useKisiKarti(phone: string, restaurantId: string | null, refreshKey: number): KisiKarti {
  const [kart, setKart] = useState<KisiKarti>(null);
  const digits = phone.replace(/\D/g, "");
  const gecerli = !!restaurantId && digits.length >= 10;

  // Numara 10 haneden kısaldıysa (silindi/değişti) kartı hemen temizle — render sırasında,
  // effect içinde değil (react-hooks/set-state-in-effect'i tetiklememek için).
  const [oncekiGecerli, setOncekiGecerli] = useState(gecerli);
  if (gecerli !== oncekiGecerli) {
    setOncekiGecerli(gecerli);
    if (!gecerli) setKart(null);
  }

  useEffect(() => {
    if (!gecerli || !restaurantId) return;
    const id = setTimeout(() => {
      supabase.rpc("kisi_karti_getir", { p_restaurant: restaurantId, p_phone: phone }).then(({ data }) => {
        const row = (data as {
          kart_id: string | null; isim: string | null; kart_notu: string | null;
          ziyaret_sayisi: number; gelmedi_sayisi: number; iptal_sayisi: number; son_ziyaret: string | null;
          baglantilar: { id: string; telefon: string; aciklama: string | null }[];
        }[] | null)?.[0];
        if (!row) { setKart(null); return; }
        setKart({
          kartId: row.kart_id, isim: row.isim, kartNotu: row.kart_notu,
          ziyaretSayisi: row.ziyaret_sayisi, gelmediSayisi: row.gelmedi_sayisi, iptalSayisi: row.iptal_sayisi,
          sonZiyaret: row.son_ziyaret, baglantilar: row.baglantilar ?? [],
        });
      });
    }, 500);
    return () => clearTimeout(id);
  }, [phone, restaurantId, refreshKey, gecerli]);
  return kart;
}

// Kişi kartı özeti + not düzenleme + numara bağlama — hem yeni rezervasyon formlarında hem
// mevcut bir kayıt için açılan kart penceresinde kullanılıyor.
function KisiKartiOzet({
  kart, phone, restaurantId, onChanged,
}: { kart: KisiKarti; phone: string; restaurantId: string | null; onChanged: () => void }) {
  const [notTaslak, setNotTaslak] = useState(kart?.kartNotu ?? "");
  const [bagAcik, setBagAcik] = useState(false);
  const [bagTelefon, setBagTelefon] = useState("");
  const [bagAciklama, setBagAciklama] = useState("");

  // kart değişince (RPC tazelenince) taslağı senkronla — effect değil render-sırası koşullu
  // setState (React'in "prop değişince state sıfırla" deseni), react-hooks/set-state-in-effect
  // uyarısını tetiklememek için.
  const [oncekiKartNotu, setOncekiKartNotu] = useState(kart?.kartNotu ?? "");
  if ((kart?.kartNotu ?? "") !== oncekiKartNotu) {
    setOncekiKartNotu(kart?.kartNotu ?? "");
    setNotTaslak(kart?.kartNotu ?? "");
  }

  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;

  const notKaydet = async () => {
    if (!restaurantId) return;
    if ((notTaslak.trim() || "") === (kart?.kartNotu ?? "")) return;
    await supabase.from("kisi_kartlari").upsert(
      { restaurant_id: restaurantId, phone, kart_notu: notTaslak.trim() || null, updated_at: new Date().toISOString() },
      { onConflict: "restaurant_id,phone" },
    );
    onChanged();
  };
  const numaraBagla = async () => {
    if (!restaurantId || !bagTelefon.trim()) return;
    const { data: kartRow, error: kartErr } = await supabase.from("kisi_kartlari")
      .upsert({ restaurant_id: restaurantId, phone, kart_notu: notTaslak.trim() || null }, { onConflict: "restaurant_id,phone" })
      .select("id").single();
    if (kartErr || !kartRow) return;
    await supabase.from("kisi_kart_baglantilari").insert({ kisi_karti_id: (kartRow as { id: string }).id, baglanti_telefon: bagTelefon.trim(), aciklama: bagAciklama.trim() || null });
    setBagTelefon(""); setBagAciklama(""); setBagAcik(false);
    onChanged();
  };

  const gecmisVar = !!kart && (kart.ziyaretSayisi > 0 || kart.gelmediSayisi > 0 || kart.iptalSayisi > 0);

  return (
    <div style={{ border: "1px solid var(--line-2)", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
      {gecmisVar ? (
        <div style={{ fontSize: 11.5, color: "var(--gold-text)" }}>
          {kart!.ziyaretSayisi > 0 && `${kart!.ziyaretSayisi} kez geldi`}
          {kart!.gelmediSayisi > 0 && ` · ${kart!.gelmediSayisi} kez gelmedi`}
          {kart!.iptalSayisi > 0 && ` · ${kart!.iptalSayisi} kez iptal`}
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: inkSoft }}>Bu numarayla ilk kez geliyor.</div>
      )}
      {kart && kart.baglantilar.length > 0 && (
        <div style={{ fontSize: 11, color: inkSoft }}>
          Bağlı numaralar: {kart.baglantilar.map((b) => `${b.telefon}${b.aciklama ? ` (${b.aciklama})` : ""}`).join(", ")}
        </div>
      )}
      <input
        value={notTaslak} onChange={(e) => setNotTaslak(e.target.value)} onBlur={notKaydet}
        placeholder="Kişi notu (pencere kenarı sever, alerjisi var…)"
        style={{ ...inp, fontSize: 12 }}
      />
      {!bagAcik ? (
        <button onClick={() => setBagAcik(true)} style={{ all: "unset", cursor: "pointer", fontSize: 11.5, color: "var(--brand)" }}>+ Numara bağla</button>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <input value={bagTelefon} onChange={(e) => setBagTelefon(e.target.value)} placeholder="Diğer numara" inputMode="tel" style={{ ...inp, fontSize: 12, flex: 1 }} />
          <input value={bagAciklama} onChange={(e) => setBagAciklama(e.target.value)} placeholder="Not (birlikte geldiler…)" style={{ ...inp, fontSize: 12, flex: 1 }} />
          <button onClick={numaraBagla} style={btnSmallRow}>Ekle</button>
        </div>
      )}
    </div>
  );
}

// Onay/hatırlatma bildirimi — SMS/WhatsApp sağlayıcısı henüz bağlı değil, şu an her zaman
// "gönderilmedi" döner. Sonucu beklemeden çağırıyoruz: bildirim gitmese de akış etkilenmesin.
const bildirimGonder = (reservationId: string, tip: "onay" | "hatirlatma") => {
  supabase.functions.invoke("send-reservation-notification", { body: { reservation_id: reservationId, type: tip } }).catch(() => {});
};

export default function RezervasyonPage() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState("");
  // Çok şubeli hesaplarda şube değiştirici — tek şubelide hiç görünmez (liste 1 elemanlı).
  const [subeler, setSubeler] = useState<ReservationBranch[]>([]);
  const [subeSecimiAcik, setSubeSecimiAcik] = useState(false);
  const [gun, setGun] = useState("");
  const [rows, setRows] = useState<Rez[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  // reservation_id -> o rezervasyona bağlı TÜM masa id'leri (masa birleştirme).
  const [rezMasalar, setRezMasalar] = useState<Record<string, string[]>>({});
  const [now, setNow] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kvkkNotice, setKvkkNotice] = useState("");
  const [kvkkAcik, setKvkkAcik] = useState(false);
  const [aksamBaslangic, setAksamBaslangic] = useState(17);
  // Varsayılan oturma süresi Ayarlar'dan geliyor — yeni rezervasyon bu süreyle kaydedilir.
  const [oturmaSuresi, setOturmaSuresi] = useState(90);
  const [capacityNotice, setCapacityNotice] = useState<string | null>(null);
  const bildirCapacityNotice = (msg: string) => {
    setCapacityNotice(msg);
    setTimeout(() => setCapacityNotice(null), 7000);
  };
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Yeni rezervasyon formu — buton tıklanınca açılan katman.
  const [newResOpen, setNewResOpen] = useState(false);
  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fParty, setFParty] = useState("2");
  const [fDate, setFDate] = useState("");
  const [fTime, setFTime] = useState("");
  const [fNote, setFNote] = useState("");
  const [fKartRefresh, setFKartRefresh] = useState(0);
  const fKart = useKisiKarti(fPhone, restaurantId, fKartRefresh);

  // Rezervasyonsuz, kapıdan gelen — rezervasyon formuyla aynı bilgileri toplar, sadece
  // tarih/saat yok ("şimdi").
  const [walkInOpen, setWalkInOpen] = useState(false);
  const [wName, setWName] = useState("");
  const [wPhone, setWPhone] = useState("");
  const [wParty, setWParty] = useState("2");
  const [wNote, setWNote] = useState("");
  const [wKartRefresh, setWKartRefresh] = useState(0);
  const wKart = useKisiKarti(wPhone, restaurantId, wKartRefresh);

  // Kişi kartı penceresi — mevcut bir rezervasyon satırından açılır (Gökhan: "numara
  // aradığında yine isim soyisim çıkacak, ... beraber gelmişlerdi felan").
  const [kartFor, setKartFor] = useState<Rez | null>(null);
  const [kartRefresh, setKartRefresh] = useState(0);
  const kartForKart = useKisiKarti(kartFor?.guest_phone ?? "", restaurantId, kartRefresh);

  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [masaDigerAcik, setMasaDigerAcik] = useState(false);
  // Masa birleştirme seçimi — birden fazla masaya tıklanıp "Ata" ile onaylanır.
  const [masaSecimi, setMasaSecimi] = useState<string[]>([]);
  const [seatingFor, setSeatingFor] = useState<Rez | null>(null);
  const [iptalFor, setIptalFor] = useState<Rez | null>(null);
  const [iptalReason, setIptalReason] = useState("");
  const [filtre, setFiltre] = useState("tumu");
  // Salon ekranında düzenleme kapalıyken masaya tıklayınca buraya ?arama=<masa adı> ile
  // gelinir (Gökhan: "masaya tıkladığında rezervasyon listesi açılsın") — arama kutusu
  // başlangıç değerini URL'den okuyor (lazy initializer, effect değil).
  const [arama, setArama] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("arama") ?? "";
  });

  const notifiedGeldi = useRef<Set<string>>(new Set());
  const router = useRouter();

  // İşletme oturumdan çözülür — oturum yoksa ya da hesabın restoranı yoksa girişe düşer.
  // Şube listesi de burada çekiliyor — çok şubeli hesapta değiştirici için (tek şubelide
  // liste 1 elemanlı geleceği için değiştirici zaten hiç görünmeyecek).
  useEffect(() => {
    let active = true;
    getMyReservationRestaurantId().then((id) => {
      if (!active) return;
      if (!id) { router.replace("/rezervasyon/giris"); return; }
      setRestaurantId(id);
      supabase.from("restaurants").select("name").eq("id", id).maybeSingle()
        .then(({ data }) => { if (active) setRestaurantName((data as { name: string } | null)?.name ?? ""); });
    });
    getMyReservationRestaurants().then((list) => { if (active) setSubeler(list); });
    return () => { active = false; };
  }, [router]);

  // Şube değiştirme — bu masaya/ekrana özgü onlarca state'i teker teker sıfırlamak yerine
  // sert bir sayfa yenilemesiyle temiz baştan yükleniyor (Ayarlar dahil her ekran tutarlı kalsın diye).
  const subeDegistir = (id: string) => {
    setAktifSube(id);
    window.location.assign("/rezervasyon");
  };

  const cikisYap = async () => { await supabase.auth.signOut(); router.replace("/rezervasyon/giris"); };

  const load = useCallback(async (restId: string, targetGun: string) => {
    const { start, end } = gunSiniri(targetGun);
    const [{ data: r, error }, { data: t }, { data: s }] = await Promise.all([
      supabase.from("reservations").select("id, guest_name, guest_phone, party_size, reserved_at, status, note, table_id, arrived_at, created_at, cancel_reason, source")
        .eq("restaurant_id", restId).is("deleted_at", null)
        .gte("reserved_at", start).lt("reserved_at", end)
        .order("created_at"),
      supabase.from("restaurant_tables").select("id, name, seat_count, status").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("restaurant_settings").select("kvkk_notice, evening_start_hour, default_duration_minutes").eq("restaurant_id", restId).maybeSingle(),
    ]);
    if (error) { setErr(error.message); return; }
    const list = (r as Rez[]) ?? [];
    setRows(list);
    setTables((t as TableRow[]) ?? []);
    const settingsRow = s as { kvkk_notice: string | null; evening_start_hour: number; default_duration_minutes: number } | null;
    setKvkkNotice(settingsRow?.kvkk_notice ?? "");
    setAksamBaslangic(settingsRow?.evening_start_hour ?? 17);
    setOturmaSuresi(settingsRow?.default_duration_minutes ?? 90);
    setErr(null);

    // Masa birleştirme (Gökhan: "10 kişi kapasite dolana kadar masa seçecek, birden fazla
    // masayı birleştirebilecek") — bir rezervasyona bağlı TÜM masalar, sadece birincisi değil.
    if (list.length > 0) {
      const { data: rt } = await supabase.from("reservation_tables").select("reservation_id, table_id").in("reservation_id", list.map((row) => row.id));
      const map: Record<string, string[]> = {};
      ((rt as { reservation_id: string; table_id: string }[]) ?? []).forEach((row) => {
        (map[row.reservation_id] ??= []).push(row.table_id);
      });
      setRezMasalar(map);
    } else {
      setRezMasalar({});
    }

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

  useEffect(() => { setGun(bugunIstanbul()); }, []);
  useEffect(() => {
    if (!restaurantId || !gun) return;
    load(restaurantId, gun);
    const id = setInterval(() => load(restaurantId, gun), 6000);
    return () => clearInterval(id);
  }, [restaurantId, gun, load]);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  useEffect(() => {
    const onFirstTouch = () => { unlockAudio(); document.removeEventListener("pointerdown", onFirstTouch); };
    document.addEventListener("pointerdown", onFirstTouch);
    return () => document.removeEventListener("pointerdown", onFirstTouch);
  }, []);

  const yenile = async () => { if (restaurantId && gun) await load(restaurantId, gun); };
  const gunDegistir = (g: string) => setGun(g);

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

    // Kapasite kontrolü sadece görüntülenen gün için yapılabiliyor (elimizde başka günün
    // verisi yok). Kapasiteyi aşıyorsa Yedek olacağını giriş anında söylüyoruz.
    let mevcut = 0;
    if (fDate === gun) {
      mevcut = donemDoluPax(new Date(`${fDate}T${fTime}:00+03:00`).toISOString());
      if (mevcut + kisi > toplamKapasite) {
        const ok = await confirm(`Kapasite dolu (${mevcut}/${toplamKapasite} pax) — bu rezervasyon Yedek olarak kaydedilecek. Devam edilsin mi?`, { danger: false });
        if (!ok) return;
      }
    }

    setBusy(true);
    const { data: yeniKayit, error } = await supabase.from("reservations").insert({
      restaurant_id: restaurantId,
      guest_name: toTitleTr(fName),
      guest_phone: fPhone.trim() || null,
      party_size: kisi,
      reserved_at: new Date(`${fDate}T${fTime}:00+03:00`).toISOString(),
      duration_minutes: oturmaSuresi,
      note: fNote.trim() || null,
      consent_at: fPhone.trim() ? new Date().toISOString() : null,
    }).select("id").single();
    setBusy(false);
    if (error) { setErr(error.message); return; }
    if (yeniKayit) bildirimGonder(yeniKayit.id, "onay");
    setNewResOpen(false);
    if (fDate === gun && mevcut < toplamKapasite && mevcut + kisi >= toplamKapasite) {
      bildirCapacityNotice(`Kapasite bu rezervasyonla doldu (${toplamKapasite}/${toplamKapasite} pax) — bundan sonraki rezervasyonlar Yedek olarak kaydedilecek.`);
    }
    if (fDate !== gun) gunDegistir(fDate); else await yenile();
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
    if (gun !== bugunIstanbul()) gunDegistir(bugunIstanbul()); else await yenile();
  };

  // Gelmedi/İptal olunca atanmış masa hâlâ rezerveyse otomatik boşa çıkar.
  const durumDegistir = async (r: Rez, next: string, cancelReason?: string) => {
    setErr(null);
    const { error } = await supabase.rpc("set_reservation_status", { p_reservation_id: r.id, p_status: next, p_cancel_reason: cancelReason ?? null });
    if (error) { setErr(error.message); return; }
    await yenile();
  };

  const iptalEt = (r: Rez) => { setIptalReason(""); setIptalFor(r); };
  const iptalOnayla = async () => {
    if (!iptalFor) return;
    await durumDegistir(iptalFor, "iptal", iptalReason);
    setIptalFor(null);
  };

  // Masa ata — sadece bugün için anlamlı: işletme masa planını aynı gün yapar.
  // Masa birleştirme (Gökhan: "on kişi kapasite dolana kadar masa seçecek, birden fazla
  // masa birleştirebilecek") — tek masa da olsa, birleştirilmiş birden fazla masa da olsa
  // aynı yoldan gider.
  const masaAta = async (r: Rez, tableIds: string[]) => {
    if (tableIds.length === 0) return;
    setErr(null);
    const { error } = await supabase.rpc("assign_reservation_tables", { p_reservation_id: r.id, p_table_ids: tableIds });
    setAssigningId(null);
    setMasaSecimi([]);
    if (error) { setErr(error.message); return; }
    await yenile();
  };

  // Oturtma artık hesap açmıyor — sadece masayı dolu işaretliyor (seat_reservation).
  const oturt = async (tableId: string) => {
    if (!seatingFor) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("seat_reservation", { p_reservation_id: seatingFor.id, p_table_id: tableId });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setSeatingFor(null);
    await yenile();
  };

  // Masası zaten atanmışsa tek tıkla o masaya oturur. Misafir başka masa isterse personel
  // önce Masa hücresinden atamayı değiştirir.
  const oturtDirekt = async (r: Rez) => {
    if (!r.table_id) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("seat_reservation", { p_reservation_id: r.id, p_table_id: r.table_id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await yenile();
  };

  // Misafir kalktı — masa boşalır, akış kapanır. Bu programın son adımı.
  const kalkti = async (r: Rez) => {
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("end_reservation_visit", { p_reservation_id: r.id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await yenile();
  };

  const updateField = async (r: Rez, patch: Partial<Pick<Rez, "guest_name" | "guest_phone" | "party_size" | "note" | "reserved_at">>) => {
    setErr(null);
    const { error } = await supabase.from("reservations").update(patch).eq("id", r.id);
    if (error) { setErr(error.message); return; }
    await yenile();
  };

  const bosMasalar = tables.filter((t) => t.status === "empty");
  const tableName = (id: string | null) => tables.find((t) => t.id === id)?.name ?? null;
  const bugunMu = gun === bugunIstanbul();
  // Sıralama dört kademeli: aktif akış üstte (kayıt sırasında), sonra kalkanlar, sonra
  // gelmeyenler, en altta iptaller. Array.sort stable — her kademe kendi içinde sırasını korur.
  const siraKademe = (s: string) => (s === "iptal" ? 3 : s === "gelmedi" ? 2 : s === "kalkti" ? 1 : 0);
  const visibleRows = [...rows].sort((a, b) => siraKademe(a.status) - siraKademe(b.status));

  // Kapasite/Yedek — gün tek havuz değil, öğle/akşam iki ayrı dönem. Sadece gerçekten yer
  // kaplayan durumlar sayılır; kalkan misafir masayı boşalttığı için artık saymaz.
  // Öncelik saate göre değil KAYIT sırasına göre — ilk arayan ilk kazanır (otomatik/akıllı
  // yerleştirme önceliği ayrıca konuşulacak — Gökhan: "öncelik durumunu sonra konuşalım").
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

  // Arama — isim, telefon, masa adı, not — herhangi birine göre eşleşirse gösterilir
  // (Gökhan: "her kritere göre arama yapılabilsin").
  const aramaQ = arama.trim().toLocaleLowerCase("tr");
  const filtreliRows = visibleRows.filter((r) => {
    if (filtre === "tumu") { /* devam */ }
    else if (filtre === "yedek") { if (!yedekIds.has(r.id)) return false; }
    else if (filtre === "gelmedi") { if (r.status !== "gelmedi") return false; }
    else if (filtre === "iptal") { if (r.status !== "iptal") return false; }
    else if (filtre === "rezervasyon" || filtre === "kapi" || filtre === "online") {
      if (!(r.source === filtre && r.status !== "iptal" && r.status !== "gelmedi")) return false;
    }
    if (!aramaQ) return true;
    const masaAdi = tableName(r.table_id) ?? "";
    return (
      r.guest_name.toLocaleLowerCase("tr").includes(aramaQ)
      || (r.guest_phone ?? "").toLocaleLowerCase("tr").includes(aramaQ)
      || masaAdi.toLocaleLowerCase("tr").includes(aramaQ)
      || (r.note ?? "").toLocaleLowerCase("tr").includes(aramaQ)
    );
  });
  const donemDoluPax = (iso: string) => donemPax(donem(iso, aksamBaslangic));

  // Akşam saati geldiyse ve akşam rezervasyonu olan masada hâlâ biri oturuyorsa uyarı.
  const suAnSaat = bugunMu ? saatIstanbul(new Date().toISOString()) : -1;
  const masaHalaDolu = (r: Rez) =>
    bugunMu && suAnSaat >= aksamBaslangic && donem(r.reserved_at, aksamBaslangic) === "aksam"
    && !!r.table_id && (r.status === "bekleniyor" || r.status === "geldi")
    && tables.find((t) => t.id === r.table_id)?.status === "occupied";

  // Oturum çözülene kadar (ya da girişe yönlendirilene kadar) tek başına yükleniyor ekranı.
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
    <div style={{ background: "var(--canvas)", padding: "20px 24px", height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      {confirmDialog}

      {/* Kendi başlığı — AIOS kabuğu (sol menü) bu programda yok. RZV rozeti + işletme adı
          aynı satırda (Gökhan, 2026-08-04: "rzv yaz yanında da işletme adı yazsın") —
          eskiden işletme adı "Rezervasyon" başlığının altında 13px soluk gri bir ek gibi
          duruyordu ("küçük ve soluk olması normal mi" — değildi). */}
      <div style={{ marginBottom: 14, flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--brand)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 10.5, letterSpacing: 0.3, flexShrink: 0 }}>
          RZV
        </div>
        {/* Şube değiştirici — SADECE çok şubeli hesapta görünür (tek şubeliyse liste zaten
            1 elemanlı, buton anlamsız olurdu). */}
        {subeler.length > 1 ? (
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setSubeSecimiAcik((v) => !v)}
              style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}
            >
              {restaurantName || "Rezerve"}
              <ChevronDown size={18} style={{ transform: subeSecimiAcik ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }} />
            </button>
            {subeSecimiAcik && (
              <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 6, minWidth: 200, border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--card)", overflow: "hidden", zIndex: 20, boxShadow: "0 4px 14px rgba(0,0,0,0.1)" }}>
                {subeler.map((s) => (
                  <button
                    key={s.id} onClick={() => subeDegistir(s.id)}
                    style={{
                      all: "unset", cursor: "pointer", display: "block", width: "100%", padding: "8px 12px", boxSizing: "border-box",
                      fontSize: 13, color: s.id === restaurantId ? "var(--brand-strong)" : "var(--ink)",
                      background: s.id === restaurantId ? "var(--recede)" : "transparent",
                    }}
                  >
                    {s.name}{(s.il || s.ilce) && <span style={{ color: "var(--muted-2)", fontSize: 11 }}> · {[s.il, s.ilce].filter(Boolean).join(" / ")}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>
            {restaurantName || "Rezerve"}
          </div>
        )}
        <div style={{ flex: 1 }} />
        {/* Salon — görsel masa planı, Ayarlar dişlisinin yanında (Gökhan, 2026-08-04). */}
        <Link href="/rezervasyon/salon" aria-label="Salon" title="Salon" style={{ ...navBtn, marginTop: 2, textDecoration: "none" }}>
          <LayoutGrid size={19} />
        </Link>
        <Link href="/rezervasyon/ayarlar" aria-label="Ayarlar" title="Ayarlar" style={{ ...navBtn, marginTop: 2, textDecoration: "none" }}>
          <Settings size={19} />
        </Link>
        <button onClick={cikisYap} aria-label="Çıkış yap" title="Çıkış yap" style={{ ...navBtn, marginTop: 2 }}>
          <LogOut size={19} />
        </button>
      </div>

      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10, flexShrink: 0 }}>{err}</div>}
      {capacityNotice && (
        <div style={{ fontSize: 12.5, color: "var(--gold-text)", background: "var(--recede)", border: "1px solid var(--gold)", borderRadius: 10, padding: "8px 12px", marginBottom: 10, flexShrink: 0 }}>
          {capacityNotice}
        </div>
      )}

      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 12, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {!bugunMu && <button onClick={() => gunDegistir(bugunIstanbul())} style={btnGhost}>Bugün</button>}
            <button onClick={() => gun && gunDegistir(gunKaydir(gun, -1))} aria-label="Önceki gün" style={navBtn}><ChevronLeft size={17} /></button>
            <DatePicker value={gun} onChange={gunDegistir} />
            <button onClick={() => gun && gunDegistir(gunKaydir(gun, 1))} aria-label="Sonraki gün" style={navBtn}><ChevronRight size={17} /></button>
          </div>
          <div style={{ position: "relative", width: 200 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: inkSoft, pointerEvents: "none" }} />
            <input
              value={arama} onChange={(e) => setArama(e.target.value)}
              placeholder="İsim, telefon, masa, not ara…"
              style={{ ...inp, width: "100%", paddingLeft: 30, paddingRight: arama ? 26 : 10, boxSizing: "border-box" }}
            />
            {arama && (
              <button onClick={() => setArama("")} aria-label="Aramayı temizle" style={{ all: "unset", cursor: "pointer", position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: inkSoft, display: "flex" }}>
                <X size={13} />
              </button>
            )}
          </div>
          <button onClick={openNewRes} style={btnPrimary}><Plus size={14} /> Yeni rezervasyon</button>
          <button onClick={() => { setWName(""); setWPhone(""); setWParty("2"); setWNote(""); setErr(null); setWalkInOpen(true); }} style={btnPrimary}><Plus size={14} /> Rezervasyon dışı</button>
          <select value={filtre} onChange={(e) => setFiltre(e.target.value)} style={{ ...inp, marginLeft: "auto", width: 190 }}>
            <option value="tumu">Tümü</option>
            <option value="rezervasyon">Rezervasyonlar</option>
            <option value="kapi">Rezervasyonsuz gelenler</option>
            <option value="online">Online gelenler</option>
            <option value="yedek">Bekleyenler (Yedek)</option>
            <option value="gelmedi">Gelmediler</option>
            <option value="iptal">İptaller</option>
          </select>
        </div>

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
          <HeaderCell width={34} align="center">SNO</HeaderCell>
          <HeaderSep />
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
          {filtreliRows.map((r, i) => {
            const info = DURUM_INFO[r.status] ?? DURUM_INFO.bekleniyor;
            const canli = r.status === "geldi";
            const aktif = r.status === "bekleniyor" || r.status === "geldi";
            const yedek = yedekIds.has(r.id);
            const doluUyari = masaHalaDolu(r);
            // Masa ata — önce kişi sayısına uygun (yeterli kapasiteli, en yakından) masalar,
            // "Diğerleri" ile geri kalanı da erişilebilir (Gökhan: "kişi sayısına uygun masalar
            // listelensin, listenin başında diğerleri seçeneği olsun"). Boş masalara ek olarak
            // BU rezervasyona zaten bağlı masalar da seçilebilir listede kalır (yeniden
            // düzenlerken kaybolmasınlar) — masa birleştirme burada, birden fazla seçilebilir.
            const buRezMasalari = rezMasalar[r.id] ?? [];
            const secilebilirMasalar = tables.filter((t) => t.status === "empty" || buRezMasalari.includes(t.id));
            const uygunMasalar = secilebilirMasalar.filter((t) => t.seat_count >= r.party_size).sort((a, b) => a.seat_count - b.seat_count);
            const digerMasalar = secilebilirMasalar.filter((t) => t.seat_count < r.party_size).sort((a, b) => b.seat_count - a.seat_count);
            const masaAdi = buRezMasalari.map((id) => tableName(id)).filter(Boolean).join(" + ") || tableName(r.table_id);
            const seciliKisi = masaSecimi.reduce((s, id) => s + (tables.find((t) => t.id === id)?.seat_count ?? 0), 0);
            const masaToggle = (id: string) => setMasaSecimi((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
            return (
              <ListRow key={r.id} bg={info.bg} muted={r.status === "gelmedi" || r.status === "iptal"}>
                <Cell width={34} align="center">
                  <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink)" }}>{i + 1}</span>
                </Cell>
                <RowSep />
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
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <EditableText
                      value={r.guest_name}
                      onSave={(next) => updateField(r, { guest_name: toTitleTr(next) })}
                      style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    />
                    {r.guest_phone && (
                      <button onClick={() => setKartFor(r)} title="Kişi kartı" aria-label="Kişi kartı" style={{ all: "unset", cursor: "pointer", display: "inline-flex", color: inkSoft, flexShrink: 0 }}>
                        <User size={12} />
                      </button>
                    )}
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
                  {assigningId === r.id ? (
                    <div style={{ position: "relative", display: "inline-block" }}>
                      <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => { setAssigningId(null); setMasaDigerAcik(false); setMasaSecimi([]); }} />
                      <button style={btnGhostRow}>Masa seç…</button>
                      <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", marginTop: 4, zIndex: 61, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "0 8px 24px rgba(30,25,15,0.18)", padding: 6, minWidth: 190, maxHeight: 280, overflowY: "auto", textAlign: "left" }}>
                        {/* Masa birleştirme (Gökhan: "on kişi kapasite dolana kadar masa
                            seçecek, mesela yan yana 3 masayı birleştirdi") — birden fazla
                            masa işaretlenip "Ata" ile onaylanır, tek masalık rezervasyon da
                            aynı yoldan tek seçimle gider. */}
                        {uygunMasalar.length === 0 && digerMasalar.length === 0 && <div style={{ fontSize: 11.5, color: inkSoft, padding: "6px 8px" }}>Boş masa yok.</div>}
                        {uygunMasalar.map((t) => (
                          <button key={t.id} onClick={() => masaToggle(t.id)} style={{ ...masaSecBtn, display: "flex", alignItems: "center", gap: 6, background: masaSecimi.includes(t.id) ? "var(--recede)" : undefined }}>
                            <span className="tnum" style={{ width: 14, color: masaSecimi.includes(t.id) ? "var(--brand-strong)" : inkSoft }}>{masaSecimi.includes(t.id) ? "✓" : ""}</span>
                            {t.name} <span className="tnum" style={{ color: inkSoft }}>({t.seat_count} pax)</span>
                          </button>
                        ))}
                        {digerMasalar.length > 0 && (
                          masaDigerAcik ? (
                            <>
                              <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: "uppercase", padding: "6px 8px 2px", borderTop: uygunMasalar.length ? "1px solid var(--line)" : undefined, marginTop: uygunMasalar.length ? 4 : 0 }}>Diğerleri</div>
                              {digerMasalar.map((t) => (
                                <button key={t.id} onClick={() => masaToggle(t.id)} style={{ ...masaSecBtn, display: "flex", alignItems: "center", gap: 6, background: masaSecimi.includes(t.id) ? "var(--recede)" : undefined }}>
                                  <span className="tnum" style={{ width: 14, color: masaSecimi.includes(t.id) ? "var(--brand-strong)" : inkSoft }}>{masaSecimi.includes(t.id) ? "✓" : ""}</span>
                                  {t.name} <span className="tnum" style={{ color: inkSoft }}>({t.seat_count} pax)</span>
                                </button>
                              ))}
                            </>
                          ) : (
                            <button
                              onClick={() => setMasaDigerAcik(true)}
                              style={{ ...masaSecBtn, color: "var(--brand)", borderTop: uygunMasalar.length ? "1px solid var(--line)" : undefined, marginTop: uygunMasalar.length ? 4 : 0 }}
                            >
                              Diğerleri (<span className="tnum">{digerMasalar.length}</span>)
                            </button>
                          )
                        )}
                        <div style={{ borderTop: "1px solid var(--line)", marginTop: 4, padding: "8px 8px 2px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <span className="tnum" style={{ fontSize: 11, color: seciliKisi >= r.party_size ? "var(--brand-strong)" : inkSoft }}>
                            {masaSecimi.length} masa · {seciliKisi}/{r.party_size} kişi{seciliKisi >= r.party_size ? " ✓" : ""}
                          </span>
                          <button
                            onClick={() => masaAta(r, masaSecimi)}
                            disabled={masaSecimi.length === 0}
                            style={{ border: "none", borderRadius: 8, padding: "5px 12px", background: "var(--brand-strong)", color: "#fff", fontSize: 12, cursor: "pointer", opacity: masaSecimi.length === 0 ? 0.5 : 1 }}
                          >
                            Ata
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : masaAdi ? (
                    bugunMu && aktif ? (
                      <button onClick={() => { setMasaDigerAcik(false); setMasaSecimi(buRezMasalari); setAssigningId(r.id); }} style={{ all: "unset", cursor: "pointer", fontSize: 12.5, color: "var(--ink)", textDecoration: "underline", textDecorationColor: "var(--line-2)" }}>{masaAdi}</button>
                    ) : (
                      <span style={{ fontSize: 12.5, color: "var(--ink)" }}>{masaAdi}</span>
                    )
                  ) : bugunMu && aktif ? (
                    <button onClick={() => { setMasaDigerAcik(false); setMasaSecimi([]); setAssigningId(r.id); }} style={btnGhostRow}>Masa ata</button>
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
                  {bugunMu && r.status === "bekleniyor" && (
                    <>
                      <button onClick={() => r.table_id ? oturtDirekt(r) : setSeatingFor(r)} disabled={!r.table_id && bosMasalar.length === 0} style={{ ...btnSmallRow, opacity: !r.table_id && bosMasalar.length === 0 ? 0.5 : 1 }}>Geldi</button>
                      <button onClick={() => durumDegistir(r, "gelmedi")} style={btnGhostRow}>Gelmedi</button>
                    </>
                  )}
                  {bugunMu && r.status === "geldi" && (
                    <button onClick={() => r.table_id ? oturtDirekt(r) : setSeatingFor(r)} disabled={!r.table_id && bosMasalar.length === 0} style={{ ...btnSmallRow, opacity: !r.table_id && bosMasalar.length === 0 ? 0.5 : 1 }}>Oturdu</button>
                  )}
                  {/* Oturan misafirin masasını boşaltan tek adım — bu programın akışını kapatır. */}
                  {r.status === "oturdu" && (
                    <button onClick={() => kalkti(r)} disabled={busy} style={btnSmallRow}>Kalktı</button>
                  )}
                  {aktif ? (
                    <button onClick={() => iptalEt(r)} style={btnGhostRow}>İptal</button>
                  ) : r.status !== "oturdu" ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span title={r.status === "iptal" ? r.cancel_reason ?? undefined : undefined} style={{ fontSize: 11, fontWeight: 700, color: info.color }}>{info.label}</span>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: SOURCE_INFO[r.source]?.color ?? inkSoft }}>
                        ({SOURCE_INFO[r.source]?.label ?? r.source})
                      </span>
                    </span>
                  ) : null}
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
              <KisiKartiOzet kart={fKart} phone={fPhone} restaurantId={restaurantId} onChanged={() => setFKartRefresh((v) => v + 1)} />
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
                <span style={{ fontSize: 11.5, color: "var(--danger)" }}>KVKK aydınlatma metni girilmemiş.</span>
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
              <KisiKartiOzet kart={wKart} phone={wPhone} restaurantId={restaurantId} onChanged={() => setWKartRefresh((v) => v + 1)} />
              <input value={wNote} onChange={(e) => setWNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && dogrudanGir()} placeholder="Özel not (opsiyonel)" style={inp} />
            </div>

            <div style={{ marginTop: 10 }}>
              {kvkkNotice.trim() ? (
                <button onClick={() => setKvkkAcik((v) => !v)} style={{ all: "unset", cursor: "pointer", fontSize: 11.5, color: "var(--brand)" }}>
                  {kvkkAcik ? "KVKK aydınlatma metnini gizle" : "KVKK aydınlatma metni"}
                </button>
              ) : (
                <span style={{ fontSize: 11.5, color: "var(--danger)" }}>KVKK aydınlatma metni girilmemiş.</span>
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

      {/* KİŞİ KARTI PENCERESİ — mevcut bir rezervasyondaki misafir ikonuna tıklayınca açılır. */}
      {kartFor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55 }} onClick={() => setKartFor(null)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, minWidth: 320, maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 2 }}>{kartFor.guest_name}</div>
            <div className="tnum" style={{ fontSize: 12, color: inkSoft, marginBottom: 12 }}>{kartFor.guest_phone}</div>
            {kartFor.guest_phone && (
              <KisiKartiOzet kart={kartForKart} phone={kartFor.guest_phone} restaurantId={restaurantId} onChanged={() => setKartRefresh((v) => v + 1)} />
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
              <button onClick={() => setKartFor(null)} style={btnSecondary}>Kapat</button>
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

      {/* İPTAL KATMANI — sebep opsiyonel, boş bırakılabilir. */}
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
const btnSmallRow: React.CSSProperties = { ...btnSmall, padding: "4px 14px" };
const btnGhostRow: React.CSSProperties = { ...btnGhost, padding: "4px 12px" };
const inkSoft = "#5c5c58";
const masaSecBtn: React.CSSProperties = { all: "unset", cursor: "pointer", display: "block", width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 8, fontSize: 12.5, color: "var(--ink)" };
const navBtn: React.CSSProperties = { all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: 6, borderRadius: 8, color: "var(--muted)" };
