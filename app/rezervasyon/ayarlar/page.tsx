"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getMyReservationRestaurantId, getMyReservationRestaurants, isMultiBranchAccount, setAktifSube, type ReservationBranch } from "@/lib/supabase/reservationAccount";
import { toTitleTr } from "@/lib/text";
import { eslesenIller, eslesenIlceler } from "@/lib/turkeyLocations";
import { ChevronDown, Plus, Store, X } from "lucide-react";
import { useConfirm } from "../../components/useConfirm";
import RezervasyonAltNav, { ALT_NAV_YUKSEKLIK, useYatayMobil } from "../../components/RezervasyonAltNav";
import RezervasyonUstBar from "../../components/RezervasyonUstBar";
import { MenuBaslik, MenuNav } from "../../components/RezervasyonMenu";

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
// Sol menüde ayar başlıkları, sağda seçilenin içeriği (Gökhan, 2026-08-15: "sol menüde
// başlıklarımız olacak, ona göre içeriği açılacak, aşağı kayma olmayacak"). Kaydet tektir,
// hangi bölümde olursan ol hepsini birlikte kaydeder (PAGE_STANDARDS #2).
type Fotograf = { id: string; dosya_yolu: string; sira: number };

// Ülke kodları. BAYRAK EMOJİSİ KULLANILMIYOR (Gökhan, 2026-08-15: "TR'nin yerine Türk
// bayrağı olsun") — Windows bayrak emojilerini çizmiyor, yerine iki harf ("TR", "DE")
// gösteriyor. Bayraklar aşağıda SVG olarak çiziliyor: dış kaynağa bağlı değil.
const ULKELER = [
  { kod: "+90", iso: "tr", ad: "Türkiye" },
  { kod: "+90392", iso: "kktc", ad: "KKTC" },
  { kod: "+49", iso: "de", ad: "Almanya" },
  { kod: "+31", iso: "nl", ad: "Hollanda" },
  { kod: "+44", iso: "gb", ad: "İngiltere" },
  { kod: "+33", iso: "fr", ad: "Fransa" },
  { kod: "+1", iso: "us", ad: "ABD" },
  { kod: "+7", iso: "ru", ad: "Rusya" },
  { kod: "+994", iso: "az", ad: "Azerbaycan" },
  { kod: "+971", iso: "ae", ad: "BAE" },
];

function Bayrak({ iso }: { iso: string }) {
  const o = { width: 20, height: 14, viewBox: "0 0 30 20", style: { borderRadius: 2, flexShrink: 0, display: "block" } };
  const ayYildiz = (renk: string) => (
    <>
      <circle cx="11" cy="10" r="5" fill={renk} />
      <circle cx="12.6" cy="10" r="4" fill="currentColor" />
      <path d="M17.4 7.6 18.3 9.4 20.3 9.6 18.8 10.9 19.3 12.9 17.4 11.9 15.6 12.9 16.1 10.9 14.6 9.6 16.6 9.4z" fill={renk} />
    </>
  );
  switch (iso) {
    case "tr": return <svg {...o} color="#E30A17"><rect width="30" height="20" fill="#E30A17" />{ayYildiz("#fff")}</svg>;
    case "kktc": return <svg {...o} color="#fff"><rect width="30" height="20" fill="#fff" /><rect y="2.5" width="30" height="2" fill="#E30A17" /><rect y="15.5" width="30" height="2" fill="#E30A17" />{ayYildiz("#E30A17")}</svg>;
    case "de": return <svg {...o}><rect width="30" height="6.67" fill="#000" /><rect y="6.67" width="30" height="6.67" fill="#D00" /><rect y="13.34" width="30" height="6.66" fill="#FFCE00" /></svg>;
    case "nl": return <svg {...o}><rect width="30" height="6.67" fill="#AE1C28" /><rect y="6.67" width="30" height="6.67" fill="#fff" /><rect y="13.34" width="30" height="6.66" fill="#21468B" /></svg>;
    case "gb": return (
      <svg {...o}>
        <rect width="30" height="20" fill="#012169" />
        <path d="M0 0 30 20M30 0 0 20" stroke="#fff" strokeWidth="4" />
        <path d="M0 0 30 20M30 0 0 20" stroke="#C8102E" strokeWidth="2" />
        <path d="M15 0V20M0 10H30" stroke="#fff" strokeWidth="6" />
        <path d="M15 0V20M0 10H30" stroke="#C8102E" strokeWidth="3" />
      </svg>
    );
    case "fr": return <svg {...o}><rect width="10" height="20" fill="#0055A4" /><rect x="10" width="10" height="20" fill="#fff" /><rect x="20" width="10" height="20" fill="#EF4135" /></svg>;
    case "us": return (
      <svg {...o}>
        <rect width="30" height="20" fill="#fff" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => <rect key={i} y={i * 3.08} width="30" height="1.54" fill="#B22234" />)}
        <rect width="13" height="10.8" fill="#3C3B6E" />
      </svg>
    );
    case "ru": return <svg {...o}><rect width="30" height="6.67" fill="#fff" /><rect y="6.67" width="30" height="6.67" fill="#0039A6" /><rect y="13.34" width="30" height="6.66" fill="#D52B1E" /></svg>;
    case "az": return <svg {...o} color="#EF3340"><rect width="30" height="6.67" fill="#00B5E2" /><rect y="6.67" width="30" height="6.67" fill="#EF3340" /><rect y="13.34" width="30" height="6.66" fill="#509E2F" />{ayYildiz("#fff")}</svg>;
    case "ae": return <svg {...o}><rect width="30" height="6.67" fill="#00732F" /><rect y="6.67" width="30" height="6.67" fill="#fff" /><rect y="13.34" width="30" height="6.66" fill="#000" /><rect width="8" height="20" fill="#F00" /></svg>;
    default: return null;
  }
}

// Ülke kodu kutusu — native <select> içine görsel konamadığı için kendi açılır listesi var.
function UlkeKodu({ deger, onDegis }: { deger: string; onDegis: (k: string) => void }) {
  const [acik, setAcik] = useState(false);
  const secili = ULKELER.find((u) => u.kod === deger) ?? ULKELER[0];
  return (
    <div style={{ position: "relative", width: 66, flexShrink: 0 }}>
      <button
        type="button" onClick={() => setAcik((v) => !v)} aria-label="Ülke kodu" title={secili.ad}
        style={{ ...inp, width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", padding: "8px 4px" }}
      >
        <Bayrak iso={secili.iso} />
        <span className="tnum" style={{ fontSize: 12 }}>{secili.kod}</span>
      </button>
      {acik && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setAcik(false)} />
          <div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 41, minWidth: 190, background: "var(--card)", border: "1px solid var(--line-2)", borderRadius: 10, boxShadow: "0 6px 18px rgba(0,0,0,0.12)", overflow: "hidden" }}>
            {ULKELER.map((u) => (
              <button
                key={u.kod} type="button"
                onClick={() => { onDegis(u.kod); setAcik(false); }}
                style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, width: "100%", boxSizing: "border-box", padding: "7px 10px", fontSize: 13, background: u.kod === deger ? "var(--recede)" : "transparent", color: "var(--ink)" }}
              >
                <Bayrak iso={u.iso} />
                <span style={{ flex: 1 }}>{u.ad}</span>
                <span className="tnum" style={{ color: "var(--muted-2)", fontSize: 12 }}>{u.kod}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// İŞLETME TÜRÜ KUTUSU — işletme adının yanında, aşağı açılan liste (Gökhan, 2026-08-16:
// "işletme adı satırını ikiye böl ve yanına işletme türünü koy, akordion açılsın oradan seçsin").
// Ülke kodu kutusuyla aynı desen: native <select> yerine kendi listesi, çünkü seçili türün
// yazısı kutuda tam görünsün isteniyor.
function TurSecici({ deger, onDegis }: { deger: IsletmeTipi; onDegis: (t: IsletmeTipi) => void }) {
  const [acik, setAcik] = useState(false);
  const secili = ISLETME_TIPLERI.find((t) => t.anahtar === deger) ?? ISLETME_TIPLERI[0];
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button" onClick={() => setAcik((v) => !v)}
        style={{ ...inp, width: "100%", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, cursor: "pointer", textAlign: "left" }}
      >
        <span>{secili.ad}</span>
        <ChevronDown size={14} style={{ flexShrink: 0, color: "var(--muted-2)", transform: acik ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
      </button>
      {acik && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setAcik(false)} />
          <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 41, background: "var(--card)", border: "1px solid var(--line-2)", borderRadius: 10, boxShadow: "0 6px 18px rgba(0,0,0,0.12)", overflow: "hidden", maxHeight: 260, overflowY: "auto" }}>
            {ISLETME_TIPLERI.map((t) => (
              <button
                key={t.anahtar} type="button"
                onClick={() => { onDegis(t.anahtar); setAcik(false); }}
                style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", boxSizing: "border-box", padding: "8px 11px", fontSize: 13, color: t.anahtar === deger ? "var(--brand-strong)" : "var(--ink)", background: t.anahtar === deger ? "var(--recede)" : "transparent", fontWeight: t.anahtar === deger ? 600 : 400 }}
              >
                {t.ad}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Dosya adı için benzersiz metin. crypto.randomUUID KULLANILMIYOR: sayfa localhost dışında bir
 * adresten açıldığında (telefondan, yerel ağ IP'siyle) tarayıcı bu işlevi tanımıyor ve fotoğraf
 * yükleme sessizce patlıyordu (Gökhan, 2026-08-16: "foto yüklemeye çalıştım ama yükleme
 * yapmadı"). Burada güvenlik değil çakışmama gerekiyor; zaman + rastgele yeterli.
 */
const benzersizAd = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/** "1.500,50" ya da "1500.50" — ikisini de sayıya çevirir. Boşsa 0. */
const sayiyaCevir = (girdi: string): number => {
  const t = girdi.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(t);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** Instagram: tam adres yapıştırılsa da kullanıcı adına indiriliyor. */
const instagramTemizle = (girdi: string) =>
  girdi.trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?].*$/, "");

// AYAR BAŞLIKLARI (Gökhan, 2026-08-16 — konuşarak çıkarıldı, sırasıyla onaylandı).
// Kurulum sırası: önce işletmenin kim olduğu, sonra mekânın fiziği, sonra parası, en sonda
// yasal metinler. İşletme tipi ikinci sırada çünkü altındaki her şeyin varsayılanını o basıyor.
type AyarBolumu =
  | "isletme" | "subeler" | "saatler" | "salon" | "geceler"
  | "rezervasyon" | "pr" | "paneller" | "notlar" | "mesajlar"
  | "ai" | "kvkk";
const AYAR_BOLUMLERI: { anahtar: AyarBolumu; ad: string }[] = [
  { anahtar: "isletme", ad: "İşletme bilgileri" },
  { anahtar: "subeler", ad: "Şubeler" },
  { anahtar: "saatler", ad: "Çalışma saatleri" },
  { anahtar: "salon", ad: "Salon ve masa" },
  { anahtar: "rezervasyon", ad: "Rezervasyonlar" },
  { anahtar: "pr", ad: "Özellikler" },
  { anahtar: "paneller", ad: "Paneller ve yetkiler" },
  { anahtar: "notlar", ad: "Notlar ve etiketler" },
  { anahtar: "mesajlar", ad: "Mesajlar" },
  { anahtar: "ai", ad: "Yapay zekâ" },
  { anahtar: "kvkk", ad: "KVKK" },
  { anahtar: "geceler", ad: "Etkinlikler" },
];

// İŞLETME TİPİ — sadece VARSAYILANI basar (Gökhan: "ona göre varsayılan ayarlansın, işletme
// istediği yerleri değiştirsin"). Tip sonradan değişince mevcut ayarlara dokunulmaz; ekran
// "varsayılanları uygula" diye ayrı bir düğme gösterir, basmak işletmenin kararıdır.
// Kayıt ekranındaki tür listesiyle BİREBİR aynı — oradaki seçim buraya düşüyor.
// Varsayılanlar veritabanındaki isletme_tipi_varsayilani ile aynı değerler; ikisi ayrışırsa
// kayıtta basılan ayar ile buradaki "varsayılanları uygula" farklı sonuç verir.
type IsletmeTipi =
  | "gece_kulubu" | "gece_kulubu_canli" | "yn_meyhane" | "canli_muzik" | "gazino" | "meyhane" | "bar_pub"
  | "restoran" | "kafe" | "kafeterya" | "pastane" | "fast_food" | "diger";
// Her türün KENDİ ÇALIŞMA SAATİ de var (Gökhan, 2026-08-16: "her türün kendi varsayılanı
// olacak, tür değişti ise varsayılan saat de değişir"). İşletme günü ayrıca sorulmuyor —
// kapanış gece yarısını aşıyorsa o saatten okunuyor.
type TipVarsayilan = {
  acilis: string; kapanis: string; oturmaSuresi: string;
  fixMenu: boolean; minimumHarcama: boolean; masaPaketi: boolean; ozelGece: boolean;
  pr: boolean; guestList: boolean;
  // Kapasite koltukla değil MASAYLA sayılsın mı (Gökhan, 2026-08-20: "gece kulübünde sandalye
  // yok, masa hesabı; bir masaya 2 kişi de 5 kişi de alınır").
  masaHesabi: boolean;
};
const gunduz = (acilis: string, kapanis: string, sure: string): TipVarsayilan => ({
  acilis, kapanis, oturmaSuresi: sure,
  fixMenu: false, minimumHarcama: false, masaPaketi: false, ozelGece: false, pr: false, guestList: false,
  masaHesabi: false,
});
const ISLETME_TIPLERI: { anahtar: IsletmeTipi; ad: string; aciklama: string; v: TipVarsayilan }[] = [
  {
    anahtar: "gece_kulubu", ad: "Gece kulübü",
    aciklama: "Masa satılır, minimum harcama vardır, PR çalışır. Gece sabaha kadar sürer.",
    v: { acilis: "23:00", kapanis: "06:00", oturmaSuresi: "180", fixMenu: false, minimumHarcama: true, masaPaketi: true, ozelGece: true, pr: true, guestList: true, masaHesabi: true },
  },
  {
    anahtar: "gece_kulubu_canli", ad: "Gece kulübü — canlı müzik",
    aciklama: "Gece yarısı açılır, sahnede canlı müzik vardır. Masa satılır, PR çalışır.",
    v: { acilis: "00:00", kapanis: "06:00", oturmaSuresi: "180", fixMenu: false, minimumHarcama: true, masaPaketi: true, ozelGece: true, pr: true, guestList: true, masaHesabi: true },
  },
  {
    anahtar: "yn_meyhane", ad: "Yeni nesil meyhane",
    aciklama: "Eğlence mekânı gibi çalışır ama fix menü de satar. Masa paketi ve PR açık gelir.",
    v: { acilis: "20:00", kapanis: "04:00", oturmaSuresi: "180", fixMenu: true, minimumHarcama: true, masaPaketi: true, ozelGece: true, pr: true, guestList: true, masaHesabi: false },
  },
  {
    anahtar: "canli_muzik", ad: "Canlı müzik (akşam)",
    aciklama: "Sahne programı var; akşam açılır gece yarısını biraz geçer. Fiyat gecenin sanatçısına göre değişir.",
    v: { acilis: "18:00", kapanis: "01:00", oturmaSuresi: "180", fixMenu: true, minimumHarcama: true, masaPaketi: true, ozelGece: true, pr: false, guestList: false, masaHesabi: false },
  },
  {
    anahtar: "gazino", ad: "Gazino",
    aciklama: "Fasıl ve sahne ağırlıklı; masa paketle satılır, gece geç biter.",
    v: { acilis: "20:00", kapanis: "04:00", oturmaSuresi: "240", fixMenu: true, minimumHarcama: true, masaPaketi: true, ozelGece: true, pr: false, guestList: false, masaHesabi: false },
  },
  {
    anahtar: "meyhane", ad: "Meyhane",
    aciklama: "Genelde fix menüyle çalışır, masa gece boyu aynı misafirindir.",
    v: { acilis: "18:00", kapanis: "03:00", oturmaSuresi: "180", fixMenu: true, minimumHarcama: false, masaPaketi: false, ozelGece: true, pr: false, guestList: false, masaHesabi: false },
  },
  {
    anahtar: "bar_pub", ad: "Bar / Pub",
    aciklama: "Geç kapanır ama masa satmaz, minimum harcama uygulamaz.",
    v: { acilis: "18:00", kapanis: "04:00", oturmaSuresi: "120", fixMenu: false, minimumHarcama: false, masaPaketi: false, ozelGece: true, pr: false, guestList: false, masaHesabi: false },
  },
  { anahtar: "restoran", ad: "Restoran", aciklama: "Masa gün içinde birkaç kez döner.", v: gunduz("12:00", "23:59", "90") },
  // "Otel restoranı" kaldırıldı (Gökhan, 2026-08-16) — restorandan farkı yoktu.
  { anahtar: "kafe", ad: "Kafe", aciklama: "Hızlı devir, kısa oturma süresi.", v: gunduz("08:00", "23:00", "60") },
  { anahtar: "kafeterya", ad: "Kafeterya", aciklama: "Hızlı devir, kısa oturma süresi.", v: gunduz("08:00", "23:00", "60") },
  { anahtar: "pastane", ad: "Pastane / Fırın", aciklama: "Çok kısa oturma, yüksek devir.", v: gunduz("07:00", "21:00", "45") },
  { anahtar: "fast_food", ad: "Fast food", aciklama: "En kısa oturma süresi.", v: gunduz("10:00", "23:59", "30") },
  { anahtar: "diger", ad: "Diğer", aciklama: "Restoran varsayılanıyla başlar, her ayarı kendiniz kurarsınız.", v: gunduz("09:00", "23:00", "90") },
];

// Masa grubunun fiyatlama modu (ARASTIRMA-2-GECE-KULUBU.md 1.2 — tek "minimum" yetmiyor;
// aynı salonda dört mod yan yana çalışabiliyor).
const FIYATLAMA_MODLARI: { anahtar: string; ad: string; aciklama: string }[] = [
  { anahtar: "yok", ad: "Fiyat yok", aciklama: "Bu grupta fiyat şartı yok" },
  { anahtar: "sabit_ucret", ad: "Masa fiyatı", aciklama: "Masanın peşin fiyatı — harcamadan bağımsız" },
  { anahtar: "masa_minimum", ad: "Harcama limiti (masa)", aciklama: "Masa şu tutarın altında hesap kapatamaz" },
  { anahtar: "kisi_minimum", ad: "Harcama limiti (kişi)", aciklama: "Kişi sayısı çarpı tutar kadar limit" },
];

// Para kutusu — solunda TL yazar (Gökhan, 2026-08-16: "fiyat girdiğimiz her yerde yanına tl
// işareti gelsin, sol yanına"). Rakam sağa yaslı, TL kutunun içinde solda duruyor.
function ParaGirisi({ deger, yerTutucu, onKaydet, genislik = 110 }: {
  deger: number | null | undefined; yerTutucu?: string; onKaydet: (v: number) => void; genislik?: number;
}) {
  return (
    <div style={{ ...inp, width: genislik, flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "0 10px" }}>
      <span style={{ fontSize: 12, color: "var(--muted-2)", flexShrink: 0 }}>TL</span>
      <input
        defaultValue={deger || ""} placeholder={yerTutucu} inputMode="decimal" className="tnum"
        onBlur={(e) => onKaydet(sayiyaCevir(e.target.value))}
        style={{ border: "none", outline: "none", background: "transparent", color: "var(--ink)", fontSize: 13, width: "100%", minWidth: 0, textAlign: "center", padding: "1mm 0", lineHeight: 1.2 }}
      />
    </div>
  );
}

// Renk kutusu — tek düğme, tıklayınca sekiz renk açılıyor. Satır yan yana dursun diye
// paletin tamamı satıra serilmiyor (Gökhan, 2026-08-16).
function RenkSecici({ deger, onDegis }: { deger: string; onDegis: (r: string) => void }) {
  const [acik, setAcik] = useState(false);
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button" onClick={() => setAcik((v) => !v)} aria-label="Renk"
        // Yükseklik yanındaki kutularla aynı olsun diye dikey dolgu inp'in kendi değeriyle
        // aynı bırakıldı — daraltılınca kutu komşularından kısa kalıyordu (Gökhan, 2026-08-16).
        style={{ ...inp, width: 46, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: "1mm 10px" }}
      >
        <span style={{ width: 20, height: 14, borderRadius: 4, background: deger, boxShadow: "inset 0 0 0 1px rgba(0,0,0,.15)" }} />
      </button>
      {acik && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setAcik(false)} />
          <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, zIndex: 41, background: "var(--card)", border: "1px solid var(--line-2)", borderRadius: 10, boxShadow: "0 6px 18px rgba(0,0,0,0.12)", padding: 7, display: "grid", gridTemplateColumns: "repeat(4, 22px)", gap: 5 }}>
            {GRUP_RENKLERI.map((r) => (
              <button
                key={r} type="button" aria-label="Renk"
                onClick={() => { onDegis(r); setAcik(false); }}
                style={{ all: "unset", cursor: "pointer", width: 22, height: 22, borderRadius: 6, background: r, boxShadow: deger === r ? "0 0 0 2px var(--ink)" : "inset 0 0 0 1px rgba(0,0,0,.15)" }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Personel panelleri — katılım koduyla bağlanan personelin rolü.
const PERSONEL_ROLLERI: { anahtar: string; ad: string }[] = [
  { anahtar: "garson", ad: "Garson" },
  { anahtar: "salon_sefi", ad: "Salon şefi" },
  { anahtar: "mutfak", ad: "Mutfak şefi" },
  { anahtar: "karsilama", ad: "Karşılama" },
  { anahtar: "pr", ad: "PR" },
  { anahtar: "yonetici", ad: "Yönetici" },
];

const YETKI_SECENEKLERI: { anahtar: string; ad: string }[] = [
  { anahtar: "yonetici", ad: "Sadece yönetici" },
  { anahtar: "salon_sefi", ad: "Yönetici ve salon şefi" },
  { anahtar: "karsilama", ad: "Yönetici, salon şefi ve karşılama" },
  { anahtar: "herkes", ad: "Herkes" },
];

// Liste hâlindeki ayarların satır tipleri — her biri kendi tablosunda.
type MasaGrubu = { id: string; ad: string; renk: string; fiyatlama_modu: string; tutar: number; dahil_kisi: number | null; asan_kisi_ucreti: number | null; en_fazla_kisi: number | null; loca: boolean; sira: number };
// Grup renkleri — salon planında masa bu renkle çizilir. Boş/dolu/rezerve renkleriyle
// karışmasın diye orta koyulukta, birbirinden ayırt edilebilir bir dizi.
const GRUP_RENKLERI = ["#8B93A7", "#B4654A", "#5E8C61", "#8E6BA8", "#C08A2E", "#3F7CAC", "#A34D6B", "#4F7A78"];
type FixMenu = { id: string; ad: string; kisi_basi_fiyat: number; aciklama: string | null; sira: number };
type MasaPaketi = { id: string; ad: string; fiyat: number; icindekiler: string | null; kisi_tavani: number | null; sise_adedi: number | null; masa_hakki: number; loca_paketi: boolean; sira: number };
type OzelGece = { id: string; gun: string; ad: string; sanatci: string | null };
type RezEtiketi = { id: string; ad: string; mutfaga_gitsin: boolean; uyari: boolean; sira: number };
type PersonelHesabi = { id: string; ad_soyad: string; telefon: string | null; rol: string; durum: string };
type KatilimKodu = { id: string; rol: string; kod: string };
// Rolün görebileceği sayfalar — kod satırının yanındaki akordeondan işaretleniyor.
const SAYFALAR: { anahtar: string; ad: string }[] = [
  { anahtar: "rezervasyon", ad: "Rezervasyonlar" },
  { anahtar: "posta", ad: "Posta" },
  { anahtar: "salon", ad: "Salon" },
  { anahtar: "istatistik", ad: "İstatistikler" },
  { anahtar: "ayarlar", ad: "Ayarlar" },
];
// Menüdeki başlık düğmesi — salon ekranındaki menü düğmeleriyle aynı ölçü.
const menuBtn: React.CSSProperties = {
  all: "unset", cursor: "pointer", boxSizing: "border-box", width: "100%",
  border: "1px solid var(--line-2)", borderRadius: 10, padding: "calc(7px - 1.5mm) 14px",
  fontSize: 13.5, flexShrink: 0,
};

// Nota yazılınca ne yapılacağı: 'salon' = o salona yerleştir, 'her_zamanki_masa' = misafirin
// kendi masasını bul.

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

// Kapanış saati açılıştan önceyse gece yarısını geçmiş demektir (gece kulübü 23:00–04:00,
// meyhane 18:00–01:00 gibi) — ayrı bir "ertesi gün" kutucuğu yok, saatlerden çıkarılıyor.
// Giriş ekranındaki (app/rezervasyon/giris) aynı isimli fonksiyonla aynı mantık.
const kapanisErtesiGun = (acilis: string, kapanis: string) => Boolean(acilis) && Boolean(kapanis) && kapanis < acilis;

/**
 * İŞLETME GÜNÜ, çalışma saatlerinden okunur — ayrı bir ayar YOK (Gökhan, 2026-08-16).
 * Gece yarısını aşan bir gün varsa günün bittiği saat o günlerin EN GEÇ kapanışıdır
 * (23:00 → 04:00 ise 04:00). Hiçbiri aşmıyorsa gün normal takvim günüdür: 00:00.
 */
const isletmeGunuSaatiHesapla = (hours: OpeningHours): string => {
  let enGec = "";
  for (const d of DAYS) {
    const v = hours[d.k];
    if (!v || v.kapali) continue;
    if (!kapanisErtesiGun(v.acilis, v.kapanis)) continue;
    if (v.kapanis > enGec) enGec = v.kapanis;
  }
  return enGec || "00:00";
};

export default function RezervasyonAyarlarPage() {
  const router = useRouter();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kaydedildi, setKaydedildi] = useState(false);
  // Sol menüde seçili ayar başlığı.
  const [bolum, setBolum] = useState<AyarBolumu>("isletme");
  const { confirm, dialog: confirmDialog } = useConfirm();
  // Alt nav mobilde sabit — içerik onun altında kalmasın diye boşluk bırakılıyor
  // (Gökhan, 2026-08-08: "sayfalarda navın altında bir şeylerin kalmadığından emin ol").
  const [isMobile, setIsMobile] = useState(false);
  // Yan çevrilmişken alt menü çizilmiyor — altta ona yer ayrılmıyor (Gökhan, 2026-08-10).
  const yatayMobil = useYatayMobil();
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);


  const [masaOlculeri, setMasaOlculeri] = useState<MasaOlcusu[]>([]);
  const [duzenlenenHucre, setDuzenlenenHucre] = useState<{ shape: MasaSekli; tier: number } | null>(null);
  const [taslakGenislik, setTaslakGenislik] = useState("");
  const [taslakBoy, setTaslakBoy] = useState("");


  const [isim, setIsim] = useState("");
  const [telefon, setTelefon] = useState("");
  const [adres, setAdres] = useState("");
  // İşletme bilgileri — No63'teki bölümün aynısı (Gökhan, 2026-08-15).
  const [ulkeKodu, setUlkeKodu] = useState("+90");
  const [instagram, setInstagram] = useState("");
  const [eposta, setEposta] = useState("");
  const [vergiNo, setVergiNo] = useState("");
  const [haritaLinki, setHaritaLinki] = useState("");
  const [il, setIl] = useState("");
  const [ilce, setIlce] = useState("");
  const [fotograflar, setFotograflar] = useState<Fotograf[]>([]);
  const [fotoYukleniyor, setFotoYukleniyor] = useState(false);
  // Fotoğraf hatası sayfanın en üstünde değil, fotoğraf kutusunun altında gösteriliyor —
  // orada duran kişi hatayı göremiyordu.
  const [fotoErr, setFotoErr] = useState<string | null>(null);
  const [hours, setHours] = useState<OpeningHours>(defaultHours());
  // Yeni rezervasyon penceresinin açılış saati (Gökhan: "varsayılan saat de ayarlanabilsin").
  const [varsayilanSaat, setVarsayilanSaat] = useState("19:00");
  const [oturmaSuresi, setOturmaSuresi] = useState("90");
  const [kvkkNotice, setKvkkNotice] = useState("");
  // Otomatik yerleşme (Gökhan: "kullanmak isteyen kullanacak, istemeyen kullanmayacak") —
  // açıkken kişi sayısı büyüyüp masa yetmeyince program masayı kendi tamamlıyor.
  const [otoYerlesme, setOtoYerlesme] = useState(false);
  // Gün kapanışı: "otomatik" sessizce kapatır, "sor" sorar (Gökhan, 2026-08-13).
  const [gunKapanis, setGunKapanis] = useState("sor");
  // Masa başına eklenebilecek sandalye (Gökhan, 2026-08-12).
  const [ekSandalye, setEkSandalye] = useState("1");
  // Saate göre masa hesabı — isteğe bağlı, varsayılan kapalı. Kapalıyken günün tamamı tek
  // havuz sayılır (öğle/akşam ayrımı kaldırıldı — program eğlence mekanlarına yapılıyor).
  // Kişi kartındaki "Müdavim"/"No-show riski" etiketleri bu eşiklere göre otomatik hesaplanır
  // (Gökhan: "eşikler sabit kodlanmasın, ileride ayarlardan değiştirilebilecek mantıkta olsun").
  const [esikMudavim, setEsikMudavim] = useState("5");
  const [esikNoShow, setEsikNoShow] = useState("30");
  // NOT KURALLARI (Gökhan, 2026-08-12: "ayarlara içinde geçecek kelimeleri koyacağımız bir alan
  // yapabiliriz, şu yazılırsa nota şunu yap gibi"). Rezervasyon notuna bu kelimelerden biri
  // yazılırsa program rezervasyonu ona göre yerleştirir — büyük/küçük harf ve Türkçe karakter
  // farkı yutulur, "TERAS" ile "teras" aynı sayılır.
  // Sadık misafirin masası aranırken geriye kaç gelişine bakılacağı. 0 = hepsi.
  const [sadikGecmis, setSadikGecmis] = useState("3");

  // ONLINE REZERVASYON (Gökhan, 2026-08-15 — araştırma sonrası ilk paket).
  // DOLULUK HIZI (pacing) BİLEREK YOK: "bunun bir sınırı yok... limit yok, burası Türkiye."
  // Saate kala sınırı da yok: "yer olduğu sürece bununla ilgili problem yok."
  const [gunUfku, setGunUfku] = useState("60");
  const [onlineAcik, setOnlineAcik] = useState(true);
  const [onlineMin, setOnlineMin] = useState("1");
  const [onlineMax, setOnlineMax] = useState("12");
  const [onlineTelEsigi, setOnlineTelEsigi] = useState("12");
  const [onlineSalonSecimi, setOnlineSalonSecimi] = useState(false);
  const [onlineGelmeyenEngeli, setOnlineGelmeyenEngeli] = useState(true);
  // Hangi salonlar online listede görünecek. Masa/salon yönetimi Salon ekranında; burada
  // sadece "online'a açık mı" işareti tutuluyor.
  const [salonlar, setSalonlar] = useState<{ id: string; name: string; online_acik: boolean }[]>([]);

  // ————————————————————————————————————————————————————————————————
  // İŞLETME TİPİ VE GECE KULÜBÜ AYARLARI (Gökhan, 2026-08-16)
  // ————————————————————————————————————————————————————————————————
  const [isletmeTipi, setIsletmeTipi] = useState<IsletmeTipi>("restoran");
  const [fixMenuAcik, setFixMenuAcik] = useState(false);
  const [karmaFixAlakart, setKarmaFixAlakart] = useState(false);
  const [minimumHarcamaAcik, setMinimumHarcamaAcik] = useState(false);
  const [masaPaketiAcik, setMasaPaketiAcik] = useState(false);
  // MASA HESABI (Gökhan, 2026-08-20) — gece kulübü mantığı: kapasite koltukla değil masayla
  // sayılır, bir masaya 2 kişi de 5 kişi de alınır. Sınır aşılınca ikinci masa devreye girer;
  // o masa yandaki masadan değil, önce STOKTAN, stok bitince arka sıradan gelir.
  const [masaHesabiAcik, setMasaHesabiAcik] = useState(false);
  const [masaEnFazlaKisi, setMasaEnFazlaKisi] = useState("5");
  const [sinirAsilinca, setSinirAsilinca] = useState("sor");
  const [masaStoguAdet, setMasaStoguAdet] = useState("0");
  const [masaStoguKisi, setMasaStoguKisi] = useState("5");
  const [stokBitinceArka, setStokBitinceArka] = useState(true);
  // LOCA KURALLARI (Gökhan, 2026-08-20: "her gece kulübünde loca var ve kuralları var").
  const [locaKaporaAcik, setLocaKaporaAcik] = useState(false);
  const [locaKaporaTutar, setLocaKaporaTutar] = useState<number | null>(null);
  const [locaKaporaZorunlu, setLocaKaporaZorunlu] = useState(false);
  const [locaSatisYetkisi, setLocaSatisYetkisi] = useState("herkes");
  const [locaWalkinAcik, setLocaWalkinAcik] = useState(true);
  const [locaPaketZorunlu, setLocaPaketZorunlu] = useState(false);
  const [ozelGeceAcik, setOzelGeceAcik] = useState(false);
  const [prAcik, setPrAcik] = useState(false);
  const [prKomisyonTipi, setPrKomisyonTipi] = useState("kisi");
  const [prKomisyonTutar, setPrKomisyonTutar] = useState("0");
  const [prKendiGorsun, setPrKendiGorsun] = useState(false);
  const [guestListAcik, setGuestListAcik] = useState(false);
  const [rezAlanGorunsun, setRezAlanGorunsun] = useState(true);
  const [yapNotAcik, setYapNotAcik] = useState(true);
  const [silmeYetkisi, setSilmeYetkisi] = useState("yonetici");
  const [hesapYetkisi, setHesapYetkisi] = useState("yonetici");
  const [ayarYetkisi, setAyarYetkisi] = useState("yonetici");
  const [aiOzetAcik, setAiOzetAcik] = useState(true);
  const [aiIsimMaskele, setAiIsimMaskele] = useState(true);
  const [varsayilanaGetirAcik, setVarsayilanaGetirAcik] = useState(true);
  const [garsonSadeceKendiSalonu, setGarsonSadeceKendiSalonu] = useState(true);
  const [onlineOnayGerekli, setOnlineOnayGerekli] = useState(true);
  // Rezervasyonu tek elden alma — telefondaki personel kayıt açamaz (Gökhan, 2026-08-18).
  const [sadeceAnaPanel, setSadeceAnaPanel] = useState(false);
  // MESAJLAR (Gökhan, 2026-08-18) — WhatsApp bağlantısı işletme kullanmaya başlayınca
  // takılacak; buradaki ayarlar o güne hazır dursun diye şimdiden çalışıyor.
  const [mesajAcik, setMesajAcik] = useState(false);
  const [mesajOnayAcik, setMesajOnayAcik] = useState(true);
  const [mesajOnayMetni, setMesajOnayMetni] = useState("");
  const [mesajTeyitAcik, setMesajTeyitAcik] = useState(true);
  const [mesajTeyitSaat, setMesajTeyitSaat] = useState("12:00");
  const [mesajTeyitBitis, setMesajTeyitBitis] = useState("13:00");
  const [mesajTeyitMetni, setMesajTeyitMetni] = useState("");
  const [mesajSessizBas, setMesajSessizBas] = useState("23:00");
  const [mesajSessizBitis, setMesajSessizBitis] = useState("09:00");
  const [mesajAnketAcik, setMesajAnketAcik] = useState(false);
  const [mesajAnketMetni, setMesajAnketMetni] = useState("");

  // Liste hâlindeki ayarlar — her biri kendi tablosunda, ekle/sil ile yönetiliyor.
  const [masaGruplari, setMasaGruplari] = useState<MasaGrubu[]>([]);
  const [fixMenuler, setFixMenuler] = useState<FixMenu[]>([]);
  const [masaPaketleri, setMasaPaketleri] = useState<MasaPaketi[]>([]);
  const [ozelGeceler, setOzelGeceler] = useState<OzelGece[]>([]);
  const [rezEtiketleri, setRezEtiketleri] = useState<RezEtiketi[]>([]);
  // Hangi grupta kaç masa var — "Masalar" kutusunun yanında görünüyor.
  const [grupMasaSayisi, setGrupMasaSayisi] = useState<Record<string, number>>({});
  const [listeBusy, setListeBusy] = useState(false);
  // Personel katılım kodu ve kodla bağlanan personel istekleri.
  const [katilimKodlari, setKatilimKodlari] = useState<KatilimKodu[]>([]);
  const [rolSayfalari, setRolSayfalari] = useState<Record<string, string[]>>({});
  const [acikYetki, setAcikYetki] = useState<string | null>(null);
  const [personelIstekleri, setPersonelIstekleri] = useState<PersonelHesabi[]>([]);

  // AÇIKLAMALAR SAĞ TIKTA (Gökhan, 2026-08-16: "açıklamaların hepsini kaldır, açıklamalar
  // başlık üzerine sağ tıklayınca gelsin"). Ekran sade duruyor; ayarın ne işe yaradığını
  // merak eden yazısına sağ tıklıyor, açıklama küçük bir kutuda çıkıyor.
  const [aciklama, setAciklama] = useState<{ x: number; y: number; metin: string } | null>(null);
  const sagTik = (metin: string) => ({
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      // Kutu ekranın sağından/altından taşmasın diye konum sınırlanıyor.
      setAciklama({
        x: Math.min(e.clientX, Math.max(8, window.innerWidth - 320)),
        y: Math.min(e.clientY, Math.max(8, window.innerHeight - 170)),
        metin,
      });
    },
    // style DÖNDÜRMÜYOR — elemanların kendi style'ı var, ikisi çakışıyordu.
    title: "Açıklama için sağ tıkla",
  });

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
    const [{ data: r }, { data: s }, { data: mo }, { data: fo }, { data: sa }, { data: mg }, { data: fm }, { data: mp }, { data: og }, { data: re }, { data: mt }, { data: ph }, { data: kk }] = await Promise.all([
      supabase.from("restaurants").select("name, phone, address, ulke_kodu, instagram, eposta, tax_number, harita_linki, il, ilce, katilim_kodu").eq("id", restId).maybeSingle(),
      supabase.from("restaurant_settings").select("*").eq("restaurant_id", restId).maybeSingle(),
      supabase.from("masa_olculeri").select("shape, seat_tier, width_cm, height_cm").eq("restaurant_id", restId),
      supabase.from("restaurant_photos").select("id, dosya_yolu, sira").eq("restaurant_id", restId).order("sira"),
      supabase.from("dining_areas").select("id, name, online_acik").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("masa_gruplari").select("id, ad, renk, fiyatlama_modu, tutar, dahil_kisi, asan_kisi_ucreti, en_fazla_kisi, loca, sira").eq("restaurant_id", restId).is("deleted_at", null).order("sira"),
      supabase.from("fix_menuler").select("id, ad, kisi_basi_fiyat, aciklama, sira").eq("restaurant_id", restId).is("deleted_at", null).order("sira"),
      supabase.from("masa_paketleri").select("id, ad, fiyat, icindekiler, kisi_tavani, sise_adedi, masa_hakki, loca_paketi, sira").eq("restaurant_id", restId).is("deleted_at", null).order("sira"),
      supabase.from("ozel_geceler").select("id, gun, ad, sanatci").eq("restaurant_id", restId).is("deleted_at", null).order("gun"),
      supabase.from("rezervasyon_etiketleri").select("id, ad, mutfaga_gitsin, uyari, sira").eq("restaurant_id", restId).is("deleted_at", null).order("sira"),
      supabase.from("restaurant_tables").select("grup_id").eq("restaurant_id", restId).is("deleted_at", null),
      supabase.from("personel_hesaplari").select("id, ad_soyad, telefon, rol, durum").eq("restaurant_id", restId).order("created_at"),
      supabase.from("katilim_kodlari").select("id, rol, kod").eq("restaurant_id", restId),
    ]);
    const rRow = r as {
      name: string; phone: string | null; address: string | null; ulke_kodu: string | null;
      instagram: string | null; eposta: string | null; tax_number: string | null;
      harita_linki: string | null; il: string | null; ilce: string | null; katilim_kodu: string | null;
    } | null;
    setIsim(rRow?.name ?? "");
    setTelefon((rRow?.phone ?? "").replace(/\D/g, "").replace(/^0+/, ""));
    setAdres(rRow?.address ?? "");
    setUlkeKodu(rRow?.ulke_kodu ?? "+90");
    setInstagram(rRow?.instagram ?? "");
    setEposta(rRow?.eposta ?? "");
    setVergiNo(rRow?.tax_number ?? "");
    setHaritaLinki(rRow?.harita_linki ?? "");
    setIl(rRow?.il ?? "");
    setIlce(rRow?.ilce ?? "");
    setFotograflar((fo as Fotograf[]) ?? []);
    const sRow = s as {
      opening_hours: unknown; kvkk_notice: string | null; default_duration_minutes: number; auto_seating: boolean;
      varsayilan_rezervasyon_saati: string; musteri_sadakat_ziyaret_esigi: number; musteri_no_show_risk_yuzde: number;
      masa_ek_sandalye: number; sadik_masa_gecmis_sayisi: number; gun_kapanis: string;
      rezervasyon_gun_ufku: number; online_acik: boolean; online_min_kisi: number;
      online_max_kisi: number; online_telefon_esigi: number; online_salon_secimi: boolean;
      online_gelmeyen_engeli: boolean; online_onay_gerekli: boolean;
      sadece_ana_panel_rezervasyon: boolean;
      mesaj_acik: boolean; mesaj_onay_acik: boolean; mesaj_onay_metni: string | null;
      mesaj_teyit_acik: boolean; mesaj_teyit_saat: string; mesaj_teyit_bitis: string;
      mesaj_teyit_metni: string | null; mesaj_sessiz_baslangic: string; mesaj_sessiz_bitis: string;
      mesaj_anket_acik: boolean; mesaj_anket_metni: string | null;
      isletme_tipi: IsletmeTipi; isletme_gunu_saati: string;
      fix_menu_acik: boolean; karma_fix_alakart: boolean;
      minimum_harcama_acik: boolean; masa_paketi_acik: boolean; ozel_gece_acik: boolean;
      masa_hesabi_acik: boolean; masa_en_fazla_kisi: number; sinir_asilinca: string;
      masa_stogu_adet: number; masa_stogu_kisi: number; stok_bitince_arka_sira: boolean;
      loca_kapora_acik: boolean; loca_kapora_tutar: number | null; loca_kapora_zorunlu: boolean;
      loca_satis_yetkisi: string; loca_walkin_acik: boolean; loca_paket_zorunlu: boolean;
      pr_acik: boolean; pr_komisyon_tipi: string; pr_komisyon_tutar: number;
      pr_kendi_gorsun: boolean; pr_sadece_gelene: boolean; guest_list_acik: boolean;
      rezervasyon_alan_gorunsun: boolean; yapilandirilmis_not_acik: boolean;
      silme_yetkisi: string; hesap_girme_yetkisi: string; ayar_yetkisi: string;
      ai_ozet_acik: boolean; ai_isim_maskele: boolean; varsayilana_getir_acik: boolean;
      garson_sadece_kendi_salonu: boolean;
      rol_sayfalari: Record<string, string[]> | null;
    } | null;
    setHours(mergeHours(sRow?.opening_hours));
    setVarsayilanSaat(sRow?.varsayilan_rezervasyon_saati ?? "19:00");
    setOturmaSuresi(String(sRow?.default_duration_minutes ?? 90));
    setKvkkNotice(sRow?.kvkk_notice ?? "");
    setOtoYerlesme(sRow?.auto_seating ?? false);
    setGunKapanis(sRow?.gun_kapanis ?? "sor");
    setEkSandalye(String(sRow?.masa_ek_sandalye ?? 1));
    setEsikMudavim(String(sRow?.musteri_sadakat_ziyaret_esigi ?? 5));
    setEsikNoShow(String(sRow?.musteri_no_show_risk_yuzde ?? 30));
    setSadikGecmis(String(sRow?.sadik_masa_gecmis_sayisi ?? 3));
    setGunUfku(String(sRow?.rezervasyon_gun_ufku ?? 60));
    setOnlineAcik(sRow?.online_acik ?? true);
    setOnlineMin(String(sRow?.online_min_kisi ?? 1));
    setOnlineMax(String(sRow?.online_max_kisi ?? 12));
    setOnlineTelEsigi(String(sRow?.online_telefon_esigi ?? 12));
    setOnlineSalonSecimi(sRow?.online_salon_secimi ?? false);
    setOnlineGelmeyenEngeli(sRow?.online_gelmeyen_engeli ?? true);
    setSalonlar((sa as { id: string; name: string; online_acik: boolean }[]) ?? []);
    setOnlineOnayGerekli(sRow?.online_onay_gerekli ?? true);
    setSadeceAnaPanel(sRow?.sadece_ana_panel_rezervasyon ?? false);
    setMesajAcik(sRow?.mesaj_acik ?? false);
    setMesajOnayAcik(sRow?.mesaj_onay_acik ?? true);
    setMesajOnayMetni(sRow?.mesaj_onay_metni ?? "");
    setMesajTeyitAcik(sRow?.mesaj_teyit_acik ?? true);
    setMesajTeyitSaat((sRow?.mesaj_teyit_saat ?? "12:00").slice(0, 5));
    setMesajTeyitBitis((sRow?.mesaj_teyit_bitis ?? "13:00").slice(0, 5));
    setMesajTeyitMetni(sRow?.mesaj_teyit_metni ?? "");
    setMesajSessizBas((sRow?.mesaj_sessiz_baslangic ?? "23:00").slice(0, 5));
    setMesajSessizBitis((sRow?.mesaj_sessiz_bitis ?? "09:00").slice(0, 5));
    setMesajAnketAcik(sRow?.mesaj_anket_acik ?? false);
    setMesajAnketMetni(sRow?.mesaj_anket_metni ?? "");

    setIsletmeTipi(sRow?.isletme_tipi ?? "restoran");
    setFixMenuAcik(sRow?.fix_menu_acik ?? false);
    setKarmaFixAlakart(sRow?.karma_fix_alakart ?? false);
    setMinimumHarcamaAcik(sRow?.minimum_harcama_acik ?? false);
    setMasaPaketiAcik(sRow?.masa_paketi_acik ?? false);
    setMasaHesabiAcik(sRow?.masa_hesabi_acik ?? false);
    setMasaEnFazlaKisi(String(sRow?.masa_en_fazla_kisi ?? 5));
    setSinirAsilinca(sRow?.sinir_asilinca ?? "sor");
    setMasaStoguAdet(String(sRow?.masa_stogu_adet ?? 0));
    setMasaStoguKisi(String(sRow?.masa_stogu_kisi ?? 5));
    setStokBitinceArka(sRow?.stok_bitince_arka_sira ?? true);
    setLocaKaporaAcik(sRow?.loca_kapora_acik ?? false);
    setLocaKaporaTutar(sRow?.loca_kapora_tutar ?? null);
    setLocaKaporaZorunlu(sRow?.loca_kapora_zorunlu ?? false);
    setLocaSatisYetkisi(sRow?.loca_satis_yetkisi ?? "herkes");
    setLocaWalkinAcik(sRow?.loca_walkin_acik ?? true);
    setLocaPaketZorunlu(sRow?.loca_paket_zorunlu ?? false);
    setOzelGeceAcik(sRow?.ozel_gece_acik ?? false);
    setPrAcik(sRow?.pr_acik ?? false);
    setPrKomisyonTipi(sRow?.pr_komisyon_tipi ?? "kisi");
    setPrKomisyonTutar(String(sRow?.pr_komisyon_tutar ?? 0));
    setPrKendiGorsun(sRow?.pr_kendi_gorsun ?? false);
    setGuestListAcik(sRow?.guest_list_acik ?? false);
    setRezAlanGorunsun(sRow?.rezervasyon_alan_gorunsun ?? true);
    setYapNotAcik(sRow?.yapilandirilmis_not_acik ?? true);
    setSilmeYetkisi(sRow?.silme_yetkisi ?? "yonetici");
    setHesapYetkisi(sRow?.hesap_girme_yetkisi ?? "yonetici");
    setAyarYetkisi(sRow?.ayar_yetkisi ?? "yonetici");
    setAiOzetAcik(sRow?.ai_ozet_acik ?? true);
    setAiIsimMaskele(sRow?.ai_isim_maskele ?? true);
    setVarsayilanaGetirAcik(sRow?.varsayilana_getir_acik ?? true);
    setRolSayfalari(sRow?.rol_sayfalari ?? {});
    setGarsonSadeceKendiSalonu(sRow?.garson_sadece_kendi_salonu ?? true);

    setMasaGruplari((mg as MasaGrubu[]) ?? []);
    {
      const sayim: Record<string, number> = {};
      ((mt as { grup_id: string | null }[]) ?? []).forEach((t) => {
        if (t.grup_id) sayim[t.grup_id] = (sayim[t.grup_id] ?? 0) + 1;
      });
      setGrupMasaSayisi(sayim);
    }
    setFixMenuler((fm as FixMenu[]) ?? []);
    setMasaPaketleri((mp as MasaPaketi[]) ?? []);
    setOzelGeceler((og as OzelGece[]) ?? []);
    setRezEtiketleri((re as RezEtiketi[]) ?? []);
    setPersonelIstekleri((ph as PersonelHesabi[]) ?? []);
    setKatilimKodlari((kk as KatilimKodu[]) ?? []);
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

  // --- İşletme fotoğrafları (No63'teki akışın aynısı) ---
  const fotoUrl = (yol: string) => supabase.storage.from("isletme").getPublicUrl(yol).data.publicUrl;
  const fotoYukle = async (dosyalar: FileList | null) => {
    if (!dosyalar || dosyalar.length === 0 || fotoYukleniyor || !restaurantId) return;
    setFotoYukleniyor(true); setFotoErr(null); setErr(null);
    try {
      let sira = fotograflar.length;
      for (const dosya of Array.from(dosyalar)) {
        if (!dosya.type.startsWith("image/")) { setFotoErr(`${dosya.name} bir resim dosyası değil.`); break; }
        // 10 MB üstü telefon fotoğrafları yüklemeyi dakikalarca bekletiyor; baştan söylüyoruz.
        if (dosya.size > 10 * 1024 * 1024) { setFotoErr(`${dosya.name} çok büyük (10 MB üstü).`); break; }
        const uzanti = dosya.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
        // Dosya adı kullanılmıyor: Türkçe karakter ve boşluk depoda sorun çıkarıyor.
        const yol = `${restaurantId}/${benzersizAd()}.${uzanti}`;
        const { error: yuklemeHatasi } = await supabase.storage.from("isletme").upload(yol, dosya, { contentType: dosya.type });
        if (yuklemeHatasi) { setFotoErr("Fotoğraf yüklenemedi: " + yuklemeHatasi.message); break; }
        const { error } = await supabase.from("restaurant_photos")
          .insert({ restaurant_id: restaurantId, dosya_yolu: yol, sira });
        if (error) {
          // Kayıt açılamadıysa dosya depoda öksüz kalmasın.
          await supabase.storage.from("isletme").remove([yol]);
          setFotoErr("Fotoğraf kaydedilemedi: " + error.message);
          break;
        }
        sira += 1;
      }
    } catch (e) {
      // Beklenmedik hata sessizce yutulmasın — eskiden burada patlayan bir şey olduğunda
      // ekranda hiçbir şey görünmüyordu, "yükleme yapmadı" deniyordu (Gökhan, 2026-08-16).
      setFotoErr("Fotoğraf yüklenirken beklenmedik bir hata oldu: " + (e instanceof Error ? e.message : String(e)));
    }
    setFotoYukleniyor(false);
    await yenile();
  };
  const fotoSil = async (f: Fotograf) => {
    await supabase.storage.from("isletme").remove([f.dosya_yolu]);
    await supabase.from("restaurant_photos").delete().eq("id", f.id);
    await yenile();
  };

  // Bir rolün kodunu yeniler — eski kod çalışmaz, o rolle bağlı personel etkilenmez.
  const koduYenile = async (rol: string) => {
    if (!restaurantId) return;
    setErr(null);
    const { data, error } = await supabase.rpc("katilim_kodu_uret");
    if (error || !data) { setErr(error?.message ?? "Kod üretilemedi."); return; }
    const yeni = data as string;
    const mevcut = katilimKodlari.find((k) => k.rol === rol);
    const { error: yErr } = mevcut
      ? await supabase.from("katilim_kodlari").update({ kod: yeni }).eq("id", mevcut.id)
      : await supabase.from("katilim_kodlari").insert({ restaurant_id: restaurantId, rol, kod: yeni });
    if (yErr) { setErr(yErr.message); return; }
    await yenile();
  };

  // Personelin rolünü ya da durumunu değiştirir (onayla / kapat).
  const personelGuncelle = async (id: string, yama: Record<string, unknown>) => {
    setPersonelIstekleri((liste) => liste.map((h) => (h.id === id ? { ...h, ...yama } as PersonelHesabi : h)));
    const { error } = await supabase.from("personel_hesaplari").update(yama).eq("id", id);
    if (error) setErr(error.message);
  };

  // --- Liste hâlindeki ayarlar: ekle / değiştir / sil ---
  // Beşi de aynı desen: satır eklenince hemen kaydedilir, alan değişince yerinde güncellenir,
  // silme yumuşak (deleted_at). Tek "Kaydet" düğmesi bunları beklemez — liste işlemleri
  // anında yazılır, yoksa yeni eklenen satırın kimliği olmadan alt satırlar bağlanamaz.
  const listeEkle = async (tablo: string, satir: Record<string, unknown>) => {
    if (!restaurantId || listeBusy) return;
    setListeBusy(true); setErr(null);
    const { error } = await supabase.from(tablo).insert({ restaurant_id: restaurantId, ...satir });
    setListeBusy(false);
    if (error) { setErr(error.message); return; }
    await yenile();
  };
  const listeGuncelle = async (tablo: string, id: string, yama: Record<string, unknown>) => {
    const { error } = await supabase.from(tablo).update(yama).eq("id", id);
    if (error) setErr(error.message);
  };
  const listeSil = async (tablo: string, id: string) => {
    if (!restaurantId) return;
    setErr(null);
    const { error } = await supabase.from(tablo).update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) { setErr(error.message); return; }
    await yenile();
  };

  // İŞLETME TİPİ VARSAYILANLARI — tip seçilince kendiliğinden BASILMAZ, işletme düğmeye
  // basınca basılır (Gökhan: "işletme istediği yerleri değiştirsin"). Yoksa tipi merak edip
  // deneyen biri kendi ayarlarını kaybeder.
  // Tür değişince varsayılanlar KENDİLİĞİNDEN basılmaz, önce sorulur. Bu kutu artık işletme
  // bilgilerinin içinde — telefonu düzeltmeye giren biri yanlışlıkla türe dokunduğunda fix
  // menü, minimum harcama, PR gibi ayarların sessizce değişmemesi gerekiyor.
  const turDegistir = async (yeni: IsletmeTipi) => {
    if (yeni === isletmeTipi) return;
    const turAdi = (t: IsletmeTipi) => ISLETME_TIPLERI.find((x) => x.anahtar === t)?.ad ?? t;
    const onay = await confirm(
      `İşletme türü ${turAdi(isletmeTipi)} → ${turAdi(yeni)} olarak değişsin mi?`,
      { danger: false },
    );
    if (!onay) return;
    setIsletmeTipi(yeni);
    tipVarsayilaniUygula(yeni);
  };

  const tipVarsayilaniUygula = (tip: IsletmeTipi) => {
    const v = ISLETME_TIPLERI.find((t) => t.anahtar === tip)?.v;
    if (!v) return;
    // Çalışma saatleri de türün varsayılanına döner (Gökhan, 2026-08-16). Kapalı işaretlenmiş
    // günlere dokunulmuyor — hangi gün kapalı olduğu işletmenin kendi bilgisi, tür değişince
    // kaybolmamalı. İşletme günü bu saatlerden hesaplanıyor.
    setHours((h) => {
      const yeni = { ...h };
      for (const d of DAYS) yeni[d.k] = { ...h[d.k], acilis: v.acilis, kapanis: v.kapanis };
      return yeni;
    });
    setOturmaSuresi(v.oturmaSuresi);
    setFixMenuAcik(v.fixMenu);
    setMinimumHarcamaAcik(v.minimumHarcama);
    setMasaPaketiAcik(v.masaPaketi);
    setMasaHesabiAcik(v.masaHesabi);
    setOzelGeceAcik(v.ozelGece);
    setPrAcik(v.pr);
    setGuestListAcik(v.guestList);
  };

  // --- Not kuralları ---

  // Salon ve masa işlevleri Salon ekranına taşındı (Gökhan, 2026-08-15).
  // --- Tek Kaydet (PAGE_STANDARDS #2): sağ paneldeki her şey birlikte kaydedilir ---
  const kaydet = async () => {
    if (!restaurantId) return;
    setBusy(true); setErr(null); setKaydedildi(false);
    const sure = Math.max(15, Math.min(600, parseInt(oturmaSuresi.replace(/\D/g, ""), 10) || 90));
    // En küçük grup en büyüğü geçemez — geçerse ikisi de aynı sayıya çekilir, kayıt bloke olmaz.
    const enKucukKisi = Math.max(1, parseInt(onlineMin, 10) || 1);
    const enBuyukKisi = Math.max(enKucukKisi, parseInt(onlineMax, 10) || enKucukKisi);

    // Vergi numarası 10 ya da 11 hane olmalı (No63'teki kuralın aynısı).
    const temizVergi = vergiNo.replace(/\D/g, "");
    if (temizVergi && !/^[0-9]{10,11}$/.test(temizVergi)) {
      setBusy(false); setErr("Vergi kimlik numarası 10 ya da 11 hane olmalı.");
      return;
    }
    const { error: rErr } = await supabase.from("restaurants").update({
      name: isim.trim() ? toTitleTr(isim) : "İşletme",
      phone: telefon.replace(/\D/g, "").replace(/^0+/, "") || null,
      address: adres.trim() ? toTitleTr(adres) : null,
      ulke_kodu: ulkeKodu,
      instagram: instagramTemizle(instagram) || null,
      // DİKKAT: Türkçe küçültme DEĞİL — "BILGI@..." Türkçe kuralla "bılgı@..." olur, adres bozulur.
      eposta: eposta.trim().toLowerCase() || null,
      tax_number: temizVergi || null,
      harita_linki: haritaLinki.trim() || null,
      il: il.trim() ? toTitleTr(il) : null,
      ilce: ilce.trim() ? toTitleTr(ilce) : null,
    }).eq("id", restaurantId);
    if (rErr) { setBusy(false); setErr(rErr.message); return; }

    const { error: sErr } = await supabase.from("restaurant_settings").upsert({
      restaurant_id: restaurantId,
      opening_hours: hours,
      default_duration_minutes: sure,
      kvkk_notice: kvkkNotice.trim() || null,
      auto_seating: otoYerlesme,
      gun_kapanis: gunKapanis,
      masa_ek_sandalye: Math.max(0, parseInt(ekSandalye, 10) || 0),
      saate_gore_masa: false,
      masa_arasi_pay: 0,
      varsayilan_rezervasyon_saati: /^\d{2}:\d{2}$/.test(varsayilanSaat) ? varsayilanSaat : "19:00",
      musteri_sadakat_ziyaret_esigi: Math.max(1, parseInt(esikMudavim, 10) || 5),
      musteri_no_show_risk_yuzde: Math.max(0, Math.min(100, parseInt(esikNoShow, 10) || 30)),
      sadik_masa_gecmis_sayisi: Math.max(0, parseInt(sadikGecmis, 10) || 0),
      rezervasyon_gun_ufku: Math.max(0, parseInt(gunUfku, 10) || 0),
      online_acik: onlineAcik,
      online_min_kisi: enKucukKisi,
      online_max_kisi: enBuyukKisi,
      online_telefon_esigi: Math.max(0, parseInt(onlineTelEsigi, 10) || 0),
      online_salon_secimi: onlineSalonSecimi,
      online_gelmeyen_engeli: onlineGelmeyenEngeli,
      online_onay_gerekli: onlineOnayGerekli,
      sadece_ana_panel_rezervasyon: sadeceAnaPanel,
      mesaj_acik: mesajAcik,
      mesaj_onay_acik: mesajOnayAcik,
      mesaj_onay_metni: mesajOnayMetni.trim() || null,
      mesaj_teyit_acik: mesajTeyitAcik,
      mesaj_teyit_saat: mesajTeyitSaat,
      mesaj_teyit_bitis: mesajTeyitBitis,
      mesaj_teyit_metni: mesajTeyitMetni.trim() || null,
      mesaj_sessiz_baslangic: mesajSessizBas,
      mesaj_sessiz_bitis: mesajSessizBitis,
      mesaj_anket_acik: mesajAnketAcik,
      mesaj_anket_metni: mesajAnketMetni.trim() || null,

      isletme_tipi: isletmeTipi,
      // Ayrı kutu yok — çalışma saatlerinden hesaplanıp yazılıyor (Gökhan, 2026-08-16).
      isletme_gunu_saati: isletmeGunuSaatiHesapla(hours),
      fix_menu_acik: fixMenuAcik,
      karma_fix_alakart: karmaFixAlakart,
      minimum_harcama_acik: minimumHarcamaAcik,
      masa_paketi_acik: masaPaketiAcik,
      masa_hesabi_acik: masaHesabiAcik,
      masa_en_fazla_kisi: parseInt(masaEnFazlaKisi, 10) || 5,
      sinir_asilinca: sinirAsilinca,
      masa_stogu_adet: parseInt(masaStoguAdet, 10) || 0,
      masa_stogu_kisi: parseInt(masaStoguKisi, 10) || 5,
      stok_bitince_arka_sira: stokBitinceArka,
      loca_kapora_acik: locaKaporaAcik,
      loca_kapora_tutar: locaKaporaTutar,
      loca_kapora_zorunlu: locaKaporaZorunlu,
      loca_satis_yetkisi: locaSatisYetkisi,
      loca_walkin_acik: locaWalkinAcik,
      loca_paket_zorunlu: locaPaketZorunlu,
      ozel_gece_acik: ozelGeceAcik,
      pr_acik: prAcik,
      pr_komisyon_tipi: prKomisyonTipi,
      pr_komisyon_tutar: sayiyaCevir(prKomisyonTutar),
      pr_kendi_gorsun: prKendiGorsun,
      // Ayar değil kural: komisyon her zaman gerçekten gelene ödenir (Gökhan, 2026-08-16).
      pr_sadece_gelene: true,
      guest_list_acik: guestListAcik,
      rezervasyon_alan_gorunsun: rezAlanGorunsun,
      yapilandirilmis_not_acik: yapNotAcik,
      silme_yetkisi: silmeYetkisi,
      hesap_girme_yetkisi: hesapYetkisi,
      ayar_yetkisi: ayarYetkisi,
      ai_ozet_acik: aiOzetAcik,
      ai_isim_maskele: aiIsimMaskele,
      varsayilana_getir_acik: varsayilanaGetirAcik,
      rol_sayfalari: rolSayfalari,
      garson_sadece_kendi_salonu: garsonSadeceKendiSalonu,
    }, { onConflict: "restaurant_id" });
    if (sErr) { setBusy(false); setErr(sErr.message); return; }

    // Salonların online işareti tek tek yazılır — Salon ekranındaki öteki alanlara dokunulmasın.
    for (const s of salonlar) {
      const { error } = await supabase.from("dining_areas").update({ online_acik: s.online_acik }).eq("id", s.id);
      if (error) { setBusy(false); setErr(error.message); return; }
    }
    setBusy(false);
    setOturmaSuresi(String(sure));
    setOnlineMin(String(enKucukKisi));
    setOnlineMax(String(enBuyukKisi));
    setKaydedildi(true);
    setTimeout(() => setKaydedildi(false), 3000);
  };

  const setDay = (k: DayKey, patch: Partial<DayHours>) => setHours((h) => ({ ...h, [k]: { ...h[k], ...patch } }));



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
    <div style={{ background: "var(--canvas)", padding: "20px 24px", paddingBottom: yatayMobil ? 10 : (isMobile ? ALT_NAV_YUKSEKLIK + 16 : 24), height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      {confirmDialog}

      {/* MASAÜSTÜNDE ÜST BAR YOK — kimlik ve geçişler sol menüde (Gökhan, 2026-08-15:
          "salon ve rezervasyon ekranındaki gibi sol menü koy"). Telefonda düzen aynı. */}
      {isMobile && <RezervasyonUstBar restaurantId={restaurantId} sayfaBaslik="Ayarlar" />}

      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10, flexShrink: 0 }}>{err}</div>}

      <div style={{ display: "flex", gap: isMobile ? 0 : 12, flex: 1, minHeight: 0 }}>

        {!isMobile && (
          <aside style={{
            // Başlık sayısı arttıkça menü taşıyordu; kutular arası boşluk daraltıldı
            // (Gökhan, 2026-08-16: "soldaki kutuların aralarını biraz daralt, sığsın").
            width: 226, flexShrink: 0, display: "flex", flexDirection: "column", gap: 5,
            border: "1px solid var(--line)", borderRadius: 16, background: "var(--card)",
            padding: 12, boxSizing: "border-box", overflowY: "auto",
          }}>
            <MenuBaslik restaurantId={restaurantId} sayfaBaslik="Ayarlar" />
            <div style={{ height: 1, background: "var(--line)", flexShrink: 0 }} />
            <MenuNav />
            <div style={{ height: 1, background: "var(--line)", flexShrink: 0 }} />
            {/* AYAR BAŞLIKLARI — hangisine basılırsa içeriği sağda açılır (Gökhan,
                2026-08-15). Hepsi alt alta tek ekranda duruyordu, sayfa aşağı kayıyordu. */}
            {AYAR_BOLUMLERI.filter((b) => b.anahtar !== "subeler" || cokSubeli).map((b) => (
              <button
                key={b.anahtar}
                onClick={() => setBolum(b.anahtar)}
                style={{
                  ...menuBtn,
                  background: bolum === b.anahtar ? "var(--recede)" : "var(--card)",
                  color: bolum === b.anahtar ? "var(--brand)" : "var(--ink)",
                  fontWeight: bolum === b.anahtar ? 600 : 500,
                }}
              >
                {b.ad}
              </button>
            ))}
          </aside>
        )}

        {/* SOL PANELDEKİ MASA LİSTESİ KALDIRILDI (Gökhan, 2026-08-15: "ayarlardan
            masaları kaldırarak başlayalım") — masa ve salon yönetimi artık Salon
            ekranında yapılıyor, iki yerde durması karışıklık çıkarıyordu. */}
        {/* İŞLETME VE ÇALIŞMA AYARLARI (tek Kaydet) */}
        {/* Tek bölüm gösterildiği için kutu artık ekranın kalanını kullanıyor — daha önce
            480 px'e sıkışıp yanında koca boşluk bırakıyordu. İçerideki alanlar okunabilir
            genişlikte kalsın diye içerik 560 px'le sınırlı. */}
        <div style={{ flex: 1, minWidth: 340, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {/* Başlık soldan seçilen bölümün adı. */}
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-green)", marginBottom: 12, flexShrink: 0 }}>
            {AYAR_BOLUMLERI.find((b) => b.anahtar === bolum)?.ad ?? "Ayarlar"}
          </div>

          {/* İşletme bilgileri iki sütun — alta taşan kısım yan sütuna geçiyor, kaydırma
              kalkıyor (Gökhan, 2026-08-15). Öteki bölümler tek sütun, okunabilir genişlikte. */}
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0, maxWidth: bolum === "isletme" || bolum === "salon" || bolum === "rezervasyon" ? undefined : 560 }}>
            {bolum === "isletme" && (<>
            {/* Sütun arasında ince çizgi (Gökhan, 2026-08-16). Dar ekranda sütunlar alt alta
                indiğinde çizgi kendiliğinden yatay olur ve bölümleri ayırır. */}
            <div style={{ ...ikiSutun, gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            <div>
            {/* İşletme adı ve türü aynı satırda (Gökhan, 2026-08-16) — tür ayrı başlıktan
                buraya alındı, işletmenin kimliğiyle aynı yere ait. */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <div>
                <label style={lbl}>İşletme adı</label>
                <input value={isim} onChange={(e) => setIsim(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={lbl}>İşletme türü</label>
                <TurSecici deger={isletmeTipi} onDegis={turDegistir} />
              </div>
            </div>

            {/* Telefon: solda ülke kodu (bayrakla), sağda baştaki sıfır olmadan numara —
                No63'teki işletme bilgileriyle aynı düzen (Gökhan, 2026-08-15). */}
            <label style={lbl}>Telefon</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <UlkeKodu deger={ulkeKodu} onDegis={setUlkeKodu} />
              <input
                value={telefon}
                onChange={(e) => setTelefon(e.target.value.replace(/\D/g, "").replace(/^0+/, ""))}
                inputMode="tel" placeholder="532 111 22 33" className="tnum"
                style={{ ...inp, flex: 1, minWidth: 0 }}
              />
            </div>

            <label style={lbl} {...sagTik("Tam adresi yapıştırsan da kullanıcı adına indirilir.")}>Instagram</label>
            <input value={instagram} onChange={(e) => setInstagram(e.target.value)} autoCapitalize="none" placeholder="restoranadi" style={{ ...inp, width: "100%", marginBottom: 4 }} />

            <label style={lbl}>E-posta</label>
            <input value={eposta} onChange={(e) => setEposta(e.target.value)} type="email" inputMode="email" autoCapitalize="none" placeholder="iletisim@ornek.com" style={{ ...inp, width: "100%", marginBottom: 12 }} />

            {/* Bu açıklama sağ tıkta değil, etiketin yanında parantez içinde (Gökhan, 2026-08-16). */}
            <label style={lbl}>Vergi kimlik numarası (şahıs işletmesinde TC kimlik numarası)</label>
            <input value={vergiNo} onChange={(e) => setVergiNo(e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={11} placeholder="10 ya da 11 hane" className="tnum" style={{ ...inp, width: "100%", marginBottom: 4 }} />

            </div>

            {/* İKİNCİ SÜTUN — Konum buraya, en üste alındı (Gökhan, 2026-08-15: "sol alttaki
                konumu da sağ üste alırsan kaymaz"). */}
            <div style={sagSutun(isMobile)}>
            <label style={lbl} {...sagTik("Haritada işletmeyi aç, Paylaş > Bağlantıyı kopyala, buraya yapıştır.")}>Konum</label>
            <input value={haritaLinki} onChange={(e) => setHaritaLinki(e.target.value)} autoCapitalize="none" placeholder="Google Haritalar bağlantısı" style={{ ...inp, width: "100%", marginBottom: 4, boxSizing: "border-box" }} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              <div>
                <label style={lbl}>İl</label>
                <input value={il} onChange={(e) => setIl(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={lbl}>İlçe</label>
                <input value={ilce} onChange={(e) => setIlce(e.target.value)} style={{ ...inp, width: "100%", boxSizing: "border-box" }} />
              </div>
            </div>

            {/* Adres kutusu 1,5 cm alçaltıldı; altındaki açıklama satırı kaldırıldı
                (Gökhan, 2026-08-15). */}
            <label style={lbl}>Adres</label>
            {/* Adres artık tek satırlık kutu — öteki alanlarla aynı yükseklikte ve köşesinden
                çekilip büyütülemiyor (Gökhan, 2026-08-16). */}
            <input
              value={adres} onChange={(e) => setAdres(e.target.value)}
              style={{ ...inp, width: "100%", boxSizing: "border-box", marginBottom: 12 }}
            />

            {/* Fotoğraflar — ileride açılacak internet sitesi bunları kullanacak. */}
            <div style={{ ...lbl, marginTop: 8 }} {...sagTik("Bu fotoğraflar işletmenin ileride açılacak internet sitesinde kullanılacak.")}>İşletme fotoğrafları</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 8 }}>
              {fotograflar.map((f) => (
                <div key={f.id} style={{ position: "relative", height: "calc(96px - 1cm)", borderRadius: 10, overflow: "hidden", border: "1px solid var(--line-2)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fotoUrl(f.dosya_yolu)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                  <button
                    onClick={() => fotoSil(f)} aria-label="Fotoğrafı kaldır"
                    style={{ all: "unset", cursor: "pointer", position: "absolute", top: 2, right: 2, background: "rgba(34,31,29,.6)", color: "#fff", borderRadius: 999, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
              {/* Ekleme kutusu 1 cm alçak (Gökhan, 2026-08-15) — kare değil, basık. */}
              <label style={{ height: "calc(96px - 1cm)", border: "1px dashed var(--line-2)", borderRadius: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, cursor: "pointer", color: "var(--muted)", fontSize: 11.5 }}>
                <Plus size={18} />
                {fotoYukleniyor ? "Yükleniyor…" : "Fotoğraf"}
                <input type="file" accept="image/*" multiple hidden onChange={(e) => fotoYukle(e.target.files)} />
              </label>
            </div>
            {fotoErr && (
              <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 8, lineHeight: 1.5 }}>{fotoErr}</div>
            )}
            </div>
            </div>
            </>)}
            {bolum === "subeler" && (<>
            {/* Şubeler — sadece çok şubeli hesapta. Marka bilgisi (işletme türü, yetkili)
                kayıtta zaten girildi, tekrar sorulmuyor; şube eklerken sadece değişen alanlar
                (ad, telefon, il, ilçe, adres, çalışma saatleri) istenir. */}
            {cokSubeli && (
              <>
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

            </>)}
            {bolum === "salon" && (<>
            {/* MASA GRUPLARI (Gökhan, 2026-08-16: "gruba" — minimum harcama masaya tek tek
                değil gruba giriliyor). Grupların kendisi burada, hangi masanın hangi grupta
                olduğu Salon ekranında seçilecek. */}
            {/* İki sütun — solda ekleme listeleri (gruplar, paketler), sağda masa ölçüleri
                (Gökhan, 2026-08-16). İşletme bilgilerindeki düzenin aynısı. */}
            <div style={{ ...ikiSutun, gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
            <div>
            {/* Ekleme düğmesi listenin altında değil, başlığın yanında (Gökhan, 2026-08-16). */}
            {/* MASA HESABI — gece kulübü mantığı (Gökhan, 2026-08-20: "gece kulüplerinde sandalye
                olmaz, masaya göre rezervasyon alınır; bir masaya 2 kişi de 5 kişi de alınabilir,
                oturmadıkları için fark etmiyor"). İşletme türü gece kulübü seçilince kendiliğinden
                açılır; buradan her ayrıntısı değiştirilebilir. */}
            <div style={bolumBasligi}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)" }} {...sagTik("Gece kulüplerinde sandalye yoktur, masa satılır: bir masaya 2 kişi de 5 kişi de alınır. Açıkken kapasite koltukla değil masayla sayılır, sayaçlarda koltuk yerine masa görünür.")}>Masa hesabı</span>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={masaHesabiAcik} onChange={(e) => setMasaHesabiAcik(e.target.checked)} />
              <span style={{ fontSize: 13.5 }}>Kapasite masayla sayılsın (koltuk sayılmasın)</span>
            </label>
            {masaHesabiAcik && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13.5 }} {...sagTik("Bir masaya en fazla kaç kişi alınabileceğinin genel karşılığı. Masa grubuna ya da masanın kendisine ayrı sayı yazarsanız onlar geçerli olur.")}>Bir masaya en fazla</span>
                  <input
                    value={masaEnFazlaKisi} onChange={(e) => setMasaEnFazlaKisi(e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric" className="tnum" style={{ ...inp, width: 56, textAlign: "center" }}
                  />
                  <span style={{ fontSize: 13.5 }}>kişi</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13.5 }} {...sagTik("Kişi sayısı masanın sınırını aşınca (6-7-8 kişi gibi) program ikinci masayı ekler. Sorsun seçiliyse önce size sorar; ekleme seçiliyse hiç eklemez, masayı siz seçersiniz.")}>Sınır aşılınca</span>
                  <select value={sinirAsilinca} onChange={(e) => setSinirAsilinca(e.target.value)} style={{ ...inp, minWidth: 190 }}>
                    <option value="otomatik">İkinci masayı kendisi eklesin</option>
                    <option value="sor">Önce sorsun</option>
                    <option value="ekleme">Eklemesin, ben seçeyim</option>
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13.5 }} {...sagTik("İkinci masa yandaki masadan alınmaz — o masa başka misafirindir. Önce depodaki stok masalardan verilir; kullanılan her masa stoktan düşer.")}>Masa stoğu</span>
                  <input
                    value={masaStoguAdet} onChange={(e) => setMasaStoguAdet(e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric" className="tnum" style={{ ...inp, width: 56, textAlign: "center" }}
                  />
                  <span style={{ fontSize: 13.5 }}>adet ·</span>
                  <input
                    value={masaStoguKisi} onChange={(e) => setMasaStoguKisi(e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric" className="tnum" style={{ ...inp, width: 56, textAlign: "center" }}
                  />
                  <span style={{ fontSize: 13.5 }}>kişilik</span>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={stokBitinceArka} onChange={(e) => setStokBitinceArka(e.target.checked)} />
                  <span style={{ fontSize: 13.5 }} {...sagTik("Stok bittiğinde ikinci masa arka sıradaki boş masalardan alınır. Kapalıysa stok bitince program masa eklemez, size söyler.")}>Stok bitince arka sıradan masa alınsın</span>
                </label>
              </div>
            )}

            <div style={bolumBasligi}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)" }} {...sagTik("Sahne önü, loca, bahçe gibi. Gruba verdiğin renkle masa salon planında o renkte çizilir, üstünde grubun adı görünür. Masaların hangi gruba ait olduğu Salon ekranında masaya sağ tıklanarak seçilir. Fiyat ve harcama limiti isteğe bağlıdır.")}>Masa grupları</span>
              <button
                onClick={() => listeEkle("masa_gruplari", { ad: "", sira: masaGruplari.length, renk: GRUP_RENKLERI[masaGruplari.length % GRUP_RENKLERI.length] })}
                style={ekleBtn} aria-label="Masa grubu ekle" title="Masa grubu ekle"
              >
                <Plus size={13} />Ekle
              </button>
            </div>
            {/* Her grup TEK SATIR, kutular yan yana (Gökhan, 2026-08-16):
                grup adı · masalar · renk · fiyat/harcama limiti. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {masaGruplari.map((g) => (
                // Kutular DOĞRUDAN satırda — dıştaki çerçeveli kutu kaldırıldı, kutu içinde
                // kutu görünmesin (Gökhan, 2026-08-16).
                <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    defaultValue={g.ad} placeholder="Grup adı"
                    onBlur={(e) => listeGuncelle("masa_gruplari", g.id, { ad: e.target.value.trim() || g.ad })}
                    style={{ ...inp, flex: 1, minWidth: 90 }}
                  />
                  {/* Masalar — Salon ekranına gidip o gruba ait masaları seçtiriyor. */}
                  <button
                    type="button"
                    onClick={() => router.push(`/rezervasyon/salon?grup=${g.id}`)}
                    style={{ ...inp, width: 110, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}
                    title="Salon ekranında bu gruba ait masaları seç"
                  >
                    <span>Masalar</span>
                    <span className="tnum" style={{ color: "var(--muted-2)", fontSize: 12 }}>{grupMasaSayisi[g.id] ?? 0}</span>
                  </button>
                  <RenkSecici deger={g.renk} onDegis={(r) => { listeGuncelle("masa_gruplari", g.id, { renk: r }); yenile(); }} />
                  <select
                    defaultValue={g.fiyatlama_modu}
                    onChange={(e) => { listeGuncelle("masa_gruplari", g.id, { fiyatlama_modu: e.target.value }); yenile(); }}
                    style={{ ...inp, width: 150 }}
                  >
                    {FIYATLAMA_MODLARI.map((m) => <option key={m.anahtar} value={m.anahtar}>{m.ad}</option>)}
                  </select>
                  {g.fiyatlama_modu !== "yok" && (
                    <ParaGirisi
                      deger={g.tutar} yerTutucu="Tutar" genislik={110}
                      onKaydet={(v) => listeGuncelle("masa_gruplari", g.id, { tutar: v })}
                    />
                  )}
                  {/* EN FAZLA KİŞİ — masa hesabında bu gruptaki masaya kaç kişi alınır
                      (Gökhan, 2026-08-20: loca 12, normal masa 5 gibi). Boş bırakılırsa
                      işletmenin genel sınırı geçerli. */}
                  {masaHesabiAcik && (
                    <input
                      defaultValue={g.en_fazla_kisi ?? ""} placeholder="Kişi" inputMode="numeric" className="tnum"
                      title="Bu gruptaki bir masaya en fazla kaç kişi"
                      onBlur={(e) => listeGuncelle("masa_gruplari", g.id, { en_fazla_kisi: parseInt(e.target.value, 10) || null })}
                      style={{ ...inp, width: 56, flexShrink: 0, textAlign: "center" }}
                    />
                  )}
                  {/* LOCA İŞARETİ — loca kuralları (kapora, satış yetkisi, kapı girişi, paket
                      zorunluluğu) bu işaretli gruplara uygulanır (Gökhan, 2026-08-20). */}
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, flexShrink: 0, cursor: "pointer" }} title="Bu grup loca — aşağıdaki loca kuralları uygulanır">
                    <input type="checkbox" defaultChecked={g.loca} onChange={(e) => listeGuncelle("masa_gruplari", g.id, { loca: e.target.checked })} />
                    Loca
                  </label>
                  <button onClick={() => listeSil("masa_gruplari", g.id)} style={silBtn} aria-label="Grubu sil"><X size={13} /></button>
                </div>
              ))}
            </div>
            {/* MASA PAKETİ — Fiyatlandırma'dan buraya alındı (Gökhan, 2026-08-16). */}
            <div style={{ ...bolumBasligi, marginTop: 18 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)" }} {...sagTik("Hazır masa paketleri: adı, fiyatı ve içinde ne olduğu. Rezervasyon alınırken seçilir, hesap kendiliğinden gelir, mutfak ve bar masaya ne çıkacağını görür.")}>Masa paketi</span>
              <button
                onClick={() => listeEkle("masa_paketleri", { ad: "", sira: masaPaketleri.length })}
                style={ekleBtn} aria-label="Masa paketi ekle" title="Masa paketi ekle"
              >
                <Plus size={13} />Ekle
              </button>
            </div>
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                {masaPaketleri.map((p) => (
                  // Tek satır, alta sarmıyor (Gökhan, 2026-08-16) — kutular sığmadığında
                  // daralıyor, en küçük genişlikleri buna göre kısıldı.
                  <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      defaultValue={p.ad} placeholder="Paket adı"
                      onBlur={(e) => listeGuncelle("masa_paketleri", p.id, { ad: e.target.value.trim() || p.ad })}
                      style={{ ...inp, flex: 1, minWidth: 0 }}
                    />
                    <ParaGirisi
                      deger={p.fiyat} yerTutucu="Fiyat" genislik={100}
                      onKaydet={(v) => listeGuncelle("masa_paketleri", p.id, { fiyat: v })}
                    />
                    <input
                      defaultValue={p.kisi_tavani ?? ""} placeholder="Kişi" inputMode="numeric" className="tnum"
                      onBlur={(e) => listeGuncelle("masa_paketleri", p.id, { kisi_tavani: parseInt(e.target.value, 10) || null })}
                      style={{ ...inp, width: 56, flexShrink: 0, textAlign: "center" }}
                    />
                    <input
                      defaultValue={p.icindekiler ?? ""} placeholder="İçindekiler"
                      onBlur={(e) => listeGuncelle("masa_paketleri", p.id, { icindekiler: e.target.value.trim() || null })}
                      style={{ ...inp, flex: 1.4, minWidth: 0 }}
                    />
                    {/* ŞİŞE ve MASA HAKKI (Gökhan, 2026-08-20: "5 kişi şişe açarsa 2 masa
                        birleşir", "paket şişe sayısını da işletme belirler"). */}
                    <input
                      defaultValue={p.sise_adedi ?? ""} placeholder="Şişe" inputMode="numeric" className="tnum"
                      title="Pakette kaç şişe var"
                      onBlur={(e) => listeGuncelle("masa_paketleri", p.id, { sise_adedi: parseInt(e.target.value, 10) || null })}
                      style={{ ...inp, width: 56, flexShrink: 0, textAlign: "center" }}
                    />
                    <input
                      defaultValue={p.masa_hakki ?? 1} placeholder="Masa" inputMode="numeric" className="tnum"
                      title="Bu paketi alan kaç masa tutar"
                      onBlur={(e) => listeGuncelle("masa_paketleri", p.id, { masa_hakki: parseInt(e.target.value, 10) || 1 })}
                      style={{ ...inp, width: 56, flexShrink: 0, textAlign: "center" }}
                    />
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12.5, flexShrink: 0, cursor: "pointer" }} title="Bu paket loca paketidir">
                      <input type="checkbox" defaultChecked={p.loca_paketi} onChange={(e) => listeGuncelle("masa_paketleri", p.id, { loca_paketi: e.target.checked })} />
                      Loca
                    </label>
                    <button onClick={() => listeSil("masa_paketleri", p.id)} style={silBtn} aria-label="Paketi sil"><X size={13} /></button>
                  </div>
                ))}
              </div>
            </>

            {/* LOCA KURALLARI (Gökhan, 2026-08-20: "her gece kulübünde loca var ve kuralları
                var, ona göre ayarlarda koymalıyız"). Locanın kendisi bir MASA GRUBU olarak
                tanımlanıyor (yukarıda); buradaki kurallar o gruba ait masaların nasıl
                satılacağını belirliyor. */}
            <div style={{ ...bolumBasligi, marginTop: 18 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)" }} {...sagTik("Loca satışının kuralları: kapora isteniyor mu, zorunlu mu, locayı kim satabilir, kapıdan gelen misafire loca verilebilir mi, paketsiz loca satılabilir mi. Locanın fiyatı ve kişi sayısı yukarıdaki masa grubunda tanımlanır.")}>Loca kuralları</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={locaKaporaAcik} onChange={(e) => setLocaKaporaAcik(e.target.checked)} />
                <span style={{ fontSize: 13.5 }}>Loca için kapora alınsın</span>
              </label>
              {locaKaporaAcik && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", paddingLeft: 22 }}>
                  <span style={{ fontSize: 13.5 }}>Kapora</span>
                  <ParaGirisi deger={locaKaporaTutar} yerTutucu="Tutar" genislik={110} onKaydet={(v) => setLocaKaporaTutar(v)} />
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, cursor: "pointer" }}>
                    <input type="checkbox" checked={locaKaporaZorunlu} onChange={(e) => setLocaKaporaZorunlu(e.target.checked)} />
                    Zorunlu (kaporasız loca kaydı açılamaz)
                  </label>
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5 }} {...sagTik("Locayı kimin satabileceği. Seçilenden başkası loca kaydı açamaz; açmaya çalışırsa program uyarır.")}>Locayı satabilir</span>
                <select value={locaSatisYetkisi} onChange={(e) => setLocaSatisYetkisi(e.target.value)} style={{ ...inp, minWidth: 170 }}>
                  <option value="herkes">Herkes</option>
                  <option value="karsilama">Karşılama ve üstü</option>
                  <option value="pr">PR ve yönetici</option>
                  <option value="yonetici">Sadece yönetici</option>
                </select>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={locaWalkinAcik} onChange={(e) => setLocaWalkinAcik(e.target.checked)} />
                <span style={{ fontSize: 13.5 }} {...sagTik("Kapalıyken loca yalnızca rezervasyonla satılır; kapıdan gelen misafire loca verilemez.")}>Kapıdan gelene loca verilebilsin</span>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={locaPaketZorunlu} onChange={(e) => setLocaPaketZorunlu(e.target.checked)} />
                <span style={{ fontSize: 13.5 }} {...sagTik("Açıkken loca kaydı paket seçilmeden kaydedilemez. Loca paketleri yukarıdaki listede 'Loca' işaretiyle ayrılıyor.")}>Loca paketsiz satılamasın</span>
              </label>
            </div>
            </div>

            {/* SAĞ SÜTUN — masa ölçüleri (Gökhan: "masa ölçülerini de girsinler ayarlardan,
                hangi masaları varsa onları seçip ölçü girsin"). Hücreye tıkla, düzenle, kaydet.
                Değiştirmezsen standart ölçü (VARSAYILAN_OLCU) kullanılmaya devam eder. */}
            <div style={sagSutun(isMobile)}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)", marginBottom: 6 }} {...sagTik("Salon ekranındaki masaların gerçek santim (en × boy) ölçüsü. Değiştirmezsen standart ölçüler kullanılır.")}>Masa ölçüleri</div>
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
            </div>
            </div>

            </>)}
            {bolum === "saatler" && (<>
            {/* AYRI "İŞLETME GÜNÜ SAATİ" AYARI YOK (Gökhan, 2026-08-16: "zaten günlük çalışma
                saatlerinin yazdığı bir ayar var, neden ekstra bunu tekrar belirtmek gerekiyor").
                İşletme günü o günün KAPANIŞ saatinden okunuyor: kapanış açılıştan önceyse
                (23:00 → 04:00) gece yarısı aşılıyor demektir, o gecenin 01:30'u hâlâ dünün
                gecesidir. Kapanış gece yarısını aşmıyorsa gün normal takvim günüdür. */}
            {/* Çalışma saatleri — misafir sayfası bu saatlerin dışına rezervasyon aldırmayacak. */}
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

            </>)}
            {bolum === "rezervasyon" && (<>
            {/* İKİ SÜTUN: solda rezervasyon, sağda online rezervasyon (Gökhan, 2026-08-16 —
                "aynı sayfaya al, yine iki taraflı kullan"). */}
            <div style={{ ...ikiSutun, gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))" }}>
            <div>
            {/* Sayfa başlığı "Rezervasyonlar", sol sütunun kendi başlığı "Rezervasyon"
                (Gökhan, 2026-08-16) — sağdaki "Online rezervasyon"la eşleşsin diye. */}
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)", marginBottom: 10 }}>Rezervasyon</div>

            {/* GÜN UFKU (Gökhan, 2026-08-15). Saate kala sınırı yok — "yer olduğu sürece
                bununla ilgili problem yok". */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13.5 }} {...sagTik("Misafirin kendi sayfasından bu kadar ileriye rezervasyon alınabilir. 0 yazılırsa sınır yoktur. Saate kala bir sınır konmadı: yer olduğu sürece son dakika kaydı da alınır.")}>En fazla kaç gün öncesinden rezervasyon:</span>
              <input
                value={gunUfku}
                onChange={(e) => setGunUfku(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric" className="tnum" style={{ ...inp, width: 62, textAlign: "center" }}
              />
              <span style={{ fontSize: 13.5 }}>gün</span>
            </div>

            {/* "Varsayılan oturma süresi" kutusu KALDIRILDI (Gökhan, 2026-08-16). Süre zaten
                işletme türünün varsayılanından geliyor ve sadece istatistikte kullanılıyor —
                masayı boşaltmadığı için işletmenin elle girmesine gerek yok. */}

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13.5 }} {...sagTik("Yeni rezervasyon penceresi bu saatle açılır. Bugün için bu saat geçmişse pencere bir sonraki tam saatle açılır.")}>Varsayılan rezervasyon saati:</span>
              <input
                type="time"
                value={varsayilanSaat}
                onChange={(e) => setVarsayilanSaat(e.target.value)}
                className="tnum" style={{ ...inp, width: 110 }}
              />
            </div>

            {/* "SAATE GÖRE MASA HESABI" AYARI KALDIRILDI (Gökhan, 2026-08-16): masayı oturma
                süresi dolunca yeni rezervasyona açıyordu — yani oturan misafirin masası
                önceden başkasına söz veriliyordu. Gökhan: "masa kalkmadıkça masaya kimse
                alınamasın, kalktı ya da tamamlandı demedikçe sistem masaya kimseyi almasın."
                Günün tamamı artık her zaman tek havuz. Boşalacak masa beklemek isteyen için
                yol bekleme listesi ya da kapı girişidir, rezervasyon değil. */}


            {/* REZERVASYONU TEK ELDEN ALMA (Gökhan, 2026-08-18). Kapalıyken telefondan giren
                personel de rezervasyon açabilir; açılırsa kayıt sadece ana panelden girilir. */}
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={sadeceAnaPanel} onChange={(e) => setSadeceAnaPanel(e.target.checked)} />
              <span style={{ fontSize: 13.5 }} {...sagTik("Açıkken rezervasyon sadece ana panelden alınır; telefondan giren personel (garson, PR, salon şefi, mutfak) yeni rezervasyon açamaz. Kapı girişi ve bekleme sırası bundan etkilenmez.")}>Sadece ana panel rezervasyon alsın</span>
            </label>

            {/* GÜN KAPANIŞI (Gökhan, 2026-08-13). Programda zamanla kendiliğinden çalışan bir iş
                yoktu; akşam kapatılmayan gün sabaha açık giriyor, dünkü misafirler oturuyor
                görünüyor ve masaları bugün kullanılamıyordu. */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13.5 }} {...sagTik("Sabah programı açtığınızda dünden kalan açık kayıtlar varsa: bekleyenler gelmedi, oturanlar tamamlandı olur ve masaları boşalır. Sorsun seçiliyse önce size sorar, kendisi kapatsın seçiliyse sessizce yapar.")}>Geçmiş gün açık kalırsa:</span>
              <select value={gunKapanis} onChange={(e) => setGunKapanis(e.target.value)} style={{ ...inp, minWidth: 150 }}>
                <option value="sor">Sorsun</option>
                <option value="otomatik">Kendisi kapatsın</option>
              </select>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={otoYerlesme} onChange={(e) => setOtoYerlesme(e.target.checked)} />
              <span style={{ fontSize: 13.5 }} {...sagTik("Bir rezervasyonun kişi sayısı büyüyüp masası yetmez hale gelince program beklemeden masayı tamamlar: önce o masanın kendi sırasındaki yan masayı dener, doluysa oradaki rezervasyonu başka uygun masaya taşıyıp yeri açar. Kilitli masalara hiç dokunmaz. Kapalıyken program kimsenin masasını kendiliğinden oynatmaz.")}>Otomatik yerleşme</span>
            </label>
            </div>

            {/* SAĞ SÜTUN — ONLINE REZERVASYON (Gökhan, 2026-08-15). Misafirin kendi sayfası
                /rezervasyon-yap/[slug] — Instagram bio'suna konan link. Buradaki kurallar hem
                formu şekillendirir hem sunucuda denetlenir; formu atlayıp doğrudan çağıran
                olursa ayarlar yine geçerlidir. */}
            <div style={sagSutun(isMobile)}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)", marginBottom: 10 }}>Online rezervasyon</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={onlineAcik} onChange={(e) => setOnlineAcik(e.target.checked)} />
              <span style={{ fontSize: 13.5 }} {...sagTik("Kapatılırsa misafir sayfası kayıt almaz, arayabilmesi için işletme telefonunu gösterir. Personelin girdiği rezervasyonlar etkilenmez.")}>Online rezervasyon açık</span>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={onlineOnayGerekli} onChange={(e) => setOnlineOnayGerekli(e.target.checked)} />
              <span style={{ fontSize: 13.5 }} {...sagTik("Açıkken misafirin gönderdiği rezervasyon doğrudan açılmaz, onay bekliyor olarak listeye düşer; siz masayı verip vermeyeceğinize karar verdikten sonra kesinleşir. Masa satılan gecelerde tanımadığınız birinin locayı kapatmasını engeller.")}>Gelen istekler onay beklesin</span>
            </label>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13.5 }} {...sagTik("Bu aralığın dışındaki gruplar online kayıt açamaz.")}>Online alınacak grup:</span>
              <input
                value={onlineMin}
                onChange={(e) => setOnlineMin(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric" className="tnum" style={{ ...inp, width: 56, textAlign: "center" }}
              />
              <span style={{ fontSize: 13.5, color: "var(--muted-2)" }}>–</span>
              <input
                value={onlineMax}
                onChange={(e) => setOnlineMax(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric" className="tnum" style={{ ...inp, width: 56, textAlign: "center" }}
              />
              <span style={{ fontSize: 13.5 }}>kişi</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13.5 }} {...sagTik("Bu sayıdan kalabalık gruplara online kayıt açtırılmaz; misafire işletme telefonu gösterilir ve araması istenir. Kalabalık masa konuşularak kurulur. 0 yazılırsa böyle bir eşik yoktur.")}>Telefonla alınacak grup büyüklüğü:</span>
              <input
                value={onlineTelEsigi}
                onChange={(e) => setOnlineTelEsigi(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric" className="tnum" style={{ ...inp, width: 62, textAlign: "center" }}
              />
              <span style={{ fontSize: 13.5 }}>kişiden sonra</span>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={onlineGelmeyenEngeli} onChange={(e) => setOnlineGelmeyenEngeli(e.target.checked)} />
              <span style={{ fontSize: 13.5 }} {...sagTik("Online rezervasyon açtırıp gelmemiş bir numara ikinci kez online kayıt açamaz — işletmeyi arayıp konuşması istenir. Telefondan siz açarsanız engel yok.")}>Gelmeyen misafir bir daha online yapamasın</span>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={onlineSalonSecimi} onChange={(e) => setOnlineSalonSecimi(e.target.checked)} />
              <span style={{ fontSize: 13.5 }} {...sagTik("Seçim söz değildir: program o salonu dener, yer yoksa kendi kararıyla başka salona atmaz — size sorar. Açıkken hangi salonların online görüneceği aşağıda işaretlenir.")}>Misafir salon seçebilsin</span>
            </label>
            {onlineSalonSecimi && (
              salonlar.length === 0 ? (
                <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginBottom: 16 }}>Henüz salon yok — Salon ekranından ekleyebilirsiniz.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16, paddingLeft: 22 }}>
                  {salonlar.map((s) => (
                    <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox" checked={s.online_acik}
                        onChange={(e) => setSalonlar((liste) => liste.map((x) => (x.id === s.id ? { ...x, online_acik: e.target.checked } : x)))}
                      />
                      <span style={{ fontSize: 13 }}>{s.name}</span>
                    </label>
                  ))}
                </div>
              )
            )}

            </div>
            </div>

            </>)}
            {bolum === "notlar" && (<>
            {/* REZERVASYON ETİKETLERİ (Gökhan, 2026-08-16). "Not algılama" sorusunun cevabı:
                serbest metinden tahmin etmek yerine kutucukla işaretlenir. Alerji işaretlisi
                mutfak ekranına düşer, uyarı işaretlisi listede kırmızı çıkar. */}
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)", marginBottom: 6 }} {...sagTik("Alerji, çocuk sandalyesi, doğum günü gibi bilgiler nota yazılmak yerine işaretlenir. Mutfağa işaretliyse mutfak ekranında görünür, Uyarı işaretliyse listede kırmızı çıkar.")}>Rezervasyon etiketleri</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={yapNotAcik} onChange={(e) => setYapNotAcik(e.target.checked)} />
              <span style={{ fontSize: 13.5 }} {...sagTik("Kapalıyken rezervasyon formunda etiket kutucukları çıkmaz, sadece serbest not alanı kalır.")}>Rezervasyonda etiket kutucukları görünsün</span>
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {rezEtiketleri.map((t) => (
                <div key={t.id} style={satirKutu}>
                  <input
                    defaultValue={t.ad} placeholder="Etiket adı"
                    onBlur={(e) => listeGuncelle("rezervasyon_etiketleri", t.id, { ad: e.target.value.trim() || t.ad })}
                    style={{ ...inp, flex: 1, minWidth: 90 }}
                  />
                  <label style={kucukOnay}>
                    <input type="checkbox" defaultChecked={t.mutfaga_gitsin} onChange={(e) => listeGuncelle("rezervasyon_etiketleri", t.id, { mutfaga_gitsin: e.target.checked })} />
                    Mutfağa
                  </label>
                  <label style={kucukOnay}>
                    <input type="checkbox" defaultChecked={t.uyari} onChange={(e) => listeGuncelle("rezervasyon_etiketleri", t.id, { uyari: e.target.checked })} />
                    Uyarı
                  </label>
                  <button onClick={() => listeSil("rezervasyon_etiketleri", t.id)} style={silBtn} aria-label="Etiketi sil"><X size={13} /></button>
                </div>
              ))}
            </div>
            <button onClick={() => listeEkle("rezervasyon_etiketleri", { ad: "Yeni etiket", sira: rezEtiketleri.length })} style={{ ...btnGhostRow, marginBottom: 20 }}>
              <Plus size={12} style={{ marginRight: 4 }} />Etiket ekle
            </button>

            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)", marginBottom: 6 }} {...sagTik("Kişi kartındaki etiketler bu eşiklere göre kendiliğinden hesaplanır — kayıt tutmaya gerek yok. VIP ayrı: işletmenin kendi kararıdır, kartın kendisinden işaretlenir.")}>Müşteri etiketleri</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13.5 }}>Müdavim sayılması için ziyaret sayısı:</span>
              <input
                value={esikMudavim}
                onChange={(e) => setEsikMudavim(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric" className="tnum" style={{ ...inp, width: 62, textAlign: "center" }}
              />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13.5 }}>No-show riski sayılması için gelmeme yüzdesi:</span>
              <input
                value={esikNoShow}
                onChange={(e) => setEsikNoShow(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric" className="tnum" style={{ ...inp, width: 62, textAlign: "center" }}
              />
              <span style={{ fontSize: 13.5 }}>%</span>
            </div>

            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)", marginBottom: 6, marginTop: 8 }} {...sagTik("Rezervasyon notuna bir salonun adı yazılırsa program masayı o salondan seçer — hiçbir yere kelime yazmanıza gerek yok, salonlarınızın adını kendisi tanır. Büyük/küçük harf ve Türkçe karakter farkı önemsizdir. Masa elle seçilmişse kurala bakılmaz. O salonda yer yoksa program başka salona atmaz, size sorar. Nota her zamanki masası yazmak da yeter.")}>Notta geçen kelimeler</div>
            {/* Notta geçen salon adı ve "her zamanki masası" için AYRI BİR LİSTE YOK
                (Gökhan, 2026-08-13: "bir yerlere bir şeyler yazmaya gerek kalmasın") — program
                salon adlarını kendi tanır, kalıpları da kendi bilir. */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 13.5 }} {...sagTik("İki kez gelmiş misafir üçüncü gelişinde sadık sayılır. Bakılan gelişlerin en az ikisinde aynı masada oturmuşsa o masa onundur; Yerleşim yap'a basıldığında notunda bir şey yazmasa bile oraya oturtulur. Masa kilitli değilse ötekinden alınır, masası alınan rezervasyon başka masaya geçer. 0 yazılırsa bütün gelişlerine bakılır.")}>Her zamanki masası aranırken bakılacak geliş sayısı:</span>
              <input
                value={sadikGecmis}
                onChange={(e) => setSadikGecmis(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric" className="tnum" style={{ ...inp, width: 62, textAlign: "center" }}
              />
            </div>

            </>)}
            {bolum === "geceler" && (<>
            {/* ETKİNLİK — gecenin kimliği (ARASTIRMA-2-GECE-KULUBU.md 1.4): gece "Cuma" değil,
                "Cuma · falanca sanatçı". Fiyat da doluluk da buna bağlı. Başlık "Özel geceler"
                iken "Etkinlik" oldu (Gökhan, 2026-08-16). */}
            <div style={bolumBasligi}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)" }} {...sagTik("Yılbaşı, konser, sanatçı gecesi gibi günler. O güne ad verilir, sahneye çıkan yazılır.")}>Etkinlikler</span>
              <button
                onClick={() => listeEkle("ozel_geceler", { gun: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date()), ad: "" })}
                style={ekleBtn} aria-label="Etkinlik ekle" title="Etkinlik ekle"
              >
                <Plus size={13} />Ekle
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {ozelGeceler.map((g) => (
                <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="date" defaultValue={g.gun}
                    onBlur={(e) => listeGuncelle("ozel_geceler", g.id, { gun: e.target.value || g.gun })}
                    className="tnum" style={{ ...inp, width: 140, flexShrink: 0 }}
                  />
                  <input
                    defaultValue={g.ad} placeholder="Etkinlik adı"
                    onBlur={(e) => listeGuncelle("ozel_geceler", g.id, { ad: e.target.value.trim() || g.ad })}
                    style={{ ...inp, flex: 1, minWidth: 0 }}
                  />
                  <input
                    defaultValue={g.sanatci ?? ""} placeholder="Sahne / sanatçı"
                    onBlur={(e) => listeGuncelle("ozel_geceler", g.id, { sanatci: e.target.value.trim() || null })}
                    style={{ ...inp, flex: 1, minWidth: 0 }}
                  />
                  <button onClick={() => listeSil("ozel_geceler", g.id)} style={silBtn} aria-label="Etkinliği sil"><X size={13} /></button>
                </div>
              ))}
            </div>
            </>)}
            {bolum === "pr" && (<>
            {/* ÖZELLİKLER — isteğe bağlı, açıp kapatılan işler bir arada (Gökhan, 2026-08-16):
                PR sistemi, kapı listesi, fix menü. */}
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)", marginBottom: 8 }}>PR</div>
            {/* PR (promoter) — gece kulüplerinde misafir getiren, getirdiği kadar kazanan kişi.
                Türkiye'de bunu takip eden yazılım çıkmadı (araştırma 1 ve 2). */}
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={prAcik} onChange={(e) => setPrAcik(e.target.checked)} />
              <span style={{ fontSize: 13.5 }} {...sagTik("PR'ların kendi paneli ve kendine ait rezervasyon linki olur. O linkten gelen rezervasyonda hangi PR'dan geldiği kendiliğinden yazılır.")}>PR sistemi kullanılsın</span>
            </label>
            {prAcik && (<>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13.5 }} {...sagTik("İşletmeden işletmeye değişir; kişi başına, masa başına ya da hesabın yüzdesi olarak ödenebilir.")}>Komisyon:</span>
                <select value={prKomisyonTipi} onChange={(e) => setPrKomisyonTipi(e.target.value)} style={{ ...inp, width: 150 }}>
                  <option value="kisi">Kişi başına</option>
                  <option value="masa">Masa başına</option>
                  <option value="yuzde">Hesabın yüzdesi</option>
                </select>
                {/* Yüzde seçiliyse birim TL değil — işaret ona göre değişiyor. */}
                <div style={{ ...inp, width: 110, flexShrink: 0, display: "flex", alignItems: "center", gap: 6, padding: "0 10px" }}>
                  <span style={{ fontSize: 12, color: "var(--muted-2)", flexShrink: 0 }}>{prKomisyonTipi === "yuzde" ? "%" : "TL"}</span>
                  <input
                    value={prKomisyonTutar}
                    onChange={(e) => setPrKomisyonTutar(e.target.value.replace(/[^0-9.,]/g, ""))}
                    inputMode="decimal" className="tnum"
                    style={{ border: "none", outline: "none", background: "transparent", color: "var(--ink)", fontSize: 13, width: "100%", minWidth: 0, textAlign: "center", padding: "1mm 0", lineHeight: 1.2 }}
                  />
                </div>
              </div>

              {/* "Komisyon sadece gelene ödensin" kutusu KALDIRILDI (Gökhan, 2026-08-16):
                  ayar değil, kural — program komisyonu her zaman gerçekten gelen misafir
                  üzerinden hesaplayacak. Sütun (pr_sadece_gelene) veritabanında duruyor,
                  değeri hep açık yazılıyor. */}

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
                <input type="checkbox" checked={prKendiGorsun} onChange={(e) => setPrKendiGorsun(e.target.checked)} />
                <span style={{ fontSize: 13.5 }} {...sagTik("Kapalıyken PR sadece kendi listesini görür, sonucu göremez.")}>PR kendi getirdiğinin geldiğini ve harcamasını görsün</span>
              </label>
            </>)}

            {/* KAPI — ayrı başlıktan buraya alındı (Gökhan, 2026-08-16). */}
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)", marginTop: 22, marginBottom: 8 }}>Kapı</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={guestListAcik} onChange={(e) => setGuestListAcik(e.target.checked)} />
              <span style={{ fontSize: 13.5 }} {...sagTik("Rezervasyonu olmayan ama listede olan misafirler — indirimli ya da ücretsiz giriş. Kapıda isimden aranır, giren işaretlenir. Kişi kartındaki 'içeri alınmasın' işareti rezervasyon girilirken kırmızı uyarı olarak çıkar; ayrı bir liste tutulmaz. Kadın/erkek sayısı hiçbir otomatik ret kuralına bağlanmaz — girişte cinsiyete göre ayrım idari para cezasına konu oluyor, program bu bilgiyi sadece istatistik için tutar.")}>Kapıda isim listesi (guest list) kullanılsın</span>
            </label>

            {/* FİX MENÜ — Salon ve masa'dan buraya alındı (Gökhan, 2026-08-16). */}
            <div style={{ ...bolumBasligi, marginTop: 22 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)" }} {...sagTik("Açıkken rezervasyon alınırken alakart / fix seçimi çıkar. Fix seçilirse hesap kişi sayısı çarpı menü fiyatı olarak kendiliğinden hesaplanır; mutfak şefi kaç fix menü hazırlayacağını görür.")}>Fix menü</span>
              <button
                onClick={() => listeEkle("fix_menuler", { ad: "", sira: fixMenuler.length })}
                style={ekleBtn} aria-label="Fix menü ekle" title="Fix menü ekle"
              >
                <Plus size={13} />Ekle
              </button>
            </div>
            {/* Anahtar unutulmuştu: menü ekleniyor ama açma kutusu yoktu, rezervasyonda
                seçim çıkmıyordu (Gökhan, 2026-08-17). */}
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={fixMenuAcik} onChange={(e) => setFixMenuAcik(e.target.checked)} />
              <span style={{ fontSize: 13.5 }} {...sagTik("Açıkken rezervasyon alınırken alakart / fix seçimi çıkar ve rezervasyona yazılır. Kapalıyken hiç sorulmaz.")}>Fix menü kullanılsın</span>
            </label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
              {fixMenuler.map((m) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input
                    defaultValue={m.ad} placeholder="Menü adı"
                    onBlur={(e) => listeGuncelle("fix_menuler", m.id, { ad: e.target.value.trim() || m.ad })}
                    style={{ ...inp, flex: 1, minWidth: 0 }}
                  />
                  <ParaGirisi
                    deger={m.kisi_basi_fiyat} yerTutucu="Kişi başı" genislik={125}
                    onKaydet={(v) => listeGuncelle("fix_menuler", m.id, { kisi_basi_fiyat: v })}
                  />
                  <input
                    defaultValue={m.aciklama ?? ""} placeholder="İçindekiler"
                    onBlur={(e) => listeGuncelle("fix_menuler", m.id, { aciklama: e.target.value.trim() || null })}
                    style={{ ...inp, flex: 1.4, minWidth: 0 }}
                  />
                  <button onClick={() => listeSil("fix_menuler", m.id)} style={silBtn} aria-label="Menüyü sil"><X size={13} /></button>
                </div>
              ))}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={karmaFixAlakart} onChange={(e) => setKarmaFixAlakart(e.target.checked)} />
              <span style={{ fontSize: 13 }} {...sagTik("Kapalıyken masa ya fix ya alakarttır — genelde böyle olur. Açıkken rezervasyonda kaç kişi fix ayrıca sorulur, hesap ikisinin toplamı olur.")}>Aynı masada hem fix hem alakart olabilsin</span>
            </label>

            {/* KAPORA — ayrı başlıktan buraya alındı (Gökhan, 2026-08-16). Henüz kurulmadı. */}
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)", marginTop: 22, marginBottom: 8 }}>Kapora</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7 }}>
              Bu bölüm henüz kurulmadı. Planlanan: kaporanın hangi durumlarda isteneceği, havale
              ve dekont akışı, ödenen tutarın rezervasyonda görünmesi, kalan borç, gelmediğinde
              ne olacağı. Etkinlik gecelerinde masa önden satıldığı için gece kulübü tarafında
              kullanılacak.
            </div>
            </>)}
            {bolum === "paneller" && (<>
            {/* PERSONEL KATILIM KODU (Gökhan, 2026-08-16: "işletme bunlara kod verecek, o kodla
                işletmeye bağlanacaklar"). Personel kendi hesabını açıyor, bu kodu giriyor,
                istek aşağıdaki listeye düşüyor. Onaylanmadan hiçbir veri göremez. */}
            {/* HER ROLÜN KENDİ KODU (Gökhan, 2026-08-16). Garsona garson kodunu verirsin, o
                kodla girenin rolü kendiliğinden garson gelir — tek tek rol seçmezsin. */}
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)", marginBottom: 8 }}>Personel katılım kodları</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
              {PERSONEL_ROLLERI.map((r) => {
                const k = katilimKodlari.find((x) => x.rol === r.anahtar);
                const acik = acikYetki === r.anahtar;
                // Yönetici her sayfayı görür, kutuları kapatılamaz — işletme kendini kilitlemesin.
                const yonetici = r.anahtar === "yonetici";
                return (
                  <div key={r.anahtar}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, width: 96, flexShrink: 0 }}>{r.ad}</span>
                    <div className="tnum" style={{
                      fontSize: 17, fontWeight: 700, letterSpacing: 4, color: "var(--brand-strong)",
                      border: "1px solid var(--line-2)", borderRadius: 10, padding: "4px 13px",
                      background: "var(--recede)", flexShrink: 0,
                    }}>
                      {k?.kod ?? "——————"}
                    </div>
                    <button onClick={() => koduYenile(r.anahtar)} style={{ ...ekleBtn, color: "var(--muted)" }}>Yenile</button>
                    <button
                      onClick={() => setAcikYetki((v) => (v === r.anahtar ? null : r.anahtar))}
                      style={{ ...ekleBtn, color: acik ? "var(--brand-strong)" : "var(--muted)" }}
                    >
                      Yetki <ChevronDown size={12} style={{ transform: acik ? "rotate(180deg)" : undefined, transition: "transform .15s" }} />
                    </button>
                  </div>
                  {acik && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "2px 0 8px 104px" }}>
                      {SAYFALAR.map((sf) => {
                        const secili = yonetici || (rolSayfalari[r.anahtar] ?? []).includes(sf.anahtar);
                        return (
                          <label key={sf.anahtar} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: yonetici ? "default" : "pointer", opacity: yonetici ? 0.6 : 1 }}>
                            <input
                              type="checkbox" checked={secili} disabled={yonetici}
                              onChange={(e) => setRolSayfalari((h) => {
                                const mevcut = h[r.anahtar] ?? [];
                                return { ...h, [r.anahtar]: e.target.checked ? [...mevcut, sf.anahtar] : mevcut.filter((x) => x !== sf.anahtar) };
                              })}
                            />
                            {sf.ad}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginBottom: 18, lineHeight: 1.6 }}>
              Personel telefonundan <b>/ekip</b> adresine girip kendi hesabını
              açar, kendisine verdiğiniz kodu yazar. Rolü koddan gelir; siz sadece onaylarsınız.
              Kodu yenilerseniz eski kod çalışmaz, bağlı personel etkilenmez.
            </div>

            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)", marginBottom: 8 }}>Bağlanan personel</div>
            {personelIstekleri.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--muted-2)", marginBottom: 18 }}>Henüz kimse bağlanmadı.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
                {personelIstekleri.map((h) => (
                  <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.ad_soyad}</div>
                      <div className="tnum" style={{ fontSize: 11.5, color: "var(--muted-2)" }}>{h.telefon ?? "—"}</div>
                    </div>
                    <select
                      value={h.rol}
                      onChange={(e) => personelGuncelle(h.id, { rol: e.target.value })}
                      style={{ ...inp, width: 130, flexShrink: 0 }}
                    >
                      {PERSONEL_ROLLERI.map((r) => <option key={r.anahtar} value={r.anahtar}>{r.ad}</option>)}
                    </select>
                    <select
                      value={h.durum}
                      onChange={(e) => personelGuncelle(h.id, { durum: e.target.value, onay_at: e.target.value === "onayli" ? new Date().toISOString() : null })}
                      style={{
                        ...inp, width: 112, flexShrink: 0,
                        color: h.durum === "onayli" ? "var(--brand-strong)" : h.durum === "bekliyor" ? "var(--gold-text)" : "var(--danger)",
                      }}
                    >
                      <option value="bekliyor">Bekliyor</option>
                      <option value="onayli">Onaylı</option>
                      <option value="kapali">Kapalı</option>
                    </select>
                  </div>
                ))}
              </div>
            )}

            {/* PANELLER VE YETKİLER (Gökhan, 2026-08-16). */}
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={rezAlanGorunsun} onChange={(e) => setRezAlanGorunsun(e.target.checked)} />
              <span style={{ fontSize: 13.5 }} {...sagTik("Kapalıyken de kaydedilir, sadece listede sütun olarak görünmez. Paneller: yönetici, salon şefi, karşılama, garson, mutfak şefi ve PR — herkes kendi telefonundan kısa PIN ile girer.")}>Rezervasyonu kimin aldığı listede görünsün</span>
            </label>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 13.5, width: 190 }}>Rezervasyonu kim silebilir:</span>
              <select value={silmeYetkisi} onChange={(e) => setSilmeYetkisi(e.target.value)} style={{ ...inp, minWidth: 210 }}>
                {YETKI_SECENEKLERI.map((y) => <option key={y.anahtar} value={y.anahtar}>{y.ad}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 13.5, width: 190 }}>Hesap tutarını kim girebilir:</span>
              <select value={hesapYetkisi} onChange={(e) => setHesapYetkisi(e.target.value)} style={{ ...inp, minWidth: 210 }}>
                {YETKI_SECENEKLERI.map((y) => <option key={y.anahtar} value={y.anahtar}>{y.ad}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: 13.5, width: 190 }}>Ayarları kim değiştirebilir:</span>
              <select value={ayarYetkisi} onChange={(e) => setAyarYetkisi(e.target.value)} style={{ ...inp, minWidth: 210 }}>
                {YETKI_SECENEKLERI.map((y) => <option key={y.anahtar} value={y.anahtar}>{y.ad}</option>)}
              </select>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={garsonSadeceKendiSalonu} onChange={(e) => setGarsonSadeceKendiSalonu(e.target.checked)} />
              <span style={{ fontSize: 13.5 }} {...sagTik("Açıkken garson posta ekranında yalnızca kendi masalarının bulunduğu salonları görür. Kapalıyken bütün salonları gezebilir; telefonda sağa sola kaydırarak geçer. Masa dağıtan (şef, yönetici) her zaman hepsini görür.")}>Garson sadece kendi salonunu görsün</span>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={varsayilanaGetirAcik} onChange={(e) => setVarsayilanaGetirAcik(e.target.checked)} />
              <span style={{ fontSize: 13.5 }} {...sagTik("Masaları asıl yerlerine toplar. Operasyon öncesi kullanılan bir düğmedir; istemiyorsanız kapatabilirsiniz.")}>Salon ekranında &quot;Varsayılana getir&quot; düğmesi görünsün</span>
            </label>
            </>)}
            {bolum === "mesajlar" && (<>
            {/* MESAJLAR (Gökhan, 2026-08-18). Metinler ve saatler şimdiden ayarlanıyor;
                WhatsApp hesabı işletme programı kullanmaya başlarken bağlanıyor, o güne
                kadar hazırlanan mesajlar kuyrukta bekliyor. */}
            <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6, marginBottom: 14 }}>
              Mesajlar WhatsApp&apos;tan gider. İşletmenin WhatsApp iş hesabı bağlanana kadar
              hazırlanan mesajlar kuyrukta bekler, kaybolmaz.
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }}>
              <input type="checkbox" checked={mesajAcik} onChange={(e) => setMesajAcik(e.target.checked)} />
              <span style={{ fontSize: 13.5 }} {...sagTik("Kapalıyken hiç mesaj hazırlanmaz. Açıkken aşağıdaki mesajlar sırasıyla çalışır.")}>Misafire mesaj gönderilsin</span>
            </label>

            <div style={{ ...ikiSutun, gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))" }}>
            <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)", marginBottom: 10 }}>Rezervasyon onayı</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer", opacity: mesajAcik ? 1 : 0.5 }}>
              <input type="checkbox" disabled={!mesajAcik} checked={mesajOnayAcik} onChange={(e) => setMesajOnayAcik(e.target.checked)} />
              <span style={{ fontSize: 13.5 }} {...sagTik("Rezervasyon alınır alınmaz gider — gece geç saatte alınsa bile bekletilmez, çünkü misafir o an cevap bekler.")}>Rezervasyon alınınca hemen gitsin</span>
            </label>
            <textarea
              value={mesajOnayMetni} disabled={!mesajAcik}
              onChange={(e) => setMesajOnayMetni(e.target.value)}
              rows={4}
              placeholder="Sayın {isim}, {tarih} {saat} için {kisi} kişilik rezervasyonunuzu aldık. {isletme}"
              style={{ ...inp, width: "100%", resize: "vertical", lineHeight: 1.5, fontFamily: "inherit", opacity: mesajAcik ? 1 : 0.5 }}
            />
            <div style={{ fontSize: 11.5, color: inkSoft, marginTop: 6, lineHeight: 1.6 }}>
              Kullanılabilir alanlar: {"{isim} {tarih} {saat} {kisi} {isletme}"}. Boş bırakılırsa
              program kendi hazır metnini kullanır.
            </div>

            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)", margin: "18px 0 10px" }}>Sessiz saatler</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, opacity: mesajAcik ? 1 : 0.5 }}>
              <span style={{ fontSize: 13.5 }} {...sagTik("Bu aralığa denk gelen mesaj gönderilmez, aralık bitince gönderilir. Rezervasyon onayı bundan etkilenmez — o her zaman anında gider.")}>Şu saatler arasında mesaj gitmesin:</span>
              <input type="time" disabled={!mesajAcik} value={mesajSessizBas} onChange={(e) => setMesajSessizBas(e.target.value)} className="tnum" style={{ ...inp, width: 104 }} />
              <span style={{ fontSize: 12, color: inkSoft }}>–</span>
              <input type="time" disabled={!mesajAcik} value={mesajSessizBitis} onChange={(e) => setMesajSessizBitis(e.target.value)} className="tnum" style={{ ...inp, width: 104 }} />
            </div>
            </div>

            <div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)", marginBottom: 10 }}>Teyit mesajı</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer", opacity: mesajAcik ? 1 : 0.5 }}>
              <input type="checkbox" disabled={!mesajAcik} checked={mesajTeyitAcik} onChange={(e) => setMesajTeyitAcik(e.target.checked)} />
              <span style={{ fontSize: 13.5 }} {...sagTik("Günde bir kez gider ve o an listede olan bütün rezervasyonları kapsar. Bu saatten sonra alınan rezervasyonlar teyitli sayılır, onlara mesaj gitmez.")}>Günlük teyit mesajı gitsin</span>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, opacity: mesajAcik && mesajTeyitAcik ? 1 : 0.5 }}>
              <span style={{ fontSize: 13.5 }} {...sagTik("Misafirin dönüş yapma ihtimalinin en yüksek olduğu saat aralığı seçilir — sabahın erken saati ve gece geç saat işe yaramıyor.")}>Gönderim saati:</span>
              <input type="time" disabled={!mesajAcik || !mesajTeyitAcik} value={mesajTeyitSaat} onChange={(e) => setMesajTeyitSaat(e.target.value)} className="tnum" style={{ ...inp, width: 104 }} />
              <span style={{ fontSize: 12, color: inkSoft }}>–</span>
              <input type="time" disabled={!mesajAcik || !mesajTeyitAcik} value={mesajTeyitBitis} onChange={(e) => setMesajTeyitBitis(e.target.value)} className="tnum" style={{ ...inp, width: 104 }} />
            </div>
            <textarea
              value={mesajTeyitMetni} disabled={!mesajAcik || !mesajTeyitAcik}
              onChange={(e) => setMesajTeyitMetni(e.target.value)}
              rows={4}
              placeholder="Sayın {isim}, bu akşam {saat} için {kisi} kişilik rezervasyonunuz var. Geliyor musunuz? {isletme}"
              style={{ ...inp, width: "100%", resize: "vertical", lineHeight: 1.5, fontFamily: "inherit", opacity: mesajAcik && mesajTeyitAcik ? 1 : 0.5 }}
            />
            <div style={{ fontSize: 11.5, color: inkSoft, marginTop: 6, lineHeight: 1.6 }}>
              Mesajın altında &quot;Geliyorum&quot; ve &quot;İptal&quot; düğmeleri çıkar. Geliyorum
              denirse listede teyit işareti belirir; iptal denirse rezervasyon iptale düşer ve
              masası boşalır — misafire ayrıca mesaj gitmez.
            </div>

            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)", margin: "18px 0 10px" }}>Anket</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer", opacity: mesajAcik ? 1 : 0.5 }}>
              <input type="checkbox" disabled={!mesajAcik} checked={mesajAnketAcik} onChange={(e) => setMesajAnketAcik(e.target.checked)} />
              <span style={{ fontSize: 13.5 }} {...sagTik("Yeri hazır dursun diye kondu (Gökhan). Ziyaret tamamlandıktan sonra gönderilir; şimdilik kapalı kalması önerilir.")}>Ziyaret sonrası anket mesajı</span>
            </label>
            <textarea
              value={mesajAnketMetni} disabled={!mesajAcik || !mesajAnketAcik}
              onChange={(e) => setMesajAnketMetni(e.target.value)}
              rows={3}
              placeholder="Bizi tercih ettiğiniz için teşekkürler. Akşamınız nasıldı?"
              style={{ ...inp, width: "100%", resize: "vertical", lineHeight: 1.5, fontFamily: "inherit", opacity: mesajAcik && mesajAnketAcik ? 1 : 0.5 }}
            />
            </div>
            </div>

            <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7, marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
              İşletme rezervasyonu iptal ederse misafire mesaj gitmez, aranır — program bunu
              listede iş olarak gösterir. Misafir kendi iptal ederse hiçbir mesaj gönderilmez.
              Kapıda sıra bekleyen misafire de mesaj gitmez, zaten içeridedir.
            </div>
            </>)}
            {bolum === "ai" && (<>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={aiOzetAcik} onChange={(e) => setAiOzetAcik(e.target.checked)} />
              <span style={{ fontSize: 13.5 }} {...sagTik("Kartın notunu, geçmiş rezervasyon notlarını ve rakamları okuyup kısa bir değerlendirme yazar. Yorum bir kez üretilir, misafir yeni rezervasyon yaptırınca tazelenir — her kart açılışında yeniden yazılmaz.")}>Kişi kartında yapay zekâ yorumu görünsün</span>
            </label>

            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={aiIsimMaskele} onChange={(e) => setAiIsimMaskele(e.target.checked)} />
              <span style={{ fontSize: 13.5 }} {...sagTik("Yorum yurt dışındaki bir sunucuda üretiliyor. Açıkken isim soyisim yerine takma bir ad gider; yorum aynı çıkar çünkü değerlendirme rakamlardan ve notlardan yapılıyor. Telefon numarası zaten hiç gönderilmiyor.")}>Misafirin adı gönderilmesin</span>
            </label>
            </>)}
            {bolum === "kvkk" && (<>
            <textarea
              value={kvkkNotice}
              onChange={(e) => setKvkkNotice(e.target.value)}
              rows={5}
              placeholder="Misafirin telefonunu alırken gösterilecek aydınlatma metni…"
              style={{ ...inp, width: "100%", resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }}
            />
            </>)}
          </div>

          {/* Tek Kaydet — sağ paneldeki her şey birlikte kaydedilir (PAGE_STANDARDS #2). */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, paddingTop: 12, flexShrink: 0 }}>
            <button onClick={kaydet} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1 }}>{busy ? "Kaydediliyor…" : "Kaydet"}</button>
            {kaydedildi && <span style={{ fontSize: 12.5, color: "var(--brand)" }}>Kaydedildi.</span>}
          </div>
        </div>
      </div>
      {/* Sağ tıkla açılan açıklama kutusu. Boş bir yere tıklayınca kapanıyor. */}
      {aciklama && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 70 }}
            onClick={() => setAciklama(null)}
            onContextMenu={(e) => { e.preventDefault(); setAciklama(null); }}
          />
          <div style={{
            position: "fixed", left: aciklama.x, top: aciklama.y, zIndex: 71, maxWidth: 300,
            background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12,
            boxShadow: "0 8px 24px rgba(30,25,15,0.18)", padding: "11px 13px",
            fontSize: 12, color: "var(--muted)", lineHeight: 1.6,
          }}>
            {aciklama.metin}
          </div>
        </>
      )}

      <RezervasyonAltNav />
    </div>
  );
}

// Kutu yüksekliği: yazının üstünde ve altında 2 mm boşluk (Gökhan, 2026-08-16 — "normal bir
// yazı satırının karşısında kutu varsa yazı puntasında aşağıdan yukarıdan 2 mm boşluklu
// olsun"). Satır yüksekliği 1.2'ye sabitlendi ki yükseklik yazı boyu + 2×2 mm olsun.
const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "1mm 10px", fontSize: 13, lineHeight: 1.2, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0, boxSizing: "border-box" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 };
const btnPrimary: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5, border: "none", borderRadius: 980, padding: "9px 14px", background: "var(--brand-strong)", color: "#fff", fontSize: 13, fontWeight: 500, flexShrink: 0, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 16px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13, cursor: "pointer" };
const btnGhost: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "7px 12px", background: "var(--card)", color: "var(--ink)", fontSize: 12, flexShrink: 0, cursor: "pointer" };
const btnGhostRow: React.CSSProperties = { ...btnGhost, padding: "4px 12px" };
// İKİ SÜTUNLU BÖLÜM (Gökhan, 2026-08-16). Aradaki çizgi SAĞ sütunun kenarlığı:
// yan yanayken sol kenar (dikey çizgi), alt alta inince üst kenar (yatay çizgi).
const ikiSutun: React.CSSProperties = { display: "grid", alignItems: "start", gap: 24 };
const sagSutun = (mobil: boolean): React.CSSProperties => (mobil
  ? { borderTop: "1px solid var(--line)", paddingTop: 16 }
  : { borderLeft: "1px solid var(--line)", paddingLeft: 24 });
// Bölüm başlığı — solda ad, sağında küçük "Ekle" düğmesi (Gökhan, 2026-08-16: ekleme
// düğmeleri listenin altında değil başlığın yanında).
// Düğme başlığın SOLUNDA (Gökhan, 2026-08-16) — sıra ters çevrilerek, metinlerin yeri
// karışmasın diye yazım sırası bozulmuyor.
const bolumBasligi: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 10, marginBottom: 6, flexDirection: "row-reverse",
  justifyContent: "flex-end",
};
const ekleBtn: React.CSSProperties = {
  all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
  border: "1px solid var(--line-2)", borderRadius: 8, padding: "4px 10px",
  fontSize: 12.5, color: "var(--ink-green)", flexShrink: 0,
};
// Liste satırı — grup, menü, paket, gece, etiket hepsi aynı kutuda.
const satirKutu: React.CSSProperties = { display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--line-2)", borderRadius: 10, padding: 6 };
const silBtn: React.CSSProperties = { all: "unset", cursor: "pointer", color: "var(--muted-2)", display: "flex", alignItems: "center", padding: "0 4px", flexShrink: 0 };
const kucukOnay: React.CSSProperties = { display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--muted)", cursor: "pointer", flexShrink: 0 };
const inkSoft = "#5c5c58";
