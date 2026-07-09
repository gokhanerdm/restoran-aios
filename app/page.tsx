"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import TableOrderPanel from "./components/TableOrderPanel";

type TableRow = {
  id: string;
  name: string;
  area: string | null;
  status: "empty" | "occupied" | "bill_requested" | "reserved";
};
type OrderItem = { id: string; quantity: number; unit_price: number; status: string };
type Order = { id: string; table_id: string | null; order_items: OrderItem[] };

const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;

export default function Home() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: rest } = await supabase.from("restaurants").select("id, name").is("deleted_at", null).limit(1).single();
    if (!rest) return;
    setRestaurantId(rest.id);
    const [{ data: t }, { data: o }] = await Promise.all([
      supabase.from("restaurant_tables").select("id, name, area, status").eq("restaurant_id", rest.id).is("deleted_at", null).order("name"),
      supabase.from("orders").select("id, table_id, order_items(id, quantity, unit_price, status)").eq("restaurant_id", rest.id).eq("status", "open"),
    ]);
    setTables((t as TableRow[]) ?? []);
    setOrders((o as unknown as Order[]) ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const orderForTable = (tableId: string | null) => orders.find((o) => o.table_id === tableId) ?? null;
  const orderTotal = (order: Order | null) =>
    order ? order.order_items.filter((i) => i.status === "active").reduce((s, i) => s + i.quantity * i.unit_price, 0) : 0;

  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;

  const doluSayisi = tables.filter((t) => t.status !== "empty").length;
  const acikToplam = tables.reduce((s, t) => s + orderTotal(orderForTable(t.id)), 0);

  return (
    <div style={{ padding: "26px 28px", display: "flex", gap: 22, alignItems: "flex-start" }}>
      <div style={{ flex: 1.6, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>Salon</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 7 }}>{doluSayisi} masa dolu · {money(acikToplam)} açık hesap</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 14 }}>
          {tables.map((t) => {
            const ord = orderForTable(t.id);
            const total = orderTotal(ord);
            const selected = t.id === selectedTableId;
            const occupied = t.status !== "empty" && t.status !== "reserved";
            const bill = t.status === "bill_requested";
            const reserved = t.status === "reserved";
            return (
              <button
                key={t.id}
                onClick={() => setSelectedTableId(t.id)}
                style={{
                  textAlign: "left", borderRadius: 18, padding: 18, minHeight: 96, border: "none",
                  background: occupied ? "var(--card)" : "var(--recede)",
                  boxShadow: selected ? "0 0 0 2px var(--brand)" : occupied ? "0 1px 2px rgba(30,57,50,.05), 0 6px 16px rgba(30,57,50,.07)" : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontWeight: 600, fontSize: 15, color: occupied ? "var(--ink)" : "var(--muted-2)" }}>{t.name}</span>
                  {occupied && <span style={{ width: 6, height: 6, borderRadius: "50%", background: bill ? "var(--gold)" : "var(--brand)" }} />}
                  {reserved && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--muted-2)" }} />}
                </div>
                {occupied ? (
                  <>
                    <div className="tnum" style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.4px", color: "var(--ink-green)", marginTop: 18 }}>{money(total)}</div>
                    <div style={{ fontSize: 12, color: bill ? "var(--gold-text)" : "var(--muted)", marginTop: 3 }}>{bill ? "hesap istedi" : selected ? "seçili" : t.area ?? "açık"}</div>
                  </>
                ) : (
                  <div style={{ fontSize: 12.5, color: "var(--muted-2)", marginTop: 30 }}>{reserved ? "Rezerve" : "Boş"}</div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ position: "sticky", top: 26 }}>
        <TableOrderPanel
          restaurantId={restaurantId}
          table={selectedTable ? { id: selectedTable.id, name: selectedTable.name, status: selectedTable.status } : null}
          onChanged={load}
          onClosed={() => setSelectedTableId(null)}
        />
      </div>
    </div>
  );
}
