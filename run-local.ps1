$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverDir = Join-Path $projectRoot 'server'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js is required. Install Node.js 16 or newer and try again.'
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm is required. Install npm with Node.js and try again.'
}

Write-Host "Node.js: $(& node --version)"
Write-Host 'Starting Cyethack HR Portal locally...'
Write-Host 'The portal and API will be available at http://localhost:5000'
Write-Host 'Press Ctrl+C to stop the application.'

Push-Location $serverDir
try {
    if (-not (Test-Path 'node_modules') -or -not (Test-Path 'node_modules/.bin/mongodb-memory-server.cmd')) {
        Write-Host 'Installing server dependencies...'
        & npm install
    }

    & npm run dev:mem
}
finally {
    Pop-Location
}