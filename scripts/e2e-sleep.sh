#!/usr/bin/env bash
# The Sleep timer on a real Android system (CI emulator): start white noise
# with a 1-minute timer, then lock / background / swipe Ona away / take a
# call / add a sound / leave the Sleep screen, wait past the end, and ask
# Android itself: is anything of Ona's still playing (dumpsys audio), is a
# media session of Ona's still PLAYING, is its media notification still
# shown (dumpsys media_session, notification)?
#
# A case passes only if its own step worked, the sound really played
# mid-timer, and nothing plays or shows after the end. If Android reports no
# playback even mid-timer, the case is "inconclusive", and the run fails.
# expo-audio leaves an idle media session registered after a player is
# removed (state NONE, no notification, nothing playing): noted, not failed.
# Results: maestro-reports/sleep-dumpsys.txt, Android's raw output per case
# in maestro-reports/sleep-dumpsys/, and annotations.
# OLD_APP=1 (a build from before the fix, which only offers 15 min): only
# the "leave the Sleep screen" case, waiting 16 minutes.
set -uo pipefail

PKG=app.ona
OUT=maestro-reports/sleep-dumpsys.txt
mkdir -p maestro-reports/sleep-dumpsys
: > "$OUT"
TIMER_S=60
CASES="lock background swipe call addlayer leave"
if [ "${OLD_APP:-0}" = "1" ]; then TIMER_S=900; CASES="leave"; fi

# Ona's playback lines read "u/pid:<uid>/<pid> state:started": matched by
# Ona's process id (dumpsys package names the uid differently across
# Android versions: userId= or appId=).
playing() { local p; p=$(adb shell pidof "$PKG" | tr -d '\r' | awk '{print $1}'); [ -n "$p" ] && adb shell dumpsys audio | tr -d '\r' | grep -E "u/pid:[0-9]+/$p " | grep -q "state:started"; }
session_playing() { adb shell dumpsys media_session | tr -d '\r' | grep -A12 "package=$PKG" | grep -q "state=PlaybackState {state=PLAYING"; }
session_registered() { adb shell dumpsys media_session | tr -d '\r' | grep -q "package=$PKG"; }
media_notification() { adb shell dumpsys notification --noredact | tr -d '\r' | grep -A12 "pkg=$PKG" | grep -qi "MediaStyle\|mediaSession\|category=transport"; }
note() { echo "$1" | tee -a "$OUT"; }
snap() { for s in audio media_session; do adb shell dumpsys "$s" > "maestro-reports/sleep-dumpsys/$1-$2-$s.txt" 2>&1; done; adb shell dumpsys notification --noredact > "maestro-reports/sleep-dumpsys/$1-$2-notification.txt" 2>&1; }

adb shell svc power stayon true > /dev/null 2>&1
failed=0
for c in $CASES; do
  echo "=== sleep timer: $c"
  if ! maestro test .maestro/subflows/sleep-start.yaml > "maestro-reports/sleep-$c.log" 2>&1; then
    note "FAIL $c: couldn't start the sound (see maestro-reports/sleep-$c.log)"; failed=$((failed + 1)); continue
  fi
  start=$(date +%s)
  acted="yes"
  case "$c" in
    lock) adb shell input keyevent KEYCODE_HOME; adb shell input keyevent KEYCODE_SLEEP ;;
    background) adb shell input keyevent KEYCODE_HOME ;;
    swipe)
      adb shell input keyevent KEYCODE_APP_SWITCH; sleep 3
      adb shell input swipe 540 1500 540 200 200; sleep 2
      adb shell input keyevent KEYCODE_HOME ;;
    call) adb emu gsm call 5551234 > /dev/null 2>&1; sleep 8; adb emu gsm cancel 5551234 > /dev/null 2>&1 ;;
    addlayer) maestro test .maestro/subflows/sleep-add-layer.yaml >> "maestro-reports/sleep-$c.log" 2>&1 || acted="no" ;;
    leave) maestro test .maestro/subflows/sleep-leave.yaml >> "maestro-reports/sleep-$c.log" 2>&1 || acted="no" ;; # Back to Reflect: Ona open, Sleep gone
  esac
  sleep 15
  snap "$c" mid
  mid="playing"; playing || mid="silent"
  swiped=""
  if [ "$c" = "swipe" ] && adb shell dumpsys activity recents | tr -d '\r' | grep -q "$PKG"; then swiped="(the task was still in recents: the swipe may not have worked)"; fi
  # Past the end (plus the fade and a margin).
  left=$(( start + TIMER_S + 40 - $(date +%s) )); [ "$left" -gt 0 ] && sleep "$left"
  snap "$c" after
  after="silent"; playing && after="PLAYING"
  sess="not playing"; session_playing && sess="STILL PLAYING"
  notif="gone"; media_notification && notif="STILL SHOWN"
  idle=""; [ "$sess" = "not playing" ] && session_registered && idle="(note: an idle media session is still registered: known limitation, accepted 2026-10-25)"
  # After a swipe-away even the idle session must be gone (Ona's service
  # stops with its task).
  if [ "$c" = "swipe" ] && session_registered; then sess="STILL REGISTERED after the swipe"; idle=""; fi
  adb shell input keyevent KEYCODE_WAKEUP > /dev/null 2>&1; adb shell wm dismiss-keyguard > /dev/null 2>&1
  if [ "$acted" = "no" ]; then
    note "FAIL $c: the step itself failed (see maestro-reports/sleep-$c.log)"
    echo "::error title=Sleep timer ($c)::The step itself failed"
    failed=$((failed + 1))
  elif [ "$mid" = "silent" ] && [ "$after" = "silent" ]; then
    note "INCONCLUSIVE $c: no playback reported even mid-timer $swiped"
  elif [ "$after" = "silent" ] && [ "$sess" = "not playing" ] && [ "$notif" = "gone" ]; then
    note "PASS $c: playing mid-timer ($mid); after the end: audio $after, media session $sess, notification $notif $swiped $idle"
  else
    note "FAIL $c: mid-timer $mid; after the end: audio $after, media session $sess, notification $notif $swiped"
    echo "::error title=Sleep timer ($c)::After the timer: audio $after, media session $sess, notification $notif"
    failed=$((failed + 1))
  fi
  adb shell am force-stop "$PKG" > /dev/null 2>&1
done
# Inconclusive isn't a pass: a green run means every case was verified.
inconclusive=$(grep -c "^INCONCLUSIVE" "$OUT")
[ "$inconclusive" -gt 0 ] && echo "::error title=Sleep timer::$inconclusive case(s) saw no playback at all; see sleep-dumpsys.txt"
echo "sleep timer: $failed case(s) failed, $inconclusive inconclusive"
[ "$failed" -eq 0 ] && [ "$inconclusive" -eq 0 ]
