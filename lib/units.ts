// Reçete girişinde kullanıcı doğal birimlerle yazar (15 gr, 250 ml, 1 adet),
// sistem malzemenin taban birimine (kg / lt / adet) çevirip öyle saklar.
export type BaseUnit = "kg" | "lt" | "adet";

const ALIASES: Record<BaseUnit, Record<string, number>> = {
  kg: { "": 1, kg: 1, kilogram: 1, gr: 0.001, g: 0.001, gram: 0.001 },
  lt: { "": 1, lt: 1, l: 1, litre: 1, ml: 0.001, mililitre: 0.001 },
  adet: { "": 1, adet: 1, ad: 1, tane: 1 },
};

// "15 gr", "250ml", "1 adet", "0.015" gibi girişleri taban birime (kg/lt/adet) çevirir.
// Anlaşılamayan birim veya sayı yazılırsa null döner.
export function parseNaturalQuantity(input: string, baseUnit: BaseUnit): number | null {
  const raw = input.trim().toLocaleLowerCase("tr-TR").replace(",", ".");
  if (!raw) return null;
  const m = raw.match(/^([\d.]+)\s*([a-zçğıöşü]*)$/);
  if (!m) return null;
  const value = parseFloat(m[1]);
  if (!isFinite(value) || value <= 0) return null;
  const unit = m[2];
  const factor = ALIASES[baseUnit][unit];
  if (factor === undefined) return null;
  return value * factor;
}

const trim = (n: number, digits: number) => {
  const s = n.toFixed(digits);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
};

// Taban birimdeki miktarı (kg/lt/adet) kullanıcının okuması kolay doğal birime çevirip gösterir.
export function formatQuantity(qty: number, baseUnit: BaseUnit): string {
  if (baseUnit === "adet") return `${trim(qty, 2)} adet`;
  if (qty < 1) {
    const sub = Math.round(qty * 1000);
    return `${sub} ${baseUnit === "kg" ? "gr" : "ml"}`;
  }
  return `${trim(qty, 3)} ${baseUnit}`;
}

export const NATURAL_UNIT_HINT: Record<BaseUnit, string> = {
  kg: "örn. 15 gr, 0.5 kg",
  lt: "örn. 250 ml, 1 lt",
  adet: "örn. 1 adet",
};
