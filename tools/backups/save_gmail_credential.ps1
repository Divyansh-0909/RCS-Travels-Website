param(
    [Parameter(Mandatory = $true)]
    [string]$IntakeId
)

$ErrorActionPreference = 'Stop'
$inputSecret = $null
$normalizedSecret = $null
$unmanagedSecret = [IntPtr]::Zero
$privateDirectory = $null

try {
    if ($IntakeId -notmatch '^[a-f0-9]{32}$') { throw 'INVALID_INTAKE_ID' }
    $privateDirectory = Join-Path $env:LOCALAPPDATA "RCSProofloop\private-alerts\gmail-$IntakeId"
    if (Test-Path -LiteralPath $privateDirectory) { throw 'INTAKE_ALREADY_EXISTS' }
    [void][System.IO.Directory]::CreateDirectory($privateDirectory)

    $userSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    $systemSid = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')
    $acl = [System.Security.AccessControl.DirectorySecurity]::new()
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($sid in @($userSid, $systemSid)) {
        $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
            $sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'
        )
        [void]$acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $privateDirectory -AclObject $acl
    $readback = Get-Acl -LiteralPath $privateDirectory
    if (-not $readback.AreAccessRulesProtected) { throw 'ACL_NOT_PROTECTED' }
    $rules = @($readback.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]))
    if ($rules.Count -ne 2) { throw 'ACL_UNEXPECTED' }
    foreach ($rule in $rules) {
        if ($rule.IdentityReference.Value -notin @($userSid.Value, $systemSid.Value) -or
            $rule.AccessControlType -ne 'Allow' -or
            $rule.FileSystemRights -ne [System.Security.AccessControl.FileSystemRights]::FullControl) {
            throw 'ACL_UNEXPECTED'
        }
    }

    Write-Host 'RCS backup-alert credential intake'
    Write-Host 'Sender: rcstravels.support@gmail.com'
    Write-Host 'Sign into that account and generate a dedicated Google App password.'
    Write-Host 'Enter the APP password here only, not your normal password or a verification code.'
    Write-Host 'Input is hidden. No email will be sent by this script.'
    $inputSecret = Read-Host 'Google App password (16 letters; displayed spaces are accepted)' -AsSecureString
    $unmanagedSecret = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($inputSecret)
    $normalizedSecret = [System.Security.SecureString]::new()
    for ($index = 0; $index -lt $inputSecret.Length; $index++) {
        $character = [char][System.Runtime.InteropServices.Marshal]::ReadInt16($unmanagedSecret, 2 * $index)
        if ($character -eq ' ') { continue }
        if (-not (($character -ge 'a' -and $character -le 'z') -or
                  ($character -ge 'A' -and $character -le 'Z'))) { throw 'APP_PASSWORD_FORMAT' }
        $normalizedSecret.AppendChar($character)
    }
    if ($normalizedSecret.Length -ne 16) { throw 'APP_PASSWORD_FORMAT' }
    $normalizedSecret.MakeReadOnly()

    $protectedSecret = ConvertFrom-SecureString -SecureString $normalizedSecret
    $secretPath = Join-Path $privateDirectory 'app-password.dpapi'
    $utf8 = [System.Text.UTF8Encoding]::new($false)
    $stream = [System.IO.File]::Open($secretPath, 'CreateNew', 'Write', 'None')
    try {
        $bytes = $utf8.GetBytes($protectedSecret)
        $stream.Write($bytes, 0, $bytes.Length)
    } finally {
        $stream.Dispose()
    }
    $roundtrip = ConvertTo-SecureString ([System.IO.File]::ReadAllText($secretPath).Trim())
    try {
        if ($roundtrip.Length -ne 16) { throw 'CREDENTIAL_READBACK_FAILED' }
    } finally {
        $roundtrip.Dispose()
    }
    $status = [ordered]@{
        status = 'SAVED_DPAPI_CURRENT_USER_NOT_AUTHENTICATED'
        sender = 'rcstravels.support@gmail.com'
        recipient = 'rcstravels.business@gmail.com'
        smtpHost = 'smtp.gmail.com'
        smtpPort = 587
        credentialFile = 'app-password.dpapi'
        sendingEnabled = $false
        emailSent = $false
        savedUtc = [DateTime]::UtcNow.ToString('o')
    }
    [System.IO.File]::WriteAllText((Join-Path $privateDirectory 'status.json'), ($status | ConvertTo-Json), $utf8)
    Write-Host 'Protected credential saved locally. Authentication and email delivery are not yet tested.'
} catch {
    Write-Host 'Credential intake did not complete. No credential details are displayed.'
    Write-Host 'Tell the assistant that intake failed; do not paste the password.'
} finally {
    if ($unmanagedSecret -ne [IntPtr]::Zero) {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($unmanagedSecret)
    }
    if ($null -ne $inputSecret) { $inputSecret.Dispose() }
    if ($null -ne $normalizedSecret) { $normalizedSecret.Dispose() }
}

[void](Read-Host 'Press Enter to close this window')
