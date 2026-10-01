import { ApplicationRef, Provider, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslationService } from '../../i18n/translation.service';
import { provideTestTranslations } from '../../testing/test-translations';
import { provideRouter } from '@angular/router';
import { AuthService } from '../auth.service';
import { AccountMenuComponent } from './account-menu.component';

describe('AccountMenuComponent: the menu’s keys', () => {
  let fixture: ComponentFixture<AccountMenuComponent>;
  let host: HTMLElement;
  /** Every keydown that got as far as `document` — where the lesson quiz, the reviews and the exam listen. */
  let reached: string[];
  const onDocument = (event: KeyboardEvent): void => void reached.push(event.key);

  const menu = () => host.querySelector<HTMLDetailsElement>('details.usermenu')!;
  const summary = () => host.querySelector<HTMLElement>('summary')!;
  const items = () => Array.from(host.querySelectorAll<HTMLElement>('.umenu a, .umenu button'));

  function press(on: HTMLElement, key: string): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    on.dispatchEvent(event);
    return event;
  }

  async function draw(): Promise<void> {
    fixture = TestBed.createComponent(AccountMenuComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    reached = [];
    document.addEventListener('keydown', onDocument);
    await fixture.whenStable();
  }

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));

  afterEach(() => {
    document.removeEventListener('keydown', onDocument);
    host.remove();
  });

  it('keeps its keys to itself: Enter on Sign out must not also submit a card or finish a paper', async () => {
    await draw();
    menu().open = true;
    for (const key of ['Enter', ' ', 'f', '1', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Escape']) {
      press(summary(), key);
      for (const item of items()) {
        press(item, key);
      }
    }
    expect(reached).toEqual([]);

    press(document.body, 'Enter');
    expect(reached).toEqual(['Enter']);
  });

  it('moves through its items with the arrows, from the summary to the first or the last, and leaves Enter to the browser', async () => {
    await draw();
    expect(items()).toHaveLength(2);
    summary().focus();
    press(summary(), 'ArrowDown');
    expect(menu().open).toBe(true);
    expect(document.activeElement).toBe(items()[0]);
    press(items()[0], 'ArrowDown');
    expect(document.activeElement).toBe(items()[1]);
    press(items()[1], 'ArrowDown');
    expect(document.activeElement).toBe(items()[0]);

    menu().open = false;
    summary().focus();
    press(summary(), 'ArrowUp');
    expect(document.activeElement).toBe(items()[1]);
    expect(press(items()[1], 'Enter').defaultPrevented).toBe(false);
  });

  it('closes on Escape pressed in it, with the focus back on its summary — and on Escape or a click elsewhere', async () => {
    await draw();
    menu().open = true;
    items()[1].focus();
    press(items()[1], 'Escape');
    expect(menu().open).toBe(false);
    expect(document.activeElement).toBe(summary());

    menu().open = true;
    press(document.body, 'Escape');
    expect(menu().open).toBe(false);

    menu().open = true;
    document.body.click();
    expect(menu().open).toBe(false);
  });

  it('words the name of somebody who has neither a name nor an address itself: English with no strings, else the language on the page', async () => {
    await draw();
    expect(host.querySelector('.uname')?.textContent).toBe('Account');
    expect(host.querySelector('.avatar')?.textContent).toBe('A');
    document.removeEventListener('keydown', onDocument);
    host.remove();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideTestTranslations({ 'account.noName': 'Účet' }, { language: 'sk', english: { 'account.noName': 'Account' } })] });
    await draw();
    expect(host.querySelector('.uname')?.textContent).toBe('Účet');
    expect(host.querySelector('.avatar')?.textContent).toBe('Ú');
  });
});

describe('AccountMenuComponent: the menu’s words', () => {
  /** Somebody signed in, as much of the sign-in as the menu and the translation service read. */
  function signedIn(name: string, sub: string, owner = false): Provider {
    return {
      provide: AuthService,
      useValue: {
        state: signal('ready'),
        user: signal({ sub, preferred_username: name, locale: null }),
        displayName: signal(name),
        isOwner: signal(owner),
        accountUrl: () => 'https://iam.test/account',
        logout: () => Promise.resolve(),
      },
    };
  }

  async function draw(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(AccountMenuComponent);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const ENGLISH = { 'account.signedInAs': 'Signed in as {name}', 'account.userId': 'user {sub}', 'account.yourAccount': 'Your account', 'account.signOut': 'Sign out' };
  const SLOVAK = { 'account.signedInAs': 'Prihlásený účet: {name}', 'account.userId': 'používateľ {sub}', 'account.yourAccount': 'Tvoj účet', 'account.signOut': 'Odhlásiť sa' };

  it('with no strings (the bar is drawn whatever became of them): the English it keeps, word for word, and no key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), signedIn('ada', '4201')] });
    const host = await draw();
    expect(host.querySelector('summary')?.getAttribute('title')).toBe('Signed in as ada');
    expect(host.querySelector('.who')?.textContent).toBe('Signed in as ada · user 4201');
    expect(host.querySelector('.who b')?.textContent).toBe('ada');
    expect(host.querySelector('.umenu a')?.textContent?.trim()).toBe('Your account');
    expect(host.querySelector('.umenu a')?.getAttribute('href')).toBe('https://iam.test/account');
    expect(host.querySelector('.umenu button')?.textContent?.trim()).toBe('Sign out');
    expect(warn, 'a bar without strings asks for none').not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('in the language on the page: the name stays as it is, in bold where that language puts it, and the words follow a change', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), signedIn('ada', '4201'), provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })] });
    const host = await draw();
    expect(host.querySelector('summary')?.getAttribute('title')).toBe('Prihlásený účet: ada');
    expect(host.querySelector('.who')?.textContent).toBe('Prihlásený účet: ada · používateľ 4201');
    expect(host.querySelector('.who b')?.textContent).toBe('ada');
    expect(host.querySelector('.umenu a')?.textContent?.trim()).toBe('Tvoj účet');
    expect(host.querySelector('.umenu button')?.textContent?.trim()).toBe('Odhlásiť sa');

    await TestBed.inject(TranslationService).setLanguage('en', false);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(host.querySelector('.who')?.textContent).toBe('Signed in as ada · user 4201');
    expect(host.querySelector('.umenu button')?.textContent?.trim()).toBe('Sign out');
  });

  it('a name with a placeholder’s look is a name: it is never filled, and never moves the bold', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), signedIn('{sub}{name}', '7'), provideTestTranslations(ENGLISH)] });
    const host = await draw();
    expect(host.querySelector('summary')?.getAttribute('title')).toBe('Signed in as {sub}{name}');
    expect(host.querySelector('.who')?.textContent).toBe('Signed in as {sub}{name} · user 7');
    expect(host.querySelector('.who b')?.textContent).toBe('{sub}{name}');
  });

  it('offers the owner, and only the owner, the Translations page: in English, whatever the language', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]), signedIn('ada', '4201'), provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })] });
    expect((await draw()).querySelector('#ownerTranslations')).toBeNull();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([]), signedIn('ada', '4201', true), provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })] });
    const link = (await draw()).querySelector('#ownerTranslations');
    expect(link?.textContent?.trim()).toBe('Translations');
    expect(link?.getAttribute('lang')).toBe('en');
    expect(link?.getAttribute('href')).toBe('/translations');
  });
});
