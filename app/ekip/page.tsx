"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { gecicSifre } from "@/lib/gecicSifre";
import { toTitleTr } from "@/lib/text";
import { Eye } from "lucide-react";

// EKİP — personel uygulaması (Gökhan, 2026-08-16). Uygulamanın adı bu; mağazaya bu adla
// çıkacak. Yapısı "kabuk": personeli tanır, işletmeye bağlar, doğru paneli açar.
//
// "Kabuk olarak başlayalım... şu an AIOS'un içinde dursun, RZV gibi ayrı takılsın."
//
// Bu, mağazaya çıkacak ortak personel uygulamasının giriş katı. Kendi adresi (/ekip), kendi
// girişi, kendi hesabı var; programın geri kalanına bağlı değil — sökülüp ayrı uygulamaya
// taşınacak şekilde duruyor.
//
// KABUK NE YAPAR: personeli tanır, kodla işletmeye bağlar, sonra o işletmenin programındaki
// doğru paneli açar. Panellerin kendisi programların içinde kalır; yeni bir program
// eklendiğinde bu kabuğa dokunulmaz, sadece kodun nereye götüreceği eklenir.
//
// ŞAHIS ÜYELİĞİ (Gökhan, 2026-08-16).
//
// "Personel işletme adına girmeyecek, şahıs üyeliği yapacak... personel bu programı bizim
// programımızın olduğu hangi işletmede işe başlarsa kullanabilecek."
//
// AKIŞ:
//   1) KAYIT   — ad soyad, e-posta, şifre, KVKK onayı. Hesap personelin kendisinin.
//   2) GİRİŞ   — e-posta + şifre.
//   3) KOD     — içeri girince kod paneli çıkar. İşletmenin verdiği kodu yazar.
//   4) PANEL   — bağ kurulduktan sonra hep o işletmenin ekranına, yetkisi dahilinde düşer.
//
// GEÇİCİ KOLAYLIK (Gökhan, 2026-08-16: "giriş için sadece mail isteyen yere maili yazmak
// yeterli olsun şimdilik, sık sık gir çık olabiliyor"): şifre boş bırakılırsa program şifre
// sormadan içeri alıyor. Bu SADECE geliştirme/demo içindir; yayına çıkmadan kapatılacak.
//
// Onaysız hesap hiçbir veri göremez — kilit erisilen_restoranlar'da, sadece durum='onayli'
// olan bağ işletmeyi açıyor.

type Rolum = { restaurant_id: string; isletme_adi: string; rol: string; durum: string; ad_soyad: string };

const ROL_ADI: Record<string, string> = {
  garson: "Garson",
  salon_sefi: "Salon şefi",
  mutfak: "Mutfak şefi",
  karsilama: "Karşılama",
  pr: "PR",
  yonetici: "Yönetici",
};
const ROL_ADRESI: Record<string, string> = {
  garson: "/rezervasyon/garson",
  salon_sefi: "/rezervasyon/sef",
  mutfak: "/rezervasyon",
  karsilama: "/rezervasyon",
  pr: "/rezervasyon/pr",
  yonetici: "/rezervasyon",
};

// Şifresiz giriş açıkken kullanıcının yazdığı e-posta cihazda tutuluyor — kod panelinde
// adını hazır getirmek için.
const SON_EPOSTA = "rzv-personel-eposta";

// Geçici şifre tek yerde: lib/gecicSifre.ts (rezervasyon girişi de aynısını kullanıyor).

export default function PersonelUyelik() {
  const router = useRouter();
  const [asama, setAsama] = useState<"yukleniyor" | "giris" | "kayit" | "kod" | "durum">("yukleniyor");
  const [rolum, setRolum] = useState<Rolum | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [bilgi, setBilgi] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [eposta, setEposta] = useState("");
  const [ad, setAd] = useState("");
  const [telefon, setTelefon] = useState("");
  const [kvkk, setKvkk] = useState(false);
  const [kod, setKod] = useState("");

  const durumuOku = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setAsama("giris"); return; }
    const { data } = await supabase.rpc("personel_rolum");
    const r = (data as Rolum[] | null)?.[0] ?? null;
    setRolum(r);
    setAsama(r ? "durum" : "kod");
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { durumuOku(); }, 0);
    return () => clearTimeout(t);
  }, [durumuOku]);

  // GİRİŞ — ŞİFRESİZ (Gökhan, 2026-08-17: "giriş yaparken şifre devre dışı olacaktı").
  // E-posta yazmak yeterli; sık gir-çık yapılabilsin diye. Şifre denetimi yayına çıkmadan
  // açılacak, kutusu ekranda kapalı duruyor.
  const girisYap = async () => {
    if (busy) return;
    if (!eposta.trim()) { setErr("E-posta yaz."); return; }
    setBusy(true); setErr(null);
    window.localStorage.setItem(SON_EPOSTA, eposta.trim());
    // Cihazda başkasının oturumu kalmasın — telefon elden ele geçiyor.
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithPassword({ email: eposta.trim(), password: gecicSifre(eposta) });
    setBusy(false);
    if (error) {
      // İki ihtimal var, ikisini de söylüyoruz: ya hiç hesap yok, ya da o e-posta Ekip
      // dışında (işletme hesabı olarak) kendi şifresiyle açılmış — geçici şifre orada tutmaz.
      setErr("Giriş yapılamadı. Bu e-postayla ya hesap yok ya da işletme hesabı olarak açılmış. Personel için başka bir e-posta kullan ya da kayıt ol.");
      return;
    }
    setAsama("yukleniyor");
    await durumuOku();
  };

  const kayitOl = async () => {
    if (busy) return;
    if (!ad.trim()) { setErr("Adını soyadını yaz."); return; }
    if (!eposta.trim()) { setErr("E-posta yaz."); return; }
    if (!kvkk) { setErr("Devam etmek için aydınlatma metnini onaylaman gerekiyor."); return; }
    setBusy(true); setErr(null);
    // Cihazda başkasının oturumu açıksa önce kapanıyor: açık oturumla kayıt denemesi yeni
    // e-posta yazılsa bile "bu kullanıcı zaten kayıtlı" diye dönüyordu (Gökhan, 2026-08-17).
    await supabase.auth.signOut();
    const { data, error } = await supabase.auth.signUp({
      email: eposta.trim(),
      password: gecicSifre(eposta),
      options: { data: { ad_soyad: toTitleTr(ad), telefon: telefon.replace(/\D/g, "") || null } },
    });
    setBusy(false);
    if (error) {
      const m = (error.message ?? "").toLowerCase();
      if (m.includes("already registered") || m.includes("already exists")) {
        setErr(`${eposta.trim()} zaten kayıtlı. Aşağıdan "Hesabım var, giriş yapacağım" ile gir.`);
        return;
      }
      setErr(error.message);
      return;
    }
    // Supabase kayıtlı e-postada hata döndürmüyor; tek işareti identities'in boş gelmesi.
    if (Array.isArray(data.user?.identities) && data.user.identities.length === 0) {
      setErr(`${eposta.trim()} zaten kayıtlı. Aşağıdan "Hesabım var, giriş yapacağım" ile gir.`);
      return;
    }
    window.localStorage.setItem(SON_EPOSTA, eposta.trim());
    if (data.session) { setAsama("kod"); return; }
    setBilgi(`${eposta.trim()} adresine onay linki gönderdik. Onayladıktan sonra buradan giriş yapabilirsin.`);
    setAsama("giris");
  };

  // KOD PANELİ — kodu yazınca o işletmeye bağlanma isteği açılıyor.
  const kodGonder = async () => {
    if (busy) return;
    if (!ad.trim()) { setErr("Adını soyadını yaz."); return; }
    if (!kod.trim()) { setErr("İşletmenin verdiği kodu yaz."); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("personel_kodla_baglan", {
      p_kod: kod.trim(),
      p_ad: toTitleTr(ad),
      p_telefon: telefon.replace(/\D/g, "") || null,
    });
    setBusy(false);
    if (error) {
      const m = error.message ?? "";
      if (m.includes("KOD_YANLIS")) { setErr("Kod bulunamadı. İşletmeden aldığın kodu kontrol et."); return; }
      if (m.includes("AD_GEREKLI")) { setErr("Adını soyadını yaz."); return; }
      setErr("Bağlanılamadı, tekrar dene.");
      return;
    }
    setAsama("yukleniyor");
    await durumuOku();
  };

  const cikis = async () => {
    await supabase.auth.signOut();
    setRolum(null); setKod(""); setAsama("giris");
  };

  if (asama === "yukleniyor") {
    return <div style={sayfa}><div style={{ color: "var(--muted)", fontSize: 13.5, textAlign: "center", paddingTop: 60 }}>Yükleniyor…</div></div>;
  }

  const altYazi = asama === "kayit" ? "Kendi hesabını aç"
    : asama === "kod" ? "İşletmene bağlan"
    : asama === "durum" ? "" : "Hesabına gir";

  return (
    <div style={sayfa}>
      <div style={{ textAlign: "center", marginBottom: 22 }}>
        {/* Uygulamanın adı EKİP (Gökhan, 2026-08-16) — mağazada da bu adla çıkacak. */}
        <div style={{ fontSize: 22, fontWeight: 700, color: "var(--ink-green)", letterSpacing: "-0.4px" }}>Ekip</div>
        {altYazi && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 5 }}>{altYazi}</div>}
      </div>

      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10, lineHeight: 1.5 }}>{err}</div>}
      {bilgi && <div style={{ fontSize: 12.5, color: "var(--brand)", marginBottom: 10, lineHeight: 1.5 }}>{bilgi}</div>}

      {/* GİRİŞ */}
      {asama === "giris" && (
        <div style={kart}>
          <input
            value={eposta} onChange={(e) => setEposta(e.target.value)} placeholder="E-posta"
            type="email" inputMode="email" autoCapitalize="none" style={inp}
            onKeyDown={(e) => e.key === "Enter" && girisYap()}
          />
          {/* ŞİFRE KUTUSU ŞİMDİLİK DEVRE DIŞI (Gökhan, 2026-08-17: "giriş yaparken şifre devre
              dışı olacaktı"). Sık gir-çık yapılabilsin diye e-posta yeterli. Kutu duruyor ama
              kapalı; yayına çıkmadan açılacak. */}
          <div style={{ position: "relative", opacity: 0.45 }}>
            <input
              value="" placeholder="Şifre (şimdilik gerekmiyor)" type="password" disabled
              style={{ ...inp, paddingRight: 42, cursor: "not-allowed" }}
            />
            <span style={gozBtn}><Eye size={16} /></span>
          </div>
          <button onClick={girisYap} disabled={busy} style={{ ...anaBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "…" : "Giriş yap"}</button>
          <button onClick={() => { setAsama("kayit"); setErr(null); setBilgi(null); }} style={ikincilBtn}>Hesabım yok, kayıt olacağım</button>
        </div>
      )}

      {/* KAYIT */}
      {asama === "kayit" && (
        <div style={kart}>
          <input value={ad} onChange={(e) => setAd(e.target.value)} onBlur={(e) => setAd(toTitleTr(e.target.value))} placeholder="Adın soyadın" style={inp} />
          <input value={eposta} onChange={(e) => setEposta(e.target.value)} placeholder="E-posta" type="email" inputMode="email" autoCapitalize="none" style={inp} />
          <input value={telefon} onChange={(e) => setTelefon(e.target.value.replace(/\D/g, ""))} placeholder="Telefon" inputMode="tel" className="tnum" style={inp} />
          {/* Şifre alanları şimdilik kapalı — giriş e-postayla yapılıyor (Gökhan, 2026-08-17).
              Kutular yerinde duruyor ki yayına çıkarken açmak tek satırlık iş olsun. */}
          <div style={{ opacity: 0.45 }}>
            <input value="" placeholder="Şifre (şimdilik gerekmiyor)" type="password" disabled style={{ ...inp, cursor: "not-allowed" }} />
          </div>


          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", marginTop: 2 }}>
            <input type="checkbox" checked={kvkk} onChange={(e) => setKvkk(e.target.checked)} style={{ marginTop: 3 }} />
            <span style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.55 }}>
              Ad soyad, e-posta ve telefon bilgimin; hesabımın açılması, çalıştığım işletmeye
              bağlanmam ve panellerin çalışması amacıyla işlenmesini kabul ediyorum. Bilgilerim
              bu amaçlar dışında kullanılmaz, üçüncü kişilerle paylaşılmaz. Kanunun 11. maddesi
              uyarınca verilerime erişme, düzeltilmesini ve silinmesini isteme hakkım var.
            </span>
          </label>

          <button onClick={kayitOl} disabled={busy} style={{ ...anaBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "…" : "Hesabı aç"}</button>
          <button onClick={() => { setAsama("giris"); setErr(null); }} style={ikincilBtn}>Hesabım var, giriş yapacağım</button>
        </div>
      )}

      {/* KOD PANELİ */}
      {asama === "kod" && (
        <div style={kart}>
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
            Çalıştığın işletmenin sana verdiği kodu yaz. Bağlandıktan sonra hep o işletmenin
            ekranına düşeceksin.
          </div>
          <input value={ad} onChange={(e) => setAd(e.target.value)} onBlur={(e) => setAd(toTitleTr(e.target.value))} placeholder="Adın soyadın" style={inp} />
          <input value={telefon} onChange={(e) => setTelefon(e.target.value.replace(/\D/g, ""))} placeholder="Telefon (isteğe bağlı)" inputMode="tel" className="tnum" style={inp} />
          <input
            value={kod} onChange={(e) => setKod(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && kodGonder()}
            placeholder="KOD" autoCapitalize="characters"
            style={{ ...inp, textAlign: "center", letterSpacing: 6, fontSize: 20, fontWeight: 700 }}
          />
          <button onClick={kodGonder} disabled={busy} style={{ ...anaBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "…" : "Bağlan"}</button>
          <button onClick={cikis} style={ikincilBtn}>Çıkış yap</button>
        </div>
      )}

      {/* DURUM */}
      {asama === "durum" && rolum && (
        <div style={kart}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink-green)", textAlign: "center" }}>{rolum.isletme_adi}</div>
          <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
            {rolum.ad_soyad} · {ROL_ADI[rolum.rol] ?? rolum.rol}
          </div>

          {rolum.durum === "onayli" ? (
            <button onClick={() => router.push(ROL_ADRESI[rolum.rol] ?? "/rezervasyon")} style={anaBtn}>
              Panele git
            </button>
          ) : rolum.durum === "bekliyor" ? (
            <div style={{ fontSize: 12.5, color: "var(--gold-text)", border: "1px solid var(--gold)", borderRadius: 12, padding: "12px 14px", lineHeight: 1.6, textAlign: "center" }}>
              İsteğin işletmeye iletildi. Onaylanınca panelin açılacak.
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: "var(--danger)", lineHeight: 1.6, textAlign: "center" }}>
              Bu işletmeyle bağlantın kapatılmış. İşletmeyle görüşmen gerekiyor.
            </div>
          )}

          <button onClick={() => { setAsama("kod"); setKod(""); setErr(null); }} style={ikincilBtn}>Başka işletmeye bağlan</button>
          <button onClick={cikis} style={ikincilBtn}>Çıkış yap</button>
        </div>
      )}
    </div>
  );
}

const sayfa: React.CSSProperties = {
  background: "var(--canvas)", minHeight: "100vh", padding: "34px 18px 40px",
  maxWidth: 420, margin: "0 auto", boxSizing: "border-box",
};
const kart: React.CSSProperties = {
  background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18,
  display: "flex", flexDirection: "column", gap: 10,
};
const inp: React.CSSProperties = {
  border: "1px solid var(--line-2)", borderRadius: 12, padding: "12px 13px", fontSize: 15,
  background: "var(--card)", color: "var(--ink)", outline: "none", width: "100%", boxSizing: "border-box",
};
const anaBtn: React.CSSProperties = {
  border: "none", borderRadius: 980, padding: "13px 16px", background: "var(--brand-strong)",
  color: "#fff", fontSize: 15, fontWeight: 500, cursor: "pointer", width: "100%",
};
const ikincilBtn: React.CSSProperties = {
  all: "unset", cursor: "pointer", textAlign: "center", fontSize: 13, color: "var(--muted)", padding: "6px 0",
};
const gozBtn: React.CSSProperties = {
  all: "unset", cursor: "pointer", position: "absolute", right: 12, top: "50%",
  transform: "translateY(-50%)", color: "var(--muted-2)", display: "flex",
};
