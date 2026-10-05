import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiError, ApiService } from '../../core/api/api.service';
import { MigrationsApplyResult, MigrationsStatus } from '../../core/api/api.types';
import { TranslationService } from '../../core/i18n/translation.service';
import { provideTestTranslations } from '../../core/testing/test-translations';
import { MigrationsComponent } from './migrations.component';

const APPLIED_AT = Date.UTC(2026, 9, 4, 8, 30);
const WAITING: MigrationsStatus = {
  applied: [
    { name: '001_init.sql', appliedAt: APPLIED_AT },
    { name: '005_own_time_zone_and_words.sql', appliedAt: APPLIED_AT },
  ],
  pending: [{ name: '006_admin_panel_words.sql', whole: true }],
};
const CURRENT: MigrationsStatus = { applied: [...WAITING.applied, { name: '006_admin_panel_words.sql', appliedAt: APPLIED_AT + 60_000 }], pending: [] };

describe('MigrationsComponent: the admin panel’s Migrations page (ADMIN)', () => {
  let host: HTMLElement;
  const api = { migrations: vi.fn<() => Promise<MigrationsStatus>>(), applyMigrations: vi.fn<() => Promise<MigrationsApplyResult>>() };

  async function draw(): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        // The learner's pages are Slovak: this page stays English all the same.
        provideTestTranslations({}, { language: 'sk' }),
        { provide: ApiService, useValue: api },
      ],
    });
    const fixture = TestBed.createComponent(MigrationsComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(host.querySelector('#pending, .err:not(:empty)')).not.toBeNull();
    });
  }

  const settle = () => TestBed.inject(ApplicationRef).whenStable();
  const text = (selector: string) => host.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  /** Each file of a list: its parts (name, badge or date), a space between. */
  const files = (list: string) => Array.from(host.querySelectorAll(`#${list} li`)).map((li) => Array.from(li.children, (part) => part.textContent?.trim()).join(' '));
  const errors = () => Array.from(host.querySelectorAll('p.err'), (p) => p.textContent?.trim()).filter(Boolean).join(' | ');
  const applyButton = () => host.querySelector<HTMLButtonElement>('#applyMigrations')!;
  /** The app's words asked for again (TranslationService.reload()), counted. */
  const reloads = () => vi.spyOn(TestBed.inject(TranslationService), 'reload').mockResolvedValue();

  beforeEach(() => {
    api.migrations.mockReset().mockResolvedValueOnce(WAITING).mockResolvedValue(CURRENT);
    api.applyMigrations.mockReset().mockResolvedValue({ applied: ['006_admin_panel_words.sql'], failed: null, error: null, backup: 'academy-before-migration-20261004-083000-000.raw.json' });
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

  /** The confirm dialog's words, and its answer. */
  async function answer(yes: boolean): Promise<{ title: string; message: string }> {
    await settle();
    const dialog = host.querySelector<HTMLDialogElement>('dialog.confirm')!;
    const said = { title: dialog.querySelector('h2')?.textContent ?? '', message: dialog.querySelector('p')?.textContent ?? '' };
    dialog.querySelectorAll<HTMLButtonElement>('.actions button')[yes ? 1 : 0].click();
    return said;
  }

  it('lists what waits, in the order it will run, and what is applied with when — in English, whatever the learner reads', async () => {
    await draw();
    expect(host.querySelector('main')?.getAttribute('lang')).toBe('en');
    expect(text('h1')).toBe('Migrations');
    expect(files('pending')).toEqual(['006_admin_panel_words.sql pending']);
    const when = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(APPLIED_AT);
    expect(files('applied')).toEqual([`001_init.sql ${when}`, `005_own_time_zone_and_words.sql ${when}`]);
    expect(text('#applied .small')).toBe('2 files');
    expect(applyButton().disabled).toBe(false);
  });

  it('Apply asks first; no answer, nothing sent', async () => {
    await draw();
    applyButton().click();
    const said = await answer(false);
    expect(said.title).toBe('Apply 1 pending migration?');
    expect(said.message).toContain('stopping at the first one that fails');
    await settle();
    expect(api.applyMigrations).not.toHaveBeenCalled();
  });

  it('Apply: what was applied, the copy taken first, and the lists read again — nothing pending, the button off', async () => {
    await draw();
    const reloaded = reloads();
    applyButton().click();
    await answer(true);
    await vi.waitFor(async () => {
      await settle();
      expect(host.querySelector('#applyResult')).not.toBeNull();
    });
    expect(api.applyMigrations).toHaveBeenCalledTimes(1);
    expect(text('#applyResult h2')).toBe('Up to date');
    expect(text('#applyResult p')).toBe(
      'Applied: 006_admin_panel_words.sql. A copy of every table from before is in backups/academy-before-migration-20261004-083000-000.raw.json.',
    );
    await vi.waitFor(async () => {
      await settle();
      expect(files('pending')).toEqual([]);
    });
    expect([text('#pending .empty b'), text('#pending .empty span')]).toEqual(['Nothing pending', 'The database is up to date with the files.']);
    expect(applyButton().disabled).toBe(true);
    // A panel opened while the update waited started without the app's words: they are asked for again, so the
    // learner's pages are not drawn in keys when the administrator goes back to them without a page load.
    expect(reloaded).toHaveBeenCalledTimes(1);
  });

  it('applied, with a file still on its way after it: not "Up to date" - which one waits, and the ones after it', async () => {
    for (const [after, said] of [
      [[], '007_b.sql is not whole yet and waits.'],
      [[{ name: '008_c.sql', whole: true }], '007_b.sql is not whole yet and waits, with the ones after it.'],
    ] as const) {
      const waits = [{ name: '007_b.sql', whole: false }, ...after];
      api.migrations
        .mockReset()
        .mockResolvedValueOnce({ applied: WAITING.applied, pending: [{ name: '006_a.sql', whole: true }, ...waits] })
        .mockResolvedValue({ applied: [...WAITING.applied, { name: '006_a.sql', appliedAt: APPLIED_AT }], pending: waits });
      api.applyMigrations.mockResolvedValue({ applied: ['006_a.sql'], failed: null, error: null, backup: null });
      await draw();
      const reloaded = reloads();
      applyButton().click();
      expect((await answer(true)).title).toBe('Apply 1 pending migration?');
      await vi.waitFor(async () => {
        await settle();
        expect(host.querySelector('#applyResult')).not.toBeNull();
      });
      expect(text('#applyResult h2')).toBe('Applied - one still waits');
      expect(text('#applyResult p')).toBe(`Applied: 006_a.sql. ${said}`);
      expect(files('pending')[0]).toBe('007_b.sql not whole yet');
      expect(applyButton().disabled).toBe(true);
      expect(reloaded).toHaveBeenCalledTimes(1); // nothing whole waits: the app's words answer again
      host.remove();
      TestBed.resetTestingModule();
    }
  });

  it('a migration that fails: where it stopped, what came before, and why in PostgreSQL’s own words — on a website too', async () => {
    api.migrations.mockReset().mockResolvedValue({ applied: WAITING.applied, pending: [{ name: '006_a.sql', whole: true }, { name: '007_b.sql', whole: true }] });
    api.applyMigrations.mockResolvedValue({ applied: ['006_a.sql'], failed: '007_b.sql', error: 'SQLSTATE[42P01]: relation "nowhere" does not exist', backup: null });
    await draw();
    const reloaded = reloads();
    applyButton().click();
    expect((await answer(true)).title).toBe('Apply 2 pending migrations?');
    await vi.waitFor(async () => {
      await settle();
      expect(host.querySelector('#applyResult')).not.toBeNull();
    });
    expect(host.querySelector('#applyResult')?.getAttribute('role')).toBe('alert');
    expect(text('#applyResult h2')).toBe('Stopped at 007_b.sql');
    expect(text('#applyResult p')).toBe('Applied first: 006_a.sql. The failed file was rolled back as a whole.');
    expect(text('#applyResult pre')).toBe('SQLSTATE[42P01]: relation "nowhere" does not exist');

    // A website's answer says why as this computer's does (the IAM's page alike): the page shows it, and never sends the
    // administrator to the server's error log.
    const why = 'SQLSTATE[42701]: Duplicate column: 7 ERROR:  column "time_zone" of relation "users" already exists';
    api.applyMigrations.mockResolvedValue({ applied: [], failed: '007_b.sql', error: why, backup: null });
    applyButton().click();
    await answer(true);
    await vi.waitFor(async () => {
      await settle();
      expect(host.querySelector('#applyResult pre code')?.textContent).toBe(why); // as it came, PostgreSQL's two spaces too
    });
    expect(text('#applyResult p')).toBe('Nothing was applied. The failed file was rolled back as a whole.');

    // An answer without the words (an older server) shows what it has, and no sentence about a log.
    api.applyMigrations.mockResolvedValue({ applied: [], failed: '007_b.sql', error: null, backup: null });
    applyButton().click();
    await answer(true);
    await vi.waitFor(async () => {
      await settle();
      expect(host.querySelector('#applyResult pre')).toBeNull();
    });
    expect(text('#applyResult p')).toBe('Nothing was applied. The failed file was rolled back as a whole.');
    expect(host.textContent).not.toContain('error log');
    expect(reloaded).not.toHaveBeenCalled(); // one still waits: the app's words would be refused all the same
  });

  it('a file still on its way: shown, and Apply stays off while it is the first pending one', async () => {
    api.migrations.mockReset().mockResolvedValue({ applied: WAITING.applied, pending: [{ name: '006_a.sql', whole: false }] });
    await draw();
    expect(files('pending')).toEqual(['006_a.sql not whole yet']);
    expect(applyButton().disabled).toBe(true);
  });

  it('refused, or busy: the server’s own sentence', async () => {
    api.applyMigrations.mockRejectedValue(new ApiError('The database is being brought up to date already. Try again in a moment.', 409, { code: 'busy' }));
    await draw();
    applyButton().click();
    await answer(true);
    await vi.waitFor(async () => {
      await settle();
      expect(errors()).toBe('The database is being brought up to date already. Try again in a moment.');
    });

    host.remove();
    TestBed.resetTestingModule();
    api.migrations.mockReset().mockRejectedValue(new ApiError("This is for the site's administrators.", 403, { code: 'admin_only' }));
    await draw();
    expect(errors()).toBe("The migrations could not be read: This is for the site's administrators.");
    expect(host.querySelector('#pending')).toBeNull();
  });
});
