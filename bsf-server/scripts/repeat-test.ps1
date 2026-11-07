<#
.SYNOPSIS
    Runs the same tests many times and counts how often a test worker crashes (#358).

.DESCRIPTION
    A test run on Windows sometimes ends with "Worker exited unexpectedly" and no failed
    test. It happens too rarely to judge from one or two runs, so this script repeats a
    run, keeps each run's full output in logs\, and prints only a tally:

      crashed      a test worker died ("Worker exited unexpectedly" / "emitted error")
      failed       no crash, but a test failed or timed out (a FAIL line)
      clean        every test passed and the run finished normally
      did not run  anything else, such as no summary line, or a non-zero exit with no
                   recognised line. Never counted as clean: a run that did not finish
                   has not shown that nothing is wrong.

    The tally is also added to logs\repeat-summary.md, and one line per run to
    logs\repeat-<label>.csv. It runs under Windows PowerShell 5.1 (powershell.exe).

.PARAMETER Files
    Test files to run, separated by commas. Leave out to run the whole suite.

.PARAMETER Runs
    How many times to run. Default 20.

.PARAMETER Label
    A short name for this case; used in the log file names and the tally.

.PARAMETER VitestArgs
    Extra arguments for the test runner, separated by commas, such as
    --reporter=verbose,--logHeapUsage. An argument that itself holds a comma cannot be passed.

.PARAMETER TimeoutMinutes
    How long one run may take before it is stopped and counted as did not run. Default 10.

.PARAMETER Diagnose
    Also record how each test worker ended (exit code, signal, and who asked it to
    exit), using scripts\worker-exit-probe.cjs. Written to logs\repeat-<label>-<n>.probe.log.

.EXAMPLE
    powershell.exe -ExecutionPolicy Bypass -File scripts\repeat-test.ps1 -Label battle -Files test/routes/battle.test.ts

.NOTES
    Technical: runs node_modules\vitest\vitest.mjs directly (no yarn, no type-check) from
    the bsf-server folder.
#>
param(
    [string[]]$Files = @(),
    [int]$Runs = 20,
    [Parameter(Mandatory = $true)][string]$Label,
    [string[]]$VitestArgs = @(),
    [switch]$Diagnose,
    [int]$TimeoutMinutes = 10
)

$ErrorActionPreference = 'Stop'
# Started with -File, PowerShell hands "a.ts,b.ts" over as one string; split it here.
$Files = @($Files | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$VitestArgs = @($VitestArgs | ForEach-Object { $_ -split ',' } | Where-Object { $_ })
$serverDir = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $serverDir 'logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

$vitest = Join-Path $serverDir 'node_modules\vitest\vitest.mjs'
if (-not (Test-Path $vitest)) { throw "Test runner not found at $vitest. Run yarn install in bsf-server first." }
$probe = Join-Path $PSScriptRoot 'worker-exit-probe.cjs'

$csv = Join-Path $logDir "repeat-$Label.csv"
'run,outcome,exit_code,seconds,tests' | Set-Content -Path $csv -Encoding UTF8

$nodeArgs = @("`"$vitest`"", 'run') + $Files + $VitestArgs
$oldNodeOptions = $env:NODE_OPTIONS
$oldProbe = $env:REPEAT_TEST_PROBE

$counts = @{ crashed = 0; failed = 0; clean = 0; 'did not run' = 0 }
$alsoFailed = 0
$seconds = New-Object System.Collections.Generic.List[double]

try {
    for ($n = 1; $n -le $Runs; $n++) {
        $log = Join-Path $logDir "repeat-$Label-$n.log"
        $errLog = "$log.stderr"
        $probeLog = Join-Path $logDir "repeat-$Label-$n.probe.log"
        Remove-Item -Path $log, $errLog, $probeLog -ErrorAction SilentlyContinue

        if ($Diagnose) {
            # Forward slashes: NODE_OPTIONS splits on spaces and treats backslashes as escapes.
            $env:NODE_OPTIONS = (("--require `"{0}`" {1}" -f ($probe -replace '\\', '/'), $oldNodeOptions)).Trim()
            $env:REPEAT_TEST_PROBE = $probeLog
        }

        $watch = [System.Diagnostics.Stopwatch]::StartNew()
        $proc = Start-Process -FilePath 'node' -ArgumentList $nodeArgs -WorkingDirectory $serverDir `
            -NoNewWindow -PassThru -RedirectStandardOutput $log -RedirectStandardError $errLog
        $null = $proc.Handle  # without this, PowerShell 5.1 can lose the exit code
        $finished = $proc.WaitForExit($TimeoutMinutes * 60 * 1000)
        if (-not $finished) {
            # /T also stops the test workers the runner started. taskkill complains about any
            # worker that has already gone. With 'Stop' set, PowerShell 5.1 treats that
            # complaint as an error and stops taskkill before it reaches the runner itself, so
            # the wait below would never end. 'Continue' here lets taskkill finish.
            & { $ErrorActionPreference = 'Continue'; & taskkill.exe /PID $proc.Id /T /F 2>&1 | Out-Null }
        }
        $proc.WaitForExit()
        $watch.Stop()
        $exitCode = $proc.ExitCode
        $secs = [math]::Round($watch.Elapsed.TotalSeconds, 1)

        # One log per run: the runner's output, then anything it wrote as errors.
        if (Test-Path $errLog) {
            Add-Content -Path $log -Value "`n----- standard error -----"
            Get-Content -Path $errLog | Add-Content -Path $log
            Remove-Item -Path $errLog
        }
        $text = ''
        if (Test-Path $log) { $text = [System.IO.File]::ReadAllText($log) }

        $crashed = $text -match 'Worker exited unexpectedly|Worker \w+ emitted error'
        $failed = $text -match '(?m)^\s*FAIL\s|AssertionError|Test timed out|Hook timed out'
        $hasSummary = $text -match '(?m)^\s*Test Files\s'
        $tests = ''
        $m = [regex]::Match($text, '(?m)^\s*Tests\s+(.+?)\s*$')
        if ($m.Success) { $tests = $m.Groups[1].Value -replace ',', ';' }

        if (-not $finished) { $outcome = 'did not run' }
        elseif ($crashed) { $outcome = 'crashed'; if ($failed) { $alsoFailed++ } }
        elseif ($failed) { $outcome = 'failed' }
        elseif ($exitCode -eq 0 -and $hasSummary) { $outcome = 'clean' }
        else { $outcome = 'did not run' }

        $counts[$outcome]++
        $seconds.Add($secs)
        "$n,$outcome,$exitCode,$secs,$tests" | Add-Content -Path $csv -Encoding UTF8
    }
}
finally {
    $env:NODE_OPTIONS = $oldNodeOptions
    $env:REPEAT_TEST_PROBE = $oldProbe
}

$sorted = @($seconds | Sort-Object)
$median = 0
if ($sorted.Count -gt 0) {
    $mid = [math]::Floor($sorted.Count / 2)
    if ($sorted.Count % 2 -eq 1) { $median = $sorted[$mid] }
    else { $median = [math]::Round(($sorted[$mid - 1] + $sorted[$mid]) / 2, 1) }
}

$what = 'whole suite'
if ($Files.Count -gt 0) { $what = $Files -join ' ' }
if ($VitestArgs.Count -gt 0) { $what = "$what $($VitestArgs -join ' ')" }
$crashNote = "$($counts['crashed'])"
if ($alsoFailed -gt 0) { $crashNote = "$crashNote ($alsoFailed also failed)" }

$row = "| $Label | $what | $Runs | $crashNote | $($counts['failed']) | $($counts['clean']) | $($counts['did not run']) | $median |"
$summary = Join-Path $logDir 'repeat-summary.md'
if (-not (Test-Path $summary)) {
    @(
        '| Label | What ran | Runs | Crashed | Failed | Clean | Did not run | Median s |',
        '|---|---|---|---|---|---|---|---|'
    ) | Set-Content -Path $summary -Encoding UTF8
}
Add-Content -Path $summary -Value $row -Encoding UTF8

Write-Output '| Label | What ran | Runs | Crashed | Failed | Clean | Did not run | Median s |'
Write-Output '|---|---|---|---|---|---|---|---|'
Write-Output $row
