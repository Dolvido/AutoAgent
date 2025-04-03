# Setup Ollama script for AutoCritic
# This script helps download the required Ollama models for AutoCritic

# Check if Ollama is running
function Test-OllamaRunning {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:11434/api/version" -Method Get -ErrorAction SilentlyContinue
        return $true
    }
    catch {
        return $false
    }
}

# Pull a model from Ollama
function Pull-OllamaModel {
    param (
        [string]$modelName
    )
    
    Write-Host "Pulling model $modelName. This may take some time..."
    
    try {
        Invoke-RestMethod -Uri "http://localhost:11434/api/pull" -Method POST -Body "{`"name`":`"$modelName`"}" -ContentType "application/json"
        Write-Host "Model $modelName successfully pulled!"
    }
    catch {
        Write-Host "Error pulling model $modelName: $_" -ForegroundColor Red
    }
}

# Main script
Write-Host "AutoCritic Ollama Setup" -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan
Write-Host "This script will help you set up the required models for AutoCritic."
Write-Host ""

# Check if Ollama is running
if (-not (Test-OllamaRunning)) {
    Write-Host "Ollama is not running! Please start Ollama and run this script again." -ForegroundColor Red
    Write-Host "You can download Ollama from https://ollama.ai/download" -ForegroundColor Yellow
    exit 1
}

Write-Host "Ollama is running!" -ForegroundColor Green
Write-Host ""

# List of models we need
$models = @(
    "codellama", # For code critique generation
    "llama3",    # For embeddings and meta-agent
    "mistral"    # As a backup option
)

foreach ($model in $models) {
    Write-Host "Do you want to download the $model model? (y/n)" -ForegroundColor Yellow
    $response = Read-Host
    
    if ($response.ToLower() -eq "y") {
        Pull-OllamaModel -modelName $model
    }
    else {
        Write-Host "Skipping $model download." -ForegroundColor Yellow
    }
    
    Write-Host ""
}

Write-Host "Setup complete!" -ForegroundColor Green
Write-Host "You can now run AutoCritic with 'npm run dev'" -ForegroundColor Cyan 