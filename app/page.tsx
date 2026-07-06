"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type TableRow = {
  id: string;
  name: string;
  area: string | null;
  status: "empty" | "occupied" | "bill_requested";
};

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

const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;

export default function Home() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<MenuItem | null>(null);
  const [cfgVariants, setCfgVariants] = useState<CfgVariant[]>([]);
  const [cfgGroups, setCfgGroups] = useState<CfgGroup[]>([]);
  const [chosenVariant, setChosenVariant] = useState<string | null>(null);
  const [chosenMods, setChosenMods] = useState<Record<string, string[]>>({});

  const load = useCallback(async () => {
    const { data: rest } = await supabase
      .from("restaurants")
      .select("id, name")
      .is("deleted_at", null)
      .limit(1)
      .single();
    if (!rest) return;
    setRestaurantId(rest.id);

    const [{ data: t }, { data: o }, { data: c }, { data: m }] = await Promise.all([
      supabase
        .from("restaurant_tables")
        .select("id, name, area, status")
        .eq("restaurant_id", rest.id)
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("orders")
        .select("id, table_id, order_items(id, quantity, unit_price, status, menu_items(name))")
        .eq("restaurant_id", rest.id)
        .eq("status", "open"),
      supabase
        .from("menu_categories")
        .select("id, name")
        .eq("restaurant_id", rest.id)
        .is("deleted_at", null)
        .order("sort_order"),
      supabase
        .from("menu_items")
        .select("id, name, sale_price, category_id")
        .eq("restaurant_id", rest.id)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name"),
    ]);

    setTables((t as TableRow[]) ?? []);
    setOrders((o as unknown as Order[]) ?? []);
    setCategories((c as Category[]) ?? []);
    setMenuItems((m as MenuItem[]) ?? []);
    if (c && c.length && !activeCategory) setActiveCategory(c[0].id);
  }, [activeCategory]);

  useEffect(() => {
    load();
  }, [load]);

  const orderForTable = (tableId: string | null) =>
    orders.find((o) => o.table_id === tableId) ?? null;

  const orderTotal = (order: Order | null) =>
    order
      ? order.order_items
          .filter((i) => i.status === "active")
          .reduce((s, i) => s + i.quantity * i.unit_price, 0)
      : 0;

  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;
  const selectedOrder = orderForTable(selectedTableId);

  const doluSayisi = tables.filter((t) => t.status !== "empty").length;
  const acikToplam = tables.reduce((s, t) => s + orderTotal(orderForTable(t.id)), 0);

  const startOrder = async () => {
    if (!restaurantId || !selectedTableId) return;
    setBusy(true);
    const { data } = await supabase
      .from("orders")
      .insert({ restaurant_id: restaurantId, table_id: selectedTableId, status: "open", channel: "dine_in" })
      .select("id")
      .single();
    await supabase.from("restaurant_tables").update({ status: "occupied" }).eq("id", selectedTableId);
    await load();
    setBusy(false);
    if (data) setShowAdd(true);
  };

  const addItem = async (item: MenuItem) => {
    if (!restaurantId || !selectedOrder) return;
    setBusy(true);
    await supabase.from("order_items").insert({
      restaurant_id: restaurantId,
      order_id: selectedOrder.id,
      menu_item_id: item.id,
      quantity: 1,
      unit_price: item.sale_price,
      status: "active",
    });
    await load();
    setBusy(false);
  };

  // Ürüne tıklayınca: varyant/ek seçenek varsa seçim panelini aç, yoksa direkt ekle
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
    setConfig(item);
    setCfgVariants(variants);
    setCfgGroups(groups);
    setChosenVariant(variants[0]?.id ?? null);
    setChosenMods({});
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
    if (!restaurantId || !selectedOrder || !config) return;
    const base = chosenVariant ? (cfgVariants.find((v) => v.id === chosenVariant)?.sale_price ?? config.sale_price) : config.sale_price;
    const mods = cfgGroups.flatMap((gr) => (chosenMods[gr.id] ?? []).map((id) => gr.modifiers.find((m) => m.id === id)).filter(Boolean)) as CfgMod[];
    const price = base + mods.reduce((s, m) => s + m.price_delta, 0);
    setBusy(true);
    const { data } = await supabase.from("order_items").insert({
      restaurant_id: restaurantId, order_id: selectedOrder.id, menu_item_id: config.id,
      variant_id: chosenVariant, quantity: 1, unit_price: price, status: "active",
    }).select("id").single();
    if (data && mods.length) {
      await supabase.from("order_item_modifiers").insert(mods.map((m) => ({
        restaurant_id: restaurantId, order_item_id: data.id, modifier_id: m.id, name: m.name, price_delta: m.price_delta,
      })));
    }
    setConfig(null);
    await load();
    setBusy(false);
  };

  const closeBill = async () => {
    if (!selectedOrder) return;
    setBusy(true);
    await supabase.rpc("close_order", { p_order_id: selectedOrder.id });
    setShowAdd(false);
    setSelectedTableId(null);
    await load();
    setBusy(false);
  };

  const visibleMenu = useMemo(
    () => menuItems.filter((m) => m.category_id === activeCategory),
    [menuItems, activeCategory],
  );

  const cfgBase = config ? (chosenVariant ? (cfgVariants.find((v) => v.id === chosenVariant)?.sale_price ?? config.sale_price) : config.sale_price) : 0;
  const cfgModList = config ? (cfgGroups.flatMap((gr) => (chosenMods[gr.id] ?? []).map((id) => gr.modifiers.find((m) => m.id === id)).filter(Boolean)) as CfgMod[]) : [];
  const cfgPrice = cfgBase + cfgModList.reduce((s, m) => s + m.price_delta, 0);

  return (
    <div style={{ padding: "26px 28px", display: "flex", gap: 22, alignItems: "flex-start" }}>
      {/* tables area */}
      <div style={{ flex: 1.6, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>
              Salon
            </div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 7 }}>
              {doluSayisi} masa dolu · {money(acikToplam)} açık hesap
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 14 }}>
          {tables.map((t) => {
            const ord = orderForTable(t.id);
            const total = orderTotal(ord);
            const selected = t.id === selectedTableId;
            const occupied = t.status !== "empty";
            const bill = t.status === "bill_requested";
            return (
              <button
                key={t.id}
                onClick={() => {
                  setSelectedTableId(t.id);
                  setShowAdd(false);
                }}
                style={{
                  textAlign: "left",
                  borderRadius: 18,
                  padding: 18,
                  minHeight: 96,
                  border: "none",
                  background: occupied ? "var(--card)" : "var(--recede)",
                  boxShadow: selected
                    ? "0 0 0 2px var(--brand)"
                    : occupied
                      ? "0 1px 2px rgba(30,57,50,.05), 0 6px 16px rgba(30,57,50,.07)"
                      : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontWeight: 600, fontSize: 15, color: occupied ? "var(--ink)" : "var(--muted-2)" }}>
                    {t.name}
                  </span>
                  {occupied && (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: bill ? "var(--gold)" : "var(--brand)",
                      }}
                    />
                  )}
                </div>
                {occupied ? (
                  <>
                    <div className="tnum" style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.4px", color: "var(--ink-green)", marginTop: 18 }}>
                      {money(total)}
                    </div>
                    <div style={{ fontSize: 12, color: bill ? "var(--gold-text)" : "var(--muted)", marginTop: 3 }}>
                      {bill ? "hesap istedi" : selected ? "seçili" : t.area ?? "açık"}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 12.5, color: "var(--muted-2)", marginTop: 30 }}>Boş</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* order panel */}
      <div
        style={{
          flex: 1,
          minWidth: 280,
          maxWidth: 340,
          background: "var(--card)",
          border: "1px solid var(--line)",
          borderRadius: 18,
          padding: 22,
          display: "flex",
          flexDirection: "column",
          minHeight: 460,
          position: "sticky",
          top: 26,
        }}
      >
        {!selectedTable && (
          <div style={{ color: "var(--muted)", fontSize: 14, margin: "auto" }}>Bir masa seç</div>
        )}

        {selectedTable && !selectedOrder && (
          <div style={{ margin: "auto", textAlign: "center" }}>
            <div style={{ fontWeight: 600, fontSize: 19, color: "var(--ink-green)", marginBottom: 10 }}>
              {selectedTable.name}
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18 }}>Açık sipariş yok</div>
            <button onClick={startOrder} disabled={busy} style={pillPrimary}>
              Sipariş başlat
            </button>
          </div>
        )}

        {selectedTable && selectedOrder && !showAdd && (
          <>
            <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.4px", color: "var(--ink-green)" }}>
              {selectedTable.name}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "6px 0 18px" }}>Adisyon</div>

            <div>
              {selectedOrder.order_items
                .filter((i) => i.status === "active")
                .map((i) => (
                  <div key={i.id} style={{ display: "flex", justifyContent: "space-between", padding: "11px 0", fontSize: 14 }}>
                    <span>
                      {i.quantity} × {i.menu_items?.name ?? "?"}
                    </span>
                    <span className="tnum">{money(i.quantity * i.unit_price)}</span>
                  </div>
                ))}
              {selectedOrder.order_items.filter((i) => i.status === "active").length === 0 && (
                <div style={{ color: "var(--muted)", fontSize: 14, padding: "11px 0" }}>Henüz ürün yok</div>
              )}
            </div>

            <div style={{ height: 1, background: "var(--line)", marginTop: 14 }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 16 }}>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>Toplam</span>
              <span className="tnum" style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-1px", color: "var(--ink-green)" }}>
                {money(orderTotal(selectedOrder))}
              </span>
            </div>

            <div style={{ marginTop: "auto", paddingTop: 22, display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={closeBill} disabled={busy} style={pillPrimary}>
                Hesap kapat
              </button>
              <button onClick={() => setShowAdd(true)} style={pillSecondary}>
                Ürün ekle
              </button>
            </div>
          </>
        )}

        {selectedTable && selectedOrder && showAdd && !config && (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCategory(c.id)}
                  style={{
                    fontSize: 12.5,
                    padding: "6px 14px",
                    borderRadius: 980,
                    border: "none",
                    background: activeCategory === c.id ? "var(--ink-green)" : "var(--recede)",
                    color: activeCategory === c.id ? "#fff" : "var(--muted)",
                  }}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
              {visibleMenu.map((m) => (
                <button
                  key={m.id}
                  onClick={() => openProduct(m)}
                  disabled={busy}
                  style={{ border: "1px solid var(--line)", borderRadius: 14, padding: "14px 10px", background: "var(--card)", textAlign: "center" }}
                >
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{m.name}</div>
                  <div className="tnum" style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>{money(m.sale_price)}</div>
                </button>
              ))}
            </div>
            <button onClick={() => setShowAdd(false)} style={{ ...pillSecondary, marginTop: "auto" }}>
              Adisyona dön
            </button>
          </>
        )}

        {selectedTable && selectedOrder && showAdd && config && (
          <>
            <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink-green)", marginBottom: 4 }}>{config.name}</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16 }}>Seçenekleri belirle</div>

            <div style={{ overflowY: "auto", flex: 1 }}>
              {cfgVariants.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Boy</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {cfgVariants.map((v) => (
                      <button key={v.id} onClick={() => setChosenVariant(v.id)}
                        style={chip(chosenVariant === v.id)}>
                        {v.name} · {money(v.sale_price)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {cfgGroups.map((gr) => (
                <div key={gr.id} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{gr.name}</div>
                  <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 8 }}>
                    {gr.required ? "zorunlu" : "opsiyonel"} · {gr.max_select === 1 ? "tek seç" : "çok seç"}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {gr.modifiers.map((m) => {
                      const on = (chosenMods[gr.id] ?? []).includes(m.id);
                      return (
                        <button key={m.id} onClick={() => toggleMod(gr, m.id)} style={chip(on)}>
                          {m.name}{m.price_delta > 0 ? ` +${money(m.price_delta)}` : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 10 }}>
              <button onClick={confirmAdd} disabled={busy} style={pillPrimary}>
                Ekle · {money(cfgPrice)}
              </button>
              <button onClick={() => setConfig(null)} style={pillSecondary}>Vazgeç</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const pillPrimary: React.CSSProperties = {
  border: "none",
  borderRadius: 980,
  padding: 14,
  background: "var(--brand-strong)",
  color: "#fff",
  fontSize: 15,
  fontWeight: 500,
};
const pillSecondary: React.CSSProperties = {
  border: "1px solid var(--line-2)",
  borderRadius: 980,
  padding: 12,
  background: "var(--card)",
  color: "var(--ink-green)",
  fontSize: 14,
};
const chip = (on: boolean): React.CSSProperties => ({
  border: on ? "none" : "1px solid var(--line-2)",
  borderRadius: 980,
  padding: "8px 14px",
  fontSize: 13,
  background: on ? "var(--brand-strong)" : "var(--card)",
  color: on ? "#fff" : "var(--ink-green)",
});
