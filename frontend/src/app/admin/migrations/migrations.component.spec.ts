import { HttpTestingController } from '@angular/common/http/testing';
import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SiteStatus } from '@anotoki/lib/migrations';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { AuthService } from '../../core/auth/auth.service';
import { fmtAdminMoment } from '../../core/format';
import { TimeWording } from '../../core/i18n/time-wording';
import { authStandIn, AuthStandIn, NO_CHOICE, person } from '../../core/testing/auth-states';
import { provideTestSiteStatus } from '../../core/testing/site-status';
import { MigrationsComponent } from './migrations.component';

const APPLIED_AT = '2026-10-04T08:30:00Z';
/** GET /api/admin/migrations while 006 waits, and a draft after it: the anotoki library's engine, as the server answers. */
const WAITING = {
  sets: ['academy'],
  applied: [
    { set: 'academy', name: '001_init.sql', applied_at: APPLIED_AT },
    { set: 'academy', name: '005_own_time_zone_and_words.sql', applied_at: APPLIED_AT },
  ],
  pending: [
    { set: 'academy', name: '006_admin_panel_words.sql', ready: true, blocked: false },
    { set: 'academy', name: '007_visitors.sql', ready: false, blocked: false },
  ],
  missing: [],
};
const APPLIED = {
  ...WAITING,
  applied: [...WAITING.applied, { set: 'academy', name: '006_admin_panel_words.sql', applied_at: '2026-10-04T08:31:00Z' }],
  pending: [WAITING.pending[1]],
};

describe('MigrationsComponent: the admin panel’s Migrations page — the anotoki library’s, in the panel’s frame (ADMIN)', () => {
  let host: HTMLElement;
  let auth: AuthStandIn;
  let http: HttpTestingController;

  async function draw(admin = true): Promise<void> {
    auth = authStandIn();
    auth.user.set(person({ ...NO_CHOICE, date_format: 'ymd_dash', time_format: '24' }));
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        // The learner's pages are Slovak: this page stays English all the same.
        provideTestTranslations({}, { language: 'sk' }),
        provideTestSiteStatus(),
        { provide: AuthService, useValue: { ...auth, isAdmin: () => admin } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(MigrationsComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await fixture.whenStable();
  }

  const settle = () => TestBed.inject(ApplicationRef).whenStable();
  const text = (selector: string) => host.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  /** The server's answer to the request the page sends (as soon as it has sent it). */
  const answer = async (url: string, body: object, method = 'GET') => {
    const request = await vi.waitFor(() => http.expectOne((sent) => sent.url === url && sent.method === method));
    request.flush(body);
    await settle();
  };

  beforeEach(() => {
    const proto = HTMLDialogElement.prototype as { showModal?: () => void; close?: () => void };
    if (typeof proto.showModal !== 'function') {
      proto.showModal = function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      };
    }
    if (typeof proto.close !== 'function') {
      proto.close = function (this: HTMLDialogElement) {
        this.removeAttribute('open');
      };
    }
  });
  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
  });

  it('in the admin panel’s frame, in English whatever the learner reads: what waits (a draft as a draft), what is applied, each in the date order the administrator chose', async () => {
    await draw();
    expect(host.querySelector('main.wrap.wide.admin')?.getAttribute('lang')).toBe('en');
    expect(host.querySelector('main anotoki-migrations-page')).not.toBeNull();
    await answer('/api/admin/migrations', WAITING);
    expect(text('anotoki-migrations-page h1')).toBe('Migrations');
    await vi.waitFor(() =>
      expect(Array.from(host.querySelectorAll('[data-pending] .anotoki-migrations-page__file'), (li) => Array.from(li.children, (part) => part.textContent?.trim()).join(' '))).toEqual([
        '006_admin_panel_words.sql pending',
        '007_visitors.sql draft a draft - it does not run until it is finished',
      ]),
    );
    // The account's date order and clock (2026-10-04, 24 h), as the rest of the admin panel writes a moment.
    const when = fmtAdminMoment(TestBed.inject(TimeWording), Date.parse(APPLIED_AT));
    expect(when).toMatch(/^2026-10-0[45] \d\d:\d\d$/);
    expect(Array.from(host.querySelectorAll('[data-applied] time'), (time) => time.textContent?.trim())).toEqual([when, when]);
    expect(host.querySelector<HTMLButtonElement>('[data-apply]')?.disabled).toBe(false);
  });

  it('Apply: asked first, then what was applied and the copy the server took first; nothing left to apply - the site runs again, its words asked for anew', async () => {
    await draw();
    await answer('/api/admin/migrations', WAITING);
    TestBed.inject(SiteStatus).report('update_pending');
    const reloaded = vi.spyOn(TestBed.inject(TranslationService), 'reload');
    // Apply is the kit's button: on once the page has drawn what it read.
    await vi.waitFor(() => expect(host.querySelector<HTMLButtonElement>('[data-apply]')!.disabled).toBe(false));
    host.querySelector<HTMLButtonElement>('[data-apply]')!.click();
    await settle();
    expect(text('[data-confirm] h2')).toBe('Apply 1 pending migration?');
    host.querySelector<HTMLButtonElement>('[data-confirm-apply]')!.click();
    await settle();
    await answer(
      '/api/admin/migrations/apply',
      {
        applied: [{ set: 'academy', name: '006_admin_panel_words.sql' }],
        failed: null,
        error: null,
        note: 'A copy of every table from before is in backups/academy-before-migration-20261004-083000-000.raw.json.',
      },
      'POST',
    );
    await answer('/api/admin/migrations', APPLIED);
    await vi.waitFor(() => expect(text('[data-result] .anotoki-alert__heading')).toBe('Up to date'));
    expect(text('[data-result]')).toContain('Applied: 006_admin_panel_words.sql.');
    expect(text('[data-result]')).toContain('A copy of every table from before is in backups/academy-before-migration-20261004-083000-000.raw.json.');
    expect(reloaded).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(SiteStatus).state()).toBe('ready');
  });

  it('for anybody but the site’s ADMIN, only whose page it is - and nothing asked of the server', async () => {
    await draw(false);
    expect(text('anotoki-migrations-page')).toBe('Migrations are for administrators.');
    http.expectNone('/api/admin/migrations');
  });
});
