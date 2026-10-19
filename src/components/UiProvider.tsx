import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { colors, fonts, fontSizes, radii, shadows, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';

export interface DialogAction {
  label: string;
  style?: 'default' | 'destructive' | 'cancel';
  onPress?: () => void;
}

interface DialogConfig {
  title: string;
  message?: string;
  actions: DialogAction[];
}

interface ToastConfig {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface DeleteRequest {
  message?: string;
  perform: () => void;
  // Captures whatever is needed to put things back; called if the user taps Undo.
  restore?: () => void;
  toastMessage?: string;
}

interface UiContextValue {
  showDialog: (config: DialogConfig) => void;
  showToast: (config: ToastConfig) => void;
  requestDelete: (req: DeleteRequest) => void;
}

const UiContext = createContext<UiContextValue | null>(null);

export function useUi(): UiContextValue {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error('useUi must be used inside <UiProvider>');
  return ctx;
}

const TOAST_MS = 5000;

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogConfig | null>(null);
  const [toast, setToast] = useState<ToastConfig | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showDialog = useCallback((config: DialogConfig) => setDialog(config), []);

  const showToast = useCallback((config: ToastConfig) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(config);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const requestDelete = useCallback(
    (req: DeleteRequest) => {
      setDialog({
        title: 'Are you sure you want to delete this?',
        message: req.message,
        actions: [
          { label: 'Cancel', style: 'cancel' },
          {
            label: 'Delete',
            style: 'destructive',
            onPress: () => {
              req.perform();
              if (req.restore) {
                showToast({
                  message: req.toastMessage ?? 'Deleted',
                  actionLabel: 'Undo',
                  onAction: req.restore,
                });
              }
            },
          },
        ],
      });
    },
    [showToast]
  );

  const closeDialog = () => setDialog(null);

  return (
    <UiContext.Provider value={{ showDialog, showToast, requestDelete }}>
      {children}

      <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={closeDialog}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle} accessibilityRole="header">{dialog?.title}</Text>
            {dialog?.message ? <Text style={styles.dialogMessage}>{dialog.message}</Text> : null}
            <View style={styles.dialogActions}>
              {dialog?.actions.map((action) => (
                <Pressable
                  key={action.label}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.dialogButton,
                    action.style === 'destructive' && styles.dialogButtonDestructive,
                    action.style === 'default' && styles.dialogButtonPrimary,
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => {
                    closeDialog();
                    action.onPress?.();
                  }}
                >
                  <Text
                    style={[
                      styles.dialogButtonText,
                      action.style === 'destructive' && styles.dialogButtonTextOnColor,
                      action.style === 'default' && styles.dialogButtonTextOnColor,
                    ]}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      {toast && (
        <View pointerEvents="box-none" style={styles.toastWrap}>
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toast.message}</Text>
            {toast.actionLabel && (
              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                onPress={() => {
                  toast.onAction?.();
                  setToast(null);
                }}
              >
                <Text style={styles.toastAction}>{toast.actionLabel}</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </UiContext.Provider>
  );
}

const styles = themedStyles(() => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.raised,
  },
  dialogTitle: {
    fontFamily: fonts.headingSemiBold,
    fontSize: fontSizes.lg,
    color: colors.ink,
  },
  dialogMessage: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: colors.inkSoft,
  },
  dialogActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  dialogButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dialogButtonDestructive: {
    backgroundColor: '#B3413A',
    borderColor: '#B3413A',
  },
  dialogButtonPrimary: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  dialogButtonText: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: colors.ink,
  },
  dialogButtonTextOnColor: {
    color: colors.white,
  },
  toastWrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.xl,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: '#34363B',
    borderRadius: radii.full,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    ...shadows.raised,
  },
  toastText: {
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    color: colors.ink,
  },
  toastAction: {
    fontFamily: fonts.bodyMedium,
    fontSize: fontSizes.sm,
    color: colors.amber,
  },
}));
