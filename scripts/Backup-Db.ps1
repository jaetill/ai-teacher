<#
.SYNOPSIS
    Takes a JSON dump of the ai-teacher Neon database.

.DESCRIPTION
    Wrapper around scripts/db-backup.mjs. Runs preflight checks, shows which
    database host it is about to read (so you can confirm it is the one you
    think it is), runs the dump, then verifies and summarizes the result.

    Calls node directly rather than `npm run` so PowerShell cannot mangle the
    `--` argument separator.

.PARAMETER Label
    Suffix for the backup folder name. Letters, numbers, dot, underscore, dash.

.PARAMETER NeonBranch
    Also create a Neon branch as a structural rollback point. Requires
    NEON_API_KEY and NEON_PROJECT_ID in the environment; without them the
    script prints manual instructions instead of failing.

.EXAMPLE
    .\scripts\Backup-Db.ps1 -Label pre-import-rebuild

.EXAMPLE
    .\scripts\Backup-Db.ps1 -Label pre-import-rebuild -NeonBranch
#>
[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9._-]+$')]
    [string]$Label,

    [switch]$NeonBranch
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

Write-Host ''
Write-Host '== ai-teacher database backup ==' -ForegroundColor Cyan
Write-Host ''

# --- Preflight -------------------------------------------------------------

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'node is not on PATH.'
}

$envFile = Join-Path $repo '.env.local'
if (-not (Test-Path $envFile)) {
    throw "No .env.local at $envFile - DATABASE_URL has to come from somewhere."
}

# Show the target host, masked. Cheap insurance against dumping the wrong DB.
$dbLine = Select-String -Path $envFile -Pattern '^\s*DATABASE_URL\s*=' -ErrorAction SilentlyContinue
if (-not $dbLine) {
    throw 'DATABASE_URL is not set in .env.local.'
}
$dbUrl = ($dbLine.Line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim('"', "'", ' ')
if ($dbUrl -match '@([^/]+)/([^?]+)') {
    Write-Host ("  host:     {0}" -f $Matches[1])
    Write-Host ("  database: {0}" -f $Matches[2])
}
else {
    Write-Warning 'Could not parse DATABASE_URL host - continuing anyway.'
}
Write-Host ''

$before = @()
$backupRoot = Join-Path $repo 'backups'
if (Test-Path $backupRoot) {
    $before = @(Get-ChildItem $backupRoot -Directory | Select-Object -ExpandProperty Name)
}

# --- Dump ------------------------------------------------------------------

Push-Location $repo
try {
    $nodeArgs = @('scripts/db-backup.mjs')
    if ($Label) { $nodeArgs += @('--label', $Label) }

    Write-Host 'Dumping...' -ForegroundColor Cyan
    & node @nodeArgs
    if ($LASTEXITCODE -ne 0) {
        throw "db-backup.mjs exited with code $LASTEXITCODE - no backup was written."
    }
}
finally {
    Pop-Location
}

# --- Verify ----------------------------------------------------------------

$created = Get-ChildItem $backupRoot -Directory |
    Where-Object { $_.Name -notin $before } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $created) {
    throw 'Backup reported success but no new folder appeared under backups\.'
}

$manifestPath = Join-Path $created.FullName 'manifest.json'
if (-not (Test-Path $manifestPath)) {
    throw "No manifest.json in $($created.FullName) - the dump is incomplete."
}
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

# A backup with zero rows is almost certainly a misconfiguration, not an
# empty database. Say so loudly rather than letting it pass as success.
if ($manifest.totalRows -eq 0) {
    Write-Warning 'The dump contains ZERO rows. Check that DATABASE_URL points at the right database before you rely on this backup.'
}

# Wrap in @() before .Count: on Windows PowerShell 5.1, .Count against a
# PSMemberInfoCollection enumerates the members instead of counting them.
$tableCount = @($manifest.rowCounts.PSObject.Properties).Count
$jsonCount = @(Get-ChildItem $created.FullName -Filter '*.json' -Exclude 'manifest.json').Count

Write-Host ''
Write-Host 'Backup complete.' -ForegroundColor Green
Write-Host ("  folder:  {0}" -f $created.FullName)
Write-Host ("  tables:  {0} ({1} json files)" -f $tableCount, $jsonCount)
Write-Host ("  rows:    {0}" -f $manifest.totalRows)
Write-Host ("  taken:   {0}" -f $manifest.takenAt)
if ($manifest.migration) {
    Write-Host ("  schema:  {0}" -f $manifest.migration.hash)
}
Write-Host ''
Write-Host 'Restore with:' -ForegroundColor DarkGray
Write-Host ("  .\scripts\Restore-Db.ps1 -Path '{0}'" -f $created.FullName) -ForegroundColor DarkGray
Write-Host ''

# --- Neon branch (structural rollback) -------------------------------------

if ($NeonBranch) {
    $branchName = if ($Label) { "backup-$Label" } else { "backup-$(Get-Date -Format 'yyyyMMdd-HHmm')" }

    if ($env:NEON_API_KEY -and $env:NEON_PROJECT_ID) {
        Write-Host "Creating Neon branch '$branchName'..." -ForegroundColor Cyan
        Push-Location $repo
        try {
            & npx -y neonctl branches create `
                --project-id $env:NEON_PROJECT_ID `
                --name $branchName `
                --api-key $env:NEON_API_KEY
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "neonctl exited with code $LASTEXITCODE. The JSON dump above is still good."
            }
            else {
                Write-Host "Neon branch '$branchName' created." -ForegroundColor Green
            }
        }
        finally {
            Pop-Location
        }
    }
    else {
        Write-Host 'Neon branch: skipped (NEON_API_KEY / NEON_PROJECT_ID not set).' -ForegroundColor Yellow
        Write-Host '  Create one by hand at https://console.neon.tech -> your project -> Branches -> New Branch'
        Write-Host ("  Suggested name: {0}" -f $branchName)
        Write-Host '  Or set the env vars and re-run with -NeonBranch:'
        Write-Host '    $env:NEON_API_KEY    = "..."'
        Write-Host '    $env:NEON_PROJECT_ID = "..."'
        Write-Host ''
    }
}
else {
    Write-Host 'Tip: add -NeonBranch to also create a Neon branch as a structural rollback point.' -ForegroundColor DarkGray
    Write-Host '     The JSON dump restores data; a branch restores the whole database.' -ForegroundColor DarkGray
    Write-Host ''
}
