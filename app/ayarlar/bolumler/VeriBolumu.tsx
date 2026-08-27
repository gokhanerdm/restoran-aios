"use client";

// Ayarlar — Kişisel Veri (KVKK) bölümü: aydınlatma metni, saklama süresi, anonimleştirme.
// Metin ve süre tek Kaydet'le yazılır; ANONİMLEŞTİRME Kaydet'e bağlı DEĞİL — geri
// alınamaz bir eylem, kendi onaylı düğmesiyle burada durur. State sayfada.

import { kutu, kutuCokSatir, dugmeAnaSatir, etiket } from "@/lib/olcu";
import { useConfirm } from "@/app/components/useConfirm";

export type PersonalDataStatus = { retention_days: number; total_records: number; expired_pending: number; anonymized_count: number; oldest_record: string | null };

export default function VeriBolumu({
  kvkkNotice, setKvkkNotice, kvkkDays, setKvkkDays, pdStatus, anonBusy, anonDone, anonymizeNow, kaydet,
}: {
  kvkkNotice: string;
  setKvkkNotice: (v: string) => void;
  kvkkDays: string;
  setKvkkDays: (v: string) => void;
  pdStatus: PersonalDataStatus | null;
  anonBusy: boolean;
  anonDone: number | null;
  anonymizeNow: () => void;
  kaydet: () => void;
}) {
  const { confirm, dialog } = useConfirm();

  const anonimlestir = async () => {
    if (!pdStatus) return;
    const ok = await confirm(`${pdStatus.expired_pending} kayıtta isim ve telefon silinecek. Bu geri alınamaz. Devam edilsin mi?`);
    if (ok) anonymizeNow();
  };

  return (
    <div>
      {/* KVKK — rezervasyon isim/telefon topluyor, QR menü sipariş alıyor: işletme
          veri sorumlusu. Aydınlatma yükümlülüğüne aykırılığın cezası 100.000–1.000.000 TL. */}
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, lineHeight: 1.6 }}>
        Rezervasyonda isim ve telefon topladığınız için işletmeniz veri sorumlusudur.
        Aşağıdaki metin Karşılama ekranında ve QR menüde müşteriye gösterilir.
      </div>

      {!kvkkNotice.trim() && (
        <div style={{ padding: "9px 12px", borderRadius: 10, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
          Aydınlatma metni boş. Bu hâliyle aydınlatma yükümlülüğü yerine getirilmiş sayılmaz.
        </div>
      )}

      <label style={{ ...etiket, display: "block", marginBottom: 4 }}>Aydınlatma metni</label>
      <textarea value={kvkkNotice} onChange={(e) => setKvkkNotice(e.target.value)} rows={8} placeholder="Müşteriye gösterilecek KVKK aydınlatma metni" style={{ ...kutuCokSatir, marginBottom: 6, fontSize: 12.5, lineHeight: 1.55 }} />
      <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 12, lineHeight: 1.55 }}>
        Buradaki metin bir şablondur, hukuki danışmanlıkla kontrol ettirin.
      </div>

      <label style={{ ...etiket, display: "block", marginBottom: 4 }}>Saklama süresi (gün)</label>
      <input value={kvkkDays} onChange={(e) => setKvkkDays(e.target.value)} onKeyDown={(e) => e.key === "Enter" && kaydet()} inputMode="numeric" placeholder="365" className="tnum" style={{ ...kutu, marginBottom: 6 }} />
      <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 12, lineHeight: 1.55 }}>
        Bu süreyi geçen rezervasyonlarda isim ve telefon silinir. Kayıt silinmez —
        kaç kişi, hangi saat, geldi mi bilgisi istatistik için kalır, kişisel veri değildir.
      </div>

      {pdStatus && (
        <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px", marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "2px 0" }}>
            <span style={{ color: "var(--muted)" }}>Kişisel veri taşıyan kayıt</span>
            <span className="tnum">{pdStatus.total_records - pdStatus.anonymized_count}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "2px 0" }}>
            <span style={{ color: "var(--muted)" }}>Anonimleştirilmiş</span>
            <span className="tnum">{pdStatus.anonymized_count}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "2px 0" }}>
            <span style={{ color: pdStatus.expired_pending > 0 ? "var(--danger)" : "var(--muted)", fontWeight: pdStatus.expired_pending > 0 ? 600 : 400 }}>Süresi dolmuş, bekliyor</span>
            <span className="tnum" style={{ color: pdStatus.expired_pending > 0 ? "var(--danger)" : undefined, fontWeight: pdStatus.expired_pending > 0 ? 600 : 400 }}>{pdStatus.expired_pending}</span>
          </div>
          {pdStatus.expired_pending > 0 && (
            <button onClick={anonimlestir} disabled={anonBusy} style={{ ...dugmeAnaSatir, marginTop: 10, opacity: anonBusy ? 0.6 : 1 }}>
              {anonBusy ? "Temizleniyor…" : `${pdStatus.expired_pending} kaydı şimdi anonimleştir`}
            </button>
          )}
          {anonDone != null && (
            <div style={{ fontSize: 12, color: "var(--success)", marginTop: 8 }}>{anonDone} kayıt anonimleştirildi.</div>
          )}
        </div>
      )}
      <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 8, lineHeight: 1.55 }}>
        Anonimleştirme geri alınamaz. Otomatik çalışmaz — ne zaman temizleneceğine siz karar verirsiniz.
      </div>
      {dialog}
    </div>
  );
}
