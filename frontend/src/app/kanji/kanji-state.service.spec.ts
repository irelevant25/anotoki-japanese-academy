import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import fixture from '../../testing/catalog.fixture.json';
import { ApiService } from '../core/api/api.service';
import { Catalog, ItemState, Progress, Summary } from '../core/api/api.types';
import { VisitorKey } from '../core/auth/visitor-key';
import { KanjiStateService } from './kanji-state.service';

const catalog = { ...(fixture as unknown as Catalog), stages: [], groups: [] } as Catalog;
const NOW = Date.now();

function state(stage: number, nextReview: number | null, extra: Partial<ItemState> = {}): ItemState {
  const tally = { correct: 0, incorrect: 0 };
  return {
    stage,
    learnedAt: NOW - 3600e3,
    nextReview,
    lastReviewAt: null,
    burnedAt: null,
    reviews: { meaning: tally, reading: tally },
    streak: { meaning: 0, reading: 0 },
    practice: { ...tally, last: null },
    lastWrongAt: null,
    notes: { meaning: '', reading: '' },
    synonyms: [],
    extraReadings: [],
    ...extra,
  };
}

/** 一 learned and due, 二 learned for later; the synonym "numero uno" for 一. */
const PROGRESS: Progress = {
  settings: { batchSize: 5, lessonTypes: 'both', autoplay: true },
  items: {
    'k:一': state(1, NOW - 60e3, { synonyms: ['numero uno'] }),
    'k:二': state(2, NOW + 3600e3),
  },
  summary: { reviewsDue: 1 } as Summary,
};

describe('KanjiStateService', () => {
  let kanji: KanjiStateService;
  let asked: string[];

  beforeEach(async () => {
    asked = [];
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        {
          provide: ApiService,
          useValue: {
            catalog: () => (asked.push('catalog'), Promise.resolve(catalog)),
            progress: () => (asked.push('progress'), Promise.resolve(PROGRESS)),
          },
        },
      ],
    });
    kanji = TestBed.inject(KanjiStateService);
    await kanji.load();
  });

  it('loads the progress again when what this browser studied without signing in moved into the account after it was loaded', async () => {
    TestBed.tick();
    expect(asked).toEqual(['catalog', 'progress']);
    TestBed.inject(VisitorKey).moves.update((n) => n + 1);
    TestBed.tick();
    await vi.waitFor(() => expect(asked).toEqual(['catalog', 'progress', 'progress']));
    TestBed.tick();
    expect(asked, 'once a move').toHaveLength(3);
  });

  it('loads the catalog once, the progress every time', async () => {
    await kanji.load();
    expect(asked).toEqual(['catalog', 'progress', 'progress']);
    expect(kanji.items().length).toBe(catalog.items.length);
    expect(kanji.reviewsDue()).toBe(1);
  });

  it('knows what is learned and what is due', () => {
    expect(kanji.isLearned('k:一')).toBe(true);
    expect(kanji.isLearned('k:三')).toBe(false);
    expect(kanji.isDue('k:一')).toBe(true);
    expect(kanji.isDue('k:二')).toBe(false);
  });

  it('offers vocabulary only once its kanji are learned', () => {
    const one = kanji.item('v:一') as NonNullable<ReturnType<KanjiStateService['item']>>;
    expect(kanji.isAvailable(one)).toBe(true);
    const locked = kanji.items().find((it) => it.type === 'vocab' && (it.kanji ?? []).some((c) => !kanji.isLearned(`k:${c}`)));
    expect(locked && kanji.isAvailable(locked)).toBe(false);
  });

  it('lists the next lessons in course order, as chosen', () => {
    const next = kanji.nextLessons({ count: 3 });
    expect(next.map((it) => it.id)).not.toContain('k:一');
    expect(next.every((it) => kanji.isAvailable(it))).toBe(true);
    const orders = next.map((it) => it.order);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);

    expect(kanji.nextLessons({ count: 4, types: 'vocab' }).every((it) => it.type === 'vocab')).toBe(true);
    expect(kanji.nextLessons({ count: 50, lessons: [4] }).every((it) => it.lesson === 4)).toBe(true);
  });

  it('accepts the learner’s own synonyms', () => {
    const one = kanji.item('k:一') as NonNullable<ReturnType<KanjiStateService['item']>>;
    expect(kanji.acceptMeanings(one)).toEqual([...one.meanings, 'numero uno']);
  });
});
