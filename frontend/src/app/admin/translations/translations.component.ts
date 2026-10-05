import { afterNextRender, ChangeDetectionStrategy, Component, computed, inject, Injector, signal, untracked, viewChild } from '@angular/core';
import { ApiError, ApiService, toApiError } from '../../core/api/api.service';
import { AdminLanguage, TranslationChanges, TranslationGrid, TranslationKeyRow } from '../../core/i18n/translation.model';
import { FALLBACK_LANGUAGE, TranslationService } from '../../core/i18n/translation.service';
import { ConfirmComponent } from '../confirm/confirm.component';
import { AdminDrafts } from '../admin-drafts.service';
import { reason, refusedPerson } from '../reason';
import { saveFile } from '../save-file';
import { TranslationCellComponent } from '../translation-cell/translation-cell.component';
import {
  blankText,
  blockMatches,
  blockMissing,
  cellValue,
  editCount,
  IMPORT_MAX_BYTES,
  KeyBlock,
  keyBlocks,
  PluralForm,
  pluralNumbers,
  pluralSamples,
  remainingEdits,
  rowCounts,
  storedValue,
  stringsFromFile,
  translationFileText,
  withEdit,
} from '../translation-grid';
import { HoldsUnsavedChanges } from '../unsaved-changes.guard';

/** A save the server refused: its sentence, and the string it is about. */
interface Refusal {
  message: string;
  key: string;
  language: string | null;
}

/** A file that was not imported, and why — said above the grid. */
interface Notice {
  heading: string;
  message: string;
}

/** More languages than this no longer fit side by side: each key's strings go under one another instead. */
const COLUMNS_MAX = 3;

const plural = (count: number, one: string, many: string): string => (count === 1 ? `1 ${one}` : `${count} ${many}`);

/**
 * The app's own words, in every language: a key a row, a language a column,
 * each string a box. An admin page, in English (the learning material and
 * the stage names are never translated, and have no keys).
 *
 * What is typed is held until Save, which sends only the boxes that changed;
 * the server checks all of them before it writes any, and answers the grid
 * as it is now. It is held in AdminDrafts, not here: the app takes its page
 * away, with no question, when a session ends, and what was typed must be in
 * its boxes again when the page is back.
 *
 * What became of a save is said in the status line where Save is, which stays
 * in view: a refusal about one key beside that key as well, in the server's
 * words. An emptied box in another language than English means "no string of
 * its own": the key reads in English there.
 *
 * The keys themselves are the code's: migrations write them, and nothing here
 * makes or removes one.
 */
@Component({
  selector: 'app-translations',
  imports: [ConfirmComponent, TranslationCellComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './translations.component.html',
  styleUrl: './translations.component.scss',
})
export class TranslationsComponent implements HoldsUnsavedChanges {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(TranslationService);
  private readonly injector = inject(Injector);
  private readonly confirm = viewChild.required(ConfirmComponent);

  private readonly grid = signal<TranslationGrid | null>(null);
  /** The boxes that do not say what the app has: key -> language -> text. Kept outside the page, so they outlive it. */
  private readonly edits = inject(AdminDrafts).strings;

  protected readonly loadError = signal<string | null>(null);
  protected readonly search = signal('');
  /** A language's code: only the keys it has no string of its own for. */
  protected readonly missingIn = signal('');
  protected readonly saving = signal(false);
  /** The language being exported, and the one being imported, just now. */
  protected readonly exporting = signal<string | null>(null);
  protected readonly importing = signal<string | null>(null);
  protected readonly refusal = signal<Refusal | null>(null);
  /** Why the last save saved nothing, when that is about no key of the grid: said in the status line. */
  protected readonly saveFailure = signal<string | null>(null);
  /** What the last save, export or import did, when it went well: said in the status line until the next change. */
  protected readonly done = signal<string | null>(null);
  protected readonly notice = signal<Notice | null>(null);

  protected readonly fallback = FALLBACK_LANGUAGE;
  protected readonly loaded = computed(() => this.grid() !== null);
  protected readonly languages = computed(() => this.grid()?.languages ?? []);
  protected readonly total = computed(() => this.grid()?.keys.length ?? 0);
  protected readonly stacked = computed(() => this.languages().length > COLUMNS_MAX);
  protected readonly changed = computed(() => editCount(this.edits()));

  private readonly codes = computed(() => this.languages().map((language) => language.code));
  private readonly blocks = computed(() => keyBlocks(this.grid()?.keys ?? []));

  /**
   * The blocks the search and the filter leave. Which rows match is worked out
   * when the search, the filter or the grid changes, never while a box is being
   * typed in: a row found only by its unsaved words would leave, with the
   * cursor in it, at the keystroke that changes them.
   */
  protected readonly visible = computed(() => {
    const search = this.search();
    const missingIn = this.missingIn();
    const codes = this.codes();
    const edits = untracked(this.edits);
    return this.blocks().filter((block) => (missingIn === '' || blockMissing(block, missingIn)) && blockMatches(block, search, codes, edits));
  });
  protected readonly visibleKeys = computed(() => this.visible().reduce((count, block) => count + block.rows.length, 0));

  /** How much of each language is written — of the keys it needs: a plural's form its numbers never take counts on neither side. */
  protected readonly coverage = computed(() => {
    const rows = this.blocks().flatMap((block) => block.rows);
    return this.languages().map((language) => {
      const needed = rows.filter((row) => rowCounts(row, language.code));
      const written = needed.filter((row) => storedValue(row.key, language.code) !== '').length;
      return { language, written, total: needed.length };
    });
  });

  /** Every language that can miss a string: English cannot. */
  protected readonly missingChoices = computed(() => this.languages().filter((language) => language.code !== FALLBACK_LANGUAGE));
  protected readonly missingName = computed(() => this.languages().find((language) => language.code === this.missingIn())?.name ?? '');

  constructor() {
    // What was typed before the page was taken away is in the drafts already;
    // the grid that comes says which of it is still a change.
    void this.load();
  }

  /** Leaving with boxes not saved asks first — and "Leave" gives them up. */
  canLeave(): boolean | Promise<boolean> {
    const changed = this.changed();
    if (!changed) {
      return true;
    }
    return this.confirm()
      .ask({
        title: 'Leave without saving?',
        message: `${changed === 1 ? '1 changed string is' : `${changed} changed strings are`} not saved yet, and leaving loses ${changed === 1 ? 'it' : 'them'}.`,
        confirm: 'Leave',
        cancel: 'Stay here',
        danger: true,
      })
      .then((leave) => {
        if (leave) {
          this.edits.set({});
        }
        return leave;
      });
  }

  protected async load(): Promise<void> {
    this.loadError.set(null);
    try {
      this.take(await this.api.translationGrid());
    } catch (error) {
      this.loadError.set(reason(toApiError(error)));
    }
  }

  /* ------------------------------------------------------------ the boxes */

  protected valueOf(key: TranslationKeyRow, code: string): string {
    return cellValue(this.edits(), key, code);
  }

  protected isChanged(key: TranslationKeyRow, code: string): boolean {
    const cells = this.edits()[key.name];
    return cells !== undefined && Object.hasOwn(cells, code);
  }

  protected isRefused(key: TranslationKeyRow, code: string): boolean {
    const refusal = this.refusal();
    return refusal !== null && refusal.key === key.name && refusal.language === code;
  }

  protected setValue(key: TranslationKeyRow, code: string, value: string): void {
    // While a save or an import is on its way the grid is about to change: what
    // is typed then is held whatever it says, and measured against the answer.
    const onItsWay = this.saving() || this.importing() !== null;
    this.edits.update((edits) => withEdit(edits, key, code, value, onItsWay));
    // The refusal was about what stood here: changing it is the answer to it.
    const refusal = this.refusal();
    if (refusal && refusal.key === key.name && (refusal.language === code || refusal.language === null)) {
      this.refusal.set(null);
    }
    // And typing after a save that failed is the start of the next try: the
    // status line says what stands now, not what the last Save met.
    this.saveFailure.set(null);
    this.done.set(null);
  }

  /** "Required" for English — every other language falls back to it — and what an empty box means for the others. */
  protected placeholderFor(language: AdminLanguage): string {
    return language.code === FALLBACK_LANGUAGE ? 'Required' : 'Falls back to English';
  }

  /** The numbers a plural's form is for in a column's language. */
  protected numbers(language: AdminLanguage, form: PluralForm): string {
    return pluralNumbers(language.code, form, language.name);
  }

  /**
   * A plural family as the app would say it for 1, 3 and 12 — from the boxes
   * as they stand. A box with nothing to see is no string, as it will be once
   * saved: the form falls back to English.
   */
  protected samples(block: KeyBlock, code: string): string[] {
    const edits = this.edits();
    const text = (key: TranslationKeyRow, language: string): string => {
      const value = cellValue(edits, key, language);
      return blankText(value) ? '' : value.trim();
    };
    return pluralSamples(code, (form) => {
      const key = block.rows.find((row) => row.form === form)?.key;
      return key ? text(key, code) || text(key, FALLBACK_LANGUAGE) : '';
    });
  }

  protected rowId(name: string): string {
    return `key-${name}`;
  }

  /** Every box back to what the app has. */
  protected async discard(): Promise<void> {
    const changed = this.changed();
    const sure = await this.confirm().ask({
      title: changed === 1 ? 'Discard the change?' : `Discard ${changed} changes?`,
      message: `${changed === 1 ? 'The box goes' : 'The boxes go'} back to what the app has now.`,
      confirm: 'Discard',
      danger: true,
    });
    if (sure) {
      this.edits.set({});
      this.refusal.set(null);
      this.saveFailure.set(null);
    }
  }

  protected showEverything(): void {
    this.search.set('');
    this.missingIn.set('');
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected onMissing(event: Event): void {
    this.missingIn.set((event.target as HTMLSelectElement).value);
  }

  /* --------------------------------------------------------------- saving */

  protected async save(): Promise<void> {
    const sent = this.edits();
    const count = editCount(sent);
    if (!count || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.notice.set(null);
    this.saveFailure.set(null);
    this.done.set(null);
    try {
      const grid = await this.api.saveTranslations(sent);
      this.refusal.set(null);
      this.take(grid, sent);
      this.done.set(count === 1 ? 'The string is saved.' : `${count} strings are saved.`);
      void this.i18n.reload();
    } catch (error) {
      // A box typed back to what is stored while the save was out was held
      // for the answer; none came, so it is no change after all.
      this.settleEdits();
      await this.refused(toApiError(error));
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Nothing was saved — and the status line says so, whatever the reason.
   *
   * Signed out, or no right to it here (401, 403): what was typed is kept, and
   * the line says that too. When the server names a key of the grid, its
   * sentence goes beside that key as well, and the key is brought into view.
   * A refusal because a language or a key is gone cannot be answered by
   * changing a box: the page reads the grid again, which lets go of what was
   * typed for the thing that is gone and keeps the rest.
   */
  private async refused(error: ApiError): Promise<void> {
    if (refusedPerson(error)) {
      this.refusal.set(null);
      this.saveFailure.set(`${reason(error)} What you typed is kept.`);
      return;
    }
    const key = typeof error.body.key === 'string' ? error.body.key : null;
    const language = typeof error.body.language === 'string' ? error.body.language : null;

    if (error.code === 'unknown_language' || error.code === 'unknown_key') {
      let fresh: TranslationGrid | null = null;
      try {
        fresh = await this.api.translationGrid();
      } catch {
        // The grid could not be read again: the refusal is shown as any other.
        this.settleEdits();
      }
      if (fresh) {
        this.take(fresh);
        const gone =
          error.code === 'unknown_language'
            ? language === null || !fresh.languages.some((other) => other.code === language)
            : key === null || !fresh.keys.some((row) => row.name === key);
        if (gone) {
          this.refusal.set(null);
          this.saveFailure.set(`${reason(error)} What was typed for it could not be kept.${this.changed() ? ' Save again for the rest.' : ''}`);
          return;
        }
      }
    }

    if (key === null || !this.grid()?.keys.some((row) => row.name === key)) {
      this.refusal.set(null);
      this.saveFailure.set(reason(error));
      return;
    }
    this.refusal.set({ message: reason(error), key, language });
    if (!this.visible().some((block) => block.rows.some((row) => row.key.name === key))) {
      this.showEverything();
    }
    afterNextRender(
      () => {
        const row = document.getElementById(this.rowId(key));
        row?.scrollIntoView?.({ block: 'center' });
        row?.querySelector<HTMLTextAreaElement>('textarea[aria-invalid="true"]')?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }

  /* ---------------------------------------------------- a language as a file */

  /** The language's own strings as the app has them, as a JSON file — fetched with the token, saved from here. */
  protected async exportLanguage(language: AdminLanguage): Promise<void> {
    this.exporting.set(language.code);
    this.notice.set(null);
    try {
      const values = await this.api.exportTranslations(language.code);
      saveFile(`translations-${language.code}.json`, translationFileText(values), 'application/json');
      const unsaved = Object.values(this.edits()).some((cells) => Object.hasOwn(cells, language.code));
      this.done.set(
        `${plural(Object.keys(values).length, 'string', 'strings')} of ${language.name} downloaded.${unsaved ? ' What you have not saved yet is not in the file.' : ''}`,
      );
    } catch (error) {
      this.notice.set({ heading: `${language.name} could not be exported`, message: reason(toApiError(error)) });
    } finally {
      this.exporting.set(null);
    }
  }

  /** A file of strings into a language: checked by the server like a save, all of it or none. */
  protected async importLanguage(language: AdminLanguage, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const heading = `"${file.name}" was not imported`;
    const tooLarge = file.size > IMPORT_MAX_BYTES;
    const text = tooLarge ? '' : await file.text().catch(() => '');
    // Emptied once the file is read, so choosing the same file again is a change again.
    input.value = '';
    this.notice.set(null);
    if (tooLarge) {
      this.notice.set({ heading, message: 'The file is larger than 1 MB — more than every string of a language takes.' });
      return;
    }
    const values = stringsFromFile(text);
    if (values === null) {
      this.notice.set({ heading, message: 'It is not a language\'s strings: the file must hold one JSON object of "key": "text", as an export does.' });
      return;
    }
    // A value with nothing to see is passed over by the server, so it is not counted.
    const count = Object.values(values).filter((value) => !blankText(value)).length;
    if (count === 0) {
      this.notice.set({ heading, message: 'It holds no string: every value in it is empty.' });
      return;
    }
    const sure = await this.confirm().ask({
      title: `Import ${plural(count, 'string', 'strings')} into ${language.name}?`,
      message: 'Each string in the file replaces the one the app has for its key. Keys the file leaves out, or leaves empty, stay as they are.',
      confirm: 'Import',
    });
    if (!sure) {
      return;
    }

    this.importing.set(language.code);
    this.done.set(null);
    try {
      this.take(await this.api.importTranslations(language.code, values));
      // A fresh grid: what an earlier save was refused over is no longer what stands here.
      this.refusal.set(null);
      this.saveFailure.set(null);
      this.done.set(`The strings of ${language.name} are imported.`);
      void this.i18n.reload();
    } catch (error) {
      this.settleEdits();
      const failure = toApiError(error);
      this.notice.set({ heading, message: refusedPerson(failure) ? `${reason(failure)} Nothing was changed.` : reason(failure) });
    } finally {
      this.importing.set(null);
    }
  }

  /** A fresh grid: what is typed and still differs from it stays typed. */
  private take(grid: TranslationGrid, sent: TranslationChanges = {}): void {
    this.grid.set(grid);
    this.edits.update((edits) => remainingEdits(edits, grid, sent));
    if (!grid.languages.some((language) => language.code === this.missingIn())) {
      this.missingIn.set('');
    }
  }

  /** The edits measured against the grid the page has: a box held while a request was out, and saying what is stored, is let go. */
  private settleEdits(): void {
    const grid = this.grid();
    if (grid) {
      this.edits.update((edits) => remainingEdits(edits, grid));
    }
  }
}
