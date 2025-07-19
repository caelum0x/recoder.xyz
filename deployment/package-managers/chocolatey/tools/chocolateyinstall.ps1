# CodeCraft CLI - Chocolatey Installation Script
$ErrorActionPreference = 'Stop'

$packageName = 'codecraft'
$toolsDir = "$(Split-Path -parent $MyInvocation.MyCommand.Definition)"
$packageVersion = $env:ChocolateyPackageVersion
$url64 = "https://github.com/recoder-team/recoder/releases/download/v$packageVersion/CodeCraft-CLI-Setup-$packageVersion-x64.exe"
$url32 = "https://github.com/recoder-team/recoder/releases/download/v$packageVersion/CodeCraft-CLI-Setup-$packageVersion-ia32.exe"

# Package parameters
$packageArgs = @{
  packageName   = $packageName
  unzipLocation = $toolsDir
  fileType      = 'exe'
  url           = $url32
  url64bit      = $url64
  
  # Silent installation parameters
  silentArgs    = '/S /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /CLOSEAPPLICATIONS /RESTARTAPPLICATIONS'
  validExitCodes= @(0, 3010, 1641)
  
  # Checksums (will be updated automatically by the update script)
  checksum      = 'PLACEHOLDER_CHECKSUM_32'
  checksumType  = 'sha256'
  checksum64    = 'PLACEHOLDER_CHECKSUM_64'
  checksumType64= 'sha256'
}

# Pre-installation checks
Write-Host "Installing CodeCraft CLI v$packageVersion..." -ForegroundColor Green

# Check if Node.js is available
try {
  $nodeVersion = & node --version 2>$null
  if ($nodeVersion) {
    Write-Host "✓ Node.js detected: $nodeVersion" -ForegroundColor Green
  }
} catch {
  Write-Warning "Node.js not detected. CodeCraft CLI requires Node.js 18+ to function properly."
  Write-Host "Node.js will be installed automatically as a dependency." -ForegroundColor Yellow
}

# Check PowerShell version
$psVersion = $PSVersionTable.PSVersion
if ($psVersion.Major -lt 5) {
  Write-Warning "PowerShell $($psVersion.Major).$($psVersion.Minor) detected. PowerShell 5.1+ is recommended for the best experience."
}

# Install the package
Install-ChocolateyPackage @packageArgs

# Post-installation validation
Write-Host "Validating installation..." -ForegroundColor Yellow

# Wait a moment for the installation to complete
Start-Sleep -Seconds 3

# Check if CodeCraft CLI is accessible
try {
  $codeCraftVersion = & codecraft --version 2>$null
  if ($codeCraftVersion) {
    Write-Host "✓ Installation successful! CodeCraft CLI version: $codeCraftVersion" -ForegroundColor Green
  } else {
    throw "CodeCraft CLI not found in PATH"
  }
} catch {
  Write-Warning "CodeCraft CLI may not be immediately available in your current session."
  Write-Host "Please restart your command prompt or PowerShell session." -ForegroundColor Yellow
}

# Environment setup
Write-Host "Setting up environment..." -ForegroundColor Yellow

# Create user configuration directory
$configDir = "$env:USERPROFILE\.codecraft"
if (!(Test-Path $configDir)) {
  New-Item -ItemType Directory -Path $configDir -Force | Out-Null
  Write-Host "✓ Created configuration directory: $configDir" -ForegroundColor Green
}

# Create default configuration
$defaultConfig = @{
  version = $packageVersion
  installedBy = "chocolatey"
  installedAt = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
  autoUpdate = $false
  analytics = $false
  telemetry = $false
} | ConvertTo-Json -Depth 10

$configFile = "$configDir\config.json"
if (!(Test-Path $configFile)) {
  $defaultConfig | Out-File -FilePath $configFile -Encoding UTF8
  Write-Host "✓ Created default configuration" -ForegroundColor Green
}

# Add to PowerShell profile for enhanced experience (optional)
try {
  $profilePath = $PROFILE.CurrentUserAllHosts
  if (Test-Path $profilePath) {
    $profileContent = Get-Content $profilePath -Raw
    if ($profileContent -notmatch "codecraft") {
      Write-Host "Adding CodeCraft CLI helpers to PowerShell profile..." -ForegroundColor Yellow
      
      $codecraftHelpers = @"

# CodeCraft CLI Helpers (added by Chocolatey installation)
if (Get-Command codecraft -ErrorAction SilentlyContinue) {
  # Create aliases
  Set-Alias -Name cc -Value codecraft -Description "Short alias for CodeCraft CLI"
  
  # Auto-completion support (if available)
  if (Test-Path "$env:USERPROFILE\.codecraft\completions\codecraft.ps1") {
    . "$env:USERPROFILE\.codecraft\completions\codecraft.ps1"
  }
}
"@
      
      Add-Content -Path $profilePath -Value $codecraftHelpers
      Write-Host "✓ Added CodeCraft CLI helpers to PowerShell profile" -ForegroundColor Green
    }
  }
} catch {
  Write-Host "Could not update PowerShell profile (this is optional)" -ForegroundColor Yellow
}

# Final instructions
Write-Host ""
Write-Host "🎉 CodeCraft CLI has been successfully installed!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Restart your command prompt or PowerShell" -ForegroundColor White
Write-Host "  2. Run 'codecraft --version' to verify installation" -ForegroundColor White
Write-Host "  3. Run 'codecraft --help' to see available commands" -ForegroundColor White
Write-Host "  4. Visit https://codecraft.dev/docs for documentation" -ForegroundColor White
Write-Host ""
Write-Host "Quick start:" -ForegroundColor Cyan
Write-Host "  codecraft generate 'a React component for user login'" -ForegroundColor Yellow
Write-Host ""

# Check for updates notification
try {
  $latestVersion = (Invoke-RestMethod -Uri "https://api.github.com/repos/recoder-team/recoder/releases/latest" -ErrorAction SilentlyContinue).tag_name
  if ($latestVersion -and $latestVersion -ne "v$packageVersion") {
    Write-Host "Note: A newer version ($latestVersion) may be available." -ForegroundColor Yellow
    Write-Host "Run 'choco upgrade codecraft' to update." -ForegroundColor Yellow
  }
} catch {
  # Ignore network errors
}

Write-Host "Installation completed successfully! 🚀" -ForegroundColor Green