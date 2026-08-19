"use client";

// Misafirin KENDİ kendine rezervasyon yaptığı, girişsiz genel sayfa (ROADMAP — Gökhan,
// 2026-08-01: "misafir kendi rezervasyonunu yapabilsin... bu ayrı bir uygulama olacak, aiosun
// karşılama panelinde de kullanacağız"). Restoranın Instagram bio'suna/web sitesine konacak
// bir link — /m/[slug] (QR menü) ile aynı desen: slug'a göre restoran bulunur, kayıt doğrudan
// aynı reservations tablosuna düşer (status='bekleniyor', source='online') — Karşılama'da
// personelin girdiği rezervasyonla birebir aynı listede, aynı akıştan geçer.
//
// FORM KURALLARI AYARLARDAN GELİR (Gökhan, 2026-08-15 — Ayarlar > Online rezervasyon):
// açık/kapalı, kaç gün öncesinden, en küçük/en büyük grup, kaç kişiden sonrası telefonla,
// salon seçimi. Kurallar burada sadece formu şekillendirir; asıl denetim sunucuda
// (online_rezervasyon_olustur) — formu atlayıp doğrudan çağıran olursa ayarlar yine geçerli.
//
// Bilerek YAPMADIKLARI: doluluk hızı (pacing) yok — Gökhan: "bunun bir sınırı yok, limit yok".
// Kalan koltuk sayısı da dışarıya gösterilmiyor; kapasite dolduğunda kayıt açılmaz, talep
// işletmenin listesine yazılır.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { toTitleTr } from "@/lib/text";

type Salon = { id: string; name: string };
type Bilgi = {
  id: string;
  name: string;
  telefon: string | null;
  kvkk_notice: string | null;
  online_acik: boolean;
  gun_ufku: number;
  min_kisi: number;
  max_kisi: number;
  telefon_esigi: number;
  slot_dakika: number;
  salon_secimi: boolean;
  opening_hours: unknown;
  salonlar: Salon[];
};

type DayKey = "pzt" | "sal" | "car" | "per" | "cum" | "cmt" | "paz";
type DayHours = { acilis: string; kapanis: string; kapali: boolean };
// Ayarlar ekranındaki liste ile aynı sıra — JS'in getDay() değeri 0=pazar.
const GUN_ANAHTARI: DayKey[] = ["paz", "pzt", "sal", "car", "per", "cum", "cmt"];

const bugunIstanbul = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const simdiDakikaIstanbul = () => {
  const s = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  const [h, d] = s.split(":").map((x) => parseInt(x, 10));
  return h * 60 + d;
};
const gunEkle = (iso: string, adet: number) => {
  const t = new Date(`${iso}T00:00:00`);
  t.setDate(t.getDate() + adet);
  return new Intl.DateTimeFormat("en-CA").format(t);
};
const dakikaya = (hhmm: string) => {
  const [h, d] = hhmm.split(":").map((x) => parseInt(x, 10));
  return Number.isFinite(h) && Number.isFinite(d) ? h * 60 + d : 0;
};
const saate = (dk: number) => `${String(Math.floor(dk / 60)).padStart(2, "0")}:${String(dk % 60).padStart(2, "0")}`;

// Çalışma saati hiç girilmemişse Ayarlar ekranının gösterdiği varsayılan kullanılır — yoksa
// saati girmemiş bir işletmenin formu hiç saat çıkarmaz, misafir rezervasyon yapamaz.
const VARSAYILAN_GUN: DayHours = { acilis: "09:00", kapanis: "23:00", kapali: false };

const gunuOku = (opening: unknown, iso: string): DayHours | null => {
  if (!iso) return null;
  if (!opening || typeof opening !== "object") return { ...VARSAYILAN_GUN };
  const key = GUN_ANAHTARI[new Date(`${iso}T00:00:00`).getDay()];
  const v = (opening as Partial<Record<DayKey, Partial<DayHours>>>)[key];
  if (!v || typeof v.acilis !== "string" || typeof v.kapanis !== "string") return { ...VARSAYILAN_GUN };
  return { acilis: v.acilis, kapanis: v.kapanis, kapali: Boolean(v.kapali) };
};

/**
 * Seçilen TAKVİM GÜNÜ içindeki saatler. İki kaynaktan toplanır:
 *   - o günün kendi vardiyası (gece yarısını geçiyorsa gece yarısında kesilir)
 *   - bir önceki günün gece yarısını aşan kuyruğu (cuma 23:00–02:00 ise cumartesi 00:00–02:00)
 * Bugün seçiliyse geçmiş saatler elenir.
 */
const gununSaatleri = (opening: unknown, iso: string, adim: number): string[] => {
  if (!iso) return [];
  const adimDk = Math.max(5, adim || 15);
  const dakikalar = new Set<number>();

  const bugunku = gunuOku(opening, iso);
  if (bugunku && !bugunku.kapali) {
    const bas = dakikaya(bugunku.acilis);
    const bit = dakikaya(bugunku.kapanis) <= bas ? 24 * 60 : dakikaya(bugunku.kapanis);
    for (let t = bas; t < bit; t += adimDk) dakikalar.add(t);
  }
  const dunku = gunuOku(opening, gunEkle(iso, -1));
  if (dunku && !dunku.kapali && dakikaya(dunku.kapanis) <= dakikaya(dunku.acilis)) {
    const bit = dakikaya(dunku.kapanis);
    for (let t = 0; t < bit; t += adimDk) dakikalar.add(t);
  }

  const enErken = iso === bugunIstanbul() ? simdiDakikaIstanbul() : -1;
  return [...dakikalar].filter((t) => t > enErken).sort((a, b) => a - b).map(saate);
};

const HATA_METNI: Record<string, string> = {
  ONLINE_KAPALI: "Şu anda online rezervasyon alınmıyor.",
  GECMIS_GUN: "Geçmiş bir gün seçilemez.",
  GUN_UFKU: "Bu kadar ileri bir tarihe henüz rezervasyon alınmıyor.",
  GRUP_KUCUK: "Seçtiğiniz kişi sayısı için online rezervasyon alınmıyor.",
  GRUP_BUYUK: "Bu kadar kalabalık bir grup için online rezervasyon alınmıyor.",
  TELEFONLA: "Bu büyüklükteki masalar telefonla ayarlanıyor.",
  ONLINE_ENGEL: "Bu numarayla online rezervasyon açılamıyor, lütfen işletmeyi arayın.",
};

export default function RezervasyonYapPage() {
  const { slug } = useParams<{ slug: string }>();
  const [bilgi, setBilgi] = useState<Bilgi | null | undefined>(undefined); // undefined = yükleniyor
  const [kvkkAcik, setKvkkAcik] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [party, setParty] = useState("2");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [alanId, setAlanId] = useState("");
  const [note, setNote] = useState("");
  const [kvkkOnay, setKvkkOnay] = useState(false);
  // Bal küpü — botlar genelde her alanı doldurur, gerçek kullanıcı bunu hiç görmez
  // (CSS ile ekran dışına taşınmış). Doluysa gönderimi SESSİZCE yutuyoruz.
  const [honeypot, setHoneypot] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Veri kilidi (2026-08-10) sonrası bu sayfa hiçbir tabloya doğrudan bakmıyor: işletme adı,
  // KVKK metni ve form kuralları tek bir denetimli çağrıdan gelir, kayıt da tek bir denetimli
  // çağrıyla açılır. Girişsiz bir sayfanın işletmenin ayarlarına erişimi yok.
  useEffect(() => {
    setDate(bugunIstanbul());
    if (!slug) return;
    supabase.rpc("online_rezervasyon_bilgi", { p_slug: slug }).then(({ data }) => {
      setBilgi((data as Bilgi | null) ?? null);
    });
  }, [slug]);

  const saatler = useMemo(
    () => (bilgi ? gununSaatleri(bilgi.opening_hours, date, bilgi.slot_dakika) : []),
    [bilgi, date],
  );

  // Gün değişince seçili saat o günün listesinde olmayabilir — o zaman ilk uygun saat geçerli
  // sayılır. State'i effect'le düzeltmiyoruz, hesaplayıp kullanıyoruz.
  const secilenSaat = saatler.includes(time) ? time : (saatler[0] ?? "");

  const kisi = parseInt(party, 10) || 0;
  const enGecGun = bilgi && bilgi.gun_ufku > 0 ? gunEkle(bugunIstanbul(), bilgi.gun_ufku) : undefined;
  // Kalabalık grup: kayıt açtırılmaz, aranması istenir (Gökhan: "kaç kişiden sonrası telefonla").
  const telefonlaAlinir = Boolean(bilgi && bilgi.telefon_esigi > 0 && kisi > bilgi.telefon_esigi);
  const grupAralikDisi = Boolean(bilgi && kisi > 0 && (kisi < bilgi.min_kisi || kisi > bilgi.max_kisi));

  const submit = async () => {
    if (!bilgi) return;
    if (!name.trim() || !phone.trim() || !date || !secilenSaat || !kisi || kisi <= 0) {
      setErr("İsim, telefon, tarih, saat ve kişi sayısı gerekli.");
      return;
    }
    if (!kvkkOnay) { setErr("Devam etmek için KVKK aydınlatma metnini onaylamalısın."); return; }
    if (honeypot.trim()) { setDone(true); return; } // bot — sessizce "başarılı" göster, gerçek kayıt açma

    setBusy(true); setErr(null);
    const { data: yeniKayitId, error } = await supabase.rpc("online_rezervasyon_olustur", {
      p_slug: slug,
      p_ad: toTitleTr(name),
      p_telefon: phone.trim(),
      p_kisi: kisi,
      p_zaman: new Date(`${date}T${secilenSaat}:00+03:00`).toISOString(),
      p_not: note.trim() || null,
      p_alan_id: alanId || null,
    });
    setBusy(false);
    if (error) {
      const mesaj = error.message ?? "";
      // O gün doldu: kayıt açılmaz ama talep işletmenin listesine yazılır (Gökhan, 2026-08-13:
      // "kapasite dolunca rezervasyon alınmasın, kapasite dolu desin, ama kayıt tutulsun").
      if (mesaj.includes("KAPASITE_DOLU")) {
        setErr("Seçtiğin gün doldu, rezervasyon alınamadı. Talebin işletmeye iletildi — başka bir gün ya da saat deneyebilirsin.");
        return;
      }
      const kod = Object.keys(HATA_METNI).find((k) => mesaj.includes(k));
      setErr(kod ? `${HATA_METNI[kod]}${bilgi.telefon ? ` Lütfen ${bilgi.telefon} numarasından arayın.` : ""}` : "Rezervasyon gönderilemedi, lütfen tekrar dene.");
      return;
    }
    // Onay bildirimi — sağlayıcı bağlanana kadar sessizce "gönderilmedi" döner, akışı etkilemez.
    if (yeniKayitId) supabase.functions.invoke("send-reservation-notification", { body: { reservation_id: yeniKayitId, type: "onay" } }).catch(() => {});
    setTime(secilenSaat); // onay ekranı gönderilen saati göstersin
    setDone(true);
  };

  if (bilgi === undefined) return <div style={{ minHeight: "100vh", background: "var(--canvas)" }} />;
  if (bilgi === null) {
    return (
      <div style={{ background: "var(--canvas)", minHeight: "100vh", padding: 40, textAlign: "center", color: "var(--muted)" }}>
        İşletme bulunamadı.
      </div>
    );
  }

  const araBaglantisi = bilgi.telefon && (
    <a href={`tel:${bilgi.telefon.replace(/\s/g, "")}`} style={{ color: "var(--brand)", fontWeight: 600, textDecoration: "none" }}>{bilgi.telefon}</a>
  );

  return (
    <div style={{ background: "var(--canvas)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "36px 20px 60px" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--ink-green)" }}>{bilgi.name}</div>
          <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 6 }}>Rezervasyon</div>
        </div>

        {!bilgi.online_acik ? (
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink-green)", marginBottom: 8 }}>Online rezervasyon kapalı</div>
            <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6 }}>
              {bilgi.telefon ? <>Rezervasyon için {araBaglantisi} numarasından bize ulaşabilirsiniz.</> : "Rezervasyon için lütfen işletmeyle iletişime geçin."}
            </div>
          </div>
        ) : done ? (
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink-green)", marginBottom: 8 }}>Rezervasyon talebiniz alındı</div>
            <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6 }}>
              {toTitleTr(name)}, {date && new Date(`${date}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long" })} günü saat {time} için {party} kişilik rezervasyonunuz işletmeye ulaştı. Bir sorun olursa {phone} numaranızdan sizinle iletişime geçilecek.
            </div>
          </div>
        ) : (
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 22 }}>
            {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 12 }}>{err}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="İsim soyisim" style={inp} />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefon" inputMode="tel" style={inp} />
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  type="date" value={date} min={bugunIstanbul()} max={enGecGun}
                  onChange={(e) => setDate(e.target.value)} style={{ ...inp, flex: 1 }}
                />
                {/* Saat serbest yazılmıyor: çalışma saatleri içinde, 15 dakikalık listeden. */}
                <select value={secilenSaat} onChange={(e) => setTime(e.target.value)} disabled={saatler.length === 0} style={{ ...inp, flex: 1 }}>
                  {saatler.length === 0 ? <option value="">—</option> : saatler.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {saatler.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                  Seçtiğiniz gün için uygun saat yok — kapalı olabilir ya da bugünün saatleri geçmiş olabilir.
                </div>
              )}
              <input value={party} onChange={(e) => setParty(e.target.value.replace(/\D/g, ""))} placeholder="Kişi sayısı" inputMode="numeric" style={inp} />
              {bilgi.salon_secimi && bilgi.salonlar.length > 0 && (
                <div>
                  <select value={alanId} onChange={(e) => setAlanId(e.target.value)} style={inp}>
                    <option value="">Salon tercihi yok</option>
                    {bilgi.salonlar.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 4, lineHeight: 1.5 }}>
                    Tercihiniz not edilir, yer durumuna göre karşılanmaya çalışılır.
                  </div>
                </div>
              )}
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Özel not (opsiyonel)" style={inp} />
              <input
                value={honeypot} onChange={(e) => setHoneypot(e.target.value)} tabIndex={-1} autoComplete="off"
                aria-hidden="true" placeholder="Web siteniz"
                style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
              />
            </div>

            {/* Kalabalık grup ya da aralık dışı: kayıt açtırmıyoruz, arayın diyoruz. */}
            {(telefonlaAlinir || grupAralikDisi) && (
              <div style={{ marginTop: 12, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 12, background: "var(--recede)", fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
                {telefonlaAlinir
                  ? <><span className="tnum">{bilgi.telefon_esigi}</span> kişiden kalabalık masalar konuşularak ayarlanıyor.</>
                  : <>Online rezervasyon <span className="tnum">{bilgi.min_kisi}</span>–<span className="tnum">{bilgi.max_kisi}</span> kişi arası alınıyor.</>}
                {bilgi.telefon ? <> Lütfen {araBaglantisi} numarasından bizi arayın.</> : " Lütfen işletmeyle iletişime geçin."}
              </div>
            )}

            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={kvkkOnay} onChange={(e) => setKvkkOnay(e.target.checked)} style={{ marginTop: 2 }} />
              <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                Kişisel verilerimin rezervasyon amacıyla işlenmesini kabul ediyorum.{" "}
                {(bilgi.kvkk_notice ?? "").trim() && (
                  <button type="button" onClick={(e) => { e.preventDefault(); setKvkkAcik((v) => !v); }} style={{ all: "unset", cursor: "pointer", color: "var(--brand)", textDecoration: "underline" }}>
                    {kvkkAcik ? "gizle" : "aydınlatma metnini oku"}
                  </button>
                )}
              </span>
            </label>
            {kvkkAcik && (bilgi.kvkk_notice ?? "").trim() && (
              <div style={{ marginTop: 8, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 12, background: "var(--recede)", fontSize: 12, color: "var(--muted)", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 140, overflowY: "auto" }}>
                {bilgi.kvkk_notice}
              </div>
            )}

            <button
              onClick={submit}
              disabled={busy || !kvkkOnay || telefonlaAlinir || grupAralikDisi || saatler.length === 0}
              style={{ ...btnPrimary, width: "100%", marginTop: 16, opacity: (!kvkkOnay || telefonlaAlinir || grupAralikDisi || saatler.length === 0) ? 0.5 : 1 }}
            >
              {busy ? "Gönderiliyor…" : "Rezervasyon talebi gönder"}
            </button>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 24, fontSize: 11, color: "var(--muted-2)" }}>Restoran AIOS</div>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "11px 12px", fontSize: 14.5, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0, boxSizing: "border-box", width: "100%" };
const btnPrimary: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 980, padding: "13px 16px", background: "var(--brand-strong)", color: "#fff", fontSize: 15, fontWeight: 500 };
