param([string]$Repository = (Join-Path $PSScriptRoot '../..'))
$ErrorActionPreference = 'Stop'
$taskRepository = [IO.Path]::GetFullPath($Repository)
$taskPluginPath = [IO.Path]::GetFullPath($PSScriptRoot)
if ($taskPluginPath -ne (Join-Path $taskRepository 'tools/legal-workbench')) {
    throw 'Run this installer from the repository tools/legal-workbench directory.'
}
$taskCatalogDirectory = Join-Path $taskRepository '.agents/plugins'
$taskCatalogPath = Join-Path $taskCatalogDirectory 'marketplace.json'
if (Test-Path -LiteralPath $taskCatalogPath) {
    $taskCatalog = Get-Content -LiteralPath $taskCatalogPath -Raw | ConvertFrom-Json
    if (-not $taskCatalog.name -or -not $taskCatalog.PSObject.Properties['plugins']) { throw 'Existing marketplace has an unsupported shape; no configuration changed.' }
} else {
    $taskCatalog = [pscustomobject]@{ name = 'rcs-local'; interface = @{ displayName = 'RCS local tools' }; plugins = @() }
}
$taskEntry = [pscustomobject]@{
    name = 'rcs-legal-workbench'
    source = @{ source = 'local'; path = './tools/legal-workbench' }
    policy = @{ installation = 'AVAILABLE'; authentication = 'ON_USE' }
    category = 'Productivity'
}
$taskEntries = @($taskCatalog.plugins)
$taskIndex = -1
for ($taskI = 0; $taskI -lt $taskEntries.Count; $taskI++) {
    if ($taskEntries[$taskI].name -eq $taskEntry.name) { $taskIndex = $taskI; break }
}
if ($taskIndex -ge 0) { $taskEntries[$taskIndex] = $taskEntry } else { $taskEntries += $taskEntry }
$taskCatalog.plugins = $taskEntries
New-Item -ItemType Directory -Force -Path $taskCatalogDirectory | Out-Null
$taskJson = $taskCatalog | ConvertTo-Json -Depth 30
[IO.File]::WriteAllText($taskCatalogPath, $taskJson + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
codex plugin marketplace add $taskRepository --json
if ($LASTEXITCODE -ne 0) { throw 'Codex marketplace registration failed.' }
codex plugin add "rcs-legal-workbench@$($taskCatalog.name)" --json
if ($LASTEXITCODE -ne 0) { throw 'Codex plugin installation failed.' }
Write-Output 'Installed. Reopen Codex if the current task has not refreshed its tool inventory.'
