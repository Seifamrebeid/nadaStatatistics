# Start Firebase Emulator Suite and persist data between runs.
# Usage: PowerShell: .\scripts\start-emulators.ps1

Set-Location -Path "$PSScriptRoot/..\firebase-emulator"

# Prefer the richer demo snapshot when it exists. It includes the seeded
# doctor accounts used by the doctor portal login screen.
$dataDir = "seed-fresh"

if (-not (Test-Path -Path "./$dataDir" -PathType Container)) {
	$dataDir = "seed"
}

# Backward compatibility: if ./seed does not exist but legacy exports do,
# reuse the most recent legacy export folder so old data is imported.
if (-not (Test-Path -Path "./$dataDir" -PathType Container)) {
	$legacyExport = Get-ChildItem -Directory -Filter "firebase-export-*" |
		Sort-Object LastWriteTime -Descending |
		Select-Object -First 1

	if ($null -ne $legacyExport) {
		$dataDir = $legacyExport.Name
	}
}

if (-not (Test-Path -Path "./$dataDir" -PathType Container)) {
	New-Item -ItemType Directory -Path "./$dataDir" | Out-Null
}

Write-Host "Starting Firebase emulators with import/export to ./$dataDir ..."
firebase emulators:start --import="./$dataDir" --export-on-exit="./$dataDir"
