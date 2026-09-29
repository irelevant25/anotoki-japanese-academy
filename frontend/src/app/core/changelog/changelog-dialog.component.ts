import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { ChangelogService } from './changelog.service';

/** What changed, release by release, over the page (a native dialog: Escape and the backdrop close it). */
@Component({
  selector: 'app-changelog-dialog',
  templateUrl: './changelog-dialog.component.html',
  styleUrl: './changelog-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangelogDialogComponent {
  readonly changelog = inject(ChangelogService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(): void {
    this.changelog.markSeen();
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  /** A click on the backdrop (the dialog itself, outside its box) closes it. */
  backdrop(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) {
      this.close();
    }
  }

  /** 28 Sept 2026, in English words. */
  date(iso: string): string {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
