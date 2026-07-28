"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { resolveRestaurantIdBySlug } from "@/lib/supabase/publicRestaurant";
import StaffLoginGate, { StaffProfileBadge } from "../components/StaffLoginGate";
import { getStaffSession } from "@/lib/supabase/staffSession";

// Mutfak/Bar ekranı (KDS v1) — garson "Gönder"e basınca buraya düşer.
// Girişsiz, tablet/ekran için (bkz. app/garson/page.tsx aynı desen). Gerçek zamanlı değil,
// birkaç saniyede bir kendini tazeler (v1 — ileride Supabase realtime'a yükseltilebilir).
// İstasyon (Mutfak/Bar/Pastane) yönlendirmesi: ürünün kendi override'ı yoksa kategorisinin
// varsayılan istasyonu kullanılır (bkz. Menü ekranı — concept_templates ile aynı katman değil,
// ayrı bir stations tablosu).

type Station = { id: string; name: string; sort_order: number };
type TableRow = { id: string; name: string };
type Card = {
  id: string; tableId: string | null; name: string; quantity: number;
  stationId: string | null; sentAt: string; preparingAt: string | null; readyAt: string | null;
  servedAt: string | null; prepMinutes: number | null;
};

const ALL = "__all__";

export default function MutfakPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--canvas)" }} />}>
      <MutfakInner />
    </Suspense>
  );
}

function MutfakInner() {
  const searchParams = useSearchParams();
  const rSlug = searchParams.get("r");
  const istasyonParam = searchParams.get("istasyon");
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [selectedStation, setSelectedStation] = useState<string>(ALL);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  // Link ?istasyon=Bar gibi bir kod taşıyorsa, ilk veri gelince sekmeyi otomatik ona kilitle
  // (bar tableti hep Bar'ı görsün, her seferinde sekmeye dokunması gerekmesin) — ama sadece bir kez,
  // kullanıcı sonradan "Tümü"ne geçerse her 4sn'lik tazelemede geri zıplamasın.
  const autoSelected = useRef(false);

  const load = useCallback(async () => {
    try {
      const rest = await resolveRestaurantIdBySlug(rSlug);
      if ("error" in rest) { setErr(rest.error); setLoading(false); return; }
      const restId = rest.id;
      setRestaurantId(restId);

      const [{ data: t, error: tErr }, { data: st, error: stErr }, { data: cats, error: cErr }, { data: items, error: iErr }, { data: orders, error: oErr }] = await Promise.all([
        supabase.from("restaurant_tables").select("id, name").eq("restaurant_id", restId).is("deleted_at", null),
        supabase.from("stations").select("id, name, sort_order").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
        supabase.from("menu_categories").select("id, default_station_id").eq("restaurant_id", restId).is("deleted_at", null),
        supabase.from("menu_items").select("id, name, category_id, station_override_id, prep_minutes").eq("restaurant_id", restId).is("deleted_at", null),
        supabase.from("orders").select("id, table_id, order_items(id, quantity, menu_item_id, status, sent_at, preparing_at, ready_at, served_at)").eq("restaurant_id", restId).eq("status", "open"),
      ]);
      const anyErr = tErr ?? stErr ?? cErr ?? iErr ?? oErr;
      if (anyErr) { setErr(anyErr.message); setLoading(false); return; }

      setTables((t as TableRow[]) ?? []);
      const stationRows = (st as Station[]) ?? [];
      setStations(stationRows);
      if (istasyonParam && !autoSelected.current) {
        const match = stationRows.find((s) => s.name.toLocaleLowerCase("tr") === istasyonParam.toLocaleLowerCase("tr"));
        if (match) { setSelectedStation(match.id); autoSelected.current = true; }
      }

      const catStation = new Map<string, string | null>();
      (cats as { id: string; default_station_id: string | null }[] ?? []).forEach((c) => catStation.set(c.id, c.default_station_id));
      const itemInfo = new Map<string, { name: string; stationId: string | null; prepMinutes: number | null }>();
      (items as { id: string; name: string; category_id: string | null; station_override_id: string | null; prep_minutes: number | null }[] ?? []).forEach((m) => {
        const stationId = m.station_override_id ?? (m.category_id ? catStation.get(m.category_id) ?? null : null);
        itemInfo.set(m.id, { name: m.name, stationId, prepMinutes: m.prep_minutes });
      });

      type OI = { id: string; quantity: number; menu_item_id: string; status: string; sent_at: string | null; preparing_at: string | null; ready_at: string | null; served_at: string | null };
      type OrderRow = { id: string; table_id: string | null; order_items: OI[] };
      const list: Card[] = [];
      ((orders as unknown as OrderRow[]) ?? []).forEach((o) => {
        o.order_items.forEach((oi) => {
          if (!(oi.status === "active" || oi.status === "ikram") || !oi.sent_at) return;
          const info = itemInfo.get(oi.menu_item_id);
          list.push({
            id: oi.id, tableId: o.table_id, name: info?.name ?? "?", quantity: oi.quantity,
            stationId: info?.stationId ?? null, sentAt: oi.sent_at, preparingAt: oi.preparing_at, readyAt: oi.ready_at,
            servedAt: oi.served_at, prepMinutes: info?.prepMinutes ?? null,
          });
        });
      });
      // Teslim edilenler ekrandan silinmiyor artık — süre/işlem bilgisi için arşiv gibi kalıyor.
      // İşlemdeki kalemler hep önde (en eski önce); teslim edilenler arkada, en son teslim en önde
      // olacak şekilde sıralanır ("yeni fiş geldikçe eskiler arkaya kayar").
      list.sort((a, b) => {
        const aDone = !!a.servedAt, bDone = !!b.servedAt;
        if (aDone !== bDone) return aDone ? 1 : -1;
        return aDone ? Date.parse(b.servedAt!) - Date.parse(a.servedAt!) : Date.parse(a.sentAt) - Date.parse(b.sentAt);
      });
      setCards(list);
      setErr(null);
      setLoading(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu.");
      setLoading(false);
    }
  }, [rSlug, istasyonParam]);

  // Veri + "şu an" (bekleme dakikası için) aynı döngüde tazelenir — ayrı bir saniyelik
  // sayaç tüm kart listesini boşuna saniyede bir yeniden çizdiriyordu, kaldırıldı.
  useEffect(() => {
    setNow(Date.now());
    load();
    const id = setInterval(() => { setNow(Date.now()); load(); }, 4000);
    return () => clearInterval(id);
  }, [load]);

  const setStage = async (id: string, field: "preparing_at" | "ready_at" | "served_at") => {
    // "Hazır" artık dogrudan update degil — stok dusumunu de atomik yapan RPC'ye baglandi.
    if (field === "ready_at") {
      const staff = getStaffSession();
      const { error } = await supabase.rpc("mark_item_ready", { p_order_item_id: id, p_staff_id: staff?.id ?? null });
      if (error) setErr(`Hazır işaretlenemedi: ${error.message}`);
      await load();
      return;
    }
    // "Teslim edildi" de RPC'ye bağlandı: "sipariş devamı"yla eklenen kalem bilerek ayrı
    // satır olarak gönderiliyordu (mutfağın kendi hazırlama takibi için); ama ikisi de teslim
    // edilince ayrı kalmalarının anlamı yok — aynı üründen adisyonda "4x Kola" ve "1x Kola"
    // diye iki satır görünüyordu. RPC, teslim ederken zaten teslim edilmiş aynı üründen bir
    // satır varsa ikisini birleştiriyor.
    if (field === "served_at") {
      const staff = getStaffSession();
      const { error } = await supabase.rpc("mark_item_served", { p_order_item_id: id, p_staff_id: staff?.id ?? null });
      if (error) setErr(`Teslim edildi işaretlenemedi: ${error.message}`);
      await load();
      return;
    }
    const patch: Record<string, string> = { [field]: new Date().toISOString() };
    // Kim hazırlamaya başladıysa (ilk gerçek aksiyon) profil/özet sayfası için etiketlenir.
    if (field === "preparing_at") {
      const staff = getStaffSession();
      if (staff) patch.prepared_by_staff_id = staff.id;
    }
    await supabase.from("order_items").update(patch).eq("id", id);
    await load();
  };

  const tableName = (id: string | null) => tables.find((t) => t.id === id)?.name ?? "?";
  const visible = selectedStation === ALL ? cards : cards.filter((c) => c.stationId === selectedStation);
  const screenTitle = selectedStation === ALL ? "Sipariş Ekranı" : stations.find((s) => s.id === selectedStation)?.name ?? "Sipariş Ekranı";
  const elapsedMin = (sentAt: string) => Math.max(0, Math.floor(((now || Date.parse(sentAt)) - Date.parse(sentAt)) / 60000));

  // Masa masa grupla — her masanın bir kartı, içinde her ürün kendi aşama butonuyla.
  const byTable = new Map<string, Card[]>();
  visible.forEach((c) => {
    const key = c.tableId ?? "__yok__";
    (byTable.get(key) ?? byTable.set(key, []).get(key)!).push(c);
  });
  const tableGroups = Array.from(byTable.entries())
    .map(([tableId, items]) => {
      const pending = items.filter((i) => !i.servedAt);
      const preps = pending.map((i) => i.prepMinutes).filter((p): p is number => p != null);
      const oldestPendingAt = pending.length ? Math.min(...pending.map((i) => Date.parse(i.sentAt))) : null;
      const firstSentAt = Math.min(...items.map((i) => Date.parse(i.sentAt)));
      return { tableId, items, pendingCount: pending.length, oldestPendingAt, firstSentAt, maxPrep: preps.length ? Math.max(...preps) : null };
    })
    // Masa, ilk siparişin geldiği andaki sırada sabit kalır: tüm kalemler teslim edilse bile
    // (hesap gerçekten kapanana kadar) yeri değişmez, listenin sonuna atlamaz — mutfak "az önce
    // baktığım masa nerede" diye aramasın. Yeni masa her zaman en sona eklenir.
    .sort((a, b) => a.firstSentAt - b.firstSentAt);
  // Mutfak açısından "kapanmış" = tüm kalemleri teslim edilmiş adisyon. Hesabı gerçekten
  // kapanan adisyon bu ekrana zaten hiç düşmez (sorgu yalnızca status='open' çekiyor),
  // o yüzden buradaki ayrım "işim bitti mi" ayrımıdır.
  const kapanmamisSayi = tableGroups.filter((g) => g.pendingCount > 0).length;
  const kapanmisSayi = tableGroups.length - kapanmamisSayi;
  // Bir masanın tüm ürünleri aynı anda çıksın diye: en uzun pişme süresi olan ürün hemen başlar,
  // kısa sürenler o kadar geç başlar ki hepsi birlikte biter. Sadece bilgi amaçlı — buton kilitlenmez.
  const startHint = (c: Card, maxPrep: number | null): string | null => {
    if (c.prepMinutes == null || maxPrep == null) return null;
    const startAt = Date.parse(c.sentAt) + (maxPrep - c.prepMinutes) * 60000;
    const diffMin = Math.round(((now || Date.now()) - startAt) / 60000);
    return diffMin >= 0 ? "Şimdi başlat" : `${-diffMin} dk sonra başlat`;
  };

  return (
    <StaffLoginGate restaurantId={restaurantId} roles={["mutfak", "bar"]}>
    {/* Ekran yüksekliği sabit: adisyon şeridi yatayda kayar, sayfa dikeyde kaymaz.
        Mutfakta tablet duvarda/tezgâhta sabit durduğu için aşağı kaydırmak zor — iş
        alta düşmesin, sağa doğru dizilsin. */}
    <div style={{ height: "100vh", background: "var(--canvas)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <div style={{ padding: "18px 16px 16px", display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18, minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.4px", color: "var(--ink-green)", flexShrink: 0 }}>{screenTitle}</div>
            {/* Sayaçlar uzaktan okunacak: mutfaktaki kişi ekrana yaklaşmadan "kaç iş var"
                görebilmeli, o yüzden rakamlar büyük ve etiketler küçük. */}
            {!loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
                <Sayac n={kapanmamisSayi} l="kapanmamış" renk={kapanmamisSayi > 0 ? "var(--ink-green)" : "var(--muted-2)"} />
                <Sayac n={kapanmisSayi} l="kapanmış" renk="var(--muted-2)" />
                <Sayac n={visible.filter((c) => !c.servedAt).length} l="bekleyen kalem" renk="var(--muted)" />
              </div>
            )}
            {loading && <div style={{ fontSize: 13, color: "var(--muted)" }}>Yükleniyor…</div>}
          </div>
          <StaffProfileBadge restaurantId={restaurantId} />
        </div>
        {err && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 12, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13, flexShrink: 0 }}>{err}</div>}

        {stations.length > 0 && (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", marginTop: 14, paddingBottom: 2, flexShrink: 0 }}>
            <button onClick={() => setSelectedStation(ALL)} style={tabBtn(selectedStation === ALL)}>Tümü</button>
            {stations.map((s) => (
              <button key={s.id} onClick={() => setSelectedStation(s.id)} style={tabBtn(selectedStation === s.id)}>{s.name}</button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 16, flex: 1, minHeight: 0, overflowX: "auto", overflowY: "hidden", alignItems: "stretch", paddingBottom: 6 }}>
          {tableGroups.map((g) => {
            const oldestMin = g.oldestPendingAt != null ? Math.max(0, Math.floor(((now || g.oldestPendingAt) - g.oldestPendingAt) / 60000)) : null;
            const bitti = g.pendingCount === 0;
            return (
              <div key={g.tableId} style={{
                borderRadius: 16, padding: 16, background: "var(--card)",
                // Biten adisyon soluklaşır ama yerinde kalır — sıra bozulmadan "bu bitti" der.
                border: `1px solid ${bitti ? "var(--line)" : "var(--brand)"}`,
                boxShadow: "0 1px 2px rgba(30,57,50,.05), 0 6px 16px rgba(30,57,50,.07)",
                flexShrink: 0, width: 292, boxSizing: "border-box",
                display: "flex", flexDirection: "column", minHeight: 0, opacity: bitti ? 0.62 : 1,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: 15, color: "var(--ink-green)" }}>{tableName(g.tableId === "__yok__" ? null : g.tableId)}</span>
                  <span className="tnum" style={{ fontSize: 12, color: oldestMin != null && oldestMin >= 10 ? "var(--danger)" : "var(--muted)" }}>
                    {oldestMin != null ? `${oldestMin} dk` : "✓ Tamamlandı"}
                  </span>
                </div>
                {/* Kalem çoksa kart kendi içinde dikey kayar; şerit yataylığını bozmaz. */}
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {g.items.map((c) => {
                  const stage = c.servedAt ? "teslim" : c.readyAt ? "hazir" : c.preparingAt ? "hazirlaniyor" : "yeni";
                  const mins = elapsedMin(c.sentAt);
                  const hint = stage === "yeni" ? startHint(c, g.maxPrep) : null;
                  // Süresi olan üründe (pizza, kahve gibi) kırmızıya dönme eşiği kendi süresi;
                  // hazır üründe (prepMinutes yok — kutu kola gibi) genel "çok bekledi" eşiği (10dk),
                  // çünkü onun için gösterilecek bir hedef süre yok.
                  const overdue = stage !== "teslim" && (c.prepMinutes != null ? mins >= c.prepMinutes : mins >= 10);
                  const servedMins = c.servedAt ? Math.max(0, Math.round((Date.parse(c.servedAt) - Date.parse(c.sentAt)) / 60000)) : null;
                  return (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--line)", opacity: stage === "teslim" ? 0.5 : 1 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14 }}><span className="tnum">{c.quantity}×</span> {c.name}</div>
                        {stage === "teslim" ? (
                          <div className="tnum" style={{ fontSize: 11, color: "var(--muted-2)" }}>✓ Teslim edildi · {servedMins} dk</div>
                        ) : (
                          <div className="tnum" style={{ fontSize: 11, color: overdue ? "var(--danger)" : "var(--muted-2)" }}>
                            {mins} dk{c.prepMinutes != null && ` / ${c.prepMinutes} dk`}
                            {hint && <span style={{ color: hint === "Şimdi başlat" ? "var(--brand)" : "var(--muted-2)", fontWeight: hint === "Şimdi başlat" ? 700 : 400 }}> · {hint}</span>}
                          </div>
                        )}
                      </div>
                      {/* Hazır ürün (kutu kola vb.): "Hazırlanıyor" aşaması hiç yaşanmaz — koyan kişi
                          tek tıkla direkt Hazır der, stok o an düşer (mark_item_ready). */}
                      {stage === "yeni" && (c.prepMinutes == null
                        ? <button onClick={() => setStage(c.id, "ready_at")} style={stageBtnSm}>Hazır</button>
                        : <button onClick={() => setStage(c.id, "preparing_at")} style={stageBtnSm}>Hazırlanıyor</button>)}
                      {stage === "hazirlaniyor" && <button onClick={() => setStage(c.id, "ready_at")} style={stageBtnSm}>Hazır</button>}
                      {stage === "hazir" && <button onClick={() => setStage(c.id, "served_at")} style={{ ...stageBtnSm, background: "var(--brand-strong)" }}>Teslim edildi</button>}
                    </div>
                  );
                })}
                </div>
              </div>
            );
          })}
          {!loading && !err && tableGroups.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13 }}>Bekleyen kalem yok.</div>}
        </div>
      </div>
    </div>
    </StaffLoginGate>
  );
}

// Başlıktaki sayaç: rakam büyük, etiket küçük — mutfakta ekrana bakan kişi uzaktan okusun.
function Sayac({ n, l, renk }: { n: number; l: string; renk: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
      <span className="tnum" style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.5px", color: renk, lineHeight: 1 }}>{n}</span>
      <span style={{ fontSize: 12, color: "var(--muted)" }}>{l}</span>
    </div>
  );
}

const tabBtn = (active: boolean): React.CSSProperties => ({
  flexShrink: 0, border: "none", borderRadius: 980, padding: "8px 16px", fontSize: 13, fontWeight: 600,
  background: active ? "var(--ink-green)" : "var(--card)", color: active ? "#fff" : "var(--ink-green)",
});
const stageBtnSm: React.CSSProperties = { flexShrink: 0, border: "none", borderRadius: 980, padding: "7px 12px", background: "var(--ink-green)", color: "#fff", fontSize: 12.5, fontWeight: 500 };
