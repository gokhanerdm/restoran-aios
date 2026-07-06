"use client";

import { useCallback, useEffect, useState, createContext, useContext } from "react";
import { supabase } from "@/lib/supabase/client";
import { Plus, Trash2, ChevronRight, ChevronDown, Folder, GripVertical } from "lucide-react";
import EditableText from "../components/EditableText";
import { toUpperTr, toTitleTr } from "@/lib/text";
import {
  DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Category = { id: string; name: string; parent_id: string | null };
type Product = { id: string; name: string; sale_price: number; vat_rate: number; category_id: string | null; calorie_override: number | null };
type Nutri = { kcal_per_unit: number; diet_class: string; allergens: string[] };
type Ingredient = { id: string; name: string; unit: string; current_unit_cost: number };
type RecipeRow = { id: string; ingredient_id: string; quantity: number; ingredients: ({ name: string; unit: string; current_unit_cost: number } & Nutri) | null };

const ALLERGENS = ["Gluten", "Süt", "Yumurta", "Sert kabuklu", "Yer fıstığı", "Soya", "Balık", "Kabuklu deniz", "Susam", "Hardal"];
const DIET_OPTS = [
  { v: "bitkisel", l: "Bitkisel (vegan)" },
  { v: "hayvansal", l: "Süt/yumurta (vejetaryen)" },
  { v: "et", l: "Et / balık" },
];
type Variant = { id: string; name: string; sale_price: number };
type Modifier = { id: string; name: string; price_delta: number };
type Group = { id: string; name: string; required: boolean; min_select: number; max_select: number; modifiers: Modifier[] };
type ItemGroup = { id: string; group_id: string; modifier_groups: Group | null };

const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;

type Ctx = {
  categories: Category[];
  products: Product[];
  expanded: Set<string>;
  selectedId: string | null;
  toggle: (id: string) => void;
  selectProduct: (p: Product) => void;
  deleteCategory: (id: string) => void;
  addCategory: (parentId: string | null, name: string) => void;
  addProduct: (catId: string, name: string, price: string, vat: string) => void;
  renameCategory: (id: string, name: string) => void;
  renameProduct: (id: string, name: string) => void;
};
const MenuCtx = createContext<Ctx | null>(null);
const useMenu = () => useContext(MenuCtx)!;

export default function MenuPage() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [allGroups, setAllGroups] = useState<{ id: string; name: string }[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [recipe, setRecipe] = useState<RecipeRow[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [rootCat, setRootCat] = useState("");

  const [recIng, setRecIng] = useState("");
  const [recQty, setRecQty] = useState("");
  const [showNewIng, setShowNewIng] = useState(false);
  const [niName, setNiName] = useState("");
  const [niUnit, setNiUnit] = useState("kg");
  const [niCost, setNiCost] = useState("");
  const [niKcal, setNiKcal] = useState("");
  const [niDiet, setNiDiet] = useState("bitkisel");
  const [niAllergens, setNiAllergens] = useState<string[]>([]);
  const [nvName, setNvName] = useState("");
  const [nvPrice, setNvPrice] = useState("");
  const [attachGroup, setAttachGroup] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [ngName, setNgName] = useState("");
  const [ngRequired, setNgRequired] = useState(false);
  const [ngMin, setNgMin] = useState("0");
  const [ngMax, setNgMax] = useState("1");
  const [modGroup, setModGroup] = useState<string | null>(null);
  const [nmName, setNmName] = useState("");
  const [nmPrice, setNmPrice] = useState("");

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const loadBase = useCallback(async () => {
    const { data: rest } = await supabase.from("restaurants").select("id").is("deleted_at", null).limit(1).single();
    if (!rest) return;
    setRestaurantId(rest.id);
    const [{ data: c }, { data: p }, { data: i }, { data: g }] = await Promise.all([
      supabase.from("menu_categories").select("id, name, parent_id").eq("restaurant_id", rest.id).is("deleted_at", null).order("sort_order"),
      supabase.from("menu_items").select("id, name, sale_price, vat_rate, category_id, calorie_override").eq("restaurant_id", rest.id).is("deleted_at", null).order("sort_order"),
      supabase.from("ingredients").select("id, name, unit, current_unit_cost").eq("restaurant_id", rest.id).is("deleted_at", null).order("name"),
      supabase.from("modifier_groups").select("id, name").eq("restaurant_id", rest.id).is("deleted_at", null).order("name"),
    ]);
    setCategories((c as Category[]) ?? []);
    setProducts((p as Product[]) ?? []);
    setIngredients((i as Ingredient[]) ?? []);
    setAllGroups((g as { id: string; name: string }[]) ?? []);
  }, []);

  useEffect(() => { loadBase(); }, [loadBase]);

  const loadExtras = useCallback(async (productId: string) => {
    const [{ data: rec }, { data: v }, { data: ig }] = await Promise.all([
      supabase.from("recipe_items").select("id, ingredient_id, quantity, ingredients(name, unit, current_unit_cost, kcal_per_unit, diet_class, allergens)").eq("menu_item_id", productId),
      supabase.from("product_variants").select("id, name, sale_price").eq("menu_item_id", productId).is("deleted_at", null).order("sort_order"),
      supabase.from("menu_item_modifier_groups").select("id, group_id, modifier_groups(id, name, required, min_select, max_select, modifiers(id, name, price_delta))").eq("menu_item_id", productId),
    ]);
    setRecipe((rec as unknown as RecipeRow[]) ?? []);
    setVariants((v as Variant[]) ?? []);
    setItemGroups((ig as unknown as ItemGroup[]) ?? []);
  }, []);

  const selectProduct = (p: Product) => {
    setSelectedProduct(p); loadExtras(p.id);
    setRecIng(""); setRecQty(""); setShowNewIng(false);
    setNvName(""); setNvPrice(""); setAttachGroup(""); setShowNewGroup(false); setModGroup(null);
  };

  const toggle = (id: string) => {
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const addCategory = async (parentId: string | null, name: string) => {
    if (!restaurantId || !name.trim()) return;
    const siblings = categories.filter((c) => c.parent_id === parentId).length;
    await supabase.from("menu_categories").insert({ restaurant_id: restaurantId, name: toUpperTr(name), parent_id: parentId, sort_order: siblings });
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
    setRootCat(""); await loadBase();
  };
  const renameCategory = async (id: string, name: string) => {
    await supabase.from("menu_categories").update({ name: toUpperTr(name) }).eq("id", id);
    await loadBase();
  };
  const renameProduct = async (id: string, name: string) => {
    await supabase.from("menu_items").update({ name: toTitleTr(name) }).eq("id", id);
    if (selectedProduct?.id === id) setSelectedProduct({ ...selectedProduct, name: toTitleTr(name) });
    await loadBase();
  };
  const deleteCategory = async (id: string) => {
    const childCount = categories.filter((c) => c.parent_id === id).length;
    const prodCount = products.filter((p) => p.category_id === id).length;
    if (childCount + prodCount > 0) {
      const ok = window.confirm(`Bu kategoride ${prodCount} ürün ve ${childCount} alt kategori var. Silersen menüde görünmez olurlar. Yine de silinsin mi?`);
      if (!ok) return;
    }
    await supabase.from("menu_categories").update({ deleted_at: new Date().toISOString() }).eq("id", id); await loadBase();
  };
  const addProduct = async (catId: string, name: string, price: string, vat: string) => {
    if (!restaurantId || !name.trim()) return;
    const count = products.filter((p) => p.category_id === catId).length;
    await supabase.from("menu_items").insert({ restaurant_id: restaurantId, category_id: catId, name: toTitleTr(name), sale_price: parseFloat(price) || 0, vat_rate: parseFloat(vat) || 0, sort_order: count });
    await loadBase();
  };
  const saveProduct = async () => {
    if (!selectedProduct) return;
    await supabase.from("menu_items").update({ name: toTitleTr(selectedProduct.name), sale_price: selectedProduct.sale_price, vat_rate: selectedProduct.vat_rate, calorie_override: selectedProduct.calorie_override }).eq("id", selectedProduct.id); await loadBase();
  };
  const deleteProduct = async () => {
    if (!selectedProduct) return;
    await supabase.from("menu_items").update({ deleted_at: new Date().toISOString() }).eq("id", selectedProduct.id); setSelectedProduct(null); await loadBase();
  };

  const addRecipeRow = async () => {
    if (!restaurantId || !selectedProduct || !recIng || !recQty) return;
    await supabase.from("recipe_items").insert({ restaurant_id: restaurantId, menu_item_id: selectedProduct.id, ingredient_id: recIng, quantity: parseFloat(recQty) || 0 });
    setRecIng(""); setRecQty(""); await loadExtras(selectedProduct.id);
  };
  const deleteRecipeRow = async (id: string) => { if (!selectedProduct) return; await supabase.from("recipe_items").delete().eq("id", id); await loadExtras(selectedProduct.id); };
  const addIngredient = async () => {
    if (!restaurantId || !niName.trim()) return;
    const { data } = await supabase.from("ingredients").insert({ restaurant_id: restaurantId, name: niName.trim(), unit: niUnit, current_unit_cost: parseFloat(niCost) || 0, kcal_per_unit: parseFloat(niKcal) || 0, diet_class: niDiet, allergens: niAllergens }).select("id").single();
    setNiName(""); setNiCost(""); setNiKcal(""); setNiDiet("bitkisel"); setNiAllergens([]); setShowNewIng(false); await loadBase(); if (data) setRecIng(data.id);
  };
  const addVariant = async () => {
    if (!restaurantId || !selectedProduct || !nvName.trim()) return;
    await supabase.from("product_variants").insert({ restaurant_id: restaurantId, menu_item_id: selectedProduct.id, name: nvName.trim(), sale_price: parseFloat(nvPrice) || 0, sort_order: variants.length });
    setNvName(""); setNvPrice(""); await loadExtras(selectedProduct.id);
  };
  const deleteVariant = async (id: string) => { if (!selectedProduct) return; await supabase.from("product_variants").update({ deleted_at: new Date().toISOString() }).eq("id", id); await loadExtras(selectedProduct.id); };
  const attachExisting = async (groupId: string) => {
    if (!restaurantId || !selectedProduct || !groupId) return;
    await supabase.from("menu_item_modifier_groups").insert({ restaurant_id: restaurantId, menu_item_id: selectedProduct.id, group_id: groupId });
    setAttachGroup(""); await loadExtras(selectedProduct.id);
  };
  const createAndAttachGroup = async () => {
    if (!restaurantId || !selectedProduct || !ngName.trim()) return;
    const { data } = await supabase.from("modifier_groups").insert({ restaurant_id: restaurantId, name: ngName.trim(), required: ngRequired, min_select: parseInt(ngMin) || 0, max_select: parseInt(ngMax) || 1 }).select("id").single();
    if (data) await supabase.from("menu_item_modifier_groups").insert({ restaurant_id: restaurantId, menu_item_id: selectedProduct.id, group_id: data.id });
    setNgName(""); setNgRequired(false); setNgMin("0"); setNgMax("1"); setShowNewGroup(false); await loadBase(); await loadExtras(selectedProduct.id);
  };
  const detachGroup = async (linkId: string) => { if (!selectedProduct) return; await supabase.from("menu_item_modifier_groups").delete().eq("id", linkId); await loadExtras(selectedProduct.id); };
  const addModifier = async (groupId: string) => {
    if (!restaurantId || !selectedProduct || !nmName.trim()) return;
    await supabase.from("modifiers").insert({ restaurant_id: restaurantId, group_id: groupId, name: nmName.trim(), price_delta: parseFloat(nmPrice) || 0 });
    setNmName(""); setNmPrice(""); setModGroup(null); await loadExtras(selectedProduct.id);
  };
  const deleteModifier = async (id: string) => { if (!selectedProduct) return; await supabase.from("modifiers").update({ deleted_at: new Date().toISOString() }).eq("id", id); await loadExtras(selectedProduct.id); };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const lists: { items: { id: string }[]; table: "menu_categories" | "menu_items" }[] = [];
    lists.push({ items: categories.filter((c) => c.parent_id === null), table: "menu_categories" });
    categories.forEach((c) => {
      lists.push({ items: categories.filter((x) => x.parent_id === c.id), table: "menu_categories" });
      lists.push({ items: products.filter((p) => p.category_id === c.id), table: "menu_items" });
    });
    const list = lists.find((l) => l.items.some((it) => it.id === active.id) && l.items.some((it) => it.id === over.id));
    if (!list) return;
    const oldIndex = list.items.findIndex((it) => it.id === active.id);
    const newIndex = list.items.findIndex((it) => it.id === over.id);
    const reordered = arrayMove(list.items, oldIndex, newIndex);
    await Promise.all(reordered.map((r, i) => supabase.from(list.table).update({ sort_order: i }).eq("id", r.id)));
    await loadBase();
  };

  const maliyet = recipe.reduce((s, r) => s + r.quantity * (r.ingredients?.current_unit_cost ?? 0), 0);
  const fiyat = selectedProduct?.sale_price ?? 0;
  const kaloriAuto = Math.round(recipe.reduce((s, r) => s + r.quantity * (r.ingredients?.kcal_per_unit ?? 0), 0));
  const kalori = selectedProduct?.calorie_override ?? kaloriAuto;
  const dietClasses = recipe.map((r) => r.ingredients?.diet_class).filter(Boolean) as string[];
  const diyet = recipe.length === 0 ? "" : dietClasses.every((d) => d === "bitkisel") ? "Vegan" : !dietClasses.includes("et") ? "Vejetaryen" : "Hayvansal içerir";
  const alerjenler = Array.from(new Set(recipe.flatMap((r) => r.ingredients?.allergens ?? [])));
  const attachedIds = itemGroups.map((g) => g.group_id);
  const attachable = allGroups.filter((g) => !attachedIds.includes(g.id));
  const roots = categories.filter((c) => c.parent_id === null);

  const ctx: Ctx = {
    categories, products, expanded, selectedId: selectedProduct?.id ?? null,
    toggle, selectProduct, deleteCategory, addCategory, addProduct,
    renameCategory, renameProduct,
  };

  return (
    <div style={{ padding: "26px 28px", height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", marginBottom: 20, flexShrink: 0 }}>Menü</div>

      <div style={{ display: "flex", gap: 22, flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 300, maxWidth: 420, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <MenuCtx.Provider value={ctx}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <div style={{ border: "1px solid var(--line)", borderRadius: 16, padding: 8, background: "var(--card)", flex: 1, overflowY: "auto", minHeight: 0 }}>
                <SortableContext items={roots.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                  {roots.map((c) => <CatItem key={c.id} cat={c} depth={0} />)}
                </SortableContext>
                {roots.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: 12 }}>Henüz kategori yok.</div>}
              </div>
            </DndContext>
          </MenuCtx.Provider>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexShrink: 0 }}>
            <input value={rootCat} onChange={(e) => setRootCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCategory(null, rootCat)} placeholder="Ana kategori adı (Ana Yemekler)" style={inp} />
            <button onClick={() => addCategory(null, rootCat)} style={btnSmall}><Plus size={15} /> Kategori</button>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 8, flexShrink: 0 }}>Sıralamak için soldaki tutma kolundan sürükle.</div>
        </div>

        {/* editor */}
        <div style={{ flex: 1.3, minWidth: 340, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: "16px 18px", display: "flex", flexDirection: "column", minHeight: 0 }}>
          {!selectedProduct && <div style={{ color: "var(--muted)", fontSize: 14 }}>Bir başlığı aç, ürün seç ya da ekle.</div>}
          {selectedProduct && (
            <div style={{ flex: 1, display: "flex", gap: 20, minHeight: 0 }}>
              {/* sol: ürün bilgileri + besin */}
              <div style={{ flex: 1, minWidth: 0, overflowY: "auto", overflowX: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 18, fontWeight: 600, color: "var(--ink-green)" }}>Ürün</span>
                  <button onClick={deleteProduct} style={{ ...btnSecondary, color: "#a32d2d", borderColor: "#e7c9c9" }}><Trash2 size={14} /> Sil</button>
                </div>
                <label style={lbl}>Ad</label>
                <input value={selectedProduct.name} onChange={(e) => setSelectedProduct({ ...selectedProduct, name: e.target.value })} style={{ ...inp, width: "100%", marginBottom: 6 }} />
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}><label style={lbl}>Satış fiyatı ₺</label><input value={String(selectedProduct.sale_price)} onChange={(e) => setSelectedProduct({ ...selectedProduct, sale_price: parseFloat(e.target.value) || 0 })} inputMode="decimal" style={{ ...inp, width: "100%" }} /></div>
                  <div style={{ flex: 1 }}><label style={lbl}>KDV %</label><input value={String(selectedProduct.vat_rate)} onChange={(e) => setSelectedProduct({ ...selectedProduct, vat_rate: parseFloat(e.target.value) || 0 })} inputMode="decimal" style={{ ...inp, width: "100%" }} /></div>
                </div>
                <button onClick={saveProduct} style={btnPrimary}>Kaydet</button>

                <Section title="Besin / etiket (otomatik)">
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 14 }}>
                    <span style={{ color: "var(--muted)" }}>Kalori: <b className="tnum" style={{ color: "var(--ink)" }}>{kalori} kcal</b> <span style={{ fontSize: 11.5, color: "var(--muted-2)" }}>{selectedProduct.calorie_override != null ? "(elle)" : "(yaklaşık)"}</span></span>
                    {diyet && <span style={badge}>{diyet}</span>}
                  </div>
                  {alerjenler.length > 0 && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>Alerjen: {alerjenler.join(", ")}</div>}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>Elle kalori:</span>
                    <input value={selectedProduct.calorie_override != null ? String(selectedProduct.calorie_override) : ""} onChange={(e) => setSelectedProduct({ ...selectedProduct, calorie_override: e.target.value === "" ? null : (parseFloat(e.target.value) || 0) })} placeholder={`reçete: ${kaloriAuto}`} inputMode="decimal" style={{ ...inp, width: 130 }} />
                  </div>
                </Section>
              </div>

              {/* sağ: reçete */}
              <div style={{ flex: 1.1, minWidth: 0, overflowY: "auto", overflowX: "hidden", borderLeft: "1px solid var(--line)", paddingLeft: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-green)", marginBottom: 10 }}>Reçete</div>
                {recipe.map((r) => (<Row key={r.id}><span>{r.ingredients?.name}</span><span style={{ display: "flex", alignItems: "center", gap: 12 }}><span className="tnum" style={{ color: "var(--muted)" }}>{r.quantity} {r.ingredients?.unit}</span><IconBtn onClick={() => deleteRecipeRow(r.id)} /></span></Row>))}
                {recipe.length === 0 && <Empty>Henüz malzeme yok</Empty>}
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <select value={recIng} onChange={(e) => e.target.value === "__new" ? setShowNewIng(true) : setRecIng(e.target.value)} style={{ ...inp, flex: "1 1 140px", minWidth: 0 }}>
                    <option value="">Malzeme seç</option>
                    {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                    <option value="__new">+ Yeni malzeme</option>
                  </select>
                  <input value={recQty} onChange={(e) => setRecQty(e.target.value)} placeholder="Miktar" inputMode="decimal" style={{ ...inp, flex: "0 1 90px" }} />
                  <button onClick={addRecipeRow} style={btnSmall}><Plus size={15} /></button>
                </div>
                {showNewIng && (
                  <div style={{ marginTop: 10, border: "1px solid var(--line)", borderRadius: 12, padding: 12, background: "var(--recede)" }}>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Yeni malzeme</div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <input value={niName} onChange={(e) => setNiName(e.target.value)} placeholder="Ad (Dana kıyma)" style={{ ...inp, flex: 1 }} />
                      <select value={niUnit} onChange={(e) => setNiUnit(e.target.value)} style={{ ...inp, width: 80 }}><option value="kg">kg</option><option value="lt">lt</option><option value="adet">adet</option></select>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <input value={niCost} onChange={(e) => setNiCost(e.target.value)} placeholder="Birim maliyet ₺" inputMode="decimal" style={{ ...inp, flex: 1 }} />
                      <input value={niKcal} onChange={(e) => setNiKcal(e.target.value)} placeholder={`kcal / ${niUnit}`} inputMode="decimal" style={{ ...inp, flex: 1 }} />
                    </div>
                    <select value={niDiet} onChange={(e) => setNiDiet(e.target.value)} style={{ ...inp, width: "100%", marginBottom: 8 }}>
                      {DIET_OPTS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
                    </select>
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}>Alerjen (varsa seç)</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {ALLERGENS.map((a) => {
                        const on = niAllergens.includes(a);
                        return <button key={a} onClick={() => setNiAllergens((prev) => on ? prev.filter((x) => x !== a) : [...prev, a])} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 980, cursor: "pointer", border: on ? "none" : "1px solid var(--line-2)", background: on ? "var(--gold)" : "var(--card)", color: on ? "#3d2c05" : "var(--muted)" }}>{a}</button>;
                      })}
                    </div>
                    <button onClick={addIngredient} style={btnPrimary}>Ekle</button>
                  </div>
                )}
                {recipe.length > 0 && (
                  <div style={{ marginTop: 8, padding: 9, borderRadius: 10, background: "var(--recede)", display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                    <span style={{ color: "var(--muted)" }}>Maliyet <b className="tnum" style={{ color: "var(--ink)" }}>{money(maliyet)}</b></span>
                    <span style={{ color: "var(--muted)" }}>Satış <b className="tnum" style={{ color: "var(--ink)" }}>{money(fiyat)}</b></span>
                    <span style={{ color: "var(--brand)", fontWeight: 600 }} className="tnum">Kâr {money(fiyat - maliyet)}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CatItem({ cat, depth }: { cat: Category; depth: number }) {
  const m = useMenu();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cat.id });
  const open = m.expanded.has(cat.id);
  const children = m.categories.filter((c) => c.parent_id === cat.id);
  const prods = m.products.filter((p) => p.category_id === cat.id);
  const pad = depth * 16;

  const [addCat, setAddCat] = useState(false);
  const [subName, setSubName] = useState("");
  const [addProd, setAddProd] = useState(false);
  const [pName, setPName] = useState("");
  const [pPrice, setPPrice] = useState("");
  const [pVat, setPVat] = useState("10");

  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{ display: "flex", alignItems: "center", borderRadius: 10, background: open ? "var(--recede)" : "transparent", paddingLeft: pad }}>
        <button {...attributes} {...listeners} aria-label="taşı" style={{ all: "unset", cursor: "grab", padding: "0 6px", color: "var(--muted-2)", touchAction: "none", display: "inline-flex" }}><GripVertical size={16} /></button>
        <div onClick={() => m.toggle(cat.id)} style={{ cursor: "pointer", flex: 1, display: "flex", alignItems: "center", gap: 8, padding: "10px 4px" }}>
          {open ? <ChevronDown size={15} color="var(--muted)" /> : <ChevronRight size={15} color="var(--muted)" />}
          <Folder size={15} color="var(--brand)" />
          <EditableText
            value={cat.name}
            onSave={(v) => m.renameCategory(cat.id, v)}
            style={{ fontWeight: open ? 600 : 500, fontSize: 14, color: "var(--ink-green)" }}
          />
        </div>
        <button onClick={() => m.deleteCategory(cat.id)} aria-label="sil" style={{ all: "unset", cursor: "pointer", padding: "0 10px", color: "var(--muted-2)" }}><Trash2 size={13} /></button>
      </div>

      {open && (
        <div>
          <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            {children.map((c) => <CatItem key={c.id} cat={c} depth={depth + 1} />)}
          </SortableContext>

          <SortableContext items={prods.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            {prods.map((p) => <ProdItem key={p.id} prod={p} pad={pad + 24} />)}
          </SortableContext>

          <div style={{ display: "flex", gap: 14, paddingLeft: pad + 24, padding: `6px 8px 10px ${pad + 24}px` }}>
            <button onClick={() => { setAddCat(!addCat); setSubName(""); }} style={miniLink}>+ alt kategori</button>
            <button onClick={() => { setAddProd(!addProd); setPName(""); setPPrice(""); }} style={miniLink}>+ ürün</button>
          </div>

          {addCat && (
            <div style={{ display: "flex", gap: 8, paddingLeft: pad + 24, paddingRight: 8, paddingBottom: 8 }}>
              <input value={subName} onChange={(e) => setSubName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { m.addCategory(cat.id, subName); setSubName(""); setAddCat(false); } }} placeholder="Alt kategori adı" style={inp} autoFocus />
              <button onClick={() => { m.addCategory(cat.id, subName); setSubName(""); setAddCat(false); }} style={btnSmall}><Plus size={15} /></button>
            </div>
          )}
          {addProd && (
            <div style={{ marginLeft: pad + 24, marginRight: 8, marginBottom: 10, border: "1px solid var(--line)", borderRadius: 12, padding: 12, background: "var(--card)" }}>
              {(() => {
                const submit = () => { m.addProduct(cat.id, pName, pPrice, pVat); setPName(""); setPPrice(""); setAddProd(false); };
                return (
                  <>
                    <input value={pName} onChange={(e) => setPName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Ürün adı" style={{ ...inp, width: "100%", marginBottom: 8 }} autoFocus />
                    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                      <input value={pPrice} onChange={(e) => setPPrice(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="Fiyat ₺" inputMode="decimal" style={inp} />
                      <input value={pVat} onChange={(e) => setPVat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="KDV %" inputMode="decimal" style={inp} />
                    </div>
                    <button onClick={submit} style={btnPrimary}>Kaydet</button>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProdItem({ prod, pad }: { prod: Product; pad: number }) {
  const m = useMenu();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: prod.id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, display: "flex", alignItems: "center", paddingLeft: pad };
  const selected = m.selectedId === prod.id;
  return (
    <div ref={setNodeRef} style={style}>
      <button {...attributes} {...listeners} aria-label="taşı" style={{ all: "unset", cursor: "grab", padding: "0 6px", color: "var(--muted-2)", touchAction: "none", display: "inline-flex" }}><GripVertical size={15} /></button>
      <div onClick={() => m.selectProduct(prod)} style={{ cursor: "pointer", flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 8px", fontSize: 13.5, fontWeight: selected ? 600 : 400, color: selected ? "var(--brand)" : "var(--ink)" }}>
        <EditableText value={prod.name} onSave={(v) => m.renameProduct(prod.id, v)} />
        <span className="tnum" style={{ color: "var(--muted)" }}>{money(prod.sale_price)}</span>
      </div>
    </div>
  );
}

function Section({ title, children, collapsible, defaultOpen = true }: { title: string; children: React.ReactNode; collapsible?: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!collapsible) {
    return <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}><div style={{ fontWeight: 600, color: "var(--ink-green)", marginBottom: 6 }}>{title}</div>{children}</div>;
  }
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--line)" }}>
      <button onClick={() => setOpen(!open)} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, width: "100%", marginBottom: open ? 6 : 0 }}>
        {open ? <ChevronDown size={15} color="var(--muted)" /> : <ChevronRight size={15} color="var(--muted)" />}
        <span style={{ fontWeight: 600, color: "var(--ink-green)" }}>{title}</span>
      </button>
      {open && children}
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--line)", fontSize: 14 }}>{children}</div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "6px 0" }}>{children}</div>;
}
function IconBtn({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} aria-label="sil" style={{ all: "unset", cursor: "pointer", color: "var(--muted-2)", display: "inline-flex" }}><Trash2 size={14} /></button>;
}

const miniLink: React.CSSProperties = { all: "unset", cursor: "pointer", fontSize: 12.5, color: "var(--brand)" };
const badge: React.CSSProperties = { fontSize: 12, fontWeight: 600, padding: "3px 12px", borderRadius: 980, background: "var(--success-bg)", color: "var(--success)" };
const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "9px 12px", fontSize: 14, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0, flex: 1 };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 };
const btnPrimary: React.CSSProperties = { border: "none", borderRadius: 980, padding: "10px 18px", background: "var(--brand-strong)", color: "#fff", fontSize: 14, fontWeight: 500 };
const btnSecondary: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 16px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13.5 };
const btnSmall: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, border: "none", borderRadius: 10, padding: "9px 14px", background: "var(--ink-green)", color: "#fff", fontSize: 13.5 };
