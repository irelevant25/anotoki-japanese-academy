// Times, dates and percentages as the pages write them. The app is in English
// whatever the system's locale (Slovak on the owner's computer): words in dates
// use 'en-GB'; plain numbers and numeric dates follow the locale on purpose.

/** "in 5 min", "in 3 h 20 min", "in 2 days", "now", or "—" for no time. */
export function fmtIn(ts: number | null | undefined, now = Date.now()): string {
  if (ts == null) {
    return '—';
  }
  const ms = ts - now;
  if (ms <= 0) {
    return 'now';
  }
  const m = Math.round(ms / 60000);
  if (m < 60) {
    return `in ${m} min`;
  }
  const hr = Math.floor(m / 60);
  if (hr < 24) {
    return `in ${hr} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim();
  }
  return `in ${plural(Math.floor(hr / 24), 'day')}`;
}

/** The home page's shorter form: "in 5 min", "in 3 h", "in 2 days". */
export function fmtInShort(ts: number, now = Date.now()): string {
  const m = Math.round((ts - now) / 60000);
  if (m <= 0) {
    return 'now';
  }
  if (m < 60) {
    return `in ${m} min`;
  }
  const h = Math.floor(m / 60);
  return h < 24 ? `in ${h} h` : `in ${plural(Math.floor(h / 24), 'day')}`;
}

/** A count with its word, one or many: "1 item", "3 items", "2 half-answered items". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** 14:00, in the reader's own clock. */
export function fmtClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** 24 Sept 2026 (English words), or "—". */
export function fmtDate(ts: number | null | undefined): string {
  return ts ? new Date(ts).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

/** A whole percentage of a out of b; 0 when there is no b. */
export function pct(a: number, b: number): number {
  return b ? Math.round((a / b) * 100) : 0;
}

/** 1m 5s, or 42s: the length of an exam. */
export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s` : `${s}s`;
}

/** 0:07 on the exam's clock. */
export function fmtClockSince(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(seconds % 60).padStart(2, '0')}`;
}
