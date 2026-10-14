import { APP_TIMEZONE } from "./config";

/**
 * Returns today's date in Australia/Melbourne as a YYYY-MM-DD string.
 * Used for follow-up "today" logic and default follow-up dates.
 */
export function todayInMelbourne(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Adds `days` to a YYYY-MM-DD date string and returns YYYY-MM-DD. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Adds `months` to a YYYY-MM-DD date string and returns YYYY-MM-DD. */
export function addMonths(dateStr: string, months: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Human-friendly date, e.g. "6 Jul 2026", in Melbourne time. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = value.length === 10 ? new Date(`${value}T00:00:00Z`) : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: APP_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/**
 * Meeting time label, e.g. "Tue 3 Jun 2025, 2:00 pm – 3:00 pm" in Melbourne
 * time. `start`/`end` are ISO strings.
 */
export function formatMeetingTime(
  start: string,
  end?: string | null,
): string {
  const s = new Date(start);
  if (Number.isNaN(s.getTime())) return "—";
  const day = new Intl.DateTimeFormat("en-AU", {
    timeZone: APP_TIMEZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(s);
  const clock = (d: Date) =>
    new Intl.DateTimeFormat("en-AU", {
      timeZone: APP_TIMEZONE,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  const e = end ? new Date(end) : null;
  const times =
    e && !Number.isNaN(e.getTime()) ? `${clock(s)} – ${clock(e)}` : clock(s);
  return `${day}, ${times}`;
}

/** Calendar day (YYYY-MM-DD) of a timestamp in Melbourne — for day-grouping. */
export function melbourneDay(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Time-of-day label, e.g. "2:05 pm", in Melbourne time. */
export function formatTime(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: APP_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

/** Relative day/time label, e.g. "3 days ago", "2h ago", "just now". */
export function timeAgo(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return "never";
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return "never";
  const diffMs = now.getTime() - then.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}
