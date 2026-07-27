import { createClient } from "@supabase/supabase-js";
import QrOrderCart, { QrAddButton } from "./QrSiparis";

type Category = { id: string; name: string; parent_id: string | null };
type RecipeItem = { quantity: number; ingredients: { name: string; kcal_per_unit: number; diet_class: string; allergens: string[] } | null };
type Product = {
  id: string;
  name: string;
  sale_price: number;
  vat_rate: number;
  category_id: string | null;
  calorie_override: number | null;
  description: string | null;
  image_url: string | null;
  ingredients_text: string | null;
  allergens_override: string[] | null;
  recipe_items: RecipeItem[];
};

const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;

// ?masa=<uuid> — QR sipariş için masa kimliği. Geçersiz bir metin doğrudan Postgres'e
// gönderilirse uuid cast hatası üretir; onun yerine formatı burada eliyoruz.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

function nutrition(prod: Product) {
  const items = prod.recipe_items ?? [];
  const kcalAuto = Math.round(items.reduce((s, r) => s + r.quantity * (r.ingredients?.kcal_per_unit ?? 0), 0));
  const kcal = prod.calorie_override ?? kcalAuto;
  const dc = items.map((r) => r.ingredients?.diet_class).filter(Boolean) as string[];
  const diet = dc.length === 0 ? "" : dc.every((d) => d === "bitkisel") ? "Vegan" : !dc.includes("et") ? "Vejetaryen" : "";
  const allergensAuto = Array.from(new Set(items.flatMap((r) => r.ingredients?.allergens ?? [])));
  const allergens = prod.allergens_override ?? allergensAuto;
  const ingredientsAuto = items.map((r) => r.ingredients?.name).filter(Boolean).join(", ");
  const ingredientsText = prod.ingredients_text ?? ingredientsAuto;
  return { kcal, diet, allergens, ingredientsText };
}

export default async function PublicMenu({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ embed?: string; masa?: string }>;
}) {
  const { slug } = await params;
  const { embed: embedParam, masa: masaParam } = await searchParams;
  const embed = embedParam === "1";

  const { data: rest } = await db
    .from("restaurants").select("id, name").eq("slug", slug).is("deleted_at", null).maybeSingle();

  if (!rest) {
    return (
      <div style={{ background: "var(--canvas)", minHeight: "100vh", padding: 40, textAlign: "center", color: "var(--muted)" }}>
        Menü bulunamadı.
      </div>
    );
  }

  const [{ data: c }, { data: p }, { data: settingsRow }] = await Promise.all([
    db.from("menu_categories").select("id, name, parent_id").eq("restaurant_id", rest.id).is("deleted_at", null).order("sort_order"),
    db.from("menu_items")
      .select("id, name, sale_price, vat_rate, category_id, calorie_override, description, image_url, ingredients_text, allergens_override, recipe_items(quantity, ingredients(name, kcal_per_unit, diet_class, allergens))")
      .eq("restaurant_id", rest.id).eq("is_active", true).eq("available_dine_in", true).is("deleted_at", null).order("sort_order"),
    db.from("restaurant_settings").select("default_menu_design").eq("restaurant_id", rest.id).maybeSingle(),
  ]);

  const categories = (c as Category[]) ?? [];
  const products = (p as unknown as Product[]) ?? [];
  const photoStyle = settingsRow?.default_menu_design === "fotografli";

  // QR sipariş — SADECE /m/<slug>?masa=<table_id> ile açıldığında. Masa parametresi yoksa,
  // geçersizse ya da başka bir restorana aitse sipariş özelliği HİÇ gösterilmez; sayfa
  // eskisi gibi salt görüntülenen bir menü olarak kalır.
  const { data: tableRow } =
    masaParam && UUID_RE.test(masaParam)
      ? await db.from("restaurant_tables").select("id, name")
          .eq("id", masaParam).eq("restaurant_id", rest.id).is("deleted_at", null).maybeSingle()
      : { data: null };
  const orderTable = (tableRow as { id: string; name: string } | null) ?? null;

  const renderCategory = (cat: Category, depth: number): React.ReactNode => {
    const subs = categories.filter((x) => x.parent_id === cat.id);
    const prods = products.filter((x) => x.category_id === cat.id);
    if (subs.length === 0 && prods.length === 0) return null;
    return (
      <div key={cat.id} style={{ marginTop: depth === 0 ? 30 : 18 }}>
        <div style={{
          fontSize: depth === 0 ? 19 : 15, fontWeight: 600, color: "var(--ink-green)",
          letterSpacing: "-0.3px", paddingBottom: 8,
          borderBottom: depth === 0 ? "2px solid var(--brand)" : "none",
          marginLeft: depth * 4,
        }}>{cat.name}</div>
        {prods.map((prod) => {
          const { kcal, diet, allergens, ingredientsText } = nutrition(prod);
          return (
            <div key={prod.id} style={{ display: "flex", gap: 12, padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
              {photoStyle && prod.image_url && (
                // eslint-disable-next-line @next/next/no-img-element -- işletmeci tarafından girilen keyfi harici URL
                <img src={prod.image_url} alt={prod.name} style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ fontSize: 15, fontWeight: 500 }}>{prod.name}</span>
                  <span className="tnum" style={{ fontSize: 15, color: "var(--ink-green)", flexShrink: 0 }}>{money(prod.sale_price)}</span>
                </div>
                {prod.description && (
                  <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 3 }}>{prod.description}</div>
                )}
                {ingredientsText && (
                  <div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 3 }}>{ingredientsText}</div>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 5, flexWrap: "wrap" }}>
                  {kcal > 0 && <span style={{ fontSize: 12.5, color: "var(--muted)" }} className="tnum">{kcal} kcal</span>}
                  {diet && <span style={{ fontSize: 11.5, fontWeight: 600, padding: "2px 9px", borderRadius: 980, background: "var(--success-bg)", color: "var(--success)" }}>{diet}</span>}
                </div>
                {allergens.length > 0 && (
                  <div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 4 }}>Alerjen: {allergens.join(", ")}</div>
                )}
              </div>
              {/* Sipariş verilebilir mod (QR + masa) — masa yoksa hiç render edilmez. */}
              {orderTable && (
                <QrAddButton product={{ id: prod.id, name: prod.name, sale_price: prod.sale_price, vat_rate: prod.vat_rate }} />
              )}
            </div>
          );
        })}
        {subs.map((s) => renderCategory(s, depth + 1))}
      </div>
    );
  };

  const roots = categories.filter((x) => x.parent_id === null);
  // Menü ağacı tek yerde üretilir; sipariş modunda aynı ağaç sepet katmanının children'ı
  // olarak geçer (server'da render edilir, sadece "Ekle" butonları client'tır).
  const menuTree = <>{roots.map((cat) => renderCategory(cat, 0))}</>;

  return (
    <div style={{ background: "var(--canvas)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 560, margin: "0 auto", padding: embed ? "16px" : "0 18px 48px" }}>
        {!embed && (
          <div style={{ textAlign: "center", padding: "36px 0 8px" }}>
            <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.6px", color: "var(--ink-green)" }}>{rest.name}</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6 }}>Menü</div>
          </div>
        )}
        {roots.length === 0 && <div style={{ color: "var(--muted)", padding: 24, textAlign: "center" }}>Menü henüz boş.</div>}
        {orderTable ? (
          <QrOrderCart restaurantId={rest.id} tableId={orderTable.id} tableName={orderTable.name}>
            {menuTree}
          </QrOrderCart>
        ) : menuTree}
        {!embed && (
          <div style={{ textAlign: "center", marginTop: 40, fontSize: 11, color: "var(--muted-2)" }}>Restoran AIOS</div>
        )}
      </div>
    </div>
  );
}
