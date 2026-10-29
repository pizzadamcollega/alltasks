import { z } from "zod";
import { usernameSchema } from "@/lib/validation/username";

/** D-45: an employee always has at least one duty. */
export const dutiesSchema = z
  .array(z.enum(["kasaci", "bezorgd", "usta"]))
  .min(1, "En az bir görev seç.")
  .transform((duties) => [...new Set(duties)]);

const baseAccountSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  username: usernameSchema,
  password: z.string().min(8, "Şifre en az 8 karakter olmalı."),
});

/** S14 Yeni çalışan — admin may tick several branches, a patron always sends their own one. */
export const createEmployeeSchema = baseAccountSchema.extend({
  hourlyRate: z.coerce.number().gt(0).lt(1000),
  startedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  branchIds: z.array(z.uuid()).min(1, "En az bir şube seç."),
  duties: dutiesSchema,
});

/** S13 "Bilgileri düzenle" — an empty start date clears it. */
export const updateAccountSchema = z.object({
  fullName: z.string().trim().min(2, "Ad soyad en az 2 karakter olmalı.").max(80),
  username: usernameSchema,
  startedOn: z
    .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
    .nullish()
    .transform((value) => value || null),
});

/** Admin-only "Yeni yönetici" — a patron manages exactly one branch (same rule as scripts/create-user.ts). */
export const createManagerSchema = baseAccountSchema.extend({
  branchId: z.uuid("Bir şube seç."),
});
