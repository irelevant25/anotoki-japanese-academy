/*
 * What jsdom lacks of a browser and the anotoki library's kit uses, for every
 * spec (angular.json: test.options.setupFiles):
 * - <dialog>'s showModal() and close(): jsdom has the element and its `open`;
 *   the kit's dialog (Your data's question, ConfirmService's) opens itself
 *   with showModal() as it is drawn;
 * - checkVisibility(): which elements a kit dialog's Tab goes round - drawn,
 *   unless hidden or in a closed dialog.
 * The kit's menus draw in the top layer only where the browser has one (the
 * popover API): in jsdom they stay in place, and need nothing here.
 */

const dialogs = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void; close?: (returnValue?: string) => void };
if (typeof dialogs.showModal !== 'function') {
  dialogs.showModal = function (this: HTMLDialogElement): void {
    this.setAttribute('open', '');
  };
  dialogs.close = function (this: HTMLDialogElement): void {
    this.removeAttribute('open');
  };
}

if (typeof Element.prototype.checkVisibility !== 'function') {
  Element.prototype.checkVisibility = function (this: Element): boolean {
    return !this.closest('[hidden], dialog:not([open])');
  };
}
