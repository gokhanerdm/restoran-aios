"use client";

// Ayarlar — İşletme Bilgileri bölümü: kimlik bilgileri, çalışma saatleri, arka plan.
// State sayfada durur (tek Kaydet hepsini birlikte yazar); burası sadece çizer.

import { kutu, kutuDar, kutuCokSatir, etiket } from "@/lib/olcu";

export type RestaurantInfo = { name: string; address: string; phone: string; tax_office: string; tax_number: string };

export type DayKey = "pzt" | "sal" | "car" | "per" | "cum" | "cmt" | "paz";
export type DayHours = { acilis: string; kapanis: string; kapali: boolean };
export type OpeningHours = Record<DayKey, DayHours>;

export const DAYS: { k: DayKey; l: string }[] = [
  { k: "pzt", l: "Pazartesi" },
  { k: "sal", l: "Salı" },
  { k: "car", l: "Çarşamba" },
  { k: "per", l: "Perşembe" },
  { k: "cum", l: "Cuma" },
  { k: "cmt", l: "Cumartesi" },
  { k: "paz", l: "Pazar" },
];
export const DEFAULT_DAY: DayHours = { acilis: "09:00", kapanis: "23:00", kapali: false };

export const DEFAULT_BACKGROUND = "yesil_kupler";
const BACKGROUNDS: { v: string; l: string; d: string; sw: string }[] = [
  { v: "yesil_kupler", l: "Yeşil küpler", d: "Mevcut varsayılan — yeşil küp fotoğrafı", sw: "linear-gradient(135deg, var(--brand) 0%, var(--ink-green) 100%)" },
  { v: "duz_renk", l: "Düz renk", d: "Fotoğrafsız, sade krem zemin", sw: "var(--canvas)" },
  { v: "koyu", l: "Koyu", d: "Koyu zemin — akşam servisinde göz yormaz", sw: "var(--ink-green)" },
];

const araBaslik: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "var(--ink-green)", marginBottom: 8 };

export default function IsletmeBolumu({
  info, setInfo, hours, setDay, background, setBackground, kaydet,
}: {
  info: RestaurantInfo;
  setInfo: (i: RestaurantInfo) => void;
  hours: OpeningHours;
  setDay: (k: DayKey, patch: Partial<DayHours>) => void;
  background: string;
  setBackground: (v: string) => void;
  kaydet: () => void;
}) {
  return (
    <div>
      <div style={araBaslik}>İşletme bilgileri</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Fiş ve fatura basımında bu bilgiler kullanılacak.</div>

      <label style={{ ...etiket, display: "block", marginBottom: 4 }}>İşletme adı</label>
      <input value={info.name} onChange={(e) => setInfo({ ...info, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && kaydet()} placeholder="Örn. Kayen Restoran" style={{ ...kutu, marginBottom: 12 }} />

      <label style={{ ...etiket, display: "block", marginBottom: 4 }}>Adres</label>
      <textarea value={info.address} onChange={(e) => setInfo({ ...info, address: e.target.value })} rows={2} placeholder="Mahalle, cadde, no — ilçe / il" style={{ ...kutuCokSatir, marginBottom: 12, lineHeight: 1.5 }} />

      <label style={{ ...etiket, display: "block", marginBottom: 4 }}>Telefon</label>
      <input value={info.phone} onChange={(e) => setInfo({ ...info, phone: e.target.value })} onKeyDown={(e) => e.key === "Enter" && kaydet()} inputMode="tel" placeholder="0212 000 00 00" className="tnum" style={{ ...kutu, marginBottom: 12 }} />

      <label style={{ ...etiket, display: "block", marginBottom: 4 }}>Vergi dairesi</label>
      <input value={info.tax_office} onChange={(e) => setInfo({ ...info, tax_office: e.target.value })} onKeyDown={(e) => e.key === "Enter" && kaydet()} placeholder="Örn. Beşiktaş" style={{ ...kutu, marginBottom: 12 }} />

      <label style={{ ...etiket, display: "block", marginBottom: 4 }}>Vergi numarası</label>
      <input value={info.tax_number} onChange={(e) => setInfo({ ...info, tax_number: e.target.value })} onKeyDown={(e) => e.key === "Enter" && kaydet()} inputMode="numeric" placeholder="10 haneli VKN veya TCKN" className="tnum" style={{ ...kutu, marginBottom: 18 }} />

      <div style={araBaslik}>Çalışma saatleri</div>
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
            <input type="time" value={h.acilis} disabled={h.kapali} onChange={(e) => setDay(d.k, { acilis: e.target.value })} className="tnum" style={{ ...kutuDar, width: 92, textAlign: "center", opacity: h.kapali ? 0.4 : 1 }} />
            <input type="time" value={h.kapanis} disabled={h.kapali} onChange={(e) => setDay(d.k, { kapanis: e.target.value })} className="tnum" style={{ ...kutuDar, width: 92, marginLeft: 6, textAlign: "center", opacity: h.kapali ? 0.4 : 1 }} />
            <span style={{ width: 46, textAlign: "center" }}>
              <input type="checkbox" checked={h.kapali} onChange={() => setDay(d.k, { kapali: !h.kapali })} style={{ cursor: "pointer" }} />
            </span>
          </div>
        );
      })}
      <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 8, marginBottom: 18 }}>Gece yarısını geçen kapanış için kapanış saatini olduğu gibi yaz (örn. 02:00).</div>

      <div style={araBaslik}>Arka plan</div>
      {BACKGROUNDS.map((b) => {
        const sel = background === b.v;
        return (
          <div key={b.v} onClick={() => setBackground(b.v)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line)", cursor: "pointer" }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: b.sw, border: "1px solid var(--line-2)", flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 13.5, color: "var(--ink)", fontWeight: sel ? 600 : 400 }}>{b.l}</span>
              <span style={{ display: "block", fontSize: 11.5, color: "var(--muted-2)" }}>{b.d}</span>
            </span>
            <span style={{ width: 16, height: 16, borderRadius: 980, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${sel ? "var(--brand-strong)" : "var(--line-2)"}`, background: sel ? "var(--brand-strong)" : "transparent" }}>
              {sel && <span style={{ width: 6, height: 6, borderRadius: 980, background: "#fff" }} />}
            </span>
          </div>
        );
      })}
      <div style={{ fontSize: 11.5, color: "var(--muted-2)", marginTop: 8, lineHeight: 1.6 }}>Şimdilik sadece tercihin kaydedilir; ekranın gerçekten bu arka plana geçmesi ayrı bir adımda devreye alınacak.</div>
    </div>
  );
}
