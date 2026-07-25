"use client";

import { useCallback, useRef, useState } from "react";

// window.confirm() yerine programın kendi tasarımıyla onay penceresi. Kullanım:
//   const { confirm, dialog } = useConfirm();
//   const ok = await confirm("Silinsin mi?");
//   ...sayfanın JSX kökünde: {dialog}
export function useConfirm() {
  const [message, setMessage] = useState<string | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((msg: string) => {
    setMessage(msg);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const settle = (v: boolean) => {
    setMessage(null);
    resolver.current?.(v);
    resolver.current = null;
  };

  const dialog = message !== null && (
    <>
      <div onClick={() => settle(false)} style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", zIndex: 90 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 91, width: "min(380px, 90vw)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 22, boxShadow: "0 18px 50px rgba(30,57,50,.18)" }}>
        <div style={{ fontSize: 14.5, color: "var(--ink)", lineHeight: 1.5, marginBottom: 20 }}>{message}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => settle(false)} style={{ border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 18px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13.5 }}>Vazgeç</button>
          <button onClick={() => settle(true)} style={{ border: "none", borderRadius: 980, padding: "9px 18px", background: "var(--danger)", color: "#fff", fontSize: 13.5, fontWeight: 500 }}>Sil</button>
        </div>
      </div>
    </>
  );

  return { confirm, dialog };
}
