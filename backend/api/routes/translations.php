<?php
/**
 * The app's own words: the anotoki library's routes (Anotoki\Lib\Translations\
 * Http\TranslationsRoutes, anotoki/lib - every anotoki site's), on this app's
 * translations (academy_translations() in src/translations.php), with this
 * app's checks on the route groups and its error body. One wire format for
 * every anotoki site, the IAM's: snake_case (native_name, sort_order).
 *
 * For everybody: no person, no token, no cookie, the same answer under any
 * Host, because it holds nobody's data.
 *
 *   GET    /api/translations/{code}              {language, languages: [{code, name, native_name}], values, english?}:
 *                                                a language's strings with English under them and the languages on
 *                                                offer. "sk-sk" is answered by "sk" when only that is offered,
 *                                                anything the app does not offer in English. 404 not_found for what
 *                                                is no code, before any query; 503 translations_unavailable
 *                                                (Retry-After: 60) while the database has no words yet - migration
 *                                                004 of an upload still arriving, or waiting for its Apply - or
 *                                                cannot be asked (nothing is logged for either). ETag and
 *                                                Cache-Control: no-cache, 304 for the tag the browser holds. It
 *                                                answers while a migration waits (the SiteGate, api/app.php): the
 *                                                pages need their words
 *
 * The admin panel, in route groups with the checks on the groups
 * (middleware/staff.php): the editors and the administrators (the IAM roles
 * EDITOR and ADMIN) reword the strings; only an administrator adds, changes
 * or deletes a language, and sees the people and deletes a person's data
 * (/api/admin/people…, routes/people.php, in a group of the administrators
 * too). In this order: 401 sign_in_required, 403 staff_only or admin_only,
 * 413 too_large over 1 MiB; then the library's: a {code} that is no
 * language's 404 not_found; a body that is not JSON 415
 * unsupported_media_type, empty 422 empty_body, broken 400 invalid_json; 503
 * translations_unavailable while the tables are not there; then the work. A
 * refusal is this app's error body, {error: sentence, code, ...what it is
 * about: key, language, placeholder, keys}:
 *
 *   GET    /api/admin/languages                  {languages: [{code, name, native_name, enabled, sort_order, seeded,
 *                                                strings}]}, the hidden ones too (seeded: released with the app - never
 *                                                deleted; strings: how many of its own it has)
 *   POST   /api/admin/languages                  {code, name, native_name, enabled?} -> 201 {language}, offered unless
 *                                                enabled is false; 409 language_exists; 422 invalid_language,
 *                                                too_many_languages
 *   PUT    /api/admin/languages/{code}           {name?, native_name?, enabled?, sort_order?} -> {language};
 *                                                409 fallback_language (English switched off); 422 invalid_language
 *   DELETE /api/admin/languages/{code}          -> {strings, copy}: the language goes with its strings (how many),
 *                                                after a copy of them in the backups (its file's name); 409
 *                                                fallback_language (English), 409 seeded_language (a language the
 *                                                migrations write strings for)
 *   GET    /api/admin/translations               {languages, keys: [{name, description, values: {code: text}}]}, by name
 *   PUT    /api/admin/translations               {values: {key: {code: text}}}, the changed cells only -> the grid as it
 *                                                is now; checked whole, one transaction; 422 invalid_value,
 *                                                unknown_key (with keys), unknown_language, fallback_required,
 *                                                invalid_placeholder, placeholder_changed, unknown_placeholder
 *   GET    /api/admin/translations/{code}/export that language's own strings, flat: {key: text} ({} when none), as a
 *                                                file to save (translations-{code}.json)
 *   PUT    /api/admin/translations/{code}/import {key: text} -> the grid as it is now; the same checks; a blank
 *                                                string is passed over
 */

declare(strict_types=1);

use Anotoki\Lib\Support\Refusal;
use Anotoki\Lib\Translations\Http\TranslationsRoutes;
use Anotoki\Lib\Translations\Translations;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Routing\RouteCollectorProxy;

function academy_translation_routes(Slim\App $app): void
{
    // Made when a request needs them, as db_migrator() is.
    $translations = static function (): Translations {
        return academy_translations();
    };
    // A refusal in this app's error body, as every other address answers one (middleware/errors.php).
    $error = static function (Response $response, Refusal $refusal): Response {
        return json_response($response, ['error' => $refusal->message, 'code' => $refusal->code] + $refusal->extra, $refusal->status);
    };

    // Outside data_route(), on purpose: the words are the same for everybody,
    // so nobody is asked who they are. A token is not looked at, a good one or
    // a bad one, and a page whose sign-in has run out still reads in its
    // language. Its group is there for the upkeep alone, which comes before it
    // as before every address with data (it is many a page's first request).
    $app->group('', static function (RouteCollectorProxy $group) use ($translations, $error): void {
        TranslationsRoutes::bundle($group, $translations, $error);
    })->add(upkeep_middleware());

    // The groups' middleware runs before their routes', the last added first:
    // upkeep, the person, the editors' check, then the administrators'. An
    // address added to a group later gets them without asking.

    // The editors and the administrators: reading and rewording the strings.
    // Who saved a string is the request's person, the token's, and nothing a body says.
    $strings = TranslationsRoutes::strings($app, '/api/admin', $translations, static function (Request $request): ?int {
        return uid($request);
    }, $error);
    $strings->add(staff_middleware());
    data_route($strings);

    // The administrators alone: the languages themselves ...
    $languages = TranslationsRoutes::languages($app, '/api/admin', $translations, $error);
    $languages->add(admin_middleware());
    $languages->add(staff_middleware());
    data_route($languages);

    // ... and the people whose data the site holds, and deleting a person's (routes/people.php).
    $people = $app->group('/api/admin', static function (RouteCollectorProxy $group): void {
        academy_people_routes($group);
    });
    $people->add(admin_middleware());
    $people->add(staff_middleware());
    data_route($people);
}
