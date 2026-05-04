#Requires -Version 7.0
[CmdletBinding()]
param()

function Get-StagedPowerShellFile {
    git diff --cached --name-only --diff-filter=ACMR |
        Where-Object { $_ -match '\.ps1$' }
}

function Test-Pester5Available {
    [bool](Get-Module Pester -ListAvailable |
        Where-Object { $_.Version -ge [version]'5.0' })
}

function Invoke-PreCommitPester {
    [CmdletBinding()]
    param()

    $staged = Get-StagedPowerShellFile
    if (-not $staged) { return 0 }

    if (-not (Test-Pester5Available)) {
        Write-Warning 'Pester 5 not installed, skipping pre-commit check.'
        return 0
    }

    $cfg = New-PesterConfiguration
    $cfg.Output.Verbosity = 'Normal'
    $cfg.Run.PassThru = $true
    $result = Invoke-Pester -Configuration $cfg

    if ($result.FailedCount -gt 0) {
        Write-Error "Commit blocked: $($result.FailedCount) Pester test(s) failed. Fix before committing."
        return 2
    }
    return 0
}

if ($MyInvocation.InvocationName -ne '.') {
    exit (Invoke-PreCommitPester)
}
