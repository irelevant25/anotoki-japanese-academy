---
paths:
  - "frontend/**"
---

# Frontend (Japanese Academy)

Reference: `docs/kb/architecture.md` (the frontend's map), `DEV.md`.

- Angular 21: standalone components, `ChangeDetectionStrategy.OnPush`, state
  in signals (`signal`, `computed`, `input`, `output`), zoneless
  (`provideZonelessChangeDetection`; no zone.js). **Every component is three
  files** — `.ts`, `.html`, `.scss` — never an inline template or style, even
  for a small one.
- Styles: the anotoki library's first (`@use "@anotoki/lib/styles" as
  anotoki` in `src/styles.scss`: its tokens, Manrope, and its global styles -
  `anotoki.base`, `anotoki.utilities` (`.page`, `.stack`, `.cluster`,
  `.muted`, `.small`, `.facts` …), `anotoki.tables` (`.table`,
  `.table-scroll`)), then this app's, global, in `frontend/src/styles/`
  (`_tokens.scss`: Japanese's palette given to `anotoki.root()` and the study
  colours; `_base.scss`, loaded after the family's: the reading size, 16 px,
  the frame `.wrap`, `kbd`, the stand-in
  pages; `_items.scss`: the study's); a component's own styles in its
  `.scss`. Never a copy of what the family's base or utilities give (a
  heading's margins, a link's colour, the focus ring, `.muted`). Colours come only from the tokens,
  each defined for light and dark (the dark ones under
  `prefers-color-scheme: dark` unless `<html data-theme="light">`, and under
  `[data-theme="dark"]`: the theme switch's choice).
  Use `--kanji`/`--vocab` for item types and the stage tokens for SRS stages.
  Check contrast in dark mode.
- A page's building blocks are the library's kit: buttons, dialogs and
  questions, form fields, the spinner, menus, page headers, cards, alerts,
  badges, empty states, segmented choices, choice chips and chips, labelled
  groups, disclosures, link tabs, the table (`anotokiButton` with
  `variant` / `size` / `[loading]`, `<anotoki-dialog>`, `ConfirmService` - its
  host is in `app.component.html` -, `anotoki-text-field`, `anotoki-textarea`,
  `anotoki-checkbox`, `<anotoki-spinner>`, `<anotoki-page-header>`,
  `<anotoki-card>`, `<anotoki-alert>`, `<anotoki-badge>` (`wrap` where its
  words may not fit, the paper's section tag), `<anotoki-empty-state>`,
  `<anotoki-segmented>`, `<anotoki-chip-group>`, `button[anotokiChip]`,
  `<anotoki-labelled-group>`, `<anotoki-disclosure>`, `<anotoki-link-tabs>`,
  `table.table`): never a
  style of the app's own for one of them, never a restyling of one (a page
  lays them out - a margin, a flex - and gives the tokens). A choice: the
  kit's segmented choice where its few short options fit 390 px in both
  languages (the batch size, how many, the review's filter, Browse's type) -
  where its name is shown over it (the batch size, how many) inside the kit's
  labelled group with `selfNamed` (said once: the segmented choice names
  itself); one of
  several otherwise the kit's choice chips (`<anotoki-chip-group>`: a radio
  group named by its label - Browse's for a screen reader alone,
  `hideLabel`; a count the chip's `note`; a name that holds more than the
  words shown, `name`, beginning with them); several at once the kit's chips
  (`button[anotokiChip]` with `[pressed]`) in the kit's labelled group, where
  a chip needs a tooltip or a part in another language (the exam's parts,
  lessons and sections, practice's lessons with All). A chip whose words
  mix languages keeps them in one `<span>`; a choice chip's label is said in
  one language (`lang`, where a stage's own name stands alone). Words that
  may be long (an answer the learner added: 80 characters)
  stand beside a kit button, never in it - its words stay on one line. A
  quiet word-button (all and none, the review's listen) is the kit's
  `variant="link" size="sm"` button, 44 px to a finger by itself (the
  footer's What's new and Feedback are the library's own). **The browser's own boxes are never raised**: a question is the
  kit's (`ConfirmService.ask()` - a title that asks, the sentence under it
  saying what goes, the yes in the words of the button that asked, a danger
  one `tone: 'danger'`), something to tell is the app's notice
  (`NoticeService.tell()`, `core/notice/`: one button, OK), each worded the
  moment it is raised; both hosts keep their keys from `document`. The
  study's own pieces (tiles, the session, the lesson batch, the exam's paper)
  stay the app's, drawn with the tokens. Each
  piece comes from its own entry point (`@anotoki/lib/ui/button`, `ui/dialog`,
  `ui/forms`, `ui/card`, `ui/chips`, `ui/config` …), never the `@anotoki/lib/ui` barrel (it would put
  every piece in the first load); its class names are its own
  (`anotoki-<piece>__<part>`: a spec or a style reads them so). Its words are
  the anotoki library's keys in this app's database (`anotoki.topbar.*`,
  `anotoki.theme.*` …, which migration 009 filled with the app's words; the
  translation service's `forKit()` in `core/kit.config.ts`); with no strings,
  `KIT_ENGLISH` where the app says a word its own way, else the library's own
  English or informal Slovak. A global rule of the app never reaches inside a kit
  component: `_base.scss` has no element rule a kit piece would feel (the
  family's base gives those), and a new rule names the app's own classes.
- The app talks to the backend only through `ApiService` (HttpClient) —
  except the bundle of words, `GET /api/translations/{code}`, which the
  translation service asks with a plain `fetch()` and no token. The
  anotoki library's auth interceptor (`anotokiAuthInterceptor`, wired in
  `core/auth/auth.config.ts`) adds the sign-in's token and `X-Time-Zone` (the browser's
  IANA zone, `core/time-zone.ts`) to this site's `/api` and `/report`
  addresses and to nothing else; a report the browser would open by itself
  goes through `PrivateLinksService` (it fetches with the token and opens from
  memory, with `lockDown()`'s no-script policy first), and Your data's file
  through `AuthService.fetch()`. The pages never count days themselves: what
  "today" is comes in the server's answers.
- Sign-in is the IAM's alone, through the anotoki library's
  `@anotoki/lib/auth` (`docs/kb/sign-in.md`; `AuthService` is this app's view
  of it): every page but the legal pages is behind
  `personOrVisitorGuard` (`canActivateChild` on the learner's routes; `staffGuard`
  on `/admin`, which a visitor never passes, and `adminGuard` on its ADMIN
  pages), which sends a signed-out visitor to the IAM and back to the
  address; a sign-in that came back without one is the library's screen
  (`/sign-in-failed`, drawn by `AppComponent` in the page's place, Try again
  and Back); the Sign in card only for a session that ended while the page
  was open. No sign-in hint (`hint: false`: the owner's decision). The admin
  panel (`/admin/…`, English) is EDITOR's and ADMIN's, every page of it but
  Translations ADMIN's alone - Languages, People, Feedback, Errors, Audit
  log, Backups and Migrations, each the library's page in the panel's frame
  (`core/admin.config.ts`): the frontend hides, the server refuses. A save made in the background (a
  session's answers, a note, a paper handed in) goes through
  `SavesInFlight.track()` (a note waiting for its moment: `hold()`; something
  a sign-out would lose: `watch()`), so Sign out waits for it and asks.
- Visitors (`docs/kb/sign-in.md`, *Visitors in the browser*): where the
  relayed `login_required` is `false`, nobody signed in is the state
  `visiting`. Whose a request is (a person's: the token or not sent at all; a
  visitor's: the key, never a token) is decided as it is **issued**
  (the library's `issuedAs()`, or what the page is shown as), never from whether a token is there
  when it leaves; what only a person may do is issued `AS_PERSON` in
  `ApiService`; which saves may make a visitor is `makesVisitor()` in
  `core/auth/auth.config.ts`. The key lives in `VisitorKey` (`core/auth/visitor-key.ts`):
  read as a request leaves, the first key stays, forgotten compare-and-delete,
  kept while sign-in is required. `AuthService` never injects `VisitorKey`.
  A visitor's Sign in goes through `SignInService` (it waits for the saves).
- The IAM's browser SDK is no longer copied here (it was `core/auth/sdk/`
  until 2026-10-11; `backend/tests/api/auth.test.php` holds that it stays
  gone): the library's `@anotoki/lib/auth` is the sign-in. Never edit the
  library's code here: a change goes to the library and comes back as a
  release. The foot of every page and of the admin panel is the family's
  footer (`<anotoki-site-footer>`, anotoki-lib 0.6.3, in `app.component.html`
  inside the gate's marked template with the bar - the library's status page
  stands alone, with neither): its **Feedback** opens the library's form
  (`core/feedback.config.ts`: its places the app's two sections), its What's
  new the app's own dialog (`core/changelog/`); no key pressed in it reaches
  `document`. The app never restyles it. wanakana comes from npm.
- The kanji section: lesson batches, sessions and summaries are drawn over the
  screen they started from (`KanjiScreenService`), and the address stays; the
  shell redraws the screen for a click on a link to the address already shown.
  Answers save in the background; the summary waits for the saves, and is not
  drawn once the learner has left. Keep all three.
- Keys must keep working: Enter submits and continues, F opens item info, ←/→
  or Enter move through lessons; in the exam 1–4 / A–D, ←/→, Enter, F, R or
  Space. Reading inputs use the wanakana IME, and a trailing `n` turns into ん
  on submit.
- At 390 px there must be no horizontal scroll; `node frontend/e2e/screens.js` fails on
  overflow.
- The UI is in English and Slovak (informal "ty"), plain and short, from the
  database (`core/i18n/`, `docs/kb/architecture.md`, *The app's words*).
  Dates, times and numbers follow the language on the page through `Intl`
  (`TranslationService.locale()`: `'en-GB'`, `'sk-SK'`; `core/format.ts`, the
  `localDate` pipe), never the system's locale - but a signed-in person's own
  date order and clock, the anotoki account's, win where they chose them. The learning material, the SRS
  stage names (from the server) and the admin panel stay as they are;
  material carries `lang="en"` or `lang="ja"` whatever the page's language.
- A word a learner reads is a key with an English and a Slovak string — a new
  one comes with a migration (`DEV.md`) — asked for with the `translate` /
  `translatePlural` pipes or `t()` / `plural()`; never English written into a
  template (kept terms like "Kanji" and the admin panel aside). A key put
  together at run time comes from a closed set declared in
  `core/i18n/dynamic-keys.ts`, never from an address, the IAM or what
  somebody typed. What is drawn while there may be no strings (the stand-in pages, the
  top bar) uses `keptWord()` (`standin/`), with the seeded
  English in the code. `backend/translations.php --status` and
  `backend/tests/unit/translations.test.php` hold the keys to the database.
- Where the site stands is the anotoki library's (`@anotoki/lib/migrations`,
  wired in `core/site-status.config.ts`; `docs/kb/architecture.md`): `boot()`
  asks `SiteStatus` first, `<anotoki-site-gate>` wraps everything under the
  bar in `app.component.html`, and while the site is not ready (being
  updated, not set up, out of reach) the library's page stands in, in its
  own words - never the app's problem page, and never a redirect to the IAM
  (the page has its own Sign in). Everything under the bar is the gate's
  marked template (`<ng-template anotokiSitePages>`, `SitePagesDirective`
  in `AppComponent`'s imports; anotoki-lib 0.2.0): made only while the site
  is open, so no page runs behind the library's page, and one open when the
  site stops is taken down - a page that must keep something across that
  does it in its `ngOnDestroy()` (the exam's open paper), never by staying
  alive; keep control flow (`@switch`, `@if`) inside the marked template:
  an unmarked one, or content given as it is, would be made whether the
  site is open or not. `/api/site-status` goes bare (no token, no
  visitor key). The Migrations page is the library's
  `<anotoki-migrations-page>` (`@anotoki/lib/migrations/page`); its looks,
  like the kit's, come from the `--anotoki-*` tokens, which `_tokens.scss`
  gives Japanese's palette, light and dark. The library is a
  package (`@anotoki/lib`, from its release's `.tgz`): never edit
  `node_modules/`; `DEV.md`, *The anotoki library*, says how to update it.
- State holds keys, kinds and `ApiError`s, never a worded sentence: wording
  happens in a template or inside a `computed()`, so a page follows a change
  of language without being made again. A failed request is worded from its
  code (`core/i18n/error-text.ts`), never with the server's sentence (the
  admin panel excepted).
- The top bar is the anotoki family's one bar, the library's
  (`<anotoki-top-bar>`, `@anotoki/lib/shell`), worded and wired in
  `top-bar/` (`docs/kb/architecture.md`, *The top bar*): one row — the
  brand, Kanji (the reviews due) and Exam, the language, the theme, the
  person's menu or Sign in. The wrapper gives it words, links, the person,
  the menu's items and the two actions; never restyle or rebuild the
  library's parts. Keep its rules:
  - **No key pressed anywhere in the bar reaches `document`** (the library's
    `isolateKeys`, on by default - never switch it off): Enter there submits
    a card or hands a paper in, Space plays a word. A key listener added on
    `document` must not count on hearing the bar's keys.
  - The menus are the library's (the focus in, the arrows, Home / End,
    Escape and **Tab / Shift+Tab back to the menu button**, never `<body>`; a
    click outside; a crossing of the fold closes). Sign out and Sign in
    return the promise of `SignOutService` / `SignInService`, so the open
    menu waits for the saves (the item's spinner and "Saving…", the focus on
    the menu button).
  - Up to `PHONE_BAR_MAX` = 760 px (`ADMIN_PHONE_BAR_MAX` = 1170 in the admin
    panel, whose eight links need a wider row: `--anotoki-topbar-max-width`
    1540 px there, the brand short up to `ADMIN_SHORT_BRAND_MAX` = 1350, the
    name from `ADMIN_NAME_BAR_MIN` = 1530) the links and the person's menu fold into one menu button, which
    carries the reviews due and names them (`phoneMark`); above it only the
    person's name gives way (`NAME_BAR_MIN` = 961). The Feedback link carries
    the count of new messages (the library's `FeedbackUnread`). Measured with the real
    labels in English and Slovak and 999 due: a change to the bar's words or
    pieces is measured again (the `academy-ui-check` skill).
  - Its words are keys with their English in a `const ENGLISH` map
    (`keptWord()`; `backend/tests/unit/translations.test.php` holds it to the
    seeded English) - the bar's own in `top-bar.component.ts`; the kit's
    (Sign out, the theme, the language …) are the library's keys
    (`core/kit.config.ts`, above); in the admin panel they read in English
    through the translation service (`effectiveLanguage`), never through a
    case in the bar. The language button's
    name holds the code it shows (`{code}`).
- Terms, Privacy and Contact (`/terms`, `/privacy`, `/contact`) are the
  family's pages (`@anotoki/lib/legal/pages`, lazy) with this app's facts
  (`legal/legal-facts.ts`, given by their frame `legal/legal-frame`, out of
  the first load; the root configuration `core/legal.config.ts`), anybody's:
  no guard, drawn by `AppComponent` whatever the sign-in says. Each is a route
  of its own whose parent is the frame, before the learner's `**` - never one
  parent with an empty path holding the three, which would take `/` with no
  guard (`app.routes.spec.ts` holds `/` and an unknown address). About and
  Support (`/about`, `/support`: the family's `@anotoki/lib/legal/about`,
  `/support`, anotoki-lib 0.8.0, the same on every anotoki site) are routes the
  same way, in the same frame, and `LEGAL_PAGE_PATHS` names them too; their
  titles the library's headings (`anotoki.about.title`,
  `anotoki.support.title`). The facts
  must stay true of the code: a change to what the app keeps, or for how
  long, changes their `legal.*` strings (a migration) and
  `ACADEMY_LEGAL_UPDATED`; every address they link to is the code's, never a
  string. The footer has the family's links to them (`<anotoki-legal-links>`,
  inside `<anotoki-site-footer>`).
- Switching the language changes words only: a session or a paper goes on
  where it was. The five kanji tabs are the kit's link tabs: where they do
  not fit (a phone) they scroll sideways in the kit's strip, never the page,
  and the page's tab is brought into view (`screens.js` checks it).
- `frontend/public/changelog.json`: an entry, in plain words, for every
  release the owner will notice; its version has three numbers,
  MAJOR.MINOR.PATCH (big changes, new features, bug fixes), and the newest is
  the `version` of `frontend/package.json` (the package at the top is
  Prettier's alone, with no version; `changelog.service.spec.ts` holds both).
  A browser's "read" version compares number by number (`compareVersions()`:
  `0.4` is `0.4.0`).
- The backend serves the last build: run `node frontend/scripts/ensure-build.mjs` (or work at
  http://localhost:4400 with `npm start` in `frontend/`). Run it before the
  browser suites: it builds only when the sources changed.
- After a change: `npm test` in `frontend/`, `node frontend/e2e/run.js` and the
  `academy-ui-check` skill, or the `academy-ui-tester` agent. The latter is
  mandatory before calling the work done.
