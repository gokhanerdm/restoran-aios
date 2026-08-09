"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getMyReservationRestaurantId, getMyReservationRestaurants, setAktifSube, type ReservationBranch } from "@/lib/supabase/reservationAccount";
import { toTitleTr, ilkHarfBuyukTr } from "@/lib/text";
import {
  havuzuTuket, havuzDokumu,
  salonuPlanla, birlesikYerlesim, type PlanMasa,
} from "./masaPlan";
import { govdeCizim, type Shape as MasaSekli } from "./masaOlcu";
import { Plus, ChevronLeft, ChevronRight, ChevronDown, LayoutGrid, Settings, LogOut, User, Search, X, Lock, Unlock, BarChart3, Star } from "lucide-react";
import { useConfirm } from "../components/useConfirm";
import DatePicker from "../components/DatePicker";
import EditableText from "../components/EditableText";
import { ListHeader, HeaderCell, HeaderSep, ListRow, RowSep, Cell, Spacer, ActionsCell } from "../components/ListRow";
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
  // Masası kesinleşmiş, müşteriye söz verilmiş rezervasyon — otomatik yerleşme buna dokunmaz.
  masa_kilit: boolean;
  // İsim aramasından seçilen müşterinin kalıcı kimliği (Gökhan: "form o müşterinin ID'siyle
  // devam etsin, sadece isim/telefon metniyle eşleşmesin") — aynı isimli kişiler karışmaz.
  kisi_karti_id: string | null;
  // Kişi sayısının yanında kadın/erkek dağılımı — opsiyonel, sadece yeni rezervasyonda sorulur.
  kadin_sayisi: number | null; erkek_sayisi: number | null;
};
// position_x/y salon planındaki yeri — planlayıcı "kendi sırasındaki masa"yı bundan bulur.
// shape/rotated gövde genişliği için (birleşen masalar plana bitişik yazılırken lazım),
// normal_x/y ise masanın asıl yeri — gün kapanınca oraya geri konuyor.
type TableRow = {
  id: string; name: string; seat_count: number; status: string;
  position_x: number | null; position_y: number | null;
  shape: MasaSekli; rotated: boolean; normal_x: number | null; normal_y: number | null;
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
type KisiZiyaret = { reserved_at: string; party_size: number; note: string | null; status: string; masa: string | null; cancel_reason?: string | null };
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
  rows, toplamMasa, toplamKapasite, doluluk, masaAdi, onYeniRezervasyon, onKartAc,
}: {
  rows: Rez[]; toplamMasa: number; toplamKapasite: number; doluluk: number;
  masaAdi: (r: Rez) => string | null;
  onYeniRezervasyon: () => void; onKartAc: (r: Rez) => void;
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>
      {/* Başlık üstteki kimlik satırına taşındı (Gökhan, 2026-08-08: "rezervasyonlar
          yazısını rezervasyon olarak işletme isminin yanına al") — burada sadece düğme. */}
      <div style={{ display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
        <button onClick={onYeniRezervasyon} style={btnPrimary}><Plus size={14} /> Yeni rezervasyon</button>
      </div>
      {/* Bilgi bölümü — oran değil düz sayı (Gökhan: "oran değil kapasite karşısında
          doluluğu yazacak"). İki blok karşılıklı: solda Rezervasyon/Masa altlı üstlü sola
          yaslı, sağda Kapasite/Doluluk altlı üstlü sağa yaslı — sağdaki rakamlar alttaki
          satırlardaki kişi sayısı rakamlarının (satır dolgusu 14px) üzerine denk gelsin
          diye aynı sağ boşluk (paddingRight:14) kullanılıyor (Gökhan, 2026-08-08). */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: inkSoft, flexShrink: 0 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div><span className="tnum" style={{ fontWeight: 600, color: "var(--ink)" }}>{rows.length}</span> RZV Masa</div>
          <div><span className="tnum" style={{ fontWeight: 600, color: "var(--ink)" }}>{toplamMasa}</span> Masa</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2, paddingRight: 14 }}>
          <div>Kapasite <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)" }}>{toplamKapasite}</span> px</div>
          <div>Doluluk <span className="tnum" style={{ fontWeight: 600, color: doluluk >= toplamKapasite ? "var(--gold-text)" : "var(--ink)" }}>{doluluk}</span> px</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>Bu gün için kayıt yok.</div>}
        {rows.map((r, i) => {
          const info = DURUM_INFO[r.status] ?? DURUM_INFO.bekleniyor;
          const vip = r.kisi_karti_id ? vipSet.has(r.kisi_karti_id) : false;
          const masa = masaAdi(r);
          return (
            <button
              key={r.id}
              onClick={() => onKartAc(r)}
              style={{
                all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                background: info.bg, borderRadius: 10, padding: "12px 14px", boxSizing: "border-box", flexShrink: 0,
              }}
            >
              {/* Sıra numarası — masaüstü tablodaki SNO ile aynı (Gökhan, 2026-08-08). */}
              <span className="tnum" style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", flexShrink: 0, width: 16, textAlign: "right" }}>{i + 1}</span>
              {vip && <Star size={13} style={{ color: "var(--gold-text)", flexShrink: 0 }} fill="var(--gold-text)" />}
              <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.guest_name}</span>
              {/* Masa numarası — kişi sayısının yanında (Gökhan, 2026-08-08). */}
              {masa && <span style={{ fontSize: 12, color: "var(--muted)", flexShrink: 0, whiteSpace: "nowrap" }}>{masa}</span>}
              <span className="tnum" style={{ fontSize: 13.5, fontWeight: 600, color: info.color, flexShrink: 0 }}>{r.party_size} px</span>
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

  return (
    <div style={{ border: "1px solid var(--line-2)", borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>

      {/* 1. KİMLİK — doğum günü isme yakın, not telefonun devamında (Gökhan: "hatırlatan
          bilgiler başlığını kaldırıp doğum gününü isme, notu telefon satırına ekleyelim"). */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {kart?.isim && <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-green)" }}>{kart.isim}</span>}
          <span style={{ fontSize: 11, color: inkSoft }}>D.günü</span>
          <DatePicker value={dogumTaslak} onChange={dogumSec} style={{ fontSize: 11, padding: "2px 5px", width: 118 }} />
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
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span className="tnum" style={{ fontSize: 12, color: inkSoft, flexShrink: 0 }}>{phone}</span>
          <input
            value={notTaslak} onChange={(e) => setNotTaslak(e.target.value)} onBlur={notKaydet}
            placeholder="Not (alerji, kiminle geliyor, kutlama…)"
            style={{ border: "none", background: "transparent", outline: "none", fontSize: 11.5, color: inkSoft, flex: 1, minWidth: 160, padding: "2px 0" }}
          />
        </div>
        {kart && (kart.sonRezervasyonDurumu || kart.ilkKayitTarihi) && (
          <div style={{ fontSize: 11.5, color: inkSoft }}>
            {kart.sonRezervasyonDurumu && (
              <>Son rezervasyon: <span style={{ color: DURUM_RENK[kart.sonRezervasyonDurumu] ?? "var(--ink)", fontWeight: 600 }}>{DURUM_KISA[kart.sonRezervasyonDurumu] ?? kart.sonRezervasyonDurumu}</span></>
            )}
            {kart.ilkKayitTarihi && <> · İlk kayıt: {tarihKisa(kart.ilkKayitTarihi)}</>}
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
            bagTelefon={bagTelefon} setBagTelefon={setBagTelefon} bagAciklama={bagAciklama} setBagAciklama={setBagAciklama} numaraBagla={numaraBagla}
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
              bagTelefon={bagTelefon} setBagTelefon={setBagTelefon} bagAciklama={bagAciklama} setBagAciklama={setBagAciklama} numaraBagla={numaraBagla}
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
    </div>
  );
}

// Bağlı numaralar — bir kişinin farklı telefonlarla geldiği durumlar için.
function BagliNumaralar({
  kart, bagAcik, setBagAcik, bagTelefon, setBagTelefon, bagAciklama, setBagAciklama, numaraBagla,
}: {
  kart: KisiKarti; bagAcik: boolean; setBagAcik: (v: boolean) => void;
  bagTelefon: string; setBagTelefon: (v: string) => void; bagAciklama: string; setBagAciklama: (v: string) => void; numaraBagla: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {kart && kart.baglantilar.length > 0 && (
        <div style={{ fontSize: 11, color: inkSoft }}>
          Bağlı numaralar: {kart.baglantilar.map((b) => `${b.telefon}${b.aciklama ? ` (${b.aciklama})` : ""}`).join(", ")}
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
  // Yeni rezervasyon penceresinin açılış saati — Ayarlar'dan değişebilir.
  const [varsayilanSaat, setVarsayilanSaat] = useState("19:00");
  // Varsayılan oturma süresi Ayarlar'dan geliyor — yeni rezervasyon bu süreyle kaydedilir.
  const [oturmaSuresi, setOturmaSuresi] = useState(90);
  // Ayarlar'daki "Otomatik yerleşme" — açıkken kişi sayısı büyüyünce program masayı kendi
  // tamamlar (Gökhan: "kendisi hemen kendi sırasındaki 2 kişilik masayı çekecek, kapatacak
  // konuyu"). Kapalıyken program hiçbir masayı kendiliğinden oynatmaz.
  const [otoYerlesme, setOtoYerlesme] = useState(false);
  // Saate göre masa hesabı (Ayarlar, varsayılan kapalı). Kapalıyken masa hesabı günün
  // üzerinden yürür; açıkken masa sadece oturma süresi + masa arası pay boyunca dolu sayılır.
  const [saateGore, setSaateGore] = useState(false);
  const [masaArasiPay, setMasaArasiPay] = useState(0);
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
      supabase.from("reservations").select("id, guest_name, guest_phone, party_size, reserved_at, status, note, table_id, arrived_at, created_at, cancel_reason, source, masa_kilit, kisi_karti_id, kadin_sayisi, erkek_sayisi")
        .eq("restaurant_id", restId).is("deleted_at", null)
        .gte("reserved_at", start).lt("reserved_at", end)
        .order("created_at"),
      supabase.from("restaurant_tables").select("id, name, seat_count, status, position_x, position_y, shape, rotated, normal_x, normal_y").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("restaurant_settings").select("kvkk_notice, default_duration_minutes, auto_seating, saate_gore_masa, masa_arasi_pay, varsayilan_rezervasyon_saati, musteri_sadakat_ziyaret_esigi, musteri_no_show_risk_yuzde").eq("restaurant_id", restId).maybeSingle(),
    ]);
    if (error) { setErr(error.message); return; }
    const list = (r as Rez[]) ?? [];
    setRows(list);
    setTables((t as TableRow[]) ?? []);
    const settingsRow = s as {
      kvkk_notice: string | null; default_duration_minutes: number; auto_seating: boolean; saate_gore_masa: boolean; masa_arasi_pay: number;
      varsayilan_rezervasyon_saati: string; musteri_sadakat_ziyaret_esigi: number; musteri_no_show_risk_yuzde: number;
    } | null;
    setKvkkNotice(settingsRow?.kvkk_notice ?? "");
    setVarsayilanSaat(settingsRow?.varsayilan_rezervasyon_saati ?? "19:00");
    setOturmaSuresi(settingsRow?.default_duration_minutes ?? 90);
    setOtoYerlesme(settingsRow?.auto_seating ?? false);
    setSaateGore(settingsRow?.saate_gore_masa ?? false);
    setEsikMudavim(settingsRow?.musteri_sadakat_ziyaret_esigi ?? 5);
    setEsikNoShow(settingsRow?.musteri_no_show_risk_yuzde ?? 30);
    setMasaArasiPay(settingsRow?.masa_arasi_pay ?? 0);
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
  // Telefon genişliğinde liste tablo yerine kart görünümüne geçer (Gökhan, 2026-08-07:
  // "mobili daha takip ve rezervasyon girişi için tasarlamalıyız") — tablet masaüstüyle
  // aynı kalır, sadece bu eşiğin altı değişir (Adisyon'daki 860px eşiğiyle aynı).
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
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

  // Yeni rezervasyonla AYNI ANDA masa tutan rezervasyonlar. İki mod var:
  //  - Gün havuzu (varsayılan): o günün bütün rezervasyonları aynı havuzda sayılır.
  //  - Saate göre (Ayarlar'dan açılır): sadece zamanı çakışanlar sayılır — masa oturma süresi
  //    + masa arası pay kadar dolu tutulur, sonra gerçekten boşalır.
  // Görüntülenen gün elimizde zaten var; başka güne yazılıyorsa o gün ayrıca çekilir
  // (Gökhan: "yarına, haftaya alınan rezervasyonlarda da kontrol çalışsın").
  const cakisiyorMu = (aIso: string, bIso: string) => {
    const sure = (oturmaSuresi + masaArasiPay) * 60000;
    const a = Date.parse(aIso);
    const b = Date.parse(bIso);
    return a < b + sure && b < a + sure;
  };
  const donemGruplariGetir = async (tarih: string, iso: string): Promise<number[]> => {
    // Saate göre hesap kapalıysa günün tamamı tek havuz — dönem ayrımı kaldırıldı.
    const uyar = (rIso: string) => (saateGore ? cakisiyorMu(iso, rIso) : true);
    if (tarih === gun) return kapasiteliRows.filter((r) => uyar(r.reserved_at)).map((r) => r.party_size);
    const { start, end } = gunSiniri(tarih);
    const { data } = await supabase.from("reservations").select("party_size, reserved_at, status")
      .eq("restaurant_id", restaurantId).is("deleted_at", null)
      .gte("reserved_at", start).lt("reserved_at", end);
    return ((data as { party_size: number; reserved_at: string; status: string }[]) ?? [])
      .filter((x) => (x.status === "bekleniyor" || x.status === "geldi" || x.status === "oturdu") && uyar(x.reserved_at))
      .map((x) => x.party_size);
  };

  // Masa boyu kontrolü — program masayı seçmez, sadece yer var mı bakar; gerekiyorsa sorar.
  // Devam edilecekse true döner.
  const masaMusaitMi = async (tarih: string, iso: string, kisi: number): Promise<boolean> => {
    if (tables.length === 0) return true;
    const gruplar = await donemGruplariGetir(tarih, iso);

    // ÖNCE planlayıcıya sor: salon dizilirse HERKES oturuyor mu? Sadece yeni gelene bakmak
    // yetmiyordu — yeni rezervasyon yerleşirken başkası açıkta kalıyor, program yine de
    // "olur" diyordu (Gökhan: "58 rezervasyon var, bana hayır diyemedi, sadece bir
    // rezervasyonun masasız kaldığını söyledi"). Kimse açıkta kalmıyorsa soru sorulmaz.
    const planMasalar = tables.map((t) => ({
      id: t.id, seat_count: t.seat_count, position_x: t.position_x, position_y: t.position_y,
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
    const masaBitti = gruplar.length >= tables.length;
    setUyari({
      baslik: `${kisi} kişilik rezervasyon alınamıyor`,
      satirlar: masaBitti
        ? [
            `Salonda ${tables.length} masa var ve ${gruplar.length} rezervasyon almışsın — masa kalmadı.`,
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

  const openNewRes = () => {
    setFName(""); setFPhone(""); setFParty("2"); setFDate(gun);
    setFTime(acilisSaati());
    setFNote("");
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
    if (!(await masaMusaitMi(fDate, iso, kisi))) return;

    // Kapasite dolduğunda artık Yedek'e almıyoruz, doğrudan reddediyoruz (Gökhan: "yedek
    // rezervasyon almayı durdur, şu an alamazsın"). Kontrol sadece görüntülenen gün için
    // yapılabiliyor — başka günün pax toplamı elimizde yok, orada masa kontrolü iş görüyor.
    let mevcut = 0;
    if (fDate === gun) {
      mevcut = gunPax;
      if (mevcut + kisi > toplamKapasite) {
        setUyari({
          baslik: "Kapasite dolu",
          satirlar: [
            `Bu günde ${toplamKapasite} koltuğun ${mevcut}'i tutulmuş, ${kisi} kişilik daha alınamıyor.`,
            `En fazla ${Math.max(0, toplamKapasite - mevcut)} kişilik bir rezervasyon sığar.`,
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
    const { data: yeniKayit, error } = await supabase.from("reservations").insert({
      restaurant_id: restaurantId,
      guest_name: toTitleTr(fName),
      guest_phone: fPhone.trim() || null,
      party_size: kisi,
      reserved_at: new Date(`${fDate}T${fTime}:00+03:00`).toISOString(),
      duration_minutes: oturmaSuresi,
      note: ilkHarfBuyukTr(fNote) || null,
      consent_at: fPhone.trim() ? new Date().toISOString() : null,
      kisi_karti_id: fSecKartId,
      kadin_sayisi: fKadin.trim() ? parseInt(fKadin, 10) : null,
      erkek_sayisi: fErkek.trim() ? parseInt(fErkek, 10) : null,
      iletisim_kanali: fKanal,
      created_by: session?.user.id ?? null,
    }).select("id").single();
    setBusy(false);
    if (error) { setErr(error.message); return; }
    if (yeniKayit) bildirimGonder(yeniKayit.id, "onay");
    setNewResOpen(false);
    if (fDate === gun && mevcut < toplamKapasite && mevcut + kisi >= toplamKapasite) {
      bildirCapacityNotice(`Kapasite bu rezervasyonla doldu (${toplamKapasite}/${toplamKapasite} px) — bu saate başka rezervasyon alınamaz.`);
    }
    // Otomatik modda yeni rezervasyon salonu değiştirir — dizilim kendiliğinden kurulur.
    // Rezervasyon hangi güne yazıldıysa o günün planı kurulur, ekranda o gün açık olmasa da.
    if (otoYerlesme) await planiUygula(true, fDate);
    if (fDate !== gun) { gunDegistir(fDate); return; }
    await yenile();
  };

  const dogrudanGir = async () => {
    if (!restaurantId || !wName.trim()) return;
    const kisi = Math.max(1, parseInt(wParty, 10) || 1);
    setErr(null);

    const simdi = new Date().toISOString();
    if (!(await masaMusaitMi(bugunIstanbul(), simdi, kisi))) return;

    let mevcut = 0;
    if (bugunMu) {
      mevcut = gunPax;
      if (mevcut + kisi > toplamKapasite) {
        setUyari({
          baslik: "Kapasite dolu",
          satirlar: [
            `Bu günde ${toplamKapasite} koltuğun ${mevcut}'i tutulmuş, ${kisi} kişilik daha alınamıyor.`,
            `En fazla ${Math.max(0, toplamKapasite - mevcut)} kişilik bir misafir sığar.`,
            "Yer açmak için mevcut rezervasyonlardan biri iptal edilmeli ya da kişi sayısı küçültülmeli.",
          ],
        });
        return;
      }
    }

    setBusy(true);
    const { error } = await supabase.rpc("check_in_arrival", {
      p_restaurant: restaurantId, p_guest_name: toTitleTr(wName), p_party_size: kisi,
      p_guest_phone: wPhone.trim() || null, p_note: ilkHarfBuyukTr(wNote) || null,
      p_kisi_karti_id: wSecKartId,
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setWName(""); setWPhone(""); setWParty("2"); setWNote(""); setWSecKartId(null); setWalkInOpen(false);
    if (bugunMu && mevcut < toplamKapasite && mevcut + kisi >= toplamKapasite) {
      bildirCapacityNotice(`Kapasite bu misafirle doldu (${toplamKapasite}/${toplamKapasite} px) — başka misafir alınamaz.`);
    }
    if (gun !== bugunIstanbul()) gunDegistir(bugunIstanbul()); else await yenile();
  };

  // Bir rezervasyona atanmış masaların toplam koltuğu — kişi sayısı büyütülünce masa küçük
  // kalabiliyor (Gökhan: "6 kişiden 8'e çıkardım, seçili masa değişmedi") — bunu yakalar.
  const atananKoltuk = (r: Rez) => (rezMasalar[r.id] ?? []).reduce((s, id) => s + (tables.find((t) => t.id === id)?.seat_count ?? 0), 0);
  const masaYetersiz = (r: Rez) => (rezMasalar[r.id] ?? []).length > 0 && atananKoltuk(r) < r.party_size;

  // Gelmedi/İptal olunca atanmış masa hâlâ rezerveyse otomatik boşa çıkar.
  const durumDegistir = async (r: Rez, next: string, cancelReason?: string) => {
    setErr(null);
    const { error } = await supabase.rpc("set_reservation_status", { p_reservation_id: r.id, p_status: next, p_cancel_reason: cancelReason ?? null });
    if (error) { setErr(error.message); return; }
    await yenile();
    // İptal/gelmedi yer açar — boşalan masa asıl yerine dönsün (Gökhan: "masaların
    // rezervasyonu iptal oldu, masa tekrar yerine geri dönsün"). Bu, otomatik yerleşim
    // kapalıyken de çalışmalı — o anahtar YENİ rezervasyonları otomatik masaya atamayı
    // kapatır, boşalan masanın kendi asıl yerine fiziksel dönüşünü değil.
    if (next === "iptal" || next === "gelmedi") await planiUygula(true);
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
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setSeatingFor(null); setMasaSecimi([]);
    await yenile();
  };
  const oturtBaslat = (r: Rez) => { setMasaSecimi([]); setSeatingFor(r); };

  // Masası zaten atanmışsa tek tıkla o masaya oturur. Misafir başka masa isterse personel
  // önce Masa hücresinden atamayı değiştirir.
  const oturtDirekt = async (r: Rez) => {
    if (!r.table_id) return;
    // Atanmış masa(lar) kişi sayısını karşılamıyorsa sessizce oturtma — masa seç ekranını aç,
    // mevcut masa(lar) seçili gelsin, üstüne ekleyerek tamamlasın (Gökhan: "4 kişilik
    // rezervasyonun biri 6 kişilik masaya oturdu, biri 2 kişilik masaya oturamadı" — diğer
    // rezervasyonlar oturduğu için masalar oynatılamamış, program yine de tek tık yetersiz
    // masaya oturtmuştu).
    if (masaYetersiz(r)) {
      setMasaSecimi(rezMasalar[r.id] ?? [r.table_id]);
      setSeatingFor(r);
      return;
    }
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("seat_reservation", { p_reservation_id: r.id, p_table_id: r.table_id });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    await yenile();
  };

  // Ziyaret tamamlandı — masa boşalır, akış kapanır. Bu programın son adımı.
  const tamamlandi = async (r: Rez) => {
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
  const planiUygula = async (sessiz = false, hedefGun?: string, tamDiz = false) => {
    const planGunu = hedefGun ?? gun;
    if (!restaurantId || !planGunu) return;
    // Veriyi ekrandan DEĞİL, doğrudan veritabanından okuyoruz. Ekrandaki liste bir işlemin
    // hemen ardından henüz tazelenmemiş oluyordu; plan eski listeyle kurulunca iptal edilen
    // rezervasyon geri geliyor, otomatik mod da değişikliği anında yansıtmıyordu (Gökhan).
    const { start, end } = gunSiniri(planGunu);
    const [{ data: rData }, { data: tData }] = await Promise.all([
      supabase.from("reservations").select("id, guest_name, party_size, status, masa_kilit, reservation_tables(table_id)")
        .eq("restaurant_id", restaurantId).is("deleted_at", null)
        .in("status", ["bekleniyor", "geldi", "oturdu"])
        .gte("reserved_at", start).lt("reserved_at", end),
      supabase.from("restaurant_tables").select("id, seat_count, position_x, position_y, shape, rotated, normal_x, normal_y")
        .eq("restaurant_id", restaurantId).is("deleted_at", null).order("sort_order"),
    ]);
    type TazeRez = { id: string; guest_name: string; party_size: number; status: string; masa_kilit: boolean; reservation_tables: { table_id: string }[] | null };
    type TazeMasa = { id: string; seat_count: number; position_x: number | null; position_y: number | null; shape: MasaSekli; rotated: boolean; normal_x: number | null; normal_y: number | null };
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
    const { atamalar, yerlesemeyen } = salonuPlanla(
      masalar.map(planMasa),
      serbest.map((r) => ({ id: r.id, kisi: r.party_size })),
      sabit.map((r) => ({ rez: { id: r.id, kisi: r.party_size }, masaIds: masaOf(r) })),
      mevcutAtamalar,
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
    for (const t of masalar) {
      if (birlesikMasaIds.has(t.id) || t.normal_x === null || t.normal_y === null) continue;
      await supabase.from("restaurant_tables")
        .update({ position_x: t.normal_x, position_y: t.normal_y, normal_x: null, normal_y: null })
        .eq("id", t.id);
    }
    for (const yer of birlesikYerlesim(kumeler, masalar.map(planMasa))) {
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

  // Masaları normal yerine döndürür — gün kapanınca salon eski hâline gelsin diye.
  const masalariNormaleAl = async () => {
    for (const t of tables) {
      if (t.normal_x === null || t.normal_y === null) continue;
      await supabase.from("restaurant_tables")
        .update({ position_x: t.normal_x, position_y: t.normal_y, normal_x: null, normal_y: null })
        .eq("id", t.id);
    }
  };

  // GÜNÜ KAPAT (Gökhan: "günü kapat dediğinde bekleyenler gelmedi olarak kapatılır") —
  // gün bitince kimse işaretlemediyse kayıtlar "bekleniyor"da asılı kalmasın. Kendiliğinden
  // çalışmıyor: sabah işaretleme ihtimali var, kapatma kararı işletmenin.
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
  const siraKademe = (s: string) => (s === "iptal" ? 3 : s === "gelmedi" ? 2 : s === "tamamlandi" ? 1 : 0);
  const visibleRows = [...rows].sort((a, b) => siraKademe(a.status) - siraKademe(b.status));

  // Kapasite — gün tek havuz (Gökhan: "bu programı öncelik olarak eğlence mekanlarına
  // yapıyoruz, sadece akşamı baz alacağız"). Sadece gerçekten yer kaplayan durumlar sayılır;
  // tamamlanan ziyaret masayı boşalttığı için artık saymaz.
  //
  // Yedek kaldırıldı: kapasite dolduğunda rezervasyon Yedek'e alınmıyor, doğrudan
  // reddediliyor (Gökhan: "yedek rezervasyon almayı durdur"). O yüzden yedek hesabı,
  // YEDEK rozeti ve "Bekleyenler (Yedek)" filtresi de ekrandan kaldırıldı — hiç
  // oluşmayacak bir durumu gösterip kafa karıştırmasınlar.
  const toplamKapasite = tables.reduce((s, t) => s + t.seat_count, 0);
  const kapasiteliRows = rows.filter((r) => r.status === "bekleniyor" || r.status === "geldi" || r.status === "oturdu");
  const gunPax = kapasiteliRows.reduce((s, r) => s + r.party_size, 0);
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

  return (
    <div style={{ background: "var(--canvas)", padding: "20px 24px", paddingBottom: isMobile ? ALT_NAV_YUKSEKLIK + 16 : 24, height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
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
      <div style={{ marginBottom: 14, flexShrink: 0, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", rowGap: 10 }}>
        {/* RZV rozeti — tıklanınca rezervasyon listesine döner (Gökhan, 2026-08-08). */}
        <Link href="/rezervasyon" aria-label="Rezervasyonlar" style={{ width: 34, height: 34, borderRadius: "50%", background: "var(--brand)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 10.5, letterSpacing: 0.3, flexShrink: 0, textDecoration: "none" }}>
          RZV
        </Link>
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
          <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>
            {restaurantName || "Rezerve"}
          </div>
        )}
        {/* Sayfa adı işletme isminin yanında — mobilde liste başlığı buradan okunuyor
            (Gökhan, 2026-08-08), masaüstünde zaten tablo başlıkları var. */}
        {isMobile && <span style={{ fontSize: 14, fontWeight: 500, color: "var(--muted)" }}>· Rezervasyon</span>}
        <div style={{ flex: 1 }} />
        {/* Mobilde İstatistikler/Salon/Ayarlar alttaki nav'a taşındı (Gökhan, 2026-08-08:
            "yukarıda olan simgeleri aşağı tarafa bir nav yapıp oraya taşıyalım") — Çıkış
            şimdilik yerinde kaldı ("çıkış yerinde kalsın"). */}
        {!isMobile && (
          <>
            <Link href="/rezervasyon/istatistikler" aria-label="İstatistikler" title="İstatistikler" style={{ ...navBtn, marginTop: 2, textDecoration: "none" }}>
              <BarChart3 size={19} />
            </Link>
            <Link href="/rezervasyon/salon" aria-label="Salon" title="Salon" style={{ ...navBtn, marginTop: 2, textDecoration: "none" }}>
              <LayoutGrid size={19} />
            </Link>
            <Link href="/rezervasyon/ayarlar" aria-label="Ayarlar" title="Ayarlar" style={{ ...navBtn, marginTop: 2, textDecoration: "none" }}>
              <Settings size={19} />
            </Link>
          </>
        )}
        <button onClick={cikisYap} aria-label="Çıkış yap" title="Çıkış yap" style={{ ...navBtn, marginTop: 2 }}>
          <LogOut size={19} />
        </button>

        {/* Gün seçimi — mobilde kart görünümünde tarih hiç yoktu, geçmiş/ileri güne
            gidilemiyordu (Gökhan, 2026-08-08: "mobilde tarih yok muydu, nasıl gidiyorduk
            eski rezervasyonlara"). flexBasis:100% ile kimlik satırının altına, kendi
            satırına düşer — isim + tarih yan yana dar ekrana sığmıyor. */}
        {isMobile && (
          <div style={{ flexBasis: "100%", display: "flex", alignItems: "center", gap: 6 }}>
            {!bugunMu && <button onClick={() => gunDegistir(bugunIstanbul())} style={btnGhost}>Bugün</button>}
            <button onClick={() => gun && gunDegistir(gunKaydir(gun, -1))} aria-label="Önceki gün" style={navBtn}><ChevronLeft size={17} /></button>
            <DatePicker value={gun} onChange={gunDegistir} />
            <button onClick={() => gun && gunDegistir(gunKaydir(gun, 1))} aria-label="Sonraki gün" style={navBtn}><ChevronRight size={17} /></button>
          </div>
        )}
      </div>

      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10, flexShrink: 0 }}>{err}</div>}
      {capacityNotice && (
        <div style={{ fontSize: 12.5, color: "var(--gold-text)", background: "var(--recede)", border: "1px solid var(--gold)", borderRadius: 10, padding: "8px 12px", marginBottom: 10, flexShrink: 0 }}>
          {capacityNotice}
        </div>
      )}

      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {isMobile && (
          <MobilRezervasyonListesi
            rows={filtreliRows}
            toplamMasa={tables.length}
            toplamKapasite={toplamKapasite}
            doluluk={gunPax}
            masaAdi={(r) => (rezMasalar[r.id] ?? []).map((id) => tableName(id)).filter(Boolean).join(" + ") || tableName(r.table_id)}
            onYeniRezervasyon={openNewRes}
            onKartAc={(r) => setKartFor(r)}
          />
        )}
        {!isMobile && (
        <>
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
          <button onClick={() => { setWName(""); setWPhone(""); setWParty("2"); setWNote(""); setWSecKartId(null); setErr(null); setWalkInOpen(true); }} style={btnPrimary}><Plus size={14} /> Rezervasyon dışı</button>
          {/* Masası olmayanlara programın kendi masa dağıtması (Gökhan: "kalan masaları
              program kendisi atasın") — elle atadıklarına dokunmaz. */}
          {/* Manuel modda dizilimi bu düğme kurar; Otomatik modda program zaten kendi kuruyor. */}
          {!otoYerlesme && <button onClick={() => planiUygula(false, undefined, true)} disabled={busy} style={{ ...btnGhost, opacity: busy ? 0.5 : 1 }}>Yerleşim yap</button>}
          {/* Gün bitince açıkta kalan her kaydı toplu kapatır — ileri tarihli günde anlamsız. */}
          {gun <= bugunIstanbul() && acikKayitlar.length > 0 && (
            <button onClick={gunuKapat} disabled={busy} style={{ ...btnGhost, opacity: busy ? 0.5 : 1 }}>Günü kapat</button>
          )}
          <select value={filtre} onChange={(e) => setFiltre(e.target.value)} style={{ ...inp, marginLeft: "auto", width: 190 }}>
            <option value="tumu">Tümü</option>
            <option value="rezervasyon">Rezervasyonlar</option>
            <option value="kapi">Rezervasyonsuz gelenler</option>
            <option value="online">Online gelenler</option>
            <option value="gelmedi">Gelmediler</option>
            <option value="iptal">İptaller</option>
          </select>
        </div>

        {/* Gün tek havuz — öğle/akşam ayrımı yok, tek satır (Gökhan: "sadece akşamı baz
            alacağız"). Kapasite + hangi boydan kaç masa tutulmuş. */}
        <div style={{ marginBottom: 10, flexShrink: 0, fontSize: 12.5, color: inkSoft }}>
          {/* Oran değil düz sayı, mobildeki Kapasite/Doluluk etiketleriyle aynı dil
              (Gökhan, 2026-08-08: "mobilde uyguladıklarımızın aynılarını webe de
              uyarlıyorsun değil mi"). */}
          <span style={{ color: gunPax > toplamKapasite ? "var(--gold-text)" : inkSoft }}>
            Kapasite <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)" }}>{toplamKapasite}</span> px · Doluluk <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)" }}>{Math.min(gunPax, toplamKapasite)}</span> px
            {gunPax >= toplamKapasite && <span style={{ fontWeight: 600 }}> (dolu)</span>}
          </span>
          {masaDagilim.map((m) => (
            <span key={m.px}>
              <span style={{ color: "var(--line-2)" }}>{"  ·  "}</span>
              <span className="tnum">{m.px}</span> px <span className="tnum" style={{ fontWeight: 600, color: m.dolu >= m.adet ? "var(--gold-text)" : "var(--ink)" }}>{m.dolu}</span>
              <span className="tnum"> / {m.adet}</span>
            </span>
          ))}
        </div>

        <ListHeader>
          <HeaderCell width={34} align="center">SNO</HeaderCell>
          <HeaderSep />
          <HeaderCell width={46} marginLeft={4}>Zaman</HeaderCell>
          <HeaderSep />
          <HeaderCell width={150} marginLeft={10}>Misafir</HeaderCell>
          <HeaderSep />
          <HeaderCell width={110} align="center">Telefon</HeaderCell>
          <HeaderSep />
          <HeaderCell width={48} align="center">
            {/* Kişi sayısına göre süzme — başlığın kendisi düğme (Gökhan: "paxa filtre koyalım"). */}
            <button
              onClick={(e) => setPaxFiltreKonum(menuKonum(e.currentTarget.getBoundingClientRect()))}
              title="Kişi sayısına göre filtrele"
              style={{ all: "unset", cursor: "pointer", fontSize: 12.5, fontWeight: 700, letterSpacing: 0.4, color: paxFiltre !== null ? "var(--brand-strong)" : "var(--ink)" }}
            >
              PX{paxFiltre !== null ? ` ${paxFiltre}` : ""}
            </button>
          </HeaderCell>
          <HeaderSep />
          <HeaderCell width={150} align="center" marginLeft={18}>Masa</HeaderCell>
          <HeaderSep />
          <HeaderCell width={150}>Not</HeaderCell>
          <HeaderSep />
          <Spacer />
          <HeaderCell width={220} align="center">Rezervasyon durumu</HeaderCell>
        </ListHeader>

        {/* Kaydırma çubuğu gizli — göründüğünde satırlardan ~15px yer çalıyor, başlıklar
            (çubuğun dışında kaldıkları için) alttaki düğmelere göre sağa kaymış görünüyordu
            (Gökhan: "rezervasyon durumu yazısı ortalanmamış"). Fare tekerleği/parmakla kayar. */}
        <div ref={listeKaydirRef} style={{ flex: 1, overflowY: "auto", minHeight: 0, scrollbarWidth: "none" }}>
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
            // BU rezervasyona bağlı masa adları (masa birleştirme) — hücrede gösterilir.
            const buRezMasalari = rezMasalar[r.id] ?? [];
            const masaAdi = buRezMasalari.map((id) => tableName(id)).filter(Boolean).join(" + ") || tableName(r.table_id);
            // Atanmış masa kişiyi karşılamıyorsa tekrar tıklamak EKLEMEK içindir (10 kişiye
            // 4 kişilik masa seçilmiş, üstüne masa eklenecek); karşılıyorsa DEĞİŞTİRMEK
            // içindir (Gökhan: "4 kişilik rezervasyona 4 kişilik masa seçtin, tekrar
            // tıklarsan bu değiştirmek içindir") — o yüzden seçim sıfırdan başlar.
            const buRezKisi = buRezMasalari.reduce((s, id) => s + (tables.find((t) => t.id === id)?.seat_count ?? 0), 0);
            const masaEksik = buRezKisi < r.party_size;
            return (
              <ListRow key={r.id} bg={info.bg} muted={r.status === "gelmedi" || r.status === "iptal"}>
                <Cell width={34} align="center">
                  <span className="tnum" style={{ fontSize: 12.5, color: "var(--ink)" }}>{i + 1}</span>
                </Cell>
                <RowSep />
                <Cell width={46} marginLeft={4}>
                  <button
                    onClick={(e) => duzenleAc(e.currentTarget.getBoundingClientRect(), r, "saat")}
                    style={{ ...hucreYaziBtn, fontSize: 13, fontWeight: 600, color: "var(--ink-green)", fontVariantNumeric: "tabular-nums" }}
                  >
                    {saat(r.reserved_at)}
                  </button>
                </Cell>
                <RowSep />
                <Cell width={150} marginLeft={10}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    {/* İnsan işareti ismin BAŞINDA (Gökhan: "isimlerin sonundaki insan
                        işaretini başına alalım"). Telefon olmasa da kişi kartı açılır
                        (Gökhan: "rezervasyon alınan herkese kişi kartı açılacak") — telefon
                        varsa numarayla, yoksa isimle geçmiş gösterilir. */}
                    <button onClick={() => setKartFor(r)} title="Kişi kartı" aria-label="Kişi kartı" style={{ all: "unset", cursor: "pointer", display: "inline-flex", color: inkSoft, flexShrink: 0 }}>
                      <User size={12} />
                    </button>
                    <EditableText
                      value={r.guest_name}
                      onSave={(next) => updateField(r, { guest_name: toTitleTr(next) })}
                      style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    />
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
                  <button onClick={(e) => duzenleAc(e.currentTarget.getBoundingClientRect(), r, "telefon")} style={{ ...hucreYaziBtn, fontSize: 12.5, color: "var(--ink)" }}>
                    {r.guest_phone || "—"}
                  </button>
                </Cell>
                <RowSep />
                <Cell width={48} align="center">
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
                <RowSep />
                <Cell width={150} align="center" marginLeft={18}>
                  {assigningId === r.id ? (
                    <span style={hucreKutu}>Masa seç…</span>
                  ) : masaAdi ? (
                    bugunMu && aktif ? (
                      // Masa kutusu + kilit. Kilit "müşteriye söz verildi" demek — kilitliyken
                      // otomatik yerleşme bu masayı oynatmaz, taşımaz (Gökhan).
                      <div style={{ display: "flex", alignItems: "center", gap: 4, width: "100%" }}>
                        <button
                          onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setMasaDigerAcik(false); setMasaSecimi(masaEksik ? buRezMasalari : []); setMasaAtaKonum(menuKonum(rect)); setAssigningId(r.id); }}
                          title={masaYetersiz(r) ? `Masa ${r.party_size} kişiye yetmiyor` : undefined}
                          // Kutu hücrenin tamamını kaplamasın — yanındaki kilit dışarı taşıp
                          // kırpılıyordu, kilit hiç yokmuş gibi görünüyordu (Gökhan).
                          style={{
                            ...(masaYetersiz(r) ? { ...hucreKutuBtn, border: "1px solid var(--danger)", color: "var(--danger)", fontWeight: 600 } : hucreKutuBtn),
                            width: "auto", flex: 1, minWidth: 0,
                          }}
                        >
                          {masaYetersiz(r) ? `⚠ ${masaAdi}` : masaAdi}
                        </button>
                        <button
                          onClick={() => kilitDegistir(r)}
                          title={r.masa_kilit ? "Masa kilitli — program oynatmaz. Açmak için tıkla." : "Masayı kilitle — program bu masayı oynatmasın"}
                          aria-label={r.masa_kilit ? "Masa kilidini aç" : "Masayı kilitle"}
                          style={{ all: "unset", cursor: "pointer", display: "inline-flex", flexShrink: 0, color: r.masa_kilit ? "var(--brand-strong)" : "var(--line-2)" }}
                        >
                          {r.masa_kilit ? <Lock size={13} /> : <Unlock size={13} />}
                        </button>
                      </div>
                    ) : (
                      <span style={hucreKutu}>{masaAdi}</span>
                    )
                  ) : bugunMu && aktif ? (
                    <button
                      onClick={(e) => { const rect = e.currentTarget.getBoundingClientRect(); setMasaDigerAcik(false); setMasaSecimi([]); setMasaAtaKonum(menuKonum(rect)); setAssigningId(r.id); }}
                      style={hucreKutuBtn}
                    >
                      Masa seç
                    </button>
                  ) : (
                    <span style={{ fontSize: 12.5, color: inkSoft }}>—</span>
                  )}
                </Cell>
                <RowSep />
                <Cell width={150}>
                  <button
                    onClick={(e) => duzenleAc(e.currentTarget.getBoundingClientRect(), r, "not")}
                    // Not yazısı sola yaslı (Gökhan) — cümle olduğu için soldan okunur.
                    style={{ ...hucreYaziBtn, fontSize: 12, display: "block", width: "100%", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis" }}
                  >
                    {r.note || "—"}
                  </button>
                </Cell>
                <RowSep />
                <Spacer />
                <ActionsCell width={220} align="center">
                  {/* Düğmeler gün geçse de yerinde durur (Gökhan: "belki akşam işaretleyemediler,
                      sabah işaretleyecekler"). Geçmiş günde "Geldi" masayı fiilen doldurmaz —
                      dünkü misafir bugünkü salonu tutmasın diye sadece kayda işlenir. */}
                  {r.status === "bekleniyor" && (
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
                  {r.status === "geldi" && (
                    <button
                      onClick={() => (bugunMu ? (r.table_id ? oturtDirekt(r) : oturtBaslat(r)) : durumDegistir(r, "tamamlandi"))}
                      disabled={bugunMu && !r.table_id && bosMasalar.length === 0}
                      style={{ ...btnSmallRow, opacity: bugunMu && !r.table_id && bosMasalar.length === 0 ? 0.5 : 1 }}
                    >
                      {bugunMu ? "Oturdu" : "Tamamlandı"}
                    </button>
                  )}
                  {/* Oturan misafirin masasını boşaltan tek adım — bu programın akışını kapatır. */}
                  {r.status === "oturdu" && (
                    <button onClick={() => tamamlandi(r)} disabled={busy} style={btnSmallRow}>Tamamlandı</button>
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
        </>
        )}
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
                {!isMobile && <DatePicker value={fDate} onChange={setFDate} style={{ width: 134, flexShrink: 0, whiteSpace: "nowrap" }} />}
                {fSecKartId && <span style={{ fontSize: 11.5, color: "var(--brand)" }}>Müşteri kartı bağlandı ✓</span>}
              </div>
              {/* Mobilde tarih sağa yaslı (Gökhan, 2026-08-08), Vazgeç/Ekle aşağıya sağ
                  alta alındı — masaüstünde değişmedi. */}
              {isMobile && <DatePicker value={fDate} onChange={setFDate} style={{ width: 134, flexShrink: 0, whiteSpace: "nowrap", marginLeft: "auto" }} />}
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
                    <input value={fKadin} onChange={(e) => setFKadin(e.target.value.replace(/\D/g, ""))} onFocus={(e) => e.target.select()} placeholder="K" title="Kadın sayısı (opsiyonel)" inputMode="numeric" style={{ ...inp, width: 34, flexShrink: 0, textAlign: "center" }} />
                    <input value={fErkek} onChange={(e) => setFErkek(e.target.value.replace(/\D/g, ""))} onFocus={(e) => e.target.select()} placeholder="E" title="Erkek sayısı (opsiyonel)" inputMode="numeric" style={{ ...inp, width: 34, flexShrink: 0, textAlign: "center" }} />
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
                  <input value={fNote} onChange={(e) => setFNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Özel not" style={{ ...inp, width: "100%" }} />
                </>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input autoFocus value={fName} onChange={(e) => { setFName(e.target.value); setFSecKartId(null); }} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="İsim soyisim" style={{ ...inp, flex: 1, minWidth: 160 }} />
                    <input value={fParty} onChange={(e) => setFParty(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()} onFocus={(e) => e.target.select()} placeholder="Kişi" inputMode="numeric" style={{ ...inp, width: 56, flexShrink: 0, textAlign: "center" }} />
                    <input value={fKadin} onChange={(e) => setFKadin(e.target.value.replace(/\D/g, ""))} onFocus={(e) => e.target.select()} placeholder="K" title="Kadın sayısı (opsiyonel)" inputMode="numeric" style={{ ...inp, width: 34, flexShrink: 0, textAlign: "center" }} />
                    <input value={fErkek} onChange={(e) => setFErkek(e.target.value.replace(/\D/g, ""))} onFocus={(e) => e.target.select()} placeholder="E" title="Erkek sayısı (opsiyonel)" inputMode="numeric" style={{ ...inp, width: 34, flexShrink: 0, textAlign: "center" }} />
                    <input type="time" value={fTime} onChange={(e) => setFTime(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} style={{ ...inp, width: 96, flexShrink: 0 }} />
                  </div>
                  {!fSecKartId && <MusteriAdaylariListesi adaylar={fAdaylar} onSec={fAdaySec} />}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input value={fPhone} onChange={(e) => { setFPhone(e.target.value); setFSecKartId(null); }} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Telefon" inputMode="tel" style={{ ...inp, width: 150, flexShrink: 0 }} />
                    <select value={fKanal} onChange={(e) => setFKanal(e.target.value)} title="Nereden geldi" style={{ ...inp, width: 108, flexShrink: 0 }}>
                      {ILETISIM_KANALI_SECENEKLERI.map((k) => <option key={k} value={k}>{ILETISIM_KANALI_ADI[k]}</option>)}
                    </select>
                    <input value={fNote} onChange={(e) => setFNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Özel not" style={{ ...inp, flex: 1 }} />
                  </div>
                </>
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
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 4 }}>Rezervasyon dışı</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, lineHeight: 1.5 }}>
              Kayıt zorunlu değil — hiç kaydetmeden de bir masaya doğrudan oturtabilirsin. Buradan
              girersen bugünün listesinde &quot;Geldi&quot; olarak görünür.
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
              <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)" }}>{kartFor.guest_name}</div>
              <button onClick={() => setKartFor(null)} style={btnSecondary}>Kapat</button>
            </div>
            <div className="tnum" style={{ fontSize: 12, color: inkSoft, marginBottom: 12 }}>{kartFor.guest_phone || "Telefon yok"}</div>
            {/* Mobilde işlem satırda değil kartta (Gökhan: "mobilde işlem yapmak için ismi
                tıklayacak ve kartta halledecek her işi") — masaüstünde bu düğmeler zaten
                listede olduğu için burada tekrar gösterilmiyor. */}
            {isMobile && (
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
                  {t.name} <span className="tnum" style={{ color: secili ? "#fff" : inkSoft }}>({t.seat_count} px)</span>
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
                        {t.name} <span className="tnum" style={{ color: secili ? "#fff" : inkSoft }}>({t.seat_count} px)</span>
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
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
              Hangi masaya oturtuyorsun? <span className="tnum">{seatingFor.party_size} kişi</span>
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
                    <span className="tnum" style={{ color: secili ? "#fff" : "var(--muted)" }}>{t.seat_count} px</span>
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
                        <span className="tnum" style={{ color: secili ? "#fff" : "var(--muted)" }}>{t.seat_count} px</span>
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
const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 10px", fontSize: 16, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0 };
const btnPrimary: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 980, padding: "9px 14px", background: "var(--brand-strong)", color: "#fff", fontSize: 13, fontWeight: 500, flexShrink: 0 };
const btnSecondary: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 16px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13, cursor: "pointer" };
const btnSmall: React.CSSProperties = { border: "none", borderRadius: 980, padding: "7px 14px", background: "var(--ink-green)", color: "#fff", fontSize: 12.5, flexShrink: 0, cursor: "pointer" };
const btnGhost: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "7px 12px", background: "var(--card)", color: "var(--ink)", fontSize: 12, flexShrink: 0, cursor: "pointer" };
const btnSmallRow: React.CSSProperties = { ...btnSmall, padding: "4px 14px" };
const btnGhostRow: React.CSSProperties = { ...btnGhost, padding: "4px 12px" };
const inkSoft = "#5c5c58";
const masaSecBtn: React.CSSProperties = { all: "unset", cursor: "pointer", display: "block", width: "100%", boxSizing: "border-box", padding: "7px 8px", borderRadius: 8, fontSize: 12.5, color: "var(--ink)" };
// Kutu SADECE masa sütununda kaldı — "Masa seç" ve seçili masa (Gökhan: "eklediğimiz
// kutuları masa seç ve seçili masalar dışında hepsini kaldır"). Sıra no, saat, telefon,
// kişi ve not yeniden düz yazı — alt çizgi yok (Gökhan: "yazıların altındaki çizgileri kaldır").
const hucreYaziBtn: React.CSSProperties = { all: "unset", cursor: "pointer", whiteSpace: "nowrap" };
const hucreKutu: React.CSSProperties = {
  boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center",
  width: "100%", height: 28, padding: "0 8px",
  border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--card)",
  fontSize: 12.5, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};
const hucreKutuBtn: React.CSSProperties = { all: "unset", ...hucreKutu, cursor: "pointer" };
const navBtn: React.CSSProperties = { all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: 6, borderRadius: 8, color: "var(--muted)" };
