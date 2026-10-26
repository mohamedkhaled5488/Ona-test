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

mkdir -p maestro-reports maestro-screens maestro-debug

# The built app must carry no server key: search the JavaScript bundle that
# ships in the APK (Hermes bytecode keeps its strings readable) for actual
# keys, not words: a JWT whose payload has "role":"service_role" (in any of
# its three base64 alignments), a new-style secret key (sb_secret_ plus a key
# body), and service-key variable names. (supabase-js itself mentions
# "service_role" and "sb_secret_" in warnings: those aren't keys.)
# Hermes stores its strings back to back, so supabase-js's own 'sb_secret_'
# prefix check can run straight into the next string, e.g. the helper
# "__rewriteRelativeImportExtension" (and on into whatever strings follow,
# which change from build to build). A body that starts with "_" and has no
# digit is that, not a key: a random key body almost always has a digit and
# rarely starts with "_" (both: about 1 in 10,000). Only the kind of hit is
# printed, never its characters: the log is public.
if unzip -p "$APK" assets/index.android.bundle > bundle.bin 2> /dev/null; then
  hits=$(grep -a -o -E 'eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*(InJvbGUiOiJzZXJ2aWNlX3JvbGUi|cm9sZSI6InNlcnZpY2Vfcm9sZS|yb2xlIjoic2VydmljZV9yb2xlI)[A-Za-z0-9_-]*|sb_secret_[A-Za-z0-9_-]{20,}|SUPABASE_SERVICE[A-Z_]*' bundle.bin \
    | grep -v -E '^sb_secret__[^0-9]*$' \
    | sed -E 's/^eyJ.*/a service_role JWT/; s/^sb_secret_.*/an sb_secret_ key/; s/^SUPABASE_SERVICE.*/a SUPABASE_SERVICE variable name/' | sort | uniq -c)
  rm -f bundle.bin
  if [ -n "$hits" ]; then
    echo "::error title=Server key in the app bundle::$(echo "$hits" | tr '\n' ';')"
    exit 1
  fi
  echo "Bundle scan: no server key in the APK's JavaScript"
else
  echo "::error title=Bundle scan::Couldn't read assets/index.android.bundle from the APK"
  exit 1
fi

# A freshly booted emulator is busy for a while (the launcher has stopped
# responding on CI right after boot, covering the first flow's screen):
# wait for boot, unlock, close any system dialog, and give it a moment.
adb wait-for-device
until [ "$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; do sleep 2; done
adb shell input keyevent 82 > /dev/null 2>&1
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS > /dev/null 2>&1
sleep 20
adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS > /dev/null 2>&1

# Android's own record of a failed try: the crash buffer and recent errors
# (maestro-reports/<name>-android.txt), and a warning naming any crash or
# "isn't responding" of Ona's, so the run's summary says why.
PKG=app.ona
save_android_log() {
  { echo "--- crash buffer"; adb logcat -d -b crash 2>/dev/null; echo "--- errors"; adb logcat -d '*:E' 2>/dev/null | tail -300; } > "maestro-reports/$1-android.txt"
  if grep -qE "FATAL EXCEPTION|Process: $PKG" "maestro-reports/$1-android.txt"; then
    echo "::warning title=Ona crashed during $1::See maestro-reports/$1-android.txt in the run's artifact."
  fi
  if adb logcat -d 2>/dev/null | grep -qE "ANR in $PKG"; then
    echo "::warning title=Ona stopped responding during $1::See maestro-reports/$1-android.txt in the run's artifact."
  fi
}

run_flow() {
  adb logcat -c > /dev/null 2>&1
  maestro test --format junit --output "maestro-reports/$1.xml" --debug-output "maestro-debug/$1" "$2" 2>&1 | tee "maestro-reports/$1.log"
  return "${PIPESTATUS[0]}"
}

failed=0
# SLEEP_ONLY=1 (a dispatch building an older app): just the Sleep timer check.
for flow in $([ "${SLEEP_ONLY:-0}" = "1" ] || ls .maestro/*.yaml); do
  name=$(basename "$flow" .yaml)
  [ "$name" = "config" ] && continue
  grep -qE '^\s+- needs-backend' "$flow" && continue # needs the local stack
  echo "=== $name"
  if ! run_flow "$name" "$flow"; then
    # Once more, after closing any system dialog. Passing the second time is
    # reported as unstable (an annotation), never hidden.
    adb shell uiautomator dump /sdcard/ona-screen.xml > /dev/null 2>&1 && adb pull /sdcard/ona-screen.xml "maestro-screens/$name-first-try.xml" > /dev/null 2>&1
    save_android_log "$name-first-try"
    adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS > /dev/null 2>&1
    echo "=== $name (second try)"
    if run_flow "$name" "$flow"; then
      echo "::warning title=E2E flow $name passed only on the second try::The first try failed; see maestro-screens/$name-first-try.xml and maestro-debug/$name in the run's artifact."
      continue
    fi
    failed=$((failed + 1))
    adb shell uiautomator dump /sdcard/ona-screen.xml > /dev/null 2>&1 && adb pull /sdcard/ona-screen.xml "maestro-screens/$name.xml" > /dev/null 2>&1
    save_android_log "$name"
    python3 scripts/e2e-annotate.py --flow "$name" "maestro-reports/$name.xml" "maestro-reports/$name.log" "maestro-screens/$name.xml"
  fi
done

# The Sleep timer against Android's own view of what's playing.
echo "=== sleep timer (dumpsys audio)"
bash scripts/e2e-sleep.sh || failed=$((failed + 1))

echo "$failed flow(s) failed"
[ "$failed" -eq 0 ]
