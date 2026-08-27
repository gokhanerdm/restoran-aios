"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { girisYoluKaydet } from "@/lib/girisYolu";
import { kutu, dugmeAna } from "@/lib/olcu";

// Yeni işletme kaydı + giriş (ROADMAP L — "işletme beyni" simülasyonunun ilk adımı).
// E-posta doğrulama şu an AÇIK: kayıt olunca auth.users satırı hemen oluşur (bootstrap RPC
// hemen çağrılır), ama giriş için önce e-postadaki linke tıklanması gerekiyor.

const errMap: Record<string, string> = {
  invalid_credentials: "E-posta veya şifre hatalı.",
  email_not_confirmed: "E-postanı henüz onaylamamışsın — gelen kutunu kontrol et.",
  user_already_exists: "Bu e-posta ile zaten bir hesap var, giriş yapmayı dene.",
};

export default function GirisPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"giris" | "kayit">("kayit");
  const [restaurantName, setRestaurantName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);

  const friendlyErr = (code: string | undefined, fallback: string) => (code && errMap[code]) || fallback;

  const submitKayit = async () => {
    if (busy) return;
    if (!restaurantName.trim() || !fullName.trim() || !email.trim() || password.length < 6) {
      setErr("İşletme adı, ad soyad, e-posta ve en az 6 haneli şifre gerekli.");
      return;
    }
    setBusy(true); setErr(null); setConfirmMsg(null);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) { setBusy(false); setErr(friendlyErr(error.code, error.message)); return; }
    if (!data.user) { setBusy(false); setErr("Hesap oluşturulamadı."); return; }

    const { error: bootErr } = await supabase.rpc("bootstrap_restaurant_account", {
      p_user_id: data.user.id,
      p_restaurant_name: restaurantName.trim(),
      p_full_name: fullName.trim(),
    });
    setBusy(false);
    if (bootErr) { setErr(`İşletme kaydı oluşturulamadı: ${bootErr.message}`); return; }

    if (data.session) { girisYoluKaydet("giris"); router.push("/ana-sayfa"); return; }
    setConfirmMsg(`${email.trim()} adresine bir onay linki gönderdik. Linke tıkladıktan sonra buradan giriş yapabilirsin.`);
    setMode("giris");
  };

  const submitGiris = async () => {
    if (busy) return;
    if (!email.trim() || !password) { setErr("E-posta ve şifre gerekli."); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) { setErr(friendlyErr(error.code, error.message)); return; }
    // Çıkışta bu kapıya dönülsün (lib/girisYolu.ts).
    girisYoluKaydet("giris");
    router.push("/ana-sayfa");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--canvas)" }}>
      <div style={{ width: "min(380px, 92vw)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 20, padding: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: "var(--ink-green)", letterSpacing: "-0.4px", marginBottom: 4 }}>Restoran AIOS</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>{mode === "kayit" ? "Yeni işletme kaydı" : "Giriş yap"}</div>

        <div style={{ display: "flex", gap: 6, background: "var(--recede)", padding: 3, borderRadius: 980, marginBottom: 18 }}>
          {(["kayit", "giris"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setErr(null); }} style={{
              flex: 1, fontSize: 13, padding: "8px 0", borderRadius: 980, border: "none",
              background: mode === m ? "var(--ink-green)" : "transparent",
              color: mode === m ? "#fff" : "var(--muted)",
            }}>
              {m === "kayit" ? "Hesap oluştur" : "Giriş yap"}
            </button>
          ))}
        </div>

        {confirmMsg && <div style={{ marginBottom: 14, padding: "10px 13px", borderRadius: 10, background: "var(--info-bg)", color: "var(--info)", fontSize: 13 }}>{confirmMsg}</div>}
        {err && <div style={{ marginBottom: 14, padding: "10px 13px", borderRadius: 10, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13 }}>{err}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {mode === "kayit" && (
            <>
              <input value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} placeholder="İşletme adı" style={inp} />
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Ad Soyad" style={inp} />
            </>
          )}
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-posta" style={inp} />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Şifre" style={inp}
            onKeyDown={(e) => e.key === "Enter" && (mode === "kayit" ? submitKayit() : submitGiris())} />
          <button onClick={mode === "kayit" ? submitKayit : submitGiris} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1, marginTop: 6 }}>
            {busy ? "…" : mode === "kayit" ? "Hesap oluştur" : "Giriş yap"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Ölçüler ölçü merkezinden (lib/olcu.ts).
const inp: React.CSSProperties = kutu;
const btnPrimary: React.CSSProperties = { ...dugmeAna, width: "100%" };
