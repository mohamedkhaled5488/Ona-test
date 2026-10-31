import { useCallback, useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useUi } from '../components/UiProvider';

interface BackHandlerOptions {
  // True when the screen has unsaved text/content the user would lose by leaving.
  dirty?: boolean;
  // Commits the unsaved content. Called when the user picks "Save". Return
  // false to stay on the screen (e.g. a required field is empty, or the save
  // needs one more question answered first).
  onSave?: () => boolean | void;
  // For screens that switch between internal views (a game, a history tab, a song
  // editor...). When set, "back" steps out of that view instead of leaving the
  // screen, so back always goes exactly one step.
  stepBack?: () => void;
}

// One place that decides what "back" means for a screen: the header back
// button, the swipe gesture and the Android Back key alike (the app-wide rule
// is in docs/navigation.md).
// - Leaving a pushed screen fires "beforeRemove": an inner view steps back
//   first, unsaved changes are asked about.
// - The Android Back key also steps out of an inner view while the screen is
//   focused, also where nothing can be removed: Home (the first tab, the root)
//   used to let Back close the app from a Recap area page (found on a phone,
//   2026-10-29; "beforeRemove" never fires for a root).
export function useBackHandler({ dirty = false, onSave, stepBack }: BackHandlerOptions) {
  const navigation = useNavigation();
  const { showDialog } = useUi();
  const latest = useRef({ dirty, onSave, stepBack });
  latest.current = { dirty, onSave, stepBack };
  const bypass = useRef(false);

  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (bypass.current) return;
      const { dirty, onSave, stepBack } = latest.current;
      if (!dirty && !stepBack) return;

      e.preventDefault();

      const proceed = () => {
        if (stepBack) {
          stepBack();
        } else {
          bypass.current = true;
          navigation.dispatch(e.data.action);
        }
      };

      if (!dirty) {
        proceed();
        return;
      }

      showDialog({
        title: 'Save your changes before leaving?',
        actions: [
          { label: 'Keep editing', style: 'cancel' },
          { label: 'Discard', style: 'destructive', onPress: proceed },
          {
            label: 'Save',
            style: 'default',
            onPress: () => {
              if (onSave?.() === false) return;
              proceed();
            },
          },
        ],
      });
    });
  }, [navigation, showDialog]);

  // Registered on focus, so it's newer than the navigator's own listener and
  // is asked first. Anything else (no inner view to leave) goes to the
  // navigator as before, and through "beforeRemove" above.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        const { stepBack: step, dirty: unsaved } = latest.current;
        // Unsaved changes: the navigator's back, so "beforeRemove" asks first.
        if (!step || unsaved) return false;
        step();
        return true;
      });
      return () => sub.remove();
    }, [])
  );
}
