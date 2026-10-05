# Shared helpers for deploy-test.ps1, deploy-production.ps1 and launch-game-test-server.ps1.
# Dot-source it, do not run it:   . (Join-Path $PSScriptRoot 'scripts\deploy-common.ps1')
#
# The deploy steps here are the ones in docs/Deployment.md -> "Deploying Code Changes", run for
# you from this PC over SSH. That section stays the reference: read it to know what each step is
# for, and fall back to it by hand if a script stops part-way.
#
# Every cloud command names the account, the project and the zone, taken from
# deploy-targets.local.psd1. Nothing depends on which project gcloud happens to be pointed at.
# See docs/Deployment.md -> "Know which project you are aimed at".

#Requires -Version 7.2

# The bsf-server folder, worked out once while this file is being dot-sourced.
$script:BsfServerRoot     = Split-Path -Parent $PSScriptRoot
$script:DeployTargetsFile = Join-Path $script:BsfServerRoot 'deploy-targets.local.psd1'

function Get-DeployTarget {
    # Reads one machine's settings from deploy-targets.local.psd1, after checking that the file
    # exists, that nothing is left as a placeholder, and that the test machine is not the live one.
    param([Parameter(Mandatory)][ValidateSet('test', 'production')][string]$Name)

    if (-not (Test-Path $script:DeployTargetsFile)) {
        throw "No settings file at $script:DeployTargetsFile. Copy deploy-targets.example.psd1 to deploy-targets.local.psd1 (same folder) and fill in your accounts."
    }
    $all = Import-PowerShellDataFile $script:DeployTargetsFile

    $urlHost = @{}
    foreach ($n in 'test', 'production') {
        if (-not $all.ContainsKey($n)) { throw "deploy-targets.local.psd1 has no '$n' section." }
        foreach ($k in 'Vm', 'Zone', 'Project', 'Account', 'RepoDir') {
            $v = [string]$all[$n][$k]
            # -cmatch: capitals must match, so a real name that happens to hold "your-" is allowed.
            if (-not $v -or $v -cmatch 'you@example\.com|YOUR-') {
                throw "Setting '$k' for '$n' in deploy-targets.local.psd1 is not filled in."
            }
            # These values end up on a command line, so they are kept to plain characters.
            if ($v -match '[\s"%!,]') {
                throw "Setting '$k' for '$n' contains a space, quote, comma, percent sign or exclamation mark: '$v'."
            }
        }
        # Url may be left empty: the address is then looked up (see Get-ServerUrl). When it is
        # filled in, it is where the last deploy step and the test launcher connect.
        $u = [string]$all[$n]['Url']
        $parsed = $null
        if ($u -and ($u -cmatch 'you@example\.com|YOUR-' -or $u -notmatch '^https?://[^\s"%!,]+$' -or -not [uri]::TryCreate($u, [System.UriKind]::Absolute, [ref]$parsed))) {
            throw "Setting 'Url' for '$n' in deploy-targets.local.psd1 is not a filled-in http:// or https:// address: '$u'."
        }
        # The server name inside the address, for the test-versus-production check below.
        $urlHost[$n] = if ($parsed) { $parsed.Host.TrimEnd('.') } else { '' }
    }

    # The guard that matters most: a test deploy must never be able to reach the live server.
    if ($all.test.Project -eq $all.production.Project -or $all.test.Vm -eq $all.production.Vm) {
        throw "The 'test' settings name the same project or machine as 'production'. Give the test machine its own project and name, so a mistake fails instead of reaching the live server."
    }
    # Compared by server name, so the live server written another way (http for https, a port, a
    # path, capitals) is still caught.
    if ($urlHost.test -and $urlHost.test -eq $urlHost.production) {
        throw "The 'test' Url names the same server as the 'production' Url ($($urlHost.test)). Leave the test Url empty, or give the test machine's own address: with the live one, the checks and the game would connect to the live server."
    }

    $t = $all[$Name].Clone()
    $t.Name = $Name
    return [pscustomobject]$t
}

function Get-GcloudTargetArgs($Target) {
    return @("--zone=$($Target.Zone)", "--account=$($Target.Account)", "--project=$($Target.Project)")
}

function Join-RemoteCommand {
    # Turns a readable block of shell commands - one per line - into the single line SSH needs.
    # Lines are joined with " && ", so the run stops at the first command that fails. Blank lines
    # and lines starting with # are dropped. Each @NAME@ is replaced from -Values.
    param([Parameter(Mandatory)][string]$Text, [hashtable]$Values = @{})
    foreach ($key in $Values.Keys) { $Text = $Text.Replace("@$key@", [string]$Values[$key]) }
    $lines = $Text -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') }
    return ($lines -join ' && ')
}

function Invoke-OnVm {
    # Runs one shell command on the machine over SSH and reports whether it worked.
    #
    # Two things about the trip from here to the machine shape this function:
    #  - A double quote, a percent sign or an exclamation mark in the command is refused. No
    #    command here needs one. Use single quotes.
    #  - Whether the machine's exit status survives the hop through gcloud and PuTTY has not been
    #    measured, so the command prints its own status as a last line and that is what is read.
    #    Join-RemoteCommand joins the lines with &&, so it stops at the first failing step.
    #
    # -Stream shows each line as it arrives (for the slow Docker build); otherwise output is only
    # collected. Either way it comes back in .Output.
    param(
        [Parameter(Mandatory)]$Target,
        [Parameter(Mandatory)][string]$Command,
        [switch]$Stream
    )
    if ($Command -match '["%!]') {
        throw "Internal error: a remote command may not contain a double quote, percent sign or exclamation mark: $Command"
    }
    $wrapped = "( set -e; $Command ); echo __EXIT__`$?"
    $gargs = @('compute', 'ssh', $Target.Vm) + (Get-GcloudTargetArgs $Target) + @("--command=$wrapped")

    $code  = $null
    $lines = [System.Collections.Generic.List[string]]::new()
    # The machine answers in UTF-8. Read it that way, or a dash in its output arrives garbled, then
    # put the console's own setting back.
    $savedEncoding = [Console]::OutputEncoding
    try {
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        & gcloud @gargs 2>&1 | ForEach-Object {
            $line = "$_"
            if ($line -match '^__EXIT__(\d+)\s*$') {
                $code = [int]$Matches[1]
            } else {
                $lines.Add($line)
                if ($Stream) { Write-Host $line }
            }
        }
        $gcloudExit = $LASTEXITCODE
    } finally {
        [Console]::OutputEncoding = $savedEncoding
    }

    if ($null -eq $code) {
        # The status line never arrived: the connection failed, before the command started or
        # part-way through it. With -Stream the lines are already on screen.
        if (-not $Stream) { Write-Host ($lines -join "`n") -ForegroundColor DarkGray }
        throw "Lost contact with $($Target.Vm) before the command finished (gcloud exit code $gcloudExit). If it never started: is the machine running, and is $($Target.Account) signed in to gcloud? If it had started, the machine may be part-way through this step: check it by hand (docs/Deployment.md -> 'Deploying Code Changes') before running this again."
    }
    return [pscustomobject]@{ Ok = ($code -eq 0); Code = $code; Output = $lines.ToArray() }
}

function Get-ServerUrl {
    # The address players connect to. A machine with a name (production) has it in the settings;
    # one without (the test machine) is looked up, because its address changes on every restart.
    param([Parameter(Mandatory)]$Target)
    if ($Target.Url) { return ($Target.Url.TrimEnd('/') + '/') }

    # JSON rather than a --format expression: brackets and parentheses in an argument are a trap
    # in both PowerShell and cmd.exe, and the JSON also says whether the machine is running.
    $gargs = @('compute', 'instances', 'describe', $Target.Vm) + (Get-GcloudTargetArgs $Target) + @('--format=json')
    $all = & gcloud @gargs 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Could not look up $($Target.Vm) in $($Target.Project): $($all -join ' ')"
    }
    # Keep only the JSON; any warning gcloud printed alongside it would break the parse.
    $json = $all | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] }
    $vm = ($json -join "`n") | ConvertFrom-Json
    $ip = $vm.networkInterfaces[0].accessConfigs[0].natIP
    if ($vm.status -ne 'RUNNING' -or -not $ip) {
        throw "$($Target.Vm) is $($vm.status) with no address. Start it with: gcloud compute instances start $($Target.Vm) $((Get-GcloudTargetArgs $Target) -join ' ')"
    }
    return "http://$ip/"
}

function Read-Confirm {
    # True only when the answer is exactly what was asked for (ignoring case and spaces).
    param([Parameter(Mandatory)][string]$Prompt, [string]$Expected = 'y')
    $answer = Read-Host $Prompt
    return ([string]$answer).Trim() -eq $Expected
}

function Write-Step([string]$Text) {
    Write-Host ""
    Write-Host "== $Text" -ForegroundColor Cyan
}

function Get-MarkedValue([string[]]$Lines, [string]$Name) {
    # Reads "NAME=value" from command output.
    $hit = $Lines | Where-Object { $_ -match "^$Name=" } | Select-Object -Last 1
    if ($hit) { return $hit.Substring($Name.Length + 1).Trim() }
    return $null
}

function Test-ServerFromHere {
    # Step 6 of docs/Deployment.md, from this PC: a sign-in must work, and the debug routes must not
    # answer. Returns $true when both checks pass.
    param([Parameter(Mandatory)][string]$Url)
    $ok = $true

    try {
        $login = Invoke-RestMethod -Method Post -Uri "$($Url)services/auth/login/11" -ContentType 'application/json' -Body '{"steam_id":"123456"}' -TimeoutSec 30
        if ($login.session_key) {
            Write-Host "  Sign-in works (a session key came back)." -ForegroundColor Green
        } else {
            Write-Host "  FAIL: the sign-in answered without a session key." -ForegroundColor Red
            $ok = $false
        }
    } catch {
        Write-Host "  FAIL: the sign-in did not work: $($_.Exception.Message)" -ForegroundColor Red
        $ok = $false
    }

    # Must be a POST: these routes take nothing else, so a GET gets 404 even on a wide-open server.
    try {
        Invoke-WebRequest -Method Post -Uri "$($Url)debug/party-limit" -UseBasicParsing -TimeoutSec 30 | Out-Null
        Write-Host "  FAIL: the debug routes answered. They must not be reachable on this server." -ForegroundColor Red
        $ok = $false
    } catch {
        $status = $null
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        if ($status -eq 404) {
            Write-Host "  Debug routes are shut (404)." -ForegroundColor Green
        } else {
            Write-Host "  FAIL: expected 404 from the debug check, got: $(if ($status) { $status } else { $_.Exception.Message })" -ForegroundColor Red
            $ok = $false
        }
    }
    return $ok
}

function Invoke-Deploy {
    # The whole of "Deploying Code Changes": pre-flight, confirm, back up, update, rebuild, verify.
    # Nothing on the machine changes before the confirmation in step 3.
    param(
        [Parameter(Mandatory)][ValidateSet('test', 'production')][string]$TargetName,
        [Parameter(Mandatory)][string]$Branch
    )
    $t = Get-DeployTarget $TargetName
    $isProd = ($TargetName -eq 'production')
    if ($isProd -and $Branch -ne 'main') { throw "Production only ever deploys main." }
    # The branch name goes into a remote command, so allow only ordinary branch-name characters,
    # starting with a letter or digit: a leading dash would be read by git as an option.
    if ($Branch -notmatch '^[A-Za-z0-9][A-Za-z0-9._/-]*$') { throw "Unusual branch name: '$Branch'." }

    Write-Host "Deploying '$Branch' to $($t.Vm) (project $($t.Project), account $($t.Account))" -ForegroundColor Green

    # ---- 1. Local check: the machine pulls from GitHub, so GitHub's copy is what will run -------
    Write-Step "1/8  Checking what GitHub has for '$Branch'"
    # Asked for by its full name (here and in step 2): by the short name, git hands back a tag
    # of the same name in the branch's place.
    git -C $script:BsfServerRoot fetch --quiet origin "refs/heads/$Branch"
    if ($LASTEXITCODE -ne 0) { throw "Could not fetch '$Branch' from GitHub. Is it pushed, and is this PC online?" }
    $remoteSha = (git -C $script:BsfServerRoot rev-parse FETCH_HEAD).Trim()
    Write-Host "  GitHub: $(git -C $script:BsfServerRoot log --oneline -1 $remoteSha)"
    if (-not $isProd) {
        $localSha = git -C $script:BsfServerRoot rev-parse --verify --quiet "refs/heads/$Branch"
        if ($localSha -and $localSha.Trim() -ne $remoteSha) {
            Write-Host "  Your local '$Branch' is not the same as GitHub's (unpushed commits, or behind)." -ForegroundColor Yellow
            Write-Host "  The test server will get GitHub's copy, shown above." -ForegroundColor Yellow
            if (-not (Read-Confirm "  Carry on with GitHub's copy? (y/n)")) { throw "Stopped. Nothing was changed." }
        }
    }

    # ---- 2. Pre-flight on the machine (read-only) -----------------------------------------------
    Write-Step "2/8  Pre-flight on $($t.Vm) (changes nothing)"
    $pre = Invoke-OnVm $t (Join-RemoteCommand -Values @{ DIR = $t.RepoDir; REF = $remoteSha; BRANCH = $Branch } -Text @'
cd @DIR@
git fetch --quiet origin refs/heads/@BRANCH@
git cat-file -e @REF@
echo BRANCH=$(git branch --show-current)
echo CURRENT=$(git rev-parse HEAD)
echo AHEAD=$(git rev-list --count @REF@..HEAD)
echo ONGITHUB=$(git merge-base --is-ancestor @REF@ FETCH_HEAD && echo yes || echo no)
echo BACKUP=$(test -x /usr/local/bin/bsf-backup.sh && echo yes || echo no)
echo DBSIZE=$(docker compose exec -T app sh -c 'wc -c < $DB_PATH' 2>/dev/null || echo unknown)
echo APPID=$(docker compose ps -q app 2>/dev/null | head -1 | cut -c1-12)
echo '--- tracked files changed on the machine:'
git status --porcelain --untracked-files=no
echo '--- checked out now:'
git log --oneline -1
echo '--- would deploy:'
git log --oneline HEAD..@REF@
'@)
    $pre.Output | ForEach-Object { Write-Host "  $_" }
    if (-not $pre.Ok) { throw "The pre-flight check failed (see above). Nothing was changed." }

    $vmBranch  = Get-MarkedValue $pre.Output 'BRANCH'
    $current   = Get-MarkedValue $pre.Output 'CURRENT'
    $hasBackup = (Get-MarkedValue $pre.Output 'BACKUP') -eq 'yes'
    $sizeStr   = Get-MarkedValue $pre.Output 'DBSIZE'
    $ahead     = Get-MarkedValue $pre.Output 'AHEAD'
    $onGitHub  = (Get-MarkedValue $pre.Output 'ONGITHUB') -eq 'yes'
    $appBefore = Get-MarkedValue $pre.Output 'APPID'

    $inDirty = $false; $dirty = @()
    foreach ($line in $pre.Output) {
        if ($line -like '--- tracked files changed*') { $inDirty = $true; continue }
        if ($line -like '--- checked out now*') { $inDirty = $false; continue }
        if ($inDirty -and $line.Trim()) { $dirty += $line }
    }
    if ($dirty.Count -gt 0) {
        throw "The machine's checkout has changed tracked files (listed above). Sort them out first. Nothing was changed."
    }
    if ($isProd -and $vmBranch -ne 'main') {
        throw "The machine's checkout is on $(if ($vmBranch) { "'$vmBranch'" } else { 'no branch' }), not 'main' (docs/Deployment.md, pitfall #11). On the machine, run: git switch main   Nothing was changed."
    }
    if ($isProd -and -not $onGitHub) {
        throw "The commit shown above is not on GitHub's main as the machine sees it. Run this again. Nothing was changed."
    }
    # A fast-forward to a commit the checkout is already past does nothing and still reports
    # success, so the rebuild would be of a different commit from the one shown.
    if ($isProd -and $ahead -ne '0') {
        throw "The machine's checkout must be at or behind the commit shown above, and that could not be confirmed (commits of its own: '$ahead'). On the machine, look with: git log --oneline $remoteSha..HEAD   Nothing was changed."
    }
    if ($current -eq $remoteSha) {
        Write-Host "  The machine's checkout is already at this commit." -ForegroundColor Yellow
        if (-not (Read-Confirm "  Rebuild anyway? Say y if an earlier rebuild failed or was cut off. (y/n)")) { Write-Host "Nothing to do."; return }
    }

    # ---- 3. Confirm -------------------------------------------------------------------------------
    Write-Step "3/8  Confirm"
    if ($isProd) {
        Write-Host "  This changes the LIVE server. Players who are connected will be cut off when the new server takes over at the end of the rebuild." -ForegroundColor Yellow
        if (-not (Read-Confirm "  Type the machine's name ($($t.Vm)) to go ahead" -Expected $t.Vm)) { throw "Stopped. Nothing was changed." }
    } else {
        if (-not (Read-Confirm "  Deploy to $($t.Vm)? (y/n)")) { throw "Stopped. Nothing was changed." }
    }

    # ---- 4. Back up the database, off the machine --------------------------------------------------
    Write-Step "4/8  Backing up the database"
    if ($hasBackup) {
        $bk = Invoke-OnVm $t -Stream (Join-RemoteCommand -Text @'
sudo /usr/local/bin/bsf-backup.sh
echo '--- newest backups in the bucket:'
( . /etc/bsf-deploy.conf && gcloud storage ls -l $BUCKET/ | tail -3 || echo '(could not list the bucket)' )
'@)
        # The fallback must stay INSIDE the parentheses. Outside them, bash would read the line as
        # "(backup and list) or say so", so a failed backup would end in the fallback and count
        # as success. It did exactly that on a 2026-10-02 test deploy.
        if (-not $bk.Ok) {
            if ($isProd) { throw "The backup failed, so the deploy stops here: a rebuild without a fresh backup has no undo. The server is unchanged." }
            if (-not (Read-Confirm "  The backup failed. Carry on without one? (y/n)")) { throw "Stopped. The server is unchanged." }
        }
    } else {
        Write-Host "  The backup job (/usr/local/bin/bsf-backup.sh) is not installed on this machine." -ForegroundColor Yellow
        if ($isProd) { throw "Production must have its backup job. Install it (docs/Deployment.md, Step 4) and try again. The server is unchanged." }
        if (-not (Read-Confirm "  Carry on without a backup? (y/n)")) { throw "Stopped. The server is unchanged." }
    }

    # ---- 5. Update the code ---------------------------------------------------------------------
    Write-Step "5/8  Updating the code"
    if ($isProd) {
        # A fast-forward to exactly the commit shown above, rather than "git pull", so what goes
        # live is what you approved even if something else merged in the meantime.
        $upd = Invoke-OnVm $t -Stream (Join-RemoteCommand -Values @{ DIR = $t.RepoDir; REF = $remoteSha } -Text @'
cd @DIR@
git merge --ff-only @REF@
echo HEAD=$(git rev-parse HEAD)
'@)
    } else {
        # Detached at the commit, not on a branch (pitfall #11).
        $upd = Invoke-OnVm $t -Stream (Join-RemoteCommand -Values @{ DIR = $t.RepoDir; REF = $remoteSha } -Text @'
cd @DIR@
git checkout --quiet --detach @REF@
git log --oneline -1
echo HEAD=$(git rev-parse HEAD)
'@)
    }
    if (-not $upd.Ok) { throw "Updating the code failed (see above). The running server is unchanged; the checkout may need a look." }
    # Read back what is checked out, so the rebuild and the closing line are about the commit shown.
    $nowAt = Get-MarkedValue $upd.Output 'HEAD'
    if ($nowAt -ne $remoteSha) {
        throw "The machine's checkout is at '$nowAt', not the commit shown above ($remoteSha). Nothing was rebuilt; the running server is unchanged."
    }

    # ---- 6. Rebuild -------------------------------------------------------------------------------
    Write-Step "6/8  Rebuilding (2-4 minutes; the old server keeps running until the swap at the end)"
    $build = Invoke-OnVm $t -Stream (Join-RemoteCommand -Values @{ DIR = $t.RepoDir } -Text @'
cd @DIR@
docker compose up -d --build
'@)
    if (-not $build.Ok) { throw "The rebuild failed (see above). If it stopped before the swap, the old server is still running." }

    # ---- 7. Verify on the machine -------------------------------------------------------------------
    Write-Step "7/8  Checking the server after the rebuild"
    # Waits up to a minute for the start-up line. The first 200 lines of the log are the current
    # container's start-up, which is where the lines worth checking are.
    $ver = Invoke-OnVm $t (Join-RemoteCommand -Values @{ DIR = $t.RepoDir } -Text @'
cd @DIR@
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do docker compose logs app 2>&1 | head -200 | grep -q 'listening on port 8082' && break; sleep 5; done
docker compose ps
echo '--- start of the app log:'
( docker compose logs app --no-log-prefix 2>&1 | head -200 | grep -aE 'BOOT|listening|migration|Cannot find module|WAL mode not active|Error' || true )
echo DBSIZE=$(docker compose exec -T app sh -c 'wc -c < $DB_PATH' 2>/dev/null || echo unknown)
echo APPID=$(docker compose ps -q app 2>/dev/null | head -1 | cut -c1-12)
'@)
    $ver.Output | Where-Object { $_ -notmatch '^(DBSIZE|APPID)=' } | ForEach-Object { Write-Host "  $_" }
    $log = $ver.Output -join "`n"
    $problems = @()
    if (-not $ver.Ok)                                 { $problems += "the check itself failed" }
    if ($log -notmatch 'Express server listening on port 8082') { $problems += "no 'listening on port 8082' line within a minute" }
    if ($log -notmatch '\[BOOT\] NODE_ENV=production') { $problems += "not running with NODE_ENV=production" }
    if ($log -match 'debug routes are ENABLED')       { $problems += "DEBUG ROUTES ARE ENABLED - anyone can reach them" }
    if ($log -match 'Cannot find module')             { $problems += "a 'Cannot find module' error" }
    if ($log -match 'WAL mode not active')            { $problems += "a 'WAL mode not active' warning" }
    if ($log -match 'trust_proxy=false')              { $problems += "trust_proxy=false behind the proxy: every player shares one sign-in limit" }

    $sizeAfter = Get-MarkedValue $ver.Output 'DBSIZE'
    if ($sizeStr -match '^\d+$' -and $sizeAfter -match '^\d+$') {
        Write-Host "  Database file: $sizeStr bytes before, $sizeAfter after."
        if ([long]$sizeAfter -lt [long]$sizeStr) { $problems += "the database file is smaller than before the deploy" }
    } else {
        Write-Host "  Database file size: before '$sizeStr', after '$sizeAfter'." -ForegroundColor Yellow
        if ($sizeAfter -notmatch '^\d+$') { $problems += "could not read the database file (is the app container running? see the table above)" }
    }

    # Docker Compose replaces the running server only when the rebuild changed its image or its
    # settings, so commits that touch nothing inside the image (docs, scripts) leave the old one
    # running. The app container's id, read before and after, says which happened.
    $appAfter = Get-MarkedValue $ver.Output 'APPID'
    $replaced = [bool]$appAfter -and $appAfter -ne $appBefore
    if ($replaced) {
        Write-Host "  The rebuild put a new server in place (app container $appAfter; before: $(if ($appBefore) { $appBefore } else { 'none' }))."
    } elseif ($appAfter) {
        Write-Host "  The rebuild did not replace the server: the one already running (app container $appAfter) was left in place." -ForegroundColor Yellow
        Write-Host "  Docker does that when nothing inside the server changed, as with commits that only touch docs or scripts." -ForegroundColor Yellow
        Write-Host "  If this deploy was meant to change the server, read the rebuild output above." -ForegroundColor Yellow
    } else {
        Write-Host "  Could not read which app container is running, so whether the rebuild replaced the server is not known." -ForegroundColor Yellow
    }

    # ---- 8. Verify from this PC -------------------------------------------------------------------
    Write-Step "8/8  Checking the server from this PC"
    # A failed address lookup joins the list of problems, so the ones found in step 7 are still shown.
    $url = ''
    try {
        $url = Get-ServerUrl $t
        Write-Host "  Address: $url"
        if (-not (Test-ServerFromHere -Url $url)) { $problems += "the checks from this PC failed" }
    } catch {
        Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red
        $problems += "could not find the server's address, so it was not checked from this PC"
    }

    Write-Host ""
    if ($problems.Count -gt 0) {
        Write-Host "DEPLOYED, BUT SOMETHING LOOKS WRONG:" -ForegroundColor Red
        $problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
        Write-Host "See docs/Deployment.md -> 'Verify the new version is running' and 'Restore from a backup'." -ForegroundColor Yellow
        throw "Verification failed."
    }
    # "now runs" is said only when this deploy put a server in place; otherwise the line reports
    # the checkout, which is all that is known to have changed.
    $commit = git -C $script:BsfServerRoot log --oneline -1 $remoteSha
    if ($replaced) {
        Write-Host "Done. $($t.Vm) now runs $commit" -ForegroundColor Green
    } elseif ($appAfter) {
        Write-Host "Done. $($t.Vm) is checked out at $commit; the server already running was left in place (see step 7)." -ForegroundColor Green
    } else {
        Write-Host "Done. $($t.Vm) is checked out at $commit; whether the server was replaced is not known (see step 7)." -ForegroundColor Green
    }
    Write-Host "      (was $(if ($current) { $current.Substring(0, [Math]::Min(7, $current.Length)) } else { 'unknown' }))  $url" -ForegroundColor Green
}
