import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiError, ApiService } from '../../core/api/api.service';
import { BroughtBack } from '../../core/api/api.types';
import { AuthService } from '../../core/auth/auth.service';
import { provideTestTranslations } from '../../core/testing/test-translations';
import { IMPORT_CEILING, readDataFile, YourDataComponent } from './your-data.component';

/** A data file as GET /api/me/data writes it (backend/src/me.php), of these people. */
function dataFile(people: { id: number; username?: string; items?: Record<string, { stage: number }>; attempts?: number }[]): string {
  return JSON.stringify({
    format: 'japanese-academy-backup',
    version: 2,
    takenAt: '2026-10-03T18:30:00.000Z',
    everybody: false,
    users: people.map((p) => ({
      id: p.id,
      username: p.username ?? null,
      kanji: { version: 1, items: p.items ?? {}, daily: {}, settings: {} },
      log: [],
      attempts: Array.from({ length: p.attempts ?? 0 }, (_, i) => ({ attempt: { id: `a${i}`, finishedAt: '2026-10-01T10:00:00Z' } })),
    })),
  });
}

describe('readDataFile: what a file holds, read before anything is sent', () => {
  it('a file of one person, whatever their id (another copy of the app): its items learned and its attempts', () => {
    const holds = readDataFile('mine.json', dataFile([{ id: 99, username: 'hana', items: { 'k:大': { stage: 3 }, 'k:小': { stage: 0 }, 'v:大きい': { stage: 9 } }, attempts: 2 }]), 7);
    expect(holds).toMatchObject({ name: 'mine.json', username: 'hana', items: 2, attempts: 2, takenAt: '2026-10-03T18:30:00.000Z' });
  });

  it('a backup of several: the caller’s part, as the server takes it — or several_people when none is theirs', () => {
    const several = dataFile([{ id: 1, attempts: 1 }, { id: 7, attempts: 4 }]);
    expect(readDataFile('all.json', several, 7).attempts).toBe(4);
    expect(() => readDataFile('all.json', several, 8)).toThrow(ApiError);
    try {
      readDataFile('all.json', several, null);
    } catch (e) {
      expect((e as ApiError).code).toBe('several_people');
    }
  });

  it('anything else is not a data file: not JSON, another format or version, nobody in it', () => {
    for (const text of ['', 'not json', '{"format":"something-else","version":2,"users":[{}]}', dataFile([{ id: 1 }]).replace('"version":2', '"version":1'), '{"format":"japanese-academy-backup","version":2,"users":[]}']) {
      let code = '';
      try {
        readDataFile('x.json', text, 7);
      } catch (e) {
        code = (e as ApiError).code;
      }
      expect(code, text.slice(0, 30)).toBe('not_a_data_file');
    }
  });

  it('a file in another shape than the app writes is refused here, as the server refuses it (the cases of me.test.php): never asked about', () => {
    const good = JSON.parse(dataFile([{ id: 7, items: { 'k:大': { stage: 2 } }, attempts: 1 }])) as { users: Record<string, unknown>[] };
    const person = good.users[0];
    const kanji = person['kanji'] as Record<string, unknown>;
    const attempt = (person['attempts'] as { attempt: Record<string, unknown> }[])[0].attempt;
    const file = (users: unknown): string => JSON.stringify({ format: 'japanese-academy-backup', version: 2, everybody: false, users });
    const withPart = (change: Record<string, unknown>): string => file([{ ...person, ...change }]);
    const without = (part: string): string => file([Object.fromEntries(Object.entries(person).filter(([key]) => key !== part))]);
    const kanjiWithout = (part: string): string => withPart({ kanji: Object.fromEntries(Object.entries(kanji).filter(([key]) => key !== part)) });
    const cases = [
      // the kanji progress
      '{"format":"japanese-academy-backup","version":2,"users":[{}]}',
      '{"format":"japanese-academy-backup","version":2,"users":[{"kanji":[0]}]}',
      withPart({ kanji: 'all of it' }),
      withPart({ kanji: { items: 'x' } }),
      withPart({ kanji: null }),
      withPart({ kanji: [0] }),
      withPart({ kanji: [] }),
      without('kanji'),
      kanjiWithout('version'),
      kanjiWithout('items'),
      kanjiWithout('daily'),
      kanjiWithout('settings'),
      withPart({ kanji: { ...kanji, version: 2 } }),
      withPart({ kanji: { ...kanji, items: ['x', 'y'] } }),
      // the log
      withPart({ log: { first: { t: 1, kind: 'lesson' } } }),
      withPart({ log: 'x' }),
      withPart({ log: null }),
      without('log'),
      // the attempts
      withPart({ attempts: 'x' }),
      withPart({ attempts: null }),
      without('attempts'),
      withPart({ attempts: [{ attempt: { ...attempt, finishedAt: 'not a time at all' }, report: null }] }),
      withPart({ attempts: [{ attempt: { ...attempt, finishedAt: null }, report: null }] }),
      withPart({ attempts: [{ attempt, report: ['html'] }] }),
      withPart({ attempts: [{ attempt: { ...attempt, id: null } }] }),
      withPart({ attempts: ['x'] }),
      // nobody
      file(['x', 3]),
    ];
    for (const text of cases) {
      let code = '';
      try {
        readDataFile('x.json', text, 7);
      } catch (e) {
        code = (e as ApiError).code;
      }
      expect(code, text.slice(0, 120)).toBe('not_a_data_file');
    }
  });

  it('the shape the app writes, an empty one too ({} and [] alike, as PHP writes an empty object): taken', () => {
    const empty = JSON.stringify({ format: 'japanese-academy-backup', version: 2, users: [{ id: 7, kanji: { version: 1, items: [], daily: [], settings: [] }, log: [], attempts: [] }] });
    expect(readDataFile('empty.json', empty, 7)).toMatchObject({ items: 0, attempts: 0 });
    const reported = JSON.parse(dataFile([{ id: 7, attempts: 1 }])) as { users: { attempts: Record<string, unknown>[] }[] };
    reported.users[0].attempts[0]['report'] = '<!doctype html><p>report</p>';
    expect(readDataFile('reported.json', JSON.stringify(reported), 7).attempts).toBe(1);
  });
});

describe('YourDataComponent', () => {
  const ENGLISH = {
    'yourData.title': 'Your data',
    'yourData.intro': 'Everything the app keeps of you, as one file.',
    'yourData.timeZone': 'Your days and review times follow your time zone: {zone}.',
    'yourData.download': 'Download your data',
    'yourData.downloading': 'Preparing the file…',
    'yourData.downloadFailed': 'Could not download it: {reason}',
    'yourData.bringBack': 'Bring back a file',
    'yourData.bringBackNote': 'A file you bring back replaces all your data here.',
    'yourData.bringing': 'Bringing your data back…',
    'yourData.confirmTitle': 'Replace your data with this file?',
    'yourData.confirmText': 'Everything you have here now is replaced by what the file holds.',
    'yourData.fileTaken': 'Made on {when}',
    'yourData.fileAccount': 'Account: {name}',
    'yourData.fileItems': 'Items learned: {n}',
    'yourData.fileAttempts': 'Exam attempts: {n}',
    'yourData.cancel': 'Cancel',
    'yourData.replace': 'Replace my data',
    'yourData.done': 'Done: your data is now what the file held.',
    'yourData.copyKept': 'A copy of what was here before is kept on the server.',
    'yourData.tooBig': 'That file is {size}, and this server takes at most {limit}.',
    'yourData.megabytes': '{n} MB',
    'yourData.notBrought': 'The file was not brought back: {reason}',
    'error.too_large': 'That file is bigger than this server takes.',
    'error.not_a_data_file': 'That is not a Japanese Academy data file, or it is damaged.',
    'error.several_people': 'That file holds the data of several people, and none of them is you.',
    'error.database_unavailable': 'The database is not reachable.',
    'error.offline': 'The server does not answer.',
  };
  const SLOVAK = { ...ENGLISH, 'yourData.megabytes': '{n} MB', 'yourData.tooBig': 'Ten súbor má {size} a tento server prijme najviac {limit}.' };

  let fixture: ComponentFixture<YourDataComponent>;
  let host: HTMLElement;
  let answer: () => Promise<Response>;
  const bringBack = vi.fn<(text: string) => Promise<BroughtBack>>();
  const fetched: string[] = [];

  async function draw(language: 'en' | 'sk' = 'en'): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        language === 'en' ? provideTestTranslations(ENGLISH) : provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }),
        { provide: ApiService, useValue: { bringBack } },
        {
          provide: AuthService,
          useValue: {
            // as much of the sign-in as the card and the translation service read
            state: signal('ready'),
            user: signal(null),
            preferences: signal(null),
            subject: () => '7',
            fetch: (url: string) => {
              fetched.push(url);
              return answer();
            },
          },
        },
      ],
    });
    fixture = TestBed.createComponent(YourDataComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await fixture.whenStable();
  }

  const text = (selector: string) => host.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  /** The question, the kit's dialog: open while it is drawn. */
  const questionOpen = () => host.querySelector<HTMLDialogElement>('anotoki-dialog dialog')?.open ?? false;
  const settle = () => TestBed.inject(ApplicationRef).whenStable();

  /** The learner picks this file in the file picker. */
  async function pick(file: File): Promise<void> {
    const input = host.querySelector<HTMLInputElement>('input[type=file]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    const card = fixture.componentInstance;
    await vi.waitFor(async () => {
      await settle();
      expect(card.holds() !== null || card.refusal() !== null).toBe(true);
    });
  }

  beforeEach(() => {
    fetched.length = 0;
    bringBack.mockReset();
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
    host?.remove();
    vi.restoreAllMocks();
  });

  it('says which time zone the learner’s days follow: the one the browser names', async () => {
    await draw();
    expect(text('#yourZone')).toBe(`Your days and review times follow your time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`);
  });

  it('Download: the file through the sign-in’s own fetch, saved under the name the server gives it', async () => {
    await draw();
    const urls = URL as unknown as { createObjectURL?: (blob: Blob) => string; revokeObjectURL?: (url: string) => void };
    const saved: { name: string; href: string }[] = [];
    urls.createObjectURL = () => 'blob:data-1';
    urls.revokeObjectURL = () => undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ name: this.download, href: this.getAttribute('href') ?? '' });
    });
    answer = () => Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Disposition': 'attachment; filename="japanese-academy-2026-10-04.json"' } }));
    host.querySelector<HTMLButtonElement>('#downloadData')!.click();
    await vi.waitFor(() => expect(saved).toEqual([{ name: 'japanese-academy-2026-10-04.json', href: 'blob:data-1' }]));
    expect(fetched).toEqual(['/api/me/data']);
    expect(text('#yourDataError')).toBe('');
  });

  it('a download that fails says why, from its code', async () => {
    await draw();
    answer = () => Promise.resolve(new Response(JSON.stringify({ error: 'The database is not reachable: x', code: 'database_unavailable' }), { status: 503 }));
    host.querySelector<HTMLButtonElement>('#downloadData')!.click();
    await vi.waitFor(async () => {
      await settle();
      expect(text('#yourDataError')).toBe('Could not download it: The database is not reachable.');
    });
  });

  it('Bring back: the file is read here, the question says what it holds, and No sends nothing', async () => {
    await draw();
    await pick(new File([dataFile([{ id: 7, username: 'hana', items: { 'k:大': { stage: 2 } }, attempts: 3 }])], 'japanese-academy-2026-10-03.json'));
    expect(questionOpen()).toBe(true);
    expect(text('anotoki-dialog h2')).toBe('Replace your data with this file?');
    const list = Array.from(host.querySelectorAll('anotoki-dialog .holds li')).map((li) => li.textContent?.trim());
    expect(list[0]).toBe('japanese-academy-2026-10-03.json');
    expect(list).toContain('Account: hana');
    expect(list).toContain('Items learned: 1');
    expect(list).toContain('Exam attempts: 3');
    await vi.waitFor(() => expect(document.activeElement?.id, 'the focus on the safe answer, not on the dialog').toBe('keepMine'));

    host.querySelector<HTMLButtonElement>('#keepMine')!.click();
    await settle();
    expect(questionOpen()).toBe(false);
    expect(bringBack).not.toHaveBeenCalled();
  });

  it('Yes: the file goes as it is, replaces the data, and the page around it is told', async () => {
    await draw();
    const brought: BroughtBack[] = [];
    fixture.componentInstance.brought.subscribe((counts) => brought.push(counts));
    const file = dataFile([{ id: 7, items: { 'k:大': { stage: 2 } } }]);
    bringBack.mockResolvedValue({ items: 1, days: 0, log: 0, attempts: 0, reports: 0, copy: true });
    await pick(new File([file], 'mine.json'));
    host.querySelector<HTMLButtonElement>('#replaceMine')!.click();
    await vi.waitFor(async () => {
      await settle();
      expect(text('#yourDataDone')).toBe('Done: your data is now what the file held. A copy of what was here before is kept on the server.');
    });
    expect(bringBack.mock.calls).toEqual([[file]]);
    expect(brought).toHaveLength(1);
    expect(questionOpen()).toBe(false);
  });

  it('a file that is not a data file is refused here, before anything is sent', async () => {
    await draw();
    await pick(new File(['{"hello": 1}'], 'notes.json'));
    expect(text('#yourDataError')).toBe('The file was not brought back: That is not a Japanese Academy data file, or it is damaged.');
    expect(questionOpen()).toBe(false);
    expect(bringBack).not.toHaveBeenCalled();
  });

  it('a backup of several people, none of them the learner: refused here too, in the server’s own words for it', async () => {
    await draw();
    await pick(new File([dataFile([{ id: 1 }, { id: 2 }])], 'everybody.json'));
    expect(text('#yourDataError')).toBe('The file was not brought back: That file holds the data of several people, and none of them is you.');
    expect(bringBack).not.toHaveBeenCalled();
  });

  it('a file bigger than any server takes is not even read; a 413 names this server’s own limit, which counts from then on', async () => {
    await draw('sk');
    const huge = new File(['{}'], 'huge.json');
    Object.defineProperty(huge, 'size', { value: IMPORT_CEILING + 1 });
    await pick(huge);
    expect(text('#yourDataError')).toBe('Ten súbor má 16 MB a tento server prijme najviac 16 MB.');
    expect(bringBack).not.toHaveBeenCalled();

    // A file under the ceiling, which this server finds too big all the same.
    const file = dataFile([{ id: 7 }]);
    bringBack.mockRejectedValue(new ApiError('That file is bigger than this server takes (100 bytes at most).', 413, { code: 'too_large', limit: 100 }));
    await pick(new File([file], 'mine.json'));
    host.querySelector<HTMLButtonElement>('#replaceMine')!.click();
    await vi.waitFor(async () => {
      await settle();
      expect(text('#yourDataError')).toBe('Ten súbor má 0 MB a tento server prijme najviac 0 MB.');
    });
    expect(bringBack).toHaveBeenCalledTimes(1);

    // The next file over that limit is stopped here: nothing sent.
    await pick(new File([file], 'again.json'));
    expect(bringBack).toHaveBeenCalledTimes(1);
  });

  it('the other refusals of the server are worded from their codes', async () => {
    await draw();
    bringBack.mockRejectedValue(new ApiError('That data file is damaged: x', 422, { code: 'not_a_data_file' }));
    await pick(new File([dataFile([{ id: 7 }])], 'mine.json'));
    host.querySelector<HTMLButtonElement>('#replaceMine')!.click();
    await vi.waitFor(async () => {
      await settle();
      expect(text('#yourDataError')).toBe('The file was not brought back: That is not a Japanese Academy data file, or it is damaged.');
    });
  });
});
