param([Parameter(Mandatory=$true)][string]$Config)
$ErrorActionPreference = 'Stop'
$packet = Get-Content -LiteralPath $Config -Raw -Encoding UTF8 | ConvertFrom-Json
if ($packet.syntheticOnly -ne $true -or $packet.cases.Count -ne 3) { throw 'SYNTHETIC_PACKET_REQUIRED' }
function Read-Choice([string]$Prompt, [string[]]$Allowed) {
    while ($true) {
        $value = (Read-Host $Prompt).Trim().ToUpperInvariant()
        if ($value -in $Allowed) { return $value }
        Write-Host 'Please use one of the listed choices.'
    }
}
foreach ($reviewer in @('Divyansh Singh','Rajuddin')) {
    Clear-Host
    Write-Host "Independent synthetic review: $reviewer"
    Write-Host 'Only this reviewer should enter answers. Do not discuss answers until BOTH forms are saved.'
    Write-Host 'No real incident or financial decision is involved. No AI/reference answer is shown.'
    $confirm = Read-Choice 'Are you this reviewer, with no prior AI/reference-answer exposure? Y / N' @('Y','N')
    if ($confirm -ne 'Y') { throw 'BLIND_REVIEW_NOT_ATTESTED' }
    $labels = @()
    foreach ($case in $packet.cases) {
        Write-Host "`n$($case.title)"
        foreach ($line in $case.observations) { Write-Host " - $line" }
        Write-Host "Question: $($case.question)"
        $facts = Read-Choice 'Is there enough evidence to assign fault to one party? Y / N' @('Y','N')
        $review = Read-Choice 'Does this need human review rather than an automatic consequence? Y / N' @('Y','N')
        $outcome = Read-Choice 'Proposed attribution: D=driver R=rider P=platform U=undetermined H=review required' @('D','R','P','U','H')
        $map = @{D='DRIVER'; R='RIDER'; P='PLATFORM'; U='UNDETERMINED'; H='REVIEW_REQUIRED'}
        $labels += [ordered]@{ casePseudonym=$case.casePseudonym; evidenceSha256=$case.evidenceSha256; reviewer=$reviewer;
            factsSupported=($facts -eq 'Y'); reviewRequired=($review -eq 'Y'); disposition=$map[$outcome]; modelVisible=$false;
            lockedAt=[DateTime]::UtcNow.ToString('o') }
    }
    $destination = if ($reviewer -eq 'Divyansh Singh') { $packet.divyanshAnswerPath } else { $packet.rajuddinAnswerPath }
    $document = [ordered]@{ schema='synthetic-blind-labels-v1'; pilotId=$packet.pilotId; reviewer=$reviewer;
        syntheticOnly=$true; independenceSelfAttested=$true; instructionSha256=$packet.instructionSha256; labels=$labels }
    $bytes = [Text.Encoding]::UTF8.GetBytes(($document | ConvertTo-Json -Depth 8))
    $stream = [IO.File]::Open($destination,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
    Clear-Host
    Write-Host "$reviewer answers saved and locked. They have not been compared or revealed."
    if ($reviewer -eq 'Divyansh Singh') { [void](Read-Host 'Hand over to Rajuddin, then press Enter') }
}
Write-Host 'Both independent forms are saved. Reply: pilot forms saved. Do not paste answers or private paths.'
[void](Read-Host 'Press Enter to close')
