#!/usr/bin/env bash

set -u

# ============================================================
# Japanese Academy - Launcher
# Linux / macOS
#
# Finds PHP (8.1 or newer, with pdo_pgsql, mbstring and intl) and Node.js,
# builds the app when its sources changed (the first time this also installs
# its packages), starts the server (backend/server.php, which applies new
# migrations and takes the day's backup first) and opens the browser: the app,
# or the setup page (/setup.php) while this copy is not set up yet.
# Ctrl+C stops it.
# ============================================================

PROJECT_NAME="Japanese Academy"

# The first start after an update builds the study content in the database,
# and a database update copies every table first: seconds, rarely a minute.
SERVER_STARTUP_TIMEOUT=120

# ------------------------------------------------------------
# Colors
# ------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------

info() {
    echo -e "${CYAN}$1${NC}"
}

success() {
    echo -e "${GREEN}$1${NC}"
}

warning() {
    echo -e "${YELLOW}$1${NC}"
}

error() {
    echo -e "${RED}$1${NC}"
}

die() {
    error ""
    error "ERROR: $1"
    echo ""
    exit 1
}

# Prints nothing when this PHP can run the app, else the reason it can't.
php_problem() {
    local php="$1" version major minor modules missing=""

    version="$("$php" -v 2>/dev/null | sed -n 's/^PHP \([0-9][0-9]*\.[0-9][0-9]*\.[^ ]*\).*/\1/p' | head -n 1)"
    if [ -z "$version" ]; then
        echo "does not run"
        return
    fi
    major="${version%%.*}"
    minor="${version#*.}"
    minor="${minor%%.*}"
    if [ "$major" -lt 8 ] || { [ "$major" -eq 8 ] && [ "$minor" -lt 1 ]; }; then
        echo "PHP $version is too old"
        return
    fi

    modules="$("$php" -m 2>/dev/null)"
    for ext in pdo_pgsql mbstring intl; do
        if ! printf '%s\n' "$modules" | grep -qix "$ext"; then
            missing="$missing $ext"
        fi
    done
    if [ -n "$missing" ]; then
        echo "PHP $version lacks$missing"
    fi
}

# Every php worth trying: ACADEMY_PHP, PATH, the usual install folders.
php_candidates() {
    {
        [ -n "${ACADEMY_PHP:-}" ] && echo "$ACADEMY_PHP"
        type -ap php 2>/dev/null
        echo /opt/homebrew/bin/php
        echo /usr/local/bin/php
        echo /usr/bin/php
    } | awk '!seen[$0]++' | while read -r candidate; do
        [ -x "$candidate" ] && echo "$candidate"
    done
}

open_browser() {
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$1" >/dev/null 2>&1 &
    elif command -v open >/dev/null 2>&1; then
        open "$1"
    else
        warning "Open $1 in your browser."
    fi
}

# The HTTP status the server answers this address with (503: not set up yet), or 000.
status_of() {
    if command -v curl >/dev/null 2>&1; then
        curl -s -o /dev/null -m 2 -w '%{http_code}' "$1" 2>/dev/null || true
    else
        "$PHP" -r '$h = @get_headers($argv[1]); echo $h && preg_match("~ (\d{3})~", $h[0], $m) ? $m[1] : "000";' "$1"
    fi
}

# 0 when the server answers at all.
app_answers() {
    local code
    code="$(status_of "$1/api/health")"
    [ -n "$code" ] && [ "$code" != "000" ]
}

# What to open: the app, or the setup page while this copy is not set up yet.
open_url() {
    if [ "$(status_of "$APP_URL/api/health")" = "503" ]; then
        echo "$APP_URL/setup.php"
    else
        echo "$APP_URL"
    fi
}

# ------------------------------------------------------------
# Header
# ------------------------------------------------------------

clear 2>/dev/null || true

echo ""
echo -e "${BOLD}==============================================${NC}"
echo -e "${BOLD}  $PROJECT_NAME${NC}"
echo -e "${BOLD}  Launcher${NC}"
echo -e "${BOLD}==============================================${NC}"
echo ""

# ------------------------------------------------------------
# 1. The project folder
# ------------------------------------------------------------

# The folder of this script, wherever it was started from.
cd "$(dirname "$0")" || die "Cannot enter the folder of this script."

if [ ! -f backend/server.php ] || [ ! -f frontend/package.json ]; then
    die "backend/server.php or frontend/package.json is missing. This script belongs in the $PROJECT_NAME folder."
fi

# ------------------------------------------------------------
# 2. PHP and Node.js
# ------------------------------------------------------------

info "Looking for PHP 8.1+ with pdo_pgsql, mbstring and intl..."

PHP=""
TRIED=""

while read -r candidate; do
    [ -z "$candidate" ] && continue
    problem="$(php_problem "$candidate")"
    if [ -z "$problem" ]; then
        PHP="$candidate"
        break
    fi
    TRIED="$TRIED
    $candidate  ($problem)"
done <<EOF
$(php_candidates)
EOF

if [ -z "$PHP" ]; then
    if [ -n "$TRIED" ]; then
        error "Tried:$TRIED"
    fi
    die "No PHP 8.1 or newer with the extensions pdo_pgsql, mbstring and intl was found.

To install it:
    macOS (Homebrew):   brew install php
    Debian / Ubuntu:    sudo apt install php-cli php-pgsql php-mbstring php-intl php-curl
    Fedora:             sudo dnf install php-cli php-pgsql php-mbstring php-intl

Or set ACADEMY_PHP to the php to use. Then run this launcher again."
fi

success "PHP: $PHP"

# The app is built with Node.js (Angular needs 20.19, 22.12, or 24 and newer).
NODE_VERSION="$(node -v 2>/dev/null || true)"
case "$NODE_VERSION" in
    v2[0-9].*|v[3-9][0-9].*) ;;
    *) die "Node.js 20.19 or newer was not found (${NODE_VERSION:-none}). It builds the app (once, and again after an update).

Install the LTS version from https://nodejs.org, then run this launcher again." ;;
esac
NODE_MAJOR="${NODE_VERSION#v}"
NODE_MAJOR="${NODE_MAJOR%%.*}"
NODE_MINOR="${NODE_VERSION#v*.}"
NODE_MINOR="${NODE_MINOR%%.*}"
if { [ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -lt 19 ]; } || [ "$NODE_MAJOR" -eq 21 ] \
    || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 12 ]; } || [ "$NODE_MAJOR" -eq 23 ]; then
    die "Node.js $NODE_VERSION is too old to build the app: install the LTS version from https://nodejs.org."
fi
success "Node.js: $NODE_VERSION"
echo ""

# ------------------------------------------------------------
# 3. The app
# ------------------------------------------------------------

info "Checking the app (built again only when its sources changed)..."
echo ""

if ! node frontend/scripts/ensure-build.mjs; then
    die "The app did not build: the lines above say why.

The first build downloads its packages (npm), so it needs the internet."
fi
echo ""

APP_URL="$("$PHP" backend/server.php --url)"
APP_PORT="${APP_URL##*:}"

case "$APP_PORT" in
    ''|*[!0-9]*) die "Could not read the server's address from backend/server.php." ;;
esac

# ------------------------------------------------------------
# 4. Start
# ------------------------------------------------------------

if app_answers "$APP_URL"; then
    success "$PROJECT_NAME is already running."
    open_browser "$(open_url)"
    exit 0
fi

if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$APP_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    die "Port $APP_PORT is taken:
$(lsof -nP -iTCP:"$APP_PORT" -sTCP:LISTEN)

If that is an older copy of this app, stop it first."
fi

info "Starting $PROJECT_NAME..."

TEMP_DIR="${TMPDIR:-/tmp}/JapaneseAcademy"
STDOUT_FILE="$TEMP_DIR/server.stdout.log"
STDERR_FILE="$TEMP_DIR/server.stderr.log"

mkdir -p "$TEMP_DIR"
rm -f "$STDOUT_FILE" "$STDERR_FILE"

"$PHP" backend/server.php >"$STDOUT_FILE" 2>"$STDERR_FILE" &
SERVER_PID=$!

# Ctrl+C lands here too. backend/server.php runs PHP's web server as a child
# process: stop both.
stop_server() {
    if kill -0 "$SERVER_PID" 2>/dev/null; then
        pkill -P "$SERVER_PID" 2>/dev/null
        kill "$SERVER_PID" 2>/dev/null
    fi
    rm -f "$STDOUT_FILE" "$STDERR_FILE"
}
trap stop_server EXIT
trap 'exit 130' INT TERM

info "Waiting for $APP_URL..."

READY=0
for _ in $(seq 1 $((SERVER_STARTUP_TIMEOUT * 2))); do
    sleep 0.5
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
        break
    fi
    if app_answers "$APP_URL"; then
        READY=1
        break
    fi
done

if [ "$READY" -ne 1 ]; then
    error "The server did not start."
    echo ""
    cat "$STDOUT_FILE" 2>/dev/null
    tail -n 20 "$STDERR_FILE" 2>/dev/null
    exit 1
fi

success "Server is ready."
echo ""

# what the server says about itself: items, questions, the day's backup
cat "$STDOUT_FILE" 2>/dev/null

OPEN_URL="$(open_url)"
info "Opening $OPEN_URL..."
open_browser "$OPEN_URL"

echo ""
success "$PROJECT_NAME is running."
echo ""
echo "Press Ctrl+C to stop it."
echo ""

wait "$SERVER_PID"
