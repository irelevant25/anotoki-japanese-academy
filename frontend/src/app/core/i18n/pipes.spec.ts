import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTestTranslations } from '../testing/test-translations';
import { LocalDatePipe } from './local-date.pipe';
import { TranslatePluralPipe } from './translate-plural.pipe';
import { TranslatePipe } from './translate.pipe';
import { TranslationService } from './translation.service';

const ENGLISH = {
  'home.left': 'Left: {n}',
  'home.lessons.one': '1 lesson',
  'home.lessons.few': '{count} lessons',
  'home.lessons.other': '{count} lessons',
  'home.line': '{items} · {lessons}',
};
const SLOVAK = {
  'home.left': 'Zostáva: {n}',
  'home.lessons.one': '1 lekcia',
  'home.lessons.few': '{count} lekcie',
  'home.lessons.other': '{count} lekcií',
  'home.line': '{items} · {lessons}',
};

function pipes(language: 'en' | 'sk') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      language === 'sk' ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH),
      TranslatePipe,
      TranslatePluralPipe,
      LocalDatePipe,
    ],
  });
  return {
    i18n: TestBed.inject(TranslationService),
    translate: TestBed.inject(TranslatePipe),
    plural: TestBed.inject(TranslatePluralPipe),
    date: TestBed.inject(LocalDatePipe),
  };
}

describe('the translate pipes', () => {
  it('word a key, and fill its placeholders', () => {
    expect(pipes('en').translate.transform('home.left', { n: 7 })).toBe('Left: 7');
    expect(pipes('sk').translate.transform('home.left', { n: 7 })).toBe('Zostáva: 7');
  });

  it('pick the plural form, and a frame takes whole phrases', () => {
    const { translate, plural } = pipes('sk');
    expect(plural.transform('home.lessons', 1)).toBe('1 lekcia');
    expect(plural.transform('home.lessons', 4)).toBe('4 lekcie');
    expect(plural.transform('home.lessons', 5)).toBe('5 lekcií');
    expect(translate.transform('home.line', { items: '12 položiek', lessons: plural.transform('home.lessons', 4) })).toBe('12 položiek · 4 lekcie');
  });

  it('answer again when the language changes under the same key', async () => {
    const { i18n, translate, plural } = pipes('sk');
    expect(translate.transform('home.left', { n: 1 })).toBe('Zostáva: 1');
    expect(await i18n.setLanguage('en', false)).toBe(true);
    expect(translate.transform('home.left', { n: 1 })).toBe('Left: 1');
    expect(plural.transform('home.lessons', 3)).toBe('3 lessons');
  });
});

describe('the localDate pipe', () => {
  // A local time, so the day and the clock are the same in every time zone the tests run in.
  const MOMENT = new Date(2026, 8, 24, 14, 5).getTime();

  it('writes a date, a date with its time, the clock and the weekday the way the language does', () => {
    const en = pipes('en').date;
    expect(en.transform(MOMENT)).toMatch(/^24 Sept? 2026$/);
    expect(en.transform(MOMENT, 'date')).toMatch(/^24 Sept? 2026$/);
    expect(en.transform(MOMENT, 'dateTime')).toMatch(/^24 Sept? 2026, 14:05$/);
    expect(en.transform(MOMENT, 'clock')).toBe('14:05');
    expect(en.transform(MOMENT, 'weekday')).toBe('Thu');

    const sk = pipes('sk').date;
    expect(sk.transform(MOMENT)).toBe('24. 9. 2026');
    expect(sk.transform(MOMENT, 'dateTime')).toBe('24. 9. 2026, 14:05');
    expect(sk.transform(MOMENT, 'clock')).toBe('14:05');
    expect(sk.transform(MOMENT, 'weekday')).toBe('št');
  });

  it('takes the server’s ISO text as the moment it names', () => {
    const iso = new Date(MOMENT).toISOString();
    expect(pipes('en').date.transform(iso, 'clock')).toBe('14:05');
    expect(pipes('sk').date.transform(iso)).toBe('24. 9. 2026');
  });

  it('reads a calendar day as that day here, not as midnight somewhere else', () => {
    expect(pipes('en').date.transform('2026-09-29')).toMatch(/^29 Sept? 2026$/);
    expect(pipes('sk').date.transform('2026-01-01')).toBe('1. 1. 2026');
  });

  it('gives nothing for nothing, and what is not a date back as it came', () => {
    const { date } = pipes('en');
    expect(date.transform(null)).toBe('');
    expect(date.transform(undefined, 'clock')).toBe('');
    expect(date.transform('', 'dateTime')).toBe('');
    expect(date.transform('soon')).toBe('soon');
  });

  it('follows the language without a new value', async () => {
    const { i18n, date } = pipes('sk');
    expect(date.transform(MOMENT, 'weekday')).toBe('št');
    await i18n.setLanguage('en', false);
    expect(date.transform(MOMENT, 'weekday')).toBe('Thu');
  });
});
