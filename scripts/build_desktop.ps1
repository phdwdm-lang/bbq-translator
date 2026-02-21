<#
.SYNOPSIS
    Full desktop application build orchestration script.
.DESCRIPTION
    1. Builds Next.js frontend
    2. Builds embedded Python environment (if not cached)
    3. Packages with electron-builder
.EXAMPLE
    .\scripts\build_desktop.ps1
    .\scripts\build_desktop.ps1 -SkipPython   # Skip Python env rebuild
    .\scripts\build_desktop.ps1 -SkipFrontend  # Skip Next.js build
#>

param(
    [switch]$SkipPython,
    [switch]$SkipFrontend,
    [switch]$SkipModels,
    [switch]$SkipPackage
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $ProjectRoot "backend"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " BBQ Translator Desktop Build" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"
Write-Host "Backend: $BackendDir"
Write-Host ""

$stepNum = 0

# ── Step 1: Build Frontend ──
$stepNum++
if (-not $SkipFrontend) {
    Write-Host "[$stepNum] Building Next.js frontend..." -ForegroundColor Green
    Push-Location $ProjectRoot
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "Next.js build failed" }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "[$stepNum] Skipping frontend build" -ForegroundColor Yellow
}

# ── Step 2: Build Embedded Python ──
$stepNum++
$pythonDir = Join-Path $ProjectRoot "build\python"
if (-not $SkipPython) {
    if (Test-Path $pythonDir) {
        Write-Host "[$stepNum] Embedded Python already exists at: $pythonDir" -ForegroundColor Yellow
        Write-Host "      To rebuild, delete this directory first." -ForegroundColor Yellow
    } else {
        Write-Host "[$stepNum] Building embedded Python environment..." -ForegroundColor Green
        & "$PSScriptRoot\build_embedded_python.ps1" -TargetDir $pythonDir -BackendDir $BackendDir
        if ($LASTEXITCODE -ne 0) { throw "Embedded Python build failed" }

        Write-Host "      Running cleanup..." -ForegroundColor Green
        & "$PSScriptRoot\cleanup_python.ps1" -PythonDir $pythonDir
    }
} else {
    Write-Host "[$stepNum] Skipping Python build" -ForegroundColor Yellow
}

# ── Step 3: Download Core Models ──
$stepNum++
$modelsDir = Join-Path $ProjectRoot "build\bundled-models"
if (-not $SkipModels) {
    if (Test-Path $modelsDir) {
        # Check if all models exist
        $requiredModels = @(
            "detection\comictextdetector.pt",
            "detection\comictextdetector.pt.onnx",
            "ocr\ocr_ar_48px.ckpt",
            "ocr\alphabet-all-v7.txt",
            "inpainting\inpainting_lama_mpe.ckpt"
        )
        $allExist = $true
        foreach ($m in $requiredModels) {
            if (-not (Test-Path (Join-Path $modelsDir $m))) {
                $allExist = $false
                break
            }
        }
        if ($allExist) {
            Write-Host "[$stepNum] Core models already downloaded at: $modelsDir" -ForegroundColor Yellow
        } else {
            Write-Host "[$stepNum] Some models missing, re-downloading..." -ForegroundColor Yellow
            & "$PSScriptRoot\download_models.ps1" -TargetDir $modelsDir
            if ($LASTEXITCODE -ne 0) { throw "Model download failed" }
        }
    } else {
        Write-Host "[$stepNum] Downloading core models..." -ForegroundColor Green
        & "$PSScriptRoot\download_models.ps1" -TargetDir $modelsDir
        if ($LASTEXITCODE -ne 0) { throw "Model download failed" }
    }
} else {
    Write-Host "[$stepNum] Skipping model download" -ForegroundColor Yellow
}

# ── Step 4: Package with electron-builder ──
$stepNum++
if (-not $SkipPackage) {
    Write-Host "[$stepNum] Packaging with electron-builder..." -ForegroundColor Green
    Push-Location $ProjectRoot
    try {
        npm run build:desktop
        if ($LASTEXITCODE -ne 0) { throw "electron-builder failed" }
    } finally {
        Pop-Location
    }
} else {
    Write-Host "[$stepNum] Skipping packaging" -ForegroundColor Yellow
}

# ── Summary ──
$distDir = Join-Path $ProjectRoot "dist"
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Build Complete" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
if (Test-Path $distDir) {
    $installers = Get-ChildItem -Path $distDir -Filter "*.exe" -ErrorAction SilentlyContinue
    if ($installers) {
        foreach ($f in $installers) {
            $sizeMB = [math]::Round($f.Length / 1MB, 1)
            Write-Host "Installer: $($f.Name) ($sizeMB MB)" -ForegroundColor Green
        }
    } else {
        Write-Host "Output: $distDir" -ForegroundColor Yellow
    }
}
