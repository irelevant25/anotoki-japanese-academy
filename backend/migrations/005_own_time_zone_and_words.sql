-- 005 — each person's own time zone, and the words of the pages that come with it (2026-10-04)
--
-- Until now one time zone counted for everybody: the one the setup page asked
-- for, then the server's own. Now every person's days and hours are their
-- own: their browser names its time zone with every request (X-Time-Zone),
-- and the app keeps it on their users row, for a request that names none.
-- A review time is rounded down to the hour of the person's zone; an answer
-- counts on the day of the person's zone; the dashboard's today and its
-- forecast are theirs. The site's own housekeeping (the names of the backups,
-- the day of the daily backup) is UTC, whoever's request it is.
--   users.time_zone   the person's IANA time zone, as their browser last named
--                     it; null until their first request after this migration
--
-- It was written as a draft, without its last line ("-- end of 005"), which
-- the app waits for before it applies a migration (db_migration_sql() in
-- backend/src/db.php): a file without it is taken to be still on its way. The
-- tests alone applied the draft, on their throwaway databases, while the keys
-- and strings of the pages that come with it were added (Your data, the
-- sign-out's questions, the anotoki family's top bar). It is final now, with
-- that line written last: applied once, it is never edited again - a change
-- is the next migration.
--
-- It adds a column, and keys and strings that step aside for rows that are
-- already there; it rewords five keys' strings (ten strings, English and
-- Slovak) only while they are still 004's own text, and deletes four keys nothing asks for any more. It rewrites no
-- row of anybody's study data, and the owner's database holds none to
-- rewrite.

-- ------------------------------------------------------------------- users

-- The person's own time zone: an IANA name both PHP and ICU know
-- ('Europe/Bratislava'), checked by the app before it is kept
-- (time_zone_known(): a host's ICU may be older than its PHP); never an offset.
ALTER TABLE users ADD COLUMN time_zone varchar(64) CHECK (time_zone <> '');

COMMENT ON COLUMN users.time_zone IS 'The person''s IANA time zone, as their browser last named it (X-Time-Zone); null until they name one. Their days and review hours follow it.';

-- ------------------------------------------------------------ the strings

-- The words of what comes with each person's own data and sign-in: the Your
-- data card on the home page (the learner's data as a file, and a file
-- brought back), the questions a sign-out asks before something would be
-- lost, three failures of a file brought back, worded from their codes, and
-- the anotoki family's top bar (its links, menus and theme switch; the
-- version and "What's new" moved to the foot of the page).
-- In 004's form: a key, its English and its informal Slovak (ty) string,
-- one string on a line, an apostrophe written twice and nothing else
-- escaped; every insert steps aside for a row that is already there.
--
-- Five keys' strings 004 wrote are reworded, ten strings in English and
-- Slovak, each only while it is still 004's own text: a string the owner reworded in the admin area is theirs and stays.
-- They told a learner things that are no longer so: that an account may have
-- no access (every account may study now), and that the progress is in a
-- folder of backups with a download of the kanji alone (it is kept with the
-- account, and Your data takes all of it). And two the family's bar says
-- otherwise: the account is the anotoki account, and the language button's
-- name holds the code it shows ("SK"), for somebody who speaks to their
-- computer and says what they see.
--
-- Four keys go, with their strings: nothing sends no_access or
-- this_computer_only any more (the sign-in mode none is gone, and a token
-- without a role is a learner), and the family's menu says who is signed in
-- with their name, address and role, not "Signed in as" and their user id.
-- Their rewordings, if any, go with them.

INSERT INTO translation_keys (name, description) VALUES
    -- yourData: the Your data card at the foot of the home page
    ('yourData.title', 'The home page, the heading of the card at its foot: everything the app keeps of the learner, as a file to take away and bring back.'),
    ('yourData.intro', 'The Your data card: the paragraph under its heading. "kanji" is a term: never translated, never declined.'),
    ('yourData.timeZone', 'The Your data card: the small line that says which time zone the learner''s days and review times are counted in. {zone}: the time zone''s name as the browser gives it ("Europe/Bratislava"), shown as it is.'),
    ('yourData.download', 'The Your data card: the button that downloads all of the learner''s data as one file.'),
    ('yourData.downloading', 'The Your data card: what the download button says while the file is being made.'),
    ('yourData.downloadFailed', 'The Your data card, when the file could not be downloaded. {reason}: a whole sentence of its own, with its capital letter and full stop (one of the error. strings).'),
    ('yourData.bringBack', 'The Your data card: the button that picks a data file, taken from this app before, to bring the learner''s data back from.'),
    ('yourData.bringBackNote', 'The Your data card: the small line under the two buttons, saying what bringing a file back does.'),
    ('yourData.bringing', 'The Your data card: what the bring-back button says while the file is on its way to the server.'),
    ('yourData.confirmTitle', 'The Your data card: the heading of the question asked after a file is picked and before anything is sent.'),
    ('yourData.confirmText', 'The Your data card: the question''s sentence under its heading. What the file holds is listed after it.'),
    ('yourData.fileTaken', 'The Your data card''s question, in the list of what the file holds: when the file was made. {when}: a date and a time, already written the way the reader''s language writes them.'),
    ('yourData.fileAccount', 'The Your data card''s question, in the list of what the file holds: the name of the account the file was taken from. {name}: that name, shown as it is.'),
    ('yourData.fileItems', 'The Your data card''s question, in the list of what the file holds: how many kanji and words are learned in it. {n}: the number.'),
    ('yourData.fileAttempts', 'The Your data card''s question, in the list of what the file holds: how many exam attempts are in it. {n}: the number.'),
    ('yourData.cancel', 'The Your data card''s question: the button that sends nothing and changes nothing.'),
    ('yourData.replace', 'The Your data card''s question: the button that sends the file, which then replaces all of the learner''s data.'),
    ('yourData.done', 'The Your data card, after a file was brought back: the learner''s data is now what the file held.'),
    ('yourData.copyKept', 'The Your data card, after yourData.done in the same line, when the learner had data before: a copy of it was kept on the server.'),
    ('yourData.tooBig', 'The Your data card, when the file picked is bigger than the server takes. {size}: the file''s size, {limit}: the most the server takes, each already written as yourData.megabytes writes it.'),
    ('yourData.megabytes', 'A size of a file in megabytes, inside yourData.tooBig. {n}: the number, already written the way the reader''s language writes numbers ("2.5", "2,5").'),
    ('yourData.notBrought', 'The Your data card, when the file was not brought back. {reason}: a whole sentence of its own, with its capital letter and full stop (one of the error. strings).'),
    -- signOut: what signing out says before something would be lost
    ('signOut.saving', 'The person''s menu in the top bar: what the Sign out item says while the answers and notes still on their way to the server are waited for.'),
    ('signOut.notSaved', 'The browser''s own question box, when Sign out is pressed and some answers or notes could not be saved: signing out loses them. Its OK and Cancel are the browser''s.'),
    ('signOut.examOpen', 'The browser''s own question box, when Sign out is pressed while an exam paper is open and not handed in: signing out loses it. Its OK and Cancel are the browser''s.'),
    -- error: a file brought back that the server did not take
    ('error.too_large', 'A data file brought back on the Your data card was refused because it is bigger than the server takes (when the server does not say how much it takes).'),
    ('error.not_a_data_file', 'A file brought back on the Your data card was refused: it is not a data file of this app, or it is damaged. "Japanese Academy" is the app''s name: never translated, never declined.'),
    ('error.several_people', 'A file brought back on the Your data card was refused: it is a backup of several people, and none of them is the learner.'),
    -- topbar: the anotoki family's bar across the top of every page
    ('topbar.home', 'The top bar: the name of its first link, the anotoki mark with "anotoki Japanese" beside it, which leads to the home page (for a screen reader). "anotoki Japanese" is the app''s name in the anotoki family: never translated, never declined, and the name begins with it.'),
    ('topbar.sections', 'The top bar: the name of the row of its links (Kanji, the exam), for a screen reader.'),
    ('topbar.phoneMenu', 'The top bar on a phone: the name of the round button at its right, which opens the menu with the links and the person''s menu, and of that menu.'),
    ('topbar.phoneMenuDue.one', 'The top bar on a phone: the name of the menu button while reviews are due; the number stands on the button. {count}: how many, 1. Begins as topbar.phoneMenu does.'),
    ('topbar.phoneMenuDue.few', 'The same, for {count} that Slovak counts with "few" (2 to 4).'),
    ('topbar.phoneMenuDue.other', 'The same, for any other {count} (0, 5 and more).'),
    ('topbar.menuButton', 'The top bar: the name of the round button with the person''s initial, which opens their menu (for a screen reader). {name}: the person''s name or address as their account has it, shown as it is; nothing in the sentence may have to agree with it.'),
    ('topbar.menu', 'The top bar: the name of the person''s menu (for a screen reader).'),
    ('topbar.roleAdmin', 'The person''s menu in the top bar: the small tag under their name and address when they are an administrator of the app.'),
    ('topbar.roleEditor', 'The person''s menu in the top bar: the small tag under their name and address when they are an editor of the app''s words.'),
    ('topbar.admin', 'The person''s menu in the top bar, for editors and administrators: the link into the admin area (whose pages are English).'),
    -- theme: the light / dark switch in the top bar
    ('theme.label', 'The top bar: the name of the switch between a light and a dark look (for a screen reader).'),
    ('theme.light', 'The theme switch in the top bar: the name and tooltip of the choice of a light look.'),
    ('theme.dark', 'The theme switch in the top bar: the name and tooltip of the choice of a dark look.'),
    ('theme.system', 'The theme switch in the top bar: the name of the choice that follows the device''s own setting, light or dark.'),
    ('theme.systemHint', 'The theme switch in the top bar: the tooltip of theme.system, which says what it does.')
ON CONFLICT (name) DO NOTHING;

-- English: what every other language falls back to, string by string.
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'en', v.value FROM (VALUES
    -- yourData: the Your data card at the foot of the home page
    ('yourData.title', 'Your data'),
    ('yourData.intro', 'Everything the app keeps of you, as one file: your kanji progress and settings, your answers, your exam attempts and their reports. Take it with you, or bring it back here or to another copy of the app.'),
    ('yourData.timeZone', 'Your days and review times follow your time zone: {zone}.'),
    ('yourData.download', 'Download your data'),
    ('yourData.downloading', 'Preparing the file…'),
    ('yourData.downloadFailed', 'Could not download it: {reason}'),
    ('yourData.bringBack', 'Bring back a file'),
    ('yourData.bringBackNote', 'A file you bring back replaces all your data here. A copy of what you have now is kept on the server first.'),
    ('yourData.bringing', 'Bringing your data back…'),
    ('yourData.confirmTitle', 'Replace your data with this file?'),
    ('yourData.confirmText', 'Everything you have here now (progress, answers, exam attempts) is replaced by what the file holds. A copy of what you have now is kept on the server first.'),
    ('yourData.fileTaken', 'Made on {when}'),
    ('yourData.fileAccount', 'Account: {name}'),
    ('yourData.fileItems', 'Items learned: {n}'),
    ('yourData.fileAttempts', 'Exam attempts: {n}'),
    ('yourData.cancel', 'Cancel'),
    ('yourData.replace', 'Replace my data'),
    ('yourData.done', 'Done: your data is now what the file held.'),
    ('yourData.copyKept', 'A copy of what was here before is kept on the server.'),
    ('yourData.tooBig', 'That file is {size}, and this server takes at most {limit}.'),
    ('yourData.megabytes', '{n} MB'),
    ('yourData.notBrought', 'The file was not brought back: {reason}'),
    -- signOut: what signing out says before something would be lost
    ('signOut.saving', 'Saving…'),
    ('signOut.notSaved', 'Some of your answers or notes could not be saved, and signing out loses them. Sign out anyway?'),
    ('signOut.examOpen', 'Your exam is not finished, and signing out loses the test. Sign out anyway?'),
    -- error: a file brought back that the server did not take
    ('error.too_large', 'That file is bigger than this server takes.'),
    ('error.not_a_data_file', 'That is not a Japanese Academy data file, or it is damaged.'),
    ('error.several_people', 'That file holds the data of several people, and none of them is you.'),
    -- topbar: the anotoki family's bar across the top of every page
    ('topbar.home', 'anotoki Japanese: home'),
    ('topbar.sections', 'The app’s sections'),
    ('topbar.phoneMenu', 'Menu'),
    ('topbar.phoneMenuDue.one', 'Menu: {count} review due'),
    ('topbar.phoneMenuDue.few', 'Menu: {count} reviews due'),
    ('topbar.phoneMenuDue.other', 'Menu: {count} reviews due'),
    ('topbar.menuButton', 'Your menu: {name}'),
    ('topbar.menu', 'Your menu'),
    ('topbar.roleAdmin', 'Administrator'),
    ('topbar.roleEditor', 'Editor'),
    ('topbar.admin', 'Admin'),
    -- theme: the light / dark switch in the top bar
    ('theme.label', 'Theme'),
    ('theme.light', 'Light'),
    ('theme.dark', 'Dark'),
    ('theme.system', 'System'),
    ('theme.systemHint', 'As your device is set')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-- Slovak, informal (ty). A string may leave out a placeholder its English has,
-- never use one it has not.
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'sk', v.value FROM (VALUES
    -- yourData: the Your data card at the foot of the home page
    ('yourData.title', 'Tvoje dáta'),
    ('yourData.intro', 'Všetko, čo si o tebe aplikácia uchováva, v jednom súbore: tvoj pokrok v kanji a nastavenia, tvoje odpovede, tvoje pokusy na skúške a ich správy. Vezmi si ho so sebou alebo ho vráť sem či do inej kópie aplikácie.'),
    ('yourData.timeZone', 'Tvoje dni a časy opakovaní sa riadia tvojím časovým pásmom: {zone}.'),
    ('yourData.download', 'Stiahnuť tvoje dáta'),
    ('yourData.downloading', 'Pripravuje sa súbor…'),
    ('yourData.downloadFailed', 'Nepodarilo sa to stiahnuť: {reason}'),
    ('yourData.bringBack', 'Vrátiť súbor'),
    ('yourData.bringBackNote', 'Súbor, ktorý vrátiš, nahradí všetky tvoje dáta tu. Kópia toho, čo máš teraz, sa najprv uloží na serveri.'),
    ('yourData.bringing', 'Vracajú sa tvoje dáta…'),
    ('yourData.confirmTitle', 'Nahradiť tvoje dáta týmto súborom?'),
    ('yourData.confirmText', 'Všetko, čo tu teraz máš (pokrok, odpovede, pokusy na skúške), sa nahradí obsahom súboru. Kópia toho, čo máš teraz, sa najprv uloží na serveri.'),
    ('yourData.fileTaken', 'Vytvorený {when}'),
    ('yourData.fileAccount', 'Účet: {name}'),
    ('yourData.fileItems', 'Naučené položky: {n}'),
    ('yourData.fileAttempts', 'Pokusy na skúške: {n}'),
    ('yourData.cancel', 'Zrušiť'),
    ('yourData.replace', 'Nahradiť moje dáta'),
    ('yourData.done', 'Hotovo: tvoje dáta sú teraz tie zo súboru.'),
    ('yourData.copyKept', 'Kópia toho, čo tu bolo predtým, je uložená na serveri.'),
    ('yourData.tooBig', 'Ten súbor má {size} a tento server prijme najviac {limit}.'),
    ('yourData.megabytes', '{n} MB'),
    ('yourData.notBrought', 'Súbor sa nepodarilo vrátiť: {reason}'),
    -- signOut: what signing out says before something would be lost
    ('signOut.saving', 'Ukladá sa…'),
    ('signOut.notSaved', 'Niektoré tvoje odpovede alebo poznámky sa nepodarilo uložiť a odhlásením sa stratia. Chceš sa aj tak odhlásiť?'),
    ('signOut.examOpen', 'Tvoja skúška nie je dokončená a odhlásením sa test stratí. Chceš sa aj tak odhlásiť?'),
    -- error: a file brought back that the server did not take
    ('error.too_large', 'Ten súbor je väčší, než tento server prijme.'),
    ('error.not_a_data_file', 'To nie je dátový súbor aplikácie Japanese Academy, alebo je poškodený.'),
    ('error.several_people', 'Ten súbor obsahuje dáta viacerých ľudí a ani jeden z nich nie si ty.'),
    -- topbar: the anotoki family's bar across the top of every page
    ('topbar.home', 'anotoki Japanese: domov'),
    ('topbar.sections', 'Časti aplikácie'),
    ('topbar.phoneMenu', 'Ponuka'),
    ('topbar.phoneMenuDue.one', 'Ponuka: {count} opakovanie čaká'),
    ('topbar.phoneMenuDue.few', 'Ponuka: {count} opakovania čakajú'),
    ('topbar.phoneMenuDue.other', 'Ponuka: {count} opakovaní čaká'),
    ('topbar.menuButton', 'Tvoja ponuka: {name}'),
    ('topbar.menu', 'Tvoja ponuka'),
    ('topbar.roleAdmin', 'Administrátor'),
    ('topbar.roleEditor', 'Editor'),
    ('topbar.admin', 'Administrácia'),
    -- theme: the light / dark switch in the top bar
    ('theme.label', 'Vzhľad'),
    ('theme.light', 'Svetlý'),
    ('theme.dark', 'Tmavý'),
    ('theme.system', 'Systémový'),
    ('theme.systemHint', 'Podľa nastavenia tvojho zariadenia')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-- Reworded, each only while it is the text 004 wrote: a string reworded in
-- the admin area is the owner's, and stays as it is.
UPDATE translations SET value = 'Signing in was not completed. Try again.', updated_at = now() WHERE key_name = 'signIn.notCompleted' AND language_code = 'en' AND value = 'Signing in was not completed. If you did not mean to stop it, this account may have no access to Japanese Academy.';
UPDATE translations SET value = 'Prihlásenie sa nedokončilo. Skús to znova.', updated_at = now() WHERE key_name = 'signIn.notCompleted' AND language_code = 'sk' AND value = 'Prihlásenie sa nedokončilo. Ak to nebol tvoj zámer, tento účet možno nemá do aplikácie Japanese Academy prístup.';
UPDATE translation_keys SET description = 'The Sign in card, after a sign-in that came back without one: the person went back from the account service''s page, or it turned the account away. One sentence that is true either way.' WHERE name = 'signIn.notCompleted';
UPDATE translation_keys SET description = 'The Sign in card, shown instead of the app after a sign-in that came back without one or could not start, or when the session ended while the page was open: the paragraph above the button. "kanji" is a term: never translated, never declined.' WHERE name = 'signIn.intro';

UPDATE translations SET value = 'Your progress is kept with your account.', updated_at = now() WHERE key_name = 'dashboard.saved' AND language_code = 'en' AND value = 'Your progress is saved in the database, with a daily copy in backups/.';
UPDATE translations SET value = 'Tvoj pokrok sa ukladá k tvojmu účtu.', updated_at = now() WHERE key_name = 'dashboard.saved' AND language_code = 'sk' AND value = 'Tvoj pokrok je uložený v databáze a každý deň sa jeho kópia ukladá do priečinka backups/.';
UPDATE translation_keys SET description = 'The foot of the dashboard: where the learner''s progress is kept. The link to the Your data card (dashboard.download) follows.' WHERE name = 'dashboard.saved';

UPDATE translations SET value = 'Your data: download it, or bring a file back', updated_at = now() WHERE key_name = 'dashboard.download' AND language_code = 'en' AND value = 'Download a copy';
UPDATE translations SET value = 'Tvoje dáta: stiahni si ich alebo vráť súbor', updated_at = now() WHERE key_name = 'dashboard.download' AND language_code = 'sk' AND value = 'Stiahnuť kópiu';
UPDATE translation_keys SET description = 'The foot of the dashboard: the link to the Your data card on the home page, where the learner downloads their data as a file or brings one back. A full stop follows it.' WHERE name = 'dashboard.download';

UPDATE translations SET value = 'Your anotoki account', updated_at = now() WHERE key_name = 'account.yourAccount' AND language_code = 'en' AND value = 'Your account';
UPDATE translations SET value = 'Tvoj účet anotoki', updated_at = now() WHERE key_name = 'account.yourAccount' AND language_code = 'sk' AND value = 'Tvoj účet';
UPDATE translation_keys SET description = 'The person''s menu in the top bar: the link to their own page at the anotoki account service, which opens in a new tab. "anotoki" is a name: never translated, never declined.' WHERE name = 'account.yourAccount';

UPDATE translations SET value = 'Language: {name} ({code})', updated_at = now() WHERE key_name = 'language.button' AND language_code = 'en' AND value = 'Language: {name}';
UPDATE translations SET value = 'Jazyk: {name} ({code})', updated_at = now() WHERE key_name = 'language.button' AND language_code = 'sk' AND value = 'Jazyk: {name}';
UPDATE translation_keys SET description = 'The name of the language chooser in the top bar, for a screen reader and as its tooltip. {name}: the language on the page as its own speakers write it ("Slovenčina"), never translated. {code}: the code the button shows ("SK"); keep it in the sentence, for somebody who speaks to their computer and says what they see.' WHERE name = 'language.button';

UPDATE translation_keys SET description = 'The person''s menu in the top bar: what stands in place of their name when their account has neither a name nor an email address.' WHERE name = 'account.noName';
UPDATE translation_keys SET description = 'The person''s menu in the top bar: the item that signs the person out.' WHERE name = 'account.signOut';
UPDATE translation_keys SET description = 'The Sign in page: its one button, which goes to the account service to sign in; and the button that does the same in the top bar beside it (in the menu on a phone).' WHERE name = 'signIn.button';
UPDATE translation_keys SET description = 'The heading of the dialog that lists what changed in each version, and the button at the foot of every page, after the version, that opens it.' WHERE name = 'whatsNew.title';
UPDATE translation_keys SET description = 'The tooltip of the small dot beside "What’s new" at the foot of the page: this version''s changes have not been opened yet.' WHERE name = 'whatsNew.unseen';
UPDATE translation_keys SET description = 'The top bar: the link to the exam, beside the link "Kanji" (a term, never translated); on a phone, in the menu.' WHERE name = 'topbar.exam';

UPDATE translation_keys SET description = 'The browser''s own message box when an exam report could not be had. {reason}: a whole sentence of its own, with its capital letter and full stop — report.notFound, or the general "Something went wrong."' WHERE name = 'report.openFailed';

-- Nothing asks for these any more.
DELETE FROM translation_keys WHERE name IN ('error.no_access', 'error.this_computer_only', 'account.signedInAs', 'account.userId');

-- -------------------------------------------------------------- the check

-- The column is there, of the size the app keeps a name in, and empty: no
-- row got a zone it did not bring itself. Then the words.
DO $$
DECLARE
    missing text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'time_zone'
                      AND data_type = 'character varying' AND character_maximum_length = 64 AND is_nullable = 'YES') THEN
        RAISE EXCEPTION '005_own_time_zone_and_words: users.time_zone is not there as a varchar(64) that may be null';
    END IF;

    IF EXISTS (SELECT 1 FROM users WHERE time_zone IS NOT NULL) THEN
        RAISE EXCEPTION '005_own_time_zone_and_words: a person has a time zone nobody named';
    END IF;

    -- Every key of this file is here and reads in both languages: a page never
    -- shows a key, and Slovak never falls back to English by accident.
    SELECT string_agg(k.name, ', ' ORDER BY k.name) INTO missing
      FROM (VALUES
          ('yourData.title'), ('yourData.intro'), ('yourData.timeZone'), ('yourData.download'),
          ('yourData.downloading'), ('yourData.downloadFailed'), ('yourData.bringBack'),
          ('yourData.bringBackNote'), ('yourData.bringing'), ('yourData.confirmTitle'),
          ('yourData.confirmText'), ('yourData.fileTaken'), ('yourData.fileAccount'), ('yourData.fileItems'),
          ('yourData.fileAttempts'), ('yourData.cancel'), ('yourData.replace'), ('yourData.done'),
          ('yourData.copyKept'), ('yourData.tooBig'), ('yourData.megabytes'), ('yourData.notBrought'),
          ('signOut.saving'), ('signOut.notSaved'), ('signOut.examOpen'),
          ('error.too_large'), ('error.not_a_data_file'), ('error.several_people'),
          ('topbar.home'), ('topbar.sections'), ('topbar.phoneMenu'), ('topbar.phoneMenuDue.one'),
          ('topbar.phoneMenuDue.few'), ('topbar.phoneMenuDue.other'), ('topbar.menuButton'), ('topbar.menu'),
          ('topbar.roleAdmin'), ('topbar.roleEditor'), ('topbar.admin'),
          ('theme.label'), ('theme.light'), ('theme.dark'), ('theme.system'), ('theme.systemHint')
      ) AS k(name)
     WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.name)
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'en')
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'sk');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '005_own_time_zone_and_words: keys without an English and a Slovak string: %', missing;
    END IF;

    -- The keys nothing sends any more are gone, and their strings with them.
    SELECT string_agg(gone.name, ', ' ORDER BY gone.name) INTO missing
      FROM (VALUES ('error.no_access'), ('error.this_computer_only'), ('account.signedInAs'), ('account.userId')) AS gone(name)
     WHERE EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = gone.name)
        OR EXISTS (SELECT 1 FROM translations t WHERE t.key_name = gone.name);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '005_own_time_zone_and_words: keys that should be gone and are not: %', missing;
    END IF;

    -- No reworded string is still the text 004 wrote (the owner's own
    -- rewording is not that text either, and stays).
    SELECT string_agg(t.key_name || ' (' || t.language_code || ')', ', ' ORDER BY t.key_name, t.language_code) INTO missing
      FROM translations t
      JOIN (VALUES
          ('signIn.notCompleted', 'en', 'Signing in was not completed. If you did not mean to stop it, this account may have no access to Japanese Academy.'),
          ('signIn.notCompleted', 'sk', 'Prihlásenie sa nedokončilo. Ak to nebol tvoj zámer, tento účet možno nemá do aplikácie Japanese Academy prístup.'),
          ('dashboard.saved', 'en', 'Your progress is saved in the database, with a daily copy in backups/.'),
          ('dashboard.saved', 'sk', 'Tvoj pokrok je uložený v databáze a každý deň sa jeho kópia ukladá do priečinka backups/.'),
          ('dashboard.download', 'en', 'Download a copy'),
          ('dashboard.download', 'sk', 'Stiahnuť kópiu'),
          ('account.yourAccount', 'en', 'Your account'),
          ('account.yourAccount', 'sk', 'Tvoj účet'),
          ('language.button', 'en', 'Language: {name}'),
          ('language.button', 'sk', 'Jazyk: {name}')
      ) AS seeded(key_name, language_code, value)
        ON t.key_name = seeded.key_name AND t.language_code = seeded.language_code AND t.value = seeded.value;
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '005_own_time_zone_and_words: strings still as 004 wrote them: %', missing;
    END IF;
END $$;

-- end of 005
