import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { AuthService } from '../auth/auth.service';
import { AnotokiPreferences } from '../auth/sdk/anotoki-auth';
import { fmtDateTime, fmtIn } from '../format';
import { TimeWording } from './time-wording';

describe('TimeWording: the words of the page, and the date order and clock of the anotoki account', () => {
  // A local time, so the day and the clock are the same in every time zone the tests run in: Tuesday 6 October 2026.
  const MOMENT = new Date(2026, 9, 6, 14, 5).getTime();

  it('words a time in the language on the page, in the order and on the clock the account chose - and follows a change of either', async () => {
    const preferences = signal<AnotokiPreferences | null>(null);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideTestTranslations({ 'time.now': 'teraz' }, { language: 'sk', english: { 'time.now': 'now' } }),
        { provide: AuthService, useValue: { preferences } },
      ],
    });
    const wording = TestBed.inject(TimeWording);

    // Nobody signed in, or nothing chosen: the language's own way.
    expect([wording.t('time.now'), wording.locale(), wording.dateFormat(), wording.timeFormat()]).toEqual(['teraz', 'sk-SK', null, null]);
    expect(fmtDateTime(wording, MOMENT)).toBe('6. 10. 2026, 14:05');
    expect(fmtIn(wording, MOMENT - 1, MOMENT)).toBe('teraz');

    // The account's choice, made on any anotoki site, as it arrives.
    preferences.set({ theme: 'auto', date_format: 'ymd_dash', time_format: '12' });
    expect([wording.dateFormat(), wording.timeFormat()]).toEqual(['ymd_dash', '12']);
    expect(fmtDateTime(wording, MOMENT)).toBe('2026-10-06 2:05 PM');

    // And the language, as it changes.
    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    expect([wording.t('time.now'), wording.locale()]).toEqual(['now', 'en-GB']);
    expect(fmtDateTime(wording, MOMENT)).toBe('2026-10-06 2:05 pm');
  });
});
