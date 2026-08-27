import { createBrowserClient } from "@supabase/ssr";
import { demoAktif } from "@/lib/demo/demoKip";
import { demoClient } from "@/lib/demo/demoClient";

const gercekClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

// DEMO KİPİ (2026-08-27): adrese ?demo=1 eklenince gerçek veritabanı yerine
// sahte veriyle çalışan istemci devreye girer (lib/demo/) — veritabanı uykuda
// ya da erişilemezken program gezilip test edilebilsin diye. ?demo=0 kapatır.
// Anahtar yazılmadıkça davranış eskisiyle birebir aynı.
export const supabase: ReturnType<typeof gercekClient> =
  typeof window !== "undefined" && demoAktif()
    ? (demoClient as unknown as ReturnType<typeof gercekClient>)
    : gercekClient();
