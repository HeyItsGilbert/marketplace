#Requires -Version 7.0
[CmdletBinding()]
param()

if (-not (Get-Module -ListAvailable ClaudeHooks)) {
    Install-Module ClaudeHooks -Scope CurrentUser -Force
}

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
    if (-not $staged) {
        Write-ClaudeHookAllow -Reason 'No PowerShell files staged, skipping tests.'
        return
    }

    if (-not (Test-Pester5Available)) {
        Write-Warning 'Pester 5 not installed, skipping pre-commit check.'
        Write-ClaudeHookAllow -Reason 'Pester 5 not available, skipping tests. Install Pester 5 to enable pre-commit testing.'
        return
    }

    $cfg = New-PesterConfiguration
    $cfg.Output.Verbosity = 'Normal'
    $cfg.Run.PassThru = $true
    $result = Invoke-Pester -Configuration $cfg

    if ($result.FailedCount -gt 0) {
        Write-ClaudeHookDeny -Reason "$($result.FailedCount) Pester test(s) failed. Fix before committing."
        return
    }
    Write-ClaudeHookAllow -Reason 'All Pester tests passed.'
}

if ($MyInvocation.InvocationName -ne '.') {
    Read-ClaudeHookInput
    Invoke-PreCommitPester
}
