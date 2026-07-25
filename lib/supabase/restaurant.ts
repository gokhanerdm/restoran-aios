import { supabase } from "./client";

// Oturum sahibinin kendi işletmesini döner (profiles.restaurant_id üzerinden).
// Oturum yoksa veya profil bulunamazsa null — çağıran taraf /giris'e yönlendirmeyi Shell zaten yapıyor.
export async function getMyRestaurantId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await supabase
    .from("profiles")
    .select("restaurant_id")
    .eq("id", session.user.id)
    .is("deleted_at", null)
    .maybeSingle();
  return data?.restaurant_id ?? null;
}
