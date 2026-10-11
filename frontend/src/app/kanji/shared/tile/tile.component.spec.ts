import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { ApiService } from '../../../core/api/api.service';
import { CatalogItem, ItemState, Stage } from '../../../core/api/api.types';
import { KanjiStateService } from '../../kanji-state.service';
import { TileComponent } from './tile.component';

const ENGLISH = { 'kanji.tileNotLearned': 'not learned' };
const SLOVAK = { 'kanji.tileNotLearned': 'nenaučené' };

const ONE: CatalogItem = { id: 'k:一', type: 'kanji', chars: '一', no: 1, lesson: 3, courseLesson: 3, order: 1, meanings: ['one', 'a'], readings: ['いち'], audio: null };
const STAGES: Stage[] = [
  { n: 0, name: 'Lesson', group: 'lesson', hours: null },
  { n: 1, name: 'Apprentice I', group: 'apprentice', hours: 4 },
];

describe('TileComponent', () => {
  let fixture: ComponentFixture<TileComponent>;
  let kanji: KanjiStateService;

  const link = (): HTMLAnchorElement => (fixture.nativeElement as HTMLElement).querySelector('a') as HTMLAnchorElement;

  async function draw(withMeaning: boolean, slovak = false): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        slovak ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH),
        { provide: ApiService, useValue: {} },
      ],
    });
    kanji = TestBed.inject(KanjiStateService);
    kanji.items.set([ONE]);
    kanji.stages.set(STAGES);
    fixture = TestBed.createComponent(TileComponent);
    fixture.componentRef.setInput('item', ONE);
    fixture.componentRef.setInput('withMeaning', withMeaning);
    await fixture.whenStable();
  }

  it('says which language each half is in: the characters Japanese, the meaning English — and the link itself neither', async () => {
    await draw(true, true);
    expect(link().hasAttribute('lang')).toBe(false);
    expect(link().querySelector('.tc')?.getAttribute('lang')).toBe('ja');
    expect(link().querySelector('.tc')?.textContent).toBe('一');
    expect(link().querySelector('.tm')?.getAttribute('lang')).toBe('en');
    expect(link().querySelector('.tm')?.textContent).toBe('one');
    expect(link().textContent, 'no space between or around the two').toBe('一one');
  });

  it('is the characters alone where the meaning is not wanted', async () => {
    await draw(false);
    expect(link().textContent).toBe('一');
    expect(link().querySelector('.tm')).toBeNull();
    expect([...link().classList].sort()).toEqual(['g-none', 't-kanji', 'tile']);
  });

  it('says "not learned" in the app’s words for an item with no stage — never stage 0’s name', async () => {
    await draw(false);
    expect(link().title).toBe('一 — one · not learned');
    expect(link().title).not.toContain('Lesson');
  });

  it('…in the language on the page, and follows it', async () => {
    await draw(false, true);
    expect(link().title).toBe('一 — one · nenaučené');
    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await fixture.whenStable();
    expect(link().title).toBe('一 — one · not learned');
  });

  it('names a learned item’s stage by the catalog’s own name, in every language', async () => {
    await draw(false, true);
    kanji.progress.set({ 'k:一': { stage: 1 } as ItemState });
    await fixture.whenStable();
    expect(link().title).toBe('一 — one · Apprentice I');
    expect([...link().classList].sort()).toEqual(['g-apprentice', 't-kanji', 'tile']);
  });
});
