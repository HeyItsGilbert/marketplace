# VS Code Detached Pester Execution

Load this reference only when Pester runs from VS Code's integrated PowerShell session. It preserves the selected scope and returns either a structured Pester result or a structured execution error.

```powershell
# Populate these from the selected request. Leave arrays empty when not supplied.
$selectedPath = @()       # Requested file or directory; otherwise discovered test files.
$selectedTags = @()       # Requested -Tag values.
$excludedTags = @()       # Requested -ExcludeTag values.
$selectedName = $null     # Requested test-name pattern.

if (-not $selectedPath) {
  $selectedPath = Get-ChildItem -Recurse -Filter '*.Tests.ps1' | Select-Object -ExpandProperty FullName
}

$workspace = Join-Path ([IO.Path]::GetTempPath()) "pester-run-$([guid]::NewGuid())"
$run = $null
try {
  New-Item -Path $workspace -ItemType Directory -Force | Out-Null
  $payloadPath = Join-Path $workspace 'request.json'
  $resultPath = Join-Path $workspace 'result.clixml'
  $childScriptPath = Join-Path $workspace 'run-pester.ps1'

  [pscustomobject]@{
    WorkingDirectory = $PWD.Path
    Paths = @($selectedPath)
    Tags = @($selectedTags)
    ExcludedTags = @($excludedTags)
    FullName = $selectedName
    ResultPath = $resultPath
  } | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath $payloadPath -Encoding utf8

  @'
param([string] $PayloadPath)

$payload = Get-Content -Raw -LiteralPath $PayloadPath | ConvertFrom-Json
$envelope = [ordered]@{ Result = $null; Error = $null }
try {
  Set-Location -LiteralPath $payload.WorkingDirectory
  $cfg = New-PesterConfiguration
  $cfg.Output.Verbosity = 'Normal'
  $cfg.Run.PassThru = $true
  $cfg.Run.Path = @($payload.Paths)
  if ($null -ne $payload.Tags -and @($payload.Tags).Count -gt 0) { $cfg.Filter.Tag = @($payload.Tags) }
  if ($null -ne $payload.ExcludedTags -and @($payload.ExcludedTags).Count -gt 0) { $cfg.Filter.ExcludeTag = @($payload.ExcludedTags) }
  if ($payload.FullName) { $cfg.Filter.FullName = $payload.FullName }
  $envelope.Result = Invoke-Pester -Configuration $cfg
}
catch {
  $envelope.Error = [pscustomobject]@{
    Message = $_.Exception.Message
    FullyQualifiedErrorId = $_.FullyQualifiedErrorId
    ScriptStackTrace = $_.ScriptStackTrace
  }
}
[pscustomobject] $envelope | Export-Clixml -LiteralPath $payload.ResultPath
if ($envelope.Error -or $envelope.Result.FailedCount -gt 0) { exit 1 }
'@ | Set-Content -LiteralPath $childScriptPath -Encoding utf8

  $process = Start-Process pwsh -ArgumentList @(
    '-NoProfile', '-NonInteractive', '-File', "`"$childScriptPath`"", "`"$payloadPath`""
  ) -PassThru
  $process | Wait-Process

  if (-not (Test-Path -LiteralPath $resultPath)) {
    throw "Detached Pester run did not write a result (process exit code: $($process.ExitCode))."
  }
  $run = Import-Clixml -LiteralPath $resultPath
}
finally {
  if (Test-Path -LiteralPath $workspace) {
    Remove-Item -LiteralPath $workspace -Recurse -Force
  }
}
```

If `$run.Error` is present, report its message, error ID, and stack trace. Otherwise, use `$run.Result.FailedCount`, `$run.Result.PassedCount`, `$run.Result.SkippedCount`, and `$run.Result.Failed` for the reporting contract in `SKILL.md`.
