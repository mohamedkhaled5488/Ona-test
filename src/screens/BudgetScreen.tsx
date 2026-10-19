import React, { useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { TextInput } from '../components/TextInput';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { SheetModal } from '../components/SheetModal';
import { EntryDetailView } from '../components/EntryDetailView';
import { ScreenTitle, SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, radii, spacing, fonts } from '../theme';
import { sectionAccents } from '../theme/accents';
import { withAlpha } from '../utils/color';
import { useBackHandler } from '../hooks/useBackHandler';
import { useUi } from '../components/UiProvider';
import { todayISO, formatDisplayDate } from '../utils/date';
import { currencies, formatMoney } from '../data/currencies';
import { extractTextFromImage } from '../utils/ocr';
import { shareBudgetAsText, exportBudgetAsPdf } from '../utils/budgetExport';
import {
  useBudgetStore,
  totalForBudget,
  progressPercent,
  limitWarningLevel,
  categoryBreakdown,
  type BudgetInput,
  type BudgetEntryInput,
} from '../store/useBudgetStore';
import type { Budget, BudgetMode, BudgetRecurrence } from '../types/sections';
import type { RootStackParamList } from '../navigation/types';
import { themedStyles } from '../theme/runtime';
import { useSettingsStore } from '../store/useSettingsStore';
import { SeeHowItWorks } from '../discover/SeeHowItWorks';
import { parseNumberInput } from '../utils/numberInput';

type Props = NativeStackScreenProps<RootStackParamList, 'budget'>;

const accent = sectionAccents.budget;

type ScreenState =
  | { kind: 'overview' }
  | { kind: 'folder'; budgetId: string }
  | { kind: 'entryDetail'; budgetId: string; entryId: string };

const modeMeta: Record<BudgetMode, { label: string; verb: string; icon: keyof typeof Ionicons.glyphMap }> = {
  limit: { label: 'Spending limit', verb: 'Spent', icon: 'trending-down-outline' },
  goal: { label: 'Savings goal', verb: 'Saved', icon: 'trending-up-outline' },
};

const recurrenceLabel: Record<BudgetRecurrence, string> = {
  none: 'One-time',
  weekly: 'Resets every week',
  monthly: 'Resets every month',
};

// ---------------------------------------------------------------------------
function AddBudgetSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const addBudget = useBudgetStore((s) => s.addBudget);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<BudgetMode>('limit');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(() => useSettingsStore.getState().budgetCurrency);
  const [pickingCurrency, setPickingCurrency] = useState(false);
  const [recurrence, setRecurrence] = useState<BudgetRecurrence>('none');

  const reset = () => {
    setName('');
    setMode('limit');
    setAmount('');
    // Back to your default currency (Settings), not a hard-coded one.
    setCurrency(useSettingsStore.getState().budgetCurrency);
    setPickingCurrency(false);
    setRecurrence('none');
  };

  const input: BudgetInput = { name, mode, targetAmount: parseNumberInput(amount) || 0, currency, recurrence };

  return (
    <SheetModal visible={visible} onClose={() => { reset(); onClose(); }}>
      <SectionHeading>New budget</SectionHeading>

      <Eyebrow style={styles.fieldLabel}>Name</Eyebrow>
      <TextInput value={name} onChangeText={setName} placeholder="e.g. Japan trip, Groceries" style={styles.sheetInput} />

      <Eyebrow style={styles.fieldLabel}>Mode</Eyebrow>
      <View style={styles.chipRow}>
        {(['limit', 'goal'] as BudgetMode[]).map((m) => (
          <Pressable key={m} onPress={() => setMode(m)} style={[styles.modeChip, mode === m && { backgroundColor: accent, borderColor: accent }]}>
            <Ionicons name={modeMeta[m].icon} size={14} color={mode === m ? colors.white : accent} />
            <Body style={mode === m ? styles.chipTextActive : { color: accent }}> {modeMeta[m].label}</Body>
          </Pressable>
        ))}
      </View>
      <Caption style={styles.noteText}>
        {mode === 'limit' ? 'e.g. "Don’t go over $800 on this trip."' : 'e.g. "Save $500 toward a laptop."'}
      </Caption>

      <Eyebrow style={styles.fieldLabel}>{mode === 'limit' ? 'Limit amount' : 'Goal amount'}</Eyebrow>
      <View style={styles.amountRow}>
        <Pressable style={styles.currencyButton} onPress={() => setPickingCurrency((v) => !v)}>
          <Body style={styles.currencyButtonText}>{currency}</Body>
          <Ionicons name={pickingCurrency ? 'chevron-up' : 'chevron-down'} size={12} color={accent} />
        </Pressable>
        <TextInput value={amount} onChangeText={setAmount} style={[styles.sheetInput, styles.amountInput]} keyboardType="decimal-pad" placeholder="0.00" />
      </View>
      {pickingCurrency && (
        <View style={styles.chipRow}>
          {currencies.map((c) => (
            <Pressable key={c.code} onPress={() => { setCurrency(c.code); setPickingCurrency(false); }} style={[styles.chip, currency === c.code && { backgroundColor: accent, borderColor: accent }]}>
              <Caption style={currency === c.code ? styles.chipTextActive : undefined}>{c.symbol.trim()} {c.code}</Caption>
            </Pressable>
          ))}
        </View>
      )}

      <Eyebrow style={styles.fieldLabel}>Time period (optional)</Eyebrow>
      <View style={styles.chipRow}>
        {(['none', 'weekly', 'monthly'] as BudgetRecurrence[]).map((r) => (
          <Pressable key={r} onPress={() => setRecurrence(r)} style={[styles.chip, recurrence === r && { backgroundColor: accent, borderColor: accent }]}>
            <Body style={recurrence === r ? styles.chipTextActive : undefined}>{recurrenceLabel[r]}</Body>
          </Pressable>
        ))}
      </View>

      <PrimaryButton
        label="Create budget"
        disabled={!name.trim() || input.targetAmount <= 0}
        onPress={() => {
          const id = addBudget(input);
          reset();
          onClose();
          onCreated(id);
        }}
        style={styles.sheetSubmit}
      />
    </SheetModal>
  );
}

// ---------------------------------------------------------------------------
function OverviewStage({ onOpenBudget }: { onOpenBudget: (budgetId: string) => void }) {
  const warnAt = useSettingsStore((s) => s.budgetWarnAt);
  const budgets = useBudgetStore((s) => s.budgets);
  const entries = useBudgetStore((s) => s.entries);
  const [addOpen, setAddOpen] = useState(false);
  const today = todayISO();

  const totalsByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of budgets) {
      const total = totalForBudget(b, entries, today);
      map.set(b.currency, (map.get(b.currency) ?? 0) + total);
    }
    return [...map.entries()];
  }, [budgets, entries, today]);

  return (
    <>
      <ScreenTitle>Budget</ScreenTitle>
      <Caption style={styles.subtitle}>Spending limits and savings goals, all in one place.</Caption>

      {budgets.length === 0 && <Body style={styles.emptyText}>Nothing yet — create your first budget below.</Body>}
      {budgets.length === 0 && <SeeHowItWorks sectionId="budget" />}

      {budgets.length > 1 && totalsByCurrency.length > 0 && (
        <Card style={styles.section}>
          <Eyebrow style={{ color: accent }}>Across all budgets</Eyebrow>
          {totalsByCurrency.map(([currency, total]) => (
            <Body key={currency}>{formatMoney(total, currency)} tracked in {currency}</Body>
          ))}
        </Card>
      )}

      <View style={styles.list}>
        {budgets.map((b) => {
          const total = totalForBudget(b, entries, today);
          const percent = progressPercent(b, total);
          const warning = limitWarningLevel(b, total, warnAt);
          return (
            <Pressable key={b.id} onPress={() => onOpenBudget(b.id)}>
              <Card style={[styles.budgetCard, { borderLeftColor: accent, borderLeftWidth: 3 }]}>
                <View style={styles.budgetCardHeader}>
                  <Body>{b.name}</Body>
                  <Caption>{modeMeta[b.mode].label}</Caption>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: warning === 'over' ? '#B3413A' : accent }]} />
                </View>
                <Caption>
                  {modeMeta[b.mode].verb} {formatMoney(total, b.currency)} of {formatMoney(b.targetAmount, b.currency)}
                </Caption>
              </Card>
            </Pressable>
          );
        })}
      </View>

      <PrimaryButton label="New budget" onPress={() => setAddOpen(true)} style={styles.addButton} />
      <AddBudgetSheet visible={addOpen} onClose={() => setAddOpen(false)} onCreated={onOpenBudget} />
    </>
  );
}

// ---------------------------------------------------------------------------
function LogEntrySheet({ budget, visible, onClose, onSave }: { budget: Budget; visible: boolean; onClose: () => void; onSave: (input: BudgetEntryInput) => void }) {
  const { showToast } = useUi();
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const [note, setNote] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [ocrRunning, setOcrRunning] = useState(false);

  const reset = () => {
    setAmount('');
    setCategoryId(undefined);
    setNote('');
    setPhotoUri(undefined);
    setOcrRunning(false);
  };

  const pickPhoto = async (source: 'camera' | 'library') => {
    try {
      const ImagePicker = await import('expo-image-picker');
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        showToast({ message: 'Permission needed to use the camera/photos.' });
        return;
      }
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
          : await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
      if (!result.canceled && result.assets[0]) setPhotoUri(result.assets[0].uri);
    } catch {
      showToast({ message: "Couldn't open the camera on this device." });
    }
  };

  const runOcr = async () => {
    if (!photoUri) return;
    setOcrRunning(true);
    const result = await extractTextFromImage(photoUri);
    setOcrRunning(false);
    const match = result.text.match(/\d+(\.\d{1,2})?/);
    if (match) {
      setAmount(match[0]);
    } else {
      showToast({ message: 'No amount recognized — you can type it in yourself below.' });
    }
  };

  return (
    <SheetModal visible={visible} onClose={() => { reset(); onClose(); }}>
      <SectionHeading>{budget.mode === 'goal' ? 'Log a contribution' : 'Log an expense'}</SectionHeading>

      <Eyebrow style={styles.fieldLabel}>Amount</Eyebrow>
      <TextInput value={amount} onChangeText={setAmount} placeholder={`0.00 ${budget.currency}`} style={styles.sheetInput} keyboardType="decimal-pad" />

      {budget.categories.length > 0 && (
        <>
          <Eyebrow style={styles.fieldLabel}>Category (optional)</Eyebrow>
          <View style={styles.chipRow}>
            {budget.categories.map((c) => (
              <Pressable key={c.id} onPress={() => setCategoryId(categoryId === c.id ? undefined : c.id)} style={[styles.chip, categoryId === c.id && { backgroundColor: accent, borderColor: accent }]}>
                <Body style={categoryId === c.id ? styles.chipTextActive : undefined}>{c.label}</Body>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Eyebrow style={styles.fieldLabel}>Note (optional)</Eyebrow>
      <TextInput value={note} onChangeText={setNote} placeholder="What was this for?" style={styles.notesInput} multiline />

      <Eyebrow style={styles.fieldLabel}>Receipt photo (optional)</Eyebrow>
      {photoUri ? (
        <View>
          <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
          <View style={styles.photoActionsRow}>
            <Pressable onPress={runOcr} disabled={ocrRunning} style={styles.ocrLink}>
              <Ionicons name="text-outline" size={16} color={accent} />
              <Caption style={styles.ocrLinkText}> {ocrRunning ? 'Reading amount...' : 'Try to extract amount (OCR)'}</Caption>
            </Pressable>
            <Pressable onPress={() => setPhotoUri(undefined)}>
              <Caption style={styles.removePhotoText}>Remove photo</Caption>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.photoButtons}>
          <PrimaryButton label="Take photo" variant="outline" onPress={() => pickPhoto('camera')} style={styles.photoButton} />
          <PrimaryButton label="Choose from library" variant="outline" onPress={() => pickPhoto('library')} style={styles.photoButton} />
        </View>
      )}

      <PrimaryButton
        label="Save"
        disabled={!(parseNumberInput(amount) > 0)}
        onPress={() => {
          onSave({ amount: parseNumberInput(amount), categoryId, note, photoUri });
          reset();
          onClose();
        }}
        style={styles.sheetSubmit}
      />
    </SheetModal>
  );
}

// ---------------------------------------------------------------------------
function FolderStage({ budgetId, onBack, onOpenEntry }: { budgetId: string; onBack: () => void; onOpenEntry: (entryId: string) => void }) {
  const warnAt = useSettingsStore((s) => s.budgetWarnAt);
  const { requestDelete, showToast } = useUi();
  const budgets = useBudgetStore((s) => s.budgets);
  const entries = useBudgetStore((s) => s.entries);
  const deleteBudget = useBudgetStore((s) => s.deleteBudget);
  const addCategory = useBudgetStore((s) => s.addCategory);
  const deleteCategory = useBudgetStore((s) => s.deleteCategory);
  const addEntry = useBudgetStore((s) => s.addEntry);

  const budget = budgets.find((b) => b.id === budgetId);
  const [logOpen, setLogOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState('');

  if (!budget) {
    return (
      <>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> Back</Caption>
        </Pressable>
        <Body>This budget isn't in your list anymore.</Body>
      </>
    );
  }

  const today = todayISO();
  const total = totalForBudget(budget, entries, today);
  const percent = progressPercent(budget, total);
  const warning = limitWarningLevel(budget, total, warnAt);
  const remaining = budget.targetAmount - total;
  const breakdown = categoryBreakdown(budget, entries, today);
  const budgetEntries = entries.filter((e) => e.budgetId === budget.id).sort((a, b) => b.date.localeCompare(a.date));

  const removeBudget = () => {
    requestDelete({
      message: `Delete "${budget.name}" and everything logged in it? This can't be undone.`,
      perform: () => {
        deleteBudget(budgetId);
        onBack();
      },
    });
  };

  const removeCategory = (id: string, label: string) => {
    requestDelete({
      message: `Remove category "${label}"? Entries already tagged with it will keep their amount, just untagged.`,
      perform: () => deleteCategory(budgetId, id),
    });
  };

  return (
    <>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> Budgets</Caption>
        </Pressable>
        <Pressable onPress={removeBudget} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete budget">
          <Ionicons name="trash-outline" size={18} color={colors.inkSoft} />
        </Pressable>
      </View>

      <SectionHeading>{budget.name}</SectionHeading>
      <Caption style={styles.cueLine}>
        {modeMeta[budget.mode].label} · {recurrenceLabel[budget.recurrence]}
        {budget.deadline ? ` · by ${formatDisplayDate(budget.deadline)}` : ''}
      </Caption>

      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: warning === 'over' ? '#B3413A' : accent }]} />
        </View>
        <Caption>
          {modeMeta[budget.mode].verb} {formatMoney(total, budget.currency)} of {formatMoney(budget.targetAmount, budget.currency)}
        </Caption>
        <Body style={remaining < 0 ? styles.overAmount : undefined}>
          {budget.mode === 'goal'
            ? remaining > 0
              ? `${formatMoney(remaining, budget.currency)} to go`
              : 'Goal reached'
            : remaining >= 0
              ? `${formatMoney(remaining, budget.currency)} remaining`
              : `${formatMoney(-remaining, budget.currency)} over`}
        </Body>
      </View>

      {warning !== 'none' && (
        <Card style={[styles.warningCard, warning === 'over' && styles.warningCardOver]}>
          <Eyebrow style={warning === 'over' ? styles.warningLabelOver : styles.warningLabel}>
            {warning === 'over' ? 'A gentle heads-up' : 'Getting close'}
          </Eyebrow>
          <Body>
            {warning === 'over'
              ? `This one's gone a bit over — ${formatMoney(-remaining, budget.currency)} past the limit. No judgment, just something to notice.`
              : "You're approaching the limit on this one — still plenty of room to decide what's next."}
          </Body>
        </Card>
      )}

      {breakdown.length > 0 && (
        <Card style={styles.section}>
          <Eyebrow>By category</Eyebrow>
          {breakdown.map((c) => (
            <View key={c.categoryId} style={styles.breakdownRow}>
              <Caption style={styles.breakdownLabel}>{c.label}</Caption>
              <View style={styles.breakdownTrack}>
                <View style={[styles.breakdownFill, { width: `${Math.min(100, (c.amount / (total || 1)) * 100)}%` }]} />
              </View>
              <Caption>{formatMoney(c.amount, budget.currency)}</Caption>
            </View>
          ))}
        </Card>
      )}

      <Card style={styles.section}>
        <Eyebrow>Categories</Eyebrow>
        {budget.categories.length === 0 && <Caption>None yet — add sub-categories for a clearer breakdown.</Caption>}
        <View style={styles.chipRow}>
          {budget.categories.map((c) => (
            <View key={c.id} style={[styles.chip, styles.categoryChip]}>
              <Body>{c.label}</Body>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove category ${c.label}`} onPress={() => removeCategory(c.id, c.label)} hitSlop={8}>
                <Ionicons name="close" size={14} color={colors.inkSoft} />
              </Pressable>
            </View>
          ))}
        </View>
        <View style={styles.addRow}>
          <TextInput
            value={categoryDraft}
            onChangeText={setCategoryDraft}
            placeholder="e.g. Flights, Hotel"
            style={styles.addInput}
            onSubmitEditing={() => {
              if (categoryDraft.trim()) {
                addCategory(budgetId, categoryDraft);
                setCategoryDraft('');
              }
            }}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="Add category"
            onPress={() => {
              if (categoryDraft.trim()) {
                addCategory(budgetId, categoryDraft);
                setCategoryDraft('');
              }
            }}
            hitSlop={8}
          >
            <Ionicons name="add-circle" size={26} color={accent} />
          </Pressable>
        </View>
      </Card>

      <PrimaryButton label={budget.mode === 'goal' ? 'Log a contribution' : 'Log an expense'} onPress={() => setLogOpen(true)} style={styles.logButton} />

      <View style={styles.headerRow}>
        <Eyebrow style={styles.historyHeading}>History</Eyebrow>
      </View>
      <View style={styles.list}>
        {budgetEntries.length === 0 && <Body style={styles.emptyText}>Nothing logged yet.</Body>}
        {budgetEntries.map((e) => {
          const cat = e.categoryId ? budget.categories.find((c) => c.id === e.categoryId) : undefined;
          return (
            <Pressable key={e.id} onPress={() => onOpenEntry(e.id)}>
              <Card style={styles.entryCard}>
                {e.photoUri && <Image source={{ uri: e.photoUri }} style={styles.entryPhoto} resizeMode="cover" />}
                <View style={styles.entryHeader}>
                  <Body>{formatMoney(e.amount, budget.currency)}</Body>
                  <Caption>{formatDisplayDate(e.date)}</Caption>
                </View>
                {cat && <Caption style={{ color: accent }}>{cat.label}</Caption>}
                {e.note && <Body numberOfLines={2} style={styles.entryNote}>{e.note}</Body>}
              </Card>
            </Pressable>
          );
        })}
      </View>

      {budgetEntries.length > 0 && (
        <Card style={styles.section}>
          <Eyebrow>Export this budget</Eyebrow>
          <View style={styles.exportRow}>
            <PrimaryButton label="Share as text" variant="outline" style={styles.exportButton} onPress={() => shareBudgetAsText(budget, budgetEntries, total)} />
            <PrimaryButton
              label="Export as PDF"
              variant="outline"
              style={styles.exportButton}
              onPress={async () => {
                const result = await exportBudgetAsPdf(budget, budgetEntries, total);
                if (!result.ok && result.reason) showToast({ message: result.reason });
              }}
            />
          </View>
        </Card>
      )}

      <LogEntrySheet budget={budget} visible={logOpen} onClose={() => setLogOpen(false)} onSave={(input) => addEntry(budgetId, input)} />
    </>
  );
}

// ---------------------------------------------------------------------------
function EntryDetailStage({ budgetId, entryId, onBack }: { budgetId: string; entryId: string; onBack: () => void }) {
  const { requestDelete } = useUi();
  const budgets = useBudgetStore((s) => s.budgets);
  const entries = useBudgetStore((s) => s.entries);
  const deleteEntry = useBudgetStore((s) => s.deleteEntry);

  const budget = budgets.find((b) => b.id === budgetId);
  const entry = entries.find((e) => e.id === entryId);

  if (!budget || !entry) {
    return (
      <>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> Back</Caption>
        </Pressable>
        <Body>This entry isn't around anymore.</Body>
      </>
    );
  }

  const cat = entry.categoryId ? budget.categories.find((c) => c.id === entry.categoryId) : undefined;

  return (
    <EntryDetailView
      accent={accent}
      title={formatDisplayDate(entry.date)}
      subtitle={[formatMoney(entry.amount, budget.currency), cat?.label].filter(Boolean).join(' · ')}
      backLabel={budget.name}
      notes={entry.note}
      photoUri={entry.photoUri}
      onBack={onBack}
      onDelete={() =>
        requestDelete({
          message: 'Delete this entry?',
          perform: () => {
            deleteEntry(entryId);
            onBack();
          },
        })
      }
    />
  );
}

// ---------------------------------------------------------------------------
export function BudgetScreen({ route }: Props) {
  const { openBudgetId } = route.params ?? {};
  const [stack, setStack] = useState<ScreenState[]>(() =>
    openBudgetId ? [{ kind: 'overview' }, { kind: 'folder', budgetId: openBudgetId }] : [{ kind: 'overview' }]
  );
  const current = stack[stack.length - 1];
  const push = (s: ScreenState) => setStack((prev) => [...prev, s]);
  const stepBack = () => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));

  useBackHandler({ stepBack: stack.length > 1 ? stepBack : undefined });

  return (
    <Screen>
      {current.kind === 'overview' && <OverviewStage onOpenBudget={(budgetId) => push({ kind: 'folder', budgetId })} />}
      {current.kind === 'folder' && (
        <FolderStage budgetId={current.budgetId} onBack={stepBack} onOpenEntry={(entryId) => push({ kind: 'entryDetail', budgetId: current.budgetId, entryId })} />
      )}
      {current.kind === 'entryDetail' && <EntryDetailStage budgetId={current.budgetId} entryId={current.entryId} onBack={stepBack} />}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subtitle: {
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  emptyText: {
    color: colors.inkSoft,
    marginBottom: spacing.md,
  },
  section: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  list: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  budgetCard: {
    gap: spacing.xs,
  },
  budgetCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressTrack: {
    height: 6,
    borderRadius: radii.full,
    backgroundColor: colors.stone,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radii.full,
  },
  addButton: {
    marginBottom: spacing.xl,
  },
  fieldLabel: {
    marginTop: spacing.sm,
  },
  sheetInput: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: spacing.sm,
  },
  notesInput: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: spacing.sm,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  sheetSubmit: {
    marginTop: spacing.md,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.stone,
  },
  chipTextActive: {
    color: colors.white,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1.5,
    borderColor: accent,
    backgroundColor: colors.stone,
  },
  noteText: {
    fontStyle: 'italic',
    marginBottom: spacing.sm,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  amountInput: {
    flex: 1,
  },
  currencyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.stone,
  },
  currencyButtonText: {
    fontFamily: fonts.bodyMedium,
    color: colors.ink,
  },
  cueLine: {
    marginTop: 2,
    marginBottom: spacing.md,
  },
  progressWrap: {
    gap: spacing.xs,
    marginBottom: spacing.md,
  },
  overAmount: {
    color: '#D97A70',
  },
  warningCard: {
    gap: spacing.xs,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.amber,
    backgroundColor: withAlpha(colors.amber, 0.08),
  },
  warningCardOver: {
    borderLeftColor: '#B3413A',
    backgroundColor: withAlpha('#B3413A', 0.08),
  },
  warningLabel: {
    color: colors.amber,
  },
  warningLabelOver: {
    color: '#D97A70',
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  breakdownLabel: {
    width: 90,
  },
  breakdownTrack: {
    flex: 1,
    height: 6,
    borderRadius: radii.full,
    backgroundColor: colors.stone,
    overflow: 'hidden',
  },
  breakdownFill: {
    height: '100%',
    backgroundColor: accent,
    borderRadius: radii.full,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: spacing.xs,
  },
  logButton: {
    marginBottom: spacing.md,
  },
  historyHeading: {
    marginTop: spacing.xs,
  },
  entryCard: {
    gap: 4,
  },
  entryPhoto: {
    width: '100%',
    height: 140,
    borderRadius: radii.sm,
    marginBottom: spacing.xs,
    backgroundColor: colors.stone,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  entryNote: {},
  exportRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  exportButton: {
    flex: 1,
  },
  photoButtons: {
    gap: spacing.sm,
  },
  photoButton: {},
  photoPreview: {
    width: '100%',
    height: 160,
    borderRadius: radii.md,
    backgroundColor: colors.stone,
  },
  photoActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  ocrLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ocrLinkText: {
    color: accent,
  },
  removePhotoText: {
    color: colors.inkSoft,
    textDecorationLine: 'underline',
  },
}));
