"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getMyReservationRestaurantId, getMyReservationRestaurants, setAktifSube, type ReservationBranch } from "@/lib/supabase/reservationAccount";
import { toTitleTr, ilkHarfBuyukTr } from "@/lib/text";
import { istenenSalon } from "./notKurallari";
import {
  havuzuTuket, havuzDokumu,
  salonuPlanla, birlesikYerlesim, type PlanMasa, type MisafirBagi,
} from "./masaPlan";
import { govdeCizim, type Shape as MasaSekli } from "./masaOlcu";
import { Plus, ChevronLeft, ChevronRight, ChevronDown, LayoutGrid, Settings, LogOut, User, Search, X, Lock, Unlock, BarChart3, Star, DoorOpen } from "lucide-react";
import { useConfirm } from "../components/useConfirm";
import { RzvRozet } from "../components/RezervasyonMenu";
import DatePicker from "../components/DatePicker";
import EditableText from "../components/EditableText";
import { ListHeader, HeaderCell, ListRow, RowSep, Cell, ActionsCell } from "../components/ListRow";
import RezervasyonAltNav, { ALT_NAV_YUKSEKLIK } from "../components/RezervasyonAltNav";

// REZERVASYON — kendi başına çalışan ayrı program (Gökhan onayı, 2026-08-04).
//
// Eskiden bu ekran AIOS'un içindeydi (/karsilama), sol menüden açılıyordu ve misafir
// oturunca adisyon açıyordu. Karar değişti: rezervasyon ayrı satılabilecek bir ürün, AIOS
// ile işi yok. Bu yüzden:
//   - AIOS sol menüsü yok. Kendi girişi var (/rezervasyon/giris) — AIOS'un profiles/
//     bootstrap_restaurant_account'ından tamamen ayrı bir hesap sistemi (restaurants.
//     owner_user_id). Oturum yoksa buraya değil /rezervasyon/giris'e düşülür.
//   - Hesap/adisyon yok. Akış kendi içinde kapanır: bekleniyor -> geldi -> oturdu -> tamamlandı
//   - Masayı bu program yönetir: oturunca dolu, ziyaret bitince boş (bkz. seat_reservation ve
//     end_reservation_visit — artık orders tablosuna hiç dokunmuyorlar).
//
// "bekleniyor" = misafir henüz gelmedi. "geldi" = kapıda, masa bekliyor. "oturdu" = masada.
// "tamamlandı" = ziyaret bitti, masa boşaldı. Kapıdan rezervasyonsuz gelen de aynı listeye,
// aynı zincire girer.

type Rez = {
  id: string; guest_name: string; guest_phone: string | null; party_size: number;
  reserved_at: string; status: string; note: string | null; table_id: string | null;
  arrived_at: string | null; created_at: string; cancel_reason: string | null; source: string;
  // Masaya oturduğu an — listede "ne zamandır oturuyor" bundan hesaplanıyor
  // (Gökhan, 2026-08-18).
  seated_at: string | null;
  // Masası kesinleşmiş, müşteriye söz verilmiş rezervasyon — otomatik yerleşme buna dokunmaz.
  masa_kilit: boolean;
  // İsim aramasından seçilen müşterinin kalıcı kimliği (Gökhan: "form o müşterinin ID'siyle
  // devam etsin, sadece isim/telefon metniyle eşleşmesin") — aynı isimli kişiler karışmaz.
  kisi_karti_id: string | null;
  // Kişi sayısının yanında kadın/erkek dağılımı — opsiyonel, sadece yeni rezervasyonda sorulur.
  kadin_sayisi: number | null; erkek_sayisi: number | null;
  // Masanın ödediği tutar — İSTEĞE BAĞLI, iş bittikten sonra elle girilir (Gökhan,
  // 2026-08-10: "sonuçta kartta görmek ister, hangi müşteri harcıyor"). Boş = girilmemiş.
  hesap_tutari: number | null;
  // Kapıda gerçekten gelen kişi sayısı — rezervasyondaki sayıdan farklı olabilir (Gökhan,
  // 2026-08-12: "4 kişilik rezervasyon ama 5 kişi geldi"). Boşsa party_size kadar sayılır.
  gelen_kisi: number | null;
  // Yedek rezervasyon (Gökhan, 2026-08-11: "normal rezervasyon gibi girilsin yedek işareti
  // taşısın") — masa tutmaz, kapasiteye sayılmaz. Bir rezervasyon gelmedi/iptal olunca
  // yedekteki uygun grup onun yerine geçer.
  yedek: boolean;
  // Ev sahibinin misafirleri için açtırdığı ikinci masa (Gökhan, 2026-08-15).
  misafir_masasi: boolean;
  misafir_yakin: boolean | null;
  // Misafirin online formda seçtiği salon — söz değil, "mümkünse" (Gökhan, 2026-08-15).
  tercih_alan_id: string | null;
  // Rezervasyonu giren kişi. Garson/PR/şef/mutfak yalnızca kendi girdiği kayıtta kişi
  // kartını açabiliyor (Gökhan, 2026-08-17) — ölçüt PERSONEL kaydı, oturum değil: aynı
  // hesapta birden fazla personel olabiliyor.
  created_by: string | null;
  alan_hesap_id: string | null;
  // Fix menü mü alakart mı — mutfak şefi listede masa yerine bunu görüyor (Gökhan,
  // 2026-08-17). Sadece ayarlarda fix menü açıkken sorulur.
  servis_tipi: string | null;
  fix_menu_id: string | null;
  fix_kisi: number | null;
  // KAPIDA SIRA BEKLEYEN (Gökhan, 2026-08-18) — kapı girişinde yer yoksa misafir geri
  // çevrilmiyor, sıraya alınıyor. Bekleyen masa tutmaz, kapasiteye girmez; oturunca
  // bekleme kalkar ve kaç dakika beklediği kayda geçer.
  bekleme: boolean;
  bekleme_baslangic: string | null;
  bekleme_dakika: number | null;
  // TEYİT (Gökhan, 2026-08-18): yok | bekliyor (mesaj gitti) | geliyor | iptal |
  // sayildi (teyit saatinden sonra alındı, teyitli sayılıyor).
  teyit_durumu: string;
  teyit_zamani: string | null;
};
// position_x/y salon planındaki yeri — planlayıcı "kendi sırasındaki masa"yı bundan bulur.
// shape/rotated gövde genişliği için (birleşen masalar plana bitişik yazılırken lazım),
// normal_x/y ise masanın asıl yeri — gün kapanınca oraya geri konuyor.
type TableRow = {
  id: string; name: string; seat_count: number; status: string;
  position_x: number | null; position_y: number | null;
  shape: MasaSekli; rotated: boolean; normal_x: number | null; normal_y: number | null;
  area_id: string | null;
};

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

// Satır kartının arka planı — açık kahve tonlarının dereceli ailesi (--tan-100..500).
// Sıra "ne kadar bitmiş" mantığında: aktif olanlar en açık, iptal en koyu.
// "tamamlandı" masası boşalmış ama normal biten bir ziyaret — oturdu ile gelmedi arasında.
const DURUM_INFO: Record<string, { label: string; color: string; bg: string }> = {
  bekleniyor: { label: "Bekleniyor", color: "var(--ink)", bg: "var(--tan-100)" },
  geldi: { label: "Geldi", color: "var(--danger)", bg: "var(--tan-100)" },
  oturdu: { label: "Oturdu", color: "var(--brand)", bg: "var(--tan-300)" },
  tamamlandi: { label: "Tamamlandı", color: "var(--ink)", bg: "var(--tan-200)" },
  gelmedi: { label: "Gelmedi", color: "var(--gold-text)", bg: "var(--tan-400)" },
  iptal: { label: "İptal", color: "var(--ink)", bg: "var(--tan-500)" },
};
// Kayıt nereden geldi — istatistik için kayıt anında bir kere yazılır, sonra değişmez.
const SOURCE_INFO: Record<string, { label: string; color: string }> = {
  rezervasyon: { label: "RVZ", color: "var(--brand)" },
  kapi: { label: "Kapı", color: "var(--gold-text)" },
  online: { label: "Online", color: "var(--ink-green)" },
};

// Satır içi düzenleme artık çift tıklamayla değil, masa seçteki gibi küçük bir pencerede
// (Gökhan: "rezervasyon ismi dışındaki her bilgiyi masa seçteki gibi pencereye alalım").
// Misafir ismi bunun dışında — o yerinde düzenlenmeye devam ediyor.
type DuzenleAlan = "saat" | "telefon" | "pax" | "not";
// Yeni rezervasyon formundaki "Yedek" düğmesi — masa tutmayan, sıra bekleyen rezervasyon
// (Gökhan, 2026-08-11). Hap buton, PAGE_STANDARDS madde 7.
function YedekDugmesi({ acik, onTikla, ipucu }: { acik: boolean; onTikla: () => void; ipucu?: string }) {
  return (
    <button
      onClick={onTikla}
      title={ipucu ? `Yedek: masa tutmaz, sıra bekler. Yer boşalınca yerleştirilir.
${ipucu}` : "Yedek: masa tutmaz, sıra bekler. Yer boşalınca yerleştirilir."}
      style={{
        all: "unset", cursor: "pointer", flexShrink: 0, padding: "8px 13px", borderRadius: 980,
        border: `1px solid ${acik ? "var(--brand)" : "var(--line-2)"}`,
        background: acik ? "var(--recede)" : "var(--card)",
        color: acik ? "var(--brand)" : "var(--muted)", fontSize: 12.5, fontWeight: 600,
      }}
    >
      Yedek
    </button>
  );
}

const DUZENLE_BASLIK: Record<DuzenleAlan, string> = { saat: "Saat", telefon: "Telefon", pax: "Kişi sayısı", not: "Not" };
const DUZENLE_IPUCU: Record<DuzenleAlan, string> = { saat: "19:30", telefon: "05xx…", pax: "4", not: "Not…" };
// Açılır pencerelerin ekran konumu — tıklanan düğmenin ölçüsünden hesaplanır (menuKonum).
type Konum = { left: number; top: number; width: number; height: number };

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
type KisiZiyaret = { reserved_at: string; party_size: number; note: string | null; status: string; masa: string | null; cancel_reason?: string | null; hesap_tutari?: number | null };
type KisiKarti = {
  kartId: string | null; isim: string | null; kartNotu: string | null;
  dogumGunu: string | null; vip: boolean; yemekTercihi: string | null; ickiTercihi: string | null;
  ziyaretSayisi: number; gelmediSayisi: number; iptalSayisi: number; toplamKayit: number;
  ilkKayitTarihi: string | null; ilkZiyaret: string | null; sonZiyaret: string | null;
  sonRezervasyonDurumu: string | null;
  ortalamaKisi: number | null; enSikGunNo: number | null; enSikSaat: number | null; enSikMasa: string | null;
  ortalamaKalisDk: number | null; ortalamaSiklikGun: number | null;
  kanalDagilimi: Record<string, number>;
  tumGecmis: KisiZiyaret[];
  baglantilar: { id: string; telefon: string; aciklama: string | null }[];
  // Yapay zekânın yazdığı bilgilendirme (Gökhan, 2026-08-15). aiOzetKayit, yazı
  // üretildiği andaki toplam kayıt sayısı — bugünkü sayıdan farklıysa kişi yeni bir
  // ziyaret yapmış demektir, yazı tazelenir.
  aiOzet: string | null;
  aiOzetKayit: number | null;
  // Bu numarayla hangi isimlerle gelinmiş (Gökhan, 2026-08-15). Numara yine kimlik, kart
  // bölünmüyor; birden fazla isim varsa kartta yazıyor, kararı personel veriyor.
  kullanilanIsimler: string[];
} | null;
const GUN_ADI = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
const KANAL_ADI: Record<string, string> = { rezervasyon: "telefonla", kapi: "kapıdan", online: "online" };
// İletişim kanalı — İstatistikler'deki Kanallar sekmesi için (Gökhan, 2026-08-07: "WhatsApp,
// Instagram, Google gibi ayrımı yapalım"). Kapıdan/online gelenlerde otomatik dolar (soru
// sorulmaz), sadece personel telefonla/elle girerken sorulur.
const ILETISIM_KANALI_ADI: Record<string, string> = {
  telefon: "Telefon", whatsapp: "WhatsApp", instagram: "Instagram", google: "Google",
  web_sitesi: "Web sitesi", yuz_yuze: "Yüz yüze", online: "Online", diger: "Diğer",
};
const ILETISIM_KANALI_SECENEKLERI = ["telefon", "whatsapp", "instagram", "google", "diger"];
const DURUM_KISA: Record<string, string> = { bekleniyor: "Bekliyor", geldi: "Geldi", oturdu: "Oturuyor", tamamlandi: "Tamamlandı", gelmedi: "Gelmedi", iptal: "İptal" };
const DURUM_RENK: Record<string, string> = { bekleniyor: "var(--muted)", geldi: "var(--info)", oturdu: "var(--brand)", tamamlandi: "var(--brand)", gelmedi: "var(--danger)", iptal: "var(--danger)" };
// Yıl yok — kişi kartındaki bu tarihler hep yakın geçmiş, ay+gün yeterli (Gökhan,
// 2026-08-08: "bu değişken bilgilerde yıl kullanmana gerek yok" — dar mobil kartta
// yılın alt satıra taşmasına da bu şekilde gerek kalmıyor).
const tarihKisa = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "short" }).format(new Date(iso));
// "3 gün", "2 ay" gibi — kart yazılarında sayı yığını yerine okunur süre.
const sureYazisi = (gun: number) => {
  if (gun < 30) return `${gun} gün`;
  if (gun < 365) return `${Math.round(gun / 30)} ay`;
  return `${Math.round((gun / 365) * 10) / 10} yıl`;
};
// TELEFONDA numaraya dokununca arama ekranı açılır (Gökhan, 2026-08-15).
const telLinki = (tel: string) => `tel:${tel.trim().replace(/^\+/, "00").replace(/\D/g, "")}`;
// BİLGİSAYARDA arama yapacak uygulama yok, tarayıcı "hangi uygulamayla açayım" diye
// soruyordu — orada numara WhatsApp'ta açılıyor (Gökhan: "pc'de tanımlı whatsapp
// açılabilir"). Numara ülke koduyla yazılır: 0532… → 90532…
const waNumarasi = (tel: string) => {
  const d = tel.trim().replace(/^\+/, "").replace(/\D/g, "");
  if (d.startsWith("90")) return d;
  if (d.startsWith("0")) return `90${d.slice(1)}`;
  return d.length === 10 ? `90${d}` : d;
};
const waLinki = (tel: string) => `https://wa.me/${waNumarasi(tel)}`;
// Hesap tutarı yazısı — "12.500 TL". Kuruş gösterilmiyor, listede yer kaplıyor.
const tutarYazisi = (tl: number) => `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(tl)} TL`;
function useKisiKarti(phone: string, restaurantId: string | null, refreshKey: number, kisiKartiId?: string | null): KisiKarti {
  const [kart, setKart] = useState<KisiKarti>(null);
  const digits = phone.replace(/\D/g, "");
  // ID varsa (isim aramasından seçilmiş, kesinleşmiş müşteri) telefon 10 hane olmasa bile
  // arama geçerli — kimlik artık ID'de, metinde değil.
  const gecerli = !!restaurantId && (digits.length >= 10 || !!kisiKartiId);

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
      supabase.rpc("kisi_karti_getir", { p_restaurant: restaurantId, p_phone: phone, p_kisi_karti_id: kisiKartiId ?? null }).then(({ data }) => {
        const row = (data as {
          kart_id: string | null; isim: string | null; kart_notu: string | null;
          dogum_gunu: string | null; vip: boolean; yemek_tercihi: string | null; icki_tercihi: string | null;
          ziyaret_sayisi: number; gelmedi_sayisi: number; iptal_sayisi: number; toplam_kayit: number;
          ilk_kayit_tarihi: string | null; ilk_ziyaret: string | null; son_ziyaret: string | null;
          son_rezervasyon_durumu: string | null;
          ortalama_kisi: number | null;
          en_sik_gun_no: number | null; en_sik_saat: number | null; en_sik_masa: string | null;
          ortalama_kalis_dk: number | null; ortalama_siklik_gun: number | null;
          kanal_dagilimi: Record<string, number> | null; tum_gecmis: KisiZiyaret[] | null;
          baglantilar: { id: string; telefon: string; aciklama: string | null }[];
          ai_ozet: string | null; ai_ozet_kayit: number | null;
          kullanilan_isimler: string[] | null;
        }[] | null)?.[0];
        if (!row) { setKart(null); return; }
        setKart({
          kartId: row.kart_id, isim: row.isim, kartNotu: row.kart_notu,
          dogumGunu: row.dogum_gunu, vip: row.vip, yemekTercihi: row.yemek_tercihi, ickiTercihi: row.icki_tercihi,
          ziyaretSayisi: row.ziyaret_sayisi, gelmediSayisi: row.gelmedi_sayisi, iptalSayisi: row.iptal_sayisi,
          toplamKayit: row.toplam_kayit, ilkKayitTarihi: row.ilk_kayit_tarihi, ilkZiyaret: row.ilk_ziyaret, sonZiyaret: row.son_ziyaret,
          sonRezervasyonDurumu: row.son_rezervasyon_durumu,
          ortalamaKisi: row.ortalama_kisi === null ? null : Number(row.ortalama_kisi),
          enSikGunNo: row.en_sik_gun_no, enSikSaat: row.en_sik_saat, enSikMasa: row.en_sik_masa,
          ortalamaKalisDk: row.ortalama_kalis_dk, ortalamaSiklikGun: row.ortalama_siklik_gun,
          kanalDagilimi: row.kanal_dagilimi ?? {}, tumGecmis: row.tum_gecmis ?? [],
          baglantilar: row.baglantilar ?? [],
          aiOzet: row.ai_ozet, aiOzetKayit: row.ai_ozet_kayit,
          kullanilanIsimler: row.kullanilan_isimler ?? [],
        });
      });
    }, 500);
    return () => clearTimeout(id);
  }, [phone, restaurantId, refreshKey, gecerli, kisiKartiId]);
  return kart;
}

type IsimKayit = { reserved_at: string; party_size: number; status: string; guest_phone: string | null; note: string | null };
type IsimGecmisi = {
  bulunanTelefon: string | null;
  ziyaretSayisi: number; gelmediSayisi: number; iptalSayisi: number; toplamKayit: number;
  sonZiyaret: string | null; ortalamaKisi: number | null; enSikMasa: string | null;
  sonKayitlar: IsimKayit[];
} | null;

// Telefonu olmayan rezervasyonlar için İSİMLE geçmiş (Gökhan: "telefon numarası yazılmayan
// rezervasyonlara kişi kartı açılmıyor, rezervasyon alınan herkese kişi kartı açılacak").
// Aynı hook, yeni rezervasyon formunda isim yazılırken de kullanılıyor (Gökhan: "Hülya Avşar
// yazarken daha önce o isme rezervasyon varsa çıkacak, kullanıcı ona göre konuşacak").
function useIsimGecmisi(isim: string, restaurantId: string | null, refreshKey: number): IsimGecmisi {
  const [gecmis, setGecmis] = useState<IsimGecmisi>(null);
  const gecerli = !!restaurantId && isim.trim().length >= 3;

  const [oncekiGecerli, setOncekiGecerli] = useState(gecerli);
  if (gecerli !== oncekiGecerli) {
    setOncekiGecerli(gecerli);
    if (!gecerli) setGecmis(null);
  }

  useEffect(() => {
    if (!gecerli || !restaurantId) return;
    const id = setTimeout(() => {
      supabase.rpc("isim_ile_gecmis", { p_restaurant: restaurantId, p_isim: isim }).then(({ data }) => {
        const row = (data as {
          bulunan_telefon: string | null; ziyaret_sayisi: number; gelmedi_sayisi: number; iptal_sayisi: number;
          toplam_kayit: number; son_ziyaret: string | null; ortalama_kisi: number | null; en_sik_masa: string | null;
          son_kayitlar: IsimKayit[];
        }[] | null)?.[0];
        if (!row || row.toplam_kayit === 0) { setGecmis(null); return; }
        setGecmis({
          bulunanTelefon: row.bulunan_telefon, ziyaretSayisi: row.ziyaret_sayisi, gelmediSayisi: row.gelmedi_sayisi,
          iptalSayisi: row.iptal_sayisi, toplamKayit: row.toplam_kayit, sonZiyaret: row.son_ziyaret,
          ortalamaKisi: row.ortalama_kisi === null ? null : Number(row.ortalama_kisi), enSikMasa: row.en_sik_masa,
          sonKayitlar: row.son_kayitlar,
        });
      });
    }, 500);
    return () => clearTimeout(id);
  }, [isim, restaurantId, refreshKey, gecerli]);
  return gecmis;
}

// İsimle geçmiş özeti — kişi kartının aksine düzenlenemez (not eklenemez, numara bağlanamaz):
// telefon olmadığı için tutunacak sabit bir anahtar yok. Sadece "bu isimde daha önce böyle bir
// geçmiş var" bilgisini gösterir.
function IsimGecmisiOzet({ gecmis }: { gecmis: IsimGecmisi }) {
  if (!gecmis) return null;
  return (
    <div style={{ border: "1px solid var(--line-2)", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 6, background: "var(--recede)" }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--gold-text)", textTransform: "uppercase" }}>Bu isimde geçmiş bulundu</div>
      <div style={{ fontSize: 12.5, color: "var(--ink)", lineHeight: 1.6 }}>
        Toplam <span className="tnum" style={{ fontWeight: 600 }}>{gecmis.toplamKayit}</span> kayıt ·{" "}
        <span className="tnum" style={{ fontWeight: 600 }}>{gecmis.ziyaretSayisi}</span> geldi ·{" "}
        <span className="tnum" style={{ fontWeight: 600 }}>{gecmis.gelmediSayisi}</span> gelmedi ·{" "}
        <span className="tnum" style={{ fontWeight: 600 }}>{gecmis.iptalSayisi}</span> iptal
        {gecmis.ortalamaKisi !== null && <> · ortalama <span className="tnum">{gecmis.ortalamaKisi}</span> kişi</>}
        {gecmis.enSikMasa && <> · en çok {gecmis.enSikMasa} masasında</>}
      </div>
      {gecmis.bulunanTelefon && (
        <div style={{ fontSize: 12, color: inkSoft }}>Kayıtlı telefon: <span className="tnum">{gecmis.bulunanTelefon}</span></div>
      )}
      {gecmis.sonKayitlar.length > 0 && (
        <div style={{ fontSize: 11.5, color: inkSoft, lineHeight: 1.7 }}>
          {gecmis.sonKayitlar.slice(0, 3).map((k, i) => (
            <div key={i}>{tarihKisa(k.reserved_at)} · {k.party_size} kişi · {DURUM_KISA[k.status] ?? k.status}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// İSİM ARAMA (Gökhan, 2026-08-07): "isim yazıyorum, soy ismi yazmaya geçtiğimde tanımaya
// başlayacak — isimden tanıma yok, isim soy isimden tanımaya başlayacak." Tek "İsim soyisim"
// kutusu — ilk BOŞLUKTAN sonrasına bir harf yazılınca arama tetiklenir, isim kısmı henüz tek
// başına hiçbir şey aramaz.
function isimSoyadAyir(text: string): { isim: string; soyadPrefix: string } | null {
  const t = text.trimStart();
  const i = t.indexOf(" ");
  if (i < 0) return null;
  const isim = t.slice(0, i).trim();
  const soyadPrefix = t.slice(i + 1).trim();
  if (!isim || !soyadPrefix) return null;
  return { isim, soyadPrefix };
}

// "0532 ••• •• 41" — aynı isimde birden fazla aday çıkarsa hangisi olduğunu telefonla ayırt
// etmeye yeter, numarayı tam açık etmez.
const telefonMaskele = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  const norm = d.length === 10 ? `0${d}` : d;
  if (norm.length !== 11) return phone;
  return `${norm.slice(0, 4)} ••• •• ${norm.slice(9, 11)}`;
};

type MusteriAday = { kisiKartiId: string | null; isim: string; telefon: string };

// kilitli: bir aday zaten seçildiyse arama tamamen durur (Gökhan: "müşteri kesinleşir, arama
// listesi kapanır").
function useMusteriAdaylari(text: string, restaurantId: string | null, kilitli: boolean): MusteriAday[] {
  const [adaylar, setAdaylar] = useState<MusteriAday[]>([]);
  const ayrik = kilitli ? null : isimSoyadAyir(text);
  const isimKey = ayrik?.isim ?? "";
  const soyadKey = ayrik?.soyadPrefix ?? "";

  const [oncekiGecerli, setOncekiGecerli] = useState(!!ayrik);
  if (!!ayrik !== oncekiGecerli) {
    setOncekiGecerli(!!ayrik);
    if (!ayrik) setAdaylar([]);
  }

  useEffect(() => {
    if (!ayrik || !restaurantId) return;
    const id = setTimeout(() => {
      supabase.rpc("isim_soyad_ile_ara", { p_restaurant: restaurantId, p_isim: isimKey, p_soyad_prefix: soyadKey }).then(({ data }) => {
        const rows = (data as { kisi_karti_id: string | null; guest_name: string; guest_phone: string }[] | null) ?? [];
        setAdaylar(rows.map((r) => ({ kisiKartiId: r.kisi_karti_id, isim: r.guest_name, telefon: r.guest_phone })));
      });
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isimKey, soyadKey, restaurantId, !!ayrik]);
  return adaylar;
}

function MusteriAdaylariListesi({ adaylar, onSec }: { adaylar: MusteriAday[]; onSec: (a: MusteriAday) => void }) {
  if (adaylar.length === 0) return null;
  return (
    <div style={{ border: "1px solid var(--line-2)", borderRadius: 10, overflow: "hidden" }}>
      {adaylar.map((a, i) => (
        <button
          key={i} type="button" onClick={() => onSec(a)}
          style={{
            all: "unset", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
            width: "100%", boxSizing: "border-box", padding: "8px 12px", fontSize: 13,
            borderTop: i > 0 ? "1px solid var(--line)" : "none",
          }}
        >
          <span style={{ color: "var(--ink)", fontWeight: 600 }}>{a.isim}</span>
          <span className="tnum" style={{ color: inkSoft }}>{telefonMaskele(a.telefon)}</span>
        </button>
      ))}
    </div>
  );
}

// Mobil rezervasyon listesi (Gökhan, 2026-08-07: "alışveriş listesi gibi yaz, isim karşısında
// kişi sayısı"). Geldi/Gelmedi/İptal/Kalktı satırda yok — isme dokununca açılan kişi kartında
// (bkz. kartFor bloğu). Kategori işareti şimdilik sadece VIP (kisi_kartlari.vip), toplu ve
// tek sorguyla getiriliyor — her satır için ayrı ayrı sorgu atmıyor.
function MobilRezervasyonListesi({
  rows, toplamMasa, toplamKapasite, doluluk, yedekMasa, yedekPax, masaAdi, gun, bugunMu, onGunDegistir, onYeniRezervasyon, onKartAc, onKilit,
  arama, onArama, yatay, acilir, postamVar, benimMi, sadeceBenim, onSadeceBenim,
}: {
  rows: Rez[]; toplamMasa: number; toplamKapasite: number; doluluk: number;
  yedekMasa: number; yedekPax: number;
  masaAdi: (r: Rez) => string | null;
  gun: string; bugunMu: boolean; onGunDegistir: (g: string) => void;
  onYeniRezervasyon: () => void; onKartAc: (r: Rez) => void; onKilit: (r: Rez) => void;
  arama: string; onArama: (v: string) => void; yatay: boolean;
  /** Bu satır tıklanıp kartı açılabilir mi — kısıtlı rollerde sadece kendi girdikleri. */
  acilir: (r: Rez) => boolean;
  /** Bakanın postası var mı — yoksa "benim masalarım" düğmesi hiç çıkmaz. */
  postamVar: boolean;
  /** Bu rezervasyonun masası bakanın postasında mı. */
  benimMi: (r: Rez) => boolean;
  sadeceBenim: boolean;
  onSadeceBenim: (v: boolean) => void;
}) {
  const [vipSet, setVipSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    const yukle = async () => {
      const idler = [...new Set(rows.map((r) => r.kisi_karti_id).filter((id): id is string => !!id))];
      if (idler.length === 0) { setVipSet(new Set()); return; }
      const { data } = await supabase.from("kisi_kartlari").select("id, vip").in("id", idler).eq("vip", true);
      if (!active) return;
      setVipSet(new Set((data ?? []).map((k) => k.id as string)));
    };
    yukle();
    return () => { active = false; };
  }, [rows]);

  // Gün okları + tarih + "Bugün" + "Yeni rezervasyon" — dik ve yatay düzende aynı düğmeler,
  // sadece durdukları yer değişiyor. Tek yerde tanımlı, iki yere kopyalanmıyor.
  const gunKontrolleri = (
    <>
      <button onClick={() => onGunDegistir(gunKaydir(gun, -1))} aria-label="Önceki gün" style={{ ...navBtn, padding: 2 }}><ChevronLeft size={17} /></button>
      <DatePicker value={gun} onChange={onGunDegistir} style={{ padding: "8px 10px" }} />
      <button onClick={() => onGunDegistir(gunKaydir(gun, 1))} aria-label="Sonraki gün" style={{ ...navBtn, padding: 2 }}><ChevronRight size={17} /></button>
      {!bugunMu && <button onClick={() => onGunDegistir(bugunIstanbul())} style={btnGhost}>Bugün</button>}
      {/* Yatayda tarih ile "Yeni rezervasyon" arasında yaklaşık 1,5 cm boşluk (Gökhan,
          2026-08-10) — sayaçların ortasında yan yana dururken birbirine yapışmasınlar.
          Dik hâlde satır dar, aralık eskisi gibi kalıyor. */}
      <button onClick={onYeniRezervasyon} style={{ ...btnPrimary, marginLeft: yatay ? 52 : 4, padding: "9px 12px" }}><Plus size={14} /> Yeni rezervasyon</button>
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>
      {/* Başlık üstteki kimlik satırına taşındı (Gökhan, 2026-08-08: "rezervasyonlar
          yazısını rezervasyon olarak işletme isminin yanına al") — burada gün seçimi ve
          "Yeni rezervasyon" yan yana ("yeni rezervasyon ekle'nin yanına tarihi koyacaktın"). */}
      {/* Hepsi sola toplu, aralar dar — esnek boşluk (flex:1) "Yeni rezervasyon"u sağa itip
          kutunun dışına taşırıyordu (Gökhan, 2026-08-08: "yeni rezervasyon kutunun dışına
          çıkmış, okları kutuya yaklaştır, tarihi sola yaklaştır"). */}
      {/* Dik tutulduğunda gün seçimi + "Yeni rezervasyon" kendi satırında. Yan çevrilince bu
          satır hiç çizilmez; ikisi de aşağıdaki sayaç satırının ORTASINA girer (Gökhan,
          2026-08-10: "yatayda tarih ve yeni rezervasyon ekleyi de bir satır alta, RZV
          masa/masa ile kapasite/doluluğun arasına al") — kısa ekranda bir satır kazanılıyor,
          sayaçların yanındaki boşluk da dolmuş oluyor. */}
      {!yatay && (
      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, minWidth: 0 }}>
        {gunKontrolleri}
      </div>
      )}
      {/* Bilgi bölümü — oran değil düz sayı (Gökhan: "oran değil kapasite karşısında
          doluluğu yazacak"). İki blok karşılıklı: solda Rezervasyon/Masa altlı üstlü sola
          yaslı, sağda Kapasite/Doluluk altlı üstlü sağa yaslı — sağdaki rakamlar alttaki
          satırlardaki kişi sayısı rakamlarının (satır dolgusu 14px) üzerine denk gelsin
          diye aynı sağ boşluk (paddingRight:14) kullanılıyor (Gökhan, 2026-08-08). */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 13, color: inkSoft, flexShrink: 0 }}>
        {/* Masa ve pax tek satırda: "63/4 Masa" — toplam / rezervasyonlu (Gökhan,
            2026-08-17). Karşısındaki blok da aynı biçimde: kapasite / doluluk. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div>
            Masa{" "}
            <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)" }}>{toplamMasa}</span>
            <span style={{ color: inkSoft }}>/</span>
            <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)" }}>{rows.length}</span> dolu
          </div>
        </div>
        {yatay && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
            {gunKontrolleri}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, paddingRight: 14 }}>
          <div>
            Kapasite{" "}
            <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)" }}>{toplamKapasite}</span>
            <span style={{ color: inkSoft }}>/</span>
            <span className="tnum" style={{ fontWeight: 600, color: doluluk >= toplamKapasite ? "var(--gold-text)" : "var(--ink)" }}>{doluluk}</span> pax
          </div>
          {/* YEDEK — kapasiteye girmez ama sırada bekleyeni görmek lazım (Gökhan, 2026-08-15).
              Yedek yoksa satır hiç çıkmaz. */}
          {yedekMasa > 0 && (
            <div>Yedek <span className="tnum" style={{ fontWeight: 600, color: "var(--brand)" }}>{yedekMasa}</span> masa · <span className="tnum" style={{ fontWeight: 600, color: "var(--brand)" }}>{yedekPax}</span> pax</div>
          )}
        </div>
      </div>
      {/* Arama — listenin İLK SATIRININ hemen üstünde (Gökhan, 2026-08-10: "arama satırını
          listenin başına alalım, rezervasyon listesinin ilk satırının üstüne"). Masaüstündeki
          kutunun aynısı: isim, telefon, masa ve nota göre arar; arama mantığı tek yerde. */}
      <div style={{ position: "relative", flexShrink: 0 }}>
        <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: inkSoft, pointerEvents: "none" }} />
        <input
          value={arama} onChange={(e) => onArama(e.target.value)}
          placeholder="İsim, telefon, masa, not ara…"
          style={{ ...inp, width: "100%", paddingLeft: 32, paddingRight: arama ? 30 : 10, boxSizing: "border-box" }}
        />
        {arama && (
          <button onClick={() => onArama("")} aria-label="Aramayı temizle" style={{ all: "unset", cursor: "pointer", position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: inkSoft, display: "flex" }}>
            <X size={15} />
          </button>
        )}
      </div>
      {/* BENİM MASALARIM (Gökhan, 2026-08-18: "garson hem listeyi görebilsin hem de sadece
          kendi masalarını"). Liste tam kalıyor; garsonun kendi postasındaki satırlar zaten
          işaretli, bu düğme de tek dokunuşla sadece onları bırakıyor. Postası olmayan
          garsonda düğme hiç çıkmıyor — basınca boş liste kalırdı. */}
      {postamVar && (
        <div style={{ display: "flex", flexShrink: 0 }}>
          <button
            onClick={() => onSadeceBenim(!sadeceBenim)}
            style={{
              all: "unset", cursor: "pointer", flexShrink: 0, padding: "6px 12px", borderRadius: 980,
              border: `1px solid ${sadeceBenim ? "var(--brand)" : "var(--line-2)"}`,
              background: sadeceBenim ? "var(--recede)" : "var(--card)",
              color: sadeceBenim ? "var(--brand)" : "var(--muted)", fontSize: 12.5, fontWeight: 600,
            }}
          >
            Benim masalarım
          </button>
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>Bu gün için kayıt yok.</div>}
        {rows.map((r, i) => {
          const info = DURUM_INFO[r.status] ?? DURUM_INFO.bekleniyor;
          const vip = r.kisi_karti_id ? vipSet.has(r.kisi_karti_id) : false;
          const masa = masaAdi(r);
          return (
            <button
              key={r.id}
              // Kartı açamayacak rolde satır hiç tıklanmıyor (Gökhan, 2026-08-17: "hiçbir şey
              // açılmasın, tıklanamasın").
              onClick={acilir(r) ? () => onKartAc(r) : undefined}
              style={{
                all: "unset", cursor: acilir(r) ? "pointer" : "default", display: "flex", alignItems: "center", gap: 8,
                background: info.bg, borderRadius: 10, padding: "12px 14px", boxSizing: "border-box", flexShrink: 0,
                // Garsonun kendi postasındaki masa, tam listenin içinde bir bakışta ayrılsın
                // diye kenarı işaretli (Gökhan, 2026-08-18).
                borderLeft: postamVar && benimMi(r) ? "4px solid var(--brand)" : undefined,
                paddingLeft: postamVar && benimMi(r) ? 10 : undefined,
              }}
            >
              {/* Sıra numarası — masaüstü tablodaki SNO ile aynı (Gökhan, 2026-08-08). */}
              <span className="tnum" style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", flexShrink: 0, width: 16, textAlign: "right" }}>{i + 1}</span>
              {vip && <Star size={13} style={{ color: "var(--gold-text)", flexShrink: 0 }} fill="var(--gold-text)" />}
              {/* Yan çevrilince satırda yer var — masaüstündeki gibi SAAT de görünür
                  (Gökhan, 2026-08-10). Telefon denendi, gereksiz bulundu: karta dokununca
                  zaten çıkıyor. Dik hâlde satır dar, saat de çıkmaz. */}
              {yatay && <span className="tnum" style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", flexShrink: 0, whiteSpace: "nowrap" }}>{saatFmt.format(new Date(r.reserved_at))}</span>}
              <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.guest_name}</span>
              {/* MİSAFİR — bu kişinin ikinci masası, misafirleri için (Gökhan, 2026-08-15). */}
              {r.misafir_masasi && (
                <span title="Misafir masası — bu kişinin ikinci masası" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, flexShrink: 0, padding: "2px 6px", borderRadius: 980, background: "var(--recede)", color: "var(--gold-text)", border: "1px solid var(--gold)" }}>MİSAFİR</span>
              )}
              {r.yedek && (
                <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, flexShrink: 0, padding: "2px 6px", borderRadius: 980, background: "var(--recede)", color: "var(--brand)" }}>YEDEK</span>
              )}
              {/* Masa numarası — kişi sayısının yanında (Gökhan, 2026-08-08). */}
              {masa && <span style={{ fontSize: 12, color: "var(--muted)", flexShrink: 0, whiteSpace: "nowrap" }}>{masa}</span>}
              <span className="tnum" style={{ fontSize: 13.5, fontWeight: 600, color: info.color, flexShrink: 0 }}>{r.party_size} pax</span>
              {/* Masa kilidi telefonda da olmalı — masaüstü tabloda vardı, kart görünümüne
                  konmamıştı (Gökhan, 2026-08-12: "rezervasyon kilidini unuttuk"). Kart bir
                  buton olduğu için iç içe buton kullanılmıyor; dokunuş kartın açılmasını
                  engelleyip sadece kilidi çeviriyor. */}
              <span
                role="button" tabIndex={-1}
                onClick={(e) => { e.stopPropagation(); onKilit(r); }}
                title={r.masa_kilit ? "Masa kilitli — program oynatmaz" : "Masayı kilitle"}
                aria-label={r.masa_kilit ? "Masa kilidini aç" : "Masayı kilitle"}
                style={{ cursor: "pointer", display: "inline-flex", flexShrink: 0, padding: 2, color: r.masa_kilit ? "var(--brand-strong)" : "var(--line-2)" }}
              >
                {r.masa_kilit ? <Lock size={14} /> : <Unlock size={14} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Kişi kartı — 4 bölüm (Gökhan, 2026-08-07): Kimlik / Ziyaret özeti / Müşteriyi hatırlatan
// bilgiler / Rezervasyon geçmişi. "Alışveriş listesi gibi olmayacak, kullanışlı anlaşılır
// olacak" — istatistik yığını değil, düzenli etiket:değer satırları.
function KisiKartiOzet({
  kart, phone, restaurantId, simdi, onChanged, esikMudavim, esikNoShow, isMobile, sadeceGecmisVarsaGoster,
}: {
  kart: KisiKarti; phone: string; restaurantId: string | null; simdi: number; onChanged: () => void;
  esikMudavim: number; esikNoShow: number; isMobile?: boolean;
  // Yeni rezervasyon/rezervasyon dışı formunda telefon yazarken, kaydedilmemiş bir
  // rezervasyon için "ilk kez geliyor" diye boş kart açılması kafa karıştırıyordu
  // (Gökhan, 2026-08-08). Bu true olunca gerçek geçmişi olmayan biri için hiçbir şey
  // gösterilmiyor — rezervasyon alınıp listeden kart açıldığında (kartFor) bu kısıtlama
  // yok, ilk kez gelen biri için de tercih/VIP eklenebilsin diye kart yine açılıyor.
  sadeceGecmisVarsaGoster?: boolean;
}) {
  const [notTaslak, setNotTaslak] = useState(kart?.kartNotu ?? "");
  const [dogumTaslak, setDogumTaslak] = useState(kart?.dogumGunu ?? "");
  const [yemekTaslak, setYemekTaslak] = useState(kart?.yemekTercihi ?? "");
  const [ickiTaslak, setIckiTaslak] = useState(kart?.ickiTercihi ?? "");
  const [bagAcik, setBagAcik] = useState(false);
  const [bagTelefon, setBagTelefon] = useState("");
  const [bagAciklama, setBagAciklama] = useState("");
  const [acikSatir, setAcikSatir] = useState<number | null>(null);

  // kart değişince (RPC tazelenince) taslakları senkronla — effect değil render-sırası koşullu
  // setState (react-hooks/set-state-in-effect'i tetiklememek için).
  const [oncekiKart, setOncekiKart] = useState(kart);
  if (kart !== oncekiKart) {
    setOncekiKart(kart);
    setNotTaslak(kart?.kartNotu ?? "");
    setDogumTaslak(kart?.dogumGunu ?? "");
    setYemekTaslak(kart?.yemekTercihi ?? "");
    setIckiTaslak(kart?.ickiTercihi ?? "");
  }

  // YAPAY ZEKÂ BİLGİLENDİRMESİ (Gökhan, 2026-08-15). Kart açıldığında yazı yoksa ya da
  // kişi son yazıdan sonra yeni bir kayıt açtıysa bir kez üretilir, karta yazılır.
  // Bir daha çalışmaz — kart her açılışta baştan yazdırmıyor, hem hızlı hem ucuz.
  const [aiYaziliyor, setAiYaziliyor] = useState(false);
  const aiDenenen = useRef<string | null>(null);
  const kartId = kart?.kartId ?? null;
  const toplamKayit = kart?.toplamKayit ?? 0;
  const aiGuncel = !!kart?.aiOzet && kart?.aiOzetKayit === toplamKayit;
  useEffect(() => {
    if (!kartId || !restaurantId || toplamKayit === 0 || aiGuncel) return;
    // Aynı kart+kayıt sayısı için ikinci kez denemiyoruz (hata alsak bile döngüye girmesin).
    const anahtar = `${kartId}:${toplamKayit}`;
    if (aiDenenen.current === anahtar) return;
    aiDenenen.current = anahtar;
    let iptal = false;
    void (async () => {
      setAiYaziliyor(true);
      try {
        const cevap = await fetch("/api/kisi-ozeti", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            isim: kart?.isim, kartNotu: kart?.kartNotu, vip: kart?.vip,
            ziyaretSayisi: kart?.ziyaretSayisi, gelmediSayisi: kart?.gelmediSayisi,
            iptalSayisi: kart?.iptalSayisi, toplamKayit,
            ilkZiyaret: kart?.ilkZiyaret, sonZiyaret: kart?.sonZiyaret,
            gecenGun: kart?.sonZiyaret ? Math.floor((simdi - Date.parse(kart.sonZiyaret)) / 86400000) : null,
            ortalamaKisi: kart?.ortalamaKisi, ortalamaSiklikGun: kart?.ortalamaSiklikGun,
            enSikGun: kart?.enSikGunNo !== null && kart?.enSikGunNo !== undefined ? GUN_ADI[kart.enSikGunNo] : null,
            enSikSaat: kart?.enSikSaat !== null && kart?.enSikSaat !== undefined ? `${String(kart.enSikSaat).padStart(2, "0")}:00` : null,
            enSikMasa: kart?.enSikMasa,
            yemekTercihi: kart?.yemekTercihi, ickiTercihi: kart?.ickiTercihi,
            kullanilanIsimler: kart?.kullanilanIsimler ?? [],
            gecmis: kart?.tumGecmis ?? [],
          }),
        });
        if (!cevap.ok) return;
        const { metin } = (await cevap.json()) as { metin?: string };
        if (iptal || !metin) return;
        await supabase.from("kisi_kartlari")
          .update({ ai_ozet: metin, ai_ozet_kayit: toplamKayit, ai_ozet_tarih: new Date().toISOString() })
          .eq("id", kartId);
        if (!iptal) onChanged();
      } catch { /* anahtar yok ya da servis cevap vermedi — ekranda hiçbir şey gösterme */ }
      finally { if (!iptal) setAiYaziliyor(false); }
    })();
    return () => { iptal = true; };
    // kart nesnesinin tamamı değil, tetikleyen alanlar: aynı kart tazelenince tekrar sormasın.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kartId, toplamKayit, aiGuncel, restaurantId]);

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
  // DatePicker (rezervasyon formundaki aynı takvim) bir tarih seçilince doğrudan çağırır —
  // native <input type="date"> gibi ayrı bir onBlur anına gerek yok (Gökhan: "doğum günü
  // girme takvimi çok dandik, rezervasyondaki takvimi kullan").
  const dogumSec = async (v: string) => {
    setDogumTaslak(v);
    if (!restaurantId) return;
    if (v === (kart?.dogumGunu ?? "")) return;
    await supabase.from("kisi_kartlari").upsert(
      { restaurant_id: restaurantId, phone, dogum_gunu: v || null, updated_at: new Date().toISOString() },
      { onConflict: "restaurant_id,phone" },
    );
    onChanged();
  };
  const yemekKaydet = async () => {
    if (!restaurantId) return;
    if ((yemekTaslak.trim() || "") === (kart?.yemekTercihi ?? "")) return;
    await supabase.from("kisi_kartlari").upsert(
      { restaurant_id: restaurantId, phone, yemek_tercihi: yemekTaslak.trim() || null, updated_at: new Date().toISOString() },
      { onConflict: "restaurant_id,phone" },
    );
    onChanged();
  };
  const ickiKaydet = async () => {
    if (!restaurantId) return;
    if ((ickiTaslak.trim() || "") === (kart?.ickiTercihi ?? "")) return;
    await supabase.from("kisi_kartlari").upsert(
      { restaurant_id: restaurantId, phone, icki_tercihi: ickiTaslak.trim() || null, updated_at: new Date().toISOString() },
      { onConflict: "restaurant_id,phone" },
    );
    onChanged();
  };
  const vipDegistir = async () => {
    if (!restaurantId) return;
    await supabase.from("kisi_kartlari").upsert(
      { restaurant_id: restaurantId, phone, vip: !(kart?.vip ?? false), updated_at: new Date().toISOString() },
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
  if (sadeceGecmisVarsaGoster && !gecmisVar) return null;
  // Program hüküm vermiyor, sadece istatistik veriyor (Gökhan: "biz sadece istatistik
  // verelim, sadakat yorumunu sonra değerlendiririz"). Yorumu işletme yapar.
  // SADECE "gelmedi" sayılır — iptal haber vererek gelmemek demek, hiç haber vermeden masayı
  // boş bırakmakla (gelmedi) aynı kefeye konmamalı (Gökhan onayı, 2026-08-07).
  const gelmemeOrani = kart && kart.toplamKayit > 0
    ? Math.round((kart.gelmediSayisi / kart.toplamKayit) * 100) : 0;
  const gecenGun = kart?.sonZiyaret
    ? Math.floor((simdi - Date.parse(kart.sonZiyaret)) / 86400000) : null;
  const enSikKanal = kart && Object.keys(kart.kanalDagilimi).length > 0
    ? Object.entries(kart.kanalDagilimi).sort((a, b) => b[1] - a[1])[0][0] : null;

  // Etiketler — eşikler sabit kodlanmıyor, Ayarlar'dan geliyor (Gökhan: "ileride ayarlardan
  // değiştirilebilecek mantıkta olsun").
  const otoEtiketler: { text: string; renk: string }[] = [];
  if (kart && kart.ziyaretSayisi >= esikMudavim) otoEtiketler.push({ text: "Müdavim", renk: "var(--brand)" });
  if (kart && kart.toplamKayit >= 3 && gelmemeOrani >= esikNoShow) otoEtiketler.push({ text: "Gelmeme riski", renk: "var(--danger)" });

  // Doğum tarihi PROGRAM TARAFINDAN SORULMAZ (Gökhan, 2026-08-15: "biz hiçbir şekilde
  // doğum tarihi sormayalım") — onay mesajında misafire teklif edilir, veren olursa kartına
  // işlenir. O yüzden kutu yalnızca bilgisi OLAN kartta görünür; boş kartta hiç çıkmaz ki
  // personelin karşısına "doldurulacak alan" gibi durmasın. Görünürken düzeltilebilir.
  const dogumSatiri = dogumTaslak ? (
    <div style={{ display: "flex", alignItems: "center", gap: 6, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
      <span style={{ fontSize: 11, color: inkSoft }}>Doğum günü</span>
      <DatePicker value={dogumTaslak} onChange={dogumSec} style={{ fontSize: 11, padding: "2px 5px", width: 118 }} />
    </div>
  ) : null;

  return (
    <div style={{ border: "1px solid var(--line-2)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>

      {/* 1. KİMLİK — tek satır: isim → not. Telefon numarası kaldırıldı (Gökhan, 2026-08-15:
          "karttaki ismin yanındaki numarayı kaldır") — numara kartın açıldığı yerde zaten
          yazıyor. Doğum günü de buradan alınıp kart bilgilerinin en altına indirildi. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {/* İsim burada TEKRAR yazılmıyor (Gökhan, 2026-08-15: "kişi kartında 2 kere müşteri
              ismi yazıyor") — kartın başlığında zaten duruyor. */}
          <input
            value={notTaslak} onChange={(e) => setNotTaslak(e.target.value)} onBlur={notKaydet}
            placeholder="Not"
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 11.5, color: inkSoft, flex: 1, minWidth: 120, padding: "2px 0" }}
          />
          <button
            onClick={vipDegistir}
            style={{
              all: "unset", cursor: "pointer", fontSize: 10.5, fontWeight: 700, padding: "2px 6px", borderRadius: 6,
              border: "1px solid var(--gold)", color: kart?.vip ? "#fff" : "var(--gold-text)",
              background: kart?.vip ? "var(--gold-text)" : "transparent",
            }}
          >
            VIP
          </button>
          {otoEtiketler.map((e) => (
            <span key={e.text} style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 6px", borderRadius: 6, color: e.renk, border: `1px solid ${e.renk}` }}>{e.text}</span>
          ))}
        </div>
        {/* BU NUMARAYLA GELENLER — aynı numara birden fazla isimle kullanılmışsa (eş, arkadaş,
            asistan ya da ismi farklı yazılmış aynı kişi) personel bunu görsün diye (Gökhan,
            2026-08-15). Kart bölünmüyor, numara yine kimlik; program hüküm vermiyor, sadece
            gösteriyor. Tek isim varsa satır hiç çıkmaz. */}
        {(kart?.kullanilanIsimler?.length ?? 0) > 1 && (
          <div style={{ fontSize: 11.5, color: inkSoft }}>
            Bu numarayla gelenler: <span style={{ color: "var(--ink)" }}>{kart!.kullanilanIsimler.join(", ")}</span>
          </div>
        )}
        {/* YAPAY ZEKÂ BİLGİLENDİRMESİ — notun hemen altında. Personelin yazdığı notu,
            geçmiş rezervasyonların notlarını ve kartın rakamlarını okuyup yorumluyor
            (Gökhan, 2026-08-15). Yazı yoksa satır hiç görünmüyor. */}
        {(kart?.aiOzet || aiYaziliyor) && (
          <div style={{ background: "var(--recede)", borderRadius: 8, padding: "7px 9px", marginTop: 2 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, color: "var(--muted-2)", marginBottom: 2 }}>
              PROGRAMIN NOTU
            </div>
            {kart?.aiOzet
              ? <div style={{ fontSize: 12, color: "var(--ink)", lineHeight: 1.5 }}>{kart.aiOzet}</div>
              : <div style={{ fontSize: 11.5, color: inkSoft }}>Yazılıyor…</div>}
          </div>
        )}
      </div>

      {!gecmisVar ? (
        <>
          <div style={{ fontSize: 11.5, color: inkSoft, borderTop: "1px solid var(--line)", paddingTop: 8 }}>Bu numarayla ilk kez geliyor.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
            <div style={{ color: inkSoft }}>Tercih</div>
            <div style={{ paddingLeft: 10, display: "flex", flexDirection: "column", gap: 3 }}>
              <SatirDuzenle label="Yemek" value={yemekTaslak} onChange={setYemekTaslak} onBlur={yemekKaydet} />
              <SatirDuzenle label="İçki" value={ickiTaslak} onChange={setIckiTaslak} onBlur={ickiKaydet} />
            </div>
          </div>
          <BagliNumaralar
            kart={kart} bagAcik={bagAcik} setBagAcik={setBagAcik}
            bagTelefon={bagTelefon} setBagTelefon={setBagTelefon} bagAciklama={bagAciklama} setBagAciklama={setBagAciklama} numaraBagla={numaraBagla} isMobile={isMobile}
          />
        </>
      ) : (
        /* Tek ekranda sığsın diye sağlı-sollu iki liste (Gökhan: "kaydırma olmasın, sağlı
            sollu iki liste olabilir") — sol: ziyaret özeti + tercihler, sağ: geçmiş. Dar
            mobil kartta yan yana ikisi de sıkışıp taşıyordu (Gökhan, 2026-08-08: "sol
            tarafta ekrana sığmayan listeleme var alt satıra kayıyor") — mobilde alt alta. */
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 16, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {/* 2. ZİYARET ÖZETİ — işletmenin hızlı bakacağı rakamlar, etiket:değer satırları. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
              <SatirCift label="Ziyaret" value={String(kart!.ziyaretSayisi)} />
              <SatirCift label="Ort. kişi" value={kart!.ortalamaKisi !== null ? String(kart!.ortalamaKisi) : "—"} />
              <SatirCift label="Geliş aralığı" value={kart!.ortalamaSiklikGun ? `${sureYazisi(kart!.ortalamaSiklikGun)}de bir` : "—"} />
              <SatirCift label="Son geliş" value={kart!.sonZiyaret ? `${tarihKisa(kart!.sonZiyaret)}${gecenGun !== null && gecenGun > 0 ? ` (${sureYazisi(gecenGun)} önce)` : ""}` : "—"} />
              <SatirCift label="İlk geliş" value={kart!.ilkZiyaret ? tarihKisa(kart!.ilkZiyaret) : "—"} />
              <SatirCift label="İptal / Gelmedi" value={`${kart!.iptalSayisi} / ${kart!.gelmediSayisi}`} vurgu={gelmemeOrani >= esikNoShow && kart!.toplamKayit >= 3} />
              <SatirCift label="Favori gün" value={kart!.enSikGunNo !== null ? GUN_ADI[kart!.enSikGunNo] : "—"} />
              <SatirCift label="Favori saat" value={kart!.enSikSaat !== null ? `${String(kart!.enSikSaat).padStart(2, "0")}:00` : "—"} />
              <div style={{ color: inkSoft }}>Tercih</div>
              <div style={{ paddingLeft: 10, display: "flex", flexDirection: "column", gap: 3 }}>
                <SatirCift label="Rezervasyon" value={enSikKanal ? (KANAL_ADI[enSikKanal] ?? enSikKanal) : "—"} />
                <SatirCift label="Masa" value={kart!.enSikMasa ?? "—"} />
                <SatirDuzenle label="Yemek" value={yemekTaslak} onChange={setYemekTaslak} onBlur={yemekKaydet} />
                <SatirDuzenle label="İçki" value={ickiTaslak} onChange={setIckiTaslak} onBlur={ickiKaydet} />
              </div>
            </div>
            <BagliNumaralar
              kart={kart} bagAcik={bagAcik} setBagAcik={setBagAcik}
              bagTelefon={bagTelefon} setBagTelefon={setBagTelefon} bagAciklama={bagAciklama} setBagAciklama={setBagAciklama} numaraBagla={numaraBagla} isMobile={isMobile}
            />
          </div>

          {/* 4. REZERVASYON GEÇMİŞİ — rezervasyon listesi biçiminde, satıra basınca not/iptal
              sebebi açılır. Ekrana sığması için en fazla 8 kayıt gösterilir. */}
          {kart && kart.tumGecmis.length > 0 && (
            <div style={isMobile
              ? { flex: 1, minWidth: 0, borderTop: "1px solid var(--line)", paddingTop: 10 }
              : { flex: 1, minWidth: 0, borderLeft: "1px solid var(--line)", paddingLeft: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: "uppercase", marginBottom: 4 }}>Rezervasyon geçmişi</div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                {kart.tumGecmis.slice(0, 8).map((z, i) => (
                  <div key={i}>
                    <button
                      onClick={() => setAcikSatir(acikSatir === i ? null : i)}
                      style={{
                        all: "unset", cursor: (z.note || z.cancel_reason) ? "pointer" : "default", display: "flex", width: "100%",
                        boxSizing: "border-box", padding: "5px 2px", fontSize: 11.5, borderTop: i > 0 ? "1px solid var(--line)" : "none", gap: 6,
                      }}
                    >
                      <span style={{ color: "var(--ink)", width: 52, flexShrink: 0, whiteSpace: "nowrap" }}>{tarihKisa(z.reserved_at)}</span>
                      <span className="tnum" style={{ color: inkSoft, width: 32, flexShrink: 0 }}>{saatFmt.format(new Date(z.reserved_at))}</span>
                      <span className="tnum" style={{ color: inkSoft, width: 14, flexShrink: 0 }}>{z.party_size}</span>
                      <span style={{ color: inkSoft, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{z.masa ?? "—"}</span>
                      {/* Hesap tutarı — rezervasyon satırından girilir, geçmişte burada görünür
                          (Gökhan, 2026-08-15). Girilmemişse hiç yazılmaz, sıfır gösterilmez. */}
                      {z.hesap_tutari !== null && z.hesap_tutari !== undefined && (
                        <span className="tnum" style={{ color: "var(--ink)", flexShrink: 0, whiteSpace: "nowrap" }}>{tutarYazisi(z.hesap_tutari)}</span>
                      )}
                      <span style={{ color: DURUM_RENK[z.status] ?? inkSoft, fontWeight: 600, flexShrink: 0 }}>{DURUM_KISA[z.status] ?? z.status}</span>
                    </button>
                    {acikSatir === i && (z.note || z.cancel_reason) && (
                      <div style={{ fontSize: 11, color: inkSoft, padding: "2px 2px 6px 2px", fontStyle: "italic" }}>
                        {z.cancel_reason ? `İptal: ${z.cancel_reason}` : z.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {kart.tumGecmis.length > 8 && (
                <div style={{ fontSize: 10.5, color: "var(--muted-2)", marginTop: 4 }}>+{kart.tumGecmis.length - 8} kayıt daha</div>
              )}
            </div>
          )}
        </div>
      )}
      {dogumSatiri}
    </div>
  );
}

// Bağlı numaralar — bir kişinin farklı telefonlarla geldiği durumlar için.
function BagliNumaralar({
  kart, bagAcik, setBagAcik, bagTelefon, setBagTelefon, bagAciklama, setBagAciklama, numaraBagla, isMobile,
}: {
  kart: KisiKarti; bagAcik: boolean; setBagAcik: (v: boolean) => void;
  bagTelefon: string; setBagTelefon: (v: string) => void; bagAciklama: string; setBagAciklama: (v: string) => void; numaraBagla: () => void;
  isMobile?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {kart && kart.baglantilar.length > 0 && (
        <div style={{ fontSize: 11, color: inkSoft }}>
          Bağlı numaralar:{" "}
          {kart.baglantilar.map((b, i) => (
            <span key={b.id}>
              {i > 0 && ", "}
              <a
                href={isMobile ? telLinki(b.telefon) : waLinki(b.telefon)}
                target={isMobile ? undefined : "_blank"}
                rel={isMobile ? undefined : "noreferrer"}
                title={isMobile ? "Ara" : "WhatsApp'ta aç"}
                className="tnum"
                style={{ color: "var(--brand)", textDecoration: "none" }}
              >
                {b.telefon}
              </a>
              {b.aciklama ? ` (${b.aciklama})` : ""}
            </span>
          ))}
        </div>
      )}
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

function SatirCift({ label, value, vurgu }: { label: string; value: string; vurgu?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span style={{ color: inkSoft }}>{label}</span>
      <span className="tnum" style={{ color: vurgu ? "var(--danger)" : "var(--ink)", fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

// Tercih listesindeki elle girilen satırlar (yemek/içki gibi) — istatistik değil, personelin
// yazdığı bilgi, o yüzden değer alanı doğrudan düzenlenebilir.
function SatirDuzenle({ label, value, onChange, onBlur }: { label: string; value: string; onChange: (v: string) => void; onBlur: () => void }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
      <span style={{ color: inkSoft, flexShrink: 0 }}>{label}</span>
      <input
        value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
        placeholder="—"
        style={{ border: "none", background: "transparent", outline: "none", fontSize: 12, color: "var(--ink)", fontWeight: 600, textAlign: "right", padding: 0, minWidth: 0, width: 110 }}
      />
    </div>
  );
}

// Hesap tutarı kutusu — SADECE "tamamlandı" olan rezervasyon satırında görünür (Gökhan,
// 2026-08-15: "rezervasyona tamamlandı dedikten sonra rezervasyon satırından girilsin").
// Kendi taslağını tutar; liste tazelenip gelen tutar değişirse taslak yeniden eşitlenir
// (effect değil, render-sırası koşullu setState).
function TutarKutusu({ tutar, onKaydet }: { tutar: number | null; onKaydet: (metin: string) => void }) {
  const gelen = tutar === null ? "" : String(tutar);
  const [taslak, setTaslak] = useState(gelen);
  const [onceki, setOnceki] = useState(gelen);
  if (gelen !== onceki) { setOnceki(gelen); setTaslak(gelen); }
  return (
    <input
      value={taslak}
      onChange={(e) => setTaslak(e.target.value.replace(/[^0-9.,]/g, ""))}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      onBlur={() => onKaydet(taslak)}
      placeholder="Hesap"
      title="Hesap tutarı (TL) — isteğe bağlı"
      inputMode="decimal"
      className="tnum"
      style={{
        width: 74, fontSize: 12, textAlign: "right", padding: "2px 6px", borderRadius: 6,
        border: "1px solid var(--line-2)", background: "transparent", color: "var(--ink)", outline: "none", flexShrink: 0,
      }}
    />
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
  // Salon adları — nota yazılan salonu tanımak için (bkz. notKurallari.ts).
  const [salonlar, setSalonlar] = useState<{ id: string; name: string }[]>([]);
  // reservation_id -> o rezervasyona bağlı TÜM masa id'leri (masa birleştirme).
  const [rezMasalar, setRezMasalar] = useState<Record<string, string[]>>({});
  const [now, setNow] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kvkkNotice, setKvkkNotice] = useState("");
  const [kvkkAcik, setKvkkAcik] = useState(false);
  // Yeni rezervasyon penceresinin açılış saati — Ayarlar'dan değişebilir.
  const [varsayilanSaat, setVarsayilanSaat] = useState("19:00");
  // Varsayılan oturma süresi Ayarlar'dan geliyor — yeni rezervasyon bu süreyle kaydedilir.
  const [oturmaSuresi, setOturmaSuresi] = useState(90);
  // Ayarlar'daki "Otomatik yerleşme" — açıkken kişi sayısı büyüyünce program masayı kendi
  // tamamlar (Gökhan: "kendisi hemen kendi sırasındaki 2 kişilik masayı çekecek, kapatacak
  // konuyu"). Kapalıyken program hiçbir masayı kendiliğinden oynatmaz.
  const [otoYerlesme, setOtoYerlesme] = useState(false);
  // Geçmiş gün açık kalırsa ne olacağı — ayardan gelir: "sor" ya da "otomatik".
  const [gunKapanis, setGunKapanis] = useState("sor");
  // Müdavim/no-show riski etiketi eşikleri — sabit kodlanmıyor, Ayarlar'dan gelir.
  const [esikMudavim, setEsikMudavim] = useState(5);
  const [esikNoShow, setEsikNoShow] = useState(30);
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
  // Yedek işareti — masa tutmayan, sıra bekleyen rezervasyon (Gökhan, 2026-08-11).
  const [fYedek, setFYedek] = useState(false);
  // MİSAFİR MASASI (Gökhan, 2026-08-15). Aynı numara + aynı isim + aynı güne ikinci masa
  // açılıyorsa bu masa misafirler içindir. Program kendisi fark eder; personele sadece
  // "iki masa yakın olsun mu" diye sorar. İki rezervasyon birbirine bağlanmaz.
  const [fMisafirAday, setFMisafirAday] = useState(false);
  const [fMisafirYakin, setFMisafirYakin] = useState(false);
  // FIX / ALAKART (Gökhan, 2026-08-17) — sadece ayarlarda fix menü açıksa sorulur. Mutfak
  // şefi listede masa yerine bunu görüyor.
  const [fServis, setFServis] = useState<"alakart" | "fix">("alakart");
  const [fFixMenu, setFFixMenu] = useState<string>("");
  const [fFixKisi, setFFixKisi] = useState("");
  const [fixMenuler, setFixMenuler] = useState<{ id: string; ad: string }[]>([]);
  const [fixAcik, setFixAcik] = useState(false);
  // İşletme türü — yeni nesil meyhanede rezervasyon satırında fix/alakart da yazıyor
  // (Gökhan, 2026-08-18).
  const [isletmeTipi, setIsletmeTipi] = useState("");
  // MESAJ AYARLARI (Gökhan, 2026-08-18) — WhatsApp bağlanana kadar mesajlar kuyrukta
  // hazırlanıp bekliyor; ayarlar Ayarlar > Mesajlar bölümünden geliyor.
  const [mesajAyar, setMesajAyar] = useState<{
    acik: boolean; onayAcik: boolean; onayMetni: string | null;
    teyitAcik: boolean; teyitSaat: string; teyitBitis: string; teyitMetni: string | null;
    sessizBas: string; sessizBitis: string;
  } | null>(null);
  const [karmaFix, setKarmaFix] = useState(false);
  // ÖĞRENİLEN YEDEK LİMİTİ (Gökhan, 2026-08-11: "program dolu olan günler için öğrensin,
  // ne kadar masa gelmiyor, ona göre yedek limiti çıkarsın"). Geçmişte AYNI GÜNDE kaç
  // rezervasyonun boşa düştüğüne (gelmedi + iptal) bakar, o oranı masa sayısına uygular.
  // Elle girilen bir sayı değil, işletmenin kendi geçmişinden çıkar.
  const [yedekOneri, setYedekOneri] = useState<{ oran: number; limit: number; ornek: number } | null>(null);
  // Masa başına eklenebilecek sandalye — 4 kişilik masaya 5 kişi oturtmak gibi (Gökhan,
  // 2026-08-12). Ayarlardan gelir, 0 = hiç fazla alınmaz.
  const [ekSandalye, setEkSandalye] = useState(1);
  const [fKartRefresh, setFKartRefresh] = useState(0);
  // İsim aramasından seçilip kesinleşen müşterinin kalıcı kimliği (Gökhan: "form o müşterinin
  // ID'siyle devam etsin") — dolu olduğu sürece arama listesi kapalı kalır, kart bu ID ile açılır.
  const [fSecKartId, setFSecKartId] = useState<string | null>(null);
  // Kişi sayısının yanında kadın/erkek dağılımı — opsiyonel, sadece yeni rezervasyon alınırken
  // sorulur (Gökhan, 2026-08-07).
  const [fKadin, setFKadin] = useState("");
  const [fErkek, setFErkek] = useState("");
  // İletişim kanalı — İstatistikler > Kanallar için (Gökhan, 2026-08-07).
  const [fKanal, setFKanal] = useState("telefon");
  const fKart = useKisiKarti(fPhone, restaurantId, fKartRefresh, fSecKartId);
  const fAdaylar = useMusteriAdaylari(fName, restaurantId, !!fSecKartId);
  const fAdaySec = async (a: MusteriAday) => {
    setFName(a.isim);
    setFPhone(a.telefon);
    let id = a.kisiKartiId;
    if (!id && restaurantId) {
      const { data } = await supabase.from("kisi_kartlari")
        .upsert({ restaurant_id: restaurantId, phone: a.telefon }, { onConflict: "restaurant_id,phone" })
        .select("id").single();
      id = (data as { id: string } | null)?.id ?? null;
    }
    setFSecKartId(id);
  };
  // Rezervasyonsuz, kapıdan gelen — rezervasyon formuyla aynı bilgileri toplar, sadece
  // tarih/saat yok ("şimdi").
  const [walkInOpen, setWalkInOpen] = useState(false);
  // SOL MENÜ DARALTMA (Gökhan, 2026-08-18) — kapalıyken liste genişliyor. Seçim tarayıcıda
  // hatırlanıyor ki her açılışta yeniden daraltmak gerekmesin.
  const [menuKapali, setMenuKapali] = useState(false);
  const menuKapaliYaz = (v: boolean) => {
    setMenuKapali(v);
    if (typeof window !== "undefined") window.localStorage.setItem("rzv_menu_kapali", v ? "1" : "0");
  };
  const [wName, setWName] = useState("");
  const [wPhone, setWPhone] = useState("");
  const [wParty, setWParty] = useState("2");
  const [wNote, setWNote] = useState("");
  const [wKartRefresh, setWKartRefresh] = useState(0);
  const [wSecKartId, setWSecKartId] = useState<string | null>(null);
  const wKart = useKisiKarti(wPhone, restaurantId, wKartRefresh, wSecKartId);
  const wAdaylar = useMusteriAdaylari(wName, restaurantId, !!wSecKartId);
  const wAdaySec = async (a: MusteriAday) => {
    setWName(a.isim);
    setWPhone(a.telefon);
    let id = a.kisiKartiId;
    if (!id && restaurantId) {
      const { data } = await supabase.from("kisi_kartlari")
        .upsert({ restaurant_id: restaurantId, phone: a.telefon }, { onConflict: "restaurant_id,phone" })
        .select("id").single();
      id = (data as { id: string } | null)?.id ?? null;
    }
    setWSecKartId(id);
  };
  // Kişi kartı penceresi — mevcut bir rezervasyon satırından açılır (Gökhan: "numara
  // aradığında yine isim soyisim çıkacak, ... beraber gelmişlerdi felan"). Telefon yoksa
  // isimle geçmiş gösterilir (Gökhan: "rezervasyon alınan herkese kişi kartı açılacak").
  const [kartFor, setKartFor] = useState<Rez | null>(null);
  // Hesap tutarı — kişi kartının başından kaldırıldı, artık "tamamlandı" olan rezervasyonun
  // KENDİ SATIRINDAN giriliyor (Gökhan, 2026-08-15). Boş bırakılırsa alan NULL'a döner:
  // "girilmemiş" ile "sıfır TL" aynı şey değil.
  const tutarKaydet = async (r: Rez, metinHam: string) => {
    const metin = metinHam.trim().replace(/\./g, "").replace(",", ".");
    const deger = metin === "" ? null : Number(metin);
    if (deger !== null && !Number.isFinite(deger)) return;
    if (deger === r.hesap_tutari) return;
    const { error } = await supabase.from("reservations").update({ hesap_tutari: deger }).eq("id", r.id);
    if (error) { setErr(error.message); return; }
    if (kartFor?.id === r.id) setKartFor({ ...kartFor, hesap_tutari: deger });
    await yenile();
  };
  const [kartRefresh, setKartRefresh] = useState(0);
  const kartForKart = useKisiKarti(kartFor?.guest_phone ?? "", restaurantId, kartRefresh, kartFor?.kisi_karti_id);
  const kartForGecmis = useIsimGecmisi(kartFor?.guest_phone ? "" : (kartFor?.guest_name ?? ""), restaurantId, 0);

  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [masaDigerAcik, setMasaDigerAcik] = useState(false);
  // Masa birleştirme seçimi — birden fazla masaya tıklanıp "Ata" ile onaylanır.
  const [masaSecimi, setMasaSecimi] = useState<string[]>([]);
  // Masa ata penceresinin ekran konumu (Gökhan: "masa ata dediğim zaman akordiyon
  // rezervasyonların altında kalıyor, olması gereken yere koyacaksın") — position:fixed,
  // tıklanan noktaya göre, satırların ARKASINDA kalmasın diye.
  const [masaAtaKonum, setMasaAtaKonum] = useState<Konum | null>(null);
  // Liste kaydırılınca pencere düğmenin üstünde kalmaya devam etmesin diye (satıra bitişik
  // görünmesi için) — kaydırma başlayınca kapanır, x/y sabit kaldığı için açık kalırsa satırdan
  // kopmuş gibi asılı kalırdı.
  const listeKaydirRef = useRef<HTMLDivElement | null>(null);
  const [seatingFor, setSeatingFor] = useState<Rez | null>(null);
  // Oturtulan misafir sıradan geliyorsa: hangi kayıt, kaç dakika beklemiş (Gökhan, 2026-08-18).
  const [beklemeBiten, setBeklemeBiten] = useState<{ id: string; dakika: number | null } | null>(null);
  // Masa boşalınca karşılamanın önüne çıkan kutu: hangi masa boşaldı, kaç kişilik ve masanın
  // kimliği (Gökhan, 2026-08-18: "program masa boşaldı bekleyenler diye çıkarsın" ve
  // "karşılama hangisine oturt derse o masaya o geçsin, masa seçmesine gerek kalmasın").
  const [bosalanMasa, setBosalanMasa] = useState<{ ad: string; koltuk: number; masaIds: string[] } | null>(null);
  const [iptalFor, setIptalFor] = useState<Rez | null>(null);
  const [iptalReason, setIptalReason] = useState("");
  const [filtre, setFiltre] = useState("tumu");
  // Saat/telefon/kişi/not düzenleme penceresi — masa seç penceresiyle aynı konumlandırma.
  const [duzenle, setDuzenle] = useState<{ rezId: string; alan: DuzenleAlan; konum: Konum } | null>(null);
  const [duzenleDeger, setDuzenleDeger] = useState("");
  // Kişi sayısı düzenlenirken kadın/erkek de aynı pencereden düzeltilebilsin (Gökhan,
  // 2026-08-07: "kişi sayısını tekrar tıkladığımda kadın erkek sayılarını da düzeltebileyim").
  const [duzenleKadin, setDuzenleKadin] = useState("");
  const [duzenleErkek, setDuzenleErkek] = useState("");
  // Rezervasyon alınamadığında üstte kırmızı yazı değil, ortada pencere (Gökhan: "yukarıda
  // kırmızı yazı ile değil pencere ile, pencerede de şunu şöyle yaparsan şu masa uygun olur
  // uyarılarını verecek"). Başlık sebebi, satırlar ne yapılacağını söyler.
  const [uyari, setUyari] = useState<{ baslik: string; satirlar: string[] } | null>(null);
  // Pax sütunu başlığından açılan kişi sayısı filtresi (Gökhan: "paxa filtre koyalım,
  // rezervasyon sayısına göre filtrelesin") — null = tümü.
  const [paxFiltre, setPaxFiltre] = useState<number | null>(null);
  const [paxFiltreKonum, setPaxFiltreKonum] = useState<Konum | null>(null);
  // Salon ekranında düzenleme kapalıyken masaya tıklayınca buraya ?arama=<masa adı> ile
  // gelinir (Gökhan: "masaya tıkladığında rezervasyon listesi açılsın") — arama kutusu
  // başlangıç değerini URL'den okuyor (lazy initializer, effect değil).
  const [arama, setArama] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("arama") ?? "";
  });

  const notifiedGeldi = useRef<Set<string>>(new Set());
  const router = useRouter();

  // ROL KISITI (Gökhan, 2026-08-17: "garson, pr ve şef geldi gelmedi ve iptal yapamazlar,
  // kendi girdikleri rezervasyon dışında kişi kartı açamazlar"). İşletme sahibinde rol boş
  // gelir, karşılama ve yönetici de serbesttir.
  const [rolum, setRolum] = useState<string | null>(null);
  const [benimPersonelId, setBenimPersonelId] = useState<string | null>(null);
  // ROL YÜKLENDİ Mİ — `rolum` null İKİ anlama geliyor: "sorgu henüz dönmedi" ve "işletme
  // sahibi, personel kaydı yok". Role bakan işler (geçmiş gün kapatma gibi) sorgu dönmeden
  // karar verirse yanlış davranıyor, o yüzden ayrı bayrak tutuluyor (Gökhan, 2026-08-18).
  const [rolYuklendi, setRolYuklendi] = useState(false);
  useEffect(() => {
    let acik = true;
    // Kendi personel kaydım — RLS zaten yalnızca kendi satırlarımı veriyor. Aynı hesapta
    // birden fazla kayıt olabiliyor (test kişileri), aktif olan geçerli.
    supabase.from("personel_hesaplari").select("id, rol, test_aktif, created_at")
      .eq("durum", "onayli").order("test_aktif", { ascending: false }).order("created_at")
      .then(({ data }) => {
        if (!acik) return;
        const kayit = (data as { id: string; rol: string }[] | null)?.[0] ?? null;
        setRolum(kayit?.rol ?? null);
        setBenimPersonelId(kayit?.id ?? null);
        setRolYuklendi(true);
      });
    return () => { acik = false; };
  }, []);

  // GARSONUN KENDİ POSTASI (Gökhan, 2026-08-18: "garson hem listeyi görebilsin hem de sadece
  // kendi masalarını"). Postasındaki masaların kimlikleri; listede kendi satırlarını
  // işaretlemek ve süzmek için. Posta akşam dağıtılıyor, dağıtılmadıysa küme boş kalıyor ve
  // süzme düğmesi hiç çıkmıyor.
  const [postamMasalar, setPostamMasalar] = useState<Set<string>>(new Set());
  const [sadeceBenim, setSadeceBenim] = useState(false);
  useEffect(() => {
    if (rolum !== "garson") return;
    let acik = true;
    supabase.rpc("postam").then(({ data }) => {
      if (acik) setPostamMasalar(new Set((data as string[] | null) ?? []));
    });
    return () => { acik = false; };
  }, [rolum]);

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
      supabase.from("reservations").select("id, guest_name, guest_phone, party_size, reserved_at, status, note, table_id, arrived_at, seated_at, created_at, cancel_reason, source, masa_kilit, kisi_karti_id, kadin_sayisi, erkek_sayisi, hesap_tutari, yedek, gelen_kisi, misafir_masasi, misafir_yakin, tercih_alan_id, created_by, alan_hesap_id, servis_tipi, fix_menu_id, fix_kisi, bekleme, bekleme_baslangic, bekleme_dakika, teyit_durumu, teyit_zamani")
        .eq("restaurant_id", restId).is("deleted_at", null)
        .gte("reserved_at", start).lt("reserved_at", end)
        // Sıralama üç kademeli olmalı (Gökhan, 2026-08-15: "bazı rezervasyonlar kafasına
        // göre yer değiştiriyor"). Tek başına created_at yetmiyor: aynı anda açılan
        // kayıtların zamanı birebir aynı oluyor, veritabanı eşitleri her sorguda başka
        // sırayla döndürüyor, liste 6 saniyede bir tazelendiği için satırlar oynuyordu.
        // reserved_at ve id eşitliği kırıyor — sıra artık her tazelemede aynı.
        .order("created_at").order("reserved_at").order("id"),
      supabase.from("restaurant_tables").select("id, name, seat_count, status, position_x, position_y, shape, rotated, normal_x, normal_y, area_id").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("restaurant_settings").select("kvkk_notice, default_duration_minutes, auto_seating, varsayilan_rezervasyon_saati, musteri_sadakat_ziyaret_esigi, musteri_no_show_risk_yuzde, masa_ek_sandalye, gun_kapanis, fix_menu_acik, karma_fix_alakart, isletme_tipi, mesaj_acik, mesaj_onay_acik, mesaj_onay_metni, mesaj_teyit_acik, mesaj_teyit_saat, mesaj_teyit_bitis, mesaj_teyit_metni, mesaj_sessiz_baslangic, mesaj_sessiz_bitis").eq("restaurant_id", restId).maybeSingle(),
    ]);
    if (error) { setErr(error.message); return; }
    const list = (r as Rez[]) ?? [];
    setRows(list);
    setTables((t as TableRow[]) ?? []);
    supabase.from("dining_areas").select("id, name").eq("restaurant_id", restId).is("deleted_at", null)
      .order("sort_order").then(({ data }) => setSalonlar((data as { id: string; name: string }[]) ?? []));
    const settingsRow = s as {
      kvkk_notice: string | null; default_duration_minutes: number; auto_seating: boolean;
      varsayilan_rezervasyon_saati: string; musteri_sadakat_ziyaret_esigi: number; musteri_no_show_risk_yuzde: number;
      masa_ek_sandalye: number; gun_kapanis: string;
      fix_menu_acik: boolean | null; karma_fix_alakart: boolean | null; isletme_tipi: string | null;
      mesaj_acik: boolean | null; mesaj_onay_acik: boolean | null; mesaj_onay_metni: string | null;
      mesaj_teyit_acik: boolean | null; mesaj_teyit_saat: string | null; mesaj_teyit_bitis: string | null;
      mesaj_teyit_metni: string | null; mesaj_sessiz_baslangic: string | null; mesaj_sessiz_bitis: string | null;
    } | null;
    setIsletmeTipi(settingsRow?.isletme_tipi ?? "");
    setMesajAyar({
      acik: settingsRow?.mesaj_acik ?? false,
      onayAcik: settingsRow?.mesaj_onay_acik ?? true,
      onayMetni: settingsRow?.mesaj_onay_metni ?? null,
      teyitAcik: settingsRow?.mesaj_teyit_acik ?? true,
      teyitSaat: (settingsRow?.mesaj_teyit_saat ?? "12:00").slice(0, 5),
      teyitBitis: (settingsRow?.mesaj_teyit_bitis ?? "13:00").slice(0, 5),
      teyitMetni: settingsRow?.mesaj_teyit_metni ?? null,
      sessizBas: (settingsRow?.mesaj_sessiz_baslangic ?? "23:00").slice(0, 5),
      sessizBitis: (settingsRow?.mesaj_sessiz_bitis ?? "09:00").slice(0, 5),
    });
    setFixAcik(settingsRow?.fix_menu_acik ?? false);
    setKarmaFix(settingsRow?.karma_fix_alakart ?? false);
    supabase.from("fix_menuler").select("id, ad").eq("restaurant_id", restId).is("deleted_at", null).order("sira")
      .then(({ data }) => setFixMenuler((data as { id: string; ad: string }[]) ?? []));
    setKvkkNotice(settingsRow?.kvkk_notice ?? "");
    setVarsayilanSaat(settingsRow?.varsayilan_rezervasyon_saati ?? "19:00");
    setOturmaSuresi(settingsRow?.default_duration_minutes ?? 90);
    setOtoYerlesme(settingsRow?.auto_seating ?? false);
    setEsikMudavim(settingsRow?.musteri_sadakat_ziyaret_esigi ?? 5);
    setEsikNoShow(settingsRow?.musteri_no_show_risk_yuzde ?? 30);
    setEkSandalye(settingsRow?.masa_ek_sandalye ?? 1);
    setGunKapanis(settingsRow?.gun_kapanis ?? "sor");
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

  // Açılış günü normalde bugündür. İstatistikler tablosunda bir gün satırına tıklanınca
  // buraya ?gun=YYYY-MM-DD ile geliniyor — rakamdan o günün kaydına tek tıkla inilsin diye
  // (Gökhan, 2026-08-12: tablo "kapı olsun").
  useEffect(() => {
    const istenen = new URLSearchParams(window.location.search).get("gun");
    setGun(istenen && /^\d{4}-\d{2}-\d{2}$/.test(istenen) ? istenen : bugunIstanbul());
  }, []);
  useEffect(() => {
    if (!restaurantId || !gun) return;
    load(restaurantId, gun);
    const id = setInterval(() => load(restaurantId, gun), 6000);
    return () => clearInterval(id);
  }, [restaurantId, gun, load]);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  // Telefon genişliğinde liste tablo yerine kart görünümüne geçer (Gökhan, 2026-08-07:
  // "mobili daha takip ve rezervasyon girişi için tasarlamalıyız") — tablet masaüstüyle
  // aynı kalır, sadece bu eşiğin altı değişir (Adisyon'daki 860px eşiğiyle aynı).
  const [darEkran, setDarEkran] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const update = () => setDarEkran(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  // Telefon YAN ÇEVRİLDİĞİNDE ekran yüksekliği yarıya düşüyor; RZV rozeti + işletme adı +
  // çıkış satırı o yükseklikte lüks kalıyor. Yan çevirmenin tek amacı daha çok rezervasyon
  // satırı görmek (Gökhan, 2026-08-10: "yukarıdaki logo satırı dışarıda kalsın, beyaz
  // rezervasyon kutusu en üste dayansın"), o yüzden o satır gizleniyor. Dik tutunca geri gelir.
  //
  // Eşik GENİŞLİĞE değil YÜKSEKLİĞE bakar: telefon yan çevrilince genişlik 860'ı aşıyor
  // (büyük telefonlarda 900+), o yüzden "mobil mi" şartına bağlanınca kural hiç çalışmıyordu.
  // max-width: 1100 sadece masaüstünde kısa pencerede tetiklenmesin diye.
  const [yatayMobil, setYatayMobil] = useState(false);
  // Yatayda sayfa yüksekliği ÖLÇÜLEREK veriliyor. 100vh telefon tarayıcısında adres çubuğunu
  // da sayıyor, kutunun alt kenarı ekranın dışında kalıyordu (Gökhan, 2026-08-10: "kutunun
  // alt çizgisi ekranda görünsün"). window.innerHeight gerçekten görünen yüksekliği verir.
  const [ekranYuksekligi, setEkranYuksekligi] = useState(0);
  useEffect(() => {
    // Doğrudan pencere ölçüsü: medya sorgusu bazı telefon tarayıcılarında döndürmede
    // güvenilir tetiklenmiyordu. Kısa + yatık + dar ekran = telefon yan çevrilmiş.
    // Eşik 560 idi: telefonda adres çubuğu gizlenince ekran yükseliyor, sınırın üstüne çıkıyor
    // ve yatay düzen kendiliğinden kapanıp işletme adı satırı geri geliyordu (Gökhan,
    // 2026-08-10). Sınır 700'e çıkarıldı; masaüstünde kısa pencerede tetiklenmesin diye de
    // dokunmatik şartı eklendi (pointer: coarse) — fare varsa bu düzen hiç açılmaz.
    const dokunmatik = window.matchMedia("(pointer: coarse)").matches;
    const update = () => {
      const g = window.innerWidth, y = window.innerHeight;
      setYatayMobil(dokunmatik && g > y && y <= 700 && g <= 1100);
      setEkranYuksekligi(y);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  // Telefon yan çevrilince genişlik 860'ı aşıyor ve program masaüstü görünümüne geçiyordu;
  // üstte gün/arama/düğme çubuğu beliriyor, liste kutusu bir parmak aşağı iniyordu (Gökhan,
  // 2026-08-10: "kutu hâlâ yukarı yaslanmamış, neredeyse 1 cm aşağıda"). Yan çevrilmiş telefon
  // hâlâ telefondur — bu yüzden mobil görünüm orada da açık kalıyor.
  const isMobile = darEkran || yatayMobil;

  // Kural dört rolde de aynı (Gökhan, 2026-08-17: "bu kurallar genel geçerli — şef, PR,
  // mutfak"). Serbest olanlar: işletme sahibi, karşılama, yönetici.
  // WEB VE MOBİL AYRI İŞLER (Gökhan, 2026-08-18): web ana sayfa, işletmenin kendi ekranı —
  // orada rol kısıtı yok. Personel zaten telefondan giriyor, kurallar orada geçerli.
  const kisitli = isMobile && (rolum === "garson" || rolum === "pr" || rolum === "salon_sefi" || rolum === "mutfak");
  /** Durum değiştirebilir mi — geldi, gelmedi, oturdu, tamamlandı, iptal. */
  const durumYetkisi = !kisitli;
  // MUTFAK GÖRÜNÜMÜ (Gökhan, 2026-08-17: "masa numaraları ile işi yok, oralarda fix ya da
  // alakart yazsın") — mutfak şefinin listesinde masa sütunu yerine servis tipi çıkıyor.
  const mutfakGorunumu = isMobile && rolum === "mutfak";
  // Sütunda tek kelime yazar: Fix ya da Alakart (Gökhan, 2026-08-17) — menü adı ve fix kişi
  // sayısı yazılmıyor.
  // Yeni nesil meyhanede masanın altında fix/alakart da yazıyor (Gökhan, 2026-08-18).
  const ynMeyhane = isletmeTipi === "yn_meyhane";

  // Fare notun üzerindeyken notun tamamını gösteren balon (Gökhan, 2026-08-18) — tıklamaya
  // gerek yok, satırda sığmayan not böyle okunuyor.
  const [notBalon, setNotBalon] = useState<{ id: string; metin: string; kutu: DOMRect } | null>(null);
  // Fare masa kutusunun üzerindeyken rezervasyonun bütün masalarını alt alta gösteren balon;
  // esas masa en üstte. Aşağıda yer yoksa yukarı doğru açılıyor (Gökhan, 2026-08-18).
  const [masaBalon, setMasaBalon] = useState<{ id: string; masalar: string[]; kutu: DOMRect } | null>(null);

  const servisEtiketi = (r: Rez) => {
    if (r.servis_tipi === "fix") return "Fix";
    if (r.servis_tipi === "alakart") return "Alakart";
    return "—";
  };
  /** Kişi kartı açılabilir mi — kısıtlı roller sadece KENDİ personel kaydıyla girdiğinde. */
  // GARSON TELEFONDA HİÇBİR KART AÇAMAZ (Gökhan, 2026-08-18: "rezervasyonlarda da sadece kendi
  // eklediği de olsa hiçbir kartı açamasın, gerek yok, sadece görsün"). Garson bu programı
  // servis başlamadan önce kullanıyor; listeye bakması yetiyor. Diğer kısıtlı rollerde eski
  // kural sürüyor: kendi girdiği kayıtta kart açılır.
  const kartAcilir = (r: Rez) =>
    isMobile && rolum === "garson"
      ? false
      : !kisitli || (!!r.alan_hesap_id && r.alan_hesap_id === benimPersonelId);

  /** Bu rezervasyonun masası garsonun kendi postasında mı — birleşen masalardan biri yetiyor. */
  const benimRezMi = (r: Rez) => {
    const idler = rezMasalar[r.id] ?? (r.table_id ? [r.table_id] : []);
    return idler.some((id) => postamMasalar.has(id));
  };
  /** Kendi masalarını işaretleme ve süzme sadece telefonda, postası dağıtılmış garsonda. */
  const postamVar = isMobile && rolum === "garson" && postamMasalar.size > 0;
  useEffect(() => {
    setMenuKapali(window.localStorage.getItem("rzv_menu_kapali") === "1");
  }, []);
  useEffect(() => {
    const onFirstTouch = () => { unlockAudio(); document.removeEventListener("pointerdown", onFirstTouch); };
    document.addEventListener("pointerdown", onFirstTouch);
    return () => document.removeEventListener("pointerdown", onFirstTouch);
  }, []);
  // Liste kaydırılınca açık pencereler kapanır — konumları sabit olduğu için açık kalsalar
  // bağlı oldukları satırdan kopup ekranda asılı kalırlardı.
  const pencereAcik = !!assigningId || !!duzenle || !!paxFiltreKonum;
  useEffect(() => {
    if (!pencereAcik) return;
    const kapat = () => {
      setAssigningId(null); setMasaAtaKonum(null); setMasaDigerAcik(false);
      setDuzenle(null); setPaxFiltreKonum(null);
    };
    const el = listeKaydirRef.current;
    el?.addEventListener("scroll", kapat);
    return () => el?.removeEventListener("scroll", kapat);
  }, [pencereAcik]);

  const yenile = async () => { if (restaurantId && gun) await load(restaurantId, gun); };
  const gunDegistir = (g: string) => setGun(g);

  // MİSAFİR MASASI TESPİTİ — form doldurulurken çalışır. Aynı numara + aynı isim + aynı güne
  // zaten bir rezervasyon varsa bu açılan ikinci masadır; "yakın olsun mu" kutusu o zaman
  // çıkar, başka zaman görünmez (Gökhan, 2026-08-15: "2. masayı fark ettiğinde").
  const fAdSade = fName.trim().toLocaleLowerCase("tr-TR");
  const fTelSade = fPhone.replace(/\D/g, "").slice(-10);
  useEffect(() => {
    const gecerli = newResOpen && !!restaurantId && !!fDate && fTelSade.length >= 10 && fAdSade.length >= 2;
    let iptal = false;
    // Sıfırlama da zamanlayıcının içinde: effect gövdesinde doğrudan setState yapılmıyor.
    const zamanlayici = setTimeout(() => {
      if (!gecerli) { if (!iptal) setFMisafirAday(false); return; }
      const { start, end } = gunSiniri(fDate);
      supabase.from("reservations").select("guest_name, guest_phone")
        .eq("restaurant_id", restaurantId).is("deleted_at", null)
        .neq("status", "iptal")
        .gte("reserved_at", start).lt("reserved_at", end)
        .then(({ data }) => {
          if (iptal) return;
          const kayitlar = (data as { guest_name: string; guest_phone: string | null }[]) ?? [];
          setFMisafirAday(kayitlar.some((r) =>
            (r.guest_phone ?? "").replace(/\D/g, "").slice(-10) === fTelSade
            && r.guest_name.trim().toLocaleLowerCase("tr-TR") === fAdSade));
        });
    }, 400);
    return () => { iptal = true; clearTimeout(zamanlayici); };
  }, [newResOpen, restaurantId, fDate, fTelSade, fAdSade]);

  // Yeni rezervasyonla AYNI GÜN masa tutan rezervasyonlar — günün tamamı TEK HAVUZ.
  //
  // OTURMA SÜRESİNE GÖRE MASA AÇMA KALDIRILDI (Gökhan, 2026-08-16): "oturma süresi kavramı
  // sadece istatistik için gerekli, başka şekilde kullanılamaz. Oturan müşteriye hiçbir yerde
  // kalk diyemezsin, anlık masaya rezervasyon da alamazsın. Masa kalkmadıkça masaya kimse
  // alınamasın — 'kalktı' ya da 'tamamlandı' demedikçe sistem masaya kimseyi almasın."
  //
  // Eskiden bir ayar vardı ("saate göre masa hesabı") ve açıkken masayı oturma süresi kadar
  // dolu sayıp sonra yeni rezervasyona açıyordu. Bu, oturan misafirin masasını önceden
  // başkasına söz vermek demekti. Süre artık sadece istatistikte kullanılıyor.
  //
  // Görüntülenen gün elimizde zaten var; başka güne yazılıyorsa o gün ayrıca çekilir
  // (Gökhan: "yarına, haftaya alınan rezervasyonlarda da kontrol çalışsın").
  const donemGruplariGetir = async (tarih: string): Promise<number[]> => {
    if (tarih === gun) return kapasiteliRows.map((r) => r.party_size);
    const { start, end } = gunSiniri(tarih);
    const { data } = await supabase.from("reservations").select("party_size, reserved_at, status")
      .eq("restaurant_id", restaurantId).is("deleted_at", null).eq("yedek", false)
      .gte("reserved_at", start).lt("reserved_at", end);
    return ((data as { party_size: number; reserved_at: string; status: string }[]) ?? [])
      .filter((x) => x.status === "bekleniyor" || x.status === "geldi" || x.status === "oturdu")
      .map((x) => x.party_size);
  };

  // Masa boyu kontrolü — program masayı seçmez, sadece yer var mı bakar; gerekiyorsa sorar.
  // Devam edilecekse true döner.
  // sessiz: true verilirse yer yokken uyarı kutusu AÇILMAZ, sadece false döner. Kapı
  // girişinde karar programın: yer yoksa misafir sessizce bekleme sırasına yazılıyor
  // (Gökhan, 2026-08-18).
  const masaMusaitMi = async (tarih: string, kisi: number, sessiz = false): Promise<boolean> => {
    if (tables.length === 0) return true;
    const gruplar = await donemGruplariGetir(tarih);

    // ÖNCE planlayıcıya sor: salon dizilirse HERKES oturuyor mu? Sadece yeni gelene bakmak
    // yetmiyordu — yeni rezervasyon yerleşirken başkası açıkta kalıyor, program yine de
    // "olur" diyordu (Gökhan: "58 rezervasyon var, bana hayır diyemedi, sadece bir
    // rezervasyonun masasız kaldığını söyledi"). Kimse açıkta kalmıyorsa soru sorulmaz.
    // alanId ŞART: onsuz planlayıcı bütün salonları tek salon sanıp bir rezervasyona
    // Merkez + Teras + Bahçe'den masa topluyor (Gökhan, 2026-08-15).
    const planMasalar = tables.map((t) => ({
      id: t.id, seat_count: t.seat_count, position_x: t.position_x, position_y: t.position_y,
      alanId: t.area_id,
    }));
    const { yerlesemeyen: planDisi } = salonuPlanla(
      planMasalar,
      [...gruplar.map((k, i) => ({ id: `mevcut-${i}`, kisi: k })), { id: "yeni", kisi }],
      [],
    );
    if (planDisi.length === 0) return true;

    // Sığmıyor — birleştirme ve masa taşıma dahil hiçbir dizilim herkesi oturtamıyor.
    // Artık "devam edelim mi" diye sorulmuyor: sorulacak bir şey yok, yer yok. Bunun yerine
    // en fazla kaç kişilik alınabileceği hesaplanıp söyleniyor.
    let sigan = 0;
    for (let n = kisi - 1; n >= 1; n--) {
      const deneme = salonuPlanla(
        planMasalar,
        [...gruplar.map((k, i) => ({ id: `mevcut-${i}`, kisi: k })), { id: "deneme", kisi: n }],
        [],
      );
      if (deneme.yerlesemeyen.length === 0) { sigan = n; break; }
    }
    const { havuz } = havuzuTuket(tables, gruplar);
    const bosluk = havuzDokumu(havuz);
    // Her rezervasyon en az bir masa ister — koltuk kalmış olsa bile masa bitmişse yeni
    // rezervasyon alınamaz (Gökhan: "masa sayısı kadar rezervasyon alabilirsin, fazlasını
    // alamazsın"). Sebep buysa açıkça söylensin, "hiçbir boyda alınamaz" deyip geçmesin.
    // Birleşen masalar tek sayıldığı için ölçüt etkin masa sayısı (Gökhan, 2026-08-18).
    const masaBitti = gruplar.length >= etkinMasaSayisi;
    if (sessiz) return false;
    setUyari({
      baslik: `${kisi} kişilik rezervasyon alınamıyor`,
      satirlar: masaBitti
        ? [
            `Salonda ${etkinMasaSayisi} masa var ve ${gruplar.length} rezervasyon almışsın — masa kalmadı.`
              + (birlesmeFazlasi > 0 ? ` (${birlesmeFazlasi} masa birleştirmede kullanıldı, birleşenler tek masa sayılıyor.)` : ""),
            "Her rezervasyon kendi masasını ister; koltuk boş olsa bile iki ayrı rezervasyon aynı masaya oturmaz.",
            "Yeni rezervasyon için mevcut rezervasyonlardan biri iptal edilmeli.",
          ]
        : [
            `Salon baştan dizilse bile ${kisi} kişilik bu grubu oturtacak yer çıkmıyor — masaları birleştirmek ve taşımak dahil.`,
            bosluk ? `Elde kalan masalar: ${bosluk}.` : "Boş masa kalmadı.",
            sigan > 0
              ? `Şu an en fazla ${sigan} kişilik bir rezervasyon alabilirsin.`
              : "Şu an hiçbir boyda rezervasyon alınamaz.",
            `${kisi} kişiliği alabilmen için mevcut rezervasyonlardan biri iptal edilmeli ya da kişi sayısı küçültülmeli.`,
          ],
    });
    return false;
  };

  // Yeni rezervasyon penceresi Ayarlar'daki varsayılan saatle açılır. O saat bugün için
  // geçmişse bir sonraki TAM saate atlar (Gökhan: "19'u geçince bir sonraki saat dilimine
  // geçsin, yarım saat değil") — 21:32'de 22:00, 21:05'te de 22:00.
  const acilisSaati = () => {
    if (gun !== bugunIstanbul()) return varsayilanSaat;
    const s = new Date(new Date(now).toLocaleString("en-US", { timeZone: "Europe/Istanbul" }));
    const suAnDk = s.getHours() * 60 + s.getMinutes();
    const [vs, vd] = varsayilanSaat.split(":").map((x) => parseInt(x, 10));
    if (suAnDk < vs * 60 + (vd || 0)) return varsayilanSaat;
    return `${String((s.getHours() + 1) % 24).padStart(2, "0")}:00`;
  };

  // Geçmişten yedek limitini öğrenir: son 12 haftada AYNI HAFTA GÜNÜNDE alınan
  // rezervasyonların yüzde kaçı boşa düşmüş (gelmedi + iptal). O oran masa sayısına
  // uygulanınca "bu gün için kaç yedek alınabilir" çıkar. Yedek kayıtları hesaba katılmaz,
  // yoksa kendi kendini besler. Yeterli geçmiş yoksa (10 kayıttan az) öneri verilmez —
  // uydurma sayı göstermek yok.
  useEffect(() => {
    if (!restaurantId || !gun || tables.length === 0) { setYedekOneri(null); return; }
    let iptalEdildi = false;
    (async () => {
      const hedef = new Date(`${gun}T12:00:00+03:00`);
      const dow = hedef.getDay();
      const bas = new Date(hedef.getTime() - 84 * 86400000).toISOString();
      const { data } = await supabase.from("reservations")
        .select("reserved_at, status")
        .eq("restaurant_id", restaurantId).is("deleted_at", null).eq("yedek", false)
        .gte("reserved_at", bas).lt("reserved_at", hedef.toISOString());
      if (iptalEdildi) return;
      const ayniGun = ((data as { reserved_at: string; status: string }[]) ?? [])
        .filter((r) => new Date(r.reserved_at).getDay() === dow);
      if (ayniGun.length < 10) { setYedekOneri(null); return; }
      const bosa = ayniGun.filter((r) => r.status === "gelmedi" || r.status === "iptal").length;
      const oran = bosa / ayniGun.length;
      setYedekOneri({ oran, limit: Math.max(1, Math.round(oran * tables.length)), ornek: ayniGun.length });
    })();
    return () => { iptalEdildi = true; };
  }, [restaurantId, gun, tables.length]);

  // O gün hâlâ sırada bekleyen yedek sayısı.
  const bekleyenYedek = rows.filter((r) => r.yedek && r.status === "bekleniyor").length;

  const openNewRes = () => {
    setFName(""); setFPhone(""); setFParty("2"); setFDate(gun);
    setFTime(acilisSaati());
    setFNote("");
    setFYedek(false);
    setFServis("alakart"); setFFixMenu(""); setFFixKisi("");
    setFMisafirAday(false); setFMisafirYakin(false);
    setFSecKartId(null);
    setFKadin(""); setFErkek(""); setFKanal("telefon");
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
    // Kadın/erkek toplamı kişi sayısını AŞAMAZ — "2 kişi ama 3 kadın 3 erkek" gibi çelişkili
    // bir girişi sessizce kabul etmemeli (Gökhan, 2026-08-07).
    const kadinSayi = fKadin.trim() ? parseInt(fKadin, 10) : 0;
    const erkekSayi = fErkek.trim() ? parseInt(fErkek, 10) : 0;
    if (kadinSayi + erkekSayi > kisi) {
      setErr(`Kadın + erkek toplamı (${kadinSayi + erkekSayi}) kişi sayısını (${kisi}) geçemez.`);
      return;
    }
    setErr(null);

    const iso = new Date(`${fDate}T${fTime}:00+03:00`).toISOString();
    // Geçmiş saate yazılabilir ama program uyarır — atlanmış bir rezervasyon sonradan
    // girilebiliyor ya da düzeltme yapılıyor olabilir (Gökhan).
    if (Date.parse(iso) < now) {
      const ok = await confirm(`Bu saat geçmiş (${fTime}). Yine de kaydedelim mi?`, { danger: false });
      if (!ok) return;
    }
    // Yedek masa tutmaz: ne masa müsaitlik kontrolünden geçer ne de kapasiteyi doldurur.
    // Zaten "yer yok ama sıraya yazdır" demek olduğu için dolu salonda da alınabilmeli.
    if (!fYedek && !(await masaMusaitMi(fDate, kisi))) return;

    // Öğrenilen yedek limiti dolduysa uyarır ama yasaklamaz — son söz Gökhan'ın.
    if (fYedek && fDate === gun && yedekOneri && bekleyenYedek >= yedekOneri.limit) {
      const ok = await confirm(
        `Yedek limiti doldu. Bu günlerde geçmişte ortalama ${yedekOneri.limit} masa boşalıyor ve şu an ${bekleyenYedek} yedek bekliyor. Yine de alınsın mı?`,
        { danger: false },
      );
      if (!ok) return;
    }

    // Kapasite dolduğunda artık Yedek'e almıyoruz, doğrudan reddediyoruz (Gökhan: "yedek
    // rezervasyon almayı durdur, şu an alamazsın"). Kontrol sadece görüntülenen gün için
    // yapılabiliyor — başka günün pax toplamı elimizde yok, orada masa kontrolü iş görüyor.
    let mevcut = 0;
    if (fDate === gun && !fYedek) {
      mevcut = gunPax;
      if (mevcut + kisi > toplamKapasite) {
        setUyari({
          baslik: "Kapasite dolu",
          satirlar: [
            `Bu günde ${toplamKapasite} koltuğun ${mevcut}'i tutulmuş, ${kisi} kişilik daha alınamıyor.`,
            `En fazla ${Math.max(0, toplamKapasite - mevcut)} kişilik bir rezervasyon sığar.`,
            // Dolu gün = yedeğin asıl işe yaradığı gün. Program burada öğrendiğini söyler.
            ...(yedekOneri
              ? [`Yedek alabilirsin: son ${yedekOneri.ornek} kayda göre bu günlerde rezervasyonların %${Math.round(yedekOneri.oran * 100)}'i boşa düşüyor, ortalama ${yedekOneri.limit} masa açılıyor. Şu an ${bekleyenYedek} yedek var.`]
              : ["Yedek olarak yazabilirsin — yer boşalırsa program onu yerleştirir."]),
            "Yer açmak için mevcut rezervasyonlardan biri iptal edilmeli ya da kişi sayısı küçültülmeli.",
          ],
        });
        return;
      }
    }

    setBusy(true);
    // Rezervasyonu kim aldıysa (oturum açan kişi) otomatik etiketlenir — elle seçim yok
    // (Gökhan, 2026-08-07: "kimin şifresiyle alındıysa o almıştır").
    const { data: { session } } = await supabase.auth.getSession();
    // AYNI NUMARAYLA İKİNCİ MÜŞTERİ KAYDI AÇILMAZ (Gökhan, 2026-08-13). Telefon girildiyse o
    // numaranın müşteri kartı aranır; varsa rezervasyon ONA bağlanır, yoksa bir kart açılıp
    // yine ona bağlanır. Eskiden kart yalnız isim aramasından biri seçilirse bağlanıyordu;
    // seçilmezse aynı kişi her seferinde yeni bir müşteri gibi düşüyor, geçmişi ve sadakati
    // bölünüyordu.
    let kartId = fSecKartId;
    const tel = fPhone.trim();
    if (!kartId && tel) {
      const { data: kart } = await supabase.from("kisi_kartlari")
        .upsert({ restaurant_id: restaurantId, phone: tel }, { onConflict: "restaurant_id,phone", ignoreDuplicates: false })
        .select("id").single();
      kartId = (kart as { id: string } | null)?.id ?? null;
    }
    const { data: yeniKayit, error } = await supabase.from("reservations").insert({
      restaurant_id: restaurantId,
      guest_name: toTitleTr(fName),
      guest_phone: fPhone.trim() || null,
      party_size: kisi,
      reserved_at: new Date(`${fDate}T${fTime}:00+03:00`).toISOString(),
      duration_minutes: oturmaSuresi,
      note: ilkHarfBuyukTr(fNote) || null,
      consent_at: fPhone.trim() ? new Date().toISOString() : null,
      kisi_karti_id: kartId,
      kadin_sayisi: fKadin.trim() ? parseInt(fKadin, 10) : null,
      erkek_sayisi: fErkek.trim() ? parseInt(fErkek, 10) : null,
      iletisim_kanali: fKanal,
      yedek: fYedek,
      // Aynı kişinin aynı güne ikinci masası — misafirleri için (Gökhan, 2026-08-15).
      misafir_masasi: fMisafirAday,
      misafir_yakin: fMisafirAday ? fMisafirYakin : null,
      created_by: session?.user.id ?? null,
      // Rezervasyonu giren PERSONEL kaydı (Ekip hesabı). Kişi kartı yetkisi buna bakıyor —
      // aynı hesapta birden fazla personel olabildiği için oturum kimliği yetmiyor
      // (Gökhan, 2026-08-17: "şef garsonunkini açabiliyor").
      alan_hesap_id: benimPersonelId,
      // Fix menü kapalıysa hiç sorulmuyor, o yüzden boş gidiyor.
      servis_tipi: fixAcik ? fServis : null,
      fix_menu_id: fixAcik && fServis === "fix" ? (fFixMenu || null) : null,
      fix_kisi: fixAcik && fServis === "fix" && karmaFix && fFixKisi.trim() ? parseInt(fFixKisi, 10) : null,
    }).select("id").single();
    setBusy(false);
    if (error) { setErr(error.message); return; }
    if (yeniKayit) bildirimGonder(yeniKayit.id, "onay");
    // ONAY MESAJI ANINDA (Gökhan, 2026-08-18) — sessiz saat kuralı buna işlemez, misafir
    // o an cevap bekliyor. Numara yoksa mesaj hazırlanmaz.
    if (yeniKayit && mesajAyar?.acik && mesajAyar.onayAcik && fPhone.trim()) {
      const taslak = {
        id: yeniKayit.id, guest_name: toTitleTr(fName), guest_phone: fPhone.trim(),
        party_size: kisi, reserved_at: new Date(`${fDate}T${fTime}:00+03:00`).toISOString(),
      } as Rez;
      await mesajKuyrugaYaz(taslak, "onay", mesajMetni(mesajAyar.onayMetni, taslak, "Sayın {isim}, {tarih} {saat} için {kisi} kişilik rezervasyonunuzu aldık."), true);
    }
    setNewResOpen(false);
    if (fDate === gun && mevcut < toplamKapasite && mevcut + kisi >= toplamKapasite) {
      bildirCapacityNotice(`Kapasite bu rezervasyonla doldu (${toplamKapasite}/${toplamKapasite} pax) — bu saate başka rezervasyon alınamaz.`);
    }
    // Otomatik modda yeni rezervasyon salonu değiştirir — dizilim kendiliğinden kurulur.
    // Rezervasyon hangi güne yazıldıysa o günün planı kurulur, ekranda o gün açık olmasa da.
    // Yedek masa tutmadığı için salon dizilimini değiştirmez.
    if (otoYerlesme && !fYedek) await planiUygula(true, fDate);
    if (fDate !== gun) { gunDegistir(fDate); return; }
    await yenile();
  };

  // BEKLEMEYE AL — kapıya gelen misafire o an yer yoksa geri çevrilmiyor, sıraya yazılıyor
  // (Gökhan, 2026-08-18). Bekleyen masa tutmaz, kapasiteye girmez; masa boşalınca sıradan
  // çağrılır. Kayıt kapı girişi olarak açılır, oturduğunda da kapı girişi olarak kalır.
  const beklemeyeAl = async () => {
    if (!restaurantId || !wName.trim()) return;
    const kisi = Math.max(1, parseInt(wParty, 10) || 1);
    setErr(null);
    setBusy(true);
    const simdi = new Date().toISOString();
    const { data: { session } } = await supabase.auth.getSession();
    let wKartId = wSecKartId;
    const wTel = wPhone.trim();
    if (!wKartId && wTel) {
      const { data: kart } = await supabase.from("kisi_kartlari")
        .upsert({ restaurant_id: restaurantId, phone: wTel }, { onConflict: "restaurant_id,phone", ignoreDuplicates: false })
        .select("id").single();
      wKartId = (kart as { id: string } | null)?.id ?? null;
    }
    const { error } = await supabase.from("reservations").insert({
      restaurant_id: restaurantId,
      guest_name: toTitleTr(wName),
      guest_phone: wTel || null,
      party_size: kisi,
      reserved_at: simdi,
      note: ilkHarfBuyukTr(wNote) || null,
      kisi_karti_id: wKartId,
      source: "kapi",
      status: "bekleniyor",
      bekleme: true,
      bekleme_baslangic: simdi,
      created_by: session?.user.id ?? null,
      alan_hesap_id: benimPersonelId,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setWName(""); setWPhone(""); setWParty("2"); setWNote(""); setWSecKartId(null); setWalkInOpen(false);
    await yenile();
  };

  const dogrudanGir = async () => {
    if (!restaurantId || !wName.trim()) return;
    const kisi = Math.max(1, parseInt(wParty, 10) || 1);
    setErr(null);

    const simdi = new Date().toISOString();
    // YER YOKSA PROGRAM KENDİ BEKLEMEYE ALIR (Gökhan, 2026-08-18: "beklemeye almayı işletme
    // seçmeyecek, program zaten kayıt yapıldığında masa yoksa beklemeye alacak"). Karşılamaya
    // soru sorulmuyor: misafir sıraya yazılır, masa boşalınca program haber verir.
    const yerVar = await masaMusaitMi(bugunIstanbul(), kisi, true);
    const kapasiteYeter = !bugunMu || gunPax + kisi <= toplamKapasite;
    if (!yerVar || !kapasiteYeter) {
      await beklemeyeAl();
      bildirCapacityNotice(`Boş masa yok — ${toTitleTr(wName)} bekleme sırasına alındı.`);
      return;
    }

    let mevcut = 0;
    if (bugunMu) mevcut = gunPax;

    setBusy(true);
    // Kapı girişinde de aynı kural: numara zaten bir müşteriye aitse ikinci kayıt açılmaz,
    // giriş o müşterinin kartına bağlanır (Gökhan, 2026-08-13).
    let wKartId = wSecKartId;
    const wTel = wPhone.trim();
    if (!wKartId && wTel) {
      const { data: kart } = await supabase.from("kisi_kartlari")
        .upsert({ restaurant_id: restaurantId, phone: wTel }, { onConflict: "restaurant_id,phone", ignoreDuplicates: false })
        .select("id").single();
      wKartId = (kart as { id: string } | null)?.id ?? null;
    }
    const { error } = await supabase.rpc("check_in_arrival", {
      p_restaurant: restaurantId, p_guest_name: toTitleTr(wName), p_party_size: kisi,
      p_guest_phone: wTel || null, p_note: ilkHarfBuyukTr(wNote) || null,
      p_kisi_karti_id: wKartId,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setWName(""); setWPhone(""); setWParty("2"); setWNote(""); setWSecKartId(null); setWalkInOpen(false);
    if (bugunMu && mevcut < toplamKapasite && mevcut + kisi >= toplamKapasite) {
      bildirCapacityNotice(`Kapasite bu misafirle doldu (${toplamKapasite}/${toplamKapasite} pax) — başka misafir alınamaz.`);
    }
    if (gun !== bugunIstanbul()) gunDegistir(bugunIstanbul()); else await yenile();
  };

  // Bir rezervasyona atanmış masaların toplam koltuğu — kişi sayısı büyütülünce masa küçük
  // kalabiliyor (Gökhan: "6 kişiden 8'e çıkardım, seçili masa değişmedi") — bunu yakalar.
  const atananKoltuk = (r: Rez) => (rezMasalar[r.id] ?? []).reduce((s, id) => s + (tables.find((t) => t.id === id)?.seat_count ?? 0), 0);
  // Ek sandalye payı MASA BAŞINA geçerli: iki masa birleştiyse iki sandalye eklenebilir.
  const masaYetersiz = (r: Rez) => {
    const masaAdedi = (rezMasalar[r.id] ?? []).length;
    return masaAdedi > 0 && atananKoltuk(r) + masaAdedi * ekSandalye < r.party_size;
  };

  // Gelmedi/İptal olunca atanmış masa hâlâ rezerveyse otomatik boşa çıkar.
  const durumDegistir = async (r: Rez, next: string, cancelReason?: string) => {
    // Garson/PR/salon şefi durum değiştiremez — düğmeleri zaten görmüyor, buradaki fren
    // başka bir yoldan (kısayol, eski ekran) gelmeye karşı.
    if (!durumYetkisi) return;
    setErr(null);
    const { error } = await supabase.rpc("set_reservation_status", { p_reservation_id: r.id, p_status: next, p_cancel_reason: cancelReason ?? null });
    if (error) { setErr(error.message); return; }
    await yenile();
    // İptal/gelmedi yer açar — boşalan masa asıl yerine dönsün (Gökhan: "masaların
    // rezervasyonu iptal oldu, masa tekrar yerine geri dönsün"). Bu, otomatik yerleşim
    // kapalıyken de çalışmalı — o anahtar YENİ rezervasyonları otomatik masaya atamayı
    // kapatır, boşalan masanın kendi asıl yerine fiziksel dönüşünü değil.
    if (next === "iptal" || next === "gelmedi") {
      await planiUygula(true);
      await yedekHaberVer();
    }
  };

  // YEDEK — telefonla alınır, saati yoktur, sadece güne yazılır. Misafir mekânda DEĞİL,
  // evindedir (Gökhan, 2026-08-12: "arar, yer yok, boşalırsa haber veririz dersin").
  // Bu yüzden yer açılınca program kimseyi oturtmaz: arada bir telefon görüşmesi var, o da
  // işletmenin işi. Program sadece haber verir; görüşme olumluysa yedek tek dokunuşla
  // rezervasyona çevrilir. Kapıda bekleyen ise yedek değil WALK-IN'dir, o ayrı bir liste.
  const yedekHaberVer = async () => {
    if (!restaurantId) return;
    const { start, end } = gunSiniri(gun);
    const { data } = await supabase.from("reservations")
      .select("guest_name, party_size")
      .eq("restaurant_id", restaurantId).is("deleted_at", null)
      .eq("yedek", true).eq("status", "bekleniyor")
      .gte("reserved_at", start).lt("reserved_at", end)
      .order("reserved_at", { ascending: true });
    const yedekler = (data as { guest_name: string; party_size: number }[]) ?? [];
    if (yedekler.length === 0) return;
    setUyari({
      baslik: "Yer açıldı — yedekte bekleyen var",
      satirlar: [
        yedekler.slice(0, 3).map((y) => `${y.guest_name} (${y.party_size} kişi)`).join(", ")
          + (yedekler.length > 3 ? ` ve ${yedekler.length - 3} kişi daha` : "") + ".",
        "Arayıp teklif edebilirsin; gelirse kartından yedek işaretini kaldır, rezervasyona döner.",
      ],
    });
  };

  // Yedek → rezervasyon. Yer açıldı, arandı, olumlu döndü: tek dokunuşla listeye geçer ve
  // masa dağıtımına girer (Gökhan, 2026-08-13). Yer yoksa uyarır ama yine de alır — karar
  // işletmenin; zaten telefonda konuşulmuş oluyor.
  const yedegiRezervasyonaAl = async (r: Rez) => {
    setBusy(true); setErr(null);
    const { error } = await supabase.from("reservations").update({ yedek: false, yedekten: true }).eq("id", r.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await yenile();
    await planiUygula(true);
  };

  const iptalEt = (r: Rez) => { if (!durumYetkisi) return; setIptalReason(""); setIptalFor(r); };
  const iptalOnayla = async () => {
    if (!iptalFor) return;
    // Kutu ÖNCE kapanır. Eskiden iptal işi (yeniden dizilim, yedek uyarısı) bitene kadar açık
    // kalıyordu; işletme "olmadı" sanıp ikinci kez basıyordu (Gökhan, 2026-08-15: "evet diyorum
    // ama kutu orada kalıyor").
    const rez = iptalFor;
    const sebep = iptalReason;
    setIptalFor(null);
    setIptalReason("");
    await durumDegistir(rez, "iptal", sebep);
    // ARAMA UYARISI YOK (Gökhan, 2026-08-18): "operasyon sırasında iptal ediyorsam zaten
    // onlar aramıştır, ben neden arayayım". İptal sessizce işlenir; misafire mesaj da gitmez.
  };

  // Masa ata — sadece bugün için anlamlı: işletme masa planını aynı gün yapar.
  // Masa birleştirme (Gökhan: "on kişi kapasite dolana kadar masa seçecek, birden fazla
  // masa birleştirebilecek") — tek masa da olsa, birleştirilmiş birden fazla masa da olsa
  // aynı yoldan gider.
  const masaAta = async (r: Rez, tableIds: string[]) => {
    if (tableIds.length === 0) return;
    setErr(null);
    // NOTTA BAŞKA SALON YAZIYORSA UYAR (Gökhan, 2026-08-14: "notunda teras isteniyor diyen
    // rezervasyona bahçeden masa verdim, buna engel olabilir miyiz"). Yasak değil — son söz
    // işletmenin; ama yanlışlıkla olmasın diye soruyor.
    const istenen = istenenSalon(r, salonlar);
    if (istenen) {
      const disarda = tableIds.filter((id) => tables.find((t) => t.id === id)?.area_id !== istenen);
      if (disarda.length > 0) {
        const salonAdi = salonlar.find((sa) => sa.id === istenen)?.name ?? "o salon";
        const secilenAdlari = disarda.map((id) => tables.find((t) => t.id === id)?.name).filter(Boolean).join(", ");
        const nereden = r.tercih_alan_id === istenen ? "Misafir online" : "Notunda";
        const devam = await confirm(
          `${nereden} ${salonAdi} ${r.tercih_alan_id === istenen ? "seçmiş" : "yazıyor"} ama ${secilenAdlari} başka salonda. Yine de bu masalar verilsin mi?`,
          { danger: false },
        );
        if (!devam) return;
      }
    }
    const { error } = await supabase.rpc("assign_reservation_tables", { p_reservation_id: r.id, p_table_ids: tableIds });
    setAssigningId(null);
    setMasaSecimi([]);
    if (error) { setErr(error.message); return; }
    await yenile();
    // Masaları ELLE seçtiğinde de salon düzeni toparlanır: aynı rezervasyonun masaları yan yana
    // gelir (Gökhan, 2026-08-13: "manuel masa yerleşimi yaptım, sistem masaları rezerve etti
    // ama birleştirmedi"). Yeni atama yapılmaz, sadece düzen tazelenir — otomatik yerleşim
    // kapalıyken de çalışması gereken şey bu.
    await planiUygula(true, gun, false, true);
  };

  // Masayı geri bırak — rezervasyon masasız kalır, masalar havuza döner (Gökhan: "masa seçte
  // boş seçeneği yok, onu koy"). Misafir oturmuşsa masa 'occupied'dır, ona dokunulmaz.
  const masaBosalt = async (r: Rez) => {
    setErr(null);
    const ids = rezMasalar[r.id] ?? [];
    if (ids.length > 0) {
      await supabase.from("restaurant_tables").update({ status: "empty", reservation_note: null }).in("id", ids).eq("status", "reserved");
      await supabase.from("reservation_tables").delete().eq("reservation_id", r.id);
    }
    const { error } = await supabase.from("reservations").update({ table_id: null }).eq("id", r.id);
    setAssigningId(null); setMasaSecimi([]); setMasaAtaKonum(null); setMasaDigerAcik(false);
    if (error) { setErr(error.message); return; }
    await yenile();
    // Masa bırakılınca da düzen toparlanır — boşalan masa yerine döner.
    await planiUygula(true, gun, false, true);
  };

  // Oturtma artık hesap açmıyor — sadece masayı dolu işaretliyor (seat_reservation). Birden
  // fazla masa seçildiyse (Gökhan: "4 kişilik rezervasyonu 2 kişilik masaya oturttu" — tek
  // masa kişi sayısını karşılamıyordu ama program yine de izin vermişti) önce hepsi birleşik
  // atanır (assign_reservation_tables), sonra oturma tek çağrıyla onaylanır — seat_reservation
  // reservation_tables'taki TÜM masaları 'occupied' yapıyor, sadece verilen tekini değil.
  const oturt = async (tableIds: string[]) => {
    if (!seatingFor || tableIds.length === 0) return;
    setBusy(true); setErr(null);
    if (tableIds.length > 1) {
      const { error: birlestirHata } = await supabase.rpc("assign_reservation_tables", { p_reservation_id: seatingFor.id, p_table_ids: tableIds });
      if (birlestirHata) { setBusy(false); setErr(birlestirHata.message); return; }
    }
    const { error } = await supabase.rpc("seat_reservation", { p_reservation_id: seatingFor.id, p_table_id: tableIds[0] });
    if (error) { setBusy(false); setErr(error.message); return; }
    // Kapıda girilen gelen kişi sayısı — rezervasyondakinden farklıysa kaydedilir. Aynıysa
    // yazılmaz; boş kalması "kapıda ayrıca girilmedi" demek (Gökhan, 2026-08-12).
    const gelen = parseInt(gelenKisi, 10);
    if (Number.isFinite(gelen) && gelen > 0 && gelen !== seatingFor.party_size) {
      await supabase.from("reservations").update({ gelen_kisi: gelen }).eq("id", seatingFor.id);
    }
    // Sıradan gelen misafirse bekleme kapanır, beklediği süre kayda geçer (Gökhan, 2026-08-18).
    if (beklemeBiten && beklemeBiten.id === seatingFor.id) {
      await supabase.from("reservations")
        .update({ bekleme: false, bekleme_dakika: beklemeBiten.dakika })
        .eq("id", seatingFor.id);
      setBeklemeBiten(null);
    }
    setBusy(false);
    setSeatingFor(null); setMasaSecimi([]);
    await yenile();
  };
  // Oturtma penceresi açılırken gelen kişi sayısı rezervasyondaki sayıyla dolu gelir.
  const [gelenKisi, setGelenKisi] = useState("");
  const oturtBaslat = (r: Rez) => {
    if (!durumYetkisi) return;
    setMasaSecimi([]);
    setGelenKisi(String(r.gelen_kisi ?? r.party_size));
    setSeatingFor(r);
  };

  // Masası zaten atanmışsa tek tıkla o masaya oturur. Misafir başka masa isterse personel
  // önce Masa hücresinden atamayı değiştirir.
  const oturtDirekt = async (r: Rez) => {
    if (!durumYetkisi || !r.table_id) return;
    // Atanmış masa(lar) kişi sayısını karşılamıyorsa sessizce oturtma — masa seç ekranını aç,
    // mevcut masa(lar) seçili gelsin, üstüne ekleyerek tamamlasın (Gökhan: "4 kişilik
    // rezervasyonun biri 6 kişilik masaya oturdu, biri 2 kişilik masaya oturamadı" — diğer
    // rezervasyonlar oturduğu için masalar oynatılamamış, program yine de tek tık yetersiz
    // masaya oturtmuştu).
    if (masaYetersiz(r)) {
      setMasaSecimi(rezMasalar[r.id] ?? [r.table_id]);
      setGelenKisi(String(r.gelen_kisi ?? r.party_size));
      setSeatingFor(r);
      return;
    }
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("seat_reservation", { p_reservation_id: r.id, p_table_id: r.table_id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await yenile();
  };

  // BEKLEYENİ OTURT — sıradaki misafir masaya geçiyor. Bekleme işareti kalkar, kaç dakika
  // beklediği kayda geçer (Gökhan, 2026-08-18: akşam sonunda kimin ne kadar beklediği
  // görülsün). Kayıt kapı girişi olarak devam eder, ayrı bir kayıt açılmaz.
  const bekleyeniOturt = async (r: Rez) => {
    if (!durumYetkisi) return;
    const dk = r.bekleme_baslangic
      ? Math.max(0, Math.round((Date.now() - new Date(r.bekleme_baslangic).getTime()) / 60000))
      : null;
    // Masası zaten seçilmişse pencere açılmıyor, tek dokunuşla oturuyor (Gökhan, 2026-08-18).
    if (r.table_id && !masaYetersiz(r)) {
      setBusy(true); setErr(null);
      const { error } = await supabase.rpc("seat_reservation", { p_reservation_id: r.id, p_table_id: r.table_id });
      if (error) { setBusy(false); setErr(error.message); return; }
      await supabase.from("reservations").update({ bekleme: false, bekleme_dakika: dk }).eq("id", r.id);
      setBusy(false);
      await yenile();
      return;
    }
    setBeklemeBiten({ id: r.id, dakika: dk });
    setMasaSecimi([]);
    setGelenKisi(String(r.gelen_kisi ?? r.party_size));
    setSeatingFor(r);
  };

  // BEKLEYENE ÖNERİLEN MASA (Gökhan, 2026-08-18: "iki kişilik bir masa boşalırsa iki kişilik
  // bekleyenlerin ikisinde de görünsün, hostes hangisi uygunsa ona oturt desin"). Boş masa,
  // ona sığan bütün bekleyen satırlarında aynı anda görünüyor; ilk oturtulan masayı alır,
  // masa boş olmaktan çıktığı an diğer satırlardan kendiliğinden düşer. Sığan en küçük masa
  // öneriliyor ki büyük masa büyük gruba kalsın.
  const oneriMasa = (kisi: number): TableRow | null =>
    [...bosMasalar].filter((t) => t.seat_count >= kisi).sort((a, b) => a.seat_count - b.seat_count)[0] ?? null;

  // BOŞALAN MASAYA DOĞRUDAN OTURT (Gökhan, 2026-08-18). Masa boşalınca çıkan kutuda
  // karşılama sadece kimin geçeceğini söylüyor; masayı program veriyor, ayrıca masa seçmek
  // gerekmiyor. Boşalan birden fazla masaysa misafire yeteni verilir: tek masa yetiyorsa
  // en küçüğü, yetmiyorsa gereken kadarı birleştirilir.
  const bekleyeniBosalanMasayaOturt = async (r: Rez, masaIds: string[]) => {
    if (!durumYetkisi || masaIds.length === 0) return;
    const adaylar = masaIds
      .map((id) => tables.find((t) => t.id === id))
      .filter(Boolean)
      .sort((a, b) => a!.seat_count - b!.seat_count) as TableRow[];
    const tekBasina = adaylar.find((m) => m.seat_count >= r.party_size);
    const secilen: TableRow[] = [];
    if (tekBasina) {
      secilen.push(tekBasina);
    } else {
      // Büyükten başlayarak topla — en az masayla oturtmak için.
      for (const m of [...adaylar].reverse()) {
        secilen.push(m);
        if (secilen.reduce((t, x) => t + x.seat_count, 0) >= r.party_size) break;
      }
    }
    if (secilen.length === 0) return;
    const dk = r.bekleme_baslangic
      ? Math.max(0, Math.round((Date.now() - new Date(r.bekleme_baslangic).getTime()) / 60000))
      : null;
    setBusy(true); setErr(null);
    if (secilen.length > 1) {
      const { error: birlestirHata } = await supabase.rpc("assign_reservation_tables", {
        p_reservation_id: r.id, p_table_ids: secilen.map((m) => m.id),
      });
      if (birlestirHata) { setBusy(false); setErr(birlestirHata.message); return; }
    }
    const { error } = await supabase.rpc("seat_reservation", { p_reservation_id: r.id, p_table_id: secilen[0].id });
    if (error) { setBusy(false); setErr(error.message); return; }
    await supabase.from("reservations").update({ bekleme: false, bekleme_dakika: dk }).eq("id", r.id);
    setBusy(false);
    setBosalanMasa(null);
    await yenile();
  };

  // Bekleyen vazgeçip gitti — sırada yer kaplamasın, kayıt "gelmedi" olarak kapanır.
  const bekleyenVazgecti = async (r: Rez) => {
    if (!durumYetkisi) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from("reservations")
      .update({ bekleme: false, status: "gelmedi" }).eq("id", r.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await yenile();
  };

  // ─── MESAJLAR (Gökhan, 2026-08-18) ────────────────────────────────────────
  // WhatsApp bağlantısı işletme programı kullanmaya başlarken takılıyor. O güne kadar
  // mesajlar burada hazırlanıp KUYRUĞA yazılıyor; bağlantı gelince kuyruk gönderilecek.
  // Böylece bağlantıyı beklemeden akış çalışır ve hiçbir mesaj kaybolmaz.
  const mesajMetni = (kalip: string | null, r: Rez, varsayilan: string) => {
    const ham = (kalip ?? "").trim() || varsayilan;
    const t = new Date(r.reserved_at);
    return ham
      .replace(/\{isim\}/g, r.guest_name)
      .replace(/\{kisi\}/g, String(r.party_size))
      .replace(/\{saat\}/g, saat(r.reserved_at))
      .replace(/\{tarih\}/g, new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long" }).format(t))
      .replace(/\{isletme\}/g, restaurantName || "");
  };

  // Sessiz saat: bu aralığa denk gelen mesaj bekletilir, aralık bitince gönderilir.
  // Gece yarısını aşan aralık da doğru çalışır (23:00–09:00 gibi).
  const gonderimZamani = (): string => {
    if (!mesajAyar) return new Date().toISOString();
    const simdi = new Date();
    const dk = (hhmm: string) => { const [a, b] = hhmm.split(":").map(Number); return a * 60 + b; };
    const su = simdi.getHours() * 60 + simdi.getMinutes();
    const bas = dk(mesajAyar.sessizBas), bit = dk(mesajAyar.sessizBitis);
    const sessizde = bas < bit ? (su >= bas && su < bit) : (su >= bas || su < bit);
    if (!sessizde) return simdi.toISOString();
    const hedef = new Date(simdi);
    const [sa, sd] = mesajAyar.sessizBitis.split(":").map(Number);
    hedef.setHours(sa, sd, 0, 0);
    if (hedef <= simdi) hedef.setDate(hedef.getDate() + 1);
    return hedef.toISOString();
  };

  const mesajKuyrugaYaz = async (r: Rez, tur: "onay" | "teyit", metin: string, hemen: boolean) => {
    if (!restaurantId || !r.guest_phone) return;
    await supabase.from("mesajlar").insert({
      restaurant_id: restaurantId,
      reservation_id: r.id,
      tur,
      telefon: r.guest_phone,
      metin,
      planlanan_zaman: hemen ? new Date().toISOString() : gonderimZamani(),
    });
  };

  // GÜNLÜK TEYİT TURU — teyit saati gelince o günün bütün rezervasyonlarına tek seferde
  // gider (Gökhan: "teyit saati geldiğinde olan rezervasyonların hepsine gider"). O saatten
  // sonra alınanlar teyitli sayılır, onlara mesaj gitmez.
  const teyitTuruCalistir = useCallback(async () => {
    if (!restaurantId || !mesajAyar?.acik || !mesajAyar.teyitAcik) return;
    if (gun !== bugunIstanbul()) return;
    const simdi = new Date();
    const [ts, td] = mesajAyar.teyitSaat.split(":").map(Number);
    const teyitAn = new Date(simdi); teyitAn.setHours(ts, td, 0, 0);
    if (simdi < teyitAn) return;
    const bekleyenler = rows.filter((r) => !r.bekleme && !r.yedek && r.status === "bekleniyor" && r.teyit_durumu === "yok");
    if (bekleyenler.length === 0) return;
    for (const r of bekleyenler) {
      // Teyit saatinden SONRA alınan rezervasyon teyitli sayılır, mesaj gitmez.
      const sonradanMi = new Date(r.created_at) >= teyitAn;
      if (sonradanMi || !r.guest_phone) {
        await supabase.from("reservations").update({ teyit_durumu: "sayildi", teyit_zamani: new Date().toISOString() }).eq("id", r.id);
        continue;
      }
      await mesajKuyrugaYaz(r, "teyit", mesajMetni(mesajAyar.teyitMetni, r, "Sayın {isim}, bu akşam {saat} için {kisi} kişilik rezervasyonunuz var. Geliyor musunuz?"), false);
      await supabase.from("reservations").update({ teyit_durumu: "bekliyor", teyit_zamani: new Date().toISOString() }).eq("id", r.id);
    }
    await yenile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, mesajAyar, gun, rows]);

  // Teyit saati gelince kendiliğinden çalışır; ekran açık kaldıkça dakikada bir bakar.
  useEffect(() => {
    teyitTuruCalistir();
    const id = setInterval(() => { teyitTuruCalistir(); }, 60000);
    return () => clearInterval(id);
  }, [teyitTuruCalistir]);

  // Ziyaret tamamlandı — masa boşalır, akış kapanır. Bu programın son adımı.
  const tamamlandi = async (r: Rez) => {
    if (!durumYetkisi) return;
    // Hangi masa(lar) boşalıyor — kutuda "şu masa boşaldı" diyebilmek için önceden alınıyor.
    const bosalan = (rezMasalar[r.id] ?? (r.table_id ? [r.table_id] : []))
      .map((id) => tables.find((t) => t.id === id))
      .filter(Boolean) as TableRow[];
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("end_reservation_visit", { p_reservation_id: r.id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await yenile();
    // BEKLEYEN VARSA HABER VER (Gökhan, 2026-08-18). Kutu sadece boşalan masaya sığan
    // bekleyenler varsa çıkıyor; kimse sığmıyorsa hiç görünmüyor.
    const koltuk = bosalan.reduce((t, m) => t + m.seat_count, 0);
    const sigan = bekleyenRows.filter((b) => b.id !== r.id && b.party_size <= koltuk);
    if (bosalan.length > 0 && sigan.length > 0) {
      setBosalanMasa({ ad: bosalan.map((m) => m.name).join(" + "), koltuk, masaIds: bosalan.map((m) => m.id) });
    }
  };

  const updateField = async (r: Rez, patch: Partial<Pick<Rez, "guest_name" | "guest_phone" | "party_size" | "note" | "reserved_at">>) => {
    setErr(null);
    const tam: Record<string, unknown> = { ...patch };
    // NUMARA DEĞİŞİRSE KART DA DEĞİŞİR (Gökhan, 2026-08-15: "numara değişirse yeni kart
    // açılsın"). Misafir masasının ismini düzeltmek kartı değiştirmez — numara ev sahibinin
    // numarası olduğu sürece kayıt onun kartında kalır. Numara girildiği anda o numaranın
    // kartı bulunur/açılır ve kayıt oraya taşınır.
    if ("guest_phone" in patch && restaurantId) {
      const yeniTel = (patch.guest_phone ?? "").trim();
      if (yeniTel !== (r.guest_phone ?? "")) {
        if (yeniTel.replace(/\D/g, "").length >= 10) {
          const { data: kart } = await supabase.from("kisi_kartlari")
            .upsert({ restaurant_id: restaurantId, phone: yeniTel }, { onConflict: "restaurant_id,phone", ignoreDuplicates: false })
            .select("id").single();
          tam.kisi_karti_id = (kart as { id: string } | null)?.id ?? null;
        } else {
          tam.kisi_karti_id = null;
        }
      }
    }
    const { error } = await supabase.from("reservations").update(tam).eq("id", r.id);
    if (error) { setErr(error.message); return; }
    await yenile();
  };

  const bosMasalar = tables.filter((t) => t.status === "empty");
  const tableName = (id: string | null) => tables.find((t) => t.id === id)?.name ?? null;
  // Açılır pencere HER ZAMAN düğmenin altından aşağı açılır, yön değiştirmez (Gökhan: "hâlâ
  // farklı yerlere açılıyor, kendi kutusundan aşağı doğru açılacak") — yukarı dönme yok.
  // Ölçü tek kural (Gökhan: "masa seç kutusu masa butonlarından sağdan soldan 2 mm büyük
  // olacak, birini küçültüp birini büyültme"): kutu = tıklanan düğme + 3'er mm, iç masa
  // düğmeleri de kutudan 2'şer mm içeride. Konum/ölçü px cinsinden buradan, mm eklemesi
  // calc() ile CSS'te yapılıyor — mm'yi px'e elle çevirmeye gerek yok.
  const menuKonum = (rect: DOMRect): Konum => ({ left: rect.left, top: rect.bottom + 2, width: rect.width, height: rect.height });

  // Saat/telefon/kişi/not — hücreye tıklayınca değeri hazır gelen küçük pencere açılır.
  const duzenleAc = (rect: DOMRect, r: Rez, alan: DuzenleAlan) => {
    setDuzenleDeger(
      alan === "saat" ? saat(r.reserved_at)
      : alan === "telefon" ? (r.guest_phone ?? "")
      : alan === "pax" ? String(r.party_size)
      : (r.note ?? "")
    );
    setDuzenleKadin(alan === "pax" && r.kadin_sayisi !== null ? String(r.kadin_sayisi) : "");
    setDuzenleErkek(alan === "pax" && r.erkek_sayisi !== null ? String(r.erkek_sayisi) : "");
    setDuzenle({ rezId: r.id, alan, konum: menuKonum(rect) });
  };
  // SALONU YENİDEN PLANLA — dönemin bütün rezervasyonlarına birden bakıp en iyi dağılımı
  // kurar (bkz. masaPlan.ts). Oturmuş misafirlere ve kilitli rezervasyonlara dokunmaz.
  // Birleşen masaları salon planında yan yana yazar; masayı ilk oynatırken asıl yerini
  // normal_x/y'ye kaydeder ki gün kapanınca oraya dönebilsin.
  // hedefGun: hangi günün salonu dizilecek. Verilmezse görüntülenen gün. Yeni rezervasyon
  // başka bir güne yazıldığında o günün planı kurulsun diye ayrıca alınıyor — eskiden tetik
  // "görüntülenen gün bugün olmalı" şartına bağlıydı ve bu yüzden atlanabiliyordu (Gökhan:
  // "otomatik yerleşim işaretli ama aldığım rezervasyonu masaya atmadı").
  // tamDiz: "Yerleşim yap" düğmesine ELLE basıldığında mevcut atamalar hiç korunmaz, salon
  // sıfırdan değerlendirilir. Otomatik/sessiz çağrılarda (yeni rezervasyon, iptal, kişi sayısı
  // değişimi) mevcut atamalar korunuyor — küçük bir değişiklikte bütün salonu karıştırmasın
  // diye. Ama bu "koru" kuralı, eski/hatalı bir atama hâlâ kişi sayısını karşılıyorsa onu asla
  // yeniden değerlendirmiyordu — düğmeye basılsa bile "sonuç değişmiyor" gibi görünüyordu
  // (Gökhan: "hiçbir şey değişmedi... böyle durumlarda normal düzeni koruması gerekli").
  // Düğme açıkça "düzeni baştan kur" demek, o yüzden orada koruma tamamen kapatılır.
  // sadeceDuzen: hiç YENİ masa ataması yapılmaz. Sadece o günün MEVCUT atamalarına göre salon
  // düzeni tazelenir — birleşik olmayan masalar asıl yerine döner, kalanlar aradaki mesafeyle
  // yeniden dizilir. Gün değişiminde bunun için kullanılıyor (aşağıdaki effect).
  const planiUygula = async (sessiz = false, hedefGun?: string, tamDiz = false, sadeceDuzen = false) => {
    const planGunu = hedefGun ?? gun;
    if (!restaurantId || !planGunu) return;
    // Veriyi ekrandan DEĞİL, doğrudan veritabanından okuyoruz. Ekrandaki liste bir işlemin
    // hemen ardından henüz tazelenmemiş oluyordu; plan eski listeyle kurulunca iptal edilen
    // rezervasyon geri geliyor, otomatik mod da değişikliği anında yansıtmıyordu (Gökhan).
    const { start, end } = gunSiniri(planGunu);
    const [{ data: rData }, { data: tData }] = await Promise.all([
      // YEDEK HARİÇ: yedek masa tutmaz, sıra bekler. Filtre yoktu ve yerleşim yedeklere de
      // masa dağıtıyordu — gerçek rezervasyonlar masasız kalıyordu (Gökhan, 2026-08-12,
      // salon ekran görüntüsü: "masa bulunamayan rezervasyon" listesi doluyken yedekler
      // masalara oturmuştu).
      supabase.from("reservations").select("id, guest_name, guest_phone, party_size, status, masa_kilit, misafir_masasi, misafir_yakin, created_at, reservation_tables(table_id)")
        .eq("restaurant_id", restaurantId).is("deleted_at", null).eq("yedek", false)
        .in("status", ["bekleniyor", "geldi", "oturdu"])
        .gte("reserved_at", start).lt("reserved_at", end),
      // area_id ŞART — bkz. aşağıdaki planMasa.
      supabase.from("restaurant_tables").select("id, seat_count, position_x, position_y, shape, rotated, normal_x, normal_y, area_id")
        .eq("restaurant_id", restaurantId).is("deleted_at", null).order("sort_order"),
    ]);
    type TazeRez = {
      id: string; guest_name: string; guest_phone: string | null; party_size: number; status: string;
      masa_kilit: boolean; misafir_masasi: boolean; misafir_yakin: boolean | null; created_at: string;
      reservation_tables: { table_id: string }[] | null;
    };
    type TazeMasa = { id: string; seat_count: number; position_x: number | null; position_y: number | null; shape: MasaSekli; rotated: boolean; normal_x: number | null; normal_y: number | null; area_id: string | null };
    const rezler = (rData as TazeRez[]) ?? [];
    const masalar = (tData as TazeMasa[]) ?? [];
    if (masalar.length === 0) return;

    const masaOf = (r: TazeRez) => (r.reservation_tables ?? []).map((x) => x.table_id);
    const planMasa = (t: TazeMasa): PlanMasa => ({
      id: t.id, seat_count: t.seat_count, position_x: t.position_x, position_y: t.position_y,
      genislik: govdeCizim(t.shape, t.seat_count, t.rotated).width,
      // Yerleşim hep ASIL konumdan hesaplanır, o an nerede durduğundan değil — yoksa tekrar
      // tekrar "Yerleşim yap" çağrıldıkça kaymalar birikip masalar üst üste biner (Gökhan).
      normalX: t.normal_x, normalY: t.normal_y,
      // SALON — bu satır yokken planlayıcı bütün salonları tek tuval sanıyordu: masaların
      // salonu bilinmediği için Merkez'deki bir masayla Teras'takini "yan yana" kabul edip
      // tek rezervasyona veriyordu (Gökhan, 2026-08-15: "12 kişi hem bahçeden hem terastan
      // masa seçilmiş"). Artık bir rezervasyonun bütün masaları TEK salondan gelir.
      alanId: t.area_id,
    });

    // MİSAFİR MASASI EŞLEŞMESİ (Gökhan, 2026-08-15). Kayıtlar birbirine bağlı değil; ev
    // sahibi burada bulunuyor: aynı numara + aynı isim, misafir olmayan, daha önce açılmış
    // rezervasyon. Bulunamazsa tercih uygulanmaz, masa normal dağıtılır.
    const sade = (r: TazeRez) => `${(r.guest_phone ?? "").replace(/\D/g, "").slice(-10)}|${r.guest_name.trim().toLocaleLowerCase("tr-TR")}`;
    const misafirler: MisafirBagi = {};
    rezler.filter((r) => r.misafir_masasi).forEach((m) => {
      if ((m.guest_phone ?? "").replace(/\D/g, "").length < 10) return;
      const evSahibi = rezler
        .filter((r) => !r.misafir_masasi && r.id !== m.id && sade(r) === sade(m))
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
      if (evSahibi) misafirler[m.id] = { evSahibiId: evSahibi.id, yakin: m.misafir_yakin === true };
    });

    // Oturmuş ve kilitli rezervasyonlar sabit, gerisi yeniden dizilir.
    const sabit = rezler.filter((r) => (r.status === "oturdu" || r.masa_kilit) && masaOf(r).length > 0);
    const sabitIds = new Set(sabit.map((r) => r.id));
    const serbest = rezler.filter((r) => !sabitIds.has(r.id));
    // Mevcut yerleşim planlayıcıya veriliyor — yeten atamalar korunuyor, sadece gereken
    // oynuyor (Gökhan: "ufak bir değişiklikte 7 rezervasyonun masasını değiştiriyor"). Tam
    // yeniden dizimde (elle "Yerleşim yap") bu koruma tamamen kapalı.
    const mevcutAtamalar: Record<string, string[]> = {};
    if (!tamDiz) serbest.forEach((r) => { const ids = masaOf(r); if (ids.length > 0) mevcutAtamalar[r.id] = ids; });
    const { atamalar, yerlesemeyen } = sadeceDuzen
      // Sadece düzen tazeleme: masa dağıtımına hiç karışılmaz, o günün kendi atamaları aynen
      // alınır. Aşağıdaki "yeniAtamalar" karşılaştırması bu yüzden boş çıkar, veritabanında
      // atama değişmez; değişen sadece masaların salondaki yeri olur.
      ? {
          atamalar: Object.fromEntries(rezler.map((r) => [r.id, masaOf(r)]).filter(([, ids]) => (ids as string[]).length > 0)) as Record<string, string[]>,
          yerlesemeyen: [] as string[],
        }
      : salonuPlanla(
          masalar.map(planMasa),
          serbest.map((r) => ({ id: r.id, kisi: r.party_size })),
          sabit.map((r) => ({ rez: { id: r.id, kisi: r.party_size }, masaIds: masaOf(r) })),
          mevcutAtamalar,
          misafirler,
        );
    const yeniAtamalar: { id: string; masaIds: string[] }[] = [];
    serbest.forEach((r) => {
      const yeni = atamalar[r.id];
      if (!yeni) return;
      const eski = masaOf(r);
      if (eski.length !== yeni.length || yeni.some((id) => !eski.includes(id))) yeniAtamalar.push({ id: r.id, masaIds: yeni });
    });
    const kumeler: PlanMasa[][] = [];
    const birlesikMasaIds = new Set<string>();
    Object.values(atamalar).forEach((ids) => {
      if (ids.length > 1) {
        kumeler.push(ids.map((id) => planMasa(masalar.find((t) => t.id === id)!)));
        ids.forEach((id) => birlesikMasaIds.add(id));
      }
    });
    const yerlesemeyenler = yerlesemeyen.map((id) => rezler.find((x) => x.id === id)).filter((r): r is TazeRez => !!r);

    setBusy(true); setErr(null);
    // Plan tek işlemde uygulanır — tek tek gönderilince masalar birbirinin atamasını
    // bozup "listede masası var ama masa boş görünüyor" durumuna düşüyordu (Gökhan).
    if (yeniAtamalar.length > 0) {
      const { error } = await supabase.rpc("apply_seating_plan", {
        p_restaurant: restaurantId,
        p_plan: yeniAtamalar.map((a) => ({ reservation_id: a.id, table_ids: a.masaIds })),
      });
      if (error) { setBusy(false); setErr(error.message); await yenile(); return; }
    }
    // Artık birleşik olmayan masalar asıl yerine döner (Gökhan: "masaların rezervasyonu iptal
    // oldu, masa tekrar yerine geri dönsün").
    //
    // ÖNEMLİ: eve dönüş veritabanına yazılırken elimizdeki `masalar` listesi de aynı anda
    // güncelleniyor. Eskiden yazılmıyordu; aşağıdaki yerleşim hesabı ve "değişti mi"
    // karşılaştırması eve dönüşten ÖNCEKİ eski konumlara bakıyordu. Masanın yeni yeri eski
    // kayda göre "zaten aynı" görünüp yazılmıyor, masa evine dönmüş hâlde kalıyor ve yanına
    // çekilen masanın üstüne biniyordu (Gökhan, 2026-08-10: "masalar üst üste çıkıyor" —
    // MERKEZ'de 2-1 ile 4-1 tam olarak böyle çakışmıştı).
    const kilitliMasaIds = new Set(
      rezler.filter((r) => r.masa_kilit).flatMap((r) => (r.reservation_tables ?? []).map((x) => x.table_id)),
    );
    for (const t of masalar) {
      if (kilitliMasaIds.has(t.id)) continue; // kilitli masa asıl yerine de dönmez
      if (birlesikMasaIds.has(t.id) || t.normal_x === null || t.normal_y === null) continue;
      const evX = t.normal_x, evY = t.normal_y;
      await supabase.from("restaurant_tables")
        .update({ position_x: evX, position_y: evY, normal_x: null, normal_y: null })
        .eq("id", t.id);
      t.position_x = evX; t.position_y = evY; t.normal_x = null; t.normal_y = null;
    }
    // Kilitli rezervasyonların masaları sabit engel — yerleşim onları oynatmaz.
    const kilitliIds = new Set(
      rezler.filter((r) => r.masa_kilit).flatMap((r) => (r.reservation_tables ?? []).map((x) => x.table_id)),
    );
    for (const yer of birlesikYerlesim(kumeler, masalar.map(planMasa), kilitliIds)) {
      const t = masalar.find((x) => x.id === yer.id);
      if (!t || (t.position_x === yer.x && t.position_y === yer.y)) continue;
      await supabase.from("restaurant_tables").update({
        position_x: yer.x, position_y: yer.y,
        normal_x: t.normal_x ?? t.position_x, normal_y: t.normal_y ?? t.position_y,
      }).eq("id", yer.id);
    }
    setBusy(false);
    await yenile();
    if (sessiz) return;
    setUyari({
      baslik: yerlesemeyenler.length === 0 ? "Salon yeniden dizildi" : "Salon dizildi, bir kısmı açıkta kaldı",
      satirlar: [
        `${yeniAtamalar.length} rezervasyonun masası değişti.`,
        ...(yerlesemeyenler.length > 0
          ? [`${yerlesemeyenler.length} rezervasyona masa bulunamadı: ${yerlesemeyenler.map((r) => `${r.guest_name} (${r.party_size} kişi)`).join(", ")}.`]
          : []),
      ],
    });
  };

  // BUGÜNÜN DÜZENİ — salon açıldığında/güne dönüldüğünde bir kez tazelenir.
  //
  // Yerleşim şimdiye kadar SADECE rezervasyon eklenince, iptal/gelmedi olunca ve kişi sayısı
  // değişince çalışıyordu. Gün değiştiğinde hiç çalışmıyordu; bu yüzden masalar önceki günün
  // dizilişinde asılı kalıyordu — biten bir rezervasyonun birleştirdiği masalar dip dibe
  // duruyor, hatta bir sonraki dizilim onların üstüne yazınca masalar üst üste biniyordu
  // (Gökhan, 2026-08-10: "masalar üst üste çıkıyor ve sırada kalmıyor" — MERKEZ'in alt
  // sırasındaki beş masa 4 gün önceki 18 kişilik rezervasyondan kalmaydı).
  //
  // SADECE BUGÜN için çalışır: geçmiş bir güne bakmak, salondaki gerçek masa düzenini
  // oynatmamalı — bu ekran akşam garsonun masaları dizdiği plan.
  // Masa ataması YAPMAZ (sadeceDuzen), o yüzden otomatik yerleşim kapalıyken de güvenli.
  const duzeniTazelenenGun = useRef<string | null>(null);
  useEffect(() => {
    if (!restaurantId || !gun || tables.length === 0) return;
    if (gun !== bugunIstanbul()) return;
    if (duzeniTazelenenGun.current === gun) return;
    duzeniTazelenenGun.current = gun;
    planiUygula(true, gun, false, true);
    // planiUygula her renderda yeniden kuruluyor; bağımlılığa eklenirse effect sürekli tetiklenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, gun, tables.length]);

  // Masaları normal yerine döndürür — gün kapanınca salon eski hâline gelsin diye.
  const masalariNormaleAl = async () => {
    for (const t of tables) {
      if (t.normal_x === null || t.normal_y === null) continue;
      await supabase.from("restaurant_tables")
        .update({ position_x: t.normal_x, position_y: t.normal_y, normal_x: null, normal_y: null })
        .eq("id", t.id);
    }
  };

  // GEÇMİŞ GÜN AÇIK KALDIYSA (Gökhan, 2026-08-13). Programda zamanla kendiliğinden çalışan bir
  // iş yok; akşam kapatılmayan gün sabaha açık giriyor, dünkü misafirler "oturuyor" görünüyor ve
  // masaları bugün kullanılamıyordu. Sabah ilk açılışta dünden kalanlar kapatılır: ayarda
  // "otomatik" ise sessizce, "sor" ise sorulduktan sonra. Bugün ve ileri günlere dokunulmaz.
  //
  // TELEFONDA SADECE KARŞILAMA (Gökhan, 2026-08-18): soru, listeyi kim açtıysa ona
  // soruluyordu — mutfak şefine "kapatalım mı" diye sorulmuş. O rollerde geldi/gelmedi
  // yetkisi zaten yok, gün kapatmak da onların işi değil. Ayar "otomatik" ise sessiz
  // kapatma da aynı şekilde herkeste çalışıyordu; o da artık sadece karşılamada çalışıyor.
  // Masaüstünde davranış aynı — web ana sayfa, orada rol kısıtı yok.
  const gecmisKapatildi = useRef(false);
  useEffect(() => {
    if (!restaurantId || gecmisKapatildi.current || gunKapanis === "") return;
    // Rol sorgusu dönmeden karar verilmiyor: `rolum` null hem "yüklenmedi" hem "işletme
    // sahibi" demek. Bayrak gelmeden çıkılıyor ve gecmisKapatildi işaretlenmiyor ki rol
    // geldiğinde kontrol bir kez çalışabilsin.
    if (isMobile && !rolYuklendi) return;
    if (isMobile && rolum !== null && rolum !== "karsilama") return;
    gecmisKapatildi.current = true;
    (async () => {
      const bugun = bugunIstanbul();
      const { data } = await supabase.from("reservations")
        .select("id, guest_name, status, reserved_at")
        .eq("restaurant_id", restaurantId).is("deleted_at", null)
        .in("status", ["bekleniyor", "geldi", "oturdu"])
        .lt("reserved_at", `${bugun}T00:00:00+03:00`)
        .order("reserved_at", { ascending: false })
        .limit(200);
      const acik = (data as { id: string; guest_name: string; status: string }[]) ?? [];
      if (acik.length === 0) return;
      if (gunKapanis !== "otomatik") {
        const bekleyen = acik.filter((r) => r.status === "bekleniyor").length;
        const ok = await confirm(
          `Geçmiş günlerden ${acik.length} kayıt açık kalmış`
          + (bekleyen > 0 ? ` (${bekleyen} tanesi bekliyor)` : "")
          + `. Kapatıp masaları boşaltalım mı?`,
          { danger: false },
        );
        if (!ok) return;
      }
      for (const r of acik) {
        await supabase.rpc("set_reservation_status", {
          p_reservation_id: r.id,
          p_status: r.status === "bekleniyor" ? "gelmedi" : "tamamlandi",
          p_cancel_reason: null,
        });
      }
      await yenile();
    })();
  }, [restaurantId, gunKapanis, isMobile, rolYuklendi, rolum]); // eslint-disable-line react-hooks/exhaustive-deps

  // GÜNÜ KAPAT (Gökhan: "günü kapat dediğinde bekleyenler gelmedi olarak kapatılır") —
  // gün bitince kimse işaretlemediyse kayıtlar "bekleniyor"da asılı kalmasın. Elle basılınca
  // görüntülenen günü kapatır; geçmiş günler yukarıdaki kontrolde kendiliğinden ele alınır.
  // Kapatılmamış her kayıt: bekleyen "gelmedi"ye, gelen/oturan "tamamlandı"ya döner ve masalar
  // boşalır. Sadece bekleyenlere bakmak yetmiyordu — hepsi "geldi" işaretlenince düğme
  // kayboluyordu, oysa asıl o zaman lazım (Gökhan).
  const acikKayitlar = rows.filter((r) => r.status === "bekleniyor" || r.status === "geldi" || r.status === "oturdu");
  const gunuKapat = async () => {
    if (acikKayitlar.length === 0) {
      setUyari({ baslik: "Kapatılacak kayıt yok", satirlar: ["Bu günde açık kalmış rezervasyon yok."] });
      return;
    }
    const bekleyen = acikKayitlar.filter((r) => r.status === "bekleniyor").length;
    const oturan = acikKayitlar.length - bekleyen;
    const parcalar = [
      ...(bekleyen > 0 ? [`${bekleyen} bekleyen "gelmedi" olacak`] : []),
      ...(oturan > 0 ? [`${oturan} kayıt "tamamlandı" olacak`] : []),
    ];
    const ok = await confirm(`${parcalar.join(", ")} ve masaları boşalacak. Günü kapatalım mı?`, { danger: false });
    if (!ok) return;
    setBusy(true); setErr(null);
    for (const r of acikKayitlar) {
      const yeni = r.status === "bekleniyor" ? "gelmedi" : "tamamlandi";
      const { error } = await supabase.rpc("set_reservation_status", { p_reservation_id: r.id, p_status: yeni, p_cancel_reason: null });
      if (error) { setBusy(false); setErr(error.message); await yenile(); return; }
    }
    // Gün bitti — akşam için oynatılmış masalar normal yerine dönsün (Gökhan).
    await masalariNormaleAl();
    setBusy(false);
    await yenile();
  };

  // Masa kilidi — "müşteri o masayı istemiştir, söz verilmiştir" (Gökhan). Kilitliyken
  // otomatik yerleşme o rezervasyonun masasını ne oynatır ne de başkasına verir.
  const kilitDegistir = async (r: Rez) => {
    setErr(null);
    const { error } = await supabase.from("reservations").update({ masa_kilit: !r.masa_kilit }).eq("id", r.id);
    if (error) { setErr(error.message); return; }
    await yenile();
  };

  // Bu rezervasyon n kişi olursa salon HERKESİ oturtabiliyor mu? Kişi sayısı büyütmek yeni
  // rezervasyon almak kadar yer istiyor; kontrol de aynı olmalı.
  const paxSigarMi = (r: Rez, n: number): boolean => {
    if (tables.length === 0) return true;
    const planMasalar = tables.map((t) => ({
      id: t.id, seat_count: t.seat_count, position_x: t.position_x, position_y: t.position_y,
      alanId: t.area_id,
    }));
    const gruplar = kapasiteliRows.map((x) => ({ id: x.id, kisi: x.id === r.id ? n : x.party_size }));
    return salonuPlanla(planMasalar, gruplar, []).yerlesemeyen.length === 0;
  };
  // Bu rezervasyon en fazla kaç kişi olabilir — reddederken sayıyı da söyleyebilmek için.
  const enBuyukPax = (r: Rez): number => {
    for (let n = r.party_size + 20; n > r.party_size; n--) if (paxSigarMi(r, n)) return n;
    return r.party_size;
  };

  // Kişi sayısı değişimi — kaydeder, sonra otomatik yerleşme açıksa masayı sessizce tamamlar.
  const paxDegistir = async (r: Rez, n: number, kadin: number | null = r.kadin_sayisi, erkek: number | null = r.erkek_sayisi) => {
    setErr(null);
    const { error } = await supabase.from("reservations").update({ party_size: n, kadin_sayisi: kadin, erkek_sayisi: erkek }).eq("id", r.id);
    if (error) { setErr(error.message); return; }
    await yenile();
    // Otomatik modda kişi sayısı değişimi salonu bozabilir — program dizilimi kendi düzeltir.
    if (otoYerlesme) await planiUygula(true);
  };

  // Geçersiz değerde pencere açık kalır (kaydetmez) — yanlışlıkla veri bozulmasın.
  const duzenleKaydet = () => {
    if (!duzenle) return;
    const r = rows.find((x) => x.id === duzenle.rezId);
    if (!r) { setDuzenle(null); return; }
    const v = duzenleDeger.trim();
    if (duzenle.alan === "saat") {
      const m = v.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
      if (!m) return;
      updateField(r, { reserved_at: new Date(`${gunIstanbul(r.reserved_at)}T${m[1].padStart(2, "0")}:${m[2]}:00+03:00`).toISOString() });
    } else if (duzenle.alan === "telefon") {
      updateField(r, { guest_phone: v.replace(/[^\d+ ]/g, "").trim() || null });
    } else if (duzenle.alan === "pax") {
      const n = parseInt(v.replace(/\D/g, ""), 10);
      if (!(n > 0)) return;
      // Kadın + erkek toplamı kişi sayısını aşamaz (Gökhan: "2 kişi ama 3 kadın 3 erkek
      // yazdım aldı rezervasyonu" — çelişkili girişi sessizce kabul etmemeli).
      const kadinN = duzenleKadin.trim() ? parseInt(duzenleKadin, 10) : 0;
      const erkekN = duzenleErkek.trim() ? parseInt(duzenleErkek, 10) : 0;
      if (kadinN + erkekN > n) {
        setErr(`Kadın + erkek toplamı (${kadinN + erkekN}) kişi sayısını (${n}) geçemez.`);
        return;
      }
      // Kişi sayısını BÜYÜTMEK de yeni rezervasyon almak gibidir: salon o hâliyle herkesi
      // oturtamıyorsa izin verilmez (Gökhan: "kapasite ve oturtma imkânı yoksa rezervasyon
      // sayısının çoğaltılmasına da izin vermesin"). Küçültmek her zaman serbest.
      if (n > r.party_size && !paxSigarMi(r, n)) {
        setUyari({
          baslik: `${r.guest_name} ${n} kişi yapılamıyor`,
          satirlar: [
            `Salon baştan dizilse bile bu rezervasyon ${n} kişi olursa herkes oturamıyor.`,
            `Şu an en fazla ${enBuyukPax(r)} kişi yapabilirsin.`,
            "Daha fazlası için başka bir rezervasyon iptal edilmeli ya da küçültülmeli.",
          ],
        });
        return;
      }
      // Otomatik yerleşme açıksa masa yetmez hale geldiğinde program konuyu kendi kapatır —
      // pencere açıp beklemez (Gökhan: "uyarı sistemi değil, kendi aksiyon veren program").
      paxDegistir(r, n, duzenleKadin.trim() ? kadinN : null, duzenleErkek.trim() ? erkekN : null);
    } else {
      updateField(r, { note: ilkHarfBuyukTr(v) || null });
    }
    setDuzenle(null);
  };

  // Masa ata penceresinin içeriği — render sırasında IIFE ile hesaplamak yerine (react-hooks/refs
  // uyarısı tetikliyordu) diğer pencereler (kartFor/kartForKart) gibi düz üst-seviye değerler.
  const assigningRez = assigningId ? rows.find((row) => row.id === assigningId) ?? null : null;
  const assigningBuRezMasalari = assigningRez ? (rezMasalar[assigningRez.id] ?? []) : [];
  const assigningSecilebilir = assigningRez ? tables.filter((t) => t.status === "empty" || assigningBuRezMasalari.includes(t.id)) : [];
  const assigningUygun = assigningRez ? assigningSecilebilir.filter((t) => t.seat_count >= assigningRez.party_size).sort((a, b) => a.seat_count - b.seat_count) : [];
  const assigningDiger = assigningRez ? assigningSecilebilir.filter((t) => t.seat_count < assigningRez.party_size).sort((a, b) => b.seat_count - a.seat_count) : [];
  const assigningSeciliKisi = masaSecimi.reduce((s, id) => s + (tables.find((t) => t.id === id)?.seat_count ?? 0), 0);
  // Bir masaya tıklayınca eklenir/çıkarılır — eklenen seçim kapasiteyi karşılıyorsa (Gökhan:
  // "seçim yapıldığında akordion kapansın ve masa seçilmiş olsun") otomatik atanıp pencere
  // kapanır; tek masa yeterliyse ekstra "Ata" tıklamasına gerek kalmaz.
  const masaToggle = (id: string) => {
    if (!assigningRez) return;
    // Zaten seçili masaya TEKRAR tıklamak "bu kadarı yeter, bunu ata" demek (Gökhan: "7
    // kişilik rezervasyona 6 kişilik masa seçtim, sandalye ekleyip devam edeceğim — iki kere
    // tıklarsam başka masa eklemeden o masayı seçsin"). Kapasite dolmasa da atar.
    if (masaSecimi.includes(id)) { masaAta(assigningRez, masaSecimi); setMasaAtaKonum(null); return; }
    const yeni = [...masaSecimi, id];
    setMasaSecimi(yeni);
    const yeniKisi = yeni.reduce((s, tid) => s + (tables.find((t) => t.id === tid)?.seat_count ?? 0), 0);
    if (yeniKisi >= assigningRez.party_size) { masaAta(assigningRez, yeni); setMasaAtaKonum(null); }
  };

  // "Hangi masaya oturtuyorsun" penceresi de aynı çoklu-seçim mantığını kullanır (Gökhan:
  // "4 kişilik rezervasyonu 2 kişilik masaya oturttu" — tek tıkla hemen oturtan liste, kişi
  // sayısını hiç kontrol etmiyordu). Masa ata ile birebir aynı örüntü: kapasite dolana kadar
  // seçim biriktirir, dolunca ya da aynı masaya tekrar tıklanınca oturtur.
  const seatingUygun = seatingFor ? bosMasalar.filter((t) => t.seat_count >= seatingFor.party_size).sort((a, b) => a.seat_count - b.seat_count) : [];
  const seatingDiger = seatingFor ? bosMasalar.filter((t) => t.seat_count < seatingFor.party_size).sort((a, b) => b.seat_count - a.seat_count) : [];
  const seatingSeciliKisi = masaSecimi.reduce((s, id) => s + (tables.find((t) => t.id === id)?.seat_count ?? 0), 0);
  const seatingToggle = (id: string) => {
    if (!seatingFor) return;
    if (masaSecimi.includes(id)) { oturt(masaSecimi); return; }
    const yeni = [...masaSecimi, id];
    setMasaSecimi(yeni);
    const yeniKisi = yeni.reduce((s, tid) => s + (tables.find((t) => t.id === tid)?.seat_count ?? 0), 0);
    if (yeniKisi >= seatingFor.party_size) oturt(yeni);
  };

  // Masa düğmeleri kutunun içinde sağdan soldan 2'şer mm içeride (kutunun kendi boşluğu),
  // hepsi EŞİT yükseklikte ve aralarında 1 mm (Gökhan: "yükseklikleri eşit olacak, 1 mm
  // arayla açılacak"). Yükseklik tıklanan düğmeden alınır — kutu onun devamı gibi dursun.
  const masaBtnYukseklik = Math.max(masaAtaKonum?.height ?? 26, 26);
  const masaBtnStil = (secili: boolean): React.CSSProperties => ({
    ...masaSecBtn,
    boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
    width: "100%", height: masaBtnYukseklik, marginBottom: "1mm", padding: "0 8px",
    border: `1px solid ${secili ? "var(--brand-strong)" : "var(--line-2)"}`, borderRadius: 10,
    background: secili ? "var(--brand-strong)" : "var(--card)", color: secili ? "#fff" : "var(--ink)",
    fontSize: 12, whiteSpace: "nowrap", overflow: "hidden",
  });

  const bugunMu = gun === bugunIstanbul();
  // Sıralama dört kademeli: aktif akış üstte (kayıt sırasında), sonra kalkanlar, sonra
  // gelmeyenler, en altta iptaller. Array.sort stable — her kademe kendi içinde sırasını korur.
  // LİSTE SIRASI (Gökhan, 2026-08-18): üstte işi bitmemişler durur — önce hiç işaretlenmemiş
  // (bekleniyor), sonra gelmiş ama oturmamışlar. Oturan, tamamlanan, gelmeyen ve iptal aşağı
  // düşer; her grup kendi içinde saat sırasını korur (sıralama kararlı).
  const siraKademe = (s: string) =>
    s === "bekleniyor" ? 0
    : s === "geldi" ? 1
    : s === "oturdu" ? 2
    : s === "tamamlandi" ? 3
    : s === "gelmedi" ? 4
    : 5; // iptal
  // BEKLEYENLER ayrı blokta duruyor (Gökhan, 2026-08-18: "rezervasyon listesinde en üstte")
  // — ana listeye karışmıyorlar, sıraya girdikleri saate göre diziliyorlar.
  const bekleyenRows = rows
    .filter((r) => r.bekleme && r.status === "bekleniyor")
    .sort((a, b) => (a.bekleme_baslangic ?? a.created_at).localeCompare(b.bekleme_baslangic ?? b.created_at));
  const bekleyenPax = bekleyenRows.reduce((s, r) => s + r.party_size, 0);
  const visibleRows = [...rows].filter((r) => !r.bekleme && !r.yedek).sort((a, b) => siraKademe(a.status) - siraKademe(b.status));

  // Kapasite — gün tek havuz (Gökhan: "bu programı öncelik olarak eğlence mekanlarına
  // yapıyoruz, sadece akşamı baz alacağız"). Sadece gerçekten yer kaplayan durumlar sayılır;
  // tamamlanan ziyaret masayı boşalttığı için artık saymaz.
  //
  // Yedek kaldırıldı: kapasite dolduğunda rezervasyon Yedek'e alınmıyor, doğrudan
  // reddediliyor (Gökhan: "yedek rezervasyon almayı durdur"). O yüzden yedek hesabı,
  // YEDEK rozeti ve "Bekleyenler (Yedek)" filtresi de ekrandan kaldırıldı — hiç
  // oluşmayacak bir durumu gösterip kafa karıştırmasınlar.
  const toplamKapasite = tables.reduce((s, t) => s + t.seat_count, 0);
  // Yedek kapasiteyi doldurmaz — masa tutmuyor, sıra bekliyor (Gökhan, 2026-08-12).
  const kapasiteliRows = rows.filter((r) => !r.yedek && !r.bekleme && (r.status === "bekleniyor" || r.status === "geldi" || r.status === "oturdu"));
  const gunPax = kapasiteliRows.reduce((s, r) => s + r.party_size, 0);
  // YEDEK — o gün yer bulunamayan, yer açılırsa aranacak misafirler (Gökhan, 2026-08-18:
  // "yer açılınca arayalım listesi uzun, yedek olarak adlandırmak daha mantıklı"). Masa
  // tutmazlar, kapasiteye girmezler; rezervasyon listesinin ALTINDA kendi listelerinde
  // dururlar. Kapıda bekleyenle karıştırılmaz: bu telefonda bekleyen, o mekânda bekleyen.
  const yedekRows = rows
    .filter((r) => r.yedek && r.status === "bekleniyor")
    .sort((a, b) => a.reserved_at.localeCompare(b.reserved_at));
  const yedekPax = yedekRows.reduce((s, r) => s + r.party_size, 0);
  // BİRLEŞEN MASALAR TEK MASA SAYILIR (Gökhan, 2026-08-18: "kapasite konusunda sıkıntı
  // çıkmasın"). İki masa bir rezervasyon için birleştiğinde salonda fiilen tek masa vardır;
  // o gün için masa sayısı o kadar azalır. Böylece "kaç masa" ile "kaç rezervasyon" aynı dili
  // konuşur: 57 rezervasyon 63 fiziksel masayı tutuyorsa, masa sayısı da 57 görünür.
  const birlesmeFazlasi = kapasiteliRows.reduce(
    (t, r) => t + Math.max(0, (rezMasalar[r.id]?.length ?? (r.table_id ? 1 : 0)) - 1), 0);
  const etkinMasaSayisi = Math.max(0, tables.length - birlesmeFazlasi);

  // FİX MENÜ — o gün fix alan rezervasyon ve kişi sayısı (Gökhan, 2026-08-18). İptal ve
  // gelmedi sayılmıyor; sayaçlarda kapasiteyi dolduran rezervasyonlarla aynı ölçü.
  const fixRows = kapasiteliRows.filter((r) => r.servis_tipi === "fix");
  const fixSayisi = fixRows.length;
  const fixPax = fixRows.reduce((s, r) => s + r.party_size, 0);
  // Masa dökümü — kaç kişilikten kaç tane, kaçı tutulmuş (Gökhan: "masaların karşısında da
  // şu kadarı dolu gösterilsin"). "Dolu" masanın anlık durumu değil, o günün rezervasyonları
  // dağıtıldığında harcanan masa sayısı — ileri tarihli günlerde masa henüz fiilen atanmamış
  // olsa da hesap doğru çıksın diye (bkz. masaPlan.ts).
  const masaBoylari = [...new Set(tables.map((t) => t.seat_count))].sort((a, b) => a - b);
  const gunGruplari = kapasiteliRows.map((r) => r.party_size);
  const masaDagilim = (() => {
    const { havuz } = havuzuTuket(tables, gunGruplari);
    return masaBoylari.map((px) => {
      const adet = tables.filter((t) => t.seat_count === px).length;
      return { px, adet, dolu: adet - (havuz.get(px) ?? 0) };
    });
  })();
  // Pax filtresinde çıkacak kişi sayıları — o gün gerçekten var olanlar, sabit liste değil.
  const paxSecenekleri = [...new Set(visibleRows.map((r) => r.party_size))].sort((a, b) => a - b);

  // Arama — isim, telefon, masa adı, not — herhangi birine göre eşleşirse gösterilir
  // (Gökhan: "her kritere göre arama yapılabilsin").
  const aramaQ = arama.trim().toLocaleLowerCase("tr");
  const filtreliRows = visibleRows.filter((r) => {
    if (filtre === "tumu") { /* devam */ }
    else if (filtre === "gelmedi") { if (r.status !== "gelmedi") return false; }
    else if (filtre === "iptal") { if (r.status !== "iptal") return false; }
    else if (filtre === "rezervasyon" || filtre === "kapi" || filtre === "online") {
      if (!(r.source === filtre && r.status !== "iptal" && r.status !== "gelmedi")) return false;
    }
    if (paxFiltre !== null && r.party_size !== paxFiltre) return false;
    // "Benim masalarım" sadece telefondaki garsonda açılabiliyor (bkz. postamVar).
    if (sadeceBenim && postamVar && !benimRezMi(r)) return false;
    if (!aramaQ) return true;
    const masaAdi = tableName(r.table_id) ?? "";
    return (
      r.guest_name.toLocaleLowerCase("tr").includes(aramaQ)
      || (r.guest_phone ?? "").toLocaleLowerCase("tr").includes(aramaQ)
      || masaAdi.toLocaleLowerCase("tr").includes(aramaQ)
      || (r.note ?? "").toLocaleLowerCase("tr").includes(aramaQ)
    );
  });
  // Rezervasyon saati geldi ama masasında hâlâ önceki misafir oturuyorsa uyarı.
  // GEÇ KALAN MİSAFİR (Gökhan, 2026-08-13: "rezervasyon saati geldiğinde renk değiştirsin,
  // gerisine işletme karar versin, yanında geçen dakika yazsın"). Program kimseyi kendiliğinden
  // gelmedi yapmaz, masasını da almaz — sadece görünür kılar.
  const gecikmeDk = (r: Rez): number | null => {
    if (!bugunMu || r.status !== "bekleniyor" || r.yedek) return null;
    const dk = Math.floor((now - Date.parse(r.reserved_at)) / 60000);
    return dk >= 1 ? dk : null;
  };

  const masaHalaDolu = (r: Rez) =>
    bugunMu && Date.parse(r.reserved_at) <= now
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

  // İşletme adı + (varsa) şube değiştirici — masaüstünde sol menünün tepesinde, mobilde
  // üst satırda kullanılıyor. Tek yerde tanımlı, iki yere kopyalanmıyor.
  const isletmeBasligi = (boyut: number) => (
    subeler.length > 1 ? (
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setSubeSecimiAcik((v) => !v)}
          style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: boyut, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1.1 }}
        >
          {restaurantName || "Rezerve"}
          <ChevronDown size={boyut * 0.75} style={{ transform: subeSecimiAcik ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }} />
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
      // İşletme adı kısalmaz, yer darsa sayfa adı kısalır (Gökhan, 2026-08-17).
      <div style={{ fontSize: boyut, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1.1, flexShrink: 0, whiteSpace: "nowrap" }}>
        {restaurantName || "Rezerve"}
      </div>
    )
  );

  return (
    // Yan çevrilmişken nav yok — altta ona ayrılan yer de kalkıyor, kenar boşlukları da
    // kısılıyor ki liste kutusu ekranı sonuna kadar kullansın (Gökhan, 2026-08-10).
    // Yatayda alt menü çizilmiyor (bkz. RezervasyonAltNav) — altta ona yer ayırmak boş bir
    // şerit bırakıyordu. Sadece o pay kalkıyor, geri kalan düzen aynı.
    <div style={{ background: "var(--canvas)", padding: "20px 24px", paddingBottom: yatayMobil ? 12 : (isMobile ? ALT_NAV_YUKSEKLIK + 16 : 24), height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      {confirmDialog}

      {/* REZERVASYON ALINAMIYOR PENCERESİ — sebebi ve ne yapılması gerektiğini birlikte
          söyler (Gökhan: "pencerede şunu şöyle yaparsan şu masa uygun olur uyarıları"). */}
      {uyari && (
        <>
          <div onClick={() => setUyari(null)} style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", zIndex: 90 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 91, width: "min(420px, 90vw)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 22, boxShadow: "0 18px 50px rgba(30,57,50,.18)" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--danger)", marginBottom: 10 }}>{uyari.baslik}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 20 }}>
              {uyari.satirlar.map((s, i) => (
                <div key={i} style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.45 }}>{s}</div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setUyari(null)} style={{ border: "none", borderRadius: 980, padding: "9px 18px", background: "var(--brand-strong)", color: "#fff", fontSize: 13.5, fontWeight: 500, cursor: "pointer" }}>Tamam</button>
            </div>
          </div>
        </>
      )}

      {/* Kendi başlığı — AIOS kabuğu (sol menü) bu programda yok. RZV rozeti + işletme adı
          aynı satırda (Gökhan, 2026-08-04: "rzv yaz yanında da işletme adı yazsın") —
          eskiden işletme adı "Rezervasyon" başlığının altında 13px soluk gri bir ek gibi
          duruyordu ("küçük ve soluk olması normal mi" — değildi). */}
      {/* Mobilde sarma kapalı — "· Rezervasyon" başlığı eklenince satır taşıp Çıkış düğmesi
          alta düşüyordu (Gökhan, 2026-08-08). Taşma olursa işletme adı kısalır (ellipsis),
          satır bölünmez. */}
      {/* Telefon yan çevrildiğinde bu satır hiç çizilmez — liste kutusu yukarı çıkar, ekrana
          daha çok rezervasyon satırı sığar (Gökhan, 2026-08-10). */}
      {/* MASAÜSTÜNDE BU SATIR YOK (Gökhan, 2026-08-15: "sol menü yap... en üstte işletme adı
          altında da sayfa adı olsun") — işletme adı, sayfa adı ve simgeler sol menüye taşındı.
          Mobilde düzen aynı kaldı, orada sol menü yok. */}
      {!yatayMobil && isMobile && (
      <div style={{ marginBottom: 14, flexShrink: 0, display: "flex", alignItems: "center", gap: 10, flexWrap: "nowrap", rowGap: 10 }}>
        {/* RZV rozeti — tıklanınca rezervasyon listesine döner (Gökhan, 2026-08-08). */}
        <Link href="/rezervasyon" aria-label="Rezervasyonlar" style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--brand)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 10.5, letterSpacing: 0.3, flexShrink: 0, textDecoration: "none" }}>
          RZV
        </Link>
        {/* Şube değiştirici — SADECE çok şubeli hesapta görünür (tek şubeliyse liste zaten
            1 elemanlı, buton anlamsız olurdu). */}
        {isletmeBasligi(24)}
        {/* Sayfa adı işletme isminin yanında — Salon/İstatistikler/Ayarlar'daki ortak üst
            barla (RezervasyonUstBar) birebir aynı punto ve renk (Gökhan, 2026-08-08). */}
        {/* Sayfa adı masaüstünde de görünür — diğer sekmelerdeki ortak üst barla aynı düzen
            (Gökhan, 2026-08-10: "işletme adının yanında diğer sayfalarda olduğu gibi sayfa
            adı yazsın"). Eskiden sadece mobilde çıkıyordu. */}
        <span style={{ fontSize: 24, fontWeight: 500, letterSpacing: "-0.5px", color: "var(--muted)", lineHeight: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>· Rezervasyon</span>
        <div style={{ flex: 1 }} />
        {/* Mobilde İstatistikler/Salon/Ayarlar alttaki nav'a taşındı (Gökhan, 2026-08-08:
            "yukarıda olan simgeleri aşağı tarafa bir nav yapıp oraya taşıyalım") — Çıkış
            şimdilik yerinde kaldı ("çıkış yerinde kalsın"). */}
        <button onClick={cikisYap} aria-label="Çıkış yap" title="Çıkış yap" style={{ ...navBtn, marginTop: 2 }}>
          <LogOut size={19} />
        </button>
      </div>
      )}

      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10, flexShrink: 0 }}>{err}</div>}
      {capacityNotice && (
        <div style={{ fontSize: 12.5, color: "var(--gold-text)", background: "var(--recede)", border: "1px solid var(--gold)", borderRadius: 10, padding: "8px 12px", marginBottom: 10, flexShrink: 0 }}>
          {capacityNotice}
        </div>
      )}

      {/* SOL MENÜ + LİSTE yan yana (Gökhan, 2026-08-15). Menü sabit — gizlenmiyor.
          Liste sağa sıkışıyor, daralma Not sütunundan oluyor (bkz. HeaderCell flex). */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, gap: isMobile ? 0 : 12 }}>
      {/* MENÜ KAPALIYKEN — ince şerit: aç düğmesi, yeni rezervasyon ve kapı girişi
          (Gökhan, 2026-08-18: "kapalıyken de rezervasyon ekle görünür olmalı"). Listeye
          yaklaşık 180 piksel yer açılıyor. */}
      {!isMobile && menuKapali && (
        <aside style={{
          width: 46, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
          border: "1px solid var(--line)", borderRadius: 16, background: "var(--card)",
          padding: "12px 6px", boxSizing: "border-box",
        }}>
          <button onClick={() => menuKapaliYaz(false)} aria-label="Menüyü aç" title="Menüyü aç" style={navBtn}>
            <ChevronRight size={19} />
          </button>
          <div style={{ height: 1, background: "var(--line)", alignSelf: "stretch" }} />
          <button onClick={openNewRes} aria-label="Yeni rezervasyon" title="Yeni rezervasyon" style={{ ...btnPrimary, padding: 8, borderRadius: 12 }}>
            <Plus size={16} />
          </button>
          <button
            onClick={() => { setWName(""); setWPhone(""); setWParty("2"); setWNote(""); setWSecKartId(null); setErr(null); setWalkInOpen(true); }}
            aria-label="Kapı girişi" title="Kapı girişi"
            style={{ ...btnGhost, padding: 8, borderRadius: 12, display: "flex", justifyContent: "center" }}
          >
            <DoorOpen size={16} />
          </button>
          <div style={{ flex: 1 }} />
          <Link href="/rezervasyon/istatistikler" aria-label="İstatistikler" title="İstatistikler" style={{ ...navBtn, textDecoration: "none" }}><BarChart3 size={18} /></Link>
          <Link href="/rezervasyon/salon" aria-label="Salon" title="Salon" style={{ ...navBtn, textDecoration: "none" }}><LayoutGrid size={18} /></Link>
          <Link href="/rezervasyon/ayarlar" aria-label="Ayarlar" title="Ayarlar" style={{ ...navBtn, textDecoration: "none" }}><Settings size={18} /></Link>
        </aside>
      )}
      {!isMobile && !menuKapali && (
        <aside style={{
          width: 226, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10,
          border: "1px solid var(--line)", borderRadius: 16, background: "var(--card)",
          padding: 12, boxSizing: "border-box", overflowY: "auto",
        }}>
          {/* En üstte RZV rozeti + işletme adı, hemen altında sayfa adı. Rozet aşağıdaki
              geçiş satırında da var — ikisi de duruyor (Gökhan, 2026-08-15). */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <RzvRozet />
            <div style={{ minWidth: 0, flex: 1 }}>
              {isletmeBasligi(17)}
              <div style={{ fontSize: 12.5, fontWeight: 500, color: "var(--muted)", lineHeight: 1.2, marginTop: 2 }}>Rezervasyon</div>
            </div>
            {/* Menüyü daralt — listeye yer açar, seçim hatırlanır (Gökhan, 2026-08-18). */}
            <button onClick={() => menuKapaliYaz(true)} aria-label="Menüyü daralt" title="Menüyü daralt" style={{ ...navBtn, padding: 4, flexShrink: 0 }}>
              <ChevronLeft size={18} />
            </button>
          </div>

          <div style={{ height: 1, background: "var(--line)", flexShrink: 0 }} />

          {/* Diğer ekranlar — sayfa adının altındaki çizginin hemen altında (Gökhan,
              2026-08-15: "yan yana 4 butonumuzu sayfa adının altındaki çizginin altına al"). */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", flexShrink: 0 }}>
            <RzvRozet />
            <Link href="/rezervasyon/istatistikler" aria-label="İstatistikler" title="İstatistikler" style={{ ...navBtn, textDecoration: "none" }}>
              <BarChart3 size={19} />
            </Link>
            <Link href="/rezervasyon/salon" aria-label="Salon" title="Salon" style={{ ...navBtn, textDecoration: "none" }}>
              <LayoutGrid size={19} />
            </Link>
            <Link href="/rezervasyon/ayarlar" aria-label="Ayarlar" title="Ayarlar" style={{ ...navBtn, textDecoration: "none" }}>
              <Settings size={19} />
            </Link>
            <button onClick={cikisYap} aria-label="Çıkış yap" title="Çıkış yap" style={navBtn}>
              <LogOut size={19} />
            </button>
          </div>
          <div style={{ height: 1, background: "var(--line)", flexShrink: 0 }} />

          {/* Gün seçimi */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <button onClick={() => gun && gunDegistir(gunKaydir(gun, -1))} aria-label="Önceki gün" style={{ ...navBtn, padding: 2 }}><ChevronLeft size={17} /></button>
            <DatePicker value={gun} onChange={gunDegistir} style={{ flex: 1, padding: "8px 8px", textAlign: "center" }} />
            <button onClick={() => gun && gunDegistir(gunKaydir(gun, 1))} aria-label="Sonraki gün" style={{ ...navBtn, padding: 2 }}><ChevronRight size={17} /></button>
          </div>
          {!bugunMu && <button onClick={() => gunDegistir(bugunIstanbul())} style={{ ...btnGhost, width: "100%", boxSizing: "border-box", justifyContent: "center", display: "flex" }}>Bugün</button>}

          <button onClick={openNewRes} style={{ ...btnPrimary, width: "100%", boxSizing: "border-box" }}><Plus size={14} /> Yeni rezervasyon</button>
          <button onClick={() => { setWName(""); setWPhone(""); setWParty("2"); setWNote(""); setWSecKartId(null); setErr(null); setWalkInOpen(true); }} style={{ ...btnPrimary, width: "100%", boxSizing: "border-box" }}><Plus size={14} /> Kapı girişi</button>
          {/* Gün bitince açıkta kalan her kaydı toplu kapatır — ileri tarihli günde anlamsız. */}
          {gun <= bugunIstanbul() && acikKayitlar.length > 0 && (
            <button onClick={gunuKapat} disabled={busy} style={{ ...btnGhost, width: "100%", boxSizing: "border-box", justifyContent: "center", display: "flex", opacity: busy ? 0.5 : 1 }}>Günü kapat</button>
          )}

          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: inkSoft, pointerEvents: "none" }} />
            <input
              value={arama} onChange={(e) => setArama(e.target.value)}
              placeholder="İsim, telefon, not ara…"
              style={{ ...inp, width: "100%", fontSize: 13, paddingLeft: 30, paddingRight: arama ? 26 : 10, boxSizing: "border-box" }}
            />
            {arama && (
              <button onClick={() => setArama("")} aria-label="Aramayı temizle" style={{ all: "unset", cursor: "pointer", position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", color: inkSoft, display: "flex" }}>
                <X size={13} />
              </button>
            )}
          </div>
          <select value={filtre} onChange={(e) => setFiltre(e.target.value)} style={{ ...inp, width: "100%", fontSize: 13, boxSizing: "border-box" }}>
            <option value="tumu">Tümü</option>
            <option value="rezervasyon">Rezervasyonlar</option>
            <option value="kapi">Kapı girişi</option>
            <option value="online">Online gelenler</option>
            <option value="gelmedi">Gelmediler</option>
            <option value="iptal">İptaller</option>
          </select>

        </aside>
      )}

      {/* Yatayda kutunun iç boşluğu da kısılıyor — ekran yüksekliği yarıya inince 18px'lik
          dolgu iki rezervasyon satırı kadar yer yiyor (Gökhan, 2026-08-10). */}
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: yatayMobil ? 10 : 16, padding: yatayMobil ? "8px 10px" : 18, flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {isMobile && (
          <MobilRezervasyonListesi
            rows={filtreliRows}
            toplamMasa={tables.length}
            toplamKapasite={toplamKapasite}
            doluluk={gunPax}
            yedekMasa={yedekRows.length}
            yedekPax={yedekPax}
            // Mutfak şefinde masa yerine fix/alakart (Gökhan, 2026-08-17). Masanın yanına
            // eklenen "· Fix" kaldırıldı (Gökhan, 2026-08-18): webde fix bilgisi ismin
            // altında duruyor, telefon düzeni ayrıca ele alınacak.
            masaAdi={(r) => (mutfakGorunumu
              ? servisEtiketi(r)
              : (rezMasalar[r.id] ?? []).map((id) => tableName(id)).filter(Boolean).join(" + ") || tableName(r.table_id))}
            gun={gun}
            bugunMu={bugunMu}
            onGunDegistir={gunDegistir}
            onYeniRezervasyon={openNewRes}
            onKartAc={(r) => setKartFor(r)}
            acilir={kartAcilir}
            onKilit={kilitDegistir}
            arama={arama}
            onArama={setArama}
            yatay={yatayMobil}
            postamVar={postamVar}
            benimMi={benimRezMi}
            sadeceBenim={sadeceBenim}
            onSadeceBenim={setSadeceBenim}
          />
        )}
        {!isMobile && (
        <>
        {/* Kontroller sol menüye taşındı (Gökhan, 2026-08-15) — listenin üstü sadece
            sayaçlara kaldı. */}

        {/* Gün tek havuz — öğle/akşam ayrımı yok, tek satır (Gökhan: "sadece akşamı baz
            alacağız"). Kapasite + hangi boydan kaç masa tutulmuş. */}
        {/* Mobildeki düzenin aynısı (Gökhan, 2026-08-08: "mobilde uyguladıklarımızın
            aynılarını webe de uyarlıyorsun değil mi"): tek satırlık eski gösterim yerine
            RZV Masa / Masa ve Kapasite / Doluluk altlı üstlü iki blok, yanında masa dökümü. */}
        <div style={{ marginBottom: 10, flexShrink: 0, fontSize: 12.5, color: inkSoft, display: "flex", alignItems: "center", gap: 28 }}>
          {/* Rakamlar sağa yaslı ızgarada — son basamaklar tam alt alta (Gökhan, 2026-08-18).
              Başlık "RZV Masa" değil sadece "RZV".
              RZV = MASA TUTAN rezervasyon sayısı (Gökhan, 2026-08-18: "sadece geçerli
              rezervasyonlar görünecek, iptal görünemez, operasyon sırasında kafa karışır").
              Eskiden listedeki satır sayısıydı; iptal ve gelmediler de sayıldığı için masa
              sayısından fazla çıkıyordu. Artık iptal, gelmedi ve tamamlanan sayılmıyor;
              bekleyen ve yedek de masa tutmadığı için buraya girmiyor. */}
          <div style={{ display: "grid", gridTemplateColumns: "auto auto", columnGap: 5, rowGap: 2, alignItems: "baseline" }}>
            <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)", textAlign: "right" }}>{kapasiteliRows.length}</span>
            <span>RZV</span>
            <span
              className="tnum"
              title={birlesmeFazlasi > 0 ? `${tables.length} masanın ${birlesmeFazlasi} tanesi birleştirmede kullanıldı — birleşen masalar tek masa sayılıyor.` : undefined}
              style={{ fontWeight: 600, color: "var(--ink)", textAlign: "right" }}
            >
              {etkinMasaSayisi}
            </span>
            <span>Masa</span>
          </div>
          {/* Izgara: Kapasite ve Doluluk rakamları tam alt alta hizalı (Gökhan, 2026-08-15:
              "karşısındaki rakamlarda tam altlı üstlü olsun"). Etiket sütunu genişliğini
              uzun olan belirler, rakamlar sağa yaslı — basamaklar da üst üste gelir. */}
          <div style={{ display: "grid", gridTemplateColumns: "auto auto auto", columnGap: 5, rowGap: 2, alignItems: "baseline" }}>
            <span>Kapasite</span>
            <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)", textAlign: "right" }}>{toplamKapasite}</span>
            <span>pax</span>
            <span>Doluluk</span>
            <span className="tnum" style={{ fontWeight: 600, color: gunPax >= toplamKapasite ? "var(--gold-text)" : "var(--ink)", textAlign: "right" }}>{Math.min(gunPax, toplamKapasite)}</span>
            <span>
              pax
              {gunPax >= toplamKapasite && <span style={{ fontWeight: 600, color: "var(--gold-text)" }}> (dolu)</span>}
            </span>
          </div>
          {/* FİX MENÜ — o gün fix menü alan kaç rezervasyon, kaç kişi (Gökhan, 2026-08-18).
              Kimse almadıysa sıfır olarak duruyor, satır kaybolmuyor. Ayarlar'da fix menü
              KAPALIYSA satır hiç görünmüyor (Gökhan, 2026-08-19: "gece kulübü türündeyim,
              fix işaretli olmamasına rağmen yukarıda fix menü bilgisi var"). */}
          {fixAcik && (
            <div style={{ display: "grid", gridTemplateColumns: "auto auto auto", columnGap: 5, rowGap: 2, alignItems: "baseline" }}>
              <span>Fix</span>
              <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)", textAlign: "right" }}>{fixSayisi}</span>
              <span>rzv</span>
              <span />
              <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)", textAlign: "right" }}>{fixPax}</span>
              <span>pax</span>
            </div>
          )}
          {/* BEKLEYEN — kapıda sıra bekleyenler (Gökhan, 2026-08-18). Masa tutmazlar,
              kapasiteye girmezler; buradaki sayı "kaç masa, kaç kişi bekliyor" demek. */}
          {bekleyenRows.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "auto auto auto", columnGap: 5, rowGap: 2, alignItems: "baseline" }}>
              <span>Bekleyen</span>
              <span className="tnum" style={{ fontWeight: 600, color: "var(--gold-text)", textAlign: "right" }}>{bekleyenRows.length}</span>
              <span>masa</span>
              <span />
              <span className="tnum" style={{ fontWeight: 600, color: "var(--gold-text)", textAlign: "right" }}>{bekleyenPax}</span>
              <span>pax</span>
            </div>
          )}
          {/* Yedek sayacı buradan kaldırıldı (Gökhan, 2026-08-18): yedekler artık
              rezervasyon listesinin altında kendi listesinde duruyor, sayı orada görünüyor. */}
          <div>
            {masaDagilim.map((m, i) => (
              <span key={m.px}>
                {i > 0 && <span style={{ color: "var(--line-2)" }}>{"  ·  "}</span>}
                <span className="tnum">{m.px}</span> pax <span className="tnum" style={{ fontWeight: 600, color: m.dolu >= m.adet ? "var(--gold-text)" : "var(--ink)" }}>{m.dolu}</span>
                <span className="tnum"> / {m.adet}</span>
              </span>
            ))}
          </div>
        </div>

        {/* BAŞLIK SATIRI — sütun genişlikleri SUTUN tablosundan geliyor, satırlarla birebir
            aynı. Aralardaki çizgi de aynı tablodaki AYRAC yuvasında, iki kolonun tam
            ortasında duruyor (Gökhan, 2026-08-18). */}
        <ListHeader gap={0}>
          <HeaderCell width={SUTUN.sn} align="center">SN</HeaderCell>
          <RowSep genislik={AYRAC} />
          <HeaderCell width={SUTUN.zaman} align="center">Zaman</HeaderCell>
          <RowSep genislik={AYRAC} />
          <HeaderCell width={SUTUN.misafir}>Misafir</HeaderCell>
          <RowSep genislik={AYRAC} />
          <HeaderCell width={SUTUN.telefon} align="center">Telefon</HeaderCell>
          <RowSep genislik={AYRAC} />
          <HeaderCell width={SUTUN.pax} align="center">
            {/* Kişi sayısına göre süzme — başlığın kendisi düğme (Gökhan: "paxa filtre koyalım"). */}
            <button
              onClick={(e) => setPaxFiltreKonum(menuKonum(e.currentTarget.getBoundingClientRect()))}
              title="Kişi sayısına göre filtrele"
              style={{ all: "unset", cursor: "pointer", fontSize: 12.5, fontWeight: 700, letterSpacing: 0.4, color: paxFiltre !== null ? "var(--brand-strong)" : "var(--ink)" }}
            >
              PAX{paxFiltre !== null ? ` ${paxFiltre}` : ""}
            </button>
          </HeaderCell>
          <RowSep genislik={AYRAC} />
          {/* Başlık, masa kutusunun ortasında: satırda kutunun yanında kilit için ayrılan
              yer kadar boşluk burada da bırakılıyor, hiza kendiliğinden tutuyor. */}
          <HeaderCell width={SUTUN.masa} align="center" paddingRight={KILIT_YERI}>
            {mutfakGorunumu ? "Servis" : "Masa"}
          </HeaderCell>
          <RowSep genislik={AYRAC} />
          {/* NOT sütunu ESNEK — yer daraldığında daralma buradan olur (Gökhan, 2026-08-15:
              "daraltmayı not alanından yap"). Diğer sütunlar sabit kalır. */}
          <HeaderCell flex>Not</HeaderCell>
          <RowSep genislik={AYRAC} />
          {/* Başlık, düğmelerin kapladığı alanın (DURUM_ALANI) tam ortasında: düğmeler de
              başlık da sağa yaslı ve kenarda aynı boşluğu bırakıyor. */}
          <HeaderCell width={SUTUN.durum} align="right" paddingRight={DURUM_KENAR}>
            <span style={{ display: "inline-block", width: DURUM_ALANI, textAlign: "center" }}>RZV durumu</span>
          </HeaderCell>
        </ListHeader>

        {/* Kaydırma çubuğu gizli — göründüğünde satırlardan ~15px yer çalıyor, başlıklar
            (çubuğun dışında kaldıkları için) alttaki düğmelere göre sağa kaymış görünüyordu
            (Gökhan: "rezervasyon durumu yazısı ortalanmamış"). Fare tekerleği/parmakla kayar. */}
        <div ref={listeKaydirRef} style={{ flex: 1, overflowY: "auto", minHeight: 0, scrollbarWidth: "none" }}>
          {/* BEKLEYENLER — listenin en üstünde ayrı blok (Gökhan, 2026-08-18). Sıraya giriş
              saatine göre dizili: en uzun bekleyen en üstte. Rezervasyon satırlarına
              karışmıyorlar; masa tutmadıkları için masa sütunları da yok. */}
          {bekleyenRows.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--gold-text)", padding: "0 0 4px" }}>
                Bekleyenler
              </div>
              {bekleyenRows.map((r, i) => {
                const bekledi = r.bekleme_baslangic
                  ? Math.max(0, Math.round((now - new Date(r.bekleme_baslangic).getTime()) / 60000))
                  : null;
                // Masası elle seçilmişse o, değilse sığan en küçük boş masa önerilir.
                const secilenMasa = (rezMasalar[r.id] ?? []).map((id) => tableName(id)).filter(Boolean).join(" + ");
                const onerilen = secilenMasa ? null : oneriMasa(r.party_size);
                return (
                  <ListRow key={r.id} yukseklik={33} gap={0} bg="var(--tan-300)">
                    <Cell width={SUTUN.sn} align="center">
                      <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink)" }}>{i + 1}</span>
                    </Cell>
                    <RowSep genislik={AYRAC} />
                    {/* Sıraya giriş saati, altında ne kadar beklediği (Gökhan, 2026-08-18) —
                        masa sütunu masa seçmeye ayrıldı. 30 dakikayı geçen bekleme kırmızı. */}
                    <Cell width={SUTUN.zaman} align="center">
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.15 }}>
                        <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink)" }}>
                          {r.bekleme_baslangic ? saat(r.bekleme_baslangic) : "—"}
                        </span>
                        {bekledi !== null && (
                          <span className="tnum" style={{ fontSize: 9.5, fontWeight: 600, color: bekledi >= 30 ? "var(--danger)" : inkSoft }}>
                            {bekledi < 60 ? `${bekledi} dk` : `${Math.floor(bekledi / 60)}s ${bekledi % 60}dk`}
                          </span>
                        )}
                      </div>
                    </Cell>
                    <RowSep genislik={AYRAC} />
                    <Cell width={SUTUN.misafir}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{r.guest_name}</span>
                    </Cell>
                    <RowSep genislik={AYRAC} />
                    <Cell width={SUTUN.telefon} align="center">
                      <span style={{ fontSize: 12.5, color: "var(--ink)" }}>{r.guest_phone || "—"}</span>
                    </Cell>
                    <RowSep genislik={AYRAC} />
                    <Cell width={SUTUN.pax} align="center">
                      <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink)" }}>{r.party_size}</span>
                    </Cell>
                    <RowSep genislik={AYRAC} />
                    {/* MASA SEÇME — bekleyene buradan masa seçilip oturtuluyor (Gökhan,
                        2026-08-18: "oradan masa seçip oturt dememiz gerekiyor"). Kutu normal
                        satırlarla aynı ölçüde; masa seçilince adı yazıyor. */}
                    <Cell width={SUTUN.masa} align="center">
                      <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%" }}>
                        {assigningId === r.id ? (
                          <span style={{ ...hucreKutu, flex: 1, minWidth: 0 }}>Masa seç…</span>
                        ) : (
                          <button
                            onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setMasaDigerAcik(false); setMasaSecimi(rezMasalar[r.id] ?? []); setMasaAtaKonum(menuKonum(rect)); setAssigningId(r.id); }}
                            title={secilenMasa ? undefined : onerilen ? `${onerilen.name} boşaldı — Oturt deyince bu masaya geçer. Başka masa seçmek için tıkla.` : "Sığan boş masa yok"}
                            style={{
                              ...hucreKutuBtn, flex: 1, minWidth: 0,
                              // Önerilen masa soluk yazılıyor: henüz atanmadı, sadece uygun olan bu.
                              ...(secilenMasa ? {} : onerilen ? { color: "var(--brand-strong)", borderStyle: "dashed" } : {}),
                            }}
                          >
                            {secilenMasa || (onerilen ? onerilen.name : "Masa seç")}
                          </button>
                        )}
                        <span style={{ width: KILIT_YERI - 4, flexShrink: 0 }} />
                      </div>
                    </Cell>
                    <RowSep genislik={AYRAC} />
                    <Cell flex>
                      <span style={{ fontSize: 12, color: inkSoft, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.note || "—"}
                      </span>
                    </Cell>
                    <RowSep genislik={AYRAC} />
                    <ActionsCell width={SUTUN.durum} align="right" gap={0} paddingRight={DURUM_KENAR}>
                      {durumYetkisi && (
                        <>
                          <button
                            onClick={() => (onerilen ? bekleyeniBosalanMasayaOturt(r, [onerilen.id]) : bekleyeniOturt(r))}
                            disabled={busy || (!onerilen && !r.table_id)}
                            title={!onerilen && !r.table_id ? "Sığan boş masa yok" : onerilen ? `${onerilen.name} masasına oturt` : "Masaya oturt"}
                            style={{ ...btnSmallRow, opacity: busy || (!onerilen && !r.table_id) ? 0.5 : 1 }}
                          >
                            Oturt
                          </button>
                          <button onClick={() => bekleyenVazgecti(r)} style={btnGhostRow}>Vazgeçti</button>
                        </>
                      )}
                    </ActionsCell>
                  </ListRow>
                );
              })}
            </div>
          )}
          {filtreliRows.length === 0 && (
            <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>
              {visibleRows.length === 0 ? "Bu gün için kayıt yok." : "Bu filtreye uyan kayıt yok."}
            </div>
          )}
          {filtreliRows.map((r, i) => {
            const info = DURUM_INFO[r.status] ?? DURUM_INFO.bekleniyor;
            const canli = r.status === "geldi";
            const aktif = r.status === "bekleniyor" || r.status === "geldi";
            const doluUyari = masaHalaDolu(r);
            const gecikti = gecikmeDk(r);
            // BU rezervasyona bağlı masa adları (masa birleştirme) — hücrede gösterilir.
            const buRezMasalari = rezMasalar[r.id] ?? [];
            const masaAdi = buRezMasalari.map((id) => tableName(id)).filter(Boolean).join(" + ") || tableName(r.table_id);
            // ESAS MASA ÖNCE — yerinde sabit duran masa (r.table_id) listenin başında, kutuda
            // yazan da o; diğerleri fare kutunun üzerine gelince alt alta (Gökhan, 2026-08-18).
            const masaSirasi = [r.table_id, ...buRezMasalari.filter((id) => id !== r.table_id)].filter(Boolean) as string[];
            const masaAdlari = masaSirasi.map((id) => tableName(id)).filter(Boolean) as string[];
            const anaMasaAdi = masaAdlari[0] ?? "";
            // Atanmış masa kişiyi karşılamıyorsa tekrar tıklamak EKLEMEK içindir (10 kişiye
            // 4 kişilik masa seçilmiş, üstüne masa eklenecek); karşılıyorsa DEĞİŞTİRMEK
            // içindir (Gökhan: "4 kişilik rezervasyona 4 kişilik masa seçtin, tekrar
            // tıklarsan bu değiştirmek içindir") — o yüzden seçim sıfırdan başlar.
            const buRezKisi = buRezMasalari.reduce((s, id) => s + (tables.find((t) => t.id === id)?.seat_count ?? 0), 0);
            const masaEksik = buRezKisi < r.party_size;
            return (
              // Satır 3 mm alçalmıştı, ismin altına Fix yazısı girince alttan 2 mm
              // genişledi (Gökhan, 2026-08-18): 33 + 2mm ≈ 41 px.
              <ListRow key={r.id} yukseklik={41} gap={0} bg={gecikti !== null ? "var(--tan-300)" : info.bg} muted={r.status === "gelmedi" || r.status === "iptal"}>
                <Cell width={SUTUN.sn} align="center">
                  <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink)" }}>{i + 1}</span>
                </Cell>
                <RowSep genislik={AYRAC} />
                {/* OTURANDA SAATİN YERİNE SÜRE (Gökhan, 2026-08-18: "rezervasyon saatinin
                    yerine koyalım"). Misafir masaya geçtiği an bu sütun ne kadardır oturduğunu
                    gösteriyor; rezervasyon saati üzerine gelince yazıyor. Diğer durumlarda
                    saat eskisi gibi, tıklayınca değiştirilebiliyor. */}
                <Cell width={SUTUN.zaman} align="center">
                  <button
                    onClick={(e) => duzenleAc(e.currentTarget.getBoundingClientRect(), r, "saat")}
                    title={r.status === "oturdu" && r.seated_at ? `Rezervasyon saati ${saat(r.reserved_at)} — ${saat(r.seated_at)}'de oturdu` : undefined}
                    style={{ ...hucreYaziBtn, fontSize: 13, fontWeight: 600, color: "var(--ink-green)", fontVariantNumeric: "tabular-nums" }}
                  >
                    {r.status === "oturdu" && r.seated_at ? bekleyenSure(r.seated_at, now) : saat(r.reserved_at)}
                  </button>
                </Cell>
                <RowSep genislik={AYRAC} />
                <Cell width={SUTUN.misafir}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {/* İnsan işareti ismin BAŞINDA (Gökhan: "isimlerin sonundaki insan
                        işaretini başına alalım"). Telefon olmasa da kişi kartı açılır
                        (Gökhan: "rezervasyon alınan herkese kişi kartı açılacak") — telefon
                        varsa numarayla, yoksa isimle geçmiş gösterilir. */}
                    {/* Garson, PR ve salon şefi sadece kendi girdiği rezervasyonda kartı
                        açabilir (Gökhan, 2026-08-17) — başkasınınkinde işaret hiç çıkmaz. */}
                    {kartAcilir(r) && (
                      <button onClick={() => setKartFor(r)} title="Kişi kartı" aria-label="Kişi kartı" style={{ all: "unset", cursor: "pointer", display: "inline-flex", color: inkSoft, flexShrink: 0 }}>
                        <User size={12} />
                      </button>
                    )}
                    <EditableText
                      value={r.guest_name}
                      onSave={(next) => updateField(r, { guest_name: toTitleTr(next) })}
                      style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    />
                    {/* TEYİT — misafir "Geliyorum" dediyse ismin yanında küçük yeşil işaret
                        (Gökhan, 2026-08-18). Teyit soruldu ama cevap yoksa soluk saat işareti. */}
                    {r.teyit_durumu === "geliyor" && (
                      <span
                        title={r.teyit_zamani ? `Misafir teyit etti — ${saat(r.teyit_zamani)}` : "Misafir teyit etti"}
                        style={{ fontSize: 11, fontWeight: 700, color: "var(--brand-strong)", flexShrink: 0 }}
                      >
                        ✓
                      </span>
                    )}
                    {r.teyit_durumu === "bekliyor" && (
                      <span
                        title={r.teyit_zamani ? `Teyit soruldu, cevap bekleniyor — ${saat(r.teyit_zamani)}` : "Teyit soruldu, cevap bekleniyor"}
                        style={{ fontSize: 10.5, color: inkSoft, flexShrink: 0 }}
                      >
                        ⧗
                      </span>
                    )}
                    {/* MİSAFİR — bu masa aynı kişinin ikinci masası, misafirleri için
                        (Gökhan, 2026-08-15). Rozet masayı anlatır: ismi düzeltilse bile
                        masanın misafir masası olduğu değişmez, o yüzden yazı kalır. */}
                    {r.misafir_masasi && (
                      <span
                        title={`Misafir masası — bu kişinin ikinci masası.${r.misafir_yakin ? " Diğer masasına yakın istendi." : " Diğer masasından uzak istendi."}`}
                        style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3, flexShrink: 0, padding: "2px 7px", borderRadius: 980, background: "var(--recede)", color: "var(--gold-text)", border: "1px solid var(--gold)" }}
                      >
                        MİSAFİR
                      </span>
                    )}
                    {canli && r.arrived_at && (
                      <span style={{ fontSize: 11, color: inkSoft, flexShrink: 0 }}>· {bekleyenSure(r.arrived_at, now)} önce geldi</span>
                    )}
                  </div>
                  {/* FİX — ismin altında küçük yazı, paxın altındaki "2K 1E" gibi (Gökhan,
                      2026-08-18). Alakart ayrıca yazılmıyor: yazmıyorsa alakart demek. */}
                  {fixAcik && r.servis_tipi === "fix" && (
                    <div style={{ fontSize: 9.5, lineHeight: 1, color: "var(--brand-strong)", fontWeight: 600 }}>Fix</div>
                  )}
                  {doluUyari && (
                    <div style={{ fontSize: 11, color: "var(--danger)", fontWeight: 600 }}>⚠ Masa hâlâ dolu</div>
                  )}
                </Cell>
                <RowSep genislik={AYRAC} />
                <Cell width={SUTUN.telefon} align="center">
                  <button onClick={(e) => duzenleAc(e.currentTarget.getBoundingClientRect(), r, "telefon")} style={{ ...hucreYaziBtn, fontSize: 12.5, color: "var(--ink)" }}>
                    {r.guest_phone || "—"}
                  </button>
                </Cell>
                <RowSep genislik={AYRAC} />
                <Cell width={SUTUN.pax} align="center">
                  <button
                    onClick={(e) => duzenleAc(e.currentTarget.getBoundingClientRect(), r, "pax")}
                    style={{ ...hucreYaziBtn, fontSize: 12.5, color: "var(--ink)", display: "inline-flex", flexDirection: "column", alignItems: "center", lineHeight: 1.15, gap: 0 }}
                  >
                    <span className="tnum">{r.party_size}</span>
                    {(r.kadin_sayisi !== null || r.erkek_sayisi !== null) && (
                      <span className="tnum" style={{ fontSize: 9.5, color: inkSoft, fontWeight: 400 }}>{r.kadin_sayisi ?? 0}K {r.erkek_sayisi ?? 0}E</span>
                    )}
                  </button>
                </Cell>
                <RowSep genislik={AYRAC} />
                <Cell width={SUTUN.masa} align="center">
                  {/* MUTFAK ŞEFİ — masa numarasıyla işi yok, orada fix/alakart yazıyor
                      (Gökhan, 2026-08-17). */}
                  {mutfakGorunumu ? (
                    <span style={{ fontSize: 12.5, color: r.servis_tipi === "fix" ? "var(--brand-strong)" : "var(--ink)", fontWeight: r.servis_tipi === "fix" ? 600 : 400 }}>
                      {servisEtiketi(r)}
                    </span>
                  ) : (
                    // MASA KUTUSU HER SATIRDA AYNI BOYDA (Gökhan, 2026-08-18: "masa seçilmemiş
                    // rezervasyonlarda kutu büyüyor, hep sabit ölçüde kalsın"). Kutunun yanında
                    // kilit için KILIT_YERI kadar yer ayrılıyor; kilit çizilmese de yer duruyor,
                    // başlık da aynı boşluğu bıraktığı için "MASA" yazısı kutunun tam üstünde.
                    <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%" }}>
                      {assigningId === r.id ? (
                        <span style={{ ...hucreKutu, flex: 1, minWidth: 0 }}>Masa seç…</span>
                      ) : masaAdlari.length > 0 ? (
                        bugunMu && aktif ? (
                          <button
                            onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setMasaDigerAcik(false); setMasaSecimi(masaEksik ? buRezMasalari : []); setMasaAtaKonum(menuKonum(rect)); setAssigningId(r.id); }}
                            // Birden fazla masa varsa hepsi fare kutunun üzerine gelince alt
                            // alta çıkıyor; kutuda sadece esas masa yazıyor (Gökhan, 2026-08-18).
                            onMouseEnter={(e) => { if (masaAdlari.length > 1) setMasaBalon({ id: r.id, masalar: masaAdlari, kutu: e.currentTarget.getBoundingClientRect() }); }}
                            onMouseLeave={() => setMasaBalon(null)}
                            title={masaYetersiz(r) ? `Masa ${r.party_size} kişiye yetmiyor` : undefined}
                            style={{
                              ...(masaYetersiz(r) ? { ...hucreKutuBtn, border: "1px solid var(--danger)", color: "var(--danger)", fontWeight: 600 } : hucreKutuBtn),
                              flex: 1, minWidth: 0, gap: 4,
                            }}
                          >
                            {masaYetersiz(r) ? `⚠ ${anaMasaAdi}` : anaMasaAdi}
                            {masaAdlari.length > 1 && (
                              <span style={{ fontSize: 9.5, color: inkSoft, fontWeight: 400 }}>+{masaAdlari.length - 1}</span>
                            )}
                          </button>
                        ) : (
                          <span
                            onMouseEnter={(e) => { if (masaAdlari.length > 1) setMasaBalon({ id: r.id, masalar: masaAdlari, kutu: e.currentTarget.getBoundingClientRect() }); }}
                            onMouseLeave={() => setMasaBalon(null)}
                            style={{ ...hucreKutu, flex: 1, minWidth: 0, gap: 4 }}
                          >
                            {anaMasaAdi}
                            {masaAdlari.length > 1 && (
                              <span style={{ fontSize: 9.5, color: inkSoft, fontWeight: 400 }}>+{masaAdlari.length - 1}</span>
                            )}
                          </span>
                        )
                      ) : bugunMu && aktif ? (
                        <button
                          onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setMasaDigerAcik(false); setMasaSecimi([]); setMasaAtaKonum(menuKonum(rect)); setAssigningId(r.id); }}
                          style={{ ...hucreKutuBtn, flex: 1, minWidth: 0 }}
                        >
                          Masa seç
                        </button>
                      ) : (
                        <span style={{ ...hucreKutu, flex: 1, minWidth: 0, color: inkSoft, border: "1px solid transparent", background: "transparent" }}>—</span>
                      )}
                      {/* Kilit "müşteriye söz verildi" demek — kilitliyken otomatik yerleşme bu
                          masayı oynatmaz (Gökhan). Kilit yoksa yeri boş duruyor ki kutu kaymasın. */}
                      <span style={{ width: KILIT_YERI - 4, flexShrink: 0, display: "inline-flex", justifyContent: "center" }}>
                        {masaAdlari.length > 0 && bugunMu && aktif && (
                          <button
                            onClick={() => kilitDegistir(r)}
                            title={r.masa_kilit ? "Masa kilitli — program oynatmaz. Açmak için tıkla." : "Masayı kilitle — program bu masayı oynatmasın"}
                            aria-label={r.masa_kilit ? "Masa kilidini aç" : "Masayı kilitle"}
                            style={{ all: "unset", cursor: "pointer", display: "inline-flex", color: r.masa_kilit ? "var(--brand-strong)" : "var(--line-2)" }}
                          >
                            {r.masa_kilit ? <Lock size={13} /> : <Unlock size={13} />}
                          </button>
                        )}
                      </span>
                    </div>
                  )}
                </Cell>
                <RowSep genislik={AYRAC} />
                <Cell flex>
                  <button
                    onClick={(e) => duzenleAc(e.currentTarget.getBoundingClientRect(), r, "not")}
                    // Fare notun üzerine gelince notun tamamı balonda çıkıyor, tıklamaya gerek
                    // yok (Gökhan, 2026-08-18).
                    onMouseEnter={(e) => { if (r.note) setNotBalon({ id: r.id, metin: r.note, kutu: e.currentTarget.getBoundingClientRect() }); }}
                    onMouseLeave={() => setNotBalon(null)}
                    // Not yazısı sola yaslı (Gökhan) — cümle olduğu için soldan okunur.
                    style={{ ...hucreYaziBtn, fontSize: 12, display: "block", width: "100%", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {r.note || "—"}
                  </button>
                </Cell>
                <RowSep genislik={AYRAC} />
                {/* Düğmeler DURUM_ALANI genişliğinde bir yuvada, sağa yaslı — başlık da aynı
                    yuvaya göre ortalandığı için ikisi hep aynı hizada (Gökhan, 2026-08-18). */}
                <ActionsCell width={SUTUN.durum} align="right" gap={0} paddingRight={DURUM_KENAR}>
                  {/* Düğmeler gün geçse de yerinde durur (Gökhan: "belki akşam işaretleyemediler,
                      sabah işaretleyecekler"). Geçmiş günde "Geldi" masayı fiilen doldurmaz —
                      dünkü misafir bugünkü salonu tutmasın diye sadece kayda işlenir. */}
                  {/* DURUM DÜĞMELERİ — garson, PR ve salon şefinde hiç çizilmiyor
                      (Gökhan, 2026-08-17): geldi/gelmedi/iptal karşılamanın işi. */}
                  {durumYetkisi && r.status === "bekleniyor" && (
                    <>
                      <button
                        onClick={() => (bugunMu ? (r.table_id ? oturtDirekt(r) : oturtBaslat(r)) : durumDegistir(r, "geldi"))}
                        disabled={bugunMu && !r.table_id && bosMasalar.length === 0}
                        style={{ ...btnSmallRow, opacity: bugunMu && !r.table_id && bosMasalar.length === 0 ? 0.5 : 1 }}
                      >
                        Geldi
                      </button>
                      <button onClick={() => durumDegistir(r, "gelmedi")} style={btnGhostRow}>Gelmedi</button>
                    </>
                  )}
                  {durumYetkisi && r.status === "geldi" && (
                    <button
                      onClick={() => (bugunMu ? (r.table_id ? oturtDirekt(r) : oturtBaslat(r)) : durumDegistir(r, "tamamlandi"))}
                      disabled={bugunMu && !r.table_id && bosMasalar.length === 0}
                      style={{ ...btnSmallRow, opacity: bugunMu && !r.table_id && bosMasalar.length === 0 ? 0.5 : 1 }}
                    >
                      {bugunMu ? "Oturdu" : "Tamamlandı"}
                    </button>
                  )}
                  {/* Oturan misafirin masasını boşaltan tek adım — bu programın akışını kapatır. */}
                  {durumYetkisi && r.status === "oturdu" && (
                    <button onClick={() => tamamlandi(r)} disabled={busy} style={btnSmallRow}>Tamamlandı</button>
                  )}
                  {/* İş bitti — hesap tutarı buradan giriliyor, zorunlu değil. */}
                  {r.status === "tamamlandi" && (
                    <TutarKutusu tutar={r.hesap_tutari} onKaydet={(metin) => tutarKaydet(r, metin)} />
                  )}
                  {aktif && durumYetkisi ? (
                    <button onClick={() => iptalEt(r)} style={btnGhostRow}>İptal</button>
                  ) : r.status !== "oturdu" ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span title={r.status === "iptal" ? r.cancel_reason ?? undefined : undefined} style={{ fontSize: 11, fontWeight: 700, color: info.color }}>{info.label}</span>
                      {gecikti !== null && (
                        <span className="tnum" title="Rezervasyon saati geçti" style={{ fontSize: 11, fontWeight: 700, color: "var(--danger)", marginLeft: 6, whiteSpace: "nowrap" }}>
                          {gecikti < 60 ? `${gecikti} dk` : `${Math.floor(gecikti / 60)}s ${gecikti % 60}dk`} gecikti
                        </span>
                      )}
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: SOURCE_INFO[r.source]?.color ?? inkSoft }}>
                        ({SOURCE_INFO[r.source]?.label ?? r.source})
                      </span>
                    </span>
                  ) : null}
                </ActionsCell>
              </ListRow>
            );
          })}

          {/* YEDEK — rezervasyon listesinin ALTINDA ayrı liste (Gökhan, 2026-08-18). Bunlar
              o güne yer bulunamamış, yer açılırsa aranacak misafirler; masa tutmazlar,
              kapasiteye girmezler. Kapıda bekleyenle karıştırılmasın diye ayrı: bu telefonda
              bekleyen, o mekânda bekleyen. Görüşme olumluysa "Rezervasyona al" tek dokunuş. */}
          {yedekRows.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--brand)", padding: "0 0 4px" }}>
                Yedek — yer açılırsa aranacak
              </div>
              {yedekRows.map((r, i) => (
                <ListRow key={r.id} yukseklik={33} gap={0} bg="var(--recede)">
                  <Cell width={SUTUN.sn} align="center">
                    <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink)" }}>{i + 1}</span>
                  </Cell>
                  <RowSep genislik={AYRAC} />
                  <Cell width={SUTUN.zaman} align="center">
                    <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink)" }}>{saat(r.reserved_at)}</span>
                  </Cell>
                  <RowSep genislik={AYRAC} />
                  <Cell width={SUTUN.misafir}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{r.guest_name}</span>
                  </Cell>
                  <RowSep genislik={AYRAC} />
                  <Cell width={SUTUN.telefon} align="center">
                    <span style={{ fontSize: 12.5, color: "var(--ink)" }}>{r.guest_phone || "—"}</span>
                  </Cell>
                  <RowSep genislik={AYRAC} />
                  <Cell width={SUTUN.pax} align="center">
                    <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink)" }}>{r.party_size}</span>
                  </Cell>
                  <RowSep genislik={AYRAC} />
                  {/* Yedeğin masası yok — masa sütunu boş kalıyor, hiza bozulmasın diye çizgi. */}
                  <Cell width={SUTUN.masa} align="center">
                    <span style={{ fontSize: 12.5, color: inkSoft }}>—</span>
                  </Cell>
                  <RowSep genislik={AYRAC} />
                  <Cell flex>
                    <span style={{ fontSize: 12, color: inkSoft, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.note || "—"}
                    </span>
                  </Cell>
                  <RowSep genislik={AYRAC} />
                  <ActionsCell width={SUTUN.durum} align="right" gap={0} paddingRight={DURUM_KENAR}>
                    {durumYetkisi && (
                      <>
                        <button onClick={() => yedegiRezervasyonaAl(r)} disabled={busy} style={{ ...btnSmallRow, opacity: busy ? 0.5 : 1 }}>
                          Rezervasyona al
                        </button>
                        <button onClick={() => iptalEt(r)} style={btnGhostRow}>İptal</button>
                      </>
                    )}
                  </ActionsCell>
                </ListRow>
              ))}
            </div>
          )}
        </div>
        </>
        )}
      </div>
      </div>

      {/* YENİ REZERVASYON KATMANI */}
      {/* Mobilde klavye açılınca 100vh küçülüyor, ortalanmış pencere her alan
          değişiminde zıplıyordu (Gökhan, 2026-08-08: "pencere yer değiştiriyor tek
          yerde sabit kalsın") — üstten sabit dursun diye mobilde flex-start. */}
      {newResOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "center", padding: isMobile ? "24px 0" : 0, boxSizing: "border-box", zIndex: 50 }} onClick={() => setNewResOpen(false)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, width: "min(560px, 94vw)", maxHeight: isMobile ? "calc(100svh - 48px)" : "calc(100vh - 48px)", overflowY: "auto", boxSizing: "border-box" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)" }}>Yeni rezervasyon</div>
                {!isMobile && <DatePicker value={fDate} onChange={setFDate} style={{ width: 106, flexShrink: 0, whiteSpace: "nowrap" }} />}
                {fSecKartId && <span style={{ fontSize: 11.5, color: "var(--brand)", whiteSpace: "nowrap" }}>Kart bağlandı ✓</span>}
              </div>
              {/* Mobilde tarih sağa yaslı (Gökhan, 2026-08-08), Vazgeç/Ekle aşağıya sağ
                  alta alındı — masaüstünde değişmedi. */}
              {isMobile && <DatePicker value={fDate} onChange={setFDate} style={{ width: 106, flexShrink: 0, whiteSpace: "nowrap", marginLeft: "auto" }} />}
              {!isMobile && (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setNewResOpen(false)} style={btnSecondary}>Vazgeç</button>
                  <button onClick={submit} disabled={busy || !fName.trim()} style={{ ...btnPrimary, opacity: !fName.trim() ? 0.5 : 1 }}>Ekle</button>
                </div>
              )}
            </div>
            {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{err}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {isMobile ? (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input autoFocus value={fName} onChange={(e) => { setFName(e.target.value); setFSecKartId(null); }} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="İsim soyisim" style={{ ...inp, flex: 1, minWidth: 160 }} />
                    <input value={fParty} onChange={(e) => setFParty(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()} onFocus={(e) => e.target.select()} placeholder="Kişi" inputMode="numeric" style={{ ...inp, width: 56, flexShrink: 0, textAlign: "center" }} />
                    <input value={fKadin} onChange={(e) => setFKadin(e.target.value.replace(/\D/g, ""))} onFocus={(e) => e.target.select()} placeholder="K" title="Kadın sayısı (opsiyonel)" inputMode="numeric" style={{ ...inp, width: 34, flexShrink: 0, textAlign: "center", padding: "8px 2px" }} />
                    <input value={fErkek} onChange={(e) => setFErkek(e.target.value.replace(/\D/g, ""))} onFocus={(e) => e.target.select()} placeholder="E" title="Erkek sayısı (opsiyonel)" inputMode="numeric" style={{ ...inp, width: 34, flexShrink: 0, textAlign: "center", padding: "8px 2px" }} />
                  </div>
                  {!fSecKartId && <MusteriAdaylariListesi adaylar={fAdaylar} onSec={fAdaySec} />}
                  {/* Saat/telefon/kanal aynı satırda (Gökhan: "telefonu saat penceresinin
                      yanına alalım, nereden ulaştı da telefonun yanına saatin satırına"). */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input value={fPhone} onChange={(e) => { setFPhone(e.target.value); setFSecKartId(null); }} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Telefon" inputMode="tel" style={{ ...inp, flex: 1, minWidth: 110 }} />
                    <input type="time" value={fTime} onChange={(e) => setFTime(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...inp, width: "calc(70px - 5mm)", padding: "8px 6px", textAlign: "center", flexShrink: 0 }} />
                    <select value={fKanal} onChange={(e) => setFKanal(e.target.value)} title="Nereden geldi" style={{ ...inp, width: 108, flexShrink: 0 }}>
                      {ILETISIM_KANALI_SECENEKLERI.map((k) => <option key={k} value={k}>{ILETISIM_KANALI_ADI[k]}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={fNote} onChange={(e) => setFNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Özel not" style={{ ...inp, flex: 1 }} />
                    <YedekDugmesi acik={fYedek} onTikla={() => setFYedek((v) => !v)} ipucu={yedekOneri ? `Bu günlerde ortalama ${yedekOneri.limit} masa boşalıyor, şu an ${bekleyenYedek} yedek bekliyor.` : undefined} />
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input autoFocus value={fName} onChange={(e) => { setFName(e.target.value); setFSecKartId(null); }} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="İsim soyisim" style={{ ...inp, flex: 1, minWidth: 160 }} />
                    <input value={fParty} onChange={(e) => setFParty(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()} onFocus={(e) => e.target.select()} placeholder="Kişi" inputMode="numeric" style={{ ...inp, width: 56, flexShrink: 0, textAlign: "center" }} />
                    <input value={fKadin} onChange={(e) => setFKadin(e.target.value.replace(/\D/g, ""))} onFocus={(e) => e.target.select()} placeholder="K" title="Kadın sayısı (opsiyonel)" inputMode="numeric" style={{ ...inp, width: 34, flexShrink: 0, textAlign: "center", padding: "8px 2px" }} />
                    <input value={fErkek} onChange={(e) => setFErkek(e.target.value.replace(/\D/g, ""))} onFocus={(e) => e.target.select()} placeholder="E" title="Erkek sayısı (opsiyonel)" inputMode="numeric" style={{ ...inp, width: 34, flexShrink: 0, textAlign: "center", padding: "8px 2px" }} />
                    <input type="time" value={fTime} onChange={(e) => setFTime(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...inp, width: 96, flexShrink: 0 }} />
                  </div>
                  {!fSecKartId && <MusteriAdaylariListesi adaylar={fAdaylar} onSec={fAdaySec} />}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input value={fPhone} onChange={(e) => { setFPhone(e.target.value); setFSecKartId(null); }} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Telefon" inputMode="tel" style={{ ...inp, width: 150, flexShrink: 0 }} />
                    <select value={fKanal} onChange={(e) => setFKanal(e.target.value)} title="Nereden geldi" style={{ ...inp, width: 108, flexShrink: 0 }}>
                      {ILETISIM_KANALI_SECENEKLERI.map((k) => <option key={k} value={k}>{ILETISIM_KANALI_ADI[k]}</option>)}
                    </select>
                    <input value={fNote} onChange={(e) => setFNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Özel not" style={{ ...inp, flex: 1 }} />
                    <YedekDugmesi acik={fYedek} onTikla={() => setFYedek((v) => !v)} ipucu={yedekOneri ? `Bu günlerde ortalama ${yedekOneri.limit} masa boşalıyor, şu an ${bekleyenYedek} yedek bekliyor.` : undefined} />
                  </div>
                </>
              )}
              {/* MİSAFİR MASASI — sadece program ikinci masayı fark ettiğinde çıkar.
                  İşaretlenirse iki masa olabildiğince yakına konur (birleşmezler),
                  işaretlenmezse olabildiğince uzağa: önce başka salon, o olmazsa salonun
                  öbür ucu (Gökhan, 2026-08-15). */}
              {fMisafirAday && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--recede)", borderRadius: 10, padding: "8px 10px", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "var(--ink)" }}>
                    Bu kişinin bugüne zaten masası var — bu <strong>misafir masası</strong> olarak kaydedilecek.
                  </span>
                  <button
                    type="button"
                    onClick={() => setFMisafirYakin((v) => !v)}
                    style={{
                      all: "unset", cursor: "pointer", fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 980,
                      border: `1px solid ${fMisafirYakin ? "var(--brand-strong)" : "var(--line-2)"}`,
                      background: fMisafirYakin ? "var(--brand-strong)" : "transparent",
                      color: fMisafirYakin ? "#fff" : "var(--ink)", marginLeft: "auto",
                    }}
                  >
                    İki masa yakın olsun
                  </button>
                </div>
              )}
              {/* FIX / ALAKART — sadece ayarlarda fix menü açıkken çıkar (Gökhan,
                  2026-08-17). Mutfak şefi listede masa yerine bunu görüyor. */}
              {fixAcik && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {(["alakart", "fix"] as const).map((tip) => (
                    <button
                      key={tip} type="button" onClick={() => setFServis(tip)}
                      style={{
                        all: "unset", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
                        padding: "6px 14px", borderRadius: 980,
                        border: `1px solid ${fServis === tip ? "var(--brand-strong)" : "var(--line-2)"}`,
                        background: fServis === tip ? "var(--brand-strong)" : "transparent",
                        color: fServis === tip ? "#fff" : "var(--ink)",
                      }}
                    >
                      {tip === "fix" ? "Fix menü" : "Alakart"}
                    </button>
                  ))}
                  {fServis === "fix" && fixMenuler.length > 0 && (
                    <select value={fFixMenu} onChange={(e) => setFFixMenu(e.target.value)} style={{ ...inp, minWidth: 150 }}>
                      <option value="">Menü seç</option>
                      {fixMenuler.map((m) => <option key={m.id} value={m.id}>{m.ad}</option>)}
                    </select>
                  )}
                  {fServis === "fix" && karmaFix && (
                    <input
                      value={fFixKisi} onChange={(e) => setFFixKisi(e.target.value.replace(/\D/g, ""))}
                      onFocus={(e) => e.target.select()} placeholder="Fix kişi" inputMode="numeric"
                      title="Kaç kişi fix menü yiyecek"
                      style={{ ...inp, width: 84, textAlign: "center" }}
                    />
                  )}
                </div>
              )}
              <KisiKartiOzet kart={fKart} phone={fPhone} restaurantId={restaurantId} simdi={now} onChanged={() => setFKartRefresh((v) => v + 1)} esikMudavim={esikMudavim} esikNoShow={esikNoShow} isMobile={isMobile} sadeceGecmisVarsaGoster />
            </div>

            <div style={{ marginTop: 10 }}>
              {kvkkNotice.trim() && (
                <button onClick={() => setKvkkAcik((v) => !v)} style={{ all: "unset", cursor: "pointer", fontSize: 11.5, color: "var(--brand)" }}>
                  {kvkkAcik ? "KVKK aydınlatma metnini gizle" : "KVKK aydınlatma metni"}
                </button>
              )}
              {kvkkAcik && kvkkNotice.trim() && (
                <div style={{ marginTop: 8, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 12, background: "var(--recede)", fontSize: 12, color: "var(--muted)", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 140, overflowY: "auto" }}>
                  {kvkkNotice}
                </div>
              )}
            </div>
            {isMobile && (
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                <button onClick={() => setNewResOpen(false)} style={btnSecondary}>Vazgeç</button>
                <button onClick={submit} disabled={busy || !fName.trim()} style={{ ...btnPrimary, opacity: !fName.trim() ? 0.5 : 1 }}>Ekle</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* REZERVASYONSUZ GİR KATMANI */}
      {walkInOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "center", padding: isMobile ? "24px 0" : 0, boxSizing: "border-box", zIndex: 50 }} onClick={() => setWalkInOpen(false)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, width: "min(560px, 94vw)", maxHeight: isMobile ? "calc(100svh - 48px)" : "calc(100vh - 48px)", overflowY: "auto", boxSizing: "border-box" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 4 }}>Kapı girişi</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, lineHeight: 1.5 }}>
              Kayıt zorunlu değil — hiç kaydetmeden de bir masaya doğrudan oturtabilirsin. Buradan
              girersen bugünün listesinde &quot;Geldi&quot; olarak görünür. Boş masa yoksa misafir
              kendiliğinden bekleme sırasına yazılır.
            </div>
            {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{err}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input autoFocus value={wName} onChange={(e) => { setWName(e.target.value); setWSecKartId(null); }} onKeyDown={(e) => e.key === "Enter" && dogrudanGir()} placeholder="İsim soyisim" style={{ ...inp, flex: 1 }} />
                <input value={wParty} onChange={(e) => setWParty(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && dogrudanGir()} onFocus={(e) => e.target.select()} placeholder="Kişi" inputMode="numeric" style={{ ...inp, width: 70 }} />
              </div>
              {!wSecKartId && <MusteriAdaylariListesi adaylar={wAdaylar} onSec={wAdaySec} />}
              <input value={wPhone} onChange={(e) => { setWPhone(e.target.value); setWSecKartId(null); }} onKeyDown={(e) => e.key === "Enter" && dogrudanGir()} placeholder="Telefon" inputMode="tel" style={inp} />
              {wSecKartId && <div style={{ fontSize: 11.5, color: "var(--brand)" }}>Müşteri kartı bağlandı ✓</div>}
              <KisiKartiOzet kart={wKart} phone={wPhone} restaurantId={restaurantId} simdi={now} onChanged={() => setWKartRefresh((v) => v + 1)} esikMudavim={esikMudavim} esikNoShow={esikNoShow} isMobile={isMobile} sadeceGecmisVarsaGoster />
              <input value={wNote} onChange={(e) => setWNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && dogrudanGir()} placeholder="Özel not" style={inp} />
            </div>

            <div style={{ marginTop: 10 }}>
              {kvkkNotice.trim() && (
                <button onClick={() => setKvkkAcik((v) => !v)} style={{ all: "unset", cursor: "pointer", fontSize: 11.5, color: "var(--brand)" }}>
                  {kvkkAcik ? "KVKK aydınlatma metnini gizle" : "KVKK aydınlatma metni"}
                </button>
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
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "center", padding: isMobile ? "24px 0" : 0, boxSizing: "border-box", zIndex: 55 }} onClick={() => setKartFor(null)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, width: "min(560px, 94vw)", maxHeight: isMobile ? "calc(100svh - 48px)" : "calc(100vh - 48px)", overflowY: "auto", boxSizing: "border-box" }} onClick={(e) => e.stopPropagation()}>
            {/* İsim ve numara YAN YANA, numara alt satırda değil (Gökhan, 2026-08-15).
                Numaranın üstüne dokununca telefon arama ekranı açılır. */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                <span style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)" }}>{kartFor.guest_name}</span>
                {kartFor.guest_phone ? (
                  <a
                    href={isMobile ? telLinki(kartFor.guest_phone) : waLinki(kartFor.guest_phone)}
                    target={isMobile ? undefined : "_blank"}
                    rel={isMobile ? undefined : "noreferrer"}
                    title={isMobile ? "Ara" : "WhatsApp'ta aç"}
                    className="tnum"
                    style={{ fontSize: 12.5, color: "var(--brand)", textDecoration: "none", whiteSpace: "nowrap" }}
                  >
                    Tel : {kartFor.guest_phone}
                  </a>
                ) : (
                  <span style={{ fontSize: 12, color: inkSoft }}>Telefon yok</span>
                )}
              </div>
              <button onClick={() => setKartFor(null)} style={btnSecondary}>Kapat</button>
            </div>
            {/* Mobilde işlem satırda değil kartta (Gökhan: "mobilde işlem yapmak için ismi
                tıklayacak ve kartta halledecek her işi") — masaüstünde bu düğmeler zaten
                listede olduğu için burada tekrar gösterilmiyor. */}
            {isMobile && durumYetkisi && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {kartFor.status === "bekleniyor" && (
                  <>
                    <button
                      onClick={() => (bugunMu ? (kartFor.table_id ? oturtDirekt(kartFor) : oturtBaslat(kartFor)) : durumDegistir(kartFor, "geldi"))}
                      disabled={bugunMu && !kartFor.table_id && bosMasalar.length === 0}
                      style={{ ...btnSmallRow, opacity: bugunMu && !kartFor.table_id && bosMasalar.length === 0 ? 0.5 : 1 }}
                    >
                      Geldi
                    </button>
                    <button onClick={() => durumDegistir(kartFor, "gelmedi")} style={btnGhostRow}>Gelmedi</button>
                  </>
                )}
                {kartFor.status === "geldi" && (
                  <button
                    onClick={() => (bugunMu ? (kartFor.table_id ? oturtDirekt(kartFor) : oturtBaslat(kartFor)) : durumDegistir(kartFor, "tamamlandi"))}
                    disabled={bugunMu && !kartFor.table_id && bosMasalar.length === 0}
                    style={{ ...btnSmallRow, opacity: bugunMu && !kartFor.table_id && bosMasalar.length === 0 ? 0.5 : 1 }}
                  >
                    {bugunMu ? "Oturdu" : "Tamamlandı"}
                  </button>
                )}
                {kartFor.status === "oturdu" && (
                  <button onClick={() => tamamlandi(kartFor)} disabled={busy} style={btnSmallRow}>Kalktı</button>
                )}
                {(kartFor.status === "bekleniyor" || kartFor.status === "geldi") && (
                  <button onClick={() => iptalEt(kartFor)} style={btnGhostRow}>İptal</button>
                )}
              </div>
            )}
            {/* Hesap tutarı buradan kaldırıldı (Gökhan, 2026-08-15: "rezervasyona tamamlandı
                dedikten sonra rezervasyon satırından girilsin") — kartı açar açmaz karşıya
                çıkmasın diye. Girilen tutar aşağıdaki rezervasyon geçmişinde görünüyor. */}
            {/* Kart kısıtlı rollerde başkasının rezervasyonunda zaten hiç açılmıyor — ne
                satırdaki işaret çıkıyor ne de telefonda satır tıklanıyor (Gökhan,
                2026-08-17: "hiçbir şey açılmasın, tıklanamasın"). */}
            {kartFor.guest_phone ? (
              <KisiKartiOzet kart={kartForKart} phone={kartFor.guest_phone} restaurantId={restaurantId} simdi={now} onChanged={() => setKartRefresh((v) => v + 1)} esikMudavim={esikMudavim} esikNoShow={esikNoShow} isMobile={isMobile} />
            ) : kartForGecmis ? (
              <IsimGecmisiOzet gecmis={kartForGecmis} />
            ) : (
              <div style={{ fontSize: 12.5, color: inkSoft }}>Bu isimde başka kayıt yok.</div>
            )}
          </div>
        </div>
      )}

      {/* MASA ATA PENCERESİ — sayfanın en üst seviyesinde, satır/liste kutularının (overflow:
          hidden) İÇİNDE değil. Önceki halde position:fixed olsa da bir satırın (ListRow,
          overflow:hidden) içine yerleştirilmişti, bu yüzden kırpılıp yanlış yerde görünüyordu
          (Gökhan: "yine dışarıda açılıyor, kendi kutusundan açılsın"). Düğmeyle aynı kenarlık
          rengi + hafif gölge + sıfıra yakın boşlukla düğmenin altına yapışık duruyor, ayrı bir
          kutu değil de düğmenin kendisi aşağı açılıyormuş gibi (Gökhan: "farklı bir kutu gibi,
          tıkladığım kutu aşağı açılsın"). */}
      {assigningRez && masaAtaKonum && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => { setAssigningId(null); setMasaDigerAcik(false); setMasaSecimi([]); setMasaAtaKonum(null); }} />
          {/* Genişlik en uzun masa ismine göre (Gökhan: "butonlar kendini en geniş masa ismine
              göre ayarlasın") — max-content. Tıklanan düğmeden dar kalmasın diye alt sınır yine
              düğme + 3'er mm. Kaydırma çubuğu gizli: fare tekerleği/parmakla kayıyor.
              Konum: tıklanan düğmenin ORTASINA hizalı (Gökhan: "masa seçin altına ortala") —
              genişlik içeriğe göre değiştiği için sol kenardan değil, merkezden hizalanıyor. */}
          <div style={{ position: "fixed", left: masaAtaKonum.left + masaAtaKonum.width / 2, transform: "translateX(-50%)", top: masaAtaKonum.top, zIndex: 61, background: "var(--card)", border: "1px solid var(--line-2)", borderRadius: 10, boxShadow: "0 2px 8px rgba(30,25,15,0.1)", padding: "2mm", boxSizing: "border-box", width: "max-content", minWidth: `calc(${masaAtaKonum.width}px + 6mm)`, maxWidth: 260, maxHeight: 280, overflowY: "auto", scrollbarWidth: "none" }}>
            {/* Masa birleştirme (Gökhan: "on kişi kapasite dolana kadar masa seçecek, mesela
                yan yana 3 masayı birleştirdi") — birden fazla masa işaretlenebilir, kapasite
                karşılanınca otomatik onaylanır. */}
            {/* "Boş" — masayı geri bırakmak için (Gökhan: "masa seçte boş seçeneği yok, onu koy").
                Rezervasyonun masası kalkar, masalar havuza döner. */}
            {(rezMasalar[assigningRez.id] ?? []).length > 0 && (
              <button onClick={() => masaBosalt(assigningRez)} style={{ ...masaBtnStil(false), color: "var(--danger)" }}>
                Boş
              </button>
            )}
            {assigningUygun.length === 0 && assigningDiger.length === 0 && <div style={{ fontSize: 11.5, color: inkSoft, padding: "4px 0" }}>Boş masa yok.</div>}
            {assigningUygun.map((t) => {
              const secili = masaSecimi.includes(t.id);
              return (
                <button key={t.id} onClick={() => masaToggle(t.id)} style={masaBtnStil(secili)}>
                  {t.name} <span className="tnum" style={{ color: secili ? "#fff" : inkSoft }}>({t.seat_count} pax)</span>
                </button>
              );
            })}
            {/* "Diğerleri" sadece tek başına yeten bir masa VARKEN katlanır — 8+ kişilik
                rezervasyonlarda o boyda masa olmadığı için liste komple "Diğerleri"nin
                arkasında kalıyordu (Gökhan: "8 kişi ve üstünde diğerleri diye sekme açılıyor,
                onda da normal masa listesi açılsın"). Yeten masa yoksa liste doğrudan açık. */}
            {assigningDiger.length > 0 && (
              masaDigerAcik || assigningUygun.length === 0 ? (
                <>
                  {assigningUygun.length > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: "uppercase", padding: "4px 0 2px" }}>Diğerleri</div>}
                  {assigningDiger.map((t) => {
                    const secili = masaSecimi.includes(t.id);
                    return (
                      <button key={t.id} onClick={() => masaToggle(t.id)} style={masaBtnStil(secili)}>
                        {t.name} <span className="tnum" style={{ color: secili ? "#fff" : inkSoft }}>({t.seat_count} pax)</span>
                      </button>
                    );
                  })}
                </>
              ) : (
                <button
                  onClick={() => setMasaDigerAcik(true)}
                  style={{ ...masaBtnStil(false), color: "var(--brand)" }}
                >
                  Diğerleri (<span className="tnum">{assigningDiger.length}</span>)
                </button>
              )
            )}
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 4, paddingTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span className="tnum" style={{ fontSize: 11, color: assigningSeciliKisi >= assigningRez.party_size ? "var(--brand-strong)" : inkSoft }}>
                {masaSecimi.length} masa · {assigningSeciliKisi}/{assigningRez.party_size} kişi{assigningSeciliKisi >= assigningRez.party_size ? " ✓" : ""}
              </span>
              <button
                onClick={() => { masaAta(assigningRez, masaSecimi); setMasaAtaKonum(null); }}
                disabled={masaSecimi.length === 0}
                style={{ border: "none", borderRadius: 8, padding: "5px 12px", background: "var(--brand-strong)", color: "#fff", fontSize: 12, cursor: "pointer", opacity: masaSecimi.length === 0 ? 0.5 : 1 }}
              >
                Ata
              </button>
            </div>
          </div>
        </>
      )}

      {/* OTURT KATMANI */}
      {seatingFor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setSeatingFor(null)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, minWidth: 320, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 4 }}>{seatingFor.guest_name}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span>Hangi masaya oturtuyorsun?</span>
              {/* Kapıda gerçekten kaç kişi geldi — rezervasyondaki sayı hazır gelir, farklıysa
                  burada düzeltilir (Gökhan, 2026-08-12: "kapıda hemen girilmesi gerekli"). */}
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span>Gelen</span>
                <input
                  value={gelenKisi}
                  onChange={(e) => setGelenKisi(e.target.value.replace(/\D/g, ""))}
                  onFocus={(e) => e.target.select()}
                  inputMode="numeric"
                  style={{ ...inp, width: 52, padding: "5px 6px", textAlign: "center" }}
                />
                <span>kişi</span>
                {Number(gelenKisi || 0) !== seatingFor.party_size && (
                  <span style={{ color: "var(--danger)", fontWeight: 600 }}>
                    (rezervasyon {seatingFor.party_size})
                  </span>
                )}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
              {seatingUygun.length === 0 && seatingDiger.length === 0 && <div style={{ fontSize: 11.5, color: inkSoft, padding: "4px 0" }}>Boş masa yok.</div>}
              {seatingUygun.map((t) => {
                const secili = masaSecimi.includes(t.id);
                return (
                  <button
                    key={t.id} onClick={() => seatingToggle(t.id)} disabled={busy}
                    style={{ ...btnSecondary, justifyContent: "space-between", display: "flex", border: secili ? "1px solid var(--brand-strong)" : undefined, background: secili ? "var(--brand-strong)" : undefined, color: secili ? "#fff" : undefined }}
                  >
                    <span>{t.name}</span>
                    <span className="tnum" style={{ color: secili ? "#fff" : "var(--muted)" }}>{t.seat_count} pax</span>
                  </button>
                );
              })}
              {seatingDiger.length > 0 && (
                <>
                  {seatingUygun.length > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: "uppercase", padding: "4px 0 2px" }}>Birleştirmek için</div>}
                  {seatingDiger.map((t) => {
                    const secili = masaSecimi.includes(t.id);
                    return (
                      <button
                        key={t.id} onClick={() => seatingToggle(t.id)} disabled={busy}
                        style={{ ...btnSecondary, justifyContent: "space-between", display: "flex", border: secili ? "1px solid var(--brand-strong)" : undefined, background: secili ? "var(--brand-strong)" : undefined, color: secili ? "#fff" : undefined }}
                      >
                        <span>{t.name}</span>
                        <span className="tnum" style={{ color: secili ? "#fff" : "var(--muted)" }}>{t.seat_count} pax</span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
            {masaSecimi.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span className="tnum" style={{ fontSize: 11, color: seatingSeciliKisi >= seatingFor.party_size ? "var(--brand-strong)" : inkSoft }}>
                  {masaSecimi.length} masa · {seatingSeciliKisi}/{seatingFor.party_size} kişi{seatingSeciliKisi >= seatingFor.party_size ? " ✓" : ""}
                </span>
                {seatingSeciliKisi < seatingFor.party_size && (
                  <button onClick={() => oturt(masaSecimi)} disabled={busy} style={{ ...btnGhostRow, color: "var(--gold-text)" }}>Yine de oturt</button>
                )}
              </div>
            )}
            <button onClick={() => { setSeatingFor(null); setMasaSecimi([]); }} style={{ all: "unset", cursor: "pointer", fontSize: 13, color: "var(--muted)", marginTop: 14, display: "block" }}>Vazgeç</button>
          </div>
        </div>
      )}

      {/* SAAT / TELEFON / KİŞİ / NOT PENCERESİ — masa seç penceresiyle aynı yerleşim. */}
      {duzenle && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setDuzenle(null)} />
          <div style={{ position: "fixed", left: duzenle.konum.left + duzenle.konum.width / 2, transform: "translateX(-50%)", top: duzenle.konum.top, zIndex: 61, background: "var(--card)", border: "1px solid var(--line-2)", borderRadius: 10, boxShadow: "0 2px 8px rgba(30,25,15,0.1)", padding: "2mm", boxSizing: "border-box", width: "max-content", minWidth: 170, maxWidth: 260 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: inkSoft, textTransform: "uppercase", paddingBottom: 4 }}>{DUZENLE_BASLIK[duzenle.alan]}</div>
            <input
              autoFocus
              value={duzenleDeger}
              onChange={(e) => setDuzenleDeger(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); duzenleKaydet(); } if (e.key === "Escape") setDuzenle(null); }}
              onFocus={duzenle.alan === "pax" ? (e) => e.target.select() : undefined}
              placeholder={DUZENLE_IPUCU[duzenle.alan]}
              autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
              inputMode={duzenle.alan === "not" ? "text" : "numeric"}
              style={{ ...inp, width: "100%", boxSizing: "border-box", padding: "6px 8px", fontSize: 12.5 }}
            />
            {duzenle.alan === "pax" && (
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                <input
                  value={duzenleKadin} onChange={(e) => setDuzenleKadin(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); duzenleKaydet(); } if (e.key === "Escape") setDuzenle(null); }}
                  onFocus={(e) => e.target.select()}
                  placeholder="K" title="Kadın sayısı (opsiyonel)" inputMode="numeric"
                  style={{ ...inp, width: 36, flexShrink: 0, boxSizing: "border-box", padding: "6px 4px", fontSize: 12.5, textAlign: "center" }}
                />
                <input
                  value={duzenleErkek} onChange={(e) => setDuzenleErkek(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); duzenleKaydet(); } if (e.key === "Escape") setDuzenle(null); }}
                  onFocus={(e) => e.target.select()}
                  placeholder="E" title="Erkek sayısı (opsiyonel)" inputMode="numeric"
                  style={{ ...inp, width: 36, flexShrink: 0, boxSizing: "border-box", padding: "6px 4px", fontSize: 12.5, textAlign: "center" }}
                />
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
              <button onClick={() => setDuzenle(null)} style={{ ...btnGhostRow, fontSize: 11.5 }}>Vazgeç</button>
              <button onClick={duzenleKaydet} style={{ ...btnSmallRow, fontSize: 11.5 }}>Kaydet</button>
            </div>
          </div>
        </>
      )}

      {/* NOT BALONU — fare notun üzerine gelince notun tamamı okunuyor, tıklamaya gerek yok
          (Gökhan, 2026-08-18). Fare balonu kapatmasın diye tıklamayı geçirmiyor. */}
      {notBalon && (
        <div style={{
          position: "fixed", left: notBalon.kutu.left, top: notBalon.kutu.bottom + 4, zIndex: 62,
          maxWidth: 420, background: "var(--card)", border: "1px solid var(--line-2)", borderRadius: 10,
          boxShadow: "0 2px 8px rgba(30,25,15,0.1)", padding: "2mm 3mm", boxSizing: "border-box",
          fontSize: 12, lineHeight: 1.35, color: "var(--ink)", whiteSpace: "pre-wrap", pointerEvents: "none",
        }}>
          {notBalon.metin}
        </div>
      )}


      {/* MASA BOŞALDI — BEKLEYENLER (Gökhan, 2026-08-18). Karşılamanın önüne çıkar, sadece
          boşalan masaya sığan bekleyenleri gösterir, en uzun bekleyen en üstte. Sığan kimse
          kalmadıysa kutu kendiliğinden kapanır. "Sonra" denince kapanır, sıra durur. */}
      {bosalanMasa && bekleyenRows.some((b) => b.party_size <= bosalanMasa.koltuk) && (
        <>
          <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", zIndex: 70 }} onClick={() => setBosalanMasa(null)} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 71, width: "min(460px, 92vw)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 20, boxShadow: "0 18px 50px rgba(30,57,50,.18)", boxSizing: "border-box" }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 2 }}>
              {bosalanMasa.ad} boşaldı
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>
              {bosalanMasa.koltuk} kişilik. Kimi oturtacağını seç — masayı program veriyor,
              ayrıca masa seçmen gerekmiyor.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
              {bekleyenRows.filter((b) => b.party_size <= bosalanMasa.koltuk).map((b) => {
                const bekledi = b.bekleme_baslangic
                  ? Math.max(0, Math.round((now - new Date(b.bekleme_baslangic).getTime()) / 60000))
                  : null;
                return (
                  <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--line-2)", borderRadius: 10 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.guest_name}</span>
                    <span className="tnum" style={{ fontSize: 12.5, color: inkSoft, flexShrink: 0 }}>{b.party_size} pax</span>
                    <span className="tnum" style={{ fontSize: 12.5, color: bekledi !== null && bekledi >= 30 ? "var(--danger)" : inkSoft, flexShrink: 0 }}>
                      {bekledi === null ? "" : bekledi < 60 ? `${bekledi} dk` : `${Math.floor(bekledi / 60)}s ${bekledi % 60}dk`}
                    </span>
                    <button
                      onClick={() => bekleyeniBosalanMasayaOturt(b, bosalanMasa.masaIds)}
                      disabled={busy}
                      title={`${bosalanMasa.ad} masasına oturt`}
                      style={{ ...btnSmall, opacity: busy ? 0.5 : 1 }}
                    >
                      Oturt
                    </button>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setBosalanMasa(null)} style={btnSecondary}>Sonra</button>
            </div>
          </div>
        </>
      )}

      {/* MASA BALONU — birden fazla masa varsa hepsi alt alta, esas masa en üstte. Aşağıda
          yer kalmadıysa kutunun üstüne açılıyor (Gökhan, 2026-08-18). */}
      {masaBalon && (
        <div style={{
          position: "fixed", left: masaBalon.kutu.left + masaBalon.kutu.width / 2, transform: "translateX(-50%)",
          ...(masaBalon.kutu.bottom + 8 + masaBalon.masalar.length * 20 > window.innerHeight
            ? { bottom: window.innerHeight - masaBalon.kutu.top + 4 }
            : { top: masaBalon.kutu.bottom + 4 }),
          zIndex: 62, minWidth: masaBalon.kutu.width, background: "var(--card)", border: "1px solid var(--line-2)",
          borderRadius: 10, boxShadow: "0 2px 8px rgba(30,25,15,0.1)", padding: "1.5mm 2mm", boxSizing: "border-box",
          pointerEvents: "none", display: "flex", flexDirection: "column", gap: 2,
        }}>
          {masaBalon.masalar.map((ad, i) => (
            <span key={ad} style={{ fontSize: 12, lineHeight: 1.2, textAlign: "center", color: "var(--ink)", fontWeight: i === 0 ? 600 : 400 }}>
              {ad}
            </span>
          ))}
        </div>
      )}

      {/* PAX FİLTRESİ — başlıktan açılır, o gün var olan kişi sayıları listelenir. */}
      {paxFiltreKonum && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 60 }} onClick={() => setPaxFiltreKonum(null)} />
          <div style={{ position: "fixed", left: paxFiltreKonum.left + paxFiltreKonum.width / 2, transform: "translateX(-50%)", top: paxFiltreKonum.top, zIndex: 61, background: "var(--card)", border: "1px solid var(--line-2)", borderRadius: 10, boxShadow: "0 2px 8px rgba(30,25,15,0.1)", padding: "2mm", boxSizing: "border-box", width: "max-content", minWidth: 120, maxHeight: 280, overflowY: "auto", scrollbarWidth: "none" }}>
            <button onClick={() => { setPaxFiltre(null); setPaxFiltreKonum(null); }} style={masaBtnStil(paxFiltre === null)}>Tümü</button>
            {paxSecenekleri.map((p) => (
              <button key={p} onClick={() => { setPaxFiltre(p); setPaxFiltreKonum(null); }} style={masaBtnStil(paxFiltre === p)}>
                <span className="tnum">{p}</span> kişi
              </button>
            ))}
            {paxSecenekleri.length === 0 && <div style={{ fontSize: 11.5, color: inkSoft, padding: "4px 0" }}>Kayıt yok.</div>}
          </div>
        </>
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

      <RezervasyonAltNav />
    </div>
  );
}

// fontSize 16 — iOS Safari, 16px altındaki bir input'a dokununca sayfayı otomatik
// yakınlaştırıyor (Gökhan, 2026-08-08: "özele tıkladığında ekran büyüyor"). 16 ve üzeri
// bu yakınlaştırmayı hiç tetiklemiyor, tarayıcının kendi kuralı.
// Kutu ölçüsü aynı kalsın diye K/E alanlarında yan boşluk 10 → 2 düşürülüyor (Gökhan,
// 2026-08-15: "11 yazdım rakamın sadece 1 tanesi göründü"). Kutu 34px, yan dolgu 10'ken
// yazıya kalan yer 12px'ti, tek hane sığıyordu; 2'ye inince 28px kalıyor, çift hane sığar.
// Yazı boyu 16'da bırakıldı — telefonda daha küçüğü kutuya odaklanınca ekranı yakınlaştırır.
const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 10px", fontSize: 16, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0 };
const btnPrimary: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 980, padding: "9px 14px", background: "var(--brand-strong)", color: "#fff", fontSize: 13, fontWeight: 500, flexShrink: 0 };
const btnSecondary: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 16px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13, cursor: "pointer" };
const btnSmall: React.CSSProperties = { border: "none", borderRadius: 980, padding: "7px 14px", background: "var(--ink-green)", color: "#fff", fontSize: 12.5, flexShrink: 0, cursor: "pointer" };
const btnGhost: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "7px 12px", background: "var(--card)", color: "var(--ink)", fontSize: 12, flexShrink: 0, cursor: "pointer" };
const btnSmallRow: React.CSSProperties = { ...btnSmall, padding: "4px calc(14px - 1.5mm)" };
const btnGhostRow: React.CSSProperties = { ...btnGhost, padding: "4px calc(12px - 1.5mm)" };
const inkSoft = "#5c5c58";
const masaSecBtn: React.CSSProperties = { all: "unset", cursor: "pointer", display: "block", width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 8, fontSize: 12.5, color: "var(--ink)" };
// Kutu SADECE masa sütununda kaldı — "Masa seç" ve seçili masa (Gökhan: "eklediğimiz
// kutuları masa seç ve seçili masalar dışında hepsini kaldır"). Sıra no, saat, telefon,
// kişi ve not yeniden düz yazı — alt çizgi yok (Gökhan: "yazıların altındaki çizgileri kaldır").
const hucreYaziBtn: React.CSSProperties = { all: "unset", cursor: "pointer", whiteSpace: "nowrap" };

// ─────────────────────────────────────────────────────────────────────────────
// LİSTE SÜTUNLARI — TEK KAYNAK (Gökhan, 2026-08-18: "yamalı halden kurtar,
// baştan yap"). Başlık satırı da rezervasyon satırları da BU tablodan çiziliyor;
// eskiden ikisi ayrı ayrı elle kaydırılıyordu (eksi milimetreler) ve sürekli
// birbirinden kayıyordu. Artık bir sütunu daraltmak = aşağıdaki tek sayıyı
// değiştirmek; başlık, satır ve aradaki çizgi kendiliğinden yerini bulur.
//
// Sütunlar arasındaki boşluğu AYRAC yuvası veriyor; yuva hem başlıkta hem satırda
// görünmez (Gökhan, 2026-08-18: "başlıklar arasındaki çizgileri kaldır") — o yüzden
// satırların kendi kolon aralığı 0.
const AYRAC = 10;
// Masa kutusunun yanında kilide ayrılan yer — kutu her satırda aynı boyda kalsın
// diye kilit çizilmese de duruyor (Gökhan, 2026-08-18).
const KILIT_YERI = 17;
// Geldi + Gelmedi + İptal düğmelerinin kapladığı alan. Başlık da satırdaki düğmeler
// de bu genişliğe göre yerleşiyor, o yüzden başlık düğmelerin tam ortasında çıkıyor.
const DURUM_ALANI = 142;
// Sabit sütunların toplamı ekranın tamamını yemesin — geri kalan yeri NOT sütunu alıyor,
// pencere daraldığında da daralan hep o oluyor (Gökhan, 2026-08-15).
const SUTUN = {
  sn: 26,
  zaman: 50,
  misafir: 140,
  telefon: 88,
  pax: 40,
  masa: 106,
  durum: DURUM_ALANI + 18, // düğme alanı + kenar boşluğu (4 mm)
} as const;
// Durum düğmelerinin satır kenarına bıraktığı boşluk (Gökhan: "kutunun sonu ile
// aralarında 4 mm olsun").
const DURUM_KENAR = "4mm";
// Masa adının yazdığı kutu — genişliğini artık sütun belirliyor (SUTUN.masa eksi kilit
// yeri), o yüzden burada elle daraltma yok (Gökhan, 2026-08-18).
const hucreKutu: React.CSSProperties = {
  boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center",
  width: "100%", height: 28, padding: "0 8px",
  border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--card)",
  fontSize: 12.5, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
const hucreKutuBtn: React.CSSProperties = { all: "unset", ...hucreKutu, cursor: "pointer" };
const navBtn: React.CSSProperties = { all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: 6, borderRadius: 8, color: "var(--muted)" };
