import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { ApiService } from '../core/api/api.service';
import { Attempt, Breakdown, ExamMeta, ExamPaper, ExamQuestion, ExamResult } from '../core/api/api.types';
import { clipUrl } from '../core/audio.service';
import { PrivateLinksService } from '../core/auth/private-links.service';
import { fmtClockSince, fmtDuration, plural } from '../core/format';

type Screen = 'setup' | 'test' | 'result';

const SIZES: [number, string][] = [
  [40, 'Quick check · 40'],
  [120, 'Standard · 120'],
  [250, 'Full exam · 250'],
  [500, 'Marathon · 500'],
];

/** A key of the keyboard: a–d or 1–4 choose an option. */
const KEYS: Record<string, number> = { a: 0, b: 1, c: 2, d: 3, 1: 0, 2: 1, 3: 2, 4: 3 };

/**
 * The exam: set up a paper, sit it, see the result. Multiple choice, with
 * listening questions. The paper comes without its answers; submitting echoes
 * its spec, and the server rebuilds the very paper to score it.
 *
 * Keys while sitting it: a–d or 1–4 choose, → or Enter next (finish at the
 * end), ← back, F flag, R or Space play the recording again.
 */
@Component({
  selector: 'app-exam',
  imports: [NgTemplateOutlet],
  templateUrl: './exam.component.html',
  styleUrl: './exam.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExamComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  readonly privateLinks = inject(PrivateLinksService);

  private readonly audioRef = viewChild.required<ElementRef<HTMLAudioElement>>('audio');

  readonly sizes = SIZES;
  readonly screen = signal<Screen>('setup');

  /* setup */
  readonly meta = signal<ExamMeta | null>(null);
  readonly size = signal(250);
  readonly books = signal<Set<number>>(new Set([1]));
  readonly lessons = signal<Set<number>>(new Set());
  readonly sections = signal<Set<string>>(new Set());
  readonly candidate = signal('');
  readonly seed = signal('');
  readonly setupErr = signal('');
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
  readonly playState = signal('Tap to listen');
  readonly playerErr = signal(false);
  private shownAt = 0;
  private startedAt: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly preloaded = new Set<string>();

  /* result */
  readonly result = signal<ExamResult | null>(null);
  readonly reviewMode = signal<'wrong' | 'all'>('wrong');

  readonly bankLine = computed(() => {
    const m = this.meta();
    return m ? `${m.bankSize.toLocaleString()} questions in the bank · ${m.sections.length} sections · ${plural(m.attempts, 'attempt')} recorded` : '';
  });
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
  readonly reviewRows = computed(() => (this.result()?.review ?? []).filter((r) => this.reviewMode() === 'all' || !r.correct));

  async ngOnInit(): Promise<void> {
    await this.loadMeta();
  }

  ngOnDestroy(): void {
    this.stopClock();
    this.audioRef().nativeElement.pause();
  }

  /* ------------------------------------------------------------- setup */

  private async loadMeta(): Promise<void> {
    try {
      const meta = await this.api.meta();
      this.meta.set(meta);
      this.sections.set(new Set(meta.sections.map((s) => s.id)));
      this.resetLessons();
    } catch (e) {
      this.setupErr.set(`Could not load the exam: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Every lesson of the chosen parts, all selected. */
  private resetLessons(): void {
    this.lessons.set(new Set(this.lessonChoices().map((l) => l.id)));
  }

  bookTitle(bk: ExamMeta['books'][number]): string {
    return `${bk.available.toLocaleString()} questions · lessons ${bk.lessons[0]}–${bk.lessons[bk.lessons.length - 1]}`;
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
      this.setupErr.set(`Could not load the past attempts: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  when(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  reportUrl(id: string): string {
    return `/report/${encodeURIComponent(id)}`;
  }

  /* -------------------------------------------------------------- exam */

  async start(): Promise<void> {
    this.setupErr.set('');
    if (!this.sections().size) {
      this.setupErr.set('Pick at least one section.');
      return;
    }
    if (!this.lessons().size) {
      this.setupErr.set('Pick at least one lesson.');
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
        throw new Error('No questions match that scope.');
      }
      this.exam.set(exam);
      this.idx.set(0);
      this.answers.set({});
      this.flags.set(new Set());
      this.startedAt = new Date().toISOString();
      this.show('test');
      this.render();
      this.startClock();
    } catch (e) {
      this.setupErr.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.building.set(false);
    }
  }

  private show(screen: Screen): void {
    this.screen.set(screen);
    window.scrollTo(0, 0);
  }

  private startClock(): void {
    const t0 = Date.now();
    this.stopClock();
    this.clock.set('0:00');
    this.timer = setInterval(() => this.clock.set(fmtClockSince(Math.floor((Date.now() - t0) / 1000))), 1000);
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
    // On by itself, so a long paper stays a flow rather than a chore.
    if (this.idx() < this.total() - 1) {
      setTimeout(() => {
        if (this.answers()[q.id]?.choice === i && this.q()?.id === q.id) {
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

  gridClass(q: ExamQuestion, i: number): string {
    const a = this.answers()[q.id];
    return [a && a.choice !== null ? 'done' : '', this.flags().has(q.id) ? 'flag' : '', i === this.idx() ? 'cur' : ''].filter(Boolean).join(' ');
  }

  lessonLabel(lesson: number): string {
    return lesson === 0 ? 'Greetings' : `Lesson ${lesson}`;
  }

  quit(): void {
    const done = Object.values(this.answers()).filter((a) => a.choice !== null).length;
    const left = this.total() - done;
    if (!left || confirm(`${plural(left, 'question')} unanswered. Finish and score anyway?`)) {
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
    this.playState.set('Playing…');
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
    audio.play()?.catch(() => this.playState.set('Tap to listen'));
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
    this.playState.set('Playing…');
  }

  onStop(): void {
    this.playing.set(false);
    this.playState.set('Listen again?');
  }

  onAudioError(): void {
    if (!this.audioRef().nativeElement.getAttribute('src')) {
      return; // the source was taken away (a question without a recording)
    }
    this.playerErr.set(true);
    this.playing.set(false);
    this.playState.set('Recording unavailable');
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
      res = await this.api.submit({
        // the spec echoed verbatim, so the server rebuilds this very paper
        spec: exam.spec,
        startedAt: this.startedAt,
        meta: { candidate: this.candidate().trim() },
        responses: this.answers(),
      });
    } catch (e) {
      alert(`Could not score the test: ${e instanceof Error ? e.message : String(e)}`);
      this.quitting.set(false);
      return;
    }
    this.audioRef().nativeElement.pause();
    this.result.set(res);
    this.reviewMode.set('wrong');
    this.show('result');
  }

  barClass(g: Breakdown): string {
    const p = Math.round(g.pct);
    return p >= 80 ? 'good' : p >= 60 ? 'ok' : 'bad';
  }

  round(n: number): number {
    return Math.round(n);
  }

  duration(ms: number): string {
    return fmtDuration(ms);
  }

  perQuestion(ms: number): string {
    return `${(ms / 1000).toFixed(1)}s`;
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
    this.setupErr.set('');
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
