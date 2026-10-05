<?php
/**
 * PHP's built-in web server, made to behave like the Apache a hosted site runs
 * on. One address serves both halves - the API and the built Angular app - as
 * public/index.php does under Apache (api/front.php decides for both).
 *
 *   composer start                        development, from backend/: the API, the
 *   (php -S localhost:8200 router.php)    audio clips, the reports and the setup page
 *                                         behind `ng serve` on :4400, which proxies
 *                                         /api, /audio, /report and /setup.php here -
 *                                         and the built app, once there is one
 *
 *   /setup.php                  the setup page
 *   /api/…  /audio/…  /report/… the API (api/app.php)
 *   anything else               the built app from ../frontend/dist/japanese-academy/browser/:
 *                               a file as it is, a page's address its index.html; never a
 *                               PHP file, a dotfile or anything outside the build
 *
 * Nothing happens at start: what has to be done before the app can be used -
 * new migrations (after a raw copy of every table), the study content rebuilt
 * when backend/data/ changed, the day's backup - is done by the first request
 * that needs it, as on a website (src/upkeep.php). Not set up yet (no
 * backend/config/*.local.php), every address with data answers 503
 * not_set_up, and /setup.php opens from this computer.
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli-server') {
    http_response_code(404);
    exit;
}

require __DIR__ . '/src/bootstrap.php';
require __DIR__ . '/api/front.php';

academy_front(router_frontend_dir());
return true;

/**
 * The built Angular app: frontend/dist/japanese-academy/browser (npm run build
 * in frontend/, or node frontend/scripts/ensure-build.mjs). The tests' own
 * settings may name another (app.frontend_dir), for a throwaway database only.
 */
function router_frontend_dir(): string
{
    $dir = config('app.frontend_dir');
    if (is_string($dir) && $dir !== '' && config_is_test_db(db_name())) {
        return app_path($dir);
    }
    return ROOT . '/frontend/dist/japanese-academy/browser';
}
