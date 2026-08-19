// SALON DÜZENİNİ TAZELEME — tek kaynak.
//
// Rezervasyon listesi ve Salon ekranı aynı işi yapmalı: ekrana girildiğinde salon o günün
// rezervasyonlarına göre toparlansın. Yerleşim eskiden sadece rezervasyon eklenince/iptal
// olunca çalışıyordu; doğrudan Salon'a girildiğinde masalar önceki günün (hatta bitmiş bir
// rezervasyonun) dizilişinde asılı kalıyordu (Gökhan, 2026-08-10).
//
// Masa ATAMASI yapmaz — sadece o günün MEVCUT atamalarına göre masaların yerini toparlar.
// Bu yüzden otomatik yerleşim kapalıyken de güvenlidir.
import { supabase } from "@/lib/supabase/client";
import { birlesikYerlesim, salonuPlanla, komsulukSirasi, type PlanMasa } from "./masaPlan";
import { herZamankiMasa, istenenSalon, nottaHerZamankiMasa, type Salon, type Ziyaret } from "./notKurallari";
import { govdeCizim, PX_PER_CM, type Shape } from "./masaOlcu";

export const bugunIstanbulGun = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());

const gunSiniri = (gun: string) => {
  const start = `${gun}T00:00:00+03:00`;
  const d = new Date(`${gun}T12:00:00+03:00`);
  d.setDate(d.getDate() + 1);
  const end = `${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d)}T00:00:00+03:00`;
  return { start, end };
};

// normal_rotated: birleşmek için çevrilmeden önceki asıl duruş (Gökhan, 2026-08-19) — masa
// evine dönerken eski yönüne de döner.
// varsayilan_*: işletmenin raptiye ile kaydettiği kalıcı düzen — masanın gerçek evi budur.
type Masa = {
  id: string; seat_count: number; position_x: number | null; position_y: number | null;
  shape: Shape; rotated: boolean; normal_x: number | null; normal_y: number | null;
  normal_rotated: boolean | null;
  varsayilan_x: number | null; varsayilan_y: number | null; varsayilan_rotated: boolean | null;
  area_id: string | null;
};
const MASA_ALAN = "id, seat_count, position_x, position_y, shape, rotated, normal_x, normal_y, normal_rotated, varsayilan_x, varsayilan_y, varsayilan_rotated, area_id";

// Salonun (dining_area) GERÇEK eni piksel olarak — yerleşimin sağ duvarı budur, masa buranın
// dışına çıkarılmaz. Eskiden salonun eni hiç bilinmiyordu; sağ duvar "o sıradaki en sağdaki
// masa nerede duruyorsa orası" diye tahmin ediliyordu, masalar bir kez kayınca duvar da
// kayıyordu (Gökhan, 2026-08-12: masalar salondan taşıyordu). Ölçü girilmemişse null döner,
// o zaman eski tahmine düşülür.
const alanEnleriniGetir = async (restaurantId: string) => {
  const { data } = await supabase.from("dining_areas")
    .select("id, genislik_cm").eq("restaurant_id", restaurantId).is("deleted_at", null);
  const m = new Map<string, number | null>();
  ((data as { id: string; genislik_cm: number | null }[]) ?? []).forEach((a) =>
    m.set(a.id, a.genislik_cm && a.genislik_cm > 0 ? a.genislik_cm * PX_PER_CM : null));
  return m;
};

/** O günün atamalarına göre salonu toparlar. Değişen masa yoksa veritabanına hiç dokunmaz. */
export const salonDuzeniniTazele = async (restaurantId: string, gun: string) => {
  const { start, end } = gunSiniri(gun);
  const alanEni = await alanEnleriniGetir(restaurantId);
  const [{ data: rData }, { data: tData }] = await Promise.all([
    supabase.from("reservations").select("id, masa_kilit, reservation_tables(table_id)")
      // YEDEK HARİÇ — yedek masa tutmaz, sıra bekler. Filtre yoktu; salon ekranındaki
      // yerleşim yedeklere de masa dağıtıyor, gerçek rezervasyonlar masasız kalıyordu
      // (Gökhan, 2026-08-12, salon ekran görüntüsü).
      .eq("restaurant_id", restaurantId).is("deleted_at", null).eq("yedek", false)
      .in("status", ["bekleniyor", "geldi", "oturdu"])
      .gte("reserved_at", start).lt("reserved_at", end),
    supabase.from("restaurant_tables")
      .select(MASA_ALAN)
      .eq("restaurant_id", restaurantId).is("deleted_at", null).order("sort_order"),
  ]);
  const masalar = (tData as Masa[]) ?? [];
  if (masalar.length === 0) return;
  const rezler = (rData as { id: string; masa_kilit: boolean; reservation_tables: { table_id: string }[] | null }[]) ?? [];
  // Kilitli rezervasyonların masaları: yerleşim için sabit engel, yerlerinden oynamazlar.
  const kilitliIds = new Set(
    rezler.filter((r) => r.masa_kilit).flatMap((r) => (r.reservation_tables ?? []).map((x) => x.table_id)),
  );

  const planMasa = (t: Masa): PlanMasa => ({
    id: t.id, seat_count: t.seat_count, position_x: t.position_x, position_y: t.position_y,
    genislik: govdeCizim(t.shape, t.seat_count, t.rotated).width,
    yukseklik: govdeCizim(t.shape, t.seat_count, t.rotated).height,
    normalX: t.normal_x, normalY: t.normal_y,
    varsayilanX: t.varsayilan_x, varsayilanY: t.varsayilan_y,
    // Birleşirken duruşu çıpaya uydurulacak masayı seçebilmek için şekil ve yön de veriliyor.
    shape: t.shape, rotated: t.rotated,
    alanId: t.area_id, alanEni: (t.area_id && alanEni.get(t.area_id)) || null,
  });

  // Küme = birden fazla masası olan rezervasyon. Atamaya karışılmaz, olan alınır.
  const kumeler: PlanMasa[][] = [];
  const birlesik = new Set<string>();
  rezler.forEach((r) => {
    const ids = (r.reservation_tables ?? []).map((x) => x.table_id).filter((id) => masalar.some((t) => t.id === id));
    if (ids.length < 2) return;
    kumeler.push(ids.map((id) => planMasa(masalar.find((t) => t.id === id)!)));
    ids.forEach((id) => birlesik.add(id));
  });

  // Birleşik olmayan masalar asıl yerine döner. Elimizdeki liste de aynı anda güncelleniyor —
  // yoksa aşağıdaki yerleşim eski konumlara bakıp "değişmemiş" sanıyor ve masa altta kalıyor.
  for (const t of masalar) {
    if (kilitliIds.has(t.id)) continue; // kilitli masa asıl yerine de dönmez
    // Eve dönüş: varsa işletmenin kayıtlı düzeni, yoksa birleştirmeden önceki yer.
    const evXx = t.varsayilan_x ?? t.normal_x, evYy = t.varsayilan_y ?? t.normal_y;
    if (birlesik.has(t.id) || evXx === null || evYy === null) continue;
    const ex = evXx, ey = evYy;
    // Masa evine dönerken ESKİ YÖNÜNE de döner — birleşmek için çevrilmişse düzelir
    // (Gökhan, 2026-08-19).
    const eskiYon = t.varsayilan_rotated ?? t.normal_rotated;
    await supabase.from("restaurant_tables")
      .update({
        position_x: ex, position_y: ey, normal_x: null, normal_y: null,
        ...(eskiYon !== null ? { rotated: eskiYon, normal_rotated: null } : {}),
      }).eq("id", t.id);
    t.position_x = ex; t.position_y = ey; t.normal_x = null; t.normal_y = null;
    if (eskiYon !== null) { t.rotated = eskiYon; t.normal_rotated = null; }
  }

  for (const yer of birlesikYerlesim(kumeler, masalar.map(planMasa), kilitliIds)) {
    const t = masalar.find((x) => x.id === yer.id);
    if (!t) continue;
    const yerAyni = t.position_x === yer.x && t.position_y === yer.y;
    const yonAyni = yer.rotated === undefined || yer.rotated === t.rotated;
    if (yerAyni && yonAyni) continue;
    await supabase.from("restaurant_tables").update({
      position_x: yer.x, position_y: yer.y,
      normal_x: t.normal_x ?? t.position_x, normal_y: t.normal_y ?? t.position_y,
      // Çevrilen masanın asıl yönü saklanır; eve dönerken oraya döner (Gökhan, 2026-08-19).
      ...(yer.rotated !== undefined ? { rotated: yer.rotated, normal_rotated: t.normal_rotated ?? t.rotated } : {}),
    }).eq("id", yer.id);
  }
};

/**
 * "Yerleşim yap" — salonu SIFIRDAN kurar: mevcut atamalar korunmaz, masalar rezervasyonlara
 * baştan dağıtılır, sonra düzen toparlanır. Salon ekranındaki düğme bunu çağırır
 * (Gökhan, 2026-08-10: "yerleşim yap butonunu salon sayfasına alalım").
 * Oturmuş ve masası kilitli rezervasyonlara dokunulmaz.
 */
export const yerlesimYap = async (restaurantId: string, gun: string) => {
  const { start, end } = gunSiniri(gun);
  const alanEni = await alanEnleriniGetir(restaurantId);
  const [{ data: sData }, { data: ayarData }] = await Promise.all([
    // Salon adları kuralın kendisidir — ayrı bir kelime listesi yok.
    supabase.from("dining_areas").select("id, name")
      .eq("restaurant_id", restaurantId).is("deleted_at", null).order("sort_order"),
    supabase.from("restaurant_settings").select("sadik_masa_gecmis_sayisi")
      .eq("restaurant_id", restaurantId).maybeSingle(),
  ]);
  const salonlar = (sData as Salon[]) ?? [];
  const gecmisSayisi = (ayarData as { sadik_masa_gecmis_sayisi: number } | null)?.sadik_masa_gecmis_sayisi ?? 3;
  const [{ data: rData }, { data: tData }] = await Promise.all([
    supabase.from("reservations").select("id, guest_name, party_size, status, masa_kilit, note, tercih_alan_id, kisi_karti_id, reservation_tables(table_id)")
      // YEDEK HARİÇ — yedek masa tutmaz, sıra bekler. Filtre yoktu; salon ekranındaki
      // yerleşim yedeklere de masa dağıtıyor, gerçek rezervasyonlar masasız kalıyordu
      // (Gökhan, 2026-08-12, salon ekran görüntüsü).
      .eq("restaurant_id", restaurantId).is("deleted_at", null).eq("yedek", false)
      .in("status", ["bekleniyor", "geldi", "oturdu"])
      .gte("reserved_at", start).lt("reserved_at", end),
    supabase.from("restaurant_tables")
      .select(MASA_ALAN)
      .eq("restaurant_id", restaurantId).is("deleted_at", null).order("sort_order"),
  ]);
  const masalar = (tData as Masa[]) ?? [];
  if (masalar.length === 0) return { degisen: 0, yerlesemeyenler: [] as string[], sorulacaklar: [] as string[] };
  type Rez = {
    id: string; guest_name: string; party_size: number; status: string; masa_kilit: boolean;
    note: string | null; tercih_alan_id: string | null; kisi_karti_id: string | null; reservation_tables: { table_id: string }[] | null;
  };
  const rezler = (rData as Rez[]) ?? [];
  const masaOf = (r: Rez) => (r.reservation_tables ?? []).map((x) => x.table_id);

  const planMasa = (t: Masa): PlanMasa => ({
    id: t.id, seat_count: t.seat_count, position_x: t.position_x, position_y: t.position_y,
    genislik: govdeCizim(t.shape, t.seat_count, t.rotated).width,
    yukseklik: govdeCizim(t.shape, t.seat_count, t.rotated).height,
    normalX: t.normal_x, normalY: t.normal_y,
    varsayilanX: t.varsayilan_x, varsayilanY: t.varsayilan_y,
    // Birleşirken duruşu çıpaya uydurulacak masayı seçebilmek için şekil ve yön de veriliyor.
    shape: t.shape, rotated: t.rotated,
    alanId: t.area_id, alanEni: (t.area_id && alanEni.get(t.area_id)) || null,
  });

  // Kilitli rezervasyonların masaları yerleşim için SABİT ENGEL. Buraya hiç verilmiyordu:
  // "Yerleşim yap" kilitli masayı asıl yerine geri gönderiyor, birleşen masalar da üstüne
  // biniyordu (Gökhan, 2026-08-12: "kilitli masa sabit engeldir"). Salon sayfasına girince
  // çalışan yerleşim kilidi zaten biliyordu — iki yol farklı davranıyordu.
  const kilitliIds = new Set(rezler.filter((r) => r.masa_kilit).flatMap(masaOf));
  const sabit = rezler.filter((r) => (r.status === "oturdu" || r.masa_kilit) && masaOf(r).length > 0);
  const sabitIds = new Set(sabit.map((r) => r.id));
  const serbest = rezler.filter((r) => !sabitIds.has(r.id));
  const planMasalar = masalar.map(planMasa);
  const masaById = new Map(planMasalar.map((m) => [m.id, m]));

  // ————————————————————————————————————————————————————————————————
  // TERCİHLER (Gökhan, 2026-08-12)
  //  • Nota salon adı yazılmışsa rezervasyon o salona yerleşir.
  //  • Sadık misafir, notunda bir şey yazmasa bile kendi masasına oturur.
  // İkisi de "tercih" olarak hazırlanıp planlayıcıya veriliyor; planlayıcı tercihi olan
  // rezervasyonu önce yerleştiriyor. Sabit (oturmuş/kilitli) masalara dokunulmuyor — kilitli
  // değilse masa sahibinden alınıp sadık misafire verilir (Gökhan: "kilitli değilse ondan alıp
  // ona versin"), masası alınan rezervasyon normal yerleşimle başka masaya geçer.
  // ————————————————————————————————————————————————————————————————
  const kartIds = [...new Set(serbest.map((r) => r.kisi_karti_id).filter((x): x is string => !!x))];
  const gecmis = new Map<string, Ziyaret[]>();
  if (kartIds.length > 0) {
    const { data: gData } = await supabase.from("reservations")
      .select("kisi_karti_id, reserved_at, reservation_tables(table_id)")
      .eq("restaurant_id", restaurantId).is("deleted_at", null)
      .in("kisi_karti_id", kartIds)
      // Sadece GERÇEKTEN gelinmiş ziyaretler sayılır; iptal ve gelmedi sayılmaz.
      .in("status", ["geldi", "oturdu", "tamamlandi"])
      .lt("reserved_at", start)
      .order("reserved_at", { ascending: false });
    type G = { kisi_karti_id: string; reserved_at: string; reservation_tables: { table_id: string }[] | null };
    ((gData as G[]) ?? []).forEach((g) => {
      const ids = (g.reservation_tables ?? []).map((x) => x.table_id);
      if (ids.length === 0) return;
      const liste = gecmis.get(g.kisi_karti_id) ?? [];
      liste.push({ tarih: g.reserved_at, masaIds: ids });
      gecmis.set(g.kisi_karti_id, liste);
    });
  }

  const doluIds = new Set(sabit.flatMap(masaOf)); // tercih dağıtırken elde olmayan masalar
  const tercih: Record<string, string[]> = {};
  const oncelikli = new Set<string>();     // tercihi olan rezervasyonlar — önce onlar yerleşir
  const sorulacaklar: string[] = [];       // notundaki salona sığmayanlar

  // Bir masa gruba yetmiyorsa YANINDAKİ boş masalarla tamamlanır (Gökhan: "yakınından
  // birleşim yapılsın") — misafirin sevdiği masa bırakılmaz, büyütülür.
  const yeterinceBuyut = (ilk: PlanMasa, kisi: number, bosMu: (id: string) => boolean): string[] | null => {
    const secilen = [ilk];
    let koltuk = ilk.seat_count;
    if (koltuk >= kisi) return [ilk.id];
    const adaylar = planMasalar.filter((m) => m.id !== ilk.id && bosMu(m.id) && m.alanId === ilk.alanId);
    for (const m of komsulukSirasi(adaylar, ilk)) {
      secilen.push(m);
      koltuk += m.seat_count;
      if (koltuk >= kisi) return secilen.map((x) => x.id);
    }
    return null;
  };

  // 1) SADIK MİSAFİR — kendi masası. Notunda bir şey yazmasına gerek yok; ama iki misafir aynı
  // masayı istiyorsa notuna açıkça yazdıran öne geçer.
  const sadikSirasi = [...serbest].sort(
    (a, b) => (nottaHerZamankiMasa(b.note) ? 1 : 0) - (nottaHerZamankiMasa(a.note) ? 1 : 0),
  );
  sadikSirasi.forEach((r) => {
    if (!r.kisi_karti_id) return;
    const masaId = herZamankiMasa(gecmis.get(r.kisi_karti_id) ?? [], gecmisSayisi);
    const masa = masaId ? masaById.get(masaId) : null;
    if (!masa || doluIds.has(masa.id)) return;
    const kume = yeterinceBuyut(masa, r.party_size, (id) => !doluIds.has(id));
    if (!kume) return;
    kume.forEach((id) => doluIds.add(id));
    tercih[r.id] = kume;
    oncelikli.add(r.id);
  });

  // 2) İSTENEN SALON — notta yazan ya da misafirin online seçtiği salonun boş masalarından
  //    yer ayrılır.
  serbest.forEach((r) => {
    if (tercih[r.id]) return;
    const alan = istenenSalon(r, salonlar);
    if (!alan) return;
    const alanMasalari = planMasalar.filter((m) => m.alanId === alan && !doluIds.has(m.id));
    // O salonun kendi içinde tek başına planlanır — masa seçme kuralları (tam ölçü → üst boy →
    // birleştirme, aynı sıra önceliği) aynen çalışsın diye planlayıcı yeniden kullanılıyor.
    const { atamalar: a } = salonuPlanla(alanMasalari, [{ id: r.id, kisi: r.party_size }], [], {});
    const secim = a[r.id];
    if (!secim || secim.length === 0) {
      // Salon dolu — program kendi kafasına göre başka salona atmaz, işletmeye sorulur
      // (Gökhan, 2026-08-12: "aynen işletmeye sorulsun").
      sorulacaklar.push(`${r.guest_name} (${r.party_size} kişi)`);
      return;
    }
    secim.forEach((id) => doluIds.add(id));
    tercih[r.id] = secim;
    oncelikli.add(r.id);
  });

  // Tercihi olanlar listenin başına — planlayıcı tercihleri sırayla uyguluyor, masa çakışırsa
  // baştaki kazanıyor.
  const sirali = [...serbest].sort((a, b) => (oncelikli.has(b.id) ? 1 : 0) - (oncelikli.has(a.id) ? 1 : 0));
  const { atamalar, yerlesemeyen } = salonuPlanla(
    planMasalar,
    sirali.map((r) => ({ id: r.id, kisi: r.party_size })),
    sabit.map((r) => ({ rez: { id: r.id, kisi: r.party_size }, masaIds: masaOf(r) })),
    tercih, // sıfırdan kurulur ama tercihler korunur
  );

  const yeniAtamalar: { reservation_id: string; table_ids: string[] }[] = [];
  serbest.forEach((r) => {
    const yeni = atamalar[r.id];
    if (!yeni) return;
    const eski = masaOf(r);
    if (eski.length !== yeni.length || yeni.some((id) => !eski.includes(id))) yeniAtamalar.push({ reservation_id: r.id, table_ids: yeni });
  });
  if (yeniAtamalar.length > 0) {
    const { error } = await supabase.rpc("apply_seating_plan", { p_restaurant: restaurantId, p_plan: yeniAtamalar });
    if (error) throw new Error(error.message);
  }

  const kumeler: PlanMasa[][] = [];
  const birlesik = new Set<string>();
  Object.values(atamalar).forEach((ids) => {
    if (ids.length < 2) return;
    kumeler.push(ids.map((id) => planMasa(masalar.find((t) => t.id === id)!)));
    ids.forEach((id) => birlesik.add(id));
  });

  for (const t of masalar) {
    if (kilitliIds.has(t.id)) continue; // kilitli masa asıl yerine de dönmez, olduğu yerde kalır
    // Eve dönüş: varsa işletmenin kayıtlı düzeni, yoksa birleştirmeden önceki yer.
    const evXx = t.varsayilan_x ?? t.normal_x, evYy = t.varsayilan_y ?? t.normal_y;
    if (birlesik.has(t.id) || evXx === null || evYy === null) continue;
    const ex = evXx, ey = evYy;
    // Masa evine dönerken ESKİ YÖNÜNE de döner — birleşmek için çevrilmişse düzelir
    // (Gökhan, 2026-08-19).
    const eskiYon = t.varsayilan_rotated ?? t.normal_rotated;
    await supabase.from("restaurant_tables")
      .update({
        position_x: ex, position_y: ey, normal_x: null, normal_y: null,
        ...(eskiYon !== null ? { rotated: eskiYon, normal_rotated: null } : {}),
      }).eq("id", t.id);
    t.position_x = ex; t.position_y = ey; t.normal_x = null; t.normal_y = null;
    if (eskiYon !== null) { t.rotated = eskiYon; t.normal_rotated = null; }
  }
  for (const yer of birlesikYerlesim(kumeler, masalar.map(planMasa), kilitliIds)) {
    const t = masalar.find((x) => x.id === yer.id);
    if (!t) continue;
    const yerAyni = t.position_x === yer.x && t.position_y === yer.y;
    const yonAyni = yer.rotated === undefined || yer.rotated === t.rotated;
    if (yerAyni && yonAyni) continue;
    await supabase.from("restaurant_tables").update({
      position_x: yer.x, position_y: yer.y,
      normal_x: t.normal_x ?? t.position_x, normal_y: t.normal_y ?? t.position_y,
      // Çevrilen masanın asıl yönü saklanır; eve dönerken oraya döner (Gökhan, 2026-08-19).
      ...(yer.rotated !== undefined ? { rotated: yer.rotated, normal_rotated: t.normal_rotated ?? t.rotated } : {}),
    }).eq("id", yer.id);
  }

  return {
    degisen: yeniAtamalar.length,
    yerlesemeyenler: yerlesemeyen
      .map((id) => rezler.find((x) => x.id === id))
      .filter((r): r is Rez => !!r)
      .map((r) => `${r.guest_name} (${r.party_size} kişi)`),
    // Notunda salon yazan ama o salonda yer bulunamayanlar — program başka salona kendi kafasına
    // göre atmıyor, işletmeye soruyor.
    sorulacaklar,
  };
};
