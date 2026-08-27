// Demo kipinin sahte Supabase istemcisi. Gerçek istemciyle aynı çağrı zincirini
// kabul eder (from().select().eq()...maybeSingle(), rpc, auth) ama ağa hiç
// çıkmaz: okuma lib/demo/demoVeri.ts'ten gelir, yazma başarılı görünür ve
// hiçbir yere kaydedilmez (sayfa yenilenince demo verisi geri gelir).
//
// Süzgeçler (eq, is, order...) BİLEREK yok sayılır — amaç ekranın gerçek gibi
// dolması, veritabanı davranışını birebir taklit etmek değil.

import { TABLOLAR, RPCLER, DEMO_KULLANICI_ID } from "./demoVeri";

type Sonuc = { data: unknown; error: null };
const cevap = (data: unknown): Promise<Sonuc> => Promise.resolve({ data, error: null });

const ZINCIR_METOTLARI = [
  "select", "eq", "neq", "is", "in", "gt", "gte", "lt", "lte", "like", "ilike",
  "or", "not", "match", "contains", "order", "limit", "range",
  "update", "upsert", "insert", "delete",
] as const;

function sorgu(tablo: string) {
  const veri = () => TABLOLAR[tablo] ?? [];
  // then ile: await supabase.from(x).select()... doğrudan sonuca çözülür.
  const zincir: Record<string, unknown> = {
    maybeSingle: () => cevap(veri()[0] ?? null),
    single: () => cevap(veri()[0] ?? null),
    then: (cozumle: (s: Sonuc) => unknown, hata?: (e: unknown) => unknown) =>
      cevap(veri()).then(cozumle, hata),
  };
  for (const m of ZINCIR_METOTLARI) zincir[m] = () => zincir;
  return zincir;
}

const demoOturum = {
  user: { id: DEMO_KULLANICI_ID, email: "demo@restoran-aios" },
  access_token: "demo", refresh_token: "demo",
};

// Realtime kanalları: abone ol çağrıları sessizce yutulur, hiç olay gelmez.
function kanal() {
  const k: Record<string, unknown> = {};
  k.on = () => k;
  k.subscribe = () => k;
  k.unsubscribe = () => {};
  return k;
}

export const demoClient = {
  from: (tablo: string) => sorgu(tablo),
  rpc: (ad: string) => cevap(RPCLER[ad] ?? null),
  auth: {
    getSession: async () => ({ data: { session: demoOturum }, error: null }),
    getUser: async () => ({ data: { user: demoOturum.user }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithPassword: async () => ({ data: { session: demoOturum, user: demoOturum.user }, error: null }),
    signUp: async () => ({ data: { session: demoOturum, user: demoOturum.user }, error: null }),
    signOut: async () => ({ error: null }),
  },
  channel: () => kanal(),
  removeChannel: () => {},
};
