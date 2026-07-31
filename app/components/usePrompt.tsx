"use client";

import { useCallback, useRef, useState } from "react";

// window.prompt() yerine programın kendi tasarımıyla metin girişi penceresi —
// useConfirm ile aynı kalıp (bkz. useConfirm.tsx), sadece evet/hayır yerine metin döner.
// Kullanım:
//   const { promptFor, dialog } = usePrompt();
//   const note = await promptFor("Rezervasyon notu:", "");
//   if (note == null) return; // Vazgeç'e basıldı (window.prompt ile aynı semantik)
//   ...sayfanın JSX kökünde: {dialog}
export function usePrompt() {
  const [state, setState] = useState<{ message: string } | null>(null);
  const [value, setValue] = useState("");
  const resolver = useRef<((v: string | null) => void) | null>(null);

  const promptFor = useCallback((message: string, defaultValue = "") => {
    setState({ message });
    setValue(defaultValue);
    return new Promise<string | null>((resolve) => { resolver.current = resolve; });
  }, []);

  const settle = (v: string | null) => {
    setState(null);
    resolver.current?.(v);
    resolver.current = null;
  };

  const dialog = state !== null && (
    <>
      <div onClick={() => settle(null)} style={{ position: "fixed", inset: 0, background: "rgba(20,20,15,0.4)", zIndex: 90 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 91, width: "min(380px, 90vw)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 18, padding: 22, boxShadow: "0 18px 50px rgba(30,57,50,.18)" }}>
        <div style={{ fontSize: 14.5, color: "var(--ink)", lineHeight: 1.5, marginBottom: 12 }}>{state.message}</div>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") settle(value); if (e.key === "Escape") settle(null); }}
          style={{ width: "100%", boxSizing: "border-box", border: "1px solid var(--line-2)", borderRadius: 10, padding: "9px 12px", fontSize: 14, background: "var(--card)", color: "var(--ink)", outline: "none", marginBottom: 18 }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => settle(null)} style={{ border: "1px solid var(--line-2)", borderRadius: 980, padding: "9px 18px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13.5 }}>Vazgeç</button>
          <button onClick={() => settle(value)} style={{ border: "none", borderRadius: 980, padding: "9px 18px", background: "var(--brand-strong)", color: "#fff", fontSize: 13.5, fontWeight: 500 }}>Tamam</button>
        </div>
      </div>
    </>
  );

  return { promptFor, dialog };
}
