import { z } from "zod";

/**
 * Client-side preview of the rules `time_entries_before_write` enforces in
 * SQL (supabase/migrations/20261025000001_init.sql) — end after start, at
 * most 16 hours, not more than 5 minutes in the future. The trigger is the
 * real authority; this only lets the UI reject obviously-bad input early.
 */
export const editEntrySchema = z
  .object({
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
  })
  .refine((data) => data.endAt > data.startAt, {
    message: "Bitiş saati başlangıçtan sonra olmalı.",
    path: ["endAt"],
  })
  .refine((data) => data.endAt.getTime() - data.startAt.getTime() <= 16 * 60 * 60 * 1000, {
    message: "Bir kayıt en fazla 16 saat olabilir.",
    path: ["endAt"],
  })
  .refine((data) => data.endAt.getTime() <= Date.now() + 5 * 60 * 1000, {
    message: "Gelecek bir saat girilemez.",
    path: ["endAt"],
  });

export type EditEntryInput = z.infer<typeof editEntrySchema>;
