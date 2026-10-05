import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiError, ApiService } from '../../core/api/api.service';
import { AuthService } from '../../core/auth/auth.service';
import { AdminLanguage, TranslationGrid, TranslationKeyRow } from '../../core/i18n/translation.model';
import { TranslationService } from '../../core/i18n/translation.service';
import { AdminDrafts } from '../admin-drafts.service';
import { TranslationsComponent } from './translations.component';

const ENGLISH: AdminLanguage = { code: 'en', name: 'English', nativeName: 'English', enabled: true, sortOrder: 1, seeded: true };
const SLOVAK: AdminLanguage = { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', enabled: true, sortOrder: 2, seeded: true };

/** A promise the test settles by hand: the server's answer, when the test says. */
function later<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const key = (name: string, values: Record<string, string>, description = ''): TranslationKeyRow => ({ name, description, values });

/** As the server sends it: the keys by name, so a family's forms come few, one, other. */
function grid(changes: Record<string, Record<string, string>> = {}): TranslationGrid {
  const keys = [
    key('common.close', { en: 'Close', sk: 'Zavrieť' }, 'A button that closes what is open.'),
    key('home.items.few', { en: '{count} items', sk: '{count} položky' }, 'How many items. {count} is the number.'),
    key('home.items.one', { en: '{count} item', sk: '{count} položka' }, 'How many items. {count} is the number.'),
    key('home.items.other', { en: '{count} items', sk: '{count} položiek' }, 'How many items. {count} is the number.'),
    key('home.title', { en: 'Study' }, 'Home page: the heading.'),
  ];
  return { languages: [ENGLISH, SLOVAK], keys: keys.map((row) => ({ ...row, values: { ...row.values, ...changes[row.name] } })) };
}

describe('TranslationsComponent', () => {
  let fixture: ComponentFixture<TranslationsComponent>;
  let host: HTMLElement;
  let api: { translationGrid: ReturnType<typeof vi.fn>; saveTranslations: ReturnType<typeof vi.fn>; exportTranslations: ReturnType<typeof vi.fn>; importTranslations: ReturnType<typeof vi.fn> };
  let reloaded: ReturnType<typeof vi.fn>;

  const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
  const text = (selector: string, within: ParentNode = host) => clean(within.querySelector(selector)?.textContent);
  const row = (name: string) => host.querySelector<HTMLElement>(`[id="key-${name}"]`)!;
  const box = (name: string, code: string) => row(name).querySelector<HTMLTextAreaElement>(`textarea[lang="${code}"]`)!;
  const status = () => text('.save-state');
  const button = (label: string) => Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((candidate) => clean(candidate.textContent) === label)!;

  /** Lets the promises of a click run out, then the page draw. */
  async function settle(): Promise<void> {
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
  }

  async function type(element: HTMLTextAreaElement, value: string): Promise<void> {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  /** The question that is open, and the button that answers it. */
  const question = () => text('dialog.confirm h2');
  async function answer(label: string): Promise<void> {
    Array.from(host.querySelectorAll<HTMLButtonElement>('dialog.confirm button'))
      .find((candidate) => clean(candidate.textContent) === label)!
      .click();
    await settle();
  }

  async function page(): Promise<void> {
    api = {
      translationGrid: vi.fn().mockResolvedValue(grid()),
      saveTranslations: vi.fn(),
      exportTranslations: vi.fn(),
      importTranslations: vi.fn(),
    };
    reloaded = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { user: signal({ sub: '7' }), isAdmin: signal(false), subject: () => '7' } },
        { provide: TranslationService, useValue: { reload: reloaded } },
      ],
    });
    fixture = TestBed.createComponent(TranslationsComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle();
  }

  beforeEach(() => {
    sessionStorage.clear();
    // jsdom may lack the modal dialog: open and close are all this needs
    const proto = HTMLDialogElement.prototype as { showModal?: () => void; close?: () => void };
    if (typeof proto.showModal !== 'function') {
      proto.showModal = function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      };
    }
    if (typeof proto.close !== 'function') {
      proto.close = function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      };
    }
  });

  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('is English, shows each key with a box for every language, and a plural family as one block: one, few, other, with their numbers', async () => {
    await page();

    expect(host.querySelector('main')?.getAttribute('lang')).toBe('en');
    expect(text('h1')).toBe('Translations');
    // The admin area's sections are the top bar's links (top-bar.component.spec.ts): the page draws none of its own.
    expect(host.querySelector('a[href^="/admin"]')).toBeNull();
    expect(box('common.close', 'sk').value).toBe('Zavrieť');
    expect(box('home.title', 'sk').placeholder).toBe('Falls back to English');

    const family = host.querySelector('tbody.is-plural')!;
    expect(text('.family code', family)).toBe('home.items');
    expect(Array.from(family.querySelectorAll('.key-name')).map((name) => clean(name.textContent))).toEqual(['home.items.one', 'home.items.few', 'home.items.other']);
    expect(text('.numbers', row('home.items.few').querySelector('td.cell:nth-child(3)')!)).toContain('2');
    expect(Array.from(family.querySelectorAll('.sample[lang="sk"] li')).map((item) => clean(item.textContent))).toEqual(['1 položka', '3 položky', '12 položiek']);
    // Each language as much as it has written, "N / M".
    expect(text('table.languages tbody tr:nth-child(2) .count')).toBe('4 / 5');
  });

  it('saves only what changed, and says so', async () => {
    await page();
    expect(status()).toBe('Everything is saved');

    await type(box('common.close', 'sk'), 'Zatvoriť');
    expect(status()).toBe('1 string changed, not saved yet');
    expect(row('common.close').querySelector('.mark')).not.toBeNull();

    api.saveTranslations.mockResolvedValue(grid({ 'common.close': { sk: 'Zatvoriť' } }));
    button('Save').click();
    await settle();

    expect(api.saveTranslations).toHaveBeenCalledExactlyOnceWith({ 'common.close': { sk: 'Zatvoriť' } });
    expect(status()).toBe('The string is saved.');
    expect(box('common.close', 'sk').value).toBe('Zatvoriť');
    expect(row('common.close').querySelector('.mark')).toBeNull();
    expect(reloaded).toHaveBeenCalled();
    expect(TestBed.inject(AdminDrafts).count()).toBe(0);
  });

  it('puts a refusal beside its key, in the server\'s words, and in the status line', async () => {
    await page();
    await type(box('home.title', 'sk'), 'Uč sa {name}');

    api.saveTranslations.mockRejectedValue(
      new ApiError('The Slovak text uses {name}, which the English one does not have.', 422, { code: 'unknown_placeholder', key: 'home.title', language: 'sk' }),
    );
    button('Save').click();
    await settle();

    expect(text('.err', row('home.title'))).toBe('Nothing was saved. The Slovak text uses {name}, which the English one does not have.');
    expect(box('home.title', 'sk').getAttribute('aria-invalid')).toBe('true');
    expect(status()).toBe('Nothing was saved: see home.title');
    expect(box('home.title', 'sk').value).toBe('Uč sa {name}');

    // Changing the string is the answer to it.
    await type(box('home.title', 'sk'), 'Uč sa');
    expect(row('home.title').querySelector('.err')).toBeNull();
    expect(status()).toBe('1 string changed, not saved yet');
  });

  it('says a failed save in the status line, and typing clears it', async () => {
    await page();
    await type(box('common.close', 'sk'), 'Zatvoriť');

    api.saveTranslations.mockRejectedValue(new ApiError('the server does not answer', 0, {}));
    button('Save').click();
    await settle();

    expect(status()).toBe('Nothing was saved. The server does not answer.');
    expect(box('common.close', 'sk').value).toBe('Zatvoriť');

    await type(box('common.close', 'sk'), 'Zatvor');
    expect(status()).toBe('1 string changed, not saved yet');
  });

  it.each([
    [401, 'sign_in_required', 'Sign in first.'],
    [403, 'staff_only', 'This is for the site\'s editors and administrators.'],
  ])('keeps the boxes when a save is answered %s, and says so', async (code, name, sentence) => {
    await page();
    await type(box('common.close', 'sk'), 'Zatvoriť');

    api.saveTranslations.mockRejectedValue(new ApiError(sentence, code, { code: name, error: sentence }));
    button('Save').click();
    await settle();

    expect(status()).toBe(`Nothing was saved. ${sentence} What you typed is kept.`);
    expect(box('common.close', 'sk').value).toBe('Zatvoriť');
    expect(TestBed.inject(AdminDrafts).strings()).toEqual({ 'common.close': { sk: 'Zatvoriť' } });
  });

  it('keeps what is typed while a save is on its way', async () => {
    await page();
    await type(box('common.close', 'sk'), 'Zatvoriť');

    const answer = later<TranslationGrid>();
    api.saveTranslations.mockReturnValue(answer.promise);
    button('Save').click();
    await settle();
    expect(status()).toBe('Saving…');

    await type(box('common.close', 'sk'), 'Zavri');
    answer.resolve(grid({ 'common.close': { sk: 'Zatvoriť' } }));
    await settle();

    expect(box('common.close', 'sk').value).toBe('Zavri');
    expect(row('common.close').querySelector('.mark')).not.toBeNull();
    expect(TestBed.inject(AdminDrafts).strings()).toEqual({ 'common.close': { sk: 'Zavri' } });
  });

  it('asks before it is left with boxes not saved, and "Leave" gives them up', async () => {
    await page();
    expect(fixture.componentInstance.canLeave()).toBe(true);
    await type(box('common.close', 'sk'), 'Zatvoriť');

    const staying = fixture.componentInstance.canLeave() as Promise<boolean>;
    await settle();
    expect(question()).toBe('Leave without saving?');
    await answer('Stay here');
    await expect(staying).resolves.toBe(false);
    expect(TestBed.inject(AdminDrafts).count()).toBe(1);

    const leaving = fixture.componentInstance.canLeave() as Promise<boolean>;
    await settle();
    await answer('Leave');
    await expect(leaving).resolves.toBe(true);
    expect(TestBed.inject(AdminDrafts).count()).toBe(0);
  });

  it('keeps its keys from the page behind it: a key typed in a box reaches no shortcut', async () => {
    await page();
    const reached: string[] = [];
    const listen = (event: KeyboardEvent) => reached.push(event.key);
    document.addEventListener('keydown', listen);
    try {
      for (const key of ['Enter', 'f', '1', 'ArrowLeft', ' ']) {
        box('common.close', 'sk').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      }
    } finally {
      document.removeEventListener('keydown', listen);
    }
    expect(reached).toEqual([]);
  });
});
