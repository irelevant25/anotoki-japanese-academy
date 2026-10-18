import { HttpTestingController } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { provideAdminTools } from '../core/admin.config';
import { AuthService } from '../core/auth/auth.service';
import { provideKit } from '../core/kit.config';
import { authStandIn, person } from '../core/testing/auth-states';
import { provideKitEnglish } from '../core/testing/kit-english';
import { provideTestSiteStatus } from '../core/testing/site-status';
import { AuditComponent } from './audit/audit.component';
import { BackupsComponent } from './backups/backups.component';
import { ErrorsComponent } from './errors/errors.component';
import { FeedbackComponent } from './feedback/feedback.component';
import { PeopleComponent } from './people/people.component';

/** Each admin page that is the anotoki library's own: its frame, its page, and where it asks first. */
const PAGES: [string, Type<unknown>, string, string][] = [
  ['People', PeopleComponent, 'anotoki-people-page', '/api/admin/people'],
  ['Feedback', FeedbackComponent, 'anotoki-feedback-page', '/api/admin/feedback'],
  ['Errors', ErrorsComponent, 'anotoki-error-log-page', '/api/admin/errors'],
  ['Audit log', AuditComponent, 'anotoki-audit-log-page', '/api/admin/audit'],
  ['Backups', BackupsComponent, 'anotoki-backups-page', '/api/admin/backups'],
];

describe('the admin panel’s pages that are the anotoki library’s (People, Feedback, Errors, Audit log, Backups)', () => {
  async function draw(component: Type<unknown>, admin: boolean): Promise<HTMLElement> {
    const auth = authStandIn();
    auth.user.set(person());
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        // The learner's pages are Slovak: these pages stay English all the same.
        provideTestTranslations({}, { language: 'sk', english: {} }),
        provideTestSiteStatus(),
        provideKitEnglish(),
        provideKit(),
        provideAdminTools(),
        { provide: AuthService, useValue: { ...auth, isAdmin: signal(admin), subject: () => '7' } },
      ],
    });
    const fixture = TestBed.createComponent(component);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('each is the library’s page in the admin panel’s frame - the page’s landmark, the panel’s width, English - asking its own addresses for the site’s ADMIN', async () => {
    for (const [name, component, tag, base] of PAGES) {
      const host = await draw(component, true);
      const frame = host.querySelector('main.wrap.wide.admin');
      expect(frame?.getAttribute('lang'), name).toBe('en');
      expect(frame?.querySelector(tag), name).not.toBeNull();
      const http = TestBed.inject(HttpTestingController);
      const asked = http.match((request) => request.url.startsWith(base));
      expect(asked.length, `${name} asks ${base}`).toBeGreaterThan(0);
      TestBed.resetTestingModule();
    }
  });

  it('for anybody but the site’s ADMIN each says whose it is, and asks the server nothing', async () => {
    for (const [name, component, , base] of PAGES) {
      await draw(component, false);
      const http = TestBed.inject(HttpTestingController);
      expect(
        http.match((request) => request.url.startsWith(base)),
        name,
      ).toEqual([]);
      TestBed.resetTestingModule();
    }
  });
});
