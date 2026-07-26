"use client";

import { useEffect } from "react";

// iOS Safari, sayfada bir touchstart dinleyici olmadıkça CSS :active durumunu dokunmatikte
// hiç uygulamıyor (bilinen bir Safari kısıtı) — bu yüzden .tap-feedback gibi dokunma geri
// bildirimleri telefonda çalışmıyordu. Boş bir dinleyici eklemek yeterli, tüm uygulamada
// :active artık dokunmatikte de tetiklenir.
export default function EnableTouchActive() {
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);
  return null;
}
