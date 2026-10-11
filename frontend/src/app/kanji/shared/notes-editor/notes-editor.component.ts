import { ChangeDetectionStrategy, Component, inject, input, OnDestroy, OnInit, signal, WritableSignal } from '@angular/core';
import { TranslatePipe, TranslationService } from '@anotoki/lib/translations';
import { ApiError, ApiService, toApiError } from '../../../core/api/api.service';
import { CatalogItem } from '../../../core/api/api.types';
import { errorKey, errorParams } from '../../../core/i18n/error-text';
import { SavesInFlight } from '../../../core/saves-in-flight.service';
import { KanjiStateService } from '../../kanji-state.service';

type NotePart = 'meaning' | 'reading';

/** Where a note stands: nothing to say, on its way to the server, saved — or the failure that kept it from being saved. */
export type NoteStatus = '' | 'saving' | 'saved' | ApiError;

interface NoteField {
  part: NotePart;
  /** the keys of its label and of its placeholder */
  label: string;
  placeholder: string;
  value: string;
  status: WritableSignal<NoteStatus>;
  timer: ReturnType<typeof setTimeout> | null;
  /** Lets go of the save waiting in SavesInFlight (its timer), or null when none waits. */
  release: (() => void) | null;
}

/** The words of each note, as keys: the template words them. */
const WORDS: Record<NotePart, { label: string; placeholder: string }> = {
  meaning: { label: 'notes.meaningLabel', placeholder: 'notes.meaningPlaceholder' },
  reading: { label: 'notes.readingLabel', placeholder: 'notes.readingPlaceholder' },
};

/**
 * The learner's own mnemonics for an item: saved as they type (a moment after
 * they stop), and when they leave the field. A note waiting for its moment,
 * and one on its way, are known to SavesInFlight: signing out sends the first
 * at once and waits for both.
 */
@Component({
  selector: 'app-notes-editor',
  imports: [TranslatePipe],
  templateUrl: './notes-editor.component.html',
  styleUrl: './notes-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotesEditorComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly kanji = inject(KanjiStateService);
  private readonly i18n = inject(TranslationService);
  private readonly saves = inject(SavesInFlight);

  readonly item = input.required<CatalogItem>();
  readonly parts = input<NotePart[]>(['meaning', 'reading']);
  /** The key of the heading over the notes, or null for none. */
  readonly title = input<string | null>('notes.title');

  fields: NoteField[] = [];

  ngOnInit(): void {
    const notes = this.kanji.st(this.item().id)?.notes ?? { meaning: '', reading: '' };
    this.fields = this.parts().map((part) => ({
      part,
      label: WORDS[part].label,
      placeholder: WORDS[part].placeholder,
      value: notes[part] || '',
      status: signal<NoteStatus>(''),
      timer: null,
      release: null,
    }));
  }

  ngOnDestroy(): void {
    // a note still waiting for its save is saved on the way out
    for (const f of this.fields) {
      if (f.timer) {
        void this.save(f);
      }
    }
  }

  typed(field: NoteField, value: string): void {
    field.value = value;
    field.status.set('saving');
    if (field.timer) {
      clearTimeout(field.timer);
    }
    field.timer = setTimeout(() => void this.save(field), 700);
    field.release ??= this.saves.hold(() => void this.save(field));
  }

  left(field: NoteField): void {
    if (field.timer) {
      void this.save(field);
    }
  }

  /** Typing here must not trigger a session's shortcuts (Enter, F, the arrows). */
  keydown(event: KeyboardEvent): void {
    event.stopPropagation();
  }

  /**
   * What stands beside a note's label, in the language on the page: "…" while
   * the note is on its way, "saved", or why it was not. Called from the
   * template, so it follows the language.
   */
  said(status: NoteStatus): string {
    if (status === '') {
      return '';
    }
    if (status === 'saving') {
      return '…';
    }
    if (status === 'saved') {
      return this.i18n.t('notes.saved');
    }
    return this.i18n.t('notes.notSaved', { reason: this.i18n.t(errorKey(status), errorParams(status)) });
  }

  private async save(field: NoteField): Promise<void> {
    if (field.timer) {
      clearTimeout(field.timer);
      field.timer = null;
    }
    field.release?.();
    field.release = null;
    const id = this.item().id;
    try {
      const r = await this.saves.track(this.api.item(id, { notes: { [field.part]: field.value } }));
      this.kanji.setItemState(id, r.state);
      field.status.set('saved');
    } catch (e) {
      field.status.set(toApiError(e));
    }
  }
}
