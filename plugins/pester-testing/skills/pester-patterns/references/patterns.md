# Pester 5 Pattern Reference

Detailed test patterns referenced from `SKILL.md`. Each section is self-contained — load just the pattern needed.

## Pattern 1: Mocking the File System

### Read Operations

```powershell
Describe 'Get-ConfigValue' {
    BeforeAll {
        Mock -ModuleName MyModule -CommandName Get-Content -MockWith {
            @'
            {
                "setting1": "value1",
                "setting2": "value2"
            }
'@
        }

        Mock -ModuleName MyModule -CommandName Test-Path -MockWith { $true }
    }

    It 'Should return the config value' {
        $result = Get-ConfigValue -Key 'setting1'
        $result | Should -Be 'value1'
    }

    It 'Should call Get-Content with the config path' {
        Get-ConfigValue -Key 'setting1'
        Should -Invoke -ModuleName MyModule -CommandName Get-Content -Times 1
    }
}
```

### Write Operations

```powershell
Describe 'Export-Report' {
    BeforeAll {
        Mock -ModuleName MyModule -CommandName Set-Content
        Mock -ModuleName MyModule -CommandName New-Item
        Mock -ModuleName MyModule -CommandName Test-Path -MockWith { $false }
    }

    It 'Should create the output directory if it does not exist' {
        Export-Report -Path 'C:\Reports\report.txt' -Content 'Test'
        Should -Invoke -ModuleName MyModule -CommandName New-Item -Times 1 `
            -ParameterFilter { $ItemType -eq 'Directory' }
    }

    It 'Should write the content to the file' {
        Export-Report -Path 'C:\Reports\report.txt' -Content 'Test'
        Should -Invoke -ModuleName MyModule -CommandName Set-Content -Times 1 `
            -ParameterFilter { $Value -eq 'Test' }
    }
}
```

### Using TestDrive for Real File Operations

```powershell
Describe 'Import-CsvData' {
    BeforeAll {
        $csvPath = Join-Path TestDrive: 'data.csv'
        @(
            [PSCustomObject]@{ Name = 'Alice'; Age = 30 }
            [PSCustomObject]@{ Name = 'Bob'; Age = 25 }
        ) | Export-Csv -Path $csvPath -NoTypeInformation
    }

    It 'Should import all rows' {
        $result = Import-CsvData -Path $csvPath
        $result | Should -HaveCount 2
    }

    It 'Should parse names correctly' {
        $result = Import-CsvData -Path $csvPath
        $result[0].Name | Should -Be 'Alice'
    }
}
```

## Pattern 2: Mocking REST APIs

### Invoke-RestMethod

```powershell
Describe 'Get-GitHubUser' {
    BeforeAll {
        Mock -ModuleName MyModule -CommandName Invoke-RestMethod -MockWith {
            [PSCustomObject]@{
                login        = 'octocat'
                name         = 'The Octocat'
                public_repos = 8
            }
        }
    }

    It 'Should return the user object' {
        $result = Get-GitHubUser -Username 'octocat'
        $result.login | Should -Be 'octocat'
        $result.name | Should -Be 'The Octocat'
    }

    It 'Should call the correct API endpoint' {
        Get-GitHubUser -Username 'octocat'
        Should -Invoke -ModuleName MyModule -CommandName Invoke-RestMethod -Times 1 `
            -ParameterFilter { $Uri -eq 'https://api.github.com/users/octocat' }
    }
}
```

### Invoke-WebRequest

```powershell
Describe 'Test-WebEndpoint' {
    Context 'When the endpoint is healthy' {
        BeforeAll {
            Mock -ModuleName MyModule -CommandName Invoke-WebRequest -MockWith {
                [PSCustomObject]@{
                    StatusCode = 200
                    Content    = '{"status": "healthy"}'
                    Headers    = @{ 'Content-Type' = 'application/json' }
                }
            }
        }

        It 'Should return $true' {
            Test-WebEndpoint -Url 'https://api.example.com/health' | Should -BeTrue
        }
    }

    Context 'When the endpoint returns an error' {
        BeforeAll {
            Mock -ModuleName MyModule -CommandName Invoke-WebRequest -MockWith {
                throw [System.Net.WebException]::new('404 Not Found')
            }
        }

        It 'Should return $false' {
            Test-WebEndpoint -Url 'https://api.example.com/health' | Should -BeFalse
        }
    }
}
```

### Paginated API Responses

```powershell
Describe 'Get-AllItems' {
    BeforeAll {
        $script:callCount = 0
        Mock -ModuleName MyModule -CommandName Invoke-RestMethod -MockWith {
            $script:callCount++
            if ($script:callCount -eq 1) {
                [PSCustomObject]@{
                    items     = @('item1', 'item2')
                    nextToken = 'page2'
                }
            }
            else {
                [PSCustomObject]@{
                    items     = @('item3')
                    nextToken = $null
                }
            }
        }
    }

    BeforeEach {
        $script:callCount = 0
    }

    It 'Should return all items across pages' {
        $result = Get-AllItems
        $result | Should -HaveCount 3
    }

    It 'Should make two API calls' {
        Get-AllItems
        Should -Invoke -ModuleName MyModule -CommandName Invoke-RestMethod -Times 2
    }
}
```

## Pattern 3: Mocking Credentials and Secrets

### PSCredential

```powershell
Describe 'Connect-MyService' {
    BeforeAll {
        $securePassword = ConvertTo-SecureString 'FakePassword123!' -AsPlainText -Force
        $script:testCredential = [PSCredential]::new('TestUser', $securePassword)

        Mock -ModuleName MyModule -CommandName Invoke-RestMethod -MockWith {
            [PSCustomObject]@{ Token = 'fake-jwt-token' }
        }
    }

    It 'Should authenticate with the provided credential' {
        $result = Connect-MyService -Credential $script:testCredential
        $result.Token | Should -Not -BeNullOrEmpty
    }

    It 'Should pass the username in the request' {
        Connect-MyService -Credential $script:testCredential
        Should -Invoke -ModuleName MyModule -CommandName Invoke-RestMethod -Times 1 `
            -ParameterFilter { $Body.username -eq 'TestUser' }
    }
}
```

### SecureString Parameters

```powershell
Describe 'Set-ApiKey' {
    BeforeAll {
        $script:testKey = ConvertTo-SecureString 'sk-test-key-12345' -AsPlainText -Force
        Mock -ModuleName MyModule -CommandName Set-Content
    }

    It 'Should not throw with a valid SecureString' {
        { Set-ApiKey -ApiKey $script:testKey } | Should -Not -Throw
    }
}
```

## Pattern 4: Testing DSC Resources

### Class-Based DSC Resource

```powershell
Describe 'MyDscResource' {
    BeforeAll {
        $modulePath = Join-Path $PSScriptRoot '..' '..' 'output' 'builtModule' 'MyModule'
        Import-Module $modulePath -Force

        $script:resource = [MyDscResource]::new()
        $script:resource.Name = 'TestItem'
        $script:resource.Ensure = 'Present'
    }

    Context 'Get()' {
        BeforeAll {
            Mock -ModuleName MyModule -CommandName Get-Item -MockWith {
                [PSCustomObject]@{ Name = 'TestItem'; Exists = $true }
            }
        }

        It 'Should return the current state' {
            $result = $script:resource.Get()
            $result.Name | Should -Be 'TestItem'
            $result.Ensure | Should -Be 'Present'
        }
    }

    Context 'Test()' {
        Context 'When the resource is in desired state' {
            BeforeAll {
                Mock -ModuleName MyModule -CommandName Get-Item -MockWith {
                    [PSCustomObject]@{ Name = 'TestItem' }
                }
            }

            It 'Should return $true' {
                $script:resource.Test() | Should -BeTrue
            }
        }

        Context 'When the resource is not in desired state' {
            BeforeAll {
                Mock -ModuleName MyModule -CommandName Get-Item -MockWith { $null }
            }

            It 'Should return $false' {
                $script:resource.Test() | Should -BeFalse
            }
        }
    }

    Context 'Set()' {
        BeforeAll {
            Mock -ModuleName MyModule -CommandName New-Item
            Mock -ModuleName MyModule -CommandName Remove-Item
        }

        It 'Should create the item when Ensure is Present' {
            $script:resource.Ensure = 'Present'
            $script:resource.Set()
            Should -Invoke -ModuleName MyModule -CommandName New-Item -Times 1
        }

        It 'Should remove the item when Ensure is Absent' {
            $script:resource.Ensure = 'Absent'
            $script:resource.Set()
            Should -Invoke -ModuleName MyModule -CommandName Remove-Item -Times 1
        }
    }
}
```

### MOF-Based DSC Resource

```powershell
Describe 'DSC_MyResource' {
    BeforeAll {
        $moduleName = 'MyModule'
        $resourceName = 'DSC_MyResource'
        Import-Module (Join-Path $PSScriptRoot '..' '..' 'output' 'builtModule' $moduleName) -Force
    }

    Context 'Get-TargetResource' {
        BeforeAll {
            Mock -ModuleName $resourceName -CommandName Get-Service -MockWith {
                [PSCustomObject]@{ Name = 'TestSvc'; Status = 'Running' }
            }
        }

        It 'Should return a hashtable' {
            $result = InModuleScope $resourceName {
                Get-TargetResource -Name 'TestSvc'
            }
            $result | Should -BeOfType [hashtable]
            $result.Name | Should -Be 'TestSvc'
            $result.Ensure | Should -Be 'Present'
        }
    }
}
```

## Pattern 5: Testing PowerShell Classes

```powershell
Describe 'Widget class' {
    BeforeAll {
        $modulePath = Join-Path $PSScriptRoot '..' '..' 'output' 'builtModule' 'MyModule'
        Import-Module $modulePath -Force
    }

    Context 'Constructor' {
        It 'Should create a widget with the given name' {
            $widget = [Widget]::new('TestWidget')
            $widget.Name | Should -Be 'TestWidget'
        }

        It 'Should set default status to Inactive' {
            $widget = [Widget]::new('TestWidget')
            $widget.Status | Should -Be 'Inactive'
        }

        It 'Should throw if name is empty' {
            { [Widget]::new('') } | Should -Throw
        }
    }

    Context 'Activate method' {
        It 'Should change status to Active' {
            $widget = [Widget]::new('TestWidget')
            $widget.Activate()
            $widget.Status | Should -Be 'Active'
        }
    }

    Context 'ToString override' {
        It 'Should return formatted string' {
            $widget = [Widget]::new('TestWidget')
            $widget.ToString() | Should -Be 'Widget: TestWidget (Inactive)'
        }
    }
}
```

## Pattern 6: Testing Pipeline Functions

```powershell
Describe 'ConvertTo-Widget' {
    It 'Should accept pipeline input' {
        $result = 'Test1', 'Test2' | ConvertTo-Widget
        $result | Should -HaveCount 2
    }

    It 'Should set the Type property' {
        $result = 'Test' | ConvertTo-Widget
        $result.Type | Should -Be 'Widget'
    }

    It 'Should process each input individually' {
        $result = @('A', 'B', 'C') | ConvertTo-Widget
        $result[0].Name | Should -Be 'A'
        $result[1].Name | Should -Be 'B'
        $result[2].Name | Should -Be 'C'
    }
}
```

## Pattern 7: Testing Error Handling and Warning Output

### ErrorVariable

```powershell
Describe 'Get-SafeItem' {
    BeforeAll {
        Mock -ModuleName MyModule -CommandName Get-Item -MockWith {
            throw [System.IO.FileNotFoundException]::new('Not found')
        }
    }

    It 'Should write a non-terminating error for missing files' {
        $result = Get-SafeItem -Path 'C:\nonexistent' -ErrorVariable err -ErrorAction SilentlyContinue
        $err | Should -HaveCount 1
        $err[0].Exception | Should -BeOfType [System.IO.FileNotFoundException]
    }
}
```

### Warning Output

```powershell
Describe 'Update-Config' {
    BeforeAll {
        Mock -ModuleName MyModule -CommandName Set-Content
    }

    It 'Should write a warning for deprecated settings' {
        $result = Update-Config -Setting 'OldSetting' -Value 'test' 3>&1
        $warnings = $result | Where-Object { $_ -is [System.Management.Automation.WarningRecord] }
        $warnings | Should -Not -BeNullOrEmpty
        $warnings.Message | Should -Match 'deprecated'
    }
}
```

### Verbose Output

```powershell
Describe 'Invoke-LongOperation' {
    It 'Should write verbose output' {
        $verboseOutput = Invoke-LongOperation -Verbose 4>&1
        $verboseOutput | Should -Not -BeNullOrEmpty
    }
}
```

## Pattern 8: Testing with Dates and Times

```powershell
Describe 'Get-ExpiringCertificates' {
    BeforeAll {
        Mock -ModuleName MyModule -CommandName Get-Date -MockWith {
            [datetime]'2026-03-01T00:00:00'
        }

        Mock -ModuleName MyModule -CommandName Get-ChildItem -MockWith {
            @(
                [PSCustomObject]@{
                    Subject  = 'CN=expiring.example.com'
                    NotAfter = [datetime]'2026-03-15T00:00:00'  # 14 days away
                }
                [PSCustomObject]@{
                    Subject  = 'CN=valid.example.com'
                    NotAfter = [datetime]'2027-01-01T00:00:00'
                }
            )
        }
    }

    It 'Should return certificates expiring within 30 days' {
        $result = Get-ExpiringCertificates -DaysUntilExpiry 30
        $result | Should -HaveCount 1
        $result[0].Subject | Should -Be 'CN=expiring.example.com'
    }
}
```

## Pattern 9: Testing ShouldProcess (WhatIf/Confirm)

```powershell
Describe 'Remove-Widget' {
    BeforeAll {
        Mock -ModuleName MyModule -CommandName Remove-Item
    }

    It 'Should call Remove-Item when confirmed' {
        Remove-Widget -Name 'TestWidget' -Confirm:$false
        Should -Invoke -ModuleName MyModule -CommandName Remove-Item -Times 1
    }

    It 'Should not call Remove-Item with WhatIf' {
        Remove-Widget -Name 'TestWidget' -WhatIf
        Should -Invoke -ModuleName MyModule -CommandName Remove-Item -Times 0
    }
}
```

## Pattern 10: Testing with Environment Variables

```powershell
Describe 'Get-DeploymentTarget' {
    Context 'When DEPLOY_ENV is set' {
        BeforeAll {
            $script:originalValue = $env:DEPLOY_ENV
            $env:DEPLOY_ENV = 'staging'
        }

        AfterAll {
            $env:DEPLOY_ENV = $script:originalValue
        }

        It 'Should return the environment from the variable' {
            Get-DeploymentTarget | Should -Be 'staging'
        }
    }

    Context 'When DEPLOY_ENV is not set' {
        BeforeAll {
            $script:originalValue = $env:DEPLOY_ENV
            $env:DEPLOY_ENV = $null
        }

        AfterAll {
            $env:DEPLOY_ENV = $script:originalValue
        }

        It 'Should return the default environment' {
            Get-DeploymentTarget | Should -Be 'production'
        }
    }
}
```

## Pattern 11: Testing Module Exports

```powershell
Describe 'Module exports' -Tag 'QA' {
    BeforeAll {
        $moduleName = 'MyModule'
        $module = Get-Module $moduleName

        $publicFunctions = Get-ChildItem -Path (Join-Path $PSScriptRoot '..' '..' 'source' 'Public') `
            -Filter '*.ps1' -Recurse |
            Select-Object -ExpandProperty BaseName
    }

    It 'Should export all public functions' {
        foreach ($function in $publicFunctions) {
            $module.ExportedFunctions.Keys | Should -Contain $function `
                -Because "$function is in source/Public/ and should be exported"
        }
    }

    It 'Should not export private functions' {
        $privateFunctions = Get-ChildItem -Path (Join-Path $PSScriptRoot '..' '..' 'source' 'Private') `
            -Filter '*.ps1' -Recurse -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty BaseName

        foreach ($function in $privateFunctions) {
            $module.ExportedFunctions.Keys | Should -Not -Contain $function `
                -Because "$function is in source/Private/ and should not be exported"
        }
    }

    It 'Should not export any variables' {
        $module.ExportedVariables.Keys | Should -HaveCount 0
    }
}
```

## Pattern 12: Testing Non-Exported (Private) Functions

Private helpers in `source/Private/` are merged into the built `.psm1` but are
not exported, so they cannot be called directly from a test file. Use Pester's
**module-internal scope invocation** to reach them:

```powershell
It 'ConvertFrom-MyXml aggregates values' {
    $result = & (Get-Module MyModule) {
        param($xml)
        ConvertFrom-MyXml -Xml $xml
    } $someXmlString

    $result.Total | Should -Be 42
}
```

The `& (Get-Module Name) { ... }` form runs the scriptblock inside the module's
private session state, where non-exported functions are visible. Pass inputs
via `param()` + positional args rather than closing over `$using:` — the module
scope is a separate session state and does not inherit your `$script:` vars.

## Pattern 13: External Test Fixtures (Avoid Nested Here-Strings)

For tests that exercise parsers, serialisers, or format converters, **do not**
embed multi-line sample input as a here-string inside the test file. Nested
here-strings are fragile and break tooling that writes test files via terminal
heredocs (`@'...'@` inside another `@'...'@` hangs pwsh waiting for input).

Store fixtures as their own files under `tests/Unit/<area>/Fixtures/<name>.<ext>`
and load them in `BeforeAll`:

```
tests/
  Unit/
    Private/
      ConvertFrom-MyXml.Tests.ps1
      Fixtures/
        valid-response.xml
        error-response.xml
```

```powershell
BeforeAll {
    Import-Module -Name MyModule -Force -ErrorAction Stop
    $script:validXml = Get-Content -LiteralPath "$PSScriptRoot/Fixtures/valid-response.xml" -Raw
    $script:errorXml = Get-Content -LiteralPath "$PSScriptRoot/Fixtures/error-response.xml" -Raw
}

Describe 'ConvertFrom-MyXml' -Tag 'Unit' {
    It 'Parses a valid response' {
        & (Get-Module MyModule) { param($x) ConvertFrom-MyXml -Xml $x } $script:validXml |
            Should -Not -BeNullOrEmpty
    }

    It 'Throws on an error response' {
        { & (Get-Module MyModule) { param($x) ConvertFrom-MyXml -Xml $x } $script:errorXml } |
            Should -Throw
    }
}
```

## Quick Reference: Mock Cheat Sheet

| What to Mock | Mock Command | Key Detail |
|---|---|---|
| File I/O | `Mock Get-Content`, `Mock Set-Content` | Use TestDrive for real files |
| File existence | `Mock Test-Path -MockWith { $true }` | Use `-ParameterFilter` for specific paths |
| REST API | `Mock Invoke-RestMethod` | Return `[PSCustomObject]` |
| HTTP call | `Mock Invoke-WebRequest` | Return object with `StatusCode`, `Content` |
| Date/time | `Mock Get-Date` | Return fixed `[datetime]` |
| Registry | Use `TestRegistry:` | Windows only |
| Services | `Mock Get-Service` | Return object with `Name`, `Status` |
| Processes | `Mock Get-Process` | Return object with `Name`, `Id`, `CPU` |
| Module command | `Mock -ModuleName X -CommandName Y` | Always match `-ModuleName` on `Should -Invoke` |
| Throwing mock | `Mock X -MockWith { throw ... }` | Use typed exceptions |
| Void mock | `Mock X` (no `-MockWith`) | Returns nothing |
