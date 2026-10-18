import { Injectable, signal } from '@angular/core';

/** A notice: its title, the sentence under it, and - from the owner's own computer only - the server's reason, as it came. */
export interface Notice {
  title: string;
  message: string;
  /** English, as the server wrote it: shown small under the sentence, marked `lang="en"`. */
  detail?: string | null;
}

interface PendingNotice extends Notice {
  resolve: () => void;
}

/**
 * Something the app has to say that waits for nobody's answer - a report that
 * would not open, a paper that could not be scored -, drawn with the kit's
 * dialog (<app-notice-host>, in the app's root) with one button, OK, where the
 * browser's own alert() stood: `await notice.tell({ title, message })`.
 *
 * The kit's ConfirmService asks a question with two answers; this is its
 * one-answer sibling, the app's own until the kit has one. One notice at a
 * time: a new one closes the one before (it can only have been left open by
 * accident). The promise settles when the notice is closed - by OK, Escape,
 * its close button or the backdrop.
 *
 * Its words are worded by whoever raises it, at that moment, in the language
 * on the page; the host words the button (`common.ok`).
 */
@Injectable({ providedIn: 'root' })
export class NoticeService {
  private readonly pendingSignal = signal<PendingNotice | null>(null);

  /** The notice drawn now, or null. */
  readonly pending = this.pendingSignal.asReadonly();

  tell(notice: Notice): Promise<void> {
    this.pendingSignal()?.resolve();
    return new Promise<void>((resolve) => this.pendingSignal.set({ ...notice, resolve }));
  }

  /** Closes the notice drawn now, if any. */
  close(): void {
    const pending = this.pendingSignal();
    if (pending) {
      this.pendingSignal.set(null);
      pending.resolve();
    }
  }
}
