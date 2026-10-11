import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AuditLogPageComponent } from '@anotoki/lib/admin/audit';

/**
 * /admin/audit — who did what in the admin panel (the words and the
 * languages, a person's data deleted, the migrations applied, the backups,
 * the feedback handled), for the administrators (ADMIN alone: the route and
 * the server both say so): the anotoki library's page
 * (<anotoki-audit-log-page>, from @anotoki/lib/admin/audit - an entry point of
 * its own, so the page stays out of the first load; the same on every anotoki
 * site), in the admin panel's frame. An admin page, in English.
 */
@Component({
  selector: 'app-audit',
  imports: [AuditLogPageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './audit.component.html',
  styleUrl: './audit.component.scss',
})
export class AuditComponent {}
