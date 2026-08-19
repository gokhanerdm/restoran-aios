"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { getMyReservationRestaurantId } from "@/lib/supabase/reservationAccount";
import DatePicker from "../../components/DatePicker";
import RezervasyonUstBar from "../../components/RezervasyonUstBar";
import RezervasyonAltNav, { ALT_NAV_YUKSEKLIK, useYatayMobil } from "../../components/RezervasyonAltNav";
import { MenuNav, useRolum } from "../../components/RezervasyonMenu";

// AKIŞ — MUTFAK ŞEFİNİN EKRANI (Gökhan, 2026-08-18: "rezervasyon listesinin aynısı olsun ama
// geliş saatine göre sıralansın, aynı saat içindekiler fix/alakart olarak ayrılsın").
//
// Planı program yapar, şef ona göre kendi mutfak planını kurar: "biz ona kaç masa kaç kişi
// kaçta geliyor, kaçı fix kaçı alakart onu söyleyeceğiz, aksi durumlarda da haber vereceğiz."
// Bu yüzden ekranda üç şey var: saat saat döküm, her saatin başında sayılar, en üstte de
// beklenmedik durumlar (erken gelen, geç gelen, saati geçtiği hâlde gelmeyen).
//
// Ekran SADECE mutfak şefinde açılır — başka rol adresi elle yazsa da rezervasyon listesine
// düşer. Alt menüdeki "Akış" düğmesi de yalnızca onda çiziliyor (bkz. RezervasyonAltNav).

type Rez = {
  id: string; guest_name: string; party_size: number; reserved_at: string; status: string;
  note: string | null; table_id: string | null; arrived_at: string | null;
  servis_tipi: string | null; fix_kisi: number | null;
  yedek: boolean; misafir_masasi: boolean;
};
type Masa = { id: string; name: string };

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

// Satır renkleri rezervasyon listesindekiyle birebir aynı (PAGE_STANDARDS madde 11 — tasarım
// kararları oradan kopyalanır). "Bekleniyor" ile "Geldi"nin zemini aynı tonda olduğu için
// akışta ayrıca renkli bir şerit ve durum yazısı var: mutfak masanın geldiğini bir bakışta
// görecek (Gökhan, 2026-08-18: "rengi değişsin, geldi olarak anlaşılsın").
const DURUM_INFO: Record<string, { label: string; color: string; bg: string }> = {
  bekleniyor: { label: "Bekleniyor", color: "var(--ink)", bg: "var(--tan-100)" },
  geldi: { label: "Geldi", color: "var(--danger)", bg: "var(--tan-100)" },
  oturdu: { label: "Oturdu", color: "var(--brand)", bg: "var(--tan-300)" },
  tamamlandi: { label: "Tamamlandı", color: "var(--ink)", bg: "var(--tan-200)" },
  gelmedi: { label: "Gelmedi", color: "var(--gold-text)", bg: "var(--tan-400)" },
  iptal: { label: "İptal", color: "var(--ink)", bg: "var(--tan-500)" },
};

// Saat içindeki ayrım. Servis tipi seçilmemiş kayıtlar da kaybolmasın diye üçüncü bölüm var —
// fix menü kapalı işletmede bütün liste bu bölümde toplanır, başlık o zaman hiç yazılmaz.
const BOLUMLER = [
  { anahtar: "fix", baslik: "Fix" },
  { anahtar: "alakart", baslik: "Alakart" },
  { anahtar: "", baslik: "Servis tipi girilmemiş" },
];
const bolumu = (r: Rez) => (r.servis_tipi === "fix" ? "fix" : r.servis_tipi === "alakart" ? "alakart" : "");

/** Mutfağın hesabına giren kayıt: iptal, gelmedi ve yedek sayılmaz — o masalar için yemek çıkmıyor. */
const sayilir = (r: Rez) => r.status !== "iptal" && r.status !== "gelmedi" && !r.yedek;

// Beklenmedik durum eşikleri. Erken geliş mutfağı doğrudan etkiliyor, 15 dakika bile önemli;
// geç gelişte mutfak zaten hazır olduğu için eşik daha geniş tutuldu.
const ERKEN_DK = 15;
const GEC_DK = 30;

export default function AkisSayfasi() {
  const router = useRouter();
  const rolum = useRolum();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  // Gün ve saat açılışta hazır: ilk çizimde ekranda zaten "Yükleniyor…" duruyor (işletme ve
  // rol henüz gelmedi), o yüzden sunucunun saatiyle telefonun saati arasındaki fark ekrana
  // yansımıyor.
  const [gun, setGun] = useState<string>(() => bugunIstanbul());
  const [rows, setRows] = useState<Rez[]>([]);
  const [masalar, setMasalar] = useState<Masa[]>([]);
  const [rezMasalar, setRezMasalar] = useState<Record<string, string[]>>({});
  const [simdi, setSimdi] = useState<number>(() => Date.now());
  const [isMobile, setIsMobile] = useState(false);
  const yatayMobil = useYatayMobil();

  // Ekran mutfak şefine ait — başkası adresi elle yazarsa sessizce rezervasyon listesine döner.
  useEffect(() => {
    if (rolum !== null && rolum !== "mutfak") router.replace("/rezervasyon");
  }, [rolum, router]);

  useEffect(() => {
    let acik = true;
    getMyReservationRestaurantId().then((id) => {
      if (!acik) return;
      if (!id) { router.replace("/rezervasyon/giris"); return; }
      setRestaurantId(id);
    });
    return () => { acik = false; };
  }, [router]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 860px)");
    const uygula = () => setIsMobile(mq.matches);
    uygula();
    mq.addEventListener("change", uygula);
    return () => mq.removeEventListener("change", uygula);
  }, []);


  const load = useCallback(async (restId: string, hedefGun: string) => {
    const { start, end } = gunSiniri(hedefGun);
    const [{ data: r }, { data: t }] = await Promise.all([
      supabase.from("reservations")
        .select("id, guest_name, party_size, reserved_at, status, note, table_id, arrived_at, servis_tipi, fix_kisi, yedek, misafir_masasi")
        .eq("restaurant_id", restId).is("deleted_at", null)
        .gte("reserved_at", start).lt("reserved_at", end)
        .order("reserved_at").order("id"),
      supabase.from("restaurant_tables").select("id, name").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
    ]);
    const liste = (r as Rez[]) ?? [];
    setRows(liste);
    setMasalar((t as Masa[]) ?? []);
    setSimdi(Date.now());

    // Birleştirilmiş masalar — bir rezervasyonun tek masası olmayabiliyor.
    if (liste.length > 0) {
      const { data: rt } = await supabase.from("reservation_tables").select("reservation_id, table_id").in("reservation_id", liste.map((x) => x.id));
      const harita: Record<string, string[]> = {};
      ((rt as { reservation_id: string; table_id: string }[]) ?? []).forEach((satir) => {
        (harita[satir.reservation_id] ??= []).push(satir.table_id);
      });
      setRezMasalar(harita);
    } else {
      setRezMasalar({});
    }
  }, []);

  // Mutfakta ekran açık duruyor olabilir; liste kendi kendine tazeleniyor ki gelen masa ve
  // gecikme uyarısı şefin gözünün önünde güncellensin.
  useEffect(() => {
    if (!restaurantId || !gun) return;
    load(restaurantId, gun);
    const id = setInterval(() => load(restaurantId, gun), 10000);
    return () => clearInterval(id);
  }, [restaurantId, gun, load]);

  const bugunMu = gun === bugunIstanbul();
  const masaAdi = (r: Rez) => {
    const isim = (id: string | null) => (id ? masalar.find((m) => m.id === id)?.name ?? null : null);
    const coklu = (rezMasalar[r.id] ?? []).map(isim).filter(Boolean) as string[];
    return coklu.length > 0 ? coklu.join(" + ") : isim(r.table_id);
  };

  // Saat saat gruplama — kayıtlar zaten saate göre geliyor, aynı saatteki her şey tek küme.
  const sirali = [...rows].sort((a, b) => Date.parse(a.reserved_at) - Date.parse(b.reserved_at));
  const gruplar: { saat: string; kayitlar: Rez[] }[] = [];
  sirali.forEach((r) => {
    const s = saat(r.reserved_at);
    const son = gruplar[gruplar.length - 1];
    if (son && son.saat === s) son.kayitlar.push(r);
    else gruplar.push({ saat: s, kayitlar: [r] });
  });

  const sayim = (kayitlar: Rez[]) => {
    const gecerli = kayitlar.filter(sayilir);
    return {
      masa: gecerli.length,
      kisi: gecerli.reduce((t, r) => t + (r.party_size ?? 0), 0),
      fix: gecerli.filter((r) => r.servis_tipi === "fix").length,
      alakart: gecerli.filter((r) => r.servis_tipi === "alakart").length,
    };
  };
  const gunToplam = sayim(rows);

  // BEKLENMEDİK DURUMLAR — listenin en üstünde (Gökhan, 2026-08-18: "9'da gelmesi gereken masa
  // 8'de geldi, yukarıda uyarı çıksın"). Üç durum var: erken geldi, geç geldi, saati geçti hâlâ
  // gelmedi. Gecikme uyarısı sadece bugün için anlamlı — geçmiş güne bakarken çıkmıyor.
  const uyarilar: string[] = [];
  sirali.forEach((r) => {
    if (r.status === "iptal" || r.yedek) return;
    const kim = `${saat(r.reserved_at)} · ${r.guest_name} · ${r.party_size} kişi`;
    if (r.arrived_at) {
      const fark = Math.round((Date.parse(r.arrived_at) - Date.parse(r.reserved_at)) / 60000);
      if (fark <= -ERKEN_DK) uyarilar.push(`${kim} — ${-fark} dk erken geldi (${saat(r.arrived_at)})`);
      else if (fark >= GEC_DK) uyarilar.push(`${kim} — ${fark} dk geç geldi (${saat(r.arrived_at)})`);
      return;
    }
    if (!bugunMu || r.status !== "bekleniyor") return;
    const gecikme = Math.round((simdi - Date.parse(r.reserved_at)) / 60000);
    if (gecikme >= GEC_DK) uyarilar.push(`${kim} — ${gecikme} dk gecikti, henüz gelmedi`);
  });

  if (!restaurantId || rolum !== "mutfak") {
    return (
      <div style={{ minHeight: "100vh", background: "var(--canvas)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 13.5, color: "var(--muted)" }}>Yükleniyor…</div>
      </div>
    );
  }

  return (
    <div className="akis-sayfa" style={{
      background: "var(--canvas)", padding: "20px 24px",
      paddingBottom: yatayMobil ? 12 : (isMobile ? ALT_NAV_YUKSEKLIK + 16 : 24),
      height: isMobile ? undefined : "calc(100vh - 4px)",
      display: "flex", flexDirection: "column", boxSizing: "border-box",
    }}>
      {/* Telefon tarayıcısında 100vh adres çubuğunu saymıyor — salon ve posta ekranlarındaki
          ölçünün aynısı kullanılıyor. */}
      {isMobile && <style>{`
        .akis-sayfa { height: calc(100vh - 4px); height: calc(100svh - 4px); height: calc(100dvh - 4px); }
      `}</style>}

      <RezervasyonUstBar restaurantId={restaurantId} sayfaBaslik="Akış" />

      <div style={{ display: "flex", flex: 1, minHeight: 0, gap: isMobile ? 0 : 12 }}>
        {!isMobile && (
          <aside style={{
            width: 226, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10,
            border: "1px solid var(--line)", borderRadius: 16, background: "var(--card)",
            padding: 12, boxSizing: "border-box", overflowY: "auto",
          }}>
            <MenuNav />
          </aside>
        )}

        <div style={{
          background: "var(--card)", border: "1px solid var(--line)",
          borderRadius: yatayMobil ? 10 : 16, padding: yatayMobil ? "8px 10px" : 18,
          flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0, gap: 12,
        }}>
          {/* Gün seçimi — rezervasyon listesindeki satırın aynısı. İleri günler de açık:
              mutfak yarının planını bugünden kurabilsin. */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            <button onClick={() => gun && setGun(gunKaydir(gun, -1))} aria-label="Önceki gün" style={{ ...navBtn, padding: 2 }}><ChevronLeft size={17} /></button>
            <DatePicker value={gun} onChange={setGun} style={{ padding: "8px 10px" }} />
            <button onClick={() => gun && setGun(gunKaydir(gun, 1))} aria-label="Sonraki gün" style={{ ...navBtn, padding: 2 }}><ChevronRight size={17} /></button>
            {!bugunMu && <button onClick={() => setGun(bugunIstanbul())} style={btnGhost}>Bugün</button>}
          </div>

          {/* Günün toplamı — solda masa ve kişi, sağda fix/alakart dağılımı. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, fontSize: 13, color: inkSoft, flexShrink: 0 }}>
            <div>
              <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)" }}>{gunToplam.masa}</span> masa ·{" "}
              <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)" }}>{gunToplam.kisi}</span> kişi
            </div>
            <div>
              Fix <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)" }}>{gunToplam.fix}</span> ·{" "}
              Alakart <span className="tnum" style={{ fontWeight: 600, color: "var(--ink)" }}>{gunToplam.alakart}</span>
            </div>
          </div>

          {uyarilar.length > 0 && (
            <div style={{
              flexShrink: 0, background: "var(--recede)", border: "1px solid var(--gold)",
              borderRadius: 10, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4,
            }}>
              {uyarilar.map((u, i) => (
                <div key={i} style={{ fontSize: 12.5, color: "var(--gold-text)", lineHeight: 1.4 }}>{u}</div>
              ))}
            </div>
          )}

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 14, scrollbarWidth: "none" }}>
            {gruplar.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>Bu gün için kayıt yok.</div>}
            {gruplar.map((g) => {
              const s = sayim(g.kayitlar);
              return (
                <div key={g.saat} style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                  {/* Saatin başlığı: saat + o saatte mutfağı bekleyen iş. */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span className="tnum" style={{ fontSize: 15.5, fontWeight: 700, color: "var(--ink-green)" }}>{g.saat}</span>
                    <span style={{ fontSize: 12.5, color: inkSoft }}>
                      <span className="tnum" style={{ fontWeight: 600 }}>{s.masa}</span> masa ·{" "}
                      <span className="tnum" style={{ fontWeight: 600 }}>{s.kisi}</span> kişi ·{" "}
                      <span className="tnum" style={{ fontWeight: 600 }}>{s.fix}</span> fix ·{" "}
                      <span className="tnum" style={{ fontWeight: 600 }}>{s.alakart}</span> alakart
                    </span>
                  </div>

                  {BOLUMLER.map((b) => {
                    const kayitlar = g.kayitlar.filter((r) => bolumu(r) === b.anahtar);
                    if (kayitlar.length === 0) return null;
                    // Fix menü kapalı işletmede her şey tek bölümde toplanır; o zaman
                    // "Servis tipi girilmemiş" başlığını yazmanın anlamı yok.
                    const baslikVar = !(b.anahtar === "" && g.kayitlar.every((r) => bolumu(r) === ""));
                    return (
                      <div key={b.anahtar} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {baslikVar && (
                          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.3, color: inkSoft, textTransform: "uppercase" }}>
                            {b.baslik}
                          </div>
                        )}
                        {kayitlar.map((r) => {
                          const info = DURUM_INFO[r.status] ?? DURUM_INFO.bekleniyor;
                          const masa = masaAdi(r);
                          const fixKisi = r.servis_tipi === "fix" && r.fix_kisi != null && r.fix_kisi !== r.party_size ? r.fix_kisi : null;
                          return (
                            <div
                              key={r.id}
                              style={{
                                display: "flex", alignItems: "center", gap: 8, background: info.bg,
                                borderRadius: 10, padding: "11px 14px", boxSizing: "border-box",
                                // Durum şeridi — gelen masa bir bakışta ayırt edilsin.
                                borderLeft: `4px solid ${r.status === "bekleniyor" ? "transparent" : info.color}`,
                              }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                                  <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {r.guest_name}
                                  </span>
                                  {r.misafir_masasi && (
                                    <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, flexShrink: 0, padding: "2px 6px", borderRadius: 980, background: "var(--recede)", color: "var(--gold-text)", border: "1px solid var(--gold)" }}>MİSAFİR</span>
                                  )}
                                  {r.yedek && (
                                    <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, flexShrink: 0, padding: "2px 6px", borderRadius: 980, background: "var(--recede)", color: "var(--brand)" }}>YEDEK</span>
                                  )}
                                </div>
                                {/* Mutfağı ilgilendiren her şey notta yazıyor — alerji, doğum
                                    günü pastası, "çocuk sandalyesi" gibi. Notu olan satırda
                                    ikinci satır olarak duruyor. */}
                                {r.note && (
                                  <div style={{ fontSize: 12, color: inkSoft, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.note}</div>
                                )}
                              </div>
                              {masa && <span style={{ fontSize: 12, color: "var(--muted)", flexShrink: 0, whiteSpace: "nowrap" }}>{masa}</span>}
                              {fixKisi != null && <span className="tnum" style={{ fontSize: 12, color: "var(--muted)", flexShrink: 0, whiteSpace: "nowrap" }}>{fixKisi} fix</span>}
                              {r.status !== "bekleniyor" && (
                                <span style={{ fontSize: 11.5, fontWeight: 600, color: info.color, flexShrink: 0, whiteSpace: "nowrap" }}>{info.label}</span>
                              )}
                              <span className="tnum" style={{ fontSize: 13.5, fontWeight: 600, color: info.color, flexShrink: 0 }}>{r.party_size} pax</span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <RezervasyonAltNav />
    </div>
  );
}

// Rezervasyon listesindeki ölçülerin aynısı (PAGE_STANDARDS madde 11).
const navBtn: React.CSSProperties = { all: "unset", cursor: "pointer", display: "flex", alignItems: "center", padding: 6, borderRadius: 8, color: "var(--muted)" };
const btnGhost: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "7px 12px", background: "var(--card)", color: "var(--ink)", fontSize: 12, flexShrink: 0, cursor: "pointer" };
const inkSoft = "#5c5c58";
