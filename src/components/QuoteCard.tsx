import React, { forwardRef } from 'react';
import { Share, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { Body, Caption } from './Typography';
import { colors, fonts, radii, sectionAccents, spacing } from '../theme';
import { themedStyles } from '../theme/runtime';

const ACCENT = sectionAccents.book;

interface QuoteCardViewProps {
  text: string;
  bookTitle: string;
  author?: string;
}

// The visual, shareable quote card — quote text + book title/author + Ona's
// identity. Rendered off-screen and captured to an image on demand.
export const QuoteCardView = forwardRef<View, QuoteCardViewProps>(({ text, bookTitle, author }, ref) => (
  <View ref={ref} collapsable={false} style={styles.card}>
    <Caption style={styles.mark}>“</Caption>
    <Body style={styles.text}>{text}</Body>
    <View style={styles.footer}>
      <View style={styles.rule} />
      <Body style={styles.bookTitle}>{bookTitle}</Body>
      {author ? <Caption style={styles.author}>{author}</Caption> : null}
    </View>
    <Caption style={styles.brand}>Ona</Caption>
  </View>
));

// Captures the given ref to an image and opens the share sheet. Falls back
// to sharing the quote as plain text if image capture/sharing isn't
// available on this platform (e.g. the web preview) — a convenience feature
// should never dead-end the user.
export async function shareQuoteCardImage(ref: React.RefObject<View | null>, fallbackText: string): Promise<void> {
  try {
    if (!ref.current) throw new Error('no card to capture');
    const uri = await captureRef(ref, { format: 'png', quality: 1 });
    const Sharing = await import('expo-sharing');
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri);
      return;
    }
    throw new Error('sharing unavailable');
  } catch {
    await Share.share({ message: fallbackText });
  }
}

const styles = themedStyles(() => ({
  card: {
    width: 320,
    padding: spacing.xl,
    backgroundColor: colors.stone,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.line,
    borderLeftWidth: 4,
    borderLeftColor: ACCENT,
  },
  mark: {
    fontSize: 40,
    color: ACCENT,
    lineHeight: 40,
    marginBottom: -8,
  },
  text: {
    fontFamily: fonts.headingMedium,
    fontSize: 18,
    lineHeight: 26,
    color: colors.ink,
  },
  footer: {
    marginTop: spacing.lg,
    gap: 2,
  },
  rule: {
    width: 32,
    height: 2,
    backgroundColor: ACCENT,
    marginBottom: spacing.sm,
  },
  bookTitle: {
    fontFamily: fonts.bodyMedium,
  },
  author: {},
  brand: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    color: colors.inkSoft,
    letterSpacing: 1,
    textTransform: 'uppercase',
    fontSize: 10,
  },
}));
