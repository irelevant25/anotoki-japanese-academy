---
name: academy-ui-check
description: Visually check the Japanese Academy screens. Screenshot every main screen in light, dark and phone layouts, open the PNGs and go through a checklist. Use after editing anything in frontend/ (templates, styles, components) or the setup page, or when the owner reports something looks wrong.
---

# Checking the UI

## 1. Take the screenshots

```bash
node frontend/scripts/ensure-build.mjs   # from the repository's top folder: builds when the sources changed
node frontend/e2e/screens.js             # every screen, then the room (~10 min)
node frontend/e2e/screens.js kanji       # only screens whose name contains "kanji"
node frontend/e2e/screens.js room        # only the top bar: measured at 360-1280 px, and its menus
node frontend/e2e/setup.js               # the setup page and the anotoki library's "not set up" page, light/dark/phone
```

The script runs the real server (`backend/router.php`) on a throwaway
database serving that build, with the tests' stand-in IAM as its issuer
(`frontend/e2e/helpers.js`), and seeds some progress, so every screen has
content: 一, 二, 大, 学 and 大学 are learned, and 大 and 学 are due. The person
on the screens is an ADMIN (a session planted in the browser), so the admin
area is shot too; the Sign in card is a refused sign-in's. It then drives
Edge and writes `frontend/e2e/shots/screen-<name>-<variant>.png`, the
variants `light`, `dark`, `phone` (English) and `sk-phone`, `sk-phone-dark`
(390 px, a Slovak browser: the Slovak pass; the admin panel stays English).

| Screen | Name |
|---|---|
| home | `home` |
| kanji dashboard | `kanji-dashboard` |
| lessons picker | `kanji-lessons` |
| a lesson | `kanji-lesson-screen` |
| review session | `kanji-review` |
| a review answered wrongly, the item info open | `kanji-review-answered` |
| practice setup | `kanji-practice` |
| browse | `kanji-browse` |
| item page (大) | `kanji-item` |
| exam setup | `exam` |
| an exam question | `exam-question` |
| an exam result | `exam-result` |
| what's new (the changelog) | `changelog` |
| Your data's question before a file replaces the data | `your-data-question` |
| the bar's menu open over the kanji dashboard (the person's; on a phone the one menu) | `bar-menu` |
| the Sign in card (a refused sign-in) | `signed-out` |
| a visitor's home (sign-in not required, nobody signed in): the notice and its Sign in | `home-visitor` |
| the admin panel's Translations page (English) | `admin-translations` |
| the admin panel's Languages page (English) | `admin-languages` |
| the admin panel's People page (English) | `admin-people` |
| the admin panel's Migrations page (English, the anotoki library's): pending and applied, Apply | `admin-migrations` |
| a database update waiting, as a learner reads it: the anotoki library's "The site is being updated" | `update-waiting` |
| a database update waiting, as the site's ADMIN reads it: "A database update is waiting", Open Migrations | `update-waiting-admin` |

Then **the room**: the top bar at 360, 390, 760, 761, 960, 961 and 1280 px,
English and Slovak, light and dark — signed in with a 20-character name and
999 reviews due, signed out (the card), visiting (sign-in not required: the
links and Sign in, no person's button) and the admin panel — measured and
shot (`bar-<signed-in|signed-out|visiting|admin>-<en|sk>-<width>-<light|dark>.png`,
the top 140 px), and the menus open (`menu-<lang>-<width>-<light|dark>.png`)
with a real Tab and Shift+Tab from an item.

`node frontend/e2e/run.js` adds shots of its own (`dashboard-empty.png`,
`quiz-wrong.png`, `review.png`, `review-summary.png`, `changelog.png`,
`signed-out.png`, `your-data-question.png`, `account-menu.png`,
`admin-translations.png`, `admin-people.png`, and a migration waiting:
`waiting-visitor.png`, `waiting-learner.png`, `waiting-admin.png`,
`admin-migrations-waiting.png`, `admin-migrations-failed.png`,
`admin-migrations.png`, and a visitor's:
`home-visitor.png`, `home-visitor-sk-phone.png`), and `node
frontend/e2e/setup.js` `setup-not-set-up-*`, `setup-page-*`,
`setup-page-website-*` (light, dark, phone), `setup-tested.png`,
`setup-done.png`, `setup-website-app.png` and
`setup-website-not-available.png`.

It fails on horizontal overflow, a page error, an error or warning the app
logged (a key with no string warns) or a failed request; on text that looks
like a key anywhere (`yourData.title`); on a Slovak page that is not `<html
lang="sk">`, or leaves an English string of the app outside `[lang=en]` /
`[lang=ja]`; on a kanji tab strip that scrolls; on what the reviews found by
eye (`looks()`): People's zone broken over lines or a Delete data cut at the
table's edge, the What's new dot not beside its words, Your data's question
with the focus anywhere but Keep mine (or without the accent's ring), and in
dark the anotoki mark without its light halo; on a top bar that is not one
row in order, whose pieces overlap or leave the screen, a phone's without
its menu button and the due count on it, a desktop's without its links and
the person's button (the name from 961 px); and on a menu that a real Tab
leaves with the focus anywhere but its button. That catches layout breaks,
but not ugliness or clumsy Slovak, so look at the images as well.

For flows (typing answers, sessions, exam keys, the bar's keys over a review
and a paper, Your data, sign-out, the admin panel by role, time zones) run
`node frontend/e2e/run.js` as well.

## 2. Look at them

Open every screen the change could affect with the Read tool, in all five
variants. Always include the phone shots. Go through this list:

- **Layout.** Nothing overlaps, is cut off or is misaligned. Spacing matches the
  neighbouring elements. Cards and grids wrap cleanly.
- **Phone (390 px).** No sideways scroll. Buttons are at least ~40 px tall.
  Long English meanings and long Japanese words wrap instead of clipping. The
  nav still fits. (A full-page shot switches Edge's touch emulation off, so
  the phone shots of taller pages show buttons at their mouse size: the
  footer's version, the dialog's Close and a visitor's buttons (the notice's
  Sign in, the lost and moved notes' Close, the refused sign-in's Close) grow
  to 44 px only for a finger. Measure those with `locator.boundingBox()` in a
  fresh phone context; `docs/kb/environment.md`.)
- **Dark mode.** Text, links, chips, stage colours and the kanji (`--kanji`) and
  vocabulary (`--vocab`) tiles are all readable. No white boxes left from
  light-mode colours. Bars and badges can still be told apart. A button
  focused by the keys shows the accent's ring (2 px, 2 px away), not only the
  browser's own dark ring, which all but vanishes in dark.
- **Japanese text.** It renders (no boxes or tofu). The kanji are large enough
  to read the strokes, and readings sit where they belong.
- **Language.** No key on a page (`home.intro` where a sentence should be;
  the admin panel lists keys on purpose). No English left on a Slovak page,
  and no Slovak on an English one — but the material (meanings, the exam's
  questions and options), the SRS stage names, the grammar terms and the
  brand stay as they are, marked `lang="en"` / `lang="ja"`, and the admin
  area is English (its bar too). Numbers and dates in the language on the page, never
  the system's: English "24 Sept 2026", "11,523", "Thu"; Slovak
  "24. 9. 2026", "11 523", "št". Plurals read naturally in both ("1 review",
  "2 opakovania čakajú", "90 opakovaní čaká"; no "attempt(s)"), and the
  Slovak reads as informal "ty". Spaces between words that sit in different
  elements are there (Angular drops whitespace-only text between elements; a
  template keeps one with `&ngsp;`). The browser's own controls (a file
  picker's "Choose File", the OK of a native dialog) follow the browser's
  language: the app cannot word them.
- **States.** Empty states say what to do next. Counts on the dashboard agree
  with the seeded data: 5 learned, 2 due.
- **Sign-in.** A signed-out page goes straight to the IAM; the Sign in card
  shows only after a failed sign-in (or a session that ended): plain — the
  name, one short sentence, one button, no empty error line — with **Sign in**
  in the top bar too (in its menu on a phone). Where sign-in is not required,
  a visitor's page instead: the notice at the top (the days, one Sign in), the
  links in the bar and Sign in beside them (in the menu on a phone, which
  stays open with "Saving…" while the saves on their way are waited for), no
  person's menu, no Your data; a refused sign-in said above the page, with
  room of its own under it (16 px above a kanji page's tab strip).
- **The foot.** The version and **What's new** at the foot of every page, its
  dot while the news is unread; the dialog is readable in both themes and at
  390 px, in both languages (its entries stay English).
- **The top bar** (the anotoki family's: `docs/kb/architecture.md`, *The top
  bar*). One row: the mark, "anotoki" and "Japanese" (on a phone "Japanese"
  alone), Kanji (the reviews due) and Exam only while the app can be used,
  the language (not in the admin panel), the theme switch, the person's round
  button (their name beside it from 961 px) or Sign in. Up to 760 px one menu
  button instead of the links and the person, the reviews due on its corner;
  its menu and the person's open inside the screen, above the page, readable
  in dark mode (`--shadow`), the page's own link marked. In the admin panel
  the area's links (Translations; Languages and People for ADMIN), English.
  Nothing overlaps, leaves the screen or is cut at 360, 390, 760, 761, 960,
  961 and 1280 px, in English and Slovak, with a three-digit due count.
  The five kanji tabs fit 390 px in Slovak.
- **The setup page.** Stands alone (its own small stylesheet, the app's
  colours, light and dark): the database and the IAM only, the fields in two columns on
  wide screens and one on a phone, the Test connection results in green or
  red, no overflow; a website's shows nothing of what is saved, before the
  token or after it.
- **The admin panel's People page** at 390 px: the table scrolls sideways in
  its own box (`.scroll`), never the page.
- **Consistency.** Same buttons, colours and headings as the other screens.
  Use only colour tokens from `frontend/src/styles/_tokens.scss`.

## 3. Report

For each problem, give the screenshot file, what is wrong, where it comes from
(file and selector, if you found it) and the fix you'd make. Say which screens
you checked and that the rest looked right. Don't just say "looks fine": name
what you verified.
