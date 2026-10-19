# Japanese Academy - the frontend

The app in the browser: Angular 21, standalone components, zoneless, signals.
Built into `dist/japanese-academy/browser/`, which the backend serves
(`../backend/router.php` on a computer, Apache's `public/` on the website).
How it works is in [`../docs/kb/architecture.md`](../docs/kb/architecture.md);
setting it up and running it in [`../DEV.md`](../DEV.md).

## Layout

```
src/app/            app.component (the anotoki library's <anotoki-site-gate> outermost: its marked template,
                    made only while the site is open, holds the bar, the page and the family's footer
                    - <anotoki-site-footer>: "vX · What's new · Feedback" ("Version X" to a screen
                    reader), then Terms · Privacy ·
                    Contact -, so while the site is not ready the library's page stands alone, with no
                    bar and no footer; the library's screen of a sign-in that came back without one; the
                    kit's question and the app's notice; a legal page drawn whatever the sign-in says), app.routes.ts (the library's guards, its
                    callback and failure routes, the legal pages each a route of its own in their frame,
                    before the learner's catch-all), app.config.ts
  top-bar/          the anotoki family's top bar, the library's <anotoki-top-bar> worded and wired: brand,
                    Kanji (the reviews due) and Exam, language, theme, the person's menu; in the admin
                    panel its eight pages, Feedback with the count of new messages (the library's
                    FeedbackUnread); one menu button up to 760 px (1170 in the admin panel, whose row is
                    wider); no key pressed in it reaches the page
  home/             the home page; visitor-notice/ (studying without signing in: the notice, the notes
                    after a move)
  kanji/            the kanji SRS: dashboard, lessons, reviews, practice, browse, the item page;
                    answer.ts (answer checking)
  exam/             the exam (kept-paper-key.ts: where an open paper is kept for the tab)
  home/your-data/   Your data: the learner's data as a file, down and back (GET / PUT /api/me/data)
  legal/            the legal pages' frame (legal-frame: the page's column, and the facts the family's
                    Terms, Privacy and Contact read, legal-facts.ts - what the app keeps, why and for how
                    long, its stored items by name, who else handles data -, loaded with the first of them
                    opened, out of the first load)
  core/             api/ (ApiService; not-set-up.interceptor.ts, which leaves a report's answer alone), auth/ (the sign-in, the anotoki library's @anotoki/lib/auth:
                    auth.config.ts wires it - the boot configuration, the token or a visitor's key and
                    X-Time-Zone to this site's API, who may make a visitor, the words, the checks before
                    a sign-in or a sign-out, the callback and failure routes, no hint -; AuthService
                    (this app's view of it: its states, the start's problems, the Sign in card),
                    visitor-key.ts (the visitor key, the move at sign-in), SignOutService,
                    SignInService, PrivateLinksService), admin.config.ts (the library's admin tools
                    and People page wired to this app, @anotoki/lib/admin and /people), feedback.config.ts
                    (the library's feedback form, which the footer's Feedback opens),
                    error-report.config.ts (the library's reporter, @anotoki/lib/error-report: the
                    app's ErrorHandler, every error to the console and, scrubbed, to POST
                    /api/client-errors through the app's HttpClient and its interceptors),
                    storage.ts (localStorage and sessionStorage that never throw), changelog/ (the version the footer shows, and the What's new dialog it opens), i18n/ (the app's words:
                    translations.config.ts - the anotoki library's translations, @anotoki/lib/translations,
                    wired to this app: the names it keeps them under, the words' address, a refusal read
                    as what the app can show, the account's language, the admin pages' settings -,
                    time-wording.ts (the words and the account's date order and clock, for format.ts),
                    failures worded from their codes, the title strategy), kit.config.ts
                    (the anotoki library's kit wired to this app: its words are the library's keys in this
                    app's database, forKit(); the theme - light, dark or the system's; signed in, the
                    anotoki account's - and the languages, forShell()),
                    saves-in-flight.service.ts (the saves a sign-out waits for), time-zone.ts, boot.ts,
                    format.ts (dates and clocks in the language's way, or the account's order and clock),
                    site-status.config.ts and site-status.ts (the anotoki library's migrations module,
                    @anotoki/lib/migrations, wired to this app: where the site stands, its gate and
                    pages, the Migrations page), legal.config.ts (the anotoki library's legal pages,
                    @anotoki/lib/legal, wired to this app: the page's language, the database's words;
                    the facts come with the pages' frame), notice/ (the app's notice, NoticeService
                    and <app-notice-host>: something to tell, one button, OK, in the kit's dialog where
                    the browser's alert() stood), testing/ (the module, the kit's English and the kit's
                    question as a spec needs them)
  admin/            the admin panel at /admin, English: Translations (EDITOR, ADMIN) and Languages (ADMIN)
                    - the library's pages, @anotoki/lib/translations/admin -, People, Feedback, Errors,
                    Audit log, Backups and Migrations (ADMIN: the library's pages), each library page in
                    the panel's frame; the top bar's links lead between them
  standin/          the Sign in card and the problem page
src/styles.scss     the library's styles (@anotoki/lib/styles: Manrope, its base, utilities and tables),
                    then src/styles/
src/styles/         _tokens.scss (Japanese's palette given to the library's tokens, anotoki.root(), and the
                    study colours, light and dark; dark also by <html data-theme>), _base.scss (after the
                    family's: the reading size, the frame .wrap, kbd, the stand-in pages), _items.scss
                    (the study's tiles and an item's details); the pages' cards, alerts, choices and
                    chips, labelled groups, disclosures, tabs, fields and table are the kit's
src/testing/        browser-parts.ts (what jsdom lacks for the kit), the catalog fixture
public/             favicon.svg, anotoki.png (the family's mark), changelog.json (the releases; the version in
                    the footer); the library's theme-boot.js (the light/dark shown last, before the first
                    paint) is copied into the build by angular.json
e2e/                the browser suites: run.js, setup.js, screens.js (Edge, playwright-core)
scripts/            ensure-build.mjs (builds only when the sources changed), catalog-fixture.mjs
                    (the catalog the answer-checking tests use, built by PHP from ../backend/data/)
proxy.conf.json     ng serve sends /api, /audio, /report and /setup.php to the backend on :8200
.nvmrc              the Node.js version (22)
```

## Commands

From `frontend/`:

```bash
npm start              # ng serve on http://localhost:4400, with the proxy (the backend: composer start in ../backend)
npm run build          # production build -> dist/japanese-academy/browser/
npm test               # the unit tests (Vitest, jsdom), after the catalog fixture
cd .. && bun run format:check   # Prettier on every file of both halves, at the root (bun install there first)
npm run e2e            # the browser suite, against the last build (build first), signed in through
                       # the anotoki library's stand-in IAM
npm run e2e:setup      # the setup page in the browser
npm run screens        # screenshots -> e2e/shots/
```

From the repository's top folder, `node frontend/scripts/ensure-build.mjs`
builds when the sources changed (and runs `npm ci` first when the packages
are missing or older than the lock); the browser suites need that build.
