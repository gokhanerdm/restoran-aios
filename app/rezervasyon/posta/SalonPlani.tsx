"use client";

import { useEffect, useRef, useState } from "react";
import { govdeOlcusu, PX_PER_CM, BOX_W, BOX_H, type Shape, type MasaOlcusu } from "../masaOlcu";
import { SALON_CIZGISI } from "../salonKurallari";

// POSTA EKRANININ SALON PLANI (Gökhan, 2026-08-17: "posta ekranında da salonları aynı salon
// ekranındaki gibi görelim").
//
// Salon ekranının çizimiyle aynı geometri — masalar gerçek yerlerinde, gerçek ölçülerinde —
// ama masalar sürüklenmiyor, düzenlenmiyor. Buradaki tek iş masanın kimin postasında olduğunu
// göstermek.
//
// Plan, kutuya kendiliğinden sığıyor: salon 8 metre de olsa telefonun ekranına giriyor. Salon
// ölçüsü girilmemişse masaların kapladığı alana göre hesaplanıyor.
//
// ELLE BÜYÜTME (Gökhan, 2026-08-17: "salonu elle büyütmek istediğimde sadece salon büyüsün ve
// masalar yakınlaşsın, tüm ekran büyüyor"): iki parmakla (ve masaüstünde tekerlekle) sadece
// bu kutu yakınlaşıyor, sayfanın kendisi değil. Sığdırma oranının altına inilmiyor.

export type PlanMasasi = {
  id: string; name: string; seat_count: number; shape: Shape; rotated: boolean;
  position_x: number | null; position_y: number | null;
};

export default function SalonPlani({
  masalar, ozelOlculer, genislikCm, derinlikCm, renkOf, benimPostam, altYazi, garsonYazi, onMasaTikla, onZoomDegisti,
}: {
  masalar: PlanMasasi[];
  ozelOlculer: MasaOlcusu[];
  genislikCm: number | null;
  derinlikCm: number | null;
  /** Masanın rengi — kimin postasındaysa onun rengi, boşsa null. */
  renkOf: (masaId: string) => string | null;
  /** Giriş yapanın kendi masaları — altın halkayla yanıyor. */
  benimPostam: Set<string>;
  /** Masanın altında görünecek ikinci satır (misafir adı ya da kapasite). */
  altYazi?: (masaId: string) => string;
  /** Üçüncü satır — masaya bakan garson (Gökhan, 2026-08-17: "postaya garson eklediğimde
   *  masada yazsın garsonu"). Boş dönerse satır çizilmiyor. */
  garsonYazi?: (masaId: string) => string | null;
  onMasaTikla?: (masaId: string) => void;
  /** Elle yakınlaştırma oranı değişince haber verir — yakınken salon kaydırması kapanıyor. */
  onZoomDegisti?: (oran: number) => void;
}) {
  const kutuRef = useRef<HTMLDivElement | null>(null);
  const [kutu, setKutu] = useState({ en: 0, boy: 0 });
  const [elZoom, setElZoom] = useState(1);
  const elZoomRef = useRef(1);

  useEffect(() => {
    const el = kutuRef.current;
    if (!el) return;
    const olc = () => setKutu({ en: el.clientWidth, boy: el.clientHeight });
    olc();
    const ro = new ResizeObserver(olc);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { elZoomRef.current = elZoom; onZoomDegisti?.(elZoom); }, [elZoom, onZoomDegisti]);

  // İKİ PARMAKLA YAKINLAŞTIRMA — dinleyiciler native ve passive:false, çünkü tarayıcı React'in
  // kendi bağladığı olaylarda preventDefault'u yok sayıyor; engellemezsek sayfanın tamamı
  // yakınlaşıyor. Salon ekranındaki çözümün aynısı.
  useEffect(() => {
    const el = kutuRef.current;
    if (!el) return;
    let basMesafe = 0;
    let basZoom = 1;
    const mesafe = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const basla = (e: TouchEvent) => {
      if (e.touches.length === 2) { basMesafe = mesafe(e.touches); basZoom = elZoomRef.current; }
    };
    const kaydir = (e: TouchEvent) => {
      if (e.touches.length === 2 && basMesafe > 0) {
        e.preventDefault();
        setElZoom(Math.min(6, Math.max(1, basZoom * (mesafe(e.touches) / basMesafe))));
      }
    };
    const bitir = () => { basMesafe = 0; };
    el.addEventListener("touchstart", basla, { passive: true });
    el.addEventListener("touchmove", kaydir, { passive: false });
    el.addEventListener("touchend", bitir, { passive: true });
    return () => {
      el.removeEventListener("touchstart", basla);
      el.removeEventListener("touchmove", kaydir);
      el.removeEventListener("touchend", bitir);
    };
  }, []);

  // iPhone Safari sayfa yakınlaştırmasını ayrı "gesture" olaylarıyla yapıyor — plan ekrandayken
  // onlar da kapatılıyor. Sadece dokunmatik cihazda.
  useEffect(() => {
    if (typeof window === "undefined" || !("ontouchstart" in window)) return;
    const engelle = (e: Event) => e.preventDefault();
    const olaylar = ["gesturestart", "gesturechange", "gestureend"];
    olaylar.forEach((ad) => document.addEventListener(ad, engelle, { passive: false }));
    return () => olaylar.forEach((ad) => document.removeEventListener(ad, engelle));
  }, []);

  // Masaüstünde fare tekerleği.
  useEffect(() => {
    const el = kutuRef.current;
    if (!el) return;
    const tekerlek = (e: WheelEvent) => {
      e.preventDefault();
      const kat = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      setElZoom((z) => Math.min(6, Math.max(1, z * kat)));
    };
    el.addEventListener("wheel", tekerlek, { passive: false });
    return () => el.removeEventListener("wheel", tekerlek);
  }, []);

  // Salonun piksel ölçüsü: ayarlardan geldiyse ondan, gelmediyse masaların kapladığı alandan.
  const olculer = masalar.map((m) => {
    const o = govdeOlcusu(m.shape, m.seat_count, ozelOlculer);
    const govde = m.shape === "dikdortgen" && m.rotated ? { width: o.height, height: o.width } : o;
    const x = (m.position_x ?? 0) + (BOX_W - govde.width) / 2;
    const y = (m.position_y ?? 0) + (BOX_H - govde.height) / 2;
    return { m, govde, x, y };
  });
  const enGenis = Math.max(1, ...olculer.map((o) => o.x + o.govde.width));
  const enDerin = Math.max(1, ...olculer.map((o) => o.y + o.govde.height));
  const planW = genislikCm ? genislikCm * PX_PER_CM : enGenis + 20;
  const planH = derinlikCm ? derinlikCm * PX_PER_CM : enDerin + 20;
  const odaVar = !!(genislikCm && derinlikCm);

  // KUTUYA SIĞDIR VE YÖNÜNÜ KENDİ SEÇ (Gökhan, 2026-08-17: "beyaz karta açılsın, sığacak
  // şekilde yönünü belirlesin"). Salon dik, kart yatık olabiliyor; planı çevirince aynı yere
  // çok daha büyük sığıyor. İki yönün ölçeği hesaplanıp büyük olan seçiliyor. Asla büyütme,
  // sadece küçült.
  const olcus = kutu.en > 0 && kutu.boy > 0;
  const duz = olcus ? Math.min(1, kutu.en / planW, kutu.boy / planH) : 1;
  const cevrik = olcus ? Math.min(1, kutu.en / planH, kutu.boy / planW) : 0;
  const cevir = cevrik > duz;
  // Sığdırma oranı ile elle yakınlaştırma birlikte uygulanıyor.
  const olcek = Math.max(duz, cevrik) * elZoom;
  const cizimEni = (cevir ? planH : planW) * olcek;
  const cizimBoyu = (cevir ? planW : planH) * olcek;
  const yakin = elZoom > 1;

  return (
    <div ref={kutuRef} style={{
      flex: 1, minHeight: 0, width: "100%",
      // Yakınlaşınca plan kutudan taşar; parmakla kaydırarak gezilir.
      overflow: yakin ? "auto" : "hidden",
      touchAction: "pan-x pan-y",
      display: "flex",
      alignItems: yakin ? "flex-start" : "center",
      justifyContent: yakin ? "flex-start" : "center",
    }}>
      <div style={{
        position: "relative", width: cizimEni, height: cizimBoyu, flexShrink: 0,
        // Salonun ölçüsü girilmişse çerçeveyi aşağıdaki yeşil salon çizgisi veriyor.
        border: odaVar ? undefined : "1px solid var(--line)",
        borderRadius: 12, background: odaVar ? undefined : "var(--recede)",
        boxSizing: "border-box", overflow: "hidden",
      }}>
      <div style={{
        position: "absolute", top: 0, left: 0, width: planW, height: planH,
        transformOrigin: "top left",
        transform: cevir
          ? `translate(${planH * olcek}px, 0) rotate(90deg) scale(${olcek})`
          : `scale(${olcek})`,
      }}>
        {/* SALONUN YEŞİL ÇİZGİSİ — salon ekranındakinin aynısı (Gökhan, 2026-08-17: "posta
            ekranında da salonun etrafındaki yeşil çizgi olsun"). Ölçüsü girilmiş salonlarda
            çıkıyor; ölçü yoksa çizilecek bir duvar da yok. */}
        {odaVar && (
          <div style={{
            position: "absolute", left: 0, top: 0, width: planW, height: planH,
            border: `${SALON_CIZGISI}px solid var(--brand-strong)`, borderRadius: 20,
            background: "var(--recede)", boxSizing: "border-box", pointerEvents: "none",
          }} />
        )}
        {olculer.map(({ m, govde, x, y }) => {
          const renk = renkOf(m.id);
          const benim = benimPostam.has(m.id);
          const yaziOlcek = Math.max(0.55, Math.min(1, Math.min(govde.width, govde.height) / 64));
          return (
            <div
              key={m.id}
              onClick={() => onMasaTikla?.(m.id)}
              style={{
                position: "absolute", left: x, top: y, width: govde.width, height: govde.height,
                boxSizing: "border-box", cursor: onMasaTikla ? "pointer" : "default",
                borderRadius: m.shape === "yuvarlak" ? "50%" : m.shape === "loca" ? 16 : 10,
                border: renk ? `2px solid ${renk}` : "1px solid var(--line-2)",
                background: renk ? `${renk}26` : "var(--card)",
                ...(benim ? { boxShadow: "0 0 0 3px var(--gold)" } : {}),
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 1, padding: 3, overflow: "hidden",
              }}
            >
              {/* Plan çevrildiğinde yazı ters durmasın diye geri çevriliyor. */}
              <div style={{
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                gap: 1, maxWidth: "100%", transform: cevir ? "rotate(-90deg)" : undefined,
              }}>
                <span style={{ fontSize: 12.5 * yaziOlcek, fontWeight: 700, color: "var(--ink-green)", lineHeight: 1.1 }}>{m.name}</span>
                {altYazi && (
                  <span style={{ fontSize: 10 * yaziOlcek, color: "var(--muted-2)", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {altYazi(m.id)}
                  </span>
                )}
                {garsonYazi?.(m.id) && (
                  <span style={{
                    fontSize: 9.5 * yaziOlcek, fontWeight: 600, color: renk ?? "var(--muted)",
                    maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {garsonYazi(m.id)}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}
