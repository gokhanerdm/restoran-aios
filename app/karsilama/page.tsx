"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getMyRestaurantId } from "@/lib/supabase/restaurant";
import { getStaffSession } from "@/lib/supabase/staffSession";
import { toTitleTr } from "@/lib/text";
import { Plus } from "lucide-react";
import { useConfirm } from "../components/useConfirm";

// Karşılama — ROADMAP §O2. Bekleme listesi + müsait (hazır) masaya oturtma.
// Kayıt zorunlu değil (Gökhan: "sistemde kayıt olur, o artık mekana kalmış") — sağdaki
// müsait masalar listesinden doğrudan da oturtulabilir, bekleme listesi şart değil.
// Sıra sırayla ilerler ama son karar karşılamada: kim oturacağını karşılama seçer,
// program sadece sırayı gösterir, otomatik atama yapmaz.

type Waiting = { id: string; guest_name: string; guest_phone: string | null; party_size: number; created_at: string };
type TableRow = { id: string; name: string; seat_count: number };

const bekleyenSure = (createdAt: string, now: number) => {
  const dk = Math.max(0, Math.round((now - Date.parse(createdAt)) / 60000));
  return dk < 60 ? `${dk} dk` : `${Math.floor(dk / 60)}s ${dk % 60}dk`;
};

export default function Karsilama() {
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const [readyTables, setReadyTables] = useState<TableRow[]>([]);
  const [now, setNow] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [fName, setFName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fParty, setFParty] = useState("2");

  // Oturtma akışı: ya bekleme listesinden birini seçip masa seçersin, ya da hiç
  // seçmeden bir masaya tıklayıp "kaç kişi" diye hızlıca oturtursun (kayıtsız yol).
  const [seatingFor, setSeatingFor] = useState<{ entryId: string | null } | null>(null);
  const [quickParty, setQuickParty] = useState("2");

  const load = useCallback(async () => {
    const restId = await getMyRestaurantId();
    if (!restId) return;
    setRestaurantId(restId);
    const [{ data: w }, { data: t }] = await Promise.all([
      supabase.from("waitlist_entries").select("id, guest_name, guest_phone, party_size, created_at")
        .eq("restaurant_id", restId).eq("status", "bekliyor").order("created_at"),
      supabase.from("restaurant_tables").select("id, name, seat_count")
        .eq("restaurant_id", restId).eq("status", "empty").is("deleted_at", null).order("seat_count"),
    ]);
    setWaiting((w as Waiting[]) ?? []);
    setReadyTables((t as TableRow[]) ?? []);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, [load]);
  useEffect(() => { setNow(Date.now()); const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);

  const addWaiting = async () => {
    if (!restaurantId || !fName.trim()) return;
    const parti = Math.max(1, parseInt(fParty, 10) || 1);
    setBusy(true); setErr(null);
    const { error } = await supabase.from("waitlist_entries").insert({
      restaurant_id: restaurantId, guest_name: toTitleTr(fName), guest_phone: fPhone.trim() || null, party_size: parti,
    });
    if (error) { setErr(error.message); setBusy(false); return; }
    setFName(""); setFPhone(""); setFParty("2");
    setBusy(false);
    await load();
  };

  const cancelWaiting = async (w: Waiting) => {
    const ok = await confirm(`${w.guest_name} bekleme listesinden çıkarılsın mı?`);
    if (!ok) return;
    await supabase.from("waitlist_entries").update({ status: "iptal" }).eq("id", w.id);
    await load();
  };

  const seatAt = async (tableId: string) => {
    if (!restaurantId || !seatingFor) return;
    setBusy(true); setErr(null);
    const staff = getStaffSession();
    if (seatingFor.entryId) {
      const { error } = await supabase.rpc("seat_waitlist_entry", { p_entry_id: seatingFor.entryId, p_table_id: tableId, p_staff_id: staff?.id ?? null });
      if (error) { setErr(error.message); setBusy(false); return; }
    } else {
      const parti = Math.max(1, parseInt(quickParty, 10) || 1);
      const { error } = await supabase.rpc("open_table_order", { p_restaurant_id: restaurantId, p_table_id: tableId, p_party_size: parti, p_staff_id: staff?.id ?? null });
      if (error) { setErr(error.message); setBusy(false); return; }
    }
    setSeatingFor(null); setQuickParty("2"); setBusy(false);
    await load();
  };

  return (
    <div style={{ padding: "26px 28px", height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      {confirmDialog}
      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", lineHeight: 1, marginBottom: 14, flexShrink: 0 }}>Karşılama</div>
      {err && <div style={{ fontSize: 12.5, color: "var(--danger)", marginBottom: 10, flexShrink: 0 }}>{err}</div>}

      <div style={{ display: "flex", gap: 16, flex: 1, minHeight: 0 }}>
        {/* BEKLEME LİSTESİ */}
        <div style={{ flex: 1.2, minWidth: 340, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <SectionLabel>Bekleme listesi</SectionLabel>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {waiting.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>Bekleyen yok.</div>}
            {waiting.map((w, i) => (
              <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                <span className="tnum" style={{ fontSize: 12, color: "var(--muted-2)", width: 18 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{w.guest_name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                    {w.party_size} kişi{w.guest_phone ? ` · ${w.guest_phone}` : ""} · {bekleyenSure(w.created_at, now)}
                  </div>
                </div>
                <button onClick={() => setSeatingFor({ entryId: w.id })} disabled={busy || readyTables.length === 0} style={{ ...btnSmall, opacity: readyTables.length === 0 ? 0.5 : 1 }}>Oturt</button>
                <button onClick={() => cancelWaiting(w)} style={{ all: "unset", cursor: "pointer", fontSize: 12, color: "var(--muted-2)" }}>İptal</button>
              </div>
            ))}
          </div>
          <div style={{ borderTop: "1px solid var(--line)", marginTop: 8, paddingTop: 12, flexShrink: 0 }}>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 8 }}>Bekleme listesine ekle</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <input value={fName} onChange={(e) => setFName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addWaiting()} placeholder="İsim soyisim" style={{ ...inp, flex: "1 1 140px" }} />
              <input value={fPhone} onChange={(e) => setFPhone(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addWaiting()} placeholder="Telefon (opsiyonel)" inputMode="tel" style={{ ...inp, width: 150 }} />
              <input value={fParty} onChange={(e) => setFParty(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && addWaiting()} placeholder="Kişi" inputMode="numeric" style={{ ...inp, width: 62 }} />
              <button onClick={addWaiting} disabled={busy || !fName.trim()} style={{ ...btnPrimary, opacity: !fName.trim() ? 0.5 : 1 }}><Plus size={14} /></button>
            </div>
          </div>
        </div>

        {/* HAZIR MASALAR */}
        <div style={{ flex: 1, minWidth: 280, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <SectionLabel>Hazır masalar</SectionLabel>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
            {readyTables.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>Hazır masa yok.</div>}
            {readyTables.map((t) => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
                <span style={{ fontSize: 13.5, color: "var(--ink)" }}>{t.name}</span>
                <span className="tnum" style={{ fontSize: 12, color: "var(--muted)" }}>{t.seat_count} koltuk</span>
              </div>
            ))}
          </div>
          {!seatingFor && (
            <button onClick={() => setSeatingFor({ entryId: null })} disabled={readyTables.length === 0} style={{ ...btnSecondary, marginTop: 10, opacity: readyTables.length === 0 ? 0.5 : 1 }}>
              Kayıtsız doğrudan otur
            </button>
          )}
        </div>
      </div>

      {/* MASA SEÇİM KATMANI — bekleme listesinden ya da doğrudan oturtma tetiklendiğinde */}
      {seatingFor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={() => setSeatingFor(null)}>
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 22, minWidth: 320, maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-green)", marginBottom: 4 }}>
              {seatingFor.entryId ? waiting.find((w) => w.id === seatingFor.entryId)?.guest_name ?? "Misafir" : "Doğrudan oturt"}
            </div>
            {!seatingFor.entryId && (
              <>
                <label style={mealLbl}>Kişi sayısı</label>
                <input value={quickParty} onChange={(e) => setQuickParty(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className="tnum" style={{ ...mealInp, marginBottom: 12 }} />
              </>
            )}
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Hangi masaya oturtuyorsun?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
              {readyTables.map((t) => (
                <button key={t.id} onClick={() => seatAt(t.id)} disabled={busy} style={{ ...btnSecondary, justifyContent: "space-between", display: "flex" }}>
                  <span>{t.name}</span>
                  <span className="tnum" style={{ color: "var(--muted)" }}>{t.seat_count} koltuk</span>
                </button>
              ))}
            </div>
            <button onClick={() => setSeatingFor(null)} style={{ all: "unset", cursor: "pointer", fontSize: 13, color: "var(--muted)", marginTop: 14, display: "block" }}>Vazgeç</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "var(--muted)", marginBottom: 10, flexShrink: 0 }}>{children}</div>;
}
const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "8px 10px", fontSize: 13, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0 };
const mealLbl: React.CSSProperties = { display: "block", fontSize: 11.5, color: "var(--muted)", marginBottom: 4 };
const mealInp: React.CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid var(--line-2)", borderRadius: 10, padding: "9px 10px", fontSize: 13.5, background: "var(--card)", color: "var(--ink)", outline: "none" };
const btnPrimary: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 980, padding: "9px 14px", background: "var(--brand-strong)", color: "#fff", fontSize: 13, fontWeight: 500, flexShrink: 0 };
const btnSecondary: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 16px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13, cursor: "pointer" };
const btnSmall: React.CSSProperties = { border: "none", borderRadius: 980, padding: "7px 14px", background: "var(--ink-green)", color: "#fff", fontSize: 12.5, flexShrink: 0, cursor: "pointer" };
