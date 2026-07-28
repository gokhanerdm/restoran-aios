"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getMyRestaurantId } from "@/lib/supabase/restaurant";
import { AlertTriangle, CheckCircle2, Plus } from "lucide-react";

// Kasa — adisyon kapandıktan SONRAKİ her şey: günün parası, nakit giriş/çıkış,
// sayım, gün kapatma (ROADMAP H; Gökhan kararı 2026-07-27 ile "Gün Sonu"ndan dönüştü).
// İki soru: 1) Bugün gerçekte ne kazandık? 2) Kasada/operasyonda/stokta açık var mı?
// Sonunda tek hüküm: "Gün güvenle kapatılabilir" ya da eksiklerin listesi.
//
// Ürün kârlılığı analizi bilerek burada DEĞİL — dönemsel raporların tamamı Raporlar'da
// toplandı, aynı şeyin iki yerde durmaması için.

type ClosedOrder = { id: string; total_amount: number; party_size: number; channel: string };
type Item = { id: string; quantity: number; unit_price: number; status: string; menu_item_id: string; menu_items: { name: string; vat_rate: number } | null };
type Discount = { amount: number; order_item_id: string | null };
type Payment = { amount: number; method: string };
type CashMove = { id: string; movement_type: string; amount: number; note: string | null };
type Closure = { expected_cash: number; counted_cash: number; difference: number };
type OpenTable = { name: string; status: string };
type Settings = { default_variable_cost_per_cover: number; default_fixed_cost_share_percent: number };
// Hakediş — kartla/yemek kartıyla çekilen para anında kasaya girmez; komisyon düşülüp
// valör kadar gün sonra bankaya yatar. "Yolda" olan bu paranın takibi.
type Settlement = {
  provider_id: string; provider_name: string; method: string;
  commission_rate: number; settlement_days: number;
  day_gross: number; day_net: number; day_due_date: string | null;
  expected_net_total: number; received_total: number; outstanding: number; overdue: number;
};
type Receipt = { id: string; provider_id: string; amount: number; note: string | null };

const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;
const bugunIstanbul = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const gunSiniri = (gun: string) => {
  const start = `${gun}T00:00:00+03:00`;
  const d = new Date(`${gun}T12:00:00+03:00`);
  d.setDate(d.getDate() + 1);
  const end = `${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d)}T00:00:00+03:00`;
  return { start, end };
};

export default function Kasa() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [tarih, setTarih] = useState("");
  const [closedOrders, setClosedOrders] = useState<ClosedOrder[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [recipeCost, setRecipeCost] = useState<Record<string, number>>({});
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [cashMoves, setCashMoves] = useState<CashMove[]>([]);
  const [devir, setDevir] = useState(0);
  const [closure, setClosure] = useState<Closure | null>(null);
  const [openTables, setOpenTables] = useState<OpenTable[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [kritikSayisi, setKritikSayisi] = useState(0);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [rcFor, setRcFor] = useState<string | null>(null);
  const [rcAmount, setRcAmount] = useState("");

  const [closeStep, setCloseStep] = useState(false);
  const [countedInput, setCountedInput] = useState("");
  const [cmType, setCmType] = useState<"cikis" | "giris">("cikis");
  const [cmAmount, setCmAmount] = useState("");
  const [cmNote, setCmNote] = useState("");
  const [addingCm, setAddingCm] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setTarih(bugunIstanbul()); }, []);

  const load = useCallback(async () => {
    if (!tarih) return;
    const restId = await getMyRestaurantId();
    if (!restId) return;
    setRestaurantId(restId);
    const { start, end } = gunSiniri(tarih);

    const [{ data: ords }, { data: st }, { data: rec }, { data: pays }, { data: cms }, { data: cls }, { data: prevCls }, { data: opens }, { data: usage }, { data: setl }, { data: rcps }] = await Promise.all([
      supabase.from("orders").select("id, total_amount, party_size, channel").eq("restaurant_id", restId).eq("status", "closed").gte("closed_at", start).lt("closed_at", end),
      supabase.from("restaurant_settings").select("default_variable_cost_per_cover, default_fixed_cost_share_percent").eq("restaurant_id", restId).maybeSingle(),
      supabase.from("recipe_items").select("menu_item_id, quantity, ingredients(current_unit_cost)").eq("restaurant_id", restId),
      supabase.from("order_payments").select("amount, method").eq("restaurant_id", restId).gte("paid_at", start).lt("paid_at", end),
      supabase.from("cash_movements").select("id, movement_type, amount, note").eq("restaurant_id", restId).gte("occurred_at", start).lt("occurred_at", end).order("occurred_at"),
      supabase.from("day_closures").select("expected_cash, counted_cash, difference").eq("restaurant_id", restId).eq("closure_date", tarih).maybeSingle(),
      supabase.from("day_closures").select("counted_cash").eq("restaurant_id", restId).lt("closure_date", tarih).order("closure_date", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("restaurant_tables").select("name, status").eq("restaurant_id", restId).is("deleted_at", null).neq("status", "empty").neq("status", "reserved"),
      supabase.rpc("ingredient_expected_usage", { p_restaurant: restId, p_days_ahead: 7 }),
      supabase.rpc("settlement_status", { p_restaurant: restId, p_day: tarih }),
      supabase.from("settlement_receipts").select("id, provider_id, amount, note").eq("restaurant_id", restId).eq("received_date", tarih),
    ]);

    const orderRows = (ords as ClosedOrder[]) ?? [];
    setClosedOrders(orderRows);
    setSettings((st as Settings) ?? null);
    setPayments((pays as Payment[]) ?? []);
    setCashMoves((cms as CashMove[]) ?? []);
    setClosure((cls as Closure) ?? null);
    setDevir(Number((prevCls as { counted_cash: number } | null)?.counted_cash ?? 0));
    setOpenTables((opens as OpenTable[]) ?? []);
    setKritikSayisi(((usage as { par_level: number; current_stock: number }[]) ?? []).filter((u) => u.par_level > 0 && u.current_stock <= u.par_level).length);
    setSettlements((setl as Settlement[]) ?? []);
    setReceipts((rcps as Receipt[]) ?? []);

    const costMap: Record<string, number> = {};
    ((rec as unknown as { menu_item_id: string; quantity: number; ingredients: { current_unit_cost: number } | null }[]) ?? []).forEach((r) => {
      costMap[r.menu_item_id] = (costMap[r.menu_item_id] ?? 0) + r.quantity * Number(r.ingredients?.current_unit_cost ?? 0);
    });
    setRecipeCost(costMap);

    const ids = orderRows.map((o) => o.id);
    if (ids.length > 0) {
      const [{ data: its }, { data: dcs }] = await Promise.all([
        supabase.from("order_items").select("id, quantity, unit_price, status, menu_item_id, menu_items(name, vat_rate)").in("order_id", ids),
        supabase.from("order_discounts").select("amount, order_item_id").in("order_id", ids),
      ]);
      setItems((its as unknown as Item[]) ?? []);
      setDiscounts((dcs as Discount[]) ?? []);
    } else {
      setItems([]); setDiscounts([]);
    }
  }, [tarih]);

  useEffect(() => { load(); }, [load]);

  // ---- SORU 1: Gerçek kâr ----
  const aktifler = items.filter((i) => i.status === "active");
  const ikramlar = items.filter((i) => i.status === "ikram");
  const iptaller = items.filter((i) => i.status === "void");
  const brut = aktifler.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const indirimToplam = discounts.reduce((s, d) => s + Number(d.amount), 0);
  const ciro = closedOrders.reduce((s, o) => s + Number(o.total_amount), 0); // indirim düşülmüş (close_order)
  const netExVatBrut = aktifler.reduce((s, i) => s + (i.quantity * i.unit_price) / (1 + Number(i.menu_items?.vat_rate ?? 0) / 100), 0);
  const indirimOrani = brut > 0 ? ciro / brut : 1;
  const netSatis = netExVatBrut * indirimOrani; // indirim, KDV hariç tabana oransal yansıtılır (yaklaşık)
  const receteMaliyeti = [...aktifler, ...ikramlar].reduce((s, i) => s + i.quantity * (recipeCost[i.menu_item_id] ?? 0), 0);
  const toplamKisi = closedOrders.reduce((s, o) => s + o.party_size, 0);
  const sarf = (settings?.default_variable_cost_per_cover ?? 0) * toplamKisi;
  const sabit = netSatis * ((settings?.default_fixed_cost_share_percent ?? 0) / 100);
  const ikramBedeli = ikramlar.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const iptalBedeli = iptaller.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  // Personel yemeği ayrı bir gider kalemi (ROADMAP §L(E)): mutfaktan çıktı, stoktan düştü,
  // ama müşteriye satılmadı. Bilerek receteMaliyeti'ne KATILMIYOR — o rakam food cost
  // yüzdesini besliyor; personel yemeğini oraya koymak menünün maliyetini olduğundan
  // yüksek gösterir. Kârdan ise düşülür, çünkü gerçek bir gider.
  const personeller = items.filter((i) => i.status === "personel");
  const personelYemegi = personeller.reduce((s, i) => s + i.quantity * (recipeCost[i.menu_item_id] ?? 0), 0);
  const kar = netSatis - receteMaliyeti - sarf - sabit - personelYemegi;
  const marj = netSatis > 0 ? (kar / netSatis) * 100 : 0;

  // ---- SORU 2: Ürünler ----
  type UrunSatir = { name: string; adet: number; satis: number; netEx: number; maliyet: number; indirim: number; kar: number; foodCost: number | null; receteVar: boolean };
  const urunMap: Record<string, UrunSatir> = {};
  const itemToMenu: Record<string, string> = {};
  aktifler.forEach((i) => {
    const key = i.menu_item_id;
    itemToMenu[i.id] = key;
    const u = (urunMap[key] ??= { name: i.menu_items?.name ?? "?", adet: 0, satis: 0, netEx: 0, maliyet: 0, indirim: 0, kar: 0, foodCost: null, receteVar: recipeCost[key] != null });
    u.adet += i.quantity;
    u.satis += i.quantity * i.unit_price;
    u.netEx += (i.quantity * i.unit_price) / (1 + Number(i.menu_items?.vat_rate ?? 0) / 100);
    u.maliyet += i.quantity * (recipeCost[key] ?? 0);
  });
  // İndirimleri ürünlere yansıt: kalem indirimi kendi ürününe, adisyon indirimi ciro payına göre dağıtılır
  // (böylece ürün kârları toplamı genel kârla tutarlı kalır).
  discounts.forEach((d) => {
    const menuId = d.order_item_id ? itemToMenu[d.order_item_id] : null;
    if (menuId && urunMap[menuId]) {
      urunMap[menuId].indirim += Number(d.amount);
    } else {
      Object.values(urunMap).forEach((u) => { if (brut > 0) u.indirim += Number(d.amount) * (u.satis / brut); });
    }
  });
  const urunler = Object.values(urunMap).map((u) => {
    // İndirim KDV'li tutardan yapılır; KDV hariç tabana ürünün kendi oranıyla çevrilir
    const indirimEx = u.satis > 0 ? u.indirim * (u.netEx / u.satis) : 0;
    const netExIndirimli = u.netEx - indirimEx;
    return {
      ...u, kar: netExIndirimli - u.maliyet,
      foodCost: u.receteVar && netExIndirimli > 0 ? (u.maliyet / netExIndirimli) * 100 : null,
    };
  });
  // Ürün listesi burada yalnızca "reçetesiz satıldı" uyarısı için duruyor — o uyarı kâr
  // hesabının güvenilirliğini etkilediği için gün kapatma hükmüne giriyor. Sıralı analiz
  // (en çok kazandıran, zarar ettiren, food cost) Raporlar sayfasında.
  const recetesizSatilan = urunler.filter((u) => !u.receteVar);

  // ---- SORU 3: Kasa & operasyon ----
  const nakitSatis = payments.filter((p) => p.method === "nakit").reduce((s, p) => s + Number(p.amount), 0);
  const kartSatis = payments.filter((p) => p.method !== "nakit").reduce((s, p) => s + Number(p.amount), 0);
  const girisler = cashMoves.filter((m) => m.movement_type === "giris").reduce((s, m) => s + Number(m.amount), 0);
  const cikislar = cashMoves.filter((m) => m.movement_type === "cikis").reduce((s, m) => s + Number(m.amount), 0);
  const beklenenNakit = devir + nakitSatis + girisler - cikislar;
  const acikMasalar = openTables;
  const hesapIsteyen = openTables.filter((t) => t.status === "bill_requested");

  // ---- SORU 4: Yoldaki para ----
  // Kartla çekilen para bugün kasaya girmez: komisyon düşülür, valör kadar gün sonra yatar.
  // "Gecikmiş" = valörü dolmuş ama hâlâ hesaba geçmemiş tutar; asıl alarm bu.
  const yoldaToplam = settlements.reduce((s, x) => s + Number(x.outstanding), 0);
  const gecikmisToplam = settlements.reduce((s, x) => s + Number(x.overdue), 0);
  const gecikenler = settlements.filter((x) => Number(x.overdue) > 0.01);
  const gunlukHakedis = settlements.filter((x) => Number(x.day_gross) > 0.01);
  const bugunKomisyon = gunlukHakedis.reduce((s, x) => s + (Number(x.day_gross) - Number(x.day_net)), 0);

  // ---- Hüküm ----
  const sorunlar: string[] = [];
  if (!closure) sorunlar.push("Kasa sayımı girilmedi");
  if (gecikmisToplam > 0.01) sorunlar.push(`${money(gecikmisToplam)} hakediş gecikti (${gecikenler.map((g) => g.provider_name).join(", ")})`);
  if (acikMasalar.length > 0) sorunlar.push(`${acikMasalar.length} masa hâlâ açık (${acikMasalar.map((t) => t.name).join(", ")})`);
  if (hesapIsteyen.length > 0) sorunlar.push(`${hesapIsteyen.length} masa hesap istedi, kapanmadı`);
  if (closure && Number(closure.difference) !== 0) sorunlar.push(`Kasada ${money(Math.abs(Number(closure.difference)))} ${Number(closure.difference) < 0 ? "eksik" : "fazla"}`);
  if (recetesizSatilan.length > 0) sorunlar.push(`${recetesizSatilan.length} üründe reçete eksik — kâr hesabı bu ürünlerde güvenilmez`);
  const bugun = tarih === bugunIstanbul();

  const addCashMove = async () => {
    if (!restaurantId) return;
    setErr(null);
    const amount = parseFloat(cmAmount.replace(",", ".")) || 0;
    if (amount <= 0) return;
    const { error } = await supabase.from("cash_movements").insert({ restaurant_id: restaurantId, movement_type: cmType, amount, note: cmNote || null });
    if (error) { setErr(error.message); return; }
    setCmAmount(""); setCmNote(""); setAddingCm(false);
    await load();
  };

  // Ekstreye bakıp "bugün bu sağlayıcıdan şu kadar yattı" girilir; sistem beklenenle kıyaslar.
  const addReceipt = async (providerId: string) => {
    if (!restaurantId) return;
    setErr(null);
    const amount = parseFloat(rcAmount.replace(",", ".")) || 0;
    if (amount <= 0) return;
    const { error } = await supabase.from("settlement_receipts").insert({
      restaurant_id: restaurantId, provider_id: providerId, received_date: tarih, amount,
    });
    if (error) { setErr(error.message); return; }
    setRcAmount(""); setRcFor(null);
    await load();
  };

  const closeDay = async () => {
    if (!restaurantId) return;
    setErr(null);
    const counted = parseFloat(countedInput.replace(",", ".")) || 0;
    const { error } = await supabase.from("day_closures").upsert({
      restaurant_id: restaurantId, closure_date: tarih,
      expected_cash: Math.round(beklenenNakit * 100) / 100,
      counted_cash: counted,
      difference: Math.round((counted - beklenenNakit) * 100) / 100,
    }, { onConflict: "restaurant_id,closure_date" });
    if (error) { setErr(error.message); return; }
    setCloseStep(false); setCountedInput("");
    await load();
  };

  return (
    <div style={{ padding: "26px 28px", height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 14, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>Kasa</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 7 }}>{closedOrders.length} adisyon · {toplamKisi} müşteri</div>
        </div>
        <input type="date" value={tarih} onChange={(e) => setTarih(e.target.value)} style={{ border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 12px", fontSize: 13.5, background: "var(--card)", color: "var(--ink)", outline: "none" }} />
      </div>

      {/* HÜKÜM BANDI */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderRadius: 14, marginBottom: 14, flexShrink: 0,
        background: closure && sorunlar.length === 0 ? "var(--card)" : sorunlar.length > 0 ? "var(--danger-bg)" : "var(--recede)",
        border: `1px solid ${closure && sorunlar.length === 0 ? "var(--brand)" : sorunlar.length > 0 ? "var(--gold)" : "var(--line)"}`,
      }}>
        {closure && sorunlar.length === 0
          ? <CheckCircle2 size={20} color="var(--brand)" style={{ flexShrink: 0 }} />
          : <AlertTriangle size={20} color="var(--gold-text)" style={{ flexShrink: 0 }} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, color: sorunlar.length === 0 ? "var(--ink-green)" : "var(--gold-text)" }}>
            {sorunlar.length === 0 ? "Kasa tutuyor, açık masa yok — gün güvenle kapatıldı." : sorunlar.join(" · ")}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
            Bugün kasaya {money(ciro)} girdi{netSatis > 0 ? ` — bunun ${money(Math.max(0, kar))}'si gerçekten kâr (%${marj.toFixed(1)})` : ""}.
          </div>
        </div>
        {bugun && !closeStep && (
          <button onClick={() => { setCloseStep(true); setCountedInput(closure ? String(Number(closure.counted_cash)) : ""); }} style={closure ? btnSecondary : btnPrimary}>
            {closure ? "Sayımı düzelt" : "Günü kapat"}
          </button>
        )}
        {closeStep && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <input value={countedInput} onChange={(e) => setCountedInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && closeDay()} placeholder={`Sayılan nakit (beklenen ${money(beklenenNakit)})`} inputMode="decimal" autoFocus style={{ ...inp, width: 230 }} />
            <button onClick={closeDay} style={btnPrimary}>Kaydet</button>
            <button onClick={() => setCloseStep(false)} style={btnSecondary}>Vazgeç</button>
          </div>
        )}
      </div>
      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10, flexShrink: 0 }}>Kaydedilemedi: {err}</div>}

      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
        {/* SORU 1 — Gerçek kâr */}
        <div style={{ flex: 1, minWidth: 250, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <SectionLabel>1 · Gerçek kâr</SectionLabel>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            <Satir l="Toplam ciro (indirimli)" v={money(ciro)} />
            <Satir l="KDV hariç net satış" v={money(netSatis)} />
            <Satir l="Reçete maliyeti" v={`−${money(receteMaliyeti)}`} />
            <Satir l="Sarf maliyeti (kişi başı varsayılan)" v={`−${money(sarf)}`} />
            <Satir l="Sabit gider payı (varsayılan %)" v={`−${money(sabit)}`} />
            <Satir l="İndirimler" v={indirimToplam > 0 ? `−${money(indirimToplam)}` : "—"} muted={indirimToplam === 0} />
            <Satir l="İkramlar (bedeli)" v={ikramBedeli > 0 ? money(ikramBedeli) : "—"} muted={ikramBedeli === 0} />
            <Satir l="Personel yemeği (maliyet)" v={personelYemegi > 0 ? `−${money(personelYemegi)}` : "—"} muted={personelYemegi === 0} />
            <Satir l="İptaller (bedeli)" v={iptalBedeli > 0 ? money(iptalBedeli) : "—"} muted={iptalBedeli === 0} />
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 6, paddingTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>Tahmini operasyon kârı</span>
                <span className="tnum" style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.6px", color: kar >= 0 ? "var(--brand)" : "var(--danger)" }}>{money(kar)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Kâr marjı</span>
                <span className="tnum" style={{ fontSize: 13.5, fontWeight: 600 }}>%{marj.toFixed(1)}</span>
              </div>
            </div>
            <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 10, lineHeight: 1.5 }}>
              Sarf ve sabit gider, Ayarlar'daki varsayılanlardan yaklaşık hesaplanır. İkram gelire sayılmaz ama maliyeti reçete maliyetine dahildir.
            </div>
          </div>
        </div>

        {/* SORU 2 — Açıklar */}
        <div style={{ flex: 1.1, minWidth: 270, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <SectionLabel>2 · Açık / risk var mı?</SectionLabel>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            <MiniBaslik>Kasa</MiniBaslik>
            <Satir l="Devir (önceki kapanış)" v={money(devir)} />
            <Satir l="Nakit satış" v={money(nakitSatis)} />
            <Satir l="Kart / yemek kartı" v={money(kartSatis)} />
            <Satir l="Nakit girişler" v={girisler > 0 ? money(girisler) : "—"} muted={girisler === 0} />
            <Satir l="Nakit çıkışlar" v={cikislar > 0 ? `−${money(cikislar)}` : "—"} muted={cikislar === 0} />
            <Satir l="Beklenen kasa" v={money(beklenenNakit)} strong />
            {closure && <Satir l="Sayılan kasa" v={money(Number(closure.counted_cash))} strong />}
            {closure && <Satir l="Fark" v={Number(closure.difference) === 0 ? "0 ₺ — tutuyor" : money(Number(closure.difference))} strong renk={Number(closure.difference) === 0 ? "var(--brand)" : "var(--danger)"} />}

            {cashMoves.length > 0 && (
              <div style={{ margin: "6px 0" }}>
                {cashMoves.map((m) => (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", padding: "3px 0" }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.movement_type === "cikis" ? "Çıkış" : "Giriş"}{m.note ? ` — ${m.note}` : ""}</span>
                    <span className="tnum">{m.movement_type === "cikis" ? "−" : "+"}{money(Number(m.amount))}</span>
                  </div>
                ))}
              </div>
            )}
            {!addingCm ? (
              <button onClick={() => setAddingCm(true)} style={{ all: "unset", cursor: "pointer", fontSize: 12.5, color: "var(--brand)", display: "flex", alignItems: "center", gap: 4, padding: "4px 0 10px" }}><Plus size={13} /> Nakit giriş/çıkış ekle</button>
            ) : (
              <div style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 10, margin: "4px 0 10px" }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                  {([["cikis", "Çıkış"], ["giris", "Giriş"]] as const).map(([v, l]) => (
                    <button key={v} onClick={() => setCmType(v)} style={{ border: "none", borderRadius: 980, padding: "5px 12px", fontSize: 12, background: cmType === v ? "var(--ink-green)" : "var(--recede)", color: cmType === v ? "#fff" : "var(--muted)" }}>{l}</button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input value={cmAmount} onChange={(e) => setCmAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCashMove()} placeholder="Tutar ₺" inputMode="decimal" autoFocus style={{ ...inp, width: 90 }} />
                  <input value={cmNote} onChange={(e) => setCmNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCashMove()} placeholder="Açıklama (manav ödemesi)" style={{ ...inp, flex: 1, minWidth: 0 }} />
                  <button onClick={addCashMove} style={btnSmall}>Ekle</button>
                </div>
              </div>
            )}

            <MiniBaslik>Operasyon</MiniBaslik>
            <Satir l="Açık masa" v={acikMasalar.length > 0 ? `${acikMasalar.length} (${acikMasalar.map((t) => t.name).join(", ")})` : "yok"} renk={acikMasalar.length > 0 ? "var(--gold-text)" : undefined} />
            <Satir l="Hesap istedi, kapanmadı" v={hesapIsteyen.length > 0 ? String(hesapIsteyen.length) : "yok"} renk={hesapIsteyen.length > 0 ? "var(--gold-text)" : undefined} />
            <Satir l="İkram / iptal kalemi" v={`${ikramlar.length} / ${iptaller.length}`} />

            <MiniBaslik>Stok</MiniBaslik>
            <Satir l="Kritik stok" v={kritikSayisi > 0 ? `${kritikSayisi} kalem` : "yok"} renk={kritikSayisi > 0 ? "var(--gold-text)" : undefined} />
            <div style={{ fontSize: 11.5, color: "var(--muted-2)", padding: "6px 0", lineHeight: 1.5 }}>
              Teorik tüketim vs sayım farkı (fire/kaçak radarı) — sayım ekranıyla birlikte gelecek (Faz 3).<br />
              Mutfakta bekleyen sipariş — mutfak ekranıyla birlikte (Faz 1). Onay bekleyen işlemler — yetki sistemiyle (Faz 2).
            </div>
          </div>
        </div>

        {/* SORU 4 — Yoldaki para (hakediş mutabakatı) */}
        <div style={{ flex: 1, minWidth: 260, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <SectionLabel>3 · Yoldaki para</SectionLabel>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 2 }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>Bankaya yatmayı bekleyen</span>
              <span className="tnum" style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.6px", color: "var(--ink-green)" }}>{money(yoldaToplam)}</span>
            </div>
            {gecikmisToplam > 0.01 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--danger)", fontWeight: 600, marginBottom: 4 }}>
                <span>Valörü geçti, hâlâ yatmadı</span>
                <span className="tnum">{money(gecikmisToplam)}</span>
              </div>
            )}

            <MiniBaslik>Bugün çekilen</MiniBaslik>
            {gunlukHakedis.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--muted-2)", padding: "4px 0" }}>Bugün kart/yemek kartı çekimi yok.</div>
            ) : (
              <>
                {gunlukHakedis.map((s) => (
                  <div key={s.provider_id} style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: "var(--ink)" }}>{s.provider_name}</span>
                      <span className="tnum" style={{ fontWeight: 600 }}>{money(Number(s.day_net))}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--muted-2)", marginTop: 1 }}>
                      <span>{money(Number(s.day_gross))} çekildi · %{Number(s.commission_rate)} komisyon</span>
                      <span>{s.day_due_date ? `${s.day_due_date.slice(8, 10)}.${s.day_due_date.slice(5, 7)} yatar` : ""}</span>
                    </div>
                  </div>
                ))}
                <Satir l="Bugünün komisyon gideri" v={`−${money(bugunKomisyon)}`} renk="var(--gold-text)" />
              </>
            )}

            <MiniBaslik>Sağlayıcı bazında</MiniBaslik>
            {settlements.filter((s) => Number(s.outstanding) > 0.01 || Number(s.received_total) > 0.01).length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--muted-2)", padding: "4px 0" }}>Bekleyen hakediş yok.</div>
            ) : settlements.filter((s) => Number(s.outstanding) > 0.01 || Number(s.received_total) > 0.01).map((s) => {
              const gecikti = Number(s.overdue) > 0.01;
              const bugunYatan = receipts.filter((r) => r.provider_id === s.provider_id).reduce((a, r) => a + Number(r.amount), 0);
              return (
                <div key={s.provider_id} style={{ padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: "var(--ink)" }}>{s.provider_name}</span>
                    <span className="tnum" style={{ fontWeight: 600, color: gecikti ? "var(--danger)" : "var(--ink)" }}>{money(Number(s.outstanding))}</span>
                  </div>
                  <div style={{ fontSize: 11.5, color: gecikti ? "var(--danger)" : "var(--muted-2)", marginTop: 1 }}>
                    {gecikti ? `${money(Number(s.overdue))} gecikmiş · ` : ""}
                    toplam beklenen {money(Number(s.expected_net_total))} · yatan {money(Number(s.received_total))}
                  </div>
                  {bugunYatan > 0 && (
                    <div className="tnum" style={{ fontSize: 11.5, color: "var(--brand)", marginTop: 2 }}>Bugün {money(bugunYatan)} yattı</div>
                  )}
                  {rcFor === s.provider_id ? (
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <input value={rcAmount} onChange={(e) => setRcAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addReceipt(s.provider_id)} placeholder="Yatan tutar ₺" inputMode="decimal" autoFocus style={{ ...inp, flex: 1, minWidth: 0 }} />
                      <button onClick={() => addReceipt(s.provider_id)} style={btnSmall}>Kaydet</button>
                      <button onClick={() => { setRcFor(null); setRcAmount(""); }} style={{ all: "unset", cursor: "pointer", fontSize: 12, color: "var(--muted)", padding: "0 4px" }}>Vazgeç</button>
                    </div>
                  ) : (
                    <button onClick={() => { setRcFor(s.provider_id); setRcAmount(""); }} style={{ all: "unset", cursor: "pointer", fontSize: 12, color: "var(--brand)", display: "flex", alignItems: "center", gap: 4, paddingTop: 5 }}><Plus size={12} /> Hesaba yatanı gir</button>
                  )}
                </div>
              );
            })}

            <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 10, lineHeight: 1.5 }}>
              Komisyon ve valör (kaç gün sonra yattığı) sağlayıcı bazında Ayarlar'dan girilir.
              Eşleştirme cari hesap mantığıyla yapılır: para sırayla yattığı için beklenen toplamdan
              yatan toplam düşülür.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10, flexShrink: 0 }}>{children}</div>;
}
function MiniBaslik({ children, uyari }: { children: React.ReactNode; uyari?: boolean }) {
  return <div style={{ fontSize: 12.5, fontWeight: 600, color: uyari ? "var(--gold-text)" : "var(--ink-green)", margin: "10px 0 4px" }}>{children}</div>;
}
function Satir({ l, v, strong, muted, renk }: { l: string; v: string; strong?: boolean; muted?: boolean; renk?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "5px 0", fontSize: 13 }}>
      <span style={{ color: "var(--muted)", minWidth: 0 }}>{l}</span>
      <span className="tnum" style={{ fontWeight: strong ? 700 : 500, color: renk ?? (muted ? "var(--muted-2)" : "var(--ink)"), flexShrink: 0 }}>{v}</span>
    </div>
  );
}
const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 10px", fontSize: 13, background: "var(--card)", color: "var(--ink)", outline: "none" };
const btnPrimary: React.CSSProperties = { border: "none", borderRadius: 980, padding: "10px 18px", background: "var(--brand-strong)", color: "#fff", fontSize: 13.5, fontWeight: 500, flexShrink: 0 };
const btnSecondary: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 16px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13 };
const btnSmall: React.CSSProperties = { border: "none", borderRadius: 10, padding: "8px 12px", background: "var(--ink-green)", color: "#fff", fontSize: 12.5 };
