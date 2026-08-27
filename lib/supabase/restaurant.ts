import { supabase } from "./client";

// Oturum sahibinin kendi işletmesini döner (profiles.restaurant_id üzerinden).
// Oturum yoksa veya profil bulunamazsa null — çağıran taraf /giris'e yönlendirmeyi Shell zaten yapıyor.
//
// İKİNCİ DAL (2026-08-27, telefonda giriş Ekip'ten kararı): Ekip şahıs hesabıyla
// giren YÖNETİCİNİN profiles kaydı yok — işletmesi personel_hesaplari'ndan
// bulunur (kalıp reservationAccount.ts ile aynı). Sadece yönetici: diğer roller
// AIOS yönetim ekranlarına açılmaz. NOT: bu dalın veri çekebilmesi için veri
// kilidinin (erisilen_restoranlar) canlıda yönetici dalını tanıması gerekir —
// veritabanı uykudan kalkınca doğrulanacak.
export async function getMyRestaurantId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await supabase
    .from("profiles")
    .select("restaurant_id")
    .eq("id", session.user.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (data?.restaurant_id) return data.restaurant_id;

  const { data: personel } = await supabase
    .from("personel_hesaplari")
    .select("restaurant_id")
    .eq("user_id", session.user.id)
    .eq("durum", "onayli")
    .eq("rol", "yonetici")
    .maybeSingle();
  return personel?.restaurant_id ?? null;
}
