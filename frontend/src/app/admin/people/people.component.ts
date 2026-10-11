import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PeoplePageComponent } from '@anotoki/lib/people/page';

/**
 * /admin/people — everybody the site has, for the administrators (ADMIN alone:
 * the route and the server both say so): the anotoki library's page
 * (<anotoki-people-page>, from @anotoki/lib/people/page - an entry point of
 * its own, so the page stays out of the first load; the same on every anotoki
 * site), in the admin panel's frame. The latest seen first, with this site's
 * columns (time zone, items learned, exam attempts), the accounts the IAM
 * deleted under its placeholder name, where the scrub of them stands, the
 * visitors' line, and Delete their data - after a copy of it on the server.
 * This site's words for it: core/admin.config.ts; its addresses:
 * backend/api/routes/people.php. An admin page, in English.
 */
@Component({
  selector: 'app-people',
  imports: [PeoplePageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './people.component.html',
  styleUrl: './people.component.scss',
})
export class PeopleComponent {}
