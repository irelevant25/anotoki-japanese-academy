import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, inject, signal, viewChild } from '@angular/core';

/** What a question says: its heading, the sentence under it, and its two buttons. */
export interface ConfirmWords {
  title: string;
  message: string;
  /** The button that goes ahead: "Leave", "Delete", "Import". */
  confirm: string;
  /** The button that does not: "Cancel" when left out. */
  cancel?: string;
  /** Something is lost when it goes ahead: the button says so in red. */
  danger?: boolean;
}

/**
 * The admin pages' one question, over a native <dialog>: deleting a language,
 * importing a file, discarding or leaving with unsaved changes. ask() answers
 * true for the button that goes ahead, false for the other, Escape, or a
 * second question asked over the first.
 *
 * The words are drawn BEFORE showModal(): a modal dialog opened on what the
 * page has not drawn yet would show an empty box until the next change
 * detection. Its keys stay inside it, so nothing on the page behind hears them.
 */
@Component({
  selector: 'app-admin-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './confirm.component.html',
  styleUrl: './confirm.component.scss',
})
export class ConfirmComponent {
  private readonly changes = inject(ChangeDetectorRef);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly words = signal<ConfirmWords | null>(null);
  private answer: ((yes: boolean) => void) | null = null;

  ask(words: ConfirmWords): Promise<boolean> {
    this.settle(false);
    this.words.set(words);
    this.changes.detectChanges();
    const dialog = this.dialog().nativeElement;
    if (!dialog.open) {
      dialog.showModal();
    }
    return new Promise<boolean>((resolve) => {
      this.answer = resolve;
    });
  }

  /** The question answered: the dialog closes, and whoever asked hears the answer once. */
  protected settle(yes: boolean): void {
    const answer = this.answer;
    this.answer = null;
    const dialog = this.dialog().nativeElement;
    if (dialog.open) {
      dialog.close();
    }
    answer?.(yes);
  }

  /** Escape: the browser closes the dialog itself; it is a no. */
  protected cancelled(event: Event): void {
    event.preventDefault();
    this.settle(false);
  }

  protected keys(event: KeyboardEvent): void {
    event.stopPropagation();
  }
}
