import { HttpTestingController } from '@angular/common/http/testing';
import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SiteStatus } from '@anotoki/lib/migrations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { AppState, AuthService } from '../auth/auth.service';
import { provideFeedback } from '../feedback.config';
import { provideKit } from '../kit.config';
import { authStandIn, person } from '../testing/auth-states';
import { provideKitEnglish } from '../testing/kit-english';
import { provideTestSiteStatus } from '../testing/site-status';
import { FeedbackButtonComponent } from './feedback-button.component';

const ENGLISH = { 'topbar.exam': 'Exam' };
const SLOVAK = { 'topbar.exam': 'Skúška' };

/** The words of an element, its white space folded. */
const words = (element: Element | null | undefined): string => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

describe('FeedbackButtonComponent: Send feedback, at the foot of every page', () => {
  let host: HTMLElement;
  const settle = async (): Promise<void> => {
    await new Promise((done) => setTimeout(done));
    await TestBed.inject(ApplicationRef).whenStable();
  };

  /** The foot's button for a page shown as `state`, in English or Slovak; signed in as Hana when ready. */
  async function draw(state: AppState = 'ready', language: 'en' | 'sk' = 'en'): Promise<void> {
    const auth = authStandIn(state);
    if (state === 'ready') {
      auth.user.set(person());
    }
    TestBed.configureTestingModule({
      imports: [FeedbackButtonComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        language === 'en' ? provideTestTranslations(ENGLISH) : provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }),
        provideTestSiteStatus(),
        provideKitEnglish(),
        provideKit(),
        provideFeedback(),
        { provide: AuthService, useValue: auth },
      ],
    });
    // The form is a @defer block's: its code is resolved first.
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(FeedbackButtonComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await fixture.whenStable();
  }

  afterEach(() => host?.remove());

  it('offered to a person and to a visitor, in the library’s words ("Send feedback") in the language on the page', async () => {
    await draw('ready');
    expect(words(host.querySelector('#sendFeedback'))).toBe('Send feedback');
    TestBed.resetTestingModule();
    await draw('visiting', 'sk');
    expect(words(host.querySelector('#sendFeedback'))).toBe('Pošli nám spätnú väzbu');
    expect(host.querySelector('#sendFeedback')?.getAttribute('lang')).toBe('sk');
  });

  it('not while the app itself is not shown - on the way to the IAM, the Sign in card, a copy not set up - nor while the library’s page stands in for it', async () => {
    for (const state of ['signed-out', 'starting', 'not-set-up', 'problem'] as AppState[]) {
      await draw(state);
      expect(host.querySelector('#sendFeedback'), state).toBeNull();
      TestBed.resetTestingModule();
    }
    await draw('ready');
    TestBed.inject(SiteStatus).report('update_pending');
    await settle();
    expect(host.querySelector('#sendFeedback'), 'being updated').toBeNull();
  });

  it('opens the library’s form in the kit’s dialog: the app’s two sections as places, "without my name" for a person, the address written in; Cancel closes it', async () => {
    await draw('ready', 'sk');
    host.querySelector<HTMLButtonElement>('#sendFeedback')!.click();
    await settle();
    await vi.waitFor(() => expect(document.querySelector('anotoki-feedback-form form')).not.toBeNull());
    const dialog = host.querySelector('anotoki-dialog');
    expect(words(dialog?.querySelector('.anotoki-dialog__title'))).toBe('Pošli nám spätnú väzbu');
    const form = dialog?.querySelector('anotoki-feedback-form');
    expect(form?.querySelector('.anotoki-feedback-form__title'), 'the dialog’s heading says it once').toBeNull();
    expect(Array.from(form?.querySelectorAll('anotoki-select option') ?? []).map((option) => words(option))).toEqual(expect.arrayContaining(['Kanji', 'Skúška']));
    expect(form?.querySelector('[data-anonymous]'), 'a person may send it without their name').not.toBeNull();
    expect(form?.querySelector<HTMLInputElement>('[data-email] input')?.value).toBe('hana@example.test');
    const cancel = Array.from(form?.querySelectorAll<HTMLButtonElement>('button') ?? []).find((button) => words(button) === 'Zrušiť' || words(button) === 'Cancel');
    cancel!.click();
    await settle();
    expect(host.querySelector('anotoki-dialog')).toBeNull();
  });

  it('a visitor’s form: no "without my name" - there is no name to leave out', async () => {
    await draw('visiting');
    host.querySelector<HTMLButtonElement>('#sendFeedback')!.click();
    await settle();
    await vi.waitFor(() => expect(document.querySelector('anotoki-feedback-form form')).not.toBeNull());
    expect(host.querySelector('anotoki-feedback-form [data-anonymous]')).toBeNull();
  });

  it('no key pressed in it reaches the page - Enter in the message never hands an exam paper in', async () => {
    await draw('ready');
    const reached: string[] = [];
    const listen = (event: KeyboardEvent): void => void reached.push(event.key);
    document.addEventListener('keydown', listen);
    try {
      host.querySelector<HTMLButtonElement>('#sendFeedback')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      host.querySelector<HTMLButtonElement>('#sendFeedback')!.click();
      await settle();
      await vi.waitFor(() => expect(document.querySelector('anotoki-feedback-form textarea')).not.toBeNull());
      host.querySelector('anotoki-feedback-form textarea')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(reached).toEqual([]);
    } finally {
      document.removeEventListener('keydown', listen);
    }
  });

  it('sends to POST /api/feedback what was written, the place, and the page without its query', async () => {
    history.replaceState(null, '', '/kanji/lessons?batch=2#top');
    try {
      await draw('ready');
      host.querySelector<HTMLButtonElement>('#sendFeedback')!.click();
      await settle();
      await vi.waitFor(() => expect(document.querySelector('anotoki-feedback-form textarea')).not.toBeNull());
      const textarea = host.querySelector<HTMLTextAreaElement>('anotoki-feedback-form textarea')!;
      textarea.value = 'The reading of 学 is missing.';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
      host.querySelector<HTMLFormElement>('anotoki-feedback-form form')!.dispatchEvent(new Event('submit', { cancelable: true }));
      await settle();
      const sent = TestBed.inject(HttpTestingController).expectOne('/api/feedback');
      expect(sent.request.method).toBe('POST');
      expect(sent.request.body).toEqual(expect.objectContaining({ kind: 'bug', message: 'The reading of 学 is missing.', page: '/kanji/lessons', language: 'en' }));
      sent.flush({ ok: true }, { status: 201, statusText: 'Created' });
    } finally {
      history.replaceState(null, '', '/');
    }
  });
});
