import { computed, Signal, signal, WritableSignal } from '@angular/core';
import type { AnotokiPreferenceChanges, AnotokiPreferences, AnotokiSavedPreferences, AnotokiUser } from '@anotoki/lib/auth';
import type { AppState, SignInFailure } from '../auth/auth.service';

/**
 * What AuthService derives from its state — somebody signed in, a visitor,
 * either of them — for a spec's stand-in of it that keeps the state itself:
 * `{ state, ...derivedFromState(state), … }`.
 */
export function derivedFromState(state: Signal<AppState | string>): { signedIn: Signal<boolean>; visiting: Signal<boolean>; usable: Signal<boolean> } {
  return {
    signedIn: computed(() => state() === 'ready'),
    visiting: computed(() => state() === 'visiting'),
    usable: computed(() => state() === 'ready' || state() === 'visiting'),
  };
}

/**
 * What AuthService derives from who is signed in: the account's preferences,
 * while the page is theirs and the IAM sends them — for a stand-in that keeps
 * the state and the user itself: `{ state, user, ...derivedFromUser(state, user), … }`.
 */
export function derivedFromUser(state: Signal<AppState | string>, user: Signal<AnotokiUser | null>): { preferences: Signal<AnotokiPreferences | null> } {
  return { preferences: computed(() => (state() === 'ready' ? (user()?.preferences ?? null) : null)) };
}

/**
 * A save of the account's preferences that a spec answers, as the IAM would:
 * `accept()` puts the account as it now stands into `user` first, then the
 * save resolves — the library's client's order (user() follows at once); `refuse(code)`
 * rejects it with the IAM's or the SDK's code.
 */
export interface PendingSave {
  changes: AnotokiPreferenceChanges;
  accept(): void;
  refuse(code: string): void;
}

/** A stand-in for AuthService as a page reads it: what it is shown as, and what goes with that. */
export interface AuthStandIn {
  state: WritableSignal<AppState>;
  signedIn: Signal<boolean>;
  visiting: Signal<boolean>;
  usable: Signal<boolean>;
  loginRequired: WritableSignal<boolean>;
  visitorKeepDays: WritableSignal<number>;
  signInError: WritableSignal<SignInFailure | null>;
  user: WritableSignal<AnotokiUser | null>;
  preferences: Signal<AnotokiPreferences | null>;
  isStaff: Signal<boolean>;
  isAdmin: Signal<boolean>;
  /** Every login() asked for: the address to come back to, when one was given. */
  logins: (string | undefined)[];
  login(returnTo?: string): Promise<boolean>;
  /** Every savePreferences() asked for, in order, each waiting for the spec's answer. */
  saves: PendingSave[];
  savePreferences(changes: AnotokiPreferenceChanges): Promise<AnotokiSavedPreferences>;
}

/** The account's preferences when nothing was chosen: the theme of the operating system, the language's dates and clock. */
export const NO_CHOICE: AnotokiPreferences = { theme: 'auto', date_format: null, time_format: null };

/**
 * Somebody signed in, as the library's client gives them (user()): user 7, Hana, with
 * the account's preferences — `null` for an IAM that sends none.
 */
export function person(preferences: AnotokiPreferences | null = NO_CHOICE, locale: string | null = 'en'): AnotokiUser {
  return { sub: '7', preferred_username: 'hana', email: 'hana@example.test', email_verified: true, locale, roles: [], preferences };
}

/**
 * A page shown to a person (`ready`, the default) or to a visitor
 * (`visiting`: sign-in not required here, `visitorKeepDays` 30). `logins`
 * records each login() (the address it comes back to, when one was given: the
 * language is the library's to add); `saves` each save of the account's
 * preferences, answered by the spec.
 */
export function authStandIn(initial: AppState = 'ready'): AuthStandIn {
  const state = signal<AppState>(initial);
  const user = signal<AnotokiUser | null>(null);
  const logins: (string | undefined)[] = [];
  const saves: PendingSave[] = [];
  return {
    state,
    ...derivedFromState(state),
    loginRequired: signal(initial !== 'visiting'),
    visitorKeepDays: signal(30),
    signInError: signal<SignInFailure | null>(null),
    user,
    ...derivedFromUser(state, user),
    isStaff: signal(false),
    isAdmin: signal(false),
    logins,
    login: (returnTo?: string) => {
      logins.push(returnTo);
      return Promise.resolve(true);
    },
    saves,
    savePreferences: (changes: AnotokiPreferenceChanges) =>
      new Promise<AnotokiSavedPreferences>((resolve, reject) => {
        saves.push({
          changes,
          accept: () => {
            const { language, ...chosen } = changes;
            const now = user();
            const locale = language ?? now?.locale ?? null;
            const preferences = { ...(now?.preferences ?? NO_CHOICE), ...chosen };
            if (now) {
              user.set({ ...now, locale, preferences });
            }
            resolve({ locale, preferences });
          },
          refuse: (code: string) => reject(Object.assign(new Error(`The IAM refused the change (${code})`), { code })),
        });
      }),
  };
}
