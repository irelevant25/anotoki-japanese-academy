-- 011 — Terms, Privacy and Contact, and the kit's questions in place of the browser's (2026-10-18)
--
-- THIS FILE IS A DRAFT until its last line is "-- end of 011": the app waits
-- for that line before it applies a migration - and, after it, the anotoki
-- library's own files (db_migration_ready() in backend/src/db.php) -, so the
-- owner's own server never applies it half written. The tests alone apply the
-- draft, by name, on their throwaway databases. Its last line is the owner's
-- to write once they accept the change; applied once, it is never edited
-- again - a change is the next migration. An administrator applies it on the
-- admin panel's Migrations page (or backend/manage.php, or the setup page),
-- never a request. The anotoki library's words of 0.6 (anotoki_translations
-- 005 to 011: the legal pages', the top bar's, the kit's newer pieces', the
-- Privacy page's rewordings) run right after it, in the same Apply.
--
-- From anotoki-lib 0.6.0 every anotoki site shows Terms, Privacy and Contact -
-- the family's pages (@anotoki/lib/legal/pages), their structure and shared
-- words the library's (anotoki.legal.*), each site's facts its own (the
-- frontend's legal/legal-facts.ts names them, each with what in the code it
-- rests on). These are Japanese Academy's facts, true of the code as it is,
-- in English and informal Slovak (ty, and nothing gendered about the learner):
--
--   legal.about                  what Japanese Academy is (Terms' first words)
--   legal.record.*               the record of a person (users)
--   legal.study.*                each person's study (srs_*, exam_attempts, imports)
--   legal.copies.*               the site's own copies of the study data (backend/storage/backups/academy-*.json)
--   legal.limits.*               the counts that stop floods (keyed codes, a day)
--   legal.words.*                who saved a word (translations.updated_by)
--   legal.visitors.*             studying without an account ({days}: the visitors' keep_days)
--   legal.feedback.*             the form at the foot of every page
--   legal.storage.*              the cookie and the stored items the library has no words for
--
-- No string holds an address: where a link goes (the anotoki account's pages,
-- the operator, Cloudflare, the authority) is the code's, never a string an
-- administrator rewords (the library's 0.6.0 review; a test holds it). The
-- pages' tab titles are the library's own headings (anotoki.legal.termsTitle,
-- privacyTitle, contactTitle: app.routes.ts).
--
-- The seven questions and notes the app raised in the browser's own boxes
-- (confirm(), alert()) are the kit's dialog now (its ConfirmService, and the
-- app's notice drawn with the kit's dialog), with words of their own: a short
-- title each (session.endTitle, exam.finishTitle, item.resetTitle,
-- signOut.confirmTitle, signIn.confirmTitle, report.openFailedTitle,
-- exam.error.scoreTitle), the buttons the browser used to word
-- (session.goOn, exam.backToPaper, common.ok; the others are words the app
-- has), and the questions' sentences without the question the title now asks
-- - reworded, each only while it is still the text 004, 005 or 007 wrote and
-- nobody saved it (updated_by IS NULL): a rewording of the owner's stays as
-- it is. Their descriptions say the dialog they are in now.
--
-- And four small things: the exam result's small "▶ listen" button is named
-- for what it shows (exam.result.listenTo, WCAG 2.5.3 - it was "Play the
-- recording"); the top bar's Kanji link says what its number counts
-- (topbar.kanjiDue: "Kanji, 125 reviews due", the anotoki library's
-- badgeLabel - without it the kit hears "125 new"); the Lessons screen's note
-- on vocabulary is the quieter line under its lessons' chips now, a sentence
-- without its brackets (lessons.fromNote, reworded the same careful way); and
-- the descriptions that named a piece the page no longer draws are put right
-- (the result's two choices are a segmented control, a lesson's count on the
-- Lessons screen is heard with its chip, a scope's count follows it as the
-- chip's note). The rows of choices are the kit's chips again (anotoki-lib
-- 0.6.0), so the descriptions that say "chip" are true once more.
--
-- In 004's form: a key, its English and its informal Slovak (ty) string, one
-- string on a line, an apostrophe written twice and nothing else escaped;
-- every insert steps aside for a row that is already there. Then the
-- rewordings and the descriptions, and the check. It changes no table and no
-- row of anybody's study data.

-- ------------------------------------------------------------ the strings

INSERT INTO translation_keys (name, description) VALUES
    -- legal: Japanese Academy's facts on the family's Terms, Privacy and Contact pages (the library's words around them)
    ('legal.about', 'Terms of use, its first section ("What Japanese Academy is"): what Japanese Academy is, a sentence or two - the library''s next sentence says it is one of the anotoki sites, run by its operator, free to use. Never the course''s own name. No address in it. No placeholders.'),
    ('legal.record.name', 'The Privacy page: the heading of one part of what Japanese Academy keeps - its record of each person who signs in - and its line under "How long it is kept". Short. No placeholders.'),
    ('legal.record.what', 'The Privacy page, the record of a person: exactly what it holds (the anotoki account''s id and name from the sign-in, first and last use, the time zone the browser names) - and never an e-mail address. No placeholders.'),
    ('legal.record.why', 'The Privacy page, the record of a person: what it is for (under "What for"). No placeholders.'),
    ('legal.record.kept', 'The Privacy page, the record of a person: how long it stays (under "How long it is kept") - until an administrator deletes the person''s data on the People page; when the anotoki account is deleted, the name goes from it. No placeholders.'),
    ('legal.study.name', 'The Privacy page: the heading of the part about each person''s study (the kanji progress, the answer log, the exam attempts), and its line under "How long it is kept". Short. No placeholders.'),
    ('legal.study.what', 'The Privacy page, a person''s study: what it holds - the kanji progress with notes and the person''s own answers, the settings, the days, a log of every answer and reset, every exam attempt with its answers, score, the name typed on it and its report, and when a data file was last brought back. No placeholders.'),
    ('legal.study.why', 'The Privacy page, a person''s study: what it is for (under "What for"). No placeholders.'),
    ('legal.study.kept', 'The Privacy page, a person''s study: how long it stays - no time limit: until a full reset (which keeps the log and the exam attempts), a data file brought back in its place, or an administrator deletes the person''s data; it stays, nameless, when the account is deleted. No placeholders.'),
    ('legal.copies.name', 'The Privacy page: the heading of the part about the site''s own copies of the study data (files beside the backups), and its line under "How long it is kept". Short. No placeholders.'),
    ('legal.copies.what', 'The Privacy page, the copies of the study data: what they are and when one is made - the day''s copy of everybody''s at the first page opened, a copy of one person''s before a reset, a file brought back, a delete or the move of what they studied without an account, and a copy of every table before a database update. No placeholders.'),
    ('legal.copies.why', 'The Privacy page, the copies of the study data: what they are for (under "What for"). No placeholders.'),
    ('legal.copies.kept', 'The Privacy page, the copies of the study data: how long they stay - kept by count (14 daily, each person''s 14 of each kind), the ones before an update or made by the owner until deleted - and what is deleted stays in the copies made before. No placeholders.'),
    ('legal.limits.name', 'The Privacy page: the heading of the part about the counts that stop one sender from flooding the site (feedback, error reports), and its line under "How long it is kept". Short. No placeholders.'),
    ('legal.limits.what', 'The Privacy page, the limits: what is counted, and how - by the account, or by a code made from the IP address with a secret key, never the address itself. No placeholders.'),
    ('legal.limits.why', 'The Privacy page, the limits: what they are for (under "What for"). No placeholders.'),
    ('legal.limits.kept', 'The Privacy page, the limits: how long a count stays - a day, then deleted at the next count. No placeholders.'),
    ('legal.words.name', 'The Privacy page: the heading of the part about the people who keep the site''s words (editors and administrators: who saved a word, and when), and its line under "How long it is kept". Short. No placeholders.'),
    ('legal.words.what', 'The Privacy page, the words'' writers: what is kept - each word''s last writer and when. No placeholders.'),
    ('legal.words.why', 'The Privacy page, the words'' writers: what it is for (under "What for"). No placeholders.'),
    ('legal.words.kept', 'The Privacy page, the words'' writers: how long - until the word is saved again; a person''s data deleted leaves the word, saved by nobody. No placeholders.'),
    ('legal.visitors.what', 'The Privacy page, the part "Using the site without an account" (its heading the library''s): what is kept while the anotoki account does not require signing in here - the study under a random key of the browser''s (only a hash of it kept), when made and last used, and a keyed code of the address it started from. No placeholders.'),
    ('legal.visitors.why', 'The Privacy page, studying without an account: what it is for (under "What for"). No placeholders.'),
    ('legal.visitors.kept', 'The Privacy page, studying without an account: how long it stays - until a sign-in moves it into the account, or {days} days after the last visit. {days}: a whole number of days (30), the same as the notice on the home page says.'),
    ('legal.feedback.what', 'The Privacy page, the part "Feedback" (its heading the library''s): exactly what a message sent with the form keeps - the words, its kind and part of Japanese Academy, the page without anything after ? or #, its language, the browser, the account unless sent without the name, a reply address only if left. No placeholders.'),
    ('legal.feedback.kept', 'The Privacy page, feedback: how long a message stays - until an administrator deletes it; one marked as spam 30 days, a resolved one a year (at the next day''s clean-up); the reply address and browser go when the account is deleted, or the person''s data is. No placeholders.'),
    ('legal.storage.signIn.purpose', 'The Privacy page, "Cookies and storage in your browser": what the sign-in''s stored item is for (anotoki-auth:japanese-academy, the keys the anotoki account gave this site). No placeholders.'),
    ('legal.storage.signInUnderWay.purpose', 'The Privacy page, browser storage: the items a sign-in keeps for its tab while it is on its way to the anotoki account and back (one-time check values, the page it started from, the account''s public settings). No placeholders.'),
    ('legal.storage.signInUnderWay.kept', 'The Privacy page, browser storage: how long a sign-in on its way keeps its items - until it comes back (the settings an hour), never longer than the tab is open. No placeholders.'),
    ('legal.storage.hint.purpose', 'The Privacy page, browser storage: the anotoki account''s cookie for every anotoki site (anotoki_signed_in) - it reaches Japanese Academy too, which never reads it. No placeholders.'),
    ('legal.storage.tabLanguage.purpose', 'The Privacy page, browser storage: the language a link with ?lang= chose, kept for that tab alone. No placeholders.'),
    ('legal.storage.untilTabClosed', 'The Privacy page, browser storage: how long an item kept for one tab stays - until the tab is closed. No placeholders.'),
    ('legal.storage.visitorKey.kept', 'The Privacy page, browser storage: how long the key of somebody studying without an account stays in the browser - until a sign-in moves the study into the account, the site no longer knows it, or the site''s data is cleared. No placeholders.'),
    ('legal.storage.visitorMoved.purpose', 'The Privacy page, browser storage: the last visitor key the browser moved into an account, so that another tab knows nothing was lost; worth nothing once moved. No placeholders.'),
    ('legal.storage.visitorMoved.kept', 'The Privacy page, browser storage: how long that last moved key stays - until the next move, or the site''s data is cleared. No placeholders.'),
    ('legal.storage.whatsNew.purpose', 'The Privacy page, browser storage: the newest version whose news (What''s new, at the foot of every page) was opened, so that its dot goes. No placeholders.'),
    ('legal.storage.whatsNew.kept', 'The Privacy page, browser storage: how long that version stays - until a newer one''s news is opened, or the site''s data is cleared. No placeholders.'),
    ('legal.storage.examPaper.purpose', 'The Privacy page, browser storage: an exam paper that was open when the site stopped for an update (its questions, the answers so far, the flags, the name typed on it), kept for that tab so that it is back with the site. No placeholders.'),
    ('legal.storage.examPaper.kept', 'The Privacy page, browser storage: how long that paper stays - until the exam opens again in that tab, or the tab is closed. No placeholders.'),
    ('legal.storage.wordDrafts.purpose', 'The Privacy page, browser storage: for editors and administrators, the words typed on the admin panel''s Translations page and not saved yet (that page''s name is English, as the admin panel is). No placeholders.'),
    -- the kit's dialog: the titles and buttons of the questions and notes the browser''s own boxes asked before
    ('session.endTitle', 'The kit''s question when End is pressed in a session while items are half answered (one of their two halves right, the other not yet): its title; the sentence under it is session.confirmEnd. Its buttons: session.end and session.goOn. No placeholders.'),
    ('session.goOn', 'The kit''s question when End is pressed in a session while items are half answered: the button that stays in the session (the other, session.end, ends it). No placeholders.'),
    ('exam.finishTitle', 'The kit''s question after "Finish now" with questions still unanswered: its title; the sentence under it is exam.confirmFinish. Its buttons: exam.finish and exam.backToPaper. The same verb as exam.finish. No placeholders.'),
    ('exam.backToPaper', 'The kit''s question after "Finish now" with questions still unanswered: the button that goes back to the paper, nothing handed in (the other, exam.finish, hands it in). No placeholders.'),
    ('item.resetTitle', 'The kit''s question when Reset progress is pressed on an item''s page: its title; the sentence under it is item.confirmReset, its button item.reset. {chars}: the item''s characters, never translated or declined (in Slovak in quotation marks).'),
    ('signOut.confirmTitle', 'The kit''s question when Sign out is pressed while something would be lost: its title; the sentence under it is signOut.notSaved or signOut.examOpen. Its yes is the top bar''s Sign out. No placeholders.'),
    ('signIn.confirmTitle', 'The kit''s question when Sign in is pressed by somebody studying without signing in, while something would be lost: its title; the sentence under it is signIn.notSaved or signIn.examOpen. Its yes is the top bar''s Sign in. No placeholders.'),
    ('report.openFailedTitle', 'The app''s notice (drawn with the kit''s dialog) when an exam report could not be had: its title; the sentence under it is report.openFailed. Its button: common.ok. No placeholders.'),
    ('exam.error.scoreTitle', 'The app''s notice (drawn with the kit''s dialog) when the finished paper could not be scored and stored: its title - the answers stay on the page, so it may be handed in again; the sentence under it is exam.error.score. Its button: common.ok. No placeholders.'),
    ('common.ok', 'The one button of the app''s notices (drawn with the kit''s dialog): it closes the notice, nothing else. No placeholders.'),
    -- exam: the result's small listen button, named for what it shows
    ('exam.result.listenTo', 'The exam''s result: the name a screen reader is given for the small "listen" button after a listening question (which shows exam.result.listen). It begins with the same words, so that somebody who says what they see finds it (WCAG 2.5.3). {n}: the question''s number on the paper.'),
    -- topbar: what the number on the Kanji link counts
    ('topbar.kanjiDue.one', 'The top bar: what a screen reader hears after "Kanji", for the number on the link - the reviews due; the number is seen alone ("Kanji, 1 review due"). {count}: how many, 1.'),
    ('topbar.kanjiDue.few', 'The same, for {count} that Slovak counts with "few" (2 to 4).'),
    ('topbar.kanjiDue.other', 'The same, for any other {count} (0, 5 and more).')
ON CONFLICT (name) DO NOTHING;

-- English: what every other language falls back to, string by string.
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'en', v.value FROM (VALUES
    -- legal: Japanese Academy's facts on the family's Terms, Privacy and Contact pages (the library's words around them)
    ('legal.about', 'Japanese Academy is a study companion for a two-part beginner Japanese course: a kanji trainer with spaced repetition, and a multiple-choice exam of the whole course, with listening, scoring and a report - every word spoken in two voices, and your progress kept for you.'),
    ('legal.record.name', 'Your record'),
    ('legal.record.what', 'Your anotoki account''s id and the name it gives (copied from your sign-in), when you first and last used Japanese Academy, and the time zone your browser names.'),
    ('legal.record.why', 'To keep your study under your account, apart from everybody else''s, and to count your days and review times in your own time zone.'),
    ('legal.record.kept', 'Until an administrator deletes your data here (a later visit makes a new, empty record). When your anotoki account is deleted, it stays without your name.'),
    ('legal.study.name', 'Your study'),
    ('legal.study.what', 'Your kanji progress - each item''s stage, when it is due and how often you were right -, your notes and the answers you added as your own, your settings, how much you did each day, a log of every answer and reset, every exam attempt with its answers, its score, the name you typed on the paper and its report, and when you last brought a data file back.'),
    ('legal.study.why', 'To teach you: to choose what is due, show you your progress and score your exams - on every computer you sign in on.'),
    ('legal.study.kept', 'Until you reset your kanji progress (the log of your answers and your exam attempts stay), bring a data file of yours back in its place, or an administrator deletes your data here - no time limit. When your anotoki account is deleted, it stays, without your name: the name on your exam papers goes too.'),
    ('legal.copies.name', 'Copies of the study data'),
    ('legal.copies.what', 'Beside the backups below, files of the site''s own with the study data: at the first page opened each day, a copy of everybody''s record and study, the names on exam papers included; a copy of one person''s alone before their full reset, before a data file of theirs is brought back, before an administrator deletes their data, and before what they studied without an account moves into their account; and a copy of every table before a database update. They stay on the site''s server, out of public reach.'),
    ('legal.copies.why', 'To bring back what a mistake, a reset or a file brought back would otherwise lose.'),
    ('legal.copies.kept', 'The 14 newest daily copies, and each person''s 14 newest copies of each kind; a copy made before an update, or by the site''s owner, until the owner deletes it. What is deleted on the site stays in the copies made before, until they go.'),
    ('legal.limits.name', 'Limits against floods'),
    ('legal.limits.what', 'How many feedback messages and error reports each sender sends - counted by the sender''s account, or by a code made from the IP address with a secret key, never the address itself.'),
    ('legal.limits.why', 'To keep Japanese Academy working for everybody when somebody sends too much.'),
    ('legal.limits.kept', 'A day, and then deleted at the next count.'),
    ('legal.words.name', 'If you keep the site''s words'),
    ('legal.words.what', 'Editors and administrators reword Japanese Academy''s words in its admin panel: each word keeps who saved it last, and when.'),
    ('legal.words.why', 'So that the people who keep the words know who changed what.'),
    ('legal.words.kept', 'Until the word is saved again. When an administrator deletes that person''s data here, the word stays, saved by nobody.'),
    ('legal.visitors.what', 'While the anotoki account does not require signing in here: what you study without signing in - your kanji progress, your answers and your exam attempts, as a person''s study - under a random key this browser keeps (the site keeps only a hash of it), when it was made and last used, and a code made from the IP address it started from with a secret key, never the address itself, for the limit on how many people start from one address in an hour.'),
    ('legal.visitors.why', 'So that you can study without an account - and take it into your account when you sign in.'),
    ('legal.visitors.kept', 'Until you sign in - it then moves into your account - or {days} days after your last visit, when it is deleted.'),
    ('legal.feedback.what', 'What you send with the form at the foot of every page: your message, its kind and the part of Japanese Academy it is about, the page''s address without anything after ? or #, the page''s language and your browser''s name; your account''s id, unless you send it without your name; and an address to answer you at, only if you leave one (signed in, the form writes your account''s in - you may change it or clear it).'),
    ('legal.feedback.kept', 'Until an administrator deletes it - a message marked as spam goes 30 days later, a resolved one a year later (at the next day''s clean-up). When your anotoki account is deleted, or an administrator deletes your data here, the reply address and the browser go from your messages; the words stay.'),
    ('legal.storage.signIn.purpose', 'Your sign-in to this site: the keys your anotoki account gave it, and whose they are.'),
    ('legal.storage.signInUnderWay.purpose', 'A sign-in on its way: the one-time values it is checked with and the page it started from, and the anotoki account''s public settings.'),
    ('legal.storage.signInUnderWay.kept', 'Until the sign-in comes back - the settings an hour -, and never longer than the tab is open.'),
    ('legal.storage.hint.purpose', 'Set by the anotoki account when you sign in there, for every anotoki site. It reaches this site too, which never reads it.'),
    ('legal.storage.tabLanguage.purpose', 'The language a link with ?lang= chose, kept for that tab alone.'),
    ('legal.storage.untilTabClosed', 'Until the tab is closed.'),
    ('legal.storage.visitorKey.kept', 'Until you sign in - what you studied then moves into your account -, the site no longer knows it, or the site''s data is cleared in your browser.'),
    ('legal.storage.visitorMoved.purpose', 'The last key this browser moved into an account, so that another tab knows nothing was lost. It opens nothing once moved.'),
    ('legal.storage.visitorMoved.kept', 'Until the next move, or the site''s data is cleared in your browser.'),
    ('legal.storage.whatsNew.purpose', 'The newest version whose news you opened (What''s new, at the foot of every page), so that its dot goes.'),
    ('legal.storage.whatsNew.kept', 'Until a newer version''s news is opened, or the site''s data is cleared in your browser.'),
    ('legal.storage.examPaper.purpose', 'An exam paper you were in the middle of when the site stopped for an update - its questions, your answers so far, your flags and the name you typed on it -, so that it is back when the site is.'),
    ('legal.storage.examPaper.kept', 'Until the exam opens again in that tab, or the tab is closed.'),
    ('legal.storage.wordDrafts.purpose', 'For editors and administrators: the words typed on the admin panel''s Translations page and not saved yet.'),
    -- the kit's dialog: the titles and buttons of the questions and notes the browser''s own boxes asked before
    ('session.endTitle', 'Stop now?'),
    ('session.goOn', 'Keep going'),
    ('exam.finishTitle', 'Finish and score anyway?'),
    ('exam.backToPaper', 'Back to the test'),
    ('item.resetTitle', 'Reset {chars}?'),
    ('signOut.confirmTitle', 'Sign out anyway?'),
    ('signIn.confirmTitle', 'Sign in anyway?'),
    ('report.openFailedTitle', 'The report did not open'),
    ('exam.error.scoreTitle', 'Your answers stay here'),
    ('common.ok', 'OK'),
    -- exam: the result's small listen button, named for what it shows
    ('exam.result.listenTo', 'listen to question {n}'),
    -- topbar: what the number on the Kanji link counts
    ('topbar.kanjiDue.one', '{count} review due'),
    ('topbar.kanjiDue.few', '{count} reviews due'),
    ('topbar.kanjiDue.other', '{count} reviews due')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-- Slovak, informal (ty). A string may leave out a placeholder its English has,
-- never use one it has not.
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'sk', v.value FROM (VALUES
    -- legal: Japanese Academy's facts on the family's Terms, Privacy and Contact pages (the library's words around them)
    ('legal.about', 'Japanese Academy je pomocník pri štúdiu dvojdielneho kurzu japončiny pre začiatočníkov: tréner kanji s rozloženým opakovaním a test z celého kurzu s výberom z odpovedí, počúvaním, hodnotením a správou – každé slovo vyslovené dvoma hlasmi a tvoj pokrok uchovaný pre teba.'),
    ('legal.record.name', 'Tvoj záznam'),
    ('legal.record.what', 'Id tvojho účtu anotoki a meno, ktoré účet uvádza (prevzaté z prihlásenia), čas tvojho prvého a posledného použitia Japanese Academy a časové pásmo, ktoré uvádza tvoj prehliadač.'),
    ('legal.record.why', 'Aby tvoje štúdium patrilo k tvojmu účtu, oddelene od štúdia ostatných, a aby sa tvoje dni a časy opakovaní rátali v tvojom časovom pásme.'),
    ('legal.record.kept', 'Kým tvoje údaje tu nevymaže administrátor (ďalšia návšteva vytvorí nový, prázdny záznam). Keď sa tvoj účet anotoki vymaže, záznam zostane bez tvojho mena.'),
    ('legal.study.name', 'Tvoje štúdium'),
    ('legal.study.what', 'Tvoj pokrok v kanji – úroveň každej položky, kedy treba ju zopakovať a koľko odpovedí na ňu bolo správnych –, tvoje poznámky a odpovede, ktoré si pridáš ako vlastné, tvoje nastavenia, koľko sa urobilo v jednotlivé dni, záznam každej odpovede a vynulovania, každý pokus o test s odpoveďami, výsledkom, menom napísaným na test a správou, a čas posledného vrátenia súboru s údajmi.'),
    ('legal.study.why', 'Na učenie: aby sa vybralo, čo treba zopakovať, aby sa ukázal tvoj pokrok a vyhodnotili tvoje testy – na každom počítači, kde sa prihlásiš.'),
    ('legal.study.kept', 'Kým nevynuluješ svoj pokrok v kanji (záznam odpovedí a pokusy o test zostanú), kým ho nenahradíš svojím súborom s údajmi, alebo kým tvoje údaje tu nevymaže administrátor – bez časového obmedzenia. Keď sa tvoj účet anotoki vymaže, štúdium zostane bez tvojho mena: zmizne aj meno na tvojich testoch.'),
    ('legal.copies.name', 'Kópie údajov o štúdiu'),
    ('legal.copies.what', 'Okrem záloh nižšie aj vlastné súbory stránky s údajmi o štúdiu: pri prvej stránke otvorenej v daný deň kópia záznamov a štúdia všetkých, vrátane mien na testoch; kópia údajov jedného človeka pred jeho úplným vynulovaním, pred vrátením jeho súboru s údajmi, pred vymazaním jeho údajov administrátorom a pred presunom toho, čo študoval bez účtu, do jeho účtu; a kópia každej tabuľky pred aktualizáciou databázy. Zostávajú na serveri stránky, mimo verejného prístupu.'),
    ('legal.copies.why', 'Aby sa dalo vrátiť, čo by inak stratila chyba, vynulovanie alebo vrátený súbor.'),
    ('legal.copies.kept', '14 najnovších denných kópií a pre každého človeka 14 najnovších kópií každého druhu; kópia urobená pred aktualizáciou alebo vlastníkom stránky, kým ju vlastník nevymaže. Čo sa na stránke vymaže, zostáva v kópiách urobených predtým, kým nezmiznú.'),
    ('legal.limits.name', 'Limity proti zahlteniu'),
    ('legal.limits.what', 'Koľko spätných väzieb a hlásení chýb pošle každý odosielateľ – ráta sa podľa jeho účtu alebo podľa kódu vytvoreného z IP adresy tajným kľúčom, nikdy podľa samotnej adresy.'),
    ('legal.limits.why', 'Aby Japanese Academy fungovala pre všetkých, aj keď niekto posiela priveľa.'),
    ('legal.limits.kept', 'Deň, potom sa pri ďalšom rátaní vymaže.'),
    ('legal.words.name', 'Ak spravuješ slová stránky'),
    ('legal.words.what', 'Editori a administrátori upravujú slová Japanese Academy v administrátorskom paneli: pri každom slove sa uchováva, kto ho naposledy uložil a kedy.'),
    ('legal.words.why', 'Aby tí, čo spravujú slová, vedeli, kto čo zmenil.'),
    ('legal.words.kept', 'Kým sa slovo znova neuloží. Keď administrátor vymaže údaje toho človeka, slovo zostane, no bez toho, kto ho uložil.'),
    ('legal.visitors.what', 'Kým účet anotoki nevyžaduje prihlásenie na tejto stránke: to, čo študuješ bez prihlásenia – pokrok v kanji, odpovede a pokusy o test, ako štúdium prihláseného –, pod náhodným kľúčom, ktorý si uchováva tento prehliadač (stránka si uchováva len jeho odtlačok), kedy vznikol a kedy sa naposledy použil, a kód vytvorený tajným kľúčom z IP adresy, z ktorej štúdium začalo, nikdy samotná adresa, pre limit, koľko ľudí môže za hodinu začať z jednej adresy.'),
    ('legal.visitors.why', 'Aby sa dalo študovať aj bez účtu – a po prihlásení si to vziať do svojho účtu.'),
    ('legal.visitors.kept', 'Kým sa neprihlásiš – vtedy sa to presunie do tvojho účtu – alebo {days} dní po tvojej poslednej návšteve, keď sa to vymaže.'),
    ('legal.feedback.what', 'To, čo pošleš formulárom v päte každej stránky: tvoja správa, jej druh a časť Japanese Academy, ktorej sa týka, adresa stránky bez všetkého za ? alebo #, jazyk stránky a názov tvojho prehliadača; id tvojho účtu, ak správu nepošleš bez mena; a adresa na odpoveď, len ak ju vyplníš (prihlásenému formulár vpíše adresu účtu – môžeš ju zmeniť alebo vymazať).'),
    ('legal.feedback.kept', 'Kým ju administrátor nevymaže – správa označená ako spam zmizne o 30 dní, vyriešená o rok (pri najbližšom dennom upratovaní). Keď sa vymaže tvoj účet anotoki alebo keď administrátor vymaže tvoje údaje tu, z tvojich správ zmizne adresa na odpoveď a prehliadač; slová zostanú.'),
    ('legal.storage.signIn.purpose', 'Tvoje prihlásenie na túto stránku: kľúče, ktoré jej dal tvoj účet anotoki, a komu patria.'),
    ('legal.storage.signInUnderWay.purpose', 'Prihlásenie, ktoré práve prebieha: jednorazové hodnoty na jeho overenie, stránka, z ktorej začalo, a verejné nastavenia účtu anotoki.'),
    ('legal.storage.signInUnderWay.kept', 'Kým sa prihlásenie nevráti – nastavenia hodinu –, a nikdy dlhšie, než je karta otvorená.'),
    ('legal.storage.hint.purpose', 'Nastaví ho účet anotoki pri prihlásení, pre všetky stránky anotoki. Dostane sa aj k tejto stránke, ktorá ho nikdy nečíta.'),
    ('legal.storage.tabLanguage.purpose', 'Jazyk, ktorý vybral odkaz s ?lang=, uchovaný len pre túto kartu.'),
    ('legal.storage.untilTabClosed', 'Kým sa karta nezatvorí.'),
    ('legal.storage.visitorKey.kept', 'Kým sa neprihlásiš – štúdium sa vtedy presunie do tvojho účtu –, kým ho stránka pozná, alebo kým sa v prehliadači nevymažú údaje stránky.'),
    ('legal.storage.visitorMoved.purpose', 'Posledný kľúč, ktorý tento prehliadač presunul do účtu, aby iná karta vedela, že sa nič nestratilo. Po presune už nič neotvára.'),
    ('legal.storage.visitorMoved.kept', 'Do ďalšieho presunu, alebo kým sa v prehliadači nevymažú údaje stránky.'),
    ('legal.storage.whatsNew.purpose', 'Najnovšia verzia, ktorej novinky sa už otvorili (Čo je nové, v päte každej stránky), aby zmizla bodka.'),
    ('legal.storage.whatsNew.kept', 'Kým sa neotvoria novinky novšej verzie, alebo kým sa v prehliadači nevymažú údaje stránky.'),
    ('legal.storage.examPaper.purpose', 'Rozpracovaný test, keď sa stránka zastavila kvôli aktualizácii – jeho otázky, tvoje doterajšie odpovede, značky a meno napísané na test –, aby sa vrátil spolu so stránkou.'),
    ('legal.storage.examPaper.kept', 'Kým sa test v tej karte znova neotvorí, alebo kým sa karta nezatvorí.'),
    ('legal.storage.wordDrafts.purpose', 'Pre editorov a administrátorov: slová napísané na stránke Translations v administrátorskom paneli a ešte neuložené.'),
    -- the kit's dialog: the titles and buttons of the questions and notes the browser''s own boxes asked before
    ('session.endTitle', 'Skončiť teraz?'),
    ('session.goOn', 'Pokračovať'),
    ('exam.finishTitle', 'Odovzdať a vyhodnotiť aj tak?'),
    ('exam.backToPaper', 'Späť k testu'),
    ('item.resetTitle', 'Vynulovať „{chars}“?'),
    ('signOut.confirmTitle', 'Chceš sa aj tak odhlásiť?'),
    ('signIn.confirmTitle', 'Chceš sa aj tak prihlásiť?'),
    ('report.openFailedTitle', 'Správa sa neotvorila'),
    ('exam.error.scoreTitle', 'Tvoje odpovede zostávajú tu'),
    ('common.ok', 'OK'),
    -- exam: the result's small listen button, named for what it shows
    ('exam.result.listenTo', 'vypočuť si otázku {n}'),
    -- topbar: what the number on the Kanji link counts
    ('topbar.kanjiDue.one', '{count} opakovanie čaká'),
    ('topbar.kanjiDue.few', '{count} opakovania čakajú'),
    ('topbar.kanjiDue.other', '{count} opakovaní čaká')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-- Reworded, each only while it is the text 004, 005 or 007 wrote and nobody saved it: the question the dialog's
-- title asks now goes from the sentence under it. A string reworded in the admin panel is the owner's, and stays.
UPDATE translations SET value = '1 half-answered item will not be saved.', updated_at = now() WHERE key_name = 'session.confirmEnd.one' AND language_code = 'en' AND value = 'Stop now? 1 half-answered item will not be saved.' AND updated_by IS NULL;
UPDATE translations SET value = '{count} half-answered items will not be saved.', updated_at = now() WHERE key_name = 'session.confirmEnd.few' AND language_code = 'en' AND value = 'Stop now? {count} half-answered items will not be saved.' AND updated_by IS NULL;
UPDATE translations SET value = '{count} half-answered items will not be saved.', updated_at = now() WHERE key_name = 'session.confirmEnd.other' AND language_code = 'en' AND value = 'Stop now? {count} half-answered items will not be saved.' AND updated_by IS NULL;
UPDATE translations SET value = '1 rozpracovaná položka sa neuloží.', updated_at = now() WHERE key_name = 'session.confirmEnd.one' AND language_code = 'sk' AND value = 'Skončiť teraz? 1 rozpracovaná položka sa neuloží.' AND updated_by IS NULL;
UPDATE translations SET value = '{count} rozpracované položky sa neuložia.', updated_at = now() WHERE key_name = 'session.confirmEnd.few' AND language_code = 'sk' AND value = 'Skončiť teraz? {count} rozpracované položky sa neuložia.' AND updated_by IS NULL;
UPDATE translations SET value = '{count} rozpracovaných položiek sa neuloží.', updated_at = now() WHERE key_name = 'session.confirmEnd.other' AND language_code = 'sk' AND value = 'Skončiť teraz? {count} rozpracovaných položiek sa neuloží.' AND updated_by IS NULL;
UPDATE translations SET value = '1 question is unanswered.', updated_at = now() WHERE key_name = 'exam.confirmFinish.one' AND language_code = 'en' AND value = '1 question unanswered. Finish and score anyway?' AND updated_by IS NULL;
UPDATE translations SET value = '{count} questions are unanswered.', updated_at = now() WHERE key_name = 'exam.confirmFinish.few' AND language_code = 'en' AND value = '{count} questions unanswered. Finish and score anyway?' AND updated_by IS NULL;
UPDATE translations SET value = '{count} questions are unanswered.', updated_at = now() WHERE key_name = 'exam.confirmFinish.other' AND language_code = 'en' AND value = '{count} questions unanswered. Finish and score anyway?' AND updated_by IS NULL;
UPDATE translations SET value = '1 otázka je bez odpovede.', updated_at = now() WHERE key_name = 'exam.confirmFinish.one' AND language_code = 'sk' AND value = '1 otázka je bez odpovede. Odovzdať a vyhodnotiť aj tak?' AND updated_by IS NULL;
UPDATE translations SET value = '{count} otázky sú bez odpovede.', updated_at = now() WHERE key_name = 'exam.confirmFinish.few' AND language_code = 'sk' AND value = '{count} otázky sú bez odpovede. Odovzdať a vyhodnotiť aj tak?' AND updated_by IS NULL;
UPDATE translations SET value = '{count} otázok je bez odpovede.', updated_at = now() WHERE key_name = 'exam.confirmFinish.other' AND language_code = 'sk' AND value = '{count} otázok je bez odpovede. Odovzdať a vyhodnotiť aj tak?' AND updated_by IS NULL;
UPDATE translations SET value = 'It goes back to "not learned"; your notes stay.', updated_at = now() WHERE key_name = 'item.confirmReset' AND language_code = 'en' AND value = 'Reset {chars}? It goes back to "not learned"; your notes stay.' AND updated_by IS NULL;
UPDATE translations SET value = 'Položka sa vráti medzi nenaučené; tvoje poznámky zostanú.', updated_at = now() WHERE key_name = 'item.confirmReset' AND language_code = 'sk' AND value = 'Vynulovať „{chars}“? Položka sa vráti medzi nenaučené; tvoje poznámky zostanú.' AND updated_by IS NULL;
UPDATE translations SET value = 'Some of your answers or notes could not be saved, and signing out loses them.', updated_at = now() WHERE key_name = 'signOut.notSaved' AND language_code = 'en' AND value = 'Some of your answers or notes could not be saved, and signing out loses them. Sign out anyway?' AND updated_by IS NULL;
UPDATE translations SET value = 'Niektoré tvoje odpovede alebo poznámky sa nepodarilo uložiť a odhlásením sa stratia.', updated_at = now() WHERE key_name = 'signOut.notSaved' AND language_code = 'sk' AND value = 'Niektoré tvoje odpovede alebo poznámky sa nepodarilo uložiť a odhlásením sa stratia. Chceš sa aj tak odhlásiť?' AND updated_by IS NULL;
UPDATE translations SET value = 'Your exam is not finished, and signing out loses the test.', updated_at = now() WHERE key_name = 'signOut.examOpen' AND language_code = 'en' AND value = 'Your exam is not finished, and signing out loses the test. Sign out anyway?' AND updated_by IS NULL;
UPDATE translations SET value = 'Tvoja skúška nie je dokončená a odhlásením sa test stratí.', updated_at = now() WHERE key_name = 'signOut.examOpen' AND language_code = 'sk' AND value = 'Tvoja skúška nie je dokončená a odhlásením sa test stratí. Chceš sa aj tak odhlásiť?' AND updated_by IS NULL;
UPDATE translations SET value = 'Some of your answers or notes could not be saved, and signing in now loses them.', updated_at = now() WHERE key_name = 'signIn.notSaved' AND language_code = 'en' AND value = 'Some of your answers or notes could not be saved, and signing in now loses them. Sign in anyway?' AND updated_by IS NULL;
UPDATE translations SET value = 'Niektoré tvoje odpovede alebo poznámky sa nepodarilo uložiť a prihlásením sa teraz stratia.', updated_at = now() WHERE key_name = 'signIn.notSaved' AND language_code = 'sk' AND value = 'Niektoré tvoje odpovede alebo poznámky sa nepodarilo uložiť a prihlásením sa teraz stratia. Chceš sa aj tak prihlásiť?' AND updated_by IS NULL;
UPDATE translations SET value = 'Your exam is not finished, and signing in now loses the test.', updated_at = now() WHERE key_name = 'signIn.examOpen' AND language_code = 'en' AND value = 'Your exam is not finished, and signing in now loses the test. Sign in anyway?' AND updated_by IS NULL;
UPDATE translations SET value = 'Tvoja skúška nie je dokončená a prihlásením sa teraz test stratí.', updated_at = now() WHERE key_name = 'signIn.examOpen' AND language_code = 'sk' AND value = 'Tvoja skúška nie je dokončená a prihlásením sa teraz test stratí. Chceš sa aj tak prihlásiť?' AND updated_by IS NULL;
UPDATE translations SET value = 'Vocabulary opens up once its kanji are learned.', updated_at = now() WHERE key_name = 'lessons.fromNote' AND language_code = 'en' AND value = '(vocabulary opens up once its kanji are learned)' AND updated_by IS NULL;
UPDATE translations SET value = 'Slovíčka sa sprístupnia, keď sú naučené ich kanji.', updated_at = now() WHERE key_name = 'lessons.fromNote' AND language_code = 'sk' AND value = '(slovíčka sa sprístupnia, keď sú naučené ich kanji)' AND updated_by IS NULL;

-- What each key's words are for now: the dialog they are in, the piece the page draws.
UPDATE translation_keys SET description = 'The kit''s question when End is pressed in a session while an item is half answered (one of its two halves right, the other not yet): the sentence under its title (session.endTitle) - what ending now loses. The form for 1 item.' WHERE name = 'session.confirmEnd.one';
UPDATE translation_keys SET description = 'The kit''s question when End is pressed in a session while items are half answered: the sentence under its title (session.endTitle). {count}: the half-answered items, 2 to 4.' WHERE name = 'session.confirmEnd.few';
UPDATE translation_keys SET description = 'The kit''s question when End is pressed in a session while items are half answered: the sentence under its title (session.endTitle). {count}: the half-answered items, 5 and more.' WHERE name = 'session.confirmEnd.other';
UPDATE translation_keys SET description = 'The kit''s question after "Finish now" with a question still unanswered: the sentence under its title (exam.finishTitle). The form for 1.' WHERE name = 'exam.confirmFinish.one';
UPDATE translation_keys SET description = 'The kit''s question after "Finish now" with questions still unanswered: the sentence under its title (exam.finishTitle). {count}: how many, 2 to 4.' WHERE name = 'exam.confirmFinish.few';
UPDATE translation_keys SET description = 'The kit''s question after "Finish now" with questions still unanswered: the sentence under its title (exam.finishTitle). {count}: how many, 5 and more.' WHERE name = 'exam.confirmFinish.other';
UPDATE translation_keys SET description = 'The kit''s question when Reset progress is pressed on an item''s page: the sentence under its title (item.resetTitle), which names the item. The words in quotation marks in the English are the app''s name for an item with no stage. No placeholders.' WHERE name = 'item.confirmReset';
UPDATE translation_keys SET description = 'The kit''s question when Sign out is pressed and some answers or notes could not be saved: the sentence under its title (signOut.confirmTitle) - signing out loses them.' WHERE name = 'signOut.notSaved';
UPDATE translation_keys SET description = 'The kit''s question when Sign out is pressed while an exam paper is open and not handed in: the sentence under its title (signOut.confirmTitle) - signing out loses it.' WHERE name = 'signOut.examOpen';
UPDATE translation_keys SET description = 'The kit''s question when Sign in is pressed by somebody studying without signing in, and some answers or notes could not be saved: the sentence under its title (signIn.confirmTitle) - going to sign in now loses them.' WHERE name = 'signIn.notSaved';
UPDATE translation_keys SET description = 'The kit''s question when Sign in is pressed by somebody studying without signing in, while an exam paper is open and not handed in: the sentence under its title (signIn.confirmTitle) - going to sign in now loses it.' WHERE name = 'signIn.examOpen';
UPDATE translation_keys SET description = 'The app''s notice (drawn with the kit''s dialog) when an exam report could not be had: the sentence under its title (report.openFailedTitle). {reason}: a whole sentence of its own, with its capital letter and full stop — report.notFound, or the general "Something went wrong."' WHERE name = 'report.openFailed';
UPDATE translation_keys SET description = 'The app''s notice (drawn with the kit''s dialog) when the finished paper could not be scored and stored: the sentence under its title (exam.error.scoreTitle). The answers stay on the page. {reason}: why, a whole sentence in the reader''s language (one of the error. strings).' WHERE name = 'exam.error.score';
UPDATE translation_keys SET description = 'The name, for a screen reader, of the round play button of a listening question in the running exam (it shows a play mark alone).' WHERE name = 'exam.playRecording';
UPDATE translation_keys SET description = 'The exam''s result, the small button after a listening question in the list: plays its recording again. The page draws a play mark in front of it; a screen reader hears exam.result.listenTo, which begins with these words.' WHERE name = 'exam.result.listen';
UPDATE translation_keys SET description = 'The exam''s result, one of the two choices of the segmented control above the list of questions: show only the ones answered wrong or not at all.' WHERE name = 'exam.result.missedOnly';
UPDATE translation_keys SET description = 'The exam''s result, one of the two choices of the segmented control above the list of questions: show every question.' WHERE name = 'exam.result.everything';
UPDATE translation_keys SET description = 'The Lessons screen, the choice of where the next items come from: what a screen reader hears after a lesson''s chip''s own words ("L6, 12 available"). {n}: how many items of that lesson can be learned now. In Slovak a label before a colon, so no word has to agree with the number.' WHERE name = 'lessons.available';
UPDATE translation_keys SET description = 'The Lessons screen: the quieter line under the choice of where the next items come from (lessons.from), why a lesson may have nothing to learn yet. A sentence of its own. "kanji" is a term: never translated, never declined.' WHERE name = 'lessons.fromNote';
UPDATE translation_keys SET description = 'The Practice screen, a choice of what to practise: every learned item. The number of such items follows it on its chip, quieter.' WHERE name = 'practice.scope.all';
UPDATE translation_keys SET description = 'The Practice screen, a choice of what to practise: the items missed most often. The number of such items follows it on its chip, quieter.' WHERE name = 'practice.scope.weakest';
UPDATE translation_keys SET description = 'The Practice screen, a choice of what to practise: the items missed in the last three days. The number of such items follows it on its chip, quieter.' WHERE name = 'practice.scope.mistakes';
UPDATE translation_keys SET description = 'The Practice screen, a choice of what to practise: the items learned in the last 24 hours. The number of such items follows it on its chip, quieter.' WHERE name = 'practice.scope.recent';
UPDATE translation_keys SET description = 'The Practice screen, a choice of what to practise: the items at a stage group and the groups above it. {stage}: a stage group''s name ("Guru"), never translated and never declined. The number of such items follows it on its chip, quieter.' WHERE name = 'practice.scope.guruUp';

-- -------------------------------------------------------------- the check

DO $$
DECLARE
    missing text;
BEGIN
    -- Every key of this file is here and reads in both languages: a page never
    -- shows a key, and Slovak never falls back to English by accident.
    SELECT string_agg(k.name, ', ' ORDER BY k.name) INTO missing
      FROM (VALUES
          ('legal.about'), ('legal.record.name'), ('legal.record.what'), ('legal.record.why'), ('legal.record.kept'),
          ('legal.study.name'), ('legal.study.what'), ('legal.study.why'), ('legal.study.kept'),
          ('legal.copies.name'), ('legal.copies.what'), ('legal.copies.why'), ('legal.copies.kept'),
          ('legal.limits.name'), ('legal.limits.what'), ('legal.limits.why'), ('legal.limits.kept'),
          ('legal.words.name'), ('legal.words.what'), ('legal.words.why'), ('legal.words.kept'),
          ('legal.visitors.what'), ('legal.visitors.why'), ('legal.visitors.kept'), ('legal.feedback.what'), ('legal.feedback.kept'),
          ('legal.storage.signIn.purpose'), ('legal.storage.signInUnderWay.purpose'), ('legal.storage.signInUnderWay.kept'),
          ('legal.storage.hint.purpose'), ('legal.storage.tabLanguage.purpose'), ('legal.storage.untilTabClosed'), ('legal.storage.visitorKey.kept'),
          ('legal.storage.visitorMoved.purpose'), ('legal.storage.visitorMoved.kept'), ('legal.storage.whatsNew.purpose'), ('legal.storage.whatsNew.kept'),
          ('legal.storage.examPaper.purpose'), ('legal.storage.examPaper.kept'), ('legal.storage.wordDrafts.purpose'),
          ('session.endTitle'), ('session.goOn'), ('exam.finishTitle'), ('exam.backToPaper'), ('item.resetTitle'), ('signOut.confirmTitle'),
          ('signIn.confirmTitle'), ('report.openFailedTitle'), ('exam.error.scoreTitle'), ('common.ok'), ('exam.result.listenTo'),
          ('topbar.kanjiDue.one'), ('topbar.kanjiDue.few'), ('topbar.kanjiDue.other')
      ) AS k(name)
     WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.name)
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'en')
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'sk');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '011_legal_pages_and_questions: keys without an English and a Slovak string: %', missing;
    END IF;

    -- The reworded keys are still there, each in both languages.
    SELECT string_agg(r.name, ', ' ORDER BY r.name) INTO missing
      FROM (VALUES ('session.confirmEnd.one'), ('session.confirmEnd.few'), ('session.confirmEnd.other'), ('exam.confirmFinish.one'),
                   ('exam.confirmFinish.few'), ('exam.confirmFinish.other'), ('item.confirmReset'), ('signOut.notSaved'), ('signOut.examOpen'),
                   ('signIn.notSaved'), ('signIn.examOpen'), ('lessons.fromNote')) AS r(name)
     WHERE NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = r.name AND t.language_code = 'en')
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = r.name AND t.language_code = 'sk');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '011_legal_pages_and_questions: reworded keys without an English and a Slovak string: %', missing;
    END IF;

    -- No reworded string nobody saved is still the text 004, 005 or 007 wrote (the owner's own rewording is not
    -- that text, or was saved by somebody, and stays).
    SELECT string_agg(t.key_name || ' (' || t.language_code || ')', ', ' ORDER BY t.key_name, t.language_code) INTO missing
      FROM translations t
      JOIN (VALUES
          ('session.confirmEnd.one', 'en', 'Stop now? 1 half-answered item will not be saved.'),
          ('session.confirmEnd.few', 'en', 'Stop now? {count} half-answered items will not be saved.'),
          ('session.confirmEnd.other', 'en', 'Stop now? {count} half-answered items will not be saved.'),
          ('session.confirmEnd.one', 'sk', 'Skončiť teraz? 1 rozpracovaná položka sa neuloží.'),
          ('session.confirmEnd.few', 'sk', 'Skončiť teraz? {count} rozpracované položky sa neuložia.'),
          ('session.confirmEnd.other', 'sk', 'Skončiť teraz? {count} rozpracovaných položiek sa neuloží.'),
          ('exam.confirmFinish.one', 'en', '1 question unanswered. Finish and score anyway?'),
          ('exam.confirmFinish.few', 'en', '{count} questions unanswered. Finish and score anyway?'),
          ('exam.confirmFinish.other', 'en', '{count} questions unanswered. Finish and score anyway?'),
          ('exam.confirmFinish.one', 'sk', '1 otázka je bez odpovede. Odovzdať a vyhodnotiť aj tak?'),
          ('exam.confirmFinish.few', 'sk', '{count} otázky sú bez odpovede. Odovzdať a vyhodnotiť aj tak?'),
          ('exam.confirmFinish.other', 'sk', '{count} otázok je bez odpovede. Odovzdať a vyhodnotiť aj tak?'),
          ('item.confirmReset', 'en', 'Reset {chars}? It goes back to "not learned"; your notes stay.'),
          ('item.confirmReset', 'sk', 'Vynulovať „{chars}“? Položka sa vráti medzi nenaučené; tvoje poznámky zostanú.'),
          ('signOut.notSaved', 'en', 'Some of your answers or notes could not be saved, and signing out loses them. Sign out anyway?'),
          ('signOut.notSaved', 'sk', 'Niektoré tvoje odpovede alebo poznámky sa nepodarilo uložiť a odhlásením sa stratia. Chceš sa aj tak odhlásiť?'),
          ('signOut.examOpen', 'en', 'Your exam is not finished, and signing out loses the test. Sign out anyway?'),
          ('signOut.examOpen', 'sk', 'Tvoja skúška nie je dokončená a odhlásením sa test stratí. Chceš sa aj tak odhlásiť?'),
          ('signIn.notSaved', 'en', 'Some of your answers or notes could not be saved, and signing in now loses them. Sign in anyway?'),
          ('signIn.notSaved', 'sk', 'Niektoré tvoje odpovede alebo poznámky sa nepodarilo uložiť a prihlásením sa teraz stratia. Chceš sa aj tak prihlásiť?'),
          ('signIn.examOpen', 'en', 'Your exam is not finished, and signing in now loses the test. Sign in anyway?'),
          ('signIn.examOpen', 'sk', 'Tvoja skúška nie je dokončená a prihlásením sa teraz test stratí. Chceš sa aj tak prihlásiť?'),
          ('lessons.fromNote', 'en', '(vocabulary opens up once its kanji are learned)'),
          ('lessons.fromNote', 'sk', '(slovíčka sa sprístupnia, keď sú naučené ich kanji)')
      ) AS seeded(key_name, language_code, value)
        ON t.key_name = seeded.key_name AND t.language_code = seeded.language_code AND t.value = seeded.value
     WHERE t.updated_by IS NULL;
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '011_legal_pages_and_questions: strings still as 004, 005 and 007 wrote them: %', missing;
    END IF;
END $$;
