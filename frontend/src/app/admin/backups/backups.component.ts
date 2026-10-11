import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BackupsPageComponent } from '@anotoki/lib/admin/backups';

/**
 * /admin/backups — the whole database's backups (the anotoki library's:
 * one a day, one before every update and every restore, and the
 * administrator's own; backend/src/admin.php), beside this site's own JSON
 * copies of the study data in the same folder, which the page never lists
 * and the library never touches. For the administrators (ADMIN alone: the
 * route and the server both say so): the anotoki library's page
 * (<anotoki-backups-page>, from @anotoki/lib/admin/backups - an entry point of
 * its own, so the page stays out of the first load; the same on every anotoki
 * site), in the admin panel's frame. Back up now, Download, Delete and
 * Restore each want a sign-in of the last ten minutes: the page offers Sign
 * in again (core/admin.config.ts). Before every Apply of an update the server
 * makes one by itself (backend/src/upkeep.php). An admin page, in English.
 */
@Component({
  selector: 'app-backups',
  imports: [BackupsPageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './backups.component.html',
  styleUrl: './backups.component.scss',
})
export class BackupsComponent {}
