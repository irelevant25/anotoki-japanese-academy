import { ApplicationRef, Provider, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { AuthService } from './core/auth/auth.service';
import { ChangelogService } from './core/changelog/changelog.service';
import { TranslationService } from './core/i18n/translation.service';
import { provideTestTranslations } from './core/testing/test-translations';
import { KanjiStateService } from './kanji/kanji-state.service';

const ENGLISH = { 'topbar.exam': 'Exam', 'language.button': 'Language: {name} ({code})' };
const SLOVAK = { 'topbar.exam': 'Skúška', 'language.button': 'Jazyk: {name} ({code})' };

/** These specs' own client id: the SDK's storage listeners of other specs never hear their tabs. */
const CLIENT = 'academy-test-app';
const KEY = `anotoki-auth:${CLIENT}`;

/** A signed-in session as the SDK keeps it, for IAM user 7. */
function session(): string {
  return JSON.stringify({
    access_token: 'token-of-7',
    access_expires_at: Date.now() + 3_600_000,
    refresh_token: 'refresh-of-7',
    id_token: null,
    user: { sub: '7', preferred_username: 'hana', email: null, email_verified: false, locale: null, roles: [] },
    updated_at: Date.now(),
  });
}

/**
 * The page around every screen, once the app has started — signed in, unless
 * `signedIn` says not — with this many reviews due; `config`: more of what
 * the server relays (loginRequired false: sign-in not required here).
 */
async function draw(providers: Provider[] = [], due = 0, signedIn = true, config: Record<string, unknown> = {}): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: KanjiStateService, useValue: { reviewsDue: signal(due) } }, ...providers],
  });
  TestBed.inject(ChangelogService).load = () => Promise.resolve(); // no version button: it has a spec of its own
  if (signedIn) {
    localStorage.setItem(KEY, session());
  } else {
    localStorage.removeItem(KEY);
  }
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(new Response(JSON.stringify({ issuer: 'https://iam.test', clientId: CLIENT, ...config }), { status: 200, headers: { 'Content-Type': 'application/json' } })),
  ) as unknown as typeof fetch;
  await TestBed.inject(AuthService).init();
  const fixture = TestBed.createComponent(AppComponent);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function links(el: HTMLElement): (string | undefined)[] {
  return Array.from(el.querySelectorAll('app-top-bar .topbar-nav a')).map((a) => a.textContent?.replace(/\s+/g, ' ').trim());
}

describe('AppComponent: the bar above, the foot below — in every state', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    localStorage.removeItem(KEY);
    vi.restoreAllMocks();
  });

  it('with no strings (the bar is drawn whatever became of them): the English it keeps — never a key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const el = await draw();
    expect(el.firstElementChild?.tagName.toLowerCase(), 'the bar first').toBe('app-top-bar');
    expect(el.lastElementChild?.tagName.toLowerCase(), 'the foot last').toBe('footer');
    expect(el.querySelector('footer app-version')).not.toBeNull();
    expect(links(el)).toEqual(['Kanji', 'Exam']);
    expect(el.querySelector('app-top-bar a[href="/exam"]'), 'the link the browser suites click').not.toBeNull();
    expect(Array.from(el.querySelectorAll('app-brand .wordmark > span')).map((span) => span.textContent)).toEqual(['anotoki', 'Japanese']);
    expect(warn).not.toHaveBeenCalled();
  });

  it('in the language on the page: the exam is worded, the term “Kanji” and the app’s name are what they are everywhere', async () => {
    const el = await draw([provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })], 125);
    expect(links(el)).toEqual(['Kanji 125', 'Skúška']);
    expect(el.querySelector('#navDue')?.textContent).toBe('125');

    await TestBed.inject(TranslationService).setLanguage('en', false);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(links(el)).toEqual(['Kanji 125', 'Exam']);
  });

  it('the sections show only while the app can be used: a copy that is not set up has the bar, the foot and nothing to follow', async () => {
    const el = await draw();
    TestBed.inject(AuthService).notSetUp(null);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(links(el)).toEqual([]);
    expect(el.querySelector('#not-set-up')).not.toBeNull();
    expect(el.querySelector('app-top-bar app-brand')).not.toBeNull();
    expect(el.querySelector('footer app-version')).not.toBeNull();
  });
});

describe('AppComponent: nobody signed in', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    localStorage.removeItem(KEY);
    vi.restoreAllMocks();
  });

  it('on the way to the IAM (the guard sends every page there): nothing of the app, and no Sign in card either', async () => {
    const el = await draw([], 0, false);
    expect(TestBed.inject(AuthService).state()).toBe('signed-out');
    expect(el.querySelector('#signin')).toBeNull();
    expect(el.querySelector('router-outlet')).toBeNull();
    expect(links(el)).toEqual([]);
  });

  it('a session that ends while the page is open (a sign-out in another tab): the Sign in card stands in for the app', async () => {
    const el = await draw();
    expect(el.querySelector('router-outlet')).not.toBeNull();
    localStorage.removeItem(KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: KEY }));
    await TestBed.inject(ApplicationRef).whenStable();
    expect(el.querySelector('#signin')).not.toBeNull();
    expect(el.querySelector('router-outlet')).toBeNull();
    expect(links(el), 'nothing to follow that would load data').toEqual([]);
  });

  it('a sign-in that came back without one: the card, so the browser does not go round to the IAM and back for ever', async () => {
    const el = await draw([], 0, false);
    TestBed.inject(AuthService).signInError.set({ code: 'access_denied' });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(el.querySelector('#signin')).not.toBeNull();
  });

  it('nobody signed in where sign-in is not required: the app itself, for a visitor — its sections, and Sign in in the bar; no card', async () => {
    const el = await draw([], 0, false, { loginRequired: false });
    expect(TestBed.inject(AuthService).state()).toBe('visiting');
    expect(el.querySelector('router-outlet')).not.toBeNull();
    expect(el.querySelector('#signin')).toBeNull();
    expect(links(el)).toEqual(['Kanji', 'Exam']);
    expect(el.querySelector('#signInButton')).not.toBeNull();
    expect(el.querySelector('#signInFailed')).toBeNull();
  });

  it('visiting after a sign-in that came back without one (access_denied: the IAM turned the account away): said above the page, until closed — never swallowed', async () => {
    const el = await draw([], 0, false, { loginRequired: false });
    TestBed.inject(AuthService).signInError.set({ code: 'access_denied' });
    await TestBed.inject(ApplicationRef).whenStable();
    const failed = el.querySelector('#signInFailed');
    expect(failed?.getAttribute('role')).toBe('alert');
    expect(failed?.querySelector('p')?.textContent?.trim()).toBe('Signing in was not completed. Try again.');
    expect(el.querySelector('router-outlet'), 'the page goes on, for a visitor').not.toBeNull();
    el.querySelector<HTMLButtonElement>('#signInFailedClose')!.click();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(el.querySelector('#signInFailed')).toBeNull();
  });
});
