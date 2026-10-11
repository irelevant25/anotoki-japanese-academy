import { ChangeDetectionStrategy, Component, viewChild } from '@angular/core';
import { HoldsUnsavedChanges } from '@anotoki/lib/translations';
import { TranslationsPageComponent } from '@anotoki/lib/translations/admin';

/**
 * /admin/translations — the app's words in every language, for EDITOR and
 * ADMIN: the anotoki library's page (<anotoki-translations-page>, from
 * @anotoki/lib/translations/admin - an entry point of its own, so the page
 * stays out of the first load; the same on every anotoki site), in the admin
 * panel's frame, as the Migrations page is: the page's landmark, the panel's
 * width, and English whatever the reader reads. What it may do, its words
 * about this app and the server's checks are this app's
 * (core/i18n/translations.config.ts, backend/api/routes/translations.php).
 *
 * Leaving it with strings not saved asks first: the library's guard on the
 * route asks this frame, and the frame asks the page.
 */
@Component({
  selector: 'app-translations',
  imports: [TranslationsPageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './translations.component.html',
  styleUrl: './translations.component.scss',
})
export class TranslationsComponent implements HoldsUnsavedChanges {
  private readonly page = viewChild.required(TranslationsPageComponent);

  canLeave(): boolean | Promise<boolean> {
    return this.page().canLeave();
  }
}
