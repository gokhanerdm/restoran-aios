"use client";

import { useCallback, useEffect, useState, createContext, useContext } from "react";
import { supabase } from "@/lib/supabase/client";
import { getMyRestaurantId } from "@/lib/supabase/restaurant";
import SayfaKabugu from "@/app/components/SayfaKabugu";
import { kutuDar, dugmeAnaSatir, dugmeIkincil, dugmeKucuk } from "@/lib/olcu";
import { Plus, Trash2, ChevronRight, ChevronDown, Folder, GripVertical, AlertTriangle } from "lucide-react";
import EditableText from "../components/EditableText";
import { useConfirm } from "../components/useConfirm";
import { toUpperTr, toTitleTr } from "@/lib/text";
import { parseNaturalQuantity, formatQuantity, NATURAL_UNIT_HINT, type BaseUnit } from "@/lib/units";
import { ALLERGEN_KEYS, ALERJEN_SON_TARIH, KALORI_SON_TARIH, kalanGun } from "@/lib/allergens";
import {
  DndContext, closestCenter, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Category = { id: string; name: string; parent_id: string | null; vat_rate: number | null; target_food_cost_percent: number | null; default_station_id: string | null };
type Product = {
  id: string; name: string; sale_price: number; vat_rate: number; category_id: string | null;
  calorie_override: number | null; is_active: boolean;
  description: string | null; ingredients_text: string | null; image_url: string | null;
  allergens_override: string[] | null;
  available_dine_in: boolean; available_takeaway: boolean; available_quick_sale: boolean;
  recommended_price: number | null; variable_cost_override: number | null; fixed_cost_share_override: number | null;
  station_override_id: string | null;
  prep_minutes: number | null;
  expected_daily_share: number | null;
};
type Station = { id: string; name: string; sort_order: number };
type Nutri = { kcal_per_unit: number; diet_class: string; allergens: string[] };
type Ingredient = { id: string; name: string; unit: BaseUnit; current_unit_cost: number };
type RecipeRow = { id: string; ingredient_id: string; quantity: number; ingredients: ({ name: string; unit: BaseUnit; current_unit_cost: number } & Nutri) | null };
type Settings = {
  default_vat_rate: number; default_menu_design: string;
  default_variable_cost_per_cover: number; default_fixed_cost_share_percent: number;
};
type ConceptTemplate = { id: string; name: string; description: string | null };

// 14 zorunlu alerjen grubu lib/allergens.ts'te — QR menü ve uyum paneli de aynı listeyi kullanıyor.
const ALLERGENS = ALLERGEN_KEYS;
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

function flattenCategories(cats: Category[], parentId: string | null = null, depth = 0): { id: string; label: string }[] {
  return cats
    .filter((c) => c.parent_id === parentId)
    .flatMap((c) => [
      { id: c.id, label: `${"— ".repeat(depth)}${c.name}` },
      ...flattenCategories(cats, c.id, depth + 1),
    ]);
}

type Ctx = {
  categories: Category[];
  products: Product[];
  stations: Station[];
  expanded: Set<string>;
  selectedId: string | null;
  menuItemsWithRecipe: Set<string>;
  toggle: (id: string) => void;
  selectProduct: (p: Product) => void;
  deleteCategory: (id: string) => void;
  addCategory: (parentId: string | null, name: string) => void;
  addProduct: (catId: string, name: string, price: string, vat: string) => void;
  renameCategory: (id: string, name: string) => void;
  renameProduct: (id: string, name: string) => void;
  defaultVatFor: (catId: string | null) => number;
};
const MenuCtx = createContext<Ctx | null>(null);
const useMenu = () => useContext(MenuCtx)!;

export default function MenuPage() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [allGroups, setAllGroups] = useState<{ id: string; name: string }[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stockByIngredient, setStockByIngredient] = useState<Record<string, number>>({});
  const [usageCountByIngredient, setUsageCountByIngredient] = useState<Record<string, number>>({});
  const [menuItemsWithRecipe, setMenuItemsWithRecipe] = useState<Set<string>>(new Set());
  const [kcalByItem, setKcalByItem] = useState<Record<string, number>>({});
  const [itemsWithAllergens, setItemsWithAllergens] = useState<Set<string>>(new Set());
  const [uyumAcik, setUyumAcik] = useState(false);
  const [priceChanges, setPriceChanges] = useState<Record<string, { from: number; to: number }>>({});
  const [concepts, setConcepts] = useState<ConceptTemplate[]>([]);
  const [applyingConcept, setApplyingConcept] = useState<string | null>(null);
  const [conceptErr, setConceptErr] = useState<string | null>(null);
  const [stations, setStations] = useState<Station[]>([]);
  const [newStationName, setNewStationName] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [recipe, setRecipe] = useState<RecipeRow[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [itemGroups, setItemGroups] = useState<ItemGroup[]>([]);
  const [rootCat, setRootCat] = useState("");

  const [recIng, setRecIng] = useState("");
  const [recQty, setRecQty] = useState("");
  const [recQtyError, setRecQtyError] = useState(false);
  const [showNewIng, setShowNewIng] = useState(false);
  const [niName, setNiName] = useState("");
  const [niUnit, setNiUnit] = useState("kg");
  const [niReady, setNiReady] = useState(false);
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
    const restId = await getMyRestaurantId();
    if (!restId) return;
    setRestaurantId(restId);
    const [{ data: c }, { data: p }, { data: i }, { data: g }, { data: settingsRow }, { data: usage }, { data: allLinks }, { data: concepts }, { data: st }] = await Promise.all([
      supabase.from("menu_categories").select("id, name, parent_id, vat_rate, target_food_cost_percent, default_station_id").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("menu_items").select("id, name, sale_price, vat_rate, category_id, calorie_override, is_active, description, ingredients_text, image_url, allergens_override, available_dine_in, available_takeaway, available_quick_sale, recommended_price, variable_cost_override, fixed_cost_share_override, station_override_id, prep_minutes, expected_daily_share").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("ingredients").select("id, name, unit, current_unit_cost").eq("restaurant_id", restId).is("deleted_at", null).order("name"),
      supabase.from("modifier_groups").select("id, name").eq("restaurant_id", restId).is("deleted_at", null).order("name"),
      supabase.from("restaurant_settings").select("default_vat_rate, default_menu_design, default_variable_cost_per_cover, default_fixed_cost_share_percent").eq("restaurant_id", restId).maybeSingle(),
      supabase.rpc("ingredient_expected_usage", { p_restaurant: restId, p_days_ahead: 7 }),
      supabase.from("recipe_items").select("ingredient_id, menu_item_id, quantity, ingredients(kcal_per_unit, allergens)").eq("restaurant_id", restId),
      supabase.from("concept_templates").select("id, name, description").order("sort_order"),
      supabase.from("stations").select("id, name, sort_order").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
    ]);
    setCategories((c as Category[]) ?? []);
    setProducts((p as Product[]) ?? []);
    setIngredients((i as Ingredient[]) ?? []);
    setAllGroups((g as { id: string; name: string }[]) ?? []);
    setSettings((settingsRow as Settings) ?? null);
    setConcepts((concepts as ConceptTemplate[]) ?? []);
    setStations((st as Station[]) ?? []);

    const stockMap: Record<string, number> = {};
    (usage as { ingredient_id: string; current_stock: number }[] ?? []).forEach((u) => { stockMap[u.ingredient_id] = u.current_stock; });
    setStockByIngredient(stockMap);

    const withRecipe = new Set<string>();
    const usageSets: Record<string, Set<string>> = {};
    const kcalMap: Record<string, number> = {};
    // Reçetesinde alerjen etiketli en az bir malzeme olan ürünler — "boş liste" ile
    // "hiç etiketlenmemiş" ayrımı için gerekli.
    const alerjenliUrunler = new Set<string>();
    ((allLinks as unknown as { ingredient_id: string; menu_item_id: string; quantity: number; ingredients: { kcal_per_unit: number; allergens: string[] | null } | null }[]) ?? []).forEach((l) => {
      withRecipe.add(l.menu_item_id);
      (usageSets[l.ingredient_id] ??= new Set()).add(l.menu_item_id);
      kcalMap[l.menu_item_id] = (kcalMap[l.menu_item_id] ?? 0) + l.quantity * Number(l.ingredients?.kcal_per_unit ?? 0);
      if ((l.ingredients?.allergens?.length ?? 0) > 0) alerjenliUrunler.add(l.menu_item_id);
    });
    setMenuItemsWithRecipe(withRecipe);
    setKcalByItem(kcalMap);
    setItemsWithAllergens(alerjenliUrunler);
    setUsageCountByIngredient(Object.fromEntries(Object.entries(usageSets).map(([k, v]) => [k, v.size])));
  }, []);

  useEffect(() => { loadBase(); }, [loadBase]);

  const loadExtras = useCallback(async (productId: string) => {
    const [{ data: rec }, { data: v }, { data: ig }] = await Promise.all([
      supabase.from("recipe_items").select("id, ingredient_id, quantity, ingredients(name, unit, current_unit_cost, kcal_per_unit, diet_class, allergens)").eq("menu_item_id", productId),
      supabase.from("product_variants").select("id, name, sale_price").eq("menu_item_id", productId).is("deleted_at", null).order("sort_order"),
      supabase.from("menu_item_modifier_groups").select("id, group_id, modifier_groups(id, name, required, min_select, max_select, modifiers(id, name, price_delta))").eq("menu_item_id", productId),
    ]);
    const recRows = (rec as unknown as RecipeRow[]) ?? [];
    setRecipe(recRows);
    setVariants((v as Variant[]) ?? []);
    setItemGroups((ig as unknown as ItemGroup[]) ?? []);

    const ingIds = Array.from(new Set(recRows.map((r) => r.ingredient_id)));
    if (ingIds.length > 0) {
      const { data: hist } = await supabase.from("purchase_items").select("ingredient_id, unit_price, created_at").in("ingredient_id", ingIds).order("created_at", { ascending: false });
      const seen: Record<string, number[]> = {};
      (hist ?? []).forEach((h: { ingredient_id: string; unit_price: number }) => {
        (seen[h.ingredient_id] ??= []).push(h.unit_price);
      });
      const changes: Record<string, { from: number; to: number }> = {};
      Object.entries(seen).forEach(([id, prices]) => {
        if (prices.length >= 2 && prices[0] !== prices[1]) changes[id] = { from: prices[1], to: prices[0] };
      });
      setPriceChanges(changes);
    } else {
      setPriceChanges({});
    }
  }, []);

  const selectProduct = (p: Product) => {
    setSelectedProduct(p); loadExtras(p.id);
    setRecIng(""); setRecQty(""); setRecQtyError(false); setShowNewIng(false);
    setNvName(""); setNvPrice(""); setAttachGroup(""); setShowNewGroup(false); setModGroup(null);
  };

  const toggle = (id: string) => {
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const defaultVatFor = (catId: string | null): number => {
    const cat = categories.find((c) => c.id === catId);
    return cat?.vat_rate ?? settings?.default_vat_rate ?? 10;
  };

  const addCategory = async (parentId: string | null, name: string) => {
    if (!restaurantId || !name.trim()) return;
    const siblings = categories.filter((c) => c.parent_id === parentId).length;
    await supabase.from("menu_categories").insert({ restaurant_id: restaurantId, name: toUpperTr(name), parent_id: parentId, sort_order: siblings });
    if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
    setRootCat(""); await loadBase();
  };
  const applyConcept = async (conceptId: string) => {
    if (!restaurantId || applyingConcept) return;
    setApplyingConcept(conceptId); setConceptErr(null);
    const { error } = await supabase.rpc("apply_concept_template", { p_restaurant_id: restaurantId, p_concept_id: conceptId });
    setApplyingConcept(null);
    if (error) { setConceptErr(`Şablon uygulanamadı: ${error.message}`); return; }
    await loadBase();
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
      const ok = await confirm(`Bu kategoride ${prodCount} ürün ve ${childCount} alt kategori var. Silersen menüde görünmez olurlar. Yine de silinsin mi?`, { confirmLabel: "Sil" });
      if (!ok) return;
    }
    await supabase.from("menu_categories").update({ deleted_at: new Date().toISOString() }).eq("id", id); await loadBase();
  };
  const addStation = async (name: string) => {
    if (!restaurantId || !name.trim()) return;
    await supabase.from("stations").insert({ restaurant_id: restaurantId, name: toTitleTr(name), sort_order: stations.length });
    setNewStationName(""); await loadBase();
  };
  const renameStation = async (id: string, name: string) => {
    await supabase.from("stations").update({ name: toTitleTr(name) }).eq("id", id); await loadBase();
  };
  const deleteStation = async (id: string) => {
    const catCount = categories.filter((c) => c.default_station_id === id).length;
    const prodCount = products.filter((p) => p.station_override_id === id).length;
    if (catCount + prodCount > 0) {
      const ok = await confirm(`Bu istasyon ${catCount} kategoride ve ${prodCount} üründe kullanılıyor. Silersen o kategori/ürünler istasyonsuz kalır. Yine de silinsin mi?`, { confirmLabel: "Sil" });
      if (!ok) return;
    }
    await supabase.from("stations").update({ deleted_at: new Date().toISOString() }).eq("id", id); await loadBase();
  };
  const addProduct = async (catId: string, name: string, price: string, vat: string) => {
    if (!restaurantId || !name.trim()) return;
    const count = products.filter((p) => p.category_id === catId).length;
    await supabase.from("menu_items").insert({ restaurant_id: restaurantId, category_id: catId, name: toTitleTr(name), sale_price: parseFloat(price) || 0, vat_rate: parseFloat(vat) || 0, sort_order: count });
    await loadBase();
  };
  const saveProduct = async () => {
    if (!selectedProduct) return;
    await supabase.from("menu_items").update({
      name: toTitleTr(selectedProduct.name),
      sale_price: selectedProduct.sale_price,
      vat_rate: selectedProduct.vat_rate,
      calorie_override: selectedProduct.calorie_override,
      category_id: selectedProduct.category_id,
      is_active: selectedProduct.is_active,
      description: selectedProduct.description,
      ingredients_text: selectedProduct.ingredients_text,
      image_url: selectedProduct.image_url,
      allergens_override: selectedProduct.allergens_override,
      available_dine_in: selectedProduct.available_dine_in,
      available_takeaway: selectedProduct.available_takeaway,
      available_quick_sale: selectedProduct.available_quick_sale,
      recommended_price: selectedProduct.recommended_price,
      variable_cost_override: selectedProduct.variable_cost_override,
      fixed_cost_share_override: selectedProduct.fixed_cost_share_override,
      station_override_id: selectedProduct.station_override_id,
      prep_minutes: selectedProduct.prep_minutes,
      expected_daily_share: selectedProduct.expected_daily_share,
    }).eq("id", selectedProduct.id);
    await loadBase();
  };
  const deleteProduct = async () => {
    if (!selectedProduct) return;
    await supabase.from("menu_items").update({ deleted_at: new Date().toISOString() }).eq("id", selectedProduct.id); setSelectedProduct(null); await loadBase();
  };

  const addRecipeRow = async () => {
    if (!restaurantId || !selectedProduct || !recIng || !recQty) return;
    const ing = ingredients.find((i) => i.id === recIng);
    if (!ing) return;
    const qty = parseNaturalQuantity(recQty, ing.unit);
    if (qty == null) { setRecQtyError(true); return; }
    setRecQtyError(false);
    await supabase.from("recipe_items").insert({ restaurant_id: restaurantId, menu_item_id: selectedProduct.id, ingredient_id: recIng, quantity: qty });
    setRecIng(""); setRecQty(""); await loadExtras(selectedProduct.id); await loadBase();
  };
  const deleteRecipeRow = async (id: string) => { if (!selectedProduct) return; await supabase.from("recipe_items").delete().eq("id", id); await loadExtras(selectedProduct.id); await loadBase(); };
  const addIngredient = async () => {
    if (!restaurantId || !niName.trim()) return;
    const unit = niReady ? "adet" : niUnit;
    const { data } = await supabase.from("ingredients").insert({ restaurant_id: restaurantId, name: niName.trim(), unit, current_unit_cost: parseFloat(niCost) || 0, kcal_per_unit: parseFloat(niKcal) || 0, diet_class: niDiet, allergens: niAllergens }).select("id").single();
    setNiName(""); setNiCost(""); setNiKcal(""); setNiDiet("bitkisel"); setNiAllergens([]); setShowNewIng(false);
    if (data && niReady && selectedProduct) {
      // Hazır ürün: malzeme = ürünün kendisi, reçete otomatik 1 adet olarak bağlanır (Coca Cola 330ml → 1 adet).
      await supabase.from("recipe_items").insert({ restaurant_id: restaurantId, menu_item_id: selectedProduct.id, ingredient_id: data.id, quantity: 1 });
      setNiReady(false);
      await loadBase(); await loadExtras(selectedProduct.id);
      return;
    }
    await loadBase(); if (data) setRecIng(data.id);
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

  // --- Reçete / maliyet / kalori / alerjen hesapları ---
  const maliyet = recipe.reduce((s, r) => s + r.quantity * (r.ingredients?.current_unit_cost ?? 0), 0);
  const fiyat = selectedProduct?.sale_price ?? 0;
  const kaloriAuto = Math.round(recipe.reduce((s, r) => s + r.quantity * (r.ingredients?.kcal_per_unit ?? 0), 0));
  const kalori = selectedProduct?.calorie_override ?? kaloriAuto;
  const dietClasses = recipe.map((r) => r.ingredients?.diet_class).filter(Boolean) as string[];
  const diyet = recipe.length === 0 ? "" : dietClasses.every((d) => d === "bitkisel") ? "Vegan" : !dietClasses.includes("et") ? "Vejetaryen" : "Hayvansal içerir";
  const alerjenlerAuto = Array.from(new Set(recipe.flatMap((r) => r.ingredients?.allergens ?? [])));
  const alerjenlerEffective = selectedProduct?.allergens_override ?? alerjenlerAuto;
  const icindekilerAuto = recipe.map((r) => r.ingredients?.name).filter(Boolean).join(", ");
  const attachedIds = itemGroups.map((g) => g.group_id);
  const attachable = allGroups.filter((g) => !attachedIds.includes(g.id));
  const roots = categories.filter((c) => c.parent_id === null);
  const flatCats = flattenCategories(categories);

  // --- Kârlılık bloğu ---
  const receteVar = recipe.length > 0;
  const netSatis = selectedProduct ? fiyat / (1 + (selectedProduct.vat_rate ?? 0) / 100) : 0;
  const receteMaliyeti: number | null = receteVar ? maliyet : null;
  const sarfMaliyeti: number | null = selectedProduct?.variable_cost_override ?? settings?.default_variable_cost_per_cover ?? null;
  const sabitGiderPayi: number | null = selectedProduct?.fixed_cost_share_override ??
    (settings ? netSatis * (settings.default_fixed_cost_share_percent / 100) : null);
  const toplamMaliyet: number | null = receteMaliyeti != null && sarfMaliyeti != null && sabitGiderPayi != null
    ? receteMaliyeti + sarfMaliyeti + sabitGiderPayi : null;
  const foodCostPercent: number | null = receteMaliyeti != null && netSatis > 0 ? (receteMaliyeti / netSatis) * 100 : null;
  const brutKar: number | null = receteMaliyeti != null ? netSatis - receteMaliyeti : null;
  const karMarji: number | null = toplamMaliyet != null && netSatis > 0 ? ((netSatis - toplamMaliyet) / netSatis) * 100 : null;

  // --- Üretilebilir adet / kritik malzeme ---
  const productionInfo = recipe.map((r) => {
    const stock = stockByIngredient[r.ingredient_id] ?? 0;
    const possible = r.quantity > 0 ? Math.floor(stock / r.quantity) : null;
    const usageCount = usageCountByIngredient[r.ingredient_id] ?? 1;
    const sharedRatio = usageCount > 0 ? Math.round(100 / usageCount) : 100;
    return { row: r, stock, possible, usageCount, sharedRatio };
  });
  let bottleneck: (typeof productionInfo)[number] | null = null;
  for (const info of productionInfo) {
    if (info.possible != null && (bottleneck == null || bottleneck.possible == null || info.possible < bottleneck.possible)) {
      bottleneck = info;
    }
  }

  const ctx: Ctx = {
    categories, products, stations, expanded, selectedId: selectedProduct?.id ?? null, menuItemsWithRecipe,
    toggle, selectProduct, deleteCategory, addCategory, addProduct,
    renameCategory, renameProduct, defaultVatFor,
  };

  // --- Mevzuat uyumu (Türk Gıda Kodeksi Etiketleme Yönetmeliği) ---
  // Alerjen bilgisi "beyan edilmiş" sayılır: ürünün reçetesi varsa (malzemelerden türetiliyor)
  // ya da üründe alerjen listesi elle onaylanmışsa — boş liste de geçerli bir beyandır,
  // "alerjen içermiyor" demektir. Reçetesi de beyanı da yoksa hiçbir şey bilinmiyor demektir.
  // Kalori: elle yazılmışsa ya da reçeteden 0'dan büyük çıkıyorsa beyan edilebilir.
  // Beyan sayılması için ikisinden biri şart: (1) işletmeci ürünün alerjen listesini elle
  // onaylamış (boş dizi de geçerli beyandır, "baktım, yok" demektir), ya da (2) reçetesindeki
  // malzemelerden en az biri alerjen etiketli. Sadece reçetesi olması YETMEZ — malzemeler hiç
  // etiketlenmemişse reçeteden boş liste çıkar, bu "yok" değil "bilinmiyor"dur. Ununda gluten,
  // peynirinde süt olan pizzaya "içermez" yazdırmamak için bu ayrım şart; QR menü de aynı kuralı
  // uyguluyor ve emin olmadığında hiçbir şey yazmıyor.
  const aktifUrunler = products.filter((p) => p.is_active);
  const alerjenEksik = aktifUrunler.filter((p) => p.allergens_override == null && !itemsWithAllergens.has(p.id));
  const kaloriEksik = aktifUrunler.filter((p) => p.calorie_override == null && !((kcalByItem[p.id] ?? 0) > 0));
  const alerjenKalanGun = kalanGun(ALERJEN_SON_TARIH);
  const kaloriKalanGun = kalanGun(KALORI_SON_TARIH);
  const uyumSorunVar = alerjenEksik.length > 0 || kaloriEksik.length > 0;

  return (
    <SayfaKabugu baslik="Menü">
      {confirmDialog}
      <div style={{ height: 14, flexShrink: 0 }} />

      {/* Mevzuat uyumu bandı — alerjen 31.12.2026, kalori 31.12.2027'de zorunlu.
          QR menü yönetmelikçe kabul edilen sunum yöntemi olduğu için altyapı zaten hazır;
          eksik olan tek şey bilgisi girilmemiş ürünler. */}
      {aktifUrunler.length > 0 && (
        <div style={{
          borderRadius: 14, marginBottom: 16, flexShrink: 0, overflow: "hidden",
          background: uyumSorunVar ? "var(--danger-bg)" : "var(--card)",
          border: `1px solid ${uyumSorunVar ? "var(--gold)" : "var(--brand)"}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px" }}>
            <AlertTriangle size={18} color={uyumSorunVar ? "var(--gold-text)" : "var(--brand)"} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: uyumSorunVar ? "var(--gold-text)" : "var(--ink-green)" }}>
                {uyumSorunVar
                  ? [
                      alerjenEksik.length > 0 ? `${alerjenEksik.length} üründe alerjen bilgisi yok` : null,
                      kaloriEksik.length > 0 ? `${kaloriEksik.length} üründe kalori yok` : null,
                    ].filter(Boolean).join(" · ")
                  : `${aktifUrunler.length} ürünün tamamında alerjen ve kalori bilgisi var — menü mevzuata uygun.`}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
                Alerjen bildirimi 31.12.2026&apos;da zorunlu ({alerjenKalanGun > 0 ? `${alerjenKalanGun} gün kaldı` : "süre doldu"}) ·
                {" "}kalori 31.12.2027&apos;de ({kaloriKalanGun > 0 ? `${kaloriKalanGun} gün` : "süre doldu"}).
                Reçetesi olan ürünlerde ikisi de otomatik hesaplanır.
              </div>
            </div>
            {uyumSorunVar && (
              <button onClick={() => setUyumAcik((v) => !v)} style={{ all: "unset", cursor: "pointer", fontSize: 12.5, color: "var(--gold-text)", fontWeight: 600, flexShrink: 0 }}>
                {uyumAcik ? "Gizle" : "Eksikleri gör"}
              </button>
            )}
          </div>
          {uyumAcik && uyumSorunVar && (
            <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
              {alerjenEksik.length > 0 && (
                <div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 5 }}>Alerjen bilgisi yok — malzemelere alerjen etiketi gir ya da ürünün alerjen listesini onayla. Onaylanana kadar QR menüde bu ürün için alerjen satırı görünmez:</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {alerjenEksik.map((p) => (
                      <button key={p.id} onClick={() => { selectProduct(p); setUyumAcik(false); }} style={uyumChip}>{p.name}</button>
                    ))}
                  </div>
                </div>
              )}
              {kaloriEksik.length > 0 && (
                <div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 5 }}>Kalori yok — malzemelere kcal gir ya da ürüne elle kalori yaz:</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {kaloriEksik.map((p) => (
                      <button key={p.id} onClick={() => { selectProduct(p); setUyumAcik(false); }} style={uyumChip}>{p.name}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 22, flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 300, maxWidth: 420, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <MenuCtx.Provider value={ctx}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <div style={{ border: "1px solid var(--line)", borderRadius: 16, padding: 8, background: "var(--card)", flex: 1, overflowY: "auto", minHeight: 0 }}>
                <SortableContext items={roots.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                  {roots.map((c) => <CatItem key={c.id} cat={c} depth={0} />)}
                </SortableContext>
                {roots.length === 0 && concepts.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: 12 }}>Henüz kategori yok.</div>}
                {roots.length === 0 && concepts.length > 0 && (
                  <div style={{ padding: 12 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink-green)", marginBottom: 4 }}>Hazır konseptle başla</div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Bir konsept seç, menü + reçete + malzeme listesi otomatik kurulsun. Sonra istediğin gibi düzenlersin.</div>
                    {conceptErr && <div style={{ marginBottom: 10, padding: "8px 11px", borderRadius: 10, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 12.5 }}>{conceptErr}</div>}
                    {concepts.map((c) => (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px", marginBottom: 8 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{c.name}</div>
                          {c.description && <div style={{ fontSize: 11.5, color: "var(--muted-2)" }}>{c.description}</div>}
                        </div>
                        <button onClick={() => applyConcept(c.id)} disabled={applyingConcept === c.id} style={{ ...btnSmall, flexShrink: 0, opacity: applyingConcept === c.id ? 0.6 : 1 }}>
                          {applyingConcept === c.id ? "…" : "Uygula"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </DndContext>
          </MenuCtx.Provider>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexShrink: 0 }}>
            <input value={rootCat} onChange={(e) => setRootCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCategory(null, rootCat)} placeholder="Ana kategori adı (Ana Yemekler)" style={inp} />
            <button onClick={() => addCategory(null, rootCat)} style={btnSmall}><Plus size={15} /> Kategori</button>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 8, flexShrink: 0 }}>Sıralamak için soldaki tutma kolundan sürükle. Kırmızı işaret = reçete eksik, sarı işaret = tavsiye fiyattan farklı satılıyor (bu uyarılar yalnızca burada görünür, müşteri menüsünde yok).</div>

          <div style={{ flexShrink: 0 }}>
            <Section title="İstasyonlar (Mutfak, Bar…)" collapsible defaultOpen={false}>
              {stations.map((s) => (
                <Row key={s.id}>
                  <EditableText value={s.name} onSave={(v) => renameStation(s.id, v)} />
                  <IconBtn onClick={() => deleteStation(s.id)} />
                </Row>
              ))}
              {stations.length === 0 && <Empty>Henüz istasyon yok — Mutfak, Bar gibi ekle</Empty>}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input value={newStationName} onChange={(e) => setNewStationName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addStation(newStationName)} placeholder="İstasyon adı (Mutfak)" style={inp} />
                <button onClick={() => addStation(newStationName)} style={btnSmall}><Plus size={15} /></button>
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 8 }}>Her kategori satırındaki küçük seçiciden o kategorinin varsayılan istasyonunu seçebilirsin. Ürün bazında farklı istasyon istersen ürünü açıp orada değiştir.</div>
            </Section>
          </div>
        </div>

        {/* editor */}
        <div style={{ flex: 1.6, minWidth: 380, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: "16px 18px", display: "flex", flexDirection: "column", minHeight: 0 }}>
          {!selectedProduct && <div style={{ color: "var(--muted)", fontSize: 14 }}>Bir başlığı aç, ürün seç ya da ekle.</div>}
          {selectedProduct && (
            <div style={{ flex: 1, display: "flex", gap: 20, minHeight: 0 }}>
              {/* sol: ürün bilgileri + dijital menü içeriği + kârlılık */}
              <div style={{ flex: 1.3, minWidth: 0, overflowY: "auto", overflowX: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 18, fontWeight: 600, color: "var(--ink-green)" }}>Ürün</span>
                  <button onClick={deleteProduct} style={{ ...btnSecondary, color: "var(--danger)", borderColor: "var(--danger-bg)" }}><Trash2 size={14} /> Sil</button>
                </div>

                {selectedProduct.is_active && !receteVar && (
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", borderRadius: 12, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>
                    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>Bu ürünün reçetesi eksik. Satış yapılabilir ama stok, maliyet ve kârlılık hesapları eksik kalır.</span>
                  </div>
                )}

                <label style={lbl}>Ad</label>
                <input value={selectedProduct.name} onChange={(e) => setSelectedProduct({ ...selectedProduct, name: e.target.value })} style={{ ...inp, width: "100%", marginBottom: 6 }} />

                <label style={lbl}>Kategori</label>
                <select value={selectedProduct.category_id ?? ""} onChange={(e) => setSelectedProduct({ ...selectedProduct, category_id: e.target.value || null })} style={{ ...inp, width: "100%", marginBottom: 6 }}>
                  {flatCats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>

                {stations.length > 0 && (
                  <>
                    <label style={lbl}>İstasyon (mutfak ekranında nereye düşsün)</label>
                    <select value={selectedProduct.station_override_id ?? ""} onChange={(e) => setSelectedProduct({ ...selectedProduct, station_override_id: e.target.value || null })} style={{ ...inp, width: "100%", marginBottom: 6 }}>
                      <option value="">{`Kategori varsayılanı${(() => { const catStation = stations.find((s) => s.id === categories.find((c) => c.id === selectedProduct.category_id)?.default_station_id); return catStation ? ` (${catStation.name})` : " (yok)"; })()}`}</option>
                      {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </>
                )}

                <label style={lbl}>Pişme/hazırlanma süresi (dk)</label>
                <input
                  value={selectedProduct.prep_minutes != null ? String(selectedProduct.prep_minutes) : ""}
                  onChange={(e) => setSelectedProduct({ ...selectedProduct, prep_minutes: e.target.value === "" ? null : (parseInt(e.target.value) || 0) })}
                  placeholder="girilmedi"
                  inputMode="numeric"
                  style={{ ...inp, width: "100%", marginBottom: 6 }}
                />
                <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: -2, marginBottom: 8 }}>Girilirse mutfak ekranı, bir masanın tüm ürünleri aynı anda çıksın diye hangi ürünün ne zaman başlaması gerektiğini önerir.</div>

                <label style={lbl}>Tahmini günlük satış payı (%)</label>
                <input
                  value={selectedProduct.expected_daily_share != null ? String(selectedProduct.expected_daily_share) : ""}
                  onChange={(e) => setSelectedProduct({ ...selectedProduct, expected_daily_share: e.target.value === "" ? null : (parseFloat(e.target.value) || 0) })}
                  placeholder="boşsa kategori içinde eşit paylaşılır"
                  inputMode="decimal"
                  style={{ ...inp, width: "100%", marginBottom: 6 }}
                />
                <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: -2, marginBottom: 8 }}>Stok ekranındaki "İhtiyaç listesi" hesaplaması bu payı kullanır — hangi ürünün tam olarak ne kadar satacağı bilinmese de, malzeme ihtiyacı bu tahminle hesaplanır.</div>

                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}><label style={lbl}>Menü fiyatı ₺</label><input value={String(selectedProduct.sale_price)} onChange={(e) => setSelectedProduct({ ...selectedProduct, sale_price: parseFloat(e.target.value) || 0 })} inputMode="decimal" style={{ ...inp, width: "100%" }} /></div>
                  <div style={{ flex: 1 }}><label style={lbl}>Tavsiye fiyat ₺</label><input value={selectedProduct.recommended_price != null ? String(selectedProduct.recommended_price) : ""} onChange={(e) => setSelectedProduct({ ...selectedProduct, recommended_price: e.target.value === "" ? null : (parseFloat(e.target.value) || 0) })} placeholder="girilmedi" inputMode="decimal" style={{ ...inp, width: "100%" }} /></div>
                  <div style={{ flex: 1 }}><label style={lbl}>KDV %</label><input value={String(selectedProduct.vat_rate)} onChange={(e) => setSelectedProduct({ ...selectedProduct, vat_rate: parseFloat(e.target.value) || 0 })} placeholder={String(defaultVatFor(selectedProduct.category_id))} inputMode="decimal" style={{ ...inp, width: "100%" }} /></div>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--ink)", marginBottom: 10, cursor: "pointer" }}>
                  <input type="checkbox" checked={selectedProduct.is_active} onChange={(e) => setSelectedProduct({ ...selectedProduct, is_active: e.target.checked })} />
                  Aktif (kapalıysa satışta ve dijital menüde görünmez)
                </label>

                <button onClick={saveProduct} style={btnPrimary}>Kaydet</button>

                <Section title="Dijital menü içeriği">
                  <label style={lbl}>Açıklama</label>
                  <textarea value={selectedProduct.description ?? ""} onChange={(e) => setSelectedProduct({ ...selectedProduct, description: e.target.value || null })} rows={2} style={{ ...inp, width: "100%", marginBottom: 8, resize: "vertical" }} />

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={lbl}>İçindekiler (müşteriye gösterilir, miktar yok)</label>
                    <button onClick={() => setSelectedProduct({ ...selectedProduct, ingredients_text: icindekilerAuto })} style={miniLink}>Reçeteden doldur</button>
                  </div>
                  <textarea value={selectedProduct.ingredients_text ?? ""} onChange={(e) => setSelectedProduct({ ...selectedProduct, ingredients_text: e.target.value || null })} placeholder={icindekilerAuto || "—"} rows={2} style={{ ...inp, width: "100%", marginBottom: 8, resize: "vertical" }} />

                  <label style={lbl}>Fotoğraf URL (opsiyonel)</label>
                  <input value={selectedProduct.image_url ?? ""} onChange={(e) => setSelectedProduct({ ...selectedProduct, image_url: e.target.value || null })} placeholder="https://…" style={{ ...inp, width: "100%", marginBottom: 8 }} />
                  {selectedProduct.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element -- işletmeci tarafından girilen keyfi harici URL, next/image remotePatterns ile eşleşmeyebilir
                    <img src={selectedProduct.image_url} alt={selectedProduct.name} style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 10, marginBottom: 8 }} />
                  )}

                  <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6, marginTop: 4 }}>Alerjen (reçeteden önerilir, onayla/değiştir)</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
                    {ALLERGENS.map((a) => {
                      const on = alerjenlerEffective.includes(a);
                      return <button key={a} onClick={() => setSelectedProduct({ ...selectedProduct, allergens_override: (selectedProduct.allergens_override ?? alerjenlerAuto).includes(a) ? (selectedProduct.allergens_override ?? alerjenlerAuto).filter((x) => x !== a) : [...(selectedProduct.allergens_override ?? alerjenlerAuto), a] })} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 980, cursor: "pointer", border: on ? "none" : "1px solid var(--line-2)", background: on ? "var(--gold)" : "var(--card)", color: on ? "#272c1a" : "var(--muted)" }}>{a}</button>;
                    })}
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 14, marginTop: 10 }}>
                    <span style={{ color: "var(--muted)" }}>Kalori: <b className="tnum" style={{ color: "var(--ink)" }}>{kalori} kcal</b> <span style={{ fontSize: 11.5, color: "var(--muted-2)" }}>{selectedProduct.calorie_override != null ? "(elle)" : "(yaklaşık)"}</span></span>
                    {diyet && <span style={badge}>{diyet}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>Elle kalori:</span>
                    <input value={selectedProduct.calorie_override != null ? String(selectedProduct.calorie_override) : ""} onChange={(e) => setSelectedProduct({ ...selectedProduct, calorie_override: e.target.value === "" ? null : (parseFloat(e.target.value) || 0) })} placeholder={`reçete: ${kaloriAuto}`} inputMode="decimal" style={{ ...inp, width: 130 }} />
                  </div>
                </Section>

                <Section title="Satış kanalları" collapsible defaultOpen={false}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, marginBottom: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={selectedProduct.available_dine_in} onChange={(e) => setSelectedProduct({ ...selectedProduct, available_dine_in: e.target.checked })} /> Salonda satılır (QR/web dijital menü)
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, marginBottom: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={selectedProduct.available_takeaway} onChange={(e) => setSelectedProduct({ ...selectedProduct, available_takeaway: e.target.checked })} /> Paket menüsünde satılır
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, cursor: "pointer" }}>
                    <input type="checkbox" checked={selectedProduct.available_quick_sale} onChange={(e) => setSelectedProduct({ ...selectedProduct, available_quick_sale: e.target.checked })} /> Hızlı satışta görünür (kasa)
                  </label>
                </Section>

                <Section title="Kârlılık">
                  <KarSatiri label="Menü fiyatı" value={money(fiyat)} />
                  <KarSatiri label="KDV hariç net satış" value={money(netSatis)} />
                  <KarSatiri label="Tavsiye edilen fiyat" value={selectedProduct.recommended_price != null ? money(selectedProduct.recommended_price) : "eksik veri"} />
                  <KarSatiri label="Reçete maliyeti" value={receteMaliyeti != null ? money(receteMaliyeti) : "reçete eksik"} />
                  <KarSatiri label="Sarf maliyeti" value={sarfMaliyeti != null ? money(sarfMaliyeti) : "eksik veri"} />
                  <KarSatiri label="Sabit gider payı" value={sabitGiderPayi != null ? money(sabitGiderPayi) : "eksik veri"} />
                  <KarSatiri label="Toplam gerçek maliyet" value={toplamMaliyet != null ? money(toplamMaliyet) : "hesaplanamadı"} strong />
                  <KarSatiri label="Food cost %" value={foodCostPercent != null ? `%${foodCostPercent.toFixed(1)}` : "hesaplanamadı"} />
                  <KarSatiri label="Brüt kâr" value={brutKar != null ? money(brutKar) : "hesaplanamadı"} />
                  <KarSatiri label="Kâr marjı %" value={karMarji != null ? `%${karMarji.toFixed(1)}` : "hesaplanamadı"} strong />
                  <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 8 }}>Sarf/sabit gider ürün kartında girilmemişse Ayarlar → Varsayılan Ayarlar değerleri kullanılır.</div>
                </Section>

                <Section title="Maliyet (ürün bazlı override)" collapsible defaultOpen={false}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ flex: 1 }}><label style={lbl}>Sarf maliyeti ₺ (bu ürün)</label><input value={selectedProduct.variable_cost_override != null ? String(selectedProduct.variable_cost_override) : ""} onChange={(e) => setSelectedProduct({ ...selectedProduct, variable_cost_override: e.target.value === "" ? null : (parseFloat(e.target.value) || 0) })} placeholder="varsayılanı kullan" inputMode="decimal" style={{ ...inp, width: "100%" }} /></div>
                    <div style={{ flex: 1 }}><label style={lbl}>Sabit gider payı ₺ (bu ürün)</label><input value={selectedProduct.fixed_cost_share_override != null ? String(selectedProduct.fixed_cost_share_override) : ""} onChange={(e) => setSelectedProduct({ ...selectedProduct, fixed_cost_share_override: e.target.value === "" ? null : (parseFloat(e.target.value) || 0) })} placeholder="varsayılanı kullan" inputMode="decimal" style={{ ...inp, width: "100%" }} /></div>
                  </div>
                </Section>

                <Section title="Üretim / stok" collapsible defaultOpen={false}>
                  {!receteVar && <Empty>Reçete eksik — hesaplanamadı</Empty>}
                  {receteVar && bottleneck && (
                    <>
                      <KarSatiri label="Teorik üretilebilir adet" value={bottleneck.possible != null ? `${bottleneck.possible} adet` : "hesaplanamadı"} />
                      <KarSatiri label="Kritik malzeme" value={bottleneck.row.ingredients?.name ?? "—"} />
                      <KarSatiri label="Ortak stok kullanım oranı" value={`%${bottleneck.sharedRatio} (${bottleneck.usageCount} üründe kullanılıyor)`} />
                      <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 6 }}>Yaklaşık gösterge — malzemenin kaç farklı üründe paylaşıldığına göre hesaplanır, tam talep tahmini değildir.</div>
                    </>
                  )}
                </Section>
              </div>

              {/* sağ: reçete */}
              <div style={{ flex: 1.1, minWidth: 0, overflowY: "auto", overflowX: "hidden", borderLeft: "1px solid var(--line)", paddingLeft: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-green)", marginBottom: 10 }}>Reçete</div>

                {recipe.length > 0 && (
                  <div style={{ display: "flex", fontSize: 11, color: "var(--muted-2)", padding: "0 0 6px", borderBottom: "1px solid var(--line)" }}>
                    <span style={{ flex: 1.3 }}>Malzeme</span>
                    <span style={{ flex: 0.8, textAlign: "right" }}>Miktar</span>
                    <span style={{ flex: 1, textAlign: "right" }}>Alış maliyeti</span>
                    <span style={{ flex: 1, textAlign: "right" }}>Bu ürüne maliyeti</span>
                    <span style={{ width: 22 }} />
                  </div>
                )}
                {recipe.map((r) => {
                  const unit = r.ingredients?.unit ?? "adet";
                  const rowCost = r.quantity * (r.ingredients?.current_unit_cost ?? 0);
                  const pc = priceChanges[r.ingredient_id];
                  return (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
                      <span style={{ flex: 1.3 }}>{r.ingredients?.name}</span>
                      <span className="tnum" style={{ flex: 0.8, textAlign: "right", color: "var(--muted)" }}>{formatQuantity(r.quantity, unit)}</span>
                      <span className="tnum" style={{ flex: 1, textAlign: "right", color: "var(--muted)" }}>
                        {money(r.ingredients?.current_unit_cost ?? 0)}/{unit}
                        {pc && (
                          <span title={`Fiyat değişti: ${money(pc.from)} → ${money(pc.to)}`} style={{ display: "inline-flex", verticalAlign: "middle", marginLeft: 4 }}>
                            <AlertTriangle size={12} color="var(--gold-text)" />
                          </span>
                        )}
                      </span>
                      <span className="tnum" style={{ flex: 1, textAlign: "right", fontWeight: 600 }}>{money(rowCost)}</span>
                      <span style={{ width: 22, textAlign: "right" }}><IconBtn onClick={() => deleteRecipeRow(r.id)} /></span>
                    </div>
                  );
                })}
                {recipe.length === 0 && <Empty>Henüz malzeme yok</Empty>}
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <select value={recIng} onChange={(e) => { setRecIng(e.target.value); setRecQtyError(false); if (e.target.value === "__new") setShowNewIng(true); }} style={{ ...inp, flex: "1 1 140px", minWidth: 0 }}>
                    <option value="">Malzeme seç</option>
                    {ingredients.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                    <option value="__new">+ Yeni malzeme</option>
                  </select>
                  <input
                    value={recQty}
                    onChange={(e) => { setRecQty(e.target.value); setRecQtyError(false); }}
                    onKeyDown={(e) => e.key === "Enter" && addRecipeRow()}
                    placeholder={recIng && ingredients.find((i) => i.id === recIng) ? NATURAL_UNIT_HINT[ingredients.find((i) => i.id === recIng)!.unit] : "Miktar (15 gr, 250 ml, 1 adet)"}
                    style={{ ...inp, flex: "0 1 140px" }}
                  />
                  <button onClick={addRecipeRow} style={btnSmall}><Plus size={15} /></button>
                </div>
                {recQtyError && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 6 }}>Anlaşılamadı — örn. 15 gr, 250 ml, 1 adet</div>}
                {showNewIng && (
                  <div style={{ marginTop: 10, border: "1px solid var(--line)", borderRadius: 12, padding: 12, background: "var(--recede)" }}>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Yeni malzeme</div>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginBottom: 8, cursor: "pointer" }}>
                      <input type="checkbox" checked={niReady} onChange={(e) => setNiReady(e.target.checked)} />
                      Hazır ürün (ör. kutu içecek) — malzeme = ürünün kendisi, reçeteye otomatik 1 adet bağlanır
                    </label>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <input value={niName} onChange={(e) => setNiName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addIngredient()} placeholder={niReady ? "Ad (Coca Cola 330ml)" : "Ad (Dana kıyma)"} style={{ ...inp, flex: 1 }} autoFocus />
                      <select value={niReady ? "adet" : niUnit} disabled={niReady} onChange={(e) => setNiUnit(e.target.value)} style={{ ...inp, width: 80 }}><option value="kg">kg</option><option value="lt">lt</option><option value="adet">adet</option></select>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <input value={niCost} onChange={(e) => setNiCost(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addIngredient()} placeholder="Birim maliyet ₺" inputMode="decimal" style={{ ...inp, flex: 1 }} />
                      <input value={niKcal} onChange={(e) => setNiKcal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addIngredient()} placeholder={`kcal / ${niReady ? "adet" : niUnit}`} inputMode="decimal" style={{ ...inp, flex: 1 }} />
                    </div>
                    <select value={niDiet} onChange={(e) => setNiDiet(e.target.value)} style={{ ...inp, width: "100%", marginBottom: 8 }}>
                      {DIET_OPTS.map((d) => <option key={d.v} value={d.v}>{d.l}</option>)}
                    </select>
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}>Alerjen (varsa seç)</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                      {ALLERGENS.map((a) => {
                        const on = niAllergens.includes(a);
                        return <button key={a} onClick={() => setNiAllergens((prev) => on ? prev.filter((x) => x !== a) : [...prev, a])} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 980, cursor: "pointer", border: on ? "none" : "1px solid var(--line-2)", background: on ? "var(--gold)" : "var(--card)", color: on ? "#272c1a" : "var(--muted)" }}>{a}</button>;
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

                <Section title="Varyant" collapsible defaultOpen={false}>
                  {variants.map((v) => (<Row key={v.id}><span>{v.name}</span><span style={{ display: "flex", alignItems: "center", gap: 12 }}><span className="tnum" style={{ color: "var(--muted)" }}>{money(v.sale_price)}</span><IconBtn onClick={() => deleteVariant(v.id)} /></span></Row>))}
                  {variants.length === 0 && <Empty>Varyant yok</Empty>}
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <input value={nvName} onChange={(e) => setNvName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addVariant()} placeholder="Ad (Büyük boy)" style={{ ...inp, flex: 1 }} />
                    <input value={nvPrice} onChange={(e) => setNvPrice(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addVariant()} placeholder="Fiyat ₺" inputMode="decimal" style={{ ...inp, width: 90 }} />
                    <button onClick={addVariant} style={btnSmall}><Plus size={15} /></button>
                  </div>
                </Section>

                <Section title="Ek seçenekler (modifier)" collapsible defaultOpen={false}>
                  {itemGroups.map((ig) => (
                    <div key={ig.id} style={{ marginBottom: 10, border: "1px solid var(--line)", borderRadius: 10, padding: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 13.5 }}>{ig.modifier_groups?.name}</span>
                        <IconBtn onClick={() => detachGroup(ig.id)} />
                      </div>
                      {ig.modifier_groups?.modifiers.map((m) => (
                        <Row key={m.id}><span style={{ fontSize: 13 }}>{m.name}</span><span style={{ display: "flex", alignItems: "center", gap: 10 }}><span className="tnum" style={{ color: "var(--muted)", fontSize: 13 }}>{m.price_delta >= 0 ? "+" : ""}{money(m.price_delta)}</span><IconBtn onClick={() => deleteModifier(m.id)} /></span></Row>
                      ))}
                      {modGroup === ig.group_id ? (
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                          <input value={nmName} onChange={(e) => setNmName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addModifier(ig.group_id)} placeholder="Ad" style={{ ...inp, flex: 1 }} autoFocus />
                          <input value={nmPrice} onChange={(e) => setNmPrice(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addModifier(ig.group_id)} placeholder="+₺" inputMode="decimal" style={{ ...inp, width: 70 }} />
                          <button onClick={() => addModifier(ig.group_id)} style={btnSmall}><Plus size={15} /></button>
                        </div>
                      ) : (
                        <button onClick={() => setModGroup(ig.group_id)} style={miniLink}>+ seçenek</button>
                      )}
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    <select value={attachGroup} onChange={(e) => e.target.value === "__new" ? setShowNewGroup(true) : (setAttachGroup(e.target.value), attachExisting(e.target.value))} style={{ ...inp, flex: 1 }}>
                      <option value="">Grup ekle</option>
                      {attachable.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      <option value="__new">+ Yeni grup</option>
                    </select>
                  </div>
                  {showNewGroup && (
                    <div style={{ marginTop: 8, border: "1px solid var(--line)", borderRadius: 10, padding: 10 }}>
                      <input value={ngName} onChange={(e) => setNgName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createAndAttachGroup()} placeholder="Grup adı (Ekstralar)" style={{ ...inp, width: "100%", marginBottom: 8 }} autoFocus />
                      <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}><input type="checkbox" checked={ngRequired} onChange={(e) => setNgRequired(e.target.checked)} /> Zorunlu</label>
                        <input value={ngMin} onChange={(e) => setNgMin(e.target.value)} placeholder="Min" inputMode="numeric" style={{ ...inp, width: 60 }} />
                        <input value={ngMax} onChange={(e) => setNgMax(e.target.value)} placeholder="Max" inputMode="numeric" style={{ ...inp, width: 60 }} />
                      </div>
                      <button onClick={createAndAttachGroup} style={btnPrimary}>Ekle</button>
                    </div>
                  )}
                </Section>
              </div>
            </div>
          )}
        </div>
      </div>
    </SayfaKabugu>
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
        {/* İstasyon seçici buradan kaldırıldı (Gökhan, 2026-07-27): aynı ayar hem kategori
            başlığında hem ürün panelinde duruyordu, karışıklık yaratıyordu. Tek yer: ürün paneli.
            menu_categories.default_station_id kolonu ve mutfak ekranının
            "ürün override → yoksa kategori varsayılanı" çözümlemesi DURUYOR — daha önce
            kategoriye atanmış varsayılanlar çalışmaya devam eder. */}
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
            <button onClick={() => { setAddProd(!addProd); setPName(""); setPPrice(""); setPVat(String(m.defaultVatFor(cat.id))); }} style={miniLink}>+ ürün</button>
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
  const missingRecipe = prod.is_active && !m.menuItemsWithRecipe.has(prod.id);
  const priceMismatch = prod.recommended_price != null && Math.abs(prod.recommended_price - prod.sale_price) > prod.sale_price * 0.05;
  return (
    <div ref={setNodeRef} style={style}>
      <button {...attributes} {...listeners} aria-label="taşı" style={{ all: "unset", cursor: "grab", padding: "0 6px", color: "var(--muted-2)", touchAction: "none", display: "inline-flex" }}><GripVertical size={15} /></button>
      <div onClick={() => m.selectProduct(prod)} style={{ cursor: "pointer", flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 8px", fontSize: 13.5, fontWeight: selected ? 600 : 400, color: selected ? "var(--brand)" : "var(--ink)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {missingRecipe && <AlertTriangle size={12} color="var(--danger)" aria-label="Reçete eksik" />}
          {!missingRecipe && priceMismatch && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--gold-text)", flexShrink: 0 }} aria-label="Tavsiye fiyattan farklı" />}
          {!prod.is_active && <span style={{ fontSize: 10.5, color: "var(--muted-2)" }}>(pasif)</span>}
          <EditableText value={prod.name} onSave={(v) => m.renameProduct(prod.id, v)} />
        </span>
        <span className="tnum" style={{ color: "var(--muted)" }}>{money(prod.sale_price)}</span>
      </div>
    </div>
  );
}

function Section({ title, children, collapsible = true, defaultOpen = true }: { title: string; children: React.ReactNode; collapsible?: boolean; defaultOpen?: boolean }) {
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
function KarSatiri({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13.5 }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span className="tnum" style={{ fontWeight: strong ? 700 : 500, color: strong ? "var(--brand)" : "var(--ink)" }}>{value}</span>
    </div>
  );
}

const miniLink: React.CSSProperties = { all: "unset", cursor: "pointer", fontSize: 12.5, color: "var(--brand)" };
const badge: React.CSSProperties = { fontSize: 12, fontWeight: 600, padding: "3px 12px", borderRadius: 980, background: "var(--success-bg)", color: "var(--success)" };
// Ölçüler ölçü merkezinden türetilir (lib/olcu.ts) — yerel değer yazılmaz.
const inp: React.CSSProperties = { ...kutuDar, width: undefined, flex: 1, fontFamily: "inherit" };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 };
// Mevzuat uyum bandındaki eksik ürün rozetleri — tıklayınca o ürünün düzenleyicisi açılır.
const uyumChip: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "4px 10px", fontSize: 12, background: "var(--card)", color: "var(--ink)", cursor: "pointer" };
const btnPrimary: React.CSSProperties = { ...dugmeAnaSatir };
const btnSecondary: React.CSSProperties = { ...dugmeIkincil, minWidth: 0 };
const btnSmall: React.CSSProperties = { ...dugmeKucuk, display: "inline-flex", alignItems: "center", gap: 5 };
