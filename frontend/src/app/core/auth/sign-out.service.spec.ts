import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { SavesInFlight } from '../saves-in-flight.service';
import { AuthService } from './auth.service';
import { SignOutService } from './sign-out.service';

const SLOVAK = {
  'signOut.notSaved': 'Niektoré tvoje odpovede alebo poznámky sa nepodarilo uložiť a odhlásením sa stratia. Chceš sa aj tak odhlásiť?',
  'signOut.examOpen': 'Tvoja skúška nie je dokončená a odhlásením sa test stratí. Chceš sa aj tak odhlásiť?',
};

describe('SignOutService: nothing the learner did goes unsaved without asking', () => {
  const logout = vi.fn(() => Promise.resolve());
  let asked: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logout.mockClear();
    asked = vi.spyOn(window, 'confirm').mockReturnValue(true);
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideTestTranslations(SLOVAK, { language: 'sk' }), { provide: AuthService, useValue: { state: signal('ready'), user: signal(null), logout } }],
    });
  });
  afterEach(() => vi.restoreAllMocks());

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
    expect(asked).not.toHaveBeenCalled();
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
    expect(asked).not.toHaveBeenCalled();
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
    asked.mockReturnValue(false);
    const save = onItsWay();
    const done = TestBed.inject(SignOutService).signOut();
    save.fail();
    expect(await done).toBe(false);
    expect(asked.mock.calls).toEqual([[SLOVAK['signOut.notSaved']]]);
    expect(logout).not.toHaveBeenCalled();
    expect(TestBed.inject(SignOutService).waiting()).toBe(false);
  });

  it('a save that failed long before (already said where it happened) is no reason to ask again', async () => {
    const save = onItsWay();
    save.fail();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(await TestBed.inject(SignOutService).signOut()).toBe(true);
    expect(asked).not.toHaveBeenCalled();
  });

  it('an exam paper open and not handed in: asks first; OK signs out, and the paper is lost', async () => {
    let open = true;
    const unwatch = TestBed.inject(SavesInFlight).watch(() => (open ? 'signOut.examOpen' : null));
    expect(await TestBed.inject(SignOutService).signOut()).toBe(true);
    expect(asked.mock.calls).toEqual([[SLOVAK['signOut.examOpen']]]);
    expect(logout).toHaveBeenCalledTimes(1);

    open = false;
    asked.mockClear();
    expect(await TestBed.inject(SignOutService).signOut()).toBe(true);
    expect(asked, 'handed in: nothing to lose').not.toHaveBeenCalled();
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
