import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslationService } from '../i18n/translation.service';
import { provideTestTranslations } from '../testing/test-translations';
import { AuthService } from './auth.service';
import { failureKey, fileNameOf, lockDown, PrivateLinksService, REPORT_CSP } from './private-links.service';

const META = `<meta http-equiv="Content-Security-Policy" content="${REPORT_CSP}">`;

describe('lockDown: a report opened from memory runs no script', () => {
  it('puts the policy right after the doctype', () => {
    expect(lockDown('<!doctype html><html><head><title>t</title></head></html>')).toBe(
      `<!doctype html>${META}<html><head><title>t</title></head></html>`,
    );
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
    const r = new Response('{}', { headers: { 'Content-Disposition': 'attachment; filename="kanji-progress-2026-09-29.json"' } });
    expect(fileNameOf(r)).toBe('kanji-progress-2026-09-29.json');
    expect(fileNameOf(new Response('{}'))).toBeNull();
  });
});

describe('failureKey: a report or a download that could not be had, by its status alone', () => {
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
    'report.notFound': 'No such report.',
    'error.unknown': 'Something went wrong.',
  };
  const SLOVAK = {
    'report.opening': 'Otvára sa…',
    'report.openFailed': 'Nepodarilo sa to otvoriť: {reason}',
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
  let alerted: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }),
        // As much of the sign-in as the service and the translation service read: a website, somebody signed in.
        { provide: AuthService, useValue: { state: signal('ready'), user: signal(null), signsIn: () => true, fetch: () => answer() } },
      ],
    });
    tab = { document: { title: '' }, opener: window, location: { replace: vi.fn() }, close: vi.fn() };
    opened = vi.spyOn(window, 'open').mockImplementation(() => tab as unknown as Window);
    alerted = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('a report that is not there: the waiting tab was named in the reader’s language, is closed, and the dialog says so in it — nothing of the server’s English', async () => {
    answer = () => Promise.resolve(new Response('No such report', { status: 404, headers: { 'Content-Type': 'text/plain' } }));
    await TestBed.inject(PrivateLinksService).open('/report/12');
    expect(opened).toHaveBeenCalledWith('', '_blank');
    expect(tab.document.title).toBe('Otvára sa…');
    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(tab.location.replace).not.toHaveBeenCalled();
    expect(alerted.mock.calls).toEqual([['Nepodarilo sa to otvoriť: Taká správa neexistuje.']]);
  });

  it('any other refusal: the general sentence, whatever the server wrote', async () => {
    answer = () =>
      Promise.resolve(new Response(JSON.stringify({ error: 'Something went wrong on the server. SQLSTATE[08006]', code: 'server_error' }), { status: 500, headers: { 'Content-Type': 'application/json' } }));
    await TestBed.inject(PrivateLinksService).open('/report/12');
    expect(alerted.mock.calls).toEqual([['Nepodarilo sa to otvoriť: Niečo sa pokazilo.']]);
    expect(String(alerted.mock.calls[0][0])).not.toContain('SQLSTATE');
  });

  it('no answer at all: the general sentence on the page, what it was in the console', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    answer = () => Promise.reject(new TypeError('Failed to fetch'));
    await TestBed.inject(PrivateLinksService).open('/report/12');
    expect(tab.close).toHaveBeenCalledTimes(1);
    expect(alerted.mock.calls).toEqual([['Nepodarilo sa to otvoriť: Niečo sa pokazilo.']]);
    expect(String(alerted.mock.calls[0][0])).not.toContain('Failed to fetch');
    expect(logged).toHaveBeenCalledTimes(1);
  });

  it('is worded at the moment it is raised: after a change of language, in the new one', async () => {
    answer = () => Promise.resolve(new Response('No such report', { status: 404 }));
    const links = TestBed.inject(PrivateLinksService);
    await links.open('/report/12');
    await TestBed.inject(TranslationService).setLanguage('en', false);
    await links.open('/report/12');
    expect(tab.document.title).toBe('Opening…');
    expect(alerted.mock.calls).toEqual([['Nepodarilo sa to otvoriť: Taká správa neexistuje.'], ['Could not open it: No such report.']]);
  });

  it('a download that fails opens no tab, and says so the same way', async () => {
    answer = () => Promise.resolve(new Response('', { status: 503 }));
    await TestBed.inject(PrivateLinksService).open('/api/kanji/export', { download: true });
    expect(opened).not.toHaveBeenCalled();
    expect(alerted.mock.calls).toEqual([['Nepodarilo sa to otvoriť: Niečo sa pokazilo.']]);
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
      expect(alerted).not.toHaveBeenCalled();
    } finally {
      urls.createObjectURL = real;
    }
  });
});
