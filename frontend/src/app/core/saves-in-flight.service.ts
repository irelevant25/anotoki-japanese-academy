import { computed, Injectable, signal } from '@angular/core';

/**
 * Something on the page that signing out would lose, as a key the sign-out's
 * question is worded from: an exam paper that is open and not handed in
 * (`signOut.examOpen`), a session's answer whose save failed and that its
 * summary has not shown yet (`signOut.notSaved`).
 */
export type LossCheck = () => string | null;

/**
 * The saves on their way to the server, for the one who has to wait for them:
 * signing out (SignOutService). A lesson's, a review's or practice's answers
 * are saved in the background, the next card never waits for them
 * (kanji/session); a note is saved a moment after the learner stops typing
 * (kanji/shared/notes-editor); an exam paper is scored when it is handed in.
 * Each tells this service, which the top bar can reach where it cannot reach
 * them:
 *
 *   track(save)        a save that has gone out: counted until it settles,
 *                      and its failure remembered
 *   hold(flush)        a save that is waiting to go out (a note's timer):
 *                      flushAll() sends it now; the returned function lets go
 *   watch(check)       something that would be lost, asked when it matters
 *                      (an open paper, a session's failed answer not shown
 *                      yet); the returned function lets go
 *
 * It holds counts and keys, never a sentence: the sign-out words its question.
 */
@Injectable({ providedIn: 'root' })
export class SavesInFlight {
  private readonly inFlight = signal(0);
  private failures = 0;
  private readonly waiting = new Set<() => void>();
  private readonly checks = new Set<LossCheck>();
  private settledNow: (() => void)[] = [];

  /** Whether a save is on its way now. */
  readonly saving = computed(() => this.inFlight() > 0);

  /** A save that has gone out. Answers the same promise: the caller goes on as before. */
  track<T>(save: Promise<T>): Promise<T> {
    this.inFlight.update((n) => n + 1);
    const done = (): void => {
      this.inFlight.update((n) => n - 1);
      if (this.inFlight() === 0) {
        const waiters = this.settledNow;
        this.settledNow = [];
        waiters.forEach((resolve) => resolve());
      }
    };
    save.then(done, () => {
      this.failures++;
      done();
    });
    return save;
  }

  /** A save waiting to go out: `flush` sends it at once. Call what this returns once it has gone (or there is nothing left to send). */
  hold(flush: () => void): () => void {
    this.waiting.add(flush);
    return () => this.waiting.delete(flush);
  }

  /** Something signing out would lose: `check` names it with a key, or answers null. Call what this returns when it is gone. */
  watch(check: LossCheck): () => void {
    this.checks.add(check);
    return () => this.checks.delete(check);
  }

  /** What would be lost now, each as its key (in the order they were watched). */
  losses(): string[] {
    return [...this.checks].map((check) => check()).filter((key): key is string => key !== null);
  }

  /**
   * Every save waiting sent now, then every save on its way waited for.
   * Answers how many of the saves that settled meanwhile failed: what they
   * carried is not on the server.
   */
  async settle(): Promise<number> {
    const before = this.failures;
    for (const flush of [...this.waiting]) {
      flush();
    }
    this.waiting.clear();
    // A save that settles may start another (a retry, the next one queued): wait until none is left.
    while (this.inFlight() > 0) {
      await new Promise<void>((resolve) => this.settledNow.push(resolve));
    }
    return this.failures - before;
  }
}
