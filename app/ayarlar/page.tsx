"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getMyRestaurantId } from "@/lib/supabase/restaurant";

type Category = { id: string; name: string; parent_id: string | null; vat_rate: number | null; target_food_cost_percent: number | null };
type RoleVisibility = { garson?: { cost_visible?: boolean }; sef?: { cost_visible?: boolean } };
type Settings = {
  default_vat_rate: number;
  default_menu_design: string;
  default_variable_cost_per_cover: number;
  default_fixed_cost_share_percent: number;
  role_visibility: RoleVisibility;
};

const DEFAULT_SETTINGS: Settings = {
  default_vat_rate: 10,
  default_menu_design: "listeli",
  default_variable_cost_per_cover: 0,
  default_fixed_cost_share_percent: 0,
  role_visibility: {},
};

function flatten(cats: Category[], parentId: string | null = null, depth = 0): { id: string; label: string }[] {
  return cats
    .filter((c) => c.parent_id === parentId)
    .flatMap((c) => [
      { id: c.id, label: `${"— ".repeat(depth)}${c.name}` },
      ...flatten(cats, c.id, depth + 1),
    ]);
}

export default function Ayarlar() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [categories, setCategories] = useState<Category[]>([]);
  const [catDrafts, setCatDrafts] = useState<Record<string, { vat: string; food: string }>>({});
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const restId = await getMyRestaurantId();
    if (!restId) return;
    setRestaurantId(restId);
    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from("restaurant_settings").select("default_vat_rate, default_menu_design, default_variable_cost_per_cover, default_fixed_cost_share_percent, role_visibility").eq("restaurant_id", restId).maybeSingle(),
      supabase.from("menu_categories").select("id, name, parent_id, vat_rate, target_food_cost_percent").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
    ]);
    if (s) setSettings(s as Settings);
    const cats = (c as Category[]) ?? [];
    setCategories(cats);
    setCatDrafts(Object.fromEntries(cats.map((cat) => [cat.id, {
      vat: cat.vat_rate != null ? String(cat.vat_rate) : "",
      food: cat.target_food_cost_percent != null ? String(cat.target_food_cost_percent) : "",
    }])));
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveSettings = async () => {
    if (!restaurantId) return;
    setSaveError(null);
    const { error } = await supabase.from("restaurant_settings").upsert({ restaurant_id: restaurantId, ...settings }, { onConflict: "restaurant_id" });
    if (error) { setSaveError(error.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const saveCategoryRates = async () => {
    setSaveError(null);
    const results = await Promise.all(categories.map((c) => {
      const d = catDrafts[c.id];
      return supabase.from("menu_categories").update({
        vat_rate: d?.vat ? parseFloat(d.vat) || 0 : null,
        target_food_cost_percent: d?.food ? parseFloat(d.food) || 0 : null,
      }).eq("id", c.id);
    }));
    const firstError = results.find((r) => r.error)?.error;
    if (firstError) { setSaveError(firstError.message); return; }
    await load();
  };

  const toggleRole = (role: "garson" | "sef") => {
    setSettings((s) => ({
      ...s,
      role_visibility: {
        ...s.role_visibility,
        [role]: { cost_visible: !s.role_visibility?.[role]?.cost_visible },
      },
    }));
  };

  const flatCats = flatten(categories);

  return (
    <div style={{ padding: "26px 28px", height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", marginBottom: 20, flexShrink: 0 }}>Ayarlar</div>

      <div style={{ display: "flex", gap: 22, flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 340, maxWidth: 460, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 20, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-green)", marginBottom: 14, flexShrink: 0 }}>Varsayılan Ayarlar</div>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            <label style={lbl}>Varsayılan KDV oranı %</label>
            <input value={String(settings.default_vat_rate)} onChange={(e) => setSettings({ ...settings, default_vat_rate: parseFloat(e.target.value) || 0 })} inputMode="decimal" style={{ ...inp, width: "100%", marginBottom: 12 }} />

            <label style={lbl}>Varsayılan müşteri menüsü tasarımı</label>
            <select value={settings.default_menu_design} onChange={(e) => setSettings({ ...settings, default_menu_design: e.target.value })} style={{ ...inp, width: "100%", marginBottom: 12 }}>
              <option value="listeli">Listeli (sade)</option>
              <option value="fotografli">Fotoğraflı</option>
            </select>

            <label style={lbl}>Varsayılan sarf maliyeti (kişi başı ₺)</label>
            <input value={String(settings.default_variable_cost_per_cover)} onChange={(e) => setSettings({ ...settings, default_variable_cost_per_cover: parseFloat(e.target.value) || 0 })} inputMode="decimal" style={{ ...inp, width: "100%", marginBottom: 12 }} />

            <label style={lbl}>Varsayılan sabit gider payı (satış tutarının yüzdesi)</label>
            <input value={String(settings.default_fixed_cost_share_percent)} onChange={(e) => setSettings({ ...settings, default_fixed_cost_share_percent: parseFloat(e.target.value) || 0 })} inputMode="decimal" style={{ ...inp, width: "100%", marginBottom: 16 }} />

            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)", marginBottom: 8 }}>Rol bazlı görünürlük</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Maliyet/kârlılık personele varsayılan kapalıdır. Buradan açabilirsin.</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={!!settings.role_visibility?.garson?.cost_visible} onChange={() => toggleRole("garson")} /> Garson maliyet/kârlılık görsün
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={!!settings.role_visibility?.sef?.cost_visible} onChange={() => toggleRole("sef")} /> Şef maliyet/kârlılık görsün
            </label>

            <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 14, lineHeight: 1.6 }}>
              Restoran bilgisi, masa &amp; salon düzeni (Salonlar sayfasında) ve sabit giderlerin tam dökümü ileride buraya eklenecek.
            </div>
          </div>

          <div style={{ flexShrink: 0, marginTop: 14 }}>
            <button onClick={saveSettings} style={btnPrimary}>Kaydet</button>
            {saved && <span style={{ marginLeft: 10, fontSize: 12.5, color: "var(--success)" }}>Kaydedildi</span>}
            {saveError && <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--danger)" }}>Kaydedilemedi: {saveError}</div>}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 340, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 20, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-green)", marginBottom: 6, flexShrink: 0 }}>Kategori bazlı KDV / hedef food cost</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, flexShrink: 0 }}>Boş bırakılırsa varsayılan KDV / hedef food cost kullanılır.</div>

          <div style={{ display: "flex", fontSize: 11, color: "var(--muted-2)", padding: "0 0 6px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
            <span style={{ flex: 1.4 }}>Kategori</span>
            <span style={{ flex: 1, textAlign: "right" }}>KDV %</span>
            <span style={{ flex: 1, textAlign: "right", marginLeft: 8 }}>Hedef food cost %</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {flatCats.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
                <span style={{ flex: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.label}</span>
                <input value={catDrafts[c.id]?.vat ?? ""} onChange={(e) => setCatDrafts((d) => ({ ...d, [c.id]: { ...d[c.id], vat: e.target.value } }))} placeholder={String(settings.default_vat_rate)} inputMode="decimal" style={{ ...inp, flex: 1, textAlign: "right" }} />
                <input value={catDrafts[c.id]?.food ?? ""} onChange={(e) => setCatDrafts((d) => ({ ...d, [c.id]: { ...d[c.id], food: e.target.value } }))} placeholder="—" inputMode="decimal" style={{ ...inp, flex: 1, marginLeft: 8, textAlign: "right" }} />
              </div>
            ))}
            {flatCats.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>Henüz kategori yok — önce Menü sayfasından ekle.</div>}
          </div>
          <div style={{ flexShrink: 0, marginTop: 14 }}>
            <button onClick={saveCategoryRates} style={btnPrimary}>Kaydet</button>
            {saveError && <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--danger)" }}>Kaydedilemedi: {saveError}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "9px 12px", fontSize: 14, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0 };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 };
const btnPrimary: React.CSSProperties = { border: "none", borderRadius: 980, padding: "10px 18px", background: "var(--brand-strong)", color: "#fff", fontSize: 14, fontWeight: 500 };
