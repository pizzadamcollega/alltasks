import { z } from "zod";

const dough = z.coerce.number().int("Tam sayı gir.").min(-999).max(999);

/** D-47 usta report: dough S/M/L as + extra / − short, plus free text. Mirrors material_reports checks. */
export const materialReportSchema = z.object({
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  doughS: dough,
  doughM: dough,
  doughL: dough,
  note: z
    .string()
    .trim()
    .max(500, "Not en fazla 500 karakter olabilir.")
    .transform((value) => value || null),
});

export type MaterialReportInput = z.infer<typeof materialReportSchema>;
