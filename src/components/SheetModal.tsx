import React from 'react';
import { Modal, Pressable, ScrollView } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Card } from './Card';
import { spacing } from '../theme';
import { themedStyles } from '../theme/runtime';

interface SheetModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

// Bottom-sheet modal that keeps its contents clear of the keyboard. Every modal
// with a text field should use this instead of a bare <Modal>. (The translucent
// bars are what lets keyboard-controller measure correctly inside an Android Modal.)
export function SheetModal({ visible, onClose, children }: SheetModalProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView behavior="padding" style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <Card style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            {children}
          </ScrollView>
        </Card>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    maxHeight: '85%',
  },
  content: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
}));
