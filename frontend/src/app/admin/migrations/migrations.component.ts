import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { ApiService, toApiError } from '../../core/api/api.service';
import { MigrationsApplyResult, MigrationsStatus } from '../../core/api/api.types';
import { TranslationService } from '../../core/i18n/translation.service';
import { ConfirmComponent } from '../confirm/confirm.component';
import { reason } from '../reason';

/** A moment as the admin panel writes it: English, whatever the language on the learner's pages. */
const WHEN = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * /admin/migrations — the database schema, for the administrators (ADMIN
 * alone: the route and the server both say so), in the anotoki IAM's shape
 * and words. A migration uploaded (or pulled) is never applied by itself: it
 * waits here, and every learner's page says the app is not up to date
 * meanwhile. Apply runs the pending files in order, each rolled back whole
 * when it fails, which stops the run there — every migration assumes the ones
 * before it ran — after the server's raw copy of every table
 * (backend/src/upkeep.php). This page's addresses answer while one waits, as
 * no other does. An admin page, in English, with the server's own sentence
 * when it refuses.
 */
@Component({
  selector: 'app-migrations',
  imports: [ConfirmComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './migrations.component.html',
  styleUrl: './migrations.component.scss',
})
export class MigrationsComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly i18n = inject(TranslationService);
  private readonly confirm = viewChild.required(ConfirmComponent);

  protected readonly status = signal<MigrationsStatus | null>(null);
  protected readonly loadError = signal<string | null>(null);
  /** What the last Apply did; or why it could not run at all (failed). */
  protected readonly result = signal<MigrationsApplyResult | null>(null);
  protected readonly failed = signal<string | null>(null);
  protected readonly applying = signal(false);

  /** The pending files Apply can run now: whole ones, up to the first that is still on its way. */
  protected readonly ready = computed(() => {
    const pending = this.status()?.pending ?? [];
    const firstHalf = pending.findIndex((item) => !item.whole);
    return firstHalf < 0 ? pending.length : firstHalf;
  });

  /**
   * What still waits after the last Apply: the pending files it did not apply
   * (one still on its way, and the ones after it). "Up to date" only when none.
   */
  protected readonly stillWaiting = computed(() => {
    const applied = this.result()?.applied ?? [];
    return (this.status()?.pending ?? []).filter((item) => !applied.includes(item.name)).map((item) => item.name);
  });

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.loadError.set(null);
    try {
      this.status.set(await this.api.migrations());
    } catch (error) {
      this.loadError.set(reason(toApiError(error)));
    }
  }

  protected when(ms: number): string {
    return WHEN.format(ms);
  }

  protected async apply(): Promise<void> {
    const count = this.ready();
    const sure = await this.confirm().ask({
      title: count === 1 ? 'Apply 1 pending migration?' : `Apply ${count} pending migrations?`,
      message:
        'They run now, against the live database, in order - stopping at the first one that fails. ' +
        'The server keeps a copy of every table first.',
      confirm: 'Apply',
      danger: true,
    });
    if (!sure) {
      return;
    }
    this.applying.set(true);
    this.result.set(null);
    this.failed.set(null);
    let result: MigrationsApplyResult | null = null;
    try {
      result = await this.api.applyMigrations();
    } catch (error) {
      this.failed.set(reason(toApiError(error)));
    }
    // The outcome is worded against the lists as they are now (a file still on
    // its way may wait after the ones applied), so they are read first.
    await this.load();
    if (result && !result.failed && result.applied.length > 0) {
      // Nothing whole waits any more, so the app's words answer again. A panel
      // opened while one waited started without them: they are in memory before
      // anybody goes back to the learner's pages without a page load.
      await this.i18n.reload();
    }
    this.result.set(result);
    this.applying.set(false);
  }
}
