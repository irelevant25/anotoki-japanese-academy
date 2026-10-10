import { DestroyRef, inject } from '@angular/core';
import { ConfirmOptions, ConfirmService } from '@anotoki/lib/ui/dialog';

/**
 * The kit's question (ConfirmService: "Delete …?", "Import …?", "Leave without
 * saving?") asked for the admin page that asks it, and answered no when the
 * page goes while it is open. The kit draws its one question in the app's root
 * (<anotoki-confirm-host>), so it would outlive the page: Back pressed with
 * People's "Delete …'s data?" open would leave it over the next page, and its
 * Delete would delete for a page that is gone, with nothing on the screen to
 * say so. The panel's own question before anotoki-lib 0.2.0 (admin/confirm/)
 * lived in the page and went with it.
 *
 * Called where the page is made: `private readonly ask = pageQuestion();`.
 */
export function pageQuestion(): (options: ConfirmOptions) => Promise<boolean> {
  const confirm = inject(ConfirmService);
  // The question this page asked last, as the kit holds it (it asks one at a time).
  let asked: unknown = null;
  inject(DestroyRef).onDestroy(() => {
    if (asked !== null && confirm.pending() === asked) {
      confirm.settle(false);
    }
  });
  return (options) => {
    const answer = confirm.ask(options);
    asked = confirm.pending();
    return answer;
  };
}
