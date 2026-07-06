"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type Urun = { name: string; kar: number };
type Kanal = { channel: string; ciro: number };
type Ozet = { ciro: number; maliyet: number; adisyon: number; kanal: Kanal[]; urunler: Urun[] };

const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;
const kanalAd: Record<string, string> = {
  dine_in: "Salon",
  paket: "Paket",
  yemeksepeti: "Yemeksepeti",
  getir: "Getir",
  trendyol: "Trendyol",
};
const bugunIstanbul = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

export default function GunSonu() {
  const [ozet, setOzet] = useState<Ozet | null>(null);
  const [tarih, setTarih] = useState("");

  const load = useCallback(async () => {
    const { data: rest } = await supabase
      .from("restaurants")
      .select("id")
      .is("deleted_at", null)
      .limit(1)
      .single();
    if (!rest) return;
    const gun = bugunIstanbul();
    setTarih(gun);
    const { data } = await supabase.rpc("daily_summary", { p_restaurant: rest.id, p_date: gun });
    setOzet(data as Ozet);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const kar = ozet ? ozet.ciro - ozet.maliyet : 0;
  const enCok = ozet ? ozet.urunler.slice(0, 3) : [];
  const enAz = ozet ? [...ozet.urunler].slice(-3).reverse() : [];

  return (
    <div style={{ padding: "26px 28px", maxWidth: 920 }}>
      <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>
            Gün sonu
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 7 }}>
            {tarih} · {ozet?.adisyon ?? 0} adisyon
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 20 }}>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Ciro</div>
          <div className="tnum" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.6px", color: "var(--ink-green)", marginTop: 8 }}>
            {money(ozet?.ciro ?? 0)}
          </div>
        </div>
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 20 }}>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>Maliyet</div>
          <div className="tnum" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.6px", color: "var(--ink-green)", marginTop: 8 }}>
            {money(ozet?.maliyet ?? 0)}
          </div>
        </div>
        <div style={{ background: "var(--brand-strong)", borderRadius: 18, padding: 20 }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>Net kâr</div>
          <div className="tnum" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.6px", color: "#fff", marginTop: 8 }}>
            {money(kar)}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 12 }}>
        {(ozet?.kanal ?? []).map((k) => `${kanalAd[k.channel] ?? k.channel} ${money(k.ciro)}`).join("  ·  ")}
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 22, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 10, color: "var(--ink-green)" }}>En çok kazandıran</div>
          {enCok.map((u) => (
            <div key={u.name} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--line)", fontSize: 14 }}>
              <span>{u.name}</span>
              <span className="tnum" style={{ color: "var(--brand)" }}>+{money(u.kar)}</span>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 260, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 10, color: "var(--ink-green)" }}>En az kazandıran</div>
          {enAz.map((u) => (
            <div key={u.name} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--line)", fontSize: 14 }}>
              <span>{u.name}</span>
              <span className="tnum" style={{ color: u.kar < 0 ? "var(--gold-text)" : "var(--muted)" }}>
                {u.kar < 0 ? "" : "+"}
                {money(u.kar)}
                {u.kar < 0 ? " zarar" : ""}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16, background: "#FBF2E1", border: "1px solid #EDD8AE", borderRadius: 18, padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--gold-text)" }}>Fire / kaçak radarı</div>
        <div style={{ fontSize: 14, color: "var(--gold-text)", marginTop: 6, lineHeight: 1.6 }}>
          Sayım girildiğinde aktifleşir: reçeteye göre olması gereken stok ile gerçek sayım
          karşılaştırılır, tolerans aşımı kaçak olarak gösterilir.
        </div>
      </div>
    </div>
  );
}
