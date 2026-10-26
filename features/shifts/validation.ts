import { z } from "zod";

export const upsertShiftSchema = z.object({
  userId: z.uuid("Bir çalışan seç."),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Geçerli bir saat gir (ör. 16:45)."),
});

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Geçersiz tarih.");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Geçerli bir saat gir (ör. 16:45).");

export const submitShiftRequestsSchema = z.object({
  monday: date,
  note: z.string().trim().max(200, "Not en fazla 200 karakter olabilir.").optional(),
  days: z
    .array(z.object({ date, start: time }))
    .max(7)
    .refine((days) => new Set(days.map((d) => d.date)).size === days.length, "Aynı gün iki kez seçilmiş."),
});

export const decideShiftRequestSchema = z.object({
  requestId: z.uuid(),
  approve: z.boolean(),
  startTime: time.optional(),
});
