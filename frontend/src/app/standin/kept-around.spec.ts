import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslationService } from '../core/i18n/translation.service';
import { provideTestTranslations } from '../core/testing/test-translations';
import { keptAround } from './kept-around';

describe('keptAround: a sentence cut at one placeholder, for what is drawn with or without strings', () => {
  it('with no strings at all: the English written in the code, cut and filled — never the key', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const i18n = TestBed.inject(TranslationService);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(keptAround(i18n, 'boot.notSetUp.why', 'Why: {reason}.', 'reason')).toEqual(['Why: ', '.', true]);
    expect(keptAround(i18n, 'account.signedInAs', 'Signed in as {name}', 'name')).toEqual(['Signed in as ', '', true]);
    // the other placeholders are filled in each half; what fills them is never cut at
    expect(keptAround(i18n, 'example.line', '{who}: {what} ({who})', 'what', { who: '{what}' })).toEqual(['{what}: ', ' ({what})', true]);
    // English that does not name the placeholder: the whole sentence, and nothing to draw in the middle
    expect(keptAround(i18n, 'example.plain', 'Nothing to cut, {n} times.', 'reason', { n: 2 })).toEqual(['Nothing to cut, 2 times.', '', false]);
    expect(warn, 'a page without strings does not complain about them').not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('with strings: the string of the language on the page, cut where that language names the placeholder', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideTestTranslations(
          { 'boot.notSetUp.why': 'Dôvod: {reason}.', 'example.left': 'Tu sa nič nevkladá.' },
          { language: 'sk', english: { 'boot.notSetUp.why': 'Why: {reason}.', 'example.left': 'Here: {reason}' } },
        ),
      ],
    });
    const i18n = TestBed.inject(TranslationService);

    expect(keptAround(i18n, 'boot.notSetUp.why', 'Why: {reason}.', 'reason')).toEqual(['Dôvod: ', '.', true]);
    // a language may leave the placeholder out: its sentence whole, and the value is not drawn
    expect(keptAround(i18n, 'example.left', 'Here: {reason}', 'reason')).toEqual(['Tu sa nič nevkladá.', '', false]);

    await i18n.setLanguage('en', false);
    expect(keptAround(i18n, 'boot.notSetUp.why', 'Why: {reason}.', 'reason')).toEqual(['Why: ', '.', true]);
  });
});
