// Singapore time helpers. SGT is a fixed UTC+8 with no DST, so a fixed offset
// is exact and avoids depending on the host's timezone database.

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface SgtParts {
  /** YYYY-MM-DD */
  date: string;
  /** HHMM */
  time: string;
}

export function toSgt(instant: Date): SgtParts {
  const iso = new Date(instant.getTime() + SGT_OFFSET_MS).toISOString(); // YYYY-MM-DDTHH:MM...
  return { date: iso.slice(0, 10), time: iso.slice(11, 13) + iso.slice(14, 16) };
}

/** The bot's default CAA: current SGT time floored to the hour. */
export function currentCaa(now: Date = new Date()): SgtParts {
  const { date, time } = toSgt(now);
  return { date, time: time.slice(0, 2) + "00" };
}

export function sgtToInstant({ date, time }: SgtParts): Date {
  return new Date(`${date}T${time.slice(0, 2)}:${time.slice(2, 4)}:00+08:00`);
}

/** 'YYYY-MM-DD' -> 'ddmmyy', the format every parade-state date is printed in. */
export function ddmmyy(date: string): string {
  return date.slice(8, 10) + date.slice(5, 7) + date.slice(2, 4);
}

/** 'ddmmyy' -> 'YYYY-MM-DD', or null if it isn't a real calendar date. */
export function parseDdmmyy(text: string): string | null {
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(text);
  if (!m) return null;
  const iso = `20${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

/** 'HHMM' (or 'HH:MM') -> 'HHMM', or null if invalid. */
export function parseHhmm(text: string): string | null {
  const m = /^([01]\d|2[0-3]):?([0-5]\d)$/.exec(text.trim());
  return m ? m[1] + m[2] : null;
}

/** Sortable key for comparing an end against the CAA. A date-only end lasts the whole day. */
export function endKey(date: string, time: string | null): string {
  return `${date} ${time ?? "2359"}`;
}

export function caaKey(caa: SgtParts): string {
  return `${caa.date} ${caa.time}`;
}
