"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { getMyRestaurantId } from "@/lib/supabase/restaurant";
import { Plus, Trash2 } from "lucide-react";
import EditableText from "../components/EditableText";
import { toTitleTr } from "@/lib/text";

// Ana Sayfa — işletmenin veri merkezi. Başabaş: "bugün X₺ ciro dükkanı çevirir,
// ondan sonraki her 1.000₺'nin ~Y₺'si kâr" (ROADMAP + Gökhan şablonu, 2026-07-10).

type PrepReport = {
  beklenen_musteri: number;
  gecen_hafta_ayni_gun: number;
  resmi_tatil: boolean;
  kritik_stoklar: { malzeme: string; mevcut: number; par_seviye: number }[];
};
type Expense = { id: string; name: string; monthly_amount: number; vat_rate: number };
type Settings = { fixed_cost_days_override: number | null };
// Fire/Kaçak radarı (ROADMAP L, Faz 1): sarf malzemesinde öğrenilen "müşteri başına oran"dan sapma
type RadarRow = {
  ingredient_id: string; ingredient_name: string; unit: string;
  baseline_ratio: number | null; recent_ratio: number | null;
  deviation_percent: number | null; status: "ogreniyor" | "normal" | "sapma";
};

const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;
const bugunIstanbul = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const ayGunSayisi = () => {
  const [y, m] = bugunIstanbul().split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

export default function AnaSayfa() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [prep, setPrep] = useState<PrepReport | null>(null);
  const [openTables, setOpenTables] = useState(0);
  const [openTotal, setOpenTotal] = useState(0);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [foodCostRatio, setFoodCostRatio] = useState<number | null>(null);
  // Dönem kutuları: [gün, hafta, ay, yıl] — ciro/reçete maliyeti/müşteri sayısı
  const [periyot, setPeriyot] = useState<{ ciro: number[]; maliyet: number[]; musteri: number[] } | null>(null);
  const [periyotOdeme, setPeriyotOdeme] = useState<{ nakit: number[]; kk: number[]; yemekKarti: number[] } | null>(null);
  const [topSellers, setTopSellers] = useState<{ name: string; qty: number; revenue: number }[]>([]);
  const [hourly, setHourly] = useState<number[]>([]);
  const [radar, setRadar] = useState<RadarRow[] | null>(null);

  const [expensesOpen, setExpensesOpen] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);
  const [neName, setNeName] = useState("");
  const [neAmount, setNeAmount] = useState("");
  const [neVat, setNeVat] = useState("20");
  const [daysInput, setDaysInput] = useState("");

  const load = useCallback(async () => {
    const restId = await getMyRestaurantId();
    if (!restId) return;
    setRestaurantId(restId);
    const gun = bugunIstanbul();
    const otuzGunOnce = new Date(Date.parse(gun) - 30 * 86400000).toISOString();
    const yediGunOnce = new Date(Date.parse(gun) - 7 * 86400000).toISOString();
    // Dönem başlangıçları (İstanbul günü): bugün, pazartesi, ayın 1'i, 1 Ocak
    const bugunBasiMs = Date.parse(gun + "T00:00:00+03:00");
    const haftaGunu = (new Date(gun + "T00:00:00Z").getUTCDay() + 6) % 7; // 0 = pazartesi
    const haftaBasiMs = bugunBasiMs - haftaGunu * 86400000;
    const ayBasiMs = Date.parse(gun.slice(0, 8) + "01T00:00:00+03:00");
    const yilBasiMs = Date.parse(gun.slice(0, 4) + "-01-01T00:00:00+03:00");

    const [{ data: rep }, { data: tables }, { data: openOrders }, { data: exp }, { data: st }, { data: recipeRows }, { data: closedItems }, { data: yilRows }, { data: radarRows }, { data: paymentRows }] = await Promise.all([
      supabase.rpc("daily_prep_report", { p_restaurant: restId }),
      supabase.from("restaurant_tables").select("status").eq("restaurant_id", restId).is("deleted_at", null),
      supabase.from("orders").select("id, order_items(quantity, unit_price, status)").eq("restaurant_id", restId).eq("status", "open"),
      supabase.from("business_expenses").select("id, name, monthly_amount, vat_rate").eq("restaurant_id", restId).eq("active", true).is("deleted_at", null).order("sort_order"),
      supabase.from("restaurant_settings").select("fixed_cost_days_override").eq("restaurant_id", restId).maybeSingle(),
      supabase.from("recipe_items").select("menu_item_id, quantity, ingredients(current_unit_cost)").eq("restaurant_id", restId),
      supabase.from("orders").select("closed_at, order_items(quantity, unit_price, status, menu_item_id, menu_items(name))").eq("restaurant_id", restId).eq("status", "closed").gte("closed_at", otuzGunOnce),
      supabase.from("orders").select("created_at, closed_at, status, total_amount, party_size, order_items(quantity, status, menu_item_id)").eq("restaurant_id", restId).gte("created_at", new Date(yilBasiMs).toISOString()),
      supabase.rpc("sarf_usage_radar", { p_restaurant: restId }),
      supabase.from("order_payments").select("amount, method, paid_at").eq("restaurant_id", restId).gte("paid_at", new Date(yilBasiMs).toISOString()),
    ]);

    setPrep(rep as PrepReport);
    setRadar((radarRows as RadarRow[]) ?? []);
    setOpenTables((tables ?? []).filter((t: { status: string }) => t.status !== "empty").length);
    const total = (openOrders ?? []).reduce((s: number, o: { order_items: { quantity: number; unit_price: number; status: string }[] }) =>
      s + o.order_items.filter((i) => i.status === "active").reduce((s2, i) => s2 + i.quantity * i.unit_price, 0), 0);
    setOpenTotal(total);
    let expRows = (exp as Expense[]) ?? [];
    // İlk kullanım — hiç gider kalemi girilmemişse, bir işletmede tipik olarak bulunan sabit
    // gider başlıklarını hazır aç (Gökhan kararı, 2026-07-26) — işletmeci sıfırdan eklemek
    // yerine sadece rakamları doldurur.
    if (expRows.length === 0) {
      const varsayilanlar = ["Kira", "Elektrik", "Su", "Doğalgaz", "İnternet/Telefon", "Aidat", "Personel Maaşı", "SGK Primi", "Vergi", "Muhasebe/Mali Müşavir", "Sigorta", "Temizlik"];
      const { data: seeded } = await supabase.from("business_expenses").insert(
        varsayilanlar.map((name, i) => ({ restaurant_id: restId, name, monthly_amount: 0, vat_rate: 20, sort_order: i }))
      ).select("id, name, monthly_amount, vat_rate");
      expRows = (seeded as Expense[]) ?? [];
    }
    setExpenses(expRows);
    setSettings((st as Settings) ?? null);
    setDaysInput(String((st as Settings | null)?.fixed_cost_days_override ?? ayGunSayisi()));

    const recipeCost: Record<string, number> = {};
    ((recipeRows as unknown as { menu_item_id: string; quantity: number; ingredients: { current_unit_cost: number } | null }[]) ?? []).forEach((r) => {
      recipeCost[r.menu_item_id] = (recipeCost[r.menu_item_id] ?? 0) + r.quantity * Number(r.ingredients?.current_unit_cost ?? 0);
    });
    let ciro30 = 0, maliyet30 = 0;
    const satis7: Record<string, { qty: number; revenue: number }> = {};
    ((closedItems as unknown as { closed_at: string; order_items: { quantity: number; unit_price: number; status: string; menu_item_id: string; menu_items: { name: string } | null }[] }[]) ?? []).forEach((o) => {
      o.order_items.filter((i) => i.status === "active").forEach((i) => {
        ciro30 += i.quantity * i.unit_price;
        maliyet30 += i.quantity * (recipeCost[i.menu_item_id] ?? 0);
        if (o.closed_at >= yediGunOnce) {
          const ad = i.menu_items?.name ?? "?";
          const s = (satis7[ad] ??= { qty: 0, revenue: 0 });
          s.qty += i.quantity;
          s.revenue += i.quantity * i.unit_price;
        }
      });
    });
    setFoodCostRatio(ciro30 > 0 ? maliyet30 / ciro30 : null);
    setTopSellers(Object.entries(satis7).map(([name, s]) => ({ name, ...s })).sort((a, b) => b.revenue - a.revenue).slice(0, 5));

    // Dönem kovalarını doldur: ciro/maliyet kapanış anına, müşteri açılış anına göre sayılır
    const sinirlar = [bugunBasiMs, haftaBasiMs, ayBasiMs, yilBasiMs];
    const ciroP = [0, 0, 0, 0], maliyetP = [0, 0, 0, 0], musteriP = [0, 0, 0, 0];
    const saat = new Array(24).fill(0);
    const saatFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Istanbul" });
    ((yilRows as unknown as { created_at: string; closed_at: string | null; status: string; total_amount: number | null; party_size: number | null; order_items: { quantity: number; status: string; menu_item_id: string }[] }[]) ?? []).forEach((o) => {
      if (o.status === "closed" && o.closed_at) {
        const ts = Date.parse(o.closed_at);
        const maliyet = o.order_items.filter((i) => i.status === "active" || i.status === "ikram").reduce((s, i) => s + i.quantity * (recipeCost[i.menu_item_id] ?? 0), 0);
        sinirlar.forEach((b, k) => { if (ts >= b) { ciroP[k] += Number(o.total_amount ?? 0); maliyetP[k] += maliyet; } });
        if (ts >= bugunBasiMs) saat[parseInt(saatFmt.format(new Date(o.closed_at)))] += Number(o.total_amount ?? 0);
      }
      const tc = Date.parse(o.created_at);
      sinirlar.forEach((b, k) => { if (tc >= b) musteriP[k] += o.party_size ?? 0; });
    });
    setPeriyot({ ciro: ciroP, maliyet: maliyetP, musteri: musteriP });
    setHourly(saat);

    // Ödeme türüne göre ciro kırılımı — CİRO satırının altına Nakit/KK/Yemek Kartı satırları.
    const nakitP = [0, 0, 0, 0], kkP = [0, 0, 0, 0], yemekKartiP = [0, 0, 0, 0];
    ((paymentRows as { amount: number; method: string; paid_at: string }[]) ?? []).forEach((p) => {
      const ts = Date.parse(p.paid_at);
      const hedef = p.method === "nakit" ? nakitP : p.method === "kart" ? kkP : yemekKartiP;
      sinirlar.forEach((b, k) => { if (ts >= b) hedef[k] += Number(p.amount); });
    });
    setPeriyotOdeme({ nakit: nakitP, kk: kkP, yemekKarti: yemekKartiP });
  }, []);

  useEffect(() => { load(); }, [load]);

  const kritikSayisi = prep?.kritik_stoklar.length ?? 0;

  const aylikGiderToplam = expenses.reduce((s, e) => s + Number(e.monthly_amount), 0);
  const gunSayisi = settings?.fixed_cost_days_override ?? ayGunSayisi();
  const gunlukSabitGider = gunSayisi > 0 ? aylikGiderToplam / gunSayisi : 0;
  const oran = foodCostRatio ?? 0.30; // geçmiş veri yoksa sektör ortalaması varsayımıyla başlar
  const marjinalKar1000 = (1 - oran) * 1000;
  const saatMax = Math.max(...hourly, 1);

  // Dönem tablosu: [gün, hafta, ay, yıl] + 5. kutu şimdilik boş (Gökhan şablonu, 2026-07-13)
  const bugun = bugunIstanbul();
  const haftaninGunu = (new Date(bugun + "T00:00:00Z").getUTCDay() + 6) % 7;
  const gecenGun = [1, haftaninGunu + 1, parseInt(bugun.slice(8)), Math.round((Date.parse(bugun) - Date.parse(bugun.slice(0, 4) + "-01-01")) / 86400000) + 1];
  const basabasGun = oran < 1 ? gunlukSabitGider / (1 - oran) : 0;
  const basabasArr = [basabasGun, basabasGun * 7, oran < 1 ? aylikGiderToplam / (1 - oran) : 0, oran < 1 ? (aylikGiderToplam * 12) / (1 - oran) : 0];
  // Kârlılık: ciro − reçete maliyeti − o dönemde geçen günlerin sabit gider payı
  const karArr = periyot ? periyot.ciro.map((c, k) => c - periyot.maliyet[k] - gunlukSabitGider * gecenGun[k]) : null;

  const addExpense = async () => {
    if (!restaurantId || !neName.trim()) return;
    const count = expenses.length;
    await supabase.from("business_expenses").insert({ restaurant_id: restaurantId, name: toTitleTr(neName), monthly_amount: parseFloat(neAmount.replace(",", ".")) || 0, vat_rate: parseFloat(neVat.replace(",", ".")) || 0, sort_order: count });
    setNeName(""); setNeAmount(""); setNeVat("20"); setAddingExpense(false);
    await load();
  };
  const renameExpense = async (id: string, name: string) => { await supabase.from("business_expenses").update({ name: toTitleTr(name) }).eq("id", id); await load(); };
  const updateExpenseAmount = async (id: string, amount: string) => { await supabase.from("business_expenses").update({ monthly_amount: parseFloat(amount.replace(",", ".")) || 0 }).eq("id", id); await load(); };
  const updateExpenseVat = async (id: string, vat: string) => { await supabase.from("business_expenses").update({ vat_rate: parseFloat(vat.replace(",", ".")) || 0 }).eq("id", id); await load(); };
  const deleteExpense = async (id: string) => { await supabase.from("business_expenses").update({ deleted_at: new Date().toISOString() }).eq("id", id); await load(); };
  const saveDays = async () => {
    if (!restaurantId) return;
    const n = parseInt(daysInput) || ayGunSayisi();
    const override = n === ayGunSayisi() ? null : n;
    await supabase.from("restaurant_settings").upsert({ restaurant_id: restaurantId, fixed_cost_days_override: override }, { onConflict: "restaurant_id" });
    await load();
  };

  return (
    <div style={{ height: "calc(100vh - 4px)", boxSizing: "border-box", padding: "22px 26px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <Link href="/" style={pill}>Açık masa: <b className="tnum">{openTables}</b> <span className="tnum" style={{ color: "var(--muted)" }}>({money(openTotal)})</span></Link>
        <Link href="/stok" style={{ ...pill, background: kritikSayisi > 0 ? "var(--danger-bg)" : "var(--card)", color: kritikSayisi > 0 ? "var(--danger)" : "var(--ink)" }}>Kritik stok: <b className="tnum">{kritikSayisi}</b></Link>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Bugün · {bugunIstanbul()}</div>
      </div>

      {/* DÖNEM TABLOSU — sol: başabaş/kârlılık, sağ: ciro + ödeme türü kırılımı. Ekran genişliği
          yeterli olduğu için yan yana, iki ayrı mini tablo (Gökhan kararı, 2026-07-26). */}
      <div style={{ flexShrink: 0, display: "flex", gap: 18, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <PeriyotMiniTablo
            rows={[
              { l: "BAŞABAŞ", vals: basabasArr, fmt: (v: number) => money(v), renk: () => "var(--ink)" },
              { l: "KÂRLILIK", vals: karArr, fmt: (v: number) => money(v), renk: (v: number) => (v < 0 ? "var(--danger)" : "var(--brand)") },
            ]}
          />

          {/* GİDERLER AKORDEONU — Başabaş'ın hemen altında, aynı dönem-tablosu stiliyle (satır +
              Gün/Hafta/Ay/Yıl kutuları); başlığa tıklayınca detay listesi akordeon açılır (Gökhan kararı, 2026-07-26) */}
          <div style={{ marginTop: 10 }}>
            <button
              onClick={() => setExpensesOpen((o) => !o)}
              style={{ all: "unset", cursor: "pointer", display: "grid", gridTemplateColumns: "90px repeat(4, 1fr)", gap: 8, width: "100%", boxSizing: "border-box" }}
            >
              <div style={{ ...matrisKutu, background: "var(--recede)", fontWeight: 600, color: "var(--ink-green)", justifyContent: "flex-start", textAlign: "left" }}>
                SABİT GİDER
              </div>
              {[gunlukSabitGider, gunlukSabitGider * 7, aylikGiderToplam, aylikGiderToplam * 12].map((v, k) => (
                <div key={k} className="tnum" style={{ ...matrisKutu, color: "var(--ink)" }}>{money(v)}</div>
              ))}
            </button>
            {expensesOpen && (
              <div style={{ padding: "14px 20px 18px", maxHeight: 260, overflowY: "auto", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, marginTop: 8, boxSizing: "border-box" }}>
                <div style={{ display: "flex", fontSize: 11, color: "var(--muted-2)", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ flex: 1 }}>Gider kalemi</span>
                  <span style={{ width: 110, textAlign: "right" }}>Tutar (KDV dahil)</span>
                  <span style={{ width: 55, textAlign: "right" }}>KDV %</span>
                  <span style={{ width: 90, textAlign: "right" }}>KDV hariç</span>
                  <span style={{ width: 26 }} />
                </div>
                {expenses.map((e) => {
                  const net = e.monthly_amount / (1 + Number(e.vat_rate) / 100);
                  return (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
                    <span style={{ flex: 1 }}><EditableText value={e.name} onSave={(v) => renameExpense(e.id, v)} /></span>
                    <span style={{ width: 110, textAlign: "right" }}>
                      <EditableText value={String(e.monthly_amount)} onSave={(v) => updateExpenseAmount(e.id, v)} style={{ display: "inline-block" }} />
                      <span className="tnum" style={{ color: "var(--muted)" }}> ₺</span>
                    </span>
                    <span style={{ width: 55, textAlign: "right" }}>
                      <EditableText value={String(e.vat_rate)} onSave={(v) => updateExpenseVat(e.id, v)} style={{ display: "inline-block" }} />
                      <span className="tnum" style={{ color: "var(--muted)" }}>%</span>
                    </span>
                    <span className="tnum" style={{ width: 90, textAlign: "right", color: "var(--muted)" }}>{money(net)}</span>
                    <span style={{ width: 26, textAlign: "right" }}>
                      <button onClick={() => deleteExpense(e.id)} aria-label="sil" style={{ all: "unset", cursor: "pointer", color: "var(--muted-2)", display: "inline-flex" }}><Trash2 size={13} /></button>
                    </span>
                  </div>
                  );
                })}
                {expenses.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>Henüz gider kalemi yok — kira, elektrik, su, aidat, personel gibi aylık giderlerini ekle.</div>}

                {!addingExpense ? (
                  <button onClick={() => setAddingExpense(true)} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--brand)", padding: "10px 0 4px" }}><Plus size={14} /> Gider ekle</button>
                ) : (
                  <div style={{ display: "flex", gap: 8, padding: "10px 0 4px" }}>
                    <input value={neName} onChange={(e) => setNeName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addExpense()} placeholder="Ad (Kira, Elektrik...)" style={{ ...inp, flex: 1 }} autoFocus />
                    <input value={neAmount} onChange={(e) => setNeAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addExpense()} placeholder="Tutar (KDV dahil) ₺" inputMode="decimal" style={{ ...inp, width: 150 }} />
                    <input value={neVat} onChange={(e) => setNeVat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addExpense()} placeholder="KDV %" inputMode="decimal" style={{ ...inp, width: 70 }} />
                    <button onClick={addExpense} style={btnSmall}>Ekle</button>
                  </div>
                )}

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                  <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Aya bölünen gün sayısı</span>
                  <input value={daysInput} onChange={(e) => setDaysInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveDays()} inputMode="numeric" style={{ ...inp, width: 60 }} />
                  <button onClick={saveDays} style={btnSmall}>Kaydet</button>
                  <span style={{ fontSize: 11.5, color: "var(--muted-2)" }}>Varsayılan: bu ayın gün sayısı ({ayGunSayisi()}). Haftada kapalı gününüz varsa değiştirin.</span>
                </div>
              </div>
            )}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <PeriyotMiniTablo
            rows={[
              { l: "CİRO", vals: periyot?.ciro ?? null, fmt: (v: number) => money(v), renk: () => "var(--ink-green)" },
              { l: "NAKİT", vals: periyotOdeme?.nakit ?? null, fmt: (v: number) => money(v), renk: () => "var(--muted)" },
              { l: "KREDİ K.", vals: periyotOdeme?.kk ?? null, fmt: (v: number) => money(v), renk: () => "var(--muted)" },
              { l: "YEMEK KARTI", vals: periyotOdeme?.yemekKarti ?? null, fmt: (v: number) => money(v), renk: () => "var(--muted)" },
            ]}
          />
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>
        <PeriyotMiniTablo rows={[{ l: "MÜŞTERİ", vals: periyot?.musteri ?? null, fmt: (v: number) => String(v), renk: () => "var(--ink)" }]} labelWidth={110} />
      </div>
      <div style={{ flexShrink: 0, fontSize: 11.5, color: "var(--muted-2)", margin: "4px 0 12px" }}>
        {`Başabaş ve kârlılık tahmindir (son 30 günün malzeme oranı + sabit gider payı) · her 1.000₺ ciro ~${money(marjinalKar1000)} kâr bırakır`}
      </div>

      {/* alt bölge — gerekirse kendi içinde kayar, sayfa kaymaz */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* FİRE/KAÇAK RADARI — sarf malzemesinde öğrenilen orandan sapma uyarısı (ROADMAP L, Faz 1) */}
        {radar && radar.length > 0 && (() => {
          const sapmalar = radar.filter((r) => r.status === "sapma");
          const izlenen = radar.filter((r) => r.status !== "ogreniyor").length;
          const ogrenen = radar.length - izlenen;
          const oranFmt = (n: number | null) => n === null ? "?" : Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
          if (sapmalar.length === 0) {
            return (
              <div style={{ flexShrink: 0, fontSize: 12.5, color: "var(--muted)", padding: "10px 20px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18 }}>
                Fire/Kaçak radarı: <b>{izlenen}</b> sarf malzemesi izleniyor, sapma yok{ogrenen > 0 ? ` · ${ogrenen} malzeme henüz öğreniliyor (yeterli geçmiş birikince izlemeye alınır)` : ""}.
              </div>
            );
          }
          return (
            <div style={{ flexShrink: 0, background: "var(--danger-bg)", border: "1px solid var(--danger)", borderRadius: 18, padding: "14px 20px" }}>
              <div style={{ fontWeight: 600, color: "var(--danger)", marginBottom: 6 }}>Fire/Kaçak uyarısı — {sapmalar.length} sarf malzemesinde sapma</div>
              {sapmalar.map((r) => (
                <div key={r.ingredient_id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: "1px solid rgba(0,0,0,0.06)", fontSize: 13.5, color: "var(--ink)" }}>
                  <span><b>{r.ingredient_name}</b>: normalde müşteri başı ~{oranFmt(r.baseline_ratio)} {r.unit}, son 30 günde ~{oranFmt(r.recent_ratio)} {r.unit}</span>
                  <span className="tnum" style={{ flexShrink: 0, color: "var(--danger)", fontWeight: 600 }}>%{oranFmt(r.deviation_percent)} fazla — kontrol et</span>
                </div>
              ))}
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>Oran, girilen faturalardan öğrenilir; stok sayılamayan sarf malzemesinde tahmindir.</div>
            </div>
          );
        })()}

        <div style={{ flexShrink: 0, display: "flex", gap: 14 }}>
          <div style={{ flex: 1, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 18 }}>
            <div style={{ fontWeight: 600, color: "var(--ink-green)", marginBottom: 10 }}>En çok satanlar <span style={{ fontSize: 11.5, fontWeight: 400, color: "var(--muted-2)" }}>son 7 gün</span></div>
            {topSellers.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13 }}>Son 7 günde kapanmış satış yok.</div>}
            {topSellers.map((t) => (
              <div key={t.name} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                <span className="tnum" style={{ flexShrink: 0 }}>{t.qty} adet · <b>{money(t.revenue)}</b></span>
              </div>
            ))}
          </div>

          <div style={{ flex: 1, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 18 }}>
            <div style={{ fontWeight: 600, color: "var(--ink-green)", marginBottom: 10 }}>Gün gün ortalamamız</div>
            {prep ? (
              <>
                <div style={{ fontSize: 14, marginBottom: 6 }}>
                  Yarın beklenen müşteri: <b className="tnum">{prep.beklenen_musteri}</b>
                  <span style={{ color: "var(--muted)" }}> · geçen hafta aynı gün: </span>
                  <b className="tnum">{prep.gecen_hafta_ayni_gun}</b>
                </div>
                {prep.resmi_tatil && <div style={{ fontSize: 13, color: "var(--gold-text)", marginTop: 4 }}>Yarın resmi tatil — talep farklı olabilir.</div>}
                {!prep.resmi_tatil && prep.beklenen_musteri === 0 && prep.gecen_hafta_ayni_gun === 0 && (
                  <div style={{ fontSize: 13, color: "var(--muted-2)", marginTop: 4 }}>Tahmin için yeterli geçmiş veri henüz yok — geçmiş hafta biriktikçe burası dolacak.</div>
                )}
              </>
            ) : (
              <div style={{ color: "var(--muted-2)", fontSize: 13 }}>Yükleniyor…</div>
            )}
            {hourly.some((h) => h > 0) && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginBottom: 4 }}>Bugünün saatlik yoğunluğu (kapanan hesaplar)</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 34 }}>
                  {hourly.map((h, i) => (
                    <div key={i} title={`${String(i).padStart(2, "0")}:00 · ${money(h)}`} style={{ flex: 1, height: `${Math.max(h > 0 ? 12 : 4, (h / saatMax) * 100)}%`, background: h > 0 ? "var(--brand)" : "var(--line)", borderRadius: 2 }} />
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--muted-2)", marginTop: 2 }}><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
              </div>
            )}
          </div>

          <div style={{ flex: 1, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 18 }}>
            <div style={{ fontWeight: 600, color: "var(--ink-green)", marginBottom: 10 }}>Kritik stoklar</div>
            {kritikSayisi === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13 }}>Kritik seviyede malzeme yok.</div>}
            {prep?.kritik_stoklar.slice(0, 5).map((k) => (
              <div key={k.malzeme} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
                <span>{k.malzeme}</span>
                <span className="tnum" style={{ color: "var(--gold-text)" }}>{k.mevcut} / {k.par_seviye}</span>
              </div>
            ))}
            {kritikSayisi > 5 && <Link href="/stok" style={{ fontSize: 12.5, color: "var(--brand)", display: "block", marginTop: 8 }}>{`+${kritikSayisi - 5} tane daha — Stok'a git`}</Link>}
          </div>
        </div>
      </div>
    </div>
  );
}

// Dönem tablosunun tek bir grubu (başabaş/kârlılık VEYA ciro/ödeme türleri) — kendi GÜN/HAFTA/AY/YIL
// başlığıyla birlikte, iki grup yan yana konabilsin diye ayrı bir bileşen.
function PeriyotMiniTablo({
  rows, labelWidth = 90,
}: {
  rows: { l: string; vals: number[] | null; fmt: (v: number) => string; renk: (v: number) => string }[];
  labelWidth?: number;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `${labelWidth}px repeat(4, 1fr)`, gap: 8 }}>
      <div />
      {["GÜN", "HAFTA", "AY", "YIL"].map((b, i) => (
        <div key={i} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: "var(--muted)", padding: "2px 0", letterSpacing: "0.5px" }}>{b}</div>
      ))}
      {rows.map((r) => (
        <Fragment key={r.l}>
          <div style={{ ...matrisKutu, background: "var(--recede)", fontWeight: 600, color: "var(--ink-green)", justifyContent: "flex-start" }}>{r.l}</div>
          {[0, 1, 2, 3].map((k) => (
            <div key={k} className="tnum" style={{ ...matrisKutu, color: r.vals ? r.renk(r.vals[k]) : "var(--muted-2)" }}>
              {r.vals ? r.fmt(r.vals[k]) : "…"}
            </div>
          ))}
        </Fragment>
      ))}
    </div>
  );
}

const pill: React.CSSProperties = { textDecoration: "none", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 980, padding: "6px 13px", fontSize: 12.5, color: "var(--ink)" };
const matrisKutu: React.CSSProperties = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 14, padding: "12px 6px", fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 46, minWidth: 0 };
const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 10px", fontSize: 13.5, background: "var(--card)", color: "var(--ink)", outline: "none" };
const btnSmall: React.CSSProperties = { border: "none", borderRadius: 10, padding: "8px 14px", background: "var(--ink-green)", color: "#fff", fontSize: 13 };
