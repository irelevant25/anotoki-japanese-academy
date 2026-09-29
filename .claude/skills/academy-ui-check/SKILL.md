---
name: academy-ui-check
description: Visually check the Japanese Academy screens. Screenshot every main screen in light, dark and phone layouts, open the PNGs and go through a checklist. Use after editing anything in frontend/ (templates, styles, components) or the setup page, or when the owner reports something looks wrong.
---

# Checking the UI

## 1. Take the screenshots

```bash
npm run screens              # from the repository root
npm run screens -- kanji     # only screens whose name contains "kanji"
npm run test:setup           # the setup page and the "not set up" page, light/dark/phone
```

The script builds the app when its sources changed, runs the real server on a
throwaway database serving that build, and seeds some progress, so every
screen has content: 一, 二, 大, 学 and 大学 are learned, and 大 and 学 are due.
The last two screens come from a second server with sign-in (auth mode `iam`,
the test IAM), where a person with the same progress is signed in. It then
drives Edge and writes
`frontend/e2e/shots/screen-<name>-<light|dark|phone>.png`.

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

`npm run test:browser` adds shots of its own (`dashboard-empty.png`,
`quiz-wrong.png`, `review.png`, `review-summary.png`, `changelog.png`,
`signed-out.png`, `account-menu.png`), and `npm run test:setup`
`setup-not-set-up-*`, `setup-page-*`, `setup-page-website-*` (light, dark,
phone), `setup-tested.png`, `setup-done.png` and `setup-website-signin.png`.

It fails on horizontal overflow, a page error, an error the app logged or a
failed request. That catches layout breaks, but not ugliness, so look at the
images as well.

For flows (typing answers, sessions, exam keys) run `npm run test:browser` as
well.

## 2. Look at them

Open every screen the change could affect with the Read tool, in all three
variants. Always include the phone shot. Go through this list:

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
- **Language.** All English, with no Slovak dates or weekdays (for example
  "pi", "so", "ne"). Numbers and numeric dates follow the system locale on
  purpose ("11 481", "22. 9. 2026"; see `docs/kb/decisions.md`). Plurals read
  naturally ("1 review", not "1 reviews", and no "attempt(s)": `plural()` in
  `core/format.ts`). Spaces between words that sit in different elements
  are there (Angular drops whitespace-only text between elements; a template
  keeps one with `&ngsp;`).
- **States.** Empty states say what to do next. Counts on the dashboard agree
  with the seeded data: 5 learned, 2 due.
- **Sign-in.** Without sign-in there is no account menu and no Sign in page.
  The Sign in page is plain: the name, one short sentence, one button, and no
  empty error line. The account menu fits the top bar at 390 px next to Kanji
  (with its due badge) and Exam — only the avatar there, the name beside it on
  wider screens — and opens inside the screen, above the page, readable in dark
  mode (its shadow is the `--shadow` token).
- **The foot.** The version sits at the foot of every page — at the bottom
  edge of the window when the page is short —, its dot while the news is
  unread; the "What's new" dialog is readable in both themes and at 390 px.
- **The top bar.** Kanji and Exam only while the app can be used: none on the
  Sign in, "not set up yet" and problem pages.
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
