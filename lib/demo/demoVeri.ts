// Demo kipinin sahte verisi. Tablo adı -> satırlar. Burada olmayan tablolara
// boş liste döner: ekran açılır, "kayıt yok" görünür, program çökmez.
//
// Yeni bir ekran demo ile test edilecekse o ekranın okuduğu tabloların örnek
// satırları buraya eklenir — başka hiçbir dosyaya dokunulmaz.

export const DEMO_RESTORAN_ID = "demo-restoran";
export const DEMO_KULLANICI_ID = "demo-kullanici";

export const TABLOLAR: Record<string, Record<string, unknown>[]> = {
  profiles: [
    { id: DEMO_KULLANICI_ID, restaurant_id: DEMO_RESTORAN_ID, role: "yonetici", deleted_at: null },
  ],
  restaurants: [
    {
      id: DEMO_RESTORAN_ID, name: "Demo Restoran",
      address: "Örnek Mah. Deneme Cad. No:1, Kadıköy / İstanbul",
      phone: "0212 000 00 00", tax_office: "Kadıköy", tax_number: "1234567890",
      slug: "demo-restorani",
    },
  ],
  restaurant_settings: [
    {
      restaurant_id: DEMO_RESTORAN_ID,
      default_vat_rate: 10, default_menu_design: "listeli",
      default_variable_cost_per_cover: 12, default_fixed_cost_share_percent: 18,
      role_visibility: {}, staff_comparison_enabled: false,
      purchase_approval_roles: ["yonetici"], table_flow_mode: "basit",
      tip_points: { garson: 3, mutfak: 2 }, kitchen_tip_percent: 20,
      course_sequencing_enabled: true, evening_start_hour: 17,
      notif_channel: "kapali", notif_onay: true, notif_hatirlatma: true,
      opening_hours: {}, background_choice: "yesil_kupler",
      kvkk_notice: "Örnek aydınlatma metni — demo verisidir, gerçek metin değildir.",
      kvkk_retention_days: 365,
    },
  ],
  menu_categories: [
    { id: "demo-kat-1", name: "BAŞLANGIÇLAR", parent_id: null, vat_rate: null, target_food_cost_percent: 28, course_no: 1, sort_order: 1, deleted_at: null },
    { id: "demo-kat-2", name: "ANA YEMEKLER", parent_id: null, vat_rate: null, target_food_cost_percent: 32, course_no: 2, sort_order: 2, deleted_at: null },
    { id: "demo-kat-3", name: "IZGARALAR", parent_id: "demo-kat-2", vat_rate: null, target_food_cost_percent: 35, course_no: 2, sort_order: 3, deleted_at: null },
    { id: "demo-kat-4", name: "TATLILAR", parent_id: null, vat_rate: null, target_food_cost_percent: 25, course_no: 3, sort_order: 4, deleted_at: null },
    { id: "demo-kat-5", name: "İÇECEKLER", parent_id: null, vat_rate: 20, target_food_cost_percent: null, course_no: null, sort_order: 5, deleted_at: null },
  ],
  payment_providers: [
    { id: "demo-pos-1", name: "Banka POS", method: "kart", commission_rate: 1.89, settlement_days: 1, is_default: true, is_active: true, deleted_at: null },
    { id: "demo-pos-2", name: "Yemek Kartı A", method: "yemek_karti", commission_rate: 6.5, settlement_days: 7, is_default: false, is_active: true, deleted_at: null },
  ],
};

// RPC adı -> dönen değer.
export const RPCLER: Record<string, unknown> = {
  personal_data_status: [
    { retention_days: 365, total_records: 24, expired_pending: 2, anonymized_count: 5, oldest_record: null },
  ],
  anonymize_expired_personal_data: 2,
  personel_rolum: [],
};
