import { ApplicationRef, Provider, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { AuthService } from './core/auth/auth.service';
import { ChangelogService } from './core/changelog/changelog.service';
import { TranslationService } from './core/i18n/translation.service';
import { provideTestTranslations } from './core/testing/test-translations';
import { KanjiStateService } from './kanji/kanji-state.service';

const ENGLISH = { 'topbar.exam': 'Exam', 'language.button': 'Language: {name}' };
const SLOVAK = { 'topbar.exam': 'Skúška', 'language.button': 'Jazyk: {name}' };

/** The page around every screen, on a copy without sign-in that has started, with this many reviews due. */
async function draw(providers: Provider[] = [], due = 0): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: KanjiStateService, useValue: { reviewsDue: signal(due) } }, ...providers],
  });
  TestBed.inject(ChangelogService).load = () => Promise.resolve(); // no version button: it has a spec of its own
  globalThis.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ mode: 'none' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))) as unknown as typeof fetch;
  await TestBed.inject(AuthService).init();
  const fixture = TestBed.createComponent(AppComponent);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

function links(el: HTMLElement): (string | undefined)[] {
  return Array.from(el.querySelectorAll('.topnav nav a')).map((a) => a.textContent?.trim());
}

describe('AppComponent: the top bar’s words', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it('with no strings (the bar is drawn whatever became of them): the English it keeps — never a key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const el = await draw();
    expect(links(el)).toEqual(['Kanji', 'Exam']);
    expect(el.querySelector('.topnav nav a[href="/exam"]'), 'the link the browser suites click').not.toBeNull();
    expect(el.querySelector('.topnav a.brand')?.textContent).toBe('日Japanese Academy');
    expect(el.querySelector('.topnav .brand .mark')?.getAttribute('lang')).toBe('ja');
    expect(warn).not.toHaveBeenCalled();
  });

  it('in the language on the page: the exam is worded, the term "Kanji" and the app’s name are what they are everywhere', async () => {
    const el = await draw([provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })], 125);
    expect(links(el)).toEqual(['Kanji125', 'Skúška']);
    expect(el.querySelector('#navDue')?.textContent).toBe('125');
    expect(el.querySelector('.topnav a.brand')?.textContent).toBe('日Japanese Academy');

    await TestBed.inject(TranslationService).setLanguage('en', false);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(links(el)).toEqual(['Kanji125', 'Exam']);
  });

  it('the sections show only while the app can be used: a copy that is not set up has the name and nothing to follow', async () => {
    const el = await draw();
    TestBed.inject(AuthService).notSetUp(null);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(links(el)).toEqual([]);
    expect(el.querySelector('#not-set-up')).not.toBeNull();
    expect(el.querySelector('.topnav a.brand')?.textContent).toBe('日Japanese Academy');
  });
});
