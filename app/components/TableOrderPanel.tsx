"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase/client";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useStaffSession } from "./StaffLoginGate";

type OrderItem = {
  id: string;
  quantity: number;
  unit_price: number;
  status: string;
  menu_item_id: string;
  variant_id: string | null;
  menu_items: { name: string } | null;
  sent_at: string | null;
  ready_at: string | null;
  served_at: string | null;
};
type Order = { id: string; table_id: string | null; party_size: number; order_items: OrderItem[] };
type Payment = { id: string; amount: number; method: string };
type Discount = { id: string; order_item_id: string | null; amount: number; percent: number | null; reason: string | null };

const PAY_METHODS = [
  { v: "nakit", l: "Nakit" },
  { v: "kart", l: "Kart" },
  { v: "yemek_karti", l: "Yemek Kartı" },
] as const;
const payLabel = (m: string) => PAY_METHODS.find((x) => x.v === m)?.l ?? m;
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
  variant = "sidebar",
}: {
  restaurantId: string | null;
  table: TableForOrder | null;
  onChanged: () => void;
  onClosed?: () => void;
  // "sidebar": masaüstünde masa gridinin yanında sabit sütun. "sheet": mobilde alttan açılan tam genişlik panel.
  variant?: "sidebar" | "sheet";
}) {
  // Menü katmanını document.body'ye portal'layabilmek için (bkz. aşağıdaki createPortal) —
  // sunucu tarafında render sırasında `document` yok, o yüzden mount olana kadar bekleriz.
  const [mounted, setMounted] = useState(false);
  // Garsondan açılınca StaffLoginGate'in sağladığı oturum burada okunur (kim gönderdi/kapattı
  // etiketlemesi için); Kasa'dan (PC) açılınca gate yok, bu null döner — sorun değil.
  const staffSession = useStaffSession();
  useEffect(() => { setMounted(true); }, []);
  const [order, setOrder] = useState<Order | null>(null);
  // Sipariş verisi gelene kadar order=null oluyor, bu da bir masaya tıklayınca doluysa bile
  // bir anlığına "Sipariş başlat" ekranının yanlışlıkla görünmesine sebep oluyordu. İlk yükleme
  // bitene kadar hiçbir şey (ne başlat ne adisyon) göstermiyoruz.
  const [loadingOrder, setLoadingOrder] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  // Menü katmanı açıkken arkadaki sayfa kaymasın/zıplamasın diye body scroll'u kilitlenir —
  // mobilde arka planın sürüklenebilir kalması, üstteki sabit-konumlu katmanla birlikte
  // ekranın "oynuyor" gibi görünmesine sebep oluyordu.
  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [menuOpen]);
  const [partySize, setPartySize] = useState(2);
  const [payStep, setPayStep] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [payAmount, setPayAmount] = useState("");
  // Ödeme türüne basınca direkt kapatmak yerine kısa bir onay adımı — yanlış dokunuşla
  // hesabın geri dönüşsüz kapanmasını engellemek için.
  const [confirmPayment, setConfirmPayment] = useState<{ method: string; amount: number; remaining: number } | null>(null);
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  // İndirim formu: hangi kaleme (null = adisyon geneli), girilen değer, tür (TL/%), sebep
  const [discountFor, setDiscountFor] = useState<{ itemId: string | null; itemName: string } | null>(null);
  const [dcValue, setDcValue] = useState("");
  const [dcIsPercent, setDcIsPercent] = useState(false);
  const [dcReason, setDcReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [config, setConfig] = useState<MenuItem | null>(null);
  const [cfgVariants, setCfgVariants] = useState<CfgVariant[]>([]);
  const [cfgGroups, setCfgGroups] = useState<CfgGroup[]>([]);
  const [chosenVariant, setChosenVariant] = useState<string | null>(null);
  const [chosenMods, setChosenMods] = useState<Record<string, string[]>>({});
  // Menüdeki ürüne dokunma geri bildirimi — CSS :active'e güvenmiyoruz çünkü mobilde çok hızlı bir
  // dokunuşta tarayıcı :active'i göstermeye fırsat bulamadan parmak zaten kalkmış oluyor. JS ile
  // basılı state'i en az bir süre (140ms) görünür tutuyoruz ki gerçekten fark edilsin.
  const [pressedItemId, setPressedItemId] = useState<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlePressStart = (id: string) => { if (pressTimer.current) clearTimeout(pressTimer.current); setPressedItemId(id); };
  const handlePressEnd = () => { pressTimer.current = setTimeout(() => setPressedItemId(null), 140); };

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
    if (!table) { setOrder(null); setLoadingOrder(false); return; }
    setErr(null);
    const { data, error } = await supabase
      .from("orders")
      .select("id, table_id, party_size, order_items(id, quantity, unit_price, status, menu_item_id, variant_id, created_at, sent_at, ready_at, served_at, menu_items(name))")
      .eq("table_id", table.id).eq("status", "open")
      // Kalemler her zaman eklenme sırasına göre listelensin — adet değiştirince satır yerinden oynamasın.
      .order("created_at", { referencedTable: "order_items" })
      .maybeSingle();
    if (error) setErr(error.message);
    const o = (data as unknown as Order) ?? null;
    setOrder(o);
    if (o) {
      const [{ data: p }, { data: d }] = await Promise.all([
        supabase.from("order_payments").select("id, amount, method").eq("order_id", o.id).order("paid_at"),
        supabase.from("order_discounts").select("id, order_item_id, amount, percent, reason").eq("order_id", o.id).order("created_at"),
      ]);
      setPayments((p as Payment[]) ?? []);
      setDiscounts((d as Discount[]) ?? []);
    } else {
      setPayments([]);
      setDiscounts([]);
    }
    setLoadingOrder(false);
  }, [table?.id]);

  useEffect(() => { setLoadingOrder(true); loadOrder(); setMenuOpen(false); setConfig(null); setPartySize(2); setPayStep(false); setPayAmount(""); setConfirmPayment(null); }, [table?.id, loadOrder]);
  // Mutfak/bar bir kalemi "hazır" işaretlerse bu panel açık kalsa bile görsün diye periyodik tazelenir.
  useEffect(() => {
    if (!table) return;
    const id = setInterval(loadOrder, 5000);
    return () => clearInterval(id);
  }, [table, loadOrder]);

  const grossTotal = (o: Order | null) =>
    o ? o.order_items.filter((i) => i.status === "active").reduce((s, i) => s + i.quantity * i.unit_price, 0) : 0;
  const discountTotal = discounts.reduce((s, d) => s + Number(d.amount), 0);
  // Ödemeler net toplamla (indirim düşülmüş) karşılaştırılır — close_order RPC de aynı hesabı yapar.
  const orderTotal = (o: Order | null) => Math.max(0, grossTotal(o) - discountTotal);

  // Kişi sayısı sipariş açılırken zorunlu (BUSINESS_LOGIC #1) — günlük müşteri sayısı buradan hesaplanır.
  const startOrder = async () => {
    if (!restaurantId || !table || order) return; // zaten açık sipariş varsa ikinci kez açma
    setBusy(true);
    setErr(null);
    const { error } = await supabase.from("orders").insert({ restaurant_id: restaurantId, table_id: table.id, status: "open", channel: "dine_in", party_size: partySize });
    if (error) { setErr(error.message); setBusy(false); return; }
    await supabase.from("restaurant_tables").update({ status: "occupied" }).eq("id", table.id);
    await loadOrder(); onChanged();
    setBusy(false);
    setMenuOpen(true);
  };

  const changePartySize = async (delta: number) => {
    if (!order) return;
    const next = Math.max(1, order.party_size + delta);
    if (next === order.party_size) return;
    await supabase.from("orders").update({ party_size: next }).eq("id", order.id);
    await loadOrder(); onChanged();
  };

  const changeQuantity = async (item: OrderItem, delta: number) => {
    const next = item.quantity + delta;
    setBusy(true);
    if (next <= 0) {
      // Adet sıfıra inince kalem iptal sayılır
      await supabase.from("order_items").update({ status: "void", void_reason: "adet sıfırlandı", voided_at: new Date().toISOString() }).eq("id", item.id);
    } else if (delta > 0 && item.sent_at) {
      // Zaten gönderilmiş bir kaleme adet eklendi — mutfak/bar yeni miktarı görsün diye tekrar "gönderilmedi" sayılır.
      await supabase.from("order_items").update({ quantity: next, sent_at: null, preparing_at: null, ready_at: null, served_at: null }).eq("id", item.id);
    } else {
      await supabase.from("order_items").update({ quantity: next }).eq("id", item.id);
    }
    await loadOrder(); onChanged();
    setBusy(false);
  };

  // İkram: gelire sayılmaz ama mutfaktan çıktığı için stok/maliyete işler (close_order RPC'si böyle kurulu).
  // Her tıklama sormadan 1 adedi ikrama düşürür; adedin tamamını ikram etmek için buton tekrar tıklanır.
  const compItem = async (item: OrderItem) => {
    if (!restaurantId || !order) return;
    setBusy(true);
    if (item.quantity <= 1) {
      await supabase.from("order_items").update({ status: "ikram" }).eq("id", item.id);
    } else {
      await supabase.from("order_items").update({ quantity: item.quantity - 1 }).eq("id", item.id);
      await supabase.from("order_items").insert({
        restaurant_id: restaurantId, order_id: order.id, menu_item_id: item.menu_item_id, variant_id: item.variant_id,
        quantity: 1, unit_price: item.unit_price, status: "ikram",
      });
    }
    await loadOrder(); onChanged();
    setBusy(false);
  };

  // İkram adedi her zaman aktif (satılan) taraftan gelir/gider — satılmamış bir ürün ikram edilemez.
  // "+": aynı üründen aktif bir birim varsa oradan 1 alıp ikrama ekler (aktif birim yoksa hiçbir şey yapmaz).
  // "−": ikramdan 1 birimi geri aktif tarafa verir (aynı simetri, ters yönde).
  const changeCompQuantity = async (item: OrderItem, delta: number) => {
    if (!order || !restaurantId) return;
    const sibling = order.order_items.find(
      (x) => x.status === "active" && x.menu_item_id === item.menu_item_id && x.variant_id === item.variant_id
    );
    setBusy(true);
    if (delta > 0) {
      if (!sibling) { setBusy(false); return; } // satmadığın bir şeyi ikram edemezsin
      if (sibling.quantity > 1) await supabase.from("order_items").update({ quantity: sibling.quantity - 1 }).eq("id", sibling.id);
      else await supabase.from("order_items").delete().eq("id", sibling.id);
      await supabase.from("order_items").update({ quantity: item.quantity + 1 }).eq("id", item.id);
    } else {
      if (sibling) await supabase.from("order_items").update({ quantity: sibling.quantity + 1 }).eq("id", sibling.id);
      else await supabase.from("order_items").insert({
        restaurant_id: restaurantId, order_id: order.id, menu_item_id: item.menu_item_id, variant_id: item.variant_id,
        quantity: 1, unit_price: item.unit_price, status: "active",
      });
      if (item.quantity > 1) await supabase.from("order_items").update({ quantity: item.quantity - 1 }).eq("id", item.id);
      else await supabase.from("order_items").delete().eq("id", item.id);
    }
    await loadOrder(); onChanged();
    setBusy(false);
  };

  const addItem = async (item: MenuItem) => {
    if (!restaurantId || !order) return;
    setBusy(true);
    // Aynı ürün (varyantsız/modifiersiz) adisyonda zaten aktif olarak duruyorsa yeni satır açmak yerine
    // adedini artır — üst üste tıklayınca listede ikinci bir satır belirmesin, sıradaki yeri korusun.
    const existing = order.order_items.find((i) => i.status === "active" && i.menu_item_id === item.id && !i.variant_id);
    if (existing) {
      await supabase.from("order_items").update({ quantity: existing.quantity + 1 }).eq("id", existing.id);
    } else {
      await supabase.from("order_items").insert({
        restaurant_id: restaurantId, order_id: order.id, menu_item_id: item.id,
        quantity: 1, unit_price: item.sale_price, status: "active",
      });
    }
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

  // Henüz gönderilmemiş (sent_at boş) aktif kalemleri mutfak/bar ekranına düşürür.
  const sendOrder = async () => {
    if (!order) return;
    const unsent = order.order_items.filter((i) => i.status === "active" && !i.sent_at);
    if (unsent.length === 0) return;
    setBusy(true);
    await supabase.from("order_items").update({
      sent_at: new Date().toISOString(),
      ...(staffSession ? { sent_by_staff_id: staffSession.id } : {}),
    }).in("id", unsent.map((i) => i.id));
    await loadOrder(); onChanged();
    setBusy(false);
  };

  const closeBill = async () => {
    if (!order) return;
    setBusy(true);
    await supabase.rpc("close_order", { p_order_id: order.id, p_staff_id: staffSession?.id ?? null });
    setMenuOpen(false); setPayStep(false);
    await loadOrder(); onChanged();
    setBusy(false);
    onClosed?.();
  };

  const applyDiscount = async () => {
    if (!restaurantId || !order || !discountFor) return;
    const raw = parseFloat(dcValue.replace(",", ".")) || 0;
    if (raw <= 0) return;
    // Taban: kalem indirimi → o kalemin satır tutarı; adisyon indirimi → brüt toplam
    const item = discountFor.itemId ? order.order_items.find((i) => i.id === discountFor.itemId) : null;
    const base = item ? item.quantity * item.unit_price : grossTotal(order);
    let amount = dcIsPercent ? (base * raw) / 100 : raw;
    // Net toplam negatife inmesin
    const remainingDiscountable = Math.max(0, grossTotal(order) - discountTotal);
    amount = Math.min(amount, remainingDiscountable, base);
    if (amount <= 0) return;
    setBusy(true);
    await supabase.from("order_discounts").insert({
      restaurant_id: restaurantId, order_id: order.id, order_item_id: discountFor.itemId,
      amount: Math.round(amount * 100) / 100, percent: dcIsPercent ? raw : null, reason: dcReason || null,
    });
    setDiscountFor(null); setDcValue(""); setDcIsPercent(false); setDcReason("");
    await loadOrder(); onChanged();
    setBusy(false);
  };

  const removeDiscount = async (id: string) => {
    setBusy(true);
    await supabase.from("order_discounts").delete().eq("id", id);
    await loadOrder(); onChanged();
    setBusy(false);
  };

  // Kısmi ödeme: kaydedilen tutar kalanı aşamaz (nakit fazlası para üstüdür, adisyona yazılmaz).
  const addPayment = async (method: string, remaining: number) => {
    if (!restaurantId || !order) return;
    const typed = parseFloat(payAmount.replace(",", ".")) || remaining;
    const amount = Math.min(typed, remaining);
    if (amount <= 0) return;
    setBusy(true);
    await supabase.from("order_payments").insert({ restaurant_id: restaurantId, order_id: order.id, amount, method });
    const { data: p } = await supabase.from("order_payments").select("id, amount, method").eq("order_id", order.id).order("paid_at");
    const list = (p as Payment[]) ?? [];
    setPayments(list);
    setPayAmount("");
    setBusy(false);
    const paidNow = list.reduce((s, x) => s + Number(x.amount), 0);
    if (paidNow >= orderTotal(order) - 0.001) await closeBill();
  };

  const cfgBase = config ? (chosenVariant ? (cfgVariants.find((v) => v.id === chosenVariant)?.sale_price ?? config.sale_price) : config.sale_price) : 0;
  const cfgModList = config ? (cfgGroups.flatMap((gr) => (chosenMods[gr.id] ?? []).map((id) => gr.modifiers.find((m) => m.id === id)).filter(Boolean)) as CfgMod[]) : [];
  const cfgPrice = cfgBase + cfgModList.reduce((s, m) => s + m.price_delta, 0);

  const rootStyle: React.CSSProperties =
    variant === "sheet"
      // touchAction: dikey kaydırmayı yatay sürüklemeden ayırır — mobilde parmakla yukarı/aşağı
      // kaydırırken panelin sağa sola kaymasını (diagonal dokunuşlarda) engeller.
      // overflowY burada "auto" değil "hidden" — sayfanın tamamı değil, sadece ürün listesi
      // (aşağıda flex:1+overflowY:auto+minHeight:0 üçlüsüyle) kendi içinde kayar (bkz. PAGE_STANDARDS #1).
      ? { width: "100%", boxSizing: "border-box", background: "var(--card)", borderRadius: "20px 20px 0 0", padding: "10px 20px 22px", display: "flex", flexDirection: "column", maxHeight: "min(88vh, 720px)", overflowY: "hidden", overflowX: "hidden", touchAction: "pan-y", overscrollBehavior: "contain" }
      : { flex: 1, minWidth: 280, maxWidth: 340, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 22, display: "flex", flexDirection: "column", minHeight: 460 };

  // Menü, tam ekran/yan panel ayrı bir katman — sipariş listesi ne kadar uzarsa uzasın menü hep
  // temiz açılsın diye. Mobilde ("sheet") her şeyin üstüne tam sayfa açılır; masaüstünde ("sidebar")
  // sipariş paneli her zaman görünür kalsın diye onun SOLUNA, masa ızgarasının üstüne biner.
  const menuOverlayStyle: React.CSSProperties =
    variant === "sheet"
      // Sipariş panelindeki alttan-kayan sheet ile aynı görünüm (yuvarlak üst köşe, arkada backdrop)
      // ama olabildiğince yükseğe kadar açılır — sadece tepede çentik/durum çubuğu payı kadar boşluk kalır.
      // z-index 70+ — StaffLoginGate'in sağ üstteki personel rozeti/çıkış butonu 70'te sabit
      // duruyor; menü açılınca onu tamamen kaplasın diye üstüne çıkıyor (aksi halde aynı köşede
      // çakışıyorlardı).
      ? { position: "fixed", left: 0, right: 0, bottom: 0, top: "max(14px, env(safe-area-inset-top, 0px))", zIndex: 75, background: "var(--card)", borderRadius: "20px 20px 0 0", boxShadow: "0 -10px 30px rgba(30,57,50,.18)", display: "flex", flexDirection: "column", boxSizing: "border-box", padding: "14px 16px 20px", overflow: "hidden", touchAction: "pan-y", overscrollBehavior: "contain" }
      // Sipariş paneliyle aynı eski genişlik (280-340px) — tüm ekranı kaplamasın, sadece onun
      // soluna, masa ızgarasının üstüne binen dar bir panel olsun. 380: sağdan sipariş paneli + boşluk payı.
      : { position: "fixed", top: 22, right: 380, bottom: 22, width: 340, zIndex: 60, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, boxShadow: "0 10px 30px rgba(30,57,50,.18)", display: "flex", flexDirection: "column", padding: 22 };

  return (
    <>
    <div style={rootStyle}>
      {variant === "sheet" && <div style={{ width: 40, height: 4, borderRadius: 980, background: "var(--line-2)", margin: "0 auto 14px" }} />}
      {err && <div style={{ background: "var(--danger-bg)", color: "var(--danger)", borderRadius: 10, padding: "8px 12px", fontSize: 12.5, marginBottom: 10, flexShrink: 0 }}>{err}</div>}
      {!table && <div style={{ color: "var(--muted)", fontSize: 14, margin: "auto" }}>Bir masa seç</div>}
      {/* Yükleniyor durumunda bilinçli olarak hiçbir şey göstermiyoruz — bir yazı bile kısa bir
          "önce bu, sonra o" kesintisi gibi hissettiriyordu. Veri gelince doğru ekran tek seferde çıkar. */}

      {table && !loadingOrder && !order && (
        <div style={{ margin: "auto", textAlign: "center" }}>
          <div style={{ fontWeight: 600, fontSize: 19, color: "var(--ink-green)", marginBottom: 10 }}>{table.name}</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>Açık sipariş yok</div>

          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>Kişi sayısı</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 18 }}>
            <button onClick={() => setPartySize((p) => Math.max(1, p - 1))} aria-label="azalt" style={stepBtn}>−</button>
            <span className="tnum" style={{ fontSize: 26, fontWeight: 600, color: "var(--ink-green)", minWidth: 40 }}>{partySize}</span>
            <button onClick={() => setPartySize((p) => p + 1)} aria-label="artır" style={stepBtn}>+</button>
          </div>

          <button onClick={startOrder} disabled={busy} style={pillPrimary}>Sipariş başlat</button>
        </div>
      )}

      {table && !loadingOrder && order && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.4px", color: "var(--ink-green)" }}>{table.name}</div>
            {variant === "sheet" && (
              <button onClick={() => onClosed?.()} aria-label="kapat" style={{ all: "unset", cursor: "pointer", width: 28, height: 28, borderRadius: "50%", background: "var(--recede)", color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>✕</button>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "6px 0 12px", flexShrink: 0 }}>
            <span style={{ fontSize: 12.5, color: "var(--muted)" }}>Adisyon</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--muted)" }}>
              <button onClick={() => changePartySize(-1)} aria-label="kişi azalt" style={stepBtnSm}>−</button>
              <span className="tnum" style={{ color: "var(--ink)", fontWeight: 600 }}>{order.party_size} kişi</span>
              <button onClick={() => changePartySize(1)} aria-label="kişi artır" style={stepBtnSm}>+</button>
            </span>
          </div>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0, touchAction: "pan-y" }}>
            {order.order_items.filter((i) => i.status === "active" || i.status === "ikram").map((i) => (
              <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", fontSize: 14 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
                  <button onClick={() => (i.status === "ikram" ? changeCompQuantity(i, -1) : changeQuantity(i, -1))} disabled={busy} aria-label="azalt" style={stepBtnSm}>−</button>
                  <span className="tnum" style={{ minWidth: 16, textAlign: "center" }}>{i.quantity}</span>
                  <button onClick={() => (i.status === "ikram" ? changeCompQuantity(i, 1) : changeQuantity(i, 1))} disabled={busy} aria-label="artır" style={stepBtnSm}>+</button>
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {i.menu_items?.name ?? "?"}
                  {i.status === "ikram" && <span style={{ fontSize: 11, fontWeight: 600, color: "var(--gold-text)", marginLeft: 6 }}>İKRAM</span>}
                  {i.ready_at && !i.served_at && <span style={{ fontSize: 11, fontWeight: 600, color: "var(--brand)", marginLeft: 6 }}>HAZIR</span>}
                </span>
                <span className="tnum" style={{ flexShrink: 0, textDecoration: i.status === "ikram" ? "line-through" : "none", color: i.status === "ikram" ? "var(--muted-2)" : "var(--ink)" }}>{money(i.quantity * i.unit_price)}</span>
                {i.status === "active" && (
                  <span style={{ display: "inline-flex", gap: 4, flexShrink: 0 }}>
                    <button onClick={() => compItem(i)} disabled={busy} title="İkram et" style={miniAction}>İkram</button>
                  </span>
                )}
              </div>
            ))}
            {order.order_items.filter((i) => i.status === "active" || i.status === "ikram").length === 0 && (
              <div style={{ color: "var(--muted)", fontSize: 14, padding: "9px 0" }}>Henüz ürün yok</div>
            )}
          </div>

          <div style={{ height: 1, background: "var(--line)", marginTop: 10, flexShrink: 0 }} />

          {discounts.length > 0 && (
            <div style={{ flexShrink: 0, marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--muted)", padding: "3px 0" }}>
                <span>Ara toplam</span>
                <span className="tnum">{money(grossTotal(order))}</span>
              </div>
              {discounts.map((d) => {
                const item = d.order_item_id ? order.order_items.find((i) => i.id === d.order_item_id) : null;
                return (
                  <div key={d.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, color: "var(--gold-text)", padding: "3px 0" }}>
                    <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      İndirim{item ? ` · ${item.menu_items?.name ?? ""}` : " · adisyon"}{d.percent ? ` (%${Number(d.percent)})` : ""}{d.reason ? ` — ${d.reason}` : ""}
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                      <span className="tnum">−{money(Number(d.amount))}</span>
                      <button onClick={() => removeDiscount(d.id)} disabled={busy} title="İndirimi kaldır" style={{ all: "unset", cursor: "pointer", color: "var(--muted-2)", fontSize: 12 }}>✕</button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "12px 0 6px", flexShrink: 0 }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Toplam</span>
            <span className="tnum" style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-1px", color: "var(--ink-green)" }}>{money(orderTotal(order))}</span>
          </div>

          {!payStep && !discountFor && (
            <button
              onClick={() => { setDiscountFor({ itemId: null, itemName: "adisyon" }); setDcValue(""); setDcIsPercent(false); setDcReason(""); }}
              style={{ all: "unset", cursor: "pointer", fontSize: 12.5, color: "var(--brand)", marginBottom: 8, flexShrink: 0 }}
            >+ Adisyona indirim</button>
          )}

          {discountFor && (
            <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12, marginBottom: 10, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)", marginBottom: 8 }}>
                İndirim — {discountFor.itemId ? discountFor.itemName : "adisyon geneli"}
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input value={dcValue} onChange={(e) => setDcValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyDiscount()} placeholder={dcIsPercent ? "Yüzde" : "Tutar ₺"} inputMode="decimal" autoFocus
                  style={{ border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 10px", fontSize: 16, flex: 1, minWidth: 0, background: "var(--card)", color: "var(--ink)", outline: "none" }} />
                <div style={{ display: "flex", background: "var(--recede)", borderRadius: 980, padding: 2 }}>
                  {[{ v: false, l: "₺" }, { v: true, l: "%" }].map((t) => (
                    <button key={t.l} onClick={() => setDcIsPercent(t.v)} style={{ border: "none", borderRadius: 980, padding: "6px 12px", fontSize: 13, background: dcIsPercent === t.v ? "var(--ink-green)" : "transparent", color: dcIsPercent === t.v ? "#fff" : "var(--muted)" }}>{t.l}</button>
                  ))}
                </div>
              </div>
              <input value={dcReason} onChange={(e) => setDcReason(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyDiscount()} placeholder="Sebep (örn. müşteri memnuniyeti)"
                style={{ border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 10px", fontSize: 16, width: "100%", boxSizing: "border-box", marginBottom: 10, background: "var(--card)", color: "var(--ink)", outline: "none" }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={applyDiscount} disabled={busy} style={{ ...pillPrimary, flex: 1, padding: 10, fontSize: 13.5 }}>Uygula</button>
                <button onClick={() => setDiscountFor(null)} style={{ ...pillSecondary, flex: 1, padding: 10, fontSize: 13.5 }}>Vazgeç</button>
              </div>
            </div>
          )}

          {payments.length > 0 && (
            <div style={{ flexShrink: 0, marginBottom: 8 }}>
              {payments.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--muted)", padding: "3px 0" }}>
                  <span>Ödendi · {payLabel(p.method)}</span>
                  <span className="tnum">{money(Number(p.amount))}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600, color: "var(--ink)", padding: "5px 0", borderTop: "1px solid var(--line)" }}>
                <span>Kalan</span>
                <span className="tnum">{money(Math.max(0, orderTotal(order) - payments.reduce((s, p) => s + Number(p.amount), 0)))}</span>
              </div>
            </div>
          )}

          {/* Menü artık burada açılmıyor — ayrı, tam ekran/yan panel bir katman olarak alta render ediliyor
              (bkz. bileşenin sonundaki menuOpen bloğu) ki sipariş listesi uzadıkça menü aşağı itilmesin. */}
          <button onClick={() => setMenuOpen((o) => !o)} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: "10px 0", borderTop: "1px solid var(--line)", flexShrink: 0 }}>
            <ChevronRight size={15} color="var(--muted)" />
            <span style={{ fontWeight: 600, fontSize: 14, color: "var(--ink-green)" }}>Menü</span>
          </button>

          {!payStep ? (
            <div style={{ marginTop: menuOpen ? 12 : "auto", paddingTop: 12, flexShrink: 0 }}>
              {order.order_items.some((i) => i.status === "active" && !i.sent_at) ? (
                <button onClick={sendOrder} disabled={busy} style={{ ...pillPrimary, width: "100%" }}>Gönder</button>
              ) : (
                <button
                  onClick={() => {
                    const remaining = orderTotal(order) - payments.reduce((s, p) => s + Number(p.amount), 0);
                    // Ödenecek bir şey yoksa (ürün eklenmedi ya da hepsi iptal edildi) doğrudan masayı boşalt —
                    // ödeme adımına girip "kalan 0₺" yüzünden tüm yöntem butonlarının pasif kalmasını engeller.
                    if (remaining <= 0) { closeBill(); return; }
                    setPayStep(true); setMenuOpen(false); setPayAmount(String(Math.max(0, Math.round(remaining * 100) / 100)));
                  }}
                  disabled={busy}
                  style={{ ...pillPrimary, width: "100%" }}
                >{orderTotal(order) - payments.reduce((s, p) => s + Number(p.amount), 0) <= 0 ? "Masayı boşalt" : "Hesap al"}</button>
              )}
            </div>
          ) : (() => {
            const total = orderTotal(order);
            const paid = payments.reduce((s, p) => s + Number(p.amount), 0);
            const remaining = Math.max(0, total - paid);
            const typed = parseFloat(payAmount.replace(",", ".")) || 0;
            const change = typed > remaining ? typed - remaining : 0;
            return (
              <div style={{ marginTop: menuOpen ? 12 : "auto", paddingTop: 12, borderTop: "1px solid var(--line)", flexShrink: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)" }}>Ödeme</span>
                  <span className="tnum" style={{ fontSize: 13, color: "var(--muted)" }}>Kalan {money(remaining)}</span>
                </div>
                <input
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  placeholder={`Tutar (kalan: ${money(remaining)})`}
                  inputMode="decimal"
                  style={{ border: "1px solid var(--line-2)", borderRadius: 10, padding: "10px 12px", fontSize: 16, width: "100%", boxSizing: "border-box", marginBottom: 4, background: "var(--card)", color: "var(--ink)", outline: "none" }}
                />
                {change > 0 && <div className="tnum" style={{ fontSize: 12, color: "var(--gold-text)", marginBottom: 4 }}>Para üstü: {money(change)}</div>}
                {!confirmPayment ? (
                  <>
                    <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                      {PAY_METHODS.map((m) => (
                        <button key={m.v} onClick={() => setConfirmPayment({ method: m.v, amount: Math.min(typed || remaining, remaining), remaining })} disabled={busy || remaining <= 0} style={{ ...pillSecondary, flex: 1, padding: 10, fontSize: 13 }}>{m.l}</button>
                      ))}
                    </div>
                    <button onClick={() => setPayStep(false)} style={{ all: "unset", cursor: "pointer", fontSize: 12.5, color: "var(--muted)", marginTop: 10, display: "block" }}>Vazgeç</button>
                  </>
                ) : (
                  <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14, marginTop: 6 }}>
                    <div style={{ fontSize: 13.5, color: "var(--ink)", marginBottom: 12 }}>
                      <b className="tnum">{money(confirmPayment.amount)}</b> · {payLabel(confirmPayment.method)} ile {confirmPayment.amount >= confirmPayment.remaining - 0.001 ? "hesabı kapatmak" : "bu ödemeyi kaydetmek"} istiyor musunuz?
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => { const cp = confirmPayment; setConfirmPayment(null); addPayment(cp.method, cp.remaining); }}
                        disabled={busy}
                        style={{ ...pillPrimary, flex: 1, padding: 10, fontSize: 13.5 }}
                      >Onayla</button>
                      <button onClick={() => setConfirmPayment(null)} style={{ ...pillSecondary, flex: 1, padding: 10, fontSize: 13.5 }}>Vazgeç</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>

    {mounted && menuOpen && table && order && createPortal(
      <>
        {variant === "sheet" && (
          <div
            className="backdrop-fade-in"
            onClick={() => { setMenuOpen(false); setConfig(null); }}
            style={{ position: "fixed", inset: 0, zIndex: 74, background: "rgba(20,20,15,0.4)" }}
          />
        )}
        <div className={variant === "sheet" ? "sheet-slide-up" : undefined} style={menuOverlayStyle}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexShrink: 0, marginBottom: 10, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <button onClick={() => { setMenuOpen(false); setConfig(null); }} aria-label="geri" style={{ all: "unset", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, color: "var(--brand)", fontSize: 13.5, fontWeight: 600, flexShrink: 0 }}>
              <ChevronLeft size={17} /> Geri
            </button>
            <span style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{config ? config.name : `Menü · ${table.name}`}</span>
          </span>
          {/* Menüde gezerken adisyonda şu an ne olduğu (kaç ürün, toplam) görünsün diye özet şerit. */}
          {!config && (
            <span className="tnum" style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: "var(--muted)", background: "var(--recede)", borderRadius: 980, padding: "5px 12px" }}>
              {order.order_items.filter((i) => i.status === "active" || i.status === "ikram").reduce((s, i) => s + i.quantity, 0)} ürün · {money(orderTotal(order))}
            </span>
          )}
        </div>

        {!config && (
          <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden", minHeight: 0, touchAction: "pan-y" }}>
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
                          onPointerDown={() => handlePressStart(m.id)} onPointerUp={handlePressEnd} onPointerLeave={handlePressEnd} onPointerCancel={handlePressEnd}
                          style={{
                            textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center",
                            width: "100%", padding: "9px 4px 9px 23px", fontSize: 13.5, boxSizing: "border-box", border: "none", borderRadius: 10,
                            background: pressedItemId === m.id ? "var(--line-2)" : "transparent",
                            transform: pressedItemId === m.id ? "scale(0.97)" : "scale(1)",
                            transition: "background-color .08s ease, transform .08s ease",
                          }}>
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

        {config && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div style={{ overflowY: "auto", overflowX: "hidden", flex: 1, touchAction: "pan-y" }}>
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
        </div>
      </>,
      document.body
    )}
    </>
  );
}

const pillPrimary: React.CSSProperties = { border: "none", borderRadius: 980, padding: 14, background: "var(--brand-strong)", color: "#fff", fontSize: 15, fontWeight: 500 };
const stepBtn: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: "50%", width: 36, height: 36, background: "var(--card)", color: "var(--ink-green)", fontSize: 18, lineHeight: 1 };
const stepBtnSm: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: "50%", width: 22, height: 22, background: "var(--card)", color: "var(--ink-green)", fontSize: 13, lineHeight: 1, padding: 0 };
const miniAction: React.CSSProperties = { border: "none", borderRadius: 8, padding: "3px 7px", background: "var(--recede)", color: "var(--muted)", fontSize: 10.5, cursor: "pointer" };
const pillSecondary: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: 12, background: "var(--card)", color: "var(--ink-green)", fontSize: 14 };
const chip = (on: boolean): React.CSSProperties => ({ border: on ? "none" : "1px solid var(--line-2)", borderRadius: 980, padding: "8px 14px", fontSize: 13, background: on ? "var(--brand-strong)" : "var(--card)", color: on ? "#fff" : "var(--ink-green)" });
