import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

/**
 * Helper tanggal berbasis string ISO "YYYY-MM-DD", dibangun di atas dayjs.
 * Semua perhitungan memakai UTC supaya tidak bergeser satu hari mengikuti
 * timezone server. Kolom `delivery_date` bertipe `date` (tanpa jam), jadi
 * membandingkannya sebagai string ISO sudah aman dan tepat.
 */

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_FORMAT = "YYYY-MM-DD";

function parseIso(iso: string): dayjs.Dayjs {
  if (!ISO_DATE_PATTERN.test(iso)) {
    throw new Error(`invalid iso date: ${iso}`);
  }
  return dayjs.utc(iso, ISO_DATE_FORMAT, true);
}

/** Tanggal hari ini, format "YYYY-MM-DD". */
export function todayIso(): string {
  return dayjs.utc().format(ISO_DATE_FORMAT);
}

/** Geser tanggal n hari (boleh negatif). addDaysIso("2026-08-03", 6) === "2026-08-09" */
export function addDaysIso(iso: string, days: number): string {
  return parseIso(iso).add(days, "day").format(ISO_DATE_FORMAT);
}

/** Senin dari minggu tanggal tsb. dayjs.day(): Minggu=0 … Sabtu=6. */
export function startOfWeekIso(iso: string): string {
  const date = parseIso(iso);
  const mondayIndex = (date.day() + 6) % 7;
  return addDaysIso(iso, -mondayIndex);
}

/** true kalau tanggal tsb hari Senin. */
export function isMondayIso(iso: string): boolean {
  return parseIso(iso).day() === 1;
}

/** "monday" | "tuesday" | ... | "sunday" (huruf kecil, bahasa Inggris). */
export function dayNameIso(iso: string): string {
  return parseIso(iso).format("dddd").toLowerCase();
}

/** Selisih hari b - a. diffDaysIso("2026-08-03", "2026-08-05") === 2 */
export function diffDaysIso(a: string, b: string): number {
  return parseIso(b).diff(parseIso(a), "day");
}

/** Semua tanggal dari start s/d end inklusif. eachDayIso(senin, minggu) → 7 elemen. */
export function eachDayIso(start: string, end: string): string[] {
  const days: string[] = [];
  let current = start;
  while (current <= end) {
    days.push(current);
    current = addDaysIso(current, 1);
  }
  return days;
}
