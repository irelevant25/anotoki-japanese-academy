# Japanese Academy — knowledge base

Reference for anyone (human or Claude) changing this project. `CLAUDE.md` holds
the always-on rules, `DEV.md` the setup for working on it; these pages
hold the detail. Read the page for an area before changing it.

| Page | Read it when |
|---|---|
| [architecture.md](architecture.md) | You need the map: the backend (Slim) and the frontend (Angular), data flow, API, settings, the setup page, where files live; the app's words in English and Slovak (the translation tables, the bundle, `core/i18n`, the owner's pages) |
| [data-provenance.md](data-provenance.md) | You touch `data/`, fix a typo, add content, or need a book page — **page maps for every PDF are here** |
| [kanji-srs.md](kanji-srs.md) | You change the kanji trainer: catalog, schedule, answer checking, storage, screens |
| [exam.md](exam.md) | You change the exam: question generation, papers, scoring, reports, its screen |
| [sign-in.md](sign-in.md) | You touch sign-in (the anotoki IAM, auth modes), the users, or anything that reads or writes somebody's data |
| [hosting.md](hosting.md) | You build or upload the website, touch Apache's files (`backend/public/`), the setup page on a website, or the start-time work |
| [testing.md](testing.md) | You run or add tests, or need to know what to test for a change |
| [environment.md](environment.md) | Something on these Windows machines behaves oddly — tooling pitfalls and fixes |
| [decisions.md](decisions.md) | You wonder *why* something is the way it is — and before you undo it |

Keep these pages true: when a change makes a statement here wrong, fix the page
in the same piece of work.
