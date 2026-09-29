<?php
/**
 * Japanese Academy on Apache — a hosted site. This file and .htaccess are the
 * PHP half of the upload's public/, the site's document root, beside the built
 * Angular app (backend/tools/build-dist.php puts them together; this source
 * folder is never served itself). .htaccess sends /api, /audio, /report and
 * /setup.php here, and the app's pages to its index.html; the backend sits
 * beside public/, outside the document root. docs/kb/hosting.md has the map.
 */

declare(strict_types=1);

require dirname(__DIR__) . '/backend/api/front.php';

academy_front(__DIR__);
