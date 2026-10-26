import { TZDate } from "@date-fns/tz";
import { format, subDays, startOfWeek } from "date-fns";

/**
 * Mirrors the SQL time rules in supabase/migrations/20261025000001_init.sql
 * (round_minutes, compute_work_date, week_deadline) so the UI can preview a
 * value before the server confirms it. The DB is always the source of truth —
 * never persist a value computed here (CLAUDE.md golden rule 3).
 */
export const TZ = "Europe/Amsterdam";

const TR_WEEKDAYS = [
  "Pazartesi",
  "Salı",
  "Çarşamba",
  "Perşembe",
  "Cuma",
  "Cumartesi",
  "Pazar",
] as const;

const TR_WEEKDAYS_SHORT = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;

const TR_MONTHS = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;

/** Round a duration to the nearest 5 minutes, exact halves rounding up. */
export function roundMinutes(start: Date, end: Date | null): number | null {
  if (end === null) return null;
  const seconds = (end.getTime() - start.getTime()) / 1000;
  return Math.round(seconds / 300) * 5;
}

/**
 * The business day a shift belongs to: the local Amsterdam calendar date of
 * `start`, unless the shift starts before `cutoff` (default 06:00), in which
 * case it belongs to the previous calendar day.
 */
export function businessDay(start: Date, cutoff = "06:00"): string {
  const [cutHour, cutMinute] = cutoff.split(":").map(Number);
  const local = new TZDate(start, TZ);
  const beforeCutoff =
    local.getHours() < cutHour ||
    (local.getHours() === cutHour && local.getMinutes() < cutMinute);
  const businessDate = beforeCutoff ? subDays(local, 1) : local;
  return format(businessDate, "yyyy-MM-dd");
}

/**
 * Elapsed whole minutes between an ISO timestamp and now. Kept as its own
 * plain function (not inlined in a component body) so `Date.now()` never
 * runs directly inside a component's render — that trips the
 * react-hooks/purity lint rule even for Server Components that only render
 * once per request.
 */
export function minutesSince(isoTimestamp: string): number {
  return Math.round((Date.now() - new Date(isoTimestamp).getTime()) / 60000);
}

/** Today's calendar date in Amsterdam local time, as 'YYYY-MM-DD'. */
export function todayInAmsterdam(): string {
  return format(new TZDate(new Date(), TZ), "yyyy-MM-dd");
}

/** The 1st of the month containing `dateStr`, as 'YYYY-MM-DD' (matches `payments.month` / `monthly_earnings.month`). */
export function monthStart(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

/** Monday (ISO) of the week containing `dateStr` ('YYYY-MM-DD'). */
export function weekStart(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12));
  const monday = startOfWeek(utcNoon, { weekStartsOn: 1 });
  return format(monday, "yyyy-MM-dd");
}

/**
 * The deadline for a schedule week's requests: the given weekday (ISO 1–7)
 * and time, in the week *before* `weekStartDate`, in Amsterdam local time.
 */
export function requestDeadline(
  weekStartDate: string,
  weekday: number,
  time: string,
): Date {
  const [y, m, d] = weekStartDate.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const deadlineDay = d - 7 + (weekday - 1);
  return new TZDate(y, m - 1, deadlineDay, hour, minute, 0, TZ);
}

/** "515" -> "8 sa 35 dk"; "40" -> "40 dk". */
export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} dk`;
  return `${hours} sa ${String(minutes).padStart(2, "0")} dk`;
}

/** 'YYYY-MM-DD' -> "Cumartesi 24 Ekim" (no year, matching mockup copy). */
export function formatDayTR(dateStr: string, withYear = false): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const utcDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const isoDow = utcDay === 0 ? 7 : utcDay;
  const base = `${TR_WEEKDAYS[isoDow - 1]} ${d} ${TR_MONTHS[m - 1]}`;
  return withYear ? `${base} ${y}` : base;
}

/**
 * `<input type="datetime-local">` gives a naive "YYYY-MM-DDTHH:mm" string with
 * no timezone. Staff phones are assumed to be set to Amsterdam local time
 * (they're on-site), so that string is read as Amsterdam wall-clock and
 * converted to the correct UTC instant — not as the server's/browser's own zone.
 */
export function amsterdamLocalToISO(localDateTime: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(localDateTime);
  if (!match) throw new Error(`Invalid local datetime string: ${localDateTime}`);
  const [, y, m, d, h, mi] = match;
  const amsterdam = new TZDate(Number(y), Number(m) - 1, Number(d), Number(h), Number(mi), 0, TZ);
  // Normalize to a plain Date's "Z"-suffixed ISO string — TZDate.toISOString()
  // keeps a "+01:00"-style offset instead, which is the same instant but a
  // different (and less predictable downstream) string shape.
  return new Date(amsterdam.getTime()).toISOString();
}

/** The inverse of `amsterdamLocalToISO` — for prefilling a datetime-local input. */
export function isoToAmsterdamLocalInput(isoTimestamp: string): string {
  return format(new TZDate(new Date(isoTimestamp), TZ), "yyyy-MM-dd'T'HH:mm");
}

/** An ISO timestamp -> "16:55" in Amsterdam local time. */
export function formatTimeTR(isoTimestamp: string): string {
  return format(new TZDate(new Date(isoTimestamp), TZ), "HH:mm");
}

/** 'YYYY-MM-DD' -> "24 Eki" (short form for compact lists/charts). */
export function formatDayShortTR(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${d} ${TR_MONTHS[m - 1].slice(0, 3)}`;
}

/** ISO weekday (1=Monday..7=Sunday) -> "Pzt".."Paz" */
export function weekdayShortTR(isoWeekday: number): string {
  return TR_WEEKDAYS_SHORT[isoWeekday - 1];
}

export { TR_WEEKDAYS, TR_WEEKDAYS_SHORT, TR_MONTHS };

/** 'YYYY-MM-DD' shifted by `days` calendar days (DST-safe: works on the date, not on instants). */
export function addDaysToDate(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

/** The 7 dates (Mon..Sun) of the week starting at `mondayStr`. */
export function weekDates(mondayStr: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToDate(mondayStr, i));
}

/**
 * Hand-entered shift (date + "HH:mm" start/end, Amsterdam wall-clock) -> UTC
 * instants. An end time at or before the start means the shift ran past
 * midnight, so the end lands on the next calendar day (17:00 – 01:30).
 */
export function manualEntryRange(
  dateStr: string,
  startTime: string,
  endTime: string,
): { startAt: string; endAt: string } {
  const endDate = endTime <= startTime ? addDaysToDate(dateStr, 1) : dateStr;
  return {
    startAt: amsterdamLocalToISO(`${dateStr}T${startTime}`),
    endAt: amsterdamLocalToISO(`${endDate}T${endTime}`),
  };
}

/** `?hafta=YYYY-MM-DD` -> that week's Monday; anything else -> the current week's Monday. */
export function weekFromParam(param: string | undefined, today: string): string {
  return param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? weekStart(param) : weekStart(today);
}
