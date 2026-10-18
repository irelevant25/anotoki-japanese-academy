import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import type { AnotokiDateFormat, AnotokiTimeFormat } from '@anotoki/lib/auth';
import { dateInOrder, fmtAdminMoment, fmtClock, fmtClockSince, fmtDate, fmtDateTime, fmtDuration, fmtHour, fmtIn, fmtInShort, fmtWeekday, fmtWeekdayClock, fmtWeekdayOf, pct, Wording } from './format';

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

/**
 * The words of `language` for somebody who chose no date order or clock (or
 * nobody signed in): the translation service's t(), plural() and locale(), as
 * TimeWording hands them on.
 */
function wording(language: 'en' | 'sk'): Wording {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), language === 'sk' ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH)],
  });
  const i18n = TestBed.inject(TranslationService);
  return {
    t: (key, params) => i18n.t(key, params),
    plural: (key, count, params) => i18n.plural(key, count, params),
    locale: () => i18n.locale(),
    dateFormat: () => null,
    timeFormat: () => null,
  };
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
    // a date the server names: its weekday wherever the browser is (24 Sept 2026 is a Thursday)
    expect(fmtWeekdayOf(en, '2026-09-24')).toBe('Thu');
    expect(fmtWeekdayOf(sk, '2026-09-24')).toBe('št');
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
    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    expect(fmtIn(w, NOW + 50 * 60 * MIN, NOW)).toBe('in 2 days');
  });
});

/** The wording `w`, for somebody signed in who chose a date order and a clock for their anotoki account (null: the language's own). */
function choosing(w: Wording, order: AnotokiDateFormat | null, clock: AnotokiTimeFormat | null): Wording {
  return {
    t: (key, params) => w.t(key, params),
    plural: (key, count, params) => w.plural(key, count, params),
    locale: () => w.locale(),
    dateFormat: () => order,
    timeFormat: () => clock,
  };
}

describe('format: a signed-in person’s own date order and clock (their anotoki account’s, the same on every anotoki site)', () => {
  // Local times, so the day and the clock are the same in every time zone the tests run in: Tuesday 6 October 2026.
  const AFTERNOON = new Date(2026, 9, 6, 14, 5).getTime();
  const MORNING = new Date(2026, 9, 6, 9, 5).getTime();

  it('writes a date in the four orders, the same digits in every language', () => {
    const day = new Date(AFTERNOON);
    expect(dateInOrder(day, 'dmy_dot')).toBe('6.10.2026');
    expect(dateInOrder(day, 'dmy_slash')).toBe('06/10/2026');
    expect(dateInOrder(day, 'mdy_slash')).toBe('10/06/2026');
    expect(dateInOrder(day, 'ymd_dash')).toBe('2026-10-06');

    expect(fmtDate(choosing(wording('en'), 'ymd_dash', null), AFTERNOON)).toBe('2026-10-06');
    expect(fmtDate(choosing(wording('sk'), 'dmy_slash', null), AFTERNOON)).toBe('06/10/2026');
    expect(fmtDate(choosing(wording('sk'), 'dmy_dot', null), null), 'no date is still a dash').toBe('—');
  });

  it('writes the clock chosen: 24 hours two digits wide, or 12 with the language’s words for am and pm', () => {
    expect(fmtClock(choosing(wording('en'), null, '24'), MORNING)).toBe('09:05');
    expect(fmtClock(choosing(wording('en'), null, '12'), AFTERNOON)).toBe('2:05 pm');
    expect(fmtClock(choosing(wording('en'), null, '12'), MORNING)).toBe('9:05 am');
    expect(fmtClock(choosing(wording('sk'), null, '12'), AFTERNOON)).toBe('2:05 PM');
    expect(fmtClock(choosing(wording('sk'), null, '24'), AFTERNOON)).toBe('14:05');
  });

  it('puts the date and the time side by side when either is chosen, the other as the language writes it', () => {
    const en = wording('en');
    expect(fmtDateTime(choosing(en, 'mdy_slash', '12'), AFTERNOON)).toBe('10/06/2026 2:05 pm');
    expect(fmtDateTime(choosing(en, 'ymd_dash', null), new Date(AFTERNOON).toISOString())).toBe('2026-10-06 14:05');
    expect(fmtDateTime(choosing(en, null, '12'), AFTERNOON)).toBe('6 Oct 2026 2:05 pm');
    expect(fmtDateTime(choosing(wording('sk'), 'dmy_dot', null), AFTERNOON)).toBe('6.10.2026 14:05');
    expect(fmtDateTime(choosing(en, null, null), AFTERNOON), 'nothing chosen: the language’s own, as before').toBe('6 Oct 2026, 14:05');
  });

  it('marks an hour on a chart: two digits, or on the 12-hour clock with the language’s am and pm', () => {
    expect(fmtHour(wording('en'), AFTERNOON)).toBe('14');
    expect(fmtHour(choosing(wording('en'), 'ymd_dash', '24'), MORNING)).toBe('09');
    expect(fmtHour(choosing(wording('en'), null, '12'), AFTERNOON)).toBe('2 pm');
    expect(fmtHour(choosing(wording('sk'), null, '12'), MORNING)).toBe('9 AM');
  });

  it('gives the weekday the clock chosen, and leaves a weekday alone', () => {
    expect(fmtWeekdayClock(choosing(wording('en'), null, '12'), AFTERNOON)).toBe('Tue 2:05 pm');
    expect(fmtWeekdayClock(choosing(wording('sk'), null, '12'), AFTERNOON)).toBe('ut 2:05 PM');
    expect(fmtWeekdayClock(choosing(wording('en'), 'ymd_dash', null), AFTERNOON), 'a date order has no say in it').toBe('Tue 14:05');
    expect(fmtWeekday(choosing(wording('en'), 'ymd_dash', '12'), AFTERNOON)).toBe('Tue');
    expect(fmtWeekdayOf(choosing(wording('sk'), 'ymd_dash', '12'), '2026-10-06')).toBe('ut');
  });

  it('writes the admin panel’s moments in English, or in the order and on the clock chosen', () => {
    const none = { dateFormat: () => null, timeFormat: () => null };
    expect(fmtAdminMoment(none, AFTERNOON)).toBe(new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(AFTERNOON));
    expect(fmtAdminMoment({ dateFormat: () => 'dmy_slash', timeFormat: () => '12' }, AFTERNOON)).toBe('06/10/2026 2:05 pm');
    expect(fmtAdminMoment({ dateFormat: () => null, timeFormat: () => '24' }, MORNING)).toBe('6 Oct 2026 09:05');
    expect(fmtAdminMoment({ dateFormat: () => 'ymd_dash', timeFormat: () => null }, MORNING)).toBe('2026-10-06 09:05');
  });
});
