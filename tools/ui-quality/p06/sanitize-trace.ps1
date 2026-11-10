$ErrorActionPreference='Stop'
$taskRoot=(Get-Location).Path
$taskState=Get-Content -LiteralPath (Join-Path $taskRoot 'output/handoff/state.json') -Raw | ConvertFrom-Json
$taskRunDirectory=Join-Path $taskRoot $taskState.run.directory
$taskArchive=Join-Path $taskRunDirectory 'private/P06-keyboard-trace.zip'
$taskOutput=Join-Path $taskRunDirectory 'artifacts/P06-browser-trace.json'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskZip=[System.IO.Compression.ZipFile]::OpenRead($taskArchive)
$taskEvents=New-Object System.Collections.Generic.List[object]
try {
  foreach($taskEntry in $taskZip.Entries){
    if(-not $taskEntry.FullName.EndsWith('.trace')){continue}
    $taskReader=New-Object System.IO.StreamReader($taskEntry.Open())
    try{
      while(($taskLine=$taskReader.ReadLine()) -ne $null){
        $taskEvent=$taskLine | ConvertFrom-Json
        if($taskEvent.type -notin @('before','after')){continue}
        # Deliberate allowlist: no request headers, cookies, tokens, bodies,
        # DOM/resource snapshots, arbitrary params or synthetic auth credentials.
        $taskEvents.Add([pscustomobject]@{type=$taskEvent.type;callId=$taskEvent.callId;startTime=$taskEvent.startTime;endTime=$taskEvent.endTime;apiName=$taskEvent.apiName;method=$taskEvent.method;class=$taskEvent.class;hasError=[bool]$taskEvent.error})
      }
    }finally{$taskReader.Dispose()}
  }
}finally{$taskZip.Dispose()}
$taskResult=[pscustomobject]@{phase='P06';kind='SANITIZED_PLAYWRIGHT_ACTION_TRACE';rawArchiveSha256=(Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash.ToLowerInvariant();rawArchiveUploaded=$false;omitted='Headers/cookies/tokens/bodies/params/DOM/resources; raw trace remains private';events=$taskEvents.ToArray()}
[System.IO.File]::WriteAllText($taskOutput,($taskResult | ConvertTo-Json -Depth 8),[System.Text.UTF8Encoding]::new($false))
Write-Output ('Sanitized Playwright trace: '+$taskEvents.Count+' action events; raw archive retained privately.')
