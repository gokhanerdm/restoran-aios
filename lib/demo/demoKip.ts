// DEMO KİPİ ANAHTARI (Gökhan, 2026-08-27: veritabanı uykudayken program test
// edilebilsin). Adrese ?demo=1 eklenince açılır ve cihazda kayıtlı kalır;
// ?demo=0 kapatır. Açıkken program gerçek veritabanına HİÇ bağlanmaz,
// lib/demo/demoClient.ts sahte veriyle cevap verir.
//
// Normal kullanımda görünmez: anahtar yazılmadıkça program bugünkü gibi davranır.

const ANAHTAR = "demo-kipi";

export function demoAktif(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const p = new URLSearchParams(window.location.search).get("demo");
    if (p === "1") { localStorage.setItem(ANAHTAR, "1"); return true; }
    if (p === "0") { localStorage.removeItem(ANAHTAR); return false; }
    return localStorage.getItem(ANAHTAR) === "1";
  } catch {
    return false;
  }
}
