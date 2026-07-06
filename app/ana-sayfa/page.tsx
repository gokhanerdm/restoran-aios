"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";

type Summary = { ciro: number; maliyet: number; adisyon: number };
type PrepReport = {
  tarih: string;
  resmi_tatil: boolean;
  beklenen_musteri: number;
  gecen_hafta_ayni_gun: number;
  kritik_stoklar: { malzeme: string; mevcut: number; par_seviye: number }[];
};

const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;
const bugunIstanbul = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

export default function AnaSayfa() {
  const [restaurantName, setRestaurantName] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [prep, setPrep] = useState<PrepReport | null>(null);
  const [openTables, setOpenTables] = useState(0);
  const [openTotal, setOpenTotal] = useState(0);

  const load = useCallback(async () => {
    const { data: rest } = await supabase
      .from("restaurants").select("id, name").is("deleted_at", null).limit(1).single();
    if (!rest) return;
    setRestaurantName(rest.name);

    const [{ data: sum }, { data: rep }, { data: tables }, { data: orders }] = await Promise.all([
      supabase.rpc("daily_summary", { p_restaurant: rest.id, p_date: bugunIstanbul() }),
      supabase.rpc("daily_prep_report", { p_restaurant: rest.id }),
      supabase.from("restaurant_tables").select("status").eq("restaurant_id", rest.id).is("deleted_at", null),
      supabase.from("orders").select("id, order_items(quantity, unit_price, status)").eq("restaurant_id", rest.id).eq("status", "open"),
    ]);

    setSummary(sum as Summary);
    setPrep(rep as PrepReport);
    setOpenTables((tables ?? []).filter((t: { status: string }) => t.status !== "empty").length);
    const total = (orders ?? []).reduce((s: number, o: { order_items: { quantity: number; unit_price: number; status: string }[] }) =>
      s + o.order_items.filter((i) => i.status === "active").reduce((s2, i) => s2 + i.quantity * i.unit_price, 0), 0);
    setOpenTotal(total);
  }, []);

  useEffect(() => { load(); }, [load]);

  const kar = summary ? summary.ciro - summary.maliyet : 0;
  const kritikSayisi = prep?.kritik_stoklar.length ?? 0;

  return (
    <div style={{ padding: "26px 28px" }}>
      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)" }}>
        {restaurantName || "Ana sayfa"}
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, marginBottom: 20 }}>
        Bugün · {bugunIstanbul()}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <Link href="/gun-sonu" style={card}>
          <div style={cardLabel}>Bugünkü ciro</div>
          <div className="tnum" style={cardValue}>{money(summary?.ciro ?? 0)}</div>
        </Link>
        <Link href="/gun-sonu" style={{ ...card, background: "var(--brand-strong)" }}>
          <div style={{ ...cardLabel, color: "rgba(255,255,255,0.8)" }}>Net kâr</div>
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

      <div style={{ display: "flex", gap: 16, marginTop: 16 }}>
        <div style={{ flex: 1, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 20 }}>
          <div style={{ fontWeight: 600, color: "var(--ink-green)", marginBottom: 12 }}>Yarının hazırlığı</div>
          {prep ? (
            <>
              <div style={{ fontSize: 14, marginBottom: 6 }}>
                Beklenen müşteri: <b className="tnum">{prep.beklenen_musteri}</b>
                <span style={{ color: "var(--muted)" }}> · geçen hafta aynı gün: </span>
                <b className="tnum">{prep.gecen_hafta_ayni_gun}</b>
              </div>
              {prep.resmi_tatil && (
                <div style={{ fontSize: 13, color: "var(--gold-text)", marginTop: 4 }}>Yarın resmi tatil — talep farklı olabilir.</div>
              )}
              {!prep.resmi_tatil && prep.beklenen_musteri === 0 && prep.gecen_hafta_ayni_gun === 0 && (
                <div style={{ fontSize: 13, color: "var(--muted-2)", marginTop: 4 }}>Tahmin için yeterli geçmiş veri henüz yok.</div>
              )}
            </>
          ) : (
            <div style={{ color: "var(--muted-2)", fontSize: 13 }}>Yükleniyor…</div>
          )}
        </div>

        <div style={{ flex: 1, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 20 }}>
          <div style={{ fontWeight: 600, color: "var(--ink-green)", marginBottom: 12 }}>Kritik stoklar</div>
          {kritikSayisi === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13 }}>Kritik seviyede malzeme yok.</div>}
          {prep?.kritik_stoklar.slice(0, 5).map((k) => (
            <div key={k.malzeme} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
              <span>{k.malzeme}</span>
              <span className="tnum" style={{ color: "var(--gold-text)" }}>{k.mevcut} / {k.par_seviye}</span>
            </div>
          ))}
          {kritikSayisi > 5 && (
            <Link href="/stok" style={{ fontSize: 12.5, color: "var(--brand)", display: "block", marginTop: 8 }}>
              +{kritikSayisi - 5} tane daha — Stok'a git
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  display: "block", textDecoration: "none", background: "var(--card)", border: "1px solid var(--line)",
  borderRadius: 18, padding: 18,
};
const cardLabel: React.CSSProperties = { fontSize: 13, color: "var(--muted)" };
const cardValue: React.CSSProperties = { fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", marginTop: 6 };
