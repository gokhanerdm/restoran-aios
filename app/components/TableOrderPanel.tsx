"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { ChevronDown, ChevronRight } from "lucide-react";

type OrderItem = {
  id: string;
  quantity: number;
  unit_price: number;
  status: string;
  menu_items: { name: string } | null;
};
type Order = { id: string; table_id: string | null; order_items: OrderItem[] };
type MenuItem = { id: string; name: string; sale_price: number; category_id: string | null };
type Category = { id: string; name: string };
type CfgVariant = { id: string; name: string; sale_price: number };
type CfgMod = { id: string; name: string; price_delta: number };
type CfgGroup = { id: string; name: string; required: boolean; min_select: number; max_select: number; modifiers: CfgMod[] };
export type TableForOrder = { id: string; name: string; status: string };

const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;

// Masa seçilince açılan sipariş/hesap paneli — Kasa ve Salonlar aynı ekranı paylaşır.
export default function TableOrderPanel({
  restaurantId,
  table,
  onChanged,
  onClosed,
}: {
  restaurantId: string | null;
  table: TableForOrder | null;
  onChanged: () => void;
  onClosed?: () => void;
}) {
  const [order, setOrder] = useState<Order | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<MenuItem | null>(null);
  const [cfgVariants, setCfgVariants] = useState<CfgVariant[]>([]);
  const [cfgGroups, setCfgGroups] = useState<CfgGroup[]>([]);
  const [chosenVariant, setChosenVariant] = useState<string | null>(null);
  const [chosenMods, setChosenMods] = useState<Record<string, string[]>>({});

  const loadMenu = useCallback(async () => {
    if (!restaurantId) return;
    const [{ data: c }, { data: m }] = await Promise.all([
      supabase.from("menu_categories").select("id, name").eq("restaurant_id", restaurantId).is("deleted_at", null).order("sort_order"),
      supabase.from("menu_items").select("id, name, sale_price, category_id").eq("restaurant_id", restaurantId).eq("is_active", true).is("deleted_at", null).order("name"),
    ]);
    setCategories((c as Category[]) ?? []);
    setMenuItems((m as MenuItem[]) ?? []);
  }, [restaurantId]);

  const toggleCat = (id: string) => {
    setExpandedCats((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  useEffect(() => { loadMenu(); }, [loadMenu]);

  const loadOrder = useCallback(async () => {
    if (!table) { setOrder(null); return; }
    const { data } = await supabase
      .from("orders")
      .select("id, table_id, order_items(id, quantity, unit_price, status, menu_items(name))")
      .eq("table_id", table.id).eq("status", "open").maybeSingle();
    setOrder((data as unknown as Order) ?? null);
  }, [table?.id]);

  useEffect(() => { loadOrder(); setMenuOpen(false); setConfig(null); }, [table?.id, loadOrder]);

  const orderTotal = (o: Order | null) =>
    o ? o.order_items.filter((i) => i.status === "active").reduce((s, i) => s + i.quantity * i.unit_price, 0) : 0;

  const startOrder = async () => {
    if (!restaurantId || !table) return;
    setBusy(true);
    await supabase.from("orders").insert({ restaurant_id: restaurantId, table_id: table.id, status: "open", channel: "dine_in" });
    await supabase.from("restaurant_tables").update({ status: "occupied" }).eq("id", table.id);
    await loadOrder(); onChanged();
    setBusy(false);
    setMenuOpen(true);
  };

  const addItem = async (item: MenuItem) => {
    if (!restaurantId || !order) return;
    setBusy(true);
    await supabase.from("order_items").insert({
      restaurant_id: restaurantId, order_id: order.id, menu_item_id: item.id,
      quantity: 1, unit_price: item.sale_price, status: "active",
    });
    await loadOrder(); onChanged();
    setBusy(false);
  };

  const openProduct = async (item: MenuItem) => {
    setBusy(true);
    const [{ data: v }, { data: g }] = await Promise.all([
      supabase.from("product_variants").select("id, name, sale_price").eq("menu_item_id", item.id).is("deleted_at", null).order("sort_order"),
      supabase.from("menu_item_modifier_groups").select("modifier_groups(id, name, required, min_select, max_select, modifiers(id, name, price_delta))").eq("menu_item_id", item.id),
    ]);
    const variants = (v as CfgVariant[]) ?? [];
    const groups = (((g as unknown as { modifier_groups: CfgGroup | null }[]) ?? []).map((x) => x.modifier_groups).filter(Boolean)) as CfgGroup[];
    setBusy(false);
    if (variants.length === 0 && groups.length === 0) { await addItem(item); return; }
    setConfig(item); setCfgVariants(variants); setCfgGroups(groups);
    setChosenVariant(variants[0]?.id ?? null); setChosenMods({});
  };

  const toggleMod = (group: CfgGroup, modId: string) => {
    setChosenMods((prev) => {
      const cur = prev[group.id] ?? [];
      const next = group.max_select === 1
        ? (cur.includes(modId) ? [] : [modId])
        : (cur.includes(modId) ? cur.filter((x) => x !== modId) : [...cur, modId]);
      return { ...prev, [group.id]: next };
    });
  };

  const confirmAdd = async () => {
    if (!restaurantId || !order || !config) return;
    const base = chosenVariant ? (cfgVariants.find((v) => v.id === chosenVariant)?.sale_price ?? config.sale_price) : config.sale_price;
    const mods = cfgGroups.flatMap((gr) => (chosenMods[gr.id] ?? []).map((id) => gr.modifiers.find((m) => m.id === id)).filter(Boolean)) as CfgMod[];
    const price = base + mods.reduce((s, m) => s + m.price_delta, 0);
    setBusy(true);
    const { data } = await supabase.from("order_items").insert({
      restaurant_id: restaurantId, order_id: order.id, menu_item_id: config.id,
      variant_id: chosenVariant, quantity: 1, unit_price: price, status: "active",
    }).select("id").single();
    if (data && mods.length) {
      await supabase.from("order_item_modifiers").insert(mods.map((m) => ({
        restaurant_id: restaurantId, order_item_id: data.id, modifier_id: m.id, name: m.name, price_delta: m.price_delta,
      })));
    }
    setConfig(null);
    await loadOrder(); onChanged();
    setBusy(false);
  };

  const closeBill = async () => {
    if (!order) return;
    setBusy(true);
    await supabase.rpc("close_order", { p_order_id: order.id });
    setMenuOpen(false);
    await loadOrder(); onChanged();
    setBusy(false);
    onClosed?.();
  };

  const cfgBase = config ? (chosenVariant ? (cfgVariants.find((v) => v.id === chosenVariant)?.sale_price ?? config.sale_price) : config.sale_price) : 0;
  const cfgModList = config ? (cfgGroups.flatMap((gr) => (chosenMods[gr.id] ?? []).map((id) => gr.modifiers.find((m) => m.id === id)).filter(Boolean)) as CfgMod[]) : [];
  const cfgPrice = cfgBase + cfgModList.reduce((s, m) => s + m.price_delta, 0);

  return (
    <div
      style={{
        flex: 1, minWidth: 280, maxWidth: 340, background: "var(--card)", border: "1px solid var(--line)",
        borderRadius: 18, padding: 22, display: "flex", flexDirection: "column", minHeight: 460,
      }}
    >
      {!table && <div style={{ color: "var(--muted)", fontSize: 14, margin: "auto" }}>Bir masa seç</div>}

      {table && !order && (
        <div style={{ margin: "auto", textAlign: "center" }}>
          <div style={{ fontWeight: 600, fontSize: 19, color: "var(--ink-green)", marginBottom: 10 }}>{table.name}</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18 }}>Açık sipariş yok</div>
          <button onClick={startOrder} disabled={busy} style={pillPrimary}>Sipariş başlat</button>
        </div>
      )}

      {table && order && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.4px", color: "var(--ink-green)", flexShrink: 0 }}>{table.name}</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "6px 0 12px", flexShrink: 0 }}>Adisyon</div>

          <div style={{ flexShrink: 0 }}>
            {order.order_items.filter((i) => i.status === "active").map((i) => (
              <div key={i.id} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", fontSize: 14 }}>
                <span>{i.quantity} × {i.menu_items?.name ?? "?"}</span>
                <span className="tnum">{money(i.quantity * i.unit_price)}</span>
              </div>
            ))}
            {order.order_items.filter((i) => i.status === "active").length === 0 && (
              <div style={{ color: "var(--muted)", fontSize: 14, padding: "9px 0" }}>Henüz ürün yok</div>
            )}
          </div>

          <div style={{ height: 1, background: "var(--line)", marginTop: 10, flexShrink: 0 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "12px 0", flexShrink: 0 }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Toplam</span>
            <span className="tnum" style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-1px", color: "var(--ink-green)" }}>{money(orderTotal(order))}</span>
          </div>

          {/* Menü — akordeon başlığı, tıklanınca kategoriler açılır. Adisyon her zaman görünür kalır. */}
          <button onClick={() => setMenuOpen((o) => !o)} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderTop: "1px solid var(--line)", flexShrink: 0 }}>
            {menuOpen ? <ChevronDown size={15} color="var(--muted)" /> : <ChevronRight size={15} color="var(--muted)" />}
            <span style={{ fontWeight: 600, fontSize: 14, color: "var(--ink-green)" }}>Menü</span>
          </button>

          {menuOpen && !config && (
            <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              {categories.map((c) => {
                const open = expandedCats.has(c.id);
                const items = menuItems.filter((m) => m.category_id === c.id);
                return (
                  <div key={c.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <button onClick={() => toggleCat(c.id)} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 4px" }}>
                      {open ? <ChevronDown size={15} color="var(--muted)" /> : <ChevronRight size={15} color="var(--muted)" />}
                      <span style={{ fontWeight: 600, fontSize: 13.5, color: "var(--ink-green)" }}>{c.name}</span>
                    </button>
                    {open && (
                      <div style={{ paddingBottom: 6 }}>
                        {items.map((m) => (
                          <button key={m.id} onClick={() => openProduct(m)} disabled={busy}
                            style={{ all: "unset", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "9px 4px 9px 23px", fontSize: 13.5, boxSizing: "border-box" }}>
                            <span>{m.name}</span>
                            <span className="tnum" style={{ color: "var(--muted)" }}>{money(m.sale_price)}</span>
                          </button>
                        ))}
                        {items.length === 0 && <div style={{ fontSize: 12, color: "var(--muted-2)", padding: "6px 4px 6px 23px" }}>Ürün yok</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {menuOpen && config && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-green)", marginBottom: 4, marginTop: 8 }}>{config.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Seçenekleri belirle</div>

              <div style={{ overflowY: "auto", flex: 1 }}>
                {cfgVariants.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Boy</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {cfgVariants.map((v) => (
                        <button key={v.id} onClick={() => setChosenVariant(v.id)} style={chip(chosenVariant === v.id)}>{v.name} · {money(v.sale_price)}</button>
                      ))}
                    </div>
                  </div>
                )}
                {cfgGroups.map((gr) => (
                  <div key={gr.id} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{gr.name}</div>
                    <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 8 }}>{gr.required ? "zorunlu" : "opsiyonel"} · {gr.max_select === 1 ? "tek seç" : "çok seç"}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {gr.modifiers.map((m) => {
                        const on = (chosenMods[gr.id] ?? []).includes(m.id);
                        return <button key={m.id} onClick={() => toggleMod(gr, m.id)} style={chip(on)}>{m.name}{m.price_delta > 0 ? ` +${money(m.price_delta)}` : ""}</button>;
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
                <button onClick={confirmAdd} disabled={busy} style={pillPrimary}>Ekle · {money(cfgPrice)}</button>
                <button onClick={() => setConfig(null)} style={pillSecondary}>Vazgeç</button>
              </div>
            </div>
          )}

          <div style={{ marginTop: menuOpen ? 12 : "auto", paddingTop: 12, flexShrink: 0 }}>
            <button onClick={closeBill} disabled={busy} style={pillPrimary}>Hesap kapat</button>
          </div>
        </div>
      )}
    </div>
  );
}

const pillPrimary: React.CSSProperties = { border: "none", borderRadius: 980, padding: 14, background: "var(--brand-strong)", color: "#fff", fontSize: 15, fontWeight: 500 };
const pillSecondary: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: 12, background: "var(--card)", color: "var(--ink-green)", fontSize: 14 };
const chip = (on: boolean): React.CSSProperties => ({ border: on ? "none" : "1px solid var(--line-2)", borderRadius: 980, padding: "8px 14px", fontSize: 13, background: on ? "var(--brand-strong)" : "var(--card)", color: on ? "#fff" : "var(--ink-green)" });
