#Requires -Version 7.0
#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0.0' }
#Requires -Modules ClaudeHooks

BeforeAll {
    . $PSScriptRoot/pre-commit-pester.ps1
}

Describe 'Invoke-PreCommitPester' {
    BeforeEach {
        Mock Write-ClaudeHookAllow {}
        Mock Write-ClaudeHookDeny {}
    }

    Context 'when no PowerShell files are staged' {
        It 'allows and skips Invoke-Pester' {
            Mock Get-StagedPowerShellFile { $null }
            Mock Test-Pester5Available { $true }
            Mock Invoke-Pester { @{ FailedCount = 0 } }

            Invoke-PreCommitPester

            Should -Invoke Write-ClaudeHookAllow -Times 1 -Exactly
            Should -Invoke Test-Pester5Available -Times 0 -Exactly
            Should -Invoke Invoke-Pester -Times 0 -Exactly
        }
    }

    Context 'when staged files exist but Pester 5 is missing' {
        It 'warns and allows without running tests' {
            Mock Get-StagedPowerShellFile { 'src/Foo.ps1' }
            Mock Test-Pester5Available { $false }
            Mock Invoke-Pester { @{ FailedCount = 0 } }

            Invoke-PreCommitPester -WarningVariable warnings -WarningAction SilentlyContinue

            $warnings | Should -Match 'Pester 5 not installed'
            Should -Invoke Write-ClaudeHookAllow -Times 1 -Exactly
            Should -Invoke Invoke-Pester -Times 0 -Exactly
        }
    }

    Context 'when staged files exist and Pester reports failures' {
        It 'denies with failure count in the reason' {
            Mock Get-StagedPowerShellFile { 'src/Foo.ps1' }
            Mock Test-Pester5Available { $true }
            Mock Invoke-Pester { @{ FailedCount = 3 } }

            Invoke-PreCommitPester

            Should -Invoke Write-ClaudeHookDeny -Times 1 -Exactly -ParameterFilter {
                $Reason -match '3 Pester test\(s\) failed'
            }
            Should -Invoke Write-ClaudeHookAllow -Times 0 -Exactly
            Should -Invoke Invoke-Pester -Times 1 -Exactly
        }
    }

    Context 'when staged files exist and all tests pass' {
        It 'allows' {
            Mock Get-StagedPowerShellFile { 'src/Foo.ps1' }
            Mock Test-Pester5Available { $true }
            Mock Invoke-Pester { @{ FailedCount = 0 } }

            Invoke-PreCommitPester

            Should -Invoke Write-ClaudeHookAllow -Times 1 -Exactly
            Should -Invoke Write-ClaudeHookDeny -Times 0 -Exactly
            Should -Invoke Invoke-Pester -Times 1 -Exactly
        }
    }
}

Describe 'Get-StagedPowerShellFile' {
    It 'filters git output to .ps1 paths' {
        Mock git { @('src/Foo.ps1', 'README.md', 'docs/Bar.ps1', 'package.json') }

        $result = Get-StagedPowerShellFile

        $result | Should -HaveCount 2
        $result | Should -Contain 'src/Foo.ps1'
        $result | Should -Contain 'docs/Bar.ps1'
    }
}
