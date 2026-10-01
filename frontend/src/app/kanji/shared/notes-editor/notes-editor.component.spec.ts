import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiError, ApiService } from '../../../core/api/api.service';
import { CatalogItem, ItemState } from '../../../core/api/api.types';
import { TranslationService } from '../../../core/i18n/translation.service';
import { provideTestTranslations } from '../../../core/testing/test-translations';
import { KanjiStateService } from '../../kanji-state.service';
import { NotesEditorComponent } from './notes-editor.component';

const ENGLISH: Record<string, string> = {
  'notes.title': 'Your notes',
  'notes.meaningLabel': 'Meaning note',
  'notes.readingLabel': 'Reading note',
  'notes.meaningPlaceholder': 'A mnemonic for the meaning.',
  'notes.readingPlaceholder': 'A mnemonic for the reading.',
  'notes.saved': 'saved',
  'notes.notSaved': 'not saved: {reason}',
  'error.offline': 'The server does not answer.',
  'error.no_such_item': 'No such item.',
  'error.unknown': 'Something went wrong.',
};
const SLOVAK: Record<string, string> = {
  'notes.title': 'Tvoje poznámky',
  'notes.meaningLabel': 'Poznámka k významu',
  'notes.readingLabel': 'Poznámka k čítaniu',
  'notes.meaningPlaceholder': 'Pomôcka na zapamätanie významu.',
  'notes.readingPlaceholder': 'Pomôcka na zapamätanie čítania.',
  'notes.saved': 'uložené',
  'notes.notSaved': 'neuložené: {reason}',
  'error.offline': 'Server neodpovedá.',
  'error.no_such_item': 'Taká položka neexistuje.',
  'error.unknown': 'Niečo sa pokazilo.',
};

const ONE: CatalogItem = { id: 'k:一', type: 'kanji', chars: '一', no: 1, lesson: 3, courseLesson: 3, order: 1, meanings: ['one'], readings: ['いち'], audio: null };
const STATE = { stage: 1, notes: { meaning: 'a line', reading: '' } } as ItemState;

describe('NotesEditorComponent', () => {
  let fixture: ComponentFixture<NotesEditorComponent>;
  let host: HTMLElement;
  let api: { item: ReturnType<typeof vi.fn> };
  let warn: ReturnType<typeof vi.spyOn>;

  const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const labels = (): string[] => Array.from(host.querySelectorAll('.lbl')).map((el) => clean(el.textContent));
  const areas = (): HTMLTextAreaElement[] => Array.from(host.querySelectorAll('textarea'));
  const statuses = (): string[] => Array.from(host.querySelectorAll('.lbl .small')).map((el) => el.textContent ?? '');

  /** Types into a note and leaves it: the note is saved on the way out. */
  async function write(index: number, value: string): Promise<void> {
    const area = areas()[index];
    area.value = value;
    area.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }
  async function leave(index: number): Promise<void> {
    areas()[index].dispatchEvent(new Event('blur'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await fixture.whenStable();
  }

  async function draw(slovak = false, title: string | null | undefined = undefined): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        slovak ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH),
        { provide: ApiService, useValue: api },
      ],
    });
    TestBed.inject(KanjiStateService).progress.set({ 'k:一': STATE });
    fixture = TestBed.createComponent(NotesEditorComponent);
    fixture.componentRef.setInput('item', ONE);
    if (title !== undefined) {
      fixture.componentRef.setInput('title', title);
    }
    host = fixture.nativeElement;
    await fixture.whenStable();
  }

  beforeEach(() => {
    api = { item: vi.fn(() => Promise.resolve({ state: STATE })) };
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('words its heading, labels and hints from keys, and shows the notes there are', async () => {
    await draw();
    expect(clean(host.querySelector('h3')?.textContent)).toBe('Your notes');
    expect(labels()).toEqual(['Meaning note', 'Reading note']);
    expect(areas().map((area) => area.placeholder)).toEqual(['A mnemonic for the meaning.', 'A mnemonic for the reading.']);
    expect(areas().map((area) => area.value)).toEqual(['a line', '']);
    expect(statuses()).toEqual(['', '']);
    expect(warn, 'no key of the notes is without a string').not.toHaveBeenCalled();
  });

  it('has no heading where none is wanted', async () => {
    await draw(false, null);
    expect(host.querySelector('h3')).toBeNull();
    expect(labels()).toEqual(['Meaning note', 'Reading note']);
  });

  it('says where a note stands: on its way, then saved', async () => {
    await draw();
    await write(1, 'ichi, like itchy');
    expect(statuses()).toEqual(['', '…']);
    await leave(1);
    expect(api.item).toHaveBeenCalledWith('k:一', { notes: { reading: 'ichi, like itchy' } });
    expect(statuses()).toEqual(['', 'saved']);
  });

  it('keeps a failed save as the failure, and words it from its code in the language on the page', async () => {
    api.item.mockImplementation(() => Promise.reject(new ApiError('No such item.', 404, { error: 'No such item.', code: 'no_such_item' })));
    await draw(true);
    expect(clean(host.querySelector('h3')?.textContent)).toBe('Tvoje poznámky');
    await write(0, 'x');
    await leave(0);
    expect(statuses()).toEqual(['neuložené: Taká položka neexistuje.', '']);
    expect(host.textContent).not.toContain('No such item');

    // the status is no sentence: it follows the language
    await TestBed.inject(TranslationService).setLanguage('en', false);
    await fixture.whenStable();
    expect(statuses()).toEqual(['not saved: No such item.', '']);
    expect(labels()).toEqual(['Meaning note not saved: No such item.', 'Reading note']);
  });

  it('says the server does not answer when there was no answer at all', async () => {
    api.item.mockImplementation(() => Promise.reject(new ApiError('the server does not answer', 0, {})));
    await draw(true);
    await write(0, 'x');
    await leave(0);
    expect(statuses()[0]).toBe('neuložené: Server neodpovedá.');
  });

  it('keeps its keys from a session: typing in a note submits no card', async () => {
    await draw();
    document.body.appendChild(host);
    const reached: string[] = [];
    const onDocument = (event: KeyboardEvent): void => void reached.push(event.key);
    document.addEventListener('keydown', onDocument);
    areas()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    areas()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }));
    document.removeEventListener('keydown', onDocument);
    host.remove();
    expect(reached).toEqual([]);
  });
});
