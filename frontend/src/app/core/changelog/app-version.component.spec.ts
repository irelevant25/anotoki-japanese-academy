import { ApplicationRef, Provider, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { AppVersionComponent } from './app-version.component';
import { ChangelogEntry, ChangelogService } from './changelog.service';

const ENTRIES: ChangelogEntry[] = [
  { version: '0.2.0', date: '2026-10-06', changes: { added: ['A setup page'], fixed: ['A missing space'] } },
  { version: '0.1.0', date: '2026-09-29', changes: { updated: ['Sign-in'] } },
];

/** The app with these entries for its changelog, and whatever else a test provides (its strings). */
function setUp(providers: Provider[] = []): void {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), ...providers] });
  const changelog = TestBed.inject(ChangelogService);
  changelog.load = () => Promise.resolve(changelog.entries.set(ENTRIES));
}

/** The foot drawn, and the dialog opened from its "What’s new". */
async function opened(): Promise<HTMLElement> {
  const fixture = TestBed.createComponent(AppVersionComponent);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  (el.querySelector('#whatsNew') as HTMLButtonElement).click();
  await fixture.whenStable();
  return el;
}

/** A release's date as the language writes it: what the dialog must show, whatever the system's locale is. */
function written(locale: string, year: number, month: number, day: number): string {
  return new Date(year, month - 1, day, 12).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

describe('AppVersionComponent', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem('academy-changelog-seen');
    } catch {
      // no storage: nothing remembered anyway
    }
    // jsdom may lack the modal dialog: open is all this needs
    const proto = HTMLDialogElement.prototype as { showModal?: () => void };
    if (typeof proto.showModal !== 'function') {
      proto.showModal = function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      };
    }
  });

  it('shows the version, and "What’s new" with a dot until its news is read, which opens the news', async () => {
    setUp();
    const fixture = TestBed.createComponent(AppVersionComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#version')?.textContent?.trim()).toBe('v0.2.0');
    const news = el.querySelector('#whatsNew') as HTMLButtonElement;
    expect(news.textContent?.trim()).toBe('What’s new');
    expect(el.querySelector('#whatsNew .dot')).not.toBeNull();

    news.click();
    await fixture.whenStable();
    const dialog = el.querySelector('dialog.changelog') as HTMLDialogElement;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.textContent).toContain('v0.2.0');
    expect(dialog.textContent).toContain('A setup page');
    expect(dialog.querySelectorAll('.release').length).toBe(2);
    expect(el.querySelector('#whatsNew .dot'), 'read: the dot is gone').toBeNull();
    expect(localStorage.getItem('academy-changelog-seen')).toBe('0.2.0');
  });

  it('news read when its version had two numbers stays read with three: "0.2" read, "0.2.0" has no dot - "0.2.1" has', async () => {
    localStorage.setItem('academy-changelog-seen', '0.2');
    setUp();
    const fixture = TestBed.createComponent(AppVersionComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#version')?.textContent?.trim()).toBe('v0.2.0');
    expect(el.querySelector('#whatsNew .dot'), 'its news read already').toBeNull();

    TestBed.inject(ChangelogService).entries.set([{ version: '0.2.1', date: '2026-10-08', changes: { fixed: ['A fault put right'] } }, ...ENTRIES]);
    await fixture.whenStable();
    expect(el.querySelector('#whatsNew .dot'), 'a newer version: news').not.toBeNull();
  });

  it('with no strings (the foot is drawn whatever became of them): its frame in the English it keeps, word for word, and no key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    setUp();
    const fixture = TestBed.createComponent(AppVersionComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#whatsNew')?.textContent?.trim()).toBe('What’s new');
    expect(el.querySelector('#whatsNew .dot')?.getAttribute('title')).toBe('Something new');

    (el.querySelector('#whatsNew') as HTMLButtonElement).click();
    await fixture.whenStable();
    const dialog = el.querySelector('dialog.changelog') as HTMLDialogElement;
    expect(dialog.querySelector('#changelog-title')?.textContent).toBe('What’s new');
    expect(dialog.querySelector('.head button')?.textContent?.trim()).toBe('Close');
    expect(Array.from(dialog.querySelectorAll('.tag')).map((tag) => tag.textContent)).toEqual(['latest']);
    expect(Array.from(dialog.querySelectorAll('h3')).map((h) => [h.className, h.textContent])).toEqual([
      ['added', 'Added'],
      ['fixed', 'Fixed'],
      ['updated', 'Changed'],
    ]);
    expect(Array.from(dialog.querySelectorAll('.vdate')).map((date) => date.textContent)).toEqual([written('en-GB', 2026, 10, 6), written('en-GB', 2026, 9, 29)]);
    expect(warn, 'a foot without strings asks for none').not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('in the language on the page: the frame and the dates are, the entries stay English and say so', async () => {
    const ENGLISH = {
      'whatsNew.title': 'What’s new',
      'whatsNew.unseen': 'Something new',
      'whatsNew.latest': 'latest',
      'whatsNew.added': 'Added',
      'whatsNew.changed': 'Changed',
      'whatsNew.fixed': 'Fixed',
      'common.close': 'Close',
    };
    const SLOVAK = {
      'whatsNew.title': 'Čo je nové',
      'whatsNew.unseen': 'Niečo nové',
      'whatsNew.latest': 'najnovšie',
      'whatsNew.added': 'Pridané',
      'whatsNew.changed': 'Zmenené',
      'whatsNew.fixed': 'Opravené',
      'common.close': 'Zavrieť',
    };
    setUp([provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })]);
    const fixture = TestBed.createComponent(AppVersionComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#whatsNew')?.textContent?.trim()).toBe('Čo je nové');
    expect(el.querySelector('#whatsNew .dot')?.getAttribute('title')).toBe('Niečo nové');
    expect(el.querySelector('#version')?.textContent?.trim(), 'the version itself is the same everywhere').toBe('v0.2.0');

    (el.querySelector('#whatsNew') as HTMLButtonElement).click();
    await fixture.whenStable();
    const dialog = el.querySelector('dialog.changelog') as HTMLDialogElement;
    expect(dialog.querySelector('#changelog-title')?.textContent).toBe('Čo je nové');
    expect(dialog.querySelector('.head button')?.textContent?.trim()).toBe('Zavrieť');
    expect(dialog.querySelector('.tag')?.textContent).toBe('najnovšie');
    expect(Array.from(dialog.querySelectorAll('h3')).map((h) => h.textContent)).toEqual(['Pridané', 'Opravené', 'Zmenené']);
    expect(Array.from(dialog.querySelectorAll('.vdate')).map((date) => date.textContent)).toEqual([written('sk-SK', 2026, 10, 6), written('sk-SK', 2026, 9, 29)]);
    expect(written('sk-SK', 2026, 10, 6), 'Slovak writes a date otherwise than English').not.toBe(written('en-GB', 2026, 10, 6));

    // What changed is written in English (public/changelog.json) and stays so: each list says which language it is in.
    const lists = Array.from(dialog.querySelectorAll('ul'));
    expect(lists).toHaveLength(3);
    expect(lists.every((list) => list.getAttribute('lang') === 'en')).toBe(true);
    expect(Array.from(dialog.querySelectorAll('li')).map((line) => line.textContent)).toEqual(['A setup page', 'A missing space', 'Sign-in']);

    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(dialog.querySelector('#changelog-title')?.textContent).toBe('What’s new');
    expect(dialog.querySelector('.vdate')?.textContent).toBe(written('en-GB', 2026, 10, 6));
  });

  it('closes on its button', async () => {
    const proto = HTMLDialogElement.prototype as { close?: () => void };
    if (typeof proto.close !== 'function') {
      proto.close = function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      };
    }
    setUp();
    const el = await opened();
    const dialog = el.querySelector('dialog.changelog') as HTMLDialogElement;
    expect(dialog.hasAttribute('open')).toBe(true);
    (dialog.querySelector('.head button') as HTMLButtonElement).click();
    expect(dialog.hasAttribute('open')).toBe(false);
  });
});
