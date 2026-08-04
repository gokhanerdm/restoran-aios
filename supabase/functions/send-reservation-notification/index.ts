// Rezervasyon onay/hatirlatma bildirimi - SMS/WhatsApp saglayicisi henuz baglanmadi
// (Gokhan: "sen saglayicilara baglanacakmissin gibi devam et, sonrasina bakariz").
// Boru hatti (ayar kontrolu, rezervasyon okuma) gercek ve calisiyor; sadece asagidaki
// saglayici API cagrisi eksik - o secilip SMS_PROVIDER_API_KEY (Edge Function secrets)
// eklenince tamamlanacak. O ana kadar bu fonksiyon her zaman sent:false doner, hicbir
// yerde hata firlatmaz - cagiran taraf (Karsilama, misafir formu) sonucu beklemeden devam eder.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

type Body = { reservation_id?: string; type?: "onay" | "hatirlatma" };

Deno.serve(async (req: Request) => {
  const headers = { "Content-Type": "application/json" };
  try {
    const { reservation_id, type } = (await req.json()) as Body;
    if (!reservation_id || !type) {
      return new Response(JSON.stringify({ sent: false, reason: "reservation_id ve type gerekli" }), { status: 400, headers });
    }

    const db = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rez } = await db
      .from("reservations")
      .select("id, restaurant_id, guest_name, guest_phone, reserved_at, party_size")
      .eq("id", reservation_id)
      .maybeSingle();
    if (!rez || !rez.guest_phone) {
      return new Response(JSON.stringify({ sent: false, reason: "rezervasyon ya da telefon bulunamadi" }), { headers });
    }

    const { data: settings } = await db
      .from("restaurant_settings")
      .select("notif_channel, notif_onay, notif_hatirlatma")
      .eq("restaurant_id", rez.restaurant_id)
      .maybeSingle();

    const channel = settings?.notif_channel ?? "kapali";
    if (channel === "kapali") {
      return new Response(JSON.stringify({ sent: false, reason: "bildirimler kapali" }), { headers });
    }
    if (type === "onay" && settings?.notif_onay === false) {
      return new Response(JSON.stringify({ sent: false, reason: "onay bildirimi kapali" }), { headers });
    }
    if (type === "hatirlatma" && settings?.notif_hatirlatma === false) {
      return new Response(JSON.stringify({ sent: false, reason: "hatirlatma bildirimi kapali" }), { headers });
    }

    // Saglayici (Netgsm / Ileti Merkezi / WhatsApp Business API) secilip API anahtari Edge
    // Function secret'i olarak eklenene kadar gercek gonderim yapilmiyor.
    const providerKey = Deno.env.get("SMS_PROVIDER_API_KEY");
    if (!providerKey) {
      return new Response(JSON.stringify({ sent: false, reason: "saglayici henuz baglanmadi" }), { headers });
    }

    // const mesaj = type === "onay"
    //   ? `${rez.guest_name}, rezervasyonunuz alindi.`
    //   : `${rez.guest_name}, rezervasyon saatiniz yaklasiyor.`;
    // TODO: saglayicinin gercek API cagrisi buraya (fetch ile).

    return new Response(JSON.stringify({ sent: false, reason: "saglayici entegrasyonu henuz tamamlanmadi" }), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers });
  }
});
