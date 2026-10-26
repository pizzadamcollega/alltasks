import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PaymentKind } from "@/types/database";

type Client = SupabaseClient<Database>;

export interface PaymentRecord {
  id: string;
  kind: PaymentKind;
  amount: number;
  paidOn: string;
  note: string | null;
  visibleToEmployee: boolean;
}

const PAYMENT_COLUMNS = "id, kind, amount, paid_on, note, visible_to_employee";

function mapPayment(row: {
  id: string;
  kind: PaymentKind;
  amount: number;
  paid_on: string;
  note: string | null;
  visible_to_employee: boolean;
}): PaymentRecord {
  return {
    id: row.id,
    kind: row.kind,
    amount: row.amount,
    paidOn: row.paid_on,
    note: row.note,
    visibleToEmployee: row.visible_to_employee,
  };
}

/** S5: only records the manager has marked visible — RLS enforces this regardless, this just scopes the query. */
export async function getVisiblePayments(
  supabase: Client,
  userId: string,
  branchId: string,
  month: string,
): Promise<PaymentRecord[]> {
  const { data } = await supabase
    .from("payments")
    .select(PAYMENT_COLUMNS)
    .eq("user_id", userId)
    .eq("branch_id", branchId)
    .eq("month", month)
    .order("paid_on", { ascending: true });

  return (data ?? []).map(mapPayment);
}

/** Which of `months` ('YYYY-MM-01' strings) have at least one visible "payment" (salary) record. */
export async function getPaidMonths(
  supabase: Client,
  userId: string,
  branchId: string,
  months: string[],
): Promise<Set<string>> {
  if (months.length === 0) return new Set();
  const { data } = await supabase
    .from("payments")
    .select("month")
    .eq("user_id", userId)
    .eq("branch_id", branchId)
    .eq("kind", "payment")
    .in("month", months);

  return new Set((data ?? []).map((row) => row.month));
}

/** S13 (manager): every record for the month, regardless of visibility. */
export async function getAllPaymentsForMonth(
  supabase: Client,
  userId: string,
  branchId: string,
  month: string,
): Promise<PaymentRecord[]> {
  const { data } = await supabase
    .from("payments")
    .select(PAYMENT_COLUMNS)
    .eq("user_id", userId)
    .eq("branch_id", branchId)
    .eq("month", month)
    .order("paid_on", { ascending: true });

  return (data ?? []).map(mapPayment);
}
