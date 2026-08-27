"use client";

// Ortak akordiyon — No63'ün ayarlar ekranındaki kalıbın genelleştirilmişi
// (2026-08-27). Alt alta kutular, AYNI ANDA TEK KUTU AÇIK: bölümler uzun,
// ikisi birden açıkken aranan yer kayboluyor. Açılan kutu ekranın başına
// kayar, açık kutunun başlığı yukarı yapışır (lib/yapiskan.ts merdiveni).
//
// Kontrollü bileşen: hangi kutunun açık olduğunu sayfa tutar
// (useState<string | null>), böylece adresten ?bolum=... ile açık başlatmak
// veya kaydetmeden önce bölüme gitmek sayfanın elinde kalır.
//
// KAYDIRMA UYARISI: açılan kutuyu başa getiren hesap, kutuları saran en yakın
// ".sayfa-govde" sınıflı kaydırma alanını arar (SayfaKabugu'nun kayan kipi).
// O sınıf yoksa kutu açılır ama ekran kaymaz.

import { useRef } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { yapiskanBaslik } from "@/lib/yapiskan";
import { kart } from "@/lib/olcu";

export type AkordiyonBolum = {
  kod: string;
  ad: string;
  /** Başlığın sağında, okun solunda duran küçük ek (sayı rozeti gibi). */
  ozet?: React.ReactNode;
  icerik: React.ReactNode;
};

export default function Akordiyon({
  bolumler,
  acik,
  onAc,
  seviye = 1,
}: {
  bolumler: AkordiyonBolum[];
  acik: string | null;
  onAc: (kod: string | null) => void;
  /** Yapışkan başlık basamağı — iç içe akordiyonda 2 veya 3 verilir. */
  seviye?: 1 | 2 | 3;
}) {
  const kutular = useRef<Record<string, HTMLDivElement | null>>({});

  // Yeni bir kutu açılınca ekran o kutunun BAŞINA gidiyor. Uzun bir bölümün
  // sonundayken başka kutuya dokununca, yeni bölüm ekranın en altından
  // açılıyordu — açılan şeyin başını görmüyordun.
  const ac = (kod: string) => {
    const yeni = acik === kod ? null : kod;
    onAc(yeni);
    if (!yeni) return;

    // İki kare bekleniyor: ilki React'in yazmasını, ikincisi yeni yüksekliğin
    // yerleşmesini bekliyor.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const kutu = kutular.current[kod];
        const govde = kutu?.closest(".sayfa-govde") as HTMLElement | null;
        if (!kutu || !govde) return;
        govde.scrollTop +=
          kutu.getBoundingClientRect().top - govde.getBoundingClientRect().top;
      }),
    );
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {bolumler.map((b) => {
        const acikMi = acik === b.kod;
        return (
          <div
            key={b.kod}
            ref={(el) => {
              kutular.current[b.kod] = el;
            }}
            // kart: köşe 14 + çerçeve + overflow "clip". "hidden" DEĞİL:
            // hidden kutuyu bir kaydırma alanı yapıyor ve başlığın yukarı
            // yapışması (sticky) çalışmaz hâle geliyor. "clip" kaydırma alanı
            // açmıyor: hem köşe düzgün kalıyor hem yapışma sürüyor.
            style={kart}
          >
            <button
              onClick={() => ac(b.kod)}
              aria-expanded={acikMi}
              style={{
                all: "unset",
                cursor: "pointer",
                boxSizing: "border-box",
                width: "100%",
                // Bütün kutular aynı yükseklikte.
                minHeight: 44,
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 14px",
                // Açık bölümde başlık yukarı yapışıyor: uzun listede hangi
                // bölümde olduğun kaybolmasın. Merdivenin basamağı seviyeden.
                ...(acikMi ? yapiskanBaslik(seviye) : {}),
              }}
            >
              <span style={{ flex: 1, minWidth: 0, fontSize: 15.5 }}>{b.ad}</span>
              {b.ozet}
              {acikMi ? (
                <ChevronDown size={18} strokeWidth={1.75} color="var(--muted)" />
              ) : (
                <ChevronRight size={18} strokeWidth={1.75} color="var(--muted)" />
              )}
            </button>

            {/* İç boşluk dar: içeride çoğu zaman ikinci bir kutu daha var.
                İkisi de 14px verince telefonda içeriğe yer kalmıyor. */}
            {acikMi && <div style={{ padding: "12px 10px 16px" }}>{b.icerik}</div>}
          </div>
        );
      })}
    </div>
  );
}
