#!/usr/bin/env bash
# Start Firebase Emulator Suite and persist data between runs.
# Usage: sh scripts/start-emulators.sh
set -e

cd "$(dirname "$0")/../firebase-emulator"

data_dir="seed"

for port in 4000 8080 9099 9199 4400 4500; do
	if command -v lsof >/dev/null 2>&1 && lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
		echo "Firebase emulator ports are already in use (likely already running)."
		echo "Skipping start to avoid a duplicate instance."
		exit 0
	fi
done

# Backward compatibility: if ./seed is missing, reuse the newest
# legacy firebase-export-* folder so old data is imported.
if [ ! -d "./$data_dir" ]; then
	legacy_export="$(ls -dt ./firebase-export-* 2>/dev/null | head -n 1 || true)"
	if [ -n "$legacy_export" ]; then
		data_dir="${legacy_export#./}"
	fi
fi

if [ ! -d "./$data_dir" ]; then
	mkdir -p "./$data_dir"
fi

echo "Starting Firebase emulators with import/export to ./$data_dir ..."
firebase emulators:start --import="./$data_dir" --export-on-exit="./$data_dir"
