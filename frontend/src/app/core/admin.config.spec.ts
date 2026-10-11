import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ANOTOKI_ADMIN_CONFIG } from '@anotoki/lib/admin';
import { ANOTOKI_PEOPLE_CONFIG, PeoplePerson } from '@anotoki/lib/people';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { provideAdminTools } from './admin.config';
import { AuthService } from './auth/auth.service';
import { authStandIn, NO_CHOICE, person } from './testing/auth-states';

/** A row of the People page as the server answers it (backend/src/people.php: time zone, learned, attempts). */
function row(sub: string, name: string | null, learned: number, attempts: number): PeoplePerson {
  return { sub, name, first_seen_at: '2026-10-01T08:00:00Z', last_seen_at: '2026-10-10T09:30:00Z', anonymized_at: null, iam_url: `https://iam.test/admin/users/${sub}`, time_zone: 'Europe/Bratislava', learned, attempts };
}

describe('the admin tools and the People page, configured for this app (core/admin.config.ts)', () => {
  const signInAgain = vi.fn(async () => true);

  function configure(admin: boolean, me = '7'): void {
    const auth = authStandIn();
    auth.user.set({ ...person({ ...NO_CHOICE, date_format: 'ymd_dash', time_format: '24' }), sub: me });
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideTestTranslations(),
        provideAdminTools(),
        { provide: AuthService, useValue: { ...auth, isAdmin: signal(admin), subject: () => me, signInAgain } },
      ],
    });
  }

  afterEach(() => signInAgain.mockClear());

  it('the tools’ pages: the site’s ADMIN alone (from the token), "Sign in again" the IAM’s password once more, the Migrations page offered while a table waits', () => {
    configure(true);
    const config = TestBed.inject(ANOTOKI_ADMIN_CONFIG);
    expect([config.isAdmin(), config.migrationsRoute, config.siteName]).toEqual([true, '/admin/migrations', 'Japanese Academy']);
    void config.signInAgain?.();
    expect(signInAgain).toHaveBeenCalledTimes(1);
    TestBed.resetTestingModule();
    configure(false);
    expect(TestBed.inject(ANOTOKI_ADMIN_CONFIG).isAdmin(), 'an EDITOR is told whose the pages are').toBe(false);
  });

  it('the dates in the administrator’s own order and clock', () => {
    configure(true);
    expect(TestBed.inject(ANOTOKI_ADMIN_CONFIG).formatDate?.('2026-10-10T09:30:00Z')).toMatch(/^2026-10-10/);
    expect(TestBed.inject(ANOTOKI_PEOPLE_CONFIG).formatDate?.('2026-10-10T09:30:00Z')).toMatch(/^2026-10-10/);
  });

  it('Delete their data asks in this site’s words: what goes, by the counts on the row; that the server keeps a copy; "This is you." on the reader’s own row', () => {
    configure(true, '7');
    const people = TestBed.inject(ANOTOKI_PEOPLE_CONFIG);
    expect(people.me?.()).toBe('7');
    expect(people.delete?.label).toBe('Delete their data');
    const asked = people.delete?.question?.(row('12', 'lea', 1, 2), []);
    expect(asked).toEqual({
      title: "Delete lea's data?",
      message:
        'Their progress (1 item learned), every answer and their 2 attempts at the exam, with the reports, go. The server keeps a copy of it first. ' +
        'Their account stays: signing in again, they start afresh.',
      confirm: 'Delete',
    });
    expect(people.delete?.question?.(row('7', null, 12, 1), []).message).toContain('(12 items learned)');
    expect(people.delete?.question?.(row('7', null, 12, 1), []).message).toMatch(/1 attempt at the exam.* This is you\.$/);
    expect(people.delete?.question?.(row('7', null, 0, 0), []).title, 'a person whose name the site never learned').toBe("Delete user 7's data?");
  });

  it('the visitors’ line: how many, the oldest seen, and the limits the server keeps them by', () => {
    configure(true);
    const line = TestBed.inject(ANOTOKI_PEOPLE_CONFIG).visitorsLine?.({ count: 12, oldest_seen_at: '2026-10-03T14:05:00Z', keep_days: 30, max: 5000 });
    expect(line).toMatch(/^Visitors \(not signed in\): 12, the oldest seen 2026-10-03.*\. Each is deleted 30 days after their last visit; at most 5000 are kept at a time\.$/);
    expect(TestBed.inject(ANOTOKI_PEOPLE_CONFIG).visitorsLine?.({ count: 0, oldest_seen_at: null, keep_days: 1, max: 10 })).toBe(
      'Visitors (not signed in): 0. Each is deleted 1 day after their last visit; at most 10 are kept at a time.',
    );
  });
});
