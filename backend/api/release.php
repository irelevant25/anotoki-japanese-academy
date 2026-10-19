<?php

declare(strict_types=1);

/**
 * A release's front door: anotoki-deploy's frontend/index.php requires it for every address the backend answers
 * (composer.json, extra["anotoki-deploy"].entry). api/front.php decides as it does under PHP's built-in server
 * (router.php) - from the address the browser asked for - with the release's frontend/ as the built app.
 */
require __DIR__ . '/front.php';

academy_front(dirname(__DIR__, 2) . '/frontend');
