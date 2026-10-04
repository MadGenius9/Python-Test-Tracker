/**
 * Central Time (America/Chicago) Date and Time Utilities for Sand Tracker.
 * 
 * Frac pads and oilfield operations in Texas/Permian operate in US Central Time.
 * Standardizing on America/Chicago ensures all shifts, operational reports,
 * and delivery sequences align cleanly without UTC drift.
 */

export const OPERATIONAL_TIMEZONE = 'America/Chicago';

/**
 * Returns the current (or supplied) date as YYYY-MM-DD in America/Chicago timezone.
 */
export function getOperationalDate(input?: Date | number | string): string {
  const d = input ? new Date(input) : new Date();
  if (isNaN(d.getTime())) {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: OPERATIONAL_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(now);
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: OPERATIONAL_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(d);
}

/**
 * Returns the current (or supplied) time as HH:mm in America/Chicago timezone (24h).
 */
export function getOperationalTime(input?: Date | number | string): string {
  const d = input ? new Date(input) : new Date();
  if (isNaN(d.getTime())) {
    return '12:00';
  }

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: OPERATIONAL_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(d);
}

/**
 * Parses YYYY-MM-DD into numeric year, month, day components safely without timezone skew.
 */
export function parseDateParts(dateStr: string): { year: number; month: number; day: number } | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim().split('T')[0];
  const parts = clean.split('-').map((p) => parseInt(p, 10));
  if (parts.length < 3 || isNaN(parts[0]) || isNaN(parts[1]) || isNaN(parts[2])) {
    return null;
  }
  return { year: parts[0], month: parts[1], day: parts[2] };
}

/**
 * Formats a YYYY-MM-DD date for display (e.g. "Mon, Oct 24, 2026").
 */
export function formatOperationalDateDisplay(
  dateStr: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const parts = parseDateParts(dateStr);
  if (!parts) return dateStr || '';

  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  const defaultOpts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  };
  return d.toLocaleDateString('en-US', options || defaultOpts);
}

/**
 * Adds an integer number of calendar days to a YYYY-MM-DD operational date string.
 * Safe from UTC/DST offsets.
 */
export function addOperationalDays(dateStr: string, days: number): string {
  const parts = parseDateParts(dateStr);
  if (!parts) return dateStr || '';
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Formats a YYYY-MM-DD date into an uppercase forecast display string (e.g. "SEP 8, 2026" or "TUE, SEP 8, 2026").
 */
export function formatForecastDateDisplay(dateStr?: string | null, includeWeekday = true): string {
  if (!dateStr) return '';
  const parts = parseDateParts(dateStr);
  if (!parts) return dateStr;
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0));
  const options: Intl.DateTimeFormatOptions = includeWeekday
    ? { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }
    : { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
  return d.toLocaleDateString('en-US', options).toUpperCase();
}

/**
 * Generates an inclusive sequence of YYYY-MM-DD dates between start and end.
 * Safe from UTC/DST offsets.
 */
export function generateDateSequence(startDateStr: string, endDateStr: string): string[] {
  if (!startDateStr || !endDateStr) return [];
  let s = startDateStr.split('T')[0];
  let e = endDateStr.split('T')[0];

  if (s > e) {
    const temp = s;
    s = e;
    e = temp;
  }

  const startParts = parseDateParts(s);
  const endParts = parseDateParts(e);
  if (!startParts || !endParts) return [s];

  const result: string[] = [];
  const cur = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day, 12, 0, 0));
  const end = new Date(Date.UTC(endParts.year, endParts.month - 1, endParts.day, 12, 0, 0));

  while (cur <= end) {
    const y = cur.getUTCFullYear();
    const m = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const d = String(cur.getUTCDate()).padStart(2, '0');
    result.push(`${y}-${m}-${d}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }

  return result;
}

/**
 * Formats a timestamp into an uppercase forecast date & time string in America/Chicago timezone.
 * Example: "SEP 4 • 6:35 AM" or "WED, SEP 4 • 6:35 AM"
 */
export function formatForecastDateTimeDisplay(
  timestampOrDate?: number | Date | string | null,
  includeWeekday = false
): string {
  if (!timestampOrDate) return '';
  const d =
    typeof timestampOrDate === 'number' || timestampOrDate instanceof Date
      ? new Date(timestampOrDate)
      : new Date(timestampOrDate);
  if (isNaN(d.getTime())) return '';

  const monthDayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATIONAL_TIMEZONE,
    month: 'short',
    day: 'numeric',
    ...(includeWeekday ? { weekday: 'short' } : {}),
  });

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATIONAL_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const datePart = monthDayFormatter.format(d).toUpperCase();
  const timePart = timeFormatter.format(d);
  return `${datePart} • ${timePart}`;
}

/**
 * Formats a timestamp into time only in America/Chicago timezone.
 * Example: "6:35 AM"
 */
export function formatForecastTimeDisplay(timestampOrDate?: number | Date | string | null): string {
  if (!timestampOrDate) return '';
  const d =
    typeof timestampOrDate === 'number' || timestampOrDate instanceof Date
      ? new Date(timestampOrDate)
      : new Date(timestampOrDate);
  if (isNaN(d.getTime())) return '';

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATIONAL_TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return timeFormatter.format(d);
}

/**
 * Formats a duration in hours into a clean "2h 18m" or "45m" string.
 */
export function formatHoursAndMinutes(hours?: number | null): string {
  if (hours === null || hours === undefined || isNaN(hours) || hours <= 0) {
    return '--';
  }
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) {
    return `${m}m`;
  }
  if (m === 0) {
    return `${h}h`;
  }
  return `${h}h ${m}m`;
}
