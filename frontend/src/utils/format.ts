// All times display in the browser's time zone (agreed in PLAN §6).

export function formatMiles(miles: number): string {
  return `${Math.round(miles).toLocaleString("en-US")} mi`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function formatPounds(pounds: number): string {
  return `${pounds.toLocaleString("en-US")} lb`;
}

/**
 * Dates use the browser's language, so a UK user sees "14:00 BST" and a US user "2:00 PM PDT".
 * `locale` and `timeZone` parameters are for tests; the app uses the browser's.
 */
const BROWSER_LOCALE = typeof navigator === "undefined" ? "en-US" : navigator.language;

interface ZoneOptions {
  timeZone?: string;
  locale?: string;
}

/** "Tue, Oct 20, 2:13 PM CDT" (en-US) or "Tue 20 Oct, 14:13 BST" (en-GB). */
export function formatDateTime(
  iso: string,
  { timeZone, locale = BROWSER_LOCALE }: ZoneOptions = {},
): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone,
  }).format(new Date(iso));
}

/** "CDT (America/Chicago)": shown next to the departure field. */
export function describeTimeZone(date = new Date(), options: ZoneOptions = {}): string {
  const zone = options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const abbreviation = timeZoneAbbreviation(date, options);
  return abbreviation ? `${abbreviation} (${zone})` : zone;
}

/** Value for <input type="datetime-local">, in the browser's time zone. */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** A datetime-local value (browser time zone) as UTC ISO, or null if it isn't a date. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value); // no offset in the string: parsed as local time
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** The next full hour from `now`: the form's default departure. */
export function nextFullHour(now = new Date()): Date {
  const next = new Date(now);
  next.setHours(next.getHours() + 1, 0, 0, 0);
  return next;
}

/**
 * A checkpoint's ETA in a table column: "7:28 PM", plus the day when it changes from
 * `previousIso` ("Mon 12:20 AM"), plus the zone when that changes, as it does on a trip
 * across a daylight-saving switch ("Sun 1:20 AM EST").
 */
export function formatClock(iso: string, previousIso?: string, options: ZoneOptions = {}): string {
  const { timeZone, locale = BROWSER_LOCALE } = options;
  const date = new Date(iso);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(date);
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { dateStyle: "short", timeZone }).format(d);
  const previous = previousIso === undefined ? undefined : new Date(previousIso);

  const parts = [time];
  if (!previous || dayKey(previous) !== dayKey(date)) {
    parts.unshift(new Intl.DateTimeFormat(locale, { weekday: "short", timeZone }).format(date));
  }
  if (previous && timeZoneAbbreviation(previous, options) !== timeZoneAbbreviation(date, options)) {
    parts.push(timeZoneAbbreviation(date, options));
  }
  return parts.join(" ");
}

/** The short zone name at that moment: "CDT", "BST" (en-GB) or "GMT+5". */
export function timeZoneAbbreviation(
  date = new Date(),
  { timeZone, locale = BROWSER_LOCALE }: ZoneOptions = {},
): string {
  return (
    new Intl.DateTimeFormat(locale, { timeZoneName: "short", timeZone })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? ""
  );
}
