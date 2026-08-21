"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { getMyReservationRestaurantId } from "@/lib/supabase/reservationAccount";
import { toTitleTr } from "@/lib/text";
import { eslesenIller, eslesenIlceler } from "@/lib/turkeyLocations";
import { BOX_W, BOX_H, PX_PER_CM } from "../masaOlcu";

// KURULUM — kayıt bittikten sonra işletmeyi karşılayan ekran (Gökhan, 2026-08-20:
// "açıldıktan sonra karşımıza tüm program için geçerli bu ayarlar ekranı gelmeli ve tüm
// ayarlar burada yapılmalı sonra işletme programı kullanmaya başlamalı").
//
// KİLİTLİ: zorunlu adımlar bitmeden /rezervasyon açılmıyor, oraya giden kuruluma geri
// gönderiliyor (bkz. app/rezervasyon/page.tsx). Amaç iki taraflı: program eksik veriyle
// çalışmasın, işletmeci de ayarlara kendi eliyle hâkim olsun.
//
// Yarıda bırakılırsa kaldığı adımdan devam eder — her "Devam"da o adımın alanları
// kaydedilir ve restaurant_settings.kurulum_adim bir sonrakine yazılır.
//
// ADIM SIRASI ve zorunlu/geç ayrımı Gökhan'ın kararı (2026-08-20):
//   isletme · saatler · salon · rezervasyon · para · ekip · kvkk  → hepsi sırayla gelir,
//   "salon" kapasite yazılarak, "ekip" kodlar üretilerek geçilebilir.
// Notlar, mesajlar, etkinlikler, yapay zekâ ve şubeler kuruluma HİÇ girmiyor; onlar
// Ayarlar'da bekliyor ("ihtiyacı olursa gider zaten").

type Adim = "isletme" | "saatler" | "salon" | "rezervasyon" | "para" | "ekip" | "kvkk";
// Adımların altında açıklama satırı YOK (Gökhan, 2026-08-20: "tüm açıklamaları kaldır") —
// ekran sadece sorunun kendisini gösteriyor.
const ADIMLAR: { anahtar: Adim; ad: string }[] = [
  { anahtar: "isletme", ad: "İşletme bilgileri" },
  { anahtar: "saatler", ad: "Çalışma saatleri" },
  { anahtar: "salon", ad: "Salon ve kapasite" },
  { anahtar: "rezervasyon", ad: "Rezervasyon kuralları" },
  { anahtar: "para", ad: "Para ve satış kuralları" },
  { anahtar: "ekip", ad: "Ekip ve yetkiler" },
  { anahtar: "kvkk", ad: "KVKK ve sözleşme" },
];

type DayKey = "pzt" | "sal" | "car" | "per" | "cum" | "cmt" | "paz";
type DayHours = { acilis: string; kapanis: string; kapali: boolean };
type OpeningHours = Record<DayKey, DayHours>;
const DAYS: { k: DayKey; l: string }[] = [
  { k: "pzt", l: "Pzt" }, { k: "sal", l: "Sal" }, { k: "car", l: "Çar" },
  { k: "per", l: "Per" }, { k: "cum", l: "Cum" }, { k: "cmt", l: "Cmt" }, { k: "paz", l: "Paz" },
];

const PERSONEL_ROLLERI: { anahtar: string; ad: string }[] = [
  { anahtar: "garson", ad: "Garson" },
  { anahtar: "salon_sefi", ad: "Salon şefi" },
  { anahtar: "mutfak", ad: "Mutfak şefi" },
  { anahtar: "karsilama", ad: "Karşılama" },
  { anahtar: "pr", ad: "PR" },
  { anahtar: "yonetici", ad: "Yönetici" },
];

// Gece kulübü/eğlence mekânı sayılan türler — "Para ve satış kuralları" adımında loca
// bloğu bunlarda açılıyor, restoran/kafede hiç gösterilmiyor.
const EGLENCE_TIPLERI = new Set(["gece_kulubu", "gece_kulubu_canli", "yn_meyhane", "canli_muzik", "gazino", "bar_pub"]);

/** İşletmenin misafirine göstereceği KVKK metninin başlangıç hali — ismi yerine konur. */
const kvkkTaslak = (isletmeAdi: string) =>
  `${isletmeAdi || "İşletmemiz"} olarak rezervasyon sırasında aldığımız ad, soyad ve telefon ` +
  `bilgilerini yalnızca rezervasyonunuzu oluşturmak, sizi bilgilendirmek ve size daha iyi ` +
  `hizmet vermek için kullanıyoruz. Bilgileriniz üçüncü kişilerle paylaşılmaz, yasal saklama ` +
  `süresi dolduğunda silinir. Kayıtlarınızın silinmesini istediğinizde bize ulaşmanız yeterlidir. ` +
  `6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamındaki haklarınızı işletmemize ` +
  `başvurarak kullanabilirsiniz.`;

export default function KurulumPage() {
  const router = useRouter();
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [adim, setAdim] = useState<Adim>("isletme");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 1 — İşletme bilgileri
  const [isim, setIsim] = useState("");
  const [telefon, setTelefon] = useState("");
  const [eposta, setEposta] = useState("");
  const [il, setIl] = useState("");
  const [ilce, setIlce] = useState("");
  const [adres, setAdres] = useState("");
  const [instagram, setInstagram] = useState("");
  const [vergiNo, setVergiNo] = useState("");
  const [tip, setTip] = useState("restoran");

  // 2 — Çalışma saatleri
  const [acikGunler, setAcikGunler] = useState<Set<DayKey>>(new Set(DAYS.map((d) => d.k)));
  const [acilis, setAcilis] = useState("19:00");
  const [kapanis, setKapanis] = useState("02:00");

  // 3 — Salon ve kapasite
  // İKİ YOL (Gökhan, 2026-08-20): işletme ya masalarını boy boy girer — program masaları
  // üretip ızgaraya dizer, yerleşim ilk günden çalışır — ya da sadece kapasitesini yazıp
  // masasız devam eder. Kapasiteden masa UYDURULMUYOR: 120 kişilik bir restorana 30 tane
  // 4'lük koymak, adamın 8 tane 2'liği ve 4 tane 10'luğu varken yanlış veriyle işe başlamak olur.
  const [masaSayisi, setMasaSayisi] = useState(0);
  const [salonSayisi, setSalonSayisi] = useState(0);
  const [kapasite, setKapasite] = useState("");
  const [salonYolu, setSalonYolu] = useState<"masalar" | "kapasite">("masalar");
  const [boyAdet, setBoyAdet] = useState<Record<number, string>>({ 2: "", 4: "", 6: "", 8: "" });
  // Gece kulübünde bütün masalar aynı — tablo tek satıra düşüyor.
  const [kulupMasaAdet, setKulupMasaAdet] = useState("");
  const [kulupMasaKisi, setKulupMasaKisi] = useState("5");

  // 4 — Rezervasyon kuralları
  const [masaHesabi, setMasaHesabi] = useState(false);
  const [masaEnFazlaKisi, setMasaEnFazlaKisi] = useState("5");
  const [sinirAsilinca, setSinirAsilinca] = useState("sor");
  const [masaStoguAdet, setMasaStoguAdet] = useState("0");
  const [onlineAcik, setOnlineAcik] = useState(true);

  // 5 — Para ve satış kuralları
  const [fixMenu, setFixMenu] = useState(false);
  const [minimumHarcama, setMinimumHarcama] = useState(false);
  const [masaPaketi, setMasaPaketi] = useState(false);
  const [ozelGece, setOzelGece] = useState(false);
  const [prAcik, setPrAcik] = useState(false);
  const [guestList, setGuestList] = useState(false);
  const [locaKaporaAcik, setLocaKaporaAcik] = useState(false);
  const [locaKaporaTutar, setLocaKaporaTutar] = useState("");
  const [locaKaporaZorunlu, setLocaKaporaZorunlu] = useState(false);
  const [locaSatisYetkisi, setLocaSatisYetkisi] = useState("herkes");
  const [locaWalkin, setLocaWalkin] = useState(true);
  const [locaPaketZorunlu, setLocaPaketZorunlu] = useState(false);

  // 6 — Ekip
  const [kodlar, setKodlar] = useState<{ rol: string; kod: string }[]>([]);

  // 7 — KVKK
  const [kvkkNotice, setKvkkNotice] = useState("");
  const [sozlesmeOnay, setSozlesmeOnay] = useState(false);
  const [metinOnay, setMetinOnay] = useState(false);

  const load = useCallback(async (restId: string) => {
    const [{ data: r }, { data: s }, { data: mt }, { data: sa }, { data: kk }] = await Promise.all([
      supabase.from("restaurants").select("name, phone, eposta, il, ilce, address, instagram, tax_number").eq("id", restId).maybeSingle(),
      supabase.from("restaurant_settings").select("*").eq("restaurant_id", restId).maybeSingle(),
      supabase.from("restaurant_tables").select("id").eq("restaurant_id", restId).is("deleted_at", null),
      supabase.from("dining_areas").select("id").eq("restaurant_id", restId).is("deleted_at", null),
      supabase.from("katilim_kodlari").select("rol, kod").eq("restaurant_id", restId),
    ]);

    const rRow = r as Record<string, string | null> | null;
    setIsim(rRow?.name ?? "");
    setTelefon((rRow?.phone ?? "").replace(/\D/g, "").replace(/^0+/, ""));
    setEposta(rRow?.eposta ?? "");
    setIl(rRow?.il ?? "");
    setIlce(rRow?.ilce ?? "");
    setAdres(rRow?.address ?? "");
    setInstagram(rRow?.instagram ?? "");
    setVergiNo(rRow?.tax_number ?? "");

    const sRow = s as Record<string, unknown> | null;
    setTip((sRow?.isletme_tipi as string) ?? "restoran");
    const oh = (sRow?.opening_hours as OpeningHours | null) ?? null;
    if (oh) {
      const acik = new Set<DayKey>();
      for (const d of DAYS) if (oh[d.k] && !oh[d.k].kapali) acik.add(d.k);
      setAcikGunler(acik.size > 0 ? acik : new Set(DAYS.map((d) => d.k)));
      const ilkAcik = DAYS.find((d) => oh[d.k] && !oh[d.k].kapali) ?? DAYS[0];
      if (oh[ilkAcik.k]) { setAcilis(oh[ilkAcik.k].acilis); setKapanis(oh[ilkAcik.k].kapanis); }
    }
    setMasaHesabi(Boolean(sRow?.masa_hesabi_acik));
    setMasaEnFazlaKisi(String((sRow?.masa_en_fazla_kisi as number) ?? 5));
    setSinirAsilinca((sRow?.sinir_asilinca as string) ?? "sor");
    setMasaStoguAdet(String((sRow?.masa_stogu_adet as number) ?? 0));
    setOnlineAcik(sRow?.online_acik !== false);
    setKapasite((sRow?.kapasite_kisi as number) ? String(sRow?.kapasite_kisi) : "");
    setFixMenu(Boolean(sRow?.fix_menu_acik));
    setMinimumHarcama(Boolean(sRow?.minimum_harcama_acik));
    setMasaPaketi(Boolean(sRow?.masa_paketi_acik));
    setOzelGece(Boolean(sRow?.ozel_gece_acik));
    setPrAcik(Boolean(sRow?.pr_acik));
    setGuestList(Boolean(sRow?.guest_list_acik));
    setLocaKaporaAcik(Boolean(sRow?.loca_kapora_acik));
    setLocaKaporaTutar(sRow?.loca_kapora_tutar ? String(sRow.loca_kapora_tutar) : "");
    setLocaKaporaZorunlu(Boolean(sRow?.loca_kapora_zorunlu));
    setLocaSatisYetkisi((sRow?.loca_satis_yetkisi as string) ?? "herkes");
    setLocaWalkin(sRow?.loca_walkin_acik !== false);
    setLocaPaketZorunlu(Boolean(sRow?.loca_paket_zorunlu));
    setKvkkNotice((sRow?.kvkk_notice as string) ?? "");
    setSozlesmeOnay(Boolean(sRow?.kvkk_sozlesme_onay));
    setMetinOnay(Boolean(sRow?.kvkk_metin_onay));

    setMasaSayisi(((mt as unknown[]) ?? []).length);
    setSalonSayisi(((sa as unknown[]) ?? []).length);
    setKodlar(((kk as { rol: string; kod: string }[]) ?? []));

    // Kaldığı adımdan devam (Gökhan: "kaldığı yerden gelsin").
    const kayitli = (sRow?.kurulum_adim as string) ?? "isletme";
    if (ADIMLAR.some((a) => a.anahtar === kayitli)) setAdim(kayitli as Adim);
    setYukleniyor(false);
  }, []);

  useEffect(() => {
    (async () => {
      const id = await getMyReservationRestaurantId();
      if (!id) { router.replace("/rezervasyon/giris"); return; }
      setRestaurantId(id);
      await load(id);
    })();
  }, [load, router]);

  // KVKK adımına gelindiğinde metin boşsa taslakla dolduruluyor — işletme sıfırdan
  // yazmak zorunda kalmasın, okuyup düzeltsin.
  useEffect(() => {
    if (adim === "kvkk" && !kvkkNotice.trim() && isim) setKvkkNotice(kvkkTaslak(isim));
  }, [adim, kvkkNotice, isim]);

  const sira = ADIMLAR.findIndex((a) => a.anahtar === adim);
  const sonAdim = sira === ADIMLAR.length - 1;
  // Masa hesabıyla çalışan türler — sandalye sayılmadığı için masalar aynı boyda, boy tablosu
  // yerine tek satır soruluyor.
  const kulupTipi = tip.startsWith("gece_kulubu");
  // Gece kulübünde mutfak yok — mutfak şefi kodu hiç üretilmiyor (Gökhan, 2026-08-20).
  const rollerim = PERSONEL_ROLLERI.filter((r) => !(kulupTipi && r.anahtar === "mutfak"));

  /** Girilen boy × adet listesinden masaları üretir ve düzgün bir ızgaraya dizer. */
  const masalariUret = async (restId: string): Promise<string | null> => {
    // Hangi boydan kaç tane: kulüpte tek satır, diğerlerinde 2/4/6/8.
    const istekler: { kisi: number; adet: number }[] = kulupTipi
      ? [{ kisi: parseInt(kulupMasaKisi || "5", 10) || 5, adet: parseInt(kulupMasaAdet || "0", 10) || 0 }]
      : [2, 4, 6, 8].map((k) => ({ kisi: k, adet: parseInt(boyAdet[k] || "0", 10) || 0 }));
    const toplamMasa = istekler.reduce((s, i) => s + i.adet, 0);
    if (toplamMasa === 0) return "Hiç masa girilmedi.";

    // Izgara: satır başına 6 masa, kutu ölçüsü + aralık. Bu bir BAŞLANGIÇ dizilimi — işletme
    // salonu kendi planına benzetip raptiyeleyecek.
    const SATIR_BASI = 6, ARALIK = 12;

    // Salon yoksa bir tane açılıyor — işletme sonradan adını değiştirir, yenisini ekler.
    // ÖLÇÜSÜ DE VERİLİYOR (Gökhan, 2026-08-20). Ölçüsüz salonda program "ekrana sığdırılacak
    // alan"ı masaların kapladığı yerden hesaplıyor; salonda tek masa kalınca o alan avuç içi
    // kadar oluyor, yakınlaştırma tavana vuruyor ve masa sürüklendikçe ekran kayıyordu.
    // Izgaranın kapladığı dikdörtgen kadar bir salon açıyoruz; işletme gerçek ölçüsünü
    // Ayarlar'dan girince o geçerli olur.
    const izgaraEn = Math.min(SATIR_BASI, toplamMasa) * (BOX_W + ARALIK) + ARALIK;
    const izgaraBoy = Math.ceil(toplamMasa / SATIR_BASI) * (BOX_H + ARALIK) + ARALIK;

    let alanId: string | null = null;
    const { data: mevcutAlan } = await supabase.from("dining_areas")
      .select("id").eq("restaurant_id", restId).is("deleted_at", null).order("sort_order").limit(1);
    alanId = ((mevcutAlan as { id: string }[]) ?? [])[0]?.id ?? null;
    if (!alanId) {
      const { data: yeni, error } = await supabase.from("dining_areas")
        .insert({
          restaurant_id: restId, name: "Salon", sort_order: 0,
          genislik_cm: Math.round(izgaraEn / PX_PER_CM),
          derinlik_cm: Math.round(izgaraBoy / PX_PER_CM),
        }).select("id").single();
      if (error) return error.message;
      alanId = (yeni as { id: string }).id;
    }

    const satirlar: { name: string; seat_count: number; shape: string; position_x: number; position_y: number; sort_order: number }[] = [];
    let no = 0;
    for (const istek of istekler) {
      for (let i = 0; i < istek.adet; i++) {
        const sutun = no % SATIR_BASI, satir = Math.floor(no / SATIR_BASI);
        satirlar.push({
          name: `Masa ${no + 1}`,
          seat_count: istek.kisi,
          shape: istek.kisi > 4 ? "dikdortgen" : "kare",
          position_x: sutun * (BOX_W + ARALIK) + ARALIK,
          position_y: satir * (BOX_H + ARALIK) + ARALIK,
          sort_order: no,
        });
        no++;
      }
    }
    const { error } = await supabase.from("restaurant_tables")
      .insert(satirlar.map((s) => ({ ...s, restaurant_id: restId, area_id: alanId, status: "empty" })));
    if (error) return error.message;
    setMasaSayisi(satirlar.length);
    setSalonSayisi((n) => (n === 0 ? 1 : n));
    return null;
  };

  /** Bu adımın alanlarını veritabanına yazar. Doğrulama ayrı (kontrolEt). */
  const adimiKaydet = async (): Promise<string | null> => {
    if (!restaurantId) return "İşletme bulunamadı.";

    if (adim === "isletme") {
      const { error } = await supabase.from("restaurants").update({
        name: toTitleTr(isim), phone: telefon.replace(/\D/g, ""), eposta: eposta.trim() || null,
        il: toTitleTr(il), ilce: toTitleTr(ilce), address: adres.trim(),
        instagram: instagram.trim() || null, tax_number: vergiNo.trim() || null,
      }).eq("id", restaurantId);
      return error?.message ?? null;
    }

    const yama: Record<string, unknown> = {};
    if (adim === "saatler") {
      const oh = {} as OpeningHours;
      for (const d of DAYS) oh[d.k] = { acilis, kapanis, kapali: !acikGunler.has(d.k) };
      yama.opening_hours = oh;
    }
    if (adim === "salon") {
      if (masaSayisi === 0 && salonYolu === "masalar") {
        const hata = await masalariUret(restaurantId);
        if (hata) return hata;
        yama.kapasite_kisi = 0; // masalar var, kapasite artık masalardan sayılıyor
        if (kulupTipi) yama.masa_en_fazla_kisi = parseInt(kulupMasaKisi || "5", 10) || 5;
      } else if (masaSayisi === 0) {
        yama.kapasite_kisi = parseInt(kapasite || "0", 10) || 0;
      }
    }
    if (adim === "rezervasyon") {
      yama.masa_hesabi_acik = masaHesabi;
      yama.masa_en_fazla_kisi = parseInt(masaEnFazlaKisi || "5", 10) || 5;
      yama.sinir_asilinca = sinirAsilinca;
      yama.masa_stogu_adet = parseInt(masaStoguAdet || "0", 10) || 0;
      // Stok masası da salondaki masa kadar kişi alır — ayrı soru sorulmuyor (Gökhan, 2026-08-20).
      yama.masa_stogu_kisi = parseInt(masaEnFazlaKisi || "5", 10) || 5;
      yama.online_acik = onlineAcik;
      // Rezervasyon ne kadar ileriye alınabilir diye SORULMUYOR (Gökhan, 2026-08-20:
      // "isterse seneye bile rezervasyon alır, saçma"). Ufuk pratikte sınırsız açılıyor;
      // gerçekten sınırlamak isteyen Ayarlar'dan kısar.
      yama.rezervasyon_gun_ufku = 3650;
    }
    if (adim === "para") {
      yama.fix_menu_acik = fixMenu;
      yama.minimum_harcama_acik = minimumHarcama;
      yama.masa_paketi_acik = masaPaketi;
      yama.ozel_gece_acik = ozelGece;
      yama.pr_acik = prAcik;
      yama.guest_list_acik = guestList;
      yama.loca_kapora_acik = locaKaporaAcik;
      yama.loca_kapora_tutar = locaKaporaTutar ? Number(locaKaporaTutar.replace(",", ".")) : null;
      yama.loca_kapora_zorunlu = locaKaporaZorunlu;
      yama.loca_satis_yetkisi = locaSatisYetkisi;
      yama.loca_walkin_acik = locaWalkin;
      yama.loca_paket_zorunlu = locaPaketZorunlu;
    }
    if (adim === "kvkk") {
      yama.kvkk_notice = kvkkNotice.trim() || null;
      yama.kvkk_sozlesme_onay = sozlesmeOnay;
      yama.kvkk_sozlesme_onay_at = sozlesmeOnay ? new Date().toISOString() : null;
      yama.kvkk_metin_onay = metinOnay;
      yama.kvkk_metin_onay_at = metinOnay ? new Date().toISOString() : null;
    }

    // Sıradaki adım (ya da bitiş) aynı yazmada kaydediliyor — yarıda bırakan buradan devam eder.
    yama.kurulum_adim = sonAdim ? "bitti" : ADIMLAR[sira + 1].anahtar;
    if (sonAdim) yama.kurulum_tamam = true;

    const { error } = await supabase.from("restaurant_settings")
      .update(yama).eq("restaurant_id", restaurantId);
    return error?.message ?? null;
  };

  /** Zorunlu alan kontrolü. null dönerse adım geçilebilir. */
  const kontrolEt = (): string | null => {
    if (adim === "isletme") {
      if (!isim.trim()) return "İşletme adı gerekli.";
      if (!telefon.trim()) return "Telefon gerekli.";
      if (!eposta.trim()) return "E-posta gerekli.";
      if (!il.trim() || !ilce.trim() || !adres.trim()) return "İl, ilçe ve açık adres gerekli.";
    }
    if (adim === "saatler" && acikGunler.size === 0) return "En az bir gün açık olmalı.";
    if (adim === "salon" && masaSayisi === 0) {
      if (salonYolu === "masalar") {
        const toplam = kulupTipi
          ? parseInt(kulupMasaAdet || "0", 10) || 0
          : [2, 4, 6, 8].reduce((s, k) => s + (parseInt(boyAdet[k] || "0", 10) || 0), 0);
        if (toplam === 0) return "Kaç masan olduğunu yaz — ya da alttaki seçenekle sadece kapasiteni girip geç.";
        if (toplam > 300) return "Masa sayısı çok yüksek görünüyor, kontrol eder misin?";
        if (kulupTipi && !(parseInt(kulupMasaKisi || "0", 10) > 0)) return "Bir masaya en fazla kaç kişi alacağını yaz.";
      } else if (!parseInt(kapasite || "0", 10)) {
        return "Salonunu henüz kurmadın — kaç kişilik olduğunu yaz, sonra salonu kurabilirsin.";
      }
    }
    if (adim === "kvkk") {
      if (!sozlesmeOnay) return "Devam etmek için kullanım sözleşmesini onaylaman gerekiyor.";
      if (!kvkkNotice.trim()) return "Misafirine göstereceğin KVKK metni boş olamaz.";
      if (!metinOnay) return "KVKK metnini okuyup onayladığını işaretle.";
    }
    return null;
  };

  const devam = async () => {
    if (busy) return;
    const hata = kontrolEt();
    if (hata) { setErr(hata); return; }
    setBusy(true); setErr(null);
    const yazmaHatasi = await adimiKaydet();
    setBusy(false);
    if (yazmaHatasi) { setErr(yazmaHatasi); return; }
    if (sonAdim) { router.replace("/rezervasyon"); return; }
    setAdim(ADIMLAR[sira + 1].anahtar);
  };

  const geri = () => { if (sira > 0) { setErr(null); setAdim(ADIMLAR[sira - 1].anahtar); } };

  /** Ekip adımı: bütün rollerin kodunu tek seferde üretir (Gökhan: "tek seferde işaret türet de geç"). */
  const kodlariUret = async () => {
    if (!restaurantId || busy) return;
    setBusy(true); setErr(null);
    for (const r of rollerim) {
      if (kodlar.some((k) => k.rol === r.anahtar)) continue;
      const { data, error } = await supabase.rpc("katilim_kodu_uret");
      if (error || !data) { setErr(error?.message ?? "Kod üretilemedi."); break; }
      await supabase.from("katilim_kodlari").insert({ restaurant_id: restaurantId, rol: r.anahtar, kod: data as string });
    }
    const { data: kk } = await supabase.from("katilim_kodlari").select("rol, kod").eq("restaurant_id", restaurantId);
    setKodlar(((kk as { rol: string; kod: string }[]) ?? []));
    setBusy(false);
  };

  if (yukleniyor) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--canvas)", color: "var(--ink-soft)", fontSize: 14 }}>Yükleniyor…</div>;
  }

  const su = ADIMLAR[sira];

  return (
    <div style={{ minHeight: "100vh", background: "var(--canvas)", padding: 16 }}>
      <div style={{ width: "min(920px, 96vw)", margin: "0 auto" }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 600, color: "var(--ink)" }}>{isim || "İşletme kurulumu"}</div>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
          {/* Adım listesi */}
          <div style={{ flex: "0 0 220px", minWidth: 200, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 8 }}>
            {ADIMLAR.map((a, i) => {
              const gecildi = i < sira;
              const aktif = i === sira;
              return (
                <div
                  key={a.anahtar}
                  onClick={() => { if (gecildi) { setErr(null); setAdim(a.anahtar); } }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8, padding: "9px 10px", borderRadius: 10,
                    background: aktif ? "var(--recede)" : "transparent",
                    cursor: gecildi ? "pointer" : "default",
                    color: aktif ? "var(--ink)" : gecildi ? "var(--ink)" : "var(--ink-soft)",
                  }}
                >
                  <div style={{
                    width: 20, height: 20, borderRadius: "50%", flexShrink: 0, fontSize: 11, fontWeight: 600,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: gecildi ? "var(--brand-strong)" : aktif ? "var(--ink-green)" : "var(--line-2)",
                    color: gecildi || aktif ? "#fff" : "var(--ink-soft)",
                  }}>
                    {gecildi ? <Check size={12} /> : i + 1}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: aktif ? 600 : 400 }}>{a.ad}</span>
                </div>
              );
            })}
          </div>

          {/* Adımın içeriği */}
          <div style={{ flex: "1 1 420px", minWidth: 300, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 16, padding: 18 }}>
            <div style={{ fontSize: 15.5, fontWeight: 600, color: "var(--ink)", marginBottom: 14 }}>{su.ad}</div>

            {err && <div style={{ marginBottom: 12, padding: "10px 13px", borderRadius: 10, background: "var(--danger-bg)", color: "var(--danger)", fontSize: 13 }}>{err}</div>}

            {adim === "isletme" && (
              <div style={{ display: "grid", gap: 10 }}>
                <Alan ad="İşletme adı"><input value={isim} onChange={(e) => setIsim(e.target.value)} onBlur={(e) => setIsim(toTitleTr(e.target.value))} style={inp} /></Alan>
                <Alan ad="Telefon"><input value={telefon} onChange={(e) => setTelefon(e.target.value.replace(/\D/g, ""))} inputMode="numeric" style={inp} /></Alan>
                <Alan ad="E-posta"><input value={eposta} onChange={(e) => setEposta(e.target.value)} inputMode="email" style={inp} /></Alan>
                <Alan ad="İl"><SehirKutusu deger={il} yaz={setIl} oner={(q) => eslesenIller(q)} /></Alan>
                <Alan ad="İlçe"><SehirKutusu deger={ilce} yaz={setIlce} oner={(q) => eslesenIlceler(il, q)} /></Alan>
                <Alan ad="Açık adres"><textarea value={adres} onChange={(e) => setAdres(e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} /></Alan>
                <Alan ad="Instagram"><input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="isteğe bağlı" style={inp} /></Alan>
                <Alan ad="Vergi no"><input value={vergiNo} onChange={(e) => setVergiNo(e.target.value.replace(/\D/g, ""))} placeholder="isteğe bağlı" inputMode="numeric" style={inp} /></Alan>
              </div>
            )}

            {adim === "saatler" && (
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 6 }}>Açık günler</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {DAYS.map((d) => {
                      const acik = acikGunler.has(d.k);
                      return (
                        <button
                          key={d.k}
                          onClick={() => setAcikGunler((s) => { const y = new Set(s); if (y.has(d.k)) y.delete(d.k); else y.add(d.k); return y; })}
                          style={{
                            border: "1px solid var(--line-2)", borderRadius: 980, padding: "7px 13px", fontSize: 13, cursor: "pointer",
                            background: acik ? "var(--ink-green)" : "var(--card)", color: acik ? "#fff" : "var(--ink-soft)",
                          }}
                        >{d.l}</button>
                      );
                    })}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Alan ad="Açılış"><input type="time" value={acilis} onChange={(e) => setAcilis(e.target.value)} style={{ ...inp, width: 140 }} /></Alan>
                  <Alan ad="Kapanış"><input type="time" value={kapanis} onChange={(e) => setKapanis(e.target.value)} style={{ ...inp, width: 140 }} /></Alan>
                </div>
              </div>
            )}

            {adim === "salon" && (
              <div style={{ display: "grid", gap: 12 }}>
                {masaSayisi > 0 ? (
                  <>
                    <div style={{ fontSize: 14, color: "var(--ink)" }}>
                      Salonun kurulu: <b>{salonSayisi}</b> salon, <b>{masaSayisi}</b> masa.
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: 6, background: "var(--recede)", padding: 3, borderRadius: 980 }}>
                      {([["masalar", "Masalarımı gireyim"], ["kapasite", "Sadece kapasitemi yazayım"]] as const).map(([y, ad]) => (
                        <button
                          key={y} onClick={() => { setSalonYolu(y); setErr(null); }}
                          style={{
                            flex: 1, border: "none", borderRadius: 980, padding: "9px 10px", fontSize: 13, cursor: "pointer",
                            background: salonYolu === y ? "var(--ink-green)" : "transparent",
                            color: salonYolu === y ? "#fff" : "var(--ink-soft)",
                          }}
                        >{ad}</button>
                      ))}
                    </div>

                    {salonYolu === "masalar" ? (
                      <>
                        {kulupTipi ? (
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <Alan ad="Kaç masan var"><input value={kulupMasaAdet} onChange={(e) => setKulupMasaAdet(e.target.value.replace(/\D/g, ""))} inputMode="numeric" style={{ ...inp, width: 100 }} /></Alan>
                            <Alan ad="Bir masaya en fazla kaç kişi"><input value={kulupMasaKisi} onChange={(e) => setKulupMasaKisi(e.target.value.replace(/\D/g, ""))} inputMode="numeric" style={{ ...inp, width: 100 }} /></Alan>
                          </div>
                        ) : (
                          <div style={{ display: "grid", gap: 6 }}>
                            <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>Hangi boydan kaç masan var?</div>
                            {[2, 4, 6, 8].map((k) => (
                              <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "7px 12px", border: "1px solid var(--line-2)", borderRadius: 10 }}>
                                <span style={{ fontSize: 13.5, color: "var(--ink)" }}>{k} kişilik</span>
                                <input
                                  value={boyAdet[k]}
                                  onChange={(e) => setBoyAdet((s) => ({ ...s, [k]: e.target.value.replace(/\D/g, "") }))}
                                  inputMode="numeric" placeholder="0"
                                  className="tnum" style={{ ...inp, width: 76, textAlign: "center" }}
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <Alan ad="Toplam kapasite (kişi)">
                          <input value={kapasite} onChange={(e) => setKapasite(e.target.value.replace(/\D/g, ""))} inputMode="numeric" style={{ ...inp, width: 140 }} />
                        </Alan>
                      </>
                    )}
                  </>
                )}
              </div>
            )}

            {adim === "rezervasyon" && (
              <div style={{ display: "grid", gap: 12 }}>
                {/* "Masa hesabı" işletmecinin dilinde karşılığı olmayan bir tabirdi
                    (Gökhan, 2026-08-20: "o masa hesabı ile çalış diye adlandırılmaz,
                    rezervasyonu masa başı al olur"). */}
                <Kutucuk isaretli={masaHesabi} degistir={setMasaHesabi} ad="Rezervasyonu masa başı al"/>
                {masaHesabi && (
                  <div style={{ display: "grid", gap: 10, paddingLeft: 12, borderLeft: "2px solid var(--line-2)" }}>
                    <Alan ad="Bir masaya en fazla kaç kişi alınabilir."><input value={masaEnFazlaKisi} onChange={(e) => setMasaEnFazlaKisi(e.target.value.replace(/\D/g, ""))} inputMode="numeric" style={{ ...inp, width: 80 }} /></Alan>
                    <Alan ad="Tek masalık rezervasyon sınırı aşılınca.">
                      <select value={sinirAsilinca} onChange={(e) => setSinirAsilinca(e.target.value)} style={{ ...inp, width: 240 }}>
                        <option value="otomatik">İkinci masayı eklesin</option>
                        <option value="sor">Eklensin mi diye sorsun</option>
                        <option value="ekleme">Manuel eklensin</option>
                      </select>
                    </Alan>
                    <Alan ad="Yedek masa stoğu (ad.)"><input value={masaStoguAdet} onChange={(e) => setMasaStoguAdet(e.target.value.replace(/\D/g, ""))} inputMode="numeric" style={{ ...inp, width: 80 }} /></Alan>
                  </div>
                )}
                <Kutucuk isaretli={onlineAcik} degistir={setOnlineAcik} ad="Online rezervasyon açık"/>
              </div>
            )}

            {adim === "para" && (
              <div style={{ display: "grid", gap: 10 }}>
                {/* Gece kulübünde fix menü hiç sorulmuyor (Gökhan, 2026-08-20). */}
                {!kulupTipi && <Kutucuk isaretli={fixMenu} degistir={setFixMenu} ad="Fix menü"/>}
                <Kutucuk isaretli={minimumHarcama} degistir={setMinimumHarcama} ad="Minimum harcama"/>
                <Kutucuk isaretli={masaPaketi} degistir={setMasaPaketi} ad="Masa paketi"/>
                <Kutucuk isaretli={ozelGece} degistir={setOzelGece} ad="Özel gece / etkinlik"/>
                <Kutucuk isaretli={prAcik} degistir={setPrAcik} ad="PR çalışıyor"/>
                <Kutucuk isaretli={guestList} degistir={setGuestList} ad="Guest list / kapı listesi"/>

                {EGLENCE_TIPLERI.has(tip) && (
                  <div style={{ marginTop: 6, paddingTop: 12, borderTop: "1px solid var(--line-2)", display: "grid", gap: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Loca kuralları</div>
                    <Kutucuk isaretli={locaKaporaAcik} degistir={setLocaKaporaAcik} ad="Loca için kapora alınır" />
                    {locaKaporaAcik && (
                      <div style={{ display: "grid", gap: 10, paddingLeft: 12, borderLeft: "2px solid var(--line-2)" }}>
                        <Alan ad="Kapora tutarı"><input value={locaKaporaTutar} onChange={(e) => setLocaKaporaTutar(e.target.value.replace(/[^\d.,]/g, ""))} inputMode="decimal" style={{ ...inp, width: 130 }} /></Alan>
                        <Kutucuk isaretli={locaKaporaZorunlu} degistir={setLocaKaporaZorunlu} ad="Kapora alınmadan loca rezervasyonu kapanmasın" />
                      </div>
                    )}
                    <Alan ad="Locayı kim satabilir">
                      <select value={locaSatisYetkisi} onChange={(e) => setLocaSatisYetkisi(e.target.value)} style={{ ...inp, width: 280 }}>
                        <option value="yonetici">Sadece yönetici</option>
                        <option value="salon_sefi">Yönetici ve salon şefi</option>
                        <option value="karsilama">Yönetici, salon şefi ve karşılama</option>
                        <option value="herkes">Herkes</option>
                      </select>
                    </Alan>
                    <Kutucuk isaretli={locaWalkin} degistir={setLocaWalkin} ad="Loca kapıdan da satılabilir"/>
                    <Kutucuk isaretli={locaPaketZorunlu} degistir={setLocaPaketZorunlu} ad="Loca ancak paketle satılır"/>
                  </div>
                )}
              </div>
            )}

            {adim === "ekip" && (
              <div style={{ display: "grid", gap: 12 }}>
                {kodlar.length === 0 ? (
                  <button onClick={kodlariUret} disabled={busy} style={{ ...btnIkincil, opacity: busy ? 0.6 : 1 }}>
                    {busy ? "Üretiliyor…" : "Bütün rollerin kodunu üret"}
                  </button>
                ) : (
                  <div style={{ display: "grid", gap: 6 }}>
                    {rollerim.map((r) => {
                      const k = kodlar.find((x) => x.rol === r.anahtar);
                      return (
                        <div key={r.anahtar} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", border: "1px solid var(--line-2)", borderRadius: 10 }}>
                          <span style={{ fontSize: 13.5, color: "var(--ink)" }}>{r.ad}</span>
                          <span className="tnum" style={{ fontSize: 15, fontWeight: 600, letterSpacing: 2, color: "var(--ink-green)" }}>{k?.kod ?? "—"}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {adim === "kvkk" && (
              <div style={{ display: "grid", gap: 12 }}>
                <Kutucuk isaretli={sozlesmeOnay} degistir={setSozlesmeOnay} ad="Kullanım sözleşmesini ve aydınlatma metnini okudum, onaylıyorum"/>
                <div>
                  <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 6 }}>
                    Misafirine göstereceğin KVKK metni
                  </div>
                  <textarea value={kvkkNotice} onChange={(e) => setKvkkNotice(e.target.value)} rows={7} style={{ ...inp, resize: "vertical", lineHeight: 1.5 }} />
                </div>
                <Kutucuk isaretli={metinOnay} degistir={setMetinOnay} ad="Bu metni okudum, işletmem adına onaylıyorum"/>
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 18, alignItems: "center" }}>
              {sira > 0 && (
                <button onClick={geri} style={{ ...btnIkincil, display: "flex", alignItems: "center", gap: 4, width: "auto" }}>
                  <ChevronLeft size={15} /> Geri
                </button>
              )}
              <button onClick={devam} disabled={busy} style={{ ...btnAna, opacity: busy ? 0.6 : 1 }}>
                {busy ? "…" : sonAdim ? "Kurulumu bitir" : adim === "ekip" ? "Devam / Geç" : "Devam"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Alan({ ad, children }: { ad: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 4 }}>{ad}</div>
      {children}
    </label>
  );
}

function Kutucuk({ isaretli, degistir, ad }: { isaretli: boolean; degistir: (v: boolean) => void; ad: string }) {
  return (
    <label style={{ display: "flex", gap: 9, alignItems: "flex-start", cursor: "pointer" }}>
      <input type="checkbox" checked={isaretli} onChange={(e) => degistir(e.target.checked)} style={{ marginTop: 2, width: 16, height: 16, flexShrink: 0 }} />
      <span style={{ fontSize: 13.5, color: "var(--ink)" }}>{ad}</span>
    </label>
  );
}

/** İl/ilçe kutusu — yazdıkça eşleşenleri altında listeler. */
function SehirKutusu({ deger, yaz, oner }: { deger: string; yaz: (v: string) => void; oner: (q: string) => string[] }) {
  const [acik, setAcik] = useState(false);
  const liste = acik ? oner(deger).slice(0, 8) : [];
  return (
    <div style={{ position: "relative" }}>
      <input
        value={deger}
        onChange={(e) => { yaz(e.target.value); setAcik(true); }}
        onFocus={() => setAcik(true)}
        onBlur={() => setTimeout(() => setAcik(false), 150)}
        style={inp}
      />
      {liste.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, border: "1px solid var(--line-2)", borderRadius: 10, background: "var(--card)", overflow: "hidden", zIndex: 5, boxShadow: "0 4px 14px rgba(0,0,0,0.08)" }}>
          {liste.map((x) => (
            <div key={x} onMouseDown={() => { yaz(x); setAcik(false); }} style={{ padding: "9px 12px", fontSize: 13.5, cursor: "pointer", color: "var(--ink)" }}>{x}</div>
          ))}
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 10, padding: "10px 12px", fontSize: 15, background: "var(--card)", color: "var(--ink)", outline: "none", width: "100%", boxSizing: "border-box" };
const btnAna: React.CSSProperties = { flex: 1, border: "none", borderRadius: 980, padding: 12, background: "var(--brand-strong)", color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" };
const btnIkincil: React.CSSProperties = { border: "1px solid var(--line-2)", borderRadius: 980, padding: "11px 16px", background: "var(--card)", color: "var(--ink-green)", fontSize: 13.5, cursor: "pointer" };
