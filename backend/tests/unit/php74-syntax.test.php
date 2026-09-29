<?php
// The code stays parseable by PHP 7.4 (CLAUDE.md), because the owner's editor
// checks it with a 7.4; it runs on 8.1+. There may be no PHP 7.4 to try it
// with, so this reads every PHP file git would publish (Composer's packages in
// backend/vendor/ aside: nobody edits those here) with PHP's own tokenizer and
// looks for the syntax 7.4 cannot parse: match, ?->, named
// arguments, union, intersection and static types, constructor promotion,
// enums, readonly, throw as an expression, catch without a variable,
// first-class callables, new in a default value, a trailing comma in a
// parameter list, $object::class, 0o numbers, typed and dynamic class constants.
declare(strict_types=1);

require __DIR__ . '/../lib.php';

/** The PHP 8 syntax in some PHP code, as "line: what" strings. */
function php74_problems(string $code): array
{
    $all = token_get_all($code);
    // the tokens that mean something, with their line
    $t = [];
    $line = 1;
    foreach ($all as $token) {
        if (is_array($token)) {
            $line = $token[2];
            if (!in_array($token[0], [T_WHITESPACE, T_COMMENT, T_DOC_COMMENT], true)) {
                $t[] = [$token[0], $token[1], $line];
            }
        } else {
            $t[] = [$token, $token, $line];
        }
    }
    $id = static fn (int $i) => $t[$i][0] ?? null;
    $named = static fn ($k): bool => in_array($k, array_filter([T_STRING, defined('T_NAME_QUALIFIED') ? T_NAME_QUALIFIED : null,
        defined('T_NAME_FULLY_QUALIFIED') ? T_NAME_FULLY_QUALIFIED : null, defined('T_NAME_RELATIVE') ? T_NAME_RELATIVE : null, T_ARRAY, T_CALLABLE]), true);
    $only8 = array_filter([
        defined('T_MATCH') ? T_MATCH : null => 'match',
        defined('T_NULLSAFE_OBJECT_OPERATOR') ? T_NULLSAFE_OBJECT_OPERATOR : null => 'the ?-> operator',
        defined('T_ENUM') ? T_ENUM : null => 'an enum',
        defined('T_READONLY') ? T_READONLY : null => 'readonly',
        defined('T_PUBLIC_SET') ? T_PUBLIC_SET : null => 'public(set)',
        defined('T_PROTECTED_SET') ? T_PROTECTED_SET : null => 'protected(set)',
        defined('T_PRIVATE_SET') ? T_PRIVATE_SET : null => 'private(set)',
    ], static fn ($what, $k): bool => $k !== '' && $k !== 0, ARRAY_FILTER_USE_BOTH);
    $found = [];
    $say = static function (int $i, string $what) use (&$found, $t): void {
        $found[] = $t[$i][2] . ": $what";
    };

    $n = count($t);
    for ($i = 0; $i < $n; $i++) {
        [$k, $text] = $t[$i];
        if (isset($only8[$k]) && is_int($k)) {
            $say($i, $only8[$k]);
        }
        $prev = $i > 0 ? $id($i - 1) : null;
        if ($k === T_STRING && $id($i + 1) === ':' && in_array($prev, ['(', ','], true)) {
            $say($i, "a named argument ($text:)");
        }
        if (in_array($k, [T_PUBLIC, T_PROTECTED, T_PRIVATE], true) && in_array($prev, ['(', ','], true)) {
            $say($i, 'constructor promotion');
        }
        if ($k === T_THROW && in_array($prev, [T_COALESCE, T_DOUBLE_ARROW, '?', T_BOOLEAN_AND, T_BOOLEAN_OR, T_LOGICAL_AND, T_LOGICAL_OR, '=', '(', ','], true)) {
            $say($i, 'throw as an expression');
        }
        if ($k === T_CATCH) {
            for ($j = $i + 1; $j < $n && $id($j) !== ')'; $j++) {
                if ($id($j) === T_VARIABLE) {
                    continue 2;
                }
            }
            $say($i, 'catch without a variable');
        }
        if ($k === '(' && $id($i + 1) === T_ELLIPSIS && $id($i + 2) === ')') {
            $say($i, 'a first-class callable (...)');
        }
        if ($k === T_DOUBLE_COLON && $prev === T_VARIABLE && $id($i + 1) === T_CLASS) {
            $say($i, '$object::class');
        }
        if ($k === T_DOUBLE_COLON && $id($i + 1) === '{') {
            $say($i, 'a dynamic class constant');
        }
        if ($k === T_LNUMBER && preg_match('/^0o/i', $text)) {
            $say($i, 'an 0o number');
        }
        if ($k === T_CONST && $named($id($i + 1)) && $named($id($i + 2))) {
            $say($i, 'a typed constant');
        }

        // A function's parameters and return type.
        if ($k === T_FUNCTION || $k === T_FN) {
            $j = $i + 1;
            while ($j < $n && $id($j) !== '(') {
                $j++;
            }
            $depth = 0;
            $part = 'type'; // of the parameter: its type, then its variable, then its default value
            for (; $j < $n; $j++) {
                $c = $id($j);
                if ($c === '(' || $c === '[' || $c === '{') {
                    $depth++;
                    continue;
                }
                if ($c === ')' || $c === ']' || $c === '}') {
                    $depth--;
                    if ($depth === 0) {
                        break;
                    }
                    continue;
                }
                if ($depth !== 1) {
                    continue;
                }
                if ($c === ',') {
                    if ($id($j + 1) === ')') {
                        $say($j, 'a trailing comma in a parameter list');
                    }
                    $part = 'type';
                } elseif ($c === T_VARIABLE) {
                    $part = 'variable';
                } elseif ($c === '=') {
                    $part = 'default';
                } elseif ($c === '|' && $part === 'type') {
                    $say($j, 'a union type');
                } elseif (defined('T_AMPERSAND_NOT_FOLLOWED_BY_VAR_OR_VARARG') && $c === T_AMPERSAND_NOT_FOLLOWED_BY_VAR_OR_VARARG && $part === 'type') {
                    $say($j, 'an intersection type');
                } elseif ($c === T_NEW && $part === 'default') {
                    $say($j, 'new in a default value');
                }
            }
            // the return type: from ':' to the body
            if ($id($j + 1) === ':') {
                for ($r = $j + 2; $r < $n && !in_array($id($r), ['{', ';', T_DOUBLE_ARROW], true); $r++) {
                    if ($id($r) === '|') {
                        $say($r, 'a union return type');
                    } elseif ($id($r) === T_STATIC) {
                        $say($r, 'the static return type');
                    }
                }
            }
            // a closure's use (…): no trailing comma either
            for ($u = $j + 1; $u < $n && !in_array($id($u), ['{', ';', ':', T_DOUBLE_ARROW], true); $u++) {
                if ($id($u) === T_USE) {
                    for ($v = $u + 1; $v < $n && $id($v) !== ')'; $v++) {
                        if ($id($v) === ',' && $id($v + 1) === ')') {
                            $say($v, 'a trailing comma in use ()');
                        }
                    }
                }
            }
        }
    }
    return $found;
}

test('every PHP file parses under PHP 7.4 too', function (): void {
    $out = shell_exec('git -C ' . escapeshellarg(ROOT) . ' ls-files -co --exclude-standard -z');
    if (!is_string($out) || $out === '') {
        echo "    (skipped: not a git checkout)\n";
        return;
    }
    $problems = [];
    $checked = 0;
    foreach (array_unique(array_filter(explode("\0", $out))) as $rel) {
        // Composer's packages (Slim and what it needs) are other people's code, which nobody edits here
        if (!str_ends_with($rel, '.php') || str_starts_with($rel, 'backend/vendor/') || !is_file(ROOT . "/$rel")) {
            continue;
        }
        $checked++;
        foreach (php74_problems((string) file_get_contents(ROOT . "/$rel")) as $p) {
            $problems[] = "$rel:$p";
        }
    }
    assert_true($checked > 40, "$checked files checked");
    assert_same([], $problems);
});

test('the check finds each kind, and leaves PHP 7.4 alone', function (): void {
    $eight = [
        '$x = match ($a) { 1 => 2 };' => 'match',
        '$x = $a?->b;' => '?->',
        'f(name: 1);' => 'named argument',
        'function f(int|string $x) {}' => 'union type',
        'function f(): int|false {}' => 'union return type',
        'class A { function f(): static {} }' => 'static return type',
        'class A { function __construct(private int $x) {} }' => 'constructor promotion',
        'enum Suit { case Hearts; }' => 'enum',
        'class A { public readonly int $x; }' => 'readonly',
        '$x = $a ?? throw new E();' => 'throw as an expression',
        'try {} catch (E) {}' => 'catch without a variable',
        '$f = strlen(...);' => 'first-class callable',
        'function f($x = new A()) {}' => 'new in a default value',
        'function f($a, $b,) {}' => 'trailing comma in a parameter list',
        '$f = function () use ($a, $b,) {};' => 'trailing comma in use',
        '$c = $obj::class;' => '$object::class',
        '$n = 0o17;' => '0o number',
        'class A { const string X = "x"; }' => 'typed constant',
        'function f(A&B $x) {}' => 'intersection type',
    ];
    foreach ($eight as $code => $what) {
        assert_true((bool) php74_problems("<?php $code"), "not found: $what");
    }
    $seventy_four = [
        '$x = $a ? B : C;', 'switch ($a) { case X: throw new E(); default: break; }', '$f = static fn (int $uid): array => [$uid];',
        'function f(int $flags = A | B, array &$out = []): ?string { return null; }', 'function f(): never { exit; }',
        'f(1, 2,);', '$c = A::class;', 'try {} catch (E $e) {}', 'const X = 1;', 'class A { const X = 1; public $y; }',
        '$f = function () use ($a, $b) {};', '$x = [1, 2,];', 'label: goto label;', 'if ($a): echo 1; endif;',
    ];
    foreach ($seventy_four as $code) {
        assert_same([], php74_problems("<?php $code"), $code);
    }
});
