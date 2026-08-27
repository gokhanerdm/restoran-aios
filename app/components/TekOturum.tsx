"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { cikisAdresi } from "@/lib/girisYolu";

// TEK OTURUM — bir profil aynı anda tek yerde açık kalır (Gökhan, 2026-08-20: "bir profil
// sadece bir yerde açık olabilecek").
//
// NEDEN: karşılama, yöneticinin şifresiyle girip programı idare edebiliyor. Yönetici kendi
// telefonundan girdiği anda karşılamanın elindeki ekran kapanmalı — yoksa aynı hesap iki
// yerde açık kalır, kimin ne yaptığı belirsizleşir. Kural basit: SON GİREN KAZANIR.
//
// NASIL: her cihaz açılışta kendine bir oturum kodu üretir ve aktif_oturumlar'a yazar
// (oturumu_devral). Tabloda kullanıcı başına TEK satır var, ikinci cihaz yazınca birincinin
// kodu tarihe karışır. Her cihaz kendi kodunu belirli aralıkla tabloyla karşılaştırır;
// tutmuyorsa kendini kapatır ve "başka bir cihazda açıldı" ekranını gösterir.
//
// Realtime yerine sorgu kullanılıyor: tablo realtime yayınına açık değil ve bu iş saniyelik
// hassasiyet istemiyor — 20 saniyede bir bakmak yeterli.

const ANAHTAR = "rezervasyon_oturum_kodu";
const ARALIK_MS = 20000;

/** Bu sekmeye ait oturum kodu. Sekme yenilense de aynı kalsın diye sessionStorage'da. */
function buCihazinKodu(): string {
  if (typeof window === "undefined") return "";
  const varOlan = window.sessionStorage.getItem(ANAHTAR);
  if (varOlan) return varOlan;
  // crypto.randomUUID her yerde yok (telefondan yerel ağ IP'siyle açılınca tanımsız) —
  // burada güvenlik değil çakışmama gerekiyor.
  const yeni = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  window.sessionStorage.setItem(ANAHTAR, yeni);
  return yeni;
}

/** "iPhone · Safari" gibi kısa bir cihaz adı — atılan kişiye nereden atıldığını söylemek için. */
function cihazAdi(): string {
  if (typeof navigator === "undefined") return "bilinmeyen cihaz";
  const ua = navigator.userAgent;
  const cihaz = /iPhone/i.test(ua) ? "iPhone"
    : /iPad/i.test(ua) ? "iPad"
    : /Android/i.test(ua) ? "Android telefon"
    : /Macintosh/i.test(ua) ? "Mac"
    : /Windows/i.test(ua) ? "Windows bilgisayar"
    : "cihaz";
  const tarayici = /Edg\//i.test(ua) ? "Edge"
    : /Chrome\//i.test(ua) ? "Chrome"
    : /Safari\//i.test(ua) ? "Safari"
    : /Firefox\//i.test(ua) ? "Firefox"
    : "tarayıcı";
  return `${cihaz} · ${tarayici}`;
}

// Giriş/şifre ekranlarında bekçi çalışmaz: orada henüz oturum yok, çalışırsa kullanıcıyı
// kendi giriş ekranından atmaya kalkar.
const MUAF = ["/rezervasyon/giris", "/rezervasyon/sifre-sifirla"];

export default function TekOturum() {
  const router = useRouter();
  const pathname = usePathname();
  const [atildi, setAtildi] = useState(false);
  const kodRef = useRef<string>("");

  const muaf = MUAF.some((y) => pathname?.startsWith(y));

  useEffect(() => {
    if (muaf) return;
    let durduruldu = false;
    let zamanlayici: ReturnType<typeof setInterval> | null = null;

    const baslat = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || durduruldu) return;
      kodRef.current = buCihazinKodu();
      // Bu cihaz oturumu devralıyor — varsa öncekinin kodu geçersiz olur.
      await supabase.rpc("oturumu_devral", { p_kod: kodRef.current, p_cihaz: cihazAdi() });

      const bak = async () => {
        if (durduruldu) return;
        const { data } = await supabase
          .from("aktif_oturumlar")
          .select("oturum_kodu")
          .eq("user_id", session.user.id)
          .maybeSingle();
        const acikKod = (data as { oturum_kodu: string } | null)?.oturum_kodu ?? null;
        // Satır silinmişse (hesap kapandı vb.) kimseyi atmıyoruz; sadece BAŞKA bir kod
        // yazılmışsa bu cihaz devrini bitirmiş demektir.
        if (acikKod && acikKod !== kodRef.current) {
          durduruldu = true;
          if (zamanlayici) clearInterval(zamanlayici);
          await supabase.auth.signOut();
          setAtildi(true);
        }
      };
      zamanlayici = setInterval(bak, ARALIK_MS);
    };

    baslat();
    return () => { durduruldu = true; if (zamanlayici) clearInterval(zamanlayici); };
  }, [muaf]);

  if (!atildi) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "var(--canvas)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "min(420px, 94vw)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 20, padding: 24, textAlign: "center" }}>
        <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink)", marginBottom: 10 }}>Bu hesap başka bir cihazda açıldı</div>
        <div style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.5, marginBottom: 18 }}>
          Bir profil aynı anda tek yerde açık kalabiliyor. Aynı hesapla başka bir cihazdan
          giriş yapıldığı için buradaki oturum kapatıldı. Sen kullanmaya devam edeceksen
          tekrar giriş yapman yeterli — bu sefer öbür cihaz kapanır.
        </div>
        <button
          onClick={() => router.replace(cikisAdresi("/rezervasyon/giris"))}
          style={{ width: "100%", border: "none", borderRadius: 980, padding: 12, background: "var(--brand-strong)", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" }}
        >
          Tekrar giriş yap
        </button>
      </div>
    </div>
  );
}
