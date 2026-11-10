param([Parameter(Mandatory = $true)][string]$Config)

$ErrorActionPreference = 'Stop'
$recovered = $null
$createdScratch = $false
try {
    $configPath = [IO.Path]::GetFullPath($Config)
    $settings = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    $private = Split-Path -Parent $configPath
    $expectedParent = Join-Path $env:LOCALAPPDATA 'RCSProofloop\phone-recovery'
    if ((Split-Path -Parent $private) -ne $expectedParent -or
        (Split-Path -Leaf $private) -ne $settings.owner -or
        $settings.owner -notmatch '^[a-f0-9]{32}$' -or
        (Split-Path -Leaf $configPath) -ne 'config.private.json') { throw 'OWNED_CONFIG_REQUIRED' }
    $receiptPath = Join-Path $env:LOCALAPPDATA 'RCSProofloop\local-backups\dev-20261020T202309Z-90796caf\backup-receipt.private.json'
    $original = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    $encrypted = Join-Path $private 'key-passphrase.age'
    $recovered = Join-Path $private 'recovered-identity.private.txt'
    if ((Test-Path -LiteralPath $encrypted) -or (Test-Path -LiteralPath $recovered)) { throw 'FRESH_OUTPUT_REQUIRED' }
    $age = Join-Path $settings.ageDirectory 'age.exe'
    Write-Host 'Choose a strong, unique recovery passphrase. Store it separately from this phone and laptop.'
    Write-Host 'Enter it into age below. Never paste the passphrase into chat.'
    & $age --passphrase --output $encrypted $original.private_identity_file
    if ($LASTEXITCODE -ne 0) { throw 'KEY_ENCRYPTION_FAILED' }
    & $settings.python $settings.tool upload-key --config $configPath
    if ($LASTEXITCODE -ne 0) { throw 'KEY_TRANSFER_FAILED' }
    Write-Host 'Re-enter your passphrase to verify the encrypted key read back from the phone.'
    $createdScratch = $true
    & $age --decrypt --output $recovered (Join-Path $private 'key-readback.age')
    if ($LASTEXITCODE -ne 0) { throw 'PHONE_KEY_DECRYPT_FAILED' }
    & $settings.python $settings.tool verify --config $configPath
    if ($LASTEXITCODE -ne 0) { throw 'RECOVERY_VERIFY_FAILED' }
    Write-Host 'Recovery verified. Tell the assistant, then disconnect USB when driver testing permits.'
    Write-Host 'Keep the phone offline. Keep its recovery passphrase separately. Original laptop materials remain.'
} catch {
    Write-Host 'Recovery handoff did not finish. Details withheld; do not share any passphrase or key.'
    exit 1
} finally {
    if ($createdScratch -and $null -ne $recovered -and [IO.Path]::GetDirectoryName($recovered) -eq $private -and
        [IO.Path]::GetFileName($recovered) -eq 'recovered-identity.private.txt') {
        Remove-Item -LiteralPath $recovered -ErrorAction SilentlyContinue
    }
}
