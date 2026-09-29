import { ChangeDetectionStrategy, Component, inject, OnInit, viewChild } from '@angular/core';
import { ChangelogDialogComponent } from './changelog-dialog.component';
import { ChangelogService } from './changelog.service';

/**
 * The app's version, beside its name in the top bar, which opens what changed
 * in it. It sat at the foot of the page once, where a long page hid it below
 * the fold and a short one left it small and far from anything anybody looks at.
 */
@Component({
  selector: 'app-version',
  imports: [ChangelogDialogComponent],
  templateUrl: './app-version.component.html',
  styleUrl: './app-version.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppVersionComponent implements OnInit {
  readonly changelog = inject(ChangelogService);
  private readonly dialog = viewChild.required(ChangelogDialogComponent);

  ngOnInit(): void {
    void this.changelog.load();
  }

  open(): void {
    this.dialog().open();
  }
}
