import { ApiError } from '../../core/api/api.service';
import { CatalogItem } from '../../core/api/api.types';
import { Check } from '../answer';

export type SessionMode = 'lesson' | 'review' | 'practice';
export type Parts = 'both' | 'meaning' | 'reading';
export type Part = 'meaning' | 'reading';

/** One item in the queue: which halves it still needs, and its misses so far. */
export interface QueueEntry {
  it: CatalogItem;
  needM: boolean;
  needR: boolean;
  wrongM: number;
  wrongR: number;
  started: boolean;
}

/**
 * An item done: both halves answered right, with the misses on the way — and,
 * once saved, its stages; or, when the save failed, the failure itself (the
 * summary words it from its code, in the reader's language).
 */
export interface DoneEntry {
  it: CatalogItem;
  wrongM: number;
  wrongR: number;
  from?: number;
  to?: number;
  error?: ApiError;
}

/** What a finished session hands its summary. */
export interface SessionResult {
  mode: SessionMode;
  done: DoneEntry[];
  answered: number;
  right: number;
  /** items half answered when it ended (not saved) */
  unfinished: number;
  early: boolean;
}

export function shuffled<T>(list: T[], random: () => number = Math.random): T[] {
  const x = list.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

/**
 * The answering engine behind the lesson quiz, reviews and practice, without
 * the page (the SessionComponent draws it).
 *
 * Each item is asked twice — meaning, then reading, back to back. A missed half
 * is shown with the right answer and comes back a few cards later; the item is
 * finished (and saved) only once both halves have been answered right, and the
 * misses along the way are what the SRS uses to move it down.
 */
export class SessionEngine {
  readonly queue: QueueEntry[];
  readonly done: DoneEntry[] = [];
  readonly total: number;
  answered = 0;
  right = 0;
  phase: 'ask' | 'shown' = 'ask';
  verdict: 'correct' | 'wrong' | null = null;
  cur: QueueEntry | null = null;
  part: Part = 'meaning';
  typed = '';
  wrapping = false;

  constructor(
    items: CatalogItem[],
    parts: Parts = 'both',
    shuffleItems = true,
    private readonly random: () => number = Math.random,
  ) {
    this.queue = (shuffleItems ? shuffled(items, random) : items.slice()).map((it) => ({
      it,
      needM: parts !== 'reading',
      needR: parts !== 'meaning',
      wrongM: 0,
      wrongR: 0,
      started: false,
    }));
    this.total = this.queue.length;
  }

  /** The next card: false when there is none left (the session is over). */
  show(): boolean {
    if (!this.queue.length) {
      return false;
    }
    this.cur = this.queue[0];
    this.part = this.cur.needM ? 'meaning' : 'reading';
    this.phase = 'ask';
    this.verdict = null;
    this.typed = '';
    return true;
  }

  /** An answer, checked: an invalid one changes nothing (the card shakes). */
  submit(typed: string, res: Check): Check['verdict'] {
    if (this.phase !== 'ask' || !this.cur) {
      return 'invalid';
    }
    this.typed = typed;
    if (res.verdict === 'invalid') {
      return 'invalid';
    }
    this.cur.started = true;
    this.answered += 1;
    this.phase = 'shown';
    if (res.verdict === 'correct') {
      this.right += 1;
      this.verdict = 'correct';
      if (this.part === 'meaning') {
        this.cur.needM = false;
      } else {
        this.cur.needR = false;
      }
    } else {
      this.verdict = 'wrong';
      if (this.part === 'meaning') {
        this.cur.wrongM += 1;
      } else {
        this.cur.wrongR += 1;
      }
    }
    return this.verdict;
  }

  /** "My answer was right": the miss taken back, and the half counted as right. */
  accept(): void {
    if (this.phase !== 'shown' || this.verdict !== 'wrong' || !this.cur) {
      return;
    }
    if (this.part === 'meaning') {
      this.cur.wrongM -= 1;
      this.cur.needM = false;
    } else {
      this.cur.wrongR -= 1;
      this.cur.needR = false;
    }
    this.right += 1;
    this.verdict = 'correct';
  }

  /**
   * On to the next card. A missed half comes back in a few cards, so it is
   * fresh but not immediate; the other half of a right one comes straight
   * away; an item with both halves right is done — returned, to be saved.
   */
  advance(): DoneEntry | null {
    if (this.phase !== 'shown') {
      return null;
    }
    const e = this.queue.shift() as QueueEntry;
    let completed: DoneEntry | null = null;
    if (this.verdict === 'wrong') {
      const pos = Math.min(this.queue.length, 2 + Math.floor(this.random() * 3));
      this.queue.splice(pos, 0, e);
    } else if (e.needM || e.needR) {
      this.queue.unshift(e);
    } else {
      completed = { it: e.it, wrongM: e.wrongM, wrongR: e.wrongR };
      this.done.push(completed);
    }
    if (this.wrapping) {
      this.dropUnstarted();
    }
    return completed;
  }

  /**
   * Wrap up (reviews): finish what was started, take nothing new. On a card
   * not started yet that happens now: 'finish' when nothing is left, 'next'
   * for the next started one; otherwise 'later', as the card is answered.
   */
  wrapUp(): 'finish' | 'next' | 'later' {
    this.wrapping = true;
    if (this.phase === 'ask' && this.cur && !this.cur.started) {
      this.dropUnstarted();
      return this.queue.length ? 'next' : 'finish';
    }
    return 'later';
  }

  /** Items half answered: they are not saved if the session ends now. */
  halfAnswered(): number {
    return this.queue.filter((q) => q.started).length;
  }

  private dropUnstarted(): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (!this.queue[i].started) {
        this.queue.splice(i, 1);
      }
    }
  }
}
