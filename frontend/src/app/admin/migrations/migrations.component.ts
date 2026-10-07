import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MigrationsPageComponent } from '@anotoki/lib/migrations';

/**
 * /admin/migrations — the database's migrations, for the administrators
 * (ADMIN alone: the route and the server both say so): the anotoki library's
 * page (<anotoki-migrations-page>, @anotoki/lib/migrations - the same on every
 * anotoki site), in the admin panel's frame. What is applied, what waits (a
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
