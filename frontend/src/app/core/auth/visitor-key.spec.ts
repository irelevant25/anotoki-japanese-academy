import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiError, ApiService } from '../api/api.service';
import { VisitorMove } from '../api/api.types';
import { AuthService } from './auth.service';
import { MOVE_AT_START_MS, MOVE_RETRY_MS, VISITOR_MOVED_KEY, VISITOR_STORAGE_KEY, VisitorKey } from './visitor-key';

const KEY = 'k'.repeat(43);
const OTHER_KEY = 'o'.repeat(43);

const MOVED: VisitorMove = { found: true, items: 12, kept: 3, attempts: 2, answers: 140 };
const NOTHING: VisitorMove = { found: false, items: 0, kept: 0, attempts: 0, answers: 0 };

describe('VisitorKey: the key of somebody studying without signing in, and the move at sign-in', () => {
  const signedIn = signal(false);
  const api = { moveVisitor: vi.fn<(key: string) => Promise<VisitorMove>>() };

  function make(): VisitorKey {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: AuthService, useValue: { signedIn } }, { provide: ApiService, useValue: api }],
    });
    return TestBed.inject(VisitorKey);
  }

  /** Effects run, and the promises they started settle. */
  async function flush(): Promise<void> {
    TestBed.tick();
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
    }
  }

  beforeEach(() => {
    localStorage.removeItem(VISITOR_STORAGE_KEY);
    localStorage.removeItem(VISITOR_MOVED_KEY);
    signedIn.set(false);
    api.moveVisitor.mockReset().mockResolvedValue(MOVED);
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.removeItem(VISITOR_STORAGE_KEY);
    localStorage.removeItem(VISITOR_MOVED_KEY);
  });

  it('remember(): kept only when none is held — the first key stays; anything not shaped like a key is no key', () => {
    const visitor = make();
    visitor.remember('too-short');
    expect(visitor.current()).toBeNull();
    visitor.remember(KEY);
    expect([visitor.current(), visitor.key()]).toEqual([KEY, KEY]);
    visitor.remember(OTHER_KEY);
    expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe(KEY);
  });

  it('read as a request leaves, and kept in step with another tab (the storage event)', () => {
    const visitor = make();
    localStorage.setItem(VISITOR_STORAGE_KEY, OTHER_KEY);
    expect(visitor.current(), 'read at send time').toBe(OTHER_KEY);
    localStorage.removeItem(VISITOR_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent('storage', { key: VISITOR_STORAGE_KEY }));
    expect(visitor.key()).toBeNull();
  });

  it('forget(): compare-and-delete — only while the stored key is still the one refused; lost says so, once', () => {
    const visitor = make();
    localStorage.setItem(VISITOR_STORAGE_KEY, OTHER_KEY);
    visitor.forget(KEY, true);
    expect([localStorage.getItem(VISITOR_STORAGE_KEY), visitor.lost()]).toEqual([OTHER_KEY, false]);
    visitor.forget(OTHER_KEY, true);
    expect([localStorage.getItem(VISITOR_STORAGE_KEY), visitor.lost()]).toEqual([null, true]);
  });

  it('the first save goes alone: what waits is told when it has its answer', async () => {
    const visitor = make();
    expect(visitor.firstSave()).toBeNull();
    const done = visitor.beginFirstSave();
    const pending = visitor.firstSave();
    expect(pending).not.toBeNull();
    let told = false;
    void pending!.then(() => (told = true));
    done();
    await Promise.resolve();
    expect([told, visitor.firstSave()]).toEqual([true, null]);
  });

  it('nobody signed in, or no key: no move', async () => {
    const visitor = make();
    localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
    await flush();
    await visitor.moveIntoAccount();
    signedIn.set(true);
    localStorage.removeItem(VISITOR_STORAGE_KEY);
    await visitor.moveIntoAccount();
    expect(api.moveVisitor).not.toHaveBeenCalled();
  });

  it('signed in with a key held: the move, once; the key goes, the moves count up, and what moved is kept for the note', async () => {
    localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
    const visitor = make();
    signedIn.set(true);
    await flush();
    await visitor.moveIntoAccount(); // a second ask while it is on its way, or after: one move
    expect(api.moveVisitor).toHaveBeenCalledTimes(1);
    expect(api.moveVisitor).toHaveBeenCalledWith(KEY);
    expect([localStorage.getItem(VISITOR_STORAGE_KEY), visitor.moves(), visitor.moved(), visitor.lost()]).toEqual([null, 1, MOVED, false]);
    expect(localStorage.getItem(VISITOR_MOVED_KEY), 'the tab that moved it says so to the others').toBe(KEY);
  });

  it('a key another tab of this browser moved first (found: false): silent — nothing was lost', async () => {
    localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
    localStorage.setItem(VISITOR_MOVED_KEY, KEY);
    api.moveVisitor.mockResolvedValue(NOTHING);
    const visitor = make();
    signedIn.set(true);
    await flush();
    expect([localStorage.getItem(VISITOR_STORAGE_KEY), visitor.lost(), visitor.moved(), visitor.moves()]).toEqual([null, false, null, 1]);
  });

  it('a key nobody moved that the server no longer has (swept after the days unused): lost, said once', async () => {
    localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
    api.moveVisitor.mockResolvedValue(NOTHING);
    const visitor = make();
    signedIn.set(true);
    await flush();
    expect([localStorage.getItem(VISITOR_STORAGE_KEY), visitor.lost(), visitor.moved()]).toEqual([null, true, null]);
  });

  it('no answer or a 5xx: the key stays and the move is asked again, a few times; a 422 forgets it; a 401 waits for the next sign-in', async () => {
    vi.useFakeTimers();
    localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
    api.moveVisitor.mockRejectedValueOnce(new ApiError('busy', 503, { code: 'visitor_move_retry' })).mockResolvedValueOnce(MOVED);
    const visitor = make();
    signedIn.set(true);
    await flush();
    expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe(KEY);
    await vi.advanceTimersByTimeAsync(MOVE_RETRY_MS[0]);
    expect(api.moveVisitor).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBeNull();

    localStorage.setItem(VISITOR_STORAGE_KEY, OTHER_KEY);
    api.moveVisitor.mockRejectedValueOnce(new ApiError('Signed out.', 401, { code: 'sign_in_required' }));
    await visitor.moveIntoAccount();
    await vi.advanceTimersByTimeAsync(MOVE_RETRY_MS[MOVE_RETRY_MS.length - 1]);
    expect(api.moveVisitor).toHaveBeenCalledTimes(3);
    expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe(OTHER_KEY);

    api.moveVisitor.mockRejectedValueOnce(new ApiError('Send the key.', 422, { code: 'bad_visitor_key' }));
    await visitor.moveIntoAccount();
    expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBeNull();
  });

  it('settle() at the start: the move is waited for, a few seconds at most — a slow one does not hold the first page', async () => {
    vi.useFakeTimers();
    localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
    signedIn.set(true);
    let finish!: (move: VisitorMove) => void;
    api.moveVisitor.mockReturnValue(new Promise<VisitorMove>((resolve) => (finish = resolve)));
    const visitor = make();
    let settled = false;
    void visitor.settle().then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(MOVE_AT_START_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    finish(MOVED);
    await vi.advanceTimersByTimeAsync(0);
    expect([localStorage.getItem(VISITOR_STORAGE_KEY), visitor.moves()]).toEqual([null, 1]);
  });
});
