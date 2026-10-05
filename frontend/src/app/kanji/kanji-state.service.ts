import { computed, effect, inject, Injectable, Injector, signal, untracked } from '@angular/core';
import { ApiService } from '../core/api/api.service';
import { VisitorKey } from '../core/auth/visitor-key';
import { CatalogItem, ItemState, LessonTypes, Settings, Stage, StageGroup, Summary } from '../core/api/api.types';
import { knownCoresOf } from './answer';

/**
 * The kanji trainer's state: the catalog (the same for everybody, loaded once)
 * and the person's progress, settings and dashboard summary (loaded again on
 * every screen change: due counts move with the clock). The item logic the
 * screens share lives here too. When what this browser studied without
 * signing in moves into the account after the progress was loaded (a move
 * asked again later: VisitorKey.moves), the progress is loaded again.
 */
@Injectable({ providedIn: 'root' })
export class KanjiStateService {
  private readonly api = inject(ApiService);

  readonly items = signal<CatalogItem[]>([]);
  readonly stages = signal<Stage[]>([]);
  readonly groups = signal<StageGroup[]>([]);
  readonly lessons = signal<number[]>([]);
  readonly progress = signal<Record<string, ItemState>>({});
  readonly settings = signal<Settings>({ batchSize: 5, lessonTypes: 'both', autoplay: true });
  readonly summary = signal<Summary | null>(null);

  readonly byId = computed(() => new Map(this.items().map((it) => [it.id, it])));
  /** Every meaning in the catalog, for the typo guard of the answer checking. */
  readonly known = computed(() => knownCoresOf(this.items()));
  /** The badge of Kanji in the top bar. */
  readonly reviewsDue = computed(() => this.summary()?.reviewsDue ?? 0);

  private catalogLoad: Promise<void> | null = null;
  private readonly injector = inject(Injector);

  constructor() {
    // Once something was loaded (VisitorKey, which asks the API, is made only then): a move after that loads it again.
    let movesSeen: number | null = null;
    effect(() => {
      if (this.summary() === null) {
        return;
      }
      const moves = untracked(() => this.injector.get(VisitorKey)).moves();
      if (movesSeen !== null && moves !== movesSeen) {
        untracked(() => void this.refresh().catch(() => undefined));
      }
      movesSeen = moves;
    });
  }

  /** The catalog (once), then the progress. */
  async load(): Promise<void> {
    this.catalogLoad ??= this.api.catalog().then(
      (c) => {
        this.stages.set(c.stages);
        this.groups.set(c.groups);
        this.lessons.set(c.lessons);
        this.items.set(c.items);
      },
      (e: unknown) => {
        this.catalogLoad = null; // asked again next time
        throw e;
      },
    );
    await this.catalogLoad;
    await this.refresh();
  }

  /** The person's progress, settings and summary, fresh. */
  async refresh(): Promise<void> {
    const p = await this.api.progress();
    this.progress.set(p.items || {});
    this.settings.set(p.settings);
    this.summary.set(p.summary);
  }

  /** The home page asks for the summary alone. */
  setSummary(summary: Summary): void {
    this.summary.set(summary);
  }

  setItemState(id: string, st: ItemState | undefined | null): void {
    if (st) {
      this.progress.update((p) => ({ ...p, [id]: st }));
    }
  }

  setSettings(settings: Settings): void {
    this.settings.set(settings);
  }

  /* ------------------------------------------------------ item logic */

  item(id: string): CatalogItem | undefined {
    return this.byId().get(id);
  }

  st(id: string): ItemState | null {
    return this.progress()[id] || null;
  }

  stage(id: string): number {
    return this.progress()[id]?.stage || 0;
  }

  isLearned(id: string): boolean {
    return this.stage(id) >= 1;
  }

  isDue(id: string, now = Date.now()): boolean {
    const s = this.progress()[id];
    return !!s && s.stage >= 1 && s.stage <= 8 && s.nextReview != null && s.nextReview <= now;
  }

  /** Kanji are always available; vocabulary once all of its kanji are learned (the server checks the same). */
  isAvailable(it: CatalogItem): boolean {
    return it.type === 'kanji' || (it.kanji ?? []).every((c) => this.isLearned(`k:${c}`));
  }

  groupOf(stage: number): string {
    return this.stages()[stage]?.group ?? 'lesson';
  }

  /** A stage's own name, from the catalog: never translated, and never drawn for stage 0 (the page says "not learned"). */
  stageName(stage: number): string {
    return this.stages()[stage]?.name ?? '—';
  }

  /** A stage group's own name (Apprentice, Guru, …), from the catalog: never translated. */
  groupName(id: string): string {
    return this.groups().find((g) => g.id === id)?.name ?? '—';
  }

  acceptMeanings(it: CatalogItem): string[] {
    return [...it.meanings, ...(this.st(it.id)?.synonyms || [])];
  }

  acceptReadings(it: CatalogItem): string[] {
    return [...it.readings, ...(this.st(it.id)?.extraReadings || [])];
  }

  /** The key of an item's type, for the page to word. */
  typeKey(it: CatalogItem): string {
    return it.type === 'kanji' ? 'kanji.type.kanji' : 'kanji.type.vocab';
  }

  /** The next lessons in course order, honouring the chosen lessons and types. */
  nextLessons({ count = 5, lessons = null, types = 'both' }: { count?: number; lessons?: number[] | null; types?: LessonTypes } = {}): CatalogItem[] {
    const want = lessons && lessons.length ? new Set(lessons.map(Number)) : null;
    const out: CatalogItem[] = [];
    for (const it of this.items()) {
      if (out.length >= count) {
        break;
      }
      if (this.isLearned(it.id)) {
        continue;
      }
      if (want && !want.has(it.lesson)) {
        continue;
      }
      if (types !== 'both' && it.type !== types) {
        continue;
      }
      if (!this.isAvailable(it)) {
        continue;
      }
      out.push(it);
    }
    return out;
  }

  availableLessonCount(lesson: number, types: LessonTypes = 'both'): number {
    return this.items().filter(
      (it) => it.lesson === lesson && !this.isLearned(it.id) && (types === 'both' || it.type === types) && this.isAvailable(it),
    ).length;
  }
}
