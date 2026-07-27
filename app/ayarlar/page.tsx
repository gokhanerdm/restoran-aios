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
  staff_comparison_enabled: boolean;
};

const DEFAULT_SETTINGS: Settings = {
  default_vat_rate: 10,
  default_menu_design: "listeli",
  default_variable_cost_per_cover: 0,
  default_fixed_cost_share_percent: 0,
  role_visibility: {},
  staff_comparison_enabled: false,
};

// --- İşletme bilgileri / çalışma saatleri / arka plan (20260727100300_restaurant_info.sql) ---
type RestaurantInfo = { name: string; address: string; phone: string; tax_office: string; tax_number: string };
const EMPTY_INFO: RestaurantInfo = { name: "", address: "", phone: "", tax_office: "", tax_number: "" };

type DayKey = "pzt" | "sal" | "car" | "per" | "cum" | "cmt" | "paz";
type DayHours = { acilis: string; kapanis: string; kapali: boolean };
type OpeningHours = Record<DayKey, DayHours>;

const DAYS: { k: DayKey; l: string }[] = [
  { k: "pzt", l: "Pazartesi" },
  { k: "sal", l: "Salı" },
  { k: "car", l: "Çarşamba" },
  { k: "per", l: "Perşembe" },
  { k: "cum", l: "Cuma" },
  { k: "cmt", l: "Cumartesi" },
  { k: "paz", l: "Pazar" },
];
const DEFAULT_DAY: DayHours = { acilis: "09:00", kapanis: "23:00", kapali: false };
const defaultHours = (): OpeningHours => {
  const out = {} as OpeningHours;
  for (const d of DAYS) out[d.k] = { ...DEFAULT_DAY };
  return out;
};

// DB'de eksik/bozuk gün varsa varsayılanla tamamla — arayüz hiçbir durumda boş kalmasın.
function mergeHours(raw: unknown): OpeningHours {
  const src = (raw ?? {}) as Partial<Record<DayKey, Partial<DayHours>>>;
  const out = {} as OpeningHours;
  for (const d of DAYS) {
    const v = src[d.k] ?? {};
    out[d.k] = {
      acilis: typeof v.acilis === "string" && v.acilis ? v.acilis : DEFAULT_DAY.acilis,
      kapanis: typeof v.kapanis === "string" && v.kapanis ? v.kapanis : DEFAULT_DAY.kapanis,
      kapali: v.kapali === true,
    };
  }
  return out;
}

const DEFAULT_BACKGROUND = "yesil_kupler";
const BACKGROUNDS: { v: string; l: string; d: string; sw: string }[] = [
  { v: "yesil_kupler", l: "Yeşil küpler", d: "Mevcut varsayılan — yeşil küp fotoğrafı", sw: "linear-gradient(135deg, var(--brand) 0%, var(--ink-green) 100%)" },
  { v: "duz_renk", l: "Düz renk", d: "Fotoğrafsız, sade krem zemin", sw: "var(--canvas)" },
  { v: "koyu", l: "Koyu", d: "Koyu zemin — akşam servisinde göz yormaz", sw: "var(--ink-green)" },
];

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

  // İşletme paneli (bilgiler + çalışma saatleri + arka plan) kendi state'ini tutar,
  // yukarıdaki ayarlarla karışmaz.
  const [info, setInfo] = useState<RestaurantInfo>(EMPTY_INFO);
  const [hours, setHours] = useState<OpeningHours>(defaultHours);
  const [background, setBackground] = useState<string>(DEFAULT_BACKGROUND);
  const [infoSaved, setInfoSaved] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const restId = await getMyRestaurantId();
    if (!restId) return;
    setRestaurantId(restId);
    const [{ data: s }, { data: c }] = await Promise.all([
      supabase.from("restaurant_settings").select("default_vat_rate, default_menu_design, default_variable_cost_per_cover, default_fixed_cost_share_percent, role_visibility, staff_comparison_enabled").eq("restaurant_id", restId).maybeSingle(),
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

  // Mevcut load()'a dokunmadan, restoran kimliği hazır olunca işletme panelini doldur.
  useEffect(() => {
    if (!restaurantId) return;
    let iptal = false;
    (async () => {
      const [{ data: r }, { data: s }] = await Promise.all([
        supabase.from("restaurants").select("name, address, phone, tax_office, tax_number").eq("id", restaurantId).maybeSingle(),
        supabase.from("restaurant_settings").select("opening_hours, background_choice").eq("restaurant_id", restaurantId).maybeSingle(),
      ]);
      if (iptal) return;
      if (r) {
        const row = r as Partial<Record<keyof RestaurantInfo, string | null>>;
        setInfo({
          name: row.name ?? "",
          address: row.address ?? "",
          phone: row.phone ?? "",
          tax_office: row.tax_office ?? "",
          tax_number: row.tax_number ?? "",
        });
      }
      const sRow = s as { opening_hours: unknown; background_choice: string | null } | null;
      setHours(mergeHours(sRow?.opening_hours));
      setBackground(sRow?.background_choice || DEFAULT_BACKGROUND);
    })();
    return () => { iptal = true; };
  }, [restaurantId]);

  const setDay = (k: DayKey, patch: Partial<DayHours>) =>
    setHours((h) => ({ ...h, [k]: { ...h[k], ...patch } }));

  const saveInfo = async () => {
    if (!restaurantId) return;
    if (!info.name.trim()) { setInfoError("İşletme adı boş olamaz."); return; }
    setInfoError(null);
    // İşletme adı marka adı olduğu için büyük/küçük harfe dokunmuyoruz, sadece kırpıyoruz.
    const { error: infoErr } = await supabase.from("restaurants").update({
      name: info.name.trim(),
      address: info.address.trim() || null,
      phone: info.phone.trim() || null,
      tax_office: info.tax_office.trim() || null,
      tax_number: info.tax_number.trim() || null,
    }).eq("id", restaurantId);
    if (infoErr) { setInfoError(infoErr.message); return; }
    // Sadece bu iki kolon gönderiliyor; restaurant_settings'teki diğer ayarlar korunur.
    const { error: setErr } = await supabase.from("restaurant_settings").upsert(
      { restaurant_id: restaurantId, opening_hours: hours, background_choice: background },
      { onConflict: "restaurant_id" },
    );
    if (setErr) { setInfoError(setErr.message); return; }
    setInfoSaved(true);
    setTimeout(() => setInfoSaved(false), 2000);
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

            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)", marginTop: 16, marginBottom: 8 }}>Personel karşılaştırması</div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, marginBottom: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={settings.staff_comparison_enabled} onChange={() => setSettings((s) => ({ ...s, staff_comparison_enabled: !s.staff_comparison_enabled }))} /> Garsonlar birbirinin satış yüzdesini görsün
            </label>
            <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginBottom: 8 }}>Kapalıyken herkes sadece kendi profilindeki rakamları görür, kimse başkasıyla kıyaslanmaz.</div>

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

        <div style={{ flex: 1, minWidth: 320, maxWidth: 440, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 20, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-green)", marginBottom: 14, flexShrink: 0 }}>İşletme</div>

          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)", marginBottom: 8 }}>İşletme bilgileri</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Fiş ve fatura basımında bu bilgiler kullanılacak.</div>

            <label style={lbl}>İşletme adı</label>
            <input value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && saveInfo()} placeholder="Örn. Kayen Restoran" style={{ ...inp, width: "100%", marginBottom: 12 }} />

            <label style={lbl}>Adres</label>
            <textarea value={info.address} onChange={(e) => setInfo({ ...info, address: e.target.value })} rows={2} placeholder="Mahalle, cadde, no — ilçe / il" style={{ ...inp, width: "100%", marginBottom: 12, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }} />

            <label style={lbl}>Telefon</label>
            <input value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} onKeyDown={(e) => e.key === "Enter" && saveInfo()} inputMode="tel" placeholder="0212 000 00 00" className="tnum" style={{ ...inp, width: "100%", marginBottom: 12 }} />

            <label style={lbl}>Vergi dairesi</label>
            <input value={info.tax_office} onChange={(e) => setInfo({ ...info, tax_office: e.target.value })} onKeyDown={(e) => e.key === "Enter" && saveInfo()} placeholder="Örn. Beşiktaş" style={{ ...inp, width: "100%", marginBottom: 12 }} />

            <label style={lbl}>Vergi numarası</label>
            <input value={info.tax_number} onChange={(e) => setInfo({ ...info, tax_number: e.target.value })} onKeyDown={(e) => e.key === "Enter" && saveInfo()} inputMode="numeric" placeholder="10 haneli VKN veya TCKN" className="tnum" style={{ ...inp, width: "100%", marginBottom: 18 }} />

            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)", marginBottom: 8 }}>Çalışma saatleri</div>
            <div style={{ display: "flex", fontSize: 11, color: "var(--muted-2)", padding: "0 0 6px", borderBottom: "1px solid var(--line)" }}>
              <span style={{ flex: 1 }}>Gün</span>
              <span style={{ width: 92, textAlign: "center" }}>Açılış</span>
              <span style={{ width: 92, textAlign: "center", marginLeft: 6 }}>Kapanış</span>
              <span style={{ width: 46, textAlign: "center" }}>Kapalı</span>
            </div>
            {DAYS.map((d) => {
              const h = hours[d.k] ?? DEFAULT_DAY;
              return (
                <div key={d.k} style={{ display: "flex", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: h.kapali ? "var(--muted-2)" : "var(--ink)" }}>{d.l}</span>
                  <input type="time" value={h.acilis} disabled={h.kapali} onChange={(e) => setDay(d.k, { acilis: e.target.value })} className="tnum" style={{ ...timeInp, opacity: h.kapali ? 0.4 : 1 }} />
                  <input type="time" value={h.kapanis} disabled={h.kapali} onChange={(e) => setDay(d.k, { kapanis: e.target.value })} className="tnum" style={{ ...timeInp, marginLeft: 6, opacity: h.kapali ? 0.4 : 1 }} />
                  <span style={{ width: 46, textAlign: "center" }}>
                    <input type="checkbox" checked={h.kapali} onChange={() => setDay(d.k, { kapali: !h.kapali })} style={{ cursor: "pointer" }} />
                  </span>
                </div>
              );
            })}
            <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 8, marginBottom: 18 }}>Gece yarısını geçen kapanış için kapanış saatini olduğu gibi yaz (örn. 02:00).</div>

            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-green)", marginBottom: 8 }}>Arka plan</div>
            {BACKGROUNDS.map((b) => {
              const sel = background === b.v;
              return (
                <div key={b.v} onClick={() => setBackground(b.v)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line)", cursor: "pointer" }}>
                  <span style={{ width: 34, height: 34, borderRadius: 9, background: b.sw, border: "1px solid var(--line-2)", flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13.5, color: "var(--ink)", fontWeight: sel ? 600 : 400 }}>{b.l}</span>
                    <span style={{ display: "block", fontSize: 11.5, color: "var(--muted-2)" }}>{b.d}</span>
                  </span>
                  <span style={{ width: 16, height: 16, borderRadius: 999, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${sel ? "var(--brand-strong)" : "var(--line-2)"}`, background: sel ? "var(--brand-strong)" : "transparent" }}>
                    {sel && <span style={{ width: 6, height: 6, borderRadius: 999, background: "#fff" }} />}
                  </span>
                </div>
              );
            })}
            <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 8, lineHeight: 1.6 }}>Şimdilik sadece tercihin kaydedilir; ekranın gerçekten bu arka plana geçmesi ayrı bir adımda devreye alınacak.</div>
          </div>

          <div style={{ flexShrink: 0, marginTop: 14 }}>
            <button onClick={saveInfo} style={btnPrimary}>Kaydet</button>
            {infoSaved && <span style={{ marginLeft: 10, fontSize: 12.5, color: "var(--brand-strong)" }}>Kaydedildi</span>}
            {infoError && <div style={{ marginTop: 8, fontSize: 12.5, color: "var(--danger)" }}>Kaydedilemedi: {infoError}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "9px 12px", fontSize: 14, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0 };
const lbl: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 4 };
const timeInp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "6px 8px", fontSize: 13, background: "var(--card)", color: "var(--ink)", outline: "none", width: 92, boxSizing: "border-box", textAlign: "center" };
const btnPrimary: React.CSSProperties = { border: "none", borderRadius: 980, padding: "10px 18px", background: "var(--brand-strong)", color: "#fff", fontSize: 14, fontWeight: 500 };
