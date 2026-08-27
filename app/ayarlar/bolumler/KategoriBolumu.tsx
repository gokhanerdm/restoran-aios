"use client";

// Ayarlar — Kategoriler bölümü: kategori bazlı KDV / hedef food cost / servis sırası.
// Satırlar ortak liste takımıyla (ListRow ailesi) çizilir — ekran kuralındaki
// "satır tabanlı liste" kalıbı. State sayfada durur; burası sadece çizer.

import { ListHeader, HeaderCell, ListRow, Cell } from "@/app/components/ListRow";
import { kutuDar } from "@/lib/olcu";

export type KategoriTaslak = Record<string, { vat: string; food: string; course: string }>;

export default function KategoriBolumu({
  flatCats, catDrafts, setCatDrafts, defaultVat,
}: {
  flatCats: { id: string; label: string }[];
  catDrafts: KategoriTaslak;
  setCatDrafts: React.Dispatch<React.SetStateAction<KategoriTaslak>>;
  defaultVat: number;
}) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>Boş bırakılırsa varsayılan KDV / hedef food cost kullanılır.</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.6 }}>
        <b>Servis sırası</b> (ROADMAP §O5): Başlangıçlar 1, Ana yemek 2, Tatlı 3 gibi — boş
        bırakılan kategoriler (içecekler) sıraya girmez, her zaman anında gider. Genel
        Ayarlar&apos;daki anahtar açılmadıkça bu sütunun hiçbir etkisi olmaz.
      </div>

      <ListHeader>
        <HeaderCell flex>Kategori</HeaderCell>
        <HeaderCell width={90} align="right">KDV %</HeaderCell>
        <HeaderCell width={120} align="right">Hedef FC %</HeaderCell>
        <HeaderCell width={80} align="right">Servis #</HeaderCell>
      </ListHeader>
      {flatCats.map((c) => (
        <ListRow key={c.id}>
          <Cell flex>
            <span style={{ paddingLeft: 12, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{c.label}</span>
          </Cell>
          <Cell width={90} align="right">
            <input value={catDrafts[c.id]?.vat ?? ""} onChange={(e) => setCatDrafts((d) => ({ ...d, [c.id]: { ...d[c.id], vat: e.target.value } }))} placeholder={String(defaultVat)} inputMode="decimal" className="tnum" style={{ ...kutuDar, textAlign: "right" }} />
          </Cell>
          <Cell width={120} align="right">
            <input value={catDrafts[c.id]?.food ?? ""} onChange={(e) => setCatDrafts((d) => ({ ...d, [c.id]: { ...d[c.id], food: e.target.value } }))} placeholder="—" inputMode="decimal" className="tnum" style={{ ...kutuDar, textAlign: "right" }} />
          </Cell>
          <Cell width={80} align="right">
            <input value={catDrafts[c.id]?.course ?? ""} onChange={(e) => setCatDrafts((d) => ({ ...d, [c.id]: { ...d[c.id], course: e.target.value.replace(/[^\d]/g, "") } }))} placeholder="—" inputMode="numeric" className="tnum" style={{ ...kutuDar, textAlign: "right" }} />
          </Cell>
        </ListRow>
      ))}
      {flatCats.length === 0 && <div style={{ color: "var(--muted-2)", fontSize: 13, padding: "10px 0" }}>Henüz kategori yok — önce Menü sayfasından ekle.</div>}
    </div>
  );
}
