#!/usr/bin/env bash
# The Sleep timer on a real Android system (CI emulator): start white noise
# with a 1-minute timer, then lock / background / swipe Ona away / take a
# call / add a sound / leave the Sleep screen, wait past the end, and ask
# Android itself: is anything of Ona's still playing (dumpsys audio), is its
# media session or notification still there (dumpsys media_session)?
#
# Each case first checks that the sound really plays mid-timer: if the
# emulator reports no playback at all, the case is "inconclusive", never a
# pass. Results: maestro-reports/sleep-dumpsys.txt, and annotations.
# OLD_APP=1 (a build from before the fix, which only offers 15 min): only
# the "leave the Sleep screen" case, waiting 16 minutes.
set -uo pipefail

PKG=app.ona
OUT=maestro-reports/sleep-dumpsys.txt
mkdir -p maestro-reports
: > "$OUT"
TIMER_S=60
CASES="lock background swipe call addlayer leave"
if [ "${OLD_APP:-0}" = "1" ]; then TIMER_S=900; CASES="leave"; fi

uid() { adb shell pm list packages -U "$PKG" | sed -n 's/.*uid:\([0-9]*\).*/\1/p' | tr -d '\r' | head -1; }
playing() { adb shell dumpsys audio | tr -d '\r' | grep "u/pid:$(uid)/" | grep -q "state:started"; }
media_session() { adb shell dumpsys media_session | tr -d '\r' | grep -A6 "package=$PKG" | grep -q "active=true"; }
media_notification() { adb shell dumpsys notification --noredact | tr -d '\r' | grep -A12 "pkg=$PKG" | grep -qi "MediaStyle\|mediaSession\|category=transport"; }
note() { echo "$1" | tee -a "$OUT"; }

adb shell svc power stayon true > /dev/null 2>&1
failed=0
for c in $CASES; do
  echo "=== sleep timer: $c"
  if ! maestro test .maestro/subflows/sleep-start.yaml > "maestro-reports/sleep-$c.log" 2>&1; then
    note "FAIL $c: couldn't start the sound (see maestro-reports/sleep-$c.log)"; failed=$((failed + 1)); continue
  fi
  start=$(date +%s)
  case "$c" in
    lock) adb shell input keyevent KEYCODE_HOME; adb shell input keyevent KEYCODE_SLEEP ;;
    background) adb shell input keyevent KEYCODE_HOME ;;
    swipe)
      adb shell input keyevent KEYCODE_APP_SWITCH; sleep 3
      adb shell input swipe 540 1500 540 200 200; sleep 2
      adb shell input keyevent KEYCODE_HOME ;;
    call) adb emu gsm call 5551234 > /dev/null 2>&1; sleep 8; adb emu gsm cancel 5551234 > /dev/null 2>&1 ;;
    addlayer) maestro test .maestro/subflows/sleep-add-layer.yaml >> "maestro-reports/sleep-$c.log" 2>&1 ;;
    leave) adb shell input keyevent KEYCODE_BACK ;; # out of Sleep, Ona still open
  esac
  sleep 15
  mid="playing"; playing || mid="silent"
  if [ "$c" = "swipe" ] && adb shell dumpsys activity recents | tr -d '\r' | grep -q "A=.*$PKG\|$PKG/"; then swiped="(task still in recents)"; else swiped=""; fi
  # Past the end (plus the fade and a margin).
  left=$(( start + TIMER_S + 40 - $(date +%s) )); [ "$left" -gt 0 ] && sleep "$left"
  after="silent"; playing && after="PLAYING"
  sess="gone"; media_session && sess="STILL ACTIVE"
  notif="gone"; media_notification && notif="STILL SHOWN"
  adb shell input keyevent KEYCODE_WAKEUP > /dev/null 2>&1; adb shell wm dismiss-keyguard > /dev/null 2>&1
  if [ "$mid" = "silent" ] && [ "$after" = "silent" ]; then
    note "INCONCLUSIVE $c: no playback reported even mid-timer $swiped"
  elif [ "$after" = "silent" ] && [ "$sess" = "gone" ] && [ "$notif" = "gone" ]; then
    note "PASS $c: playing mid-timer ($mid), after the end: audio $after, media session $sess, notification $notif $swiped"
  else
    note "FAIL $c: mid-timer $mid; after the end: audio $after, media session $sess, notification $notif $swiped"
    echo "::error title=Sleep timer ($c)::After the timer: audio $after, media session $sess, notification $notif"
    failed=$((failed + 1))
  fi
  adb shell am force-stop "$PKG" > /dev/null 2>&1
done
grep -q "^INCONCLUSIVE" "$OUT" && echo "::warning title=Sleep timer::Some cases saw no playback at all on this emulator; see sleep-dumpsys.txt"
echo "sleep timer: $failed case(s) failed"
[ "$failed" -eq 0 ]
