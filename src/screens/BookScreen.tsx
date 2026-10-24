import { usePlusAction } from '../components/PlusGate';
import { PlusGate } from '../components/PlusGate';
import { useCapGuard } from '../components/PlusGate';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { TextInput } from '../components/TextInput';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { SheetModal } from '../components/SheetModal';
import { TimerRing } from '../components/TimerRing';
import { QuoteCardView, shareQuoteCardImage } from '../components/QuoteCard';
import { ScreenTitle, SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, sectionAccents, spacing, radii, fonts } from '../theme';
import { withAlpha } from '../utils/color';
import { useBackHandler } from '../hooks/useBackHandler';
import { useUi } from '../components/UiProvider';
import { extractTextFromImage } from '../utils/ocr';
import { shareQuotesAsText, exportQuotesAsPdf } from '../utils/bookExport';
import { todayISO, formatDisplayDate } from '../utils/date';
import {
  useReadingListStore,
  weeklyResurfacedQuote,
  searchQuotes,
  totalReadingMinutes,
  totalPagesRead,
  type QuoteInput,
} from '../store/useReadingListStore';
import {
  MAX_PAGES,
  bookProgress,
  classifyEndPage,
  describeProgress,
  estimateMinutesLeft,
  formatTimeLeft,
  sanitizePageCount,
  suggestedStartPage,
  validateStartPage,
} from '../utils/bookProgress';
import type { Quote, ReadingListEntry, ReadingStatus } from '../types/sections';
import type { RootStackParamList } from '../navigation/types';
import { themedStyles } from '../theme/runtime';
import { useSettingsStore } from '../store/useSettingsStore';
import { SeeHowItWorks } from '../discover/SeeHowItWorks';
import { onlyDigits } from '../utils/numberInput';

type Props = NativeStackScreenProps<RootStackParamList, 'book'>;

const accent = sectionAccents.book;

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatStopwatch(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const statusMeta: Record<ReadingStatus, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  want: { label: 'Want to read', icon: 'bookmark-outline' },
  reading: { label: 'Currently reading', icon: 'book-outline' },
  finished: { label: 'Finished', icon: 'checkmark-circle-outline' },
};

type ScreenState = { kind: 'list' } | { kind: 'folder'; entryId: string } | { kind: 'quoteSearch' };

function Cover({
  book,
  size = 'small',
  overrideUri,
}: {
  book: ReadingListEntry['book'];
  size?: 'small' | 'large';
  overrideUri?: string;
}) {
  const dims = size === 'small' ? styles.coverSmall : styles.coverLarge;
  const uri = overrideUri;
  if (uri) {
    return <Image source={{ uri }} style={[dims, styles.coverImage]} resizeMode="cover" />;
  }
  return (
    <View style={[dims, styles.coverPlaceholder]}>
      <Ionicons name="book" size={size === 'small' ? 20 : 32} color={accent} />
    </View>
  );
}

// ---------------------------------------------------------------------------
function ManualAddSheet({ visible, onClose, onCreated }: { visible: boolean; onClose: () => void; onCreated: (entryId: string) => void }) {
  const addManualBook = useReadingListStore((s) => s.addManualBook);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [status, setStatus] = useState<ReadingStatus>('want');
  const [totalPages, setTotalPages] = useState('');
  const [notSure, setNotSure] = useState(false);

  const reset = () => {
    setTitle('');
    setAuthor('');
    setStatus('want');
    setTotalPages('');
    setNotSure(false);
  };

  return (
    <SheetModal
      visible={visible}
      onClose={() => {
        reset();
        onClose();
      }}
    >
      <SectionHeading>Add a book</SectionHeading>
      <Caption>Just a title and author — you can fill in the rest once it's added.</Caption>

      <Eyebrow style={styles.fieldLabel}>Title</Eyebrow>
      <TextInput value={title} onChangeText={setTitle} placeholder="Book title" placeholderTextColor={colors.inkSoft} style={styles.sheetInput} />
      <Eyebrow style={styles.fieldLabel}>Author</Eyebrow>
      <TextInput value={author} onChangeText={setAuthor} placeholder="Author" placeholderTextColor={colors.inkSoft} style={styles.sheetInput} />

      <Eyebrow style={styles.fieldLabel}>Status</Eyebrow>
      <View style={styles.statusRow}>
        {(Object.keys(statusMeta) as ReadingStatus[]).map((s) => (
          <Pressable key={s} onPress={() => setStatus(s)} style={[styles.statusChip, status === s && styles.statusChipActive]}>
            <Ionicons name={statusMeta[s].icon} size={14} color={status === s ? colors.white : accent} />
            <Caption style={status === s ? styles.statusChipTextActive : { color: accent }}> {statusMeta[s].label}</Caption>
          </Pressable>
        ))}
      </View>

      <Eyebrow style={styles.fieldLabel}>Total pages (optional)</Eyebrow>
      <View style={styles.totalRow}>
        <TextInput
          value={notSure ? '' : totalPages}
          onChangeText={(t) => setTotalPages(onlyDigits(t))}
          editable={!notSure}
          placeholder="e.g. 320"
          style={[styles.sheetInput, styles.totalInput, notSure && styles.inputDisabled]}
          keyboardType="number-pad"
          maxLength={5}
        />
        <Pressable onPress={() => setNotSure((v) => !v)} style={[styles.statusChip, notSure && styles.statusChipActive]}>
          <Caption style={notSure ? styles.statusChipTextActive : { color: accent }}>I'm not sure</Caption>
        </Pressable>
      </View>

      <PrimaryButton
        label="Create folder"
        disabled={!title.trim()}
        onPress={() => {
          const id = addManualBook(title, author, status, notSure ? undefined : sanitizePageCount(totalPages));
          reset();
          onClose();
          onCreated(id);
        }}
        style={styles.sheetSubmit}
      />
    </SheetModal>
  );
}

// A page number with -/+ either side — for the start/end page prompts.
function PageStepper({ value, onChange, max }: { value: string; onChange: (v: string) => void; max?: number }) {
  const n = sanitizePageCount(value) ?? 0;
  const step = (delta: number) => {
    const next = Math.max(1, Math.min(max ?? MAX_PAGES, n + delta));
    onChange(String(next));
  };
  return (
    <View style={styles.stepperRow}>
      <Pressable onPress={() => step(-1)} hitSlop={8} style={styles.stepperButton} accessibilityLabel="One page back">
        <Ionicons name="remove" size={20} color={accent} />
      </Pressable>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(onlyDigits(t))}
        keyboardType="number-pad"
        maxLength={5}
        selectTextOnFocus
        style={[styles.sheetInput, styles.stepperInput]}
      />
      <Pressable onPress={() => step(1)} hitSlop={8} style={styles.stepperButton} accessibilityLabel="One page forward">
        <Ionicons name="add" size={20} color={accent} />
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
function MyBooksListStage({
  onOpenFolder,
  onOpenQuoteSearch,
}: {
  onOpenFolder: (entryId: string) => void;
  onOpenQuoteSearch: () => void;
}) {
  const entries = useReadingListStore((s) => s.entries);
  const quotes = useReadingListStore((s) => s.quotes);
  const [manualOpen, setManualOpen] = useState(false);
  const guard = useCapGuard(); // Free caps (config/plans.ts); what exists stays usable

  const resurfaced = useMemo(() => weeklyResurfacedQuote(quotes, todayISO()), [quotes]);
  const resurfacedEntry = resurfaced ? entries.find((e) => e.id === resurfaced.entryId) : undefined;

  const groups: { status: ReadingStatus; label: string }[] = [
    { status: 'reading', label: 'Currently reading' },
    { status: 'want', label: 'Want to read' },
    { status: 'finished', label: 'Finished' },
  ];

  return (
    <>
      <View style={styles.headerRow}>
        <ScreenTitle>My Books</ScreenTitle>
        <Pressable accessibilityRole="button" accessibilityLabel="Search quotes" onPress={onOpenQuoteSearch} style={styles.headerLink} hitSlop={8}>
          <Ionicons name="search-outline" size={20} color={colors.inkSoft} />
        </Pressable>
      </View>
      <Caption style={styles.subtitle}>Quotes, reading sessions and progress for the books you're actually reading.</Caption>

      {/* Plus. Every quote always stays in its book. */}
      {resurfaced && resurfacedEntry && (
        <PlusGate feature="bookResurfacing">
          <Pressable onPress={() => onOpenFolder(resurfacedEntry.id)}>
            <Card style={styles.resurfaceCard}>
              <Eyebrow style={{ color: accent }}>Worth revisiting</Eyebrow>
              <Body style={styles.resurfaceText} numberOfLines={3}>"{resurfaced.text || '(a photo you saved)'}"</Body>
              <Caption>{resurfacedEntry.book.title}</Caption>
            </Card>
          </Pressable>
        </PlusGate>
      )}

      {entries.length === 0 && (
        <>
          <Body style={styles.emptyText}>Nothing here yet — add a book below to start tracking it.</Body>
          <SeeHowItWorks sectionId="book" />
        </>
      )}

      {groups.map((g) => {
        const items = entries.filter((e) => e.status === g.status);
        if (items.length === 0) return null;
        return (
          <View key={g.status} style={styles.group}>
            <Eyebrow style={styles.groupLabel}>{g.label}</Eyebrow>
            {items.map((entry) => (
              <Pressable key={entry.id} onPress={() => onOpenFolder(entry.id)}>
                <Card style={styles.entryCard}>
                  <View style={styles.entryTop}>
                    <Cover book={entry.book} overrideUri={entry.customCoverUri} />
                    <View style={styles.bookInfo}>
                      <Body numberOfLines={2}>{entry.book.title}</Body>
                      <Caption numberOfLines={1}>{entry.book.authors.join(', ')}</Caption>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.inkSoft} />
                  </View>

                  {entry.status === 'reading' && <ListProgress entry={entry} />}
                </Card>
              </Pressable>
            ))}
          </View>
        );
      })}

      <PrimaryButton label="Add a book" variant="outline" onPress={() => guard('activeBooks', () => setManualOpen(true))} style={styles.manualAddButton} />

      <ManualAddSheet visible={manualOpen} onClose={() => setManualOpen(false)} onCreated={onOpenFolder} />
    </>
  );
}

// Pages when the book has a total; the bar stays hidden until it does,
// unless the reader is tracking by percent.
function ListProgress({ entry }: { entry: ReadingListEntry }) {
  const p = bookProgress(entry);
  if (p.total) {
    return (
      <View style={styles.progressSection}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round((p.fraction ?? 0) * 100)}%` }]} />
        </View>
        <Caption>{p.current ? `${p.current} of ${p.total}` : `${p.total} pages`}</Caption>
      </View>
    );
  }
  if (p.current) return <Caption style={styles.progressSection}>Page {p.current}</Caption>;
  if (!entry.progressPercent) return null;
  return (
    <View style={styles.progressSection}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${entry.progressPercent}%` }]} />
      </View>
      <Caption>{entry.progressPercent}% done</Caption>
    </View>
  );
}

// ---------------------------------------------------------------------------
type QuoteTab = 'type' | 'photo';

function QuoteAddSheet({
  visible,
  onClose,
  onSave,
  defaultPage,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (input: QuoteInput) => void;
  defaultPage?: number; // the page the reader is on, so most quotes need no typing
}) {
  const { showToast } = useUi();
  const [tab, setTab] = useState<QuoteTab>('type');
  const [text, setText] = useState('');
  const [page, setPage] = useState('');
  const [note, setNote] = useState('');
  const [photoUri, setPhotoUri] = useState<string | undefined>(undefined);
  const [ocrRunning, setOcrRunning] = useState(false);

  useEffect(() => {
    if (visible) setPage(defaultPage ? String(defaultPage) : '');
  }, [visible, defaultPage]);

  const reset = () => {
    setTab('type');
    setText('');
    setPage('');
    setNote('');
    setPhotoUri(undefined);
    setOcrRunning(false);
  };

  const close = () => {
    reset();
    onClose();
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
      if (!result.canceled && result.assets[0]) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch {
      showToast({ message: "Couldn't open the camera on this device." });
    }
  };

  const runOcr = async () => {
    if (!photoUri) return;
    setOcrRunning(true);
    const result = await extractTextFromImage(photoUri);
    setOcrRunning(false);
    if (result.text) {
      setText(result.text);
    } else {
      showToast({ message: 'No text recognized — you can type it in yourself below.' });
    }
  };

  const canSave = tab === 'type' ? text.trim().length > 0 : !!photoUri || text.trim().length > 0;

  return (
    <SheetModal visible={visible} onClose={close}>
      <SectionHeading>Save a quote</SectionHeading>

      <View style={styles.tabRow}>
        {(['type', 'photo'] as QuoteTab[]).map((t) => (
          <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && { backgroundColor: accent }]}>
            <Body style={tab === t ? styles.tabTextActive : undefined}>{t === 'type' ? 'Type it' : 'Photograph a page'}</Body>
          </Pressable>
        ))}
      </View>

      {tab === 'photo' && (
        <>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photoPreview} resizeMode="cover" />
          ) : (
            <View style={styles.photoButtons}>
              <PrimaryButton label="Take photo" variant="outline" onPress={() => pickPhoto('camera')} style={styles.photoButton} />
              <PrimaryButton label="Choose from library" variant="outline" onPress={() => pickPhoto('library')} style={styles.photoButton} />
            </View>
          )}
          {photoUri && (
            <View style={styles.photoActionsRow}>
              <Pressable onPress={runOcr} disabled={ocrRunning} style={styles.ocrLink}>
                {ocrRunning ? <ActivityIndicator size="small" color={accent} /> : <Ionicons name="text-outline" size={16} color={accent} />}
                <Caption style={styles.ocrLinkText}> {ocrRunning ? 'Reading text...' : 'Try to extract text (OCR)'}</Caption>
              </Pressable>
              <Pressable onPress={() => setPhotoUri(undefined)}>
                <Caption style={styles.removePhotoText}>Remove photo</Caption>
              </Pressable>
            </View>
          )}
        </>
      )}

      <Eyebrow style={styles.fieldLabel}>{tab === 'photo' ? 'Extracted / edited text (optional)' : 'Quote'}</Eyebrow>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={tab === 'photo' ? 'Leave blank for a plain image-only bookmark' : 'Type the passage...'}
        placeholderTextColor={colors.inkSoft}
        style={styles.quoteTextInput}
        multiline
      />

      <Eyebrow style={styles.fieldLabel}>Page (optional)</Eyebrow>
      <TextInput value={page} onChangeText={(t) => setPage(onlyDigits(t))} placeholder="e.g. 142" placeholderTextColor={colors.inkSoft} style={styles.sheetInput} keyboardType="number-pad" />

      <Eyebrow style={styles.fieldLabel}>Why this resonated (optional)</Eyebrow>
      <TextInput value={note} onChangeText={setNote} placeholder="A personal note, separate from the quote" placeholderTextColor={colors.inkSoft} style={styles.sheetInput} multiline />

      <PrimaryButton
        label="Save quote"
        disabled={!canSave}
        onPress={() => {
          onSave({ text, pageNumber: sanitizePageCount(page), note, photoUri });
          close();
        }}
        style={styles.sheetSubmit}
      />
    </SheetModal>
  );
}

// ---------------------------------------------------------------------------
function QuoteRow({ quote, entry }: { quote: Quote; entry: ReadingListEntry }) {
  const { requestDelete } = useUi();
  const toggleQuoteFavorite = useReadingListStore((s) => s.toggleQuoteFavorite);
  const deleteQuote = useReadingListStore((s) => s.deleteQuote);
  const cardRef = useRef<View>(null);

  const remove = () => {
    const previous = useReadingListStore.getState().quotes;
    requestDelete({
      message: 'Delete this saved quote?',
      toastMessage: 'Quote deleted',
      perform: () => deleteQuote(quote.id),
      restore: () => useReadingListStore.setState({ quotes: previous }),
    });
  };

  return (
    <Card style={styles.quoteCard}>
      {quote.photoUri && <Image source={{ uri: quote.photoUri }} style={styles.quotePhoto} resizeMode="cover" />}
      {quote.text ? <Body style={styles.quoteText}>"{quote.text}"</Body> : <Caption style={styles.quoteText}>(photo only)</Caption>}
      <View style={styles.quoteMetaRow}>
        {quote.pageNumber && <Caption>p. {quote.pageNumber}</Caption>}
        <Caption>{formatDisplayDate(quote.createdAt.slice(0, 10))}</Caption>
      </View>
      {quote.note && <Caption style={styles.quoteNote}>{quote.note}</Caption>}

      <View style={styles.quoteActionsRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={quote.favorite ? 'Remove from favorites' : 'Add to favorites'} hitSlop={8} onPress={() => toggleQuoteFavorite(quote.id)} style={styles.quoteActionButton}>
          <Ionicons name={quote.favorite ? 'star' : 'star-outline'} size={18} color={colors.amber} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Share quote"
          hitSlop={8}
          onPress={() => shareQuoteCardImage(cardRef, `"${quote.text}"\n— ${entry.book.title}`)}
          style={styles.quoteActionButton}
        >
          <Ionicons name="share-outline" size={18} color={colors.inkSoft} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Delete quote" hitSlop={8} onPress={remove} style={styles.quoteActionButton}>
          <Ionicons name="trash-outline" size={18} color={colors.inkSoft} />
        </Pressable>
      </View>

      {/* Off-screen, captured on demand for the shareable quote-card image. */}
      <View style={styles.offscreen} pointerEvents="none">
        <QuoteCardView ref={cardRef} text={quote.text || '(a photo, saved without text)'} bookTitle={entry.book.title} author={entry.book.authors.join(', ')} />
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// A reading session moves through these steps. Every prompt after the timer is
// skippable — the time is still saved, and ignoring the feeling step records nothing.
type SessionFlow =
  | { step: 'idle' }
  | { step: 'askStart'; page: string; error?: string }
  | { step: 'running'; startedAt: number; startPage?: number }
  | { step: 'askEnd'; minutes: number; startPage?: number; page: string }
  | { step: 'finishOffer'; rating: number; reflection: string }
  | { step: 'feeling' };

function FolderStage({
  entryId,
  onBack,
  onLogFeeling,
  onDirtyChange,
}: {
  entryId: string;
  onBack: () => void;
  onLogFeeling: (entryId: string) => void;
  onDirtyChange: (dirty: boolean, save: () => void) => void;
}) {
  const plusAction = usePlusAction(); // PDF exports are Plus; plain export stays in Essentials mode
  const { requestDelete, showToast, showDialog } = useUi();
  const entries = useReadingListStore((s) => s.entries);
  const quotes = useReadingListStore((s) => s.quotes);
  const sessions = useReadingListStore((s) => s.sessions);
  const setProgress = useReadingListStore((s) => s.setProgress);
  const setRating = useReadingListStore((s) => s.setRating);
  const setNotes = useReadingListStore((s) => s.setNotes);
  const setCustomCover = useReadingListStore((s) => s.setCustomCover);
  const addQuote = useReadingListStore((s) => s.addQuote);
  const addSession = useReadingListStore((s) => s.addSession);
  const deleteSession = useReadingListStore((s) => s.deleteSession);

  const entry = entries.find((e) => e.id === entryId);

  const [quoteSheetOpen, setQuoteSheetOpen] = useState(false);
  const [localSearch, setLocalSearch] = useState('');
  const [sortBy, setSortBy] = useState<'page' | 'date'>('date');
  const [reviewDraft, setReviewDraft] = useState<string | undefined>(undefined);
  const [flow, setFlow] = useState<SessionFlow>({ step: 'idle' });
  // Settings → Sections → Book.
  const feelingAfterSession = useSettingsStore((s) => s.bookFeelingAfterSession);
  const showEstimate = useSettingsStore((s) => s.bookShowEstimate);
  // "Track by percent" skips the page questions and shows the percent controls.
  const byPages = useSettingsStore((s) => s.bookTrackBy) === 'pages';
  useEffect(() => {
    if (flow.step === 'feeling' && !feelingAfterSession) setFlow({ step: 'idle' });
  }, [flow.step, feelingAfterSession]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [editingTotal, setEditingTotal] = useState<string | null>(null);
  const setTotalPages = useReadingListStore((s) => s.setTotalPages);
  const setStatus = useReadingListStore((s) => s.setStatus);
  const markFinished = useReadingListStore((s) => s.markFinished);

  const runningSince = flow.step === 'running' ? flow.startedAt : null;
  useEffect(() => {
    if (runningSince === null) return;
    setElapsedSeconds(Math.floor((Date.now() - runningSince) / 1000));
    const id = setInterval(() => setElapsedSeconds(Math.floor((Date.now() - runningSince) / 1000)), 1000);
    return () => clearInterval(id);
  }, [runningSince]);

  // Leaving mid-session would lose the reading time (and a typed reflection),
  // so the screen-level back handler asks first. "Save" keeps what's safe to keep.
  const flowRef = useRef(flow);
  flowRef.current = flow;
  const saveOnLeave = () => {
    const f = flowRef.current;
    if (f.step === 'running') {
      addSession(entryId, Math.max(1, Math.round((Date.now() - f.startedAt) / 60000)), { startPage: f.startPage });
    } else if (f.step === 'askEnd') {
      const end = sanitizePageCount(f.page);
      const total = useReadingListStore.getState().entries.find((e) => e.id === entryId)?.totalPages;
      const kind = end === undefined ? undefined : classifyEndPage(f.startPage, end, total);
      const keepPage = kind === 'normal' || kind === 'finished';
      addSession(entryId, f.minutes, { startPage: f.startPage, endPage: keepPage ? end : undefined });
    } else if (f.step === 'finishOffer') {
      markFinished(entryId, { rating: f.rating || undefined, reflection: f.reflection });
    }
    setFlow({ step: 'idle' });
  };
  const flowDirty =
    flow.step === 'running' || flow.step === 'askEnd' || (flow.step === 'finishOffer' && (!!flow.reflection.trim() || flow.rating > 0));
  useEffect(() => {
    onDirtyChange(flowDirty, saveOnLeave);
    // saveOnLeave reads through flowRef, so it never goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowDirty]);

  if (!entry) {
    return (
      <>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> Back</Caption>
        </Pressable>
        <Body>This book isn't in your list anymore.</Body>
      </>
    );
  }

  const entryQuotes = quotes
    .filter((q) => q.entryId === entryId)
    .filter((q) => !localSearch.trim() || q.text.toLowerCase().includes(localSearch.trim().toLowerCase()) || q.note?.toLowerCase().includes(localSearch.trim().toLowerCase()))
    .sort((a, b) => (sortBy === 'page' ? (a.pageNumber ?? 0) - (b.pageNumber ?? 0) : b.createdAt.localeCompare(a.createdAt)));

  const entrySessions = sessions.filter((s) => s.entryId === entryId).sort((a, b) => b.date.localeCompare(a.date));
  const minutes = totalReadingMinutes(sessions, entryId);
  const pages = totalPagesRead(sessions, entryId);

  const removeEntry = () => {
    const removeAction = useReadingListStore.getState().removeEntry;
    requestDelete({
      message: `Remove "${entry.book.title}" and everything saved in its folder? This can't be undone.`,
      perform: () => {
        removeAction(entryId);
        onBack();
      },
    });
  };

  const progress = bookProgress(entry);
  const minutesLeft = estimateMinutesLeft(
    sessions.filter((s) => s.entryId === entryId),
    progress.left
  );

  const beginAskStart = () => (byPages ? setFlow({ step: 'askStart', page: String(suggestedStartPage(entry)) }) : startReading(undefined));

  const startReading = (page: string | undefined) => {
    if (page === undefined) {
      setFlow({ step: 'running', startedAt: Date.now() });
      return;
    }
    const check = validateStartPage(page, entry.totalPages);
    if (!check.ok) {
      setFlow({ step: 'askStart', page, error: check.error });
      return;
    }
    setFlow({ step: 'running', startedAt: Date.now(), startPage: check.page });
  };

  const stopSession = () => {
    if (flow.step !== 'running') return;
    const minutes = Math.max(1, Math.round((Date.now() - flow.startedAt) / 60000));
    setElapsedSeconds(0);
    if (!byPages) {
      commitSession(minutes, undefined, undefined);
      afterSave(false);
      return;
    }
    const prefill = flow.startPage ?? entry.currentPage ?? 1;
    setFlow({ step: 'askEnd', minutes, startPage: flow.startPage, page: String(prefill) });
    setElapsedSeconds(0);
  };

  const commitSession = (minutes: number, startPage: number | undefined, endPage: number | undefined) => {
    addSession(entryId, minutes, { startPage, endPage });
    if (entry.status === 'want') setStatus(entryId, 'reading');
  };

  const afterSave = (reachedEnd: boolean) =>
    setFlow(reachedEnd ? { step: 'finishOffer', rating: 0, reflection: '' } : { step: 'feeling' });

  const saveEndPage = (skip: boolean) => {
    if (flow.step !== 'askEnd') return;
    const { minutes, startPage } = flow;
    const end = skip ? undefined : sanitizePageCount(flow.page);
    if (end === undefined) {
      commitSession(minutes, startPage, undefined);
      afterSave(false);
      return;
    }
    const total = entry.totalPages;
    const kind = classifyEndPage(startPage, end, total);
    if (kind === 'reread') {
      showDialog({
        title: 'Re-reading?',
        message: `Page ${end} is before where you started (page ${startPage}). That's fine — just checking.`,
        actions: [
          { label: 'Change page', style: 'cancel' },
          {
            label: 'Yes, save it',
            onPress: () => {
              commitSession(minutes, startPage, end);
              afterSave(false);
            },
          },
        ],
      });
      return;
    }
    if (kind === 'beyondTotal') {
      showDialog({
        title: `Page ${end} is past the end`,
        message: `This book is set to ${total} pages. Update the total to ${end}?`,
        actions: [
          { label: 'Change page', style: 'cancel' },
          {
            label: `Update to ${end}`,
            onPress: () => {
              setTotalPages(entryId, end);
              commitSession(minutes, startPage, end);
              afterSave(true);
            },
          },
        ],
      });
      return;
    }
    commitSession(minutes, startPage, end);
    afterSave(kind === 'finished');
  };

  const saveTotal = (raw: string | undefined) => {
    setTotalPages(entryId, raw === undefined ? undefined : sanitizePageCount(raw));
    setEditingTotal(null);
  };

  const removeSession = (id: string) => {
    const previous = useReadingListStore.getState().sessions;
    requestDelete({
      message: 'Delete this reading session?',
      toastMessage: 'Session deleted',
      perform: () => deleteSession(id),
      restore: () => useReadingListStore.setState({ sessions: previous }),
    });
  };

  const pickCoverFrom = async (source: 'camera' | 'library') => {
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
          ? await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true, aspect: [2, 3] })
          : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsEditing: true, aspect: [2, 3] });
      if (!result.canceled && result.assets[0]) {
        setCustomCover(entryId, result.assets[0].uri);
      }
    } catch {
      showToast({ message: "Couldn't open the camera on this device." });
    }
  };

  const changeCover = () => {
    showDialog({
      title: 'Book cover',
      actions: [
        { label: 'Cancel', style: 'cancel' },
        ...(entry.customCoverUri
          ? [{ label: 'Remove custom cover', style: 'destructive' as const, onPress: () => setCustomCover(entryId, undefined) }]
          : []),
        { label: 'Choose from library', onPress: () => pickCoverFrom('library') },
        { label: 'Take photo', onPress: () => pickCoverFrom('camera') },
      ],
    });
  };

  return (
    <>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> My Books</Caption>
        </Pressable>
        <Pressable onPress={removeEntry} hitSlop={8} accessibilityRole="button" accessibilityLabel="Remove book">
          <Ionicons name="trash-outline" size={18} color={colors.inkSoft} />
        </Pressable>
      </View>

      <View style={styles.detailTop}>
        <Pressable onPress={changeCover} style={styles.coverEditWrap}>
          <Cover book={entry.book} size="large" overrideUri={entry.customCoverUri} />
          <View style={styles.coverEditBadge}>
            <Ionicons name="camera" size={14} color={colors.white} />
          </View>
        </Pressable>
        <View style={styles.detailInfo}>
          <SectionHeading>{entry.book.title}</SectionHeading>
          <Caption>{entry.book.authors.join(', ') || 'Unknown author'}</Caption>
          <Caption style={{ color: accent }}>{statusMeta[entry.status].label}</Caption>
        </View>
      </View>

      {entry.status !== 'finished' && (
        <Card style={styles.section}>
          <View style={styles.headerRow}>
            <Eyebrow>Progress</Eyebrow>
            {byPages && editingTotal === null && (
              <Pressable onPress={() => setEditingTotal(entry.totalPages ? String(entry.totalPages) : '')} hitSlop={8}>
                <Caption style={styles.progressButtonText}>{entry.totalPages ? 'Edit total pages' : 'Add total pages'}</Caption>
              </Pressable>
            )}
          </View>

          {editingTotal !== null && (
            <View style={styles.totalEditor}>
              <View style={styles.totalRow}>
                <TextInput
                  value={editingTotal}
                  onChangeText={(t) => setEditingTotal(onlyDigits(t))}
                  placeholder="Total pages"
                  style={[styles.sheetInput, styles.totalInput]}
                  keyboardType="number-pad"
                  maxLength={5}
                  autoFocus
                />
                <PrimaryButton label="Save" onPress={() => saveTotal(editingTotal)} disabled={!sanitizePageCount(editingTotal)} />
              </View>
              <View style={styles.totalLinks}>
                <Pressable onPress={() => saveTotal(undefined)} hitSlop={6}>
                  <Caption style={styles.progressButtonText}>I'm not sure</Caption>
                </Pressable>
                <Pressable onPress={() => setEditingTotal(null)} hitSlop={6}>
                  <Caption>Cancel</Caption>
                </Pressable>
              </View>
            </View>
          )}

          {byPages && progress.total ? (
            <>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.round((progress.fraction ?? 0) * 100)}%` }]} />
              </View>
              <Caption>{describeProgress(progress)}</Caption>
              {showEstimate && minutesLeft !== undefined && <Caption style={styles.timeLeft}>{capitalize(formatTimeLeft(minutesLeft))}.</Caption>}
            </>
          ) : (
            <>
              {progress.current !== undefined && <Caption>{describeProgress(progress)}</Caption>}
              {entry.status === 'reading' && progress.current === undefined && (
                <>
                  {/* No total yet — the reader can still track by percent. */}
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${entry.progressPercent ?? 0}%` }]} />
                  </View>
                  <View style={styles.progressRow}>
                    <Caption>{entry.progressPercent ?? 0}% done</Caption>
                    <View style={styles.progressButtons}>
                      <Pressable onPress={() => setProgress(entry.id, (entry.progressPercent ?? 0) - 10)}>
                        <Caption style={styles.progressButtonText}>-10%</Caption>
                      </Pressable>
                      <Pressable onPress={() => setProgress(entry.id, (entry.progressPercent ?? 0) + 10)}>
                        <Caption style={styles.progressButtonText}>+10%</Caption>
                      </Pressable>
                    </View>
                  </View>
                </>
              )}
              {editingTotal === null && <Caption style={styles.timeLeft}>Add the total page count to see pages left.</Caption>}
            </>
          )}
        </Card>
      )}

      {entry.status === 'finished' && (
        <Card style={styles.section}>
          <Eyebrow>My rating & review</Eyebrow>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable accessibilityRole="button" accessibilityState={{ selected: (entry.rating ?? 0) === n }} accessibilityLabel={`Rate ${n} out of 5`} key={n} hitSlop={4} onPress={() => setRating(entry.id, n)}>
                <Ionicons name={(entry.rating ?? 0) >= n ? 'star' : 'star-outline'} size={20} color={colors.amber} />
              </Pressable>
            ))}
          </View>
          <TextInput
            value={reviewDraft ?? entry.notes ?? ''}
            onChangeText={setReviewDraft}
            onBlur={() => reviewDraft !== undefined && setNotes(entry.id, reviewDraft)}
            placeholder="Your review..."
            placeholderTextColor={colors.inkSoft}
            style={styles.notesInput}
            multiline
          />
        </Card>
      )}

      {flow.step === 'askStart' && (
        <Card style={styles.section}>
          <Eyebrow>Which page are you starting from?</Eyebrow>
          <PageStepper value={flow.page} onChange={(page) => setFlow({ step: 'askStart', page })} max={entry.totalPages} />
          {flow.error && <Caption style={styles.flowError}>{flow.error}</Caption>}
          <PrimaryButton label="Start reading" onPress={() => startReading(flow.page)} />
          <View style={styles.flowLinks}>
            <Pressable onPress={() => startReading(undefined)} hitSlop={6}>
              <Caption style={styles.progressButtonText}>Skip — just time it</Caption>
            </Pressable>
            <Pressable onPress={() => setFlow({ step: 'idle' })} hitSlop={6}>
              <Caption>Cancel</Caption>
            </Pressable>
          </View>
        </Card>
      )}

      {flow.step === 'running' && (
        <TimerRing
          caption={flow.startPage ? `Reading from page ${flow.startPage}...` : 'Reading...'}
          timeText={formatStopwatch(elapsedSeconds)}
          primaryLabel="Stop session"
          onPrimary={stopSession}
        />
      )}

      {flow.step === 'askEnd' && (
        <Card style={styles.section}>
          <Eyebrow>Which page did you reach?</Eyebrow>
          <Caption>
            {flow.minutes} min of reading{flow.startPage ? ` from page ${flow.startPage}` : ''}.
          </Caption>
          <PageStepper value={flow.page} onChange={(page) => setFlow({ ...flow, page })} />
          <PrimaryButton label="Save session" onPress={() => saveEndPage(false)} disabled={!sanitizePageCount(flow.page)} />
          <View style={styles.flowLinks}>
            <Pressable onPress={() => saveEndPage(true)} hitSlop={6}>
              <Caption style={styles.progressButtonText}>Skip — save the time only</Caption>
            </Pressable>
          </View>
        </Card>
      )}

      {flow.step === 'finishOffer' && (
        <Card style={styles.section}>
          <Eyebrow>You reached the last page</Eyebrow>
          <Body>Mark as finished?</Body>
          <Caption>A rating and a few words are optional.</Caption>
          <View style={styles.starRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable accessibilityRole="button" accessibilityState={{ selected: flow.rating === n }} accessibilityLabel={`Rate ${n} out of 5`} key={n} hitSlop={4} onPress={() => setFlow({ ...flow, rating: flow.rating === n ? 0 : n })}>
                <Ionicons name={flow.rating >= n ? 'star' : 'star-outline'} size={20} color={colors.amber} />
              </Pressable>
            ))}
          </View>
          <TextInput
            value={flow.reflection}
            onChangeText={(reflection) => setFlow({ ...flow, reflection })}
            placeholder="What will you keep from this book?"
            style={styles.notesInput}
            multiline
          />
          <PrimaryButton
            label="Mark as finished"
            onPress={() => {
              markFinished(entryId, { rating: flow.rating || undefined, reflection: flow.reflection });
              setFlow({ step: 'feeling' });
            }}
          />
          <View style={styles.flowLinks}>
            <Pressable onPress={() => setFlow({ step: 'feeling' })} hitSlop={6}>
              <Caption style={styles.progressButtonText}>Not yet</Caption>
            </Pressable>
          </View>
        </Card>
      )}

      {flow.step === 'feeling' && feelingAfterSession && (
        <Card style={styles.section}>
          <Eyebrow>Session saved</Eyebrow>
          <Body>How did that reading feel?</Body>
          <View style={styles.flowLinks}>
            <Pressable
              onPress={() => {
                setFlow({ step: 'idle' });
                onLogFeeling(entryId);
              }}
              hitSlop={6}
            >
              <Caption style={styles.progressButtonText}>Log a feeling</Caption>
            </Pressable>
            <Pressable onPress={() => setFlow({ step: 'idle' })} hitSlop={6}>
              <Caption>Skip</Caption>
            </Pressable>
          </View>
        </Card>
      )}

      <Card style={styles.section}>
        <View style={styles.headerRow}>
          <Eyebrow>Reading sessions (optional)</Eyebrow>
        </View>
        {flow.step === 'idle' && <PrimaryButton label="Start a reading session" variant="outline" onPress={beginAskStart} />}
        {entrySessions.length > 0 && (
          <>
            <Caption style={styles.sessionTotals}>{minutes} min total{pages > 0 ? ` · ${pages} pages` : ''} over {entrySessions.length} session{entrySessions.length === 1 ? '' : 's'}</Caption>
            {entrySessions.slice(0, 5).map((s) => (
              <View key={s.id} style={styles.sessionRow}>
                <Caption style={styles.sessionRowText}>
                  {formatDisplayDate(s.date)} — {s.minutes} min
                  {s.startPage !== undefined && s.endPage !== undefined
                    ? `, p. ${s.startPage}–${s.endPage}`
                    : s.pagesRead
                      ? `, ${s.pagesRead} pages`
                      : ''}
                </Caption>
                <Pressable accessibilityRole="button" accessibilityLabel="Remove session" hitSlop={8} onPress={() => removeSession(s.id)}>
                  <Ionicons name="close" size={14} color={colors.inkSoft} />
                </Pressable>
              </View>
            ))}
          </>
        )}
      </Card>

      <View style={styles.headerRow}>
        <Eyebrow style={styles.quotesHeading}>Quotes in this book</Eyebrow>
        <Pressable onPress={() => setQuoteSheetOpen(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Add a quote">
          <Ionicons name="add-circle" size={26} color={accent} />
        </Pressable>
      </View>

      {entryQuotes.length === 0 && entryQuotes.length === quotes.filter((q) => q.entryId === entryId).length && (
        <Body style={styles.emptyText}>No quotes saved yet — tap + to add one.</Body>
      )}

      {quotes.filter((q) => q.entryId === entryId).length > 0 && (
        <View style={styles.quoteToolsRow}>
          <TextInput
            value={localSearch}
            onChangeText={setLocalSearch}
            placeholder="Search this book's quotes..."
            placeholderTextColor={colors.inkSoft}
            style={styles.searchInput}
          />
          <Pressable onPress={() => setSortBy(sortBy === 'date' ? 'page' : 'date')}>
            <Caption style={styles.sortLink}>Sort: {sortBy === 'date' ? 'Newest' : 'Page'}</Caption>
          </Pressable>
        </View>
      )}

      <View style={styles.list}>
        {entryQuotes.map((q) => (
          <QuoteRow key={q.id} quote={q} entry={entry} />
        ))}
      </View>

      {quotes.some((q) => q.entryId === entryId) && (
        <Card style={styles.section}>
          <Eyebrow>Export this book's quotes</Eyebrow>
          <View style={styles.exportRow}>
            <PrimaryButton
              label="Share as text"
              variant="outline"
              style={styles.exportButton}
              onPress={() => shareQuotesAsText(entry, quotes.filter((q) => q.entryId === entryId))}
            />
            <PrimaryButton
              label="Export as PDF"
              variant="outline"
              style={styles.exportButton}
              onPress={plusAction('pdfExports', async () => {
                const result = await exportQuotesAsPdf(entry, quotes.filter((q) => q.entryId === entryId));
                if (!result.ok && result.reason) showToast({ message: result.reason });
              })}
            />
          </View>
        </Card>
      )}

      <QuoteAddSheet
        visible={quoteSheetOpen}
        onClose={() => setQuoteSheetOpen(false)}
        onSave={(input) => addQuote(entryId, input)}
        defaultPage={entry.currentPage}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
function QuoteSearchStage({ onBack, onOpenFolder }: { onBack: () => void; onOpenFolder: (entryId: string) => void }) {
  const quotes = useReadingListStore((s) => s.quotes);
  const entries = useReadingListStore((s) => s.entries);
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchQuotes(quotes, query), [quotes, query]);

  return (
    <>
      <View style={styles.headerRow}>
        <ScreenTitle>Search your quotes</ScreenTitle>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onBack} hitSlop={8}>
          <Ionicons name="close" size={20} color={colors.inkSoft} />
        </Pressable>
      </View>
      <Caption style={styles.subtitle}>Reaches every quote in every book</Caption>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search all saved quotes..."
        placeholderTextColor={colors.inkSoft}
        style={styles.searchInput}
        autoFocus
      />

      {query.trim().length === 0 && <Body style={styles.emptyText}>Start typing to search across your whole collection.</Body>}
      {query.trim().length > 0 && results.length === 0 && <Body style={styles.emptyText}>No matching quotes.</Body>}

      <View style={styles.list}>
        {results.map((q) => {
          const entry = entries.find((e) => e.id === q.entryId);
          if (!entry) return null;
          return (
            <Pressable key={q.id} onPress={() => onOpenFolder(entry.id)}>
              <Card style={styles.quoteCard}>
                <Body style={styles.quoteText}>"{q.text}"</Body>
                <Caption>{entry.book.title}</Caption>
              </Card>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

// ---------------------------------------------------------------------------
export function BookScreen({ route, navigation }: Props) {
  const openEntryId = route.params?.openEntryId;
  const [stack, setStack] = useState<ScreenState[]>(
    openEntryId ? [{ kind: 'list' }, { kind: 'folder', entryId: openEntryId }] : [{ kind: 'list' }]
  );
  const current = stack[stack.length - 1];
  const push = (s: ScreenState) => setStack((prev) => [...prev, s]);
  const stepBack = () => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));

  const [folderDirty, setFolderDirty] = useState(false);
  const folderSave = useRef<() => void>(() => {});

  useBackHandler({
    dirty: current.kind === 'folder' && folderDirty,
    onSave: () => folderSave.current(),
    stepBack: stack.length > 1 ? stepBack : undefined,
  });

  return (
    <Screen>
      {current.kind === 'list' && (
        <MyBooksListStage
          onOpenFolder={(entryId) => push({ kind: 'folder', entryId })}
          onOpenQuoteSearch={() => push({ kind: 'quoteSearch' })}
        />
      )}
      {current.kind === 'folder' && (
        <FolderStage
          key={current.entryId}
          entryId={current.entryId}
          onBack={stepBack}
          onLogFeeling={(entryId) => navigation.push('moodCheck', { source: { kind: 'book', refId: entryId } })}
          onDirtyChange={(dirty, save) => {
            setFolderDirty(dirty);
            folderSave.current = save;
          }}
        />
      )}
      {current.kind === 'quoteSearch' && (
        <QuoteSearchStage onBack={stepBack} onOpenFolder={(entryId) => push({ kind: 'folder', entryId })} />
      )}
    </Screen>
  );
}

const styles = themedStyles(() => ({
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  totalInput: {
    flex: 1,
  },
  inputDisabled: {
    opacity: 0.5,
  },
  totalEditor: {
    gap: spacing.xs,
    marginVertical: spacing.sm,
  },
  totalLinks: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  timeLeft: {
    color: colors.inkSoft,
    marginTop: spacing.xs,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginVertical: spacing.sm,
  },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: withAlpha(accent, 0.5),
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperInput: {
    flex: 1,
    textAlign: 'center',
  },
  flowError: {
    color: colors.amber,
    marginBottom: spacing.sm,
  },
  flowLinks: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xs,
  },
  subtitle: {
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  emptyText: {
    color: colors.inkSoft,
    marginBottom: spacing.md,
  },
  list: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  coverSmall: {
    width: 44,
    height: 60,
    borderRadius: radii.sm,
  },
  coverLarge: {
    width: 90,
    height: 124,
    borderRadius: radii.sm,
  },
  coverImage: {
    backgroundColor: colors.stone,
  },
  coverPlaceholder: {
    backgroundColor: withAlpha(accent, 0.16),
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverEditWrap: {
    position: 'relative',
  },
  coverEditBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 26,
    height: 26,
    borderRadius: radii.full,
    backgroundColor: accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.stone,
  },
  bookInfo: {
    flex: 1,
    gap: 2,
  },
  detailTop: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  detailInfo: {
    flex: 1,
    gap: 4,
    justifyContent: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1.5,
    borderColor: accent,
  },
  statusChipActive: {
    backgroundColor: accent,
  },
  statusChipTextActive: {
    color: colors.white,
  },
  section: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  group: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  groupLabel: {
    marginBottom: 2,
  },
  entryCard: {
    gap: spacing.sm,
  },
  entryTop: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  progressSection: {
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
  },
  progressTrack: {
    height: 6,
    borderRadius: radii.full,
    backgroundColor: colors.stone,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: accent,
    borderRadius: radii.full,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  progressButtonText: {
    color: accent,
    fontFamily: fonts.bodyMedium,
  },
  starRow: {
    flexDirection: 'row',
    gap: 4,
  },
  notesInput: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    minHeight: 36,
  },
  manualAddButton: {
    marginBottom: spacing.xl,
  },
  resurfaceCard: {
    gap: spacing.xs,
    marginBottom: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: accent,
    backgroundColor: withAlpha(accent, 0.08),
  },
  resurfaceText: {
    fontStyle: 'italic',
  },
  sessionTotals: {
    marginTop: spacing.xs,
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  sessionRowText: {
    flex: 1,
  },
  quotesHeading: {
    marginTop: spacing.xs,
  },
  quoteToolsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: spacing.xs,
  },
  sortLink: {
    color: accent,
  },
  quoteCard: {
    gap: spacing.xs,
  },
  quotePhoto: {
    width: '100%',
    height: 140,
    borderRadius: radii.sm,
    marginBottom: spacing.xs,
    backgroundColor: colors.stone,
  },
  quoteText: {
    fontStyle: 'italic',
  },
  quoteMetaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quoteNote: {
    color: colors.inkSoft,
  },
  quoteActionsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  quoteActionButton: {
    padding: 2,
  },
  offscreen: {
    position: 'absolute',
    top: -9999,
    left: -9999,
  },
  exportRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  exportButton: {
    flex: 1,
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
  quoteTextInput: {
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
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.stone,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 2,
    marginBottom: spacing.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    alignItems: 'center',
  },
  tabTextActive: {
    color: colors.white,
  },
  photoButtons: {
    gap: spacing.sm,
  },
  photoButton: {},
  photoPreview: {
    width: '100%',
    height: 180,
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
