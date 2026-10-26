/**
 * "Kalan" (remaining balance) is not a DB view (docs/SPEC.md §6) — it is
 * computed here from `monthly_earnings.approved_amount` minus that month's
 * `payments`, so the employee (S5 Geçmiş) and manager (S13 Çalışan profili)
 * screens share one definition.
 */
export interface RemainingBalanceInput {
  approvedAmount: number;
  payments: Array<{ amount: number }>;
}

export function remainingBalance({ approvedAmount, payments }: RemainingBalanceInput): number {
  const paid = payments.reduce((sum, p) => sum + p.amount, 0);
  return Math.round((approvedAmount - paid) * 100) / 100;
}
