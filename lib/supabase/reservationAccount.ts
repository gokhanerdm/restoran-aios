import { supabase } from "./client";

// Rezervasyon programının kendi oturum çözücüsü — AIOS'un profiles/getMyRestaurantId
// mekanizmasını KULLANMAZ (Gökhan: "AIOS ile işimiz yok"), tamamen ayrı bir yoldan
// gider: restaurants.owner_user_id doğrudan auth.users'a bakar.
export async function getMyReservationRestaurantId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await supabase.rpc("my_reservation_restaurant");
  return (data as string | null) ?? null;
}
