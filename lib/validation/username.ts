import { z } from "zod";

/** Matches the DB check: `username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'`. */
export const usernameSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9._-]{2,31}$/,
    "Kullanıcı adı 3-32 karakter, küçük harf/sayı/._- içermeli ve harf veya sayıyla başlamalı",
  );

const TURKISH_FOLD: Record<string, string> = {
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
  ı: "i",
  I: "i",
  İ: "i",
  ö: "o",
  Ö: "o",
  ş: "s",
  Ş: "s",
  ü: "u",
  Ü: "u",
};

function foldTurkish(input: string): string {
  return input.replace(/[çÇğĞıIİöÖşŞüÜ]/g, (char) => TURKISH_FOLD[char] ?? char);
}

/** "Şevval Öztürk" -> "sevval.ozturk" — a starting suggestion, not a guarantee of uniqueness. */
export function suggestUsername(fullName: string): string {
  return foldTurkish(fullName)
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(".")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+|\.+$/g, "");
}
