# Run from the owner's normal PowerShell session. Preserves socket folders and
# Docker data. Does not run repository tests, change ACLs, or require elevation.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$repairRoot = Join-Path $env:LOCALAPPDATA "RCS-Docker-Repair/$stamp"
New-Item -ItemType Directory -Path $repairRoot | Out-Null
$dockerRoot = 'C:\Program Files\Docker\Docker\'
$dockerCli = Join-Path $dockerRoot 'resources/bin/docker.exe'
$desktopExe = Join-Path $dockerRoot 'Docker Desktop.exe'
$wslExe = Join-Path $env:SystemRoot 'System32/wsl.exe'

function Invoke-Bounded {
    param([string]$Exe, [string]$Arguments, [string]$Name, [int]$Seconds = 15)
    $stdout = Join-Path $repairRoot "$Name.stdout.txt"
    $stderr = Join-Path $repairRoot "$Name.stderr.txt"
    # Own the process handle from launch. Windows PowerShell's Start-Process
    # object can report a null ExitCode for a fast-exiting redirected process.
    $child = New-Object System.Diagnostics.Process
    $child.StartInfo = New-Object System.Diagnostics.ProcessStartInfo
    $child.StartInfo.FileName = $Exe
    $child.StartInfo.Arguments = $Arguments
    $child.StartInfo.UseShellExecute = $false
    $child.StartInfo.CreateNoWindow = $true
    $child.StartInfo.WindowStyle = [Diagnostics.ProcessWindowStyle]::Hidden
    $child.StartInfo.RedirectStandardOutput = $true
    $child.StartInfo.RedirectStandardError = $true
    if ([IO.Path]::GetFileName($Exe) -ieq 'wsl.exe') {
        $child.StartInfo.StandardOutputEncoding = [Text.Encoding]::Unicode
        $child.StartInfo.StandardErrorEncoding = [Text.Encoding]::Unicode
    }
    try {
        if (!$child.Start()) { throw "Could not start $Exe" }
        $processHandle = $child.Handle
        $outputTask = $child.StandardOutput.ReadToEndAsync()
        $errorTask = $child.StandardError.ReadToEndAsync()
        $timedOut = !$child.WaitForExit($Seconds * 1000)
        if ($timedOut) { $child.Kill(); $null = $child.WaitForExit(2000) }
        $drained = [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($outputTask,$errorTask),2000)
        if (!$drained) { throw "Output streams did not close for $Name" }
        $outputText = [string]$outputTask.Result
        $errorText = [string]$errorTask.Result
        $exitCode = if ($timedOut) { 124 } else { $child.ExitCode }
        if ($null -eq $exitCode) { throw "Process exit status unavailable for $Name" }
        if ($timedOut) { $errorText = "Timed out. $errorText" }
        [IO.File]::WriteAllText($stdout,$outputText)
        [IO.File]::WriteAllText($stderr,$errorText)
        [ordered]@{Code=[int]$exitCode;TimedOut=$timedOut;OutputCharacters=$outputText.Length;ErrorCharacters=$errorText.Length} |
            ConvertTo-Json | Set-Content -Encoding utf8 -LiteralPath (Join-Path $repairRoot "$Name.process.json")
        return [pscustomobject]@{Code = [int]$exitCode; Output = $outputText; Error = $errorText}
    } finally { $child.Dispose() }
}

function Stop-DesktopProcesses {
    $processes = @(Get-Process -Name 'Docker Desktop','com.docker.backend' -ErrorAction SilentlyContinue | Where-Object {
        -not $_.HasExited -and $_.Path -and $_.Path.StartsWith($dockerRoot, [StringComparison]::OrdinalIgnoreCase)
    })
    foreach ($item in $processes) { Stop-Process -Id $item.Id -Force }
    foreach ($item in $processes) { if (-not $item.WaitForExit(5000)) { throw "Docker process $($item.Id) did not exit." } }
}

$record = [ordered]@{Started = (Get-Date).ToUniversalTime().ToString('o'); Status = 'STARTED'; DeletedDockerData = $false; RanTests = $false}
$startupAttempted = $false
try {
    Write-Host 'Checking configuration and running WSL distributions...'
    if (!(Test-Path -LiteralPath $dockerCli) -or !(Test-Path -LiteralPath $desktopExe)) { throw 'Expected Docker Desktop installation was not found.' }
    # A newly created configuration must not overwrite any existing WSL choices.
    $wslConfigPath = Join-Path $env:USERPROFILE '.wslconfig'
    $desiredConfig = "# Conservative local Docker/WSL limits, 16 October 2026.`r`n[wsl2]`r`nmemory=3GB`r`nprocessors=2`r`nswap=1GB`r`n`r`n[experimental]`r`nautoMemoryReclaim=gradual`r`n"
    if ((Test-Path -LiteralPath $wslConfigPath) -and (Get-Content -Raw -LiteralPath $wslConfigPath) -ne $desiredConfig) {
        throw 'An existing .wslconfig needs review; no settings were overwritten.'
    }
    $running = Invoke-Bounded $wslExe '--list --running --quiet' 'wsl-running' 15
    if ($running.Code -ne 0) { throw "Cannot safely inspect running WSL distributions (exit $($running.Code)): $($running.Error) $($running.Output)" }
    $distros = @((($running.Output -replace "`0", '') -split '\r?\n') | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if (@($distros | Where-Object { $_ -notin @('docker-desktop','docker-desktop-data') }).Count) {
        throw 'Other WSL distributions are running. Close them normally first so the memory cap can take effect without interrupting their work.'
    }
    $normalStop = Invoke-Bounded $dockerCli 'desktop stop' 'docker-stop' 15
    $record.NormalStopCode = $normalStop.Code
    Stop-DesktopProcesses
    $shutdown = Invoke-Bounded $wslExe '--shutdown' 'wsl-shutdown' 20
    if ($shutdown.Code -ne 0) { throw "WSL shutdown did not complete: $($shutdown.Error)" }

    $localRoot = [IO.Path]::GetFullPath($env:LOCALAPPDATA)
    $socketRoot = [IO.Path]::GetFullPath((Join-Path $localRoot 'docker-secrets-engine'))
    if ($socketRoot -ne [IO.Path]::Combine($localRoot, 'docker-secrets-engine')) { throw 'Unexpected socket path.' }
    if (Test-Path -LiteralPath $socketRoot) {
        $directory = Get-Item -Force -LiteralPath $socketRoot
        if ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Socket parent is a link; refusing to move it.' }
        $entries = @(Get-ChildItem -Force -LiteralPath $socketRoot)
        if (@($entries | Where-Object { $_.PSIsContainer -or $_.Length -ne 0 -or $_.Name -notmatch '^engine\.sock(?:\.stale)*$' }).Count) {
            throw 'The socket directory contains unexpected data; preserving it without changes.'
        }
        $backupName = "docker-secrets-engine.preserved-$stamp"
        $backupPath = [IO.Path]::GetFullPath((Join-Path $localRoot $backupName))
        if ([IO.Path]::GetDirectoryName($backupPath) -ne $localRoot -or (Test-Path -LiteralPath $backupPath)) { throw 'Unexpected backup destination.' }
        Rename-Item -LiteralPath $socketRoot -NewName $backupName
        $record.PreservedSocketDirectory = $backupPath
    }
    New-Item -ItemType Directory -Path $socketRoot -Force | Out-Null
    if (!(Test-Path -LiteralPath $wslConfigPath)) {
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes($desiredConfig)
        $stream = [IO.File]::Open($wslConfigPath, [IO.FileMode]::CreateNew)
        try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
    }
    $record.WslConfiguration = $wslConfigPath
    $configHasher = [Security.Cryptography.SHA256]::Create()
    try { $record.WslConfigurationSha256 = [BitConverter]::ToString($configHasher.ComputeHash([IO.File]::ReadAllBytes($wslConfigPath))).Replace('-','') } finally { $configHasher.Dispose() }
    $record.Limits = @{Memory = '3GB'; CPUs = 2; Swap = '1GB'; AutoMemoryReclaim = 'gradual'}
    if ((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024 -lt 1536) { throw 'Less than 1.5 GB Windows memory is available. Repair is prepared; leave Docker closed until more memory is available.' }
    Write-Host 'Socket folder preserved and resource limits saved. Checking one Docker startup...'
    $startupAttempted = $true
    Start-Process -FilePath $desktopExe -WindowStyle Hidden
    $healthy = $false
    for ($attempt = 1; $attempt -le 8; $attempt++) {
        $freeMB = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024
        if ($freeMB -lt 1024) { throw 'Low available Windows memory; stopping Docker and retaining all data.' }
        $probe = Invoke-Bounded $dockerCli '--context desktop-linux info --format "{{.ServerVersion}}|{{.OSType}}|{{.NCPU}}|{{.MemTotal}}|{{.ContainersRunning}}"' "docker-info-$attempt" 8
        if ($probe.Code -eq 0) {
            $info = $probe.Output.Trim().Split('|')
            if ($info.Count -ne 5 -or $info[1] -ne 'linux') { throw 'Unexpected engine response/type.' }
            if ([long]$info[3] -gt 3328599654 -or [int]$info[2] -gt 2) { throw 'The intended WSL resource cap is not effective.' }
            $record.Engine = @{Version = $info[0]; CPUs = [int]$info[2]; MemoryBytes = [long]$info[3]; RunningContainers = [int]$info[4]}
            $healthy = $true
            break
        }
        Start-Sleep -Seconds 3
    }
    if (!$healthy) { throw 'Docker did not become healthy within the bounded startup check. See the preserved logs.' }
    for ($sample = 1; $sample -le 3; $sample++) {
        Start-Sleep -Seconds 3
        $freeMB = (Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024
        if ($freeMB -lt 1024) { throw 'Available Windows memory fell below 1 GB during the idle check; stopping Docker.' }
    }
    $record.Status = 'STARTUP_AND_RESOURCE_CAP_VERIFIED'
    Write-Host 'Docker started successfully with the resource cap. No tests were started.'
} catch {
    $record.Status = 'REPAIR_INCOMPLETE'
    $record.Error = $_.Exception.Message
    try { Stop-DesktopProcesses; $record.DesktopStopConfirmed = $true } catch { $record.DesktopStopError = $_.Exception.Message }
    if ($startupAttempted) {
        try { $terminated = Invoke-Bounded $wslExe '--terminate docker-desktop' 'stop-docker-vm-after-failure' 15; $record.DockerVmTerminationCode = $terminated.Code } catch { $record.DockerVmStopError = $_.Exception.Message }
    }
    Write-Warning $record.Error
} finally {
    $record.Finished = (Get-Date).ToUniversalTime().ToString('o')
    $record | ConvertTo-Json -Depth 6 | Set-Content -Encoding utf8 -LiteralPath (Join-Path $repairRoot 'repair-result.json')
    Write-Host "Repair record: $repairRoot\repair-result.json"
}
if ($record.Status -ne 'STARTUP_AND_RESOURCE_CAP_VERIFIED') { throw 'Repair incomplete. See the preserved repair record for the failure and stop status.' }
