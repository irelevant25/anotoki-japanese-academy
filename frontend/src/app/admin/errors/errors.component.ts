import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ErrorLogPageComponent } from '@anotoki/lib/admin/errors';

/**
 * /admin/errors — what went wrong on the server (its 5xx, 404s and PHP's
 * warnings, redacted: backend/src/admin.php), for the administrators (ADMIN
 * alone: the route and the server both say so): the anotoki library's page
 * (<anotoki-error-log-page>, from @anotoki/lib/admin/errors - an entry point
 * of its own, so the page stays out of the first load; the same on every
 * anotoki site), in the admin panel's frame. An admin page, in English.
 */
@Component({
  selector: 'app-errors',
  imports: [ErrorLogPageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './errors.component.html',
  styleUrl: './errors.component.scss',
})
export class ErrorsComponent {}
