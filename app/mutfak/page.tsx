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
// Servis sırası (ROADMAP §O5): course_no'su olup henüz garson tarafından serbest bırakılmamış
// (sent_at boş) kalemler — mutfak bunları SOLUK, işlem yapılamaz halde görür (hazırlığa
// başlayabilsinler diye, ör. salata kesmeye), gerçek "Hazır/Teslim" akışına giremezler.
type PendingCourseItem = { id: string; tableId: string | null; name: string; quantity: number; courseNo: number };
// Personel yemeği — masada değil mutfaktan girilir (Gökhan: "personel yemeğinin masada
// ne işi var"). Stoktan aynı anda düşer (mark_item_ready), satışa değil gidere yazılır
// (bkz. Kasa ekranı "Personel yemeği (maliyet)" satırı).
type MealItem = { id: string; name: string; sale_price: number };
type StaffOpt = { id: string; full_name: string };

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
  const [pendingCourse, setPendingCourse] = useState<PendingCourseItem[]>([]);
  const [selectedStation, setSelectedStation] = useState<string>(ALL);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [mealItems, setMealItems] = useState<MealItem[]>([]);
  const [staffOpts, setStaffOpts] = useState<StaffOpt[]>([]);
  const [mealOpen, setMealOpen] = useState(false);
  const [mealItemId, setMealItemId] = useState("");
  const [mealStaffId, setMealStaffId] = useState("");
  const [mealQty, setMealQty] = useState("1");
  const [mealBusy, setMealBusy] = useState(false);
  const [mealDone, setMealDone] = useState<string | null>(null);
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

      const [{ data: t, error: tErr }, { data: st, error: stErr }, { data: cats, error: cErr }, { data: items, error: iErr }, { data: orders, error: oErr }, { data: staffRows }] = await Promise.all([
        supabase.from("restaurant_tables").select("id, name").eq("restaurant_id", restId).is("deleted_at", null),
        supabase.from("stations").select("id, name, sort_order").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
        supabase.from("menu_categories").select("id, default_station_id").eq("restaurant_id", restId).is("deleted_at", null),
        supabase.from("menu_items").select("id, name, category_id, station_override_id, prep_minutes, sale_price, is_active").eq("restaurant_id", restId).is("deleted_at", null),
        supabase.from("orders").select("id, table_id, order_items(id, quantity, menu_item_id, status, sent_at, preparing_at, ready_at, served_at, course_no)").eq("restaurant_id", restId).eq("status", "open"),
        supabase.from("staff_members").select("id, full_name").eq("restaurant_id", restId).eq("active", true).is("deleted_at", null).order("full_name"),
      ]);
      const anyErr = tErr ?? stErr ?? cErr ?? iErr ?? oErr;
      if (anyErr) { setErr(anyErr.message); setLoading(false); return; }
      setStaffOpts((staffRows as StaffOpt[]) ?? []);
      setMealItems((((items as { id: string; name: string; sale_price: number; is_active: boolean }[]) ?? []).filter((m) => m.is_active)).map((m) => ({ id: m.id, name: m.name, sale_price: m.sale_price })));

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

      type OI = { id: string; quantity: number; menu_item_id: string; status: string; sent_at: string | null; preparing_at: string | null; ready_at: string | null; served_at: string | null; course_no: number | null };
      type OrderRow = { id: string; table_id: string | null; order_items: OI[] };
      const list: Card[] = [];
      const pending: PendingCourseItem[] = [];
      ((orders as unknown as OrderRow[]) ?? []).forEach((o) => {
        o.order_items.forEach((oi) => {
          if (!(oi.status === "active" || oi.status === "ikram")) return;
          if (!oi.sent_at) {
            // Henüz garson serbest bırakmamış (course_no'lu) kalem — soluk önizleme.
            if (oi.course_no != null) {
              const info = itemInfo.get(oi.menu_item_id);
              pending.push({ id: oi.id, tableId: o.table_id, name: info?.name ?? "?", quantity: oi.quantity, courseNo: oi.course_no });
            }
            return;
          }
          const info = itemInfo.get(oi.menu_item_id);
          list.push({
            id: oi.id, tableId: o.table_id, name: info?.name ?? "?", quantity: oi.quantity,
            stationId: info?.stationId ?? null, sentAt: oi.sent_at, preparingAt: oi.preparing_at, readyAt: oi.ready_at,
            servedAt: oi.served_at, prepMinutes: info?.prepMinutes ?? null,
          });
        });
      });
      setPendingCourse(pending);
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

  // Personel yemeği — mutfaktan girilir, stoktan aynı anda düşer. mark_item_ready'ye
  // bağlanıyor (2026-07-28 gecesi 'personel' durumunu da işleyecek şekilde genişletildi):
  // aynı RPC hem reçeteyi stoktan düşürüyor hem de tek yerden yönetiliyor.
  const addStaffMeal = async () => {
    if (!restaurantId || !mealItemId || !mealStaffId) return;
    const qty = Math.max(1, parseInt(mealQty, 10) || 1);
    setMealBusy(true);
    setErr(null);
    const { data: orderId, error: orderErr } = await supabase.rpc("get_or_create_staff_meal_order", { p_restaurant_id: restaurantId });
    if (orderErr || !orderId) { setErr(orderErr?.message ?? "Personel siparişi açılamadı"); setMealBusy(false); return; }
    const meal = mealItems.find((m) => m.id === mealItemId);
    const { data: item, error: insErr } = await supabase.from("order_items").insert({
      restaurant_id: restaurantId, order_id: orderId, menu_item_id: mealItemId,
      quantity: qty, unit_price: meal?.sale_price ?? 0, status: "personel",
      staff_meal_for_id: mealStaffId, sent_at: new Date().toISOString(),
    }).select("id").single();
    if (insErr || !item) { setErr(insErr?.message ?? "Personel yemeği eklenemedi"); setMealBusy(false); return; }
    const staff = getStaffSession();
    await supabase.rpc("mark_item_ready", { p_order_item_id: item.id, p_staff_id: staff?.id ?? null });
    setMealDone(`${staffOpts.find((s) => s.id === mealStaffId)?.full_name ?? "?"} — ${qty}× ${meal?.name ?? "?"}`);
    setMealItemId(""); setMealQty("1"); setMealBusy(false);
    setTimeout(() => setMealDone(null), 3000);
  };

  // İstasyon linkle kilitliyse (ör. ?istasyon=Bar) sekme şeridi hiç gösterilmez — bar
  // ekranından mutfağa, mutfak ekranından bara geçiş yapılamaz (Gökhan: "bar mutfağı,
  // mutfak barı seçemesin"). Parametre yoksa (genel /mutfak) hepsi görünür, sekmeyle geçilebilir.
  const kilitliIstasyon = istasyonParam ? stations.find((s) => s.name.toLocaleLowerCase("tr") === istasyonParam.toLocaleLowerCase("tr")) : null;
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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button onClick={() => { setMealOpen(true); setErr(null); }} style={{ border: "1px solid var(--line-2)", borderRadius: 980, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, background: "var(--card)", color: "var(--ink-green)" }}>
              Personel yemeği ekle
            </button>
            <StaffProfileBadge restaurantId={restaurantId} />
          </div>
        </div>
        {mealDone && (
          <div style={{ marginTop: 10, padding: "8px 14px", borderRadius: 10, background: "var(--brand-strong)", color: "#fff", fontSize: 12.5, flexShrink: 0 }}>
            Eklendi — {mealDone}
          </div>
        )}
        {err && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 12, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13, flexShrink: 0 }}>{err}</div>}

        {stations.length > 0 && !kilitliIstasyon && (
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
                {pendingCourse.filter((p) => p.tableId === (g.tableId === "__yok__" ? null : g.tableId)).length > 0 && (
                  <div style={{ marginTop: 4, paddingTop: 8, borderTop: "1px dashed var(--line)" }}>
                    <div style={{ fontSize: 10.5, color: "var(--muted-2)", marginBottom: 4 }}>Sırada — henüz gönderilmedi</div>
                    {pendingCourse.filter((p) => p.tableId === (g.tableId === "__yok__" ? null : g.tableId)).map((p) => (
                      <div key={p.id} style={{ fontSize: 13, opacity: 0.45, padding: "4px 0" }}>
                        <span className="tnum">{p.quantity}×</span> {p.name}
                      </div>
                    ))}
                  </div>
                )}
                </div>
              </div>
            );
          })}
          {!loading && !err && tableGroups.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13 }}>Bekleyen kalem yok.</div>}
        </div>
      </div>

      {mealOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setMealOpen(false)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, minWidth: 320, maxWidth: 360 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 4 }}>Personel yemeği ekle</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, lineHeight: 1.5 }}>
              Stoktan hemen düşer. Ciroya girmez, Kasa&apos;da ayrı gider olarak görünür.
            </div>

            <label style={mealLbl}>Kim yiyor</label>
            <select value={mealStaffId} onChange={(e) => setMealStaffId(e.target.value)} style={mealInp}>
              <option value="">Personel seç…</option>
              {staffOpts.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>

            <label style={{ ...mealLbl, marginTop: 10 }}>Ne yiyor</label>
            <select value={mealItemId} onChange={(e) => setMealItemId(e.target.value)} style={mealInp}>
              <option value="">Ürün seç…</option>
              {mealItems.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>

            <label style={{ ...mealLbl, marginTop: 10 }}>Adet</label>
            <input value={mealQty} onChange={(e) => setMealQty(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && addStaffMeal()} inputMode="numeric" className="tnum" style={mealInp} />

            {err && <div style={{ marginTop: 10, fontSize: 12, color: "var(--danger)" }}>{err}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={addStaffMeal} disabled={mealBusy || !mealItemId || !mealStaffId} style={{ ...stageBtnSm, flex: 1, padding: "10px 14px", fontSize: 13.5, opacity: mealBusy || !mealItemId || !mealStaffId ? 0.5 : 1 }}>
                {mealBusy ? "…" : "Ekle"}
              </button>
              <button onClick={() => setMealOpen(false)} style={{ all: "unset", cursor: "pointer", fontSize: 13, color: "var(--muted)", padding: "10px 14px" }}>Vazgeç</button>
            </div>
          </div>
        </div>
      )}
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
const mealLbl: React.CSSProperties = { display: "block", fontSize: 11.5, color: "var(--muted)", marginBottom: 4 };
const mealInp: React.CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid var(--line-2)", borderRadius: 10, padding: "9px 10px", fontSize: 13.5, background: "var(--card)", color: "var(--ink)", outline: "none" };
