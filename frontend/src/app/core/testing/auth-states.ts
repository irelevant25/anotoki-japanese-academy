import { computed, Signal, signal, WritableSignal } from '@angular/core';
import type { AnotokiUser } from '../auth/sdk/anotoki-auth';
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
  isStaff: Signal<boolean>;
  isAdmin: Signal<boolean>;
  logins: (string | undefined)[];
  login(uiLocales?: string): Promise<boolean>;
}

/**
 * A page shown to a person (`ready`, the default) or to a visitor
 * (`visiting`: sign-in not required here, `visitorKeepDays` 30). `logins`
 * records each login()'s language.
 */
export function authStandIn(initial: AppState = 'ready'): AuthStandIn {
  const state = signal<AppState>(initial);
  const logins: (string | undefined)[] = [];
  return {
    state,
    ...derivedFromState(state),
    loginRequired: signal(initial !== 'visiting'),
    visitorKeepDays: signal(30),
    signInError: signal<SignInFailure | null>(null),
    user: signal<AnotokiUser | null>(null),
    isStaff: signal(false),
    isAdmin: signal(false),
    logins,
    login: (uiLocales?: string) => {
      logins.push(uiLocales);
      return Promise.resolve(true);
    },
  };
}
