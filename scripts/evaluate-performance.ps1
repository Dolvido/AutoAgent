# AutoAgent Performance Evaluation Tool
# This script runs the TypeScript evaluation tool to analyze the performance of the critique agent

# Get the directory of the script
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

Write-Host "AutoAgent Performance Evaluation" -ForegroundColor Cyan
Write-Host "===============================" -ForegroundColor Cyan
Write-Host ""

# Check if ts-node is installed
try {
    $tsNodeVersion = npx ts-node --version 2>$null
    Write-Host "✓ ts-node is installed ($tsNodeVersion)" -ForegroundColor Green
} catch {
    Write-Host "✗ ts-node is not installed. Installing..." -ForegroundColor Yellow
    npm install -g ts-node typescript @types/node
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to install ts-node. Please install it manually with 'npm install -g ts-node typescript @types/node'" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ ts-node has been installed" -ForegroundColor Green
}

# Navigate to the project root
Set-Location $projectRoot

# Run the evaluation script
Write-Host "Running performance evaluation..." -ForegroundColor Cyan
npx ts-node scripts/evaluate-agent-performance.ts

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nPerformance evaluation failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit $LASTEXITCODE
} else {
    Write-Host "`nPerformance evaluation completed successfully" -ForegroundColor Green
}

# Offer option to save results to a file
$saveToFile = Read-Host "Would you like to save these results to a file? (y/n)"
if ($saveToFile -eq 'y') {
    $timestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
    $outputFile = "data/performance-reports/performance-report-$timestamp.txt"
    
    # Create directory if it doesn't exist
    $outputDir = Split-Path -Parent $outputFile
    if (-not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir | Out-Null
    }
    
    # Run the script again, but this time redirect output to a file
    Write-Host "Saving report to $outputFile..." -ForegroundColor Cyan
    npx ts-node scripts/evaluate-agent-performance.ts > $outputFile
    
    if (Test-Path $outputFile) {
        Write-Host "Report saved to $outputFile" -ForegroundColor Green
    } else {
        Write-Host "Failed to save report to $outputFile" -ForegroundColor Red
    }
}

Write-Host "`nDone!" -ForegroundColor Cyan 