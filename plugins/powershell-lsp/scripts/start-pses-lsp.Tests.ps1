BeforeAll {
    $script:launcherPath = Join-Path $PSScriptRoot 'start-pses-lsp.ps1'
}

Describe 'start-pses-lsp' -Tag 'Integration' {
    It 'rejects a traversal version before cache bootstrap' {
        $output = & pwsh -NoLogo -NoProfile -File $script:launcherPath -PsesVersion '../other-app-data' 2>&1

        $LASTEXITCODE | Should -Not -Be 0
        ($output | Out-String) | Should -Match "PSES version '../other-app-data' must match the PSES release format"
    }

    It 'passes a unique session path through an apostrophe-containing direct stdio launcher path and removes it on exit' {
        if ($IsWindows) {
            Set-ItResult -Skipped -Because 'The direct stdio launch path is non-Windows only.'
            return
        }

        $cacheRoot = Join-Path $TestDrive 'cache'
        $installRoot = Join-Path $cacheRoot 'claude-code-powershell-lsp/4.5.0/PowerShellEditorServices'
        $markerPath = Join-Path $TestDrive 'session-path.txt'
        New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
        $launcherDirectory = Join-Path $TestDrive "O'Brien"
        $apostropheLauncherPath = Join-Path $launcherDirectory 'start-pses-lsp.ps1'
        New-Item -ItemType Directory -Path $launcherDirectory -Force | Out-Null
        Copy-Item -LiteralPath $script:launcherPath -Destination $apostropheLauncherPath
        Set-Content -LiteralPath (Join-Path $installRoot 'Start-EditorServices.ps1') -Value @'
param(
    [string]$HostName,
    [string]$HostProfileId,
    [string]$HostVersion,
    [switch]$LanguageServiceOnly,
    [switch]$Stdio,
    [string]$SessionDetailsPath,
    [string]$LogPath,
    [string]$LogLevel
)
Set-Content -LiteralPath $env:PSES_TEST_MARKER -Value $SessionDetailsPath
Set-Content -LiteralPath $SessionDetailsPath -Value '{}'
'@

        $previousCacheRoot = $env:XDG_CACHE_HOME
        $previousMarkerPath = $env:PSES_TEST_MARKER
        try {
            $env:XDG_CACHE_HOME = $cacheRoot
            $env:PSES_TEST_MARKER = $markerPath

            & pwsh -NoLogo -NoProfile -File $apostropheLauncherPath

            $LASTEXITCODE | Should -Be 0
            $sessionPath = Get-Content -LiteralPath $markerPath
            $sessionPath | Should -Match ([regex]::Escape([System.IO.Path]::GetTempPath()))
            $sessionPath | Should -Not -Exist
        } finally {
            $env:XDG_CACHE_HOME = $previousCacheRoot
            $env:PSES_TEST_MARKER = $previousMarkerPath
        }
    }
}
