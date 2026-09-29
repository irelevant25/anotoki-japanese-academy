import { fmtClockSince, fmtDate, fmtDuration, fmtIn, fmtInShort, pct, plural } from './format';

const NOW = Date.UTC(2026, 8, 29, 10, 0, 0);
const MIN = 60000;

describe('format', () => {
  it('says when, from now', () => {
    expect(fmtIn(null, NOW)).toBe('—');
    expect(fmtIn(NOW - MIN, NOW)).toBe('now');
    expect(fmtIn(NOW + 5 * MIN, NOW)).toBe('in 5 min');
    expect(fmtIn(NOW + 200 * MIN, NOW)).toBe('in 3 h 20 min');
    expect(fmtIn(NOW + 180 * MIN, NOW)).toBe('in 3 h');
    expect(fmtIn(NOW + 26 * 60 * MIN, NOW)).toBe('in 1 day');
    expect(fmtIn(NOW + 50 * 60 * MIN, NOW)).toBe('in 2 days');
  });

  it('says it shorter on the home page', () => {
    expect(fmtInShort(NOW, NOW)).toBe('now');
    expect(fmtInShort(NOW + 200 * MIN, NOW)).toBe('in 3 h');
    expect(fmtInShort(NOW + 26 * 60 * MIN, NOW)).toBe('in 1 day');
    expect(fmtInShort(NOW + 50 * 60 * MIN, NOW)).toBe('in 2 days');
  });

  it('counts in words: one, or many', () => {
    expect(plural(1, 'attempt')).toBe('1 attempt');
    expect(plural(0, 'attempt')).toBe('0 attempts');
    expect(plural(3, 'half-answered item')).toBe('3 half-answered items');
    expect(plural(2, 'match', 'matches')).toBe('2 matches');
  });

  it('writes dates in English words, whatever the locale', () => {
    expect(fmtDate(null)).toBe('—');
    expect(fmtDate(NOW)).toMatch(/^29 Sept? 2026$/);
  });

  it('writes percentages, durations and the exam clock', () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(5, 0)).toBe(0);
    expect(fmtDuration(42_000)).toBe('42s');
    expect(fmtDuration(65_000)).toBe('1m 5s');
    expect(fmtClockSince(7)).toBe('0:07');
    expect(fmtClockSince(125)).toBe('2:05');
  });
});
