import { DestroyRef, effect, inject, Injectable, signal, untracked } from '@angular/core';
import type { VisitorKeyStore } from '@anotoki/lib/auth';
import { ApiService, toApiError } from '../api/api.service';
import { VisitorMove } from '../api/api.types';
import { readStorage, storageUsable, writeStorage } from '../storage';
import { AuthService } from './auth.service';

/** Where this browser keeps its visitor key (localStorage: every tab of the site shares it). */
export const VISITOR_STORAGE_KEY = 'japanese-academy-visitor';
/**
 * The last key this browser moved into an account: a tab whose move then
 * finds the key gone (200 found: false) knows another tab moved it — nothing
 * was lost, and it says nothing. The key is worth nothing once moved.
 */
export const VISITOR_MOVED_KEY = 'japanese-academy-visitor-moved';

/** A key as the server makes them: 32 random bytes, base64url without padding. Anything else is no key. */
const KEY_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/**
 * How long to wait before asking for the move again in this page load, after
 * no answer or a 5xx (visitor_move_retry, visitors_unavailable). After the
 * last one, the next page load asks again: the study is out of sight
 * meanwhile, never lost.
 */
export const MOVE_RETRY_MS: readonly number[] = [2_000, 10_000, 30_000];

/** How long the start waits for the move before it draws the first page (core/boot.ts). */
export const MOVE_AT_START_MS = 5_000;

/**
 * The visitor key: what lets somebody who has not signed in keep what they
 * study, where the IAM does not require sign-in here (docs/kb/sign-in.md,
 * *Visitors*). The server makes it at the first save of somebody with neither
 * a token nor a key (a lesson, a review, practice, a note, a setting, an exam
 * handed in) and sends it once, in that answer's `X-Visitor-Key` header; it
 * keeps only its hash. This browser keeps the key in localStorage, and the
 * anotoki library's interceptor sends it on the requests issued for a visitor
 * (the page in the state visiting), never on a person's: this is the store the
 * library is given (core/auth/auth.config.ts, `visitors`).
 *
 * - **Read at send time.** `current()` reads storage on every request, and a
 *   `storage` event keeps the `key` signal in step: every tab sends the key the
 *   browser holds now.
 * - **One visitor per browser.** While no key is held, the first save that
 *   would make a visitor goes alone (`beginFirstSave()`); the requests issued
 *   meanwhile wait for its answer (`firstSave()`) and then go with the key it
 *   brought — or, when it brought none (it failed), one at a time again. A key
 *   already stored (another tab's, a moment earlier) is never overwritten
 *   (`remember()`).
 * - **Kept, not sent, while the IAM requires sign-in here** — also when that
 *   changes while the page is open (401 sign_in_required): the next sign-in
 *   moves what it holds into the account, and the switch turned off again
 *   within the days a visitor is kept brings it back.
 * - **Forgotten** when the server no longer knows it (401 `visitor_unknown`:
 *   deleted after the days unused, or moved by another tab) — `lost` says so,
 *   once — and after the move. Only while the stored key is still the one
 *   that was sent (another tab may hold a new one by then).
 * - **The move, after every sign-in** while a key is held: `POST
 *   /api/visitor/move` with the token and the key, one at a time — at the
 *   start (`settle()`, before the first page is drawn), and by an effect. A
 *   200 forgets the key and counts `moves` (the pages that show progress load
 *   it again); `moved` holds what moved, for the note on the home page. A key
 *   another tab moved first (found: false) is silent. No answer or a 5xx: the
 *   key stays and the move is asked again (MOVE_RETRY_MS). 422: no key the
 *   server could ever know — forgotten. 401: the sign-in ended meanwhile; the
 *   next one asks again.
 *
 * A private window that refuses storage: the key lives in memory for the tab.
 *
 * This service reads AuthService, and never the other way round: the library
 * asks for it (`visitors`) as a visitor's request leaves.
 */
@Injectable({ providedIn: 'root' })
export class VisitorKey implements VisitorKeyStore {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);

  /** The key, when storage cannot keep it (or refused to). */
  private memory: string | null = null;
  private inMemory = false;
  private readonly keySignal = signal<string | null>(null);

  /** The key this browser holds, or null. */
  readonly key = this.keySignal.asReadonly();
  /** The key was forgotten because the server no longer knew it: the visitor's pages say so, once. */
  readonly lost = signal(false);
  /** The last move that moved anything, for the note on the home page (worded where it is shown); null once seen. */
  readonly moved = signal<VisitorMove | null>(null);
  /** Counts the moves that finished: the pages that show progress load it again when it changes. */
  readonly moves = signal(0);

  private moving: Promise<void> | null = null;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: Promise<void> | null = null;

  constructor() {
    this.keySignal.set(this.read());

    // Another tab stored or forgot the key.
    const onStorage = (event: StorageEvent): void => {
      if (event.key === VISITOR_STORAGE_KEY || event.key === null) {
        this.keySignal.set(this.read());
      }
    };
    globalThis.addEventListener?.('storage', onStorage);
    inject(DestroyRef).onDestroy(() => {
      globalThis.removeEventListener?.('storage', onStorage);
      if (this.retryTimer !== null) {
        clearTimeout(this.retryTimer);
      }
    });

    // Signed in, with a key held: what the visitor studied becomes the person's.
    effect(() => {
      if (this.auth.signedIn() && this.keySignal() !== null) {
        untracked(() => void this.moveIntoAccount());
      }
    });
  }

  /** The key held now, read from storage: what a request sends. */
  current(): string | null {
    const key = this.read();
    if (key !== untracked(this.keySignal)) {
      this.keySignal.set(key);
    }
    return key;
  }

  /**
   * A key the server just made. Kept only when this browser holds none: a key
   * already stored (another tab's, made a moment earlier) stays, and this one
   * is dropped (its one save waits on the server for the sweep).
   */
  remember(key: string): void {
    if (!KEY_SHAPE.test(key)) {
      return;
    }
    if (this.read() === null) {
      this.write(key);
      this.lost.set(false);
    }
    this.keySignal.set(this.read());
  }

  /**
   * Forgets `key` — only while it is still the one held (compare-and-delete:
   * another tab may have replaced it meanwhile). `lost`: because the server no
   * longer knew it.
   */
  forget(key: string, lost = false): void {
    if (this.read() === key) {
      this.write(null);
      if (lost) {
        this.lost.set(true);
      }
    }
    this.keySignal.set(this.read());
  }

  /** The first save that may make a visitor, while it is on its way (the interceptor waits for it), or null. */
  firstSave(): Promise<void> | null {
    return this.pending;
  }

  /** A save that may make a visitor is going out alone; call what this returns once it has its answer (or failed). */
  beginFirstSave(): () => void {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    this.pending = pending;
    return () => {
      if (this.pending === pending) {
        this.pending = null;
      }
      release();
    };
  }

  /**
   * At the start, after the sign-in has settled (core/boot.ts): signed in with
   * a key held, the move — waited for at most MOVE_AT_START_MS, so the first
   * page already shows what moved. Never rejects.
   */
  async settle(): Promise<void> {
    if (!this.auth.signedIn() || this.read() === null) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([this.moveIntoAccount(), new Promise<void>((resolve) => (timer = setTimeout(resolve, MOVE_AT_START_MS)))]);
    clearTimeout(timer);
  }

  /** The move after a sign-in (see the class). Safe to call at any time: it does nothing without a person and a key, and once at a time. */
  moveIntoAccount(): Promise<void> {
    if (this.moving) {
      return this.moving;
    }
    const key = this.read();
    if (key === null || !this.auth.signedIn()) {
      return Promise.resolve();
    }
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.moving = this.move(key).finally(() => (this.moving = null));
    return this.moving;
  }

  private async move(key: string): Promise<void> {
    try {
      const result = await this.api.moveVisitor(key);
      this.retries = 0;
      if (result.found) {
        writeStorage(VISITOR_MOVED_KEY, key);
        if (result.items > 0 || result.attempts > 0 || result.kept > 0) {
          this.moved.set(result);
        }
      } else if (readStorage(VISITOR_MOVED_KEY) !== key) {
        // Not moved by another tab of this browser: the server let it go (the days unused).
        this.lost.set(true);
      }
      this.forget(key);
      this.moves.update((count) => count + 1);
    } catch (e) {
      const error = toApiError(e);
      if (error.status === 0 || error.status >= 500) {
        this.askAgainLater();
      } else if (error.status === 422) {
        // Not a key the server could ever know: nothing to move, now or later.
        this.forget(key);
      }
      // A 401: the sign-in ended meanwhile — the next sign-in asks again (the effect).
    }
  }

  private askAgainLater(): void {
    if (this.retries >= MOVE_RETRY_MS.length) {
      return;
    }
    const delay = MOVE_RETRY_MS[this.retries];
    this.retries++;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.moveIntoAccount();
    }, delay);
  }

  private read(): string | null {
    const value = this.inMemory || !storageUsable() ? this.memory : readStorage(VISITOR_STORAGE_KEY);
    return value !== null && KEY_SHAPE.test(value) ? value : null;
  }

  private write(value: string | null): void {
    this.memory = value;
    if (this.inMemory || !storageUsable()) {
      return;
    }
    writeStorage(VISITOR_STORAGE_KEY, value);
    if (readStorage(VISITOR_STORAGE_KEY) !== value) {
      // Storage would not keep it (a full quota): from now on the key lives in memory for this tab.
      this.inMemory = true;
    }
  }
}
