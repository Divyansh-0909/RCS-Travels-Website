param([ValidateSet('start','stop','status','restart','resume','probe','startup-install','startup-remove')][string]$Action = 'status')
$ErrorActionPreference = 'Stop'
$taskRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskCli = Join-Path $PSScriptRoot 'cli.mjs'
if ($Action -eq 'startup-install') {
    $taskStartup = [Environment]::GetFolderPath('Startup')
    $taskShortcut = Join-Path $taskStartup 'RCS Handoff.lnk'
    $taskShell = New-Object -ComObject WScript.Shell
    $taskLink = $taskShell.CreateShortcut($taskShortcut)
    $taskLink.TargetPath = (Get-Command powershell.exe).Source
    $taskLink.Arguments = '-NoProfile -WindowStyle Hidden -File "' + $PSCommandPath + '" start'
    $taskLink.WorkingDirectory = $taskRoot
    $taskLink.WindowStyle = 7
    $taskLink.Save()
    Write-Output 'Optional watcher startup installed for this Windows user at sign-in.'
} elseif ($Action -eq 'startup-remove') {
    $taskShortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'RCS Handoff.lnk'
    if (Test-Path -LiteralPath $taskShortcut) { Remove-Item -LiteralPath $taskShortcut }
    Write-Output 'Optional watcher startup removed.'
} elseif ($Action -eq 'restart') {
    node $taskCli stop
    Start-Sleep -Seconds 3
    node $taskCli start
} else { node $taskCli $Action }
