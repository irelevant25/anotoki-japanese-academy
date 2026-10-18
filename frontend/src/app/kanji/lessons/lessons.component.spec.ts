import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { ApiService } from '../../core/api/api.service';
import { CatalogItem, ItemState } from '../../core/api/api.types';
import { KanjiStateService } from '../kanji-state.service';
import { LessonsComponent } from './lessons.component';

const ENGLISH: Record<string, string> = {
  'kanji.tab.lessons': 'Lessons',
  'kanji.type.both': 'Kanji & vocabulary',
  'kanji.nothingToLearn': 'Nothing to learn',
  'kanji.tileNotLearned': 'not learned',
  'lessons.intro': 'Learn new items in small batches, then a short quiz fixes them in the SRS.',
  'lessons.batchSize': 'Batch size',
  'lessons.perBatch': '{n} per batch',
  'lessons.include': 'Include',
  'lessons.kanjiOnly': 'Kanji only',
  'lessons.vocabOnly': 'Vocabulary only',
  'lessons.from': 'From',
  'lessons.fromNote': 'Vocabulary opens up once its kanji are learned.',
  'lessons.courseOrder': 'Course order',
  'lessons.available': '{n} available',
  'lessons.nextUp': 'Next up',
  'lessons.nothingLeft': 'Nothing left to learn with these choices.',
  'lessons.start.one': 'Start 1 lesson',
  'lessons.start.few': 'Start {count} lessons',
  'lessons.start.other': 'Start {count} lessons',
};
const SLOVAK: Record<string, string> = {
  ...ENGLISH,
  'kanji.tab.lessons': 'Lekcie',
  'lessons.perBatch': '{n} na dávku',
  'lessons.available': 'dostupné: {n}',
  'lessons.start.one': 'Začať 1 lekciu',
  'lessons.start.few': 'Začať {count} lekcie',
  'lessons.start.other': 'Začať {count} lekcií',
};

function item(i: number): CatalogItem {
  return { id: `k:${i}`, type: 'kanji', chars: ['一', '二', '三', '四', '五', '六', '七'][i], no: i + 1, lesson: 3, courseLesson: 3, order: i, meanings: [`meaning ${i}`], readings: ['いち'], audio: null };
}
const ITEMS = [0, 1, 2, 3, 4, 5, 6].map(item);

describe('LessonsComponent', () => {
  let fixture: ComponentFixture<LessonsComponent>;
  let host: HTMLElement;
  let kanji: KanjiStateService;
  let warn: ReturnType<typeof vi.spyOn>;

  const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const texts = (selector: string): string[] => Array.from(host.querySelectorAll(selector)).map((el) => clean(el.textContent));
  const startButton = (): HTMLButtonElement => host.querySelector('#startLessons') as HTMLButtonElement;
  /** The batch sizes: the kit's segmented choice. */
  const sizes = (): HTMLButtonElement[] => Array.from(host.querySelectorAll<HTMLButtonElement>('#batchSize [role="radio"]'));
  /** The kit's choice chips of a row (the kinds: #lessonTypes; the lessons: #lessonFrom). */
  const chips = (row: string): HTMLButtonElement[] => Array.from(host.querySelectorAll<HTMLButtonElement>(`${row} [role="radio"]`));

  /** The first n items learned. */
  function learn(n: number): void {
    kanji.progress.set(Object.fromEntries(ITEMS.slice(0, n).map((it) => [it.id, { stage: 1 } as ItemState])));
  }

  async function open(slovak = false): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        slovak ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH),
        { provide: ApiService, useValue: { settings: () => Promise.resolve({ settings: { batchSize: 5, lessonTypes: 'both', autoplay: true } }) } },
      ],
    });
    kanji = TestBed.inject(KanjiStateService);
    kanji.items.set(ITEMS);
    kanji.lessons.set([3]);
    fixture = TestBed.createComponent(LessonsComponent);
    host = fixture.nativeElement;
    await fixture.whenStable();
  }

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('names the batch it starts by its number: the button the screenshots press', async () => {
    await open();
    expect(clean(startButton().textContent)).toBe('Start 5 lessons');
    expect(clean(startButton().textContent)).toMatch(/^Start \d+ lessons?$/);
    learn(6);
    await fixture.whenStable();
    expect(clean(startButton().textContent)).toBe('Start 1 lesson');
    expect(clean(startButton().textContent)).toMatch(/^Start \d+ lessons?$/);
    learn(7);
    await fixture.whenStable();
    expect(clean(startButton().textContent)).toBe('Nothing to learn');
    expect(startButton().disabled).toBe(true);
    expect(texts('.preview p')).toEqual(['Nothing left to learn with these choices.']);
    expect(warn, 'no key of the screen is without a string').not.toHaveBeenCalled();
  });

  it('…in Slovak in its three forms', async () => {
    await open(true);
    expect(clean(startButton().textContent)).toBe('Začať 5 lekcií');
    learn(4);
    await fixture.whenStable();
    expect(clean(startButton().textContent)).toBe('Začať 3 lekcie');
    learn(6);
    await fixture.whenStable();
    expect(clean(startButton().textContent)).toBe('Začať 1 lekciu');
    expect(texts('h1')).toEqual(['Lekcie']);
    expect(sizes().map((size) => clean(size.textContent))).toEqual(['3 na dávku', '5 na dávku', '10 na dávku']);
    // each lesson heard with how many of its items can be learned now, after the words it shows (WCAG 2.5.3)
    expect(host.querySelector('#lessonFrom [data-value="3"]')?.getAttribute('aria-label')).toBe('L3, dostupné: 1');
  });

  it('words its choices from keys, and keeps what the browser suites find them by', async () => {
    await open();
    expect(texts('h1')).toEqual(['Lessons']);
    // each row's name over it (the kit's labelled group, or its choice chips' own); the note under the lessons their hint
    expect(texts('.anotoki-labelled-group__label, .anotoki-field__label')).toEqual(['Batch size', 'Include', 'From', 'Next up']);
    expect(texts('#lessonFrom .anotoki-field__hint')).toEqual(['Vocabulary opens up once its kanji are learned.']);
    expect(sizes().map((size) => clean(size.textContent))).toEqual(['3 per batch', '5 per batch', '10 per batch']);
    expect(chips('#lessonTypes').map((el) => [el.getAttribute('data-value'), clean(el.textContent)])).toEqual([
      ['both', 'Kanji & vocabulary'],
      ['kanji', 'Kanji only'],
      ['vocab', 'Vocabulary only'],
    ]);
    expect(chips('#lessonFrom').map((el) => [el.getAttribute('data-value'), clean(el.textContent), el.getAttribute('aria-label')])).toEqual([
      ['course', 'Course order', null],
      ['3', 'L3', 'L3, 7 available'],
    ]);
  });

  it('draws its choices with the kit: the batch size a segmented choice, the kinds and the lessons its choice chips, one checked in each', async () => {
    await open();
    const checked = (): string[] => sizes().filter((size) => size.getAttribute('aria-checked') === 'true').map((size) => size.getAttribute('data-value') ?? '');
    const chosen = (row: string): string[] => chips(row).filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => clean(b.textContent));
    expect(checked(), 'the setting chosen').toEqual(['5']);
    expect(chosen('#lessonTypes')).toEqual(['Kanji & vocabulary']);
    expect(host.querySelector('#lessonTypes [data-value="both"]')?.classList.contains('anotoki-chip--on'), 'the chosen one marked').toBe(true);
    expect(chosen('#lessonFrom')).toEqual(['Course order']);
    // each row named by the words over it; the batch size's name said once, by the segmented choice itself
    const group = host.querySelector('#lessonTypes [role="radiogroup"]')!;
    expect(clean(host.querySelector('#' + group.getAttribute('aria-labelledby'))?.textContent)).toBe('Include');
    expect(host.querySelector('#batchSize [role="radiogroup"]')?.getAttribute('aria-label')).toBe('Batch size');
    expect(host.querySelector('#batchSize')?.closest('anotoki-labelled-group')?.getAttribute('role'), 'its group names nothing again').toBeNull();

    sizes()[2].click();
    (host.querySelector('#lessonTypes [data-value="kanji"]') as HTMLButtonElement).click();
    (host.querySelector('#lessonFrom [data-value="3"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(checked()).toEqual(['10']);
    expect(chosen('#lessonTypes')).toEqual(['Kanji only']);
    expect(chosen('#lessonFrom')).toEqual(['L3']);
    expect(clean(startButton().textContent), 'seven kanji, ten to a batch').toBe('Start 7 lessons');
  });
});
