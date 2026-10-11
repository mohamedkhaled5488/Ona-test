import { useEffect, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
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

// One place that decides what "back" means for a screen — used by the header
// back button, the swipe gesture and the Android hardware back button alike.
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
}
