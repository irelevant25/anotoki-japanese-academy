<?php
/**
 * Renders a standalone HTML report for one attempt.
 * No external assets, so the page can be saved, mailed or printed as-is.
 */

declare(strict_types=1);

function report_esc($s): string
{
    $s = $s === null ? '' : (is_string($s) ? $s : js_string($s));
    return strtr($s, ['&' => '&amp;', '<' => '&lt;', '>' => '&gt;', '"' => '&quot;', "'" => '&#39;']);
}

function report_duration(float $ms): string
{
    $s = (int) js_round($ms / 1000);
    $h = intdiv($s, 3600);
    $m = intdiv($s % 3600, 60);
    $sec = $s % 60;
    return $h ? "{$h}h {$m}m {$sec}s" : ($m ? "{$m}m {$sec}s" : "{$sec}s");
}

/** Date and time in this computer's locale, as the browser's toLocaleString() shows them. */
function report_when(int $ms, bool $withTime = true): string
{
    static $formatters = [];
    $skeleton = $withTime ? 'yMdjms' : 'yMd';
    $formatters[$skeleton] ??= new IntlDateFormatter(
        Locale::getDefault(),
        IntlDateFormatter::NONE,
        IntlDateFormatter::NONE,
        date_default_timezone_get(),
        null,
        (new IntlDatePatternGenerator(Locale::getDefault()))->getBestPattern($skeleton)
    );
    return (string) $formatters[$skeleton]->format((int) floor($ms / 1000));
}

/** "Part 1 — L3–L6" — what the paper actually covered. */
function report_scope(array $exam): string
{
    $lessons = $exam['lessons'] ?? 'all';
    $ls = $lessons === 'all' ? null : array_map('js_number', (array) $lessons);
    if (!$ls) {
        return 'Parts 1 and 2 — Greetings and Lessons 1–23';
    }
    $sorted = array_values(array_unique($ls, SORT_REGULAR));
    sort($sorted);
    $label = static fn ($n): string => $n === 0 ? 'Greetings' : 'L' . js_string($n);
    // collapse runs: 1,2,3,5 -> L1–L3, L5
    $parts = [];
    $start = $prev = $sorted[0];
    foreach (array_slice($sorted, 1) as $n) {
        if ($n === $prev + 1) {
            $prev = $n;
            continue;
        }
        $parts[] = $start === $prev ? $label($start) : $label($start) . '–' . $label($prev);
        $start = $prev = $n;
    }
    $parts[] = $start === $prev ? $label($start) : $label($start) . '–' . $label($prev);
    $books = [];
    if (array_filter($sorted, static fn ($n): bool => $n <= 12)) {
        $books[] = 'Part 1';
    }
    if (array_filter($sorted, static fn ($n): bool => $n >= 13)) {
        $books[] = 'Part 2';
    }
    return implode(' + ', $books) . ' — ' . implode(', ', $parts);
}

function report_bar(float $pct, int $total, int $right): string
{
    $p = (int) js_round($pct);
    $cls = $p >= 80 ? 'good' : ($p >= 60 ? 'ok' : 'bad');
    return "<div class=\"bar\"><div class=\"fill {$cls}\" style=\"width:{$p}%\"></div>
    <span class=\"barlabel\">{$p}% <em>({$right}/{$total})</em></span></div>";
}

/**
 * @param array $attempt the stored attempt (id, finishedAt, meta, exam)
 * @param array $result  score_attempt()'s result
 * @param array $history every attempt, oldest first, this one included
 */
function report_render(array $attempt, array $result, array $history): string
{
    $meta = is_array($attempt['meta'] ?? null) ? $attempt['meta'] : [];
    $when = ms_from_iso($attempt['finishedAt'] ?? null) ?? now_ms();

    $rows = static fn (array $groups): string => implode('', array_map(static fn (array $g): string => '<tr>
        <td class="name">' . report_esc($g['name']) . '</td>
        <td class="barcell">' . report_bar($g['pct'], $g['total'], $g['right']) . '</td>
      </tr>', $groups));

    $sectionRows = $rows($result['bySection']);
    $lessonRows = $rows($result['byLesson']);

    // Only worth a section of its own when the paper spanned both books.
    $bookRows = count($result['byBook'] ?? []) > 1
        ? '<section class="card">
        <h2>By part</h2>
        <table>' . implode('', array_map(static fn (array $b): string => '<tr>
              <td class="name">' . report_esc($b['name']) . '</td>
              <td class="barcell">' . report_bar($b['pct'], $b['total'], $b['right']) . '</td>
            </tr>', $result['byBook'])) . '</table>
      </section>'
        : '';

    $missed = array_values(array_filter($result['rows'], static fn (array $r): bool => !$r['correct']));
    $missedBySection = [];
    foreach ($missed as $r) {
        $missedBySection[$r['sectionName']][] = $r;
    }

    $missedHtml = $missed
        ? implode('', array_map(static fn (string $name, array $rs): string => '
      <h3 class="subhead">' . report_esc($name) . ' <span class="count">' . count($rs) . '</span></h3>
      ' . implode('', array_map(static fn (array $r): string => '<div class="miss">
            <div class="q"><span class="qn">Q' . $r['n'] . '</span> ' . report_esc($r['question']) . '
              ' . (js_truthy($r['hint']) ? '<span class="hint">' . report_esc($r['hint']) . '</span>' : '') . '</div>
            <div class="ans">
              <div class="yours">Your answer: <b>' . ($r['chosenAnswer'] === null
                ? '<i class="blank">not answered</i>'
                : report_esc($r['chosenAnswer'])) . '</b></div>
              <div class="right">Correct: <b>' . report_esc($r['correctAnswer']) . '</b></div>
            </div>
            <div class="why">' . report_esc($r['explain']) . (js_truthy($r['ref']) ? ' <span class="ref">' . report_esc($r['ref']) . '</span>' : '') . '</div>
          </div>', $rs)), array_map('strval', array_keys($missedBySection)), array_values($missedBySection)))
        : '<p class="perfect">Nothing missed — a clean paper.</p>';

    $advice = [];
    if ($result['weakSections']) {
        $advice[] = 'Weakest skills: ' . implode(', ', array_map(static fn (array $s): string => '<b>' . report_esc($s['name']) . '</b> (' . js_round($s['pct']) . '%)', $result['weakSections'])) . '.';
    }
    if ($result['weakLessons']) {
        $advice[] = 'Lessons to revisit: ' . implode(', ', array_map(static fn (array $l): string => '<b>' . report_esc($l['name']) . '</b> (' . js_round($l['pct']) . '%)', $result['weakLessons'])) . '.';
    }
    if ($result['unanswered']) {
        $advice[] = "{$result['unanswered']} question(s) were left unanswered.";
    }
    if (!$advice) {
        $advice[] = 'No section fell below 60% — coverage is even across the book.';
    }

    $historyHtml = count($history) > 1
        ? '<section>
      <h2>Attempt history</h2>
      <table class="hist">
        <thead><tr><th>Date</th><th>Questions</th><th>Score</th><th>Grade</th><th>Result</th></tr></thead>
        <tbody>' . implode('', array_map(static fn (array $h): string => '<tr' . ($h['id'] === $attempt['id'] ? ' class="current"' : '') . '>
              <td>' . report_esc(report_when(ms_from_iso($h['finishedAt']) ?? 0)) . '</td>
              <td>' . $h['total'] . '</td>
              <td>' . js_string($h['pct']) . '%</td>
              <td>' . report_esc($h['grade']) . '</td>
              <td class="' . ($h['passed'] ? 'pass' : 'fail') . '">' . ($h['passed'] ? 'PASS' : 'FAIL') . '</td>
            </tr>', $history)) . '</tbody>
      </table>
    </section>'
        : '';

    $passed = $result['passed'];
    $candidate = report_esc(js_truthy($meta['candidate'] ?? null) ? $meta['candidate'] : 'Unnamed candidate');
    $pct = js_string($result['pct']);
    $perQuestion = js_to_fixed($result['avgMs'] / 1000, 1);

    return '<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Exam report — ' . report_esc(report_when($when, false)) . '</title>
<style>
  :root{
    --bg:#f6f5f2; --card:#fff; --ink:#1d1d1f; --muted:#6b6b70; --line:#e3e1dc;
    --good:#2e7d5b; --ok:#b8862b; --bad:#b4453c; --accent:#3a5f8a;
  }
  *{box-sizing:border-box}
  body{margin:0;padding:32px 16px;background:var(--bg);color:var(--ink);
    font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,
      "Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo",sans-serif;}
  .wrap{max-width:880px;margin:0 auto}
  header{margin-bottom:24px}
  h1{font-size:26px;margin:0 0 4px}
  .sub{color:var(--muted);font-size:14px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;
    padding:22px;margin-bottom:20px}
  .verdict{display:flex;align-items:center;gap:22px;flex-wrap:wrap}
  .score{font-size:52px;font-weight:700;line-height:1}
  .score small{font-size:20px;font-weight:500;color:var(--muted)}
  .stamp{font-size:15px;font-weight:700;letter-spacing:.08em;padding:8px 16px;
    border-radius:6px;border:2px solid}
  .stamp.pass{color:var(--good);border-color:var(--good);background:#eaf5ef}
  .stamp.fail{color:var(--bad);border-color:var(--bad);background:#fdeeed}
  .facts{display:flex;gap:26px;flex-wrap:wrap;margin-left:auto;text-align:right}
  .fact .k{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
  .fact .v{font-size:19px;font-weight:600}
  h2{font-size:17px;margin:0 0 14px;padding-bottom:8px;border-bottom:2px solid var(--line)}
  table{width:100%;border-collapse:collapse}
  td.name{padding:5px 12px 5px 0;white-space:nowrap;font-size:14px;vertical-align:middle}
  td.barcell{width:100%;padding:5px 0}
  .bar{position:relative;background:#eeece7;border-radius:4px;height:22px}
  .fill{height:100%;border-radius:4px}
  .fill.good{background:var(--good)} .fill.ok{background:var(--ok)} .fill.bad{background:var(--bad)}
  .barlabel{position:absolute;right:8px;top:0;line-height:22px;font-size:12px;
    font-variant-numeric:tabular-nums;color:var(--ink)}
  .barlabel em{color:var(--muted);font-style:normal}
  .advice li{margin-bottom:6px}
  .subhead{font-size:15px;margin:22px 0 10px;color:var(--accent)}
  .subhead .count{background:#eeece7;color:var(--muted);border-radius:10px;
    padding:1px 8px;font-size:12px;margin-left:6px}
  .miss{border-left:3px solid var(--bad);padding:10px 0 10px 14px;margin-bottom:14px}
  .miss .q{font-size:15px;margin-bottom:6px}
  .qn{color:var(--muted);font-size:12px;margin-right:6px}
  .hint{color:var(--muted);font-size:13px;margin-left:6px}
  .ans{display:flex;gap:26px;flex-wrap:wrap;font-size:14px;margin-bottom:5px}
  .yours b{color:var(--bad)} .right b{color:var(--good)}
  .blank{color:var(--muted)}
  .why{font-size:13px;color:var(--muted)}
  .ref{opacity:.7;margin-left:6px}
  .perfect{color:var(--good);font-weight:600}
  table.hist th{text-align:left;font-size:12px;color:var(--muted);text-transform:uppercase;
    letter-spacing:.05em;padding:6px 10px 6px 0;border-bottom:1px solid var(--line)}
  table.hist td{padding:7px 10px 7px 0;border-bottom:1px solid var(--line);font-size:14px}
  table.hist tr.current td{font-weight:700}
  td.pass{color:var(--good)} td.fail{color:var(--bad)}
  footer{color:var(--muted);font-size:12px;text-align:center;margin-top:28px}
  @media print{body{background:#fff;padding:0}.card{break-inside:avoid;border:none;padding:0 0 18px}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Japanese Academy — Exam report</h1>
    <div class="sub">' . $candidate . ' ·
      ' . report_esc(report_when($when)) . ' ·
      paper <code>' . report_esc($attempt['exam']['seed'] ?? null) . '</code></div>
  </header>

  <div class="card">
    <div class="verdict">
      <div class="score">' . $pct . '<small>%</small></div>
      <div class="stamp ' . ($passed ? 'pass' : 'fail') . '">
        ' . ($passed ? 'PASS' : 'FAIL') . ' &middot; ' . report_esc($result['grade']) . '
      </div>
      <div class="facts">
        <div class="fact"><div class="k">Correct</div><div class="v">' . $result['right'] . ' / ' . $result['total'] . '</div></div>
        <div class="fact"><div class="k">Unanswered</div><div class="v">' . $result['unanswered'] . '</div></div>
        <div class="fact"><div class="k">Time</div><div class="v">' . report_duration($result['totalMs']) . '</div></div>
        <div class="fact"><div class="k">Per question</div><div class="v">' . $perQuestion . 's</div></div>
      </div>
    </div>
    <p class="sub" style="margin:18px 0 0">
      Pass mark ' . $result['passMark'] . '%. Scope: ' . report_esc(report_scope($attempt['exam'])) . '.
    </p>
  </div>

  ' . $bookRows . '

  <section class="card">
    <h2>By skill</h2>
    <table>' . $sectionRows . '</table>
  </section>

  <section class="card">
    <h2>By lesson</h2>
    <table>' . $lessonRows . '</table>
  </section>

  <section class="card">
    <h2>What to work on</h2>
    <ul class="advice">' . implode('', array_map(static fn (string $a): string => "<li>{$a}</li>", $advice)) . '</ul>
  </section>

  ' . ($historyHtml ? '<div class="card">' . $historyHtml . '</div>' : '') . '

  <section class="card">
    <h2>Questions missed (' . count($missed) . ')</h2>
    ' . $missedHtml . '
  </section>

  <footer>
    Generated by Japanese Academy from its vocabulary and kanji lists, the
    conjugation charts and the hand-written questions.
  </footer>
</div>
</body>
</html>';
}
