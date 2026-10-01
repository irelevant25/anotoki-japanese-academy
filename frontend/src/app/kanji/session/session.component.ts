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
import { ApiError, ApiService, toApiError } from '../../core/api/api.service';
import { CatalogItem } from '../../core/api/api.types';
import { AudioService } from '../../core/audio.service';
import { pct } from '../../core/format';
import { errorKey, errorParams } from '../../core/i18n/error-text';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslationParams, TranslationService } from '../../core/i18n/translation.service';
import { canonReading, CheckKind, checkMeaning, checkReading, materialLang } from '../answer';
import { KanjiStateService } from '../kanji-state.service';
import { ItemDetailsComponent } from '../shared/item-details/item-details.component';
import { Marks, Part, wordedParts } from '../shared/worded/worded-parts';
import { WordedComponent } from '../shared/worded/worded.component';
import { DoneEntry, Parts, QueueEntry, SessionEngine, SessionMode, SessionResult } from './session-engine';

/** What each kind of session is called, and what it says under its bar: keys, worded by the template. */
const MODES: Record<SessionMode, { title: string; note: string | null }> = {
  lesson: { title: 'session.mode.lesson', note: 'session.note.lesson' },
  review: { title: 'session.mode.review', note: null },
  practice: { title: 'session.mode.practice', note: 'session.note.practice' },
};

/** Why an answer was not taken as one, as the key of what to do instead (the family answer.check. of dynamic-keys.ts). */
const CHECK_KEYS: Record<CheckKind, string> = {
  readingEmpty: 'answer.check.readingEmpty',
  readingUnfinished: 'answer.check.readingUnfinished',
  readingInKanji: 'answer.check.readingInKanji',
  meaningNotEnglish: 'answer.check.meaningNotEnglish',
  meaningEmpty: 'answer.check.meaningEmpty',
};

/**
 * What the card says under the answer: a key and what fills it, never a
 * sentence — so it is worded in the language on the page, and follows a
 * change of it while it stands there.
 */
export interface Feedback {
  key: string;
  params?: TranslationParams;
  /** the material and the typed text inside the sentence, each with the language it is in */
  marks?: Marks;
  /** a save that failed: worded from its code, as the sentence's {reason} */
  error?: ApiError;
}

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
  imports: [ItemDetailsComponent, TranslatePipe, WordedComponent],
  templateUrl: './session.component.html',
  styleUrl: './session.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly kanji = inject(KanjiStateService);
  private readonly audio = inject(AudioService);
  private readonly i18n = inject(TranslationService);
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
  readonly feedback = signal<Feedback | null>(null);
  readonly actionsShown = signal(false);
  readonly acceptShown = signal(false);
  readonly panelOpen = signal(false);
  readonly wrapping = signal(false);
  /** `acc`: the share of answers right so far, in per cent; null before the first answer. */
  readonly counts = signal<{ done: number; left: number; acc: number | null; fill: number }>({ done: 0, left: 0, acc: null, fill: 0 });

  readonly long = computed(() => [...(this.card()?.chars ?? '')].length > 4);

  /** The feedback in the language on the page, cut where its material stands: each piece of that says which language it is in. */
  readonly feedbackParts = computed<Part[]>(() => {
    const f = this.feedback();
    if (!f) {
      return [];
    }
    const params = f.error ? { ...f.params, reason: this.i18n.t(errorKey(f.error), errorParams(f.error)) } : f.params;
    return wordedParts(this.i18n, f.key, f.marks ?? {}, params);
  });
  /** "{n} done" and "{n} left", each cut at its number: the template draws the number in bold. */
  readonly doneWords = computed(() => this.i18n.around('session.done', 'n'));
  readonly leftWords = computed(() => this.i18n.around('session.left', 'n'));

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
    this.feedback.set(null);
    this.actionsShown.set(false);
    this.panelOpen.set(false);

    const el = this.inputRef().nativeElement;
    el.value = '';
    el.readOnly = false;
    this.bindKana(part === 'reading');
    // after wanakana, which puts back the language the field had when it was bound
    el.lang = part === 'reading' ? 'ja' : 'en';
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
      acc: e.answered ? pct(e.right, e.answered) : null,
      fill: e.total ? (doneN / (doneN + left)) * 100 : 100,
    });
  }

  private shake(feedback: Feedback | null): void {
    this.feedback.set(feedback);
    const root = this.rootRef().nativeElement;
    root.classList.remove('shake');
    void root.offsetWidth; // restart the animation
    root.classList.add('shake');
  }

  /** What was expected, shown after a miss or a near miss: material, in English for a meaning and in Japanese for a reading. */
  private expected(): Part {
    const it = this.engine.cur?.it as CatalogItem;
    if (this.engine.part === 'meaning') {
      return { text: this.kanji.acceptMeanings(it).join('; '), lang: 'en' };
    }
    if (it.type === 'kanji') {
      const bits: string[] = [];
      if (it.on?.length) {
        bits.push(`on: ${it.on.join('、')}`);
      }
      if (it.kun?.length) {
        bits.push(`kun: ${it.kun.join('、')}`);
      }
      return { text: bits.join('  ·  '), lang: 'ja' };
    }
    return { text: this.kanji.acceptReadings(it).join('、'), lang: 'ja' };
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
      this.shake(res.kind ? { key: CHECK_KEYS[res.kind] } : null);
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
        this.feedback.set({ key: 'session.closeEnough', marks: { expected: this.expected() } });
      }
      if (e.part === 'reading' && it.audio && this.kanji.settings().autoplay !== false) {
        this.audio.play(it.audio);
      }
    } else {
      this.verdict.set('wrong');
      this.feedback.set({ key: 'session.theAnswer', marks: { expected: this.expected() } });
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
      this.feedback.set({
        key: meaning ? 'session.synonymAdded' : 'session.readingAdded',
        marks: { typed: { text: typed, lang: materialLang(typed) }, chars: { text: it.chars, lang: 'ja' } },
      });
      this.acceptShown.set(false);
      this.updateCounts();
    } catch (err) {
      this.feedback.set({ key: 'session.notSaved', error: toApiError(err) });
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
          entry.error = toApiError(err);
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
    this.feedback.set(this.pending.length ? { key: 'session.saving' } : null);
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
    // The browser's own dialog, worded at the moment it is raised, in the language on the page.
    if (half && !confirm(this.i18n.plural('session.confirmEnd', half))) {
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
