param(
  [ValidateSet('health', 'smoke', 'authentication', 'baseline', 'progressive', 'target', 'stress', 'soak', 'all')]
  [string]$Suite = 'smoke'
)

$ErrorActionPreference = 'Stop'
$k6Command = Get-Command k6 -ErrorAction SilentlyContinue
$k6Executable = if ($k6Command) { $k6Command.Source } else { Join-Path $env:ProgramFiles 'k6\k6.exe' }
if (-not (Test-Path $k6Executable)) {
  throw 'k6 is not installed or is not available on PATH.'
}

$suiteOrder = @('health', 'smoke', 'authentication', 'baseline', 'progressive', 'target', 'stress', 'soak')
$scriptEnvironment = @(
  'K6_ENV',
  'BASE_URL',
  'API_BASE_URL',
  'K6_USERS_FILE',
  'TARGET_VUS',
  'TEST_DURATION',
  'K6_STRESS_VUS',
  'K6_ROLE',
  'ALLOW_STAGING_TESTS',
  'PRODUCTION_AUTHORIZATION'
)
if ($Suite -eq 'all') {
  $selectedSuites = $suiteOrder
} else {
  $selectedSuites = @($Suite)
}

$resultsPath = Join-Path $PSScriptRoot 'results'
New-Item -ItemType Directory -Path $resultsPath -Force | Out-Null
$repositoryRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Push-Location $repositoryRoot
try {
  foreach ($scenario in $selectedSuites) {
    $arguments = @('run')
    foreach ($name in $scriptEnvironment) {
      $variable = Get-Item "Env:$name" -ErrorAction SilentlyContinue
      if ($variable) {
        $arguments += @('-e', "$name=$($variable.Value)")
      }
    }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $streamPath = Join-Path $resultsPath "$scenario-$stamp.ndjson"
    $arguments += @('--out', "json=$streamPath")
    $arguments += (Join-Path $PSScriptRoot "scenarios\$scenario.js")

    Write-Host "Running k6 scenario: $scenario"
    & $k6Executable @arguments
    if ($LASTEXITCODE -ne 0) {
      throw "k6 scenario '$scenario' failed with exit code $LASTEXITCODE. Remaining scenarios were not started."
    }
  }
} finally {
  Pop-Location
}
