import { inject } from '@angular/core';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { ANOTOKI_LEGAL_CONFIG, AnotokiLegalConfig, LegalFacts } from '@anotoki/lib/legal';
import { TranslationService } from '@anotoki/lib/translations';
import { AuthService } from '../core/auth/auth.service';
import { VISITOR_MOVED_KEY, VISITOR_STORAGE_KEY } from '../core/auth/visitor-key';
import { CHANGELOG_SEEN_KEY } from '../core/changelog/changelog.service';
import { BRAND } from '../core/i18n/title.strategy';
import { ADMIN_DRAFTS_KEY, LANGUAGE_CACHE_KEY, LANGUAGE_KEY } from '../core/i18n/translations.config';
import { THEME_KEY } from '../core/kit.config';
import { KEPT_PAPER_KEY } from '../exam/kept-paper-key';

/**
 * The day Japanese Academy's facts last changed: the pages show the later of
 * it and the day the library's own words last did. Move it with any change to
 * what the app keeps or for how long - and the strings that say so
 * (`legal.*`, migration 011).
 */
export const ACADEMY_LEGAL_UPDATED = '2026-10-18';

/**
 * The anotoki account's cookie for every anotoki site (the IAM's
 * hint_cookie_name, set under the IAM's parent domain). The browser sends it
 * here too, but this app never reads it: no sign-in by the hint (`hint: false`,
 * core/auth/auth.config.ts).
 */
export const SIGN_IN_HINT_COOKIE = 'anotoki_signed_in';

/**
 * The legal pages' configuration: the app's (core/legal.config.ts - the page's
 * language, the database's words) with the facts the pages read. Their frame
 * provides it (legal-frame.component.ts), so the facts - this code and its
 * strings' keys - load with the pages, never with the first page.
 */
export function academyLegalPagesConfig(): AnotokiLegalConfig {
  const root = inject(ANOTOKI_LEGAL_CONFIG, { skipSelf: true });
  const i18n = inject(TranslationService);
  const auth = inject(AnotokiAuth);
  const app = inject(AuthService);
  return { ...root, facts: () => academyLegalFacts(i18n, auth, app.visitorKeepDays()) };
}

/**
 * Japanese Academy's facts, in the page's language - read as a page is drawn,
 * so a change of language redraws them. Each must stay true of the code:
 *
 * - the record of a person: users (migrations 002, 005, 007, 010) - the
 *   anotoki account's id (the IAM's sub) and the name from the latest token
 *   (preferred_username, the library's PeopleRecorder: backend/src/people.php),
 *   created_at and last_seen_at, time_zone (the browser's X-Time-Zone), no
 *   address; deleted whole only by an ADMIN on the People page
 *   (people_delete() - the next visit makes an empty one again); its name the
 *   IAM's placeholder once the account is deleted (the library's scrub,
 *   users.anonymized_at);
 * - the study: srs_settings, srs_progress (the stage, the review times, the
 *   counts, the notes, the person's own synonyms and readings), srs_daily,
 *   srs_log (every answer and reset, only ever added to), exam_attempts (the
 *   whole record, the candidate's name, the HTML report), imports (the last
 *   data file brought back: its counts) - never deleted by age; a full reset
 *   (store_reset()) deletes the progress and the day counts and keeps the
 *   settings, the log and the attempts; a data file brought back
 *   (PUT /api/me/data, backend/src/me.php) replaces all of it; an ADMIN's
 *   delete on the People page takes all of it; when the account is deleted it
 *   stays, the name typed on the papers blanked (people_scrub_copies(): the
 *   report says "Unnamed candidate");
 * - the copies: backend/storage/backups/academy-*.json (backend/src/backup.php)
 *   - the day's copy of everybody at the first page load of a UTC day
 *   (backup_daily(): only with data there, the 14 newest kept), a person's
 *   copy before a reset, an import, a delete and a visitor's move
 *   (backup_person_copy(): their 14 newest of each kind), the raw copy of
 *   every table before a migration (upkeep_copy_before(): never deleted by the
 *   app), manage.php's --backup and --restore copies (kept); each 0600, in a
 *   folder outside the document root;
 * - the limits: the library's counts of the feedback form and the pages' error
 *   reports (a day of keyed hashes of the account or the address bucket, in
 *   storage/);
 * - the words: translations.updated_by (004: ON DELETE SET NULL), the staff's;
 * - visitors (007, while the IAM requires no sign-in): users with a negative
 *   id, the key's SHA-256 (visitor_key_hash), created and last seen, the keyed
 *   HMAC of the address bucket they started from (visitor_from: the new
 *   visitors an hour per address), their study under that id; moved into the
 *   account at a sign-in (visitors_move()), swept keep_days after the last
 *   visit (visitors_sweep(), after an answer: AuthService.visitorKeepDays is
 *   the server's number); never in the app's JSON copies;
 * - feedback (the library's, backend/src/admin.php's academy_feedback(): the
 *   library's keep - spam 30 days, resolved 365, pruned daily after an answer;
 *   new and read ones until deleted): the kind and the section (Kanji, Exam)
 *   too, the page as a path, the language, the browser, the sender's id unless
 *   "without my name", the reply address the form sends (the account's
 *   written in for somebody signed in); the reply address and browser
 *   forgotten by the scrub and by the People delete;
 * - the error log: the library's words and its 30 days (academy_error_log()
 *   sets no `days`); never an address, a keyed hash of its bucket;
 * - the audit log: the library's words - the admin panel's changes, the
 *   library's own entries; no address (academy_audit() sets no recordAddress),
 *   never pruned;
 * - backups: the library's, plain (sealed, not encrypted), its keeping by
 *   count - 14 daily (made after the first answer of a UTC day: only days the
 *   site is used), 5 before an update, 5 before a restore, by hand until
 *   deleted (academy_backups() sets none of its own) -, downloadable by an
 *   ADMIN: the library's words, 0.6.2's;
 * - this browser's storage: the sign-in's (the library's auth module, under
 *   `anotoki-auth:{client id}`, and its session items while one is under way;
 *   no hint marker: `hint: false`), the IAM's hint cookie (sent here, never
 *   read), the theme (THEME_KEY), the language and its cached strings
 *   (LANGUAGE_KEY, LANGUAGE_CACHE_KEY; a `?lang=` held for the tab under
 *   LANGUAGE_KEY in sessionStorage), the visitor's key (VISITOR_STORAGE_KEY)
 *   and the last one moved (VISITOR_MOVED_KEY), What's new read
 *   (CHANGELOG_SEEN_KEY), an exam paper kept while the site is being updated
 *   (KEPT_PAPER_KEY), the admin pages' unsaved words (ADMIN_DRAFTS_KEY);
 * - counting visits: the family's Umami (src/index.html: umami.anotoki.eu, the
 *   query and the fragment left out) - the library's words;
 * - who else handles data: the hosting company (WebSupport s.r.o., named by
 *   the owner on 2026-10-18: the servers, the database and the mail) and
 *   Cloudflare.
 *
 * Japanese Academy takes feedback: the Contact page opens the family's form in
 * the kit's dialog (configured in core/feedback.config.ts). Every address the
 * pages link to is the code's - the anotoki account's pages from the IAM's
 * address the app signs in with (GET /api/auth/config), the operator and
 * Cloudflare in the library -, never a string's: a rewording on the
 * Translations page can never change where a link goes (the 0.6.0 review). So
 * are the cookie's and the stored items' names.
 */
export function academyLegalFacts(i18n: TranslationService, auth: AnotokiAuth, visitorKeepDays: number): LegalFacts {
  const iam = auth.issuer().replace(/\/+$/, '');
  const client = auth.clientId() || 'japanese-academy';
  // Each key written whole: the key scan (backend/tools/translation_keys.php) reads the keys a page asks for as they are written.
  return {
    site: BRAND,
    about: i18n.t('legal.about'),
    updated: ACADEMY_LEGAL_UPDATED,
    account: { deleteUrl: auth.accountUrl(), privacyUrl: iam ? `${iam}/privacy` : null },
    data: [
      { name: i18n.t('legal.record.name'), what: i18n.t('legal.record.what'), why: i18n.t('legal.record.why'), kept: i18n.t('legal.record.kept') },
      { name: i18n.t('legal.study.name'), what: i18n.t('legal.study.what'), why: i18n.t('legal.study.why'), kept: i18n.t('legal.study.kept') },
      { name: i18n.t('legal.copies.name'), what: i18n.t('legal.copies.what'), why: i18n.t('legal.copies.why'), kept: i18n.t('legal.copies.kept') },
      { name: i18n.t('legal.limits.name'), what: i18n.t('legal.limits.what'), why: i18n.t('legal.limits.why'), kept: i18n.t('legal.limits.kept') },
      { name: i18n.t('legal.words.name'), what: i18n.t('legal.words.what'), why: i18n.t('legal.words.why'), kept: i18n.t('legal.words.kept') },
    ],
    visitors: {
      what: i18n.t('legal.visitors.what'),
      why: i18n.t('legal.visitors.why'),
      kept: i18n.t('legal.visitors.kept', { days: visitorKeepDays }),
    },
    feedback: { what: i18n.t('legal.feedback.what'), kept: i18n.t('legal.feedback.kept') },
    storage: [
      { preset: 'signIn', name: `anotoki-auth:${client}`, purpose: i18n.t('legal.storage.signIn.purpose') },
      {
        name: `anotoki-auth:${client}:login:…, anotoki-auth:discovery:…`,
        kind: 'session',
        purpose: i18n.t('legal.storage.signInUnderWay.purpose'),
        kept: i18n.t('legal.storage.signInUnderWay.kept'),
      },
      { preset: 'signInHint', name: SIGN_IN_HINT_COOKIE, purpose: i18n.t('legal.storage.hint.purpose') },
      { preset: 'theme', name: THEME_KEY },
      { preset: 'language', name: `${LANGUAGE_KEY}, ${LANGUAGE_CACHE_KEY}` },
      { name: LANGUAGE_KEY, kind: 'session', purpose: i18n.t('legal.storage.tabLanguage.purpose'), kept: i18n.t('legal.storage.untilTabClosed') },
      { preset: 'visitorKey', name: VISITOR_STORAGE_KEY, kept: i18n.t('legal.storage.visitorKey.kept') },
      { name: VISITOR_MOVED_KEY, kind: 'local', purpose: i18n.t('legal.storage.visitorMoved.purpose'), kept: i18n.t('legal.storage.visitorMoved.kept') },
      { name: CHANGELOG_SEEN_KEY, kind: 'local', purpose: i18n.t('legal.storage.whatsNew.purpose'), kept: i18n.t('legal.storage.whatsNew.kept') },
      { name: KEPT_PAPER_KEY, kind: 'session', purpose: i18n.t('legal.storage.examPaper.purpose'), kept: i18n.t('legal.storage.examPaper.kept') },
      { name: ADMIN_DRAFTS_KEY, kind: 'session', purpose: i18n.t('legal.storage.wordDrafts.purpose'), kept: i18n.t('legal.storage.untilTabClosed') },
    ],
    // The hosting company, named by the owner on 2026-10-18: the servers, the database and the mail.
    processors: [{ preset: 'hosting', name: 'WebSupport s.r.o.', url: 'https://www.websupport.sk' }, { preset: 'cloudflare' }],
  };
}
