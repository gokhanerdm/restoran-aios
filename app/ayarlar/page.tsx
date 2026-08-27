"use client";

// AYARLAR — tasarım dilinin prova sayfası (2026-08-27). Akordiyonlu tek sütun:
// alt alta kutular, aynı anda tek kutu açık, açık kutunun başlığı yukarı yapışık.
// Eski düzen 3 sütun + 3 ayrı Kaydet'ti; ekran kuralı gereği TEK Kaydet'e indi —
// başlık satırındaki düğme bütün bölümleri birlikte yazar. Tek istisna
// anonimleştirme: geri alınamaz, kendi onaylı düğmesi Kişisel Veri bölümünde.
//
// Bölümler ayrı dosyalarda (bolumler/), state ve kaydetme burada — bölümler sadece çizer.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getMyRestaurantId } from "@/lib/supabase/restaurant";
import SayfaKabugu from "@/app/components/SayfaKabugu";
import Akordiyon from "@/app/components/Akordiyon";
import { dugmeAnaSatir } from "@/lib/olcu";
import GenelBolumu, { type Settings, type Provider } from "./bolumler/GenelBolumu";
import KategoriBolumu, { type KategoriTaslak } from "./bolumler/KategoriBolumu";
import IsletmeBolumu, {
  DAYS, DEFAULT_DAY, DEFAULT_BACKGROUND,
  type RestaurantInfo, type OpeningHours, type DayKey, type DayHours,
} from "./bolumler/IsletmeBolumu";
import VeriBolumu, { type PersonalDataStatus } from "./bolumler/VeriBolumu";

type Category = { id: string; name: string; parent_id: string | null; vat_rate: number | null; target_food_cost_percent: number | null; course_no: number | null };

const DEFAULT_SETTINGS: Settings = {
  default_vat_rate: 10,
  default_menu_design: "listeli",
  default_variable_cost_per_cover: 0,
  default_fixed_cost_share_percent: 0,
  role_visibility: {},
  staff_comparison_enabled: false,
  purchase_approval_roles: ["yonetici"],
  table_flow_mode: "basit",
  tip_points: {},
  kitchen_tip_percent: 0,
  course_sequencing_enabled: false,
  evening_start_hour: 17,
  notif_channel: "kapali",
  notif_onay: true,
  notif_hatirlatma: true,
};

const EMPTY_INFO: RestaurantInfo = { name: "", address: "", phone: "", tax_office: "", tax_number: "" };

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

function flatten(cats: Category[], parentId: string | null = null, depth = 0): { id: string; label: string }[] {
  return cats
    .filter((c) => c.parent_id === parentId)
    .flatMap((c) => [
      { id: c.id, label: `${"— ".repeat(depth)}${c.name}` },
      ...flatten(cats, c.id, depth + 1),
    ]);
}

export default function Ayarlar() {
  const [acik, setAcik] = useState<string | null>(null);

  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [categories, setCategories] = useState<Category[]>([]);
  const [catDrafts, setCatDrafts] = useState<KategoriTaslak>({});
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [info, setInfo] = useState<RestaurantInfo>(EMPTY_INFO);
  const [hours, setHours] = useState<OpeningHours>(defaultHours);
  const [background, setBackground] = useState<string>(DEFAULT_BACKGROUND);
  // İşletme paneli DB'den dolmadan Kaydet çalışmasın — boş değerler DB'nin üstüne yazılmasın.
  const [isletmeYuklendi, setIsletmeYuklendi] = useState(false);

  const [kvkkNotice, setKvkkNotice] = useState("");
  const [kvkkDays, setKvkkDays] = useState("365");
  const [pdStatus, setPdStatus] = useState<PersonalDataStatus | null>(null);
  const [anonBusy, setAnonBusy] = useState(false);
  const [anonDone, setAnonDone] = useState<number | null>(null);

  const [providers, setProviders] = useState<Provider[]>([]);
  const [provDrafts, setProvDrafts] = useState<Record<string, { rate: string; days: string }>>({});

  const load = useCallback(async () => {
    const restId = await getMyRestaurantId();
    if (!restId) return;
    setRestaurantId(restId);
    const [{ data: s }, { data: c }, { data: pv }] = await Promise.all([
      supabase.from("restaurant_settings").select("default_vat_rate, default_menu_design, default_variable_cost_per_cover, default_fixed_cost_share_percent, role_visibility, staff_comparison_enabled, purchase_approval_roles, table_flow_mode, tip_points, kitchen_tip_percent, course_sequencing_enabled, evening_start_hour, notif_channel, notif_onay, notif_hatirlatma").eq("restaurant_id", restId).maybeSingle(),
      supabase.from("menu_categories").select("id, name, parent_id, vat_rate, target_food_cost_percent, course_no").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order"),
      supabase.from("payment_providers").select("id, name, method, commission_rate, settlement_days, is_default, is_active").eq("restaurant_id", restId).is("deleted_at", null).order("method").order("sort_order"),
    ]);
    if (s) setSettings(s as Settings);
    const provs = (pv as Provider[]) ?? [];
    setProviders(provs);
    setProvDrafts(Object.fromEntries(provs.map((p) => [p.id, {
      rate: String(p.commission_rate), days: String(p.settlement_days),
    }])));
    const cats = (c as Category[]) ?? [];
    setCategories(cats);
    setCatDrafts(Object.fromEntries(cats.map((cat) => [cat.id, {
      vat: cat.vat_rate != null ? String(cat.vat_rate) : "",
      food: cat.target_food_cost_percent != null ? String(cat.target_food_cost_percent) : "",
      course: cat.course_no != null ? String(cat.course_no) : "",
    }])));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Restoran kimliği hazır olunca işletme + KVKK panellerini doldur.
  useEffect(() => {
    if (!restaurantId) return;
    let iptal = false;
    (async () => {
      const [{ data: r }, { data: s }, { data: pd }] = await Promise.all([
        supabase.from("restaurants").select("name, address, phone, tax_office, tax_number").eq("id", restaurantId).maybeSingle(),
        supabase.from("restaurant_settings").select("opening_hours, background_choice, kvkk_notice, kvkk_retention_days").eq("restaurant_id", restaurantId).maybeSingle(),
        supabase.rpc("personal_data_status", { p_restaurant: restaurantId }),
      ]);
      if (iptal) return;
      const kv = s as { kvkk_notice: string | null; kvkk_retention_days: number | null } | null;
      setKvkkNotice(kv?.kvkk_notice ?? "");
      setKvkkDays(String(kv?.kvkk_retention_days ?? 365));
      setPdStatus(((pd as PersonalDataStatus[]) ?? [])[0] ?? null);
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
      setIsletmeYuklendi(true);
    })();
    return () => { iptal = true; };
  }, [restaurantId]);

  const setDay = (k: DayKey, patch: Partial<DayHours>) =>
    setHours((h) => ({ ...h, [k]: { ...h[k], ...patch } }));

  // TEK KAYDET (ekran kuralı) — bütün bölümleri birlikte yazar: genel ayarlar +
  // sağlayıcı satırları + kategori değerleri + işletme bilgileri + saatler + KVKK.
  const kaydet = async () => {
    if (!restaurantId || !isletmeYuklendi) return;
    if (!info.name.trim()) { setSaveError("İşletme adı boş olamaz."); setAcik("isletme"); return; }
    setSaveError(null);

    // restaurant_settings'in bütün ayar kolonları tek upsert'te.
    const { error: sErr } = await supabase.from("restaurant_settings").upsert(
      {
        restaurant_id: restaurantId, ...settings,
        opening_hours: hours, background_choice: background,
        kvkk_notice: kvkkNotice.trim() || null,
        kvkk_retention_days: Math.max(1, parseInt(kvkkDays, 10) || 365),
      },
      { onConflict: "restaurant_id" },
    );
    if (sErr) { setSaveError(sErr.message); return; }

    // İşletme adı marka adı olduğu için büyük/küçük harfe dokunmuyoruz, sadece kırpıyoruz.
    const { error: infoErr } = await supabase.from("restaurants").update({
      name: info.name.trim(),
      address: info.address.trim() || null,
      phone: info.phone.trim() || null,
      tax_office: info.tax_office.trim() || null,
      tax_number: info.tax_number.trim() || null,
    }).eq("id", restaurantId);
    if (infoErr) { setSaveError(infoErr.message); return; }

    const provResults = await Promise.all(providers.map((p) => {
      const d = provDrafts[p.id];
      return supabase.from("payment_providers").update({
        commission_rate: Math.min(99.99, Math.max(0, parseFloat((d?.rate ?? "").replace(",", ".")) || 0)),
        settlement_days: Math.max(0, parseInt(d?.days ?? "", 10) || 0),
        is_active: p.is_active,
        updated_at: new Date().toISOString(),
      }).eq("id", p.id);
    }));
    const provErr = provResults.find((r) => r.error)?.error;
    if (provErr) { setSaveError(provErr.message); return; }

    const catResults = await Promise.all(categories.map((c) => {
      const d = catDrafts[c.id];
      return supabase.from("menu_categories").update({
        vat_rate: d?.vat ? parseFloat(d.vat) || 0 : null,
        target_food_cost_percent: d?.food ? parseFloat(d.food) || 0 : null,
        course_no: d?.course ? parseInt(d.course, 10) || null : null,
      }).eq("id", c.id);
    }));
    const catErr = catResults.find((r) => r.error)?.error;
    if (catErr) { setSaveError(catErr.message); return; }

    const { data: pd } = await supabase.rpc("personal_data_status", { p_restaurant: restaurantId });
    setPdStatus(((pd as PersonalDataStatus[]) ?? [])[0] ?? null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await load();
  };

  // Geri alınamaz: süresi dolmuş kayıtlarda isim/telefon silinir, satır istatistik için kalır.
  const anonymizeNow = async () => {
    if (!restaurantId) return;
    setAnonBusy(true); setAnonDone(null); setSaveError(null);
    const { data, error } = await supabase.rpc("anonymize_expired_personal_data", { p_restaurant: restaurantId });
    if (error) { setSaveError(error.message); setAnonBusy(false); return; }
    setAnonDone(Number(data ?? 0));
    const { data: pd } = await supabase.rpc("personal_data_status", { p_restaurant: restaurantId });
    setPdStatus(((pd as PersonalDataStatus[]) ?? [])[0] ?? null);
    setAnonBusy(false);
  };

  const flatCats = flatten(categories);

  return (
    <SayfaKabugu
      baslik="Ayarlar"
      kayan
      eylem={
        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {saved && <span style={{ fontSize: 12.5, color: "var(--success)" }}>Kaydedildi</span>}
          <button onClick={kaydet} disabled={!isletmeYuklendi} style={{ ...dugmeAnaSatir, opacity: isletmeYuklendi ? 1 : 0.5 }}>Kaydet</button>
        </span>
      }
    >
      {saveError && (
        <div style={{ maxWidth: 640, padding: "9px 12px", borderRadius: 10, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 12.5, marginBottom: 10 }}>
          Kaydedilemedi: {saveError}
        </div>
      )}
      <div style={{ maxWidth: 640 }}>
        <Akordiyon
          acik={acik}
          onAc={setAcik}
          bolumler={[
            {
              kod: "genel", ad: "Genel Ayarlar",
              icerik: (
                <GenelBolumu
                  settings={settings} setSettings={setSettings}
                  providers={providers} setProviders={setProviders}
                  provDrafts={provDrafts} setProvDrafts={setProvDrafts}
                />
              ),
            },
            {
              kod: "kategoriler", ad: "Kategoriler",
              icerik: (
                <KategoriBolumu
                  flatCats={flatCats} catDrafts={catDrafts} setCatDrafts={setCatDrafts}
                  defaultVat={settings.default_vat_rate}
                />
              ),
            },
            {
              kod: "isletme", ad: "İşletme Bilgileri",
              icerik: (
                <IsletmeBolumu
                  info={info} setInfo={setInfo}
                  hours={hours} setDay={setDay}
                  background={background} setBackground={setBackground}
                  kaydet={kaydet}
                />
              ),
            },
            {
              kod: "veri", ad: "Kişisel Veri (KVKK)",
              icerik: (
                <VeriBolumu
                  kvkkNotice={kvkkNotice} setKvkkNotice={setKvkkNotice}
                  kvkkDays={kvkkDays} setKvkkDays={setKvkkDays}
                  pdStatus={pdStatus} anonBusy={anonBusy} anonDone={anonDone}
                  anonymizeNow={anonymizeNow} kaydet={kaydet}
                />
              ),
            },
          ]}
        />
      </div>
    </SayfaKabugu>
  );
}
