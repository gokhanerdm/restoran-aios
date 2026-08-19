// Kişi kartındaki yapay zekâ bilgilendirmesi (Gökhan, 2026-08-15). Tarayıcı kartın
// bilgilerini buraya gönderir, burada Anthropic'e sorulur, dönen metin tarayıcıya verilir.
// Anahtar SADECE sunucuda durur (.env.local → ANTHROPIC_API_KEY), tarayıcıya hiç geçmez.
//
// Ne zaman çağrılır: kartta yazı yoksa ya da kişi yeni bir ziyaret yaptıysa (bkz.
// ai_ozet_kayit). Kart her açıldığında değil — hem hızlı hem ucuz kalsın diye.
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Ziyaret = {
  reserved_at: string; party_size: number; note: string | null; status: string;
  masa: string | null; cancel_reason?: string | null; hesap_tutari?: number | null;
};
type Govde = {
  isim?: string | null; kartNotu?: string | null; vip?: boolean;
  ziyaretSayisi?: number; gelmediSayisi?: number; iptalSayisi?: number; toplamKayit?: number;
  ilkZiyaret?: string | null; sonZiyaret?: string | null; gecenGun?: number | null;
  ortalamaKisi?: number | null; ortalamaSiklikGun?: number | null;
  enSikGun?: string | null; enSikSaat?: string | null; enSikMasa?: string | null;
  yemekTercihi?: string | null; ickiTercihi?: string | null;
  kullanilanIsimler?: string[];
  gecmis?: Ziyaret[];
};

const DURUM_ADI: Record<string, string> = {
  bekleniyor: "bekleniyor", geldi: "geldi", oturdu: "oturdu",
  tamamlandi: "geldi ve kalktı", gelmedi: "gelmedi", iptal: "iptal etti",
};

const gunAdi = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "2-digit", month: "short", year: "2-digit" })
    .format(new Date(iso));

// Rakamları ve notları düz bir metne çeviriyoruz — model ham JSON'dan çok bunu iyi okuyor.
function bilgiMetni(g: Govde): string {
  const s: string[] = [];
  s.push(`İsim: ${g.isim || "—"}`);
  if (g.vip) s.push("VIP misafir olarak işaretli.");
  if (g.kartNotu) s.push(`Personelin karta yazdığı not: "${g.kartNotu}"`);
  s.push(`Ziyaret: ${g.ziyaretSayisi ?? 0} · Gelmedi: ${g.gelmediSayisi ?? 0} · İptal: ${g.iptalSayisi ?? 0} · Toplam kayıt: ${g.toplamKayit ?? 0}`);
  if (g.ilkZiyaret) s.push(`İlk gelişi: ${gunAdi(g.ilkZiyaret)}`);
  if (g.sonZiyaret) s.push(`Son gelişi: ${gunAdi(g.sonZiyaret)}${g.gecenGun ? ` (${g.gecenGun} gün önce)` : ""}`);
  if (g.ortalamaSiklikGun) s.push(`Ortalama geliş aralığı: ${g.ortalamaSiklikGun} günde bir`);
  if (g.ortalamaKisi) s.push(`Ortalama kişi sayısı: ${g.ortalamaKisi}`);
  if (g.enSikGun) s.push(`En sık geldiği gün: ${g.enSikGun}`);
  if (g.enSikSaat) s.push(`En sık geldiği saat: ${g.enSikSaat}`);
  if (g.enSikMasa) s.push(`En sık oturduğu masa: ${g.enSikMasa}`);
  if (g.yemekTercihi) s.push(`Yemek tercihi: ${g.yemekTercihi}`);
  if (g.ickiTercihi) s.push(`İçki tercihi: ${g.ickiTercihi}`);
  // Aynı numara birden fazla isimle kullanılmışsa bunu modele de söylüyoruz — aynı kişinin
  // yanlış yazılmış adı mı, yoksa numarayı paylaşan iki ayrı kişi mi, yorumu o yapsın.
  if ((g.kullanilanIsimler?.length ?? 0) > 1) {
    s.push(`DİKKAT: Bu numara birden fazla isimle kullanılmış: ${g.kullanilanIsimler!.join(", ")}. Aynı kişinin farklı yazılmış adı da olabilir, numarayı paylaşan iki ayrı kişi de. Geçmişe bakıp bir fikir belirt.`);
  }

  const gecmis = (g.gecmis ?? []).slice(0, 20);
  if (gecmis.length) {
    s.push("");
    s.push("Rezervasyon geçmişi (yeniden eskiye):");
    for (const z of gecmis) {
      const parca = [
        gunAdi(z.reserved_at),
        `${z.party_size} kişi`,
        z.masa ?? "masa yok",
        DURUM_ADI[z.status] ?? z.status,
      ];
      if (z.hesap_tutari != null) parca.push(`${z.hesap_tutari} TL hesap`);
      if (z.note) parca.push(`not: "${z.note}"`);
      if (z.cancel_reason) parca.push(`iptal sebebi: "${z.cancel_reason}"`);
      s.push(`- ${parca.join(" · ")}`);
    }
  }
  return s.join("\n");
}

const SISTEM = `Sen bir restoranın rezervasyon ekranında çalışan yardımcısın. Sana bir
misafirin geçmişi veriliyor; personelin bu misafiri bir bakışta tanıması için kısa bir
bilgilendirme yazacaksın.

Nasıl yazacaksın:
- Türkçe, 2-4 cümle, düz metin. Başlık, madde işareti, kalın yazı, emoji yok.
- Kuru döküm yapma. "5 ziyaret, 2 iptal" gibi rakam sıralama; bunlar zaten ekranda yazıyor.
  Sen bu rakamların ne anlama geldiğini söyle.
- Notlarda geçen kişisel bilgileri (alerji, kutlama, kiminle geldiği, istediği masa)
  mutlaka değerlendir — asıl değerli olan onlar.
- Sonunda bir yorum ya da öneri ver: aranmaya değer mi, masası sormadan ayrılsın mı,
  gelmeme riski var mı, özel bir gün yaklaşıyor mu gibi.
- Emin olmadığın şeyi uydurma. Elinde az bilgi varsa kısa yaz, olmayanı doldurma.
- Doğrudan bilgilendirmeyi yaz. "İşte özet" gibi giriş cümlesi kurma.`;

export async function POST(req: Request) {
  const anahtar = process.env.ANTHROPIC_API_KEY;
  if (!anahtar) {
    // Anahtar henüz eklenmedi — ekran bunu sessizce yutuyor, hata göstermiyor.
    return NextResponse.json({ hata: "anahtar-yok" }, { status: 503 });
  }

  let govde: Govde;
  try {
    govde = (await req.json()) as Govde;
  } catch {
    return NextResponse.json({ hata: "govde-okunamadi" }, { status: 400 });
  }

  try {
    const client = new Anthropic({ apiKey: anahtar });
    const cevap = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      output_config: { effort: "low" },
      system: SISTEM,
      messages: [{ role: "user", content: bilgiMetni(govde) }],
    });

    if (cevap.stop_reason === "refusal") {
      return NextResponse.json({ hata: "yazilamadi" }, { status: 502 });
    }
    const metin = cevap.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!metin) return NextResponse.json({ hata: "bos-cevap" }, { status: 502 });

    return NextResponse.json({ metin });
  } catch (e) {
    return NextResponse.json({ hata: e instanceof Error ? e.message : "bilinmeyen" }, { status: 502 });
  }
}
