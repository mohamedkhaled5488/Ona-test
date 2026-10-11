import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { PrimaryButton } from './PrimaryButton';
import { Caption, Eyebrow } from './Typography';
import { colors, radii, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';

const PHASE_MS = 4000; // 4s in, 4s out — a simple, well-tolerated box-breathing pace
const TOTAL_MS = 30000;

// A small, optional 30-second guided breathing circle — something to actually
// do on the result screen, not just a line of text suggesting you breathe.
export function BreathingExercise({ accent }: { accent: string }) {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<'in' | 'out'>('in');
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_MS / 1000);
  const scale = useRef(new Animated.Value(0.6)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = () => {
    setRunning(true);
    setSecondsLeft(TOTAL_MS / 1000);
    setPhase('in');
    scale.setValue(0.6);

    const cycle = Animated.sequence([
      Animated.timing(scale, { toValue: 1, duration: PHASE_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 0.6, duration: PHASE_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]);
    loopRef.current = Animated.loop(cycle);
    loopRef.current.start();

    let elapsed = 0;
    timerRef.current = setInterval(() => {
      elapsed += 500;
      setPhase(Math.floor(elapsed / PHASE_MS) % 2 === 0 ? 'in' : 'out');
      setSecondsLeft(Math.max(0, Math.round((TOTAL_MS - elapsed) / 1000)));
      if (elapsed >= TOTAL_MS) stop();
    }, 500);
  };

  const stop = () => {
    setRunning(false);
    loopRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  };

  useEffect(() => () => stop(), []);

  return (
    <View style={styles.wrap}>
      <Eyebrow>30-second breathing</Eyebrow>
      {running ? (
        <>
          <View style={styles.circleWrap}>
            <Animated.View style={[styles.circle, { backgroundColor: accent, transform: [{ scale }] }]} />
            <Caption style={styles.phaseLabel}>{phase === 'in' ? 'Breathe in' : 'Breathe out'}</Caption>
          </View>
          <Caption>{secondsLeft}s left</Caption>
          <PrimaryButton label="Stop" variant="outline" onPress={stop} />
        </>
      ) : (
        <PrimaryButton label="Start breathing" onPress={start} />
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  wrap: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  circleWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: radii.full,
    opacity: 0.35,
  },
  phaseLabel: {
    color: colors.ink,
  },
}));
