import { TestBed } from '@angular/core/testing';
import { ConfirmHostComponent } from '@anotoki/lib/ui/dialog';

/** The kit's question (ConfirmService) as a spec sees it: its words, and its answers. */
export interface KitQuestion {
  /** A question is open. */
  open(): boolean;
  title(): string;
  message(): string;
  /** The words on its two buttons: the no, then the yes. */
  buttons(): string[];
  /** Clicks the yes (true) or the no (false). */
  answer(yes: boolean): void;
  remove(): void;
}

const words = (element: Element | null | undefined): string => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * The anotoki library's question - ConfirmService, which the admin pages ask
 * ("Delete …?", "Leave without saving?") - drawn as the app draws it, by
 * <anotoki-confirm-host> (in AppComponent's template), for a spec of a page
 * that asks: call it once the page is drawn, with the page's element - a
 * second component of the TestBed takes the first one's root out of the
 * document, and the page goes back in (a form outside it submits nothing).
 */
export function drawKitQuestion(page: HTMLElement): KitQuestion {
  const fixture = TestBed.createComponent(ConfirmHostComponent);
  const host = fixture.nativeElement as HTMLElement;
  document.body.appendChild(host);
  document.body.appendChild(page);
  const dialog = (): Element | null => host.querySelector('anotoki-dialog');
  return {
    open: () => dialog() !== null,
    title: () => words(dialog()?.querySelector('h2')),
    message: () => words(dialog()?.querySelector('.message')),
    buttons: () => Array.from(dialog()?.querySelectorAll('[data-answer]') ?? [], words),
    answer: (yes) => host.querySelector<HTMLButtonElement>(`[data-answer="${yes ? 'yes' : 'no'}"]`)!.click(),
    remove: () => {
      fixture.destroy();
      host.remove();
    },
  };
}
