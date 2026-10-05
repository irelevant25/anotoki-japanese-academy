# Japanese Academy — knowledge base

Reference for anyone (human or Claude) changing this project. `CLAUDE.md` holds
the always-on rules, `DEV.md` the setup for working on it, `backend/README.md`
and `frontend/README.md` the map of each half; these pages hold the detail.
Read the page for an area before changing it.

| Page | Read it when |
|---|---|
| [architecture.md](architecture.md) | You need the map: the backend (Slim) and the frontend (Angular), data flow, API, settings, the setup page, where files live; the app's words in English and Slovak (the translation tables, the bundle, `core/i18n`, the admin panel); a person's own data file (Your data) and the People page; the anotoki family's top bar (its fold, its keys, its menus, measured) and the foot; migrations and their drafts |
| [data-provenance.md](data-provenance.md) | You touch `backend/data/`, fix a typo, add content, or need a book page — **page maps for every PDF are here** |
| [kanji-srs.md](kanji-srs.md) | You change the kanji trainer: catalog, schedule, answer checking, storage, screens; or anything about days and hours (each learner's own time zone) |
| [exam.md](exam.md) | You change the exam: question generation, papers, scoring, reports, its screen |
| [sign-in.md](sign-in.md) | You touch sign-in (the anotoki IAM, the roles, whether it is required), visitors (studying without signing in), the users, or anything that reads or writes somebody's data |
| [hosting.md](hosting.md) | You build or upload the website, touch Apache's files (`backend/public/`), the setup page on a website, the start-time work, or the visitors' settings on a site |
| [testing.md](testing.md) | You run or add tests, or need to know what to test for a change |
| [environment.md](environment.md) | Something on these Windows machines behaves oddly — tooling pitfalls and fixes |
| [decisions.md](decisions.md) | You wonder *why* something is the way it is — and before you undo it |

Keep these pages true: when a change makes a statement here wrong, fix the page
in the same piece of work.
