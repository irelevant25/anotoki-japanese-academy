<?php
/**
 * The exam's addresses (src/exam.php does the work): the setup screen's
 * numbers, papers without their answers, scoring, the attempts and their
 * reports — each learner's own: a signed-in person's, or where the IAM lets
 * people study without signing in a visitor's (study_route(): nobody's
 * submitted exam makes a visitor, and a visitor at their cap of exam
 * attempts is refused the paper already, so that no paper is answered in
 * vain).
 */

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/** A report is shown as it was saved, but may never run a script: it holds whatever a backup brought in. */
const REPORT_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

function academy_exam_routes(Slim\App $app): void
{
    study_route($app->get('/api/meta', static function (Request $request, Response $response): Response {
        return json_response($response, exam_meta(uid($request)));
    }), true);

    study_route($app->post('/api/exam', static function (Request $request, Response $response): Response {
        return json_response($response, exam_start(request_body($request)));
    }), false, false, 'attempts');

    study_route($app->post('/api/submit', static function (Request $request, Response $response): Response {
        [$status, $body] = exam_submit(uid($request), request_body($request));
        return json_response($response, $body, $status);
    }), false, true, 'attempts');

    study_route($app->get('/api/attempts', static function (Request $request, Response $response): Response {
        return json_response($response, array_reverse(exam_history(uid($request))));
    }));

    // Somebody else's attempt answers 404, as if it did not exist: ids are unique per person only.
    study_route($app->get('/report/{id}', static function (Request $request, Response $response, array $args): Response {
        $id = (string) $args['id'];
        if (!preg_match('/^[A-Za-z0-9_-]+$/D', $id)) {
            return text_response($response, 400, 'bad id');
        }
        $html = exam_report(uid($request), $id);
        if ($html === null) {
            return text_response($response, 404, 'No such report');
        }
        return text_response($response, 200, $html, 'text/html; charset=utf-8', ['Content-Security-Policy: ' . REPORT_CSP, 'Cache-Control: no-store']);
    }));
}
