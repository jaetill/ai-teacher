<#
.SYNOPSIS
    Restores an ai-teacher JSON dump back into the Neon database.

.DESCRIPTION
    Wrapper around scripts/db-restore.mjs. Always runs a dry run first and
    shows you what it found, then asks before writing.

    Defaults to the newest backup under backups\ if -Path is omitted.

.PARAMETER Path
    Backup folder to restore. Defaults to the most recent one.

.PARAMETER Replace
    Truncate each target table before inserting. Without this, the restore
    refuses to write into a table that already has rows.

.PARAMETER SkipSchemaCheck
    Restore even if the dump's migration hash differs from the live database.
    Passes --force through. Replaying rows into a changed schema half-succeeds
    in ways that are expensive to unpick - only use this deliberately.

.PARAMETER Force
    Skip the confirmation prompt.

.EXAMPLE
    .\scripts\Restore-Db.ps1

.EXAMPLE
    .\scripts\Restore-Db.ps1 -Path .\backups\2026-08-24T1930Z_pre-import-rebuild -Replace
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [string]$Path,
    [switch]$Replace,
    [switch]$SkipSchemaCheck,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

if ($Force -and -not $PSBoundParameters.ContainsKey('Confirm')) {
    $ConfirmPreference = 'None'
}

Write-Host ''
Write-Host '== ai-teacher database restore ==' -ForegroundColor Cyan
Write-Host ''

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'node is not on PATH.'
}

# --- Resolve the backup ----------------------------------------------------

if (-not $Path) {
    $backupRoot = Join-Path $repo 'backups'
    if (-not (Test-Path $backupRoot)) {
        throw 'No backups\ folder. Nothing to restore.'
    }
    $latest = Get-ChildItem $backupRoot -Directory |
        Where-Object { Test-Path (Join-Path $_.FullName 'manifest.json') } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $latest) {
        throw 'No backup with a manifest.json found under backups\.'
    }
    $Path = $latest.FullName
    Write-Host "No -Path given; using the most recent backup." -ForegroundColor DarkGray
}

$resolved = (Resolve-Path $Path).Path
$manifestPath = Join-Path $resolved 'manifest.json'
if (-not (Test-Path $manifestPath)) {
    throw "No manifest.json in $resolved - that is not a backup folder."
}
$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

Write-Host ("  backup:  {0}" -f $resolved)
Write-Host ("  taken:   {0}" -f $manifest.takenAt)
Write-Host ("  from:    {0}" -f $manifest.databaseHost)
Write-Host ("  rows:    {0}" -f $manifest.totalRows)
Write-Host ''

# node resolves the path relative to the repo root, so hand it a relative one
# when it lives under the repo and an absolute one otherwise.
$argPath = $resolved
if ($resolved.StartsWith($repo, [StringComparison]::OrdinalIgnoreCase)) {
    $argPath = $resolved.Substring($repo.Length).TrimStart('\', '/')
}

$nodeArgs = @('scripts/db-restore.mjs', $argPath)
if ($Replace) { $nodeArgs += '--replace' }
if ($SkipSchemaCheck) { $nodeArgs += '--force' }

# --- Preview, then write ---------------------------------------------------

Push-Location $repo
try {
    Write-Host 'What would be restored:' -ForegroundColor Cyan
    & node @($nodeArgs + '--dry-run')
    if ($LASTEXITCODE -ne 0) {
        throw "db-restore.mjs preview exited with code $LASTEXITCODE - nothing was written."
    }
    Write-Host ''

    if ($PSCmdlet.ShouldProcess("the ai-teacher database", "restore $($manifest.totalRows) rows from $($manifest.takenAt)")) {
        & node @($nodeArgs + '--confirm')
        if ($LASTEXITCODE -ne 0) {
            throw "db-restore.mjs exited with code $LASTEXITCODE."
        }
        Write-Host ''
        Write-Host 'Restore complete.' -ForegroundColor Green
        Write-Host ''
    }
    else {
        Write-Host 'Cancelled - nothing was written.' -ForegroundColor DarkGray
        Write-Host ''
    }
}
finally {
    Pop-Location
}
