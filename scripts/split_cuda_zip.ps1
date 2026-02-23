<#
.SYNOPSIS
  Split a large CUDA zip into binary volumes for GitHub Release upload.
.DESCRIPTION
  Reads the source zip and writes sequential .zip.001, .zip.002, ... files
  each no larger than $MaxSizeMB megabytes.
#>
param(
    [string]$SourceZip = "D:\work\project\拓展包\cuda\cuda-gpu-extension.zip",
    [string]$OutputDir = "D:\work\project\拓展包\cuda\split",
    [string]$BaseName  = "cuda-gpu-extension",
    [int]$MaxSizeMB    = 1900
)

$maxBytes = [long]$MaxSizeMB * 1024 * 1024

if (-not (Test-Path $SourceZip)) {
    Write-Error "Source zip not found: $SourceZip"
    exit 1
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$srcStream = [System.IO.File]::OpenRead($SourceZip)
$totalSize = $srcStream.Length
$buffer    = New-Object byte[] (64 * 1024)
$partNum   = 1
$written   = 0

try {
    while ($srcStream.Position -lt $totalSize) {
        $partPath = Join-Path $OutputDir ("{0}.zip.{1:D3}" -f $BaseName, $partNum)
        $dstStream = [System.IO.File]::Create($partPath)
        $partWritten = 0

        try {
            while ($partWritten -lt $maxBytes -and $srcStream.Position -lt $totalSize) {
                $toRead = [math]::Min($buffer.Length, $maxBytes - $partWritten)
                $read = $srcStream.Read($buffer, 0, $toRead)
                if ($read -le 0) { break }
                $dstStream.Write($buffer, 0, $read)
                $partWritten += $read
                $written += $read
            }
        } finally {
            $dstStream.Close()
        }

        $sizeMB = [math]::Round($partWritten / 1MB, 1)
        Write-Host "  Created: $partPath ($sizeMB MB)"
        $partNum++
    }
} finally {
    $srcStream.Close()
}

Write-Host ""
Write-Host "Split complete: $($partNum - 1) parts, total $([math]::Round($totalSize / 1MB, 1)) MB"
