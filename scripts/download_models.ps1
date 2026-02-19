<#
.SYNOPSIS
    Downloads core models required for offline translation.
.DESCRIPTION
    Downloads detection, OCR, and inpainting models from GitHub Releases
    to enable offline functionality on first launch.
.EXAMPLE
    .\scripts\download_models.ps1
    .\scripts\download_models.ps1 -TargetDir "build\bundled-models"
#>

param(
    [string]$TargetDir = "$PSScriptRoot\..\build\bundled-models"
)

$ErrorActionPreference = "Stop"

# ── Model Manifest ──
$MODELS = @(
    @{
        SubDir   = "detection"
        FileName = "detect-20241225.ckpt"
        Url      = "https://github.com/zyddnys/manga-image-translator/releases/download/beta-0.3/detect-20241225.ckpt"
        Hash     = "67ce1c4ed4793860f038c71189ba9630a7756f7683b1ee5afb69ca0687dc502e"
    },
    @{
        SubDir   = "ocr"
        FileName = "ocr_ar_48px.ckpt"
        Url      = "https://github.com/zyddnys/manga-image-translator/releases/download/beta-0.3/ocr_ar_48px.ckpt"
        Hash     = "29daa46d080818bb4ab239a518a88338cbccff8f901bef8c9db191a7cb97671d"
    },
    @{
        SubDir   = "ocr"
        FileName = "alphabet-all-v7.txt"
        Url      = "https://github.com/zyddnys/manga-image-translator/releases/download/beta-0.3/alphabet-all-v7.txt"
        Hash     = "f5722368146aa0fbcc9f4726866e4efc3203318ebb66c811d8cbbe915576538a"
    },
    @{
        SubDir   = "inpainting"
        FileName = "inpainting_lama_mpe.ckpt"
        Url      = "https://github.com/zyddnys/manga-image-translator/releases/download/beta-0.3/inpainting_lama_mpe.ckpt"
        Hash     = "d625aa1b3e0d0408acfd6928aa84f005867aa8dbb9162480346a4e20660786cc"
    }
)

# ── Helpers ──
function Get-FileSHA256 {
    param([string]$FilePath)
    $hash = Get-FileHash -Path $FilePath -Algorithm SHA256
    return $hash.Hash.ToLower()
}

function Format-FileSize {
    param([long]$Bytes)
    if ($Bytes -ge 1GB) { return "{0:N2} GB" -f ($Bytes / 1GB) }
    if ($Bytes -ge 1MB) { return "{0:N2} MB" -f ($Bytes / 1MB) }
    if ($Bytes -ge 1KB) { return "{0:N2} KB" -f ($Bytes / 1KB) }
    return "$Bytes B"
}

function Download-FileWithProgress {
    param(
        [string]$Url,
        [string]$OutFile,
        [string]$DisplayName
    )

    $tempFile = "$OutFile.downloading"

    try {
        Write-Host "      Downloading: $DisplayName" -ForegroundColor Cyan

        # Use WebClient for progress support
        $webClient = New-Object System.Net.WebClient

        # Get file size first
        try {
            $request = [System.Net.WebRequest]::Create($Url)
            $request.Method = "HEAD"
            $response = $request.GetResponse()
            $totalBytes = $response.ContentLength
            $response.Close()
            Write-Host "      Size: $(Format-FileSize $totalBytes)"
        } catch {
            $totalBytes = 0
            Write-Host "      Size: Unknown"
        }

        $startTime = Get-Date
        $webClient.DownloadFile($Url, $tempFile)
        $elapsed = (Get-Date) - $startTime

        if (Test-Path $tempFile) {
            $downloadedSize = (Get-Item $tempFile).Length
            $speed = if ($elapsed.TotalSeconds -gt 0) { $downloadedSize / $elapsed.TotalSeconds } else { 0 }
            Write-Host "      Completed: $(Format-FileSize $downloadedSize) in $([math]::Round($elapsed.TotalSeconds, 1))s ($(Format-FileSize $speed)/s)" -ForegroundColor Green
            Move-Item -Path $tempFile -Destination $OutFile -Force
        }
    } catch {
        if (Test-Path $tempFile) { Remove-Item $tempFile -Force -ErrorAction SilentlyContinue }
        throw $_
    } finally {
        if ($webClient) { $webClient.Dispose() }
    }
}

# ── Main ──
$TargetDir = [System.IO.Path]::GetFullPath($TargetDir)

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Core Models Downloader" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Target: $TargetDir"
Write-Host "Models: $($MODELS.Count)"
Write-Host ""

$downloaded = 0
$skipped = 0
$failed = 0

foreach ($model in $MODELS) {
    $subDir = Join-Path $TargetDir $model.SubDir
    $filePath = Join-Path $subDir $model.FileName
    $displayName = "$($model.SubDir)/$($model.FileName)"

    Write-Host "[$($MODELS.IndexOf($model) + 1)/$($MODELS.Count)] $displayName" -ForegroundColor White

    # Check if file exists and hash matches
    if (Test-Path $filePath) {
        $existingHash = Get-FileSHA256 -FilePath $filePath
        if ($existingHash -eq $model.Hash) {
            Write-Host "      Skipped (already exists, hash OK)" -ForegroundColor Yellow
            $skipped++
            continue
        } else {
            Write-Host "      Hash mismatch, re-downloading..." -ForegroundColor Yellow
            Remove-Item $filePath -Force
        }
    }

    # Create directory
    if (-not (Test-Path $subDir)) {
        New-Item -ItemType Directory -Path $subDir -Force | Out-Null
    }

    # Download
    try {
        Download-FileWithProgress -Url $model.Url -OutFile $filePath -DisplayName $displayName

        # Verify hash
        $downloadedHash = Get-FileSHA256 -FilePath $filePath
        if ($downloadedHash -ne $model.Hash) {
            Write-Host "      ERROR: Hash verification failed!" -ForegroundColor Red
            Write-Host "      Expected: $($model.Hash)" -ForegroundColor Red
            Write-Host "      Got:      $downloadedHash" -ForegroundColor Red
            Remove-Item $filePath -Force -ErrorAction SilentlyContinue
            $failed++
            continue
        }

        Write-Host "      Hash verified OK" -ForegroundColor Green
        $downloaded++
    } catch {
        Write-Host "      ERROR: Download failed - $_" -ForegroundColor Red
        $failed++
    }
}

# ── Summary ──
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Download Complete" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Downloaded: $downloaded"
Write-Host "Skipped:    $skipped"
Write-Host "Failed:     $failed"

if ($failed -gt 0) {
    Write-Host ""
    Write-Host "WARNING: Some models failed to download!" -ForegroundColor Red
    Write-Host "The application may not work offline." -ForegroundColor Red
    exit 1
}

# Calculate total size
$totalSize = 0
foreach ($model in $MODELS) {
    $filePath = Join-Path (Join-Path $TargetDir $model.SubDir) $model.FileName
    if (Test-Path $filePath) {
        $totalSize += (Get-Item $filePath).Length
    }
}
Write-Host "Total size: $(Format-FileSize $totalSize)"
Write-Host ""
