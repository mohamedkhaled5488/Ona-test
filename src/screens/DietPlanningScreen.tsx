import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { TextInput } from '../components/TextInput';
import { Ionicons } from '@expo/vector-icons';
import { useBackHandler } from '../hooks/useBackHandler';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { SheetModal } from '../components/SheetModal';
import { useUi } from '../components/UiProvider';
import { currencies, formatMoney } from '../data/currencies';
import { ScreenTitle, SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, spacing, radii, fonts } from '../theme';
import { withAlpha } from '../utils/color';
import { useDietStore } from '../store/useDietStore';
import type { MealInput } from '../store/useDietStore';
import { mealSlots, mealSlotLabels, mealSourceLabels, mealSourceIcons, mealSourceOrder } from '../data/dietMeta';
import { totalCost, costBySource, repeatedMeals } from '../utils/dietStats';
import { addDaysISO, formatDisplayDate, formatMonthLabel, todayISO } from '../utils/date';
import { useSettingsStore } from '../store/useSettingsStore';
import { weekStartFor } from '../utils/feelingsStats';
import type { MealSlot, MealSource, PlannedMeal } from '../types/sections';
import { themedStyles } from '../theme/runtime';
import { parseNumberInput } from '../utils/numberInput';

type ViewMode = 'week' | 'grocery' | 'summary';
type SummaryPeriod = 'day' | 'week' | 'month';

const emptyMealInput: MealInput = { name: '', cost: undefined, source: undefined, notes: '', tags: [] };

function MealFormModal({
  visible,
  onClose,
  slotLabel,
  favorites,
  initial,
  onSave,
  onDelete,
  onPickFavorite,
}: {
  visible: boolean;
  onClose: () => void;
  slotLabel: string;
  favorites: { id: string; name: string }[];
  initial?: PlannedMeal;
  onSave: (input: MealInput) => void;
  onDelete?: () => void;
  onPickFavorite: (favoriteId: string) => void;
}) {
  const currencyCode = useDietStore((s) => s.currency);
  const setCurrency = useDietStore((s) => s.setCurrency);
  const [pickingCurrency, setPickingCurrency] = useState(false);
  const { showDialog } = useUi();
  const [name, setName] = useState(initial?.name ?? '');
  const [cost, setCost] = useState(initial?.cost !== undefined ? String(initial.cost) : '');
  const [source, setSource] = useState<MealSource | undefined>(initial?.source);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');

  React.useEffect(() => {
    if (visible) {
      setName(initial?.name ?? '');
      setCost(initial?.cost !== undefined ? String(initial.cost) : '');
      setSource(initial?.source);
      setNotes(initial?.notes ?? '');
      setTags(initial?.tags.join(', ') ?? '');
    }
  }, [visible, initial]);

  const formDirty =
    name !== (initial?.name ?? '') ||
    cost !== (initial?.cost !== undefined ? String(initial.cost) : '') ||
    notes !== (initial?.notes ?? '') ||
    tags !== (initial?.tags.join(', ') ?? '');

  const commit = () => {
    onSave({
      name,
      // A cost that isn't a number is left empty, never saved as NaN.
      cost: cost.trim() && Number.isFinite(parseNumberInput(cost)) ? parseNumberInput(cost) : undefined,
      source,
      notes: notes.trim() || undefined,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
    onClose();
  };

  const requestClose = () => {
    if (!formDirty || !name.trim()) return onClose();
    showDialog({
      title: 'Save your changes before leaving?',
      actions: [
        { label: 'Cancel', style: 'cancel' },
        { label: 'Discard', style: 'destructive', onPress: onClose },
        { label: 'Save', style: 'default', onPress: commit },
      ],
    });
  };

  return (
    <SheetModal visible={visible} onClose={requestClose}>
      <>
            <View style={styles.modalHeader}>
              <SectionHeading>{initial ? 'Edit meal' : `Add ${slotLabel}`}</SectionHeading>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={requestClose}>
                <Ionicons name="close" size={22} color={colors.inkSoft} />
              </Pressable>
            </View>

            {!initial && favorites.length > 0 && (
              <>
                <Eyebrow style={styles.fieldLabel}>Quick pick from favorites</Eyebrow>
                <View style={styles.favoriteRow}>
                  {favorites.map((f) => (
                    <Pressable key={f.id} style={styles.favoriteChip} onPress={() => onPickFavorite(f.id)}>
                      <Ionicons name="star" size={12} color={colors.amber} />
                      <Body> {f.name}</Body>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            <Eyebrow style={styles.fieldLabel}>Dish name</Eyebrow>
            <TextInput value={name} onChangeText={setName} style={styles.textInput} placeholder="e.g. Grilled chicken salad" placeholderTextColor={colors.inkSoft} />

            <Eyebrow style={styles.fieldLabel}>Cost (optional)</Eyebrow>
            <View style={styles.costRow}>
              <Pressable style={styles.currencyButton} onPress={() => setPickingCurrency((v) => !v)}>
                <Body style={styles.currencyButtonText}>{formatMoney(0, currencyCode).replace(/[0-9.,]/g, '').trim() || currencyCode}</Body>
                <Ionicons name={pickingCurrency ? 'chevron-up' : 'chevron-down'} size={12} color={colors.teal} />
              </Pressable>
              <TextInput value={cost} onChangeText={setCost} style={[styles.textInput, styles.costInput]} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.inkSoft} />
            </View>
            {pickingCurrency && (
              <View style={styles.currencyChips}>
                {currencies.map((c) => (
                  <Pressable
                    key={c.code}
                    onPress={() => {
                      setCurrency(c.code);
                      setPickingCurrency(false);
                    }}
                    style={[styles.currencyChip, currencyCode === c.code && styles.currencyChipActive]}
                  >
                    <Caption style={currencyCode === c.code ? styles.currencyChipTextActive : undefined}>
                      {c.symbol.trim()} {c.code}
                    </Caption>
                  </Pressable>
                ))}
              </View>
            )}

            <Eyebrow style={styles.fieldLabel}>Source</Eyebrow>
            <View style={styles.sourceRow}>
              {mealSourceOrder.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setSource(source === s ? undefined : s)}
                  style={[styles.sourceChip, source === s && styles.sourceChipActive]}
                >
                  <Ionicons name={mealSourceIcons[s] as any} size={13} color={source === s ? colors.white : colors.inkSoft} />
                  <Caption style={source === s ? styles.sourceChipTextActive : undefined}> {mealSourceLabels[s]}</Caption>
                </Pressable>
              ))}
            </View>

            <Eyebrow style={styles.fieldLabel}>Recipe / notes (optional)</Eyebrow>
            <TextInput value={notes} onChangeText={setNotes} style={styles.notesInput} multiline placeholder="..." placeholderTextColor={colors.inkSoft} />

            <Eyebrow style={styles.fieldLabel}>Dietary tags (optional)</Eyebrow>
            <TextInput value={tags} onChangeText={setTags} style={styles.textInput} placeholder="vegetarian, halal, ..." placeholderTextColor={colors.inkSoft} />

            <View style={styles.modalActions}>
              {initial && onDelete && (
                <PrimaryButton label="Delete" variant="outline" style={styles.modalButton} onPress={onDelete} />
              )}
              <PrimaryButton
                label="Save"
                style={styles.modalButton}
                onPress={commit}
              />
            </View>
      </>
    </SheetModal>
  );
}

function FavoritesModal({ visible, onClose, currency }: { visible: boolean; onClose: () => void; currency: string | null }) {
  const favorites = useDietStore((s) => s.favorites);
  const deleteFavorite = useDietStore((s) => s.deleteFavorite);
  const { requestDelete } = useUi();

  const confirmDelete = (id: string, name: string) => {
    const previous = useDietStore.getState().favorites;
    requestDelete({
      message: `Remove "${name}" from your favorites?`,
      toastMessage: 'Favorite removed',
      perform: () => deleteFavorite(id),
      restore: () => useDietStore.setState({ favorites: previous }),
    });
  };

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={styles.modalHeader}>
        <SectionHeading>Favorite meals</SectionHeading>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} onPress={onClose}>
          <Ionicons name="close" size={22} color={colors.inkSoft} />
        </Pressable>
      </View>
      {favorites.length === 0 && <Body style={styles.emptyText}>No favorites saved yet.</Body>}
      {favorites.map((f) => (
        <View key={f.id} style={styles.favoriteRowItem}>
          <Ionicons name="star" size={14} color={colors.amber} />
          <Body style={styles.favoriteRowText}> {f.name}</Body>
          {f.cost !== undefined && <Caption>{formatMoney(f.cost, currency)}</Caption>}
          <Pressable hitSlop={8} onPress={() => confirmDelete(f.id, f.name)} accessibilityRole="button" accessibilityLabel={`Remove ${f.name} from favorites`}>
            <Ionicons name="trash-outline" size={16} color={colors.inkSoft} />
          </Pressable>
        </View>
      ))}
    </SheetModal>
  );
}

export function DietPlanningScreen() {
  const plannedMeals = useDietStore((s) => s.plannedMeals);
  const favorites = useDietStore((s) => s.favorites);
  const groceryItems = useDietStore((s) => s.groceryItems);
  const addMeal = useDietStore((s) => s.addMeal);
  const updateMeal = useDietStore((s) => s.updateMeal);
  const deleteMeal = useDietStore((s) => s.deleteMeal);
  const addFavoriteToDay = useDietStore((s) => s.addFavoriteToDay);
  const saveAsFavorite = useDietStore((s) => s.saveAsFavorite);
  const generateGroceryList = useDietStore((s) => s.generateGroceryList);
  const addGroceryItem = useDietStore((s) => s.addGroceryItem);
  const toggleGroceryItem = useDietStore((s) => s.toggleGroceryItem);
  const deleteGroceryItem = useDietStore((s) => s.deleteGroceryItem);
  const clearCheckedGroceryItems = useDietStore((s) => s.clearCheckedGroceryItems);
  const currency = useDietStore((s) => s.currency);
  const { requestDelete } = useUi();

  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [favoritesVisible, setFavoritesVisible] = useState(false);
  const [newGroceryLabel, setNewGroceryLabel] = useState('');
  const [summaryPeriod, setSummaryPeriod] = useState<SummaryPeriod>('week');

  const [formState, setFormState] = useState<{ slot: MealSlot; meal?: PlannedMeal } | null>(null);

  const weekStartsOn = useSettingsStore((s) => s.weekStartsOn);
  const weekStart = weekStartFor(selectedDate, weekStartsOn);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDaysISO(weekStart, i));

  const dayMeals = plannedMeals.filter((m) => m.date === selectedDate);

  const periodMeals =
    summaryPeriod === 'day'
      ? plannedMeals.filter((m) => m.date === selectedDate)
      : summaryPeriod === 'week'
        ? plannedMeals.filter((m) => weekDates.includes(m.date))
        : plannedMeals.filter((m) => m.date.slice(0, 7) === selectedDate.slice(0, 7));
  const periodDates = Array.from(new Set(periodMeals.map((m) => m.date))).sort();
  const periodLabel =
    summaryPeriod === 'day'
      ? formatDisplayDate(selectedDate)
      : summaryPeriod === 'week'
        ? `Week of ${formatDisplayDate(weekStart)}`
        : formatMonthLabel(selectedDate);

  useBackHandler({
    dirty: newGroceryLabel.trim() !== '',
    onSave: () => {
      addGroceryItem(newGroceryLabel);
      setNewGroceryLabel('');
    },
  });

  const confirmDeleteMeal = (meal: PlannedMeal) => {
    const previous = useDietStore.getState().plannedMeals;
    requestDelete({
      message: `"${meal.name}" will be removed from ${mealSlotLabels[meal.slot].toLowerCase()}.`,
      toastMessage: 'Meal deleted',
      perform: () => {
        deleteMeal(meal.id);
        setFormState(null);
      },
      restore: () => useDietStore.setState({ plannedMeals: previous }),
    });
  };

  const confirmDeleteGrocery = (id: string, label: string) => {
    const previous = useDietStore.getState().groceryItems;
    requestDelete({
      message: `Remove "${label}" from your grocery list?`,
      toastMessage: 'Item removed',
      perform: () => deleteGroceryItem(id),
      restore: () => useDietStore.setState({ groceryItems: previous }),
    });
  };

  const confirmClearChecked = () => {
    const previous = useDietStore.getState().groceryItems;
    requestDelete({
      message: 'All checked items will be removed from the list.',
      toastMessage: 'Checked items cleared',
      perform: clearCheckedGroceryItems,
      restore: () => useDietStore.setState({ groceryItems: previous }),
    });
  };

  const sourceBreakdown = costBySource(periodMeals);
  const repeated = repeatedMeals(plannedMeals);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <ScreenTitle>Diet Planning</ScreenTitle>
        <View style={styles.headerLinks}>
          <Pressable onPress={() => setFavoritesVisible(true)} style={styles.headerLink}>
            <Ionicons name="star-outline" size={16} color={colors.inkSoft} />
            <Caption> Favorites</Caption>
          </Pressable>
        </View>
      </View>
      <Caption style={styles.subtitle}>A planning and cost tool — not a nutrition tracker</Caption>

      <View style={styles.segmented}>
        {(['week', 'grocery', 'summary'] as ViewMode[]).map((mode) => (
          <Pressable key={mode} onPress={() => setViewMode(mode)} style={[styles.segment, viewMode === mode && styles.segmentActive]}>
            <Caption style={[styles.segmentText, viewMode === mode && styles.segmentTextActive]}>
              {mode === 'week' ? 'Week' : mode === 'grocery' ? 'Grocery' : 'Summary'}
            </Caption>
          </Pressable>
        ))}
      </View>

      {viewMode === 'week' && (
        <>
          <View style={styles.weekStrip}>
            {weekDates.map((day) => {
              const count = plannedMeals.filter((m) => m.date === day).length;
              const isSelected = day === selectedDate;
              return (
                <Pressable key={day} onPress={() => setSelectedDate(day)} style={styles.weekDayCell}>
                  <Caption style={isSelected ? styles.weekDaySelectedText : undefined}>
                    {new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}
                  </Caption>
                  <View style={[styles.weekDot, isSelected && styles.weekDotSelected, count === 0 && styles.weekDotEmpty]}>
                    {count > 0 && <Caption style={styles.weekDotText}>{count}</Caption>}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.slotsList}>
            {mealSlots.map((slot) => {
              const mealsForSlot = dayMeals.filter((m) => m.slot === slot);
              return (
                <View key={slot} style={styles.slotSection}>
                  <Eyebrow>{mealSlotLabels[slot]}</Eyebrow>
                  {mealsForSlot.map((meal) => (
                    <Pressable key={meal.id} onPress={() => setFormState({ slot, meal })}>
                      <Card style={styles.mealCard}>
                        <View style={styles.mealCardTop}>
                          {meal.source && <Ionicons name={mealSourceIcons[meal.source] as any} size={16} color={colors.teal} />}
                          <Body style={styles.mealName}>{meal.name}</Body>
                          {meal.cost !== undefined && <Caption>{formatMoney(meal.cost, currency)}</Caption>}
                        </View>
                        {meal.tags.length > 0 && <Caption style={styles.tagsText}>{meal.tags.map((t) => `#${t}`).join('  ')}</Caption>}
                      </Card>
                    </Pressable>
                  ))}
                  <Pressable style={styles.addSlotButton} onPress={() => setFormState({ slot })}>
                    <Ionicons name="add" size={16} color={colors.teal} />
                    <Body style={styles.addSlotText}> Add {mealSlotLabels[slot].toLowerCase()}</Body>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </>
      )}

      {viewMode === 'grocery' && (
        <View style={styles.section}>
          <PrimaryButton
            label="Generate from this week"
            variant="outline"
            onPress={() => generateGroceryList(weekDates)}
          />
          <View style={styles.groceryList}>
            {groceryItems.length === 0 && <Body style={styles.emptyText}>No grocery items yet.</Body>}
            {groceryItems.map((item) => (
              <View key={item.id} style={styles.groceryRow}>
                <Pressable hitSlop={8} onPress={() => toggleGroceryItem(item.id)} accessibilityRole="checkbox" accessibilityState={{ checked: item.checked }} accessibilityLabel={item.label}>
                  <Ionicons name={item.checked ? 'checkbox' : 'square-outline'} size={20} color={item.checked ? colors.teal : colors.inkSoft} />
                </Pressable>
                <Body style={[styles.groceryLabel, item.checked && styles.groceryLabelChecked]}>{item.label}</Body>
                <Pressable hitSlop={8} onPress={() => confirmDeleteGrocery(item.id, item.label)} accessibilityRole="button" accessibilityLabel={`Remove ${item.label}`}>
                  <Ionicons name="close" size={16} color={colors.inkSoft} />
                </Pressable>
              </View>
            ))}
          </View>
          <View style={styles.addGroceryRow}>
            <TextInput
              value={newGroceryLabel}
              onChangeText={setNewGroceryLabel}
              placeholder="Add an item..."
              placeholderTextColor={colors.inkSoft}
              style={styles.addGroceryInput}
              onSubmitEditing={() => {
                addGroceryItem(newGroceryLabel);
                setNewGroceryLabel('');
              }}
              returnKeyType="done"
            />
            <PrimaryButton
              label="Add"
              onPress={() => {
                addGroceryItem(newGroceryLabel);
                setNewGroceryLabel('');
              }}
            />
          </View>
          {groceryItems.some((i) => i.checked) && (
            <Pressable onPress={confirmClearChecked}>
              <Caption style={styles.clearCheckedText}>Clear checked items</Caption>
            </Pressable>
          )}
        </View>
      )}

      {viewMode === 'summary' && (
        <View style={styles.section}>
          <View style={styles.periodRow}>
            {(['day', 'week', 'month'] as const).map((p) => (
              <Pressable key={p} onPress={() => setSummaryPeriod(p)} style={[styles.periodChip, summaryPeriod === p && styles.periodChipActive]}>
                <Caption style={summaryPeriod === p ? styles.periodChipTextActive : undefined}>
                  {p === 'day' ? 'Day' : p === 'week' ? 'Week' : 'Month'}
                </Caption>
              </Pressable>
            ))}
          </View>
          <Caption>{periodLabel}</Caption>

          <Card style={styles.totalCard}>
            <Eyebrow style={styles.totalLabel}>Total cost</Eyebrow>
            <SectionHeading style={styles.totalText}>{formatMoney(totalCost(periodMeals), currency)}</SectionHeading>
          </Card>

          <Card style={styles.section}>
            <Eyebrow>Cost by source</Eyebrow>
            {mealSourceOrder.map((s) => (
              <View key={s} style={styles.sourceBreakdownRow}>
                <Body>{mealSourceLabels[s]}</Body>
                <Caption>{formatMoney(sourceBreakdown[s] ?? 0, currency)}</Caption>
              </View>
            ))}
          </Card>

          <Card style={styles.section}>
            <Eyebrow>What you had</Eyebrow>
            {periodMeals.length === 0 && <Caption>Nothing planned in this period.</Caption>}
            {periodDates.map((date) => (
              <View key={date} style={styles.breakdownDay}>
                {summaryPeriod !== 'day' && <Caption style={styles.breakdownDate}>{formatDisplayDate(date)}</Caption>}
                {periodMeals
                  .filter((m) => m.date === date)
                  .sort((a, b) => mealSlots.indexOf(a.slot) - mealSlots.indexOf(b.slot))
                  .map((m) => (
                    <View key={m.id} style={styles.breakdownRow}>
                      <Caption style={styles.breakdownSlot}>{mealSlotLabels[m.slot]}</Caption>
                      <Body style={styles.breakdownName}>{m.name}</Body>
                      {m.source && <Ionicons name={mealSourceIcons[m.source] as any} size={13} color={colors.inkSoft} />}
                      <Caption>{m.cost !== undefined ? formatMoney(m.cost, currency) : '—'}</Caption>
                    </View>
                  ))}
              </View>
            ))}
          </Card>

          <Card style={styles.section}>
            <Eyebrow>Meals you repeated</Eyebrow>
            {repeated.length === 0 && <Caption>Nothing repeated yet.</Caption>}
            {repeated.map((r) => (
              <View key={r.name} style={styles.sourceBreakdownRow}>
                <Body>{r.name}</Body>
                <Caption>×{r.count}</Caption>
              </View>
            ))}
          </Card>
        </View>
      )}

      {formState && (
        <MealFormModal
          visible={!!formState}
          onClose={() => setFormState(null)}
          slotLabel={mealSlotLabels[formState.slot]}
          favorites={favorites}
          initial={formState.meal}
          onSave={(input) => {
            if (formState.meal) updateMeal(formState.meal.id, input);
            else addMeal(selectedDate, formState.slot, input);
          }}
          onDelete={
            formState.meal
              ? () => confirmDeleteMeal(formState.meal!)
              : undefined
          }
          onPickFavorite={(favoriteId) => {
            addFavoriteToDay(favoriteId, selectedDate, formState.slot);
            setFormState(null);
          }}
        />
      )}

      <FavoritesModal visible={favoritesVisible} onClose={() => setFavoritesVisible(false)} currency={currency} />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLinks: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  costRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  costInput: {
    flex: 1,
  },
  currencyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.teal,
    backgroundColor: withAlpha(colors.teal, 0.1),
  },
  currencyButtonText: {
    color: colors.teal,
    fontFamily: fonts.bodyMedium,
  },
  currencyChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  currencyChip: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
  },
  currencyChipActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  currencyChipTextActive: {
    color: colors.white,
  },
  currencyList: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  currencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  currencyRowActive: {
    borderColor: colors.teal,
  },
  currencySymbol: {
    width: 44,
    textAlign: 'center',
    fontFamily: fonts.headingSemiBold,
    fontSize: 20,
    color: colors.teal,
  },
  currencyInfo: {
    flex: 1,
  },
  breakdownDay: {
    gap: 4,
    marginTop: spacing.xs,
  },
  breakdownDate: {
    color: colors.teal,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  breakdownSlot: {
    width: 62,
  },
  breakdownName: {
    flex: 1,
  },
  headerLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subtitle: {
    marginTop: 2,
    marginBottom: spacing.md,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 2,
    marginBottom: spacing.md,
    alignSelf: 'flex-start',
  },
  segment: {
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
  },
  segmentActive: {
    backgroundColor: colors.teal,
  },
  segmentText: {
    fontFamily: fonts.bodyMedium,
  },
  segmentTextActive: {
    color: colors.white,
  },
  weekStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  weekDayCell: {
    alignItems: 'center',
    gap: 4,
  },
  weekDot: {
    width: 24,
    height: 24,
    borderRadius: radii.full,
    backgroundColor: withAlpha(colors.teal, 0.18),
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekDotEmpty: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.line,
  },
  weekDotSelected: {
    backgroundColor: colors.teal,
  },
  weekDotText: {
    fontSize: 10,
    color: colors.teal,
  },
  weekDaySelectedText: {
    color: colors.ink,
    fontFamily: fonts.bodyMedium,
  },
  slotsList: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  slotSection: {
    gap: spacing.xs,
  },
  mealCard: {
    gap: 2,
  },
  mealCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  mealName: {
    flex: 1,
  },
  tagsText: {
    color: colors.teal,
  },
  addSlotButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  addSlotText: {
    color: colors.teal,
  },
  section: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  groceryList: {
    gap: spacing.xs,
  },
  emptyText: {
    color: colors.inkSoft,
  },
  groceryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  groceryLabel: {
    flex: 1,
  },
  groceryLabelChecked: {
    textDecorationLine: 'line-through',
    color: colors.inkSoft,
  },
  addGroceryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addGroceryInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 4,
  },
  clearCheckedText: {
    color: colors.teal,
    textAlign: 'center',
  },
  periodRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  periodChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  periodChipActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  periodChipTextActive: {
    color: colors.white,
  },
  totalCard: {
    backgroundColor: colors.teal,
    gap: 2,
  },
  totalLabel: {
    color: colors.amber,
  },
  totalText: {
    color: colors.white,
  },
  sourceBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalScroll: {
    maxHeight: '85%',
  },
  modalCard: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    gap: spacing.xs,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalList: {
    marginTop: spacing.xs,
  },
  fieldLabel: {
    marginTop: spacing.sm,
  },
  favoriteRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  favoriteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.full,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  favoriteRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  favoriteRowText: {
    flex: 1,
  },
  textInput: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 4,
  },
  notesInput: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    minHeight: 50,
    textAlignVertical: 'top',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 4,
  },
  sourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.stone,
  },
  sourceChipActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  sourceChipTextActive: {
    color: colors.white,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  modalButton: {
    flex: 1,
  },
}));
