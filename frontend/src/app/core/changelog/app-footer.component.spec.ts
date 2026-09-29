import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppFooterComponent } from './app-footer.component';
import { ChangelogEntry, ChangelogService } from './changelog.service';

const ENTRIES: ChangelogEntry[] = [
  { version: '3.0', date: '2026-09-29', changes: { added: ['A setup page'], fixed: ['A missing space'] } },
  { version: '2.0', date: '2026-09-20', changes: { updated: ['Sign-in'] } },
];

describe('AppFooterComponent', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem('academy-changelog-seen');
    } catch {
      // no storage: nothing remembered anyway
    }
    // jsdom may lack the modal dialog: open is all this needs
    const proto = HTMLDialogElement.prototype as { showModal?: () => void };
    if (typeof proto.showModal !== 'function') {
      proto.showModal = function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      };
    }
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const changelog = TestBed.inject(ChangelogService);
    changelog.load = () => Promise.resolve(changelog.entries.set(ENTRIES));
  });

  it('shows the version, with a dot until its news is read, and opens the news', async () => {
    const fixture = TestBed.createComponent(AppFooterComponent);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const version = el.querySelector('#version') as HTMLButtonElement;
    expect(version.textContent?.trim()).toBe('v3.0');
    expect(el.querySelector('#version .dot')).not.toBeNull();

    version.click();
    await fixture.whenStable();
    const dialog = el.querySelector('dialog.changelog') as HTMLDialogElement;
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.textContent).toContain('v3.0');
    expect(dialog.textContent).toContain('A setup page');
    expect(dialog.querySelectorAll('.release').length).toBe(2);
    expect(el.querySelector('#version .dot'), 'read: the dot is gone').toBeNull();
    expect(localStorage.getItem('academy-changelog-seen')).toBe('3.0');
  });
});
