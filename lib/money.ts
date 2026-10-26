/**
 * EUR formatting (CLAUDE.md golden rule 4). The mockups use a literal "€"
 * prefix with tr-TR grouping ("€6.510,40"), which is not what
 * `Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'EUR' })`
 * reliably produces across ICU versions (it may place the symbol after the
 * number) — so the prefix is applied explicitly instead of relying on the
 * currency style's symbol placement.
 */
const MINUS_SIGN = "−";

const numberFormatter = new Intl.NumberFormat("tr-TR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 812.5 -> "€812,50"; -150 -> "−€150,00" (true minus, for deductions). */
export function formatEUR(amount: number | string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "€0,00";
  const sign = n < 0 ? MINUS_SIGN : "";
  return `${sign}€${numberFormatter.format(Math.abs(n))}`;
}

/**
 * amount = round(rounded_minutes / 60 * hourly_rate, 2), mirroring the SQL
 * `entry_earnings` view. Both inputs should already be server-confirmed
 * values; this is for client-side preview only.
 */
export function entryAmount(roundedMinutes: number, hourlyRate: number): number {
  return Math.round(((roundedMinutes / 60) * hourlyRate) * 100) / 100;
}
