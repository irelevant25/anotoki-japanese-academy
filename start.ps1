# ============================================================
# Japanese Academy - Launcher
# Windows / PowerShell
#
# Finds PHP (8.1 or newer, with pdo_pgsql, mbstring and intl) and Node.js,
# builds the app when its sources changed (the first time this also installs
# its packages), starts the server (backend/server.php, which applies new
# migrations and takes the day's backup first) and opens the browser: the app,
# or the setup page (/setup.php) while this copy is not set up yet.
# Ctrl+C stops it.
# ============================================================

$ErrorActionPreference = "Stop"

$ProjectName = "Japanese Academy"

# The first start after an update builds the study content in the database,
# and a database update copies every table first: seconds, rarely a minute.
$ServerStartupTimeoutSeconds = 120

# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------

function Write-Info {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Green
}

function Write-ErrorMessage {
    param([string]$Message)
    Write-Host $Message -ForegroundColor Red
}

function Stop-Script {
    param([string]$Message)

    Write-Host ""
    Write-ErrorMessage "ERROR: $Message"
    Write-Host ""

    # Started by a double-click, the window would close before this could be read.
    Read-Host "Press Enter to close" | Out-Null
    exit 1
}

# A native command's output, whatever it writes to stderr (PHP 7 warns there).
function Get-Output {
    param([string]$Exe, [string[]]$Arguments)

    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        return (& $Exe @Arguments 2>$null | Out-String)
    }
    catch {
        return ""
    }
    finally {
        $ErrorActionPreference = $previous
    }
}

# "" when this PHP can run the app, else the reason it can't.
function Test-Php {
    param([string]$Php)

    $version = Get-Output $Php @("-v")
    if ($version -notmatch '(?m)^PHP (\d+)\.(\d+)\.(\S+)') {
        return "does not run"
    }
    $found = "PHP $($Matches[1]).$($Matches[2]).$($Matches[3])"
    if ([int]$Matches[1] -lt 8 -or ([int]$Matches[1] -eq 8 -and [int]$Matches[2] -lt 1)) {
        return "$found is too old"
    }

    $modules = Get-Output $Php @("-m")
    $missing = @("pdo_pgsql", "mbstring", "intl") | Where-Object { $modules -notmatch "(?mi)^$_\s*$" }
    if ($missing) {
        return "$found lacks $($missing -join ', ')"
    }
    return ""
}

# Every php.exe worth trying: ACADEMY_PHP, PATH, the usual install folders.
function Get-PhpCandidates {
    $list = New-Object System.Collections.Generic.List[string]

    if ($env:ACADEMY_PHP) {
        $list.Add($env:ACADEMY_PHP)
    }

    Get-Command php.exe -All -CommandType Application -ErrorAction SilentlyContinue |
        ForEach-Object { $list.Add($_.Source) }

    $folders = @("C:\php", "C:\xampp\php",
        "$env:USERPROFILE\scoop\apps\php\current",
        "$env:LOCALAPPDATA\Microsoft\WinGet\Links")
    foreach ($parent in @("C:\", "C:\tools", "C:\laragon\bin\php", "$env:LOCALAPPDATA\Microsoft\WinGet\Packages")) {
        Get-ChildItem -LiteralPath $parent -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match '^(php|PHP\.PHP)' } |
            Sort-Object Name -Descending |
            ForEach-Object { $folders += $_.FullName }
    }
    foreach ($folder in $folders) {
        $exe = Join-Path $folder "php.exe"
        if (Test-Path -LiteralPath $exe -PathType Leaf) {
            $list.Add($exe)
        }
    }

    return $list | Select-Object -Unique
}

# The HTTP status the server answers this address with, or 0 when nothing answers.
function Get-Status {
    param([string]$Url)

    try {
        return [int](Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2).StatusCode
    }
    catch [System.Net.WebException] {
        # 503 (not set up yet) is an answer too
        if ($_.Exception.Response) {
            return [int]$_.Exception.Response.StatusCode
        }
        return 0
    }
    catch {
        return 0
    }
}

# ------------------------------------------------------------
# Header
# ------------------------------------------------------------

Clear-Host

Write-Host ""
Write-Host "==============================================" -ForegroundColor White
Write-Host "  $ProjectName" -ForegroundColor White
Write-Host "  Launcher" -ForegroundColor White
Write-Host "==============================================" -ForegroundColor White
Write-Host ""

# ------------------------------------------------------------
# 1. The project folder
# ------------------------------------------------------------

# The folder of this script, wherever it was started from.
Set-Location -LiteralPath $PSScriptRoot

if (-not (Test-Path "backend\server.php" -PathType Leaf) -or -not (Test-Path "frontend\package.json" -PathType Leaf)) {
    Stop-Script "backend\server.php or frontend\package.json is missing. This script belongs in the $ProjectName folder."
}

# ------------------------------------------------------------
# 2. PHP and Node.js
# ------------------------------------------------------------

Write-Info "Looking for PHP 8.1+ with pdo_pgsql, mbstring and intl..."

$Php = $null
$tried = @()

foreach ($candidate in Get-PhpCandidates) {
    $problem = Test-Php $candidate
    if (-not $problem) {
        $Php = $candidate
        break
    }
    $tried += "    $candidate  ($problem)"
}

if (-not $Php) {
    $triedText = if ($tried) { "Tried:`n" + ($tried -join "`n") + "`n`n" } else { "" }
    Stop-Script @"
No PHP 8.1 or newer with the extensions pdo_pgsql, mbstring and intl was found.

$triedText
To install it:
  1. Download PHP 8 for Windows (the x64 Thread Safe zip) from
     https://windows.php.net/download
  2. Unzip it, e.g. to C:\php, and add that folder to PATH.
  3. In that folder, copy php.ini-production to php.ini and turn these on
     (remove the ; in front of each line):
         extension_dir = "ext"
         extension=curl
         extension=intl
         extension=mbstring
         extension=openssl
         extension=pdo_pgsql

Or set ACADEMY_PHP to the php.exe to use. Then run this launcher again.
"@
}

Write-Success "PHP: $Php"

# The app is built with Node.js (Angular needs 20.19, 22.12, or 24 and newer).
$nodeVersion = (Get-Output "node" @("-v")).Trim()
if ($nodeVersion -notmatch '^v(\d+)\.(\d+)') {
    Stop-Script @"
Node.js was not found. It builds the app (once, and again after an update).

Install the LTS version from https://nodejs.org, then run this launcher again.
"@
}
$nodeMajor = [int]$Matches[1]
$nodeMinor = [int]$Matches[2]
if ($nodeMajor -lt 20 -or ($nodeMajor -eq 20 -and $nodeMinor -lt 19) -or $nodeMajor -eq 21 -or ($nodeMajor -eq 22 -and $nodeMinor -lt 12) -or $nodeMajor -eq 23) {
    Stop-Script "Node.js $nodeVersion is too old to build the app: install the LTS version from https://nodejs.org."
}
Write-Success "Node.js: $nodeVersion"
Write-Host ""

# ------------------------------------------------------------
# 3. The app
# ------------------------------------------------------------

Write-Info "Checking the app (built again only when its sources changed)..."
Write-Host ""

& node "frontend\scripts\ensure-build.mjs"
if ($LASTEXITCODE -ne 0) {
    Stop-Script @"
The app did not build: the lines above say why.

The first build downloads its packages (npm), so it needs the internet.
"@
}
Write-Host ""

$AppUrl = (Get-Output $Php @("backend\server.php", "--url")).Trim()

if ($AppUrl -notmatch '^http://([^:/]+):(\d+)$') {
    Stop-Script "Could not read the server's address from backend\server.php."
}

$AppPort = [int]$Matches[2]

# ------------------------------------------------------------
# 4. Start
# ------------------------------------------------------------

# What to open: the app, or the setup page while this copy is not set up yet.
function Get-OpenUrl {
    if ((Get-Status "$AppUrl/api/health") -eq 503) {
        return "$AppUrl/setup.php"
    }
    return $AppUrl
}

if ((Get-Status "$AppUrl/api/health") -ne 0) {
    Write-Success "$ProjectName is already running."
    Start-Process (Get-OpenUrl)
    exit 0
}

$busy = Get-NetTCPConnection -LocalPort $AppPort -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1

if ($busy) {
    $owner = Get-Process -Id $busy.OwningProcess -ErrorAction SilentlyContinue
    Stop-Script @"
Port $AppPort is taken by $($owner.ProcessName) (process $($busy.OwningProcess)).

If that is an older copy of this app, close its window, or stop it with:
    Stop-Process -Id $($busy.OwningProcess)
"@
}

Write-Info "Starting $ProjectName..."

# The server shares this window's console, so Ctrl+C or closing the window
# stops it too; its output goes to files.
$TempDirectory = Join-Path $env:TEMP "JapaneseAcademy"
$StdOutFile = Join-Path $TempDirectory "server.stdout.log"
$StdErrFile = Join-Path $TempDirectory "server.stderr.log"

if (-not (Test-Path $TempDirectory)) {
    New-Item -ItemType Directory -Path $TempDirectory -Force | Out-Null
}

Remove-Item $StdOutFile, $StdErrFile -Force -ErrorAction SilentlyContinue

$serverProcess = Start-Process `
    -FilePath $Php `
    -ArgumentList "backend\server.php" `
    -WorkingDirectory $PSScriptRoot `
    -NoNewWindow `
    -RedirectStandardOutput $StdOutFile `
    -RedirectStandardError $StdErrFile `
    -PassThru

try {
    Write-Info "Waiting for $AppUrl..."

    $serverReady = $false
    $startTime = Get-Date

    while (((Get-Date) - $startTime).TotalSeconds -lt $ServerStartupTimeoutSeconds) {

        Start-Sleep -Milliseconds 500

        if ($serverProcess.HasExited) {
            break
        }

        if ((Get-Status "$AppUrl/api/health") -ne 0) {
            $serverReady = $true
            break
        }
    }

    if (-not $serverReady) {
        Write-ErrorMessage "The server did not start."
        Write-Host ""
        if (Test-Path $StdOutFile) { Get-Content $StdOutFile -Encoding UTF8 }
        if (Test-Path $StdErrFile) { Get-Content $StdErrFile -Encoding UTF8 | Select-Object -Last 20 }
        Write-Host ""
        Read-Host "Press Enter to close" | Out-Null
        exit 1
    }

    Write-Success "Server is ready."
    Write-Host ""

    # what the server says about itself: items, questions, the day's backup
    # (PHP writes UTF-8; Windows PowerShell would read the file in the system code page)
    if (Test-Path $StdOutFile) {
        Get-Content $StdOutFile -Encoding UTF8
    }

    $OpenUrl = Get-OpenUrl
    Write-Info "Opening $OpenUrl..."
    Start-Process $OpenUrl

    Write-Host ""
    Write-Success "$ProjectName is running."
    Write-Host ""
    Write-Host "Press Ctrl+C (or close this window) to stop it."
    Write-Host ""

    while (-not $serverProcess.HasExited) {
        Start-Sleep -Milliseconds 500
    }
}
finally {
    # Ctrl+C lands here too. backend\server.php runs PHP's web server as a
    # child process: stop both.
    if (-not $serverProcess.HasExited) {
        # It may exit in the meantime; taskkill's complaint must not stop the cleanup.
        try {
            & taskkill.exe /PID $serverProcess.Id /T /F 2>$null | Out-Null
        }
        catch {
            # already stopped
        }
    }
    Remove-Item $StdOutFile, $StdErrFile -Force -ErrorAction SilentlyContinue
}

exit 0
