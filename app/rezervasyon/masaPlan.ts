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
export type KonumluMasa = MasaBilgi & { position_x: number | null; position_y: number | null; normalX?: number | null; normalY?: number | null };
const SIRA_TOLERANS = 60; // px — aynı sırada sayılmak için izin verilen yükseklik farkı
// Ayrı rezervasyonların masaları arasında bırakılacak en az boşluk (px). Aynı rezervasyonun
// masaları dip dibe durur; farklı rezervasyonlarınki hep ayrık görünsün diye.
const AYRI_MESAFE = 26;

const asilKX = (m: KonumluMasa) => m.normalX ?? m.position_x;
const asilKY = (m: KonumluMasa) => m.normalY ?? m.position_y;

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
export type PlanMasa = KonumluMasa & { id: string; genislik?: number; normalX?: number | null; normalY?: number | null };
export type PlanRez = { id: string; kisi: number };
export type PlanSonuc = { atamalar: Record<string, string[]>; yerlesemeyen: string[] };

// Masaları sıralara böler: aynı yükseklikteler aynı sıra, her sıra soldan sağa dizili.
// ASIL konumdan (kaymış olabilecek canlı konumdan değil) — yoksa bir kez taşınmış bir masa
// bir daha doğru sırasına ait sayılmıyordu (yukarıdaki KonumluMasa notuna bakın).
// Konumu olmayanlar tek bir "konumsuz" grupta toplanır (orada yan yanalık aranmaz).
const siralaraBol = (masalar: PlanMasa[]): PlanMasa[][] => {
  const konumlu = masalar.filter((m) => asilKX(m) !== null && asilKY(m) !== null);
  const konumsuz = masalar.filter((m) => asilKX(m) === null || asilKY(m) === null);
  const siralar: PlanMasa[][] = [];
  [...konumlu].sort((a, b) => asilKY(a)! - asilKY(b)!).forEach((m) => {
    const sira = siralar.find((s) => Math.abs(asilKY(s[0])! - asilKY(m)!) <= SIRA_TOLERANS);
    if (sira) sira.push(m); else siralar.push([m]);
  });
  siralar.forEach((s) => s.sort((a, b) => asilKX(a)! - asilKX(b)!));
  return konumsuz.length ? [...siralar, konumsuz] : siralar;
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
const masalariSec = (
  siralar: PlanMasa[][], bosIds: Set<string>, boylar: number[],
): { masalar: PlanMasa[]; taşımaSayisi: number } | null => {
  const bosParcalar: PlanMasa[][] = [];
  siralar.forEach((sira) => {
    let aktif: PlanMasa[] = [];
    sira.forEach((m) => {
      if (bosIds.has(m.id)) aktif.push(m);
      else { if (aktif.length) bosParcalar.push(aktif); aktif = []; }
    });
    if (aktif.length) bosParcalar.push(aktif);
  });

  const gereken = [...boylar].sort((a, b) => b - a);
  let enIyi: { masalar: PlanMasa[]; taşımaSayisi: number } | null = null;

  // Her parçayı sırayla temel alıp dene — en çok boyu hazır karşılayan kazanır.
  bosParcalar.forEach((temel) => {
    const kalanGereken = [...gereken];
    const secilen: PlanMasa[] = [];
    temel.forEach((m) => {
      const i = kalanGereken.indexOf(m.seat_count);
      if (i >= 0) { kalanGereken.splice(i, 1); secilen.push(m); }
    });
    if (secilen.length === 0) return;
    // Eksikleri temele en yakın masalardan çek — bunlar taşınacak masalar.
    const merkez = secilen[0];
    const disarisi = siralar.flat().filter((m) => bosIds.has(m.id) && !secilen.includes(m));
    komsulukSirasi(disarisi, merkez).forEach((m) => {
      const i = kalanGereken.indexOf(m.seat_count);
      if (i >= 0) { kalanGereken.splice(i, 1); secilen.push(m); }
    });
    if (kalanGereken.length > 0) return;
    const taşımaSayisi = secilen.filter((m) => !temel.includes(m)).length;
    if (!enIyi || taşımaSayisi < enIyi.taşımaSayisi
      || (taşımaSayisi === enIyi.taşımaSayisi && secilen.length < enIyi.masalar.length)) {
      enIyi = { masalar: secilen, taşımaSayisi };
    }
  });
  return enIyi;
};


// Tek geçişte plan kurar. koru: mevcut ataması korunacak rezervasyonlar (masaları hâlâ
// uygunsa oldukları yerde bırakılır).
const planKur = (
  masalar: PlanMasa[],
  serbest: PlanRez[],
  sabitler: { rez: PlanRez; masaIds: string[] }[],
  mevcut: Record<string, string[]>,
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
  serbest.forEach((rez) => {
    const ids = mevcut[rez.id] ?? [];
    if (ids.length === 0 || !ids.every((id) => bosIds.has(id)) || koltuk(ids) < rez.kisi) return;
    ids.forEach((id) => bosIds.delete(id));
    atamalar[rez.id] = ids;
  });

  const yerlesemeyen: string[] = [];
  // Büyükten küçüğe: kalabalık grupların seçeneği az, önce onlar yerleşmeli.
  [...serbest].filter((r) => !atamalar[r.id]).sort((a, b) => b.kisi - a.kisi).forEach((rez) => {
    const bosMasalar = masalar.filter((m) => bosIds.has(m.id));
    // Aday boy kümeleri (en az israf, sonra en az masa) sırayla denenir — AMA ilk başarılıda
    // durulmaz: "en az masa" ile "hiç taşımadan sığmak" ayrı şeyler. 18 kişilik bir grupta
    // 6+6+6 (3 masa) ile 6+4+4+2+2 (5 masa, TAM BİR SIRA) ikisi de sığar; ilki üç ayrı sıradan
    // masa toplayıp taşıma ister, ikincisi zaten bir sırayı bozmadan hiç taşımadan oturtur.
    // "En az masa" kazanırsa program sırayı hiç kullanmadan dağınık masalar toplar (Gökhan:
    // "aynı sıradaki masaları birleştirmesi gerekiyordu, ama ne yaptığına sen bak"). Bu yüzden
    // hep en az TAŞIMA olan kazanır; taşıma sıfırsa aramaya devam etmeye gerek yok.
    let enIyi: { masalar: PlanMasa[]; taşımaSayisi: number } | null = null;
    for (const boylar of boyAdaylari(bosMasalar, rez.kisi)) {
      const secim = masalariSec(siralar, bosIds, boylar);
      if (!secim) continue;
      if (!enIyi || secim.taşımaSayisi < enIyi.taşımaSayisi
        || (secim.taşımaSayisi === enIyi.taşımaSayisi && secim.masalar.length < enIyi.masalar.length)) {
        enIyi = secim;
      }
      if (enIyi.taşımaSayisi === 0) break; // hiç taşımadan sığmaktan daha iyisi yok
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
): PlanSonuc => {
  const azOynayan = planKur(masalar, serbest, sabitler, mevcut);
  if (azOynayan.yerlesemeyen.length === 0) return azOynayan;
  const sifirdan = planKur(masalar, serbest, sabitler, {});
  return sifirdan.yerlesemeyen.length < azOynayan.yerlesemeyen.length ? sifirdan : azOynayan;
};

// Birleşen masaların salon planındaki YERLERİ (Gökhan: "6-1 ile 4-1 birleşti, masa planında
// da yan yana gelecek ki garsonlar planı görüp yapacaklar"). Programın kendisi masayı çekemez;
// çekilecek hâli plana yazar, garson görüp uygular.
//
// Kural: kümenin en soldaki masası çıpa olur, yerinden oynamaz. Diğerleri onun sağına,
// gövde genişlikleri kadar kaydırılarak bitişik dizilir. Tek masalı atamalar hiç oynamaz.
//
// Gelen masa boş bir yere gitmiyorsa oradaki masayla YER DEĞİŞTİRİR — yoksa iki masa üst
// üste biniyor ve alttaki kayboluyordu (Gökhan: "yerine gittiği masanın da yerini değiştirmesi
// gerekli, yoksa altta kalıyor onu arıyorsun"). Yerinden edilen masa, gelenin boşalttığı
// yere geçer.
export type MasaYeri = { id: string; x: number; y: number };

// Yerleşim SOLDAN SAĞA TEK GEÇİŞLİ bir dizilim (sweep) — önceki "eldeki masayı çekip
// hedeftekini eski yerine gönder" (takas) yöntemi tek bir takasın başka bir masayla
// çakışmasını kontrol etmiyordu; zincirleme takaslar kümeyle hiç ilgisi olmayan masaları da
// (Gökhan: "kilit koyduk" örneğindeki gibi ilgisiz rezervasyonları) başka satırlara
// sürükleyip üst üste bindirebiliyordu. Sweep yöntemi bunu YAPI GEREĞİ imkânsız kılar: her
// masa, kendisinden önce yerleştirilenin sağ kenarından sonra başlar, asla geriye gitmez.
//
// Kurallar:
//  1) Her masa ASIL (normal) satırında kalır — kümenin ÇIPASI hariç kimse satır değiştirmez.
//     Çıpa: kümenin asıl konumu EN SOLDAKİ üye (Gökhan: "en soldaki masa çıpa olur, yerinden
//     oynamaz"). Diğer üyeler, çıpanın satırına çekilip ona bitişik dizilir.
//  2) Aynı kümenin masaları dip dibe; FARKLI rezervasyonların masaları arasında en az
//     AYRI_MESAFE boşluk kalır (Gökhan: "ayrı rezervasyonların masaları dip dibe olmasın").
//  3) Salon sınırını (işletmenin en sağdaki masasının asıl yeri) hiçbir masa aşmaz — gerekirse
//     araya konan AYRI_MESAFE boşlukları daraltılır, ama çıpalar yine de yerinden oynamaz.
export const birlesikYerlesim = (kumeler: PlanMasa[][], tumMasalar: PlanMasa[]): MasaYeri[] => {
  const asilX = (m: PlanMasa) => m.normalX ?? m.position_x;
  const asilY = (m: PlanMasa) => m.normalY ?? m.position_y;
  const genislik = (m: PlanMasa) => m.genislik ?? 0;

  const konumlu = tumMasalar.filter((m) => asilX(m) !== null && asilY(m) !== null);
  const byId = new Map(konumlu.map((m) => [m.id, m]));

  // Çıpa: kümenin EN ÜST satırındaki en soldaki üyesi — sadece konumu bilinen, 2+ üyeli
  // kümeler sayılır. Önce satır (en küçük asılY), sonra o satır içinde en sol (asılX). Satır
  // sarma hep AŞAĞI doğru işlediği için çıpa alt satırlardan birine düşerse aşağı sarılacak
  // satır kalmıyordu (Gökhan: "14 kişilik rezervasyon, sınırın çok dışına taştı" — çıpa en alt
  // satırdaymış, üstteki satırlarda yer olsa bile oraya hiç sarılamıyordu). En üstte başlamak
  // en fazla aşağı satırı garantiler.
  const kumeCipaId = new Map<number, string>();
  kumeler.forEach((kume, i) => {
    const gecerli = kume.filter((m) => byId.has(m.id));
    if (gecerli.length < 2) return;
    kumeCipaId.set(i, [...gecerli].sort((a, b) => (asilY(a)! - asilY(b)!) || (asilX(a)! - asilX(b)!))[0].id);
  });

  // Sınır: en sağdaki masanın MERKEZİ değil, GÖVDESİNİN SAĞ KENARI — sadece merkezi almak
  // salonun kendi son sütunundaki masayı bile "sınırı aşıyor" saydırıyordu (bir masanın
  // kendi yarı genişliği kadar hep taşar), bu da içerideki masaları gereksiz sıkıştırıp
  // asıl aşımları da doğru yakalayamıyordu.
  const maxX = konumlu.reduce<number | null>((en, m) => {
    const kenar = asilX(m)! + genislik(m) / 2;
    return en === null ? kenar : Math.max(en, kenar);
  }, null);

  // Satırlar — ASIL konuma göre (kaymış konuma göre değil).
  const siralar: PlanMasa[][] = [];
  [...konumlu].sort((a, b) => asilY(a)! - asilY(b)!).forEach((m) => {
    const sira = siralar.find((s) => Math.abs(asilY(s[0])! - asilY(m)!) <= SIRA_TOLERANS);
    if (sira) sira.push(m); else siralar.push([m]);
  });
  // Satırın SOL KENARI — en soldaki masanın merkezi değil, kendi sol kenarı olmalı; merkezi
  // kullanmak alt satıra sarılan masaları yarım gövde payı kadar sağa kaydırıyordu.
  const rowStartX = siralar.map((s) => Math.min(...s.map((m) => asilX(m)! - genislik(m) / 2)));

  const sonuc = new Map<string, { x: number; y: number }>();

  // Kümenin üyeleri: ÇIPA her zaman en başta (yerinden oynamaz), geri kalanı OKUMA
  // sırasıyla (yukarıdan aşağı, soldan sağa) — saf asılX sıralaması aynı sıradaki kümeler
  // için doğruydu ama satır sarmasında sütuna göre gruplayıp (bütün 6'lıklar, bütün 4'lükler)
  // satırları karıştırıyordu; okuma sırası "alt satıra in" mantığıyla tutarlı diziyor.
  const kumeUyeSirasi = new Map<number, PlanMasa[]>();
  const cipaKumeNo = new Map<string, number>(); // çıpa masa id -> küme no
  const kumeliMasaIds = new Set<string>();       // 2+ üyeli her kümenin BÜTÜN üyeleri
  kumeCipaId.forEach((cipaId, kNo) => {
    const gecerli = kumeler[kNo].filter((u) => byId.has(u.id));
    const cipa = gecerli.find((u) => u.id === cipaId)!;
    const digerler = gecerli.filter((u) => u.id !== cipaId).sort((a, b) => (asilY(a)! - asilY(b)!) || (asilX(a)! - asilX(b)!));
    const uyeler = [cipa, ...digerler];
    kumeUyeSirasi.set(kNo, uyeler);
    cipaKumeNo.set(cipaId, kNo);
    uyeler.forEach((u) => kumeliMasaIds.add(u.id));
  });

  // SATIR SARMA (Gökhan: "dışarı çıkmayacak, alt sıraya inecek — düz bir sıra hâlinde
  // oturtması mümkün değil ki, 3 tane yan yana sıra mümkün"). Satırlar TEK GEÇİŞTE, yukarıdan
  // aşağı işlenir; bir kümenin masaları o satıra sığmazsa kalanı bir SONRAKİ satırın BAŞINA
  // taşar — metin gibi satır sarar. Standalone (kümesiz) masalar ASLA satır değiştirmez,
  // sadece kendi satırında sağa itilebilir. Tek geçiş olduğu için aynı satıra düşen FARKLI
  // kümeler de birbirinden habersiz kalmaz — hepsi aynı soldan-sağa taramadan geçer.
  //
  // KUYRUK (tek değişken değil): aynı satırda BİRDEN FAZLA blok aşarsa hepsi taşımalı —
  // tek bir "tasan" değişkeni sonuncu hariç hepsini sessizce kaybediyordu, kaybolan masa
  // eski (bir önceki plandan kalma) konumunda asılı kalıp başka bir masayla çakışıyordu.
  let tasanKuyruk: PlanMasa[][] = [];

  siralar.forEach((satirMasalari, satirIdx) => {
    const yerli = [...satirMasalari].filter((m) => !kumeliMasaIds.has(m.id) || cipaKumeNo.has(m.id)).sort((a, b) => asilX(a)! - asilX(b)!);
    // Blok listesi: [bu satıra taşan bloklar (varsa, sırasıyla)] + bu satırdaki standalone/çıpa
    // masalar (asılX sırasıyla).
    const bloklar: { uyeler: PlanMasa[]; tasanMi: boolean }[] = tasanKuyruk.map((uyeler) => ({ uyeler, tasanMi: true }));
    yerli.forEach((m) => {
      const kNo = cipaKumeNo.get(m.id);
      bloklar.push({ uyeler: kNo !== undefined ? kumeUyeSirasi.get(kNo)! : [m], tasanMi: false });
    });
    if (bloklar.length === 0) { tasanKuyruk = []; return; }

    const satirY = asilY(satirMasalari[0])!;

    // Bir satırı tek geçişte dizer. siki=false: normal mod (asıl konum tabanı + AYRI_MESAFE,
    // gerekirse tek bloğun payı daraltılır). siki=true: SIKIŞTIRMA modu — bütün boşluklar
    // sıfırlanır ve hiçbir blok kendi asıl konumuna "atlamaz", hep bir öncekinin hemen sağına
    // biter. Bir kümenin çıpası (kendi satırında hiç taşmayan) bir ÖNCEKİ kümenin taşan
    // (satıra çekilmiş) üyeleri yüzünden sağa itilebiliyor, bu da geriden gelen ÜÇÜNCÜ bir
    // çıpayı sınırın dışına atabiliyordu (Gökhan: "3 tane 18 kişilik rezervasyon" gibi çok
    // kümeli satırlarda). Tek blok bazında boşluk daraltmak yetmeyince satırın TAMAMI en sıkı
    // haliyle yeniden denenir.
    // Bir satırı tek geçişte dizer, ama SIRAYI SABİT saymaz: baştaki blok sığmıyorsa (ve çıpa
    // gibi zorunlu değilse) sırada ondan sonra gelip ŞU AN sığacak bir blok var mı diye bakar,
    // varsa onu öne alır — sığmayan geriye, bir sonraki satıra ertelenir (Gökhan: "sıra doldu,
    // 4 kişilik sığmıyorsa onu aşağı sıraya alacak, yerine sığan 2 kişiliği getirecek... en
    // kısa zahmetsiz yoldan"). Masalar arası mesafe HER ZAMAN zorunlu — boş olsun dolu olsun
    // fark etmez (Gökhan: "boş masalar arasında da hep o sabit mesafe olacak" — sığmıyorsa
    // masa DEĞİŞTİRİLİR, mesafeden asla ödün verilmez).
    const dene = (siki: boolean) => {
      const yerel = new Map<string, { x: number; y: number }>();
      const kuyruk: PlanMasa[][] = [];
      let sagKenar: number | null = null;
      let tasti = false;

      // Verilen blok, güncel sagKenar'dan başlarsa alacağı sol kenar.
      const xHesapla = (blok: { uyeler: PlanMasa[]; tasanMi: boolean }): number => {
        const cipaKorumali = !blok.tasanMi && blok.uyeler.length > 1;
        const dogalSolKenar = blok.tasanMi ? rowStartX[satirIdx] : asilX(blok.uyeler[0])! - genislik(blok.uyeler[0]) / 2;
        if (sagKenar === null) return dogalSolKenar;
        if (siki) return sagKenar; // sıkışık modda boşluk yok, asıl konuma atlama yok
        let x = Math.max(dogalSolKenar, sagKenar + AYRI_MESAFE);
        // Tam mesafeyle sığmıyorsa boşluğu daraltıp tekrar dener — ya ÇIPA olduğu için (hiçbir
        // satırda atlanamaz) ya da son satırda olduğu için (artık sarılacak alt satır yok).
        if (maxX !== null && (cipaKorumali || satirIdx === siralar.length - 1)) {
          const daha = Math.max(dogalSolKenar, sagKenar);
          if (x + genislik(blok.uyeler[0]) > maxX && daha + genislik(blok.uyeler[0]) <= maxX) x = daha;
        }
        return x;
      };
      const blokGenisligi = (blok: { uyeler: PlanMasa[] }) => blok.uyeler.reduce((s, m) => s + genislik(m), 0);

      const kalanlar = [...bloklar];
      while (kalanlar.length > 0) {
        // Masa değişimi SADECE tek masalık (kümesiz) bloklar arasında olur — bir rezervasyon
        // kümesi (2+ masa, dip dibe durması gereken) hiç "değiştirilmez"; kümenin kendi
        // üye-bazlı sarma mantığı (bir kısmı sığar, kalanı alt satıra taşar) zaten var ve daha
        // az yer kaplar. Bütün kümeyi küçük bir masayla değiştirmeye çalışmak kümeyi bütünüyle
        // bir alt satıra iter, orada daha büyük bir taşmaya yol açar.
        const ilkTekMi = kalanlar[0].uyeler.length === 1;
        const ilkX = xHesapla(kalanlar[0]);
        let idx = 0;
        if (ilkTekMi && maxX !== null && ilkX + blokGenisligi(kalanlar[0]) > maxX) {
          // Baştaki tek masa sığmıyor — sırada, ŞU AN sığacak daha ileri bir TEK masa var mı
          // diye bak (Gökhan: "4 kişilik sığmıyorsa yerine sığan 2 kişiliği getirecek"). Varsa
          // masa değiştir: onu öne al, sığmayanı bir sonraki satıra bırak.
          const j = kalanlar.findIndex((aday, k) => k > 0 && aday.uyeler.length === 1 && xHesapla(aday) + blokGenisligi(aday) <= maxX!);
          if (j > 0) idx = j;
        }
        const blok = kalanlar[idx];
        kalanlar.splice(idx, 1);
        const x0 = xHesapla(blok);
        const cipaKorumali = !blok.tasanMi && blok.uyeler.length > 1;

        let x = x0;
        let birseyYerlesti = false;
        for (let i = 0; i < blok.uyeler.length; i++) {
          const m = blok.uyeler[i];
          const w = genislik(m);
          const korumali = cipaKorumali && i === 0;
          const sarilabilir = !korumali && satirIdx < siralar.length - 1;
          if (sarilabilir && maxX !== null && x + w > maxX) { kuyruk.push(blok.uyeler.slice(i)); break; }
          if (maxX !== null && x + w > maxX) tasti = true; // sarılamıyor ama yine de taşıyor
          yerel.set(m.id, { x: x + w / 2, y: satirY });
          x += w;
          birseyYerlesti = true;
        }
        if (birseyYerlesti) sagKenar = x; // yerleşmediyse bozma, satırda hâlâ boş yer var
      }
      return { yerel, kuyruk, tasti };
    };

    const gevsek = dene(false);
    const secilen = gevsek.tasti ? dene(true) : gevsek;
    secilen.yerel.forEach((v, id) => sonuc.set(id, v));
    tasanKuyruk = secilen.kuyruk;
  });

  const yerler: MasaYeri[] = [];
  tumMasalar.forEach((m) => {
    const yeni = sonuc.get(m.id);
    if (yeni && (m.position_x !== yeni.x || m.position_y !== yeni.y)) yerler.push({ id: m.id, x: yeni.x, y: yeni.y });
  });
  return yerler;
};
