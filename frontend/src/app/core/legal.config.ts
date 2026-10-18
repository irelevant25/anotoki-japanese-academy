import { inject } from '@angular/core';
import { AnotokiLegalConfig, DEFAULT_LEGAL_PATHS } from '@anotoki/lib/legal';
import { TranslationService } from '@anotoki/lib/translations';

/** The legal pages' addresses: the library's own paths (app.routes.ts puts each page there, the footer's links go there). */
export const LEGAL_PAGE_PATHS: readonly string[] = [DEFAULT_LEGAL_PATHS.terms, DEFAULT_LEGAL_PATHS.privacy, DEFAULT_LEGAL_PATHS.contact];

/** Whether an address (its path, without a query or fragment) is one of the legal pages - anybody's, signed in or not. */
export function isLegalPage(path: string): boolean {
  return LEGAL_PAGE_PATHS.includes(path.split(/[?#]/)[0] || '/');
}

/**
 * How Japanese Academy plugs into the anotoki family's legal pages
 * (@anotoki/lib/legal, anotoki-lib 0.6: Terms, Privacy and Contact on the
 * lazy routes /terms, /privacy and /contact - app.routes.ts - and the links
 * to them in the family's footer, app.component.html). provideAnotokiLegal() runs it in an
 * injection context.
 *
 * - The language: the one on the page (English in the admin panel, as the
 *   panel is - effectiveLanguage()).
 * - The words: the library's (`anotoki.legal.*`, `anotoki.legalLinks.*`) - the
 *   database's string of a library key, an owner's rewording on the
 *   Translations page, before the library's built-in English and Slovak. That
 *   Slovak addresses nobody ("ty" or "Vy"), so it reads well beside this
 *   app's informal Slovak.
 * - The paths: the library's own; the operator: the family's (Code Hero
 *   s.r.o., its address kept in two parts in the library).
 * - The facts - what Japanese Academy keeps and for how long, its cookie and
 *   browser storage, who else handles data, the anotoki account's pages - are
 *   read by the pages alone, and their frame gives them (legal/legal-facts.ts,
 *   legal/legal-frame.component.ts): none of it is in the first load, which
 *   the footer's links share with every page.
 */
export function academyLegalConfig(): AnotokiLegalConfig {
  const i18n = inject(TranslationService);
  return {
    language: () => i18n.effectiveLanguage(),
    translate: (key) => i18n.libraryWord(key),
    facts: () => {
      throw new Error("The legal pages' facts come with their frame (legal/legal-frame.component.ts, legal/legal-facts.ts).");
    },
  };
}
