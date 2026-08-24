<#
.SYNOPSIS
    Wipes the imported curriculum from the ai-teacher Neon database.

.DESCRIPTION
    Wrapper around scripts/db-reset.mjs. Seeded reference data (standards,
    lesson templates, school years, terms, glossary) is preserved by default so
    a wipe/reimport round-trip does not force a standards reseed.

    Refuses to run unless a backup exists under backups\, and warns if the most
    recent one is stale. Use -WhatIf to preview.

.PARAMETER All
    Wipe reference data too. You will have to reseed standards afterwards.

.PARAMETER Keep
    Comma-separated table list to preserve, overriding the default set.

.PARAMETER Force
    Skip the confirmation prompt AND the backup-exists guard. Know what you are doing.

.EXAMPLE
    .\scripts\Reset-Db.ps1 -WhatIf

.EXAMPLE
    .\scripts\Reset-Db.ps1
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [switch]$All,
    [string]$Keep,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

if ($Force -and -not $PSBoundParameters.ContainsKey('Confirm')) {
    $ConfirmPreference = 'None'
}

Write-Host ''
Write-Host '== ai-teacher database reset ==' -ForegroundColor Yellow
Write-Host ''

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'node is not on PATH.'
}

# --- Backup guard ----------------------------------------------------------
# The whole point of this script is to be followed by a reimport. If the
# reimport is wrong, the backup is the only way back. Refuse without one.

$backupRoot = Join-Path $repo 'backups'
$latest = $null
if (Test-Path $backupRoot) {
    $latest = Get-ChildItem $backupRoot -Directory |
        Where-Object { Test-Path (Join-Path $_.FullName 'manifest.json') } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
}

if (-not $latest) {
    if (-not $Force) {
        throw 'No backup found under backups\. Run .\scripts\Backup-Db.ps1 first, or pass -Force.'
    }
    Write-Warning 'No backup found - proceeding only because -Force was given.'
}
else {
    $age = (Get-Date) - $latest.LastWriteTime
    Write-Host ("  latest backup: {0}" -f $latest.Name)
    Write-Host ("  taken:         {0:N0} minutes ago" -f $age.TotalMinutes)
    if ($age.TotalHours -gt 1) {
        Write-Warning 'That backup is over an hour old. Anything changed since then will be lost.'
    }
    Write-Host ''
}

# --- Preview ---------------------------------------------------------------

$nodeArgs = @('scripts/db-reset.mjs')
if ($All) { $nodeArgs += '--all' }
if ($Keep) { $nodeArgs += @('--keep', $Keep) }

Push-Location $repo
try {
    Write-Host 'What would be wiped:' -ForegroundColor Cyan
    & node @($nodeArgs + '--dry-run')
    if ($LASTEXITCODE -ne 0) {
        throw "db-reset.mjs preview exited with code $LASTEXITCODE - nothing was wiped."
    }
    Write-Host ''

    $target = if ($All) { 'ALL tables including reference data' } else { 'the imported curriculum' }
    if ($PSCmdlet.ShouldProcess("the ai-teacher database", "TRUNCATE $target")) {
        & node @($nodeArgs + '--confirm')
        if ($LASTEXITCODE -ne 0) {
            throw "db-reset.mjs exited with code $LASTEXITCODE."
        }
        Write-Host ''
        Write-Host 'Reset complete.' -ForegroundColor Green
        if ($All) {
            Write-Host 'Reference data was wiped - reseed standards before importing.' -ForegroundColor Yellow
        }
        Write-Host ''
    }
    else {
        Write-Host 'Cancelled - nothing was wiped.' -ForegroundColor DarkGray
        Write-Host ''
    }
}
finally {
    Pop-Location
}
