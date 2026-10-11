import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { AuthService, StartProblem } from '../../core/auth/auth.service';
import { ProblemComponent } from './problem.component';
import { provideAuth } from '../../core/auth/auth.config';

/** The problem page for a start that failed this way; `admin`: the person signed in is an administrator. */
async function draw(problem: StartProblem, admin = false): Promise<HTMLElement> {
  const auth = TestBed.inject(AuthService);
  Object.defineProperty(auth, 'isAdmin', { value: () => admin });
  auth.cannotStart(problem);
  const fixture = TestBed.createComponent(ProblemComponent);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

/** What the alert says, the small reason under it aside. */
function said(el: HTMLElement): string {
  const alert = el.querySelector('.err')!.cloneNode(true) as HTMLElement;
  alert.querySelector('.detail')?.remove();
  return alert.textContent?.trim() ?? '';
}

describe('ProblemComponent: with no strings, in the English it keeps', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAuth()] });
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    expect(warn, 'a page without strings asks for none').not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a server that does not answer: what happened, never a blank page or "[object Object]"', async () => {
    const el = await draw({ kind: 'offline' });
    expect(said(el)).toBe('Japanese Academy could not start: The server does not answer.');
    expect(el.querySelector('.err')?.getAttribute('role')).toBe('alert');
    expect(el.querySelector('.detail')).toBeNull();
    expect(el.querySelector('button')?.textContent?.trim()).toBe('Try again');
    expect(el.textContent).not.toContain('[object');
  });

  it('a server that refuses: worded from its code, never from its sentence', async () => {
    const el = await draw({ kind: 'server', status: 503, code: 'database_unavailable', detail: null });
    expect(said(el)).toBe('Japanese Academy could not start: The database is not reachable.');
    expect(el.querySelector('.detail')).toBeNull();
  });

  it('the reason the server gives the owner’s own computer comes after the page’s words, small, and marked as English', async () => {
    const el = await draw({ kind: 'server', status: 503, code: 'not_up_to_date', detail: '004_languages_and_translations.sql: relation "languages" already exists' });
    expect(said(el)).toBe(
      "Japanese Academy could not start: The database is not up to date with this version of the app yet: an administrator has to apply the update first. Try again later.",
    );
    const detail = el.querySelector('.err .detail');
    expect(detail?.textContent).toBe('004_languages_and_translations.sql: relation "languages" already exists');
    expect(detail?.getAttribute('lang')).toBe('en');
  });

  it('each failure a start can meet has its sentence', async () => {
    const cases: [StartProblem, string][] = [
      [{ kind: 'server', status: 503, code: 'database_unavailable', detail: null }, 'The database is not reachable.'],
      [{ kind: 'server', status: 500, code: 'server_error', detail: null }, 'Something went wrong on the server.'],
      // an answer that was not the API's own: a proxy's page
      [{ kind: 'server', status: 502, code: 'http_502', detail: null }, 'The server answered with an error (502).'],
      // a code the page keeps no English for, and one nobody listed: the general sentence, never the code or a key
      [{ kind: 'server', status: 404, code: 'not_found', detail: null }, 'Something went wrong.'],
      [{ kind: 'server', status: 418, code: 'teapot', detail: null }, 'Something went wrong.'],
    ];
    for (const [problem, reason] of cases) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAuth()] });
      const el = await draw(problem);
      expect(said(el), problem.kind === 'server' ? problem.code : problem.kind).toBe(`Japanese Academy could not start: ${reason}`);
    }
  });

  it('only what happened, and Try again — never a way to the Migrations page: a site being updated shows the anotoki library’s page instead, which has it for an administrator', async () => {
    for (const [problem, admin] of [
      [{ kind: 'server', status: 503, code: 'not_up_to_date', detail: null }, true],
      [{ kind: 'server', status: 503, code: 'database_unavailable', detail: null }, true],
      [{ kind: 'offline' }, false],
    ] as [StartProblem, boolean][]) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAuth()] });
      const el = await draw(problem, admin);
      expect(el.querySelector('a'), JSON.stringify([problem, admin])).toBeNull();
      expect(Array.from(el.querySelectorAll('button'), (button) => button.textContent?.trim())).toEqual(['Try again']);
    }
  });

  it('a sign-in that could not be set up: the page’s own sentence, then the SDK’s message as the English it is', async () => {
    const el = await draw({ kind: 'signIn', detail: 'createAuth: issuer must be an https URL' });
    expect(said(el)).toBe('Japanese Academy could not start: Signing in could not be set up.');
    expect(el.querySelector('.detail')?.textContent).toBe('createAuth: issuer must be an https URL');
    expect(el.querySelector('.detail')?.getAttribute('lang')).toBe('en');
  });
});

describe('ProblemComponent: with the strings the browser kept from an earlier visit', () => {
  const ENGLISH = {
    'boot.problem.couldNotStart': 'Japanese Academy could not start: {reason}',
    'boot.problem.signIn': 'Signing in could not be set up.',
    'common.tryAgain': 'Try again',
    'error.offline': 'The server does not answer.',
    'error.http': 'The server answered with an error ({status}).',
    'error.unknown': 'Something went wrong.',
    'error.not_found': 'Not found.',
    'error.not_up_to_date': "The database is not up to date with this version of the app yet: an administrator has to apply the update first. Try again later.",
  };
  const SLOVAK = {
    'boot.problem.couldNotStart': 'Aplikáciu Japanese Academy sa nepodarilo spustiť: {reason}',
    'boot.problem.signIn': 'Prihlasovanie sa nepodarilo pripraviť.',
    'common.tryAgain': 'Skúsiť znova',
    'error.offline': 'Server neodpovedá.',
    'error.http': 'Server odpovedal chybou ({status}).',
    'error.unknown': 'Niečo sa pokazilo.',
    'error.not_found': 'Nenašlo sa.',
    'error.not_up_to_date': 'Databáza ešte nie je zosúladená s touto verziou aplikácie: najprv ju musí aktualizovať administrátor. Skús to neskôr.',
  };

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAuth(), provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })] }));

  it('reads in that language, the detail still English, and follows the language when it changes', async () => {
    const el = await draw({ kind: 'server', status: 503, code: 'not_up_to_date', detail: 'the migration 004 failed' });
    expect(said(el)).toBe(
      'Aplikáciu Japanese Academy sa nepodarilo spustiť: Databáza ešte nie je zosúladená s touto verziou aplikácie: najprv ju musí aktualizovať administrátor. Skús to neskôr.',
    );
    expect(el.querySelector('.detail')?.textContent).toBe('the migration 004 failed');
    expect(el.querySelector('.detail')?.getAttribute('lang')).toBe('en');
    expect(el.querySelector('button')?.textContent?.trim()).toBe('Skúsiť znova');

    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(said(el)).toBe(
      "Japanese Academy could not start: The database is not up to date with this version of the app yet: an administrator has to apply the update first. Try again later.",
    );
    expect(el.querySelector('button')?.textContent?.trim()).toBe('Try again');
  });

  it('words the other kinds from the strings too: no answer, a status alone, a code the page keeps no English for', async () => {
    expect(said(await draw({ kind: 'offline' }))).toBe('Aplikáciu Japanese Academy sa nepodarilo spustiť: Server neodpovedá.');
    for (const [problem, reason] of [
      [{ kind: 'server', status: 502, code: 'http_502', detail: null }, 'Server odpovedal chybou (502).'],
      [{ kind: 'server', status: 404, code: 'not_found', detail: null }, 'Nenašlo sa.'],
      [{ kind: 'signIn', detail: null }, 'Prihlasovanie sa nepodarilo pripraviť.'],
    ] as [StartProblem, string][]) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAuth(), provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })] });
      expect(said(await draw(problem))).toBe(`Aplikáciu Japanese Academy sa nepodarilo spustiť: ${reason}`);
    }
  });
});
