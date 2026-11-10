param([ValidateSet('start','status','stop-native')][string]$Action='start')
$ErrorActionPreference='Stop'
$taskRoot=(Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$taskRuntime=Join-Path $taskRoot 'output/handoff'
New-Item -ItemType Directory -Force -Path $taskRuntime | Out-Null
function Start-PreviewProcess([string]$Name,[string]$Script,[string[]]$Options) {
  $record=Join-Path $taskRuntime ($Name+'.pid')
  $existing=if(Test-Path -LiteralPath $record){Get-Content -LiteralPath $record}else{$null}
  if($existing){
    $current=Get-CimInstance Win32_Process -Filter "ProcessId = $existing" -ErrorAction SilentlyContinue
    if($current -and $current.CommandLine.Contains($Script)){Write-Output "$Name already running";return}
  }
  $process=Start-Process -FilePath 'node' -ArgumentList (@($Script)+$Options) -WorkingDirectory $taskRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskRuntime ($Name+'.log')) -RedirectStandardError (Join-Path $taskRuntime ($Name+'.err.log'))
  Set-Content -LiteralPath $record -Value $process.Id
  Write-Output "$Name started"
}
if($Action -eq 'stop-native'){
  Set-Content -LiteralPath (Join-Path $taskRuntime 'native-preview-stop') -Value 'owner requested fixture stop'
  Write-Output 'Native fixture stop requested. The fixture closes its app, forwards, Metro and disposable database; USB keep-awake stays enabled.'
}elseif($Action -eq 'status'){
  Push-Location $taskRoot
  try{node tools/handoff/cli.mjs status; if(Test-Path -LiteralPath (Join-Path $taskRuntime 'native-fixture.json')){Get-Content -LiteralPath (Join-Path $taskRuntime 'native-fixture.json')}}finally{Pop-Location}
}else{
  Push-Location $taskRoot
  try{node tools/handoff/cli.mjs start}finally{Pop-Location}
  Start-PreviewProcess 'website-preview' 'tools/ui-quality/serve.mjs' @()
  Start-PreviewProcess 'native-live' 'tools/ui-quality/native-live.mjs' @()
  Start-PreviewProcess 'native-preview' 'backend/tests/run-phase9-native.js' @('--review-preview','--keep-awake')
  Write-Output 'Viewer: http://127.0.0.1:4317/?issue=P03-O1&width=390&theme=dark'
  Write-Output 'Android: http://127.0.0.1:4317/?mode=android (VIEW-ONLY; interact on the physical phone)'
}
