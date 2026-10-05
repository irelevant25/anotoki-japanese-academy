import { TestBed } from '@angular/core/testing';
import { AppVersionComponent } from '../changelog/app-version.component';
import { ChangelogService } from '../changelog/changelog.service';

/** The foot under a page, with its news open, and the places a key may be pressed there. */
export interface DrawnFoot {
  /** "What's new", the open dialog itself, its Close, and a line of its news */
  controls: HTMLElement[];
  remove: () => void;
}

/**
 * The foot as the app draws it under every page (AppComponent), "What's new"
 * clicked so its dialog is open: for the specs that check a key pressed there
 * never reaches the page beneath (the exam's paper, a review's card). The
 * news come from here, not from changelog.json.
 */
export async function drawnFoot(): Promise<DrawnFoot> {
  const changelog = TestBed.inject(ChangelogService);
  changelog.load = () => Promise.resolve(changelog.entries.set([{ version: '0.2', date: '2026-10-04', changes: { added: ['Something new'] } }]));
  // jsdom may lack the modal dialog: open is all this needs
  const proto = HTMLDialogElement.prototype as { showModal?: () => void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }
  const foot = TestBed.createComponent(AppVersionComponent);
  const el = foot.nativeElement as HTMLElement;
  document.body.appendChild(el);
  await foot.whenStable();
  const whatsNew = el.querySelector<HTMLElement>('#whatsNew');
  if (!whatsNew) {
    throw new Error('no What’s new in the foot');
  }
  whatsNew.click();
  await foot.whenStable();
  const dialog = el.querySelector<HTMLElement>('dialog.changelog');
  const close = dialog?.querySelector<HTMLElement>('.head button');
  const line = dialog?.querySelector<HTMLElement>('li');
  if (!dialog?.hasAttribute('open') || !close || !line) {
    throw new Error('the news did not open');
  }
  return {
    controls: [whatsNew, dialog, close, line],
    remove: () => {
      foot.destroy();
      el.remove();
    },
  };
}
