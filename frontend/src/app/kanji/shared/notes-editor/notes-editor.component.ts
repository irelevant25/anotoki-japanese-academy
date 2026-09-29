import { ChangeDetectionStrategy, Component, inject, input, OnDestroy, OnInit, signal } from '@angular/core';
import { ApiService } from '../../../core/api/api.service';
import { CatalogItem } from '../../../core/api/api.types';
import { KanjiStateService } from '../../kanji-state.service';

type NotePart = 'meaning' | 'reading';

interface NoteField {
  part: NotePart;
  label: string;
  placeholder: string;
  value: string;
  status: ReturnType<typeof signal<string>>;
  timer: ReturnType<typeof setTimeout> | null;
}

/** The learner's own mnemonics for an item: saved as they type (a moment after they stop), and when they leave the field. */
@Component({
  selector: 'app-notes-editor',
  templateUrl: './notes-editor.component.html',
  styleUrl: './notes-editor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotesEditorComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly kanji = inject(KanjiStateService);

  readonly item = input.required<CatalogItem>();
  readonly parts = input<NotePart[]>(['meaning', 'reading']);
  readonly title = input<string | null>('Your notes');

  fields: NoteField[] = [];

  ngOnInit(): void {
    const notes = this.kanji.st(this.item().id)?.notes ?? { meaning: '', reading: '' };
    this.fields = this.parts().map((part) => ({
      part,
      label: part === 'meaning' ? 'Meaning note' : 'Reading note',
      placeholder:
        part === 'meaning' ? 'A mnemonic for the meaning — e.g. 休: a person (亻) resting against a tree (木).' : 'A mnemonic for the reading.',
      value: notes[part] || '',
      status: signal(''),
      timer: null,
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
    field.status.set('…');
    if (field.timer) {
      clearTimeout(field.timer);
    }
    field.timer = setTimeout(() => void this.save(field), 700);
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

  private async save(field: NoteField): Promise<void> {
    if (field.timer) {
      clearTimeout(field.timer);
      field.timer = null;
    }
    const id = this.item().id;
    try {
      const r = await this.api.item(id, { notes: { [field.part]: field.value } });
      this.kanji.setItemState(id, r.state);
      field.status.set('saved');
    } catch (e) {
      field.status.set(`not saved: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
