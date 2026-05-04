#Requires -Version 7.0
#Requires -Modules @{ ModuleName = 'Pester'; ModuleVersion = '5.0.0' }

BeforeAll {
    . $PSScriptRoot/pre-commit-pester.ps1
}

Describe 'Invoke-PreCommitPester' {
    Context 'when no PowerShell files are staged' {
        It 'returns 0 and skips Invoke-Pester' {
            Mock Get-StagedPowerShellFile { $null }
            Mock Test-Pester5Available { $true }
            Mock Invoke-Pester { @{ FailedCount = 0 } }

            Invoke-PreCommitPester | Should -Be 0

            Should -Invoke Test-Pester5Available -Times 0 -Exactly
            Should -Invoke Invoke-Pester -Times 0 -Exactly
        }
    }

    Context 'when staged files exist but Pester 5 is missing' {
        It 'warns and returns 0 without running tests' {
            Mock Get-StagedPowerShellFile { 'src/Foo.ps1' }
            Mock Test-Pester5Available { $false }
            Mock Invoke-Pester { @{ FailedCount = 0 } }

            Invoke-PreCommitPester -WarningVariable warnings -WarningAction SilentlyContinue | Should -Be 0

            $warnings | Should -Match 'Pester 5 not installed'
            Should -Invoke Invoke-Pester -Times 0 -Exactly
        }
    }

    Context 'when staged files exist and Pester reports failures' {
        It 'returns 2 and writes an error' {
            Mock Get-StagedPowerShellFile { 'src/Foo.ps1' }
            Mock Test-Pester5Available { $true }
            Mock Invoke-Pester { @{ FailedCount = 3 } }

            $errors = $null
            Invoke-PreCommitPester -ErrorVariable errors -ErrorAction SilentlyContinue | Should -Be 2

            $errors[0].ToString() | Should -Match '3 Pester test\(s\) failed'
            Should -Invoke Invoke-Pester -Times 1 -Exactly
        }
    }

    Context 'when staged files exist and all tests pass' {
        It 'returns 0' {
            Mock Get-StagedPowerShellFile { 'src/Foo.ps1' }
            Mock Test-Pester5Available { $true }
            Mock Invoke-Pester { @{ FailedCount = 0 } }

            Invoke-PreCommitPester | Should -Be 0

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
