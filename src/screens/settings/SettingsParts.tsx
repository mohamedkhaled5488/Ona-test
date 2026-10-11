// Building blocks for every Settings page: a titled group, rows that navigate,
// switches and choice chips. Every setting carries a one-line explanation.
import React from 'react';
import { Pressable, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/Card';
import { Body, Caption, Eyebrow } from '../../components/Typography';
import { colors, fonts, radii, spacing } from '../../theme';
import { themedStyles } from '../../theme/runtime';

export const DANGER = '#B3413A';

export function Group({ title, footer, children }: { title?: string; footer?: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      {title ? <Eyebrow style={styles.groupTitle}>{title}</Eyebrow> : null}
      <Card style={styles.card}>{children}</Card>
      {footer ? <Caption style={styles.footer}>{footer}</Caption> : null}
    </View>
  );
}

function RowText({ label, explain, danger }: { label: string; explain?: string; danger?: boolean }) {
  return (
    <View style={styles.rowText}>
      <Body style={danger ? styles.danger : undefined}>{label}</Body>
      {explain ? <Caption>{explain}</Caption> : null}
    </View>
  );
}

export function NavRow({
  icon,
  label,
  explain,
  value,
  onPress,
  danger,
  external,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  label: string;
  explain?: string;
  value?: string;
  onPress: () => void;
  danger?: boolean;
  external?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={label}>
      {icon ? <Ionicons name={icon} size={20} color={danger ? DANGER : colors.teal} style={styles.icon} /> : null}
      <RowText label={label} explain={explain} danger={danger} />
      {value ? <Caption style={styles.value}>{value}</Caption> : null}
      <Ionicons name={external ? 'open-outline' : 'chevron-forward'} size={16} color={colors.inkSoft} />
    </Pressable>
  );
}

export function ToggleRow({
  label,
  explain,
  value,
  onChange,
  disabled,
}: {
  label: string;
  explain: string;
  value: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.row, disabled && styles.disabled]}>
      <RowText label={label} explain={explain} />
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.teal, false: colors.line }}
        accessibilityLabel={label}
      />
    </View>
  );
}

export function ChoiceRow<T extends string | number | null>({
  label,
  explain,
  options,
  value,
  onChange,
}: {
  label: string;
  explain: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  return (
    <View style={styles.choiceBlock}>
      <RowText label={label} explain={explain} />
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o) => {
          const active = o.id === value;
          return (
            <Pressable
              key={String(o.id)}
              onPress={() => onChange(o.id)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${label}: ${o.label}`}
            >
              <Caption style={active ? styles.chipTextActive : styles.chipText}>{o.label}</Caption>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function InfoRow({ label, value, explain }: { label: string; value?: string; explain?: string }) {
  return (
    <View style={styles.row}>
      <RowText label={label} explain={explain} />
      {value ? <Caption style={styles.valueStrong}>{value}</Caption> : null}
    </View>
  );
}

export function Divider() {
  return <View style={styles.divider} />;
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: React.ReactNode }) {
  return (
    <View style={[styles.notice, tone === 'warn' && styles.noticeWarn]}>
      <Ionicons name={tone === 'warn' ? 'alert-circle-outline' : 'information-circle-outline'} size={18} color={tone === 'warn' ? colors.amber : colors.teal} />
      <View style={styles.rowText}>{children}</View>
    </View>
  );
}

const styles = themedStyles(() => ({
  group: { marginBottom: spacing.lg },
  groupTitle: { color: colors.inkSoft, marginBottom: spacing.sm, marginLeft: spacing.xs },
  card: { paddingVertical: spacing.xs, gap: 0 },
  footer: { marginTop: spacing.xs, marginHorizontal: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm + 2, minHeight: 48 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
  icon: { width: 24 },
  rowText: { flex: 1, gap: 2 },
  value: { maxWidth: '40%', textAlign: 'right' },
  valueStrong: { color: colors.ink, fontFamily: fonts.bodyMedium, maxWidth: '45%', textAlign: 'right' },
  danger: { color: DANGER },
  choiceBlock: { paddingVertical: spacing.sm + 2, gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.stone,
  },
  chipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { color: colors.ink },
  chipTextActive: { color: colors.white },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: spacing.xs },
  notice: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.stone,
    borderWidth: 1,
    borderColor: colors.line,
    marginVertical: spacing.xs,
  },
  noticeWarn: { borderColor: colors.amber },
}));
