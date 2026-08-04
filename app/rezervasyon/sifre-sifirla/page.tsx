"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { SIFRE_KURALLARI, sifreGecerliMi, gucluSifreOner } from "@/lib/passwordPolicy";

// REZERVASYON > ŞİFRE SIFIRLA — /rezervasyon/giris'teki "Şifremi unuttum" linkinden
// gönderilen e-postadaki bağlantı buraya düşer (Gökhan, 2026-08-04). Supabase, linke
// tıklanınca tarayıcıda kısa ömürlü bir "recovery" oturumu açıyor; burada tek yapılan
// supabase.auth.updateUser({ password }) — yeni şifreyi bu geçici oturumla kaydediyoruz.
// Aynı şifre kuralı/gösterge/öneri butonu kayıt formuyla aynı (bkz. lib/passwordPolicy.ts).

export default function SifreSifirlaPage() {
  const router = useRouter();
  const [hazir, setHazir] = useState<boolean | null>(null); // null = kontrol ediliyor
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tamam, setTamam] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) setHazir(Boolean(session));
    });
    // Link tıklanır tıklanmaz recovery oturumu asenkron kurulabiliyor — SIGNED_IN/
    // PASSWORD_RECOVERY olayı gelirse de hazır say.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) setHazir(true);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);

  const kaydet = async () => {
    if (busy) return;
    if (!sifreGecerliMi(password)) { setErr("Şifre, üstteki gereksinimlerin hepsini karşılamıyor."); return; }
    if (password !== password2) { setErr("Şifreler birbiriyle uyuşmuyor."); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setTamam(true);
    setTimeout(() => router.replace("/rezervasyon"), 1500);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--canvas)", padding: "40px 20px" }}>
      <div style={{ width: "min(420px, 94vw)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 20, padding: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: "var(--ink-green)", letterSpacing: "-0.4px", marginBottom: 4 }}>Yeni şifre</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>Rezervasyon hesabın için yeni bir şifre belirle</div>

        {hazir === null && <div style={{ fontSize: 13, color: "var(--muted)" }}>Kontrol ediliyor…</div>}

        {hazir === false && (
          <div style={{ padding: "10px 13px", borderRadius: 10, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13, lineHeight: 1.6 }}>
            Bu link geçersiz ya da süresi dolmuş. Giriş ekranından &quot;Şifremi unuttum&quot;u tekrar dene.
          </div>
        )}

        {hazir === true && (
          tamam ? (
            <div style={{ padding: "10px 13px", borderRadius: 10, background: "var(--info-bg)", color: "var(--info)", fontSize: 13 }}>
              Şifren güncellendi, yönlendiriliyorsun…
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {err && <div style={{ padding: "10px 13px", borderRadius: 10, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13 }}>{err}</div>}

              <div style={{ position: "relative" }}>
                <input
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  type={showPw ? "text" : "password"} placeholder="Yeni şifre"
                  onKeyDown={(e) => e.key === "Enter" && kaydet()}
                  style={{ ...inp, paddingRight: 38 }}
                />
                <button
                  type="button" onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Şifreyi gizle" : "Şifreyi göster"}
                  style={{ all: "unset", cursor: "pointer", position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", display: "flex" }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", justifyContent: "center", gap: 7, marginTop: -2, overflowX: "auto" }}>
                {SIFRE_KURALLARI.map((k) => {
                  const met = k.test(password);
                  return (
                    <span key={k.label} style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0, whiteSpace: "nowrap" }}>
                      <span style={{ fontSize: 11, color: "var(--line-2)" }}>·</span>
                      <span style={{ fontSize: 10.5, color: met ? "var(--brand)" : "var(--muted-2)" }}>
                        {met ? "✓ " : ""}{k.label}
                      </span>
                    </span>
                  );
                })}
                <span style={{ fontSize: 11, color: "var(--line-2)", flexShrink: 0 }}>·</span>
                <button
                  type="button" onClick={() => { setPassword(gucluSifreOner()); setShowPw(true); }}
                  style={{ all: "unset", cursor: "pointer", fontSize: 10.5, color: "var(--brand)", flexShrink: 0, whiteSpace: "nowrap" }}
                >
                  Güçlü şifre öner
                </button>
              </div>

              <input
                value={password2} onChange={(e) => setPassword2(e.target.value)}
                type={showPw ? "text" : "password"} placeholder="Yeni şifre (tekrar)"
                onKeyDown={(e) => e.key === "Enter" && kaydet()}
                style={inp}
              />

              <button onClick={kaydet} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1, marginTop: 6 }}>
                {busy ? "…" : "Şifreyi kaydet"}
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "11px 13px", fontSize: 14, background: "var(--card)", color: "var(--ink)", outline: "none", width: "100%", boxSizing: "border-box" };
const btnPrimary: React.CSSProperties = { width: "100%", border: "none", borderRadius: 980, padding: 12, background: "var(--brand-strong)", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" };
