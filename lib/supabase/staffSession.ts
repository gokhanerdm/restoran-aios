// Personel PIN oturumu — garson/mutfak/bar cihazlarında "şu an kim kullanıyor" bilgisi.
// Gerçek Supabase Auth değil (bkz. staff_members migration notu): sadece localStorage'da
// tutulan hafif bir kimlik, çıkış yapılana kadar cihazda kalır.
export type StaffSession = { id: string; full_name: string; role: string };

const KEY = "staff_session_v1";

export function getStaffSession(): StaffSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StaffSession) : null;
  } catch {
    return null;
  }
}

export function setStaffSession(session: StaffSession) {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export function clearStaffSession() {
  localStorage.removeItem(KEY);
}
