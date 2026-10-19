#!/usr/bin/env bash
# Runs inside the Android emulator job (.github/workflows/e2e-android.yml):
# installs the APK and runs the Maestro flows that need no server. On
# failure it publishes what failed as GitHub annotations, which anyone can
# read on the run page without downloading the logs.
set -uo pipefail

APK=android/app/build/outputs/apk/release/app-release.apk
if ! adb install -r "$APK" > install.log 2>&1; then
  python3 scripts/e2e-annotate.py --install install.log
  exit 1
fi

maestro test --exclude-tags needs-backend --format junit --output maestro-report.xml --debug-output maestro-debug .maestro 2>&1 | tee maestro.log
code=${PIPESTATUS[0]}
if [ "$code" -ne 0 ]; then
  python3 scripts/e2e-annotate.py maestro-report.xml maestro.log
fi
exit "$code"
