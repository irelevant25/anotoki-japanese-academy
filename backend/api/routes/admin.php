<?php
/**
 * The admin tools' addresses - the anotoki library's routes (ErrorLogRoutes,
 * AuditRoutes, FeedbackRoutes, BackupsRoutes, every anotoki site's) on this
 * site's tools (src/admin.php), for the site's ADMIN alone: this site's checks
 * on each group (who is asking, EDITOR or ADMIN: 403 staff_only, then ADMIN:
 * 403 admin_only - middleware/staff.php), then the library's own ADMIN check,
 * which every group of it carries whatever is put around it. One wire format
 * for every anotoki site, the library's (snake_case, times as ISO 8601 UTC);
 * a refusal in this site's error body.
 *
 * The error log and the backups answer while a migration waits (they need no
 * table, and a backup just before an Apply is the point): their checks read
 * the token alone (admin_token_checks()), and the SiteGate lets exactly their
 * routes through (academy_site_open_paths(), api/app.php) - never a restore.
 * The audit log and the feedback need their tables: their groups are the
 * person's, as every other admin group (data_route()).
 *
 *   GET    /api/admin/errors?days=&level=&status=&search=   the error log's report, grouped by kind
 *   GET    /api/admin/errors/{fingerprint}                   every time one kind happened
 *   DELETE /api/admin/errors[?before=YYYY-MM-DD]             cleared (recorded: errors.cleared)
 *   GET    /api/admin/audit?actor=&action=&target_type=&from=&to=&page=   who did what, 50 a page; GET …/facets
 *   GET    /api/admin/feedback?kind=&status=&section=&search=&page=       the messages; GET …/facets, …/unread
 *                                                     (the panel's badge), …/{id} (opened: read); PUT …/{id}/status,
 *                                                     DELETE …/{id} (recorded)
 *   GET    /api/admin/backups                         the backups (each with its maker's name, created_by_name, and
 *                                                     whether it is sealed: made here) and the status; GET …/proof;
 *                                                     POST (made now); GET|DELETE …/{id}; POST …/{id}/ticket (a
 *                                                     single-use link); GET …/{id}/preview; POST …/{id}/restore
 *                                                     {confirm} (recorded, each behind a sign-in of the last ten
 *                                                     minutes; only a sealed backup - 422 archive_invalid for any
 *                                                     other -, what was deleted since done again inside it)
 *   GET    /api/admin/backups/{id}/file?ticket=       the download - DELIBERATELY outside every check: a browser's
 *                                                     navigation sends no token; its single-use ticket is the check
 *
 * People's names by id come from the context (academy_admin_context(): the
 * backups' maker, the audit log's and the feedback's people).
 *
 * And the visitors' side of feedback, and of the error log:
 *
 *   POST   /api/feedback {kind, section?, subject?, message, email?, page?, language?, anonymous?, website}
 *                                                     -> 201 {ok: true}: a person's (their id from the token), or
 *                                                     while the IAM does not require sign-in here a visitor's or
 *                                                     nobody's (RequireCaller 'empty'); 401 sign_in_required else;
 *                                                     422, 429 too_many, 503 feature_unavailable - the library's
 *   POST   /api/client-errors {type?, message, page?, stack?, status?}
 *                                                     -> 204: an error a page met in the browser, into the error log
 *                                                     (the library's ErrorLogRoutes::client(), its Angular reporter
 *                                                     frontend core/error-report.config.ts) - anybody's, as any
 *                                                     page's error is; behind the gate (503 update_pending while an
 *                                                     update waits) and the person's Identify (a token checked - 401
 *                                                     invalid_token for a bad one, as everywhere -, a visitor's key
 *                                                     never read); JSON only (415), 8 KB at most (413), a message
 *                                                     (422); 20 an hour from one sender - a person by their account,
 *                                                     anybody else by their address bucket - and 500 a day from the
 *                                                     visitors, as many from the people signed in (429 too_many,
 *                                                     Retry-After); every text redacted again
 *
 * The address for an answer is the one the sender sends, and nothing else: the
 * form writes a signed-in person's account address in for them on the page
 * (core/feedback.config.ts), so they see it and may change or clear it - a
 * cleared field keeps no address, and the server never puts their account's
 * back in (the library takes the form's alone since anotoki-lib 0.5.0; the
 * form's words: "Only if you would like an answer"); "Send it without my
 * name" (`anonymous`) keeps neither their id nor an address - the owner's
 * decision of 2026-10-11, for every site: "it's their choice".
 */

declare(strict_types=1);

use Anotoki\Lib\Audit\Http\AuditRoutes;
use Anotoki\Lib\Auth\Http\RequireCaller;
use Anotoki\Lib\Backups\Http\BackupsRoutes;
use Anotoki\Lib\ErrorLog\Http\ErrorLogRoutes;
use Anotoki\Lib\Feedback\Http\FeedbackRoutes;
use Psr\Http\Message\ServerRequestInterface as Request;

function academy_admin_routes(Slim\App $app): void
{
    $context = academy_admin_context();

    admin_token_checks(ErrorLogRoutes::admin($app, '/api/admin/errors', academy_error_log(), $context, academy_audit()));
    admin_token_checks(BackupsRoutes::admin($app, '/api/admin/backups', academy_backups(), $context));
    BackupsRoutes::file($app, '/api/admin/backups', academy_backups(), $context);

    $audit = AuditRoutes::admin($app, '/api/admin/audit', academy_audit(), $context);
    $audit->add(admin_middleware());
    $audit->add(staff_middleware());
    data_route($audit);

    $feedback = FeedbackRoutes::admin($app, '/api/admin/feedback', academy_feedback(), $context, academy_audit());
    $feedback->add(admin_middleware());
    $feedback->add(staff_middleware());
    data_route($feedback);

    // The form, for whoever may use the app: a person, or while sign-in is not required here a visitor or nobody.
    // Of a person, their id alone: the address is the one they send (the page writes theirs in), never added here.
    $form = FeedbackRoutes::public($app, '/api/feedback', academy_feedback(), $context, static function (Request $request): ?array {
        $person = auth_person($request);
        return $person === null ? null : ['id' => $person->sub];
    });
    $form->add(new RequireCaller(RequireCaller::EMPTY));
    $form->add(academy_identify());

    // The pages' own errors (the owner's decision of 2026-10-11: every site's error log holds them). Anybody's - a
    // visitor's page fails as anybody's does - behind the site's gate like any route, and the person's Identify, so
    // the library counts a person by their account (the context's actorId) and anybody else by their address
    // bucket (its trusted proxies: Cloudflare's); a visitor's key is never read here, and no table is.
    $client = ErrorLogRoutes::client($app, '/api/client-errors', academy_error_log(), $context);
    $client->add(academy_identify_person());
}
