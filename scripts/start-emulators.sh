#!/usr/bin/env bash
# Start Firebase Emulator Suite and persist data to ./firebase-emulator/seed
# Usage: sh scripts/start-emulators.sh
set -e
cd "$(dirname "$0")/../firebase-emulator"
echo "Starting Firebase emulators with import/export to ./seed..."
firebase emulators:start --import=./seed --export-on-exit=./seed
