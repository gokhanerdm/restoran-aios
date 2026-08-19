// GEÇİCİ ŞİFRE (Gökhan, 2026-08-16: "giriş için sadece mail isteyen yere maili yazmak yeterli
// olsun şimdilik, sık sık gir çık olabiliyor"). Supabase'de isimsiz giriş kapalı; açmak yerine
// program şifreyi kendisi belirliyor: e-postadan türetilen sabit bir şifre hem kayıtta hem
// girişte kullanılıyor, kullanıcıya hiç sorulmuyor. Böylece "e-postayı yaz, gir" çalışıyor.
//
// BU GEÇİCİDİR — şifreyi anlamsız kılıyor, aynı e-postayı bilen herkes girebilir. Demo bitince
// sökülecek: kayıtta kullanıcının yazdığı şifre kullanılacak, girişte sorulacak.
// Şifre kuralları (8+, büyük, küçük, rakam, sembol) burada da karşılanıyor.
//
// Tek yerde duruyor: hem Ekip üyeliği (app/ekip) hem rezervasyon girişi
// (app/rezervasyon/giris) aynı şifreyi üretmek zorunda, iki kopya olsa biri değişince
// diğerine giriş kapanırdı.
export const gecicSifre = (eposta: string) => `Ekip!${eposta.trim().toLowerCase()}#2026`;
