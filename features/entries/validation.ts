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

/** D-46 "Mesaiye başla": only the start, not in the future (the trigger allows 5 minutes of slack). */
export const startEntrySchema = z.object({
  startAt: z.coerce
    .date()
    .refine((date) => date.getTime() <= Date.now() + 5 * 60 * 1000, "Gelecek bir saat girilemez."),
});

/** D-46 "Mesaiyi bitir": the end; "after the start" and the 16 h cap are checked against the row in SQL. */
export const finishEntrySchema = z.object({
  endAt: z.coerce
    .date()
    .refine((date) => date.getTime() <= Date.now() + 5 * 60 * 1000, "Gelecek bir saat girilemez."),
});

export type EditEntryInput = z.infer<typeof editEntrySchema>;
