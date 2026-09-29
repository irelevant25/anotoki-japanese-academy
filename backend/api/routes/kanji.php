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
 *   GET  /export         download your progress (the shape of the old progress/kanji.json)
 */

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

function academy_kanji_routes(Slim\App $app): void
{
    // the catalog changes only with the content; the browser asks before using its copy
    data_route($app->get('/api/kanji/catalog', static function (Request $request, Response $response): Response {
        return json_response($response, kanji_catalog_json(), 200, ['Cache-Control: no-cache']);
    }));

    data_route($app->get('/api/kanji/progress', static function (Request $request, Response $response): Response {
        return json_response($response, kanji_progress(uid($request)));
    }), true);

    data_route($app->get('/api/kanji/summary', static function (Request $request, Response $response): Response {
        return json_response($response, kanji_summarize(uid($request)));
    }), true);

    // Each answer is one transaction in the handler: the item, the day's count, the log line.
    $answers = [
        '/api/kanji/learn' => 'kanji_learn',
        '/api/kanji/review' => 'kanji_review',
        '/api/kanji/practice' => 'kanji_practice',
        '/api/kanji/item' => 'kanji_edit_item',
        '/api/kanji/settings' => 'kanji_settings',
        '/api/kanji/reset-item' => 'kanji_reset_item',
        '/api/kanji/reset' => 'kanji_reset',
    ];
    foreach ($answers as $path => $handle) {
        data_route($app->post($path, static function (Request $request, Response $response) use ($handle): Response {
            [$status, $body] = $handle(uid($request), request_body($request));
            return json_response($response, $body, $status);
        }));
    }

    data_route($app->get('/api/kanji/export', static function (Request $request, Response $response): Response {
        return json_response($response, store_export(uid($request)), 200,
            ['Content-Disposition: attachment; filename="kanji-progress-' . local_date() . '.json"']);
    }));
}
