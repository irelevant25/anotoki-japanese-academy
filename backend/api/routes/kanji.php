<?php
/**
 * /api/kanji — the kanji SRS (src/srs/kanji.php does the work).
 *
 *   GET  /catalog        every study item (the same for everybody)
 *   GET  /progress       your SRS state + dashboard summary
 *   GET  /summary        just the summary (the home page)
 *   POST /learn          {id}                              lesson quiz passed
 *   POST /review         {id, meaningWrong, readingWrong}  scheduled review
 *   POST /practice       {id, firstTryCorrect, wrong}      practice (no SRS change)
 *   POST /item           {id, notes?, addSynonym?, removeSynonym?, addReading?, removeReading?}
 *   POST /settings       {batchSize?, lessonTypes?, autoplay?}
 *   POST /reset-item     {id}
 *   POST /reset          {confirm: "RESET"}
 *
 * All of your data as one file, and back: GET and PUT /api/me/data (routes/me.php).
 *
 * Whoever studies: a signed-in person, or where the IAM lets people study
 * without signing in a visitor, or nobody yet, who reads as a learner with no
 * data and whose first save makes a visitor (study_route(),
 * learner_middleware()).
 */

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

function academy_kanji_routes(Slim\App $app): void
{
    // the catalog changes only with the content; the browser asks before using its copy
    study_route($app->get('/api/kanji/catalog', static function (Request $request, Response $response): Response {
        return json_response($response, kanji_catalog_json(), 200, ['Cache-Control: no-cache']);
    }));

    study_route($app->get('/api/kanji/progress', static function (Request $request, Response $response): Response {
        return json_response($response, kanji_progress(uid($request)));
    }), true);

    study_route($app->get('/api/kanji/summary', static function (Request $request, Response $response): Response {
        return json_response($response, kanji_summarize(uid($request)));
    }), true);

    // Each answer is one transaction in the handler: the item, the day's count, the log line.
    // With each: whether nobody's request makes a visitor for it (a save; the resets of
    // nobody have nothing to reset), and what a visitor's request grows (their cap).
    $answers = [
        '/api/kanji/learn' => ['kanji_learn', true, 'answers'],
        '/api/kanji/review' => ['kanji_review', true, 'answers'],
        '/api/kanji/practice' => ['kanji_practice', true, 'answers'],
        '/api/kanji/item' => ['kanji_edit_item', true, null],
        '/api/kanji/settings' => ['kanji_settings', true, null],
        '/api/kanji/reset-item' => ['kanji_reset_item', false, 'answers'],
        '/api/kanji/reset' => ['kanji_reset', false, 'answers'],
    ];
    foreach ($answers as $path => [$handle, $mayMake, $cap]) {
        study_route($app->post($path, static function (Request $request, Response $response) use ($handle): Response {
            [$status, $body] = $handle(uid($request), request_body($request));
            return json_response($response, $body, $status);
        }), false, $mayMake, $cap);
    }
}
