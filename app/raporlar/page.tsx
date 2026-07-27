"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getMyRestaurantId } from "@/lib/supabase/restaurant";
import { TrendingUp, TrendingDown } from "lucide-react";

// Raporlar — işletmecinin "geçen dönem ne oldu?" sorusuna tek ekranda cevap veren yer.
// Gün Sonu tek günün kapanış kontrolüdür; burası seçilen herhangi bir dönemin analizidir.
// Bloklar: ürün kârlılığı · iptal/ikram (kaçak radarı) · personel satışı · saatlik yoğunluk ·
// ödeme türü dağılımı · önceki dönemle karşılaştırma.
// Hepsi mevcut tablolardan doğrudan okunur (RPC yok), sorgular paralel çalışır.

type Donem = "bugun" | "hafta" | "ay" | "yil" | "ozel";

type OItem = {
  quantity: number;
  unit_price: number;
  status: string;
  vat_rate: number | null;
  menu_item_id: string;
  sent_by_staff_id: string | null;
  menu_items: { name: string } | null;
};
type ClosedOrder = {
  id: string;
  total_amount: number;
  party_size: number | null;
  closed_at: string | null;
  closed_by_staff_id: string | null;
  order_items: OItem[];
};
type VoidRow = {
  quantity: number;
  unit_price: number;
  status: string;
  void_reason: string | null;
  voided_by: string | null;
  sent_by_staff_id: string | null;
  menu_items: { name: string } | null;
};
type PrevOrder = { total_amount: number; party_size: number | null };
type Payment = { amount: number; method: string };
type Staff = { id: string; full_name: string; role: string };
type Profile = { id: string; full_name: string | null };
type RecipeRow = { menu_item_id: string; quantity: number; ingredients: { current_unit_cost: number } | null };

const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;
const yuzde = (n: number) => `%${n.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;

const istanbulGun = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);
const bugunIstanbul = () => istanbulGun(new Date());
const gunBasiMs = (gun: string) => Date.parse(`${gun}T00:00:00+03:00`);
// Türkiye'de yaz saati uygulaması yok (sabit +03), gün ekleme bu yüzden güvenli.
const gunEkle = (gun: string, n: number) => istanbulGun(new Date(Date.parse(`${gun}T12:00:00+03:00`) + n * 86400000));
const trTarih = (gun: string) =>
  new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", timeZone: "Europe/Istanbul" }).format(new Date(`${gun}T12:00:00+03:00`));
const saatFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: "Europe/Istanbul" });

const DONEMLER: { v: Donem; l: string }[] = [
  { v: "bugun", l: "Bugün" },
  { v: "hafta", l: "Bu hafta" },
  { v: "ay", l: "Bu ay" },
  { v: "yil", l: "Bu yıl" },
];

const roleLabel = (v: string) =>
  ({ garson: "Garson", mutfak: "Mutfak", bar: "Bar", kasa: "Kasa", sef: "Şef", yonetici: "Yönetici" }[v] ?? v);
const odemeLabel = (v: string) => ({ nakit: "Nakit", kart: "Kredi kartı", yemek_karti: "Yemek kartı" }[v] ?? v);

type Aralik = { startMs: number; endMs: number; etiket: string };

function donemAraligi(d: Donem, bugun: string, bas: string, bit: string): Aralik | null {
  if (!bugun) return null;
  const yarin = gunEkle(bugun, 1);
  if (d === "ozel") {
    if (!bas || !bit || gunBasiMs(bas) > gunBasiMs(bit)) return null;
    return { startMs: gunBasiMs(bas), endMs: gunBasiMs(gunEkle(bit, 1)), etiket: `${trTarih(bas)} – ${trTarih(bit)}` };
  }
  if (d === "bugun") return { startMs: gunBasiMs(bugun), endMs: gunBasiMs(yarin), etiket: "Bugün" };
  if (d === "hafta") {
    const haftaGunu = (new Date(`${bugun}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = pazartesi
    return { startMs: gunBasiMs(gunEkle(bugun, -haftaGunu)), endMs: gunBasiMs(yarin), etiket: "Bu hafta" };
  }
  if (d === "ay") return { startMs: gunBasiMs(`${bugun.slice(0, 8)}01`), endMs: gunBasiMs(yarin), etiket: "Bu ay" };
  return { startMs: gunBasiMs(`${bugun.slice(0, 4)}-01-01`), endMs: gunBasiMs(yarin), etiket: "Bu yıl" };
}

export default function Raporlar() {
  const [bugun, setBugun] = useState("");
  const [donem, setDonem] = useState<Donem>("ay");
  const [ozelBas, setOzelBas] = useState("");
  const [ozelBit, setOzelBit] = useState("");

  const [yukleniyor, setYukleniyor] = useState(true);
  const [hata, setHata] = useState<string | null>(null);

  const [kapanan, setKapanan] = useState<ClosedOrder[]>([]);
  const [oncekiOrders, setOncekiOrders] = useState<PrevOrder[]>([]);
  const [voidRows, setVoidRows] = useState<VoidRow[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [recipeCost, setRecipeCost] = useState<Record<string, number>>({});
  const [karsilastirmaAcik, setKarsilastirmaAcik] = useState(false);

  // Tarih state'i ilk render'da değil mount sonrası set edilir — sunucu/istemci
  // arasında hydration uyuşmazlığı olmasın diye (Gün Sonu ile aynı desen).
  useEffect(() => {
    const g = bugunIstanbul();
    setBugun(g);
    setOzelBas(gunEkle(g, -7));
    setOzelBit(g);
  }, []);

  const aralik = useMemo(() => donemAraligi(donem, bugun, ozelBas, ozelBit), [donem, bugun, ozelBas, ozelBit]);

  const load = useCallback(async () => {
    if (!aralik) return;
    const restId = await getMyRestaurantId();
    if (!restId) { setYukleniyor(false); return; }

    setYukleniyor(true);
    setHata(null);

    const startISO = new Date(aralik.startMs).toISOString();
    const endISO = new Date(aralik.endMs).toISOString();
    const uzunlukMs = aralik.endMs - aralik.startMs;
    const oncekiStartISO = new Date(aralik.startMs - uzunlukMs).toISOString();

    const [kap, onc, voids, pays, stf, ayar, rec, prof] = await Promise.all([
      supabase
        .from("orders")
        .select("id, total_amount, party_size, closed_at, closed_by_staff_id, order_items(quantity, unit_price, status, vat_rate, menu_item_id, sent_by_staff_id, menu_items(name))")
        .eq("restaurant_id", restId)
        .eq("status", "closed")
        .gte("closed_at", startISO)
        .lt("closed_at", endISO)
        .limit(5000),
      supabase
        .from("orders")
        .select("total_amount, party_size")
        .eq("restaurant_id", restId)
        .eq("status", "closed")
        .gte("closed_at", oncekiStartISO)
        .lt("closed_at", startISO)
        .limit(5000),
      supabase
        .from("order_items")
        .select("quantity, unit_price, status, void_reason, voided_by, sent_by_staff_id, menu_items(name)")
        .eq("restaurant_id", restId)
        .in("status", ["void", "ikram"])
        .gte("created_at", startISO)
        .lt("created_at", endISO)
        .limit(2000),
      supabase
        .from("order_payments")
        .select("amount, method")
        .eq("restaurant_id", restId)
        .gte("paid_at", startISO)
        .lt("paid_at", endISO)
        .limit(5000),
      supabase.from("staff_members").select("id, full_name, role").eq("restaurant_id", restId).is("deleted_at", null),
      supabase.from("restaurant_settings").select("staff_comparison_enabled").eq("restaurant_id", restId).maybeSingle(),
      supabase.from("recipe_items").select("menu_item_id, quantity, ingredients(current_unit_cost)").eq("restaurant_id", restId),
      supabase.from("profiles").select("id, full_name").eq("restaurant_id", restId).is("deleted_at", null),
    ]);

    const ilkHata = kap.error ?? onc.error ?? voids.error ?? pays.error;
    if (ilkHata) setHata(ilkHata.message);

    setKapanan((kap.data as unknown as ClosedOrder[]) ?? []);
    setOncekiOrders((onc.data as PrevOrder[]) ?? []);
    setVoidRows((voids.data as unknown as VoidRow[]) ?? []);
    setPayments((pays.data as Payment[]) ?? []);
    setStaff((stf.data as Staff[]) ?? []);
    setProfiles((prof.data as Profile[]) ?? []);
    setKarsilastirmaAcik(Boolean((ayar.data as { staff_comparison_enabled: boolean } | null)?.staff_comparison_enabled));

    const costMap: Record<string, number> = {};
    ((rec.data as unknown as RecipeRow[]) ?? []).forEach((r) => {
      costMap[r.menu_item_id] = (costMap[r.menu_item_id] ?? 0) + Number(r.quantity) * Number(r.ingredients?.current_unit_cost ?? 0);
    });
    setRecipeCost(costMap);
    setYukleniyor(false);
  }, [aralik]);

  useEffect(() => { load(); }, [load]);

  // ---------- 6) Dönem karşılaştırma ----------
  const ciro = kapanan.reduce((s, o) => s + Number(o.total_amount), 0);
  const musteri = kapanan.reduce((s, o) => s + Number(o.party_size ?? 0), 0);
  const adisyon = kapanan.length;
  const ortAdisyon = adisyon > 0 ? ciro / adisyon : 0;

  const oncekiCiro = oncekiOrders.reduce((s, o) => s + Number(o.total_amount), 0);
  const oncekiMusteri = oncekiOrders.reduce((s, o) => s + Number(o.party_size ?? 0), 0);
  const oncekiAdisyon = oncekiOrders.length;
  const oncekiOrtAdisyon = oncekiAdisyon > 0 ? oncekiCiro / oncekiAdisyon : 0;

  // ---------- 1) Ürün kârlılığı ----------
  type UrunSatir = {
    id: string; ad: string; adet: number; ciro: number; netEx: number;
    maliyet: number; receteVar: boolean; kar: number; foodCost: number | null;
  };
  const urunler: UrunSatir[] = useMemo(() => {
    const map: Record<string, UrunSatir> = {};
    kapanan.forEach((o) => {
      (o.order_items ?? []).forEach((i) => {
        if (i.status !== "active") return;
        const key = i.menu_item_id;
        const u = (map[key] ??= {
          id: key, ad: i.menu_items?.name ?? "Bilinmeyen ürün", adet: 0, ciro: 0, netEx: 0,
          maliyet: 0, receteVar: recipeCost[key] != null, kar: 0, foodCost: null,
        });
        const tutar = Number(i.quantity) * Number(i.unit_price);
        u.adet += Number(i.quantity);
        u.ciro += tutar;
        u.netEx += tutar / (1 + Number(i.vat_rate ?? 10) / 100);
        u.maliyet += Number(i.quantity) * (recipeCost[key] ?? 0);
      });
    });
    return Object.values(map)
      .map((u) => ({
        ...u,
        kar: u.receteVar ? u.netEx - u.maliyet : 0,
        foodCost: u.receteVar && u.netEx > 0 ? (u.maliyet / u.netEx) * 100 : null,
      }))
      .sort((a, b) => {
        // Reçetesi olmayan ürünler kâr sıralamasına giremez, listenin sonuna düşer.
        if (a.receteVar !== b.receteVar) return a.receteVar ? -1 : 1;
        return b.kar - a.kar;
      });
  }, [kapanan, recipeCost]);

  const receteliUrunler = urunler.filter((u) => u.receteVar);
  const enKarli = receteliUrunler[0]?.id ?? null;
  const enKarsiz = receteliUrunler.length > 1 ? receteliUrunler[receteliUrunler.length - 1].id : null;
  const toplamMaliyet = urunler.reduce((s, u) => s + u.maliyet, 0);
  const toplamNetEx = receteliUrunler.reduce((s, u) => s + u.netEx, 0);
  const genelFoodCost = toplamNetEx > 0 ? (receteliUrunler.reduce((s, u) => s + u.maliyet, 0) / toplamNetEx) * 100 : null;

  // ---------- 2) Personel satışı ----------
  const staffMap = useMemo(() => Object.fromEntries(staff.map((s) => [s.id, s])), [staff]);
  const profileMap = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, p.full_name ?? "Yönetici"])), [profiles]);

  type PersonelSatir = { id: string; ad: string; rol: string; satis: number; kapatilan: number; kapatilanCiro: number };
  const personeller: PersonelSatir[] = useMemo(() => {
    const map: Record<string, PersonelSatir> = {};
    const ensure = (id: string) =>
      (map[id] ??= {
        id, ad: staffMap[id]?.full_name ?? "Silinmiş personel", rol: staffMap[id]?.role ?? "",
        satis: 0, kapatilan: 0, kapatilanCiro: 0,
      });
    kapanan.forEach((o) => {
      if (o.closed_by_staff_id) {
        const p = ensure(o.closed_by_staff_id);
        p.kapatilan += 1;
        p.kapatilanCiro += Number(o.total_amount);
      }
      (o.order_items ?? []).forEach((i) => {
        if (i.status !== "active" || !i.sent_by_staff_id) return;
        ensure(i.sent_by_staff_id).satis += Number(i.quantity) * Number(i.unit_price);
      });
    });
    return Object.values(map).sort((a, b) => b.satis - a.satis || b.kapatilanCiro - a.kapatilanCiro);
  }, [kapanan, staffMap]);

  // ---------- 3) Saatlik yoğunluk ----------
  const saatlik = useMemo(() => {
    const ciroArr = new Array(24).fill(0) as number[];
    const adetArr = new Array(24).fill(0) as number[];
    kapanan.forEach((o) => {
      if (!o.closed_at) return;
      const h = parseInt(saatFmt.format(new Date(o.closed_at)), 10) % 24;
      ciroArr[h] += Number(o.total_amount);
      adetArr[h] += 1;
    });
    return ciroArr
      .map((c, h) => ({ saat: h, ciro: c, adisyon: adetArr[h] }))
      .filter((r) => r.adisyon > 0);
  }, [kapanan]);
  const saatMax = Math.max(...saatlik.map((r) => r.ciro), 1);
  const enYogunSaat = saatlik.reduce<{ saat: number; ciro: number; adisyon: number } | null>(
    (en, r) => (en == null || r.ciro > en.ciro ? r : en), null,
  );

  // ---------- 4) İptal / ikram ----------
  type KacakSatir = { key: string; ad: string; durum: "void" | "ikram"; adet: number; tutar: number; sebep: string | null; kisi: string | null };
  const kacaklar: KacakSatir[] = useMemo(() => {
    const map: Record<string, KacakSatir> = {};
    voidRows.forEach((r) => {
      const ad = r.menu_items?.name ?? "Bilinmeyen ürün";
      const durum = r.status === "ikram" ? "ikram" : "void";
      const kisi = r.voided_by
        ? profileMap[r.voided_by] ?? "Yönetici"
        : r.sent_by_staff_id
          ? staffMap[r.sent_by_staff_id]?.full_name ?? "Silinmiş personel"
          : null;
      const sebep = r.void_reason?.trim() || null;
      const key = `${ad}|${durum}|${sebep ?? ""}|${kisi ?? ""}`;
      const s = (map[key] ??= { key, ad, durum, adet: 0, tutar: 0, sebep, kisi });
      s.adet += Number(r.quantity);
      s.tutar += Number(r.quantity) * Number(r.unit_price);
    });
    return Object.values(map).sort((a, b) => b.tutar - a.tutar);
  }, [voidRows, profileMap, staffMap]);

  const iptalTutar = kacaklar.filter((k) => k.durum === "void").reduce((s, k) => s + k.tutar, 0);
  const ikramTutar = kacaklar.filter((k) => k.durum === "ikram").reduce((s, k) => s + k.tutar, 0);
  const kacakOran = ciro > 0 ? ((iptalTutar + ikramTutar) / ciro) * 100 : 0;
  const sebepsizIptal = kacaklar.filter((k) => k.durum === "void" && !k.sebep).reduce((s, k) => s + k.tutar, 0);

  // ---------- 5) Ödeme türü dağılımı ----------
  const odemeler = useMemo(() => {
    const map: Record<string, number> = {};
    payments.forEach((p) => { map[p.method] = (map[p.method] ?? 0) + Number(p.amount); });
    const toplam = Object.values(map).reduce((s, v) => s + v, 0);
    return {
      toplam,
      satirlar: Object.entries(map)
        .map(([method, tutar]) => ({ method, tutar, oran: toplam > 0 ? (tutar / toplam) * 100 : 0 }))
        .sort((a, b) => b.tutar - a.tutar),
    };
  }, [payments]);

  const bosDonem = !yukleniyor && adisyon === 0;

  const pill = (aktif: boolean): React.CSSProperties => ({
    fontSize: 12.5, padding: "6px 14px", borderRadius: 980, border: "none",
    background: aktif ? "var(--ink-green)" : "transparent",
    color: aktif ? "#fff" : "var(--muted)", cursor: "pointer",
  });

  return (
    <div style={{ padding: "26px 28px", height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      {/* BAŞLIK + DÖNEM SEÇİCİ */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginBottom: 14, flexShrink: 0, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>Raporlar</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 7 }}>
            {aralik?.etiket ?? "—"} · {adisyon} adisyon · {musteri} müşteri
          </div>
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 6, background: "var(--recede)", padding: 3, borderRadius: 980 }}>
          {DONEMLER.map((d) => (
            <button key={d.v} onClick={() => setDonem(d.v)} style={pill(donem === d.v)}>{d.l}</button>
          ))}
          <button onClick={() => setDonem("ozel")} style={pill(donem === "ozel")}>Özel</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="date" value={ozelBas} max={ozelBit || undefined}
            onChange={(e) => { setOzelBas(e.target.value); setDonem("ozel"); }}
            style={dateInp}
          />
          <span style={{ fontSize: 12.5, color: "var(--muted-2)" }}>–</span>
          <input
            type="date" value={ozelBit} min={ozelBas || undefined} max={bugun || undefined}
            onChange={(e) => { setOzelBit(e.target.value); setDonem("ozel"); }}
            style={dateInp}
          />
        </div>
      </div>

      {hata && (
        <div style={{ padding: "9px 13px", borderRadius: 10, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13, marginBottom: 10, flexShrink: 0 }}>
          Rapor verisi okunamadı: {hata}
        </div>
      )}

      {/* 6 — DÖNEM KARŞILAŞTIRMA BANDI */}
      <div style={{
        display: "flex", gap: 12, alignItems: "stretch", padding: "13px 18px", borderRadius: 14,
        background: "var(--card)", border: "1px solid var(--line)", marginBottom: 14, flexShrink: 0, flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "var(--muted)", alignSelf: "center", width: 118, flexShrink: 0, lineHeight: 1.4 }}>
          Önceki dönemle karşılaştırma
        </div>
        <Kiyas etiket="Ciro" simdi={money(ciro)} onceki={money(oncekiCiro)} cur={ciro} prev={oncekiCiro} />
        <Kiyas etiket="Müşteri" simdi={musteri.toLocaleString("tr-TR")} onceki={oncekiMusteri.toLocaleString("tr-TR")} cur={musteri} prev={oncekiMusteri} />
        <Kiyas etiket="Ortalama adisyon" simdi={money(ortAdisyon)} onceki={money(oncekiOrtAdisyon)} cur={ortAdisyon} prev={oncekiOrtAdisyon} />
        <Kiyas etiket="Adisyon sayısı" simdi={adisyon.toLocaleString("tr-TR")} onceki={oncekiAdisyon.toLocaleString("tr-TR")} cur={adisyon} prev={oncekiAdisyon} />
      </div>

      {/* RAPOR BLOKLARI — sayfa değil, her kolon kendi içinde kayar */}
      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
        {/* 1 — ÜRÜN KÂRLILIĞI */}
        <Kolon flex={1.5} minWidth={340} baslik="1 · Ürün kârlılığı" alt={genelFoodCost != null ? `Genel food cost ${yuzde(genelFoodCost)} · reçete maliyeti ${money(toplamMaliyet)}` : "Kâra göre sıralı"}>
          {bosDonem || urunler.length === 0 ? (
            <Bos>Bu dönemde ürün satışı yok.</Bos>
          ) : (
            <>
              <BaslikSatiri>
                <span style={{ flex: 1, minWidth: 0 }}>Ürün</span>
                <span style={{ width: 40, textAlign: "right" }}>Adet</span>
                <span style={{ width: 74, textAlign: "right" }}>Ciro</span>
                <span style={{ width: 72, textAlign: "right" }}>Maliyet</span>
                <span style={{ width: 76, textAlign: "right" }}>Brüt kâr</span>
                <span style={{ width: 46, textAlign: "right" }}>FC</span>
              </BaslikSatiri>
              {urunler.map((u) => (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: 12.5 }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink)" }}>
                    {u.ad}
                    {u.id === enKarli && <Etiket renk="var(--brand)">en kârlı</Etiket>}
                    {u.id === enKarsiz && <Etiket renk="var(--danger)">en kârsız</Etiket>}
                    {!u.receteVar && <Etiket renk="var(--gold-text)">reçetesiz</Etiket>}
                  </span>
                  <span className="tnum" style={{ width: 40, textAlign: "right", color: "var(--muted)" }}>{u.adet}</span>
                  <span className="tnum" style={{ width: 74, textAlign: "right" }}>{money(u.ciro)}</span>
                  <span className="tnum" style={{ width: 72, textAlign: "right", color: "var(--muted)" }}>{u.receteVar ? money(u.maliyet) : "—"}</span>
                  <span className="tnum" style={{ width: 76, textAlign: "right", fontWeight: 600, color: !u.receteVar ? "var(--muted-2)" : u.kar >= 0 ? "var(--brand)" : "var(--danger)" }}>
                    {u.receteVar ? money(u.kar) : "—"}
                  </span>
                  <span className="tnum" style={{ width: 46, textAlign: "right", color: u.foodCost != null && u.foodCost > 40 ? "var(--gold-text)" : "var(--muted)" }}>
                    {u.foodCost != null ? yuzde(u.foodCost) : "—"}
                  </span>
                </div>
              ))}
              <Not>
                Ciro KDV dahildir; brüt kâr ve food cost, satış anındaki KDV oranı düşülmüş net satış üzerinden hesaplanır.
                Reçetesi olmayan ürünlerde maliyet bilinmediği için kâr gösterilmez.
              </Not>
            </>
          )}
        </Kolon>

        {/* 4 — İPTAL / İKRAM */}
        <Kolon
          flex={1.15}
          minWidth={290}
          baslik="2 · İptal / ikram"
          alt={kacaklar.length > 0 ? `İptal ${money(iptalTutar)} · İkram ${money(ikramTutar)} — ciroya oranı ${yuzde(kacakOran)}` : "Kaçak radarı"}
          vurgu={iptalTutar + ikramTutar > 0}
        >
          {kacaklar.length === 0 ? (
            <Bos>{bosDonem ? "Bu dönemde veri yok." : "Bu dönemde iptal veya ikram yok — temiz."}</Bos>
          ) : (
            <>
              {sebepsizIptal > 0 && (
                <div style={{ fontSize: 12, color: "var(--gold-text)", background: "var(--recede)", borderRadius: 10, padding: "8px 11px", marginBottom: 8, lineHeight: 1.45 }}>
                  {money(sebepsizIptal)} tutarındaki iptalde sebep girilmemiş. Sebepsiz iptal, kaçağın en sık gizlendiği yerdir.
                </div>
              )}
              <BaslikSatiri>
                <span style={{ flex: 1, minWidth: 0 }}>Ürün</span>
                <span style={{ width: 40, textAlign: "right" }}>Adet</span>
                <span style={{ width: 78, textAlign: "right" }}>Tutar</span>
              </BaslikSatiri>
              {kacaklar.map((k) => (
                <div key={k.key} style={{ padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <Etiket renk={k.durum === "void" ? "var(--danger)" : "var(--gold-text)"} solda>{k.durum === "void" ? "İptal" : "İkram"}</Etiket>
                      {k.ad}
                    </span>
                    <span className="tnum" style={{ width: 40, textAlign: "right", color: "var(--muted)" }}>{k.adet}</span>
                    <span className="tnum" style={{ width: 78, textAlign: "right", fontWeight: 600, color: k.durum === "void" ? "var(--danger)" : "var(--ink)" }}>{money(k.tutar)}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 2 }}>
                    {k.sebep ?? (k.durum === "void" ? "Sebep girilmemiş" : "Sebep yok")}
                    {k.kisi ? ` · ${k.kisi}` : " · kişi kaydı yok"}
                  </div>
                </div>
              ))}
              <Not>
                Bu dönemde açılan kalemler sayılır. İptal ve ikram, satılmış gibi görünüp kasaya girmeyen tutarlardır —
                aynı kişide ya da aynı üründe yığılma varsa incelenmelidir.
              </Not>
            </>
          )}
        </Kolon>

        {/* 2, 3, 5 — PERSONEL · SAATLİK · ÖDEME */}
        <Kolon flex={1.1} minWidth={280} baslik="3 · Personel, saat ve ödeme" alt={enYogunSaat ? `En yoğun saat ${String(enYogunSaat.saat).padStart(2, "0")}:00` : "Dönem dağılımı"}>
          {/* 2 — Personel satışı (işletme ayarı kapalıysa hiç gösterilmez) */}
          {karsilastirmaAcik && (
            <>
              <MiniBaslik>Personel satışı</MiniBaslik>
              {personeller.length === 0 ? (
                <Bos>Bu dönemde personele bağlanmış satış yok.</Bos>
              ) : (
                <>
                  <BaslikSatiri>
                    <span style={{ flex: 1, minWidth: 0 }}>Kişi</span>
                    <span style={{ width: 74, textAlign: "right" }}>Satışı</span>
                    <span style={{ width: 40, textAlign: "right" }}>Masa</span>
                    <span style={{ width: 74, textAlign: "right" }}>Ort. adisyon</span>
                  </BaslikSatiri>
                  {personeller.map((p) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: 12.5 }}>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.ad}
                        {p.rol && <span style={{ color: "var(--muted-2)", fontSize: 11 }}> · {roleLabel(p.rol)}</span>}
                      </span>
                      <span className="tnum" style={{ width: 74, textAlign: "right", fontWeight: 600 }}>{money(p.satis)}</span>
                      <span className="tnum" style={{ width: 40, textAlign: "right", color: "var(--muted)" }}>{p.kapatilan}</span>
                      <span className="tnum" style={{ width: 74, textAlign: "right", color: "var(--muted)" }}>
                        {p.kapatilan > 0 ? money(p.kapatilanCiro / p.kapatilan) : "—"}
                      </span>
                    </div>
                  ))}
                  <Not>
                    &quot;Satışı&quot; kişinin mutfağa gönderdiği kalemlerin toplamı, &quot;Masa&quot; ve &quot;Ort. adisyon&quot; ise
                    hesabı kapatan kişiye göre hesaplanır.
                  </Not>
                </>
              )}
            </>
          )}
          {!karsilastirmaAcik && (
            <div style={{ fontSize: 11.5, color: "var(--muted-2)", padding: "2px 0 8px", lineHeight: 1.5 }}>
              Personel karşılaştırma raporu Ayarlar&apos;dan kapalı — kişi bazlı satış tablosu gösterilmiyor.
            </div>
          )}

          {/* 3 — Saatlik yoğunluk */}
          <MiniBaslik>Saatlik yoğunluk</MiniBaslik>
          {saatlik.length === 0 ? (
            <Bos>Bu dönemde kapanan hesap yok.</Bos>
          ) : (
            <>
              {saatlik.map((r) => (
                <div key={r.saat} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--line)", fontSize: 12.5 }}>
                  <span className="tnum" style={{ width: 42, color: "var(--muted)" }}>{String(r.saat).padStart(2, "0")}:00</span>
                  <span style={{ flex: 1, minWidth: 20, height: 8, background: "var(--recede)", borderRadius: 4, overflow: "hidden" }}>
                    <span style={{ display: "block", width: `${Math.max(3, (r.ciro / saatMax) * 100)}%`, height: "100%", background: "var(--brand)", borderRadius: 4 }} />
                  </span>
                  <span className="tnum" style={{ width: 34, textAlign: "right", color: "var(--muted-2)", fontSize: 11.5 }}>{r.adisyon}</span>
                  <span className="tnum" style={{ width: 76, textAlign: "right" }}>{money(r.ciro)}</span>
                </div>
              ))}
              <Not>Hesabın kapandığı saate göre. Ortadaki sayı o saatte kapanan adisyon adedidir.</Not>
            </>
          )}

          {/* 5 — Ödeme türü dağılımı */}
          <MiniBaslik>Ödeme türü dağılımı</MiniBaslik>
          {odemeler.satirlar.length === 0 ? (
            <Bos>Bu dönemde ödeme kaydı yok.</Bos>
          ) : (
            <>
              {odemeler.satirlar.map((o) => (
                <div key={o.method} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid var(--line)", fontSize: 12.5 }}>
                  <span style={{ width: 82, color: "var(--muted)" }}>{odemeLabel(o.method)}</span>
                  <span style={{ flex: 1, minWidth: 20, height: 8, background: "var(--recede)", borderRadius: 4, overflow: "hidden" }}>
                    <span style={{ display: "block", width: `${Math.max(3, o.oran)}%`, height: "100%", background: "var(--ink-green)", borderRadius: 4 }} />
                  </span>
                  <span className="tnum" style={{ width: 44, textAlign: "right", color: "var(--muted)" }}>{yuzde(o.oran)}</span>
                  <span className="tnum" style={{ width: 76, textAlign: "right", fontWeight: 600 }}>{money(o.tutar)}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: 12.5 }}>
                <span style={{ color: "var(--muted)" }}>Toplam tahsilat</span>
                <span className="tnum" style={{ fontWeight: 700, color: "var(--ink-green)" }}>{money(odemeler.toplam)}</span>
              </div>
              {Math.abs(odemeler.toplam - ciro) > 1 && (
                <Not>
                  Tahsilat toplamı ile ciro arasında {money(Math.abs(odemeler.toplam - ciro))} fark var — dönem sınırında
                  kapanan/ödemesi ayrı güne düşen adisyonlar bunun normal sebebidir.
                </Not>
              )}
            </>
          )}
        </Kolon>
      </div>

      {yukleniyor && (
        <div style={{ fontSize: 12, color: "var(--muted-2)", paddingTop: 8, flexShrink: 0 }}>Yükleniyor…</div>
      )}
    </div>
  );
}

function Kolon({ flex, minWidth, baslik, alt, vurgu, children }: {
  flex: number; minWidth: number; baslik: string; alt?: string; vurgu?: boolean; children: React.ReactNode;
}) {
  return (
    <div style={{
      flex, minWidth, background: "var(--card)", borderRadius: 16, padding: 18,
      border: `1px solid ${vurgu ? "var(--gold)" : "var(--line)"}`,
      display: "flex", flexDirection: "column", minHeight: 0,
    }}>
      <div style={{ flexShrink: 0, marginBottom: 10 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "var(--muted)" }}>{baslik}</div>
        {alt && <div style={{ fontSize: 12, color: vurgu ? "var(--gold-text)" : "var(--muted-2)", marginTop: 3 }}>{alt}</div>}
      </div>
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>{children}</div>
    </div>
  );
}

function BaslikSatiri({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted-2)", padding: "0 0 6px", borderBottom: "1px solid var(--line)" }}>
      {children}
    </div>
  );
}

function MiniBaslik({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ink-green)", margin: "14px 0 5px" }}>{children}</div>;
}

function Bos({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12.5, color: "var(--muted-2)", padding: "8px 0" }}>{children}</div>;
}

function Not({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 10, lineHeight: 1.5 }}>{children}</div>;
}

function Etiket({ children, renk, solda }: { children: React.ReactNode; renk: string; solda?: boolean }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, color: renk, border: `1px solid ${renk}`, borderRadius: 980,
      padding: "1px 6px", marginLeft: solda ? 0 : 6, marginRight: solda ? 6 : 0, whiteSpace: "nowrap",
    }}>
      {children}
    </span>
  );
}

function Kiyas({ etiket, simdi, onceki, cur, prev }: { etiket: string; simdi: string; onceki: string; cur: number; prev: number }) {
  const varDegisim = prev > 0;
  const p = varDegisim ? ((cur - prev) / prev) * 100 : 0;
  const artis = p >= 0;
  return (
    <div style={{ flex: 1, minWidth: 140, borderLeft: "1px solid var(--line)", paddingLeft: 14 }}>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{etiket}</div>
      <div className="tnum" style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.4px", color: "var(--ink-green)", marginTop: 2 }}>{simdi}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
        {varDegisim ? (
          <>
            {artis ? <TrendingUp size={13} color="var(--brand)" /> : <TrendingDown size={13} color="var(--danger)" />}
            <span className="tnum" style={{ fontSize: 12.5, fontWeight: 600, color: artis ? "var(--brand)" : "var(--danger)" }}>
              {yuzde(Math.abs(p))}
            </span>
            <span style={{ fontSize: 11.5, color: "var(--muted-2)" }}>önceki {onceki}</span>
          </>
        ) : (
          <span style={{ fontSize: 11.5, color: "var(--muted-2)" }}>önceki dönemde veri yok</span>
        )}
      </div>
    </div>
  );
}

const dateInp: React.CSSProperties = {
  border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 10px", fontSize: 13,
  background: "var(--card)", color: "var(--ink)", outline: "none",
};
