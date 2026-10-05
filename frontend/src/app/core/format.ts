// Times, dates and percentages as the pages write them, in the language on the
// page. Pure functions: each that words anything takes the wording first —
// the translation service's t(), plural() and locale() — so a component passes
// its TranslationService, inside a computed() or from its template, and the
// text follows the language when it changes. Words come from the `time.` keys;
// dates and clocks from Intl, in the language's own locale ('en-GB', 'sk-SK'),
// whatever the system's is.

import type { TranslationParams } from './i18n/translation.service';

/** What words a time: TranslationService is one; a spec may hand in its own. */
export interface Wording {
  t(key: string, params?: TranslationParams): string;
  plural(key: string, count: number, params?: TranslationParams): string;
  locale(): string;
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

/** 14:00, in the reader's own time zone. */
export function fmtClock(w: Wording, ts: number): string {
  return new Date(ts).toLocaleTimeString(w.locale(), { hour: '2-digit', minute: '2-digit' });
}

/** 24 Sept 2026 / 24. 9. 2026, or "—". */
export function fmtDate(w: Wording, ts: number | null | undefined): string {
  return ts ? new Date(ts).toLocaleDateString(w.locale(), { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

/** 24 Sept 2026, 14:00 / 24. 9. 2026, 14:00 — a moment: a time in milliseconds, or the server's ISO text. */
export function fmtDateTime(w: Wording, when: number | string): string {
  return new Date(when).toLocaleString(w.locale(), { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Thu / št: the day of the week, short. */
export function fmtWeekday(w: Wording, ts: number): string {
  return new Date(ts).toLocaleDateString(w.locale(), { weekday: 'short' });
}

/** Thu / št: the day of the week of a date the server names ('2026-09-24', the learner's own), whatever zone the browser is in. */
export function fmtWeekdayOf(w: Wording, date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(w.locale(), { weekday: 'short', timeZone: 'UTC' });
}

/** Thu 14:00 / št 14:00: the day of the week and the clock. */
export function fmtWeekdayClock(w: Wording, ts: number): string {
  return new Date(ts).toLocaleString(w.locale(), { weekday: 'short', hour: '2-digit', minute: '2-digit' });
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
