import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { TranslationService } from '../../core/i18n/translation.service';
import { provideTestTranslations } from '../../core/testing/test-translations';
import { NotSetUpComponent } from './not-set-up.component';

describe('NotSetUpComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));

  it('points at the setup page, and says why when the server told this computer', async () => {
    TestBed.inject(AuthService).notSetUpReason.set('backend/config/database.local.php is missing');
    const fixture = TestBed.createComponent(NotSetUpComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a.btn')?.getAttribute('href')).toBe('/setup.php');
    expect(el.textContent).toContain('not set up yet');
    expect(el.textContent).toContain('Why: backend/config/database.local.php is missing.');
  });

  it('keeps the reason to itself when there is none (a website)', async () => {
    const fixture = TestBed.createComponent(NotSetUpComponent);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Why:');
  });

  it('with no strings — they live in the database this page is about — it reads in the English it keeps, word for word, and never shows a key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    TestBed.inject(AuthService).notSetUpReason.set('backend/config/auth.local.php is missing');
    const fixture = TestBed.createComponent(NotSetUpComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const paragraphs = Array.from(el.querySelectorAll('p')).map((p) => p.textContent?.replace(/\s+/g, ' ').trim());
    expect(paragraphs).toEqual([
      'Japanese Academy is not set up yet. Its settings or its database are missing, so there is nothing to study with.',
      'The setup page asks for the database and how people sign in, then builds everything the app needs.',
      'Why: backend/config/auth.local.php is missing.',
    ]);
    expect(el.querySelector('p b')?.textContent).toBe('Japanese Academy is not set up yet.');
    expect(el.querySelector('a.btn')?.textContent?.trim()).toBe('Open the setup page');
    expect(el.textContent).not.toContain('boot.');
    expect(warn, 'and asks for no string it cannot have').not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('marks the server’s clause as English and the mark as Japanese, whatever the page is in', async () => {
    TestBed.inject(AuthService).notSetUpReason.set('backend/config/database.local.php is missing');
    const fixture = TestBed.createComponent(NotSetUpComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const reason = el.querySelector('p.small span[lang]');
    expect(reason?.getAttribute('lang')).toBe('en');
    expect(reason?.textContent).toBe('backend/config/database.local.php is missing');
    expect(el.querySelector('h1 .mark')?.getAttribute('lang')).toBe('ja');
  });
});

describe('NotSetUpComponent: with the strings the browser kept from an earlier visit', () => {
  const ENGLISH = {
    'boot.notSetUp.title': 'Japanese Academy is not set up yet.',
    'boot.notSetUp.text': 'Its settings or its database are missing, so there is nothing to study with.',
    'boot.notSetUp.setup': 'The setup page asks for the database and how people sign in, then builds everything the app needs.',
    'boot.notSetUp.open': 'Open the setup page',
    'boot.notSetUp.why': 'Why: {reason}.',
  };
  const SLOVAK = {
    'boot.notSetUp.title': 'Aplikácia Japanese Academy ešte nie je nastavená.',
    'boot.notSetUp.text': 'Chýbajú jej nastavenia alebo databáza, takže sa zatiaľ nie je z čoho učiť.',
    'boot.notSetUp.setup': 'Stránka nastavenia sa spýta na databázu a na spôsob prihlasovania a potom pripraví všetko, čo aplikácia potrebuje.',
    'boot.notSetUp.open': 'Otvoriť stránku nastavenia',
    'boot.notSetUp.why': 'Dôvod: {reason}.',
  };

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })] }));

  it('reads in that language — the server’s clause stays English, and says so — and follows the language when it changes', async () => {
    TestBed.inject(AuthService).notSetUpReason.set('backend/config/database.local.php is missing');
    const fixture = TestBed.createComponent(NotSetUpComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('p b')?.textContent).toBe('Aplikácia Japanese Academy ešte nie je nastavená.');
    expect(el.querySelector('a.btn')?.textContent?.trim()).toBe('Otvoriť stránku nastavenia');
    expect(el.querySelector('a.btn')?.getAttribute('href')).toBe('/setup.php');
    expect(el.querySelector('p.small')?.textContent?.trim()).toBe('Dôvod: backend/config/database.local.php is missing.');
    expect(el.querySelector('p.small span')?.getAttribute('lang')).toBe('en');
    expect(el.textContent).not.toContain('not set up yet');

    await TestBed.inject(TranslationService).setLanguage('en', false);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(el.querySelector('p b')?.textContent).toBe('Japanese Academy is not set up yet.');
    expect(el.querySelector('p.small')?.textContent?.trim()).toBe('Why: backend/config/database.local.php is missing.');
  });
});
