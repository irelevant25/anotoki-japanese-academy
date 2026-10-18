import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { ConfirmService } from '@anotoki/lib/ui/dialog';
import { SavesInFlight } from '../saves-in-flight.service';
import { AuthService } from './auth.service';
import { SignOutService } from './sign-out.service';
import { provideAuth } from './auth.config';

// The question's words as migration 011 seeds them: the title asks, the sentence says what goes; its yes is the bar's
// Sign out (the anotoki library's word).
const SLOVAK = {
  'signOut.confirmTitle': 'Chceš sa aj tak odhlásiť?',
  'signOut.notSaved': 'Niektoré tvoje odpovede alebo poznámky sa nepodarilo uložiť a odhlásením sa stratia.',
  'signOut.examOpen': 'Tvoja skúška nie je dokončená a odhlásením sa test stratí.',
  'anotoki.topbar.signOut': 'Odhlásiť sa',
};

describe('SignOutService: nothing the learner did goes unsaved without asking', () => {
  // AuthService.logout(): true once the IAM has been asked.
  const logout = vi.fn(() => Promise.resolve(true));
  /** The browser's own box, which is never raised: the kit's question is. */
  let box: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logout.mockClear();
    box = vi.spyOn(window, 'confirm').mockReturnValue(true);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideAuth(),
        provideTestTranslations(SLOVAK, { language: 'sk' }),
        { provide: AuthService, useValue: { state: signal('ready'), user: signal(null), logout } },
      ],
    });
  });
  afterEach(() => {
    try {
      expect(box, 'never the browser’s own box').not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  /** The kit's question (ConfirmService, drawn in the app's root), if one is open. */
  const asked = () => TestBed.inject(ConfirmService).pending();
  /** Its answer: the yes (Sign out) or the no (Cancel). */
  const answer = (yes: boolean) => TestBed.inject(ConfirmService).settle(yes);
  /** Until the kit's question is open. */
  const question = () => vi.waitFor(() => expect(asked()).not.toBeNull());

  /** A save that has gone out, and the hands that settle it. */
  function onItsWay(): { land: () => void; fail: () => void } {
    let land!: () => void;
    let fail!: () => void;
    const save = new Promise<void>((resolve, reject) => {
      land = resolve;
      fail = () => reject(new Error('offline'));
    });
    // The session's own handler, as session.component.ts has it: the failure is its to show.
    TestBed.inject(SavesInFlight)
      .track(save)
      .catch(() => undefined);
    return { land, fail };
  }

  it('nothing on its way, nothing open: signs out at once, asking nothing', async () => {
    expect(await TestBed.inject(SignOutService).signOut()).toBe(true);
    expect(logout).toHaveBeenCalledTimes(1);
    expect(asked()).toBeNull();
  });

  it('waits for the answers on their way — the button’s spinner meanwhile — then signs out', async () => {
    const signOut = TestBed.inject(SignOutService);
    const first = onItsWay();
    const second = onItsWay();
    const done = signOut.signOut();
    await Promise.resolve();
    expect(signOut.waiting()).toBe(true);
    expect(TestBed.inject(SavesInFlight).saving()).toBe(true);

    first.land();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(logout, 'one answer is still on its way').not.toHaveBeenCalled();

    second.land();
    expect(await done).toBe(true);
    expect(logout).toHaveBeenCalledTimes(1);
    expect(signOut.waiting()).toBe(false);
    expect(asked()).toBeNull();
  });

  it('a note still waiting for its moment is sent at once, and waited for', async () => {
    const saves = TestBed.inject(SavesInFlight);
    let sent = 0;
    let land!: () => void;
    const release = saves.hold(() => {
      sent++;
      release();
      void saves.track(new Promise<void>((resolve) => (land = resolve)));
    });
    const done = TestBed.inject(SignOutService).signOut();
    await Promise.resolve();
    expect(sent).toBe(1);
    expect(logout).not.toHaveBeenCalled();
    land();
    expect(await done).toBe(true);
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('a save that failed meanwhile: asks first, in the learner’s language; Cancel keeps them signed in', async () => {
    const save = onItsWay();
    const done = TestBed.inject(SignOutService).signOut();
    save.fail();
    await question();
    expect(asked()).toMatchObject({ title: SLOVAK['signOut.confirmTitle'], message: SLOVAK['signOut.notSaved'], confirmLabel: 'Odhlásiť sa', tone: 'danger' });
    expect(asked()?.cancelLabel, 'the kit’s own Cancel').toBeUndefined();
    answer(false);
    expect(await done).toBe(false);
    expect(logout).not.toHaveBeenCalled();
    expect(TestBed.inject(SignOutService).waiting()).toBe(false);
  });

  it('a save that failed long before (already said where it happened) is no reason to ask again', async () => {
    const save = onItsWay();
    save.fail();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await TestBed.inject(SignOutService).signOut()).toBe(true);
    expect(asked()).toBeNull();
  });

  it('an exam paper open and not handed in: asks first; its yes signs out, and the paper is lost', async () => {
    let open = true;
    const unwatch = TestBed.inject(SavesInFlight).watch(() => (open ? 'signOut.examOpen' : null));
    const done = TestBed.inject(SignOutService).signOut();
    await question();
    expect(asked()).toMatchObject({ title: SLOVAK['signOut.confirmTitle'], message: SLOVAK['signOut.examOpen'] });
    answer(true);
    expect(await done).toBe(true);
    expect(logout).toHaveBeenCalledTimes(1);

    open = false;
    expect(await TestBed.inject(SignOutService).signOut()).toBe(true);
    expect(asked(), 'handed in: nothing to lose').toBeNull();
    expect(logout).toHaveBeenCalledTimes(2);
    unwatch();
  });

  it('a second press while it waits does nothing more', async () => {
    const signOut = TestBed.inject(SignOutService);
    const save = onItsWay();
    const first = signOut.signOut();
    expect(await signOut.signOut()).toBe(false);
    save.land();
    expect(await first).toBe(true);
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
