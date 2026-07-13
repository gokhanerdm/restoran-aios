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
  const [addingCm, setAddingCm] = useState(false);
  const [cmType, setCmType] = useState<"cikis" | "giris">("cikis");
  const [cmAmount, setCmAmount] = useState("");
  const [cmNote, setCmNote] = useState("");
  const [cmMsg, setCmMsg] = useState<string | null>(null);

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

  const addCashMove = async () => {
    if (!restaurantId) return;
    const amount = parseFloat(cmAmount.replace(",", ".")) || 0;
    if (amount <= 0) return;
    const { error } = await supabase.from("cash_movements").insert({ restaurant_id: restaurantId, movement_type: cmType, amount, note: cmNote || null });
    if (error) { setCmMsg(error.message); return; }
    setCmMsg(`${cmType === "cikis" ? "Çıkış" : "Giriş"} kaydedildi: ${money(amount)}`);
    setCmAmount(""); setCmNote(""); setAddingCm(false);
  };

  const doluSayisi = tables.filter((t) => t.status !== "empty").length;
  const acikToplam = tables.reduce((s, t) => s + orderTotal(orderForTable(t.id)), 0);

  return (
    <div style={{ padding: "26px 28px", display: "flex", gap: 22, alignItems: "flex-start" }}>
      <div style={{ flex: 1.6, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>Salon</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 7 }}>{doluSayisi} masa dolu · {money(acikToplam)} açık hesap</div>
          </div>
          {!addingCm ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {cmMsg && <span style={{ fontSize: 12.5, color: "var(--brand)" }}>{cmMsg}</span>}
              <button onClick={() => { setAddingCm(true); setCmMsg(null); }} style={{ border: "1px solid var(--line-2)", borderRadius: 980, padding: "7px 14px", background: "var(--card)", color: "var(--ink-green)", fontSize: 12.5, fontWeight: 600 }}>Kasa hareketi</button>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {([["cikis", "Çıkış"], ["giris", "Giriş"]] as const).map(([v, l]) => (
                <button key={v} onClick={() => setCmType(v)} style={{ border: "none", borderRadius: 980, padding: "6px 12px", fontSize: 12, background: cmType === v ? "var(--ink-green)" : "var(--recede)", color: cmType === v ? "#fff" : "var(--muted)" }}>{l}</button>
              ))}
              <input value={cmAmount} onChange={(e) => setCmAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCashMove()} placeholder="Tutar ₺" inputMode="decimal" autoFocus style={{ border: "1px solid var(--line-2)", borderRadius: 10, padding: "7px 10px", fontSize: 13, width: 85, background: "var(--card)", color: "var(--ink)", outline: "none" }} />
              <input value={cmNote} onChange={(e) => setCmNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCashMove()} placeholder="Açıklama (manav ödemesi)" style={{ border: "1px solid var(--line-2)", borderRadius: 10, padding: "7px 10px", fontSize: 13, width: 170, background: "var(--card)", color: "var(--ink)", outline: "none" }} />
              <button onClick={addCashMove} style={{ border: "none", borderRadius: 10, padding: "7px 13px", background: "var(--ink-green)", color: "#fff", fontSize: 12.5 }}>Kaydet</button>
              <button onClick={() => { setAddingCm(false); setCmAmount(""); setCmNote(""); }} style={{ border: "none", borderRadius: 10, padding: "7px 10px", background: "transparent", color: "var(--muted)", fontSize: 12.5 }}>Vazgeç</button>
            </div>
          )}
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
