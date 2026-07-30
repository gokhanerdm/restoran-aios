"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase/client";
import { getMyRestaurantId } from "@/lib/supabase/restaurant";
import { useConfirm } from "../components/useConfirm";
import { toTitleTr } from "@/lib/text";
import { Plus, Trash2, KeyRound } from "lucide-react";
import EditableText from "../components/EditableText";

type Staff = { id: string; full_name: string; role: string; active: boolean; gross_salary: number };
const money = (n: number) => `${Math.round(n).toLocaleString("tr-TR")} ₺`;
const r2 = (n: number) => Math.round(n * 100) / 100;

const ROLES = [
  { v: "garson", l: "Garson" },
  { v: "mutfak", l: "Mutfak" },
  { v: "bar", l: "Bar" },
  { v: "kasa", l: "Kasa" },
  { v: "sef", l: "Şef" },
  { v: "yonetici", l: "Yönetici" },
  { v: "karsilama", l: "Karşılama" },
  { v: "vale", l: "Vale" },
  { v: "bulasik", l: "Bulaşık" },
] as const;
const roleLabel = (v: string) => ROLES.find((r) => r.v === v)?.l ?? v;

export default function Personel() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<string>("garson");
  const [err, setErr] = useState<string | null>(null);
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [newPin, setNewPin] = useState("");
  const [sgkRate, setSgkRate] = useState("0");

  const load = useCallback(async () => {
    const restId = await getMyRestaurantId();
    if (!restId) return;
    setRestaurantId(restId);
    const [{ data }, { data: st }] = await Promise.all([
      supabase.from("staff_members").select("id, full_name, role, active, gross_salary").eq("restaurant_id", restId).is("deleted_at", null).order("created_at"),
      supabase.from("restaurant_settings").select("sgk_employer_rate").eq("restaurant_id", restId).maybeSingle(),
    ]);
    setStaff((data as Staff[]) ?? []);
    setSgkRate(String((st as { sgk_employer_rate: number } | null)?.sgk_employer_rate ?? 0));
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!restaurantId || !name.trim() || pin.trim().length < 4) { setErr("İsim ve en az 4 haneli PIN gerekli."); return; }
    setErr(null);
    const { error } = await supabase.rpc("add_staff_member", {
      p_restaurant_id: restaurantId, p_full_name: toTitleTr(name), p_pin: pin.trim(), p_role: role,
    });
    if (error) { setErr(error.message); return; }
    setName(""); setPin("");
    await load();
  };

  const toggleActive = async (s: Staff) => {
    await supabase.from("staff_members").update({ active: !s.active }).eq("id", s.id);
    await load();
  };

  const remove = async (s: Staff) => {
    const ok = await confirm(`${s.full_name} silinsin mi? Geçmiş kayıtları (kimin ne sattığı) etkilenmez, sadece giriş yapamaz olur.`);
    if (!ok) return;
    await supabase.from("staff_members").update({ deleted_at: new Date().toISOString() }).eq("id", s.id);
    await load();
  };

  const submitNewPin = async (staffId: string) => {
    if (newPin.trim().length < 4) return;
    await supabase.rpc("set_staff_pin", { p_staff_id: staffId, p_new_pin: newPin.trim() });
    setPinFor(null); setNewPin("");
  };

  const updateSalary = async (id: string, value: string) => {
    await supabase.from("staff_members").update({ gross_salary: parseFloat(value.replace(",", ".")) || 0 }).eq("id", id);
    await load();
  };

  const saveSgkRate = async () => {
    if (!restaurantId) return;
    const rate = parseFloat(sgkRate.replace(",", ".")) || 0;
    await supabase.from("restaurant_settings").upsert({ restaurant_id: restaurantId, sgk_employer_rate: rate }, { onConflict: "restaurant_id" });
    await load();
  };

  return (
    <div style={{ padding: "26px 28px", height: "calc(100vh - 4px)", display: "flex", flexDirection: "column", boxSizing: "border-box" }}>
      {confirmDialog}
      <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.5px", color: "var(--ink-green)", marginBottom: 20, flexShrink: 0 }}>Personel</div>

      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 20, display: "flex", flexDirection: "column", flex: 1, minHeight: 0, maxWidth: 880 }}>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, flexShrink: 0 }}>
          Garson/mutfak/bar cihazlarında giriş için isim + PIN yeterli — e-posta/hesap gerekmez. Her personelin kendi Profil sayfası vardır (satışı, kaç masaya hizmet ettiği). Brüt maaş ve SGK toplamı Ana Sayfa'daki Sabit Gider'e buradan otomatik yansır.
        </div>

        <div style={{ display: "flex", fontSize: 11, color: "var(--muted-2)", padding: "0 0 8px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
          <span style={{ flex: 1.2 }}>İsim</span>
          <span style={{ flex: 0.8 }}>Rol</span>
          <span style={{ width: 90, textAlign: "right" }}>Brüt Maaş</span>
          <span style={{ width: 80, textAlign: "right" }}>SGK</span>
          <span style={{ width: 60, textAlign: "center" }}>Aktif</span>
          <span style={{ width: 90 }} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
          {staff.map((s) => (
            <div key={s.id} style={{ padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
              <div style={{ display: "flex", alignItems: "center", fontSize: 13.5 }}>
                <Link href={`/profil?staff=${s.id}`} style={{ flex: 1.2, color: "var(--ink)", textDecoration: "none", fontWeight: 500 }}>{s.full_name}</Link>
                <span style={{ flex: 0.8, color: "var(--muted)" }}>{roleLabel(s.role)}</span>
                <span style={{ width: 90, textAlign: "right" }}>
                  <EditableText value={String(r2(s.gross_salary))} onSave={(v) => updateSalary(s.id, v)} style={{ display: "inline-block" }} inputWidth={70} />
                </span>
                <span className="tnum" style={{ width: 80, textAlign: "right", color: "var(--muted)" }}>
                  {money(s.gross_salary * (parseFloat(sgkRate.replace(",", ".")) || 0) / 100)}
                </span>
                <span style={{ width: 60, textAlign: "center" }}>
                  <input type="checkbox" checked={s.active} onChange={() => toggleActive(s)} />
                </span>
                <span style={{ width: 90, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => { setPinFor(pinFor === s.id ? null : s.id); setNewPin(""); }} aria-label="PIN değiştir" style={{ all: "unset", cursor: "pointer", color: "var(--muted-2)", display: "inline-flex" }}><KeyRound size={14} /></button>
                  <button onClick={() => remove(s)} aria-label="sil" style={{ all: "unset", cursor: "pointer", color: "var(--muted-2)", display: "inline-flex" }}><Trash2 size={14} /></button>
                </span>
              </div>
              {pinFor === s.id && (
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && submitNewPin(s.id)} placeholder="Yeni PIN (en az 4 hane)" inputMode="numeric" style={{ ...inp, flex: 1 }} autoFocus />
                  <button onClick={() => submitNewPin(s.id)} style={btnSmall}>Kaydet</button>
                </div>
              )}
            </div>
          ))}
          {staff.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>Henüz personel yok.</div>}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--line)", marginTop: 4, fontSize: 13, flexShrink: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--muted)" }}>SGK işveren oranı</span>
            <input value={sgkRate} onChange={(e) => setSgkRate(e.target.value)} onBlur={saveSgkRate} onKeyDown={(e) => e.key === "Enter" && saveSgkRate()} inputMode="decimal" style={{ ...inp, width: 55, padding: "6px 8px" }} />
            <span style={{ color: "var(--muted)" }}>%</span>
          </span>
          <span style={{ fontWeight: 600, color: "var(--ink-green)" }}>
            Toplam maaş: <span className="tnum">{money(staff.filter((s) => s.active).reduce((s, x) => s + Number(x.gross_salary), 0))}</span>
            {" · "}Toplam SGK: <span className="tnum">{money(staff.filter((s) => s.active).reduce((s, x) => s + Number(x.gross_salary), 0) * (parseFloat(sgkRate.replace(",", ".")) || 0) / 100)}</span>
          </span>
        </div>

        <div style={{ flexShrink: 0, marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
          {err && <div style={{ marginBottom: 8, fontSize: 12.5, color: "var(--danger)" }}>{err}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="İsim" style={{ ...inp, flex: 1.4 }} />
            <select value={role} onChange={(e) => setRole(e.target.value)} style={{ ...inp, flex: 1 }}>
              {ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
            </select>
            <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="PIN" inputMode="numeric" style={{ ...inp, width: 100 }} />
            <button onClick={submit} style={btnSmall}><Plus size={15} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "9px 12px", fontSize: 14, background: "var(--card)", color: "var(--ink)", outline: "none", minWidth: 0 };
const btnSmall: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, border: "none", borderRadius: 10, padding: "9px 14px", background: "var(--ink-green)", color: "#fff", fontSize: 13.5 };
