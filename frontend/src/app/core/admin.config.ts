import { EnvironmentProviders, Injector, inject, makeEnvironmentProviders } from '@angular/core';
import { AnotokiAdminConfig, provideAnotokiAdmin } from '@anotoki/lib/admin';
import { AnotokiPeopleConfig, PeopleColumn, PeoplePerson, PeopleVisitors, provideAnotokiPeople } from '@anotoki/lib/people';
import { AuthService } from './auth/auth.service';
import { fmtAdminMoment } from './format';
import { TimeWording } from './i18n/time-wording';
import { MIGRATIONS_ROUTE } from './site-status';

/** "1 item", "12 items": the admin area's English. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** A count of a person's row (the server's own columns, backend/src/people.php): a number, else 0. */
function counted(person: PeoplePerson, key: string): number {
  const value = person[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * The anotoki library's admin tools (@anotoki/lib/admin, every anotoki site's)
 * wired to this app: the admin panel's Errors, Audit log, Feedback and Backups
 * pages (admin/errors/ … admin/backups/, each the library's page in the
 * panel's frame), for the site's ADMIN alone - the token's role, which the
 * server checks again (backend/api/routes/admin.php). English, as the whole
 * panel; their dates in the date order and clock the administrator chose for
 * their anotoki account, else the admin panel's English (fmtAdminMoment()).
 * A backup made, downloaded, deleted or restored asks for a sign-in of the
 * last ten minutes: "Sign in again" asks the IAM for the password again and
 * comes back to the page. While a tool's table waits for an update, the page
 * offers the Migrations page.
 *
 * The services are asked for when the pages ask, never here (core/site-status.config.ts says why).
 */
export function adminConfig(): AnotokiAdminConfig {
  const injector = inject(Injector);
  const auth = (): AuthService => injector.get(AuthService);
  return {
    isAdmin: () => auth().isAdmin(),
    signInAgain: () => auth().signInAgain(),
    migrationsRoute: MIGRATIONS_ROUTE,
    siteName: 'Japanese Academy',
    formatDate: (iso) => fmtAdminMoment(injector.get(TimeWording), Date.parse(iso)),
  };
}

/**
 * The anotoki library's People page (@anotoki/lib/people/page, admin/people/)
 * wired to this app: everybody the site has, the latest seen first, with this
 * site's own columns (time zone, learned, exam attempts: the server's,
 * backend/src/people.php), the accounts the IAM deleted under its placeholder
 * name, and where the scrub of them stands. Deleting a person's data takes all
 * of it - progress, answers, exam attempts and their reports, their row -
 * after a copy of it on the server; the question names what goes, and what
 * went is said with the copy's file. Their IAM account is the IAM's, and
 * stays: when they sign in again, they start afresh. The visitors - people
 * studying without signing in - are a line of their own. ADMIN alone (the
 * route and the server both say so); English.
 */
export function peopleConfig(): AnotokiPeopleConfig {
  const injector = inject(Injector);
  const auth = (): AuthService => injector.get(AuthService);
  const name = (person: PeoplePerson): string => person.name || `user ${person.sub}`;
  return {
    isAdmin: () => auth().isAdmin(),
    me: () => auth().subject(),
    lead:
      "Everybody who has signed in here, the latest first. Deleting a person's data takes their progress, their answers and their exam attempts; " +
      'the server keeps a copy first, and their account stays.',
    formatDate: (iso) => fmtAdminMoment(injector.get(TimeWording), Date.parse(iso)),
    delete: {
      label: 'Delete their data',
      question: (person: PeoplePerson, _columns: readonly PeopleColumn[]) => ({
        title: `Delete ${name(person)}'s data?`,
        message:
          `Their progress (${count(counted(person, 'learned'), 'item', 'items')} learned), every answer and their ` +
          `${count(counted(person, 'attempts'), 'attempt', 'attempts')} at the exam, with the reports, go. ` +
          'The server keeps a copy of it first. Their account stays: signing in again, they start afresh.' +
          (person.sub === auth().subject() ? ' This is you.' : ''),
        confirm: 'Delete',
      }),
    },
    visitorsLine: (visitors: PeopleVisitors) => {
      const oldest = typeof visitors['oldest_seen_at'] === 'string' ? `, the oldest seen ${fmtAdminMoment(injector.get(TimeWording), Date.parse(visitors['oldest_seen_at']))}` : '';
      const days = typeof visitors['keep_days'] === 'number' ? visitors['keep_days'] : null;
      const max = typeof visitors['max'] === 'number' ? visitors['max'] : null;
      const rules = days !== null && max !== null ? ` Each is deleted ${count(days, 'day', 'days')} after their last visit; at most ${max} are kept at a time.` : '';
      return `Visitors (not signed in): ${visitors.count}${oldest}.${rules}`;
    },
    migrationsRoute: MIGRATIONS_ROUTE,
  };
}

/** The admin tools' pages and the People page, configured for this app (app.config.ts). The pages themselves load with their routes. */
export function provideAdminTools(): EnvironmentProviders {
  return makeEnvironmentProviders([provideAnotokiAdmin(adminConfig), provideAnotokiPeople(peopleConfig)]);
}
