"use client";

import { useCallback, useRef, useState } from "react";

// window.confirm() yerine programın kendi tasarımıyla, TEK standart onay penceresi — tüm
// sayfalarda aynı bileşen, aynı görünüm. Gökhan: "rezervasyon iptalinde çıkan pencerede
// seçenekler Vazgeç/Sil, evet/hayır olmalı, bu pencereler standart değil, standarta oturt,
// her uyarı penceresi aynı özelliklere sahip olsun." Eskiden buton yazıları hep sabit
// "Vazgeç"/"Sil" idi — gerçek bir silme olmayan sorularda ("iptal edilsin mi?", "devam
// edilsin mi?") "Sil" yanlış/kafa karıştırıcıydı. Artık her çağrı kendi metnine uygun
// etiketi seçebiliyor, varsayılan hep aynı: Evet/Hayır.
//
// Kullanım:
//   const { confirm, dialog } = useConfirm();
//   const ok = await confirm("Silinsin mi?", { confirmLabel: "Sil" }); // gerçek silme
//   const ok2 = await confirm("İptal edilsin mi?"); // varsayılan: Evet/Hayır
//   ...sayfanın JSX kökünde: {dialog}
type ConfirmOptions = {
  confirmLabel?: string; // varsayılan "Evet" — gerçek silme işlemlerinde "Sil" verilir
  cancelLabel?: string; // varsayılan "Hayır"
  danger?: boolean; // varsayılan true (kırmızı buton) — geri alınamaz/riskli olmayan sıradan
  // sorularda (ör. "ayrılsın mı?") false verilip nötr (marka rengi) buton kullanılır
};

export function useConfirm() {
  const [state, setState] = useState<{ message: string; opts: ConfirmOptions } | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((msg: string, opts?: ConfirmOptions) => {
    setState({ message: msg, opts: opts ?? {} });
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const settle = (v: boolean) => {
    setState(null);
    resolver.current?.(v);
    resolver.current = null;
  };

  const dialog = state !== null && (
    <>
      <div onClick={() => settle(false)} style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", zIndex: 90 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 91, width: "min(380px, 90vw)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 22, boxShadow: "0 18px 50px rgba(30,57,50,.18)" }}>
        <div style={{ fontSize: 14.5, color: "var(--ink)", lineHeight: 1.5, marginBottom: 20 }}>{state.message}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => settle(false)} style={{ border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 18px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13.5 }}>{state.opts.cancelLabel ?? "Hayır"}</button>
          <button onClick={() => settle(true)} style={{ border: "none", borderRadius: 980, padding: "9px 18px", background: (state.opts.danger ?? true) ? "var(--danger)" : "var(--brand-strong)", color: "#fff", fontSize: 13.5, fontWeight: 500 }}>{state.opts.confirmLabel ?? "Evet"}</button>
        </div>
      </div>
    </>
  );

  return { confirm, dialog };
}
