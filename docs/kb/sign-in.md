# Sign-in and each person's data

Since 2026-09-27 Japanese Academy can run as a hosted site for several people,
each with their own progress. Sign-in is not the app's own: every anotoki site
signs people in through one identity provider, the **anotoki IAM**
(iam.anotoki.eu; its repository is `anotoki-iam`, next to this one, and its
`docs/integrating-an-app.md` is the contract this page follows).

## One way: the IAM

Since 2026-10-04 there is one way to sign in, on the owner's computer as on a
website: through the IAM (the owner's decision for the whole anotoki family:
"The IAM should be the only option"). The sign-in mode `none` of before, in
which every request of this computer was the owner's, is gone, and with it the
owner id it acted as (`auth.local_user_id`). A copy on a computer signs in
against the development IAM (`http://localhost:4300`, `DEV.md`), a website
against `https://iam.anotoki.eu`.

`backend/config/auth.local.php`, which the setup page writes, names the IAM:
`['issuer' => …, 'client_id' => 'japanese-academy']`. It is deployment
configuration; a request can never choose it. There is no default: without
the file every address with data answers 503 `not_set_up`. What an earlier
version wrote beside them is ignored (`'mode' => 'iam'`, `local_user_id`,
and `app.local.php` with its time zone), so a copy set up then keeps
working; only a copy set up without sign-in (`'mode' => 'none'`) is not set up
any more, and says why: "sign-in without the IAM is gone: open /setup.php and
save".

**Who may come in.** Every account the IAM lets sign in here. Since IAM
migration 010 (2026-10-05, the owner's decision for the whole family) every
account holds `MEMBER` in every anotoki site, and each site's page in the IAM
says which of its roles may sign in (all of them, unless the owner unticks
one): `MEMBER` is the ordinary learner, and nothing here needs it or refuses
it - a verified token with `MEMBER` alone, or with no role here at all (the
tokens of IAM 007 to 009, which had deleted `MEMBER`), is a learner like any
other. **Blocking somebody** is taking their `MEMBER` away in the IAM: it
refuses their next sign-in and their next refresh, while the access token
they hold still verifies here until it expires (minutes: this site checks
tokens itself and never asks the IAM about one). And once this site lets
people study without signing in (below), a blocked person can still study
here as a visitor: blocking stops signing in, not visiting; to keep somebody
out entirely, require sign-in. The roles open the admin panel, and only the
server decides:

| Role | May |
|---|---|
| `MEMBER`, or none | study: their own kanji progress, exam attempts and reports; take all of their data away as a file and bring it back (`GET`, `PUT /api/me/data`) |
| `EDITOR` | that, and reword the app's words: read and save the strings, export and import a language's (`/api/admin/translations…`, and read `/api/admin/languages`) |
| `ADMIN` | all that, and add, change and delete languages (`POST`, `PUT`, `DELETE /api/admin/languages…`); see the people and delete a person's data (`GET /api/admin/people`, `DELETE /api/admin/people/{id}`); see and apply the database's migrations (`GET /api/admin/migrations`, `POST /api/admin/migrations/apply`, a group of its own that answers while a migration waits) |

The person's time zone travels with each request too (`X-Time-Zone`), but it
is not who they are: it only says how their days are counted
([kanji-srs.md](kanji-srs.md), *Each learner's own time zone*).

The checks sit on the route groups (`backend/api/routes/translations.php`,
`backend/api/middleware/staff.php`): the whole `/api/admin` group needs
`EDITOR` or `ADMIN` (else 403 `staff_only`, "This is for the site's editors
and administrators."), and a group inside it `ADMIN` (else 403 `admin_only`,
"This is for the site's administrators."), so an address added to a group
later cannot forget its check. Roles come from the token alone, upper-cased
(`auth_roles()`); any other role it carries, `MEMBER` included, means
nothing here, and a role named in a body, an address or a header is nobody's.
There is no `Origin` check any more: every request here carries a bearer
token, never a cookie, so another site's page cannot make a signed-in browser
send one (the setup page, a cookie and a form, keeps its own).
A database update is never applied by a request: a new migration waits for
an `ADMIN`'s **Apply pending** on the admin panel's Migrations page
(`/admin/migrations`, which takes a raw copy of every table first;
`backend/src/upkeep.php`), and meanwhile every address with data answers 503
`not_up_to_date`. The setup page and `backend/manage.php` still apply them
directly, under the same lock ([architecture.md](architecture.md), *A whole
migration waits for an administrator*).

The application is registered in the IAM as client `japanese-academy`: a
public client, roles `MEMBER` (every account), `ADMIN` and `EDITOR` (IAM
migration 010; 007 to 009 had only `ADMIN` and `EDITOR`), "Sign-in required"
on. The owner holds `ADMIN`.

## Is sign-in required here? — `backend/src/access.php`

The IAM says, per application: a "Sign-in required" switch on the
application's page in its admin panel (IAM migration 010; on for this site
until the owner turns it off), answered to anybody at `GET
{issuer}/api/public/applications/japanese-academy` (`{client_id, name,
login_required}`, or 404 for an application it does not know or has
switched off). The reader is the IAM's PHP SDK, v1.1.0
(`anotoki_iam_login_required()`), not code of this app: it keeps the answer
for a minute in `backend/storage/cache/` (the app's own folder, as for the
keys: the kept answer is what would open the site to people who are not
signed in, so it never goes into a shared temp folder), asks once when the
minute runs out while other requests use the last value, waits at most 2 s
for the IAM, keeps using the last value while the IAM does not answer (and
does not ask again for a minute), and says **required** whenever nothing
better is known: never read, a 404 (an IAM before 010 has no such address,
so this site needs nothing of the IAM to ship), or an answer that is not one
(not JSON, another site's, a `login_required` that is not a boolean).

`access_login_required()` adds one thing to it: **visitors** — people who
study here without signing in, each with their data kept for their browser,
moved into their account when they sign in (*Visitors*, below) — need
migration 007 (`users.visitor_key_hash`, `visitors_ready()` in
`backend/src/visitors.php`), which an ADMIN applies on the Migrations page
like any other. Until the database has it, sign-in is required whatever the IAM
says (the database is asked only when the IAM says sign-in is not needed, so
`/api/auth/config` needs no database otherwise). Anything that goes wrong
while asking is "required" too (and a line in the error log).

`/api/auth/config` relays the answer to the browser as `loginRequired`, with
`visitorKeepDays` (30: how long a visitor's data is kept after their last
visit, for the visitor's notice), so the browser never asks the IAM. The
study addresses ask it too, of a request without a token
(`learner_middleware()`, *Visitors*): a request with a token never needs it,
and a request without one may wait for the IAM once a minute (at most 2 s).
It is `true` wherever the IAM requires sign-in (the default, and every site
before IAM 010) or the database has not got 007 yet: everything asks for a
token as before. The browser reads it at its start (*The browser*,
below): `true`, or anything but an explicit `false`, is today's sign-in.

| | Production | Development |
|---|---|---|
| issuer | `https://iam.anotoki.eu` | `http://localhost:4300` |
| redirect URI | `https://japanese.anotoki.eu/auth/callback` | `http://localhost:4400/auth/callback` (the Angular dev server) |
| after sign-out | `https://japanese.anotoki.eu/` | `http://localhost:4400/` |

The IAM registers the development addresses by default. A copy on a computer
signs in through `ng serve` on 4400 (`DEV.md`).

## The server — `backend/src/auth.php`

`auth_user()` answers "who is asking" once per request; the person middleware
(`backend/api/middleware/person.php`) asks it for every address with somebody's
data and puts the user id on the request:

1. The `Authorization: Bearer …` header (`CGIPassAuth` and a `SetEnvIf` in
   `public/.htaccess` get it to PHP under CGI and FastCGI). The token is
   verified **without asking the IAM** by `backend/src/anotoki_iam.php`, the
   IAM's PHP SDK **v1.1.0**, copied unchanged (1.0.1 was the first with
   nothing PHP 8.5 deprecates, which this app's error handler would turn into
   an error on every page; 1.1.0 adds the reader of *Is sign-in required
   here?* above): RS256 signature against the IAM's published keys
   (cached for an hour in `backend/storage/cache/`, not the shared temp
   folder), `typ at+jwt`, issuer, audience `japanese-academy`, expiry. Its
   `sub` is the user id. No token - no `Authorization` header of the Bearer
   scheme (`auth_sent_token()`; a `Basic …` one is no token): 401 `Sign in first.` (code
   `sign_in_required`) - from this computer too: nobody is anybody without a
   token; a token that does not verify, or the Bearer scheme with no token
   after it: 401 `Sign in again.` (`invalid_token`;
   the reason goes to the error log only, on one line and clipped to 300
   characters: it can quote the token's own header, which whoever sent it
   chose). Never a fallback to anybody. The page words each from its code, in
   the reader's language.
2. Then `users_seen()` keeps the person's `users` row up to date (below).

Every address with somebody's data needs it: all of `/api/*` and `/report/*`
- the study addresses only while sign-in is required here (*Visitors*, below)
- except `/api/auth/config` (how to sign in: `{issuer, clientId,
loginRequired, visitorKeepDays}`; it can wait for the IAM once a minute, and asks the database
only when the IAM says sign-in is not needed, above),
`/api/health` (`{ok, contentCurrent}`; to a request straight from this
computer under PHP's built-in server also `database` and `backups`, which
the tests check) and `/api/translations/{code}` (the app's own words, the same
for everybody: no token is looked at, a good one or a bad one, so a page
whose sign-in ran out still reads in its language, and the browser sends
none). The audio clips are shared content and need no sign-in. Unknown
addresses stay 404.

`auth_from_this_computer()` decides nobody's sign-in. It decides what this
computer is told and asked: the setup page wants no token from it, and the
not-set-up answer, a failure and `/api/health` say more to it. A request
straight from it is one whose `Host` is `127.0.0.1`, `localhost` or `[::1]`
(any port) and that carries no `Forwarded`, `X-Forwarded-For` or
`X-Real-IP`: a tunnel or a proxy on this computer would make every visitor
come from 127.0.0.1, and a web page elsewhere can reach 127.0.0.1 through a
name of its own that points there (DNS rebinding).

## Each person's data

Migration `002_users.sql` gave every study table a `user_id`, first in each
primary key, pointing at `users` with `ON UPDATE CASCADE`:

| Table | Key |
|---|---|
| `users` | `id`: the IAM user id. Also `preferred_username` (from the latest token), `created_at`, `last_seen_at` |
| `srs_settings` | `user_id` (one row per person; made at their first change) |
| `srs_progress` | `(user_id, item_id)` |
| `srs_daily` | `(user_id, day)` |
| `srs_log` | `id`, and `user_id` (indexed with `id`) |
| `exam_attempts` | `(user_id, id)`: two people may have attempts with the same id |
| `imports` | `(user_id, source)` |

Every function that reads or writes them takes the user id first
(`store_…`, `kanji_…`, `exam_history()`, `exam_report()`, …) and every query
has `WHERE user_id = ?`. A report of somebody else's attempt answers 404, as
if it did not exist. The study content (`srs_items`, `exam_questions`,
`content_state`) is the same for everybody.

**The owner's data.** Until 2026-09-27 the database held the owner's data
only. Migration 002 gave all of it to user 1 (the owner's IAM user id) and
checks at its end that every row came through unchanged (counts and a
fingerprint of every table); otherwise it fails and changes nothing. The
owner approved this one-time rewrite of the study tables on 2026-09-27; apart
from it the rows are never rewritten. The owner's id at the IAM is 1, so
their data is theirs when they sign in; nothing in the app moves a person's
rows to another id any more (the setup page's "Your IAM user id" and
`manage.php --owner-id` are gone with the owner id).

**The users table** is filled in as requests arrive: the first request of a
verified person makes their row, and a request writes it again at most every
five minutes (or when the name in the token changed). The IAM owns identity:
no passwords, no emails, nothing decided from anything but a verified token.

## Visitors — `backend/src/visitors.php`

Where the IAM says this site does not require sign-in (and migration 007 is
applied), somebody who has not signed in may study all the same: the kanji
SRS, the exam and its reports. The backend and the browser are built
(2026-10-05; the browser's half: *The browser*, *Visitors in the browser*),
and so is 007 (final since 2026-10-05): a site becomes open to visitors once
an ADMIN has applied it there and the owner has unticked "Sign-in required"
for Japanese in the IAM (IAM 010 and later). The anotoki build analyzer's visitor
accounts are the pattern; the family's design is the owner's words: "The
visitors will have automatically created account ... with all data there.
Its just they can lose their data because they are not stored via
credentials. But when they register the data could transfer."

**Who a request is**, on the study addresses (`study_route()`,
`learner_middleware()` in `backend/api/middleware/person.php`), in this order:

1. an `Authorization` header of the **Bearer** scheme, with or without a
   token after it: that person (`auth_user()`), or a 401 - a bad or expired
   token never falls back to the key, which is not even read. A `Basic …`
   header (a host behind a password file) claims nobody;
2. else, sign-in required here (`access_login_required()`, which also says
   so while 007 is not applied): 401 `sign_in_required`, with a key or
   without - the key is never looked up, counted or swept early, and the
   browser keeps it for when the switch goes off again, or for the move;
3. else an `X-Visitor-Key`: that visitor; malformed or nobody's (moved,
   swept), and a row that went while the request was on its way (a save's
   `users_hold()`): 401 `visitor_unknown`, never a 500;
4. else **nobody**: user id 0, which matches no row, so every read answers as
   for a learner with no data (the kanji pages, a paper, the attempts), and
   nobody's resets answer at once, writing nothing. A **save** by nobody (a
   lesson, review or practice answer, an item's notes, the settings, a
   submitted exam) makes a visitor, within the limits, in the save's own
   transaction: a save refused (a 4xx) or failed makes nobody and counts
   nothing; done, the answer carries the key in `X-Visitor-Key` (with
   `Cache-Control: no-store`, as every JSON answer here) - never in a body,
   an address or a log.

**A visitor** is a `users` row with a negative id (`visitor_ids`: -1, -2, …;
an IAM user id is always positive), the SHA-256 of their key
(`visitor_key_hash`), and a keyed hash of the address they came from
(`visitor_from`, for the limits; the secret is
`backend/storage/cache/visitor-address.key`, never in the database). Their
study rows are like anybody's, under that id. The key is 32 random bytes the
server makes (43 characters, base64url); a visitor may never be more than
that: no role, never the admin panel, the Migrations page, their data as a
file (`/api/me/data`), nor anybody else's row - those addresses read only a
token (`person_middleware()`), so a key there is 401 `sign_in_required`. A
visitor has no data file: none to download, no copy before their reset, and
none in a backup (`users_all()` is people only; a restore of everybody
deletes the visitors).

**The limits** (`VISITORS_DEFAULTS`; each may be set in
`backend/config/app.local.php`, [hosting.md](hosting.md), *Visitors*): 300
visitors at once, 10 new ones an hour from one address (an IPv6 address by
its /64; a proxy's header only from a trusted proxy), 60 an hour in all -
over them 429 `too_many_visitors` for a NEW visitor only, never for one
already here; and per visitor 10 exam attempts and 20,000 lines of the
answer log - at a cap 422 `visitor_limit` with `{limit, max}` (`attempts`,
`answers`). A visitor at the attempt cap is refused the paper already
(`POST /api/exam`), so that no paper is answered in vain. The limits are
counted on the visitor rows themselves, under an advisory lock, so they are
exact and a refused visitor takes nothing back; the caps are counted before
the save, so two saves at once may pass one over.

**Thirty days.** A visitor unseen for 30 days (`last_seen_at`, written at most
every five minutes) is deleted with all of their rows, by the sweep: after
the answer of a study request (`backend/src/after.php`: PHP-FPM and
LiteSpeed close the connection first; elsewhere the answer is flushed), at
most once an hour across the site (a stamp in `backend/storage/cache/`), in
batches of 20 rows taken `FOR UPDATE SKIP LOCKED`, each statement allowed
2 s, ten seconds in all; a failure is logged and never costs the answer. It
runs whether or not sign-in is required now. There is no earlier sweep of
"thin" visitors (the notice promises 30 days): somebody making visitors from
many addresses can fill the 300 for a month, which [hosting.md](hosting.md)
says how to watch and what to change.

**The move at sign-in** (`POST /api/visitor/move`, the person's token AND the
visitor's key, whatever the switch says): in one transaction, the visitor's
row locked first, then the person's (each waited for at most 5 s), what the
visitor studied becomes the person's, and the visitor (with its key) is
gone. Where both have the same thing, the person's stays:

| Data | At the move |
|---|---|
| `srs_progress` | an item both have keeps the person's row as it is (`kept`); every other item moves (`items`) |
| `srs_daily` | a day both have: the counts added (both sets of answers were given); other days move |
| `srs_log` | every line moves (`answers`), but the visitor's full resets and its resets of items the person kept: they touched only the visitor's copy |
| `exam_attempts` | every attempt moves (`attempts`), its report the snapshot it was; an id both have keeps the person's |
| `srs_settings` | the person's when they have them, else the visitor's |
| `users.time_zone` | the person's, or else the visitor's |

When the person has study data, a copy of it is taken first
(`academy-before-move-user-<id>-…`, their last 14 kept). The answer is
`{found, items, kept, attempts, answers}`; a key nobody has (moved by
another tab, swept) is `{found: false}` and zeros, so the move may be asked
again; no key or not a key: 422 `bad_visitor_key`; a row held past the 5 s
or a write that met another: 503 `visitor_move_retry` (`Retry-After: 2`,
nothing moved); 007 not applied: 503 `visitors_unavailable`.

The People page lists people only; `GET /api/admin/visitors` (ADMIN) says how
many visitors there are, the longest unseen and the limits, and
`manage.php --check` counts them. Taking a person's `MEMBER` away in the IAM
blocks their sign-in, not their visiting (*Who may come in*, above).

## The browser — `frontend/src/app/core/auth/`

The IAM's browser SDK **v1.1.1** is copied unchanged into `sdk/`
(`anotoki-auth.mjs` and its types, `anotoki-auth.d.ts`, from the IAM's
`sdk/js/`), and bundled with the app. Since 2026-10-04 the browser is in step
with the server: the IAM only, roles from the token, each request with the
reader's time zone; who is signed in is the person's menu of the anotoki
family's top bar (`frontend/src/app/top-bar/`, [architecture.md](architecture.md),
*The top bar*).

- `AuthService.init()` runs before anything else (`provideAppInitializer`):
  it asks `GET /api/auth/config` (`{issuer, clientId, loginRequired,
  visitorKeepDays}`; there is no mode; `loginRequired` is true unless it is
  an explicit `false`: then nobody signed in is a visitor, *Visitors in the
  browser* below). (Then, signed in with a visitor key held, the move of what
  it holds — waited for 5 s at most —, then
  the language and its strings are loaded: `core/boot.ts`,
  [architecture.md](architecture.md), *The app's words*.) A 503 `not_set_up`
  shows the "not set up yet" page (with a link to `/setup.php`, and, to this
  computer, why); a server that does not answer, a page that says so; settings
  the SDK refuses, the problem page with its message. `/api/auth/config` needs
  only the settings, so a copy whose database is missing or has no tables
  starts all the same; the first address with data then answers `not_set_up`,
  and any such answer from this site puts up the same page
  (`core/api/not-set-up.interceptor.ts`, and `AuthService.fetch()` for its own
  calls). Only a page load leaves it.
- It creates the SDK with this site's `/auth/callback` as the redirect URI and
  `/` after sign-out, and runs its `init()`, which finishes a sign-in coming
  back from the IAM (the code exchanged, the address the person started from
  put back) or restores the session from `localStorage` (refreshing the access
  token when it ran out; refresh tokens rotate, and the SDK serialises
  refreshes across tabs). Only then does the router's first navigation run
  (`AppComponent`), so no screen asks for data before the sign-in is settled.
- **Every page is for somebody signed in** (`sign-in.guard.ts`, the survey's
  `signInGuard`): `canActivateChild` on the routes around a learner's pages,
  so each page asks again, and `canActivate` on `/admin` (`adminSignInGuard`). Unless the IAM
  does not require sign-in here (*Visitors in the browser*). Nobody signed in, it
  sends the browser straight to the IAM — the IAM's pages in the language read
  here, when one was settled — and the IAM sends it back to the very address
  asked for (`/kanji/reviews?lesson=6` stays that). Nothing of the page is
  drawn meanwhile. It lets a page through with nobody signed in in one case:
  this page load came back from the IAM without a sign-in (refused,
  cancelled), or the sign-in could not even start (the browser refuses the
  site's storage: `AuthService.login()` answers false and keeps the code) —
  sent straight back, the browser would go round for ever. Then the **Sign in
  card** (`standin/sign-in/`) stands in for the app, with the reason worded
  from its code. The address asked for is kept through it
  (`AuthService.askedFor`: the callback's `returnTo`, or the address the guard
  let through since): the page's own `whenReady` refuses it and the router
  puts `/` back in the address bar, but the card's **Sign in** and the bar's
  come back to `/exam`, `/kanji/reviews`, `/kanji/item/…`, not to `/`. The screens that load data on the way (the kanji routes' resolver)
  are behind `whenReady` too, so nothing is asked of the API meanwhile. While
  the app cannot run (not set up, could not start) the guard lets nothing
  through and sends nobody anywhere: the boot pages are drawn then.
  `/auth/callback` is not behind it (it only ever sends the browser home).
- The card is also what a page shows when the session ends while it is open
  (a sign-out in another tab, the IAM's idle limit): `AuthService.showSignIn`
  is "signed out, and a sign-in failed or the app was shown in this page
  load". The next navigation goes to the IAM by itself. After **Sign out** the
  IAM sends the browser to `/`, whose guard sends it to the IAM's sign-in page
  (its session is over, so nobody is signed back in).
- A failed sign-in is worded from its code in the reader's language
  (`signInFailureKey()` in `core/i18n/error-text.ts`); the IAM's and the SDK's
  English sentences are not kept. For `access_denied` — the person went back
  from the IAM's page, or the account was turned away — one sentence true
  either way: "Signing in was not completed. Try again." Anything else:
  "Signing in did not work. Try again. ({code})" — the code as it came
  (`storage_unavailable`, `state_mismatch`…), or `unknown` when it does not
  look like one (it came through the address).
- **Roles** come from the token: `AuthService.roles` (capitals), `isStaff`
  (EDITOR or ADMIN: the admin panel) and `isAdmin` (ADMIN: Languages,
  People and Migrations; and the admin panel starts for an ADMIN while a
  migration waits, which stops everybody else's pages). The routes' `staffOnly` and `adminOnly` send anybody else home;
  they only hide what the server refuses (403 `staff_only` / `admin_only`). A
  token with no role is a learner. The person's menu in the top bar offers
  **Admin panel** to EDITOR and ADMIN (and, in the admin panel, **Back to Japanese
  Academy**), with their role as a tag under their name and address.
- **A page is one person's.** The SDK shares its session with every tab, and
  what a page loaded stays in root services (the kanji state, a paper of the
  exam). So once the app has shown somebody's data, a sign-in of somebody else
  in another tab — also after a sign-out there — makes the page load again, as
  them (`AuthService.follow()` compares the IAM user id the app became ready
  with). Until it has, `AuthService.token()` and `refreshToken()` hand out no
  token of the other person, and both the interceptor and `AuthService.fetch()`
  take their tokens from them, so nothing the page sends goes out as theirs: a
  request made for the page's person with no token to send is not sent at all
  (a 401 `sign_in_required` of its own, and the Sign in card) — never without
  a token, where the server could take it for a visitor's. The same person again, or a token
  refreshed, changes nothing; a page that loaded signed out has shown nobody's
  data, and simply starts.
- **The interceptor** (`auth.interceptor.ts`) adds the access token and
  `X-Time-Zone` (the browser's IANA zone, `Intl.DateTimeFormat()
  .resolvedOptions().timeZone`, `core/time-zone.ts`; nothing when the browser
  names none) to every HttpClient request to this site's `/api/…` and
  `/report/…` — to its own origin only, whatever address it is given — and to
  nothing else — on a person's request; a visitor's goes with the visitor key
  instead (*Visitors in the browser*). Whose a request is, is decided as it
  is issued (`ISSUED_AS`, `core/auth/issued-as.ts`, or else
  `AuthService.caller()` from what the page is shown as), never from whether
  a token happens to be there when it leaves. A 401 to a token the SDK thought good gets one fresh token and
  one retry, for the same person only: a fresh token of somebody who signed in
  in another tab meanwhile is not sent with a request this page made (the page
  loads again as them, above). When the IAM gives none, the session is over
  and the Sign in card takes over. `AuthService.fetch()` does the same for the
  few plain `fetch()` calls (the reports, the data file): this site only, the
  zone, the page's own person's token, one retry for the same person (it does
  not use the SDK's own `fetch()`, which sends whoever's token it holds
  wherever it is asked to). The two public reads name the zone too
  (`/api/auth/config`, and the app's words, `/api/translations/{code}`, which
  go without a token and do not depend on it): every request to this site's
  API carries it. The server counts the learner's days
  and review hours in that zone ([kanji-srs.md](kanji-srs.md)); the pages never
  count days themselves — the dashboard names the server's forecast days by
  the dates the server says they stand for (`forecastDates`).
- **Links the browser would follow by itself** cannot carry a token.
  `PrivateLinksService` handles a report (`/report/:id`): a click fetches it
  with the token and opens it from memory (a `blob:` address, in a tab opened
  during the click so no pop-up blocker stops it). A report opened like that
  gets a Content-Security-Policy that allows no script (and the server sends
  the same header), because a report is stored HTML that a data file may have
  brought in, and the page shares its origin with the tokens. The policy is a
  `<meta>` put before anything of the report's (`lockDown()`: right after a
  leading doctype, or at the very start): a policy counts from where it
  stands, so one after the report's own `<head>` would come after a script
  put before it. Only HTML's own spaces may come before that doctype: a
  character HTML reads as text would put the `<meta>` in the body, where it
  counts for nothing. Your data's download is fetched the same way
  (`home/your-data/`), and saved from a Blob under the server's file name.
- **Signing out waits for what is on its way** (`sign-out.service.ts`,
  `core/saves-in-flight.service.ts`). A lesson's, a review's and practice's
  answers are saved in the background, a note a moment after the typing stops,
  and an exam paper when it is handed in; each tells `SavesInFlight`, which the
  top bar can reach where it cannot reach them. Sign out sends a note still
  waiting at once, waits for every save on its way (the button: a spinner and
  "Saving…"), and asks first, in the learner's language (the browser's own
  dialog, worded as it is raised), when one of them failed
  (`signOut.notSaved`), when a lesson or review still holds an answer whose
  save failed earlier — the session says that only on its summary, which is
  not drawn yet, so it reports it (`watch()`, the same question, asked once) —
  or when an exam paper is open and not handed in (`signOut.examOpen`). Then the IAM ends the session everywhere. The admin
  area's unsaved strings are `AdminDrafts`' to ask about (the browser's
  "Leave site?" as the page goes).

The person's menu (the round button with their initial; their name beside it
from 961 px, in the phone's menu up to 760 px) uses the colour tokens
(`--shadow` among them). Its items: their name, address and role, **Your
anotoki account** (the IAM's account page, a new tab), **Admin panel**, **Sign
out**. Signed out with the Sign in card on the page, or visiting, the bar has
**Sign in** instead (`SignInService`: in the reader's language, as the card's
button; from a visitor's page after the saves on their way, below).
Like the whole bar it keeps its keys to itself, so Enter on Sign out never
submits a card or hands a paper in behind it.

### Visitors in the browser

Where `/api/auth/config` says `loginRequired: false` (the IAM's switch off,
and migration 007 applied), nobody signed in is a **visitor**: the
`AuthService` state `visiting`, the app itself (the family's design 4.3,
built 2026-10-05).

- **The pages.** `signInGuard` lets every page of a learner's through, with
  no trip to the IAM; `whenReady` is `AuthService.usable()` (signed in or
  visiting). The admin panel never is a visitor's: `/admin` (the Migrations
  page too) is behind `adminSignInGuard`, which sends a visitor to the IAM
  and back as it sends somebody signed out — or home, when this page load's
  sign-in came back without one (sent again, the browser would go round for
  ever). Your data (the file of one's own data) is a signed-in person's only:
  not on a visitor's home page, nor its link at the dashboard's foot. The top
  bar has Kanji and Exam, and **Sign in** where the person's menu would be.
- **The notice** (`home/visitor-notice/`, at the top of the home page and the
  kanji dashboard): "You are studying without signing in. What you study is
  kept for this browser for {count} days after your last visit. Sign in to
  keep it in your account." (`visitor.notice`, a plural family; the days are
  the server's `visitorKeepDays`), with **Sign in**. Once, after a key the
  server no longer knew was forgotten: `visitor.lost`. Once, after a move:
  `visitor.moved` (how many kanji and words, how many exam attempts) and
  `visitor.movedKept` (how many the account had already: its own progress
  stays). Each closes.
- **A sign-in that came back without one** while visiting (refused,
  cancelled: `access_denied` is also the IAM turning the account away — its
  `MEMBER` taken away here, *Who may come in*) is said above the page
  (`standin/sign-in-failed/`, in the Sign in card's words) until closed: never
  swallowed, while the page goes on for the visitor.
- **Whose a request is** (`auth.interceptor.ts`) is decided as it is issued:
  a page shown to a visitor issues visitor's requests, any other page with a
  sign-in a person's (a person's page whose session ended is a person's still:
  never sent without a token, never turned into a visitor's — it gets the
  Sign in card). A visitor's request carries `X-Visitor-Key` — the key this
  browser holds now (`core/auth/visitor-key.ts`, localStorage
  `japanese-academy-visitor`, read as the request leaves, kept in step with
  other tabs by the `storage` event) — and never a token, only while sign-in
  is not required. With no key, the first save that may make a visitor (a
  lesson, review or practice answer, an item's notes, the settings, an exam
  handed in: `makesVisitor()`) goes alone; whatever is issued meanwhile (reads
  too) waits for its answer and then goes with the key it brought (one visitor
  per browser) — or, when it failed and brought none, one at a time again.
  The key in that answer is kept only when the browser holds none (the first
  key stays, whichever tab made it). A key in the answer to a person's request
  is not kept, and the request fails (a 502 `server_error`, said in the
  console too): the server never saw the token - a host that drops
  `Authorization`, with sign-in off - and kept the save under a new visitor,
  so the page says it was not saved instead of counting it as the person's
  ([hosting.md](hosting.md), *Visitors on the site*, has the check).
- **401 `visitor_unknown`** (swept after the days unused, or moved into an
  account by another tab): the key that was sent is forgotten — only while it
  is still the one held (another tab may hold a new one) — `lost` is said once,
  and the request is tried once more without it (a read answers as for
  nobody, a save makes a new visitor). **401 `sign_in_required`** (the IAM's
  switch turned on since the page loaded): `AuthService.signInRequiredNow()`
  — the Sign in card from then on — and the key is **kept**, never sent while
  sign-in is required, so the sign-in still moves what it holds, and the
  switch turned off again within the days brings it back.
- **Signing in from a visitor's page** (`core/auth/sign-in.service.ts`: the
  bar's Sign in and the notice's) first does what signing out does: a note
  still waiting is sent, every save on its way waited for (the first one
  brings the key; cut off by the page going to the IAM, its study would stay
  behind on the server, out of the move's reach), and the visitor is asked
  first when one failed (`signIn.notSaved`) or an exam paper is open
  (`signIn.examOpen`). Meanwhile the button says so (a spinner; the bar's and
  the phone menu's item "Saving…"); on a phone the menu stays open while it
  waits, the focus on the menu button, and closes with the focus there.
- **The move.** Signed in with a key held — at the start (`core/boot.ts`:
  `VisitorKey.settle()`, waited for 5 s at most, before the words and the
  first page), and by an effect on any later sign-in — `POST
  /api/visitor/move` with the token and the key (`CARRIES_VISITOR_KEY`: the
  one request with both), one at a time. A 200 forgets the key (compare and
  delete), counts `moves` (the kanji state and the home page load again when
  it changes after they loaded) and keeps what moved for the note; a key
  another tab of this browser moved first (`found: false`, and the moved key
  stamped in `japanese-academy-visitor-moved`) is silent, and one nobody moved
  is `lost`. No answer or a 5xx (`visitor_move_retry`, `visitors_unavailable`):
  the key stays, asked again after 2, 10 and 30 s, then at the next page load.
  422: forgotten. 401: the next sign-in asks again. A sign-in in another tab
  while visiting loads the page again (nothing loaded as the visitor stays on
  it); that load moves what the key holds.
- `AuthService.fetch()` (a visitor's report) follows the same rule:
  `PrivateLinksService` hands it the key while visiting, never a token; a
  person's with no token is never sent. `AuthService` knows nothing of the key
  itself (`VisitorKey` reads `AuthService`, never the other way round).
- A visitor is refused with `too_many_visitors` (the site is full of them:
  "Sign in to continue, or try again later") and, at a cap, `visitor_limit`
  — worded by which limit its answer names (`error.visitor_limit.attempts`
  before an exam starts, `.answers`) with its number — in the reader's words
  (`core/i18n/error-text.ts`).

## Testing with tokens

No test asks an IAM. The tests have one of their own:

- PHP (`backend/tests/lib.php`): `test_iam()` makes a key pair for the test
  file and writes its public half as the JWKS file every test setting names
  (`auth.jwks_file`, issuer `https://iam.test`, which exists nowhere), so
  every server a test starts signs people in as a website does;
  `test_token($id, $roles, $claims, $typ)` signs whatever a test needs with the
  SDK's test helpers — good tokens, expired ones, ones for another app, ID
  tokens; no role is a learner. `call()` sends a token of `TEST_USER` (1, no
  role) unless the test sends its own or none (`no_token()`). A keys file
  counts for a throwaway database only (`auth_jwks_file()`,
  `backend/src/auth.php`): for any other, a line in `auth.local.php` naming
  one is ignored, so a copy's sign-in can never rest on a file instead of the
  IAM. Whether sign-in is required comes from a file of the test's too
  (`test_access(true|false|null)`, `auth.application_file`; none: the IAM out
  of reach, so required), and so do the answer's lifetime and cache folder
  (`auth.application_ttl`, `auth.cache_dir`): the same rule, a throwaway
  database only (`auth_iam_config()`; a built site of the tests takes the file
  from `ACADEMY_APPLICATION_FILE`).
- The stand-in IAM (`backend/tests/tools/stand-in-iam.php`, the router of
  PHP's built-in server; the survey's `fake-iam.php` is its pattern): its
  discovery document and keys for the setup page's **Test connection**, the
  public answer whether a site requires sign-in (`GET
  /api/public/applications/{client_id}`: its state's `login_required`,
  default true; `application_missing` a 404; `down` a 503), and
  with a folder of the test IAM's keys (`STAND_IN_DIR`, as
  `backend/tests/tools/iam.php keys DIR` writes them) the whole sign-in by
  redirect: authorize (signs the configured person in at once - by default
  user 1 with `MEMBER`, a learner - or answers
  `access_denied` when told to `deny`), token (a code with PKCE, a refresh
  with rotation), logout, revoke. Its state's `log` lists every request, so a
  test can count how often it was asked. `stand_in_iam()` in `lib.php` starts one;
  `tests/api/auth.test.php` signs in through it end to end, and
  `tests/api/access.test.php` switches sign-in on and off through it.
- Node (`frontend/e2e/helpers.js`): `startApp()` starts the stand-in IAM
  above on a free port of this computer (with the run's keys, `STAND_IN_DIR`)
  and names it the issuer of every server it starts
  (`testdb.php config DIR NAME JWKS BACKUPS FRONTEND ISSUER [APPLICATION_TTL]`), so a browser
  signs in exactly as on a website: a page opened signed out goes to the
  stand-in, which signs in whom `iamState({ user })` named (or refuses with
  `deny`), and comes back. `iamToken()` (made by
  `backend/tests/tools/iam.php` with the same key) signs the suites' own API
  calls (`app.api(url, person)`), `iamSession()` / `plant()` put a whole
  session in a browser context before its pages load; their people hold
  `MEMBER` (alone: a learner), as every account does. A suite that switches
  sign-in starts its server with `startApp({ applicationTtl: 1 })` (the IAM's
  answer kept a second) and calls `app.signInRequired(false | true)`, which
  tells the stand-in and waits until `/api/auth/config` relays it. `run.js`
  checks the redirect (nothing drawn or asked for on the way), a refused
  sign-in, the token and the zone going only to this site, sign-out through
  the IAM's logout, and other tabs - and, with sign-in not required, the
  visitors from end to end: no trip to the IAM, the notice, `/admin` still
  through the IAM (refused there: said on the visitor's page), one visitor
  and one key for a lesson batch, an exam and its report, Sign in straight
  after a batch's last answer (it waits; everything moves, the note says
  what), a fresh visitor's page after signing out, and sign-in switched on
  with a key held (to the IAM; the sign-in moves it). `screens.js` shoots a
  visitor's home and measures the bar with Sign in while visiting;
  `setup.js` signs in on a set-up copy, this computer's and a website's.
- The Angular unit tests check the interceptor with a fake sign-in
  (`auth.interceptor.spec.ts`: the token and the time zone to this site
  only, a browser with no zone, a retry only as the same person), and
  `AuthService`'s states with a fake server and the real SDK, other tabs
  played by `storage` events (somebody else signing in, a sign-out and back,
  a refresh; its own `fetch()` then sending no token of theirs; the roles; a
  sign-in that cannot start). `sign-in.guard.spec.ts` checks the guard (to
  the IAM and back to the address, the failure's escape, nothing while the app
  cannot run, the callback left alone), `app.routes.spec.ts` the admin split
  and the old addresses, `sign-out.service.spec.ts` the waiting and the
  questions. The Sign in card's words for a cancelled, a refused and a failed
  sign-in are checked through the SDK's own callback
  (`standin/sign-in/sign-in.component.spec.ts`).

See [testing.md](testing.md) for what each suite pins down, and
[hosting.md](hosting.md) for running it as a website.
