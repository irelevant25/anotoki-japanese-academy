import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, provideRouter } from '@angular/router';
import { HoldsUnsavedChanges, unsavedChangesGuard } from './unsaved-changes.guard';

/** The guard as the router calls it: with the page the route drew — or with none. */
function asked(page: HoldsUnsavedChanges | null) {
  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;
  return TestBed.runInInjectionContext(() => unsavedChangesGuard(page, route, state, state));
}

describe('unsavedChangesGuard', () => {
  it('lets the navigation through when there is no page to ask: the app took it away, or never drew it', () => {
    expect(asked(null)).toBe(true);
  });

  it('answers what the page answers: a page that may not be left is not left, one with nothing unsaved is', () => {
    expect(asked({ canLeave: () => false })).toBe(false);
    expect(asked({ canLeave: () => true })).toBe(true);
  });

  it('hands back the question the page is asking, to be waited for', async () => {
    const asking = Promise.resolve(false);
    const answer = asked({ canLeave: () => asking });

    expect(answer).toBe(asking);
    await expect(answer).resolves.toBe(false);
  });


  // The way it happens in the app: the router runs the guard of a route with
  // no page drawn for it (here a route without a component, as the outlet
  // the app takes away while it cannot be used leaves it), and must go on.
  it('lets the router leave a route whose page is not drawn', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'translations', canDeactivate: [unsavedChangesGuard], children: [] },
          { path: 'home', children: [] },
        ]),
      ],
    });
    const router = TestBed.inject(Router);
    expect(await router.navigateByUrl('/translations')).toBe(true);

    expect(await router.navigateByUrl('/home')).toBe(true);
    expect(router.url).toBe('/home');
  });
});
