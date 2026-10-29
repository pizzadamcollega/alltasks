import { z } from "zod";

/** "12,50" or "12.50" → 12.5; empty → 0. Two decimals at most, never negative. */
export function parseEuroInput(value: unknown): number {
  if (typeof value === "number") return value;
  const text = String(value ?? "").trim().replace(/\s/g, "");
  if (text === "") return 0;
  // "1.234,50" (tr/nl grouping) and "1234.50" both work
  const normalized = text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text;
  return /^\d+(\.\d{1,2})?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

const euro = (max: number) =>
  z.preprocess(
    parseEuroInput,
    z
      .number({ error: "Geçerli bir tutar gir (örn. 125,50)." })
      .refine(Number.isFinite, "Geçerli bir tutar gir (örn. 125,50).")
      .refine((n) => n >= 0, "Tutar negatif olamaz.")
      .refine((n) => n < max, "Tutar çok büyük."),
  );

/** D-48 kasa sayımı — mirrors cash_counts checks; the total is a generated column in SQL. */
export const cashCountSchema = z.object({
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  openingFloat: euro(100000),
  online: euro(1000000),
  kiosk: euro(1000000),
  contant: euro(1000000),
  note: z
    .string()
    .trim()
    .max(500, "Not en fazla 500 karakter olabilir.")
    .transform((value) => value || null),
});

/** Preview of `cash_counts.total` (online + kiosk + contant) in whole cents, so 0.1 + 0.2 stays 0.30. */
export function cashTotal(amounts: { online: number; kiosk: number; contant: number }): number {
  const cents = [amounts.online, amounts.kiosk, amounts.contant]
    .map((n) => (Number.isFinite(n) ? Math.round(n * 100) : 0))
    .reduce((sum, n) => sum + n, 0);
  return cents / 100;
}
