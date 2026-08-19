// Rezervasyon alınabilirliği — koltuk toplamı değil, MASA BOYU üzerinden.
//
// Gökhan (2026-08-05): "14 tane 2 kişilik, 55 tane 4 kişilik, 14 tane 6 kişilik masamız var.
// Program rezervasyon alırken bu sayıları takip etmeli ki elimizde 6 tane 6 kişilik
// rezervasyonla 9 tane 4 kişilik masa kalmasın."
//
// Toplam koltuğa bakmak yanıltıyor: 332 koltuk boş görünürken 6 kişilik grubu oturtacak
// masa kalmamış olabilir. Bu yüzden her dönem (öğle/akşam) için masalar tek tek dağıtılıyor.
//
// Sıra hiç şaşmaz (Gökhan): önce TAM ölçü → o bitince bir ÜST boy → en son BİRLEŞTİRME.
// "6 kişilik masa müsaitken gidip 2 ile 4'ü birleştirmeyecek."
//
// Program masayı KENDİ SEÇMEZ — sadece yer var mı diye bakar, gerekiyorsa sorar. Hangi
// masaya oturacağını kullanıcı masa seç kutusundan kendi seçer.

import { BOX_W, BOX_H } from "./masaOlcu";

export type MasaBilgi = { seat_count: number };

// Salon planındaki konum — birleştirmede "kendi sırasındaki masa" önceliği bundan çıkıyor
// (Gökhan: "öncelik hep aynı sıra için olsun"). Aynı sıra = yaklaşık aynı yükseklik.
// normalX/normalY: masanın ASIL yeri — varsa hep ondan hesaplanır, o an nerede durduğundan
// değil. Bir masa bir kez taşındıktan sonra CANLI (position_x/y) konumu artık salonun gerçek
// düzenini yansıtmıyordu; "hangi masalar aynı sırada" kararı buradan verildiği için, bir kez
// taşınan bir masa bir daha asla doğru sıraya ait sayılmıyordu — masalar kaydıkça yerleşim
// kararları da bozulan bir sarmala giriyordu (Gökhan: "18 kişilik 3 rezervasyon yaptım, aynı
// sıradaki masaları birleştirmesi gerekiyordu, ne yaptığına sen bak" — ilki doğru sıraya
// oturttu ama masalar bir kez kaydıktan sonra ikinci ve üçüncüsü dağınık masalar topladı).
// varsayilanX/varsayilanY: işletmenin RAPTİYE ile kaydettiği kalıcı düzen. Yerleşim önce buna
// bakar (Gökhan, 2026-08-19). normalX/normalY ise sadece "program bu masayı birleştirme için
// oynatmadan önce buradaydı" demek — kalıcı düzen varken ona bakılmaz, çünkü her tur yeniden
// yazıldığı için kayma birikiyordu.
export type KonumluMasa = MasaBilgi & {
  position_x: number | null; position_y: number | null;
  normalX?: number | null; normalY?: number | null;
  varsayilanX?: number | null; varsayilanY?: number | null;
};
const SIRA_TOLERANS = 60; // px — aynı sırada sayılmak için izin verilen yükseklik farkı
// Ayrı rezervasyonların masaları arasında bırakılacak en az boşluk (px). Aynı rezervasyonun
// masaları dip dibe durur; farklı rezervasyonlarınki hep ayrık görünsün diye.
export const AYRI_MESAFE = 26;

// Masanın ASIL (ev) yeri: önce kayıtlı düzen, yoksa birleştirmeden önceki yeri, o da yoksa
// bulunduğu yer.
const asilKX = (m: KonumluMasa) => m.varsayilanX ?? m.normalX ?? m.position_x;
const asilKY = (m: KonumluMasa) => m.varsayilanY ?? m.normalY ?? m.position_y;

export const ayniSirada = (a: KonumluMasa, b: KonumluMasa) =>
  asilKY(a) !== null && asilKY(b) !== null && Math.abs(asilKY(a)! - asilKY(b)!) <= SIRA_TOLERANS;

const yatayUzaklik = (a: KonumluMasa, b: KonumluMasa) =>
  asilKX(a) === null || asilKX(b) === null ? Number.MAX_SAFE_INTEGER : Math.abs(asilKX(a)! - asilKX(b)!);

// Bir masaya komşuluk sırasına göre dizer: önce aynı sıradakiler (en yakından başlayarak),
// sonra diğerleri. Zorunluluk değil öncelik — sırada çıkmazsa salonun başka yerine bakılır.
export const komsulukSirasi = <T extends KonumluMasa>(adaylar: T[], merkez: KonumluMasa): T[] =>
  [...adaylar].sort((a, b) => {
    const aSira = ayniSirada(a, merkez) ? 0 : 1;
    const bSira = ayniSirada(b, merkez) ? 0 : 1;
    if (aSira !== bSira) return aSira - bSira;
    return yatayUzaklik(a, merkez) - yatayUzaklik(b, merkez);
  });

// Boy -> kalan masa adedi.
export type Havuz = Map<number, number>;

export const havuzKur = (masalar: MasaBilgi[]): Havuz => {
  const h: Havuz = new Map();
  masalar.forEach((m) => h.set(m.seat_count, (h.get(m.seat_count) ?? 0) + 1));
  return h;
};

// Tek masa: tam ölçü varsa o, yoksa yeten EN KÜÇÜK üst boy (israfı en aza indirir).
const tekMasaBul = (h: Havuz, kisi: number): number | null => {
  if ((h.get(kisi) ?? 0) > 0) return kisi;
  const yetenler = [...h.entries()].filter(([boy, adet]) => adet > 0 && boy > kisi).map(([boy]) => boy);
  return yetenler.length ? Math.min(...yetenler) : null;
};

// Birleştirme: en AZ masayla, o masa sayısında en az koltuk israfıyla yeten küme.
// Tek masa denemesi başarısız olduktan sonra çağrıldığı için sonuç hep 2+ masadır.
// maxMasa sabit değil, havuzdaki masa sayısı kadar — 4'e sabitliyken 8+ masa gereken büyük
// gruplar (bütün salonu ayırtan bir grup gibi) hiç yerleşemiyordu (Gökhan: "salon tamamen
// boş, 54 kişilik rezervasyon alamıyor").
const birlestirmeBul = (h: Havuz, kisi: number, maxMasa = [...h.values()].reduce((s, x) => s + x, 0)): number[] | null => {
  const boylar = [...h.entries()].filter(([, adet]) => adet > 0).map(([boy]) => boy).sort((a, b) => b - a);
  const kalan = new Map(h);
  let enIyi: number[] | null = null;
  const daha_iyi = (aday: number[]) => {
    if (!enIyi) return true;
    if (aday.length !== enIyi.length) return aday.length < enIyi.length;
    const t = (x: number[]) => x.reduce((s, b) => s + b, 0);
    return t(aday) < t(enIyi);
  };
  const ara = (basla: number, secilen: number[], toplam: number) => {
    if (toplam >= kisi) { if (daha_iyi(secilen)) enIyi = [...secilen]; return; }
    if (secilen.length >= maxMasa) return;
    for (let i = basla; i < boylar.length; i++) {
      const boy = boylar[i];
      if ((kalan.get(boy) ?? 0) <= 0) continue;
      kalan.set(boy, (kalan.get(boy) ?? 0) - 1);
      secilen.push(boy);
      ara(i, secilen, toplam + boy);
      secilen.pop();
      kalan.set(boy, (kalan.get(boy) ?? 0) + 1);
    }
  };
  ara(0, [], 0);
  return enIyi;
};

// Alınmış rezervasyonları havuza yerleştirir — büyük gruplar önce, çünkü onların seçeneği az.
// Geriye kalan havuz "bu dönemde hâlâ elde ne var" demektir; üstteki masa dökümü bundan çıkar.
export const havuzuTuket = (masalar: MasaBilgi[], gruplar: number[]) => {
  const havuz = havuzKur(masalar);
  const yerlesemeyen: number[] = [];
  [...gruplar].sort((a, b) => b - a).forEach((kisi) => {
    const tek = tekMasaBul(havuz, kisi);
    if (tek !== null) { havuz.set(tek, (havuz.get(tek) ?? 0) - 1); return; }
    const birlesik = birlestirmeBul(havuz, kisi);
    if (birlesik) { birlesik.forEach((boy) => havuz.set(boy, (havuz.get(boy) ?? 0) - 1)); return; }
    yerlesemeyen.push(kisi);
  });
  return { havuz, yerlesemeyen };
};

export type Musaitlik =
  | { tip: "tam"; boy: number }            // Tam ölçüde masa var — soru sorulmaz.
  | { tip: "buyuk"; boy: number }          // Sadece daha büyük masa kaldı — sorulur.
  | { tip: "birlestir"; boylar: number[] } // Tek masa yok, birleştirmeyle olur — sorulur.
  | { tip: "yok" };                        // Hiçbir şekilde olmuyor — soru yok, "yer yok".

// Elde kalan havuzda bir grubun yeri var mı — sıra: tam ölçü → üst boy → birleştirme.
export const havuzdaAra = (havuz: Havuz, kisi: number): Musaitlik => {
  if ((havuz.get(kisi) ?? 0) > 0) return { tip: "tam", boy: kisi };
  const tek = tekMasaBul(havuz, kisi);
  if (tek !== null) return { tip: "buyuk", boy: tek };
  const birlesik = birlestirmeBul(havuz, kisi);
  if (birlesik) return { tip: "birlestir", boylar: birlesik };
  return { tip: "yok" };
};

// Yeni gelen grubun bu döneme sığıp sığmadığı. Önce mevcut rezervasyonlar yerleştirilir,
// sonra kalan havuza yeni grup denenir.
export const musaitlikKontrol = (masalar: MasaBilgi[], mevcutGruplar: number[], kisi: number): Musaitlik =>
  havuzdaAra(havuzuTuket(masalar, mevcutGruplar).havuz, kisi);

// Elde kalanlarla oturtulabilecek EN BÜYÜK grup — "şu an en fazla kaç kişilik alabilirsin"
// tavsiyesi bundan çıkıyor. En büyük masalardan başlayarak birleştirme sınırı kadar toplar.
export const enBuyukSigan = (havuz: Havuz, maxMasa = 4): number => {
  const secilen: number[] = [];
  [...havuz.entries()].sort((a, b) => b[0] - a[0]).forEach(([boy, adet]) => {
    for (let i = 0; i < adet && secilen.length < maxMasa; i++) secilen.push(boy);
  });
  return secilen.reduce((s, b) => s + b, 0);
};

// Havuzu sayı olarak değil GERÇEK masalar üzerinden tüketir — geriye hangi masaların boş
// kaldığı isimleriyle lazım olduğunda (taşıma önerisi bunun üstüne kuruluyor).
export const masalariTuket = <T extends MasaBilgi>(masalar: T[], gruplar: number[]): { kalan: T[]; yerlesemeyen: number[] } => {
  const kalan = [...masalar];
  const yerlesemeyen: number[] = [];
  const cikar = (boy: number) => {
    const i = kalan.findIndex((m) => m.seat_count === boy);
    if (i >= 0) kalan.splice(i, 1);
  };
  [...gruplar].sort((a, b) => b - a).forEach((kisi) => {
    const sonuc = havuzdaAra(havuzKur(kalan), kisi);
    if (sonuc.tip === "tam" || sonuc.tip === "buyuk") { cikar(sonuc.boy); return; }
    if (sonuc.tip === "birlestir") { sonuc.boylar.forEach(cikar); return; }
    yerlesemeyen.push(kisi);
  });
  return { kalan, yerlesemeyen };
};

// "4 kişilik 3, 2 kişilik 1" — boş masaların okunur dökümü.
export const havuzDokumu = (havuz: Havuz): string =>
  [...havuz.entries()].filter(([, adet]) => adet > 0).sort((a, b) => a[0] - b[0])
    .map(([boy, adet]) => `${boy} kişilik ${adet}`).join(", ");

// ————————————————————————————————————————————————————————————————————————
// SALON PLANLAYICI
//
// Gökhan (2026-08-06): "rezervasyonları rasgele değil de olasılıklar dahilinde yerleştiren
// bir algoritma... önceliğimiz masaları elverişli şekilde kullanmak, kalabalık rezervasyon
// gelme ihtimaline karşı her zaman salonu kontrol altında tutmak."
//
// Tek tek "şuna en dar masayı ver" demek yetmiyor: 8 kişilik grup 6+2 yapınca 6'lık masa
// gidiyor, sonra 20 kişilik gruba yer kalmıyor. Oysa aynı 8 kişi 4+2+2'ye otursa 6'lıklar
// bozulmamış olurdu. Bu yüzden planlayıcı her yerleştirmede "bu hamleden sonra salonun
// çıkarabileceği en büyük grup ne olur" diye bakıyor ve onu en yüksek bırakanı seçiyor.
//
// Birleştirme fiziksel bir iş: ancak YAN YANA masalar birleşir. Aynı sıradaki masalar
// soldan sağa dizilip, aralarında dolu masa olmayan ardışık parçalar birleştirilebilir
// sayılıyor — böylece "20 kişiyi 10 ayrı 2'liğe böl" gibi bir şey kendiliğinden çıkmıyor.
// Salon planına hiç yerleştirilmemiş masalarda konum yok; orada boy hesabına düşülüyor.
// ————————————————————————————————————————————————————————————————————————

// normalX/normalY: masanın işletmedeki ASIL yeri. Yerleşim hep BUNDAN hesaplanır, o anki
// (belki zaten kaymış) konumdan değil — yoksa "Yerleşim yap" her tekrarında bir öncekinin
// üstüne inşa eder, kaymalar birikir ve masalar üst üste biner (Gökhan: "yerleştirmeyi yap
// dediğimde halen masalar birbirinin üzerine çıkıyor"). Sadece normalX vardı, normalY hiç
// taşınmıyordu — önceden taşınmış bir masanın gerçek satırı bir daha bulunamıyordu.
// alanId/alanEni: masanın hangi salonda (dining_areas) olduğu ve o salonun GERÇEK eni (px).
// Yerleşim her salonu ayrı hesaplar (ayrı salonların tuvalleri ayrı, koordinatları karışmaz) ve
// alanEni salonun sağ duvarıdır — masa bu duvarın dışına çıkarılmaz.
// shape/rotated: masanın şekli ve şu anki duruşu. Birleşirken duruşu farklı olan masa çıpanın
// yönüne çevriliyor (Gökhan, 2026-08-19) — hangi masanın çevrilebileceği şekilden anlaşılıyor,
// çevirme yalnız dikdörtgende anlamlı.
export type PlanMasa = KonumluMasa & {
  id: string; genislik?: number; yukseklik?: number; normalX?: number | null; normalY?: number | null;
  alanId?: string | null; alanEni?: number | null; shape?: string; rotated?: boolean;
};
export type PlanRez = { id: string; kisi: number };
export type PlanSonuc = { atamalar: Record<string, string[]>; yerlesemeyen: string[] };

// Masaları sıralara böler: aynı yükseklikteler aynı sıra, her sıra soldan sağa dizili.
// ASIL konumdan (kaymış olabilecek canlı konumdan değil) — yoksa bir kez taşınmış bir masa
// bir daha doğru sırasına ait sayılmıyordu (yukarıdaki KonumluMasa notuna bakın).
// Konumu olmayanlar tek bir "konumsuz" grupta toplanır (orada yan yanalık aranmaz).
// HER SALON KENDİ İÇİNDE. Ayrı salonların tuvalleri ayrı olduğu için koordinatları çakışıyor;
// salon ayrımı olmadan bahçedeki masayla terastaki masa "yan yana" sayılıyor ve bir rezervasyona
// iki ayrı salondan masa veriliyordu (Gökhan, 2026-08-14: "2 kişilik masalar yanlış yerden masa
// çekmiş"). Aynı rezervasyonun masaları tek salondan gelir.
const siralaraBol = (masalar: PlanMasa[]): PlanMasa[][] => {
  const konumlu = masalar.filter((m) => asilKX(m) !== null && asilKY(m) !== null);
  const konumsuz = masalar.filter((m) => asilKX(m) === null || asilKY(m) === null);
  const siralar: PlanMasa[][] = [];
  [...konumlu].sort((a, b) => asilKY(a)! - asilKY(b)!).forEach((m) => {
    const sira = siralar.find((s) => (s[0].alanId ?? null) === (m.alanId ?? null)
      && Math.abs(asilKY(s[0])! - asilKY(m)!) <= SIRA_TOLERANS);
    if (sira) sira.push(m); else siralar.push([m]);
  });
  siralar.forEach((s) => s.sort((a, b) => asilKX(a)! - asilKX(b)!));
  return konumsuz.length ? [...siralar, konumsuz] : siralar;
};

// Masaları SÜTUNLARA böler: aynı düşey hattaki masalar aynı sütun, her sütun yukarıdan aşağı
// dizili (Gökhan, 2026-08-19). Dik duran (çevrilmiş) masalar alt alta birleştiği için komşuluk
// orada düşey hat üzerinde aranıyor; sıralara bölme yatay birleşmenin karşılığı.
// Sıralarda olduğu gibi her salon kendi içinde.
const sutunlaraBol = (masalar: PlanMasa[]): PlanMasa[][] => {
  const konumlu = masalar.filter((m) => asilKX(m) !== null && asilKY(m) !== null);
  const sutunlar: PlanMasa[][] = [];
  [...konumlu].sort((a, b) => asilKX(a)! - asilKX(b)!).forEach((m) => {
    const s = sutunlar.find((s) => (s[0].alanId ?? null) === (m.alanId ?? null)
      && Math.abs(asilKX(s[0])! - asilKX(m)!) <= SIRA_TOLERANS);
    if (s) s.push(m); else sutunlar.push([m]);
  });
  sutunlar.forEach((s) => s.sort((a, b) => asilKY(a)! - asilKY(b)!));
  return sutunlar;
};

// Bir gruba uyan masa kümeleri. Masalar taşınabildiği için yan yanalık ARTIK ŞART DEĞİL
// (Gökhan: "öncelik en mantıklı dizilimi en yakından yapmak, ama en mantıklı dizilim uzakta
// ise masalar taşınır") — yan yanalık sadece tercih, taşıma sayısı olarak tartıya giriyor.
// Önce hangi BOYLARIN kullanılacağı seçiliyor (en az israf, sonra en az masa), ardından o
// boylar gerçek masalara dağıtılıyor: mümkün olduğunca hazır yan yana duran bir parçadan,
// eksik kalan da en yakın masadan çekilerek.

// kisi'yi karşılayan boy kümeleri — en iyiden başlayarak SIRALI liste. Tek bir "en iyi"
// döndürmek yetmiyordu: o kümenin masaları yan yana bulunamayınca yerleştirici pes ediyor ve
// aslında oturabilecek grup açıkta kalıyordu (Gökhan: "kişisi tam ama yine oturtamıyor").
// Sıralama: önce en az israf, sonra en az masa. Boy çeşidi az olduğu için (2/4/6 gibi) arama
// küçük kalıyor. maxMasa artık sabit bir sayı değil, elde ne kadar masa varsa o — yoksa
// "bütün restoranı ayırtıyorum" gibi 8'den fazla masa gereken büyük gruplar hiç oturamıyordu
// (Gökhan: "salon tamamen boş, 54 kişilik rezervasyon alamıyor" — salon tam 54 kişilikti,
// sadece 8 masaya sabitlenmiş olması yüzünden en fazla 38 kişiye izin veriyordu).
// Ek sandalye kuralı buradan KALDIRILDI (Gökhan, 2026-08-12: "ek sandalye olayını çıkaralım,
// onun yerine manuel bir şeyler koyalım"). Bir gün denendi: yoğunken 5 kişiyi 4 kişilik masaya
// oturtsun diye kabul koşulu gevşetilmişti, ama seçim kalitesi bozuldu — 2 kişilik gruplar
// 6 kişilik masalara düştü, küçük gruplar açıkta kaldı. Program artık masayı hep tam ölçüye
// göre seçer; küçük masaya sandalye ekleyip oturtmak İNSANIN kararı, masa seçme penceresinden
// elle yapılır.
const boyAdaylari = (bosMasalar: PlanMasa[], kisi: number, maxMasa = bosMasalar.length, limit = 20): number[][] => {
  const sayim = new Map<number, number>();
  bosMasalar.forEach((m) => sayim.set(m.seat_count, (sayim.get(m.seat_count) ?? 0) + 1));
  const boylar = [...sayim.keys()].sort((a, b) => b - a);
  const bulunan: number[][] = [];
  const ara = (i: number, secilen: number[], toplam: number) => {
    if (toplam >= kisi) { bulunan.push([...secilen]); return; }
    if (secilen.length >= maxMasa || i >= boylar.length) return;
    for (let j = i; j < boylar.length; j++) {
      const boy = boylar[j];
      const kalan = (sayim.get(boy) ?? 0) - secilen.filter((x) => x === boy).length;
      if (kalan <= 0) continue;
      secilen.push(boy);
      ara(j, secilen, toplam + boy);
      secilen.pop();
    }
  };
  ara(0, [], 0);
  const israf = (k: number[]) => k.reduce((s, b) => s + b, 0) - kisi;
  return bulunan.sort((a, b) => israf(a) - israf(b) || a.length - b.length).slice(0, limit);
};

// Seçilen boyları gerçek masalara dağıtır. Her sıradaki yan yana boş parçalar "hazır" kabul
// edilir; en çok boyu karşılayan parça temel alınır, eksikler oraya en yakın masalardan
// çekilir (o masalar fiilen taşınacak). Dönen taşimaSayisi = kaç masa yerinden oynayacak.
// MİSAFİR MASASI TERCİHİ (Gökhan, 2026-08-15). Ev sahibinin ikinci masası ya olabildiğince
// yakına ya olabildiğince uzağa konur. Birleştirme YOK — iki ayrı rezervasyon, aralarında
// hep AYRI_MESAFE kalır; burada belirlenen sadece hangi masaların seçileceği.
//   yakin: ev sahibinin salonunda, ona en yakın masalar
//   uzak : önce başka salon; başka salon yoksa aynı salonun öbür ucu
export type YakinlikTercihi = { merkezX: number; merkezY: number; alanId: string | null; yakin: boolean };

const uzaklik = (m: PlanMasa, t: YakinlikTercihi) => {
  const x = asilKX(m), y = asilKY(m);
  if (x === null || y === null) return Number.POSITIVE_INFINITY;
  return Math.hypot(x - t.merkezX, y - t.merkezY);
};
// Bir seçimin ev sahibine olan uzaklığı: yakınlıkta en yakın masa, uzaklıkta en yakın masa
// belirleyicidir — "en uzak masa uzakta ama biri dibinde" durumu uzak sayılmasın.
const secimUzakligi = (secim: PlanMasa[], t: YakinlikTercihi) =>
  Math.min(...secim.map((m) => uzaklik(m, t)));

// BİRLEŞME YÖNÜ (Gökhan, 2026-08-19: "masalar ne tarafa birleşeceğini nasıl bilecekler,
// sorun şu an o... salonda masanın yönü sabit bir tarafa olacak diye bir şey yok").
//
// Kural: KISA KENARLAR ÖPÜŞÜR (Gökhan, 2026-08-14) — ama bu masanın salondaki duruşuna göre
// hesaplanır, sabit bir yön yoktur:
//   • Geniş duran masa (eni boyundan büyük) YAN YANA birleşir; değen kenarlar kısa kenarlardır,
//     uzun kenarlar (120'lik gibi) asla yapışmaz.
//   • Dik duran masa (çevrilmiş, boyu eninden büyük) ALT ALTA birleşir.
//   • Kare masada iki yön de aynıdır; yön komşudan gelir — bitişik boş masa hangi taraftaysa.
//
// Seçim ile çizim AYNI yönü kullanır. Eskiden ayrışıyorlardı: seçim masaları hep aynı sıradan
// yan yana alıyor, çizim ise masa dik duruyorsa onları alt alta diziyordu; küme sıradan çıkıp
// alttaki sıraya biniyordu (Gökhan, 2026-08-19 ekran görüntüsü).
//
// Bitişik hazır yer yoksa masa TAŞINIR (Gökhan, 2026-08-19: "ihtimal yoksa 2+2+2 yapar ama
// ihtimal daima vardır", taşıma sınırı sorulduğunda "sınırsız olsun"): boy sırası (en az israf →
// en az masa) bozulmaz, eksik masa kümenin yanına getirilir. Böylece 6 kişilik rezervasyon
// 4+2 ile kurulur; 2+2+2 ancak 4+2 hiçbir şekilde kurulamıyorsa devreye girer.
const masalariSec = (
  siralar: PlanMasa[][], bosIds: Set<string>, boylar: number[], tercih?: YakinlikTercihi,
  // Rezervasyonun ŞU ANKİ masaları — birden fazla uygun yer varsa en yakını seçilir.
  mevcutMasalar: PlanMasa[] = [],
): { masalar: PlanMasa[]; taşımaSayisi: number } | null => {
  const gereken = [...boylar].sort((a, b) => b - a);

  // Masanın kendi duruşu hangi yönde birleşmeye uygun: geniş → yatay, dik → dikey, kare → ikisi.
  const yonUygun = (cipa: PlanMasa, dikey: boolean) => {
    if (gereken.length < 2) return true; // tek masa — birleşme yok, yön de yok
    const g = cipa.genislik ?? 0, y = cipa.yukseklik ?? 0;
    if (g === y) return true;            // kare
    return dikey ? y > g : g > y;
  };

  // Bir hat (sıra ya da sütun) üzerindeki YAN YANA boş masa dizileri — dolu masa hattı böler.
  const bosParcalar = (hat: PlanMasa[]): PlanMasa[][] => {
    const cikti: PlanMasa[][] = [];
    let aktif: PlanMasa[] = [];
    hat.forEach((m) => {
      if (bosIds.has(m.id)) aktif.push(m);
      else { if (aktif.length) cikti.push(aktif); aktif = []; }
    });
    if (aktif.length) cikti.push(aktif);
    return cikti;
  };

  // Sıralar yatay hat, sütunlar dikey hat. Dik duran masalar alt alta birleşeceği için sütun
  // komşuluğu da aranıyor — eskiden sadece sıralara bakılıyordu.
  const hatlar: { hat: PlanMasa[]; dikey: boolean }[] = [
    ...siralar.map((s) => ({ hat: s, dikey: false })),
    ...sutunlaraBol(siralar.flat()).map((s) => ({ hat: s, dikey: true })),
  ];

  // 1) TAŞIMASIZ: gereken boyları tam karşılayan bitişik pencere.
  const adaylar: PlanMasa[][] = [];
  const gorulen = new Set<string>();
  hatlar.forEach(({ hat, dikey }) => {
    bosParcalar(hat).forEach((p) => {
      for (let i = 0; i + gereken.length <= p.length; i++) {
        const pencere = p.slice(i, i + gereken.length);
        const boylari = pencere.map((m) => m.seat_count).sort((a, b) => b - a);
        if (!boylari.every((b, k) => b === gereken[k])) continue;
        if (!yonUygun(pencere[0], dikey)) continue;
        const anahtar = pencere.map((m) => m.id).sort().join("|");
        if (gorulen.has(anahtar)) continue;
        gorulen.add(anahtar);
        adaylar.push(pencere);
      }
    });
  });

  // 2) TAŞIMALI: hazır bitişik yer yoksa, en çok boyu karşılayan bitişik parça temel alınır,
  // eksik masalar en yakından çekilir. Çekilen masa kümenin yanına taşınır (birlesikYerlesim
  // onları çıpanın yönünde dip dibe dizer).
  const taşımali: { masalar: PlanMasa[]; taşımaSayisi: number }[] = [];
  if (adaylar.length === 0) {
    hatlar.forEach(({ hat, dikey }) => {
      bosParcalar(hat).forEach((temel) => {
        if (!yonUygun(temel[0], dikey)) return;
        const kalanGereken = [...gereken];
        const secilen: PlanMasa[] = [];
        temel.forEach((m) => {
          const i = kalanGereken.indexOf(m.seat_count);
          if (i >= 0) { kalanGereken.splice(i, 1); secilen.push(m); }
        });
        if (secilen.length === 0) return;
        // Eksik masa AYNI SALONDAN çekilir; başka salondan masa katılmaz.
        const merkez = secilen[0];
        const disarisi = siralar.flat().filter((m) => bosIds.has(m.id) && !secilen.includes(m)
          && (m.alanId ?? null) === (merkez.alanId ?? null));
        komsulukSirasi(disarisi, merkez).forEach((m) => {
          const i = kalanGereken.indexOf(m.seat_count);
          if (i >= 0) { kalanGereken.splice(i, 1); secilen.push(m); }
        });
        if (kalanGereken.length > 0) return;
        taşımali.push({ masalar: secilen, taşımaSayisi: secilen.filter((m) => !temel.includes(m)).length });
      });
    });
    if (taşımali.length === 0) return null;
  }

  // Rezervasyonun şu anki masalarının ortası — eşit adaylar arasında en yakını kazansın diye.
  const mevcutMerkez = mevcutMasalar
    .filter((m) => asilKX(m) !== null && asilKY(m) !== null)
    .reduce<{ x: number; y: number; n: number }>(
      (t, m) => ({ x: t.x + asilKX(m)!, y: t.y + asilKY(m)!, n: t.n + 1 }), { x: 0, y: 0, n: 0 });
  const mevcudaUzaklik = (secim: PlanMasa[]) => {
    if (mevcutMerkez.n === 0) return 0;
    const mx = mevcutMerkez.x / mevcutMerkez.n, my = mevcutMerkez.y / mevcutMerkez.n;
    return Math.min(...secim.map((m) =>
      asilKX(m) === null || asilKY(m) === null
        ? Number.POSITIVE_INFINITY
        : Math.hypot(asilKX(m)! - mx, asilKY(m)! - my)));
  };
  // Hiçbir ölçüt ayırmazsa salon soldan sağa, yukarıdan aşağı okunur — ilk sıradaki soldaki yer.
  const okumaSirasi = (secim: PlanMasa[]) => {
    const x = Math.min(...secim.map((m) => asilKX(m) ?? Number.MAX_SAFE_INTEGER));
    const y = Math.min(...secim.map((m) => asilKY(m) ?? Number.MAX_SAFE_INTEGER));
    return { x, y };
  };

  let enIyi: { masalar: PlanMasa[]; taşımaSayisi: number } | null = null;
  let enIyiUzaklik = tercih?.yakin ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  let enIyiMevcut = Number.POSITIVE_INFINITY;
  let enIyiOkuma = { x: Number.MAX_SAFE_INTEGER, y: Number.MAX_SAFE_INTEGER };

  // Taşımasız adaylar varsa yarışa onlar girer; yoksa taşımalılar. Taşıma sayısı burada
  // (aynı boy kümesi içinde) az olanı öne alır — boy sırasını bozmaz.
  const yarisanlar: { masalar: PlanMasa[]; taşımaSayisi: number }[] = adaylar.length > 0
    ? adaylar.map((masalar) => ({ masalar, taşımaSayisi: 0 }))
    : taşımali;

  yarisanlar.forEach(({ masalar: secim, taşımaSayisi }) => {
    // Misafir masasında ölçüt değişmiyor: ev sahibine yakınlık/uzaklık önce gelir.
    if (tercih) {
      const u = secimUzakligi(secim, tercih);
      if (!enIyi || (tercih.yakin ? u < enIyiUzaklik : u > enIyiUzaklik)
        || (u === enIyiUzaklik && taşımaSayisi < enIyi.taşımaSayisi)) {
        enIyi = { masalar: secim, taşımaSayisi };
        enIyiUzaklik = u;
      }
      return;
    }
    // Boylar sabit olduğu için israf eşit; ayıran ölçütler sırayla: az taşıma → rezervasyonun
    // şu anki masasına yakınlık → salonun okuma sırası (Gökhan, 2026-08-19 onayı).
    const u = mevcudaUzaklik(secim);
    const o = okumaSirasi(secim);
    const daha = !enIyi
      || taşımaSayisi < enIyi.taşımaSayisi
      || (taşımaSayisi === enIyi.taşımaSayisi && (u < enIyiMevcut
        || (u === enIyiMevcut && (o.y < enIyiOkuma.y || (o.y === enIyiOkuma.y && o.x < enIyiOkuma.x)))));
    if (daha) { enIyi = { masalar: secim, taşımaSayisi }; enIyiMevcut = u; enIyiOkuma = o; }
  });
  return enIyi;
};


// Tek geçişte plan kurar. koru: mevcut ataması korunacak rezervasyonlar (masaları hâlâ
// uygunsa oldukları yerde bırakılır).
// Misafir masaları: hangi rezervasyon kimin ikinci masası ve yakın mı uzak mı istiyor.
// Rezervasyonlar veritabanında birbirine bağlı DEĞİL; bu eşleşme her hesapta numara + isim +
// günden bulunup buraya veriliyor (Gökhan, 2026-08-15: "rezervasyonları birbirine bağlama").
export type MisafirBagi = Record<string, { evSahibiId: string; yakin: boolean }>;

const planKur = (
  masalar: PlanMasa[],
  serbest: PlanRez[],
  sabitler: { rez: PlanRez; masaIds: string[] }[],
  mevcut: Record<string, string[]>,
  misafirler: MisafirBagi = {},
): PlanSonuc => {
  const siralar = siralaraBol(masalar);
  const bosIds = new Set(masalar.map((m) => m.id));
  const atamalar: Record<string, string[]> = {};
  const koltuk = (ids: string[]) => ids.reduce((s, id) => s + (masalar.find((m) => m.id === id)?.seat_count ?? 0), 0);

  sabitler.forEach(({ rez, masaIds }) => {
    masaIds.forEach((id) => bosIds.delete(id));
    atamalar[rez.id] = masaIds;
  });

  // Mevcut yerleşimi olan ve hâlâ yeten rezervasyonlar yerinde kalır — küçük bir değişiklik
  // yüzünden bütün salonun oynamasını engelliyor (Gökhan: "2 masanın yerini değiştirip
  // halledecekken 7 rezervasyonun masasını değiştiriyor").
  // Misafir masaları bu korumanın DIŞINDA: yakın/uzak tercihi ancak yeniden seçilirse
  // uygulanabilir, eski yer o tercihi tutmuyor olabilir.
  serbest.forEach((rez) => {
    if (misafirler[rez.id]) return;
    const ids = mevcut[rez.id] ?? [];
    if (ids.length === 0 || !ids.every((id) => bosIds.has(id)) || koltuk(ids) < rez.kisi) return;
    ids.forEach((id) => bosIds.delete(id));
    atamalar[rez.id] = ids;
  });

  const yerlesemeyen: string[] = [];
  // Büyükten küçüğe: kalabalık grupların seçeneği az, önce onlar yerleşmeli. Misafir masaları
  // EN SONA bırakılır — ev sahibinin masası belli olmadan yakın/uzak hesaplanamaz.
  const sirali = [...serbest].filter((r) => !atamalar[r.id]).sort((a, b) => {
    const am = misafirler[a.id] ? 1 : 0, bm = misafirler[b.id] ? 1 : 0;
    return am - bm || b.kisi - a.kisi;
  });
  sirali.forEach((rez) => {
    const bosMasalar = masalar.filter((m) => bosIds.has(m.id));
    // Misafir masasıysa ev sahibinin masalarının ortası hedef alınır.
    let tercih: YakinlikTercihi | undefined;
    const bag = misafirler[rez.id];
    if (bag) {
      const evMasalari = (atamalar[bag.evSahibiId] ?? [])
        .map((id) => masalar.find((m) => m.id === id))
        .filter((m): m is PlanMasa => !!m && asilKX(m) !== null && asilKY(m) !== null);
      if (evMasalari.length > 0) {
        tercih = {
          merkezX: evMasalari.reduce((s, m) => s + asilKX(m)!, 0) / evMasalari.length,
          merkezY: evMasalari.reduce((s, m) => s + asilKY(m)!, 0) / evMasalari.length,
          alanId: evMasalari[0].alanId ?? null,
          yakin: bag.yakin,
        };
      }
    }
    // Aday boy kümeleri (en az israf, sonra en az masa) SIRAYLA denenir ve tutan İLK aday
    // kazanır (Gökhan, 2026-08-19: "6 kişilik rezervasyon için 4'lük ve 2'lik masa birleştirmesi
    // gerekirken üç tane ikilik birleştiriyor", taşıma sınırı sorulduğunda "sınırsız olsun").
    //
    // Eskiden ölçüt "en az taşıma"ydı: taşımasız kurulabilen her aday, daha az masalı ama bir
    // masa taşımayı gerektiren adayı geçiyordu — 4+2 varken 2+2+2 seçilmesinin sebebi buydu.
    // Bu değişiklik 12 Ağustos'taki "18 kişide 6+6+6 yerine tam sırayı kullan" tercihini de
    // etkiliyor: artık az masalı olan kazanır, gereken masa yanına taşınır. Taşıma sayısı yalnız
    // AYNI boy kümesi içindeki adaylar arasında ayırt edici (bkz. masalariSec).
    let enIyi: { masalar: PlanMasa[]; taşımaSayisi: number } | null = null;
    // "Uzak" istenmişse önce BAŞKA SALONLAR denenir; oralarda yer yoksa bütün salonlara
    // düşülür ve aynı salonun en uzak ucu seçilir (Gökhan: "önce başka salon, o olmazsa
    // salonun öbür ucu"). "Yakın"da tersi: sadece ev sahibinin salonu.
    const aramaListeleri: PlanMasa[][][] = !tercih ? [siralar]
      : tercih.yakin
        ? [siralar.filter((s) => (s[0].alanId ?? null) === tercih!.alanId), siralar]
        : [siralar.filter((s) => (s[0].alanId ?? null) !== tercih!.alanId), siralar];
    // Rezervasyonun şu anki masaları — eşit derecede uygun iki bitişik yer varsa buna en
    // yakın olan seçilir (Gökhan, 2026-08-19).
    const mevcutMasalari = (mevcut[rez.id] ?? [])
      .map((id) => masalar.find((m) => m.id === id))
      .filter((m): m is PlanMasa => !!m);
    for (const liste of aramaListeleri) {
      if (liste.length === 0) continue;
      for (const boylar of boyAdaylari(bosMasalar, rez.kisi)) {
        const secim = masalariSec(liste, bosIds, boylar, tercih, mevcutMasalari);
        if (!secim) continue;
        // Misafir masasında (yakın/uzak) bütün adaylar gezilir, en uygun uzaklık kazanır;
        // normalde boy sırası zaten doğru sırada geldiği için ilk tutan aday kazanır.
        if (!tercih) { enIyi = secim; break; }
        if (!enIyi || secim.taşımaSayisi < enIyi.taşımaSayisi
          || (secim.taşımaSayisi === enIyi.taşımaSayisi && secim.masalar.length < enIyi.masalar.length)) {
          enIyi = secim;
        }
      }
      if (enIyi) break; // tercih edilen listede yer bulundu, alt listeye düşmeye gerek yok
    }
    if (!enIyi) { yerlesemeyen.push(rez.id); return; }
    enIyi.masalar.forEach((m) => bosIds.delete(m.id));
    atamalar[rez.id] = enIyi.masalar.map((m) => m.id);
  });

  return { atamalar, yerlesemeyen };
};

// Bütün günü birden planlar. sabitler: oynatılamayacak rezervasyonlar (oturmuş ya da kilitli).
// mevcut: rezervasyonların şu anki masaları — mümkün olduğunca korunur.
//
// İki aşamalı: önce mevcut yerleşim korunarak denenir (en az oynama). Bu şekilde açıkta kalan
// olursa salon sıfırdan dizilir — yani masaları toptan karıştırmak sadece başka çare
// kalmadığında yapılır.
export const salonuPlanla = (
  masalar: PlanMasa[],
  serbest: PlanRez[],
  sabitler: { rez: PlanRez; masaIds: string[] }[],
  mevcut: Record<string, string[]> = {},
  misafirler: MisafirBagi = {},
): PlanSonuc => {
  const azOynayan = planKur(masalar, serbest, sabitler, mevcut, misafirler);
  if (azOynayan.yerlesemeyen.length === 0) return azOynayan;
  const sifirdan = planKur(masalar, serbest, sabitler, {}, misafirler);
  return sifirdan.yerlesemeyen.length < azOynayan.yerlesemeyen.length ? sifirdan : azOynayan;
};

// Birleşen masaların salon planındaki YERLERİ (Gökhan: "6-1 ile 4-1 birleşti, masa planında
// da yan yana gelecek ki garsonlar planı görüp yapacaklar"). Programın kendisi masayı çekemez;
// çekilecek hâli plana yazar, garson görüp uygular.
// rotated: masa birleşmek için çevrilecekse yeni duruşu; çevrilmiyorsa alan hiç gelmez.
export type MasaYeri = { id: string; x: number; y: number; rotated?: boolean };

// ————————————————————————————————————————————————————————————————————————
// YERLEŞİM — baştan yazıldı (Gökhan, 2026-08-12).
//
// Kurallar, Gökhan'ın cümleleriyle:
//  1) Kilitli masa SABİT ENGELDİR: yeri hiç değişmez, kapladığı alan dolu sayılır.
//  2) Salon sınırı ASLA aşılmaz — ne sağdan ne soldan taşma olur.
//  3) Bir sıraya sığmayan masa uygun başka sıraya geçer.
//  4) Aynı rezervasyonun masaları hiçbir koşulda bölünmez, dip dibe durur.
//  5) Ayrı rezervasyonların masaları arasında sabit mesafe hep kalır.
//  6) İşi olmayan masa yerinden oynamaz.
//
// İşleyiş:
//  • Her salon (dining_area) AYRI hesaplanır — ayrı salonların tuvalleri ayrı, koordinatları
//    birbirine karışmaz. Satırlar masaların ASIL (ev) yerlerinden çıkar, o an nerede
//    durduklarından değil; yoksa her çalıştırmada kaymalar birikir ve masalar üst üste biner.
//  • Salonun sağ sınırı salonun gerçek eni (Ayarlar'daki en × PX_PER_CM); girilmemişse en
//    sağdaki masanın ev kenarı. Sol sınır 0.
//  • Yerleşecek her şey bir BLOK: ya tek bir masa, ya bir rezervasyonun bütün masaları.
//    Blok bölünmez ve içinde boşluk yoktur (kural 4). Kilitli masa blok değil, ENGELdir.
//  • Satır iki yönden dizilir: sağdan sola "bu blok en geç nereye konabilir" (tavan), soldan
//    sağa "ev yerinde dursun, soldaki üstüne geliyorsa sağa itilsin". Blok tavanı aşarsa
//    tavana çekilir — yani sola kayma sadece sınıra dayanınca olur, kendiliğinden olmaz
//    (kural 6). Bloklar arasında hep AYRI_MESAFE kalır (kural 5), kimse sınırı aşmaz (kural 2).
//  • Satır hiçbir şekilde sığmıyorsa bir blok komşu satıra taşınır (kural 3): önce işi olmayan
//    tek masalar, en sağdakinden başlayarak; olmazsa küme. Taşınan masa, o satırdan kümeye
//    katılıp boşalmış bir yer varsa oraya gider.
//  • Hiçbir çare kalmazsa satır sınırı taşar ama masalar ASLA üst üste binmez — üst üste binen
//    masa alttakini kaybettiriyor, taşan masa hiç değilse görünüyor.
// ————————————————————————————————————————————————————————————————————————

type Aralik = { sol: number; sag: number; id?: string };
type Blok = { uyeler: PlanMasa[]; gen: number; dogal: number; satir: number; kume: boolean };

export const birlesikYerlesim = (
  kumeler: PlanMasa[][],
  tumMasalar: PlanMasa[],
  kilitliIds: ReadonlySet<string> = new Set(),
): MasaYeri[] => {
  // Masanın ASIL (ev) yeri: önce işletmenin kaydettiği düzen (raptiye), sonra birleştirmeden
  // önceki yeri, o da yoksa bulunduğu yer (Gökhan, 2026-08-19).
  const evX = (m: PlanMasa) => m.varsayilanX ?? m.normalX ?? m.position_x;
  const evY = (m: PlanMasa) => m.varsayilanY ?? m.normalY ?? m.position_y;
  // BİRLEŞİRKEN ÇEVRİLECEK MASALAR (Gökhan, 2026-08-19: "o birleştirmeyi yapabilir ama masayı
  // çevirmesi gerekir"). Kümede biri enine biri dikine duruyorsa çıpa yerinde ve yönünde kalır,
  // katılan masa onun yönüne çevrilir — böylece kısa kenarlar öpüşür. Çevrilen masanın eni ve
  // boyu da yer değiştirdiği için bütün ölçü hesabı bunu bilmek zorunda.
  const cevrilecek = new Map<string, boolean>(); // masa id -> yeni "rotated" değeri
  const gen = (m: PlanMasa) => (cevrilecek.has(m.id) ? (m.yukseklik ?? 0) : (m.genislik ?? 0));
  const yuk = (m: PlanMasa) => (cevrilecek.has(m.id) ? (m.genislik ?? 0) : (m.yukseklik ?? 0));
  // position_x sürükleme KUTUSUNUN sol kenarı, gövde kutunun ortasında çizilir (masaOlcu.ts).
  // Hesap gövde kenarlarıyla yapılır, sonuç position_x'e geri çevrilir.
  const govdeSol = (m: PlanMasa, x: number) => x + (BOX_W - gen(m)) / 2;
  const govdeSag = (m: PlanMasa, x: number) => x + (BOX_W + gen(m)) / 2;
  const xIcin = (m: PlanMasa, sol: number) => Math.round(sol - (BOX_W - gen(m)) / 2);

  const konumlu = tumMasalar.filter((m) => evX(m) !== null && evY(m) !== null);
  if (konumlu.length === 0) return [];
  const byId = new Map(konumlu.map((m) => [m.id, m]));

  // KÜMELER = aynı rezervasyonun masaları. Bir masa yalnız bir kümeye girebilir.
  const kumeUye: PlanMasa[][] = [];
  const kumeNo = new Map<string, number>();
  kumeler.forEach((k) => {
    const uyeler: PlanMasa[] = [];
    k.forEach((m) => {
      const t = byId.get(m.id);
      if (t && !kumeNo.has(t.id)) { kumeNo.set(t.id, kumeUye.length); uyeler.push(t); }
    });
    if (uyeler.length < 2) { uyeler.forEach((m) => kumeNo.delete(m.id)); return; }
    kumeUye.push(uyeler);
  });

  const yerlesmis = new Map<string, { x: number; y: number }>();
  // Kilitli masa kural olarak hiç yazılmaz. TEK istisna: tamamı kilitli bir rezervasyonun
  // masaları birbirine bitişirken çıpanın yanına çekilenler — aynı rezervasyonun masaları
  // bölünmez kuralı burada kilidin önüne geçer (Gökhan, 2026-08-14).
  const kilitliTasinan = new Set<string>();

  const alanlar = new Map<string, PlanMasa[]>();
  konumlu.forEach((m) => {
    const a = m.alanId ?? "";
    const liste = alanlar.get(a);
    if (liste) liste.push(m); else alanlar.set(a, [m]);
  });

  alanlar.forEach((masalar) => {
    const bizim = new Set(masalar.map((m) => m.id));

    // BİRLEŞEN MASA YOKSA BU SALONA HİÇ DOKUNULMAZ (Gökhan, 2026-08-19: "getirmiyor
    // varsayılana"). Aşağıdaki dizilim, küme olmasa bile bütün satırları yeniden paketliyordu:
    // salon ekranı her tazelemede (6 saniyede bir) masaları oynatıp yeni "ev" yazıyor, bir
    // sonraki tazeleme onları geri götürüyordu — masalar boş olduğu hâlde sürekli gidip gelen
    // bir döngüye giriyorlardı, "Varsayılana getir" de bu yüzden tutmuyordu. Sunucu kaydında
    // aynı masalara dakikada onlarca yazma olarak görünüyor.
    if (!kumeUye.some((k) => k.some((m) => bizim.has(m.id)))) return;

    // SATIRLAR — asıl yerlere göre, her satır soldan sağa dizili.
    const satirlar: { y: number; uyeler: PlanMasa[] }[] = [];
    [...masalar].sort((a, b) => evY(a)! - evY(b)!).forEach((m) => {
      const s = satirlar.find((s) => Math.abs(s.y - evY(m)!) <= SIRA_TOLERANS);
      if (s) s.uyeler.push(m); else satirlar.push({ y: evY(m)!, uyeler: [m] });
    });
    satirlar.forEach((s) => s.uyeler.sort((a, b) => evX(a)! - evX(b)!));
    const satirNo = new Map<string, number>();
    satirlar.forEach((s, i) => s.uyeler.forEach((m) => satirNo.set(m.id, i)));
    const satirBul = (y: number, varsayilan: number) => {
      const i = satirlar.findIndex((s) => Math.abs(s.y - y) <= SIRA_TOLERANS);
      return i < 0 ? varsayilan : i;
    };

    // SALON SINIRI
    const SOL_SINIR = 0;
    const olculu = masalar.find((m) => (m.alanEni ?? 0) > 0);
    const SAG_SINIR = olculu?.alanEni ?? Math.max(...masalar.map((m) => govdeSag(m, evX(m)!)));

    // ENGELLER — kilitli masalar ŞU ANKİ yerlerinde (kilit "burada kalacak" demek).
    const engeller: Aralik[][] = satirlar.map(() => []);
    masalar.forEach((m) => {
      if (!kilitliIds.has(m.id)) return;
      const x = m.position_x ?? evX(m)!;
      const y = m.position_y ?? evY(m)!;
      engeller[satirBul(y, satirNo.get(m.id)!)].push({ sol: govdeSol(m, x), sag: govdeSag(m, x), id: m.id });
    });

    // BLOKLAR
    const satirBlok: Blok[][] = satirlar.map(() => []);
    const blokKur = (uyeler: PlanMasa[], satir: number, dogal: number, kume: boolean): Blok =>
      ({ uyeler, gen: uyeler.reduce((t, m) => t + gen(m), 0), dogal, satir, kume });

    // Kilitli bir kümeyi yerleştirirken kendi üyeleri dışındaki engellere çarpmamak gerekiyor;
    // yoksa iki ayrı kilitli rezervasyonun masaları üst üste biniyordu (2026-08-14 taraması).
    // Çıpanın yanından başlanır, çarparsa sağa kayar, sağ duvara dayanırsa sola denenir.
    // Hiçbir yere sığmıyorsa null döner ve o masalar hiç oynatılmaz — üst üste binmektense
    // oldukları yerde kalırlar.
    const bosAralikBul = (satir: number, baslangic: number, uzunluk: number, hariç: Set<string>): number | null => {
      const eng = engeller[satir].filter((e) => !e.id || !hariç.has(e.id)).sort((a, b) => a.sol - b.sol);
      const carpan = (x: number) => eng.find((o) => x < o.sag && o.sol < x + uzunluk);
      let x = baslangic;
      for (let d = 0; d <= eng.length; d++) {
        const c = carpan(x);
        if (!c) break;
        x = c.sag;
      }
      if (!carpan(x) && x >= SOL_SINIR && x + uzunluk <= SAG_SINIR) return x;
      x = baslangic;
      for (let d = 0; d <= eng.length; d++) {
        const c = carpan(x);
        if (!c) break;
        x = c.sol - uzunluk;
      }
      if (!carpan(x) && x >= SOL_SINIR && x + uzunluk <= SAG_SINIR) return x;
      return null;
    };

    const islenmis = new Set<string>();
    kumeUye.forEach((tumUyeler) => {
      const uyeler = tumUyeler.filter((m) => bizim.has(m.id));
      const kilitli = uyeler.filter((m) => kilitliIds.has(m.id));
      const acik = uyeler.filter((m) => !kilitliIds.has(m.id));
      // TAMAMI KİLİTLİ KÜME. Kilit "masa başkasına gitmesin, yerinden oynatılmasın" demek; ama
      // aynı rezervasyonun masaları da hiçbir koşulda bölünmez. Kilitli bir rezervasyonun iki
      // masası salonun iki ucunda kalıyordu (Gökhan, 2026-08-14: bahçede 6 kişilik kilitli
      // rezervasyonun 4 kişilik masası en üstte, 2 kişilik masası en altta). Artık ÇIPA olan
      // masa (en soldaki, en üstteki) yerinde kalır, kümenin diğer masaları ona bitişir.
      if (acik.length === 0) {
        if (kilitli.length < 2) return; // tek masa — zaten yerinde, dokunulmaz
        const nerede = (m: PlanMasa) => m.position_x ?? evX(m)!;
        const nerdeY = (m: PlanMasa) => m.position_y ?? evY(m)!;
        const sirali = [...kilitli].sort((a, b) => (nerdeY(a) - nerdeY(b)) || (nerede(a) - nerede(b)));
        const cipa = sirali[0];
        const s = satirBul(nerdeY(cipa), satirNo.get(cipa.id)!);
        const toplamGen = sirali.reduce((t, m) => t + gen(m), 0);
        const kendi = new Set(sirali.map((m) => m.id));
        const bas = bosAralikBul(s, govdeSol(cipa, nerede(cipa)), toplamGen, kendi);
        if (bas === null) { sirali.forEach((m) => islenmis.add(m.id)); return; } // sığmıyor, kimse oynamaz
        let x = bas;
        sirali.forEach((m) => {
          yerlesmis.set(m.id, { x: xIcin(m, x), y: satirlar[s].y });
          kilitliTasinan.add(m.id);
          x += gen(m);
        });
        engeller[s] = engeller[s].filter((e) => !e.id || !kendi.has(e.id));
        engeller[s].push({ sol: bas, sag: x });
        sirali.forEach((m) => islenmis.add(m.id));
        return;
      }

      if (kilitli.length > 0) {
        // Kilitli masa oynamaz (kural 1) ama aynı rezervasyonun masaları da bölünmez (kural 4):
        // kalan masalar kilitlinin kenarına bitişik dizilir ve orası da engel sayılır.
        const nerede = (m: PlanMasa) => m.position_x ?? evX(m)!;
        const s = satirBul(kilitli[0].position_y ?? evY(kilitli[0])!, satirNo.get(kilitli[0].id)!);
        const sirali = [...acik].sort((a, b) => evX(a)! - evX(b)!);
        const toplam = sirali.reduce((t, m) => t + gen(m), 0);
        const kSag = Math.max(...kilitli.map((m) => govdeSag(m, nerede(m))));
        // Kilitli üyeler YERİNDE kalıyor; onlar da engeldir, üstlerinden geçilmez — açık masalar
        // yanlarına dizilir. (Tamamı kilitli kümede durum başka: orada bütün küme birlikte gider.)
        const bas = bosAralikBul(s, kSag, toplam, new Set<string>());
        // Kilitlinin yanında yer yoksa bu masalar KÜME OLARAK yerleştirilemez; işaretlenmeden
        // bırakılır ki sıradaki normal dizilime katılsınlar. Eskiden oldukları yerde donuyor,
        // dizilime de girmedikleri için üzerlerine başka masa konabiliyordu (2026-08-14 taraması).
        if (bas === null) return;
        let x = bas;
        sirali.forEach((m) => { yerlesmis.set(m.id, { x: xIcin(m, x), y: satirlar[s].y }); x += gen(m); });
        engeller[s].push({ sol: bas, sag: bas + toplam });
        acik.forEach((m) => islenmis.add(m.id));
        return;
      }

      if (acik.length < 2) return; // kümenin bu salonda tek masası kalmış — serbest masa gibi

      // Kümenin satırı: üyelerin evinin EN ÇOK bulunduğu satır. Çıpa o satırdaki en soldaki üye.
      const sayim = new Map<number, number>();
      acik.forEach((m) => { const s = satirNo.get(m.id)!; sayim.set(s, (sayim.get(s) ?? 0) + 1); });
      const satir = [...sayim.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
      const sirali = [...acik].sort((a, b) => (satirNo.get(a.id)! - satirNo.get(b.id)!) || (evX(a)! - evX(b)!));
      const kendi = sirali.filter((m) => satirNo.get(m.id) === satir);
      const dogal = Math.min(...(kendi.length ? kendi : sirali).map((m) => govdeSol(m, evX(m)!)));

      // MASALAR KISA KENARDAN BİRLEŞİR (Gökhan, 2026-08-14: "kısa kenarlar birbirine değecek").
      // Dikdörtgen masa çevrilmişse — teras gibi salonlarda masalar dik durur — uzun ekseni
      // AŞAĞI bakar; o zaman birleşme de aşağı doğru olur, masalar alt alta eklenip uzun bir
      // masa olur. Yan yana eklemek uzun kenarları yapıştırırdı, düğün masası değil geniş bir
      // kare çıkardı. Yatay masalarda eskisi gibi soldan sağa.
      const cipa = kendi.length ? kendi[0] : sirali[0];
      // KARE MASADA uzun kenar yok, ikisi de eşit. O zaman masaya değil EŞİNE bakılır: kümenin
      // öteki masaları çıpayla aynı sıradaysa yan yana, aynı sütunda (alt alta) duruyorsa
      // yukarıdan aşağı birleşir. İkisi de varsa sıra kazanır — salon soldan sağa okunuyor
      // (Gökhan, 2026-08-14: "kare masada buna nasıl karar vereceksin").
      const ayniSiradakiler = sirali.filter((m) => m.id !== cipa.id && satirNo.get(m.id) === satirNo.get(cipa.id)).length;
      const ayniSutundakiler = sirali.filter((m) => m.id !== cipa.id
        && satirNo.get(m.id) !== satirNo.get(cipa.id)
        && Math.abs(evX(m)! - evX(cipa)!) < Math.max(gen(cipa), 1)).length;
      const dikeyMi = gen(cipa) === yuk(cipa)
        ? ayniSutundakiler > ayniSiradakiler
        : yuk(cipa) > gen(cipa);

      // DURUŞU FARKLI ÜYE ÇIPANIN YÖNÜNE ÇEVRİLİR (Gökhan, 2026-08-19: Ceyda Güven'in masaları —
      // "biri dikine biri enine duruyor, oradan yanıldı; o birleştirmeyi yapabilir ama masayı
      // çevirmesi gerekir"). Çıpa hem yerinde hem yönünde kalır. Çevirme yalnız dikdörtgende
      // anlamlı: kare ve yuvarlakta yön diye bir şey yok. Kilitli masa çevrilmez.
      sirali.forEach((m) => {
        if (m.id === cipa.id || (m.shape ?? "") !== "dikdortgen" || kilitliIds.has(m.id)) return;
        const g = m.genislik ?? 0, y = m.yukseklik ?? 0;
        if (g === y) return;
        const suanDik = y > g;
        if (suanDik !== dikeyMi) cevrilecek.set(m.id, !(m.rotated ?? false));
      });

      if (dikeyMi) {
        const x = govdeSol(cipa, evX(cipa)!);
        const enGenis = Math.max(...sirali.map((m) => gen(m)));
        // DİKEY BİRLEŞMEDE DE HESAP GÖVDE KENARINDAN (Gökhan, 2026-08-19: "yerleşim yap dedim
        // bu hale geldi... kalıcı bir çözüm bul"). position_y sürükleme KUTUSUNUN üst kenarı,
        // gövde ise kutunun ortasında çizilir. Eskiden kutu üst kenarına GÖVDE boyu ekleniyordu:
        // boyları farklı iki masa birleşince fark kadar üst üste biniyorlardı — 2 kişilik (56px)
        // ile 4 kişilik (96px) çevrilmiş masa tam 20px iç içe geçiyordu. Artık gövde alt kenarı
        // bir sonrakinin gövde üst kenarı oluyor; masalar ölçüleri ne olursa olsun dip dibe.
        let ust = evY(cipa)! + (BOX_H - yuk(cipa)) / 2;      // çıpanın gövdesinin üst kenarı
        const kumeUst = ust;
        sirali.forEach((m) => {
          // Her masa çıpanın orta ekseninde kalsın; ölçüleri farklıysa ortalanır.
          yerlesmis.set(m.id, {
            x: Math.round(x + (enGenis - gen(m)) / 2 - (BOX_W - gen(m)) / 2),
            y: Math.round(ust - (BOX_H - yuk(m)) / 2),
          });
          ust += yuk(m);
        });
        // Dikey kümenin kapladığı yer, dokunduğu BÜTÜN satırlarda doludur. Satırın kendi
        // ortasıyla karşılaştırılıyor — iki taraf da aynı (gövde) eksende olsun.
        satirlar.forEach((st, i) => {
          const satirOrta = st.y + BOX_H / 2;
          if (satirOrta >= kumeUst && satirOrta <= ust) engeller[i].push({ sol: x, sag: x + enGenis });
        });
        acik.forEach((m) => islenmis.add(m.id));
        return;
      }

      satirBlok[satir].push(blokKur(sirali, satir, dogal, true));
      acik.forEach((m) => islenmis.add(m.id));
    });

    // İşi olmayan masa: kendi ev yerinde tek başına bir blok — kimse itmezse hiç oynamaz.
    masalar.forEach((m) => {
      if (kilitliIds.has(m.id) || islenmis.has(m.id)) return;
      const s = satirNo.get(m.id)!;
      satirBlok[s].push(blokKur([m], s, govdeSol(m, evX(m)!), false));
    });

    // Kümeye katılmak için satırından ayrılan masanın ev yeri boşta kalır — satırdan bir masa
    // çıkarmak gerekirse önce oraya konur (Gökhan: "artan masayı, o masayı aldığı yere koyacak").
    // gidenSatir: masanın katıldığı küme hangi satırda — yani hangi satır bu masayla GENİŞLEDİ.
    // Öksüz masa aramasında önce o satıra bakılır (bkz. aşağıdaki boşluk doldurma).
    const bosalan: { satir: number; sol: number; gidenSatir: number; kume: Blok }[] = [];
    satirBlok.flat().forEach((b) => b.uyeler.forEach((m) => {
      const ev = satirNo.get(m.id)!;
      if (ev !== b.satir) bosalan.push({ satir: ev, sol: govdeSol(m, evX(m)!), gidenSatir: b.satir, kume: b });
    }));

    // Bir satırı dizer. Sığmıyorsa null döner (zorla=true ise en iyi çabayla dizer, üst üste
    // bindirmeden — o zaman sınır taşabilir).
    // İki blok arasında bırakılacak boşluk. "Ayrı rezervasyonların masaları arasında sabit
    // mesafe" bir REZERVASYON masasıyla komşusu arasında geçerlidir. İki boş masa işletmenin
    // kendi dizdiği yerde 15 px arayla duruyorsa bu bizi ilgilendirmez — mesafe uğruna itmek
    // "işi olmayan masa yerinden oynamaz"ı çiğner. Boş masalar itilseler bile aralarındaki
    // kendi düzenlerini korurlar; ev yerleri çakışıyorsa normal mesafeye düşülür.
    const bosluk = (a: Blok | null, b: Blok | null) => {
      if (!a || !b) return 0;
      if (a.kume || b.kume) return AYRI_MESAFE;
      const dogalAra = b.dogal - (a.dogal + a.gen);
      return dogalAra < 0 ? AYRI_MESAFE : Math.min(AYRI_MESAFE, dogalAra);
    };

    const diz = (i: number, zorla = false): { blok: Blok; sol: number }[] | null => {
      const eng = [...engeller[i]].sort((a, b) => a.sol - b.sol);
      const sirali = [...satirBlok[i]].sort((a, b) => a.dogal - b.dogal || a.gen - b.gen);
      const carpanSag = (sol: number, w: number) => eng.find((o) => sol < o.sag && o.sol < sol + w);
      const carpanSol = (sol: number, w: number) => [...eng].reverse().find((o) => sol < o.sag && o.sol < sol + w);

      // Sağdan sola: her bloğun EN GEÇ konabileceği yer — arkasındakilere yer kalsın diye.
      const tavan: number[] = [];
      let sonrakiSol: number | null = null;
      let sonraki: Blok | null = null;
      for (let k = sirali.length - 1; k >= 0; k--) {
        const b = sirali[k];
        let sol: number = (sonrakiSol === null ? SAG_SINIR : sonrakiSol - bosluk(b, sonraki)) - b.gen;
        for (let d = 0; d <= eng.length; d++) {
          const c = carpanSol(sol, b.gen);
          if (!c) break;
          sol = c.sol - b.gen - AYRI_MESAFE;
        }
        tavan[k] = sol;
        sonrakiSol = sol;
        sonraki = b;
      }

      // Soldan sağa: blok ev yerinde durur; soldaki üstüne geliyorsa sağa iter, tavanı aşarsa
      // tavana çekilir — yani sola kayma sadece duvara dayanınca olur, kendiliğinden olmaz.
      const cikti: { blok: Blok; sol: number }[] = [];
      let oncekiSag: number | null = null;
      let onceki: Blok | null = null;
      for (let k = 0; k < sirali.length; k++) {
        const b = sirali[k];
        const alt = oncekiSag === null ? SOL_SINIR : Math.max(SOL_SINIR, oncekiSag + bosluk(onceki, b));
        let sol = Math.max(b.dogal, alt);
        for (let d = 0; d <= eng.length; d++) {
          const c = carpanSag(sol, b.gen);
          if (!c) break;
          sol = c.sag + AYRI_MESAFE;
        }
        if (sol > tavan[k]) {
          if (tavan[k] >= alt) sol = tavan[k];
          else if (!zorla) return null; // bu satıra sığmıyor
        }
        cikti.push({ blok: b, sol });
        oncekiSag = sol + b.gen;
        onceki = b;
      }
      return cikti;
    };

    // Sığmayan bloğa uygun başka satır ara (kural 3) — önce en yakın satır.
    // ÖNCE BOŞALAN YERE. Bir küme başka sıradan masa çektiyse o masanın yeri boşta kalır;
    // sırayı şişiren masa yüzünden taşan masa ORAYA gider (Gökhan, 2026-08-15: "sırada şişen
    // masayı, sırayı şişiren masanın geldiği yere götürecek"). O nokta tanımı gereği boş
    // olduğu için masa oraya SABİT konur; satırın geri kalanı onun etrafından dizilir. Böyle
    // bir yer yoksa eskisi gibi en yakın uygun satır aranır.
    const uygunSatir = (kaynak: number, b: Blok): { satir: number; dogal: number; sabit?: boolean } | null => {
      // 1) Boşalan yerler — önce bu satıra masa VEREN satırınki.
      const sirali = bosalan.map((x, i) => ({ ...x, i }))
        .sort((x, y) => Math.abs(x.satir - kaynak) - Math.abs(y.satir - kaynak));
      for (const spot of sirali) {
        if (spot.satir === kaynak) continue;
        const carpan = engeller[spot.satir].some((o) => spot.sol < o.sag && o.sol < spot.sol + b.gen);
        if (carpan) continue;
        engeller[spot.satir].push({ sol: spot.sol, sag: spot.sol + b.gen });
        const olur = diz(spot.satir) !== null;
        if (olur) {
          bosalan.splice(bosalan.findIndex((x) => x === bosalan[spot.i] || (x.satir === spot.satir && x.sol === spot.sol)), 1);
          return { satir: spot.satir, dogal: spot.sol, sabit: true };
        }
        engeller[spot.satir].pop();
      }
      // 2) Boşalan yer yoksa en yakın uygun satır.
      const adaylar = satirlar.map((_, i) => i).filter((i) => i !== kaynak)
        .sort((x, y) => Math.abs(x - kaynak) - Math.abs(y - kaynak) || x - y);
      for (const hedef of adaylar) {
        // Yeni satırda masa ESKİ x'inde ısrar etmez: orası doluysa satırın soldan ilk boş
        // yerine oturur. Eski x korunduğunda masa gittiği satırda da sıkışıp taşıyordu.
        for (const dogal of [b.dogal, SOL_SINIR]) {
          const eskiSatir = b.satir, eskiDogal = b.dogal;
          b.satir = hedef; b.dogal = dogal;
          satirBlok[hedef].push(b);
          const olur = diz(hedef) !== null;
          satirBlok[hedef] = satirBlok[hedef].filter((x) => x !== b);
          b.satir = eskiSatir; b.dogal = eskiDogal;
          if (olur) return { satir: hedef, dogal };
        }
      }
      return null;
    };

    for (let i = 0; i < satirlar.length; i++) {
      const denenmis = new Set<Blok>();
      let guvenlik = 0;
      while (diz(i) === null && guvenlik++ < 30) {
        // Önce işi olmayan tek masalar (en sağdakinden), en son küme — küme bölünemediği için
        // taşınması en pahalı olan odur.
        const adaylar = satirBlok[i].filter((b) => !denenmis.has(b))
          .sort((a, b) => (a.kume === b.kume ? b.dogal - a.dogal : a.kume ? 1 : -1));
        let tasindi = false;
        for (const b of adaylar) {
          denenmis.add(b);
          const hedef = uygunSatir(i, b);
          if (!hedef) continue;
          satirBlok[i] = satirBlok[i].filter((x) => x !== b);
          if (hedef.sabit) {
            // Boşalan yere SABİT kondu: engel zaten kaydedildi, yerini burada yazıyoruz.
            let x = hedef.dogal;
            b.uyeler.forEach((m) => { yerlesmis.set(m.id, { x: xIcin(m, x), y: satirlar[hedef.satir].y }); x += gen(m); });
          } else {
            b.satir = hedef.satir; b.dogal = hedef.dogal;
            satirBlok[hedef.satir].push(b);
          }
          tasindi = true;
          break;
        }
        // SON ÇARE: KÜMEYİ İKİYE BÖL, YAN YANA İKİ SIRAYA KOY (Gökhan, 2026-08-15).
        // Hiçbir masa taşınamıyorsa sıra gerçekten sığmıyor demektir. Eskiden bu noktada masa
        // salonun duvarını aşıyordu. Artık kümenin yarısı kendi sırasında kalır, öteki yarısı
        // hemen ALTTAKİ (yoksa üstteki) sıraya, aynı hizaya iner — grup yine bir arada,
        // sadece iki sıra hâlinde oturur.
        if (!tasindi) {
          const bolunecek = satirBlok[i].filter((b) => b.kume && b.uyeler.length > 1)
            .sort((a, b) => b.gen - a.gen)[0];
          if (!bolunecek) break;
          const komsu = [i + 1, i - 1].find((k) => k >= 0 && k < satirlar.length);
          if (komsu === undefined) break;
          const orta = Math.ceil(bolunecek.uyeler.length / 2);
          const ustYari = bolunecek.uyeler.slice(0, orta);
          const altYari = bolunecek.uyeler.slice(orta);
          const yariKur = (uyeler: PlanMasa[], satir: number, dogal: number): Blok =>
            ({ uyeler, gen: uyeler.reduce((t, m) => t + gen(m), 0), dogal, satir, kume: true });
          const a = yariKur(ustYari, i, bolunecek.dogal);
          const b2 = yariKur(altYari, komsu, bolunecek.dogal);
          satirBlok[i] = satirBlok[i].filter((x) => x !== bolunecek);
          satirBlok[i].push(a);
          satirBlok[komsu].push(b2);
          if (diz(i) === null || diz(komsu) === null) {
            // Bölmek de kurtarmadı — eski hâline dönülür, aşağıdaki son dizilim elinden geleni yapar.
            satirBlok[i] = satirBlok[i].filter((x) => x !== a);
            satirBlok[komsu] = satirBlok[komsu].filter((x) => x !== b2);
            satirBlok[i].push(bolunecek);
            break;
          }
          continue;
        }
      }
    }

    // ÖKSÜZ KALAN MASAYI BOŞ ALANA GÖNDER (Gökhan, 2026-08-15: "masa hizası 18 kişiyse ve
    // 20 kişilik rezervasyon varsa 20 yaparsın ama fazla masayı boş yere gönderirsin").
    // Bir sıra büyük grup için genişletilince o sıranın kalanındaki masa, grubun bittiği
    // yerden kopuk, ortada asılı kalıyordu — üstelik grubun masasını verdiği satırda kocaman
    // bir delik dururken. Artık öyle bir masa o deliğe taşınır.
    for (const spot of [...bosalan]) {
      let enIyi: { blok: Blok; satir: number } | null = null;
      // 1) ÖNCE GENİŞLEYEN SIRA. O sırada kümenin dışında kalan masa "fazla" masadır; sıranın
      //    ucunda tutulmaz, boşalan yere gönderilir. En sağdaki (en dışarıda kalan) seçilir.
      if (spot.gidenSatir !== spot.satir) {
        const artiklar = [...(diz(spot.gidenSatir, true) ?? [])]
          .filter((y) => y.blok !== spot.kume)
          .sort((a, b) => b.sol - a.sol);
        if (artiklar.length > 0) enIyi = { blok: artiklar[0].blok, satir: spot.gidenSatir };
      }
      // 2) Olmadıysa: nerede olursa olsun, önünde kocaman boşluk kalmış blok.
      if (!enIyi) {
        let enGenis = AYRI_MESAFE * 2;
        for (let i = 0; i < satirlar.length; i++) {
          if (i === spot.satir) continue;
          const sirali = [...(diz(i, true) ?? [])].sort((a, b) => a.sol - b.sol);
          for (let k = 1; k < sirali.length; k++) {
            const onceki = sirali[k - 1];
            const aralik = sirali[k].sol - (onceki.sol + onceki.blok.gen);
            if (aralik <= enGenis) continue;
            enGenis = aralik;
            enIyi = { blok: sirali[k].blok, satir: i };
          }
        }
      }
      if (!enIyi) continue;
      const { blok, satir: kaynak } = enIyi;
      if (engeller[spot.satir].some((o) => spot.sol < o.sag && o.sol < spot.sol + blok.gen)) continue;
      satirBlok[kaynak] = satirBlok[kaynak].filter((x) => x !== blok);
      engeller[spot.satir].push({ sol: spot.sol, sag: spot.sol + blok.gen });
      if (diz(spot.satir) === null || diz(kaynak) === null) {
        // Taşımak işleri bozuyorsa vazgeç, eski hâline dön.
        engeller[spot.satir].pop();
        satirBlok[kaynak].push(blok);
        continue;
      }
      let bx = spot.sol;
      blok.uyeler.forEach((m) => { yerlesmis.set(m.id, { x: xIcin(m, bx), y: satirlar[spot.satir].y }); bx += gen(m); });
      bosalan.splice(bosalan.indexOf(spot), 1);
    }

    satirlar.forEach((s, i) => {
      (diz(i, true) ?? []).forEach(({ blok, sol }) => {
        let x = sol;
        blok.uyeler.forEach((m) => {
          // Y'DE SATIRA YAPIŞTIRMA YOK (Gökhan, 2026-08-19: "girişte 4'lü masalar 2'li
          // masaların üstünde"). Satırın y'si o satırdaki EN ÜST masanın yeriydi ve satırdaki
          // herkes oraya çekiliyordu: evi 33px aşağıda olan dört kişilik masalar yukarı kayıp
          // üstlerindeki iki kişilik sıraya biniyordu. Birleşen masalar hizalanmak zorunda
          // (küme), başka satırdan buraya taşınan masa da bu satıra oturur; ama işi olmayan
          // masa kendi evinde kalır — ne x'i ne y'si kendiliğinden oynar.
          const kendiSatiri = satirNo.get(m.id) === i;
          const y = blok.kume || !kendiSatiri ? s.y : Math.round(evY(m)!);
          yerlesmis.set(m.id, { x: xIcin(m, x), y });
          x += gen(m); // küme içi dip dibe — aradaki boşluk kapanır
        });
      });
    });

    // ————————————————————————————————————————————————————————————————
    // SON KONTROL: İKİ MASA ÜST ÜSTE BİNMEZ (Gökhan, 2026-08-19: "hatayı bul ve çalışmasını
    // sağla, her yeni işletmede bununla uğraşamayız, kalıcı bir çözüm bul").
    //
    // Yukarıdaki dizilim satır satır çalışıyor. Bir masa başka satıra taşındığında ya da boyu
    // satır aralığından uzun olduğunda gövdeler yine de çakışabiliyordu. Burası ağ: dizilim
    // bittikten sonra çakışma kalmışsa masa (kümeyse bütün küme birlikte) önce sağa, sağda yer
    // yoksa aşağıya kaydırılıp boş yere konur. Hiçbir yere sığmıyorsa HİÇ oynatılmaz — üst üste
    // bindirmektense olduğu yerde bırakılır. Kilitli masa burada da yerinden kıpırdamaz.
    // ————————————————————————————————————————————————————————————————
    const yerAl = (m: PlanMasa) => yerlesmis.get(m.id) ?? { x: m.position_x ?? evX(m)!, y: m.position_y ?? evY(m)! };
    type Kutu = { sol: number; sag: number; ust: number; alt: number };
    const kutuOf = (m: PlanMasa, p: { x: number; y: number }): Kutu => ({
      sol: p.x + (BOX_W - gen(m)) / 2, sag: p.x + (BOX_W + gen(m)) / 2,
      ust: p.y + (BOX_H - yuk(m)) / 2, alt: p.y + (BOX_H + yuk(m)) / 2,
    });
    // Kenarları değen masalar çakışmış sayılmaz — birleşen masalar zaten dip dibe duruyor.
    const carpisir = (a: Kutu, b: Kutu) =>
      a.sol + 0.5 < b.sag && b.sol + 0.5 < a.sag && a.ust + 0.5 < b.alt && b.ust + 0.5 < a.alt;

    // Aynı rezervasyonun masaları birlikte taşınır, tek tek değil — küme bölünmez.
    const gruplar = new Map<string, PlanMasa[]>();
    masalar.forEach((m) => {
      const anahtar = kumeNo.has(m.id) ? `k${kumeNo.get(m.id)}` : `m${m.id}`;
      const l = gruplar.get(anahtar);
      if (l) l.push(m); else gruplar.set(anahtar, [m]);
    });
    const konmus: Kutu[] = [];
    [...gruplar.values()]
      .sort((a, b) => {
        // Kilitliler önce (onlar hiç oynamaz), sonra yukarıdan aşağı, soldan sağa.
        const ka = a.some((m) => kilitliIds.has(m.id)) ? 0 : 1;
        const kb = b.some((m) => kilitliIds.has(m.id)) ? 0 : 1;
        if (ka !== kb) return ka - kb;
        const pa = yerAl(a[0]), pb = yerAl(b[0]);
        return (pa.y - pb.y) || (pa.x - pb.x);
      })
      .forEach((uyeler) => {
        const kutular = uyeler.map((m) => kutuOf(m, yerAl(m)));
        const kaydir = (dx: number, dy: number): Kutu[] =>
          kutular.map((k) => ({ sol: k.sol + dx, sag: k.sag + dx, ust: k.ust + dy, alt: k.alt + dy }));
        const carpan = (ks: Kutu[]) => konmus.find((o) => ks.some((k) => carpisir(k, o)));
        const enSol = Math.min(...kutular.map((k) => k.sol));
        const enSag = Math.max(...kutular.map((k) => k.sag));
        const enUst = Math.min(...kutular.map((k) => k.ust));
        const sabit = uyeler.some((m) => kilitliIds.has(m.id));
        let dx = 0, dy = 0;
        if (!sabit) {
          for (let d = 0; d < 12; d++) {
            const c = carpan(kaydir(dx, dy));
            if (!c) break;
            const sagaDx = c.sag + AYRI_MESAFE - enSol;
            if (enSol + sagaDx + (enSag - enSol) <= SAG_SINIR) { dx = sagaDx; continue; }
            dy = c.alt + AYRI_MESAFE - enUst; // sağda yer yok — alt sıraya in
            dx = 0;
          }
        }
        const son = kaydir(dx, dy);
        const kaldi = carpan(son);
        if (!kaldi && (dx !== 0 || dy !== 0)) {
          uyeler.forEach((m) => {
            const p = yerAl(m);
            yerlesmis.set(m.id, { x: Math.round(p.x + dx), y: Math.round(p.y + dy) });
          });
        }
        (kaldi ? kutular : son).forEach((k) => konmus.push(k));
      });
  });

  // Sadece gerçekten değişenler yazılır — kilitli masaya ve hiç oynamayana dokunulmaz.
  const yerler: MasaYeri[] = [];
  tumMasalar.forEach((m) => {
    if (kilitliIds.has(m.id) && !kilitliTasinan.has(m.id)) return;
    const yeni = yerlesmis.get(m.id);
    if (!yeni) return;
    // Çevrilecek masa, yeri hiç değişmese bile yazılmalı — duruşu değişiyor.
    const yeniYon = cevrilecek.get(m.id);
    const yerDegisti = m.position_x !== yeni.x || m.position_y !== yeni.y;
    const yonDegisti = yeniYon !== undefined && yeniYon !== (m.rotated ?? false);
    if (!yerDegisti && !yonDegisti) return;
    yerler.push({ id: m.id, x: yeni.x, y: yeni.y, ...(yonDegisti ? { rotated: yeniYon } : {}) });
  });
  return yerler;
};
