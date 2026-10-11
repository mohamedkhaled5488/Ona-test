import { useEffect, useRef, useState } from 'react';

// A plain count-up stopwatch — start/pause/resume/stop, elapsed seconds.
// Extracted from Skills' practice-session timer (SkillsScreen.tsx) so a new
// timed-session feature (Habits' optional "Start Session") can reuse the
// same stateful logic instead of re-implementing it inline again.
export function useStopwatch() {
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = () => {
    setRunning(true);
    setPaused(false);
    setElapsedSeconds(0);
    intervalRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
  };

  const togglePause = () => {
    if (paused) {
      setPaused(false);
      intervalRef.current = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    } else {
      setPaused(true);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  };

  const stop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
    setPaused(false);
  };

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  return { running, paused, elapsedSeconds, start, togglePause, stop };
}

export function formatClock(totalSeconds: number): string {
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}
