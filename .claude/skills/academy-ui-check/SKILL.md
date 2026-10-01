---
name: academy-ui-check
description: Visually check the Japanese Academy screens. Screenshot every main screen in light, dark and phone layouts, open the PNGs and go through a checklist. Use after editing anything in frontend/ (templates, styles, components) or the setup page, or when the owner reports something looks wrong.
---

# Checking the UI

## 1. Take the screenshots

```bash
npm run screens              # from the repository root
npm run screens -- kanji     # only screens whose name contains "kanji"
npm run screens -- room      # only the top bar, measured at 360-560 px
npm run test:setup           # the setup page and the "not set up" page, light/dark/phone
```

The script builds the app when its sources changed, runs the real server on a
throwaway database serving that build, and seeds some progress, so every
screen has content: 一, 二, 大, 学 and 大学 are learned, and 大 and 学 are due.
The account menu, the Sign in page and the two owner pages come from a second
server with sign-in (auth mode `iam`, the test IAM), where a person with the
same progress is signed in. It then drives Edge and writes
`frontend/e2e/shots/screen-<name>-<variant>.png`, the variants `light`,
`dark`, `phone` (English) and `sk-phone`, `sk-phone-dark` (390 px, a Slovak
browser: the Slovak pass), then the room (`room-*.png`: the signed-in Slovak
top bar at 360 and 390 px).

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
| the Sign in page (signed out, a website) | `signed-out` |
| the account menu, open over the kanji dashboard (signed in) | `account-menu` |
| the owner's Translations page (English) | `owner-translations` |
| the owner's Languages page (English) | `owner-languages` |

`npm run test:browser` adds shots of its own (`dashboard-empty.png`,
`quiz-wrong.png`, `review.png`, `review-summary.png`, `changelog.png`,
`signed-out.png`, `account-menu.png`), and `npm run test:setup`
`setup-not-set-up-*`, `setup-page-*`, `setup-page-website-*` (light, dark,
phone), `setup-tested.png`, `setup-done.png` and `setup-website-signin.png`.

It fails on horizontal overflow, a page error, an error or warning the app
logged (a key with no string warns) or a failed request; on a Slovak page
that is not `<html lang="sk">`, shows a key, or leaves an English string of
the app outside `[lang=en]` / `[lang=ja]`; on a kanji tab strip that scrolls;
and on a top bar whose pieces overlap, leave the screen or are cut short.
That catches layout breaks, but not ugliness or clumsy Slovak, so look at the
images as well.

For flows (typing answers, sessions, exam keys) run `npm run test:browser` as
well.

## 2. Look at them

Open every screen the change could affect with the Read tool, in all five
variants. Always include the phone shots. Go through this list:

- **Layout.** Nothing overlaps, is cut off or is misaligned. Spacing matches the
  neighbouring elements. Cards and grids wrap cleanly.
- **Phone (390 px).** No sideways scroll. Buttons are at least ~40 px tall.
  Long English meanings and long Japanese words wrap instead of clipping. The
  nav still fits. (A full-page shot switches Edge's touch emulation off, so
  the phone shots of taller pages show buttons at their mouse size: the
  footer's version and the dialog's Close grow to 44 px only for a finger.
  Measure those with `locator.boundingBox()` in a fresh phone context;
  `docs/kb/environment.md`.)
- **Dark mode.** Text, links, chips, stage colours and the kanji (`--kanji`) and
  vocabulary (`--vocab`) tiles are all readable. No white boxes left from
  light-mode colours. Bars and badges can still be told apart.
- **Japanese text.** It renders (no boxes or tofu). The kanji are large enough
  to read the strokes, and readings sit where they belong.
- **Language.** No key on a page (`home.intro` where a sentence should be;
  the owner pages list keys on purpose). No English left on a Slovak page,
  and no Slovak on an English one — but the material (meanings, the exam's
  questions and options), the SRS stage names, the grammar terms and the
  brand stay as they are, marked `lang="en"` / `lang="ja"`, and the two owner
  pages are English. Numbers and dates in the language on the page, never
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
- **Sign-in.** Without sign-in nothing about sign-in shows: no account menu
  and no Sign in page (the chooser shows, and the owner's Translations link
  sits at the foot of the home page).
  The Sign in page is plain: the name, one short sentence, one button, and no
  empty error line. The account menu fits the top bar at 390 px next to Kanji
  (with its due badge) and Exam — only the avatar there, the name beside it on
  wider screens — and opens inside the screen, above the page, readable in dark
  mode (its shadow is the `--shadow` token).
- **The version.** It sits beside the name in the top bar, its dot while the
  news is unread; the "What's new" dialog is readable in both themes and at
  390 px, in both languages (its entries stay English).
- **The top bar.** Kanji and Exam only while the app can be used: none on the
  Sign in, "not set up yet" and problem pages. The language chooser beside
  the version, in every state ("EN" / "SK"), and its menu inside the screen.
  At 440 px and below "Academy" gives way; at 360 px everything still fits
  (the room measures it). The five kanji tabs fit 390 px in Slovak.
- **The setup page.** Stands alone (its own small stylesheet, the app's
  colours, light and dark — the radios, the select and "Choose File" in the
  same theme): the fields in two columns on wide screens and one on a phone,
  the Test connection results in green or red, no overflow; a website's shows
  nothing of what is set before the token.
- **Consistency.** Same buttons, colours and headings as the other screens.
  Use only colour tokens from `frontend/src/styles/_tokens.scss`.

## 3. Report

For each problem, give the screenshot file, what is wrong, where it comes from
(file and selector, if you found it) and the fix you'd make. Say which screens
you checked and that the rest looked right. Don't just say "looks fine": name
what you verified.
