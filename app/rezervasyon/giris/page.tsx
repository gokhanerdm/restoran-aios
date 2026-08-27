"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { toTitleTr } from "@/lib/text";
import { eslesenIller, eslesenIlceler } from "@/lib/turkeyLocations";
import { SIFRE_KURALLARI, sifreGecerliMi, gucluSifreOner } from "@/lib/passwordPolicy";
import { gecicSifre } from "@/lib/gecicSifre";
import { girisYoluKaydet } from "@/lib/girisYolu";

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

// Seçilen tür artık sadece kayda yazılmıyor — ayarların varsayılanını da o basıyor
// (Gökhan, 2026-08-16: "kayıtta zaten işletme türü seçimi var, biz sadece ayarları ve
// özellikleri bağlayacağız"). Eşleşme veritabanında: isletme_turu_slug + isletme_tipi_varsayilani.
// BURAYA YENİ TÜR EKLENİRSE o iki fonksiyona da eklenmeli, yoksa "Diğer" varsayılanına düşer.
//
// LİSTEDE SADECE SİMÜLE EDİLMİŞ TÜRLER DURUYOR (Gökhan, 2026-08-20: "simülesi yapılmamış
// başlıkları kaldır, şu an yn meyhane, gece kulübü ve gece canlı müzik olsun"). Restoran,
// kafe, meyhane, gazino, bar gibi türlerin varsayılanları veritabanında hazır ama daha
// işletme işletme oturup denenmedi — denenmemiş bir türü seçtirip yanlış varsayılanla
// başlatmaktansa listeye hiç koymuyoruz. Her tür simüle edildikçe buraya geri eklenecek.
const ISLETME_TURLERI = [
  "Yeni nesil meyhane",
  "Gece kulübü",
  // Gece 12'de açılıp sabah kapanan, sahnesinde canlı müzik olan kulüp — akşam mekanı
  // olan "Canlı müzik"ten ayrı tür (Gökhan, 2026-08-20).
  "Gece kulübü - canlı müzik",
];

// Güçlü parola standardı — kabul gören en yaygın kural: en az 8 karakter, bir büyük harf,
// bir küçük harf, bir rakam, bir sembol. Kayıt formunda canlı gösteriliyor (kutu yazarken
// değişir, bu bir "hatırlatma listesi"), giriş (login) tarafında zorlanmıyor — eski
// hesaplar farklı bir kuralla açılmış olabilir, login sadece şifreyi doğrular.
const errMap: Record<string, string> = {
  invalid_credentials: "E-posta veya şifre hatalı.",
  email_not_confirmed: "E-postanı henüz onaylamamışsın — gelen kutunu kontrol et.",
  user_already_exists: "Bu e-posta ile zaten bir hesap var, giriş yapmayı dene.",
  // Supabase peş peşe denemede kendiliğinden devreye giriyor (Gökhan, 2026-08-04:
  // "rate limite takıldı") — kod hatası değil, birkaç dakika beklemek yeterli.
  over_email_send_rate_limit: "Çok kısa sürede çok fazla mail istendi — birkaç dakika bekleyip tekrar dene.",
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

  // Hesap
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPw, setShowPw] = useState(false);

  // İşletme / marka
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [turAcik, setTurAcik] = useState(false);
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");

  const [il, setIl] = useState("");
  const [ilce, setIlce] = useState("");
  const [ilOnerileriAcik, setIlOnerileriAcik] = useState(false);
  const [ilceOnerileriAcik, setIlceOnerileriAcik] = useState(false);
  const [address, setAddress] = useState("");
  // Gün/saat seçimi kayıttan kaldırıldı, varsayılan (her gün açık, 09:00-23:00)
  // kaydedilir — Ayarlar'dan gün gün düzenlenir.
  const [acikGunler] = useState<Set<DayKey>>(new Set(TUM_GUNLER));
  const [acilis] = useState("09:00");
  const [kapanis] = useState("23:00");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmMsg, setConfirmMsg] = useState<string | null>(null);

  // Şifremi unuttum — kendi katmanı, ana giriş e-postasının doldurulmuş olmasını
  // beklemiyor (Gökhan, 2026-08-04: "önce mailini yaz sonra tıkla diyor, yeni ekran
  // açılmalı"). Açılırken varsa üstteki e-posta önceden dolduruluyor, ama ayrı bir alan —
  // burada değiştirmek giriş formundaki e-postayı etkilemiyor.
  //
  // KOD tabanlı — link DEĞİL: mail linki tıklanmadan bazı mail servisleri (ör. Gmail)
  // güvenlik taraması için linki otomatik açıp tek kullanımlık jetonu tüketiyor, misafir
  // tıkladığında "geçersiz" çıkıyordu (Gökhan, 2026-08-04'te canlı yaşandı). Mail artık
  // 6 haneli bir KOD gösteriyor (bkz. Supabase mailer_templates_recovery_content), kod
  // burada elle girilip supabase.auth.verifyOtp ile doğrulanıyor — tarama bunu tüketemez.
  const [unutOpen, setUnutOpen] = useState(false);
  const [unutAsama, setUnutAsama] = useState<"eposta" | "kod">("eposta");
  const [unutEmail, setUnutEmail] = useState("");
  const [unutKod, setUnutKod] = useState("");
  const [unutYeniSifre, setUnutYeniSifre] = useState("");
  const [unutYeniSifre2, setUnutYeniSifre2] = useState("");
  const [unutShowPw, setUnutShowPw] = useState(false);
  const [unutBusy, setUnutBusy] = useState(false);
  const [unutErr, setUnutErr] = useState<string | null>(null);
  const [unutTamam, setUnutTamam] = useState(false);

  const friendlyErr = (code: string | undefined, fallback: string) => (code && errMap[code]) || fallback;

  // İsim/il/ilçe/adres gibi alanlar kutudan çıkınca (Tab, tıklayıp başka kutuya geçme,
  // Enter) kelime başı büyük harfe çevrilir — Gökhan: yazarken değil ama "kutuyu bitirir
  // bitirmez" görmek istiyor. Enter'da doğal blur olmadığı için Enter'ı blur'a bağlıyoruz.
  const onBlurTitle = (setter: (v: string) => void) => (e: React.FocusEvent<HTMLInputElement>) => setter(toTitleTr(e.target.value));
  const onEnterBlur = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") e.currentTarget.blur(); };

  const submitKayit = async () => {
    if (busy) return;
    if (!businessName.trim() || !contactName.trim() || !phone.trim() || !email.trim() || !password) {
      setErr("İşletme adı, yetkili adı soyadı, telefon, e-posta ve şifre gerekli.");
      return;
    }
    if (!sifreGecerliMi(password)) { setErr("Şifre, üstteki gereksinimlerin hepsini karşılamıyor."); return; }
    if (password !== password2) { setErr("Şifreler birbiriyle uyuşmuyor."); return; }
    if (!businessType) { setErr("İşletme türünü seç."); return; }
    if (!il.trim() || !ilce.trim() || !address.trim()) { setErr("İl, ilçe ve açık adres gerekli."); return; }

    setBusy(true); setErr(null); setConfirmMsg(null);
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) { setBusy(false); setErr(friendlyErr(error.code, error.message)); return; }
    if (!data.user) { setBusy(false); setErr("Hesap oluşturulamadı."); return; }
    // Supabase, zaten kayıtlı bir e-postayla signUp çağrılınca (e-posta sızıntısını önlemek
    // için) HATA DÖNDÜRMEZ — "başarılı" görünen ama identities'i boş bir kullanıcı nesnesi
    // döner. Bunu error alanına bakarak yakalayamıyoruz, tek işareti bu: identities boşsa
    // hesap zaten var demektir, bootstrap RPC'sini hiç çağırmadan burada durmalıyız.
    if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setBusy(false);
      setErr(friendlyErr("user_already_exists", "Bu e-posta ile zaten bir hesap var, giriş yapmayı dene."));
      return;
    }

    // Şube seçimi kayıttan kaldırıldı (Gökhan, 2026-08-08: "direkt kaydolurken bunu
    // belirtmesinin bize faydası yok, çoğu işletme tek şubeyle başlıyor") — herkes tek
    // işletme olarak kaydolur, ikinci şube ihtiyacı olan Ayarlar'dan sonra ekler.
    const { error: bootErr } = await supabase.rpc("bootstrap_reservation_account", {
      p_user_id: data.user.id,
      p_kind: "tek",
      p_business_name: toTitleTr(businessName),
      p_business_type: businessType,
      p_contact_name: toTitleTr(contactName),
      p_phone: phone.trim(),
      p_email: email.trim(),
      p_branch_name: toTitleTr(businessName),
      p_branch_phone: phone.trim(),
      p_il: toTitleTr(il),
      p_ilce: toTitleTr(ilce),
      p_address: toTitleTr(address),
      p_opening_hours: buildOpeningHours(acikGunler, acilis, kapanis),
    });
    setBusy(false);
    if (bootErr) { setErr(`İşletme kaydı oluşturulamadı: ${bootErr.message}`); return; }

    // Kayıt biter bitmez KURULUM ekranı karşılıyor (Gökhan, 2026-08-20: "açıldıktan sonra
    // karşımıza tüm program için geçerli bu ayarlar ekranı gelmeli"). /rezervasyon zaten
    // kilitli, oraya gitse geri gönderilecekti — doğrudan kuruluma alıyoruz.
    if (data.session) { router.push("/rezervasyon/kurulum"); return; }
    setConfirmMsg(`${email.trim()} adresine bir onay linki gönderdik. Linke tıkladıktan sonra buradan giriş yapabilirsin.`);
    setMode("giris");
  };

  const submitGiris = async () => {
    if (busy) return;
    // GEÇİCİ KOLAYLIK (Gökhan, 2026-08-18: "şifresiz direkt giriş yapabilmem gerekiyordu"):
    // şifre boş bırakılırsa program e-postadan türettiği geçici şifreyle giriyor — Ekip
    // üyeliğindeki davranışın aynısı, aynı şifreyi üretiyor. Demo bitince sökülecek.
    if (!email.trim()) { setErr("E-posta gerekli."); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password || gecicSifre(email),
    });
    if (error) { setBusy(false); setErr(friendlyErr(error.code, error.message)); return; }
    // PERSONEL EKİP PANELİNE (Gökhan, 2026-08-18) — GİREN KİŞİNİN personel kaydı varsa Ekip
    // paneline düşüyor; orada rolü, işletmesi ve kendi ekranına geçiş duruyor. İşletme
    // sahibinin personel kaydı yoktur, o doğrudan rezervasyon listesine gidiyor.
    //
    // Sorgu KİM olduğunu sormuyordu: sadece "personel_hesaplari boş mu" diye bakıyordu. İşletme
    // sahibi kendi personelini görebildiği için, işletmede bir personel açıldığı anda SAHİP de
    // Ekip ekranına düşüyordu (Gökhan, 2026-08-19: "şifreli girince ekip ekranına bağlıyor" —
    // Hani'de altı personel hesabı vardı). Artık kayıt giren kullanıcıya ait mi diye bakılıyor.
    const { data: oturum } = await supabase.auth.getUser();
    const girenId = oturum.user?.id ?? null;
    const { data: personel } = girenId
      ? await supabase.from("personel_hesaplari").select("id").eq("user_id", girenId).limit(1)
      : { data: null };
    setBusy(false);
    // Çıkışta bu kapıya dönülsün (lib/girisYolu.ts). Personel Ekip'e düşüyorsa
    // kapısı da Ekip'tir — /ekip kendi içinde bunu zaten "ekip" olarak yazar.
    girisYoluKaydet("rezervasyon");
    router.push((personel?.length ?? 0) > 0 ? "/ekip" : "/rezervasyon");
  };

  // Şifremi unuttum — kendi katmanı (Gökhan, 2026-08-04: "önce mailini yaz sonra tıkla
  // diyor, yeni ekran açılmalı"). Giriş e-postası doluysa katman açılırken ona kopyalanır
  // (kolaylık), ama ayrı bir alan — burada değiştirmek giriş formunu etkilemez.
  const unutAc = () => {
    setUnutEmail(email.trim());
    setUnutKod(""); setUnutYeniSifre(""); setUnutYeniSifre2(""); setUnutShowPw(false);
    setUnutErr(null); setUnutTamam(false); setUnutAsama("eposta");
    setUnutOpen(true);
  };
  // 1. adım: koda mail gönder. redirectTo hâlâ veriliyor (mail linki hâlâ da çalışırsa
  // diye zarar yok), ama asıl akış artık kodu elle girmek.
  const unutKodGonder = async () => {
    if (unutBusy) return;
    if (!unutEmail.trim()) { setUnutErr("E-posta adresi gerekli."); return; }
    setUnutBusy(true); setUnutErr(null);
    const { error } = await supabase.auth.resetPasswordForEmail(unutEmail.trim(), {
      redirectTo: `${window.location.origin}/rezervasyon/sifre-sifirla`,
    });
    setUnutBusy(false);
    if (error) { setUnutErr(friendlyErr(error.code, error.message)); return; }
    setUnutAsama("kod");
  };
  // 2. adım: kodu doğrula (bu bir oturum açar), sonra o oturumla şifreyi güncelle.
  const unutSifreyiKaydet = async () => {
    if (unutBusy) return;
    if (!unutKod.trim()) { setUnutErr("Maildeki kodu gir."); return; }
    if (!sifreGecerliMi(unutYeniSifre)) { setUnutErr("Şifre, gereksinimlerin hepsini karşılamıyor."); return; }
    if (unutYeniSifre !== unutYeniSifre2) { setUnutErr("Şifreler birbiriyle uyuşmuyor."); return; }
    setUnutBusy(true); setUnutErr(null);
    const { error: verifyErr } = await supabase.auth.verifyOtp({ email: unutEmail.trim(), token: unutKod.trim(), type: "recovery" });
    if (verifyErr) { setUnutBusy(false); setUnutErr("Kod hatalı ya da süresi dolmuş — tekrar kod iste."); return; }
    const { error: updateErr } = await supabase.auth.updateUser({ password: unutYeniSifre });
    setUnutBusy(false);
    if (updateErr) { setUnutErr(updateErr.message); return; }
    setUnutTamam(true);
    setTimeout(() => router.push("/rezervasyon"), 1200);
  };

  // alignItems:flex-start sabit — ortalanmış olsaydı klavye açılınca (100vh küçülünce)
  // ya da sekme/form içeriği boy değiştirdikçe kart yukarı aşağı kayardı (Gökhan,
  // 2026-08-08: "bu ekranı sabitle sağa sola aşağı yukarı kaymasın").
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "flex-start", justifyContent: "center", background: "var(--canvas)", padding: "16px" }}>
      <div style={{ width: "min(460px, 94vw)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 20, padding: 20 }}>
        {/* RZV — ürün adı/rozeti (Gökhan, 2026-08-04). AIOS Shell'deki yuvarlak baş harf
            rozetiyle aynı dil (bkz. app/components/Shell.tsx), sadece 3 harfli. */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: "var(--brand)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, letterSpacing: 0.5, flexShrink: 0 }}>
            RZV
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, color: "var(--ink-green)", letterSpacing: "-0.4px" }}>Rezerve</div>
        </div>

        <div style={{ display: "flex", gap: 6, background: "var(--recede)", padding: 3, borderRadius: 980, marginBottom: 12 }}>
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
            <button type="button" onClick={unutAc} style={{ all: "unset", cursor: "pointer", fontSize: 12, color: "var(--brand)", alignSelf: "flex-end" }}>
              Şifremi unuttum
            </button>
            <button onClick={submitGiris} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1, marginTop: 6 }}>
              {busy ? "…" : "Giriş yap"}
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} onBlur={onBlurTitle(setBusinessName)} onKeyDown={onEnterBlur} placeholder="İşletme adı" style={inp} />

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
            {/* Telefon + e-posta yan yana — tek ekrana sığsın diye (Gökhan, 2026-08-08). */}
            <div style={{ display: "flex", gap: 8 }}>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Telefon" style={{ ...inp, flex: 1, minWidth: 0 }} />
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-posta" style={{ ...inp, flex: 1, minWidth: 0 }} />
            </div>
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
            {/* Gereksinim listesi + "Güçlü şifre öner" AYNI TEK SIRADA (Gökhan, 2026-08-04:
                "o sıraya al", "şifre doğrulamada girsin") — hiçbir koşulda alta düşmez,
                kısaltılmış etiketler + flexWrap:"nowrap" tek satıra kesin sığıyor; aşırı
                dar bir ekranda bile bölünmez, gerekirse yana kayar (overflowX). */}
            <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", justifyContent: "center", gap: 3, marginTop: -2, overflowX: "auto" }}>
              {SIFRE_KURALLARI.map((k) => {
                const met = k.test(password);
                return (
                  <span key={k.label} style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0, whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: 9, color: "var(--line-2)" }}>·</span>
                    <span style={{ fontSize: 9, color: met ? "var(--brand)" : "var(--muted-2)" }}>
                      {met ? "✓ " : ""}{k.label}
                    </span>
                  </span>
                );
              })}
              <span style={{ fontSize: 9, color: "var(--line-2)", flexShrink: 0 }}>·</span>
              <button
                type="button"
                onClick={() => { const yeni = gucluSifreOner(); setPassword(yeni); setPassword2(yeni); setShowPw(true); }}
                style={{ all: "unset", cursor: "pointer", fontSize: 9, color: "var(--brand)", flexShrink: 0, whiteSpace: "nowrap" }}
              >
                Şifre öner
              </button>
            </div>

            <input
              value={password2} onChange={(e) => setPassword2(e.target.value)}
              type={showPw ? "text" : "password"} placeholder="Şifre (tekrar)" style={inp}
            />

            <div style={{ display: "flex", gap: 8 }}>
              {/* İl/İlçe önerisi — "an" yazınca Ankara, "is" yazınca İstanbul gibi baştan
                  eşleşen resmi il/ilçe adları aşağıda kutunun içinden açılır (Gökhan,
                  2026-08-04). Öneriye tıklarken input'un blur olup listeyi kapatmasını
                  onMouseDown'daki preventDefault engelliyor, yoksa tıklama hiç ulaşmıyordu. */}
              <div style={{ flex: 1, position: "relative" }}>
                <input
                  value={il}
                  onChange={(e) => { setIl(e.target.value); setIlOnerileriAcik(true); }}
                  onFocus={() => setIlOnerileriAcik(true)}
                  onBlur={(e) => { onBlurTitle(setIl)(e); setIlOnerileriAcik(false); }}
                  onKeyDown={onEnterBlur}
                  placeholder="İl" style={inp}
                />
                {ilOnerileriAcik && eslesenIller(il).length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--card)", overflow: "hidden", zIndex: 5, boxShadow: "0 4px 14px rgba(0,0,0,0.08)" }}>
                    {eslesenIller(il).map((o) => (
                      <button
                        key={o} type="button" onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setIl(o); setIlOnerileriAcik(false); }}
                        style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", padding: "8px 12px", boxSizing: "border-box", fontSize: 13, color: "var(--ink)" }}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, position: "relative" }}>
                <input
                  value={ilce}
                  onChange={(e) => { setIlce(e.target.value); setIlceOnerileriAcik(true); }}
                  onFocus={() => setIlceOnerileriAcik(true)}
                  onBlur={(e) => { onBlurTitle(setIlce)(e); setIlceOnerileriAcik(false); }}
                  onKeyDown={onEnterBlur}
                  placeholder="İlçe" style={inp}
                />
                {ilceOnerileriAcik && eslesenIlceler(il, ilce).length > 0 && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--card)", overflow: "hidden", zIndex: 5, boxShadow: "0 4px 14px rgba(0,0,0,0.08)" }}>
                    {eslesenIlceler(il, ilce).map((o) => (
                      <button
                        key={o} type="button" onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { setIlce(o); setIlceOnerileriAcik(false); }}
                        style={{ all: "unset", cursor: "pointer", display: "block", width: "100%", padding: "8px 12px", boxSizing: "border-box", fontSize: 13, color: "var(--ink)" }}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <input value={address} onChange={(e) => setAddress(e.target.value)} onBlur={onBlurTitle(setAddress)} onKeyDown={onEnterBlur} placeholder="Adres" style={inp} />

            {/* Çalışma günleri/saatleri kayıttan kaldırıldı (Gökhan, 2026-08-08: "gün
                seçimini program ayarlarında halledelim") — varsayılan (her gün açık,
                09:00-23:00) kaydedilir, Ayarlar'dan gün gün düzenlenir. */}

            <button onClick={submitKayit} disabled={busy} style={{ ...btnPrimary, opacity: busy ? 0.6 : 1, marginTop: 8 }}>
              {busy ? "…" : "Hesap oluştur"}
            </button>
          </div>
        )}
      </div>

      {/* ŞİFREMİ UNUTTUM KATMANI — kod tabanlı, link DEĞİL (Gökhan, 2026-08-04: mail
          linkine tıklamadan bazı mail servisleri linki taramak için otomatik açıp tek
          kullanımlık jetonu tüketiyordu, "hâlâ hesap oluştur ekranına yönlendiriyor"
          diye yaşandı). 1. adım e-posta, 2. adım maildeki kod + yeni şifre. */}
      {unutOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setUnutOpen(false)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, minWidth: 320, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 4 }}>Şifremi unuttum</div>

            {unutTamam ? (
              <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6, marginTop: 10 }}>
                Şifren güncellendi, yönlendiriliyorsun…
              </div>
            ) : unutAsama === "eposta" ? (
              <>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, lineHeight: 1.5 }}>
                  Hesabına kayıtlı e-postayı yaz, sana 6 haneli bir kod gönderelim.
                </div>
                {unutErr && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{unutErr}</div>}
                <input
                  autoFocus value={unutEmail} onChange={(e) => setUnutEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && unutKodGonder()}
                  type="email" placeholder="E-posta" style={inp}
                />
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, lineHeight: 1.5 }}>
                  {unutEmail.trim()} adresine bir kod gönderdik. Kodu ve yeni şifreni gir.
                </div>
                {unutErr && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10 }}>{unutErr}</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input
                    autoFocus value={unutKod} onChange={(e) => setUnutKod(e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric" placeholder="Mailden gelen kod" style={{ ...inp, letterSpacing: 3, textAlign: "center", fontSize: 18 }}
                  />
                  <div style={{ position: "relative" }}>
                    <input
                      value={unutYeniSifre} onChange={(e) => setUnutYeniSifre(e.target.value)}
                      type={unutShowPw ? "text" : "password"} placeholder="Yeni şifre" style={{ ...inp, paddingRight: 38 }}
                    />
                    <button
                      type="button" onClick={() => setUnutShowPw((v) => !v)}
                      aria-label={unutShowPw ? "Şifreyi gizle" : "Şifreyi göster"}
                      style={{ all: "unset", cursor: "pointer", position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", color: "var(--muted)", display: "flex" }}
                    >
                      {unutShowPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", justifyContent: "center", gap: 3, marginTop: -2, overflowX: "auto" }}>
                    {SIFRE_KURALLARI.map((k) => {
                      const met = k.test(unutYeniSifre);
                      return (
                        <span key={k.label} style={{ display: "flex", alignItems: "center", gap: 3, flexShrink: 0, whiteSpace: "nowrap" }}>
                          <span style={{ fontSize: 9, color: "var(--line-2)" }}>·</span>
                          <span style={{ fontSize: 9, color: met ? "var(--brand)" : "var(--muted-2)" }}>{met ? "✓ " : ""}{k.label}</span>
                        </span>
                      );
                    })}
                    <span style={{ fontSize: 9, color: "var(--line-2)", flexShrink: 0 }}>·</span>
                    <button
                      type="button" onClick={() => { setUnutYeniSifre(gucluSifreOner()); setUnutShowPw(true); }}
                      style={{ all: "unset", cursor: "pointer", fontSize: 9, color: "var(--brand)", flexShrink: 0, whiteSpace: "nowrap" }}
                    >
                      Şifre öner
                    </button>
                  </div>
                  <input
                    value={unutYeniSifre2} onChange={(e) => setUnutYeniSifre2(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && unutSifreyiKaydet()}
                    type={unutShowPw ? "text" : "password"} placeholder="Yeni şifre (tekrar)" style={inp}
                  />
                </div>
                <button type="button" onClick={unutKodGonder} disabled={unutBusy} style={{ all: "unset", cursor: "pointer", fontSize: 11, color: "var(--brand)", marginTop: 8, display: "block" }}>
                  Kodu tekrar gönder
                </button>
              </>
            )}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={() => setUnutOpen(false)} style={btnSecondary}>{unutTamam ? "Kapat" : "Vazgeç"}</button>
              {!unutTamam && unutAsama === "eposta" && (
                <button onClick={unutKodGonder} disabled={unutBusy || !unutEmail.trim()} style={{ ...btnPrimary, width: "auto", padding: "9px 16px", opacity: unutBusy || !unutEmail.trim() ? 0.5 : 1 }}>
                  {unutBusy ? "…" : "Kod gönder"}
                </button>
              )}
              {!unutTamam && unutAsama === "kod" && (
                <button onClick={unutSifreyiKaydet} disabled={unutBusy} style={{ ...btnPrimary, width: "auto", padding: "9px 16px", opacity: unutBusy ? 0.5 : 1 }}>
                  {unutBusy ? "…" : "Şifreyi kaydet"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// fontSize 16 — iOS Safari, 16px altındaki bir input'a dokununca sayfayı otomatik
// yakınlaştırıyor. Giriş yaparken e-posta/şifre kutusu odaklanmışken bu tetiklenip
// yeni rezervasyon sayfasına o yakınlaştırılmış halde geçiliyordu (Gökhan, 2026-08-08:
// "yeni giriş yapıldığında ekran büyük geliyor").
const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "11px 13px", fontSize: 16, background: "var(--card)", color: "var(--ink)", outline: "none", width: "100%", boxSizing: "border-box" };
const btnPrimary: React.CSSProperties = { width: "100%", border: "none", borderRadius: 980, padding: 12, background: "var(--brand-strong)", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" };
// Şifremi unuttum katmanındaki iki buton — btnPrimary'nin width:100%'ü burada işe
// yaramaz (yan yana iki buton), bu yüzden ayrı, satır-içi boyutta.
const btnSecondary: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 16px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13, cursor: "pointer" };
