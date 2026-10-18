import { ApplicationRef, EnvironmentProviders, Provider, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { provideAuth } from '../auth/auth.config';
import { provideKit } from '../kit.config';
import { provideKitEnglish } from '../testing/kit-english';
import { ChangelogDialogComponent } from './changelog-dialog.component';
import { ChangelogEntry, ChangelogService } from './changelog.service';

const ENTRIES: ChangelogEntry[] = [
  { version: '0.2.0', date: '2026-10-06', changes: { added: ['A setup page'], fixed: ['A missing space'] } },
  { version: '0.1.0', date: '2026-09-29', changes: { updated: ['Sign-in'] } },
];

/** The app with these entries for its changelog, and whatever else a test provides (its strings). */
function setUp(providers: (Provider | EnvironmentProviders)[] = []): void {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideAuth(), ...providers] });
  TestBed.inject(ChangelogService).entries.set(ENTRIES);
}

/** The dialog, opened as the footer's What's new opens it (AppComponent), and its <dialog>. */
async function opened(): Promise<{ fixture: ComponentFixture<ChangelogDialogComponent>; el: HTMLElement; dialog: HTMLDialogElement }> {
  const fixture = TestBed.createComponent(ChangelogDialogComponent);
  const el = fixture.nativeElement as HTMLElement;
  document.body.appendChild(el);
  await fixture.whenStable();
  expect(el.querySelector('dialog'), 'nothing drawn until it is opened').toBeNull();
  fixture.componentInstance.open();
  await fixture.whenStable();
  return { fixture, el, dialog: el.querySelector('dialog') as HTMLDialogElement };
}

/** A release's date as the language writes it: what the dialog must show, whatever the system's locale is. */
function written(locale: string, year: number, month: number, day: number): string {
  return new Date(year, month - 1, day, 12).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

describe('ChangelogDialogComponent: What’s new, the app’s own - the family’s footer opens it', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('every release over the page, the newest first and marked so, nothing of it kept in the browser', async () => {
    setUp();
    const before = localStorage.length;
    const { dialog } = await opened();
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.textContent).toContain('v0.2.0');
    expect(dialog.textContent).toContain('A setup page');
    expect(dialog.querySelectorAll('.release').length).toBe(2);
    expect(Array.from(dialog.querySelectorAll('anotoki-badge')).length, 'the newest alone is marked').toBe(1);
    expect(localStorage.length, 'no news is marked read: nothing kept').toBe(before);
  });

  it('with no strings (it opens wherever the footer is, the problem page too): its frame in the English it keeps, word for word, and no key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setUp();
    const { dialog } = await opened();
    expect(dialog.querySelector('.anotoki-dialog__title')?.textContent).toBe('What’s new');
    expect(dialog.querySelector('.anotoki-dialog__close')?.getAttribute('aria-label'), 'the kit’s Close, in the kit’s words').toBe('Close');
    expect(Array.from(dialog.querySelectorAll('anotoki-badge')).map((tag) => tag.textContent)).toEqual(['latest']);
    expect(Array.from(dialog.querySelectorAll('h3')).map((h) => [h.className, h.textContent])).toEqual([
      ['added', 'Added'],
      ['fixed', 'Fixed'],
      ['updated', 'Changed'],
    ]);
    expect(Array.from(dialog.querySelectorAll('.vdate')).map((date) => date.textContent)).toEqual([written('en-GB', 2026, 10, 6), written('en-GB', 2026, 9, 29)]);
    expect(warn, 'a dialog without strings asks for none').not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('in the language on the page: the frame and the dates are, the entries stay English and say so', async () => {
    const ENGLISH = {
      'whatsNew.title': 'What’s new',
      'whatsNew.latest': 'latest',
      'whatsNew.added': 'Added',
      'whatsNew.changed': 'Changed',
      'whatsNew.fixed': 'Fixed',
      'anotoki.ui.close': 'Close',
    };
    const SLOVAK = {
      'whatsNew.title': 'Čo je nové',
      'whatsNew.latest': 'najnovšie',
      'whatsNew.added': 'Pridané',
      'whatsNew.changed': 'Zmenené',
      'whatsNew.fixed': 'Opravené',
      'anotoki.ui.close': 'Zavrieť',
    };
    // the kit wired as the app wires it (core/kit.config.ts): its Close in the database's words, anotoki.ui.close
    setUp([provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }), provideKitEnglish(), provideKit()]);
    const { dialog } = await opened();
    expect(dialog.querySelector('.anotoki-dialog__title')?.textContent).toBe('Čo je nové');
    const close = dialog.querySelector('.anotoki-dialog__close') as HTMLButtonElement;
    expect([close.getAttribute('aria-label'), close.title, close.getAttribute('lang')], 'the kit’s Close, in the language on the page').toEqual(['Zavrieť', 'Zavrieť', null]);
    expect(dialog.querySelector('anotoki-badge')?.textContent).toBe('najnovšie');
    expect(Array.from(dialog.querySelectorAll('h3')).map((h) => h.textContent)).toEqual(['Pridané', 'Opravené', 'Zmenené']);
    expect(Array.from(dialog.querySelectorAll('.vnum')).map((version) => version.firstChild?.textContent), 'the version itself is the same everywhere').toEqual(['v0.2.0', 'v0.1.0']);
    expect(Array.from(dialog.querySelectorAll('.vdate')).map((date) => date.textContent)).toEqual([written('sk-SK', 2026, 10, 6), written('sk-SK', 2026, 9, 29)]);
    expect(written('sk-SK', 2026, 10, 6), 'Slovak writes a date otherwise than English').not.toBe(written('en-GB', 2026, 10, 6));

    // What changed is written in English (public/changelog.json) and stays so: each list says which language it is in.
    const lists = Array.from(dialog.querySelectorAll('ul'));
    expect(lists).toHaveLength(3);
    expect(lists.every((list) => list.getAttribute('lang') === 'en')).toBe(true);
    expect(Array.from(dialog.querySelectorAll('li')).map((line) => line.textContent)).toEqual(['A setup page', 'A missing space', 'Sign-in']);

    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(dialog.querySelector('.anotoki-dialog__title')?.textContent).toBe('What’s new');
    expect(close.getAttribute('aria-label')).toBe('Close');
    expect(dialog.querySelector('.vdate')?.textContent).toBe(written('en-GB', 2026, 10, 6));
  });

  it('closes on its button', async () => {
    setUp();
    const { el, dialog } = await opened();
    expect(dialog.hasAttribute('open')).toBe(true);
    (dialog.querySelector('.anotoki-dialog__close') as HTMLButtonElement).click();
    await TestBed.inject(ApplicationRef).whenStable();
    expect(el.querySelector('dialog'), 'closed: the kit’s dialog is gone').toBeNull();
    expect(dialog.hasAttribute('open')).toBe(false);
  });

  it('keeps every key pressed in it from the page - where the reviews and the exam listen: Enter on its Close hands no paper in', async () => {
    setUp();
    const { dialog } = await opened();
    const reached: string[] = [];
    const onDocument = (event: KeyboardEvent): void => void reached.push(event.key);
    document.addEventListener('keydown', onDocument);
    try {
      for (const target of [dialog, dialog.querySelector('.anotoki-dialog__close'), dialog.querySelector('li')]) {
        for (const key of ['Enter', ' ', '1', 'f', 'ArrowRight']) {
          target!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        }
      }
      expect(reached).toEqual([]);
    } finally {
      document.removeEventListener('keydown', onDocument);
    }
  });
});
