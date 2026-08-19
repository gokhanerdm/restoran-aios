import { supabase } from "./client";

// Girişsiz mobil ekranların (garson, mutfak) ortak işletme çözümleyicisi.
// Bu ekranlar oturum açmadan çalışır, hangi işletmeye ait olduğunu bilmek için
// linkteki ?r=işletme-kodu (restaurants.slug) parametresine bakar. Kod verilmemişse
// ve veritabanında birden fazla işletme varsa (artık olabiliyor — her kayıt kendi
// kodunu alıyor) hangisini gösterileceği belirsiz kalır, bu yüzden açıkça hata verilir
// — rastgele bir işletmenin verisini göstermek yerine.
export async function resolveRestaurantIdBySlug(slug: string | null): Promise<{ id: string } | { error: string }> {
  // Veri kilidi (2026-08-10) sonrası bu sorgu kilidin arkasından geçiyor: oturum açıkken
  // sadece kullanıcının kendi işletmeleri döner, oturum yoksa hiçbir şey dönmez. Yani bu
  // ekranlar (garson, mutfak, vale) artık giriş ister — eskiden linki bilen herkese açıktı.
  let q = supabase.from("restaurants").select("id").is("deleted_at", null);
  q = slug ? q.eq("slug", slug) : q.order("created_at").limit(2);
  const { data, error } = await q;
  if (error) return { error: `İşletme bilgisi çekilemedi: ${error.message}` };
  const rows = (data as { id: string }[]) ?? [];
  if (rows.length === 0) return { error: slug ? `"${slug}" koduyla işletme bulunamadı.` : "İşletme bulunamadı." };
  if (!slug && rows.length > 1) return { error: "Birden fazla işletme kayıtlı — linke hangi işletme olduğunu belirtmek için sonuna ?r=işletme-kodu eklemelisin." };
  return { id: rows[0].id };
}
