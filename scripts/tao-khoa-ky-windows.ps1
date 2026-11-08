# Tao mot khoa ky Android rieng cho Nhac, luu o Documents (KHONG upload vao repo).
$ErrorActionPreference = 'Stop'
try {
    $keytool = Get-Command 'keytool' -ErrorAction SilentlyContinue
    if (-not $keytool -and $env:JAVA_HOME) {
        $candidate = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
        if (Test-Path $candidate) { $keytool = @{ Source = $candidate } }
    }
    if (-not $keytool) { throw 'Chua cai Java JDK (can keytool). Hay cai JDK 17, roi chay lai script.' }
    $docs = [Environment]::GetFolderPath('MyDocuments')
    if (-not $docs) { $docs = $HOME }
    $folder = Join-Path $docs 'NHAC-KHOA-KY'
    New-Item -Path $folder -ItemType Directory -Force | Out-Null
    $store = Join-Path $folder 'nhac-release.p12'
    $output = Join-Path $folder 'NHAC_SIGNING_BUNDLE.txt'
    if ((Test-Path $store) -or (Test-Path $output)) {
        throw "Da co khoa ky trong $folder. KHONG tao lai vi cap nhat APK se khong cai de len ban cu. Hay dung lai khoa cu."
    }
    $bytes = New-Object byte[] 36
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $password = [Convert]::ToBase64String($bytes)
    & $keytool.Source -genkeypair -noprompt -storetype PKCS12 -keystore $store -alias nhac -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Nhac Offline, OU=Personal, O=Nhac, C=VN' -storepass $password -keypass $password
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $store)) { throw 'Khong tao duoc khoa ky. Kiem tra JDK.' }
    $bundle = @{
        keystoreBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($store))
        storePassword = $password
        keyAlias = 'nhac'
        keyPassword = $password
    } | ConvertTo-Json -Compress
    $secret = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($bundle))
    [IO.File]::WriteAllText($output, $secret, (New-Object Text.UTF8Encoding $false))
    Write-Host ''
    Write-Host 'THANH CONG! Da tao khoa ky Nhac tai:' -ForegroundColor Green
    Write-Host $folder
    Write-Host ''
    Write-Host '1. GitHub repo > Settings > Secrets and variables > Actions > New repository secret'
    Write-Host '2. Name: NHAC_SIGNING_BUNDLE'
    Write-Host "3. Value: mo file NHAC_SIGNING_BUNDLE.txt, copy TOAN BO noi dung roi Save."
    Write-Host '4. Sau do vao Actions > Phat hanh APK Nhac (OTA) > Run workflow.'
    Write-Host ''
    Write-Host 'GIU BI MAT va sao luu thu muc NHAC-KHOA-KY, KHONG upload vao repo.' -ForegroundColor Yellow
} catch {
    Write-Host ('LOI: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
