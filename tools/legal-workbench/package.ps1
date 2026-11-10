param([string]$Output = '')
$ErrorActionPreference = 'Stop'
$taskPluginRoot = [IO.Path]::GetFullPath($PSScriptRoot)
$taskVersion = (Get-Content -LiteralPath (Join-Path $taskPluginRoot 'package.json') -Raw | ConvertFrom-Json).version
if (-not $Output) { $Output = Join-Path $PSScriptRoot "../../legal-review/RCS-Legal-Workbench-$taskVersion.zip" }
$taskArchive = [IO.Path]::GetFullPath($Output)
if ($taskArchive.StartsWith($taskPluginRoot + [IO.Path]::DirectorySeparatorChar)) { throw 'Archive must be outside the plugin source directory.' }
if (Test-Path -LiteralPath $taskArchive) { throw 'Archive already exists; choose a new output filename.' }
$taskFiles = Get-ChildItem -LiteralPath $taskPluginRoot -Recurse -Force
foreach ($taskFile in $taskFiles) {
    if ($taskFile.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Symlinks/reparse points cannot be packaged.' }
    if ($taskFile.Name -match '^\.env($|\.)|^(node_modules|\.git|auth\.json|config\.toml)$') { throw 'Unexpected dependency, credential or configuration path in package.' }
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($taskPluginRoot, $taskArchive, [IO.Compression.CompressionLevel]::Optimal, $false)
$taskZip = [IO.Compression.ZipFile]::OpenRead($taskArchive)
try {
    $taskNames = @($taskZip.Entries | ForEach-Object { $_.FullName.Replace('\','/') })
    foreach ($taskRequired in @('plugin.json','mcp.json','.codex-plugin/plugin.json','.codex-plugin/mcp.json','skills/india-legal/SKILL.md','server.mjs','workbench.mjs','references/anthropic/LICENSE.txt')) {
        if ($taskNames -notcontains $taskRequired) { throw "Archive is missing $taskRequired" }
    }
    Write-Output "Verified one plugin archive with $($taskZip.Entries.Count) entries: $taskArchive"
} finally { $taskZip.Dispose() }
