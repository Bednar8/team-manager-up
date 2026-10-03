/** Civil calendar day as YYYY-MM-DD with no time zone. */

const CIVIL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface CivilParts {
  year: number;
  month: number;
  day: number;
}

/** Narrow weekday labels (Monday first). */
export const WEEKDAY_LABELS_NARROW = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"] as const;

/** Full Polish weekday names (Monday first), shown from the `lg` breakpoint. */
export const WEEKDAY_LABELS_FULL = [
  "Poniedziałek",
  "Wtorek",
  "Środa",
  "Czwartek",
  "Piątek",
  "Sobota",
  "Niedziela",
] as const;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

/** Accepts YYYY-MM-DD only when that civil day exists. Rejects 2026-02-31 and any other shape. */
export function parseCivilDate(value: string): CivilParts | null {
  const match = CIVIL_DATE_RE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function formatCivilDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Monday = 0 … Sunday = 6 for a civil day (UTC calendar math, not local clock). */
function weekdayMonday0(year: number, month: number, day: number): number {
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (jsDay + 6) % 7;
}

/**
 * Six-week Monday-first grid of civil dates for the given year and month (1–12).
 * September 2026 → 2026-08-31 … 2026-10-11.
 */
export function monthGrid(year: number, month: number): string[] {
  const offset = weekdayMonday0(year, month, 1);
  const days: string[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(Date.UTC(year, month - 1, 1 - offset + i));
    days.push(formatCivilDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()));
  }
  return days;
}

export interface MonthDay {
  civil: string;
  inMonth: boolean;
}

/**
 * Monday-first weeks that contain at least one day of the given month.
 * A day from the previous or next month is `{ inMonth: false }`.
 * October 2026 → five weeks, with 28–30 September and 1 November marked out of month.
 */
export function monthWeeks(year: number, month: number): MonthDay[][] {
  const prefix = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-`;
  const days = monthGrid(year, month);
  const weeks: MonthDay[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    const slice = days.slice(index, index + 7);
    if (!slice.some((civil) => civil.startsWith(prefix))) continue;
    weeks.push(slice.map((civil) => ({ civil, inMonth: civil.startsWith(prefix) })));
  }
  return weeks;
}

function capitalizePl(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLocaleUpperCase("pl-PL") + value.slice(1);
}

/** Month heading, e.g. `Wrzesień 2026`. */
export function formatMonthHeading(year: number, month: number): string {
  const raw = new Intl.DateTimeFormat("pl-PL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  return capitalizePl(raw);
}

/** Popup / day title, e.g. `27 września 2026`. */
export function formatDayTitle(civil: string): string {
  const parts = parseCivilDate(civil);
  if (!parts) return civil;
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function civilMonthOf(civil: string): { year: number; month: number } | null {
  const parts = parseCivilDate(civil);
  if (!parts) return null;
  return { year: parts.year, month: parts.month };
}

/** True when `civil` is a real day strictly before `today`. Both values are YYYY-MM-DD. */
export function isPastCivil(civil: string, today: string): boolean {
  if (!parseCivilDate(civil) || !parseCivilDate(today)) return false;
  return civil < today;
}
