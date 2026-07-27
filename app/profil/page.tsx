"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { getMyRestaurantId } from "@/lib/supabase/restaurant";
import { getStaffSession } from "@/lib/supabase/staffSession";

// Yönetici (PC, gerçek giriş) buradan herhangi bir personelin özetini tam veriyle görür
// (toplam ciro dahil). staff_daily_summary RPC'si aynı zamanda garson/mutfak ekranındaki
// "Profilim" panelini de besliyor — orada kişi kendi verisini görür, kıyas ayarlıysa yüzdeyi de.
//
// Sayfa iki modda çalışır:
//   1) Yönetici başkasının profiline bakıyor  → /profil?staff=<id>
//   2) Kişi kendi profiline bakıyor           → ?staff yok, cihazdaki PIN oturumu kullanılır
// Maaş bloğu sadece "kendi profili" VEYA "gerçek yönetici girişi" varsa görünür.
//
// Dönem (bugün/hafta/ay) kırılımları RPC'de yok; RPC "bugün"ün tek doğru kaynağı olarak
// aynen kullanılır, hafta/ay rakamları burada istemci tarafında hesaplanır.
type Summary = {
  full_name: string; role: string; own_sales: number; own_orders_served: number;
  own_items_prepared: number; comparison_enabled: boolean; sales_percent: number | null;
};
type StaffRow = { id: string; full_name: string; role: string; active: boolean; gross_salary: number };
type OrderRow = { id: string; total_amount: number | null; closed_at: string; closed_by_staff_id: string | null };
type SentRow = { quantity: number; unit_price: number | null; status: string; sent_at: string | null; menu_items: { name: string } | null };
type PrepRow = { quantity: number; unit_price: number | null; status: string; created_at: string; prepared_by_staff_id: string | null; menu_items: { name: string } | null };

type Donem = "gun" | "hafta" | "ay";
const DONEMLER: { v: Donem; l: string; uzun: string }[] = [
  { v: "gun", l: "Bugün", uzun: "bugün" },
  { v: "hafta", l: "Bu hafta", uzun: "bu hafta" },
  { v: "ay", l: "Bu ay", uzun: "bu ay" },
];

const roleLabel = (v: string) => ({ garson: "Garson", mutfak: "Mutfak", bar: "Bar", kasa: "Kasa", sef: "Şef", yonetici: "Yönetici" }[v] ?? v);
const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;
const adet = (n: number) => Math.round(n).toLocaleString("tr-TR");
const yuzde = (n: number) => `%${(Math.round(n * 10) / 10).toLocaleString("tr-TR")}`;

const bugunIstanbul = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const istGun = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date(iso));
const gunBasiMs = (gun: string) => Date.parse(`${gun}T00:00:00+03:00`); // İstanbul 2016'dan beri sabit UTC+3
const gunEkle = (gun: string, n: number) => {
  const [y, m, d] = gun.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const donemBasiMs = (d: Donem, gun: string) => {
  if (d === "gun") return gunBasiMs(gun);
  if (d === "hafta") {
    const haftaGunu = (new Date(`${gun}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = pazartesi
    return gunBasiMs(gun) - haftaGunu * 86400000;
  }
  return gunBasiMs(`${gun.slice(0, 8)}01`);
};
const gunEtiketi = (gun: string) => {
  const [y, m, d] = gun.split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", weekday: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(y, m - 1, d)));
};

export default function ProfilPage() {
  return (
    <Suspense fallback={null}>
      <ProfilInner />
    </Suspense>
  );
}

function ProfilInner() {
  const staffParam = useSearchParams().get("staff");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [donem, setDonem] = useState<Donem>("gun");

  const [staffId, setStaffId] = useState<string | null>(null);
  const [kendisi, setKendisi] = useState(false);     // cihazdaki PIN oturumu bu kişi mi
  const [yonetici, setYonetici] = useState(false);   // gerçek işletme girişi var mı
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [sgkRate, setSgkRate] = useState(0);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [sentItems, setSentItems] = useState<SentRow[]>([]);
  const [prepItems, setPrepItems] = useState<PrepRow[]>([]);
  const [bugun] = useState(() => bugunIstanbul());

  const load = useCallback(async () => {
    setErr(null);
    const restId = await getMyRestaurantId();
    if (!restId) { setErr("Giriş yapılmamış."); return; }

    const cihazOturumu = getStaffSession();
    const hedef = staffParam ?? cihazOturumu?.id ?? null;
    if (!hedef) { setErr("Personel seçilmedi — Personel sayfasından bir kişinin adına tıkla."); return; }
    setStaffId(hedef);
    setKendisi(cihazOturumu?.id === hedef);
    const { data: authData } = await supabase.auth.getSession();
    setYonetici(!!authData.session);

    const [{ data: sumRows, error: sumErr }, { data: stRow }, { data: staffRows }] = await Promise.all([
      supabase.rpc("staff_daily_summary", { p_restaurant_id: restId, p_staff_id: hedef }),
      supabase.from("restaurant_settings").select("sgk_employer_rate").eq("restaurant_id", restId).maybeSingle(),
      supabase.from("staff_members").select("id, full_name, role, active, gross_salary").eq("restaurant_id", restId).is("deleted_at", null),
    ]);
    if (sumErr) { setErr(sumErr.message); return; }
    const s = (sumRows as Summary[])?.[0] ?? null;
    setSummary(s);
    setSgkRate(Number((stRow as { sgk_employer_rate: number } | null)?.sgk_employer_rate ?? 0));
    setStaffList((staffRows as StaffRow[]) ?? []);
    if (!s) return;

    // Mutfak/bar rolünde "kaç ürün hazırladı" ölçüsü kıyaslanır → kıyas için tüm hazırlayanlar
    // çekilir. Diğer rollerde sadece kişinin kendi kalemleri.
    const hazirlikRolu = s.role === "mutfak" || s.role === "bar";
    // En geniş pencere: ayın 1'i ile son 30 gün — hangisi daha eskiyse (dönem değişince yeniden sorgu yok)
    const baslangic = new Date(Math.min(donemBasiMs("ay", bugun), gunBasiMs(gunEkle(bugun, -29)))).toISOString();

    const prepQuery = supabase.from("order_items")
      .select("quantity, unit_price, status, created_at, prepared_by_staff_id, menu_items(name)")
      .eq("restaurant_id", restId).gte("created_at", baslangic);

    const [{ data: ordRows }, { data: sentRows }, { data: prepRows }] = await Promise.all([
      supabase.from("orders").select("id, total_amount, closed_at, closed_by_staff_id")
        .eq("restaurant_id", restId).eq("status", "closed").gte("closed_at", baslangic),
      supabase.from("order_items").select("quantity, unit_price, status, sent_at, menu_items(name)")
        .eq("restaurant_id", restId).eq("sent_by_staff_id", hedef).gte("sent_at", baslangic),
      hazirlikRolu ? prepQuery.not("prepared_by_staff_id", "is", null) : prepQuery.eq("prepared_by_staff_id", hedef),
    ]);

    setOrders((ordRows as OrderRow[]) ?? []);
    setSentItems((sentRows as unknown as SentRow[]) ?? []);
    setPrepItems((prepRows as unknown as PrepRow[]) ?? []);
  }, [staffParam, bugun]);

  useEffect(() => { load(); }, [load]);

  const basMs = useMemo(() => donemBasiMs(donem, bugun), [donem, bugun]);
  const gunModu = donem === "gun";
  const hazirlikRolu = summary?.role === "mutfak" || summary?.role === "bar";

  // Seçili dönemin rakamları. "Bugün" seçiliyken ciro/masa/kalem RPC'den gelir — mevcut
  // davranış birebir korunsun diye (istemci hesabı zaten aynı sonucu verir).
  const istatistik = useMemo(() => {
    const benimSiparisler = orders.filter((o) => o.closed_by_staff_id === staffId && Date.parse(o.closed_at) >= basMs);
    const hesapCiro = benimSiparisler.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
    const hesapMasa = benimSiparisler.length;
    const benimKalemler = prepItems.filter((i) => i.prepared_by_staff_id === staffId && Date.parse(i.created_at) >= basMs);
    const gonderilen = sentItems
      .filter((i) => i.status !== "void" && i.sent_at && Date.parse(i.sent_at) >= basMs)
      .reduce((s, i) => s + Number(i.quantity), 0);

    const ciro = gunModu && summary ? Number(summary.own_sales) : hesapCiro;
    const masa = gunModu && summary ? Number(summary.own_orders_served) : hesapMasa;
    const kalem = gunModu && summary ? Number(summary.own_items_prepared) : benimKalemler.length;
    return {
      ciro, masa, gonderilen, kalem,
      hazirlananAdet: benimKalemler.reduce((s, i) => s + Number(i.quantity), 0),
      ortalamaAdisyon: masa > 0 ? ciro / masa : 0,
    };
  }, [orders, prepItems, sentItems, staffId, basMs, gunModu, summary]);

  // Günlük kırılım — dönem "ay" ise son 30 gün, değilse son 7 gün
  const gunlukKirilim = useMemo(() => {
    const kacGun = donem === "ay" ? 30 : 7;
    const kova: Record<string, number> = {};
    for (let i = kacGun - 1; i >= 0; i--) kova[gunEkle(bugun, -i)] = 0;
    orders.forEach((o) => {
      if (o.closed_by_staff_id !== staffId) return;
      const g = istGun(o.closed_at);
      if (g in kova) kova[g] += Number(o.total_amount ?? 0);
    });
    return Object.entries(kova).map(([gun, tutar]) => ({ gun, tutar }));
  }, [orders, staffId, donem, bugun]);

  // En çok sattığı/hazırladığı ürünler — kişiye özel ilk 5
  const enCok = useMemo(() => {
    const kova: Record<string, { adet: number; tutar: number }> = {};
    if (hazirlikRolu) {
      prepItems.forEach((i) => {
        if (i.prepared_by_staff_id !== staffId || i.status === "void" || Date.parse(i.created_at) < basMs) return;
        const ad = i.menu_items?.name ?? "?";
        const k = (kova[ad] ??= { adet: 0, tutar: 0 });
        k.adet += Number(i.quantity);
        k.tutar += Number(i.quantity) * Number(i.unit_price ?? 0);
      });
    } else {
      sentItems.forEach((i) => {
        if (i.status === "void" || !i.sent_at || Date.parse(i.sent_at) < basMs) return;
        const ad = i.menu_items?.name ?? "?";
        const k = (kova[ad] ??= { adet: 0, tutar: 0 });
        k.adet += Number(i.quantity);
        k.tutar += Number(i.quantity) * Number(i.unit_price ?? 0);
      });
    }
    return Object.entries(kova).map(([ad, v]) => ({ ad, ...v })).sort((a, b) => b.adet - a.adet).slice(0, 5);
  }, [prepItems, sentItems, staffId, basMs, hazirlikRolu]);

  // Karşılaştırma — SADECE restaurant_settings.staff_comparison_enabled açıkken hesaplanır.
  // Başkalarının ham rakamı hiç gösterilmez; sadece kendi yüzdesi ve sırası.
  const kiyas = useMemo(() => {
    if (!summary || !summary.comparison_enabled || !staffId) return null;
    const ekip = staffList.filter((x) => x.role === summary.role);
    const degerler: Record<string, number> = {};
    ekip.forEach((m) => { degerler[m.id] = 0; });
    if (!(staffId in degerler)) degerler[staffId] = 0; // pasif/listede olmayan kişi de kendi değerini görsün
    if (hazirlikRolu) {
      prepItems.forEach((i) => {
        if (!i.prepared_by_staff_id || i.status === "void" || Date.parse(i.created_at) < basMs) return;
        if (i.prepared_by_staff_id in degerler) degerler[i.prepared_by_staff_id] += Number(i.quantity);
      });
    } else {
      orders.forEach((o) => {
        if (!o.closed_by_staff_id || Date.parse(o.closed_at) < basMs) return;
        if (o.closed_by_staff_id in degerler) degerler[o.closed_by_staff_id] += Number(o.total_amount ?? 0);
      });
    }
    const kisiler = Object.entries(degerler);
    if (kisiler.length < 2) return null;
    const toplam = kisiler.reduce((s, [, v]) => s + v, 0);
    const benim = degerler[staffId] ?? 0;
    const ortalama = toplam / kisiler.length;
    const sira = kisiler.slice().sort((a, b) => b[1] - a[1]).findIndex(([id]) => id === staffId) + 1;
    return {
      benim, ortalama, kisiSayisi: kisiler.length, sira,
      ortalamayaOran: ortalama > 0 ? (benim / ortalama) * 100 : null,
      pay: toplam > 0 ? (benim / toplam) * 100 : null,
      olcu: hazirlikRolu ? "hazırlanan ürün" : "satış",
    };
  }, [summary, staffList, staffId, orders, prepItems, basMs, hazirlikRolu]);

  const kisi = staffList.find((x) => x.id === staffId) ?? null;
  const maasGorunur = kendisi || yonetici;
  const donemUzun = DONEMLER.find((d) => d.v === donem)?.uzun ?? "";
  const satisVar = summary ? summary.role === "garson" || istatistik.ciro > 0 || istatistik.masa > 0 : false;
  const hazirlikVar = summary ? hazirlikRolu || istatistik.kalem > 0 : false;
  const kirilimMax = Math.max(...gunlukKirilim.map((d) => d.tutar), 1);

  return (
    <div style={{ padding: "26px 28px", height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 20, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)" }}>
            {summary ? summary.full_name : "Profil"}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>
            {summary ? `${roleLabel(summary.role)} · ${donemUzun}` : "Profil"}
            {kisi && !kisi.active && <span style={{ color: "var(--gold-text)" }}> · pasif</span>}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {DONEMLER.map((d) => (
            <button key={d.v} onClick={() => setDonem(d.v)} style={pill(d.v === donem)}>{d.l}</button>
          ))}
          {staffParam && <Link href="/personel" style={{ fontSize: 12.5, color: "var(--brand)", textDecoration: "none", marginLeft: 6 }}>Personel</Link>}
        </div>
      </div>

      {err && <div style={{ padding: "10px 14px", borderRadius: 12, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13, maxWidth: 480, flexShrink: 0 }}>{err}</div>}
      {!err && !summary && <div style={{ color: "var(--muted-2)", fontSize: 13 }}>Yükleniyor…</div>}

      {!err && summary && (
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", gap: 14, alignItems: "flex-start", paddingRight: 4 }}>
          {/* SOL KOLON */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            {satisVar && (
              <div style={card}>
                <div style={baslik}>Satış özeti <span style={altBaslik}>{donemUzun}</span></div>
                <Row label="Toplam ciro" value={money(istatistik.ciro)} strong />
                <Row label="Hizmet ettiği masa" value={adet(istatistik.masa)} />
                <Row label="Gönderdiği ürün" value={`${adet(istatistik.gonderilen)} adet`} />
                <Row label="Ortalama adisyon" value={istatistik.masa > 0 ? money(istatistik.ortalamaAdisyon) : "—"} />
                {istatistik.masa === 0 && (
                  <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 10 }}>Bu dönemde kapanmış hesabı yok.</div>
                )}
              </div>
            )}

            {hazirlikVar && (
              <div style={card}>
                <div style={baslik}>Mutfak/bar üretimi <span style={altBaslik}>{donemUzun}</span></div>
                <Row label="Hazırladığı ürün" value={`${adet(istatistik.hazirlananAdet)} adet`} strong />
                <Row label="Hazırladığı sipariş kalemi" value={adet(istatistik.kalem)} />
              </div>
            )}

            {summary.comparison_enabled ? (
              kiyas ? (
                <div style={card}>
                  <div style={baslik}>Ekip karşılaştırması <span style={altBaslik}>{roleLabel(summary.role)} · {donemUzun}</span></div>
                  <Row
                    label="Takım ortalamasına göre"
                    value={kiyas.ortalamayaOran != null ? `${yuzde(kiyas.ortalamayaOran)}` : "—"}
                    strong
                  />
                  <Row label={`${roleLabel(summary.role)} sıralaması`} value={`${kiyas.sira}. / ${kiyas.kisiSayisi}`} />
                  <Row label={`Ekip içindeki ${kiyas.olcu} payı`} value={kiyas.pay != null ? yuzde(kiyas.pay) : "—"} />
                  <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 10 }}>
                    Ölçü: {kiyas.olcu}. Karşılaştırma yalnızca kendi yüzdesini gösterir, başkalarının rakamı görünmez.
                  </div>
                </div>
              ) : (
                <div style={card}>
                  <div style={baslik}>Ekip karşılaştırması</div>
                  <div style={{ fontSize: 12.5, color: "var(--muted-2)" }}>Aynı rolde karşılaştırılacak ikinci bir kişi yok.</div>
                </div>
              )
            ) : null}

            {maasGorunur && kisi && (
              <div style={card}>
                <div style={baslik}>Maaş <span style={altBaslik}>aylık</span></div>
                <Row label="Brüt maaş" value={money(Number(kisi.gross_salary))} strong />
                {sgkRate > 0 && (
                  <>
                    <Row label={`SGK işveren payı (${yuzde(sgkRate)})`} value={money(Number(kisi.gross_salary) * sgkRate / 100)} />
                    <Row label="İşverene toplam maliyeti" value={money(Number(kisi.gross_salary) * (1 + sgkRate / 100))} />
                  </>
                )}
                <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 10 }}>
                  Brüt maaş Personel sayfasından düzenlenir, Ana Sayfa&apos;daki Sabit Gider&apos;e otomatik yansır.
                </div>
              </div>
            )}
          </div>

          {/* SAĞ KOLON */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={card}>
              <div style={baslik}>Gün gün cirosu <span style={altBaslik}>son {donem === "ay" ? 30 : 7} gün</span></div>
              {gunlukKirilim.every((d) => d.tutar === 0) ? (
                <div style={{ fontSize: 12.5, color: "var(--muted-2)" }}>Bu aralıkta bu kişinin kapattığı hesap yok.</div>
              ) : (
                gunlukKirilim.map((d) => (
                  <div key={d.gun} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                    <span style={{ width: 92, fontSize: 11.5, color: d.gun === bugun ? "var(--ink-green)" : "var(--muted-2)", fontWeight: d.gun === bugun ? 600 : 400, flexShrink: 0 }}>{gunEtiketi(d.gun)}</span>
                    <span style={{ flex: 1, minWidth: 0, height: 8, background: "var(--recede)", borderRadius: 4, overflow: "hidden" }}>
                      <span style={{ display: "block", height: "100%", width: `${d.tutar > 0 ? Math.max(3, (d.tutar / kirilimMax) * 100) : 0}%`, background: "var(--brand)", borderRadius: 4 }} />
                    </span>
                    <span className="tnum" style={{ width: 88, textAlign: "right", fontSize: 12, color: d.tutar > 0 ? "var(--ink)" : "var(--muted-2)", flexShrink: 0 }}>{money(d.tutar)}</span>
                  </div>
                ))
              )}
            </div>

            <div style={card}>
              <div style={baslik}>
                {hazirlikRolu ? "En çok hazırladıkları" : "En çok sattıkları"} <span style={altBaslik}>{donemUzun}</span>
              </div>
              {enCok.length === 0 ? (
                <div style={{ fontSize: 12.5, color: "var(--muted-2)" }}>Bu dönemde kayıt yok.</div>
              ) : (
                enCok.map((t) => (
                  <div key={t.ad} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.ad}</span>
                    <span className="tnum" style={{ flexShrink: 0, color: "var(--muted)" }}>
                      {adet(t.adet)} adet{t.tutar > 0 && <> · <b style={{ color: "var(--ink)" }}>{money(t.tutar)}</b></>}
                    </span>
                  </div>
                ))
              )}
            </div>

            {!summary.comparison_enabled && (
              <div style={{ fontSize: 11.5, color: "var(--muted-2)", padding: "0 4px" }}>
                Personel karşılaştırması Ayarlar&apos;dan kapalı — sadece kendi rakamları görünür.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ fontSize: 13.5, color: "var(--muted)" }}>{label}</span>
      <span className="tnum" style={{ fontSize: strong ? 18 : 14, fontWeight: strong ? 700 : 500, color: strong ? "var(--brand)" : "var(--ink)", flexShrink: 0 }}>{value}</span>
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 18 };
const baslik: React.CSSProperties = { fontWeight: 600, color: "var(--ink-green)", marginBottom: 8, fontSize: 14.5 };
const altBaslik: React.CSSProperties = { fontSize: 11.5, fontWeight: 400, color: "var(--muted-2)" };
const pill = (aktif: boolean): React.CSSProperties => ({
  border: "1px solid var(--line-2)", borderRadius: 980, padding: "6px 14px", fontSize: 12.5, fontWeight: 500,
  background: aktif ? "var(--ink-green)" : "var(--card)", color: aktif ? "#fff" : "var(--ink-green)", cursor: "pointer",
});
