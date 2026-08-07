"use client";

// Misafirin KENDİ kendine rezervasyon yaptığı, girişsiz genel sayfa (ROADMAP — Gökhan,
// 2026-08-01: "misafir kendi rezervasyonunu yapabilsin... bu ayrı bir uygulama olacak, aiosun
// karşılama panelinde de kullanacağız"). Restoranın Instagram bio'suna/web sitesine konacak
// bir link — /m/[slug] (QR menü) ile aynı desen: slug'a göre restoran bulunur, kayıt doğrudan
// aynı reservations tablosuna düşer (status='bekleniyor', source='online') — Karşılama'da
// personelin girdiği rezervasyonla birebir aynı listede, aynı akıştan geçer.
//
// Bilerek YAPMADIKLARI: kapasite/Yedek hesabı burada YOK — o iç işletme bilgisi, dışarıya
// sayı olarak sızdırmak istemedik; personel Karşılama'da zaten Yedek'i görüp gerekirse arar.
// Biz burada da engellemeyiz, sadece alırız (Gökhan'ın "biz bilgilendiririz, karar onların"
// ilkesiyle aynı ruh).

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { toTitleTr } from "@/lib/text";

type Restaurant = { id: string; name: string };

const bugunIstanbul = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

export default function RezervasyonYapPage() {
  const { slug } = useParams<{ slug: string }>();
  const [restaurant, setRestaurant] = useState<Restaurant | null | undefined>(undefined); // undefined = yükleniyor
  const [kvkkNotice, setKvkkNotice] = useState("");
  const [kvkkAcik, setKvkkAcik] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [party, setParty] = useState("2");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [note, setNote] = useState("");
  const [kvkkOnay, setKvkkOnay] = useState(false);
  // Bal küpü — botlar genelde her alanı doldurur, gerçek kullanıcı bunu hiç görmez
  // (CSS ile ekran dışına taşınmış). Doluysa gönderimi SESSİZCE yutuyoruz.
  const [honeypot, setHoneypot] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDate(bugunIstanbul());
    if (!slug) return;
    supabase.from("restaurants").select("id, name").eq("slug", slug).is("deleted_at", null).maybeSingle()
      .then(({ data }) => setRestaurant((data as Restaurant | null) ?? null));
  }, [slug]);

  useEffect(() => {
    if (!restaurant) return;
    supabase.from("restaurant_settings").select("kvkk_notice").eq("restaurant_id", restaurant.id).maybeSingle()
      .then(({ data }) => setKvkkNotice((data as { kvkk_notice: string | null } | null)?.kvkk_notice ?? ""));
  }, [restaurant]);

  const submit = async () => {
    if (!restaurant) return;
    const kisi = parseInt(party, 10);
    if (!name.trim() || !phone.trim() || !date || !time || !kisi || kisi <= 0) {
      setErr("İsim, telefon, tarih, saat ve kişi sayısı gerekli.");
      return;
    }
    if (!kvkkOnay) { setErr("Devam etmek için KVKK aydınlatma metnini onaylamalısın."); return; }
    if (honeypot.trim()) { setDone(true); return; } // bot — sessizce "başarılı" göster, gerçek kayıt açma

    setBusy(true); setErr(null);
    const { data: yeniKayit, error } = await supabase.from("reservations").insert({
      restaurant_id: restaurant.id,
      guest_name: toTitleTr(name),
      guest_phone: phone.trim(),
      party_size: kisi,
      reserved_at: new Date(`${date}T${time}:00+03:00`).toISOString(),
      note: note.trim() || null,
      status: "bekleniyor",
      source: "online",
      iletisim_kanali: "online",
      consent_at: new Date().toISOString(),
    }).select("id").single();
    setBusy(false);
    if (error) { setErr("Rezervasyon gönderilemedi, lütfen tekrar dene."); return; }
    // Onay bildirimi — sağlayıcı bağlanana kadar sessizce "gönderilmedi" döner, akışı etkilemez.
    if (yeniKayit) supabase.functions.invoke("send-reservation-notification", { body: { reservation_id: yeniKayit.id, type: "onay" } }).catch(() => {});
    setDone(true);
  };

  if (restaurant === undefined) return <div style={{ minHeight: "100vh", background: "var(--canvas)" }} />;
  if (restaurant === null) {
    return (
      <div style={{ background: "var(--canvas)", minHeight: "100vh", padding: 40, textAlign: "center", color: "var(--muted)" }}>
        İşletme bulunamadı.
      </div>
    );
  }

  return (
    <div style={{ background: "var(--canvas)", minHeight: "100vh" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "36px 20px 60px" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.5px", color: "var(--ink-green)" }}>{restaurant.name}</div>
          <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 6 }}>Rezervasyon</div>
        </div>

        {done ? (
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 24, textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: "var(--ink-green)", marginBottom: 8 }}>Rezervasyon talebiniz alındı</div>
            <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6 }}>
              {toTitleTr(name)}, {date && new Date(`${date}T00:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long" })} günü saat {time} için {party} kişilik rezervasyonunuz işletmeye ulaştı. Bir sorun olursa {phone} numaranızdan sizinle iletişime geçilecek.
            </div>
          </div>
        ) : (
          <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 22 }}>
            {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 12 }}>{err}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="İsim soyisim" style={inp} />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefon" inputMode="tel" style={inp} />
              <div style={{ display: "flex", gap: 10 }}>
                <input type="date" value={date} min={bugunIstanbul()} onChange={(e) => setDate(e.target.value)} style={{ ...inp, flex: 1 }} />
                <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ ...inp, flex: 1 }} />
              </div>
              <input value={party} onChange={(e) => setParty(e.target.value.replace(/\D/g, ""))} placeholder="Kişi sayısı" inputMode="numeric" style={inp} />
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Özel not (opsiyonel)" style={inp} />
              <input
                value={honeypot} onChange={(e) => setHoneypot(e.target.value)} tabIndex={-1} autoComplete="off"
                aria-hidden="true" placeholder="Web siteniz"
                style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
              />
            </div>

            <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 14, cursor: "pointer" }}>
              <input type="checkbox" checked={kvkkOnay} onChange={(e) => setKvkkOnay(e.target.checked)} style={{ marginTop: 2 }} />
              <span style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                Kişisel verilerimin rezervasyon amacıyla işlenmesini kabul ediyorum.{" "}
                {kvkkNotice.trim() && (
                  <button type="button" onClick={(e) => { e.preventDefault(); setKvkkAcik((v) => !v); }} style={{ all: "unset", cursor: "pointer", color: "var(--brand)", textDecoration: "underline" }}>
                    {kvkkAcik ? "gizle" : "aydınlatma metnini oku"}
                  </button>
                )}
              </span>
            </label>
            {kvkkAcik && kvkkNotice.trim() && (
              <div style={{ marginTop: 8, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 12, background: "var(--recede)", fontSize: 12, color: "var(--muted)", lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 140, overflowY: "auto" }}>
                {kvkkNotice}
              </div>
            )}

            <button onClick={submit} disabled={busy || !kvkkOnay} style={{ ...btnPrimary, width: "100%", marginTop: 16, opacity: !kvkkOnay ? 0.5 : 1 }}>
              {busy ? "Gönderiliyor…" : "Rezervasyon talebi gönder"}
            </button>
          </div>
        )}

        <div style={{ textAlign: "center", marginTop: 24, fontSize: 11, color: "var(--muted-2)" }}>Restoran AIOS</div>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "11px 12px", fontSize: 14.5, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0, boxSizing: "border-box", width: "100%" };
const btnPrimary: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 980, padding: "13px 16px", background: "var(--brand-strong)", color: "#fff", fontSize: 15, fontWeight: 500 };
