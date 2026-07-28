"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getStaffSession, setStaffSession, clearStaffSession, type StaffSession } from "@/lib/supabase/staffSession";

// Garson/Mutfak/Bar gibi girişsiz cihaz ekranlarını PIN ile kilitler. Kasa (PC) bu kapıdan
// geçmez — orası zaten gerçek sahip girişiyle korunuyor (Shell.tsx). Burada amaç "bu cihazda
// şu an hangi personel var" bilgisini yakalayıp işlemlere (sipariş gönder, hesap kapat)
// etiketlemek, gerçek bir yetkilendirme/güvenlik katmanı değil.
const StaffSessionContext = createContext<StaffSession | null>(null);
export const useStaffSession = () => useContext(StaffSessionContext);
// Çıkış fonksiyonu ayrı bir context'te — StaffProfileBadge (rozet+profil+çıkış) sabit/fixed
// bir katman olarak DEĞİL, her sayfanın kendi başlığının içine normal bir öğe olarak konur
// (aksi halde her yeni üst katmanla (menü, onay kutusu vb.) z-index çakışması çıkıyordu).
const StaffLogoutContext = createContext<(() => void) | null>(null);
const useStaffLogout = () => useContext(StaffLogoutContext);

export default function StaffLoginGate({
  restaurantId,
  roles,
  children,
}: {
  restaurantId: string | null;
  // Bu ekrana hangi roller girebilir (örn. garson ekranı: ["garson"], mutfak/bar ekranı: ["mutfak","bar"]).
  roles: string[];
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<StaffSession | null | undefined>(undefined); // undefined = henüz kontrol edilmedi
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const s = getStaffSession();
    setSession(s && roles.includes(s.role) ? s : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitPin = async () => {
    if (!restaurantId || !pin.trim()) return;
    setBusy(true); setErr(null);
    const { data, error } = await supabase.rpc("verify_staff_pin", { p_restaurant_id: restaurantId, p_pin: pin.trim() });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    const row = (data as { id: string; full_name: string; role: string }[] | null)?.[0];
    if (!row) { setErr("PIN hatalı."); setPin(""); return; }
    if (!roles.includes(row.role)) { setErr(`Bu ekran "${row.role}" rolüne kapalı.`); setPin(""); return; }
    const s: StaffSession = { id: row.id, full_name: row.full_name, role: row.role };
    setStaffSession(s);
    setSession(s);
    setPin("");
  };

  const logout = () => { clearStaffSession(); setSession(null); };

  if (session === undefined) return null; // localStorage kontrolü bitene kadar hiçbir şey gösterme (flaş olmasın)

  if (!session) {
    return (
      <div style={{ minHeight: "100dvh", background: "var(--canvas)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: "100%", maxWidth: 320, textAlign: "center" }}>
          <div style={{ fontSize: 20, fontWeight: 600, color: "var(--ink-green)", marginBottom: 6 }}>Giriş yap</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>PIN'ini gir</div>
          {err && <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 10, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13 }}>{err}</div>}
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && submitPin()}
            inputMode="numeric"
            type="password"
            autoFocus
            placeholder="••••"
            style={{ width: "100%", boxSizing: "border-box", textAlign: "center", letterSpacing: 8, fontSize: 24, padding: "14px 12px", borderRadius: 12, border: "1px solid var(--line-2)", background: "var(--card)", color: "var(--ink)", outline: "none", marginBottom: 14 }}
          />
          <button onClick={submitPin} disabled={busy || !pin.trim()} style={{ width: "100%", border: "none", borderRadius: 980, padding: 14, background: "var(--brand-strong)", color: "#fff", fontSize: 15, fontWeight: 500 }}>Giriş yap</button>
        </div>
      </div>
    );
  }

  return (
    <StaffSessionContext.Provider value={session}>
      <StaffLogoutContext.Provider value={logout}>
        {children}
      </StaffLogoutContext.Provider>
    </StaffSessionContext.Provider>
  );
}

type Summary = {
  full_name: string; role: string; own_sales: number; own_orders_served: number;
  own_items_prepared: number; comparison_enabled: boolean; sales_percent: number | null;
};
const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;

// Sayfanın kendi başlığının içine konacak rozet — isim + Profilim + Çıkış yap. Sabit/fixed değil,
// normal akışta bir öğe; her ekran (Siparişler, mutfak) kendi header'ında nereye koyacağına karar verir.
export function StaffProfileBadge({ restaurantId }: { restaurantId: string | null }) {
  const session = useStaffSession();
  const logout = useStaffLogout();
  const [showProfile, setShowProfile] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  // Mola (ROADMAP §O3, Gökhan'ın fikri): garson mola seçer, masaları "sahipsiz" (herkese
  // açık) sayılır. Oturum localStorage'da sabit olduğu için mola durumu ayrıca çekilir.
  const [onBreak, setOnBreak] = useState(false);
  const [breakBusy, setBreakBusy] = useState(false);

  useEffect(() => {
    if (!session) return;
    supabase.from("staff_members").select("on_break").eq("id", session.id).maybeSingle()
      .then(({ data }) => setOnBreak(Boolean((data as { on_break: boolean } | null)?.on_break)));
  }, [session]);

  if (!session) return null;

  const openProfile = async () => {
    setShowProfile(true);
    if (!restaurantId) return;
    const { data } = await supabase.rpc("staff_daily_summary", { p_restaurant_id: restaurantId, p_staff_id: session.id });
    setSummary((data as Summary[])?.[0] ?? null);
  };

  const toggleBreak = async () => {
    setBreakBusy(true);
    const { data, error } = await supabase.rpc("toggle_staff_break", { p_staff_id: session.id });
    if (!error) setOnBreak(Boolean(data));
    setBreakBusy(false);
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <button onClick={openProfile} style={{ border: "1px solid var(--line-2)", borderRadius: 980, padding: "5px 12px", background: "var(--card)", color: "var(--ink-green)", fontSize: 12, fontWeight: 600 }}>{session.full_name}</button>
        <button
          onClick={toggleBreak}
          disabled={breakBusy}
          title={onBreak ? "Moladan dön" : "Molaya çık"}
          style={{
            border: "1px solid var(--line-2)", borderRadius: 980, padding: "5px 12px", fontSize: 12, fontWeight: 600,
            background: onBreak ? "var(--gold)" : "var(--card)", color: onBreak ? "#3a2e10" : "var(--ink-green)",
            opacity: breakBusy ? 0.6 : 1,
          }}
        >{onBreak ? "Moladasın — dön" : "Mola"}</button>
        <button onClick={() => logout?.()} style={{ border: "1px solid var(--line-2)", borderRadius: 980, padding: "5px 12px", background: "var(--card)", color: "var(--ink-green)", fontSize: 12, fontWeight: 600 }}>Çıkış yap</button>
      </div>

      {showProfile && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setShowProfile(false)}>
          <div style={{ background: "var(--card)", borderRadius: 18, padding: 22, width: "100%", maxWidth: 340 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 600, color: "var(--ink-green)", marginBottom: 2 }}>{session.full_name}</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16 }}>Bugün</div>
            {!summary ? (
              <div style={{ color: "var(--muted-2)", fontSize: 13 }}>Yükleniyor…</div>
            ) : session.role === "garson" ? (
              <>
                <ProfileRow label="Bugünkü satışın" value={money(summary.own_sales)} strong />
                <ProfileRow label="Hizmet ettiğin masa sayısı" value={String(summary.own_orders_served)} />
                {summary.comparison_enabled && summary.sales_percent != null && (
                  <ProfileRow label="Garsonlar arası satış payın" value={`%${summary.sales_percent}`} />
                )}
              </>
            ) : (
              <ProfileRow label="Bugün hazırladığın ürün sayısı" value={String(summary.own_items_prepared)} strong />
            )}
            <button onClick={() => setShowProfile(false)} style={{ width: "100%", marginTop: 16, border: "1px solid var(--line-2)", borderRadius: 980, padding: 12, background: "var(--card)", color: "var(--ink-green)", fontSize: 14 }}>Kapat</button>
          </div>
        </div>
      )}
    </>
  );
}

function ProfileRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ fontSize: 13, color: "var(--muted)" }}>{label}</span>
      <span className="tnum" style={{ fontSize: strong ? 17 : 14, fontWeight: strong ? 700 : 500, color: strong ? "var(--brand)" : "var(--ink)" }}>{value}</span>
    </div>
  );
}
