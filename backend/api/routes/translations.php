<?php
/**
 * The app's own words (src/translations.php does the work).
 *
 * For everybody: no person, no token, no cookie, the same answer in both auth
 * modes and under any Host, because it holds nobody's data.
 *
 *   GET    /api/translations/{code}              {language, languages, values, english?}: a language's strings
 *                                                with English under them and the languages on offer. "sk-sk"
 *                                                is answered by "sk" when only that is offered, anything the
 *                                                app does not offer in English. 404 not_found for what is no
 *                                                code; 503 not_up_to_date while migration 004 of an upload is
 *                                                still arriving (nothing is logged for it)
 *
 * For the owner (owner_route(): the ADMIN role, or this computer without
 * sign-in; see middleware/owner.php for 403 wrong_origin, 403 owner_only and
 * 413 too_large). A {code} that is not a language's is 404 not_found:
 *
 *   GET    /api/owner/languages                  {languages: [{code, name, nativeName, enabled, sortOrder, seeded}]},
 *                                                the hidden ones too
 *   POST   /api/owner/languages                  {code, name, nativeName, enabled?} -> 201 {language}, offered unless
 *                                                enabled is false; 409 language_exists; 422 invalid_language,
 *                                                too_many_languages
 *   PUT    /api/owner/languages/{code}           {name?, nativeName?, enabled?, sortOrder?} -> {language};
 *                                                409 fallback_language (English switched off); 422 invalid_language
 *   DELETE /api/owner/languages/{code}           -> {copy}: the language goes with its strings, after a copy of them
 *                                                in backups/ (its file's name); 409 fallback_language (English),
 *                                                409 seeded_language (a language the migrations write strings for)
 *   GET    /api/owner/translations               {languages, keys: [{name, description, values: {code: text}}]}, by name
 *   PUT    /api/owner/translations               {values: {key: {code: text}}}, the changed cells only -> the grid as it
 *                                                is now; checked whole, one transaction; 422 invalid_value,
 *                                                unknown_key (with keys), unknown_language, fallback_required,
 *                                                invalid_placeholder, placeholder_changed, unknown_placeholder
 *   GET    /api/owner/translations/{code}/export that language's own strings, flat: {key: text} ({} when none)
 *   PUT    /api/owner/translations/{code}/import {key: text} -> the grid as it is now; the same checks; a blank
 *                                                string is passed over
 */

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Interfaces\RouteInterface;

/**
 * An address for the owner alone: what data_route() asks (a set-up copy, its
 * database up to date, a signed-in person), and then the owner's checks.
 */
function owner_route(RouteInterface $route): void
{
    $route->add(owner_middleware()); // added first, so it runs last: after set-up, upkeep and the person
    data_route($route);
}

function academy_translation_routes(Slim\App $app): void
{
    // Outside data_route(), on purpose: the words are the same for everybody,
    // so nobody is asked who they are. A token is not looked at, a good one or
    // a bad one, and a page whose sign-in has run out still reads in its language.
    $app->get('/api/translations/{code}', static function (Request $request, Response $response, array $args): Response {
        translations_required();
        // Before any query that carries it: only a code is looked up (a wrong
        // address is a 404, not a database refusing bytes that are not text).
        $code = (string) $args['code'];
        if (!language_code_ok($code)) {
            throw new HttpError(404, 'There is no such language.', [], 'not_found');
        }

        // The strings change when the owner saves one, or with a release: the
        // browser asks every time (no-cache) and is told "the same as you
        // have" in a few bytes. Both headers go on that answer too; without
        // them it would go out as no-store. The tag is compared as it may come
        // back from behind a server that compresses (translations_not_modified()).
        $body = json_text(translations_bundle($code));
        $etag = '"' . md5($body) . '"';
        $headers = ["ETag: $etag", 'Cache-Control: no-cache'];
        if (translations_not_modified($request->getHeaderLine('If-None-Match'), $etag)) {
            return with_headers($response->withStatus(304), $headers);
        }
        return json_response($response, $body, 200, $headers);
    })->add(upkeep_middleware())->add(set_up_middleware());

    // Each of the owner's handlers gives [status, body], as the kanji's do.
    // Who saved a string is the request's person, the token's, and nothing a body says.
    $owner = static function (callable $answer): callable {
        return static function (Request $request, Response $response, array $args) use ($answer): Response {
            translations_required();
            [$status, $body] = $answer($request, $args);
            return json_response($response, $body, $status);
        };
    };

    owner_route($app->get('/api/owner/languages', $owner(static function (): array {
        return [200, ['languages' => languages_all()]];
    })));

    owner_route($app->post('/api/owner/languages', $owner(static function (Request $request): array {
        return languages_create(request_body($request));
    })));

    owner_route($app->put('/api/owner/languages/{code}', $owner(static function (Request $request, array $args): array {
        return languages_update((string) $args['code'], request_body($request));
    })));

    owner_route($app->delete('/api/owner/languages/{code}', $owner(static function (Request $request, array $args): array {
        return languages_delete((string) $args['code']);
    })));

    owner_route($app->get('/api/owner/translations', $owner(static function (): array {
        return [200, translations_grid()];
    })));

    owner_route($app->put('/api/owner/translations', $owner(static function (Request $request): array {
        return translations_save(request_body($request)['values'] ?? null, uid($request));
    })));

    owner_route($app->get('/api/owner/translations/{code}/export', $owner(static function (Request $request, array $args): array {
        return translations_export((string) $args['code']);
    })));

    owner_route($app->put('/api/owner/translations/{code}/import', $owner(static function (Request $request, array $args): array {
        return translations_import((string) $args['code'], request_body($request), uid($request));
    })));
}
