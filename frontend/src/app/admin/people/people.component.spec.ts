import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiError, ApiService } from '../../core/api/api.service';
import { Person, VisitorsCount } from '../../core/api/api.types';
import { AuthService } from '../../core/auth/auth.service';
import type { AnotokiPreferences } from '../../core/auth/sdk/anotoki-auth';
import { drawKitQuestion, KitQuestion } from '../../core/testing/kit-question';
import { provideTestTranslations } from '../../core/testing/test-translations';
import { PeopleComponent } from './people.component';

const HANA: Person = { id: 7, username: 'hana', createdAt: Date.UTC(2026, 8, 22, 9), lastSeenAt: Date.UTC(2026, 9, 3, 18), timeZone: 'Asia/Tokyo', items: 120, attempts: 4 };
const ONE: Person = { id: 12, username: null, createdAt: null, lastSeenAt: null, timeZone: null, items: 1, attempts: 1 };

describe('PeopleComponent: the admin area’s People page (ADMIN)', () => {
  let host: HTMLElement;
  let page: ComponentFixture<PeopleComponent>;
  const api = {
    people: vi.fn<() => Promise<Person[]>>(),
    deletePerson: vi.fn<(id: number) => Promise<{ deleted: number; copy: string }>>(),
    visitors: vi.fn<() => Promise<VisitorsCount>>(),
  };
  /** The administrator's own account preferences, as the IAM sends them (null: none). */
  const preferences = signal<AnotokiPreferences | null>(null);
  /** The kit's question, drawn over the page as the app draws it (ConfirmService). */
  let question: KitQuestion | null = null;

  async function draw(): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        // The learner's pages are Slovak: this page stays English all the same.
        provideTestTranslations({}, { language: 'sk' }),
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { state: signal('ready'), user: signal({ sub: '7' }), preferences, isAdmin: signal(true), subject: () => '7' } },
      ],
    });
    const fixture = TestBed.createComponent(PeopleComponent);
    page = fixture;
    host = fixture.nativeElement;
    document.body.appendChild(host);
    question = drawKitQuestion(host);
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(host.querySelector('#people, .err:not(:empty)')).not.toBeNull();
    });
  }

  const rows = () => Array.from(host.querySelectorAll('#people tbody tr')).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent?.replace(/\s+/g, ' ').trim()));
  const settle = () => TestBed.inject(ApplicationRef).whenStable();

  beforeEach(() => {
    preferences.set(null);
    api.people.mockReset().mockResolvedValue([HANA, ONE]);
    api.visitors.mockReset().mockResolvedValue({ ready: false, count: 0, oldestSeenAt: null, keepDays: 30, max: 300 });
    api.deletePerson.mockReset().mockResolvedValue({ deleted: 12, copy: 'academy-before-delete-user-12-20261004-101500-000.json' });
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
    question?.remove();
    question = null;
    vi.restoreAllMocks();
  });

  /** The question's words, and its answer. */
  async function answer(yes: boolean): Promise<{ title: string; message: string }> {
    await settle();
    expect(question!.buttons()).toEqual(['Cancel', 'Delete']);
    const said = { title: question!.title(), message: question!.message() };
    question!.answer(yes);
    return said;
  }

  it('visitors (studying without signing in) are not in the list: one line says how many, the oldest seen, and the limits — once the database can keep them', async () => {
    const seen = Date.UTC(2026, 9, 1, 8, 30);
    api.visitors.mockResolvedValue({ ready: true, count: 12, oldestSeenAt: seen, keepDays: 30, max: 300 });
    await draw();
    await vi.waitFor(() => expect(host.querySelector('#visitors')).not.toBeNull());
    const when = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(seen);
    expect(host.querySelector('#visitors')?.textContent?.trim()).toBe(
      `Visitors (not signed in): 12, the oldest seen ${when}. Each is deleted 30 days after their last visit; at most 300 are kept at a time.`,
    );
  });

  it('no visitors line while the database cannot keep them (migration 007 waits), nor when it cannot be had', async () => {
    await draw();
    expect(host.querySelector('#visitors')).toBeNull();
    host.remove();
    TestBed.resetTestingModule();
    api.visitors.mockRejectedValue(new ApiError('Refused.', 503, {}));
    await draw();
    expect(host.querySelector('#visitors')).toBeNull();
    expect(rows()).toHaveLength(2);
  });

  it('lists everybody, the latest seen first, in English: name (or number), when, zone, how far they came; and marks the one looking', async () => {
    await draw();
    expect(host.querySelector('main')?.getAttribute('lang')).toBe('en');
    const [hana, one] = rows();
    const first = host.querySelector('#people tbody tr')!;
    expect([first.querySelector('b')?.textContent, first.querySelector('.tag')?.textContent, first.querySelector('.id')?.textContent]).toEqual(['hana', 'you', '#7']);
    expect(hana[1], 'a moment written in English, whatever the language on the learner pages').toBe(new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(HANA.createdAt!));
    expect(hana[3]).toBe('Asia/Tokyo');
    expect(hana.slice(4, 6)).toEqual(['120 items', '4 attempts']);
    expect(one[0], 'the name, its number, and its one action under it').toBe('user 12#12 Delete data');
    expect(hana).toHaveLength(6);
    expect(host.querySelectorAll('#people .tag'), 'only the one looking is "you"').toHaveLength(1);
    expect(one.slice(1, 6)).toEqual(['—', '—', '—', '1 item', '1 attempt']);
  });

  it('an administrator who chose a date order and a clock for their account reads the moments in them, the rest still English — and follows a change', async () => {
    // Local times, so the day and the clock are the same in every time zone the tests run in.
    const created = new Date(2026, 8, 22, 9, 5).getTime();
    const seen = new Date(2026, 9, 3, 21, 5).getTime();
    api.people.mockResolvedValue([{ ...HANA, createdAt: created, lastSeenAt: seen }]);
    preferences.set({ theme: 'auto', date_format: 'ymd_dash', time_format: '12' });
    await draw();
    expect(rows()[0].slice(1, 3)).toEqual(['2026-09-22 9:05 am', '2026-10-03 9:05 pm']);

    // Only the clock chosen, on another anotoki site: the date in the panel's English, the clock theirs.
    preferences.set({ theme: 'auto', date_format: null, time_format: '24' });
    await settle();
    const [first, last] = rows()[0].slice(1, 3);
    expect(first).toMatch(/^22 Sept? 2026 09:05$/);
    expect(last).toBe('3 Oct 2026 21:05');
  });

  it('deletes a person’s data only after a question that names what goes; the list and the status line say it is done', async () => {
    await draw();
    host.querySelectorAll<HTMLButtonElement>('#people tbody tr')[1].querySelector('button')!.click();
    const said = await answer(true);
    expect(said.title).toBe("Delete user 12's data?");
    expect(said.message).toContain('1 item learned');
    expect(said.message).toContain('1 attempt at the exam');
    expect(said.message).toContain('keeps a copy of it first');
    await vi.waitFor(async () => {
      await settle();
      expect(rows()).toHaveLength(1);
    });
    expect(api.deletePerson.mock.calls).toEqual([[12]]);
    expect(host.querySelector('.status')?.textContent).toBe("user 12's data is deleted. A copy of it is in backups/academy-before-delete-user-12-20261004-101500-000.json.");
  });

  it('No deletes nothing; deleting oneself is said in the question', async () => {
    await draw();
    host.querySelectorAll<HTMLButtonElement>('#people tbody tr')[0].querySelector('button')!.click();
    const said = await answer(false);
    expect(said.message).toContain('This is you.');
    await settle();
    expect(api.deletePerson).not.toHaveBeenCalled();
    expect(rows()).toHaveLength(2);
  });

  it('a question still open when the page goes (Back pressed) is answered no with it: nothing deleted, nothing left over the next page', async () => {
    await draw();
    host.querySelectorAll<HTMLButtonElement>('#people tbody tr')[1].querySelector('button')!.click();
    await settle();
    expect(question!.open()).toBe(true);
    page.destroy();
    await vi.waitFor(async () => {
      await settle();
      expect(question!.open()).toBe(false);
    });
    expect(api.deletePerson).not.toHaveBeenCalled();
  });

  it('a refusal is the server’s own sentence, English as the page', async () => {
    api.deletePerson.mockRejectedValue(new ApiError('This is for the site’s administrators.', 403, { code: 'admin_only' }));
    await draw();
    host.querySelectorAll<HTMLButtonElement>('#people tbody tr')[1].querySelector('button')!.click();
    await answer(true);
    await vi.waitFor(async () => {
      await settle();
      expect(host.querySelector('p.err[role=alert]:not(:empty)')?.textContent).toBe('This is for the site’s administrators.');
    });
    expect(rows()).toHaveLength(2);
  });
});
