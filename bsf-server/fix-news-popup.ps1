# Banner Saga Factions Custom Server - News Popup Fix Script
# Usage:
#   .\fix-news-popup.ps1                          # auto mode, global_0.sol (default)
#   .\fix-news-popup.ps1 -Mode bak                # require bak; error if missing
#   .\fix-news-popup.ps1 -Mode synthetic          # force synthetic 2040-01-31 date
#   .\fix-news-popup.ps1 -SolName global_1        # patch the second-instance SOL
#                                                 # (right window in dual-client launches)
#
# Fixes the "News of the Banner" popup that blocks the main menu on launch.
# The popup is purely client-side and triggers when the client's preferences
# SOL is missing the news_date property. SOL files are keyed by Adobe AIR
# wrapper index: single-client launch uses global_0.sol only; dual-client
# launch also writes global_1.sol for the second window. Each needs patching.
#
# This script appends the news_date property using one of two sources:
#   - bak       : extract the real news_date from <SolName>.sol.bak
#   - synthetic : write a hard-coded 2040-01-31 date (day=31 suppresses the
#                 popup permanently due to a day-of-month bug in the client)
#
# Safety:
#   - If the target SOL already contains news_date, the script exits without
#     writing (idempotent: safe to re-run).
#   - On the first patch, backs up the pre-patch SOL to <SolName>.sol.bak2.
#     Subsequent patches preserve that backup rather than overwrite it with a
#     possibly-stale state. To force a fresh bak2, delete it manually first.

param(
    [ValidateSet('auto', 'bak', 'synthetic')]
    [string]$Mode = 'auto',

    [string]$SolName = 'global_0',

    [string]$SolDir = "$env:APPDATA\TheBannerSagaFactions\Local Store\#SharedObjects\app.game.air.swf"
)

function Find-NewsDatePos {
    # Returns the byte offset of the "news_date" AMF3 property name in $Bytes,
    # or -1 if not present. Bounded so callers can safely read the type byte
    # plus an 8-byte value following the 10-byte name match.
    param([byte[]]$Bytes)
    $needle = [byte[]]@(0x13, 0x6E, 0x65, 0x77, 0x73, 0x5F, 0x64, 0x61, 0x74, 0x65)
    for ($i = 0; $i -lt $Bytes.Length - 20; $i++) {
        $ok = $true
        for ($j = 0; $j -lt 10; $j++) {
            if ($Bytes[$i + $j] -ne $needle[$j]) { $ok = $false; break }
        }
        if ($ok) { return $i }
    }
    return -1
}

Write-Host "Banner Saga Factions - News Popup Fix" -ForegroundColor Green
Write-Host ""

# Validate target directory
if (-not (Test-Path $SolDir)) {
    Write-Host "ERROR: SOL directory not found: $SolDir" -ForegroundColor Red
    Write-Host "Has the game been launched at least once on this machine?" -ForegroundColor Yellow
    exit 1
}

$solPath = Join-Path $SolDir "$SolName.sol"
$bakPath = Join-Path $SolDir "$SolName.sol.bak"

if (-not (Test-Path $solPath)) {
    Write-Host "ERROR: $SolName.sol not found: $solPath" -ForegroundColor Red
    exit 1
}

# Read SOL once. We need it for both the idempotency check below and the
# subsequent append, so avoid loading the file twice.
$sol = [IO.File]::ReadAllBytes($solPath)

if ((Find-NewsDatePos $sol) -ge 0) {
    Write-Host "$SolName.sol already contains news_date - nothing to do." -ForegroundColor Green
    Write-Host "If the popup is still appearing, restore the previous backup first:" -ForegroundColor Yellow
    Write-Host "  Copy-Item '$solPath.bak2' '$solPath' -Force" -ForegroundColor Yellow
    exit 0
}

$bakExists = Test-Path $bakPath

# Resolve auto mode
if ($Mode -eq 'auto') {
    $Mode = if ($bakExists) { 'bak' } else { 'synthetic' }
    Write-Host "Auto mode resolved to: $Mode" -ForegroundColor Cyan
}

if ($Mode -eq 'bak' -and -not $bakExists) {
    Write-Host "ERROR: bak mode requested but $SolName.sol.bak not found: $bakPath" -ForegroundColor Red
    Write-Host "Re-run with -Mode synthetic to use a hard-coded date instead." -ForegroundColor Yellow
    exit 1
}

Write-Host "Target SOL: $solPath" -ForegroundColor Cyan
Write-Host "Mode:       $Mode" -ForegroundColor Cyan
Write-Host ""

# Build the news_date property block.
# AMF3 layout: [U29 string length+inline flag][bytes "news_date"][type byte][ref byte][value bytes]
$prop = $null

if ($Mode -eq 'bak') {
    $bak = [IO.File]::ReadAllBytes($bakPath)
    $pos = Find-NewsDatePos $bak

    if ($pos -lt 0) {
        Write-Host "ERROR: news_date property not found in bak file." -ForegroundColor Red
        Write-Host "Re-run with -Mode synthetic to use a hard-coded date instead." -ForegroundColor Yellow
        exit 1
    }

    $type = $bak[$pos + 10]
    $vl = switch ($type) {
        0x08    { 9 }   # AMF3 Date   (type byte + ref byte + 8-byte double)
        0x05    { 8 }   # AMF3 Double (type byte + 8-byte double, no ref byte)
        default { 0 }
    }

    if ($vl -eq 0) {
        Write-Host "ERROR: unsupported value type 0x$('{0:X2}' -f $type) at offset $pos in bak." -ForegroundColor Red
        Write-Host "Expected 0x08 (Date) or 0x05 (Number). Re-run with -Mode synthetic." -ForegroundColor Yellow
        exit 1
    }

    $prop = $bak[$pos..($pos + 9 + $vl)]
    Write-Host "Extracted news_date from bak (offset $pos, type 0x$('{0:X2}' -f $type), $($prop.Length) bytes)" -ForegroundColor Green
}
else {
    # Synthetic: hard-coded 2040-01-31 00:00:00 UTC as an IEEE 754 double.
    $prop = [byte[]]@(
        0x13,                                                  # U29: inline string, length 9
        0x6E, 0x65, 0x77, 0x73, 0x5F, 0x64, 0x61, 0x74, 0x65,  # "news_date"
        0x08,                                                  # AMF3 Date type
        0x01,                                                  # inline date reference
        0x42, 0x80, 0x17, 0x63, 0xE7, 0x64, 0xE2, 0x00         # 2040-01-31 00:00 UTC double
    )
    Write-Host "Using synthetic news_date = 2040-01-31 ($($prop.Length) bytes)" -ForegroundColor Green
}

# Back up the pre-patch SOL on first run only. If bak2 already exists, it was
# written by an earlier successful run and we keep it (otherwise re-running the
# script after a non-idempotent reset could clobber the true pre-patch state).
$backupPath = "$solPath.bak2"
if (Test-Path $backupPath) {
    Write-Host "Existing safety backup preserved: $backupPath" -ForegroundColor Cyan
} else {
    [IO.File]::WriteAllBytes($backupPath, $sol)
    Write-Host "Backed up pre-patch SOL to: $backupPath" -ForegroundColor Cyan
}

# Append property + null terminator.
$nl = [System.Collections.Generic.List[byte]]::new()
$nl.AddRange($sol)
$nl.AddRange([byte[]]$prop)
$nl.Add([byte]0x00)

# Rewrite the 4-byte big-endian length header at offsets 2..5 (body length = file length - 6).
$ns  = $nl.ToArray()
$len = $ns.Length - 6
$ns[2] = [byte](($len -shr 24) -band 0xFF)
$ns[3] = [byte](($len -shr 16) -band 0xFF)
$ns[4] = [byte](($len -shr  8) -band 0xFF)
$ns[5] = [byte]( $len          -band 0xFF)

[IO.File]::WriteAllBytes($solPath, $ns)

Write-Host ""
Write-Host "Done: $($sol.Length) -> $($ns.Length) bytes" -ForegroundColor Green
Write-Host "Launch the game; the News of the Banner popup should not appear." -ForegroundColor Green
Write-Host "If something looks wrong, restore the original with:" -ForegroundColor Yellow
Write-Host "  Copy-Item '$backupPath' '$solPath' -Force" -ForegroundColor Yellow
