import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MigrationsPageComponent } from '@anotoki/lib/migrations/page';

/**
 * /admin/migrations — the database's migrations, for the administrators
 * (ADMIN alone: the route and the server both say so): the anotoki library's
 * page (<anotoki-migrations-page>, from @anotoki/lib/migrations/page - an
 * entry point of its own, so the page stays out of the first load; the same
 * on every anotoki site, drawn with the library's kit), in the admin panel's
 * frame. What is applied, what waits (a
 * file not whole yet, without its "-- end of NNN" line, is a "draft": it waits
 * with every one after it), each file's SQL, and Apply pending, which runs the
 * files that wait in order, each rolled back whole when it fails, which stops
 * the run there - after the server's raw copy of every table, whose file the
 * outcome names (backend/src/upkeep.php).
 *
 * A migration uploaded (or pulled) is never applied by itself: it waits here,
 * and meanwhile the library's page stands in for every other page of the app,
 * this one alone working for the site's ADMIN (core/site-status.config.ts).
 * Once nothing is left to apply, the app runs again, its words asked for anew.
 * An admin page, in English.
 */
@Component({
  selector: 'app-migrations',
  imports: [MigrationsPageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './migrations.component.html',
  styleUrl: './migrations.component.scss',
})
export class MigrationsComponent {}
