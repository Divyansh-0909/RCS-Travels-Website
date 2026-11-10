# Small process-runner checks only. Does not launch Docker or change WSL settings.
$ErrorActionPreference = 'Stop'
$tokens = $null
$errors = $null
$source = Join-Path $PSScriptRoot 'repair-docker-startup.ps1'
$ast = [Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)
if ($errors.Count) { throw 'Repair script parse failure.' }
$function = $ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-Bounded'},$true)
. ([scriptblock]::Create($function.Extent.Text))
$repairRoot = Join-Path $env:TEMP ('rcs-docker-process-tests-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $repairRoot | Out-Null
$cmdExe = Join-Path $env:SystemRoot 'System32/cmd.exe'
$psExe = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
$checks = @()
foreach ($expected in @(0,7)) {
    $result = Invoke-Bounded $cmdExe "/d /c exit $expected" "exit-$expected" 5
    if ($result.Code -ne $expected) { throw "Expected $expected, got $($result.Code)." }
    $checks += "exit-$expected"
}
$result = Invoke-Bounded $cmdExe '/d /c echo captured-out' 'stdout' 5
if ($result.Code -ne 0 -or $result.Output.Trim() -ne 'captured-out') { throw 'stdout capture failed.' }
$checks += 'stdout'
$result = Invoke-Bounded $cmdExe '/d /c "echo captured-error 1>&2"' 'stderr' 5
if ($result.Code -ne 0 -or $result.Error.Trim() -ne 'captured-error') { throw 'stderr capture failed.' }
$checks += 'stderr'
$result = Invoke-Bounded $psExe '-NoLogo -NoProfile -NonInteractive -Command "Start-Sleep -Seconds 5"' 'timeout' 1
if ($result.Code -ne 124) { throw 'Timeout was not enforced.' }
$checks += 'timeout'
$hasher = [Security.Cryptography.SHA256]::Create()
try { $scriptHash = [BitConverter]::ToString($hasher.ComputeHash([IO.File]::ReadAllBytes($source))).Replace('-','') } finally { $hasher.Dispose() }
$record = [ordered]@{Status='PASS';PowerShell=$PSVersionTable.PSVersion.ToString();Checks=$checks;RepairScriptSha256=$scriptHash;DockerStarted=$false;WslConfigurationChanged=$false;Directory=$repairRoot}
$record | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $repairRoot 'tests.json')
$record | ConvertTo-Json -Depth 4
