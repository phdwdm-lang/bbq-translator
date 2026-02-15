<#
.SYNOPSIS
    Cleans up the embedded Python environment to reduce size.
.DESCRIPTION
    Removes test files, __pycache__, .dist-info, documentation,
    and other non-essential files from the embedded Python directory.
#>

param(
    [string]$PythonDir = "$PSScriptRoot\..\build\python"
)

$ErrorActionPreference = "Stop"
$PythonDir = [System.IO.Path]::GetFullPath($PythonDir)

if (-not (Test-Path $PythonDir)) {
    Write-Error "Python directory not found: $PythonDir"
    exit 1
}

$sizeBefore = (Get-ChildItem -Recurse -File $PythonDir | Measure-Object -Property Length -Sum).Sum

Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Python Environment Cleanup" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Target: $PythonDir"
Write-Host "Before: $([math]::Round($sizeBefore / 1MB, 1)) MB"
Write-Host ""

# Patterns to remove
$removePatterns = @(
    "__pycache__",
    "*.pyc",
    "*.pyo",
    "tests",
    "test",
    "doc",
    "docs",
    "examples",
    "benchmarks",
    "*.md",
    "*.rst",
    "*.txt",
    "LICENSE*",
    "NOTICE*",
    "CHANGELOG*",
    "AUTHORS*"
)

# Directories to remove entirely
$removeDirs = @(
    "__pycache__",
    "tests",
    "test",
    "docs",
    "doc",
    "examples",
    "benchmarks"
)

$removedCount = 0
$removedSize = 0

# Packages whose internal test/testing dirs are runtime-required
$protectedPackages = @("torch", "kornia", "numpy", "scipy", "sklearn", "skimage")
$sitePackagesDir = Join-Path $PythonDir "Lib\site-packages"

function Test-SafePath($fullPath) {
    foreach ($pkg in $protectedPackages) {
        $pkgDir = Join-Path $sitePackagesDir $pkg
        if ($fullPath.StartsWith($pkgDir, [System.StringComparison]::OrdinalIgnoreCase)) {
            return $true
        }
    }
    return $false
}

# Remove matching directories
foreach ($pattern in $removeDirs) {
    $dirs = Get-ChildItem -Path $PythonDir -Directory -Recurse -Filter $pattern -ErrorAction SilentlyContinue
    foreach ($dir in $dirs) {
        if (Test-SafePath $dir.FullName) {
            continue
        }
        $dirSize = (Get-ChildItem -Recurse -File $dir.FullName -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        $removedSize += $dirSize
        $removedCount++
        Remove-Item -Recurse -Force $dir.FullName -ErrorAction SilentlyContinue
    }
}

# Remove .pyc/.pyo files that might be at top level
$pycFiles = Get-ChildItem -Path $PythonDir -Recurse -Include "*.pyc", "*.pyo" -File -ErrorAction SilentlyContinue
foreach ($f in $pycFiles) {
    $removedSize += $f.Length
    $removedCount++
    Remove-Item -Force $f.FullName -ErrorAction SilentlyContinue
}

# Remove torch test/benchmark directories (large)
$torchCleanDirs = @(
    "torch\test",
    "torch\benchmarks",
    "torch\_C\_VariableFunctions.pyi",
    "torch\_C\__init__.pyi"
)
foreach ($rel in $torchCleanDirs) {
    $p = Join-Path $PythonDir "Lib\site-packages\$rel"
    if (Test-Path $p) {
        if ((Get-Item $p) -is [System.IO.DirectoryInfo]) {
            $dirSize = (Get-ChildItem -Recurse -File $p -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
            $removedSize += $dirSize
        } else {
            $removedSize += (Get-Item $p).Length
        }
        $removedCount++
        Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue
    }
}

# Remove locale data except en/zh/ja/ko
$localePath = Join-Path $PythonDir "Lib\site-packages\babel\locale-data"
if (Test-Path $localePath) {
    $keepLocales = @("en", "zh", "ja", "ko", "root")
    $localeFiles = Get-ChildItem -Path $localePath -File -ErrorAction SilentlyContinue
    foreach ($f in $localeFiles) {
        $localeName = $f.BaseName.Split("_")[0]
        if ($localeName -notin $keepLocales) {
            $removedSize += $f.Length
            $removedCount++
            Remove-Item -Force $f.FullName -ErrorAction SilentlyContinue
        }
    }
}

$sizeAfter = (Get-ChildItem -Recurse -File $PythonDir | Measure-Object -Property Length -Sum).Sum

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Cleanup Complete" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Removed: $removedCount items ($([math]::Round($removedSize / 1MB, 1)) MB)"
Write-Host "Before:  $([math]::Round($sizeBefore / 1MB, 1)) MB"
Write-Host "After:   $([math]::Round($sizeAfter / 1MB, 1)) MB"
Write-Host "Saved:   $([math]::Round(($sizeBefore - $sizeAfter) / 1MB, 1)) MB"
