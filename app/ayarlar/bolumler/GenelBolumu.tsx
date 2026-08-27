"use client";

// Ayarlar — Genel Ayarlar bölümü: varsayılanlar, rol görünürlüğü, satın alma onayı,
// masa akışı, servis sırası, karşılama dönemi, bildirimler, bahşiş, ödeme sağlayıcıları.
// State sayfada durur (tek Kaydet hepsini birlikte yazar); burası sadece çizer.

import { kutu, kutuDar, etiket } from "@/lib/olcu";

export type RoleVisibility = { garson?: { cost_visible?: boolean }; sef?: { cost_visible?: boolean } };
export type Settings = {
  default_vat_rate: number;
  default_menu_design: string;
  default_variable_cost_per_cover: number;
  default_fixed_cost_share_percent: number;
  role_visibility: RoleVisibility;
  staff_comparison_enabled: boolean;
  purchase_approval_roles: string[];
  // Masa durumu zinciri (ROADMAP §O1). basit: hesap kapanınca masa direkt boş.
  // garson_takipli: toplanacak->hazır, karşılama yok. karsilamali: tam zincir.
  table_flow_mode: "basit" | "garson_takipli" | "karsilamali";
  // Bahşiş puan-saat dağıtımı (ROADMAP §O12). Rol -> puan haritası; mutfak yüzdesi
  // önce ayrılır, kalan salon rollerine puan×saat oranıyla dağılır.
  tip_points: Record<string, number>;
  kitchen_tip_percent: number;
  // Servis sırası (ROADMAP §O5). Kapalıyken kategorilere course_no atansa bile hiçbir
  // etkisi olmaz — dönerci/basit modu tamamen etkilenmez.
  course_sequencing_enabled: boolean;
  // Karşılama'nın kapasite/Yedek hesabı bu saatten önceki/sonraki rezervasyonları ayrı
  // dönem sayar (ROADMAP §O2 — "gün olarak değil dönem olarak takip edeceğiz").
  evening_start_hour: number;
  // Rezervasyon SMS/WhatsApp bildirimleri — kanal 'kapali' olduğu sürece send-reservation-
  // notification Edge Function'ı hiçbir şey göndermez (Gökhan: "sağlayıcılara bağlanacakmışın
  // gibi devam et, sonrasına bakarız" — boru hattı hazır, sağlayıcı seçilince tamamlanacak).
  notif_channel: "kapali" | "sms" | "whatsapp";
  notif_onay: boolean;
  notif_hatirlatma: boolean;
};

export type Provider = { id: string; name: string; method: string; commission_rate: number; settlement_days: number; is_default: boolean; is_active: boolean };
const METHOD_LABEL: Record<string, string> = { kart: "Kart", yemek_karti: "Yemek kartı" };

// Personel ekranındaki ROLES ile aynı liste — bahşiş puanı da rol bazında tanımlanıyor.
const TIP_ROLES: { v: string; l: string }[] = [
  { v: "garson", l: "Garson" },
  { v: "mutfak", l: "Mutfak" },
  { v: "bar", l: "Bar" },
  { v: "kasa", l: "Kasa" },
  { v: "sef", l: "Şef" },
  { v: "yonetici", l: "Yönetici" },
  { v: "karsilama", l: "Karşılama" },
  { v: "vale", l: "Vale" },
  { v: "bulasik", l: "Bulaşık" },
];

// app/personel/page.tsx'teki ROLES ile aynı liste/etiketler — satın alma onay rolü seçimi için.
const PURCHASE_ROLES: { v: string; l: string }[] = TIP_ROLES;

const TABLE_FLOW_MODES: { v: Settings["table_flow_mode"]; l: string; d: string }[] = [
  { v: "basit", l: "Basit", d: "Hesap kapanınca masa direkt boşalır. Hızlı işleyen yerler için." },
  { v: "garson_takipli", l: "Garson takipli", d: "Kasa onaylayınca masa \"toplanacak\" olur; garson temizleyip \"hazır\" der. Karşılama yok." },
  { v: "karsilamali", l: "Karşılamalı", d: "Tam zincir: toplanacak → hazır → karşılama sadece hazır masaları görüp müşteriyi oturtur." },
];

const araBaslik: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "var(--ink-green)", marginTop: 16, marginBottom: 8 };
const secenek: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, marginBottom: 8, cursor: "pointer" };

export default function GenelBolumu({
  settings, setSettings, providers, setProviders, provDrafts, setProvDrafts,
}: {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  providers: Provider[];
  setProviders: React.Dispatch<React.SetStateAction<Provider[]>>;
  provDrafts: Record<string, { rate: string; days: string }>;
  setProvDrafts: React.Dispatch<React.SetStateAction<Record<string, { rate: string; days: string }>>>;
}) {
  const toggleRole = (role: "garson" | "sef") => {
    setSettings((s) => ({
      ...s,
      role_visibility: {
        ...s.role_visibility,
        [role]: { cost_visible: !s.role_visibility?.[role]?.cost_visible },
      },
    }));
  };

  const togglePurchaseApprovalRole = (role: string) => {
    setSettings((s) => ({
      ...s,
      purchase_approval_roles: s.purchase_approval_roles.includes(role)
        ? s.purchase_approval_roles.filter((r) => r !== role)
        : [...s.purchase_approval_roles, role],
    }));
  };

  return (
    <div>
      <label style={{ ...etiket, display: "block", marginBottom: 4 }}>Varsayılan KDV oranı %</label>
      <input value={String(settings.default_vat_rate)} onChange={(e) => setSettings((s) => ({ ...s, default_vat_rate: parseFloat(e.target.value) || 0 }))} inputMode="decimal" style={{ ...kutu, marginBottom: 12 }} />

      <label style={{ ...etiket, display: "block", marginBottom: 4 }}>Varsayılan müşteri menüsü tasarımı</label>
      <select value={settings.default_menu_design} onChange={(e) => setSettings((s) => ({ ...s, default_menu_design: e.target.value }))} style={{ ...kutu, marginBottom: 12 }}>
        <option value="listeli">Listeli (sade)</option>
        <option value="fotografli">Fotoğraflı</option>
      </select>

      <label style={{ ...etiket, display: "block", marginBottom: 4 }}>Varsayılan sarf maliyeti (kişi başı ₺)</label>
      <input value={String(settings.default_variable_cost_per_cover)} onChange={(e) => setSettings((s) => ({ ...s, default_variable_cost_per_cover: parseFloat(e.target.value) || 0 }))} inputMode="decimal" style={{ ...kutu, marginBottom: 12 }} />

      <label style={{ ...etiket, display: "block", marginBottom: 4 }}>Varsayılan sabit gider payı (satış tutarının yüzdesi)</label>
      <input value={String(settings.default_fixed_cost_share_percent)} onChange={(e) => setSettings((s) => ({ ...s, default_fixed_cost_share_percent: parseFloat(e.target.value) || 0 }))} inputMode="decimal" style={{ ...kutu, marginBottom: 4 }} />

      <div style={araBaslik}>Rol bazlı görünürlük</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Maliyet/kârlılık personele varsayılan kapalıdır. Buradan açabilirsin.</div>
      <label style={secenek}>
        <input type="checkbox" checked={!!settings.role_visibility?.garson?.cost_visible} onChange={() => toggleRole("garson")} /> Garson maliyet/kârlılık görsün
      </label>
      <label style={secenek}>
        <input type="checkbox" checked={!!settings.role_visibility?.sef?.cost_visible} onChange={() => toggleRole("sef")} /> Şef maliyet/kârlılık görsün
      </label>

      <div style={araBaslik}>Personel karşılaştırması</div>
      <label style={secenek}>
        <input type="checkbox" checked={settings.staff_comparison_enabled} onChange={() => setSettings((s) => ({ ...s, staff_comparison_enabled: !s.staff_comparison_enabled }))} /> Garsonlar birbirinin satış yüzdesini görsün
      </label>
      <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginBottom: 8 }}>Kapalıyken herkes sadece kendi profilindeki rakamları görür, kimse başkasıyla kıyaslanmaz.</div>

      <div style={araBaslik}>Satın Alma Onayı</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Hangi roller Stok sayfasındaki sipariş önerisini onaylayabilir.</div>
      {PURCHASE_ROLES.map((r) => (
        <label key={r.v} style={secenek}>
          <input type="checkbox" checked={settings.purchase_approval_roles.includes(r.v)} onChange={() => togglePurchaseApprovalRole(r.v)} /> {r.l}
        </label>
      ))}
      <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginBottom: 8, lineHeight: 1.6 }}>Şu an bu, Stok sayfasına erişebilen herkes için geçerli — personel PIN girişine bağlı değil, ileride oraya taşınabilir.</div>

      {/* Masa durumu zinciri (ROADMAP §O1) — hesap kapandıktan sonra masanın nasıl
          boşaldığını belirler. Kasa onayı kuralı (§O11) modu ne olursa olsun geçerlidir;
          burada değişen sadece kasa onayından SONRA masanın nereye düştüğü. */}
      <div style={araBaslik}>Masa akışı</div>
      {TABLE_FLOW_MODES.map((m) => (
        <label key={m.v} style={{ ...secenek, alignItems: "flex-start" }}>
          <input type="radio" name="table_flow_mode" checked={settings.table_flow_mode === m.v} onChange={() => setSettings((s) => ({ ...s, table_flow_mode: m.v }))} style={{ marginTop: 3 }} />
          <span>
            <span style={{ display: "block", color: "var(--ink)" }}>{m.l}</span>
            <span style={{ display: "block", fontSize: 11.5, color: "var(--muted-2)", lineHeight: 1.5 }}>{m.d}</span>
          </span>
        </label>
      ))}

      {/* Servis sırası (ROADMAP §O5) — komple kapatılabilir (dönerci modu). Kapalıyken
          kategorilerdeki servis numarası ayarlanmış olsa bile garson ekranı hiç etkilenmez. */}
      <div style={araBaslik}>Servis sırası</div>
      <label style={secenek}>
        <input type="checkbox" checked={settings.course_sequencing_enabled} onChange={() => setSettings((s) => ({ ...s, course_sequencing_enabled: !s.course_sequencing_enabled }))} /> Ana yemek / tatlı garsonun ayrı butonuyla gönderilsin
      </label>
      <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginBottom: 8, lineHeight: 1.6 }}>
        Açıkken solda &quot;Servis #&quot; ataması yapılmış kategoriler (Ana, Tatlı gibi) adisyona
        eklenince otomatik gönderilmez — garson masa ekranında ayrı bir &quot;X gönder&quot; butonuna
        basana kadar mutfağa düşmez. Başlangıç (servis 1) ve servis numarası olmayan
        kategoriler (içecekler) her zaman olduğu gibi normal Gönder ile anında gider.
      </div>

      {/* Karşılama'nın kapasite/Yedek hesabı — gün tek havuz değil, öğle/akşam diye iki
          ayrı dönem sayılır (Gökhan: "akşam 17 sonrası bir dönem, öncesi bir dönem"). */}
      <div style={araBaslik}>Karşılama — akşam dönemi</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13.5 }}>Akşam dönemi şu saatte başlar:</span>
        <input
          value={String(settings.evening_start_hour)}
          onChange={(e) => setSettings((s) => ({ ...s, evening_start_hour: Math.max(0, Math.min(23, parseInt(e.target.value.replace(/\D/g, ""), 10) || 0)) }))}
          inputMode="numeric" className="tnum" style={{ ...kutuDar, width: 50, textAlign: "right" }}
        />
        <span style={{ fontSize: 13.5 }}>:00</span>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginBottom: 8, lineHeight: 1.6 }}>
        Karşılama&apos;daki kapasite/&quot;Yedek&quot; hesabı günü tek havuzda değil, bu saatten önceki
        (öğle) ve sonraki (akşam) diye iki ayrı dönemde sayar — öğlenin dolu olması akşamı
        &quot;dolu&quot; göstermesin diye.
      </div>

      {/* Rezervasyon SMS/WhatsApp bildirimleri — boru hattı hazır (ayar kontrolü, tetikleme
          noktaları), sadece sağlayıcı (Netgsm/İleti Merkezi/WhatsApp Business API) eksik.
          Kanal seçilip API anahtarı Edge Function'a eklenene kadar hiçbir mesaj gitmez. */}
      <div style={araBaslik}>Rezervasyon bildirimleri</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13.5 }}>Kanal:</span>
        <select
          value={settings.notif_channel}
          onChange={(e) => setSettings((s) => ({ ...s, notif_channel: e.target.value as Settings["notif_channel"] }))}
          style={{ ...kutuDar, width: 160 }}
        >
          <option value="kapali">Kapalı</option>
          <option value="sms">SMS</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
      </div>
      <label style={{ ...secenek, marginBottom: 6 }}>
        <input type="checkbox" checked={settings.notif_onay} onChange={() => setSettings((s) => ({ ...s, notif_onay: !s.notif_onay }))} /> Rezervasyon alınınca onay mesajı
      </label>
      <label style={secenek}>
        <input type="checkbox" checked={settings.notif_hatirlatma} onChange={() => setSettings((s) => ({ ...s, notif_hatirlatma: !s.notif_hatirlatma }))} /> Geliş saatinden önce hatırlatma
      </label>
      <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginBottom: 8, lineHeight: 1.6 }}>
        Kanal &quot;Kapalı&quot; olduğu sürece hiçbir mesaj gönderilmez. SMS/WhatsApp seçince de,
        gerçek gönderim için bir sağlayıcı hesabı (Netgsm, İleti Merkezi, WhatsApp Business
        API gibi) bağlanması gerekiyor — o bağlanana kadar sistem mesajı &quot;gönderilemedi,
        sağlayıcı bağlı değil&quot; diye kaydeder, hata vermez.
      </div>

      {/* Bahşiş puan-saat dağıtımı (ROADMAP §O12). Boş bırakılan rol 0 puan sayılır,
          pay almaz — özellik varsayılan kapalı gibi çalışır, puan girilmeden hiçbir
          dağıtım yapılmaz. */}
      <div style={{ ...araBaslik, marginBottom: 6 }}>Bahşiş dağıtımı</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, lineHeight: 1.6 }}>
        Günlük bahşiş, o gün çalışanların puan × çalışma saatine göre bölünür. Rol puanı
        boş bırakılırsa o rol pay almaz.
      </div>
      <label style={{ ...etiket, display: "block", marginBottom: 4 }}>Mutfak payı (toplam bahşişin yüzdesi)</label>
      <input
        value={String(settings.kitchen_tip_percent)}
        onChange={(e) => setSettings((s) => ({ ...s, kitchen_tip_percent: Math.max(0, Math.min(100, parseFloat(e.target.value.replace(",", ".")) || 0)) }))}
        inputMode="decimal" className="tnum" style={{ ...kutu, marginBottom: 10 }}
      />
      <div style={{ display: "flex", fontSize: 11, color: "var(--muted-2)", padding: "0 0 5px", borderBottom: "1px solid var(--line)" }}>
        <span style={{ flex: 1 }}>Rol</span>
        <span style={{ width: 70, textAlign: "right" }}>Puan</span>
      </div>
      {TIP_ROLES.map((r) => (
        <div key={r.v} style={{ display: "flex", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13.5 }}>
          <span style={{ flex: 1, color: "var(--ink)" }}>{r.l}{r.v === "mutfak" && <span style={{ fontSize: 10.5, color: "var(--muted-2)", marginLeft: 6 }}>mutfak payından</span>}</span>
          <input
            value={settings.tip_points[r.v] != null ? String(settings.tip_points[r.v]) : ""}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d.]/g, "");
              setSettings((s) => {
                const next = { ...s.tip_points };
                if (v === "") delete next[r.v]; else next[r.v] = parseFloat(v) || 0;
                return { ...s, tip_points: next };
              });
            }}
            placeholder="—" inputMode="decimal" className="tnum" style={{ ...kutuDar, width: 70, textAlign: "right" }}
          />
        </div>
      ))}

      <div style={{ ...araBaslik, marginBottom: 6 }}>Kart ve yemek kartı sağlayıcıları</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, lineHeight: 1.6 }}>
        Komisyon oranı ve valör (paranın kaç gün sonra hesaba geçtiği). Kasa'daki &quot;Yoldaki para&quot;
        hesabı bu değerlerle yapılır — kendi sözleşmenize göre düzeltin.
      </div>
      <div style={{ display: "flex", fontSize: 11, color: "var(--muted-2)", padding: "0 0 5px", borderBottom: "1px solid var(--line)" }}>
        <span style={{ flex: 1.6 }}>Sağlayıcı</span>
        <span style={{ width: 62, textAlign: "right" }}>Kom. %</span>
        <span style={{ width: 58, textAlign: "right", marginLeft: 6 }}>Valör</span>
        <span style={{ width: 30, textAlign: "right" }} />
      </div>
      {providers.map((p) => (
        <div key={p.id} style={{ display: "flex", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: 13, opacity: p.is_active ? 1 : 0.45 }}>
          <span style={{ flex: 1.6, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {p.name}
            <span style={{ fontSize: 10.5, color: "var(--muted-2)", marginLeft: 5 }}>{METHOD_LABEL[p.method] ?? p.method}{p.is_default ? " · varsayılan" : ""}</span>
          </span>
          <input value={provDrafts[p.id]?.rate ?? ""} onChange={(e) => setProvDrafts((d) => ({ ...d, [p.id]: { ...d[p.id], rate: e.target.value } }))} inputMode="decimal" style={{ ...kutuDar, width: 62, textAlign: "right" }} />
          <input value={provDrafts[p.id]?.days ?? ""} onChange={(e) => setProvDrafts((d) => ({ ...d, [p.id]: { ...d[p.id], days: e.target.value } }))} inputMode="numeric" style={{ ...kutuDar, width: 58, marginLeft: 6, textAlign: "right" }} />
          <button
            onClick={() => setProviders((ps) => ps.map((x) => x.id === p.id ? { ...x, is_active: !x.is_active } : x))}
            title={p.is_active ? "Kullanılmıyor olarak işaretle" : "Tekrar kullan"}
            style={{ all: "unset", cursor: "pointer", width: 30, textAlign: "right", fontSize: 11.5, color: "var(--muted)" }}
          >{p.is_active ? "gizle" : "aç"}</button>
        </div>
      ))}
      <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 14, lineHeight: 1.6 }}>
        Restoran bilgisi, masa &amp; salon düzeni (Salonlar sayfasında) ve sabit giderlerin tam dökümü ileride buraya eklenecek.
      </div>
    </div>
  );
}
