#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION=$(sed -nE "s/^[[:space:]]*versionName '([0-9]+\.[0-9]+\.[0-9]+)'/\1/p" app/build.gradle)
CONFIG=$(node -e "console.log(require('./app/src/main/assets/www/app-config.json').version)")
test "$VERSION" = "$CONFIG" || { echo "Version mismatch: gradle=$VERSION json=$CONFIG"; exit 1; }
echo "Nhac version: $VERSION -> NHAC-V${VERSION}.apk"
