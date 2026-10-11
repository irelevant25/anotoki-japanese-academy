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
 *   GET    /api/admin/backups                         the backups and the status; GET …/proof; POST (made now);
 *                                                     GET|DELETE …/{id}; POST …/{id}/ticket (a single-use link);
 *                                                     GET …/{id}/preview; POST …/{id}/restore {confirm} (recorded,
 *                                                     each behind a sign-in of the last ten minutes)
 *   GET    /api/admin/backups/{id}/file?ticket=       the download - DELIBERATELY outside every check: a browser's
 *                                                     navigation sends no token; its single-use ticket is the check
 *
 * And the visitors' side of feedback:
 *
 *   POST   /api/feedback {kind, section?, subject?, message, email?, page?, language?, anonymous?, website}
 *                                                     -> 201 {ok: true}: a person's (their id from the token), or
 *                                                     while the IAM does not require sign-in here a visitor's or
 *                                                     nobody's (RequireCaller 'empty'); 401 sign_in_required else;
 *                                                     422, 429 too_many, 503 feature_unavailable - the library's
 *
 * The address for an answer is the one the sender sends, and nothing else: the
 * form writes a signed-in person's account address in for them on the page
 * (core/feedback.config.ts), so they see it and may change or clear it - a
 * cleared field keeps no address, and the server never puts their account's
 * back in (the form's words: "Only if you would like an answer"); "Send it
 * without my name" (`anonymous`) keeps neither their id nor an address - the
 * owner's decision of 2026-10-11, for every site: "it's their choice".
 *
 * Not mounted (yet): the library's route for the pages' own errors
 * (ErrorLogRoutes::client()) - browser errors come to the error log with the
 * library's 0.4.2, with its Angular reporter.
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
    $names = static function (array $ids): array {
        return academy_people_names($ids);
    };

    admin_token_checks(ErrorLogRoutes::admin($app, '/api/admin/errors', academy_error_log(), $context, academy_audit()));
    admin_token_checks(BackupsRoutes::admin($app, '/api/admin/backups', academy_backups(), $context));
    BackupsRoutes::file($app, '/api/admin/backups', academy_backups(), $context);

    $audit = AuditRoutes::admin($app, '/api/admin/audit', academy_audit(), $context, $names);
    $audit->add(admin_middleware());
    $audit->add(staff_middleware());
    data_route($audit);

    $feedback = FeedbackRoutes::admin($app, '/api/admin/feedback', academy_feedback(), $context, academy_audit(), $names);
    $feedback->add(admin_middleware());
    $feedback->add(staff_middleware());
    data_route($feedback);

    // The form, for whoever may use the app: a person, or while sign-in is not required here a visitor or nobody.
    // Of a person, their id alone: the address is the one they send (the page writes theirs in), never added here.
    $form = FeedbackRoutes::public($app, '/api/feedback', academy_feedback(), $context, static function (Request $request): ?array {
        $person = auth_person($request);
        return $person === null ? null : ['id' => $person->sub, 'email' => null];
    });
    $form->add(new RequireCaller(RequireCaller::EMPTY));
    $form->add(academy_identify());
}
