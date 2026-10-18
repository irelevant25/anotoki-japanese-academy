import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslationService } from '@anotoki/lib/translations';
import { provideTestTranslations } from '@anotoki/lib/translations/testing';
import { Notice, NoticeService } from '../notice/notice.service';
import { AuthService } from './auth.service';
import { failureKey, fileNameOf, lockDown, PrivateLinksService, REPORT_CSP } from './private-links.service';
import { derivedFromState } from '../testing/auth-states';
import { VISITOR_STORAGE_KEY, VisitorKey } from './visitor-key';

const META = `<meta http-equiv="Content-Security-Policy" content="${REPORT_CSP}">`;

describe('lockDown: a report opened from memory runs no script', () => {
  it('puts the policy right after the doctype', () => {
    expect(lockDown('<!doctype html><html><head><title>t</title></head></html>')).toBe(`<!doctype html>${META}<html><head><title>t</title></head></html>`);
    expect(lockDown('\n  <!DOCTYPE html><p>x</p>')).toBe(`\n  <!DOCTYPE html>${META}<p>x</p>`);
  });

  it('before anything else: a script ahead of the page’s own <head>', () => {
    const evil = '<script>window.pwned = 1</script><!doctype html><html><head></head></html>';
    expect(lockDown(evil).startsWith(META)).toBe(true);
  });

  it('and before a character HTML reads as text (a no-break space is not a space to it)', () => {
    expect(lockDown(' <!doctype html><script>x</script>').startsWith(META)).toBe(true);
  });

  it('allows no script at all', () => {
    expect(REPORT_CSP).toContain("default-src 'none'");
    expect(REPORT_CSP).not.toContain('script-src');
  });
});

describe('fileNameOf', () => {
  it('takes the name the server gives a download', () => {
    const r = new Response('{}', { headers: { 'Content-Disposition': 'attachment; filename="japanese-academy-2026-09-29.json"' } });
    expect(fileNameOf(r)).toBe('japanese-academy-2026-09-29.json');
    expect(fileNameOf(new Response('{}'))).toBeNull();
  });
});

describe('failureKey: a report that could not be had, by its status alone', () => {
  it('404 is a report that is not there; anything else the general sentence', () => {
    expect(failureKey(404)).toBe('report.notFound');
    for (const status of [0, 400, 401, 403, 500, 502, 503]) {
      expect(failureKey(status), String(status)).toBe('error.unknown');
    }
  });
});

describe('PrivateLinksService: what it says itself, in the language on the page', () => {
  const ENGLISH = {
    'report.opening': 'Opening…',
    'report.openFailed': 'Could not open it: {reason}',
    'report.openFailedTitle': 'The report did not open',
    'report.notFound': 'No such report.',
    'error.unknown': 'Something went wrong.',
  };
  const SLOVAK = {
    'report.opening': 'Otvára sa…',
    'report.openFailed': 'Nepodarilo sa to otvoriť: {reason}',
    'report.openFailedTitle': 'Správa sa neotvorila',
    'report.notFound': 'Taká správa neexistuje.',
    'error.unknown': 'Niečo sa pokazilo.',
  };

  /** The tab window.open() hands back, as much of it as the service touches. */
  interface Tab {
    document: { title: string };
    opener: unknown;
    location: { replace: ReturnType<typeof vi.fn> };
    close: ReturnType<typeof vi.fn>;
  }

  let answer: () => Promise<Response>;
  let tab: Tab;
  let opened: ReturnType<typeof vi.spyOn>;
  let box: ReturnType<typeof vi.spyOn>;
  /** The app's notices raised (NoticeService, drawn with the kit's dialog in the app's root), in order. */
  let told: Notice[];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }),
        // As much of the sign-in as the service and the translation service read: somebody signed in.
        { provide: AuthService, useValue: { state: signal('ready'), ...derivedFromState(signal('ready')), user: signal(null), fetch: () => answer() } },
      ],
    });
    tab = { document: { title: '' }, opener: window, location: { replace: vi.fn() }, close: vi.fn() };
    opened = vi.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window);
    // Never the browser's own box.
    box = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    told = [];
    // On the prototype: a test overrides a provider before anything is injected.
    const tell = NoticeService.prototype.tell;
    vi.spyOn(NoticeService.prototype, 'tell').mockImplementation(function (this: NoticeService, said: Notice) {
      told.push(said);
      return tell.call(this, said);
    });
  });
  afterEach(() => {
    try {
      expect(box, 'never the browser’s own box').not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('a report that is not there: the waiting tab was named in the reader’s language, is closed, and the dialog says so in it — nothing of the server’s English', async () => {
    answer = () => Promise.resolve(new Response('No such report', { status: 404, headers: { 'Content-Type': 'text/plain' } }));
    await TestBed.inject(PrivateLinksService).open('/report/12');
    expect(opened).toHaveBeenCalledWith('', '_blank');
    expect(tab.document.title).toBe('Otvára sa…');
    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(tab.location.replace).not.toHaveBeenCalled();
    expect(told).toEqual([{ title: 'Správa sa neotvorila', message: 'Nepodarilo sa to otvoriť: Taká správa neexistuje.' }]);
    expect(TestBed.inject(NoticeService).pending()?.message, 'drawn until it is closed').toBe('Nepodarilo sa to otvoriť: Taká správa neexistuje.');
  });

  it('a visitor’s report (studying without signing in): fetched as the visitor’s (the library’s fetch() sends the key this browser holds) — and a key the server no longer knows is forgotten', async () => {
    const key = 'k'.repeat(43);
    localStorage.setItem(VISITOR_STORAGE_KEY, key);
    const sent: (string | null)[] = [];
    let status = 200;
    const visiting = signal('visiting');
    TestBed.overrideProvider(AuthService, {
      useValue: {
        state: visiting,
        ...derivedFromState(visiting),
        user: signal(null),
        fetch: (url: string) => {
          // What the library's fetch() would send as a visitor's: the key held as the request leaves.
          sent.push(url === '/report/12' ? localStorage.getItem(VISITOR_STORAGE_KEY) : null);
          return Promise.resolve(new Response(JSON.stringify(status === 401 ? { code: 'visitor_unknown' } : {}), { status }));
        },
      },
    });
    const links = TestBed.inject(PrivateLinksService);
    const urls = URL as unknown as { createObjectURL?: (blob: Blob) => string };
    const real = urls.createObjectURL;
    urls.createObjectURL = () => 'blob:report';
    try {
      await links.open('/report/12');
      status = 401;
      await links.open('/report/12');
    } finally {
      urls.createObjectURL = real;
    }
    expect(sent).toEqual([key, key]);
    expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBeNull();
    expect(TestBed.inject(VisitorKey).lost()).toBe(true);
  });

  it('any other refusal: the general sentence, whatever the server wrote', async () => {
    answer = () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: 'Something went wrong on the server. SQLSTATE[08006]', code: 'server_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } }),
      );
    await TestBed.inject(PrivateLinksService).open('/report/12');
    expect(told.map((said) => said.message)).toEqual(['Nepodarilo sa to otvoriť: Niečo sa pokazilo.']);
    expect(JSON.stringify(told)).not.toContain('SQLSTATE');
  });

  it('the site being updated (or not set up after all): the waiting tab closed, and no dialog — the anotoki library’s page says what is going on', async () => {
    for (const code of ['update_pending', 'not_set_up']) {
      answer = () =>
        Promise.resolve(new Response(JSON.stringify({ code, message: 'The site is being updated. Try again in a few minutes.' }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
      await TestBed.inject(PrivateLinksService).open('/report/12');
    }
    expect(tab.close).toHaveBeenCalledTimes(2);
    expect(tab.location.replace).not.toHaveBeenCalled();
    expect(told).toEqual([]);
  });

  it('no answer at all: the general sentence on the page, what it was in the console', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    answer = () => Promise.reject(new TypeError('Failed to fetch'));
    await TestBed.inject(PrivateLinksService).open('/report/12');
    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(told.map((said) => said.message)).toEqual(['Nepodarilo sa to otvoriť: Niečo sa pokazilo.']);
    expect(JSON.stringify(told)).not.toContain('Failed to fetch');
    expect(logged).toHaveBeenCalledTimes(1);
  });

  it('is worded at the moment it is raised: after a change of language, in the new one', async () => {
    answer = () => Promise.resolve(new Response('No such report', { status: 404 }));
    const links = TestBed.inject(PrivateLinksService);
    await links.open('/report/12');
    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await links.open('/report/12');
    expect(tab.document.title).toBe('Opening…');
    expect(told).toEqual([
      { title: 'Správa sa neotvorila', message: 'Nepodarilo sa to otvoriť: Taká správa neexistuje.' },
      { title: 'The report did not open', message: 'Could not open it: No such report.' },
    ]);
  });

  it('a report that comes is opened from memory with its no-script policy, and nothing is said', async () => {
    const pages: Blob[] = [];
    const urls = URL as unknown as { createObjectURL?: (blob: Blob) => string };
    const real = urls.createObjectURL;
    urls.createObjectURL = (blob: Blob) => `blob:report-${pages.push(blob)}`;
    try {
      answer = () => Promise.resolve(new Response('<!doctype html><title>Report</title>', { status: 200, headers: { 'Content-Type': 'text/html' } }));
      await TestBed.inject(PrivateLinksService).open('/report/12');
      expect(tab.opener).toBeNull();
      expect(tab.location.replace).toHaveBeenCalledWith('blob:report-1');
      expect(await pages[0].text()).toBe(`<!doctype html>${META}<title>Report</title>`);
      expect(tab.close).not.toHaveBeenCalled();
      expect(told).toEqual([]);
    } finally {
      urls.createObjectURL = real;
    }
  });
});
