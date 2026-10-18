import { TestBed } from '@angular/core/testing';
import { ChangelogDialogComponent } from '../changelog/changelog-dialog.component';
import { ChangelogService } from '../changelog/changelog.service';

/** The news What's new opens, drawn over a page, and the places a key may be pressed in it. */
export interface DrawnNews {
  /** the open dialog itself (the kit's), its Close, and a line of its news */
  controls: HTMLElement[];
  remove: () => void;
}

/**
 * The app's What's new (core/changelog/changelog-dialog.component.ts), open
 * as the family's footer opens it under every page (AppComponent): for the
 * specs that check a key pressed there never reaches the page beneath (the
 * exam's paper, a review's card). The footer's own buttons - What's new,
 * Feedback and the form it opens - keep their keys too: app.component.spec.ts
 * holds them, where the app draws the footer. The news come from here, not
 * from changelog.json.
 */
export async function drawnNews(): Promise<DrawnNews> {
  TestBed.inject(ChangelogService).entries.set([{ version: '0.2.0', date: '2026-10-04', changes: { added: ['Something new'] } }]);
  const news = TestBed.createComponent(ChangelogDialogComponent);
  const el = news.nativeElement as HTMLElement;
  document.body.appendChild(el);
  news.componentInstance.open();
  await news.whenStable();
  const dialog = el.querySelector<HTMLElement>('dialog');
  const close = dialog?.querySelector<HTMLElement>('.anotoki-dialog__close');
  const line = dialog?.querySelector<HTMLElement>('li');
  if (!dialog?.hasAttribute('open') || !close || !line) {
    throw new Error('the news did not open');
  }
  return {
    controls: [dialog, close, line],
    remove: () => {
      news.destroy();
      el.remove();
    },
  };
}
