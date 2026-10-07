<?php
/**
 * The app's own words (src/translations.php does the work).
 *
 * For everybody: no person, no token, no cookie, the same answer under any
 * Host, because it holds nobody's data.
 *
 *   GET    /api/translations/{code}              {language, languages, values, english?}: a language's strings
 *                                                with English under them and the languages on offer. "sk-sk"
 *                                                is answered by "sk" when only that is offered, anything the
 *                                                app does not offer in English. 404 not_found for what is no
 *                                                code; 503 not_up_to_date while the database has no words yet:
 *                                                migration 004 of an upload still arriving, or waiting for its
 *                                                Apply (nothing is logged for it). It answers while a migration
 *                                                waits (the SiteGate, api/app.php): the pages need their words
 *
 * The admin area, in two route groups with the checks on the groups
 * (middleware/staff.php): the editors and the administrators (the IAM roles
 * EDITOR and ADMIN) reword the strings; only an administrator adds, changes
 * or deletes a language, and sees the people and deletes a person's data
 * (/api/admin/people…, routes/people.php, in the administrators' group).
 * Else 403 staff_only or admin_only; a body over 1 MiB 413 too_large. A
 * {code} that is not a language's is 404 not_found:
 *
 *   GET    /api/admin/languages                  {languages: [{code, name, nativeName, enabled, sortOrder, seeded}]},
 *                                                the hidden ones too
 *   POST   /api/admin/languages                  {code, name, nativeName, enabled?} -> 201 {language}, offered unless
 *                                                enabled is false; 409 language_exists; 422 invalid_language,
 *                                                too_many_languages
 *   PUT    /api/admin/languages/{code}           {name?, nativeName?, enabled?, sortOrder?} -> {language};
 *                                                409 fallback_language (English switched off); 422 invalid_language
 *   DELETE /api/admin/languages/{code}          -> {copy}: the language goes with its strings, after a copy of them
 *                                                in the backups (its file's name); 409 fallback_language (English),
 *                                                409 seeded_language (a language the migrations write strings for)
 *   GET    /api/admin/translations               {languages, keys: [{name, description, values: {code: text}}]}, by name
 *   PUT    /api/admin/translations               {values: {key: {code: text}}}, the changed cells only -> the grid as it
 *                                                is now; checked whole, one transaction; 422 invalid_value,
 *                                                unknown_key (with keys), unknown_language, fallback_required,
 *                                                invalid_placeholder, placeholder_changed, unknown_placeholder
 *   GET    /api/admin/translations/{code}/export that language's own strings, flat: {key: text} ({} when none)
 *   PUT    /api/admin/translations/{code}/import {key: text} -> the grid as it is now; the same checks; a blank
 *                                                string is passed over
 */

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Routing\RouteCollectorProxy;

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

        // The strings change when somebody rewords one, or with a release: the
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
    })->add(upkeep_middleware());

    // Each of the admin area's handlers gives [status, body], as the kanji's do.
    // Who saved a string is the request's person, the token's, and nothing a body says.
    $admin = static function (callable $answer): callable {
        return static function (Request $request, Response $response, array $args) use ($answer): Response {
            translations_required();
            [$status, $body] = $answer($request, $args);
            return json_response($response, $body, $status);
        };
    };

    // Two groups, with the checks on the groups: an address added to one
    // later gets them without asking. The middleware of a group runs before
    // its routes', the outer group's before the inner's: upkeep, the person,
    // then the editors' check, then the administrators'.
    $staff = $app->group('/api/admin', static function (RouteCollectorProxy $group) use ($admin): void {
        // The editors and the administrators: reading and rewording the strings.
        $group->get('/languages', $admin(static function (): array {
            return [200, ['languages' => languages_all()]];
        }));

        $group->get('/translations', $admin(static function (): array {
            return [200, translations_grid()];
        }));

        $group->put('/translations', $admin(static function (Request $request): array {
            return translations_save(request_body($request)['values'] ?? null, uid($request));
        }));

        $group->get('/translations/{code}/export', $admin(static function (Request $request, array $args): array {
            return translations_export((string) $args['code']);
        }));

        $group->put('/translations/{code}/import', $admin(static function (Request $request, array $args): array {
            return translations_import((string) $args['code'], request_body($request), uid($request));
        }));

        // The administrators alone: the languages themselves, and the people.
        $group->group('', static function (RouteCollectorProxy $only) use ($admin): void {
            $only->post('/languages', $admin(static function (Request $request): array {
                return languages_create(request_body($request));
            }));

            $only->put('/languages/{code}', $admin(static function (Request $request, array $args): array {
                return languages_update((string) $args['code'], request_body($request));
            }));

            $only->delete('/languages/{code}', $admin(static function (Request $request, array $args): array {
                return languages_delete((string) $args['code']);
            }));

            // The people whose data the site holds, and deleting a person's (routes/people.php).
            academy_people_routes($only);
        })->add(admin_middleware());
    });
    $staff->add(staff_middleware()); // added first, so it runs last of the group's: after the upkeep and the person
    data_route($staff);
}
