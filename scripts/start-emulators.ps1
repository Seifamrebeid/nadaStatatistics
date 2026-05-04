# Start Firebase Emulator Suite and persist data to ./firebase-emulator/seed
# Usage: PowerShell:  ./scripts/start-emulators.ps1

Set-Location -Path "$PSScriptRoot/..\firebase-emulator"
Write-Host "Starting Firebase emulators with import/export to ./seed..."
firebase emulators:start --import=./seed --export-on-exit=./seed
