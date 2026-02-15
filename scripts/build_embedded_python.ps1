<#
.SYNOPSIS
    Downloads and sets up an embedded Python environment for the desktop app.
.DESCRIPTION
    1. Downloads python-3.11.x-embed-amd64.zip
    2. Extracts it to the target directory
    3. Enables site-packages via python311._pth
    4. Installs pip via get-pip.py
    5. Installs CPU-lite dependencies
#>

param(
    [string]$TargetDir = "$PSScriptRoot\..\build\python",
    [string]$BackendDir = "$PSScriptRoot\..\..\manga-backend",
    [string]$PythonVersion = "3.11.9",
    [switch]$SkipDownload,
    [switch]$SkipDeps
)

$ErrorActionPreference = "Stop"

# ── Constants ──
$PYTHON_ZIP_URL = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
$GET_PIP_URL = "https://bootstrap.pypa.io/get-pip.py"
$PTH_FILENAME = "python311._pth"

$TargetDir = [System.IO.Path]::GetFullPath($TargetDir)
$BackendDir = [System.IO.Path]::GetFullPath($BackendDir)
$RequirementsFile = Join-Path $BackendDir "requirements-cpu-lite.txt"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Embedded Python Builder" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Target:       $TargetDir"
Write-Host "Backend:      $BackendDir"
Write-Host "Python:       $PythonVersion"
Write-Host "Requirements: $RequirementsFile"
Write-Host ""

# ── Step 1: Download Python embeddable ──
$zipPath = Join-Path $env:TEMP "python-$PythonVersion-embed-amd64.zip"

if (-not $SkipDownload) {
    if (Test-Path $zipPath) {
        Write-Host "[1/5] Python zip already cached: $zipPath" -ForegroundColor Yellow
    } else {
        Write-Host "[1/5] Downloading Python $PythonVersion embeddable..." -ForegroundColor Green
        Invoke-WebRequest -Uri $PYTHON_ZIP_URL -OutFile $zipPath -UseBasicParsing
        Write-Host "      Downloaded to: $zipPath"
    }
} else {
    Write-Host "[1/5] Skipping download (--SkipDownload)" -ForegroundColor Yellow
}

# ── Step 2: Extract ──
if (Test-Path $TargetDir) {
    Write-Host "[2/5] Cleaning existing target directory..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $TargetDir
}

Write-Host "[2/5] Extracting to: $TargetDir" -ForegroundColor Green
New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
Expand-Archive -Path $zipPath -DestinationPath $TargetDir -Force

# ── Step 3: Enable site-packages ──
$pthFile = Join-Path $TargetDir $PTH_FILENAME
Write-Host "[3/5] Configuring $PTH_FILENAME to enable site-packages..." -ForegroundColor Green

$pthContent = @"
python311.zip
.
Lib\site-packages
import site
"@
[System.IO.File]::WriteAllText($pthFile, $pthContent, (New-Object System.Text.UTF8Encoding $false))

# Create site-packages directory
$sitePackages = Join-Path $TargetDir "Lib\site-packages"
New-Item -ItemType Directory -Path $sitePackages -Force | Out-Null

# ── Step 4: Install pip ──
$pythonExe = Join-Path $TargetDir "python.exe"
$getPipPath = Join-Path $env:TEMP "get-pip.py"

Write-Host "[4/5] Installing pip..." -ForegroundColor Green
if (-not (Test-Path $getPipPath)) {
    Invoke-WebRequest -Uri $GET_PIP_URL -OutFile $getPipPath -UseBasicParsing
}
& $pythonExe $getPipPath --no-warn-script-location 2>&1 | ForEach-Object { Write-Host "      $_" }

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to install pip (exit code: $LASTEXITCODE)"
    exit 1
}

# ── Step 5: Install dependencies ──
if (-not $SkipDeps) {
    if (-not (Test-Path $RequirementsFile)) {
        Write-Error "Requirements file not found: $RequirementsFile"
        exit 1
    }

    Write-Host "[5/5] Installing CPU-lite dependencies..." -ForegroundColor Green
    Write-Host "      This may take several minutes..." -ForegroundColor Yellow

    $pipExe = Join-Path $TargetDir "Scripts\pip.exe"
    & $pipExe install -r $RequirementsFile --no-warn-script-location 2>&1 | ForEach-Object { Write-Host "      $_" }

    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install dependencies (exit code: $LASTEXITCODE)"
        exit 1
    }
} else {
    Write-Host "[5/5] Skipping dependency install (--SkipDeps)" -ForegroundColor Yellow
}

# ── Summary ──
$totalSize = (Get-ChildItem -Recurse -File $TargetDir | Measure-Object -Property Length -Sum).Sum
$totalSizeMB = [math]::Round($totalSize / 1MB, 1)

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Build Complete" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Python:    $pythonExe"
Write-Host "Size:      $totalSizeMB MB"
Write-Host ""
Write-Host "Test with:" -ForegroundColor Yellow
Write-Host "  & `"$pythonExe`" -c `"import torch; print(torch.__version__)`""
Write-Host ""
