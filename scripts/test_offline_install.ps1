<#
.SYNOPSIS
    Test offline installation of MangaTrans Studio.
.DESCRIPTION
    Simulates a new user environment by:
    - Cleaning userData directory
    - Extracting the zip to a test directory
    - Optionally blocking network except for translation APIs (DeepSeek)
.EXAMPLE
    .\scripts\test_offline_install.ps1
    .\scripts\test_offline_install.ps1 -BlockNetwork
    .\scripts\test_offline_install.ps1 -BlockNetwork -RestoreNetwork
#>

param(
    [string]$ZipPath = "",
    [string]$TestDir = "D:\test-mangatrans",
    [switch]$BlockNetwork,
    [switch]$RestoreNetwork,
    [switch]$SkipExtract,
    [switch]$OpenLogsDir
)

$ErrorActionPreference = "Stop"

# ── Constants ──
$APP_NAME = "MangaTrans Studio"
$USER_DATA_PATH = "$env:APPDATA\$APP_NAME"
$FIREWALL_RULE_PREFIX = "MTS_Test_Block_"

# DeepSeek API domains that should remain accessible
$ALLOWED_DOMAINS = @(
    "api.deepseek.com",
    "deepseek.com"
)

# ── Helper Functions ──
function Write-Step {
    param([int]$Num, [string]$Message, [string]$Color = "Green")
    Write-Host "[$Num] $Message" -ForegroundColor $Color
}

function Get-LatestZip {
    $distDir = Join-Path $PSScriptRoot "..\dist"
    if (-not (Test-Path $distDir)) { return $null }
    $zips = Get-ChildItem $distDir -Filter "*.zip" | Sort-Object LastWriteTime -Descending
    if ($zips.Count -gt 0) { return $zips[0].FullName }
    return $null
}

function Block-NetworkExceptAllowed {
    Write-Host ""
    Write-Host "=== Configuring Network Block ===" -ForegroundColor Yellow
    Write-Host "This will block GitHub/HuggingFace downloads while allowing DeepSeek API."
    Write-Host "Requires Administrator privileges."
    Write-Host ""

    # Block common model download hosts
    $blockedHosts = @(
        "github.com",
        "raw.githubusercontent.com",
        "objects.githubusercontent.com",
        "github-releases.githubusercontent.com",
        "huggingface.co",
        "cdn-lfs.huggingface.co",
        "cdn-lfs-us-1.huggingface.co"
    )

    foreach ($host in $blockedHosts) {
        $ruleName = "${FIREWALL_RULE_PREFIX}${host}"
        
        # Remove existing rule if any
        Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
        
        # Resolve IP addresses
        try {
            $ips = [System.Net.Dns]::GetHostAddresses($host) | ForEach-Object { $_.IPAddressToString }
            if ($ips.Count -gt 0) {
                New-NetFirewallRule -DisplayName $ruleName -Direction Outbound -RemoteAddress $ips -Action Block -Profile Any | Out-Null
                Write-Host "  Blocked: $host ($($ips -join ', '))" -ForegroundColor Red
            }
        } catch {
            Write-Host "  Warning: Could not resolve $host" -ForegroundColor Yellow
        }
    }

    Write-Host ""
    Write-Host "Network blocked. DeepSeek API remains accessible." -ForegroundColor Green
    Write-Host "Run with -RestoreNetwork to unblock." -ForegroundColor Cyan
}

function Restore-Network {
    Write-Host ""
    Write-Host "=== Restoring Network ===" -ForegroundColor Green
    
    $rules = Get-NetFirewallRule -DisplayName "${FIREWALL_RULE_PREFIX}*" -ErrorAction SilentlyContinue
    if ($rules) {
        $rules | Remove-NetFirewallRule
        Write-Host "Removed $($rules.Count) firewall rules." -ForegroundColor Green
    } else {
        Write-Host "No test firewall rules found." -ForegroundColor Yellow
    }
}

# ── Main ──
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " $APP_NAME - Offline Installation Test" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Handle network operations
if ($RestoreNetwork) {
    Restore-Network
    exit 0
}

if ($BlockNetwork) {
    Block-NetworkExceptAllowed
    Write-Host ""
}

# Find zip file
if (-not $ZipPath) {
    $ZipPath = Get-LatestZip
    if (-not $ZipPath) {
        Write-Host "ERROR: No zip file found in dist/. Please build first or specify -ZipPath" -ForegroundColor Red
        exit 1
    }
}

if (-not (Test-Path $ZipPath)) {
    Write-Host "ERROR: Zip file not found: $ZipPath" -ForegroundColor Red
    exit 1
}

Write-Host "Zip: $ZipPath"
Write-Host "Test Dir: $TestDir"
Write-Host ""

$step = 0

# Step 1: Clean userData
$step++
if (Test-Path $USER_DATA_PATH) {
    Write-Step $step "Cleaning userData: $USER_DATA_PATH" "Yellow"
    Remove-Item $USER_DATA_PATH -Recurse -Force
    Write-Host "      Cleaned." -ForegroundColor Green
} else {
    Write-Step $step "userData already clean: $USER_DATA_PATH" "Green"
}

# Step 2: Extract
$step++
if (-not $SkipExtract) {
    if (Test-Path $TestDir) {
        Write-Step $step "Cleaning test directory..." "Yellow"
        Remove-Item $TestDir -Recurse -Force
    }
    Write-Step $step "Extracting to: $TestDir" "Green"
    Expand-Archive -Path $ZipPath -DestinationPath $TestDir -Force
    Write-Host "      Done." -ForegroundColor Green
} else {
    Write-Step $step "Skipping extraction (using existing files)" "Yellow"
}

# Step 3: Verify bundled models
$step++
$modelsDir = Get-ChildItem $TestDir -Recurse -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq "bundled-models" } | Select-Object -First 1
if ($modelsDir) {
    $modelFiles = Get-ChildItem $modelsDir.FullName -Recurse -File
    Write-Step $step "Bundled models found: $($modelFiles.Count) files" "Green"
    foreach ($f in $modelFiles) {
        $sizeMB = [math]::Round($f.Length / 1MB, 1)
        Write-Host "      - $($f.Directory.Name)/$($f.Name) ($sizeMB MB)" -ForegroundColor Gray
    }
} else {
    Write-Step $step "WARNING: bundled-models directory not found!" "Red"
}

# Step 4: Find executable
$step++
$exePath = Get-ChildItem $TestDir -Recurse -Filter "*.exe" -ErrorAction SilentlyContinue | 
    Where-Object { $_.Name -like "*MangaTrans*" -or $_.Name -like "*mangatrans*" } | 
    Select-Object -First 1

if ($exePath) {
    Write-Step $step "Executable found: $($exePath.Name)" "Green"
} else {
    Write-Step $step "ERROR: Executable not found!" "Red"
    exit 1
}

# Summary
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Test Environment Ready" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "To start the application:" -ForegroundColor White
Write-Host "  $($exePath.FullName)" -ForegroundColor Yellow
Write-Host ""
Write-Host "Debug shortcuts (in app):" -ForegroundColor White
Write-Host "  F12 / Ctrl+Shift+I  - Open DevTools" -ForegroundColor Gray
Write-Host "  Ctrl+Shift+R        - Force reload" -ForegroundColor Gray
Write-Host ""
Write-Host "Log locations:" -ForegroundColor White
Write-Host "  Backend: $USER_DATA_PATH\data\logs\" -ForegroundColor Gray
Write-Host ""

if ($OpenLogsDir) {
    $logsDir = "$USER_DATA_PATH\data\logs"
    if (-not (Test-Path $logsDir)) {
        New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
    }
    explorer.exe $logsDir
}

# Test checklist
Write-Host "Test Checklist:" -ForegroundColor Cyan
Write-Host "  [ ] App starts within 8 seconds" -ForegroundColor White
Write-Host "  [ ] No Python errors in console" -ForegroundColor White
Write-Host "  [ ] Models copied to userData (check logs)" -ForegroundColor White
Write-Host "  [ ] Import image works" -ForegroundColor White
Write-Host "  [ ] Detection works (offline)" -ForegroundColor White
Write-Host "  [ ] OCR works (offline)" -ForegroundColor White
Write-Host "  [ ] Inpaint works (offline)" -ForegroundColor White
Write-Host "  [ ] Translation works (DeepSeek, requires network)" -ForegroundColor White
Write-Host ""

# Ask to launch
$launch = Read-Host "Launch application now? (Y/n)"
if ($launch -ne "n" -and $launch -ne "N") {
    Write-Host "Starting application..." -ForegroundColor Green
    Start-Process $exePath.FullName
}
