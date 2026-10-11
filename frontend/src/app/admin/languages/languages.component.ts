import { ChangeDetectionStrategy, Component, viewChild } from '@angular/core';
import { HoldsUnsavedChanges } from '@anotoki/lib/translations';
import { LanguagesPageComponent } from '@anotoki/lib/translations/admin';

/**
 * /admin/languages — the languages readers are offered, for ADMIN alone (the
 * route and the server both say so): the anotoki library's page
 * (<anotoki-languages-page>, from @anotoki/lib/translations/admin - an entry
 * point of its own, so the page stays out of the first load; the same on
 * every anotoki site), in the admin panel's frame, as the Migrations page is:
 * the page's landmark, the panel's width, and English whatever the reader
 * reads. A language is deleted only after the server keeps a copy of its
 * strings, which the page names (core/i18n/translations.config.ts).
 *
 * Leaving it with a row changed and not saved asks first: the library's guard
 * on the route asks this frame, and the frame asks the page.
 */
@Component({
  selector: 'app-languages',
  imports: [LanguagesPageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './languages.component.html',
  styleUrl: './languages.component.scss',
})
export class LanguagesComponent implements HoldsUnsavedChanges {
  private readonly page = viewChild.required(LanguagesPageComponent);

  canLeave(): boolean | Promise<boolean> {
    return this.page().canLeave();
  }
}
