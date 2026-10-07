import type { SiteStatus } from '@anotoki/lib/migrations';

/** Where the site stands: answered always, to anybody (the anotoki library's route, backend/api/app.php). */
export const SITE_STATUS_URL = '/api/site-status';

/** The admin panel's Migrations page: the one page of the app an ADMIN still reaches while an update waits. */
export const MIGRATIONS_ROUTE = '/admin/migrations';

/**
 * An answer to a plain fetch() of this site's API (the sign-in's settings,
 * the app's words, a data file, a report) that says the site is not set up,
 * or is being updated: SiteStatus hears it, as siteStatusInterceptor makes it
 * hear HttpClient's (core/site-status.config.ts), and the gate puts up the
 * library's page. True when it was such an answer. SiteStatus is asked for
 * only then ($site): whoever calls this may run where it is not provided.
 */
export function reportSiteState(site: () => SiteStatus, status: number, body: unknown): boolean {
  if (status !== 503 || !body || typeof body !== 'object') {
    return false;
  }
  const { code, installed } = body as { code?: unknown; installed?: unknown };
  if (code !== 'update_pending' && code !== 'not_set_up') {
    return false;
  }
  site().report(code, typeof installed === 'boolean' ? installed : undefined);
  return true;
}

/**
 * Whether the anotoki library's gate stands in front of the app's pages now,
 * by its own rule (SiteGateComponent): the site is not ready - except, while
 * an update waits, for the site's ADMIN on the Migrations page. What follows
 * the pages follows this too: the top bar's sections, the tab's title.
 * $path is the page's address without its query and fragment; $isAdmin is
 * asked only while the site is not ready.
 */
export function pagesShut(site: SiteStatus, isAdmin: () => boolean, path: string): boolean {
  if (!site.blocked()) {
    return false;
  }
  const onMigrations = path === MIGRATIONS_ROUTE || path.startsWith(`${MIGRATIONS_ROUTE}/`);
  return !(site.state() === 'update-pending' && onMigrations && isAdmin());
}
