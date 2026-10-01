/**
 * The keys of a small menu in the top bar — a `<details>` whose `.umenu` holds
 * links and buttons (the account menu, the language chooser). Bound on the
 * menu's root: `<details (keydown)="keys($event)">`.
 *
 * A menu keeps its keys to itself. The lesson quiz, the reviews and the exam
 * listen for keys on `document`: Enter there submits a card, and on a paper's
 * last question stores the attempt. So every key pressed inside a menu stops
 * here — it never reaches `document`, whatever it is:
 *
 *   Escape                closes the menu and puts the focus back on its summary
 *   ArrowDown / ArrowUp   move through the items, round and round; from the
 *                         summary, to the item after / before the one in use
 *                         (`aria-current`) — the first / the last when none is —
 *                         opening the menu when it is closed
 *   everything else       is the browser's: Enter and Space on the summary open
 *                         and close, on an item they choose it, Tab moves on
 *
 * A menu's own `document` listeners are then only for what happens elsewhere
 * (a click outside, Escape pressed outside): a key stopped here never gets
 * there, which is why Escape is done here.
 */
export function menuKeydown(event: KeyboardEvent, menu: HTMLDetailsElement): void {
  event.stopPropagation();
  const summary = menu.querySelector<HTMLElement>('summary');

  if (event.key === 'Escape') {
    if (menu.open) {
      menu.open = false;
      summary?.focus();
    }
    return;
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
    return;
  }

  const items = Array.from(menu.querySelectorAll<HTMLElement>('.umenu a[href], .umenu button:not([disabled])'));
  if (!items.length) {
    return;
  }
  // The page does not scroll under a menu that is being walked through.
  event.preventDefault();
  menu.open = true;

  const step = event.key === 'ArrowDown' ? 1 : -1;
  const focused = items.indexOf(menu.ownerDocument.activeElement as HTMLElement);
  let from = focused;
  if (focused < 0) {
    const inUse = items.findIndex((item) => item.getAttribute('aria-current') === 'true');
    // With none in use, down lands on the first and up on the last.
    from = inUse >= 0 ? inUse : step > 0 ? -1 : 0;
  }
  items[(from + step + items.length) % items.length].focus();
}
