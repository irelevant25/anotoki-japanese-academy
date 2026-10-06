// Times, dates and percentages as the pages write them, in the language on the
// page. Pure functions: each that words anything takes the wording first —
// the translation service's t(), plural() and locale() — so a component passes
// its TranslationService, inside a computed() or from its template, and the
// text follows the language when it changes. Words come from the `time.` keys;
// dates and clocks from Intl, in the language's own locale ('en-GB', 'sk-SK'),
// whatever the system's is — unless a signed-in person chose a date order or
// a clock for their anotoki account (dateFormat(), timeFormat(): one choice
// every anotoki site follows), which then win over the language's.

import type { AnotokiDateFormat, AnotokiTimeFormat } from './auth/sdk/anotoki-auth';
import type { TranslationParams } from './i18n/translation.service';

/** What words a time: TranslationService is one; a spec may hand in its own. */
export interface Wording {
  t(key: string, params?: TranslationParams): string;
  plural(key: string, count: number, params?: TranslationParams): string;
  locale(): string;
  /** The order of a date's numbers a signed-in person chose for their account; null (or none): the language's own way. */
  dateFormat?(): AnotokiDateFormat | null;
  /** The clock a signed-in person chose for their account; null (or none): the language's own. */
  timeFormat?(): AnotokiTimeFormat | null;
}

/**
 * A date in the order an account chose, in the reader's own time zone — the
 * anotoki family's four, the same digits in every language: 6.10.2026
 * (dmy_dot), 06/10/2026 (dmy_slash), 10/06/2026 (mdy_slash), 2026-10-06
 * (ymd_dash).
 */
export function dateInOrder(date: Date, order: AnotokiDateFormat): string {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const two = (n: number): string => String(n).padStart(2, '0');
  switch (order) {
    case 'dmy_dot':
      return `${day}.${month}.${year}`;
    case 'dmy_slash':
      return `${two(day)}/${two(month)}/${year}`;
    case 'mdy_slash':
      return `${two(month)}/${two(day)}/${year}`;
    case 'ymd_dash':
      return `${year}-${two(month)}-${two(day)}`;
  }
}

/** The time of day on the clock an account chose, with the language's words for am and pm: 14:30 ('24'), or 2:30 pm ('12'). */
export function clockOn(date: Date, locale: string, clock: AnotokiTimeFormat): string {
  return date.toLocaleTimeString(locale, clock === '12' ? { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' } : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
}

/** "in 5 min", "in 3 h 20 min", "in 2 days", "now", or "—" for no time. */
export function fmtIn(w: Wording, ts: number | null | undefined, now = Date.now()): string {
  if (ts == null) {
    return '—';
  }
  const ms = ts - now;
  if (ms <= 0) {
    return w.t('time.now');
  }
  const m = Math.round(ms / 60000);
  if (m < 60) {
    return w.t('time.inMinutes', { m });
  }
  const h = Math.floor(m / 60);
  if (h < 24) {
    return m % 60 ? w.t('time.inHoursMinutes', { h, m: m % 60 }) : w.t('time.inHours', { h });
  }
  return w.plural('time.inDays', Math.floor(h / 24));
}

/** The home page's shorter form: "in 5 min", "in 3 h", "in 2 days". */
export function fmtInShort(w: Wording, ts: number, now = Date.now()): string {
  const m = Math.round((ts - now) / 60000);
  if (m <= 0) {
    return w.t('time.now');
  }
  if (m < 60) {
    return w.t('time.inMinutes', { m });
  }
  const h = Math.floor(m / 60);
  return h < 24 ? w.t('time.inHours', { h }) : w.plural('time.inDays', Math.floor(h / 24));
}

/** 14:00, in the reader's own time zone; on the clock a signed-in person chose, when they did (2:00 pm). */
export function fmtClock(w: Wording, ts: number): string {
  const clock = w.timeFormat?.() ?? null;
  return clock ? clockOn(new Date(ts), w.locale(), clock) : new Date(ts).toLocaleTimeString(w.locale(), { hour: '2-digit', minute: '2-digit' });
}

/** An hour on a chart's axis, in the reader's own time zone: 15 — or 3 pm on the 12-hour clock a signed-in person chose. */
export function fmtHour(w: Wording, ts: number): string {
  const date = new Date(ts);
  return w.timeFormat?.() === '12' ? date.toLocaleTimeString(w.locale(), { hour: 'numeric', hourCycle: 'h12' }) : String(date.getHours()).padStart(2, '0');
}

/** 24 Sept 2026 / 24. 9. 2026 — in the order a signed-in person chose, when they did (2026-09-24) —, or "—". */
export function fmtDate(w: Wording, ts: number | null | undefined): string {
  if (!ts) {
    return '—';
  }
  const order = w.dateFormat?.() ?? null;
  return order ? dateInOrder(new Date(ts), order) : new Date(ts).toLocaleDateString(w.locale(), { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * 24 Sept 2026, 14:00 / 24. 9. 2026, 14:00 — a moment: a time in
 * milliseconds, or the server's ISO text. A signed-in person who chose a date
 * order or a clock gets the date and the time side by side, each as chosen or
 * as the language writes it: 2026-09-24 14:00, 24 Sept 2026 2:00 pm.
 */
export function fmtDateTime(w: Wording, when: number | string): string {
  const date = new Date(when);
  if (w.dateFormat?.() || w.timeFormat?.()) {
    return `${fmtDate(w, date.getTime())} ${fmtClock(w, date.getTime())}`;
  }
  return date.toLocaleString(w.locale(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Thu / št: the day of the week, short. */
export function fmtWeekday(w: Wording, ts: number): string {
  return new Date(ts).toLocaleDateString(w.locale(), { weekday: 'short' });
}

/** Thu / št: the day of the week of a date the server names ('2026-09-24', the learner's own), whatever zone the browser is in. */
export function fmtWeekdayOf(w: Wording, date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(w.locale(), { weekday: 'short', timeZone: 'UTC' });
}

/** Thu 14:00 / št 14:00: the day of the week and the clock — the clock a signed-in person chose, when they did (Thu 2:00 pm). */
export function fmtWeekdayClock(w: Wording, ts: number): string {
  if (w.timeFormat?.()) {
    return `${fmtWeekday(w, ts)} ${fmtClock(w, ts)}`;
  }
  return new Date(ts).toLocaleString(w.locale(), { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}

/** The admin panel's language: English, whatever the language on the learner's pages. */
const ADMIN_LOCALE = 'en-GB';

/**
 * A moment as the admin panel writes it: in English (3 Oct 2026, 14:05) —
 * or, for a signed-in person who chose a date order or a clock, side by side
 * as fmtDateTime() puts them, each as chosen or in English (2026-10-03 14:05,
 * 3 Oct 2026 2:05 pm).
 */
export function fmtAdminMoment(w: Pick<Wording, 'dateFormat' | 'timeFormat'>, ms: number): string {
  const order = w.dateFormat?.() ?? null;
  const clock = w.timeFormat?.() ?? null;
  const date = new Date(ms);
  if (!order && !clock) {
    return date.toLocaleString(ADMIN_LOCALE, { dateStyle: 'medium', timeStyle: 'short' });
  }
  const day = order ? dateInOrder(date, order) : date.toLocaleDateString(ADMIN_LOCALE, { dateStyle: 'medium' });
  const time = clock ? clockOn(date, ADMIN_LOCALE, clock) : date.toLocaleTimeString(ADMIN_LOCALE, { timeStyle: 'short' });
  return `${day} ${time}`;
}

/** A whole percentage of a out of b; 0 when there is no b. */
export function pct(a: number, b: number): number {
  return b ? Math.round((a / b) * 100) : 0;
}

/** 1m 5s, or 42s: the length of an exam. */
export function fmtDuration(w: Wording, ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? w.t('time.durationMinutes', { m, s: s % 60 }) : w.t('time.durationSeconds', { s });
}

/** 0:07 on the exam's clock: digits only, the same in every language. */
export function fmtClockSince(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(seconds % 60).padStart(2, '0')}`;
}
