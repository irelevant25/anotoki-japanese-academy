import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  Injector,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { SiteStatus } from '@anotoki/lib/migrations';
import { TranslatePipe, TranslationService } from '@anotoki/lib/translations';
import { AlertComponent } from '@anotoki/lib/ui/alert';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { CardComponent } from '@anotoki/lib/ui/card';
import { CheckboxComponent, TextFieldComponent } from '@anotoki/lib/ui/forms';
import { SegmentedComponent, SegmentedOption } from '@anotoki/lib/ui/segmented';
import { ApiError, ApiService, toApiError } from '../core/api/api.service';
import { Attempt, Breakdown, ExamMeta, ExamPaper, ExamQuestion, ExamResult } from '../core/api/api.types';
import { clipUrl } from '../core/audio.service';
import { AuthService } from '../core/auth/auth.service';
import { PrivateLinksService } from '../core/auth/private-links.service';
import { fmtClockSince, fmtDuration } from '../core/format';
import { errorKey, errorParams } from '../core/i18n/error-text';
import { LocalDatePipe } from '../core/i18n/local-date.pipe';
import { TimeWording } from '../core/i18n/time-wording';
import { SavesInFlight } from '../core/saves-in-flight.service';
import { readTabStorage, writeTabStorage } from '../core/storage';
import { materialLang } from '../kanji/answer';

type Screen = 'setup' | 'test' | 'result';

/** What the player says about a recording: a tail of the run-time family `exam.play.` (core/i18n/dynamic-keys.ts). */
type PlayState = 'tap' | 'playing' | 'again' | 'unavailable';

/**
 * What the setup screen says went wrong — never a sentence. A key alone is one
 * of the page's own ("Pick at least one section."); a failed request alone is
 * worded from its code, never in the server's English; both together are the
 * second inside the first ("Could not load the exam: {reason}").
 */
interface SetupError {
  key?: string;
  error?: ApiError;
}

/** One line of a result's breakdown as the page draws it: named from its key, never with the server's English name. */
interface Bar {
  key: string | number;
  name: string;
  pct: number;
  level: 'good' | 'ok' | 'bad';
  score: string;
}

/** The paper lengths on offer: how many questions, and the key of its name (which holds the number as {n}). */
const SIZES: [number, string][] = [
  [40, 'exam.size.quick'],
  [120, 'exam.size.standard'],
  [250, 'exam.size.full'],
  [500, 'exam.size.marathon'],
];

/**
 * What the tagline says about the course, in one place: how many kanji it
 * teaches ({kanji}), and the lessons of its first ({a}–{b}) and second
 * ({c}–{d}) part. They fill `exam.tagline`.
 */
const COURSE = { kanji: 317, a: 1, b: 12, c: 13, d: 23 };

/** A key of the keyboard: a–d or 1–4 choose an option. */
const KEYS: Record<string, number> = { a: 0, b: 1, c: 2, d: 3, 1: 0, 2: 1, 3: 2, 4: 3 };

/** sessionStorage: the paper that was open when the site stopped for an update (ExamComponent.keepPaper()). */
export const KEPT_PAPER_KEY = 'academy-exam-kept-paper';

/** An open paper as this tab keeps it while the site is being updated: everything the page needs to put it back. */
export interface KeptPaper {
  /** Whose: the IAM user id signed in (AuthService.subject()); null for a visitor's. */
  who: string | null;
  exam: ExamPaper;
  idx: number;
  answers: Record<string, { choice: number | null; ms: number }>;
  flags: string[];
  startedAt: string | null;
  candidate: string;
}

/** A kept paper read back, or null for nothing kept - or anything that is not one (another version's, cut short). */
function keptPaperOf(raw: string | null): KeptPaper | null {
  if (!raw) {
    return null;
  }
  try {
    const kept = JSON.parse(raw) as Partial<KeptPaper> | null;
    const questions = kept?.exam?.questions;
    if (!kept || !Array.isArray(questions) || !questions.length || !kept.exam?.spec) {
      return null;
    }
    if (typeof kept.idx !== 'number' || kept.idx < 0 || kept.idx >= questions.length || !kept.answers || typeof kept.answers !== 'object' || !Array.isArray(kept.flags)) {
      return null;
    }
    return {
      who: typeof kept.who === 'string' ? kept.who : null,
      exam: kept.exam,
      idx: kept.idx,
      answers: kept.answers,
      flags: kept.flags.filter((flag): flag is string => typeof flag === 'string'),
      startedAt: typeof kept.startedAt === 'string' ? kept.startedAt : null,
      candidate: typeof kept.candidate === 'string' ? kept.candidate : '',
    };
  } catch {
    return null;
  }
}

/**
 * The exam: set up a paper, sit it, see the result. Multiple choice, with
 * listening questions. The paper comes without its answers; submitting echoes
 * its spec, and the server rebuilds the very paper to score it.
 *
 * Keys while sitting it: a–d or 1–4 choose, → or Enter next (finish at the
 * end), ← back, F flag, R or Space play the recording again.
 *
 * The frame is the app's own words, in the language on the page. The sections,
 * the two parts and the lessons are named from the ids the server sends
 * (`exam.section.<id>`, `exam.part.<id>`, `common.lesson`, `exam.greetings`);
 * the names it sends beside them are not used. The material — questions,
 * hints, options, explanations — is what it is in every language, and says
 * which language that is (`lang`); so do the marks PASS and FAIL.
 *
 * Nothing worded is kept: state holds keys, kinds and ApiErrors, and the
 * wording happens in the template or in a computed(), so it follows the
 * language. The two native dialogs are worded at the moment they are raised.
 *
 * A paper open while the site stops for an update stays the person's: the
 * anotoki library's gate takes the page down (it makes the pages only while
 * the site is open), and its own page loads the page afresh once the site is
 * back - so the paper is kept for this tab as the page goes (ngOnDestroy(),
 * keepPaper(), sessionStorage) and put back as it was when the exam opens
 * again, in that fresh page (the library's page reloads without making the
 * pages first: anotoki-lib 0.2.0); its handing in, refused meanwhile, raises
 * no dialog (the library's page says what is going on).
 *
 * The setup and the result are drawn with the kit (cards, its text fields,
 * rows of its buttons for the choices - the chosen ones pressed -, an alert
 * for what went wrong, the table, a segmented choice for the review); the
 * paper itself is the app's own (the question, its options, the player, the
 * grid of questions), with the kit's buttons and tick box under it.
 */
@Component({
  selector: 'app-exam',
  imports: [AlertComponent, ButtonComponent, CardComponent, CheckboxComponent, LocalDatePipe, NgTemplateOutlet, SegmentedComponent, TextFieldComponent, TranslatePipe],
  templateUrl: './exam.component.html',
  styleUrl: './exam.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  /**
   * Where signing out learns of a paper open and not handed in (it would be
   * lost: the question signOut.examOpen), and of one on its way to be scored.
   */
  private readonly saves = inject(SavesInFlight);
  private readonly unwatch = this.saves.watch(() => (this.screen() === 'test' && !this.quitting() ? 'signOut.examOpen' : null));
  readonly privateLinks = inject(PrivateLinksService);
  readonly i18n = inject(TranslationService);
  private readonly wording = inject(TimeWording);
  private readonly auth = inject(AuthService);
  /** Where the site stands (the anotoki library's): while it is not ready, an open paper is kept for when it is back. */
  private readonly site = inject(SiteStatus);
  private readonly injector = inject(Injector);

  private readonly audioRef = viewChild.required<ElementRef<HTMLAudioElement>>('audio');

  readonly sizes = SIZES;
  readonly course = COURSE;
  /** Which language a piece of the material is in: Japanese when it holds kana or kanji, else English. */
  readonly materialLang = materialLang;
  readonly screen = signal<Screen>('setup');

  /* setup */
  readonly meta = signal<ExamMeta | null>(null);
  readonly size = signal(250);
  readonly books = signal<Set<number>>(new Set([1]));
  readonly lessons = signal<Set<number>>(new Set());
  readonly sections = signal<Set<string>>(new Set());
  readonly candidate = signal('');
  readonly seed = signal('');
  readonly setupErr = signal<SetupError | null>(null);
  readonly building = signal(false);
  readonly history = signal<Attempt[] | null>(null);

  /* test */
  readonly exam = signal<ExamPaper | null>(null);
  readonly idx = signal(0);
  readonly answers = signal<Record<string, { choice: number | null; ms: number }>>({});
  readonly flags = signal<Set<string>>(new Set());
  readonly clock = signal('0:00');
  readonly quitting = signal(false);
  readonly playing = signal(false);
  readonly playState = signal<PlayState>('tap');
  readonly playerErr = signal(false);
  private shownAt = 0;
  private startedAt: string | null = null;
  /** Taken down (ngOnDestroy()): a step on to the next question still waiting its moment does nothing then. */
  private gone = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly preloaded = new Set<string>();

  /* result */
  readonly result = signal<ExamResult | null>(null);
  readonly reviewMode = signal<'wrong' | 'all'>('wrong');
  /** What the review shows, as the segmented choice offers it: the missed questions, or every one. */
  readonly reviewModes = computed<SegmentedOption[]>(() => [
    { value: 'wrong', label: this.i18n.t('exam.result.missedOnly') },
    { value: 'all', label: this.i18n.t('exam.result.everything') },
  ]);

  /** "11,523 questions in the bank · 15 sections · 3 attempts recorded": three counts, each a phrase of its own. */
  readonly bankLine = computed(() => {
    const m = this.meta();
    return m
      ? this.i18n.t('exam.bank', {
          questions: this.i18n.plural('exam.bankQuestions', m.bankSize),
          sections: this.i18n.plural('exam.bankSections', m.sections.length),
          attempts: this.i18n.plural('exam.bankAttempts', m.attempts),
        })
      : '';
  });
  /** The two parts of the course: each named from its id, with what it holds as its tooltip ("5,204 questions · lessons 0–12"). */
  readonly parts = computed(() =>
    (this.meta()?.books ?? []).map((bk) => ({
      id: bk.id,
      name: this.i18n.t('exam.part.' + bk.id),
      title: this.i18n.t('exam.partLine', {
        questions: this.i18n.plural('exam.partQuestions', bk.available),
        lessons: this.i18n.t('exam.lessonRange', { from: bk.lessons[0], to: bk.lessons[bk.lessons.length - 1] }),
      }),
    })),
  );
  /** What went wrong on the setup screen, in the language on the page; the server's own sentence is never in it. */
  readonly setupErrText = computed(() => {
    const err = this.setupErr();
    if (!err) {
      return '';
    }
    if (!err.error) {
      return err.key ? this.i18n.t(err.key) : '';
    }
    return err.key ? this.i18n.t(err.key, { reason: this.reason(err.error) }) : this.reason(err.error);
  });
  /** The reason the server gives the owner's own computer, and nobody else: English, shown small after the page's own words. */
  readonly setupErrDetail = computed(() => this.setupErr()?.error?.body.detail || '');
  /** Lesson chips follow the chosen part(s). */
  readonly lessonChoices = computed(() => (this.meta()?.lessons ?? []).filter((l) => this.books().has(l.book)));
  readonly q = computed<ExamQuestion | null>(() => this.exam()?.questions[this.idx()] ?? null);
  readonly total = computed(() => this.exam()?.questions.length ?? 0);
  readonly isLast = computed(() => this.idx() === this.total() - 1);
  readonly progress = computed(() => (this.total() ? ((this.idx() + 1) / this.total()) * 100 : 0));
  readonly chosen = computed(() => {
    const q = this.q();
    return q ? this.answers()[q.id]?.choice ?? null : null;
  });
  /** The section of the question shown, named from its id. */
  readonly sectionTag = computed(() => {
    const q = this.q();
    return q ? this.i18n.t('exam.section.' + q.section) : '';
  });
  /** The lesson of the question shown. */
  readonly lessonTag = computed(() => {
    const q = this.q();
    return q ? this.lessonLabel(q.lesson) : '';
  });
  /** "press R to replay", cut where the key stands: [before, after, whether the sentence names the key at all]. */
  readonly replayHint = computed(() => this.i18n.around('exam.replayHint', 'key'));
  readonly sectionBars = computed(() => (this.result()?.bySection ?? []).map((g) => this.bar(g, this.i18n.t('exam.section.' + g.key))));
  readonly lessonBars = computed(() => (this.result()?.byLesson ?? []).map((g) => this.bar(g, this.lessonLabel(Number(g.key)))));
  /** The questions to look over, each with its label: "Q12 · Particles", the section named from its id. */
  readonly reviewRows = computed(() =>
    (this.result()?.review ?? [])
      .filter((r) => this.reviewMode() === 'all' || !r.correct)
      .map((r) => ({ ...r, label: this.i18n.t('exam.result.rowLabel', { n: r.n, section: this.i18n.t('exam.section.' + r.sectionId) }) })),
  );

  async ngOnInit(): Promise<void> {
    this.putBackKeptPaper();
    await this.loadMeta();
  }

  ngOnDestroy(): void {
    this.gone = true;
    // Taken down while the site is not ready - the anotoki library's gate makes
    // the pages only while it is open, so this is how a paper on the screen
    // ends when an update stops the site (or its settings go): kept for this
    // tab, as it is. Left any other way, it goes, as it always has.
    if (this.site.blocked()) {
      this.keepPaper();
    } else {
      writeTabStorage(KEPT_PAPER_KEY, null);
    }
    this.unwatch();
    this.stopClock();
    this.audioRef().nativeElement.pause();
  }

  /**
   * The paper on the screen, kept for this tab while the site is not ready,
   * with the time on the question shown so far. Nothing while none is open.
   */
  private keepPaper(): void {
    const exam = this.exam();
    if (this.screen() !== 'test' || !exam) {
      return;
    }
    const answers = { ...this.answers() };
    const q = this.q();
    if (q && this.shownAt) {
      const dt = Date.now() - this.shownAt;
      answers[q.id] = answers[q.id] ? { ...answers[q.id], ms: answers[q.id].ms + dt } : { choice: null, ms: dt };
    }
    const kept: KeptPaper = {
      who: this.auth.subject(),
      exam,
      idx: this.idx(),
      answers,
      flags: [...this.flags()],
      startedAt: this.startedAt,
      candidate: this.candidate(),
    };
    writeTabStorage(KEPT_PAPER_KEY, JSON.stringify(kept));
  }

  /**
   * The paper this tab kept (keepPaper()) back on the screen, on its question,
   * with its answers, flags and clock - for the person it was kept for, or for
   * whoever signs in where a visitor kept it (their studying moves into the
   * account too). Anybody else's, or what is no paper, goes at once.
   *
   * The copy is used once: from here on the paper is an open paper like any
   * other, which a page loaded afresh does not keep. (Until anotoki-lib 0.2.0
   * the library's page let the gate make the pages again in the page about to
   * reload, so the copy had to stay and follow the paper; it reloads without
   * that now.)
   */
  private putBackKeptPaper(): void {
    const kept = keptPaperOf(readTabStorage(KEPT_PAPER_KEY));
    writeTabStorage(KEPT_PAPER_KEY, null);
    if (!kept || (kept.who !== null && kept.who !== this.auth.subject())) {
      return;
    }
    this.exam.set(kept.exam);
    this.idx.set(kept.idx);
    this.answers.set(kept.answers);
    this.flags.set(new Set(kept.flags));
    this.candidate.set(kept.candidate);
    this.startedAt = kept.startedAt;
    this.show('test');
    const since = kept.startedAt ? Date.parse(kept.startedAt) : NaN;
    // Its recording and its clock once the paper is drawn (the player is part of it).
    afterNextRender(
      () => {
        this.render();
        this.startClock(Number.isFinite(since) ? since : Date.now());
      },
      { injector: this.injector },
    );
  }

  /* ------------------------------------------------------------- setup */

  private async loadMeta(): Promise<void> {
    try {
      const meta = await this.api.meta();
      this.meta.set(meta);
      this.sections.set(new Set(meta.sections.map((s) => s.id)));
      this.resetLessons();
    } catch (e) {
      this.setupErr.set({ key: 'exam.error.load', error: toApiError(e) });
    }
  }

  /** Every lesson of the chosen parts, all selected. */
  private resetLessons(): void {
    this.lessons.set(new Set(this.lessonChoices().map((l) => l.id)));
  }

  /** A failed request in the reader's language, as a whole sentence: from its code, never the server's own words. */
  private reason(error: ApiError): string {
    return this.i18n.t(errorKey(error), errorParams(error));
  }

  /**
   * "Greetings" for lesson 0, else "Lesson 6": the app's own names, from the
   * lesson's number. Only ever called from the template or a computed(), so
   * what it answers follows the language.
   */
  lessonLabel(lesson: number): string {
    return lesson === 0 ? this.i18n.t('exam.greetings') : this.i18n.t('common.lesson', { n: lesson });
  }

  toggleBook(id: number): void {
    const next = new Set(this.books());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    if (!next.size) {
      return; // never leave nothing selected
    }
    this.books.set(next);
    this.resetLessons();
  }

  toggleLesson(id: number): void {
    this.lessons.update((set) => toggled(set, id));
  }

  toggleSection(id: string): void {
    this.sections.update((set) => toggled(set, id));
  }

  allLessons(on: boolean): void {
    this.lessons.set(on ? new Set(this.lessonChoices().map((l) => l.id)) : new Set());
  }

  allSections(on: boolean): void {
    this.sections.set(on ? new Set((this.meta()?.sections ?? []).map((s) => s.id)) : new Set());
  }

  async toggleHistory(): Promise<void> {
    if (this.history() !== null) {
      this.history.set(null);
      return;
    }
    try {
      this.history.set(await this.api.attempts());
    } catch (e) {
      this.setupErr.set({ key: 'exam.error.history', error: toApiError(e) });
    }
  }

  reportUrl(id: string): string {
    return `/report/${encodeURIComponent(id)}`;
  }

  /* -------------------------------------------------------------- exam */

  async start(): Promise<void> {
    this.setupErr.set(null);
    if (!this.sections().size) {
      this.setupErr.set({ key: 'exam.error.noSections' });
      return;
    }
    if (!this.lessons().size) {
      this.setupErr.set({ key: 'exam.error.noLessons' });
      return;
    }
    this.building.set(true);
    try {
      const exam = await this.api.paper({
        size: this.size(),
        books: [...this.books()],
        lessons: [...this.lessons()],
        sections: [...this.sections()],
        seed: this.seed().trim() || null,
      });
      if (!exam.questions.length) {
        this.setupErr.set({ key: 'exam.error.noQuestions' });
        return;
      }
      this.exam.set(exam);
      this.idx.set(0);
      this.answers.set({});
      this.flags.set(new Set());
      this.startedAt = new Date().toISOString();
      writeTabStorage(KEPT_PAPER_KEY, null);
      this.show('test');
      this.render();
      this.startClock();
    } catch (e) {
      this.setupErr.set({ error: toApiError(e) });
    } finally {
      this.building.set(false);
    }
  }

  private show(screen: Screen): void {
    this.screen.set(screen);
    window.scrollTo(0, 0);
  }

  /** The clock of the paper, counting from $t0 (its start, for a paper put back). */
  private startClock(t0 = Date.now()): void {
    this.stopClock();
    const tick = (): void => this.clock.set(fmtClockSince(Math.floor((Date.now() - t0) / 1000)));
    tick();
    this.timer = setInterval(tick, 1000);
  }

  private stopClock(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** The time spent on the question shown, added to its answer (a merely visited question has one too, without a choice). */
  private recordTime(): void {
    const q = this.q();
    if (!q || !this.shownAt) {
      return;
    }
    const dt = Date.now() - this.shownAt;
    this.answers.update((a) => ({ ...a, [q.id]: a[q.id] ? { ...a[q.id], ms: a[q.id].ms + dt } : { choice: null, ms: dt } }));
    this.shownAt = 0;
  }

  go(i: number): void {
    if (i < 0 || i >= this.total()) {
      return;
    }
    this.recordTime();
    this.idx.set(i);
    this.render();
  }

  next(): void {
    if (this.isLast()) {
      void this.finish();
    } else {
      this.go(this.idx() + 1);
    }
  }

  /** The question on the screen: its recording, and the clock of its answer. */
  private render(): void {
    this.setupAudio(this.q());
    this.shownAt = Date.now();
  }

  choose(i: number): void {
    const q = this.q();
    if (!q) {
      return;
    }
    const dt = this.shownAt ? Date.now() - this.shownAt : 0;
    this.answers.update((a) => ({ ...a, [q.id]: { choice: i, ms: (a[q.id]?.ms || 0) + dt } }));
    this.shownAt = Date.now();
    // On by itself, so a long paper stays a flow rather than a chore - not
    // once the page is taken down (the library's page stands in for it).
    if (this.idx() < this.total() - 1) {
      setTimeout(() => {
        if (!this.gone && this.answers()[q.id]?.choice === i && this.q()?.id === q.id) {
          this.go(this.idx() + 1);
        }
      }, 170);
    }
  }

  toggleFlag(): void {
    const q = this.q();
    if (q) {
      this.flags.update((set) => toggled(set, q.id));
    }
  }

  /** The tick box under a question (the kit's): flagged as it now says, never the other way round. */
  setFlag(on: boolean): void {
    const q = this.q();
    if (q && on !== this.flags().has(q.id)) {
      this.toggleFlag();
    }
  }

  /** What the result's review shows: the missed questions, or every one (the segmented choice above it). */
  setReviewMode(mode: string): void {
    this.reviewMode.set(mode === 'all' ? 'all' : 'wrong');
  }

  gridClass(q: ExamQuestion, i: number): string {
    const a = this.answers()[q.id];
    return [a && a.choice !== null ? 'done' : '', this.flags().has(q.id) ? 'flag' : '', i === this.idx() ? 'cur' : ''].filter(Boolean).join(' ');
  }

  quit(): void {
    const done = Object.values(this.answers()).filter((a) => a.choice !== null).length;
    const left = this.total() - done;
    // The browser's own dialog: worded now, in the language on the page (its OK and Cancel are the browser's).
    if (!left || confirm(this.i18n.plural('exam.confirmFinish', left))) {
      void this.finish();
    }
  }

  /* ------------------------------------------------------------- audio */

  private setupAudio(q: ExamQuestion | null): void {
    const audio = this.audioRef().nativeElement;
    if (!q?.audio) {
      audio.pause();
      audio.removeAttribute('src');
      return;
    }
    this.playerErr.set(false);
    this.playState.set('playing');
    audio.src = clipUrl(q.audio);
    this.playAudio();
    this.preloadNext();
  }

  playAudio(): void {
    const audio = this.audioRef().nativeElement;
    if (!audio.getAttribute('src')) {
      return;
    }
    audio.currentTime = 0;
    // Autoplay can still be refused; the question stays answerable by tapping.
    audio.play()?.catch(() => this.playState.set('tap'));
  }

  /** The next clip, fetched while the current question is on screen. */
  private preloadNext(): void {
    const next = this.exam()?.questions[this.idx() + 1];
    if (!next?.audio) {
      return;
    }
    const url = clipUrl(next.audio);
    if (this.preloaded.has(url)) {
      return;
    }
    this.preloaded.add(url);
    const a = new Audio();
    a.preload = 'auto';
    a.src = url;
  }

  onPlay(): void {
    this.playing.set(true);
    this.playState.set('playing');
  }

  onStop(): void {
    this.playing.set(false);
    this.playState.set('again');
  }

  onAudioError(): void {
    if (!this.audioRef().nativeElement.getAttribute('src')) {
      return; // the source was taken away (a question without a recording)
    }
    this.playerErr.set(true);
    this.playing.set(false);
    this.playState.set('unavailable');
  }

  listen(name: string | null): void {
    if (name) {
      new Audio(clipUrl(name)).play().catch(() => undefined);
    }
  }

  /* ------------------------------------------------------------ finish */

  async finish(): Promise<void> {
    // Once: Enter pressed again on the last question while this one is being
    // scored would send the paper, and store the attempt, a second time.
    if (this.quitting()) {
      return;
    }
    this.recordTime();
    this.stopClock();
    this.quitting.set(true);
    const exam = this.exam();
    if (!exam) {
      return;
    }
    let res: ExamResult;
    try {
      res = await this.saves.track(this.api.submit({
        // the spec echoed verbatim, so the server rebuilds this very paper
        spec: exam.spec,
        startedAt: this.startedAt,
        meta: { candidate: this.candidate().trim() },
        responses: this.answers(),
      }));
    } catch (e) {
      const error = toApiError(e);
      this.quitting.set(false);
      if (error.code === 'update_pending' || error.code === 'not_set_up') {
        // The site is being updated (or lost its settings): the anotoki
        // library's page takes the app's place and says so, without an error.
        // Its gate takes this page down then, which keeps the paper for when
        // the site is back (ngOnDestroy()).
        return;
      }
      // The browser's own dialog: worded now, from the failure's code. The
      // reason the server gives the owner's own computer follows, as it came.
      alert(this.i18n.t('exam.error.score', { reason: this.reason(error) }) + (error.body.detail ? `\n\n${error.body.detail}` : ''));
      return;
    }
    // Scored: nothing of it is kept any more (a copy kept while the answer was on its way).
    writeTabStorage(KEPT_PAPER_KEY, null);
    this.audioRef().nativeElement.pause();
    this.result.set(res);
    this.reviewMode.set('wrong');
    this.show('result');
  }

  /** A line of a breakdown under the name the page gives it. */
  private bar(g: Breakdown, name: string): Bar {
    const pct = Math.round(g.pct);
    return {
      key: g.key,
      name,
      pct,
      level: pct >= 80 ? 'good' : pct >= 60 ? 'ok' : 'bad',
      score: this.i18n.t('exam.result.bar', { pct, right: g.right, total: g.total }),
    };
  }

  duration(ms: number): string {
    return fmtDuration(this.wording, ms);
  }

  /** 3.4s / 3,4 s: the seconds a question took on average, to one decimal place. */
  perQuestion(ms: number): string {
    return this.i18n.t('time.durationSeconds', { s: this.i18n.number(ms / 1000, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) });
  }

  /** "New test": the setup again, as it first was. */
  async again(): Promise<void> {
    this.exam.set(null);
    this.result.set(null);
    this.history.set(null);
    this.answers.set({});
    this.flags.set(new Set());
    this.quitting.set(false);
    this.size.set(250);
    this.books.set(new Set([1]));
    this.candidate.set('');
    this.seed.set('');
    this.setupErr.set(null);
    this.show('setup');
    await this.loadMeta();
  }

  /* -------------------------------------------------------------- keys */

  @HostListener('document:keydown', ['$event'])
  onKey(event: KeyboardEvent): void {
    if (this.screen() !== 'test') {
      return;
    }
    if ((event.target as HTMLElement | null)?.tagName === 'INPUT') {
      return;
    }
    const k = event.key.toLowerCase();
    const q = this.q();
    if (k in KEYS) {
      if (q && KEYS[k] < q.options.length) {
        event.preventDefault();
        this.choose(KEYS[k]);
      }
    } else if (event.key === 'ArrowRight' || event.key === 'Enter') {
      event.preventDefault();
      this.next();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.go(this.idx() - 1);
    } else if (k === 'f') {
      this.toggleFlag();
    } else if ((k === 'r' || event.key === ' ') && q?.audio) {
      event.preventDefault();
      this.playAudio();
    }
  }
}

function toggled<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
}
