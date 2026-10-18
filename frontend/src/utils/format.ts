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

/** "Tue, Oct 20, 2:13 PM CDT". `timeZone` is for tests; the app uses the browser's. */
export function formatDateTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
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
export function describeTimeZone(date = new Date()): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const abbreviation = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName")?.value;
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
