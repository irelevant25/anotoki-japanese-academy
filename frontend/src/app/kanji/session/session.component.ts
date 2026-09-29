import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { bind, toKana, unbind } from 'wanakana';
import { ApiService } from '../../core/api/api.service';
import { CatalogItem } from '../../core/api/api.types';
import { AudioService } from '../../core/audio.service';
import { pct, plural } from '../../core/format';
import { canonReading, checkMeaning, checkReading } from '../answer';
import { KanjiStateService } from '../kanji-state.service';
import { ItemDetailsComponent } from '../shared/item-details/item-details.component';
import { DoneEntry, Parts, QueueEntry, SessionEngine, SessionMode, SessionResult } from './session-engine';

const MODES: Record<SessionMode, { title: string; note: string | null }> = {
  lesson: { title: 'Lesson quiz', note: 'Get each one right once to learn it.' },
  review: { title: 'Reviews', note: null },
  practice: { title: 'Practice', note: 'Practice never changes your SRS schedule.' },
};

/**
 * A lesson quiz, reviews or practice: meaning then reading, back to back.
 *
 *   Enter  submit, then Enter again to continue
 *   F      item info, once answered
 *
 * Completing an item saves it in the background: the next card never waits
 * for the server. The summary (done) waits for every save, so it reports what
 * was stored — and is not drawn at all if the learner has left meanwhile.
 * Reading answers are typed through wanakana (romaji turns into kana; a
 * trailing n stays n until Enter, when it becomes ん).
 */
@Component({
  selector: 'app-session',
  imports: [ItemDetailsComponent],
  templateUrl: './session.component.html',
  styleUrl: './session.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly kanji = inject(KanjiStateService);
  private readonly audio = inject(AudioService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly mode = input.required<SessionMode>();
  readonly items = input.required<CatalogItem[]>();
  readonly parts = input<Parts>('both');
  readonly shuffle = input(true);
  /** Every answer saved: the session's result, for its summary. */
  readonly done = output<SessionResult>();

  private readonly inputRef = viewChild.required<ElementRef<HTMLInputElement>>('answer');
  private readonly rootRef = viewChild.required<ElementRef<HTMLElement>>('root');

  private engine!: SessionEngine;
  private readonly pending: Promise<void>[] = [];
  private bound = false;
  private busy = false;
  private finished = false;
  private destroyed = false;

  readonly cfg = computed(() => MODES[this.mode()]);
  readonly card = signal<CatalogItem | null>(null);
  readonly part = signal<'meaning' | 'reading'>('meaning');
  readonly verdict = signal<'correct' | 'wrong' | null>(null);
  readonly close = signal(false);
  readonly feedback = signal('');
  readonly actionsShown = signal(false);
  readonly acceptShown = signal(false);
  readonly panelOpen = signal(false);
  readonly wrapping = signal(false);
  readonly counts = signal({ done: 0, left: 0, acc: '—', fill: 0 });

  readonly long = computed(() => [...(this.card()?.chars ?? '')].length > 4);

  ngOnInit(): void {
    this.engine = new SessionEngine(this.items(), this.parts(), this.shuffle());
  }

  ngAfterViewInit(): void {
    this.show();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.bindKana(false);
  }

  /* ------------------------------------------------------------ cards */

  private show(): void {
    if (!this.engine.show()) {
      this.finish();
      return;
    }
    const cur = this.engine.cur as QueueEntry;
    const part = this.engine.part;
    this.card.set(cur.it);
    this.part.set(part);
    this.verdict.set(null);
    this.close.set(false);
    this.feedback.set('');
    this.actionsShown.set(false);
    this.panelOpen.set(false);

    const el = this.inputRef().nativeElement;
    el.value = '';
    el.readOnly = false;
    el.placeholder = part === 'meaning' ? 'Answer in English' : 'Type the reading — romaji turns into kana';
    el.lang = part === 'reading' ? 'ja' : 'en';
    this.bindKana(part === 'reading');
    this.updateCounts();
    el.focus();
  }

  private bindKana(on: boolean): void {
    const el = this.inputRef().nativeElement;
    if (on && !this.bound) {
      bind(el, { IMEMode: 'toHiragana' });
      this.bound = true;
    } else if (!on && this.bound) {
      unbind(el);
      this.bound = false;
    }
  }

  private updateCounts(): void {
    const e = this.engine;
    const doneN = e.done.length;
    const left = e.queue.length;
    this.counts.set({
      done: doneN,
      left,
      acc: e.answered ? `${pct(e.right, e.answered)}%` : '—',
      fill: e.total ? (doneN / (doneN + left)) * 100 : 100,
    });
  }

  private shake(message: string): void {
    this.feedback.set(message);
    const root = this.rootRef().nativeElement;
    root.classList.remove('shake');
    void root.offsetWidth; // restart the animation
    root.classList.add('shake');
  }

  /** What was expected, shown after a miss or a near miss. */
  private expected(): string {
    const it = this.engine.cur?.it as CatalogItem;
    if (this.engine.part === 'meaning') {
      return this.kanji.acceptMeanings(it).join('; ');
    }
    if (it.type === 'kanji') {
      const bits: string[] = [];
      if (it.on?.length) {
        bits.push(`on: ${it.on.join('、')}`);
      }
      if (it.kun?.length) {
        bits.push(`kun: ${it.kun.join('、')}`);
      }
      return bits.join('  ·  ');
    }
    return this.kanji.acceptReadings(it).join('、');
  }

  /* ----------------------------------------------------------- answers */

  private submit(): void {
    const e = this.engine;
    if (e.phase !== 'ask' || this.busy || !e.cur) {
      return;
    }
    const el = this.inputRef().nativeElement;
    let v = el.value;
    if (e.part === 'reading') {
      v = toKana(v); // a trailing n → ん
    }
    const typed = v.trim();
    const it = e.cur.it;
    const res =
      e.part === 'meaning'
        ? checkMeaning(typed, this.kanji.acceptMeanings(it), this.kanji.known())
        : checkReading(typed, this.kanji.acceptReadings(it));
    if (res.verdict === 'invalid') {
      this.shake(res.message ?? '');
      return;
    }
    e.submit(typed, res);
    el.value = typed;
    el.readOnly = true;
    this.rootRef().nativeElement.classList.remove('shake');

    if (res.verdict === 'correct') {
      this.verdict.set('correct');
      if (res.close) {
        this.close.set(true);
        this.feedback.set(`Close enough — it's “${this.expected()}”.`);
      }
      if (e.part === 'reading' && it.audio && this.kanji.settings().autoplay !== false) {
        this.audio.play(it.audio);
      }
    } else {
      this.verdict.set('wrong');
      this.feedback.set(`The answer: ${this.expected()}`);
    }
    this.actionsShown.set(true);
    this.acceptShown.set(e.verdict === 'wrong');
    this.updateCounts();
    el.focus();
  }

  /** "My answer was right": keep it as a synonym / extra reading, and count it. */
  async acceptMine(): Promise<void> {
    const e = this.engine;
    if (e.phase !== 'shown' || e.verdict !== 'wrong' || this.busy || !e.cur) {
      return;
    }
    this.busy = true;
    const it = e.cur.it;
    const typed = e.typed;
    const meaning = e.part === 'meaning';
    try {
      const r = await this.api.item(it.id, meaning ? { addSynonym: typed } : { addReading: canonReading(typed) });
      this.kanji.setItemState(it.id, r.state);
      e.accept();
      this.verdict.set('correct');
      this.feedback.set(
        meaning ? `Added “${typed}” as one of your synonyms for ${it.chars}.` : `Added ${typed} as an accepted reading for ${it.chars}.`,
      );
      this.acceptShown.set(false);
      this.updateCounts();
    } catch (err) {
      this.feedback.set(`Could not save that: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      this.busy = false;
      this.inputRef().nativeElement.focus();
    }
  }

  private advance(): void {
    const e = this.engine;
    if (e.phase !== 'shown' || this.busy) {
      return;
    }
    const completed = e.advance();
    if (completed) {
      this.save(completed);
    }
    if (!this.finished) {
      this.show();
    }
  }

  /** Saved in the background: the next card never waits for the server. */
  private save(entry: DoneEntry): void {
    const mode = this.mode();
    const wrong = entry.wrongM + entry.wrongR;
    const call =
      mode === 'lesson'
        ? this.api.learn(entry.it.id)
        : mode === 'review'
          ? this.api.review(entry.it.id, entry.wrongM, entry.wrongR)
          : this.api.practice(entry.it.id, wrong === 0, wrong);
    this.pending.push(
      call.then(
        (r) => {
          this.kanji.setItemState(entry.it.id, r.state);
          entry.from = r.from;
          entry.to = r.to;
        },
        (err: unknown) => {
          entry.error = err instanceof Error ? err.message : String(err);
        },
      ),
    );
  }

  toggleInfo(): void {
    if (this.engine.phase !== 'shown') {
      return;
    }
    this.panelOpen.update((open) => !open);
  }

  listen(): void {
    this.audio.play(this.engine.cur?.it.audio);
  }

  private finish(early = false): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.bindKana(false);
    this.inputRef().nativeElement.readOnly = true;
    this.feedback.set(this.pending.length ? 'Saving…' : '');
    const e = this.engine;
    void Promise.allSettled(this.pending).then(() => {
      // Left for another screen while saving: the saves landed, keep that screen.
      if (this.destroyed) {
        return;
      }
      this.done.emit({ mode: this.mode(), done: e.done, answered: e.answered, right: e.right, unfinished: e.halfAnswered(), early });
    });
  }

  /* ------------------------------------------------------------ buttons */

  go(): void {
    if (this.engine.phase === 'ask') {
      this.submit();
    } else {
      this.advance();
    }
  }

  wrapUp(): void {
    this.wrapping.set(true);
    const what = this.engine.wrapUp();
    if (what === 'finish') {
      this.finish(true);
    } else if (what === 'next') {
      this.show();
    }
  }

  end(): void {
    const half = this.engine.halfAnswered();
    if (half && !confirm(`Stop now? ${plural(half, 'half-answered item')} will not be saved.`)) {
      return;
    }
    this.finish(true);
  }

  /* ------------------------------------------------------------- keys */

  onKey(event: KeyboardEvent): void {
    if (this.finished) {
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      this.go();
    } else if (this.engine.phase === 'shown' && (event.key === 'f' || event.key === 'F')) {
      event.preventDefault();
      this.toggleInfo();
    }
  }

  /** Enter and F work even when the focus has wandered to a button. */
  @HostListener('document:keydown', ['$event'])
  onDocKey(event: KeyboardEvent): void {
    const t = event.target as HTMLElement | null;
    if (t === this.inputRef().nativeElement || (t && /^(TEXTAREA|INPUT|SELECT)$/.test(t.tagName))) {
      return;
    }
    if (!this.host.nativeElement.isConnected) {
      return;
    }
    this.onKey(event);
  }
}
