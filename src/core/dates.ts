// Dates and times as people read them: in the user's own time zone, on a 12-hour clock ("Oct 19, 2026, 8:53:55 PM EDT").
// Dataverse date columns have three behaviours. User Local values are moments, shown in the user's time zone. Date Only
// and Time-Zone Independent values are shown exactly as stored: converting them would move a date to the day before.

export type DateBehavior = 'UserLocal' | 'DateOnly' | 'TimeZoneIndependent';
/** What a date column holds: its behaviour, and whether it shows a date without a time. */
export interface DateColumn { behavior: DateBehavior; dateOnly: boolean }

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

type Style = 'moment' | 'zoned' | 'date' | 'stored' | 'storedDate';
const formats = new Map<string, Intl.DateTimeFormat>();
let zoneName = '', zoneAt = 0;
/** The computer's time zone, looked up at most once a second (a table can format thousands of dates). */
function currentZone(): string {
  const now = Date.now(); if (!zoneName || now - zoneAt > 1000) { zoneName = new Intl.DateTimeFormat().resolvedOptions().timeZone; zoneAt = now; }
  return zoneName;
}
/** Cached per time zone: the computer's zone can change (travel, automatic time zone) while the page stays open. */
function formatter(style: Style): Intl.DateTimeFormat {
  const zone = style === 'stored' || style === 'storedDate' ? 'UTC' : currentZone();
  const key = `${style}|${zone}`; const cached = formats.get(key); if (cached) return cached;
  const day: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };
  const time: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true };
  const options: Record<Style, Intl.DateTimeFormatOptions> = {
    moment: { ...day, ...time }, zoned: { ...day, ...time, timeZoneName: 'short' }, date: day,
    // Stored as is: read back in UTC, which is how Dataverse sends them, so nothing shifts.
    stored: { ...day, ...time, timeZone: 'UTC' }, storedDate: { ...day, timeZone: 'UTC' }
  };
  const created = new Intl.DateTimeFormat(undefined, options[style]); formats.set(key, created); return created;
}

const valid = (date: Date) => !Number.isNaN(date.getTime());
/** A Date, also one made in another frame (a form in an iframe), where `instanceof Date` is false. */
export const isDate = (value: unknown): value is Date => Object.prototype.toString.call(value) === '[object Date]';

/** A moment in the user's time zone, 12-hour clock; `zone` adds the zone's short name (EDT). Unreadable values as given. */
export function formatMoment(value: Date | string | number, zone = true): string {
  const date = isDate(value) ? value : new Date(value);
  return valid(date) ? formatter(zone ? 'zoned' : 'moment').format(date) : String(value);
}

/** A calendar date in the user's time zone (a form's date-only field). */
export function formatDay(value: Date): string { return valid(value) ? formatter('date').format(value) : String(value); }

/** True for the date strings Dataverse sends: "2026-10-20T00:53:48Z" or a date-only "2026-10-20". */
export const isDateText = (value: unknown): value is string => typeof value === 'string' && (INSTANT.test(value) || DAY.test(value));

/**
 * A date value from the Web API, as the user should read it: Date Only and Time-Zone Independent values exactly as
 * stored, User Local moments in the user's time zone. Without the column's behaviour it is taken as a moment.
 * Undefined when the value is not a date string.
 */
export function formatStoredDate(value: unknown, column?: DateColumn): string | undefined {
  if (!isDateText(value)) return undefined;
  const day = DAY.exec(value);
  if (day) return formatter('storedDate').format(new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]))));
  const date = new Date(value); if (!valid(date)) return undefined;
  if (column?.behavior === 'DateOnly') return formatter('storedDate').format(date);
  if (column?.behavior === 'TimeZoneIndependent') return formatter(column.dateOnly ? 'storedDate' : 'stored').format(date);
  return column?.dateOnly ? formatter('date').format(date) : formatter('zoned').format(date);
}
