import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { routes, whenReady } from './app.routes';
import { AuthService } from './core/auth/auth.service';

describe('the sections open only while the app can be used', () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('kanji and exam are guarded, the home page and the callback are not', () => {
    const guards = (path: string) => routes.find((r) => r.path === path)?.canActivate ?? [];
    expect(guards('kanji')).toContain(whenReady);
    expect(guards('exam')).toContain(whenReady);
    expect(guards('')).toEqual([]);
    expect(guards('auth/callback')).toEqual([]);
  });

  it('whenReady: only in state ready, so Back or Forward on a stand-in page loads nothing', async () => {
    const auth = TestBed.inject(AuthService);
    const allowed = () => TestBed.runInInjectionContext(() => whenReady({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
    expect(allowed(), 'still starting').toBe(false);

    globalThis.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ mode: 'none' }), { status: 200 }))) as unknown as typeof fetch;
    await auth.init();
    expect(allowed(), 'ready').toBe(true);

    auth.notSetUp(null);
    expect(allowed(), 'not set up after all').toBe(false);
  });
});
