import { z } from "zod";

export const upsertShiftSchema = z.object({
  userId: z.uuid("Bir çalışan seç."),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Geçerli bir saat gir (ör. 16:45)."),
});
