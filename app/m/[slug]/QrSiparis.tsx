"use client";

// QR sipariş katmanı — /m/[slug] sayfasının SADECE sipariş kısmı.
//
// Sayfanın kendisi (menü görüntüleme) server component olarak kalır (PAGE_STANDARDS #9:
// müşteriye açık sayfalar JS'siz de yüklenmeli). Sepet için state/onClick gerektiğinden bu
// dosya ayrı bir client bileşen: server component menü ağacını `children` olarak buraya
// geçirir, "Ekle" butonları da server ağacının içinde durup context üzerinden sepete yazar.
// Böylece masa parametresi yokken bu dosyadaki hiçbir şey render edilmez ve sayfa bugünkü
// haliyle, tamamen server-rendered, çalışmaya devam eder.

import { createContext, useContext, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export type QrProduct = { id: string; name: string; sale_price: number; vat_rate: number };
type CartLine = { product: QrProduct; qty: number };

const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;

const CartCtx = createContext<{ add: (p: QrProduct) => void } | null>(null);

// Menüdeki her ürün satırının sağındaki "Ekle" hapı. Sipariş katmanı yoksa (masa
// parametresi verilmemişse) server component bunu zaten hiç render etmez; yine de
// context boşsa sessizce hiçbir şey çizmiyoruz.
export function QrAddButton({ product }: { product: QrProduct }) {
  const ctx = useContext(CartCtx);
  if (!ctx) return null;
  return (
    <button
      onClick={() => ctx.add(product)}
      aria-label={`${product.name} ekle`}
      style={{
        alignSelf: "center", flexShrink: 0, border: "1px solid var(--line-2)", borderRadius: 980,
        padding: "7px 16px", background: "var(--card)", color: "var(--ink-green)",
        fontSize: 13, fontWeight: 600, lineHeight: 1,
      }}
    >Ekle</button>
  );
}

export default function QrOrderCart({
  restaurantId,
  tableId,
  tableName,
  children,
}: {
  restaurantId: string;
  tableId: string;
  tableName: string;
  children: React.ReactNode;
}) {
  // Sepet bilinçli olarak sadece sayfa state'inde — localStorage'a yazılmıyor. Karekod
  // masada duruyor, müşteri sayfayı kapattıysa yarım kalmış bir sepetin ertesi gün
  // başkasının önüne çıkması istenmez.
  const [lines, setLines] = useState<CartLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const add = (product: QrProduct) => {
    setSent(false);
    setErr(null);
    setLines((prev) => {
      const i = prev.findIndex((l) => l.product.id === product.id);
      if (i === -1) return [...prev, { product, qty: 1 }];
      const next = [...prev];
      next[i] = { ...next[i], qty: next[i].qty + 1 };
      return next;
    });
  };

  const changeQty = (productId: string, delta: number) => {
    setLines((prev) =>
      prev
        .map((l) => (l.product.id === productId ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    );
  };

  const total = lines.reduce((s, l) => s + l.qty * l.product.sale_price, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);

  // Masada açık sipariş varsa onu bulur, yoksa yenisini açar. Aynı masada iki kişi aynı
  // anda sipariş verirse "bir masada tek açık sipariş" unique indeksi (20260713140231)
  // ikinci insert'i reddeder — o durumda az önce açılmış siparişi tekrar okuyup ona ekleriz.
  const findOrCreateOrder = async (): Promise<string> => {
    const { data: open, error: readErr } = await supabase
      .from("orders").select("id").eq("table_id", tableId).eq("status", "open").maybeSingle();
    if (readErr) throw readErr;
    if (open?.id) return open.id as string;

    const { data: created, error: insErr } = await supabase
      .from("orders")
      .insert({
        restaurant_id: restaurantId, table_id: tableId, status: "open",
        channel: "dine_in", // QR da olsa salonda, masada yenen bir sipariş
        source: "qr",
        party_size: 1, // kişi sayısını müşteri bilmiyor; garson adisyonda düzeltir
      })
      .select("id").single();

    if (insErr) {
      const { data: retry } = await supabase
        .from("orders").select("id").eq("table_id", tableId).eq("status", "open").maybeSingle();
      if (retry?.id) return retry.id as string;
      throw insErr;
    }

    // Masa boş görünüyorsa doluya çekilir (kasa ekranındaki "Sipariş başlat" ile aynı davranış).
    await supabase.from("restaurant_tables").update({ status: "occupied" }).eq("id", tableId);
    return created.id as string;
  };

  const submit = async () => {
    if (busy || lines.length === 0) return;
    setBusy(true);
    setErr(null);
    try {
      const orderId = await findOrCreateOrder();
      // needs_approval=true + sent_at boş: kalem mutfağa DÜŞMEZ, adisyonda "gönderilmedi"
      // bölümünde görünür; garson/kasa onaylayıp "Gönder"e basınca mutfağa iner.
      const { error } = await supabase.from("order_items").insert(
        lines.map((l) => ({
          restaurant_id: restaurantId,
          order_id: orderId,
          menu_item_id: l.product.id,
          quantity: l.qty,
          unit_price: l.product.sale_price,
          vat_rate: l.product.vat_rate ?? 10, // menu_items.vat_rate not null default 10
          status: "active",
          needs_approval: true,
          sent_at: null,
        }))
      );
      if (error) throw error;
      setLines([]);
      setSent(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sipariş gönderilemedi, lütfen garsona bildirin.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <CartCtx.Provider value={{ add }}>
      {children}
      {/* Alttaki sabit şerit menünün son satırını kapatmasın diye pay */}
      <div style={{ height: lines.length > 0 ? 260 : 96 }} />

      <div
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 40,
          background: "var(--card)", borderTop: "1px solid var(--line)",
          boxShadow: "0 -8px 24px rgba(30,57,50,.10)",
          padding: "12px 18px calc(14px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Masa · {tableName}</span>
            {count > 0 && (
              <span className="tnum" style={{ fontSize: 12.5, color: "var(--muted)" }}>{count} ürün</span>
            )}
          </div>

          {sent && (
            <div style={{ marginTop: 8, borderRadius: 12, padding: "10px 12px", background: "var(--info-bg)", color: "var(--info)", fontSize: 13 }}>
              Siparişiniz alındı, garson onaylayacak.
            </div>
          )}

          {err && (
            <div style={{ marginTop: 8, borderRadius: 12, padding: "10px 12px", background: "var(--danger-bg)", color: "var(--danger)", fontSize: 12.5 }}>
              {err}
            </div>
          )}

          {lines.length === 0 ? (
            !sent && (
              <div style={{ marginTop: 6, fontSize: 13, color: "var(--muted-2)" }}>
                Ürünlerin yanındaki <b style={{ color: "var(--muted)" }}>Ekle</b> ile sipariş oluşturun.
              </div>
            )
          ) : (
            <>
              <div style={{ maxHeight: 168, overflowY: "auto", marginTop: 6 }}>
                {lines.map((l) => (
                  <div key={l.product.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: 14 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => changeQty(l.product.id, -1)} aria-label="azalt" style={stepBtn}>−</button>
                      <span className="tnum" style={{ minWidth: 16, textAlign: "center" }}>{l.qty}</span>
                      <button onClick={() => changeQty(l.product.id, 1)} aria-label="artır" style={stepBtn}>+</button>
                    </span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.product.name}</span>
                    <span className="tnum" style={{ flexShrink: 0, color: "var(--ink)" }}>{money(l.qty * l.product.sale_price)}</span>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "10px 0 8px" }}>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>Toplam</span>
                <span className="tnum" style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.8px", color: "var(--ink-green)" }}>{money(total)}</span>
              </div>

              <button
                onClick={submit}
                disabled={busy}
                style={{
                  border: "none", borderRadius: 980, padding: 14, width: "100%",
                  background: "var(--brand-strong)", color: "#fff", fontSize: 15, fontWeight: 500,
                  opacity: busy ? 0.6 : 1,
                }}
              >{busy ? "Gönderiliyor…" : "Sipariş ver"}</button>

              <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--muted-2)", textAlign: "center" }}>
                Sipariş garson onayından sonra mutfağa iletilir.
              </div>
            </>
          )}
        </div>
      </div>
    </CartCtx.Provider>
  );
}

const stepBtn: React.CSSProperties = {
  border: "1px solid var(--line-2)", borderRadius: "50%", width: 24, height: 24,
  background: "var(--card)", color: "var(--ink-green)", fontSize: 14, lineHeight: 1, padding: 0,
};
