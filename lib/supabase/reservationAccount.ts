import { supabase } from "./client";

// Rezervasyon programının kendi oturum çözücüsü — AIOS'un profiles/getMyRestaurantId
// mekanizmasını KULLANMAZ (Gökhan: "AIOS ile işimiz yok"), tamamen ayrı bir yoldan
// gider: restaurants.owner_user_id doğrudan auth.users'a bakar.

export type ReservationBranch = { id: string; name: string; il: string | null; ilce: string | null };

// Çok şubeli bir hesapta birden fazla restoran satırı olabileceği için (bkz.
// add_reservation_branch), hangisinin "şu an açık" olduğunu tarayıcıda tutuyoruz —
// sunucuda oturumun kendisinde "aktif şube" diye bir kavram yok, bilerek: aynı hesap
// aynı anda bir cihazda bir şubeye, başka bir cihazda başka şubeye bakabilsin istiyoruz.
const AKTIF_SUBE_ANAHTARI = "rezervasyon_aktif_sube";

export async function getMyReservationRestaurants(): Promise<ReservationBranch[]> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];
  const { data } = await supabase
    .from("restaurants")
    .select("id, name, il, ilce")
    .eq("owner_user_id", session.user.id)
    .is("deleted_at", null)
    .order("created_at");
  return (data as ReservationBranch[]) ?? [];
}

export async function getMyReservationRestaurantId(): Promise<string | null> {
  const subeler = await getMyReservationRestaurants();
  if (subeler.length === 0) return null;
  if (subeler.length === 1) return subeler[0].id;

  const kayitli = typeof window !== "undefined" ? window.localStorage.getItem(AKTIF_SUBE_ANAHTARI) : null;
  if (kayitli && subeler.some((s) => s.id === kayitli)) return kayitli;

  const ilk = subeler[0].id;
  setAktifSube(ilk);
  return ilk;
}

export function setAktifSube(id: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(AKTIF_SUBE_ANAHTARI, id);
}

// Hesap kayıt olurken "çok şubeli" seçildiyse companies'te bir satırı olur — "Şube ekle"
// sadece bu hesaplarda gösterilir (Gökhan: "çok şubeli işletmede şube ekle olmalı").
export async function isMultiBranchAccount(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;
  const { data } = await supabase.from("companies").select("id").eq("owner_user_id", session.user.id).is("deleted_at", null).limit(1);
  return Boolean(data && data.length > 0);
}
