import { CanDeactivateFn } from '@angular/router';

/** A page with changes that are kept only when saved: it says whether it may be left, asking first when it has some. */
export interface HoldsUnsavedChanges {
  canLeave(): boolean | Promise<boolean>;
}

/**
 * Leaving a page inside the app (a link, Back) asks the page first. Closing
 * the tab or reloading is the browser's to ask: AdminDrafts, which holds what
 * the admin pages have not saved, listens for `beforeunload`.
 *
 * The router asks even when there is no page: the app draws its outlet only
 * while it can be used (AppComponent), so once a session has ended the route
 * is still the active one, and the next navigation away from it runs this
 * guard with `null` for the page. There is nobody to ask then, and nothing to
 * ask about: the drafts are in AdminDrafts, not in the page, and are in their
 * boxes again when the page is back. The navigation goes through — a guard
 * that threw here left every link of that state dead.
 */
export const unsavedChangesGuard: CanDeactivateFn<HoldsUnsavedChanges | null> = (page) => page?.canLeave() ?? true;
