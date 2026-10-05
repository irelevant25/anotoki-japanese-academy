<?php
// Each person's own time zone: the one their browser names (X-Time-Zone) is
// the request's, and is kept on their row for a request that names none;
// without either, UTC. Every day and hour of theirs follows it; the site's own
// housekeeping is UTC. None of it depends on when the tests run: in process
// the clock is given, and on the server the zones are Pacific/Kiritimati
// (UTC+14) and Pacific/Pago_Pago (UTC-11), whose dates differ at every moment.
declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and backup folder

const KIRITIMATI = 'Pacific/Kiritimati';
const PAGO_PAGO = 'Pacific/Pago_Pago';

/** People of this file's server, each named for what they do. */
const FAR_EAST = 601;
const FAR_WEST = 602;
const TRAVELLER = 603;
const NEVER_SAID = 604;
const IN_INDIA = 605;
const ICU_LACKS = 606;

$GLOBALS['app'] = null;
before(function (): void {
    $GLOBALS['app'] = start_app();
});

/** A request as $user, naming $zone (or no zone at all). */
function in_zone(int $user, ?string $zone, string $method, string $url, $body = null): array
{
    $headers = test_bearer(test_token($user));
    if ($zone !== null) {
        $headers[] = "X-Time-Zone: $zone";
    }
    return call($GLOBALS['app']['base'], $method, $url, $body, $headers);
}

/** Today's date in $zone, now. */
function day_in(string $zone): string
{
    return (new DateTimeImmutable('now', new DateTimeZone($zone)))->format('Y-m-d');
}

/** The kanji of the course, in order: each always open to learn. */
function kanji_ids(): array
{
    return array_column(db_all("SELECT id FROM srs_items WHERE type = 'kanji' ORDER BY ord LIMIT 12"), 'id');
}

/** A person's day counts: day => lessons. */
function lessons_by_day(int $user): array
{
    return array_map(static fn (array $d): int => $d['lessons'], store_daily($user));
}

function zone_of(int $user): ?string
{
    return db_value('SELECT time_zone FROM users WHERE id = ?', [$user]);
}

/* ------------------------------------------------- in process, the clock given */

test('the same moment is two days in two zones: the day an answer counts on, today, the forecast, a report\'s date', function (): void {
    $t = ms_of(new DateTimeImmutable('2026-10-04T23:30:00Z'));
    users_ensure(701);
    users_ensure(702);
    try {
        date_default_timezone_set('Asia/Tokyo'); // 2026-10-05 08:30
        store_bump_daily(701, 'lesson', true, $t);
        $tokyoWhen = report_when($t, false);
        date_default_timezone_set('America/New_York'); // 2026-10-04 19:30
        store_bump_daily(702, 'lesson', true, $t);
        $newYorkWhen = report_when($t, false);
        assert_same(['2026-10-05'], array_keys(store_daily(701)), 'Tokyo: the next day already');
        assert_same(['2026-10-04'], array_keys(store_daily(702)), 'New York: still the day before');
        assert_true($tokyoWhen !== $newYorkWhen, "a report's date is the reader's: $tokyoWhen / $newYorkWhen");

        // A review due at 06:00 UTC on the 5th: later today in Tokyo, tomorrow in New York.
        store_put(701, 'k:大', array_merge(srs_learn(null, $t - 4 * HOUR_MS), ['stage' => 3, 'nextReview' => ms_of(new DateTimeImmutable('2026-10-05T06:00:00Z'))]));
        date_default_timezone_set('Asia/Tokyo');
        $tokyo = kanji_summarize(701, $t);
        date_default_timezone_set('America/New_York');
        $newYork = kanji_summarize(701, $t);
        assert_same(1, $tokyo['today']['lessons'], 'Tokyo’s today is the 5th, which has the lesson');
        assert_same(0, $newYork['today']['lessons'], 'New York’s today is the 4th, which has none of this person’s');
        assert_same([1, 0], array_slice($tokyo['forecastDays'], 0, 2), 'Tokyo: due today');
        assert_same([0, 1], array_slice($newYork['forecastDays'], 0, 2), 'New York: due tomorrow');
        assert_same($tokyo['forecastHours'], $newYork['forecastHours'], 'hours from now are the same everywhere');

        // The site's own housekeeping says UTC, whatever zone is in force.
        assert_same('2026-10-04', utc_date($t));
        assert_same('20261004-233000-000', utc_stamp($t));
    } finally {
        date_default_timezone_set('UTC');
    }
});

test('the forecast days are named by the person\'s dates, right next to a change of summer time too', function (): void {
    $at = static fn (string $iso): int => ms_of(new DateTimeImmutable($iso));
    users_ensure(703);
    try {
        date_default_timezone_set('Europe/Bratislava');
        // 2026-10-25 00:30 CEST, the 25-hour day: steps of 24 hours from now land on the 26th at 23:30 CET for day 2.
        $fall = kanji_summarize(703, $at('2026-10-24T22:30:00Z'));
        assert_same(['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'], $fall['forecastDates']);
        // 2027-03-27 23:30 CET, the night before the 23-hour day: from day 2 on, steps from now are a day ahead.
        $spring = kanji_summarize(703, $at('2027-03-27T22:30:00Z'));
        assert_same(['2027-03-27', '2027-03-28', '2027-03-29', '2027-03-30', '2027-03-31', '2027-04-01', '2027-04-02'], $spring['forecastDates']);
        // The same moment elsewhere: the dates are that person's.
        date_default_timezone_set('Asia/Tokyo');
        assert_same('2027-03-28', kanji_summarize(703, $at('2027-03-27T22:30:00Z'))['forecastDates'][0]);
    } finally {
        date_default_timezone_set('UTC');
    }
});

test('a review time is rounded down to the hour of the person\'s zone: a half-hour zone gives :30 in UTC', function (): void {
    $t = ms_of(new DateTimeImmutable('2026-10-04T10:47:00Z'));
    $at = static fn (string $iso): int => ms_of(new DateTimeImmutable($iso));
    try {
        date_default_timezone_set('Asia/Kolkata'); // UTC+05:30: 16:17 there
        assert_same($at('2026-10-04T10:30:00Z'), srs_floor_hour($t), '16:00 in Kolkata');
        assert_same($at('2026-10-04T14:30:00Z'), srs_next_review_at(1, $t), 'Apprentice I: four hours on, rounded down there');
        date_default_timezone_set('Asia/Kathmandu'); // UTC+05:45
        assert_same($at('2026-10-04T10:15:00Z'), srs_floor_hour($t));
        date_default_timezone_set('UTC');
        assert_same($at('2026-10-04T10:00:00Z'), srs_floor_hour($t));
    } finally {
        date_default_timezone_set('UTC');
    }
});

test('a zone is an IANA name PHP knows, written exactly so; anything else is no zone', function (): void {
    foreach (['Europe/Bratislava', 'UTC', 'Asia/Kolkata', KIRITIMATI, 'America/Argentina/Buenos_Aires', 'US/Eastern'] as $zone) {
        assert_same($zone, time_zone_known($zone), $zone);
    }
    foreach (['europe/bratislava', 'Mars/Olympus', '+02:00', 'GMT+2', '../../etc/passwd', '', ' UTC', str_repeat('A/', 40), "UTC\n", null, 2, ['UTC']] as $bad) {
        assert_same(null, time_zone_known($bad), json_encode($bad));
    }
    assert_same('Asia/Tokyo', auth_time_zone_header(['HTTP_X_TIME_ZONE' => ' Asia/Tokyo ']), 'the header, trimmed');
    assert_same(null, auth_time_zone_header(['HTTP_X_TIME_ZONE' => 'Asia/Nowhere']));
    assert_same(null, auth_time_zone_header([]));
});

/** The zones this PHP knows and its ICU (intl) does not: each comes with its own zone data (none, when they agree). */
function zones_only_php_knows(): array
{
    return array_values(array_filter(DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC), static fn (string $z): bool => !time_zone_icu_knows($z)));
}

test('a zone ICU does not know is no zone, and a report is dated whatever the zone in force: never a failure', function (): void {
    // Every zone taken can date a report (IntlDateFormatter throws for a zone ICU does not know).
    $t = ms_of(new DateTimeImmutable('2026-10-04T23:30:00Z'));
    foreach (DateTimeZone::listIdentifiers(DateTimeZone::ALL_WITH_BC) as $zone) {
        if (time_zone_known($zone) !== null) {
            report_format($t, true, $zone);
        }
    }
    // A name neither knows: UTC.
    assert_same('UTC', report_icu_zone('Mars/Olympus', $t));
    assert_same(report_format($t, true, 'UTC'), report_format($t, true, 'Mars/Olympus'));

    $only = zones_only_php_knows();
    if (!$only) {
        echo '      (this PHP\'s ICU knows every zone PHP knows: nothing more to see here)' . "\n";
        return;
    }
    // America/Coyhaique with PHP 8.5.10 and ICU 77.1; more where ICU is older than PHP.
    foreach ($only as $zone) {
        assert_same(null, time_zone_known($zone), "$zone: PHP knows it, ICU does not");
        assert_same(null, auth_time_zone_header(['HTTP_X_TIME_ZONE' => $zone]));
        $offset = 'GMT' . (new DateTimeImmutable('@' . intdiv($t, 1000)))->setTimezone(new DateTimeZone($zone))->format('P');
        assert_same($offset, report_icu_zone($zone, $t), "$zone: dated at its offset then");
        try {
            date_default_timezone_set($zone); // PHP's zone, as if it came from elsewhere
            assert_same(report_format($t, true, $offset), report_when($t), $zone);
            assert_same(report_format($t, false, $offset), report_when($t, false), $zone);
        } finally {
            date_default_timezone_set('UTC');
        }
    }
});

/* ---------------------------------------------------------------- the server */

test('two people far apart: the same moment\'s answers count on different days, each on the day of their own zone', function (): void {
    [$first] = kanji_ids();
    $east = [day_in(KIRITIMATI)];
    $west = [day_in(PAGO_PAGO)];
    assert_same(200, in_zone(FAR_EAST, KIRITIMATI, 'POST', '/api/kanji/learn', ['id' => $first])['status']);
    assert_same(200, in_zone(FAR_WEST, PAGO_PAGO, 'POST', '/api/kanji/learn', ['id' => $first])['status']);
    $east[] = day_in(KIRITIMATI);
    $west[] = day_in(PAGO_PAGO);

    $eastDay = array_keys(lessons_by_day(FAR_EAST));
    $westDay = array_keys(lessons_by_day(FAR_WEST));
    assert_same(1, count($eastDay));
    assert_true(in_array($eastDay[0], $east, true), 'Kiritimati’s day: ' . $eastDay[0]);
    assert_true(in_array($westDay[0], $west, true), 'Pago Pago’s day: ' . $westDay[0]);
    assert_true($eastDay[0] !== $westDay[0], 'never the same day: they are 25 hours apart');
    assert_same([KIRITIMATI, PAGO_PAGO], [zone_of(FAR_EAST), zone_of(FAR_WEST)], 'each kept with the person');

    $summary = in_zone(FAR_EAST, KIRITIMATI, 'GET', '/api/kanji/summary')['body'];
    assert_same(1, $summary['today']['lessons'], 'and it is their today');
    assert_same(0, in_zone(FAR_WEST, KIRITIMATI, 'GET', '/api/kanji/summary')['body']['today']['lessons'],
        'the west’s lesson seen from Kiritimati’s day: another day');
});

test('somebody whose browser never names a zone is counted in UTC, and nothing is kept for them', function (): void {
    [, $second] = kanji_ids();
    $utc = [utc_date()];
    $r = in_zone(NEVER_SAID, null, 'POST', '/api/kanji/learn', ['id' => $second]);
    $utc[] = utc_date();
    assert_same(200, $r['status']);
    assert_true(in_array(array_keys(lessons_by_day(NEVER_SAID))[0], $utc, true));
    assert_same(0, (int) ($r['body']['state']['nextReview'] % HOUR_MS), 'the next review on a UTC hour');
    assert_same(null, zone_of(NEVER_SAID));
});

test('a review time is rounded to the hour of the person’s zone, on the server too', function (): void {
    [, , $third] = kanji_ids();
    $r = in_zone(IN_INDIA, 'Asia/Kolkata', 'POST', '/api/kanji/learn', ['id' => $third]);
    assert_same(200, $r['status']);
    assert_same(30 * 60 * 1000, $r['body']['state']['nextReview'] % HOUR_MS, 'an hour of Kolkata begins at half past, in UTC');
});

test('the zone is kept when it changes, and only then; a request without one uses the kept one; a bad one is no zone', function (): void {
    $xmin = static fn (): string => (string) db_value('SELECT xmin::text FROM users WHERE id = ?', [FAR_EAST]);
    $before = $xmin();
    assert_same(200, in_zone(FAR_EAST, KIRITIMATI, 'GET', '/api/kanji/summary')['status']);
    assert_same($before, $xmin(), 'the same zone again: the row is not written');
    assert_same(200, in_zone(FAR_EAST, PAGO_PAGO, 'GET', '/api/kanji/summary')['status']);
    assert_true($before !== $xmin(), 'another zone: written');
    assert_same(PAGO_PAGO, zone_of(FAR_EAST));

    foreach (['Mars/Olympus', '+14:00', 'pacific/kiritimati', '../../../etc/passwd', str_repeat('x', 100), ''] as $bad) {
        assert_same(200, in_zone(FAR_EAST, $bad, 'GET', '/api/kanji/summary')['status'], $bad);
        assert_same(PAGO_PAGO, zone_of(FAR_EAST), "$bad: ignored, the kept zone stays");
    }
    assert_same(200, in_zone(FAR_EAST, KIRITIMATI, 'GET', '/api/kanji/summary')['status']);
    assert_same(KIRITIMATI, zone_of(FAR_EAST));
});

test('a learner who travels: each answer counts on the day of the zone they were in; today is the new zone\'s', function (): void {
    $ids = array_slice(kanji_ids(), 4, 3);
    // Two lessons far east, one far west (a long flight between them).
    assert_same(200, in_zone(TRAVELLER, KIRITIMATI, 'POST', '/api/kanji/learn', ['id' => $ids[0]])['status']);
    assert_same(200, in_zone(TRAVELLER, KIRITIMATI, 'POST', '/api/kanji/learn', ['id' => $ids[1]])['status']);
    $eastDay = day_in(KIRITIMATI);
    assert_same(200, in_zone(TRAVELLER, PAGO_PAGO, 'POST', '/api/kanji/learn', ['id' => $ids[2]])['status']);
    $westDay = day_in(PAGO_PAGO);
    $days = lessons_by_day(TRAVELLER);
    assert_same(2, $days[$eastDay] ?? null, 'the first two on Kiritimati’s day, as they were');
    assert_same(1, $days[$westDay] ?? null, 'the third on Pago Pago’s');
    assert_same(PAGO_PAGO, zone_of(TRAVELLER));

    $today = static fn (?string $zone): int => in_zone(TRAVELLER, $zone, 'GET', '/api/kanji/summary')['body']['today']['lessons'];
    assert_same(1, $today(null), 'no zone named: the kept one, the west’s');
    assert_same(2, $today(KIRITIMATI), 'back east: that day, as it was counted');
    assert_same(2, $today(null), 'and that is the kept zone now');
    assert_same(2, count(lessons_by_day(TRAVELLER)), 'nothing was moved from one day to another');
});

test('the day’s backup is named by the UTC day, whoever’s page load takes it', function (): void {
    $today = backup_dir() . '/academy-' . utc_date() . '.json';
    @unlink($today);
    $loads = [];
    foreach ([KIRITIMATI, PAGO_PAGO] as $zone) {
        $loads[$zone] = day_in($zone);
        assert_same(200, in_zone(FAR_EAST, $zone, 'GET', '/api/kanji/summary')['status']);
    }
    assert_true(is_file($today), 'the UTC day’s copy');
    foreach ($loads as $zone => $day) {
        if ($day !== utc_date()) {
            assert_false(is_file(backup_dir() . "/academy-$day.json"), "never {$zone}’s day");
        }
    }
});

test('a stored exam report says its date and time in the zone of the person who took it', function (): void {
    $paper = in_zone(FAR_WEST, PAGO_PAGO, 'POST', '/api/exam', ['size' => 20, 'seed' => 'zones'])['body'];
    $key = exam_paper(exam_normalize_spec($paper['spec']));
    $responses = [];
    foreach ($key['questions'] as $q) {
        $responses[$q['id']] = ['choice' => $q['answerIndex'], 'ms' => 400];
    }
    $r = in_zone(FAR_WEST, PAGO_PAGO, 'POST', '/api/submit', ['spec' => $paper['spec'], 'responses' => $responses]);
    assert_same(200, $r['status']);
    $finished = ms_from_iso(in_zone(FAR_WEST, PAGO_PAGO, 'GET', '/api/attempts')['body'][0]['finishedAt']);
    $report = in_zone(FAR_WEST, KIRITIMATI, 'GET', $r['body']['reportUrl'])['raw'];
    try {
        date_default_timezone_set(PAGO_PAGO);
        $theirs = report_when($finished);
        date_default_timezone_set(KIRITIMATI);
        $elsewhere = report_when($finished);
    } finally {
        date_default_timezone_set('UTC');
    }
    assert_true(str_contains($report, report_esc($theirs)), "the time it was taken, in Pago Pago: $theirs");
    assert_false(str_contains($report, report_esc($elsewhere)), 'as it was written: reading it from elsewhere changes nothing');
    assert_same([], server_problems($GLOBALS['app']), 'no PHP warnings or errors on the server');
});

test('a zone only PHP knows, named or kept from before: the exam is stored all the same, its report dated in UTC', function (): void {
    $only = zones_only_php_knows();
    if (!$only) {
        echo '      (this PHP\'s ICU knows every zone PHP knows: nothing more to see here)' . "\n";
        return;
    }
    $zone = $only[0];
    users_ensure(ICU_LACKS);
    db_exec('UPDATE users SET time_zone = ? WHERE id = ?', [$zone, ICU_LACKS]); // kept by an earlier version that took it
    foreach ([null, $zone] as $named) {
        $paper = in_zone(ICU_LACKS, $named, 'POST', '/api/exam', ['size' => 20, 'seed' => 'icu ' . json_encode($named)])['body'];
        $r = in_zone(ICU_LACKS, $named, 'POST', '/api/submit', ['spec' => $paper['spec'], 'responses' => []]);
        assert_same(200, $r['status'], ($named ?? 'no zone named') . ': ' . $r['raw']);
        assert_same(200, in_zone(ICU_LACKS, $named, 'GET', $r['body']['reportUrl'])['status']);
    }
    assert_same(2, count(in_zone(ICU_LACKS, null, 'GET', '/api/attempts')['body']), 'both stored');
    assert_same($zone, zone_of(ICU_LACKS), 'a zone that is none is never written, nor the kept one rewritten');
    assert_same([], server_problems($GLOBALS['app']), 'no PHP warnings or errors on the server');
});

test('a database without the column (migration 005 still on its way): the zone counts for the request, nothing is kept, nothing breaks', function (): void {
    // What a site does while its upload's 005 has not arrived whole: the new code, a database without the
    // column. (That such a file waits is deploy.test.php's to show, on a site's copy: no test writes into
    // backend/migrations. Here 005 stays recorded, so nothing applies it, and only its column is gone.)
    db_exec('ALTER TABLE users DROP COLUMN time_zone');
    $old = start_app(['env' => ['ACADEMY_MIGRATION_DRAFTS' => '']]);
    $as = static function (int $user, ?string $zone, string $method, string $url, $body = null) use ($old): array {
        $headers = test_bearer(test_token($user, $user === FAR_EAST ? ['ADMIN'] : []));
        if ($zone !== null) {
            $headers[] = "X-Time-Zone: $zone";
        }
        return call($old['base'], $method, $url, $body, $headers);
    };
    $ids = array_slice(kanji_ids(), 8, 2);
    $before = [day_in(PAGO_PAGO)];
    assert_same(200, $as(NEVER_SAID, PAGO_PAGO, 'POST', '/api/kanji/learn', ['id' => $ids[0]])['status']);
    $before[] = day_in(PAGO_PAGO);
    assert_same(null, db_value("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'time_zone'"), 'no column made');
    $days = array_keys(lessons_by_day(NEVER_SAID));
    assert_true((bool) array_intersect($days, $before), 'the request’s zone counted all the same: ' . implode(', ', $days));
    assert_same(200, $as(NEVER_SAID, null, 'GET', '/api/kanji/summary')['status'], 'no zone, none kept: UTC');
    $file = $as(NEVER_SAID, PAGO_PAGO, 'GET', '/api/me/data');
    assert_same([200, null], [$file['status'], $file['body']['users'][0]['timeZone'] ?? null], 'the data file, without a zone');
    assert_same(200, $as(NEVER_SAID, KIRITIMATI, 'PUT', '/api/me/data', $file['body'])['status'], 'and back');
    assert_same(200, $as(FAR_EAST, null, 'GET', '/api/admin/people')['status'], 'the People page');
    assert_same([], server_problems($old), 'no PHP warnings or errors on the server');
});
