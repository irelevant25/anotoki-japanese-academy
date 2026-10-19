# Sign-in and each person's data

Since 2026-09-27 Japanese Academy can run as a hosted site for several people,
each with their own progress. Sign-in is not the app's own: every anotoki site
signs people in through one identity provider, the **anotoki IAM**
(iam.anotoki.eu; its repository is `anotoki-iam`, next to this one, and its
`docs/integrating-an-app.md` is the contract this page follows).

Since anotoki-lib 0.4.0 (2026-10-11; the app is on 0.8.1, both halves) the site's half of
it is the **anotoki library**'s, every anotoki site's: on the server
`Anotoki\Lib\Auth` checks the IAM's tokens and decides who a request is
(set up for this site in `backend/src/auth.php`), and `Anotoki\Lib\People`
keeps each person's row and blanks the accounts the IAM deleted
(`backend/src/people.php`); in the browser `@anotoki/lib/auth` keeps the
session, the callback, the guards, the interceptor and the screen of a
failed sign-in (wired in `frontend/src/app/core/auth/auth.config.ts`). They
replaced the IAM's SDKs this app carried (`backend/src/anotoki_iam.php`
1.1.0, `core/auth/sdk/` 1.2.0) - the same rules, made the library's code,
and the same storage keys in the browser, so nobody was signed out by the
move. What stays this app's: the visitors (their key, the move, the
limits), the time zone, the start's problems, the Sign in card, the words.
The library's README ("Auth", "People") is the authority for its half.

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
the file every address but `/api/site-status` answers 503 `not_set_up` (the
anotoki library's SiteGate, [architecture.md](architecture.md), *The Slim
app*). What an earlier
version wrote beside them is ignored (`'mode' => 'iam'`, `local_user_id`,
and `app.local.php` with its time zone), so a copy set up then keeps
working; only a copy set up without sign-in (`'mode' => 'none'`) is not set up
any more, and `manage.php --check` says why: "sign-in without the IAM is
gone: open /setup.php and save".

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
| `ADMIN` | all that, and add, change and delete languages (`POST`, `PUT`, `DELETE /api/admin/languages…`); see the people and delete a person's data, and check the IAM's deleted accounts now (`GET /api/admin/people`, `DELETE /api/admin/people/{sub}`, `POST /api/admin/people/sync`: the library's People routes); read the error log and clear it, read the audit log, read and handle the feedback, make, download, delete and restore the backups (`/api/admin/errors…`, `/api/admin/audit…`, `/api/admin/feedback…`, `/api/admin/backups…`: the library's admin tools, `backend/api/routes/admin.php` - the owner's decision: `ADMIN` alone; a backup's making, download, delete or restore also wants a sign-in of the last ten minutes, the token's `auth_time`); see and apply the database's migrations (`GET /api/admin/migrations`, `GET /api/admin/migrations/file`, `POST /api/admin/migrations/apply`: the anotoki library's routes, a group of its own that answers while a migration waits, its `ADMIN` read from the token alone, as the error log's and the backups' are) |

The person's time zone travels with each request too (`X-Time-Zone`), but it
is not who they are: it only says how their days are counted
([kanji-srs.md](kanji-srs.md), *Each learner's own time zone*).

The checks sit on the route groups (`backend/api/routes/translations.php`,
`people.php`, `admin.php`, `migrations.php`; `backend/api/middleware/staff.php`,
the library's `RequireRole`): every `/api/admin` group needs
`EDITOR` or `ADMIN` (else 403 `staff_only`, "This is for the site's editors
and administrators."), and a group of what only an administrator may do
`ADMIN` (else 403 `admin_only`, "This is for the site's administrators."),
so an address added to a group later cannot forget its check; the library's
own groups (the people, the admin tools) carry their own `ADMIN` check
inside as well, whatever is put around them. Roles come from the token alone, upper-cased
(the library's `Person`; `auth_roles()` keeps `ADMIN` and `EDITOR`); any other role it carries, `MEMBER` included, means
nothing here, and a role named in a body, an address or a header is nobody's.
There is no `Origin` check any more: every request here carries a bearer
token, never a cookie, so another site's page cannot make a signed-in browser
send one (the setup page, a cookie and a form, keeps its own).
The groups that answer while a migration waits - the Migrations page's, the
error log's and the backups' - check `ADMIN` in the token and nothing else
(`admin_token_checks()`: no row is read or written, since the migration that
waits may be the one that makes the tables), with the same 401s and 403s.
A database update is never applied by a request: a new migration waits for
an `ADMIN`'s **Apply pending** on the admin panel's Migrations page
(`/admin/migrations`, which takes a raw copy of every table and the
library's backup of the whole database first; `backend/src/upkeep.php`),
and meanwhile every address but the few the
pages need to start, to sign somebody in and to reach that page (and the
error log and the backups) answers 503
`update_pending` (the anotoki library's SiteGate). Signing in goes on
working then — `/api/auth/config` and the words answer, and the IAM is not
this site — so an administrator who is signed out signs in from the
library's page and applies it (until 2026-10-07 they could not: the start
stopped on the problem page). The setup page and `backend/manage.php` still
apply them directly, under the same lock ([architecture.md](architecture.md),
*A whole migration waits for an administrator*).

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
switched off). The reader is the anotoki library's `SignInRule`
(`academy_sign_in_rule()` in `backend/src/auth.php`: the IAM's PHP SDK's
reader of before, made the library's code, with the same kept file), not
code of this app: it keeps the answer
for a minute in `backend/storage/cache/` (the app's own folder, as for the
keys: the kept answer is what would open the site to people who are not
signed in, so it never goes into a shared temp folder), asks once when the
minute runs out while other requests use the last value, waits at most 2 s
for the IAM, keeps using the last value while the IAM does not answer (and
does not ask again for a minute), and says **required** whenever nothing
better is known: never read, a 404 (an IAM before 010 has no such address,
so this site needs nothing of the IAM to ship), or an answer that is not one
(not JSON, another site's, a `login_required` that is not a boolean).

This site adds one thing to it (the rule's own hook, read by
`access_login_required()` in `backend/src/access.php` too): **visitors** — people who
study here without signing in, each with their data kept for their browser,
moved into their account when they sign in (*Visitors*, below) — need
migration 007 (`users.visitor_key_hash`, `visitors_ready()` in
`backend/src/visitors.php`), which an ADMIN applies on the Migrations page
like any other. Until the database has it, sign-in is required whatever the IAM
says (the database is asked only when the IAM says sign-in is not needed, so
`/api/auth/config` needs no database otherwise). Anything that goes wrong
while asking is "required" too (and a line in the error log).

`/api/auth/config` (the library's `AuthRoutes::config()`) relays the answer
to the browser as `login_required`, with `visitor_keep_days` (30: how long a
visitor's data is kept after their last visit, for the visitor's notice) and
`sign_in_available` - snake_case since anotoki-lib 0.4.0, the library's one
shape for every site; the browser reads the camelCase of before too - so the
browser never asks the IAM. Who a request without a token is asks it too
(the library's `Identify`, *Visitors*): a request with a token never needs
it, and a request without one may wait for the IAM once a minute (at most 2
s); `Identify` asks it afresh for each request. It is `true` wherever the
IAM requires sign-in (the default, and every site before IAM 010) or the
database has not got 007 yet: everything asks for a token as before. The
browser reads it at its start (*The browser*, below): `true`, or anything
but an explicit `false`, is today's sign-in.

| | Production | Development |
|---|---|---|
| issuer | `https://iam.anotoki.eu` | `http://localhost:4300` |
| redirect URI | `https://japanese.anotoki.eu/auth/callback` | `http://localhost:4400/auth/callback` (the Angular dev server) |
| after sign-out | `https://japanese.anotoki.eu/` | `http://localhost:4400/` |

The IAM registers the development addresses by default. A copy on a computer
signs in through `ng serve` on 4400 (`DEV.md`).

## The server — `backend/src/auth.php`

Who is asking is decided once per request, by the anotoki library's
`Identify`, which every address with somebody's data has in front of it
(never `/api/site-status`, the words, the health check or the clips): on the
addresses that take a visitor too (`study_route()`, the feedback form)
`academy_identify()`, on those that take a signed-in person alone
(`data_route()`, every admin group among them, and `admin_token_checks()`
for the groups that answer while an update waits) `academy_identify_person()`,
the same without step 3 - a visitor's key is never even read there, no table
looked at, so a key there is nobody (until 2026-10-11 the person middleware
read a token alone the same way). In this order:

1. The `Authorization: Bearer …` header (`CGIPassAuth` and a `SetEnvIf` in
   `public/.htaccess` get it to PHP under CGI and FastCGI): a **person**. The
   token is verified **without asking the IAM** by the library's
   `AccessTokens` (`academy_access_tokens()`; the IAM's PHP SDK's rules, which
   this app carried as `src/anotoki_iam.php` 1.1.0 until 2026-10-11): RS256
   signature against the IAM's published keys (cached for an hour in
   `backend/storage/cache/`, not the shared temp folder), `typ at+jwt`,
   issuer, audience `japanese-academy`, expiry. Its `sub` - a decimal
   string - is the user id (the library's `Person`, with the name, the
   address, the roles and `auth_time`). A token that does not verify, or the
   Bearer scheme with no token after it: 401 `Sign in again.`
   (`invalid_token`, `WWW-Authenticate: Bearer realm="japanese-academy",
   error="invalid_token"`; the reason goes to the error log only, on one line
   and clipped to 300 characters: it can quote the token's own header, which
   whoever sent it chose) - and the visitor key is not even read. A `Basic …`
   header is no token.
2. Else, while sign-in is required here: **nobody**, whatever key comes.
3. Else, where a visitor may come, an `X-Visitor-Key`: that **visitor**
   (`visitors_of_key()`, *Visitors* below), or 401 `visitor_unknown`.
4. Else **nobody**.

Then each route says whom it takes, from what `Identify` found and nothing
else: the library's `RequirePerson` for an address that is a signed-in
person's alone (`data_route()`: nobody or a visitor is 401 `Sign in first.`,
code `sign_in_required` - from this computer too: nobody is anybody without
a token), `RequireCaller` for a study address (`study_route()`: a person, a
visitor, or nobody where the IAM lets people in - `make` where a save by
nobody makes a visitor), `RequireRole` for the admin groups (above). The
person middleware (`backend/api/middleware/person.php`) puts the user id on
the request, and `people_seen()` keeps the person's `users` row up to date
(below). Never a fallback to anybody. The page words each refusal from its
code, in the reader's language; the sentences are this app's
(`academy_refusal()`).

Every address with somebody's data needs it: all of `/api/*` and `/report/*`
- the study addresses and the feedback form only while sign-in is required
here (*Visitors*, below)
- except `/api/site-status` (where the site stands, the anotoki library's
`{state, installed}`: answered to anybody in every state, whatever the IAM
says about signing in here; no token or key is looked at, and the browser
sends none), `/api/auth/config` (how to sign in, the library's boot
configuration: `{issuer, client_id, login_required, sign_in_available,
visitor_keep_days}`; it can wait for the IAM once a minute, and asks the database
only when the IAM says sign-in is not needed, above),
`/api/health` (`{ok, contentCurrent}`; to a request straight from this
computer under PHP's built-in server also `database` and `backups`, which
the tests check), `/api/translations/{code}` (the app's own words, the same
for everybody: no token is looked at, a good one or a bad one, so a page
whose sign-in ran out still reads in its language, and the browser sends
none) and the download of a backup (`GET /api/admin/backups/{id}/file?ticket=`:
a browser's navigation sends no token, so the single-use ticket an `ADMIN`
was given a moment before is its check). The audio clips are shared content
and need no sign-in. Unknown addresses stay 404.

`auth_from_this_computer()` decides nobody's sign-in. It decides what this
computer is told and asked: the setup page wants no token from it, and a
failure and `/api/health` say more to it. A request
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
| `users` | `id`: the IAM user id. Also `preferred_username` (from the latest token), `created_at`, `last_seen_at`, `time_zone` (005), `visitor_key_hash` and `visitor_from` (007, a visitor's), `anonymized_at` (010: when the IAM deleted the account) |
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

**The users table** is filled in as requests arrive (`people_seen()` in
`backend/src/people.php`: the library's `PeopleRecorder` on this site's
table, through its mapping - `preferred_username`, `created_at`,
`last_seen_at` - with this site's `time_zone` beside): the first request of a
verified person makes their row, and a request writes it again at most every
five minutes (or when the name in the token or the zone changed). It never
writes the row of an account the IAM deleted (below), and never a visitor's
(`src/visitors.php` alone makes, finds and deletes those). The IAM owns
identity: no passwords, no emails, nothing decided from anything but a
verified token.

### Accounts the IAM deleted — the scrub

The IAM deletes an account thirty days after its owner asks (its migration
016), and lists the ids it deleted to every site
(`GET {issuer}/api/public/anonymized-accounts`). The sites keep the data,
anonymous: each blanks its own copies of who the person was. Here that is the
anotoki library's people module (`academy_people()` in
`backend/src/people.php`; the library's README, "People"):

- **When**: after an answer, at most once an hour across the site (the
  library's `PeopleUpkeep`, a stamp `anotoki-people.stamp` in
  `backend/storage/cache/`; only while the site is ready, never while an
  update waits), on PHP-FPM and LiteSpeed after the connection closed
  (`after_response_add()`), eight seconds at most; or at once from the People
  page's **Check now** (`POST /api/admin/people/sync`, recorded in the audit
  log, `people.synced`). After a restore, at once, once it committed and
  before it answers (the library's `People::afterRestore()`, since
  anotoki-lib 0.5.0 - it replaced this site's `academy_scrub_after_restore()`):
  the restored database may name an account deleted since the backup; a
  scrub that does not finish (the IAM out of reach) is the restore's
  `after_restore_error`, the Backups page's note, and the hour's stamp goes
  after the answer (this site's runner), so the next request tries again. No
  check may run across a restore: one running refuses it ("restore again in
  a minute").
- **What**: for each id, in a transaction of its own, its row held `FOR
  UPDATE`: `users.preferred_username` becomes the IAM's placeholder
  `deleted-<id>` and `users.anonymized_at` the IAM's time (migration 010's
  column), and this site's hook blanks the rest (`people_scrub_copies()`):
  the name typed on their exam papers (`exam_attempts.candidate` empty, the
  attempt's `meta.candidate` gone, and its stored report says "Unnamed
  candidate" where it said the name, as a paper without a name always did),
  the address and the browser of their feedback (the message stays), their
  address on their audit log entries and their names and addresses in the
  details of the entries about them. Only UPDATEs: their kanji progress,
  answers and exam attempts stay, nobody's now. Done again for an id that
  comes again: nothing left to change, nothing changes. A visitor's row is
  never the library's to touch. All of it on the scrub's own connection - a
  restore's, right after it committed - never on `db()` beside it.
- **Where it stands**: the library's tables `anotoki_people_sync` (the
  cursor, when it last asked and went through, the error, how many it
  scrubbed) and `anotoki_people_anonymized` (every id the IAM listed,
  known here or not) - its set `anotoki_people`, after this site's 010. The
  People page says it ("Accounts deleted at the IAM"). The IAM out of reach,
  an answer that is not the IAM's: the run keeps the error and tries again
  next time.
- **Not in the backups**: a backup made before the deletion keeps the person
  as they were until it rotates out (the library keeps the last 14 daily ones,
  5 before an update, 5 before a restore; none is deleted for its age - the
  owner's decision of 2026-10-11, for every anotoki site;
  [decisions.md](decisions.md)) or, for one an `ADMIN` made, until the owner
  deletes it; the app's own JSON copies keep their last 14 as before
  ([hosting.md](hosting.md), *Backups*).

### The People page

The admin panel's **People** (`/admin/people`, `ADMIN`) is the library's page
(`@anotoki/lib/people/page`, wired in `frontend/src/app/core/admin.config.ts`)
on the library's routes (`backend/api/routes/people.php`): everybody signed in
once, the latest seen first, 50 a page, found by a name or an IAM id; for
each their name, IAM id (a link to them in the IAM's admin panel), when they
came first and were last here, and this site's columns (`people_columns()`:
their time zone, the kanji and words they learned, their exam attempts); a
line about the visitors, who are never on the list (how many, the longest
unseen, the limits: `people_visitors()`, the `visitors` of the page's answer
- it replaced `GET /api/admin/visitors`); where the scrub stands, with
**Check now**. **Delete their data** asks only its question (how much goes,
"This is you." for one's own row - the owner's decision: no typed
confirmation), then deletes everything of theirs after a copy of it
(`people_delete()`: `academy-before-delete-user-<id>-…`, their last 14
kept), in the library's transaction (`People::delete()`) holding their row
`FOR UPDATE`, so an answer of theirs on its way waits and then starts their
data afresh (`users_hold()`); the strings they reworded stay, with nobody as
who saved them, and their feedback keeps its words but no longer the
address to answer them at nor their browser (the library's
`Feedback::forgetPeopleOn()`, in the same transaction). Their account is the
IAM's: they may sign in again and start with nothing. Every delete is in the
audit log (`person.data_deleted`), written inside the delete's own
transaction - no delete without it. A restore of a backup made before the
delete does not bring their data back (anotoki-lib 0.5.0,
`People::replay()`): inside the restore's transaction, before anybody sees
its rows, it does the delete again with the same `people_delete()` - on the
restore's own connection, its request null, so no copy is kept for it.

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

**Who a request is**, on the study addresses (`study_route()`: the library's
`Identify`, then its `RequireCaller`, then `learner_middleware()` in
`backend/api/middleware/person.php`), in this order:

1. an `Authorization` header of the **Bearer** scheme, with or without a
   token after it: that person (*The server*, above), or a 401 - a bad or expired
   token never falls back to the key, which is not even read. A `Basic …`
   header (a host behind a password file) claims nobody;
2. else, sign-in required here (`academy_sign_in_rule()`, which also says
   so while 007 is not applied): 401 `sign_in_required`, with a key or
   without - the key is never looked up, counted or swept early, and the
   browser keeps it for when the switch goes off again, or for the move;
3. else an `X-Visitor-Key`: that visitor (`visitors_of_key()`, which
   `Identify` asks); malformed or nobody's (moved,
   swept), and a row that went while the request was on its way (a save's
   `users_hold()`): 401 `visitor_unknown`, never a 500;
4. else **nobody**: user id 0, which matches no row, so every read answers as
   for a learner with no data (the kanji pages, a paper, the attempts), and
   nobody's resets answer at once, writing nothing. A **save** by nobody (a
   lesson, review or practice answer, an item's notes, the settings, a
   submitted exam) makes a visitor, within the limits, in the save's own
   transaction: a save refused (a 4xx) or failed makes nobody and counts
   nothing - a save that is not JSON first of all: 415
   `unsupported_media_type` before anything is read (`request_body()`; a form
   or plain text is what another site's page may send here without asking,
   and it would otherwise save as nobody and make a visitor); done, the answer carries the key in `X-Visitor-Key` (with
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
file (`/api/me/data`), nor anybody else's row - those addresses take only a
token (the library's `RequirePerson`), so a key there is 401 `sign_in_required`. A
visitor has no data file: none to download, no copy before their reset, and
none in the app's own copies (`users_all()` is people only; a restore of
everybody from one deletes the visitors). The library's backups of the whole
database hold every row, a visitor's too, as they hold every table.

**The limits** (`VISITORS_DEFAULTS`; each may be set in
`backend/config/app.local.php`, [hosting.md](hosting.md), *Visitors*): 300
visitors at once, 10 new ones an hour from one address (an IPv6 address by
its /64; Cloudflare's `CF-Connecting-IP` only from Cloudflare's published
ranges, the trusted proxies by default - and, with the origin secret
(`backend/config/cloudflare.local.php`), only on a request that carries it
in `X-Anotoki-Origin` - the library's `ClientAddress`
rule, `src/client_address.php`), 60 an hour in all -
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

The People page lists people only; its line about the visitors (the
`visitors` of `GET /api/admin/people`, ADMIN) says how many there are, the
longest unseen and the limits, and `manage.php --check` counts them. Taking a person's `MEMBER` away in the IAM
blocks their sign-in, not their visiting (*Who may come in*, above).

## The browser — `frontend/src/app/core/auth/`

Since anotoki-lib 0.4.0 (2026-10-11) the browser's half is the anotoki
library's `@anotoki/lib/auth` (`AnotokiAuth`: the session, the callback, the
guards, the interceptor, the screen of a failed sign-in - the IAM's browser
SDK 1.2.0, which this app carried in `core/auth/sdk/` until then, made the
library's code), wired to this app in `core/auth/auth.config.ts` and seen
through this app's own `AuthService` (`core/auth/auth.service.ts`: the
library's states by this app's names, the start's problems, the Sign in
card). The tokens stay where the SDK kept them (localStorage
`anotoki-auth:japanese-academy`, a sign-in on its way in sessionStorage,
refreshes one at a time across tabs): nobody was signed out by the move. The
browser is in step with the server: the IAM only, roles from the token, each
request with the reader's time zone; who is signed in is the person's menu
of the anotoki family's top bar (`frontend/src/app/top-bar/`,
[architecture.md](architecture.md), *The top bar*). The library also brings
the account's **preferences** — the theme, the date order and the clock,
which every anotoki site follows — and saves a change of them, or of the
language, to the account (*The account's preferences*, below).

What `auth.config.ts` gives the library: the boot configuration
(`AuthService.bootConfig()`), this site's API (`/api/` and `/report/`), the
time zone header, the visitor key (`VisitorKey`) and which requests may make
a visitor (`makesVisitor()`), the language (the IAM's pages in the reader's),
this app's database's rewording of the library's words, the checks before a
sign-in and a sign-out (`SignInService`, `SignOutService`: the saves on their
way, below), `/auth/callback` and `/sign-in-failed` - and **no hint**: the
IAM's sign-in hint (the cookie `anotoki_signed_in`) is not read here. The
owner's decision: an automatic sign-in by the hint is the genshin site's and
the build analyzer's alone ([decisions.md](decisions.md)). So a visitor here
is never signed in by itself, and a session here does not follow a sign-out
made at the IAM or on another site at the next page load: it lasts until it
is signed out here, or until the IAM refuses its refresh.

- First of all the start asks where the site stands (the anotoki library's
  `SiteStatus.check()`, `GET /api/site-status`, with no token and no key):
  not set up, or its database out of reach, nothing of the sign-in starts,
  and the library's page says so ("This site is not set up yet", with the
  setup page only while the copy was never installed; "The site is not
  available right now", asking again by itself). Being updated, the start
  goes on as ever, and the library's page stands in front of the pages (*the
  guards*, below).
- `AuthService.init()` runs next (`provideAppInitializer`, `core/boot.ts`):
  the library's `init()`, which asks for the boot configuration -
  `AuthService.bootConfig()`, `GET /api/auth/config` with the reader's time
  zone (`{issuer, client_id, login_required, sign_in_available,
  visitor_keep_days}`, the camelCase of before read too; there is no mode;
  `login_required` is true unless it is an explicit `false`: then nobody
  signed in is a visitor, *Visitors in the browser* below). A 503
  `not_set_up` there tells `SiteStatus` (the settings went since the start
  asked), and the library's page stands in; a server that does not answer,
  or refuses, the problem page with what happened; settings the library
  cannot use, the problem page too. (Then, signed in with a visitor key held,
  the move of what it holds — waited for 5 s at most —, then the language and
  its strings are loaded: `core/boot.ts`, [architecture.md](architecture.md),
  *The app's words*.) Any `not_set_up` answer from this site later stops the
  app the same way (`core/api/not-set-up.interceptor.ts`, the library's
  `siteStatusInterceptor`, and `AuthService.fetch()` for its own calls). Only
  a page load leaves it.
- The library's `init()` also finishes a sign-in coming back from the IAM (on
  `/auth/callback`, the library's `AuthCallbackComponent`: the code
  exchanged, the address the person started from put back) or restores the
  session from `localStorage` (refreshing the access token when it ran out;
  refresh tokens rotate). Only then does the router's first navigation run
  (`AppComponent`), so no screen asks for data before the sign-in is settled.
- **Every page is for somebody signed in** — but Terms, Privacy and Contact,
  and About and Support,
  anybody's, with no guard ([architecture.md](architecture.md), *The legal
  pages*) — the library's guards
  (`app.routes.ts`): `personOrVisitorGuard` as `canActivateChild` on the
  routes around a learner's pages, so each page asks again; `staffGuard` on
  `/admin` (EDITOR or ADMIN; anybody else signed in goes home) and
  `adminGuard` on each of its pages for ADMIN alone. Unless the IAM does not
  require sign-in here (*Visitors in the browser*). Nobody signed in, they
  send the browser straight to the IAM — the IAM's pages in the language read
  here, when one was settled — and the IAM sends it back to the very address
  asked for (`/kanji/reviews?lesson=6` stays that). Nothing of the page is
  drawn meanwhile. The screens that load data on the way (the kanji routes'
  resolver) are behind `whenReady` too, so nothing is asked of the API
  meanwhile. While the app cannot run (not set up, could not start) nothing
  is let through and nobody is sent anywhere: the boot pages are drawn then.
  **While the site is being updated** (`SiteStatus.blocked()`) the guards send
  nobody to the IAM either: they let the page through with nobody signed in,
  and the library's gate draws "The site is being updated" in its place with
  a quiet **Sign in** (`SignInService`, back to that address). A visitor signs
  in only if they choose to; an administrator signs in there, comes back to
  "A database update is waiting" and **Open Migrations**, and applies it —
  the deadlock of before 2026-10-07 (signed out, an administrator could not
  get in at all) is gone.
- **A sign-in that came back without one** — refused, cancelled
  (`access_denied` is also the IAM turning the account away: its `MEMBER`
  taken away here, *Who may come in*), one that could not even start (the
  browser refuses the site's storage) or that cannot be set up: sent straight
  back to the IAM, the browser would go round for ever, so the guards send it
  to `/sign-in-failed` instead, and while the failure stands
  (`AuthService.signInError`, the library's `signInFailure`: its code and
  where it started, never the IAM's sentence) `AppComponent` draws the
  library's screen in the page's place, in the app's frame under its bar
  (`<anotoki-sign-in-failure>` in `#signInFailure`, for a visitor's page the
  same; drawn by the library's `<anotoki-sign-in-failure-route>`, which loads
  the screen's code as it is shown - since anotoki-lib 0.5.0 neither screen
  nor the callback's page is in the first load): "Signing in did not work", why - worded from the code alone - and
  **Try again** (the sign-in once more, back to where it started) and **Back**
  (to that page without signing in: a visitor's page goes on as theirs; where
  sign-in is required the guard then sends the browser to the IAM again; no
  Back for a sign-in that cannot be set up). Its words are the library's
  `anotoki.signIn.*`, in the reader's language, from this app's database
  (written by the library's `anotoki_translations/003`; this app's own three
  keys of before - `signIn.notCompleted`, `signIn.failed`,
  `signIn.signingIn` - went with migration 010, an owner's rewording of them
  copied under the library's keys first); `noindex` while it shows. Signed
  in after all in another tab meanwhile, the failure is put away and the
  page that sign-in started from comes back (`AppComponent`).
- **The Sign in card** (`standin/sign-in/`) is what a page shows when the
  session ends while it is open (a sign-out in another tab, the IAM's idle
  limit, a refresh refused), or when a visitor's site started requiring
  sign-in: `AuthService.showSignIn` is "signed out, no failure to say, and the
  app was shown in this page load". Its **Sign in** comes back to the
  address the page was on. The next navigation goes to the IAM by itself.
  After **Sign out** the IAM sends the browser to `/`, whose guard sends it to
  the IAM's sign-in page (its session is over, so nobody is signed back in).
- **Roles** come from the token: `AuthService.roles` (capitals), `isStaff`
  (EDITOR or ADMIN: the admin panel) and `isAdmin` (ADMIN: Languages, People,
  Feedback, Errors, Audit log, Backups and Migrations; and the admin panel
  starts for an ADMIN while a migration waits, which stops everybody else's
  pages). The guards send anybody else home; they only hide what the server
  refuses (403 `staff_only` / `admin_only`). A token with no role is a
  learner. The person's menu in the top bar offers **Admin panel** to EDITOR
  and ADMIN (and, in the admin panel, **Back to Japanese Academy**), with
  their role as a tag under their name and address. The Backups page's
  **Sign in again** (`AuthService.signInAgain()`, `prompt=login`) gives the
  proof a backup's making, download, delete or restore asks for: a sign-in
  of the last ten minutes.
- **A page is one person's.** The library shares its session with every tab,
  and what a page loaded stays in root services (the kanji state, a paper of
  the exam). So once the app has shown somebody's data, a sign-in of somebody
  else in another tab — also after a sign-out there — makes the page load
  again, as them. Until it has, `AuthService.token()` and `refreshToken()`
  hand out no token of the other person, and both the interceptor and
  `AuthService.fetch()` take their tokens from them, so nothing the page sends
  goes out as theirs: a request made for the page's person with no token to
  send is not sent at all (a 401 `sign_in_required` of its own, and the Sign
  in card) — never without a token, where the server could take it for a
  visitor's. The same person again, or a token refreshed, changes nothing; a
  page that loaded signed out has shown nobody's data, and simply starts.
- **The interceptor** (the library's `anotokiAuthInterceptor`, in
  `app.config.ts`) adds the access token and `X-Time-Zone` (the browser's IANA
  zone, `Intl.DateTimeFormat().resolvedOptions().timeZone`,
  `core/time-zone.ts`; nothing when the browser names none) to every
  HttpClient request to this site's `/api/…` and `/report/…` — to its own
  origin only, whatever address it is given — and to nothing else — on a
  person's request; a visitor's goes with the visitor key instead (*Visitors
  in the browser*). Whose a request is, is decided as it is issued (the
  library's `issuedAs()`, or else what the page is shown as), never from
  whether a token happens to be there when it leaves. A 401 to a token the
  library thought good gets one fresh token and one retry, for the same
  person only: a fresh token of somebody who signed in in another tab
  meanwhile is not sent with a request this page made (the page loads again
  as them, above). When the IAM gives none, the session is over and the Sign
  in card takes over. `AuthService.fetch()` (the library's `fetch()`) does the
  same for the few plain `fetch()` calls (the reports, the data file): this
  site only, the zone, the page's own person's token, one retry for the same
  person; a 503 there tells `SiteStatus`. The two public reads name the zone
  too (`/api/auth/config`, and the app's words, `/api/translations/{code}`,
  which go without a token and do not depend on it): every request to this
  site's API carries it. The server counts the learner's days and review
  hours in that zone ([kanji-srs.md](kanji-srs.md)); the pages never count
  days themselves — the dashboard names the server's forecast days by the
  dates the server says they stand for (`forecastDates`).
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
  (The Backups page's download is no such link: it asks for a single-use
  ticket with the token, and then the browser follows the ticket's address.)
- **Signing out waits for what is on its way** (`sign-out.service.ts`, the
  library's `beforeSignOut`, and `core/saves-in-flight.service.ts`). A
  lesson's, a review's and practice's answers are saved in the background, a
  note a moment after the typing stops, and an exam paper when it is handed
  in; each tells `SavesInFlight`, which the top bar can reach where it cannot
  reach them. Sign out sends a note still waiting at once, waits for every
  save on its way (the button: a spinner and "Saving…"), and asks first, in
  the learner's language (the kit's question - "Sign out anyway?", the
  sentence under it saying what goes, Cancel or Sign out - worded as it is
  raised; the browser's own dialog until 2026-10-18),
  when one of them failed (`signOut.notSaved`), when a lesson or review still
  holds an answer whose save failed earlier — the session says that only on
  its summary, which is not drawn yet, so it reports it (`watch()`, the same
  question, asked once) — or when an exam paper is open and not handed in
  (`signOut.examOpen`). Then the IAM ends the session everywhere. The admin
  area's unsaved strings are the anotoki library's `LocalizationDrafts`' to
  ask about (the browser's "Leave site?" as the page goes); they are kept
  through the sign-out for the same person.

The person's menu (the round button with their initial; their name beside it
from 961 px - 1530 px in the admin panel, whose bar carries eight links -, in
the phone's menu up to 760 px - 1170 px in the admin panel) uses the colour
tokens (`--shadow` among them). Its items: their name, address and role,
**Your anotoki account** (the IAM's account page, a new tab), **Admin
panel**, **Sign out**. Signed out with the Sign in card or the failure's
screen on the page, or visiting, the bar has **Sign in** instead
(`SignInService`: in the reader's language, as the card's button; from a
visitor's page after the saves on their way, below). Like the whole bar it
keeps its keys to itself, so Enter on Sign out never submits a card or hands
a paper in behind it.

### The account's preferences

The owner's decision for the whole anotoki family (2026-10-06, the IAM's
migration 015; [decisions.md](decisions.md)): the theme, how dates are
written and the clock are the account's, like its language — one choice every
anotoki site follows, on every page, the admin panel included. The IAM sends
them in the tokens (`preferences`, with the `profile` scope this site asks
for), and the library hands them over with who is signed in:
`{theme: 'auto'|'light'|'dark', date_format: 'dmy_dot'|'dmy_slash'|'mdy_slash'|'ymd_dash'|null, time_format: '24'|'12'|null}`.

- `AuthService.preferences` is that, while the page is a signed-in person's
  (state `ready`), and `null` otherwise: nobody signed in, a visitor, an IAM
  before its migration 015 or a sign-in without `profile` (a session kept
  by an older copy reads as none). `null` means this site's own
  settings, exactly as before, and nothing is saved to the account (the IAM
  would refuse: 503 while 015 waits). Every change the library hears of — a
  refresh, a save here or in another tab — is read again.
- `AuthService.savePreferences(changes)` saves what the person chose with this
  site's own controls (`{theme}`, `{language}`; the library also takes
  `date_format` and `time_format`, which no control here sets) through the
  library's `savePreferences()` (`POST {issuer}/api/oidc/preferences`, the access
  token as the proof). Only for the person the page is shown to: a page that
  is nobody's, or whose session is somebody else's now (signed in in
  another tab), gets `login_required` and nothing is sent. The library takes
  that person in the same turn and sends their own token and no other — a
  sign-in of somebody else that another tab brings meanwhile is
  `login_required` too. One save at a time, whoever asks (the theme, the
  language): each answer is the whole account, and one arriving after a
  later save's would put back what that save changed, so a save waits for
  the one before it to settle. It resolves once the library has put the account
  as it now stands into `user()`, in every tab; it rejects with the IAM's or
  the library's code (`invalid_request`, `access_denied`, `network`, …).
- **The theme** (the anotoki library's `ThemeService`, wired in
  `core/kit.config.ts`; since anotoki-lib 0.2.0): signed in, the account's
  is shown at sign-in and whenever it changes (its `auto` is the switch's
  "System", the app's word under the library's `anotoki.theme.auto`), but not while a choice made here is being
  saved; a choice shows at once and is saved, one save at a time and the
  latest last; a refusal puts the account's theme back and a note under the
  switch says so, the library's `anotoki.theme.notSaved` (since anotoki-lib
  0.3.0; before, the app worded the refusal's reason). The theme shown is
  always written to `academy-theme` (nothing for the system's), so the
  library's `theme-boot.js` (copied into the build by `angular.json`) paints
  it first next time.
- **Dates and clocks** (`core/format.ts`, the `localDate` pipe, the admin
  panel's moments): the account's `date_format` and `time_format` win over
  the language's way when chosen, through `TimeWording`'s `dateFormat()`
  and `timeFormat()` (`core/i18n/time-wording.ts`; [architecture.md](architecture.md), *The app's words*).
- **The language**, as the survey site has it: the account's language comes
  before this device's remembered choice — only this tab's `?lang=` and a
  choice made on this page come before it — and a change of it made
  elsewhere is followed when it comes, but not over `?lang=` and not while a
  choice made here is on its way to the account
  ([architecture.md](architecture.md), *The app's words*). The chooser's
  choice of a signed-in person goes to the account (`{language}`), one save
  at a time and the latest last, and holds for the visit whatever the
  account answers; a language the IAM does not offer (`invalid_request`)
  stays this site's own for the visit, silently; any other refusal says so in
  a note under the switcher (the library's `anotoki.language.notSaved`).
- A visitor, and anybody signed out, keeps each device's choices as before;
  the account's take over at sign-in. Signed in through an IAM that sends no
  preferences, everything is as before too — the device's language choice
  before the token's `locale`.

The server does not read the claim. The one date it writes for a person, in
the exam report, is part of a page stored once when the paper is handed in
(English, in the server's own locale) and shown as it was saved; it stays so
until the owner says otherwise ([decisions.md](decisions.md)).

### Visitors in the browser

Where `/api/auth/config` says `login_required: false` (the IAM's switch off,
and migration 007 applied), nobody signed in is a **visitor**: the
`AuthService` state `visiting`, the app itself (the family's design 4.3,
built 2026-10-05).

- **The pages.** The library's `personOrVisitorGuard` lets every page of a
  learner's through, with no trip to the IAM; `whenReady` is
  `AuthService.usable()` (signed in or visiting). The admin panel never is a
  visitor's: `/admin` (the Migrations page too) is behind `staffGuard`, which
  sends a visitor to the IAM and back as it sends somebody signed out — or to
  the failure's screen, when this page load's sign-in came back without one
  (sent again, the browser would go round for ever). Your data (the file of one's own data) is a signed-in person's only:
  not on a visitor's home page, nor its link at the dashboard's foot. The top
  bar has Kanji and Exam, and **Sign in** where the person's menu would be.
- **The notice** (`home/visitor-notice/`, at the top of the home page and the
  kanji dashboard): "You are studying without signing in. What you study is
  kept for this browser for {count} days after your last visit. Sign in to
  keep it in your account." (`visitor.notice`, a plural family; the days are
  the server's `visitor_keep_days`), with **Sign in**. Once, after a key the
  server no longer knew was forgotten: `visitor.lost`. Once, after a move:
  `visitor.moved` (how many kanji and words, how many exam attempts) and
  `visitor.movedKept` (how many the account had already: its own progress
  stays). Each closes.
- **A sign-in that came back without one** while visiting (refused,
  cancelled: `access_denied` is also the IAM turning the account away — its
  `MEMBER` taken away here, *Who may come in*) is said by the library's
  screen in the page's place (*The browser*, above) until its **Back**, which
  gives the visitor the page again: never swallowed. (Until 2026-10-11 the app
  said it above the page, in the Sign in card's words.)
- **Whose a request is** (the library's interceptor) is decided as it is issued:
  a page shown to a visitor issues visitor's requests, any other page with a
  sign-in a person's (a person's page whose session ended is a person's still:
  never sent without a token, never turned into a visitor's — it gets the
  Sign in card). A visitor's request carries `X-Visitor-Key` — the key this
  browser holds now (`core/auth/visitor-key.ts`, the library's
  `VisitorKeyStore`: localStorage
  `japanese-academy-visitor`, read as the request leaves, kept in step with
  other tabs by the `storage` event) — and never a token, only while sign-in
  is not required. With no key, the first save that may make a visitor (a
  lesson, review or practice answer, an item's notes, the settings, an exam
  handed in: `makesVisitor()` in `core/auth/auth.config.ts`) goes alone; whatever is issued meanwhile (reads
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
  switch turned on since the page loaded): the library notes it
  (`noteSignInRequired()`) — the Sign in card from then on — and the key is **kept**, never sent while
  sign-in is required, so the sign-in still moves what it holds, and the
  switch turned off again within the days brings it back.
- **Signing in from a visitor's page** (`core/auth/sign-in.service.ts`, the
  library's `beforeSignIn`: the bar's Sign in and the notice's) first does what signing out does: a note
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
  /api/visitor/move` with the token and the key (the library's
  `CARRIES_VISITOR_KEY`: the one request with both), one at a time. A 200 forgets the key (compare and
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

No test asks an IAM. The tests have one of their own - the anotoki library's
(`Anotoki\Lib\Auth\Testing`, in `backend/vendor/anotoki/lib/backend/testing/` and
`src/Auth/Testing/`):

- PHP (`backend/tests/lib.php`): `test_iam()` is the library's `TestIam` - a
  key pair made for the test file in a folder of its own, its public half the
  key set every test setting names (`auth.jwks_file`, issuer
  `https://iam.test`, which exists nowhere), so every server a test starts
  signs people in as a website does; `test_token($id, $roles, $claims, $typ)`
  signs whatever a test needs with it — good tokens, expired ones, ones for
  another app, ID tokens (`null` in `$claims` takes a claim out); no role is
  a learner. `call()` sends a token of `TEST_USER` (1, no role) unless the
  test sends its own or none (`no_token()`). A keys file counts for a
  throwaway database only (`auth_jwks_file()`, `backend/src/auth.php`): for
  any other, a line in `auth.local.php` naming one is ignored, so a copy's
  sign-in can never rest on a file instead of the IAM. Whether sign-in is
  required comes from a file of the test's too (`test_access(true|false|null)`,
  `auth.application_file`; none: the IAM out of reach, so required), and so do
  the accounts the IAM deleted (`test_anonymized([id => when] | null)`,
  `auth.anonymized_file`; none: the IAM out of reach for them), the answer's
  lifetime and the cache folder (`auth.application_ttl`, `auth.cache_dir`):
  the same rule, a throwaway database only (`auth_iam_config()`; a built site
  of the tests takes the file from `ACADEMY_APPLICATION_FILE`). A server of
  the tests never runs the scrub or the library's day's backup by itself
  (`test_config_write()` writes both stamps as done for the day); a test of
  either removes its stamp.
- The stand-in IAM is the library's
  (`backend/vendor/anotoki/lib/backend/testing/stand-in-iam.php`, the router of
  PHP's built-in server, the family's one since 0.4.0 - this app's own
  `backend/tests/tools/stand-in-iam.php` went with the move): its discovery
  document and keys for the setup page's **Test connection**, the public
  answer whether a site requires sign-in (`GET
  /api/public/applications/{client_id}`: its state's `login_required`,
  default true; `application_missing` a 404; `down` a 503), the deleted
  accounts (`GET /api/public/anonymized-accounts`: its state's `anonymized`),
  and, with the test IAM's key pair (`STAND_IN_DIR`, `key.json` as `TestIam`
  writes it), the whole sign-in by redirect: authorize (signs the configured
  person in at once - here by default user 1, `owner`, with `MEMBER`, a
  learner - or answers `access_denied` when told to `deny`), token (a code
  with PKCE, a refresh with rotation), logout, revoke, preferences. Its
  state's `log` lists every request, so a test can count how often it was
  asked. `stand_in_iam()` in `lib.php` starts one; `tests/api/auth.test.php`
  signs in through it end to end, `tests/api/access.test.php` switches
  sign-in on and off through it, and `tests/api/people-migration.test.php`
  and `admin-tools.test.php` ask it for the deleted accounts.
- Node (`frontend/e2e/helpers.js`): `startApp()` starts the library's
  stand-in IAM on a free port of this computer (with the run's key pair,
  `STAND_IN_DIR`, and no sign-in hint) and names it the issuer of every server
  it starts (`testdb.php config DIR NAME JWKS BACKUPS FRONTEND ISSUER
  [APPLICATION_TTL]`), so a browser signs in exactly as on a website: a page
  opened signed out goes to the stand-in, which signs in whom
  `iamState({ user })` named (or refuses with `deny`), and comes back.
  `iamToken()` (made by `backend/tests/tools/iam.php` with the same key, the
  library's `TestIam`) signs the suites' own API calls (`app.api(url,
  person)`), `iamSession()` / `plant()` put a whole session in a browser
  context before its pages load (under the library's storage keys); their
  people hold `MEMBER` (alone: a learner), as every account does. A suite
  that switches sign-in starts its server with `startApp({ applicationTtl: 1
  })` (the IAM's answer kept a second) and calls `app.signInRequired(false |
  true)`, which tells the stand-in and waits until `/api/auth/config` relays
  it. `run.js` checks the redirect (nothing drawn or asked for on the way), a
  refused sign-in (the library's screen, Try again), the token and the zone
  going only to this site, sign-out through the IAM's logout, and other tabs
  - the admin panel by role with the library's pages (People and its delete,
  feedback sent from the footer and read, the error log, the audit log, a
  backup made) - and, with sign-in not required, the visitors from end to
  end: no trip to the IAM, the notice, `/admin` still through the IAM
  (refused there: the library's screen in the visitor's page, and its Back),
  one visitor and one key for a lesson batch, an exam and its report, Sign in
  straight after a batch's last answer (it waits; everything moves, the note
  says what), a fresh visitor's page after signing out, and sign-in switched
  on with a key held (to the IAM; the sign-in moves it). `screens.js` shoots a
  visitor's home, the failure's screen, the feedback form and the admin
  tools' pages, and measures the bar with Sign in while visiting; `setup.js`
  signs in on a set-up copy, this computer's and a website's.
- The Angular unit tests check this app's side of the library: `AuthService`
  over the library with a stand-in client (`core/testing/auth-states.ts`, the
  library's `@anotoki/lib/auth/testing`): the start's boot configuration
  with the time zone, `visitor_keep_days` and its camelCase of before, not
  set up, a server that does not answer, one that names no IAM; the Sign in
  card for a session that ended; somebody else signing in in another tab; a
  failure's code for the library's screen; `fetch()` as a person's and as a
  visitor's (`auth.service.spec.ts`). `app.routes.spec.ts` checks the
  library's guards on the routes (to the IAM and back to the address, the
  failure's screen instead of round to the IAM, a visitor's pages, the admin
  split by role, the old addresses), `app.component.spec.ts` what the page
  draws in each state (the library's failure screen, its Back for a
  visitor, a failure put away by a sign-in in another tab),
  `sign-in.component.spec.ts` the Sign in card, `sign-out.service.spec.ts`
  the waiting and the questions. The library tests its own half - the
  client, the interceptor, the guards, the screens - in its repository.

See [testing.md](testing.md) for what each suite pins down, and
[hosting.md](hosting.md) for running it as a website.
