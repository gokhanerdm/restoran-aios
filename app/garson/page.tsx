"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { resolveRestaurantIdBySlug } from "@/lib/supabase/publicRestaurant";
import TableOrderPanel from "../components/TableOrderPanel";
import StaffLoginGate, { StaffProfileBadge } from "../components/StaffLoginGate";

// Garson mobil modülü — el terminali/telefon için tek işi var: masa seç, sipariş al, hesap kapat.
// Salonlar ekranındaki AYNI salon/masa yapısını kullanır (dining_areas + restaurant_tables.area_id)
// ki garson PC'deki kat planında ne görüyorsa telefonda da onu görsün. Yönetim ekranlarının
// (Raporlar, Stok, Ayarlar vb.) hiçbiri burada yok (bkz. Shell.tsx yönlendirmesi); masa ekleme
// işleri Salonlar'da (PC) kalır, burada sadece sipariş alınır.
// PIN ile giriş (StaffLoginGate) — hangi garsonun ne yaptığı böyle etiketleniyor.

type Area = { id: string; name: string; sort_order: number };
type TableStatus = "empty" | "occupied" | "bill_requested" | "reserved";
type TableRow = {
  id: string; name: string; area_id: string | null; status: TableStatus;
  reservation_note: string | null; merged_into_table_id: string | null;
};
type OrderItem = { id: string; quantity: number; unit_price: number; status: string; sent_at: string | null; ready_at: string | null; served_at: string | null };
type Order = { id: string; table_id: string | null; order_items: OrderItem[] };

const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;
const ALL = "__all__";

// Mutfak/bar bir kalemi "hazır" işaretlediğinde garsona haber verir — kısa bir bip sesi.
// Dosya yok, tarayıcının kendi ses üretme yeteneğiyle (Web Audio API) anlık üretilir.
//
// Tarayıcılar, kullanıcı sayfaya hiç dokunmadan otomatik ses çalınmasını güvenlik amacıyla
// engeller (autoplay policy). Bu yüzden ses bağlamını (AudioContext) her bipte sıfırdan
// açmak yerine, sayfadaki İLK dokunuşta bir kere açıp "kilidini kaldırıyoruz", sonraki
// bildirimlerde hep aynı (zaten izinli) bağlamı kullanıyoruz.
let sharedAudioCtx: AudioContext | null = null;
function getAudioCtxCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null;
}
function unlockAudio() {
  const Ctx = getAudioCtxCtor();
  if (!Ctx) return;
  if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
  if (sharedAudioCtx.state === "suspended") sharedAudioCtx.resume().catch(() => {});
}
function playReadyBeep() {
  try {
    const ctx = sharedAudioCtx;
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    }
  } catch { /* tarayıcı Web Audio'yu desteklemiyor/engelliyor olabilir — sessizce geç */ }
  // Titreşim: Android Chrome'da çalışır, iOS Safari desteklemiyor (Apple kısıtlaması) — zararsız no-op.
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

export default function GarsonPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--canvas)" }} />}>
      <GarsonInner />
    </Suspense>
  );
}

function GarsonInner() {
  const rSlug = useSearchParams().get("r");
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [areas, setAreas] = useState<Area[]>([]);
  const [tables, setTables] = useState<TableRow[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  // null = henüz seçim yapılmadı → ilk salon varsayılan olur (Salonlar ekranıyla aynı davranış)
  const [selectedAreaId, setSelectedAreaId] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  // Masa birleştirme — Kasa (PC) ile aynı akış: birleştir moduna gir, iki masaya sırayla dokun,
  // hangisinde birleşeceğini seç (bkz. transfer_table_order RPC).
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeFirst, setMergeFirst] = useState<string | null>(null);
  const [mergeChoice, setMergeChoice] = useState<{ a: TableRow; b: TableRow } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  // Zaten bip çaldığımız "hazır" kalemleri hatırlar ki her 5sn'lik tazelemede aynı kalem için
  // tekrar tekrar ses çalmayalım — sadece yeni hazır olan kalemde bir kere çalar.
  const notifiedReady = useRef<Set<string>>(new Set());
  // Beklenmeyen JS hatalarını sessizce yutmak yerine ekranda göster (mobil ağ sorunlarını teşhis etmeyi kolaylaştırır).
  useEffect(() => {
    const onErr = (e: ErrorEvent) => setErr(`JS hatası: ${e.message}`);
    const onRej = (e: PromiseRejectionEvent) => setErr(`Yakalanmamış hata: ${e.reason?.message ?? e.reason}`);
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);

  // "Hazır" bip sesi otomatik çalabilsin diye, sayfadaki ilk dokunuşta ses iznini bir kere alır
  // (masa seçmek, sipariş girmek gibi normal kullanım zaten bunu tetikler).
  useEffect(() => {
    const onFirstTouch = () => { unlockAudio(); document.removeEventListener("pointerdown", onFirstTouch); };
    document.addEventListener("pointerdown", onFirstTouch);
    return () => document.removeEventListener("pointerdown", onFirstTouch);
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    // Ağ isteği hiç cevap vermeden asılı kalırsa (bağlantı sorunu) 10sn sonra hata göster —
    // aksi halde "Yükleniyor…" sonsuza kadar takılı kalıyordu.
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Bağlantı zaman aşımına uğradı — internete bağlı mısın?")), 10000));
    try {
      const rest = await Promise.race([resolveRestaurantIdBySlug(rSlug), timeout]);
      if ("error" in rest) { setErr(rest.error); setLoading(false); return; }
      setRestaurantId(rest.id);
      const [{ data: a, error: aErr }, { data: t, error: tErr }, { data: o, error: oErr }] = await Promise.race([
        Promise.all([
          supabase.from("dining_areas").select("id, name, sort_order").eq("restaurant_id", rest.id).is("deleted_at", null).order("sort_order"),
          supabase.from("restaurant_tables").select("id, name, area_id, status, reservation_note, merged_into_table_id").eq("restaurant_id", rest.id).is("deleted_at", null).order("sort_order"),
          supabase.from("orders").select("id, table_id, order_items(id, quantity, unit_price, status, sent_at, ready_at, served_at)").eq("restaurant_id", rest.id).eq("status", "open"),
        ]),
        timeout,
      ]);
      if (aErr || tErr || oErr) { setErr(`Masalar çekilemedi: ${(aErr ?? tErr ?? oErr)?.message}`); setLoading(false); return; }
      const areaRows = (a as Area[]) ?? [];
      setAreas(areaRows);
      setSelectedAreaId((prev) => prev ?? (areaRows.length ? areaRows[0].id : ALL));
      // "Öksüz" masaları at: area_id dolu ama o alan silinmişse (Salonlar ekranı da bunları hiç göstermez).
      const areaIds = new Set(areaRows.map((x) => x.id));
      setTables(((t as TableRow[]) ?? []).filter((row) => row.area_id && areaIds.has(row.area_id)));
      const orderRows = (o as unknown as Order[]) ?? [];
      setOrders(orderRows);

      // Yeni hazır olmuş (daha önce bip çalmadığımız) kalem var mı — varsa uyar, yoksa sessiz kal.
      let hasNewReady = false;
      orderRows.forEach((ord) => ord.order_items.forEach((it) => {
        if (it.ready_at && !it.served_at) {
          if (!notifiedReady.current.has(it.id)) { notifiedReady.current.add(it.id); hasNewReady = true; }
        } else {
          notifiedReady.current.delete(it.id);
        }
      }));
      if (hasNewReady) playReadyBeep();
      setLoading(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu.");
      setLoading(false);
    }
  }, [rSlug]);

  // Mutfak/bar'ın "hazır" işaretlemesini fark edebilmek için birkaç saniyede bir kendini tazeler
  // (mutfak ekranıyla aynı desen — gerçek zamanlı değil, basit periyodik yenileme).
  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  const orderForTable = (tableId: string) => orders.find((o) => o.table_id === tableId) ?? null;
  const orderTotal = (order: Order | null) =>
    order ? order.order_items.filter((i) => i.status === "active").reduce((s, i) => s + i.quantity * i.unit_price, 0) : 0;
  // Mutfak/bar'a gönderilmiş ama henüz servis edilmemiş kalemler arasında kaçı "hazır" —
  // garson bununla kaçının çıktığını, kaçının hâlâ beklendiğini görüp servisini kendi ayarlar.
  const readyProgress = (order: Order | null) => {
    if (!order) return null;
    const pending = order.order_items.filter((i) => i.status === "active" && i.sent_at && !i.served_at);
    const ready = pending.filter((i) => i.ready_at);
    return ready.length > 0 ? { ready: ready.length, total: pending.length } : null;
  };

  // Masa başka bir masaya birleştirildiyse hesabın açık olduğu hedef masayı bul (Salonlar ile aynı mantık).
  const resolveTarget = (t: TableRow): TableRow => {
    let cur = t;
    const seen = new Set<string>();
    while (cur.merged_into_table_id && !seen.has(cur.id)) {
      seen.add(cur.id);
      const next = tables.find((x) => x.id === cur.merged_into_table_id);
      if (!next) break;
      cur = next;
    }
    return cur;
  };

  const mergeInto = async (sourceId: string, targetId: string) => {
    setErr(null);
    const { error } = await supabase.rpc("transfer_table_order", { p_source_table_id: sourceId, p_target_table_id: targetId });
    if (error) { setErr(error.message); return; }
    setMergeChoice(null);
    await load();
  };

  const handleTableClick = (t: TableRow) => {
    if (mergeMode) {
      if (!mergeFirst) { setMergeFirst(t.id); return; }
      if (mergeFirst === t.id) { setMergeFirst(null); return; }
      const a = tables.find((x) => x.id === mergeFirst);
      if (a) { setMergeChoice({ a, b: t }); setMergeMode(false); setMergeFirst(null); }
      return;
    }
    setSelectedTableId(resolveTarget(t).id);
  };

  const visibleTables = selectedAreaId === ALL ? tables : tables.filter((t) => t.area_id === selectedAreaId);
  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;
  const doluSayisi = tables.filter((t) => t.status !== "empty" && !t.merged_into_table_id).length;

  return (
    <StaffLoginGate restaurantId={restaurantId} roles={["garson"]}>
    {/* Sayfanın kendisi kaymaz (PAGE_STANDARDS #1) — sadece masa ızgarası ekranı doldurunca kendi
        içinde kayar. Sabit height + overflow:hidden dışarıda, flex:1 + overflowY:auto içeride. */}
    <div style={{ height: "100dvh", background: "var(--canvas)", display: "flex", flexDirection: "column", overflow: "hidden", boxSizing: "border-box" }}>
      <div style={{ padding: "calc(18px + env(safe-area-inset-top, 0px)) 16px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.4px", color: "var(--ink-green)" }}>Siparişler</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>{loading ? "Yükleniyor…" : `${doluSayisi} masa dolu`}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {err && <button onClick={() => { setLoading(true); load(); }} style={{ border: "1px solid var(--line-2)", borderRadius: 980, padding: "7px 14px", background: "var(--card)", color: "var(--ink-green)", fontSize: 12.5, fontWeight: 600 }}>Yenile</button>}
            <StaffProfileBadge restaurantId={restaurantId} />
          </div>
        </div>
        {err && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 12, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13 }}>{err}</div>}

        {areas.length > 0 && (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", marginTop: 14, paddingBottom: 2 }}>
            <button
              onClick={() => setSelectedAreaId(ALL)}
              style={{ flexShrink: 0, border: "none", borderRadius: 980, padding: "8px 16px", fontSize: 13, fontWeight: 600, background: selectedAreaId === ALL ? "var(--ink-green)" : "var(--card)", color: selectedAreaId === ALL ? "#fff" : "var(--ink-green)" }}
            >Tümü</button>
            {areas.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelectedAreaId(a.id)}
                style={{ flexShrink: 0, border: "none", borderRadius: 980, padding: "8px 16px", fontSize: 13, fontWeight: 600, background: selectedAreaId === a.id ? "var(--ink-green)" : "var(--card)", color: selectedAreaId === a.id ? "#fff" : "var(--ink-green)" }}
              >{a.name}</button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
          <span />
          <button
            onClick={() => { setMergeMode((m) => !m); setMergeFirst(null); }}
            style={{ border: "none", borderRadius: 980, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, background: mergeMode ? "var(--ink-green)" : "var(--card)", color: mergeMode ? "#fff" : "var(--ink-green)" }}
          >{mergeMode ? "Birleştirmeyi iptal et" : "Masa birleştir"}</button>
        </div>
        {mergeMode && <div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 6 }}>İki masaya sırayla dokun, sonra hangisinde birleşeceğini seç.</div>}
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "0 16px 24px", touchAction: "pan-y", overscrollBehavior: "contain" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))", gap: 10, marginTop: 16 }}>
          {visibleTables.map((t) => {
            const ord = orderForTable(t.id);
            const total = orderTotal(ord);
            const merged = !!t.merged_into_table_id;
            const occupied = t.status === "occupied" || t.status === "bill_requested";
            const bill = t.status === "bill_requested";
            const reserved = t.status === "reserved";
            const dotColor = merged ? "var(--muted-2)" : bill ? "var(--gold)" : occupied ? "var(--brand)" : reserved ? "var(--info)" : "var(--muted-2)";
            const progress = !merged ? readyProgress(ord) : null;
            const ready = !!progress;
            const mergeSelected = mergeMode && mergeFirst === t.id;
            return (
              <button
                key={t.id}
                onClick={() => handleTableClick(t)}
                style={{
                  textAlign: "left", borderRadius: 16, padding: 14, height: 108, boxSizing: "border-box",
                  display: "flex", flexDirection: "column",
                  border: mergeSelected ? "2px solid var(--gold)" : ready ? "2px solid var(--brand-strong)" : "none",
                  background: merged ? "var(--recede)" : occupied ? "var(--card)" : reserved ? "var(--info-bg)" : "var(--recede)",
                  boxShadow: ready ? "0 0 0 3px var(--success-bg), 0 6px 16px rgba(30,57,50,.12)" : occupied && !merged ? "0 1px 2px rgba(30,57,50,.05), 0 6px 16px rgba(30,57,50,.07)" : "none",
                  opacity: merged ? 0.6 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, fontSize: 14, color: occupied ? "var(--ink)" : "var(--muted-2)" }}>{t.name}</span>
                </div>
                {merged ? (
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 12 }}>→ {tables.find((x) => x.id === t.merged_into_table_id)?.name ?? "?"}</div>
                ) : occupied ? (
                  <>
                    <div className="tnum" style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.3px", color: "var(--ink-green)", marginTop: 14 }}>{money(total)}</div>
                    <div style={{ fontSize: 11.5, color: ready ? "var(--success)" : bill ? "var(--gold-text)" : "var(--muted)", marginTop: 3, fontWeight: ready ? 700 : 400 }}>{progress ? (progress.ready === progress.total ? "Hazır — servis et" : `${progress.ready}/${progress.total} ürün hazır`) : bill ? "hesap istedi" : "açık"}</div>
                  </>
                ) : reserved ? (
                  <div style={{ fontSize: 11.5, color: "var(--info)", marginTop: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.reservation_note || "Rezerve"}</div>
                ) : (
                  <div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 26 }}>Boş</div>
                )}
              </button>
            );
          })}
          {!loading && !err && visibleTables.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, gridColumn: "1 / -1" }}>Bu salonda henüz masa yok.</div>}
        </div>
      </div>

      {selectedTable && (
        <>
          <div
            className="backdrop-fade-in"
            onClick={() => setSelectedTableId(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", zIndex: 40 }}
          />
          <div className="sheet-slide-up" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 50 }}>
            <TableOrderPanel
              variant="sheet"
              restaurantId={restaurantId}
              table={{ id: selectedTable.id, name: selectedTable.name, status: selectedTable.status }}
              onChanged={load}
              onClosed={() => setSelectedTableId(null)}
            />
          </div>
        </>
      )}

      {mergeChoice && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(30,25,15,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 55 }} onClick={() => setMergeChoice(null)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, minWidth: 280, maxWidth: "88vw" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--ink-green)" }}>Hangi masada birleşsin?</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14 }}>{mergeChoice.a.name} ve {mergeChoice.b.name} birleşecek.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => mergeInto(mergeChoice.b.id, mergeChoice.a.id)} style={{ ...pillPrimary, flex: 1, padding: 12, fontSize: 14 }}>{mergeChoice.a.name}</button>
              <button onClick={() => mergeInto(mergeChoice.a.id, mergeChoice.b.id)} style={{ ...pillPrimary, flex: 1, padding: 12, fontSize: 14 }}>{mergeChoice.b.name}</button>
            </div>
            <button onClick={() => setMergeChoice(null)} style={{ ...pillSecondary, width: "100%", marginTop: 12, padding: 12, fontSize: 14 }}>İptal</button>
          </div>
        </div>
      )}
    </div>
    </StaffLoginGate>
  );
}

const pillPrimary: React.CSSProperties = { border: "none", borderRadius: 980, background: "var(--brand-strong)", color: "#fff", fontWeight: 500 };
const pillSecondary: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, background: "var(--card)", color: "var(--ink-green)" };
