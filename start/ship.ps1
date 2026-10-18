<#
.SYNOPSIS
    WaveLink Shipping Tool - Tu dong tao nhanh moi, commit va push code len GitHub.
    Sau do CI/CD se tu dong kiem dinh, merge vao main roi moi build Docker.
.EXAMPLE
    .\start\ship.ps1 -m "fix: cap nhat giao dien am nhac"
    .\start\ship.ps1 "feat: them tinh nang playlist"
#>
param (
    [Parameter(Position=0)]
    [string]$Message,
    [string]$Branch
)

$ErrorActionPreference = "Stop"

# Chuyen ve thu muc goc repo
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

# 1. Kiem tra thay doi file
$status = git status --porcelain
if (-not $status) {
    Write-Host "[INFO] Khong co thay doi nao trong ma nguon de push." -ForegroundColor Yellow
    exit 0
}

# 2. Xac dinh commit message
if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = Read-Host "Nhap noi dung commit (vi du: 'cap nhat giao dien')"
    if ([string]::IsNullOrWhiteSpace($Message)) {
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $Message = "chore: update code $timestamp"
    }
}

# 3. Kiem tra va tao nhanh moi neu dang o 'main'
$currentBranch = (git branch --show-current).Trim()

if ([string]::IsNullOrWhiteSpace($Branch)) {
    if ($currentBranch -eq "main") {
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $targetBranch = "auto/patch-$timestamp"
        Write-Host "[*] Nhanh 'main' dang duoc bao ve (Protected Branch)." -ForegroundColor Cyan
        Write-Host "[*] Tu dong tao nhanh moi de push: $targetBranch" -ForegroundColor Yellow
        git checkout -b $targetBranch
    } else {
        $targetBranch = $currentBranch
    }
} else {
    $targetBranch = $Branch
    git checkout -b $targetBranch 2>$null
    if ($LASTEXITCODE -ne 0) {
        git checkout $targetBranch
    }
}

# 4. Git add & commit
Write-Host "[*] Dang stage toan bo thay doi..." -ForegroundColor Cyan
git add -A

Write-Host "[*] Dang tao commit: '$Message'..." -ForegroundColor Cyan
git commit -m "$Message"

# 5. Git push
Write-Host "[*] Dang day code len GitHub nhánh '$targetBranch'..." -ForegroundColor Cyan
git push -u origin $targetBranch

Write-Host ""
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host "  THANH CONG! Code da duoc day len nhanh: $targetBranch" -ForegroundColor Green
Write-Host "  Quy trinh CI/CD tren GitHub Actions se tu dong chay:" -ForegroundColor Cyan
Write-Host "  1. [Kiem dinh]: Chay Go Test & Lint + React Vitest & Vite Build" -ForegroundColor White
Write-Host "  2. [Auto-Merge]: Tu dong merge vao nhanh 'main' khi kiem dinh thanh cong" -ForegroundColor White
Write-Host "  3. [Docker Build]: Build Docker Backend & Frontend roi day len GHCR" -ForegroundColor White
Write-Host "==========================================================================" -ForegroundColor Green
