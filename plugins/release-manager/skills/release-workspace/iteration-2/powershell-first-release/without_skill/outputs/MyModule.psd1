@{
    RootModule        = 'MyModule.psm1'
    ModuleVersion     = '1.0.0'
    GUID              = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
    Author            = 'Test User'
    Copyright         = '(c) 2026 Test User. All rights reserved.'
    Description       = 'A utility module for managing cloud resources'
    FunctionsToExport = @('Get-CloudResource', 'New-CloudResource', 'Remove-CloudResource')
    CmdletsToExport   = @()
    VariablesToExport  = @()
    AliasesToExport    = @()
}
