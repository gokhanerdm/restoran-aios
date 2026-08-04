"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { toTitleTr } from "@/lib/text";

// REZERVASYON — kendi giriş/kayıt ekranı (Gökhan, 2026-08-04). AIOS'un /giris ekranıyla
// AYNI görsel dili (kart, pill toggle, input stilleri) kullanılıyor ama mekanizma tamamen
// ayrı: AIOS'un profiles/bootstrap_restaurant_account'ına hiç dokunmuyor, kendi
// bootstrap_reservation_account RPC'sini çağırıyor (bkz. lib/supabase/reservationAccount.ts).
//
// İşletme kendi kaydını burada açar (tek/çok şubeli), sonra aynı ekrandan şifresiyle girer.
// Girince /rezervasyon otomatik kendi restoranını bulur — linkte kod taşımaya gerek kalmaz.

type DayKey = "pzt" | "sal" | "car" | "per" | "cum" | "cmt" | "paz";
type DayHours = { acilis: string; kapanis: string; kapali: boolean };
type OpeningHours = Record<DayKey, DayHours>;

// Ayarlar ekranındaki DAYS ile aynı liste/anahtarlar — aynı opening_hours alanını
// paylaşıyorlar, kayıt sırasında burada kurulan saatler orada gün gün düzenlenebilir.
const DAYS: { k: DayKey; l: string }[] = [
  { k: "pzt", l: "Pzt" },
  { k: "sal", l: "Sal" },
  { k: "car", l: "Çar" },
  { k: "per", l: "Per" },
  { k: "cum", l: "Cum" },
  { k: "cmt", l: "Cmt" },
  { k: "paz", l: "Paz" },
];
const TUM_GUNLER = new Set<DayKey>(DAYS.map((d) => d.k));

const ISLETME_TURLERI = ["Restoran", "Kafe", "Kafeterya", "Pastane / Fırın", "Bar / Pub", "Gece kulübü", "Fast food", "Otel restoranı", "Diğer"];

// Kapanış saati açılıştan ÖNCEYSE gece yarısını geçmiş demektir — gece kulübü 23:00'te açılıp
// 04:00'te kapanabilir, meyhane 18:00'de açılıp 01:00'de kapanabilir; restoranın çoğu aynı gün
// açılıp kapanır. Ayrı bir "ertesi gün" kutucuğu YOK, saatlerden kendiliğinden çıkarılıyor.
const kapanisErtesiGun = (acilis: string, kapanis: string) => Boolean(acilis) && Boolean(kapanis) && kapanis < acilis;

// Güçlü parola standardı — kabul gören en yaygın kural: en az 8 karakter, bir büyük harf,
// bir küçük harf, bir rakam, bir sembol. Kayıt formunda canlı gösteriliyor (kutu yazarken
// değişir, bu bir "hatırlatma listesi"), giriş (login) tarafında zorlanmıyor — eski
// hesaplar farklı bir kuralla açılmış olabilir, login sadece şifreyi doğrular.
const SIFRE_KURALLARI: { label: string; test: (pw: string) => boolean }[] = [
  { label: "En az 8 karakter", test: (pw) => pw.length >= 8 },
  { label: "Büyük harf", test: (pw) => /[A-ZÇĞİÖŞÜ]/.test(pw) },
  { label: "Küçük harf", test: (pw) => /[a-zçğıöşü]/.test(pw) },
  { label: "Rakam", test: (pw) => /[0-9]/.test(pw) },
  { label: "Sembol (!, @, # gibi)", test: (pw) => /[^A-Za-zÇĞİÖŞÜçğıöşü0-9]/.test(pw) },
];

// "Güçlü şifre öner" — SIFRE_KURALLARI'ndaki her kuraldan en az bir karakter garanti edip
// geri kalanı rastgele dolduruyor, sonra karıştırıyor. Karıştırma harfleri okunabilir
// tutmak için karışık büyük/küçük I/O gibi harfler havuzdan çıkarıldı.
function gucluSifreOner(): string {
  const buyuk = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const kucuk = "abcdefghijkmnopqrstuvwxyz";
  const rakam = "23456789";
  const sembol = "!@#$%^&*-_=+?";
  const rastgele = (havuz: string) => havuz[Math.floor(Math.random() * havuz.length)];
  const karakterler = [rastgele(buyuk), rastgele(kucuk), rastgele(rakam), rastgele(sembol)];
  const tumHavuz = buyuk + kucuk + rakam + sembol;
  while (karakterler.length < 12) karakterler.push(rastgele(tumHavuz));
  for (let i = karakterler.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [karakterler[i], karakterler[j]] = [karakterler[j], karakterler[i]];
  }
  return karakterler.join("");
}

const errMap: Record<string, string> = {
  invalid_credentials: "E-posta veya şifre hatalı.",
  email_not_confirmed: "E-postanı henüz onaylamamışsın — gelen kutunu kontrol et.",
  user_already_exists: "Bu e-posta ile zaten bir hesap var, giriş yapmayı dene.",
};

// Seçili günlere aynı açılış/kapanış saatini uygulayan tek bir OpeningHours üretir —
// kayıt ekranı basit tutuluyor, gün gün farklı saat girmek Ayarlar'ın işi.
function buildOpeningHours(acikGunler: Set<DayKey>, acilis: string, kapanis: string): OpeningHours {
  const out = {} as OpeningHours;
  for (const d of DAYS) {
    out[d.k] = acikGunler.has(d.k) ? { acilis, kapanis, kapali: false } : { acilis, kapanis, kapali: true };
  }
  return out;
}

export default function RezervasyonGirisPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"kayit" | "giris">("giris");
  const [subeTipi, setSubeTipi] = useState<"tek" | "cok">("tek");

  // Hesap
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);

  // İşletme / marka
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [turAcik, setTurAcik] = useState(false);
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");

  // Şube (çok şubelide ayrı ad+telefon; tek şubelide işletme bilgisiyle aynı)
  const [branchName, setBranchName] = useState("");
  const [branchPhone, setBranchPhone] = useState("");
  const [il, setIl] = useState("");
  const [ilce, setIlce] = useState("");
  const [address, setAddress] = useState("");
  const [acikGunler, setAcikGunler] = useState<Set<DayKey>>(new Set(TUM_GUNLER));
  const [acilis, setAcilis] = useState("09:00");
  const [kapanis, setKapanis] = useState("23:00");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);

  const friendlyErr = (code: string | undefined, fallback: string) => (code && errMap[code]) || fallback;

  // İsim/il/ilçe/adres gibi alanlar kutudan çıkınca (Tab, tıklayıp başka kutuya geçme,
  // Enter) kelime başı büyük harfe çevrilir — Gökhan: yazarken değil ama "kutuyu bitirir
  // bitirmez" görmek istiyor. Enter'da doğal blur olmadığı için Enter'ı blur'a bağlıyoruz.
  const onBlurTitle = (setter: (v: string) => void) => (e: React.FocusEvent<HTMLInputElement>) => setter(toTitleTr(e.target.value));
  const onEnterBlur = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") e.currentTarget.blur(); };

  const toggleGun = (k: DayKey) => setAcikGunler((s) => {
    const next = new Set(s);
    if (next.has(k)) next.delete(k); else next.add(k);
    return next;
  });

  const submitKayit = async () => {
    if (busy) return;
    if (!businessName.trim() || !contactName.trim() || !phone.trim() || !email.trim() || !password) {
      setErr(`${subeTipi === "cok" ? "Marka" : "İşletme"} adı, yetkili adı soyadı, telefon, e-posta ve şifre gerekli.`);
      return;
    }
    if (!SIFRE_KURALLARI.every((k) => k.test(password))) { setErr("Şifre, üstteki gereksinimlerin hepsini karşılamıyor."); return; }
    if (!businessType) { setErr("İşletme türünü seç."); return; }
    if (subeTipi === "cok" && !branchName.trim()) { setErr("Şube adı gerekli."); return; }
    if (!il.trim() || !ilce.trim() || !address.trim()) { setErr("İl, ilçe ve açık adres gerekli."); return; }
    if (acikGunler.size === 0) { setErr("En az bir çalışma günü seçmelisin."); return; }

    setBusy(true); setErr(null); setConfirmMsg(null);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) { setBusy(false); setErr(friendlyErr(error.code, error.message)); return; }
    if (!data.user) { setBusy(false); setErr("Hesap oluşturulamadı."); return; }

    const { error: bootErr } = await supabase.rpc("bootstrap_reservation_account", {
      p_user_id: data.user.id,
      p_kind: subeTipi,
      p_business_name: toTitleTr(businessName),
      p_business_type: businessType,
      p_contact_name: toTitleTr(contactName),
      p_phone: phone.trim(),
      p_email: email.trim(),
      p_branch_name: subeTipi === "cok" ? toTitleTr(branchName) : toTitleTr(businessName),
      p_branch_phone: subeTipi === "cok" ? (branchPhone.trim() || phone.trim()) : phone.trim(),
      p_il: toTitleTr(il),
      p_ilce: toTitleTr(ilce),
      p_address: toTitleTr(address),
      p_opening_hours: buildOpeningHours(acikGunler, acilis, kapanis),
    });
    setBusy(false);
    if (bootErr) { setErr(`İşletme kaydı oluşturulamadı: ${bootErr.message}`); return; }

    if (data.session) { router.push("/rezervasyon"); return; }
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
    router.push("/rezervasyon");
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--canvas)", padding: "40px 20px" }}>
      <div style={{ width: "min(460px, 94vw)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 20, padding: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: "var(--ink-green)", letterSpacing: "-0.4px", marginBottom: 4 }}>Rezervasyon</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>{mode === "kayit" ? "Yeni işletme kaydı" : "Giriş yap"}</div>

        <div style={{ display: "flex", gap: 6, background: "var(--recede)", padding: 3, borderRadius: 980, marginBottom: 18 }}>
          {(["giris", "kayit"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setErr(null); }} style={{
              flex: 1, fontSize: 13, padding: "8px 0", borderRadius: 980, border: "none", cursor: "pointer",
              background: mode === m ? "var(--ink-green)" : "transparent",
              color: mode === m ? "#fff" : "var(--muted)",
            }}>
              {m === "kayit" ? "Hesap oluştur" : "Giriş yap"}
            </button>
          ))}
        </div>

        {confirmMsg && <div style={{ marginBottom: 14, padding: "10px 13px", borderRadius: 10, background: "var(--info-bg)", color: "var(--info)", fontSize: 13 }}>{confirmMsg}</div>}
        {err && <div style={{ marginBottom: 14, padding: "10px 13px", borderRadius: 10, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13 }}>{err}</div>}

        {mode === "giris" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-posta" style={inp} />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Şifre" style={inp}
              onKeyDown={(e) => e.key === "Enter" && submitGiris()} />
            <button onClick={submitGiris} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1, marginTop: 6 }}>
              {busy ? "…" : "Giriş yap"}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Şube tipi — kayıt formunun en üstünde, aşağıdaki alanları belirler. */}
            <div style={{ display: "flex", gap: 6, background: "var(--recede)", padding: 3, borderRadius: 980, marginBottom: 4 }}>
              {(["tek", "cok"] as const).map((t) => (
                <button key={t} onClick={() => setSubeTipi(t)} style={{
                  flex: 1, fontSize: 12.5, padding: "7px 0", borderRadius: 980, border: "none", cursor: "pointer",
                  background: subeTipi === t ? "var(--brand-strong)" : "transparent",
                  color: subeTipi === t ? "#fff" : "var(--muted)",
                }}>
                  {t === "tek" ? "Tek şubeli işletme" : "Çok şubeli işletme"}
                </button>
              ))}
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-green)", marginTop: 6 }}>
              {subeTipi === "cok" ? "İşletme bilgileri" : "İşletme"}
            </div>
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} onBlur={onBlurTitle(setBusinessName)} onKeyDown={onEnterBlur} placeholder={subeTipi === "cok" ? "İşletme veya marka adı" : "İşletme adı"} style={inp} />

            {/* İşletme türü — native select yerine, aynı kutunun içinde aşağı doğru açılan
                kendi akordiyonumuz (Ayarlar'daki salon akordiyonuyla aynı dil). */}
            <div style={{ border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--card)", overflow: "hidden" }}>
              <button type="button" onClick={() => setTurAcik((v) => !v)} style={{
                all: "unset", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", padding: "11px 13px", boxSizing: "border-box", fontSize: 14,
              }}>
                <span style={{ color: businessType ? "var(--ink)" : "var(--muted-2)" }}>{businessType || "İşletme türü"}</span>
                <ChevronDown size={16} style={{ color: "var(--muted)", transform: turAcik ? "rotate(180deg)" : undefined, transition: "transform 0.15s", flexShrink: 0 }} />
              </button>
              {turAcik && (
                <div style={{ borderTop: "1px solid var(--line-2)" }}>
                  {ISLETME_TURLERI.map((t) => (
                    <button
                      key={t} type="button" onClick={() => { setBusinessType(t); setTurAcik(false); }}
                      style={{
                        all: "unset", cursor: "pointer", display: "block", width: "100%", padding: "9px 13px", boxSizing: "border-box",
                        fontSize: 13.5, color: businessType === t ? "var(--brand-strong)" : "var(--ink)",
                        background: businessType === t ? "var(--recede)" : "transparent",
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input value={contactName} onChange={(e) => setContactName(e.target.value)} onBlur={onBlurTitle(setContactName)} onKeyDown={onEnterBlur} placeholder="Yetkili adı soyadı" style={inp} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder={subeTipi === "cok" ? "Merkez telefon numarası" : "Telefon numarası"} style={inp} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder={subeTipi === "cok" ? "Merkez e-posta adresi" : "E-posta adresi"} style={inp} />
            <div style={{ position: "relative" }}>
              <input
                value={password} onChange={(e) => setPassword(e.target.value)}
                type={showPw ? "text" : "password"} placeholder="Şifre"
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
            {/* Gereksinim listesi — kutuya yazdıkça canlı güncellenir, karşılanan madde
                yeşile döner. Şifrenin kendisi hiçbir yere loglanmıyor, sadece burada. */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 12px", marginTop: -2 }}>
              {SIFRE_KURALLARI.map((k) => {
                const met = k.test(password);
                return (
                  <span key={k.label} style={{ fontSize: 11, color: met ? "var(--brand)" : "var(--muted-2)" }}>
                    {met ? "✓ " : ""}{k.label}
                  </span>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => { setPassword(gucluSifreOner()); setShowPw(true); }}
              style={{ all: "unset", cursor: "pointer", fontSize: 11.5, color: "var(--brand)", alignSelf: "flex-start" }}
            >
              Güçlü şifre öner
            </button>

            {subeTipi === "cok" && (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-green)", marginTop: 10 }}>Şube bilgileri</div>
                <input value={branchName} onChange={(e) => setBranchName(e.target.value)} onBlur={onBlurTitle(setBranchName)} onKeyDown={onEnterBlur} placeholder="Şube adı" style={inp} />
                <input value={branchPhone} onChange={(e) => setBranchPhone(e.target.value)} inputMode="tel" placeholder="Şube telefon numarası (opsiyonel)" style={inp} />
              </>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <input value={il} onChange={(e) => setIl(e.target.value)} onBlur={onBlurTitle(setIl)} onKeyDown={onEnterBlur} placeholder="İl" style={{ ...inp, flex: 1 }} />
              <input value={ilce} onChange={(e) => setIlce(e.target.value)} onBlur={onBlurTitle(setIlce)} onKeyDown={onEnterBlur} placeholder="İlçe" style={{ ...inp, flex: 1 }} />
            </div>
            <input value={address} onChange={(e) => setAddress(e.target.value)} onBlur={onBlurTitle(setAddress)} onKeyDown={onEnterBlur} placeholder="Açık adres" style={inp} />

            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-green)", marginTop: 10 }}>Çalışma günleri</div>
            <div style={{ display: "flex", gap: 5 }}>
              {DAYS.map((d) => {
                const acik = acikGunler.has(d.k);
                return (
                  <button key={d.k} onClick={() => toggleGun(d.k)} style={{
                    flex: 1, border: "1px solid var(--line-2)", borderRadius: 8, padding: "7px 0", fontSize: 12, cursor: "pointer",
                    background: acik ? "var(--brand-strong)" : "var(--card)",
                    color: acik ? "#fff" : "var(--muted)",
                  }}>
                    {d.l}
                  </button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="time" value={acilis} onChange={(e) => setAcilis(e.target.value)} style={{ ...inp, flex: 1 }} />
              <span style={{ fontSize: 13, color: "var(--muted)" }}>–</span>
              <input type="time" value={kapanis} onChange={(e) => setKapanis(e.target.value)} style={{ ...inp, flex: 1 }} />
            </div>
            {kapanisErtesiGun(acilis, kapanis) && (
              <div style={{ fontSize: 11.5, color: "var(--gold-text)" }}>Kapanış ertesi güne sarkıyor (ör. 23:00 – 04:00).</div>
            )}
            <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: -2, lineHeight: 1.5 }}>
              Kapalı günler ve farklı saatler kayıttan sonra Ayarlar&apos;dan gün gün düzenlenebilir.
            </div>

            <button onClick={submitKayit} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1, marginTop: 8 }}>
              {busy ? "…" : "Hesap oluştur"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "11px 13px", fontSize: 14, background: "var(--card)", color: "var(--ink)", outline: "none", width: "100%", boxSizing: "border-box" };
const btnPrimary: React.CSSProperties = { width: "100%", border: "none", borderRadius: 980, padding: 12, background: "var(--brand-strong)", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" };
