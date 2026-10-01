import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fmtClock, fmtClockSince, fmtDate, fmtDateTime, fmtDuration, fmtIn, fmtInShort, fmtWeekday, fmtWeekdayClock, pct } from './format';
import { TranslationService } from './i18n/translation.service';
import { provideTestTranslations } from './testing/test-translations';

const NOW = Date.UTC(2026, 8, 29, 10, 0, 0);
const MIN = 60000;

/** The `time.` strings, as the migration seeds them. */
const ENGLISH = {
  'time.now': 'now',
  'time.inMinutes': 'in {m} min',
  'time.inHours': 'in {h} h',
  'time.inHoursMinutes': 'in {h} h {m} min',
  'time.inDays.one': 'in 1 day',
  'time.inDays.few': 'in {count} days',
  'time.inDays.other': 'in {count} days',
  'time.durationMinutes': '{m}m {s}s',
  'time.durationSeconds': '{s}s',
};
const SLOVAK = {
  'time.now': 'teraz',
  'time.inMinutes': 'o {m} min',
  'time.inHours': 'o {h} h',
  'time.inHoursMinutes': 'o {h} h {m} min',
  'time.inDays.one': 'o 1 deň',
  'time.inDays.few': 'o {count} dni',
  'time.inDays.other': 'o {count} dní',
  'time.durationMinutes': '{m} min {s} s',
  'time.durationSeconds': '{s} s',
};

function wording(language: 'en' | 'sk'): TranslationService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), language === 'sk' ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH)],
  });
  return TestBed.inject(TranslationService);
}

describe('format', () => {
  it('says when, from now', () => {
    const w = wording('en');
    expect(fmtIn(w, null, NOW)).toBe('—');
    expect(fmtIn(w, NOW - MIN, NOW)).toBe('now');
    expect(fmtIn(w, NOW + 5 * MIN, NOW)).toBe('in 5 min');
    expect(fmtIn(w, NOW + 200 * MIN, NOW)).toBe('in 3 h 20 min');
    expect(fmtIn(w, NOW + 180 * MIN, NOW)).toBe('in 3 h');
    expect(fmtIn(w, NOW + 26 * 60 * MIN, NOW)).toBe('in 1 day');
    expect(fmtIn(w, NOW + 50 * 60 * MIN, NOW)).toBe('in 2 days');
  });

  it('says when in Slovak: a preposition that does not change before a number, and three forms of "day"', () => {
    const w = wording('sk');
    expect(fmtIn(w, null, NOW)).toBe('—');
    expect(fmtIn(w, NOW - MIN, NOW)).toBe('teraz');
    expect(fmtIn(w, NOW + 5 * MIN, NOW)).toBe('o 5 min');
    expect(fmtIn(w, NOW + 200 * MIN, NOW)).toBe('o 3 h 20 min');
    expect(fmtIn(w, NOW + 180 * MIN, NOW)).toBe('o 3 h');
    expect(fmtIn(w, NOW + 26 * 60 * MIN, NOW)).toBe('o 1 deň');
    expect(fmtIn(w, NOW + 50 * 60 * MIN, NOW)).toBe('o 2 dni');
    expect(fmtIn(w, NOW + 5 * 24 * 60 * MIN, NOW)).toBe('o 5 dní');
  });

  it('says it shorter on the home page', () => {
    const w = wording('en');
    expect(fmtInShort(w, NOW, NOW)).toBe('now');
    expect(fmtInShort(w, NOW + 5 * MIN, NOW)).toBe('in 5 min');
    expect(fmtInShort(w, NOW + 200 * MIN, NOW)).toBe('in 3 h');
    expect(fmtInShort(w, NOW + 26 * 60 * MIN, NOW)).toBe('in 1 day');
    expect(fmtInShort(w, NOW + 50 * 60 * MIN, NOW)).toBe('in 2 days');

    const sk = wording('sk');
    expect(fmtInShort(sk, NOW, NOW)).toBe('teraz');
    expect(fmtInShort(sk, NOW + 200 * MIN, NOW)).toBe('o 3 h');
    expect(fmtInShort(sk, NOW + 3 * 24 * 60 * MIN, NOW)).toBe('o 3 dni');
  });

  it('writes dates in the chosen language, whatever the system’s locale', () => {
    const en = wording('en');
    expect(fmtDate(en, null)).toBe('—');
    expect(fmtDate(en, NOW)).toMatch(/^29 Sept? 2026$/);
    expect(fmtDate(wording('sk'), NOW)).toBe('29. 9. 2026');
    expect(fmtDate(wording('sk'), undefined)).toBe('—');
  });

  it('writes the clock, a date with its time and the weekday in the chosen language', () => {
    // A local time, so the clock reads the same in every time zone the tests run in.
    const moment = new Date(2026, 8, 24, 14, 5).getTime();
    const en = wording('en');
    expect(fmtClock(en, moment)).toBe('14:05');
    expect(fmtDateTime(en, moment)).toMatch(/^24 Sept? 2026, 14:05$/);
    expect(fmtDateTime(en, new Date(moment).toISOString())).toMatch(/^24 Sept? 2026, 14:05$/);
    expect(fmtWeekday(en, moment)).toBe('Thu');
    expect(fmtWeekdayClock(en, moment)).toBe('Thu 14:05');

    const sk = wording('sk');
    expect(fmtClock(sk, moment)).toBe('14:05');
    expect(fmtDateTime(sk, moment)).toBe('24. 9. 2026, 14:05');
    expect(fmtWeekday(sk, moment)).toBe('št');
    expect(fmtWeekdayClock(sk, moment)).toBe('št 14:05');
  });

  it('writes percentages, durations and the exam clock', () => {
    const w = wording('en');
    expect(pct(1, 3)).toBe(33);
    expect(pct(5, 0)).toBe(0);
    expect(fmtDuration(w, 42_000)).toBe('42s');
    expect(fmtDuration(w, 65_000)).toBe('1m 5s');
    expect(fmtClockSince(7)).toBe('0:07');
    expect(fmtClockSince(125)).toBe('2:05');

    const sk = wording('sk');
    expect(fmtDuration(sk, 42_000)).toBe('42 s');
    expect(fmtDuration(sk, 65_000)).toBe('1 min 5 s');
  });

  it('follows the language: the same call words itself again', async () => {
    const w = wording('sk');
    expect(fmtIn(w, NOW + 50 * 60 * MIN, NOW)).toBe('o 2 dni');
    await w.setLanguage('en', false);
    expect(fmtIn(w, NOW + 50 * 60 * MIN, NOW)).toBe('in 2 days');
  });
});
