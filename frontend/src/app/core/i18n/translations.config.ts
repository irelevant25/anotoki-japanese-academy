import { EnvironmentProviders, Injector, inject } from '@angular/core';
import { SiteStatus } from '@anotoki/lib/migrations';
import { AnotokiTranslationsConfig, AdminLanguage, BundleRefusal, LanguageDeleted, provideAnotokiTranslations } from '@anotoki/lib/translations';
import { errorCode } from '../api/api.service';
import { ApiErrorBody } from '../api/api.types';
import { AuthService, installedOf, isNotSetUp, timeZoneHeaders } from '../auth/auth.service';
import { KIT_ENGLISH } from '../kit.config';
import { MIGRATIONS_ROUTE, reportSiteState } from '../site-status';

/**
 * The chooser's choice (localStorage) and the `?lang=` of this tab
 * (sessionStorage): the same name in two stores with two lifetimes - the
 * names this app always had, so a visitor's choice survives the upgrade.
 */
export const LANGUAGE_KEY = 'academy-language';
/** The last bundle, so a returning reader is not shown keys while the request is out. */
export const LANGUAGE_CACHE_KEY = 'academy-language-cache';
/** What the admin panel's Translations and Languages pages hold that is not saved yet (sessionStorage, for the tab). */
export const ADMIN_DRAFTS_KEY = 'academy-admin-drafts';

/** The app's words, as the server answers them: GET /api/translations/{code} (the anotoki library's route, backend/api/routes/translations.php). */
export const BUNDLE_URL = '/api/translations';

/** The server refused a bundle: its status and what it said (the library reads both). */
export class BundleRefused extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`The app's words could not be had (${status}).`);
  }
}

/**
 * GET /api/translations/{code}, with plain fetch(): no token goes with it, and
 * neither interceptor touches it - the words are the same for everybody. The
 * reader's time zone goes with it, as with every request to this site's API
 * (the words do not depend on it). Answers what the server sent, unchecked
 * (the library checks it); throws BundleRefused for an answer that is not 2xx.
 */
export async function fetchBundle(code: string): Promise<unknown> {
  const response = await fetch(`${BUNDLE_URL}/${encodeURIComponent(code)}`, { headers: { Accept: 'application/json', ...timeZoneHeaders() } });
  if (!response.ok) {
    throw new BundleRefused(response.status, await response.json().catch(() => null));
  }
  return response.json();
}

/**
 * The server answered 503 instead of the words. That is not a lost answer:
 * it says what the app can show.
 *
 *   not_set_up       the copy has no settings: nothing of the app goes on
 *                    (AuthService.notSetUp()), and the anotoki library's page
 *                    says so in its place.
 *   update_pending   the site is being updated (a database update waits for an
 *                    administrator): SiteStatus hears it, and the library's page
 *                    stands in for the app, in its own words. (The words answer
 *                    while an update waits, so this is rare.) Never the problem
 *                    page: the sign-in has to go on working, for an
 *                    administrator to get in and apply it.
 *   any other 503    the problem page, with the reason the server gives the
 *                    owner's own computer (translations_unavailable: the words'
 *                    tables not there yet, migration 004 of an upload still
 *                    arriving; database_unavailable) - unless the site is not
 *                    ready by SiteStatus's account (being updated, out of
 *                    reach: the tables may be what the update brings), when the
 *                    library's page stands in already.
 *
 * The problem page only as the app starts, or while no words are in memory
 * (the page would be in keys): once the app runs with its words, a choice of
 * language that meets a 503 just fails, as any other lost answer - a lesson
 * or a paper somebody is in the middle of is not taken away over it.
 */
export function bundleRefused(refusal: BundleRefusal, auth: () => AuthService, site: () => SiteStatus): void {
  if (refusal.status !== 503) {
    return;
  }
  const body = refusal.body;
  if (isNotSetUp(refusal.status, body)) {
    auth().notSetUp(installedOf(body));
    return;
  }
  if (reportSiteState(site, refusal.status, body) || site().blocked()) {
    return;
  }
  if (refusal.starting || !refusal.hasWords) {
    const detail = body && typeof body === 'object' ? (body as ApiErrorBody).detail : undefined;
    auth().cannotStart({ kind: 'server', status: refusal.status, code: errorCode(refusal.status, body), detail: typeof detail === 'string' && detail !== '' ? detail : null });
  }
}

/**
 * The server can be asked for the words: the app itself is shown (to a person
 * or a visitor), or its Sign in card. Not while the copy is not set up, or
 * could not start: the stand-in pages word themselves then (keptWord()), from
 * the words the browser kept from an earlier visit, or the English in code.
 * While the site is being updated the words still answer (the SiteGate's
 * open paths), so the library's page is in the reader's language.
 */
export function wordsCanBeAsked(auth: AuthService): boolean {
  const state = auth.state();
  return state === 'ready' || state === 'visiting' || state === 'signed-out';
}

/**
 * The anotoki library's translations (@anotoki/lib/translations, every
 * anotoki site's) wired to this app: the language the pages are read in and
 * its words - the app's own, from its database, which EDITOR and ADMIN reword
 * on the admin panel's Translations page - and the admin panel's
 * Translations and Languages pages (@anotoki/lib/translations/admin).
 *
 *   storage    the names this app always had: a visitor's choice and the
 *              cached words survive the upgrade
 *   the words  through plain fetch() (fetchBundle()), and a 503 read as what
 *              the app can show (bundleRefused()); asked only while the app
 *              itself, or its Sign in card, is shown (wordsCanBeAsked())
 *   account    a signed-in person whose anotoki account says how every
 *              anotoki site should look (the IAM sends its preferences: its
 *              migration 015, the owner's decision of 2026-10-06) reads the
 *              account's language over what this device remembered - only
 *              `?lang=` and a choice made on this page come first -, and a
 *              choice made here is saved to the account (the SDK's
 *              savePreferences); a language the IAM does not offer
 *              (invalid_request) holds for the visit and says nothing, any other
 *              refusal says so under the switcher
 *   the kit    the English of the library's words this app says its own way
 *              (KIT_ENGLISH, core/kit.config.ts), for when no words are in
 *              memory; with them, the database's - 009 copied the app's there
 *   admin      Translations for EDITOR and ADMIN, Languages for ADMIN (the
 *              server checks again: api/middleware/staff.php); the drafts are
 *              each person's (their IAM user id); a language is deleted only
 *              after the server keeps a copy of its strings, which the page
 *              names
 *
 * The services are asked for when the module asks, never here: SiteStatus,
 * AuthService and the translation service start one another at the start
 * (core/site-status.config.ts says why).
 */
export function translationsConfig(): AnotokiTranslationsConfig {
  const injector = inject(Injector);
  const auth = (): AuthService => injector.get(AuthService);
  const site = (): SiteStatus => injector.get(SiteStatus);
  return {
    storageKeys: { language: LANGUAGE_KEY, cache: LANGUAGE_CACHE_KEY, drafts: ADMIN_DRAFTS_KEY },
    libraryWords: { en: KIT_ENGLISH },
    bundleUrl: BUNDLE_URL,
    fetchBundle,
    onBundleRefused: (refusal) => bundleRefused(refusal, auth, site),
    canAsk: () => wordsCanBeAsked(auth()),
    account: {
      language: () => auth().user()?.locale ?? null,
      decides: () => auth().preferences() !== null,
      save: (code) => auth().savePreferences({ language: code }),
      userKey: () => auth().subject(),
    },
    admin: {
      allows: { strings: () => auth().isStaff(), languages: () => auth().isAdmin() },
      routes: { translations: '/admin/translations', languages: '/admin/languages', migrations: MIGRATIONS_ROUTE },
      siteName: 'the app',
      leads: {
        translations: 'What the app itself says, in every language. The learning material and the stage names are never translated. This page stays English.',
      },
      languageNotes: {
        beforeDelete: (language: AdminLanguage) => (language.strings > 0 ? 'Only the copy of them the server keeps first, in backups/, still holds them.' : null),
        afterDelete: (_language: AdminLanguage, answer: LanguageDeleted) => (typeof answer['copy'] === 'string' ? `A copy of its strings is in backups/${answer['copy']}.` : null),
      },
    },
  };
}

/** The module, configured for this app (app.config.ts). */
export function provideTranslations(): EnvironmentProviders {
  return provideAnotokiTranslations(translationsConfig);
}
