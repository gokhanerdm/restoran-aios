"use client";

import { useCallback, useEffect, useMemo, useState, createContext, useContext } from "react";
import { supabase } from "@/lib/supabase/client";
import { Plus, ChevronDown, ChevronRight, Folder, GripVertical, Trash2 } from "lucide-react";
import EditableText from "../components/EditableText";
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
type Supplier = { id: string; name: string; delivery_frequency: string };
type Group = { id: string; name: string; sort_order: number };
type Section = { id: string; name: string; items: Item[] };

const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;
const num = (n: number) => Number(n).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
const freqLabel: Record<string, string> = { daily: "Günlük", weekly: "Haftalık", custom: "Özel" };
const UNGROUPED = "__ungrouped";

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

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const load = useCallback(async () => {
    const { data: rest } = await supabase.from("restaurants").select("id").is("deleted_at", null).limit(1).single();
    if (!rest) return;
    setRestaurantId(rest.id);
    const [{ data: usage }, { data: sup }, { data: grp }] = await Promise.all([
      supabase.rpc("ingredient_expected_usage", { p_restaurant: rest.id, p_days_ahead: 7 }),
      supabase.from("suppliers").select("id, name, delivery_frequency").eq("restaurant_id", rest.id).is("deleted_at", null).order("name"),
      supabase.from("stock_groups").select("id, name, sort_order").eq("restaurant_id", rest.id).is("deleted_at", null).order("sort_order"),
    ]);
    setItems((usage as Item[]) ?? []);
    setSuppliers((sup as Supplier[]) ?? []);
    setGroups((grp as Group[]) ?? []);
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

  const addSupplier = async () => {
    if (!restaurantId || !nsName.trim()) return;
    const { data } = await supabase.from("suppliers").insert({
      restaurant_id: restaurantId, name: toTitleTr(nsName), delivery_frequency: nsFreq,
    }).select("id").single();
    setNsName(""); setShowNewSup(false);
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

  const deleteGroup = async (sec: Section) => {
    if (sec.items.length > 0) {
      const ok = window.confirm(`Bu başlıkta ${sec.items.length} malzeme var. Silersen malzemeler "Diğer"e düşer. Yine de silinsin mi?`);
      if (!ok) return;
    }
    await supabase.from("stock_groups").update({ deleted_at: new Date().toISOString() }).eq("id", sec.id);
    await load();
  };
  const deleteIngredient = async (i: Item) => {
    const ok = window.confirm(`"${i.ingredient_name}" silinsin mi?`);
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
      <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 16, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1 }}>Stok</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 7 }}>
            {items.length} malzeme · {kritikSayisi} kritik
          </div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, background: "var(--recede)", padding: 3, borderRadius: 980 }}>
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
                <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
                  <span style={{ color: "var(--muted)" }}>Kritik seviye</span>
                  <span className="tnum" style={{ fontWeight: 600 }}>{num(selected.par_level)} {selected.unit}</span>
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
                  <select value={inSupplier} onChange={(e) => e.target.value === "__new" ? setShowNewSup(true) : saveSupplierLink(e.target.value)} style={{ ...inp, width: "100%" }}>
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
