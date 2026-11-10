param(
    [ValidateSet('Plan','Create','Detach','Session')][string]$Mode = 'Plan',
    [string]$Config
)
$ErrorActionPreference = 'Stop'
$parent = 'D:\RCSProofloop-IsolatedTests'

function Protect-Directory([string]$Path) {
    $directory = Get-Item -LiteralPath $Path
    if (($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'PLAN_DIRECTORY_LINK_REFUSED' }
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true,$false)
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    foreach ($principal in @($sid,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($principal,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
        $acl.AddAccessRule($rule)
    }
    $directory.SetAccessControl($acl)
}

if ($Mode -eq 'Plan') {
    foreach ($name in @('Get-DiskImage','Get-Disk','Initialize-Disk','New-Partition','Format-Volume','Add-PartitionAccessPath','Dismount-DiskImage')) {
        if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { throw 'REQUIRED_STORAGE_COMMAND_UNAVAILABLE' }
    }
    $owner = [guid]::NewGuid().ToString('N')
    $root = Join-Path $parent $owner
    if ((Test-Path -LiteralPath $parent) -and (((Get-Item -LiteralPath $parent).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0)) { throw 'PLAN_PARENT_LINK_REFUSED' }
    if (Test-Path -LiteralPath $root) { throw 'FRESH_PLAN_REQUIRED' }
    if ((Get-PSDrive D).Free -lt 2GB) { throw 'INSUFFICIENT_HOST_DISK_HEADROOM' }
    [void][IO.Directory]::CreateDirectory($root)
    Protect-Directory $root
    $plan = [ordered]@{
        owner=$owner; root=$root; image=(Join-Path $root 'synthetic-volume.vhd'); mount=(Join-Path $root 'mount');
        maximumMB=384; label=('RCS_TEST_'+$owner.Substring(0,8)); status='PLAN_ONLY_NOT_MOUNTED';
        purpose='One bounded synthetic PostgreSQL ENOSPC/recovery trial';
        operations=@('Create fixed 384 MiB VHD file','Attach only that image','Verify image-to-disk binding, RAW state, non-system/non-boot and exact size','Format only the verified new virtual disk as NTFS','Mount in owned empty directory','Run bounded synthetic test','Stop owned PostgreSQL','Detach exact image; retain evidence');
        production='OFF'; hostDiskFilling=$false; requiresAdministrator=$true
    }
    $Config = Join-Path $root 'plan.json'
    $plan | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $Config -Encoding UTF8
    [pscustomobject]@{status='PLAN_ONLY_NOT_MOUNTED';config=$Config;image=$plan.image;maximumMB=384;mount=$plan.mount;label=$plan.label} | ConvertTo-Json
    exit 0
}

if (-not $Config) { throw 'OWNED_PLAN_REQUIRED' }
$resolvedConfig = (Resolve-Path -LiteralPath $Config).Path
$plan = Get-Content -LiteralPath $resolvedConfig -Raw -Encoding UTF8 | ConvertFrom-Json
if ($plan.owner -notmatch '^[a-f0-9]{32}$') { throw 'OWNER_ID_INVALID' }
$expectedRoot = [IO.Path]::GetFullPath((Join-Path $parent $plan.owner))
if ($plan.root -ne $expectedRoot -or (Split-Path -Parent $resolvedConfig) -ne $expectedRoot -or
    $plan.image -ne (Join-Path $expectedRoot 'synthetic-volume.vhd') -or
    $plan.mount -ne (Join-Path $expectedRoot 'mount') -or $plan.maximumMB -ne 384 -or
    $plan.label -ne ('RCS_TEST_'+$plan.owner.Substring(0,8))) { throw 'FIXED_OWNED_VOLUME_SCOPE_REQUIRED' }
if (((Get-Item -LiteralPath $expectedRoot).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'OWNER_ROOT_LINK_REFUSED' }
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'ADMINISTRATOR_REQUIRED_FOR_THIS_NEW_IMAGE_ONLY' }

if ($Mode -eq 'Session') {
    & $PSCommandPath -Mode Create -Config $resolvedConfig
    $deadline = [DateTime]::UtcNow.AddMinutes(15)
    $finished = Join-Path $expectedRoot 'test-finished.json'
    while (-not (Test-Path -LiteralPath $finished) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Seconds 2 }
    if (Test-Path -LiteralPath $finished) {
        $done = Get-Content -LiteralPath $finished -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($done.owner -ne $plan.owner) { throw 'TEST_COMPLETION_OWNER_MISMATCH' }
    }
    & $PSCommandPath -Mode Detach -Config $resolvedConfig
    exit 0
}

if ($Mode -eq 'Detach') {
    if (-not (Test-Path -LiteralPath $plan.image)) { throw 'OWNED_IMAGE_MISSING' }
    $image = Get-DiskImage -ImagePath $plan.image
    $fixturePath = Join-Path $plan.mount 'fixture'
    if ($image.Attached -and (Test-Path -LiteralPath $fixturePath) -and @(Get-ChildItem -LiteralPath $fixturePath -Filter 'postmaster.pid' -Recurse -File).Count -gt 0) { throw 'STOP_OWNED_DATABASE_BEFORE_DETACH' }
    if ($image.Attached) { Dismount-DiskImage -ImagePath $plan.image }
    $detached = -not (Get-DiskImage -ImagePath $plan.image).Attached
    if (-not $detached) { throw 'OWNED_DETACH_FAILED' }
    @{status='DETACHED';owner=$plan.owner;image=$plan.image} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $expectedRoot 'detached.json') -Encoding UTF8
    exit 0
}

if ($plan.status -ne 'PLAN_ONLY_NOT_MOUNTED' -or (Test-Path -LiteralPath $plan.image) -or (Test-Path -LiteralPath (Join-Path $expectedRoot 'created.json'))) { throw 'CREATE_ONCE_ONLY' }
if ((Get-PSDrive D).Free -lt 2GB) { throw 'INSUFFICIENT_HOST_DISK_HEADROOM' }
$diskpartScript = Join-Path $expectedRoot 'create-image.diskpart.txt'
@(('create vdisk file="{0}" maximum=384 type=fixed' -f $plan.image),('select vdisk file="{0}"' -f $plan.image),'attach vdisk','exit') | Set-Content -LiteralPath $diskpartScript -Encoding ASCII
$imageCreated = $false
try {
    & "$env:SystemRoot\System32\diskpart.exe" /s $diskpartScript *> (Join-Path $expectedRoot 'create-image.private.log')
    if (-not (Test-Path -LiteralPath $plan.image)) { throw 'NEW_IMAGE_CREATION_FAILED' }
    $imageCreated = $true
    $image = Get-DiskImage -ImagePath $plan.image
    $disks = @($image | Get-Disk)
    if (-not $image.Attached -or $disks.Count -ne 1) { throw 'NEW_IMAGE_DISK_BINDING_FAILED' }
    $disk = $disks[0]
    if ($disk.IsBoot -or $disk.IsSystem -or $disk.Size -ne 384MB -or
        $disk.PartitionStyle -ne 'RAW' -or [int]$disk.BusType -ne 15 -or $disk.IsOffline) { throw 'VERIFIED_NEW_RAW_VIRTUAL_DISK_REQUIRED' }
    # The input disk is obtained only from this newly created exact image.
    # Never enumerate another disk or use a hard-coded physical disk number.
    $initialized = $disk | Initialize-Disk -PartitionStyle GPT -PassThru
    $partition = $initialized | New-Partition -UseMaximumSize
    $volume = $partition | Format-Volume -FileSystem NTFS -NewFileSystemLabel $plan.label -Confirm:$false
    if ($volume.FileSystemLabel -ne $plan.label -or $volume.Size -gt 384MB -or $volume.Size -lt 128MB) { throw 'NEW_VOLUME_READBACK_FAILED' }
    [void][IO.Directory]::CreateDirectory($plan.mount)
    if (@(Get-ChildItem -LiteralPath $plan.mount -Force).Count -ne 0) { throw 'EMPTY_OWNED_MOUNT_DIRECTORY_REQUIRED' }
    $partition | Add-PartitionAccessPath -AccessPath ($plan.mount+'\')
    $fixture = Join-Path $plan.mount 'fixture'
    [void][IO.Directory]::CreateDirectory($fixture)
    Protect-Directory $fixture
    [ordered]@{status='CREATED';owner=$plan.owner;image=$plan.image;mount=$plan.mount;fixture=$fixture;label=$plan.label;diskNumber=$disk.Number;diskUniqueId=(Get-Disk -Number $disk.Number).UniqueId;maximumMB=384;volumeBytes=$volume.Size} |
        ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $expectedRoot 'created.json') -Encoding UTF8
} catch {
    $failure = $_.Exception.Message
    if ($imageCreated) { try { Dismount-DiskImage -ImagePath $plan.image -ErrorAction Stop } catch { } }
    @{status='FAILED';owner=$plan.owner;code=$failure} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $expectedRoot 'failure.json') -Encoding UTF8
    throw
}
