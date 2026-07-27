"use client";

import { useCallback, useEffect, useMemo, useState, createContext, useContext } from "react";
import { supabase } from "@/lib/supabase/client";
import { getMyRestaurantId } from "@/lib/supabase/restaurant";
import { Plus, ChevronDown, ChevronRight, Folder, GripVertical, Trash2, ReceiptText, X, ClipboardList, ShoppingCart } from "lucide-react";
import EditableText from "../components/EditableText";
import { useConfirm } from "../components/useConfirm";
import { toUpperTr, toTitleTr } from "@/lib/text";
import {
  DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Item = {
  ingredient_id: string;
  ingredient_name: string;
  category: "gida" | "sarf";
  unit: string;
  par_level: number;
  current_unit_cost: number;
  current_stock: number;
  avg_daily_usage: number;
  expected_usage: number;
  supplier_id: string | null;
  supplier_name: string | null;
  stock_group_id: string | null;
  stock_group_name: string | null;
  sort_order: number;
};
type NeedRow = {
  ingredient_id: string; ingredient_name: string; unit: string;
  needed_quantity: number; current_stock: number; shortfall: number;
  unit_cost: number; estimated_cost: number;
};
type Supplier = { id: string; name: string; delivery_frequency: string };
type Group = { id: string; name: string; sort_order: number };
type Section = { id: string; name: string; items: Item[] };

// Onerilen Sipariş Listesi — canlı öneriler (suggested_purchase_list RPC) + bekleyen talepler
type SuggestionRow = {
  ingredient_id: string; ingredient_name: string; unit: string;
  current_stock: number; par_level: number; avg_daily_usage: number;
  days_until_delivery: number; suggested_qty: number;
  supplier_id: string; supplier_name: string;
  current_unit_cost: number; estimated_cost: number;
};
type PendingRequest = {
  id: string; ingredient_id: string; ingredient_name: string; unit: string;
  supplier_id: string | null; supplier_name: string | null;
  suggested_qty: number; status: string;
};

const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;
const num = (n: number) => Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
const freqLabel: Record<string, string> = { daily: "Günlük", weekly: "Haftalık", custom: "Özel" };
const UNGROUPED = "__ungrouped";
const DAY_LABELS: { iso: number; label: string }[] = [
  { iso: 1, label: "Pzt" }, { iso: 2, label: "Sal" }, { iso: 3, label: "Çar" }, { iso: 4, label: "Per" },
  { iso: 5, label: "Cum" }, { iso: 6, label: "Cmt" }, { iso: 7, label: "Paz" },
];

type Ctx = {
  expanded: Set<string>;
  selectedId: string | null;
  toggle: (id: string) => void;
  selectItem: (i: Item) => void;
  deleteGroup: (sec: Section) => void;
  deleteIngredient: (i: Item) => void;
  renameGroup: (id: string, name: string) => void;
  renameIngredient: (id: string, name: string) => void;
  promoteUngrouped: (name: string) => void;
  addIngredient: (groupId: string | null, name: string, unit: string, cat: "gida" | "sarf", par: string, qty: string, price: string) => void;
};
const StokCtx = createContext<Ctx | null>(null);
const useStok = () => useContext(StokCtx)!;

export default function StokPage() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [filter, setFilter] = useState<"tumu" | "gida" | "sarf" | "kritik">("kritik");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set([UNGROUPED]));

  const [inQty, setInQty] = useState("");
  const [inPrice, setInPrice] = useState("");
  const [inSupplier, setInSupplier] = useState("");

  const [newGroupName, setNewGroupName] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);

  const [showNewSup, setShowNewSup] = useState(false);
  const [nsName, setNsName] = useState("");
  const [nsFreq, setNsFreq] = useState("weekly");
  const [nsDays, setNsDays] = useState<Set<number>>(new Set());

  // Çok kalemli fatura girişi (Fire/Kaçak Radarı Faz 1) — bir faturadaki tüm kalemler tek seferde
  type InvRow = { ingredientId: string; qty: string; price: string };
  const [showInvoice, setShowInvoice] = useState(false);
  const [invSupplier, setInvSupplier] = useState("");
  const [invRef, setInvRef] = useState("");
  const [invDate, setInvDate] = useState("");
  const [invRows, setInvRows] = useState<InvRow[]>([{ ingredientId: "", qty: "", price: "" }]);
  const [invErr, setInvErr] = useState<string | null>(null);
  const [invBusy, setInvBusy] = useState(false);
  const [invPurchaseRequestId, setInvPurchaseRequestId] = useState<string | null>(null);

  // Onerilen Sipariş Listesi — canlı öneriler + bekleyen siparişler
  const [showOrders, setShowOrders] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestionRow[] | null>(null);
  const [suggestionsBusy, setSuggestionsBusy] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);

  // İhtiyaç listesi (günlük tahmini sipariş) — "hangi ürün satacak bilmiyoruz" sorununu
  // menüdeki tahmini satış payı + reçeteler üzerinden ağırlıklı ortalama ile çözer.
  const [menuCategories, setMenuCategories] = useState<{ id: string; name: string }[]>([]);
  const [showNeeds, setShowNeeds] = useState(false);
  const [needsCategoryId, setNeedsCategoryId] = useState("");
  const [needsCovers, setNeedsCovers] = useState("200");
  const [needsResults, setNeedsResults] = useState<NeedRow[] | null>(null);
  const [needsBusy, setNeedsBusy] = useState(false);
  const [needsErr, setNeedsErr] = useState<string | null>(null);

  const { confirm, dialog: confirmDialog } = useConfirm();

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const load = useCallback(async () => {
    const restId = await getMyRestaurantId();
    if (!restId) return;
    setRestaurantId(restId);
    const [{ data: usage }, { data: sup }, { data: grp }, { data: cats }] = await Promise.all([
      supabase.rpc("ingredient_expected_usage", { p_restaurant: restId, p_days_ahead: 7 }),
      supabase.from("suppliers").select("id, name, delivery_frequency").eq("restaurant_id", restId).is("deleted_at", null).order("name"),
      supabase.from("stock_groups").select("id, name, sort_order").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("menu_categories").select("id, name").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
    ]);
    setItems((usage as Item[]) ?? []);
    setSuppliers((sup as Supplier[]) ?? []);
    setGroups((grp as Group[]) ?? []);
    setMenuCategories((cats as { id: string; name: string }[]) ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const isCritical = (i: Item) => i.par_level > 0 && i.current_stock <= i.par_level;

  const filtered = useMemo(() => {
    let list = items;
    if (filter === "kritik") list = list.filter(isCritical);
    else if (filter !== "tumu") list = list.filter((i) => i.category === filter);
    return list;
  }, [items, filter]);

  const selected = items.find((i) => i.ingredient_id === selectedId) ?? null;
  const kritikSayisi = items.filter(isCritical).length;

  const toggle = (id: string) => {
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const selectItem = (i: Item) => {
    setSelectedId(i.ingredient_id);
    setInQty(""); setInPrice(String(i.current_unit_cost || "")); setInSupplier(i.supplier_id ?? "");
    setShowNewSup(false);
  };

  const addStockIn = async () => {
    if (!restaurantId || !selected || !inQty) return;
    await supabase.rpc("add_stock_purchase", {
      p_restaurant: restaurantId,
      p_ingredient: selected.ingredient_id,
      p_supplier: inSupplier || null,
      p_quantity: parseFloat(inQty) || 0,
      p_unit_price: parseFloat(inPrice) || 0,
      p_source: "manuel",
    });
    setInQty("");
    await load();
  };

  const bugunTarih = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

  const openInvoice = () => {
    setInvSupplier(""); setInvRef(""); setInvDate(bugunTarih());
    setInvRows([{ ingredientId: "", qty: "", price: "" }]);
    setInvErr(null); setInvPurchaseRequestId(null); setShowInvoice(true);
  };

  const openNeeds = () => {
    setNeedsCategoryId(""); setNeedsResults(null); setNeedsErr(null); setShowNeeds(true);
  };

  const calcNeeds = async () => {
    if (!restaurantId || !needsCategoryId) return;
    const covers = parseInt(needsCovers) || 0;
    if (covers <= 0) return;
    setNeedsBusy(true); setNeedsErr(null);
    const { data, error } = await supabase.rpc("category_daily_ingredient_needs", {
      p_restaurant_id: restaurantId, p_category_id: needsCategoryId, p_total_covers: covers,
    });
    setNeedsBusy(false);
    if (error) { setNeedsErr(error.message); return; }
    setNeedsResults((data as NeedRow[]) ?? []);
  };

  const setInvRow = (idx: number, patch: Partial<InvRow>) => {
    setInvRows((rows) => rows.map((r, i) => {
      if (i !== idx) return r;
      const next = { ...r, ...patch };
      // Malzeme seçilince fiyatı son bilinen birim maliyetle öner (elle değiştirilebilir)
      if (patch.ingredientId && !r.price) {
        const it = items.find((x) => x.ingredient_id === patch.ingredientId);
        if (it && it.current_unit_cost > 0) next.price = String(it.current_unit_cost);
      }
      return next;
    }));
  };

  const invTotal = invRows.reduce((s, r) => s + (parseFloat(r.qty.replace(",", ".")) || 0) * (parseFloat(r.price.replace(",", ".")) || 0), 0);

  const saveInvoice = async () => {
    if (!restaurantId || invBusy) return;
    const kalemler = invRows
      .filter((r) => r.ingredientId && (parseFloat(r.qty.replace(",", ".")) || 0) > 0)
      .map((r) => ({
        ingredient_id: r.ingredientId,
        quantity: parseFloat(r.qty.replace(",", ".")) || 0,
        unit_price: parseFloat(r.price.replace(",", ".")) || 0,
      }));
    if (kalemler.length === 0) { setInvErr("En az bir satırda malzeme ve miktar girilmeli."); return; }
    setInvBusy(true); setInvErr(null);
    const { error } = await supabase.rpc("add_purchase_invoice", {
      p_restaurant: restaurantId,
      p_supplier: invSupplier || null,
      p_invoice_ref: invRef || null,
      p_purchased_at: invDate ? new Date(invDate + "T12:00:00+03:00").toISOString() : null,
      p_items: kalemler,
      p_purchase_request_id: invPurchaseRequestId,
    });
    setInvBusy(false);
    if (error) { setInvErr(`Fatura kaydedilemedi: ${error.message}`); return; }
    setShowInvoice(false);
    const hadRequest = invPurchaseRequestId !== null;
    setInvPurchaseRequestId(null);
    await load();
    if (hadRequest) await loadPendingRequests();
  };

  const addIngredient = async (groupId: string | null, name: string, unit: string, cat: "gida" | "sarf", par: string, qty: string, price: string) => {
    if (!restaurantId || !name.trim()) return;
    const count = items.filter((i) => (i.stock_group_id ?? null) === groupId).length;
    const { data } = await supabase.from("ingredients").insert({
      restaurant_id: restaurantId, name: toTitleTr(name), unit, category: cat,
      par_level: parseFloat(par) || 0, current_unit_cost: parseFloat(price) || 0, stock_group_id: groupId, sort_order: count,
    }).select("id").single();
    const q = parseFloat(qty) || 0;
    if (data && q > 0) {
      await supabase.rpc("add_stock_purchase", {
        p_restaurant: restaurantId, p_ingredient: data.id, p_supplier: null,
        p_quantity: q, p_unit_price: parseFloat(price) || 0, p_source: "manuel",
      });
    }
    await load();
    if (data) setSelectedId(data.id);
  };

  const addGroup = async () => {
    if (!restaurantId || !newGroupName.trim()) return;
    const { data } = await supabase.from("stock_groups").insert({
      restaurant_id: restaurantId, name: toUpperTr(newGroupName), sort_order: groups.length,
    }).select("id").single();
    setNewGroupName(""); setAddingGroup(false);
    await load();
    if (data) setExpanded((prev) => new Set(prev).add(data.id));
  };

  const toggleNsDay = (iso: number) => {
    setNsDays((prev) => { const n = new Set(prev); n.has(iso) ? n.delete(iso) : n.add(iso); return n; });
  };

  const openNewSupplierForm = () => {
    setNsName(""); setNsFreq("weekly"); setNsDays(new Set()); setShowNewSup(true);
  };

  const addSupplier = async () => {
    if (!restaurantId || !nsName.trim()) return;
    const { data } = await supabase.from("suppliers").insert({
      restaurant_id: restaurantId, name: toTitleTr(nsName), delivery_frequency: nsFreq,
      delivery_days: nsFreq === "custom" ? Array.from(nsDays).sort((a, b) => a - b) : null,
    }).select("id").single();
    setNsName(""); setNsFreq("weekly"); setNsDays(new Set()); setShowNewSup(false);
    await load();
    if (data) { setInSupplier(data.id); if (selected) await supabase.from("ingredients").update({ supplier_id: data.id }).eq("id", selected.ingredient_id); await load(); }
  };

  const renameGroup = async (id: string, name: string) => {
    await supabase.from("stock_groups").update({ name: toUpperTr(name) }).eq("id", id);
    await load();
  };
  const renameIngredient = async (id: string, name: string) => {
    await supabase.from("ingredients").update({ name: toTitleTr(name) }).eq("id", id);
    await load();
  };
  const updateParLevel = async (v: string) => {
    if (!selected) return;
    await supabase.from("ingredients").update({ par_level: parseFloat(v.replace(",", ".")) || 0 }).eq("id", selected.ingredient_id);
    await load();
  };

  const deleteGroup = async (sec: Section) => {
    if (sec.items.length > 0) {
      const ok = await confirm(`Bu başlıkta ${sec.items.length} malzeme var. Silersen malzemeler "Diğer"e düşer. Yine de silinsin mi?`);
      if (!ok) return;
    }
    await supabase.from("stock_groups").update({ deleted_at: new Date().toISOString() }).eq("id", sec.id);
    await load();
  };
  const deleteIngredient = async (i: Item) => {
    const ok = await confirm(`"${i.ingredient_name}" silinsin mi?`);
    if (!ok) return;
    await supabase.from("ingredients").update({ deleted_at: new Date().toISOString() }).eq("id", i.ingredient_id);
    if (selectedId === i.ingredient_id) setSelectedId(null);
    await load();
  };

  // "Diğer" (gruplanmamış) başlığına isim verilince gerçek bir başlığa dönüşür,
  // içindeki malzemeler oraya taşınır.
  const promoteUngrouped = async (name: string) => {
    if (!restaurantId) return;
    const { data: g } = await supabase.from("stock_groups").insert({
      restaurant_id: restaurantId, name: toUpperTr(name), sort_order: groups.length,
    }).select("id").single();
    if (!g) return;
    await supabase.from("ingredients").update({ stock_group_id: g.id })
      .eq("restaurant_id", restaurantId).is("stock_group_id", null);
    setExpanded((prev) => new Set(prev).add(g.id));
    await load();
  };

  const saveSupplierLink = async (supplierId: string) => {
    if (!selected) return;
    setInSupplier(supplierId);
    await supabase.from("ingredients").update({ supplier_id: supplierId || null }).eq("id", selected.ingredient_id);
    await load();
  };

  // Onerilen Sipariş Listesi — canlı öneriler (hiçbir şey kaydetmez, her çağrıda taze hesaplanır)
  const loadSuggestions = useCallback(async () => {
    if (!restaurantId) return;
    setSuggestionsBusy(true);
    const { data, error } = await supabase.rpc("suggested_purchase_list", { p_restaurant: restaurantId });
    setSuggestionsBusy(false);
    if (error) return;
    setSuggestions((data as SuggestionRow[]) ?? []);
  }, [restaurantId]);

  const loadPendingRequests = useCallback(async () => {
    if (!restaurantId) return;
    const { data } = await supabase.from("purchase_requests")
      .select("id, ingredient_id, supplier_id, suggested_qty, status, ingredients(name, unit), suppliers(name)")
      .eq("restaurant_id", restaurantId)
      .in("status", ["onaylandi", "siparis_verildi"])
      .order("created_at", { ascending: false });
    type Row = {
      id: string; ingredient_id: string; supplier_id: string | null; suggested_qty: number; status: string;
      ingredients: { name: string; unit: string } | null; suppliers: { name: string } | null;
    };
    const rows = ((data as Row[] | null) ?? []).map((r) => ({
      id: r.id, ingredient_id: r.ingredient_id,
      ingredient_name: r.ingredients?.name ?? "—", unit: r.ingredients?.unit ?? "",
      supplier_id: r.supplier_id, supplier_name: r.suppliers?.name ?? "—",
      suggested_qty: r.suggested_qty, status: r.status,
    }));
    setPendingRequests(rows);
  }, [restaurantId]);

  const openOrders = () => {
    setShowOrders(true);
    loadSuggestions();
    loadPendingRequests();
  };

  const approveSuggestion = async (row: SuggestionRow) => {
    if (!restaurantId) return;
    await supabase.rpc("approve_purchase_request", {
      p_restaurant: restaurantId, p_ingredient_id: row.ingredient_id, p_supplier_id: row.supplier_id,
      p_quantity: row.suggested_qty, p_days: row.days_until_delivery, p_staff_id: null,
    });
    await Promise.all([loadSuggestions(), loadPendingRequests()]);
  };

  const rejectSuggestion = async (row: SuggestionRow) => {
    if (!restaurantId) return;
    await supabase.from("purchase_requests").insert({
      restaurant_id: restaurantId, ingredient_id: row.ingredient_id, supplier_id: row.supplier_id,
      suggested_qty: row.suggested_qty, target_days: row.days_until_delivery,
      reason: "elle reddedildi", status: "reddedildi",
    });
    await loadSuggestions();
  };

  const markOrdered = async (id: string) => {
    await supabase.from("purchase_requests").update({ status: "siparis_verildi" }).eq("id", id);
    await loadPendingRequests();
  };

  const openInvoiceForRequest = (row: PendingRequest) => {
    setInvPurchaseRequestId(row.id);
    setInvSupplier(row.supplier_id ?? "");
    setInvRef("");
    setInvDate(bugunTarih());
    setInvRows([{ ingredientId: row.ingredient_id, qty: String(row.suggested_qty), price: "" }]);
    setInvErr(null);
    setShowOrders(false);
    setShowInvoice(true);
  };

  const ungrouped = filtered.filter((i) => !i.stock_group_id).sort((a, b) => a.sort_order - b.sort_order);
  const sections: Section[] = [
    ...groups.map((g) => ({ id: g.id, name: g.name, items: filtered.filter((i) => i.stock_group_id === g.id).sort((a, b) => a.sort_order - b.sort_order) })),
    { id: UNGROUPED, name: "Diğer", items: ungrouped },
  ];
  const sortableSectionIds = groups.map((g) => g.id);

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;

    // gruplar arası sıralama
    if (sortableSectionIds.includes(String(active.id)) && sortableSectionIds.includes(String(over.id))) {
      const oldIndex = groups.findIndex((g) => g.id === active.id);
      const newIndex = groups.findIndex((g) => g.id === over.id);
      const reordered = arrayMove(groups, oldIndex, newIndex);
      await Promise.all(reordered.map((g, i) => supabase.from("stock_groups").update({ sort_order: i }).eq("id", g.id)));
      await load();
      return;
    }

    // aynı başlık içindeki malzemeler arası sıralama
    const sec = sections.find((s) => s.items.some((it) => it.ingredient_id === active.id) && s.items.some((it) => it.ingredient_id === over.id));
    if (!sec) return;
    const oldIndex = sec.items.findIndex((it) => it.ingredient_id === active.id);
    const newIndex = sec.items.findIndex((it) => it.ingredient_id === over.id);
    const reordered = arrayMove(sec.items, oldIndex, newIndex);
    await Promise.all(reordered.map((it, i) => supabase.from("ingredients").update({ sort_order: i }).eq("id", it.ingredient_id)));
    await load();
  };

  const ctx: Ctx = {
    expanded, selectedId, toggle, selectItem, deleteGroup, deleteIngredient,
    renameGroup, renameIngredient, promoteUngrouped, addIngredient,
  };

  return (
    <div style={{ padding: "26px 28px", height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      {confirmDialog}
      <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 16, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>Stok</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 7 }}>
            {items.length} malzeme · {kritikSayisi} kritik
          </div>
        </div>
        <button onClick={openNeeds} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 18px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13.5, fontWeight: 500 }}>
          <ClipboardList size={15} /> İhtiyaç listesi
        </button>
        <button onClick={openOrders} style={{ marginLeft: 10, display: "inline-flex", alignItems: "center", gap: 7, border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 18px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13.5, fontWeight: 500 }}>
          <ShoppingCart size={15} /> Sipariş Listesi
        </button>
        <button onClick={openInvoice} style={{ marginLeft: 10, display: "inline-flex", alignItems: "center", gap: 7, border: "none", borderRadius: 980, padding: "9px 18px", background: "var(--brand-strong)", color: "#fff", fontSize: 13.5, fontWeight: 500 }}>
          <ReceiptText size={15} /> Fatura gir
        </button>
        <div style={{ marginLeft: 12, display: "flex", gap: 6, background: "var(--recede)", padding: 3, borderRadius: 980 }}>
          {(["kritik", "tumu", "gida", "sarf"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} style={{
              fontSize: 12.5, padding: "6px 14px", borderRadius: 980, border: "none",
              background: filter === f ? "var(--ink-green)" : "transparent",
              color: filter === f ? "#fff" : "var(--muted)",
            }}>
              {f === "kritik" ? "Kritik" : f === "tumu" ? "Tümü" : f === "gida" ? "Gıda" : "Sarf"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 22, flex: 1, minHeight: 0 }}>
        {/* list */}
        <div style={{ flex: 1.4, minWidth: 0, border: "1px solid var(--line)", borderRadius: 18, background: "var(--card)", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", fontSize: 11, color: "var(--muted-2)", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
            <span style={{ width: 22 }} />
            <span style={{ flex: 1.6 }}>Malzeme</span>
            <span style={{ width: 60 }}>Tür</span>
            <span style={{ flex: 1 }}>Tedarikçi</span>
            <span style={{ width: 70, textAlign: "right" }}>Kritik</span>
            <span style={{ width: 80, textAlign: "right" }}>Stok</span>
            <span style={{ width: 26 }} />
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            <StokCtx.Provider value={ctx}>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={sortableSectionIds} strategy={verticalListSortingStrategy}>
                  {groups.map((g) => {
                    const sec = sections.find((s) => s.id === g.id)!;
                    if (sec.items.length === 0 && !expanded.has(g.id)) { /* still show, just collapsed */ }
                    return <SectionRow key={sec.id} sec={sec} sortable />;
                  })}
                </SortableContext>
                {(() => {
                  const diger = sections.find((s) => s.id === UNGROUPED)!;
                  if (diger.items.length === 0 && groups.length > 0) return null;
                  return <SectionRow sec={diger} sortable={false} />;
                })()}
              </DndContext>
            </StokCtx.Provider>
          </div>

          <div style={{ borderTop: "1px solid var(--line)", padding: 10, flexShrink: 0 }}>
            {!addingGroup ? (
              <button onClick={() => setAddingGroup(true)} style={btnSecondary}><Plus size={15} /> Yeni başlık</button>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addGroup()} placeholder="Başlık adı (Mutfak, Bar, Depo)" style={{ ...inp, flex: 1 }} autoFocus />
                <button onClick={addGroup} style={btnSmall}>Ekle</button>
              </div>
            )}
          </div>
        </div>

        {/* detail */}
        <div style={{ flex: 1, minWidth: 300, maxWidth: 360, border: "1px solid var(--line)", borderRadius: 18, background: "var(--card)", padding: 20, display: "flex", flexDirection: "column", minHeight: 0 }}>
          {!selected && <div style={{ color: "var(--muted)", fontSize: 14, margin: "auto" }}>Bir malzeme seç</div>}
          {selected && (
            <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <EditableText value={selected.ingredient_name} onSave={(v) => renameIngredient(selected.ingredient_id, v)} style={{ fontSize: 18, fontWeight: 600, color: "var(--ink-green)" }} />
                <button onClick={() => deleteIngredient(selected)} aria-label="sil" style={{ all: "unset", cursor: "pointer", color: "var(--muted-2)", display: "inline-flex" }}><Trash2 size={15} /></button>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>
                {selected.category === "gida" ? "Gıda malzemesi" : "Sarf malzemesi"} · {selected.unit}
                {selected.stock_group_name ? ` · ${selected.stock_group_name}` : ""}
              </div>

              <div style={{ marginTop: 14, borderTop: "1px solid var(--line)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
                  <span style={{ color: "var(--muted)" }}>Mevcut stok</span>
                  <span className="tnum" style={{ fontWeight: 600 }}>{num(selected.current_stock)} {selected.unit}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
                  <span style={{ color: "var(--muted)" }}>Kritik seviye</span>
                  <span className="tnum" style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                    <EditableText value={String(selected.par_level)} onSave={updateParLevel} inputWidth={60} style={{ fontWeight: 600, textAlign: "right" }} /> {selected.unit}
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
                  <span style={{ color: "var(--muted)" }}>Günlük ort. tüketim</span>
                  <span className="tnum" style={{ fontWeight: 600 }}>{num(selected.avg_daily_usage)} {selected.unit}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", fontSize: 13.5 }}>
                  <span style={{ color: "var(--muted)" }}>7 gün beklenen ihtiyaç</span>
                  <span className="tnum" style={{ fontWeight: 600 }}>{num(selected.expected_usage)} {selected.unit}</span>
                </div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)", marginBottom: 8 }}>Tedarikçi</div>
                {!showNewSup ? (
                  <select value={inSupplier} onChange={(e) => e.target.value === "__new" ? openNewSupplierForm() : saveSupplierLink(e.target.value)} style={{ ...inp, width: "100%" }}>
                    <option value="">Tedarikçi seç</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} ({freqLabel[s.delivery_frequency]})</option>)}
                    <option value="__new">+ Yeni tedarikçi</option>
                  </select>
                ) : (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <input value={nsName} onChange={(e) => setNsName(e.target.value)} placeholder="Tedarikçi adı" style={{ ...inp, flex: 1, minWidth: 100 }} />
                    <select value={nsFreq} onChange={(e) => setNsFreq(e.target.value)} style={{ ...inp, width: 110 }}>
                      <option value="daily">Günlük</option><option value="weekly">Haftalık</option><option value="custom">Özel</option>
                    </select>
                    <button onClick={addSupplier} style={btnSmall}>Ekle</button>
                    {nsFreq === "custom" && (
                      <div style={{ display: "flex", gap: 4, width: "100%" }}>
                        {DAY_LABELS.map((d) => {
                          const active = nsDays.has(d.iso);
                          return (
                            <button key={d.iso} onClick={() => toggleNsDay(d.iso)} style={{
                              flex: 1, border: "1px solid var(--line-2)", borderRadius: 8, padding: "6px 0", fontSize: 11.5,
                              background: active ? "var(--ink-green)" : "var(--card)", color: active ? "#fff" : "var(--muted)",
                            }}>
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)", marginBottom: 8 }}>Stok girişi</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input value={inQty} onChange={(e) => setInQty(e.target.value)} placeholder={`Miktar (${selected.unit})`} inputMode="decimal" style={{ ...inp, flex: 1 }} />
                  <input value={inPrice} onChange={(e) => setInPrice(e.target.value)} placeholder="Birim fiyat ₺" inputMode="decimal" style={{ ...inp, flex: 1 }} />
                </div>
                <button onClick={addStockIn} style={btnPrimary}>Kaydet</button>
                <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 8 }}>Manuel giriş. E-fatura ve AI foto ile giriş yakında.</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ÇOK KALEMLİ FATURA GİRİŞİ — bir faturadaki tüm kalemler tek seferde (ROADMAP L, Faz 1) */}
      {showInvoice && (
        <>
          <div onClick={() => setShowInvoice(false)} style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", zIndex: 40 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 50, width: "min(760px, 94vw)", maxHeight: "88vh", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, boxShadow: "0 18px 50px rgba(30,57,50,.18)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink-green)" }}>Fatura gir</div>
              <button onClick={() => setShowInvoice(false)} aria-label="kapat" style={{ all: "unset", cursor: "pointer", color: "var(--muted-2)", display: "inline-flex" }}><X size={18} /></button>
            </div>

            <div style={{ padding: "14px 20px", overflowY: "auto", minHeight: 0 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <select value={invSupplier} onChange={(e) => setInvSupplier(e.target.value)} style={{ ...inp, flex: 1.4, minWidth: 160 }}>
                  <option value="">Tedarikçi (opsiyonel)</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name} ({freqLabel[s.delivery_frequency]})</option>)}
                </select>
                <input value={invRef} onChange={(e) => setInvRef(e.target.value)} placeholder="Fatura no (opsiyonel)" style={{ ...inp, flex: 1, minWidth: 130 }} />
                <input type="date" value={invDate} onChange={(e) => setInvDate(e.target.value)} style={{ ...inp, width: 140 }} />
              </div>

              <div style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--muted-2)", padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                <span style={{ flex: 1.6 }}>Malzeme</span>
                <span style={{ width: 100 }}>Miktar</span>
                <span style={{ width: 110 }}>Birim fiyat ₺</span>
                <span style={{ width: 90, textAlign: "right" }}>Tutar</span>
                <span style={{ width: 26 }} />
              </div>
              {invRows.map((r, idx) => {
                const it = items.find((x) => x.ingredient_id === r.ingredientId);
                const satirTutar = (parseFloat(r.qty.replace(",", ".")) || 0) * (parseFloat(r.price.replace(",", ".")) || 0);
                return (
                  <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
                    <select value={r.ingredientId} onChange={(e) => setInvRow(idx, { ingredientId: e.target.value })} style={{ ...inp, flex: 1.6 }}>
                      <option value="">Malzeme seç</option>
                      {items.map((i) => <option key={i.ingredient_id} value={i.ingredient_id}>{i.ingredient_name} ({i.unit})</option>)}
                    </select>
                    <input value={r.qty} onChange={(e) => setInvRow(idx, { qty: e.target.value })} placeholder={it ? `Miktar (${it.unit})` : "Miktar"} inputMode="decimal" style={{ ...inp, width: 100 }} />
                    <input value={r.price} onChange={(e) => setInvRow(idx, { price: e.target.value })} placeholder="₺" inputMode="decimal" style={{ ...inp, width: 110 }} />
                    <span className="tnum" style={{ width: 90, textAlign: "right", fontSize: 13.5, color: satirTutar > 0 ? "var(--ink)" : "var(--muted-2)" }}>{satirTutar > 0 ? money(satirTutar) : "—"}</span>
                    <button onClick={() => setInvRows((rows) => rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows)} aria-label="satırı sil" style={{ all: "unset", cursor: "pointer", width: 26, color: "var(--muted-2)", display: "inline-flex", justifyContent: "center" }}><Trash2 size={14} /></button>
                  </div>
                );
              })}
              <button onClick={() => setInvRows((rows) => [...rows, { ingredientId: "", qty: "", price: "" }])} style={{ all: "unset", cursor: "pointer", fontSize: 12.5, color: "var(--brand)", padding: "10px 0 4px", display: "block" }}>
                + satır ekle
              </button>

              {invErr && <div style={{ marginTop: 10, padding: "9px 13px", borderRadius: 10, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13 }}>{invErr}</div>}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 20px", borderTop: "1px solid var(--line)" }}>
              <div style={{ fontSize: 13.5, color: "var(--muted)" }}>Toplam <b className="tnum" style={{ color: "var(--ink-green)", fontSize: 16 }}>{money(invTotal)}</b></div>
              <button onClick={saveInvoice} disabled={invBusy} style={{ border: "none", borderRadius: 980, padding: "11px 26px", background: "var(--brand-strong)", color: "#fff", fontSize: 14, fontWeight: 500, opacity: invBusy ? 0.6 : 1 }}>
                {invBusy ? "Kaydediliyor…" : "Faturayı kaydet"}
              </button>
            </div>
          </div>
        </>
      )}

      {showNeeds && (
        <>
          <div onClick={() => setShowNeeds(false)} style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", zIndex: 40 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 50, width: "min(640px, 94vw)", maxHeight: "88vh", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, boxShadow: "0 18px 50px rgba(30,57,50,.18)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink-green)" }}>İhtiyaç listesi</div>
              <button onClick={() => setShowNeeds(false)} aria-label="kapat" style={{ all: "unset", cursor: "pointer", color: "var(--muted-2)", display: "inline-flex" }}><X size={18} /></button>
            </div>

            <div style={{ padding: "14px 20px", overflowY: "auto", minHeight: 0 }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
                Bir kategori seç, günlük kaç porsiyon satılacağını tahmin et — hangi ürünün tam olarak ne kadar satacağı bilinmese de, menüdeki tahmini satış paylarına göre malzeme ihtiyacı hesaplanır.
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <select value={needsCategoryId} onChange={(e) => setNeedsCategoryId(e.target.value)} style={{ ...inp, flex: 1.6 }}>
                  <option value="">Kategori seç</option>
                  {menuCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <input value={needsCovers} onChange={(e) => setNeedsCovers(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && calcNeeds()} placeholder="Porsiyon" inputMode="numeric" style={{ ...inp, width: 100 }} />
                <button onClick={calcNeeds} disabled={needsBusy || !needsCategoryId} style={btnSmall}>Hesapla</button>
              </div>

              {needsErr && <div style={{ marginBottom: 10, padding: "9px 13px", borderRadius: 10, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13 }}>{needsErr}</div>}

              {needsResults && (
                <>
                  <div style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--muted-2)", padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ flex: 1.6 }}>Malzeme</span>
                    <span style={{ width: 90, textAlign: "right" }}>Gereken</span>
                    <span style={{ width: 80, textAlign: "right" }}>Mevcut</span>
                    <span style={{ width: 80, textAlign: "right" }}>Eksik</span>
                    <span style={{ width: 90, textAlign: "right" }}>Tahmini ₺</span>
                  </div>
                  {needsResults.map((r) => (
                    <div key={r.ingredient_id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
                      <span style={{ flex: 1.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.ingredient_name}</span>
                      <span className="tnum" style={{ width: 90, textAlign: "right" }}>{num(r.needed_quantity)} {r.unit}</span>
                      <span className="tnum" style={{ width: 80, textAlign: "right", color: "var(--muted)" }}>{num(r.current_stock)}</span>
                      <span className="tnum" style={{ width: 80, textAlign: "right", color: r.shortfall > 0 ? "var(--danger)" : "var(--muted-2)", fontWeight: r.shortfall > 0 ? 600 : 400 }}>{r.shortfall > 0 ? num(r.shortfall) : "—"}</span>
                      <span className="tnum" style={{ width: 90, textAlign: "right" }}>{money(r.estimated_cost)}</span>
                    </div>
                  ))}
                  {needsResults.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>Bu kategorideki ürünlerde reçete tanımlı değil.</div>}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10, fontSize: 13.5 }}>
                    Toplam tahmini maliyet: <b className="tnum" style={{ marginLeft: 6, color: "var(--ink-green)" }}>{money(needsResults.reduce((s, r) => s + r.estimated_cost, 0))}</b>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* ONERİLEN SİPARİŞ LİSTESİ — canlı öneriler (suggested_purchase_list) + bekleyen siparişler */}
      {showOrders && (
        <>
          <div onClick={() => setShowOrders(false)} style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", zIndex: 40 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 50, width: "min(920px, 96vw)", maxHeight: "88vh", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, boxShadow: "0 18px 50px rgba(30,57,50,.18)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink-green)" }}>Sipariş listesi</div>
              <button onClick={() => setShowOrders(false)} aria-label="kapat" style={{ all: "unset", cursor: "pointer", color: "var(--muted-2)", display: "inline-flex" }}><X size={18} /></button>
            </div>

            <div style={{ padding: "14px 20px", overflowY: "auto", minHeight: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)" }}>Canlı öneriler</div>
                <button onClick={loadSuggestions} disabled={suggestionsBusy} style={{ all: "unset", cursor: "pointer", fontSize: 12, color: "var(--brand)" }}>
                  {suggestionsBusy ? "Yükleniyor…" : "Yenile"}
                </button>
              </div>

              {suggestions === null && <div style={{ fontSize: 13, color: "var(--muted-2)", padding: "8px 0 16px" }}>Yükleniyor…</div>}
              {suggestions && suggestions.length === 0 && (
                <div style={{ fontSize: 13, color: "var(--muted-2)", padding: "8px 0 16px" }}>Şu an kritik seviyenin altında, tedarikçisi olan malzeme yok.</div>
              )}
              {suggestions && suggestions.length > 0 && (
                <>
                  <div style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--muted-2)", padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ flex: 1.4 }}>Malzeme</span>
                    <span style={{ width: 70, textAlign: "right" }}>Stok</span>
                    <span style={{ width: 70, textAlign: "right" }}>Kritik</span>
                    <span style={{ width: 90, textAlign: "right" }}>Öner. miktar</span>
                    <span style={{ width: 90 }}>Teslimat</span>
                    <span style={{ flex: 1 }}>Tedarikçi</span>
                    <span style={{ width: 80, textAlign: "right" }}>Tutar</span>
                    <span style={{ width: 150 }} />
                  </div>
                  {suggestions.map((r) => (
                    <div key={r.ingredient_id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
                      <span style={{ flex: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.ingredient_name}</span>
                      <span className="tnum" style={{ width: 70, textAlign: "right", color: "var(--muted)" }}>{num(r.current_stock)}</span>
                      <span className="tnum" style={{ width: 70, textAlign: "right", color: "var(--muted)" }}>{num(r.par_level)}</span>
                      <span className="tnum" style={{ width: 90, textAlign: "right", fontWeight: 600 }}>{num(r.suggested_qty)} {r.unit}</span>
                      <span style={{ width: 90, fontSize: 12, color: "var(--muted)" }}>{r.days_until_delivery} gün sonra</span>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--muted)" }}>{r.supplier_name}</span>
                      <span className="tnum" style={{ width: 80, textAlign: "right" }}>{money(r.estimated_cost)}</span>
                      <span style={{ width: 150, display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button onClick={() => approveSuggestion(r)} style={{ ...btnSmall, padding: "6px 12px", fontSize: 12 }}>Onayla</button>
                        <button onClick={() => rejectSuggestion(r)} style={{ border: "1px solid var(--line-2)", borderRadius: 10, padding: "6px 12px", background: "var(--card)", color: "var(--muted)", fontSize: 12 }}>Reddet</button>
                      </span>
                    </div>
                  ))}
                </>
              )}

              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)", margin: "22px 0 8px" }}>Bekleyen siparişler</div>
              {pendingRequests.length === 0 && (
                <div style={{ fontSize: 13, color: "var(--muted-2)", padding: "8px 0" }}>Bekleyen sipariş yok.</div>
              )}
              {pendingRequests.length > 0 && (
                <>
                  <div style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--muted-2)", padding: "4px 0", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ flex: 1.4 }}>Malzeme</span>
                    <span style={{ flex: 1 }}>Tedarikçi</span>
                    <span style={{ width: 90, textAlign: "right" }}>Miktar</span>
                    <span style={{ width: 110 }}>Durum</span>
                    <span style={{ width: 110 }} />
                  </div>
                  {pendingRequests.map((r) => (
                    <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
                      <span style={{ flex: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.ingredient_name}</span>
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--muted)" }}>{r.supplier_name}</span>
                      <span className="tnum" style={{ width: 90, textAlign: "right" }}>{num(r.suggested_qty)} {r.unit}</span>
                      <span style={{ width: 110, fontSize: 12, color: "var(--muted)" }}>{r.status === "onaylandi" ? "Onaylandı" : "Sipariş verildi"}</span>
                      <span style={{ width: 110, display: "flex", justifyContent: "flex-end" }}>
                        {r.status === "onaylandi" ? (
                          <button onClick={() => markOrdered(r.id)} style={{ ...btnSmall, padding: "6px 12px", fontSize: 12 }}>Sipariş Ver</button>
                        ) : (
                          <button onClick={() => openInvoiceForRequest(r)} style={{ ...btnSmall, padding: "6px 12px", fontSize: 12 }}>Fatura Gir</button>
                        )}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SectionRow({ sec, sortable }: { sec: Section; sortable: boolean }) {
  const s = useStok();
  const sortableProps = useSortable({ id: sec.id, disabled: !sortable });
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = sortableProps;
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const open = s.expanded.has(sec.id);

  const [addingIng, setAddingIng] = useState(false);
  const [niName, setNiName] = useState("");
  const [niUnit, setNiUnit] = useState("kg");
  const [niCat, setNiCat] = useState<"gida" | "sarf">("sarf");
  const [niPar, setNiPar] = useState("");
  const [niQty, setNiQty] = useState("");
  const [niPrice, setNiPrice] = useState("");

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{ display: "flex", alignItems: "center", background: open ? "var(--recede)" : "transparent" }}>
        {sortable ? (
          <button {...attributes} {...listeners} aria-label="taşı" style={{ all: "unset", cursor: "grab", padding: "0 6px 0 10px", color: "var(--muted-2)", touchAction: "none", display: "inline-flex" }}><GripVertical size={16} /></button>
        ) : (
          <span style={{ width: 22 }} />
        )}
        <div onClick={() => s.toggle(sec.id)} style={{ cursor: "pointer", flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px 10px 4px" }}>
          {open ? <ChevronDown size={15} color="var(--muted)" /> : <ChevronRight size={15} color="var(--muted)" />}
          <Folder size={15} color="var(--brand)" />
          <EditableText
            value={sec.name}
            onSave={(v) => (sec.id === UNGROUPED ? s.promoteUngrouped(v) : s.renameGroup(sec.id, v))}
            style={{ fontWeight: 600, fontSize: 14, color: "var(--ink-green)" }}
          />
          <span style={{ fontSize: 12, color: "var(--muted-2)" }}>({sec.items.length})</span>
        </div>
        {sec.id !== UNGROUPED && (
          <button onClick={() => s.deleteGroup(sec)} aria-label="başlığı sil" style={{ all: "unset", cursor: "pointer", padding: "0 14px", color: "var(--muted-2)" }}><Trash2 size={13} /></button>
        )}
      </div>

      {open && (
        <div>
          <SortableContext items={sec.items.map((i) => i.ingredient_id)} strategy={verticalListSortingStrategy}>
            {sec.items.map((i) => <IngredientRow key={i.ingredient_id} item={i} />)}
          </SortableContext>
          {sec.items.length === 0 && (
            <div style={{ fontSize: 12.5, color: "var(--muted-2)", padding: "6px 14px 6px 44px" }}>Bu başlıkta malzeme yok</div>
          )}

          {addingIng ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "8px 14px 10px 44px" }}>
              {(() => {
                const submit = () => { s.addIngredient(sec.id === UNGROUPED ? null : sec.id, niName, niUnit, niCat, niPar, niQty, niPrice); setNiName(""); setNiPar(""); setNiQty(""); setNiPrice(""); setAddingIng(false); };
                return (
                  <>
                    <input value={niName} onChange={(e) => setNiName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Ad (Kürdan)" style={{ ...inp, flex: 1, minWidth: 100 }} autoFocus />
                    <select value={niUnit} onChange={(e) => setNiUnit(e.target.value)} style={{ ...inp, width: 70 }}>
                      <option value="kg">kg</option><option value="lt">lt</option><option value="adet">adet</option>
                    </select>
                    <select value={niCat} onChange={(e) => setNiCat(e.target.value as "gida" | "sarf")} style={{ ...inp, width: 85 }}>
                      <option value="gida">Gıda</option><option value="sarf">Sarf</option>
                    </select>
                    <input value={niPar} onChange={(e) => setNiPar(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Kritik seviye" inputMode="decimal" style={{ ...inp, width: 95 }} />
                    <input value={niQty} onChange={(e) => setNiQty(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Miktar (varsa)" inputMode="decimal" style={{ ...inp, width: 100 }} />
                    <input value={niPrice} onChange={(e) => setNiPrice(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Birim fiyat ₺" inputMode="decimal" style={{ ...inp, width: 100 }} />
                    <button onClick={submit} style={btnSmall}>Ekle</button>
                  </>
                );
              })()}
            </div>
          ) : (
            <button onClick={() => { setAddingIng(true); setNiName(""); setNiPar(""); setNiQty(""); setNiPrice(""); }} style={{ all: "unset", cursor: "pointer", fontSize: 12.5, color: "var(--brand)", padding: "6px 14px 10px 44px", display: "block" }}>
              + malzeme
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function IngredientRow({ item }: { item: Item }) {
  const s = useStok();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.ingredient_id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, display: "flex", alignItems: "center", borderBottom: "1px solid var(--line)" };
  const crit = item.par_level > 0 && item.current_stock <= item.par_level;
  const selected = s.selectedId === item.ingredient_id;

  return (
    <div ref={setNodeRef} style={style}>
      <button {...attributes} {...listeners} aria-label="taşı" style={{ all: "unset", cursor: "grab", padding: "0 6px 0 24px", color: "var(--muted-2)", touchAction: "none", display: "inline-flex" }}><GripVertical size={14} /></button>
      <div onClick={() => s.selectItem(item)} style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, padding: "9px 14px 9px 4px", cursor: "pointer", background: selected ? "var(--recede)" : "transparent" }}>
        <div style={{ flex: 1.6, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          <EditableText value={item.ingredient_name} onSave={(v) => s.renameIngredient(item.ingredient_id, v)} style={{ fontSize: 13.5, fontWeight: 500, color: "var(--ink)" }} />
        </div>
        <span style={{ width: 60, fontSize: 12, color: "var(--muted)" }}>{item.category === "gida" ? "Gıda" : "Sarf"}</span>
        <span style={{ flex: 1, fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.supplier_name ?? "—"}</span>
        <span className="tnum" style={{ width: 70, textAlign: "right", fontSize: 12, color: "var(--muted)" }}>{num(item.par_level)}</span>
        <span className="tnum" style={{ width: 80, textAlign: "right", fontSize: 13.5, fontWeight: 600, color: crit ? "var(--gold-text)" : "var(--ink)" }}>
          {num(item.current_stock)} {item.unit}
        </span>
      </div>
      <button onClick={() => s.deleteIngredient(item)} aria-label="sil" style={{ all: "unset", cursor: "pointer", padding: "0 12px", color: "var(--muted-2)" }}><Trash2 size={13} /></button>
    </div>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "9px 12px", fontSize: 14, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0 };
const btnPrimary: React.CSSProperties = { width: "100%", border: "none", borderRadius: 980, padding: 12, background: "var(--brand-strong)", color: "#fff", fontSize: 14, fontWeight: 500 };
const btnSecondary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 16px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13.5, width: "100%", justifyContent: "center" };
const btnSmall: React.CSSProperties = { border: "none", borderRadius: 10, padding: "9px 14px", background: "var(--ink-green)", color: "#fff", fontSize: 13.5 };
