param(
  [Parameter(Mandatory = $true)]
  [string]$Version,

  [Parameter(Mandatory = $true)]
  [string]$BundlePath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

$bundle = [IO.Path]::GetFullPath($BundlePath)
$output = [IO.Path]::GetFullPath($OutputPath)
if (-not (Test-Path (Join-Path $bundle 'bin/launcher.exe'))) {
  throw "Windows portable launcher is missing from: $bundle"
}

$sevenZip = (Get-Command '7z.exe' -ErrorAction Stop).Source
$sfxModule = Join-Path (Split-Path $sevenZip) '7z.sfx'
if (-not (Test-Path $sfxModule)) {
  throw "7-Zip SFX module is missing: $sfxModule"
}

$archive = Join-Path $env:RUNNER_TEMP "localdraw-$Version-portable.7z"
$config = Join-Path $env:RUNNER_TEMP "localdraw-$Version-portable-config.txt"
Remove-Item $archive -Force -ErrorAction SilentlyContinue
Remove-Item $output -Force -ErrorAction SilentlyContinue

Push-Location $bundle
try {
  & $sevenZip a -t7z -mx=9 $archive '*'
  if ($LASTEXITCODE -ne 0) {
    throw "7-Zip failed to create portable archive"
  }
} finally {
  Pop-Location
}

$sfxConfig = @"
;!@Install@!UTF-8!
Title="LocalDraw $Version Portable"
RunProgram="bin\\launcher.exe"
;!@InstallEnd@!
"@
[IO.File]::WriteAllText($config, $sfxConfig, [Text.UTF8Encoding]::new($false))

$outputStream = [IO.File]::Create($output)
try {
  foreach ($part in @($sfxModule, $config, $archive)) {
    $inputStream = [IO.File]::OpenRead($part)
    try {
      $inputStream.CopyTo($outputStream)
    } finally {
      $inputStream.Dispose()
    }
  }
} finally {
  $outputStream.Dispose()
}

if (-not (Test-Path $output) -or (Get-Item $output).Length -le (Get-Item $archive).Length) {
  throw "Failed to create single-file portable launcher: $output"
}

Write-Host "Created single-file portable Windows launcher: $output"
