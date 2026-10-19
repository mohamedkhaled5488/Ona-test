#!/usr/bin/env bash
# Runs inside the Android emulator job (.github/workflows/e2e-android.yml):
# installs the APK, then runs each Maestro flow that needs no server, one at
# a time. When a flow fails, the text on the emulator's screen at that moment
# is saved, and what failed is published as GitHub annotations, which anyone
# can read on the run page without downloading the logs.
set -uo pipefail

APK=android/app/build/outputs/apk/release/app-release.apk
if ! adb install -r "$APK" > install.log 2>&1; then
  python3 scripts/e2e-annotate.py --install install.log
  exit 1
fi

mkdir -p maestro-reports maestro-screens
failed=0
for flow in .maestro/*.yaml; do
  name=$(basename "$flow" .yaml)
  [ "$name" = "config" ] && continue
  grep -qE '^\s+- needs-backend' "$flow" && continue # needs the local stack
  echo "=== $name"
  maestro test --format junit --output "maestro-reports/$name.xml" --debug-output "maestro-debug/$name" "$flow" 2>&1 | tee "maestro-reports/$name.log"
  if [ "${PIPESTATUS[0]}" -ne 0 ]; then
    failed=$((failed + 1))
    adb shell uiautomator dump /sdcard/ona-screen.xml > /dev/null 2>&1 && adb pull /sdcard/ona-screen.xml "maestro-screens/$name.xml" > /dev/null 2>&1
    python3 scripts/e2e-annotate.py --flow "$name" "maestro-reports/$name.xml" "maestro-reports/$name.log" "maestro-screens/$name.xml"
  fi
done

echo "$failed flow(s) failed"
[ "$failed" -eq 0 ]
