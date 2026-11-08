#!/usr/bin/env bash
# This repo can run with an installed Gradle 8.11.1, or bootstrap it on first build.
set -euo pipefail
cd "$(dirname "$0")"
if command -v gradle >/dev/null 2>&1; then exec gradle "$@"; fi
ROOT="${GRADLE_USER_HOME:-$HOME/.gradle}/nhac-bootstrap"
EXE="$ROOT/gradle-8.11.1/bin/gradle"
if [ ! -x "$EXE" ]; then
  mkdir -p "$ROOT"
  echo 'Gradle 8.11.1 not installed. Downloading it once (requires Internet)...'
  curl -fL --retry 2 'https://services.gradle.org/distributions/gradle-8.11.1-bin.zip' -o "$ROOT/gradle.zip"
  unzip -q -o "$ROOT/gradle.zip" -d "$ROOT"
  rm -f "$ROOT/gradle.zip"
fi
exec "$EXE" "$@"
