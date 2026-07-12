"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import EditableText from "../components/EditableText";
import { toTitleTr } from "@/lib/text";

// Ana Sayfa — işletmenin veri merkezi. Başabaş: "bugün X₺ ciro dükkanı çevirir,
// ondan sonraki her 1.000₺'nin ~Y₺'si kâr" (ROADMAP + Gökhan şablonu, 2026-07-10).

type Summary = { ciro: number; maliyet: number; adisyon: number };
type PrepReport = {
  beklenen_musteri: number;
  gecen_hafta_ayni_gun: number;
  resmi_tatil: boolean;
  kritik_stoklar: { malzeme: string; mevcut: number; par_seviye: number }[];
};
type Expense = { id: string; name: string; monthly_amount: number; vat_rate: number };
type Settings = { fixed_cost_days_override: number | null };

const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;
const bugunIstanbul = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
const ayGunSayisi = () => {
  const [y, m] = bugunIstanbul().split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

export default function AnaSayfa() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [prep, setPrep] = useState<PrepReport | null>(null);
  const [openTables, setOpenTables] = useState(0);
  const [openTotal, setOpenTotal] = useState(0);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [foodCostRatio, setFoodCostRatio] = useState<number | null>(null);
  const [guestsToday, setGuestsToday] = useState(0);
  const [lwCiro, setLwCiro] = useState<number | null>(null);
  const [topSellers, setTopSellers] = useState<{ name: string; qty: number; revenue: number }[]>([]);
  const [hourly, setHourly] = useState<number[]>([]);

  const [expensesOpen, setExpensesOpen] = useState(false);
  const [addingExpense, setAddingExpense] = useState(false);
  const [neName, setNeName] = useState("");
  const [neAmount, setNeAmount] = useState("");
  const [neVat, setNeVat] = useState("20");
  const [daysInput, setDaysInput] = useState("");

  const load = useCallback(async () => {
    const { data: rest } = await supabase.from("restaurants").select("id").is("deleted_at", null).limit(1).single();
    if (!rest) return;
    setRestaurantId(rest.id);
    const gun = bugunIstanbul();
    const otuzGunOnce = new Date(Date.parse(gun) - 30 * 86400000).toISOString();
    const bugunBasi = new Date(gun + "T00:00:00+03:00").toISOString();
    const yediGunOnce = new Date(Date.parse(gun) - 7 * 86400000).toISOString();
    // geçen hafta aynı gün (İstanbul günü) — karşılaştırma yüzdesi için
    const lwBasi = new Date(Date.parse(gun + "T00:00:00+03:00") - 7 * 86400000).toISOString();
    const lwSonu = new Date(Date.parse(lwBasi) + 86400000).toISOString();

    const [{ data: sum }, { data: rep }, { data: tables }, { data: openOrders }, { data: exp }, { data: st }, { data: recipeRows }, { data: closedItems }, { data: todayOrders }, { data: lwOrders }] = await Promise.all([
      supabase.rpc("daily_summary", { p_restaurant: rest.id, p_date: gun }),
      supabase.rpc("daily_prep_report", { p_restaurant: rest.id }),
      supabase.from("restaurant_tables").select("status").eq("restaurant_id", rest.id).is("deleted_at", null),
      supabase.from("orders").select("id, order_items(quantity, unit_price, status)").eq("restaurant_id", rest.id).eq("status", "open"),
      supabase.from("business_expenses").select("id, name, monthly_amount, vat_rate").eq("restaurant_id", rest.id).eq("active", true).is("deleted_at", null).order("sort_order"),
      supabase.from("restaurant_settings").select("fixed_cost_days_override").eq("restaurant_id", rest.id).maybeSingle(),
      supabase.from("recipe_items").select("menu_item_id, quantity, ingredients(current_unit_cost)").eq("restaurant_id", rest.id),
      supabase.from("orders").select("closed_at, order_items(quantity, unit_price, status, menu_item_id, menu_items(name))").eq("restaurant_id", rest.id).eq("status", "closed").gte("closed_at", otuzGunOnce),
      supabase.from("orders").select("party_size, total_amount, status, closed_at").eq("restaurant_id", rest.id).gte("created_at", bugunBasi),
      supabase.from("orders").select("total_amount").eq("restaurant_id", rest.id).eq("status", "closed").gte("closed_at", lwBasi).lt("closed_at", lwSonu),
    ]);

    setSummary(sum as Summary);
    setPrep(rep as PrepReport);
    setOpenTables((tables ?? []).filter((t: { status: string }) => t.status !== "empty").length);
    const total = (openOrders ?? []).reduce((s: number, o: { order_items: { quantity: number; unit_price: number; status: string }[] }) =>
      s + o.order_items.filter((i) => i.status === "active").reduce((s2, i) => s2 + i.quantity * i.unit_price, 0), 0);
    setOpenTotal(total);
    setExpenses((exp as Expense[]) ?? []);
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

    const gunun = (todayOrders as unknown as { party_size: number | null; total_amount: number | null; status: string; closed_at: string | null }[]) ?? [];
    setGuestsToday(gunun.reduce((s, o) => s + (o.party_size ?? 0), 0));
    const saat = new Array(24).fill(0);
    const saatFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Istanbul" });
    gunun.filter((o) => o.status === "closed" && o.closed_at).forEach((o) => { saat[parseInt(saatFmt.format(new Date(o.closed_at!)))] += Number(o.total_amount ?? 0); });
    setHourly(saat);
    const lw = ((lwOrders as { total_amount: number | null }[]) ?? []).reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
    setLwCiro(lw > 0 ? lw : null);
  }, []);

  useEffect(() => { load(); }, [load]);

  const kar = summary ? summary.ciro - summary.maliyet : 0;
  const kritikSayisi = prep?.kritik_stoklar.length ?? 0;

  const aylikGiderToplam = expenses.reduce((s, e) => s + Number(e.monthly_amount), 0);
  const gunSayisi = settings?.fixed_cost_days_override ?? ayGunSayisi();
  const gunlukSabitGider = gunSayisi > 0 ? aylikGiderToplam / gunSayisi : 0;
  const oran = foodCostRatio ?? 0.30; // geçmiş veri yoksa sektör ortalaması varsayımıyla başlar
  const basabas = oran < 1 ? gunlukSabitGider / (1 - oran) : null;
  const marjinalKar1000 = (1 - oran) * 1000;
  const bugunkuCiro = summary?.ciro ?? 0;
  const lwFark = lwCiro != null ? ((bugunkuCiro - lwCiro) / lwCiro) * 100 : null;
  const saatMax = Math.max(...hourly, 1);
  const ilerlemeYuzde = basabas && basabas > 0 ? Math.min(100, (bugunkuCiro / basabas) * 100) : 0;
  const hedefeUlasildi = basabas != null && bugunkuCiro >= basabas;

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
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Bugün · {bugunIstanbul()}</div>
      </div>

      {/* VERİ MERKEZİ — başabaş de dahil, tek satır pencereler */}
      <div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 14 }}>
        <div style={card}>
          <div style={cardLabel}>Başabaş hedefi</div>
          {basabas == null ? (
            <div style={{ fontSize: 13, color: "var(--muted-2)", marginTop: 6 }}>Veri birikince hesaplanır (~%30 varsayım)</div>
          ) : (
            <>
              <div className="tnum" style={cardValue}>{money(basabas)}</div>
              <div style={{ height: 5, background: "var(--line)", borderRadius: 980, overflow: "hidden", marginTop: 8 }}>
                <div style={{ height: "100%", width: `${ilerlemeYuzde}%`, background: hedefeUlasildi ? "var(--brand)" : "var(--gold)", borderRadius: 980 }} />
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 5 }}>
                {hedefeUlasildi ? "Geçildi ✓" : `Kalan ${money(Math.max(0, basabas - bugunkuCiro))}`}{` · 1.000₺'nin ${money(marjinalKar1000)}'si kâr`}
              </div>
            </>
          )}
        </div>
        <Link href="/gun-sonu" style={card}>
          <div style={cardLabel}>Bugünkü ciro</div>
          <div className="tnum" style={cardValue}>{money(bugunkuCiro)}</div>
          <div style={{ fontSize: 11.5, marginTop: 5, color: lwFark == null ? "var(--muted-2)" : lwFark >= 0 ? "var(--brand)" : "#a32d2d" }}>
            {guestsToday > 0 && <span style={{ color: "var(--muted-2)" }}>{guestsToday} müşteri · </span>}
            {lwFark == null ? "geçen hafta verisi yok" : `geçen haftaya göre ${lwFark >= 0 ? "+" : "−"}%${Math.abs(lwFark).toFixed(0)}`}
          </div>
        </Link>
        <Link href="/gun-sonu" style={{ ...card, background: "var(--brand-strong)" }}>
          <div style={{ ...cardLabel, color: "rgba(255,255,255,0.8)" }}>Net kâr (bugün)</div>
          <div className="tnum" style={{ ...cardValue, color: "#fff" }}>{money(kar)}</div>
        </Link>
        <Link href="/" style={card}>
          <div style={cardLabel}>Açık masa</div>
          <div className="tnum" style={cardValue}>{openTables} <span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 400 }}>({money(openTotal)})</span></div>
        </Link>
        <Link href="/stok" style={{ ...card, background: kritikSayisi > 0 ? "#FBF2E1" : "var(--card)" }}>
          <div style={{ ...cardLabel, color: kritikSayisi > 0 ? "var(--gold-text)" : "var(--muted)" }}>Kritik stok</div>
          <div className="tnum" style={{ ...cardValue, color: kritikSayisi > 0 ? "var(--gold-text)" : "var(--ink)" }}>{kritikSayisi}</div>
        </Link>
      </div>

      {/* alt bölge — gerekirse kendi içinde kayar, sayfa kaymaz */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        {/* GİDERLER AKORDEONU */}
        <div style={{ flexShrink: 0, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, overflow: "hidden" }}>
          <button onClick={() => setExpensesOpen((o) => !o)} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "14px 20px", boxSizing: "border-box" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {expensesOpen ? <ChevronDown size={16} color="var(--muted)" /> : <ChevronRight size={16} color="var(--muted)" />}
              <span style={{ fontWeight: 600, color: "var(--ink-green)" }}>Sabit giderler</span>
            </span>
            <span className="tnum" style={{ fontSize: 13, color: "var(--muted)" }}>
              Aylık {money(aylikGiderToplam)} · günlük pay {money(gunlukSabitGider)} ({gunSayisi} güne bölünüyor)
            </span>
          </button>
          {expensesOpen && (
            <div style={{ padding: "0 20px 18px", maxHeight: 260, overflowY: "auto" }}>
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

const card: React.CSSProperties = { display: "block", textDecoration: "none", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 18 };
const cardLabel: React.CSSProperties = { fontSize: 13, color: "var(--muted)" };
const cardValue: React.CSSProperties = { fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", marginTop: 6 };
const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 10px", fontSize: 13.5, background: "var(--card)", color: "var(--ink)", outline: "none" };
const btnSmall: React.CSSProperties = { border: "none", borderRadius: 10, padding: "8px 14px", background: "var(--ink-green)", color: "#fff", fontSize: 13 };
