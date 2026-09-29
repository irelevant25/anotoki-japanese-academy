<?php
// The kanji trainer's catalog, built from data/ (no database needed): what
// the frontend's answer checking is tested against (frontend/src/app/kanji/
// answer.spec.ts, through frontend/scripts/catalog-fixture.mjs).
declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

echo json_text(catalog_build(content_load()));
