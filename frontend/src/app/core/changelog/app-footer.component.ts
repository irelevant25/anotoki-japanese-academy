import { ChangeDetectionStrategy, Component, inject, OnInit, viewChild } from '@angular/core';
import { ChangelogDialogComponent } from './changelog-dialog.component';
import { ChangelogService } from './changelog.service';

/** The foot of every page: the app's version, which opens what changed in it. */
@Component({
  selector: 'app-footer',
  imports: [ChangelogDialogComponent],
  templateUrl: './app-footer.component.html',
  styleUrl: './app-footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppFooterComponent implements OnInit {
  readonly changelog = inject(ChangelogService);
  private readonly dialog = viewChild.required(ChangelogDialogComponent);

  ngOnInit(): void {
    void this.changelog.load();
  }

  open(): void {
    this.dialog().open();
  }
}
