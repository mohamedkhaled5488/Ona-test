import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { TextInput } from '../components/TextInput';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { SheetModal } from '../components/SheetModal';
import { useUi } from '../components/UiProvider';
import { useBackHandler } from '../hooks/useBackHandler';
import { ScreenTitle, SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, spacing, radii, fonts } from '../theme';
import { withAlpha } from '../utils/color';
import { useSongwritingStore } from '../store/useSongwritingStore';
import { songTypes } from '../data/songTypes';
import { findRhymes } from '../data/rhymeDictionary';
import { countLineSyllables } from '../utils/syllables';
import { basePartName } from '../utils/songSection';
import type { Song, SongSection, SongStatus } from '../types/sections';
import { themedStyles } from '../theme/runtime';

function getLastWord(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const tokens = trimmed.split(/\s+/);
  return tokens[tokens.length - 1].replace(/[^a-zA-Z']/g, '');
}

function SectionEditor({
  song,
  section,
  text,
  onChange,
}: {
  song: Song;
  section: SongSection;
  text: string;
  onChange: (text: string) => void;
}) {
  const songType = songTypes.find((t) => t.id === song.songTypeId);
  const tip = songType?.partTips[basePartName(section.label)];

  const lastWord = getLastWord(text);
  const rhymes = lastWord.length > 1 ? findRhymes(lastWord) : [];
  const lines = text.split('\n').filter((l) => l.trim().length > 0);

  return (
    <Card style={styles.sectionCard}>
      <Eyebrow>{section.label}</Eyebrow>
      {tip && <Caption style={styles.tipText}>{tip}</Caption>}
      <TextInput
        value={text}
        onChangeText={onChange}
        placeholder="Write this part..."
        placeholderTextColor={colors.inkSoft}
        style={styles.sectionInput}
        multiline
      />
      {lines.length > 0 && (
        <View style={styles.syllableRow}>
          {lines.map((line, i) => (
            <Caption key={i} style={styles.syllableText}>
              Line {i + 1}: {countLineSyllables(line)} syllables
            </Caption>
          ))}
        </View>
      )}
      {lastWord.length > 1 && (
        <View style={styles.rhymeBox}>
          <Caption style={styles.rhymeLabel}>Rhymes for "{lastWord}"</Caption>
          {rhymes.length === 0 ? (
            <Caption>No matches in the starter rhyme set.</Caption>
          ) : (
            <View style={styles.rhymeChips}>
              {rhymes.map((word) => (
                <Pressable key={word} style={styles.rhymeChip} onPress={() => onChange(`${text} ${word}`)}>
                  <Body>{word}</Body>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

function SongEditor({ song, onBack }: { song: Song; onBack: () => void }) {
  const commitDraft = useSongwritingStore((s) => s.commitDraft);
  const setStatus = useSongwritingStore((s) => s.setStatus);
  const deleteSong = useSongwritingStore((s) => s.deleteSong);
  const addInspiration = useSongwritingStore((s) => s.addInspiration);
  const removeInspiration = useSongwritingStore((s) => s.removeInspiration);
  const setCollaborator = useSongwritingStore((s) => s.setCollaborator);
  const toggleVoiceMemo = useSongwritingStore((s) => s.toggleVoiceMemo);
  const saveVersion = useSongwritingStore((s) => s.saveVersion);
  const restoreVersion = useSongwritingStore((s) => s.restoreVersion);

  const { showDialog, showToast, requestDelete } = useUi();
  const [titleDraft, setTitleDraft] = useState(song.title);
  const [draftTexts, setDraftTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(song.sections.map((sec) => [sec.id, sec.text]))
  );
  const dirty =
    titleDraft !== song.title || song.sections.some((sec) => (draftTexts[sec.id] ?? sec.text) !== sec.text);

  const save = () => {
    commitEverything();
    showToast({ message: 'Song saved' });
    onBack();
  };

  // Pending, not-yet-added text also counts as unsaved.
  const [newInspiration, setNewInspiration] = useState('');
  const [collaboratorDraft, setCollaboratorDraft] = useState(song.collaborator ?? '');
  const extrasDirty = newInspiration.trim() !== '' || collaboratorDraft.trim() !== (song.collaborator ?? '');
  const anyDirty = dirty || extrasDirty;

  const commitEverything = () => {
    commitDraft(song.id, titleDraft, draftTexts);
    setTitleDraft(titleDraft.trim() || 'Untitled song');
    if (newInspiration.trim()) {
      addInspiration(song.id, newInspiration);
      setNewInspiration('');
    }
    if (collaboratorDraft.trim() !== (song.collaborator ?? '')) setCollaborator(song.id, collaboratorDraft);
  };

  // "Back" from the editor always means: return to the song library, asking first if there is unsaved work.
  useBackHandler({ dirty: anyDirty, onSave: commitEverything, stepBack: onBack });

  const leaveToLibrary = () => {
    if (!anyDirty) return onBack();
    showDialog({
      title: 'Save your changes before leaving?',
      actions: [
        { label: 'Cancel', style: 'cancel' },
        { label: 'Discard', style: 'destructive', onPress: onBack },
        {
          label: 'Save',
          style: 'default',
          onPress: () => {
            commitEverything();
            onBack();
          },
        },
      ],
    });
  };
  const [showExtras, setShowExtras] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [versionLabel, setVersionLabel] = useState('');

  const songType = songTypes.find((t) => t.id === song.songTypeId);

  const confirmDelete = () => {
    const previous = useSongwritingStore.getState().songs;
    requestDelete({
      message: `"${song.title}" and all of its drafts will be removed.`,
      toastMessage: 'Song deleted',
      perform: () => {
        deleteSong(song.id);
        onBack();
      },
      restore: () => useSongwritingStore.setState({ songs: previous }),
    });
  };

  const confirmRemoveInspiration = (index: number, note: string) => {
    const previous = useSongwritingStore.getState().songs;
    requestDelete({
      message: `Remove "${note}" from the inspiration board?`,
      toastMessage: 'Removed',
      perform: () => removeInspiration(song.id, index),
      restore: () => useSongwritingStore.setState({ songs: previous }),
    });
  };

  return (
    <>
      <Pressable onPress={leaveToLibrary} style={styles.backLink}>
        <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
        <Caption> Song library</Caption>
      </Pressable>

      <View style={styles.titleRow}>
        <TextInput
          value={titleDraft}
          onChangeText={setTitleDraft}
          style={styles.titleInput}
        />
        <PrimaryButton label="Save" style={styles.saveButton} onPress={save} />
      </View>
      <View style={styles.metaRow}>
        <Caption>{songType?.name ?? 'Unknown type'}</Caption>
        <View style={styles.statusToggle}>
          {(['in-progress', 'finished'] as SongStatus[]).map((status) => (
            <Pressable
              key={status}
              onPress={() => setStatus(song.id, status)}
              style={[styles.statusChip, song.status === status && styles.statusChipActive]}
            >
              <Caption style={song.status === status ? styles.statusChipTextActive : undefined}>
                {status === 'in-progress' ? 'In progress' : 'Finished'}
              </Caption>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.sectionsList}>
        {song.sections.map((section) => (
          <SectionEditor
            key={section.id}
            song={song}
            section={section}
            text={draftTexts[section.id] ?? section.text}
            onChange={(text) => setDraftTexts((d) => ({ ...d, [section.id]: text }))}
          />
        ))}
      </View>

      <Pressable style={styles.collapsibleHeader} onPress={() => setShowExtras((v) => !v)}>
        <SectionHeading>Extras</SectionHeading>
        <Ionicons name={showExtras ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkSoft} />
      </Pressable>
      {showExtras && (
        <Card style={styles.section}>
          <Eyebrow>Inspiration board</Eyebrow>
          {song.inspiration.map((note, i) => (
            <View key={i} style={styles.inspirationRow}>
              <Body style={styles.inspirationText}>{note}</Body>
              <Pressable hitSlop={8} onPress={() => confirmRemoveInspiration(i, note)}>
                <Ionicons name="close" size={16} color={colors.inkSoft} />
              </Pressable>
            </View>
          ))}
          <View style={styles.addRow}>
            <TextInput
              value={newInspiration}
              onChangeText={setNewInspiration}
              placeholder="A reference song, image, or note..."
              placeholderTextColor={colors.inkSoft}
              style={styles.addInput}
              onSubmitEditing={() => {
                addInspiration(song.id, newInspiration);
                setNewInspiration('');
              }}
              returnKeyType="done"
            />
            <PrimaryButton
              label="Add"
              variant="outline"
              onPress={() => {
                addInspiration(song.id, newInspiration);
                setNewInspiration('');
              }}
            />
          </View>

          <Eyebrow style={styles.fieldSpacing}>Collaborator</Eyebrow>
          <TextInput
            value={collaboratorDraft}
            onChangeText={setCollaboratorDraft}
            onBlur={() => setCollaborator(song.id, collaboratorDraft)}
            placeholder="Credit a co-writer..."
            placeholderTextColor={colors.inkSoft}
            style={styles.textInput}
          />

          <Pressable
            style={styles.voiceMemoRow}
            onPress={() => {
              if (!song.hasVoiceMemo) {
                showToast({ message: 'Recording arrives once microphone access is wired up' });
              }
              toggleVoiceMemo(song.id);
            }}
          >
            <Ionicons name={song.hasVoiceMemo ? 'mic' : 'mic-outline'} size={16} color={song.hasVoiceMemo ? colors.teal : colors.inkSoft} />
            <Caption style={song.hasVoiceMemo ? { color: colors.teal } : undefined}>
              {' '}
              {song.hasVoiceMemo ? 'Voice memo attached (stub)' : 'Attach a voice memo'}
            </Caption>
          </Pressable>
        </Card>
      )}

      <Pressable style={styles.collapsibleHeader} onPress={() => setShowVersions((v) => !v)}>
        <SectionHeading>Draft versions</SectionHeading>
        <Ionicons name={showVersions ? 'chevron-up' : 'chevron-down'} size={18} color={colors.inkSoft} />
      </Pressable>
      {showVersions && (
        <Card style={styles.section}>
          <View style={styles.addRow}>
            <TextInput
              value={versionLabel}
              onChangeText={setVersionLabel}
              placeholder="Name this version (optional)..."
              placeholderTextColor={colors.inkSoft}
              style={styles.addInput}
            />
            <PrimaryButton
              label="Save version"
              variant="outline"
              onPress={() => {
                commitDraft(song.id, titleDraft, draftTexts);
                saveVersion(song.id, versionLabel);
                setVersionLabel('');
                showToast({ message: 'Version saved' });
              }}
            />
          </View>
          {song.versions.length === 0 && <Caption>No saved versions yet.</Caption>}
          {song.versions.map((v) => (
            <View key={v.id} style={styles.versionRow}>
              <View style={styles.versionInfo}>
                <Body>{v.label || 'Untitled version'}</Body>
                <Caption>{new Date(v.savedAt).toLocaleString()}</Caption>
              </View>
              <Pressable
                onPress={() =>
                  showDialog({
                    title: 'Restore this version?',
                    message: 'The current draft will be replaced with this version.',
                    actions: [
                      { label: 'Cancel', style: 'cancel' },
                      {
                        label: 'Restore',
                        style: 'default',
                        onPress: () => {
                          restoreVersion(song.id, v.id);
                          setDraftTexts(Object.fromEntries(v.sections.map((sec) => [sec.id, sec.text])));
                        },
                      },
                    ],
                  })
                }
              >
                <Caption style={styles.restoreText}>Restore</Caption>
              </Pressable>
            </View>
          ))}
        </Card>
      )}

      <Pressable onPress={confirmDelete} style={styles.deleteRow}>
        <Ionicons name="trash-outline" size={16} color="#B3413A" />
        <Body style={styles.deleteText}> Delete song</Body>
      </Pressable>
    </>
  );
}

function NewSongModal({ visible, onClose, onCreate }: { visible: boolean; onClose: () => void; onCreate: (title: string, typeId: string) => void }) {
  const [typeId, setTypeId] = useState(songTypes[0].id);
  const [title, setTitle] = useState('');

  return (
    <SheetModal visible={visible} onClose={onClose}>
      <View style={styles.modalHeader}>
        <SectionHeading>New song</SectionHeading>
        <Pressable hitSlop={8} onPress={onClose}>
          <Ionicons name="close" size={22} color={colors.inkSoft} />
        </Pressable>
      </View>

      <Eyebrow style={styles.fieldSpacing}>Song type</Eyebrow>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.typePickerRow}>
          {songTypes.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setTypeId(t.id)}
              style={[styles.typePickerChip, typeId === t.id && styles.typePickerChipActive]}
            >
              <Body style={typeId === t.id ? styles.typePickerTextActive : undefined}>{t.name}</Body>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Eyebrow style={styles.fieldSpacing}>Title</Eyebrow>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Untitled song"
        placeholderTextColor={colors.inkSoft}
        style={styles.textInput}
        autoFocus
      />

      <PrimaryButton
        label="Start writing"
        style={styles.fieldSpacing}
        onPress={() => {
          onCreate(title, typeId);
          setTitle('');
          onClose();
        }}
      />
    </SheetModal>
  );
}

export function SongwritingScreen() {
  const songs = useSongwritingStore((s) => s.songs);
  const createSong = useSongwritingStore((s) => s.createSong);

  const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
  const [newSongVisible, setNewSongVisible] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<SongStatus | 'all'>('all');

  const selectedSong = songs.find((s) => s.id === selectedSongId);

  if (selectedSong) {
    return (
      <Screen>
        <SongEditor song={selectedSong} onBack={() => setSelectedSongId(null)} />
      </Screen>
    );
  }

  const filtered = songs.filter((s) => {
    if (typeFilter !== 'all' && s.songTypeId !== typeFilter) return false;
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    return true;
  });

  return (
    <Screen>
      <ScreenTitle>Songwriting</ScreenTitle>
      <Caption style={styles.subtitle}>Your songs, structured by type</Caption>

      <View style={styles.filterRow}>
        <Pressable onPress={() => setStatusFilter('all')} style={[styles.filterChip, statusFilter === 'all' && styles.filterChipActive]}>
          <Caption style={statusFilter === 'all' ? styles.filterChipTextActive : undefined}>All</Caption>
        </Pressable>
        {(['in-progress', 'finished'] as SongStatus[]).map((status) => (
          <Pressable
            key={status}
            onPress={() => setStatusFilter(status)}
            style={[styles.filterChip, statusFilter === status && styles.filterChipActive]}
          >
            <Caption style={statusFilter === status ? styles.filterChipTextActive : undefined}>
              {status === 'in-progress' ? 'In progress' : 'Finished'}
            </Caption>
          </Pressable>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.typeFilterScroll}>
        <View style={styles.filterRow}>
          <Pressable onPress={() => setTypeFilter('all')} style={[styles.filterChip, typeFilter === 'all' && styles.filterChipActive]}>
            <Caption style={typeFilter === 'all' ? styles.filterChipTextActive : undefined}>All types</Caption>
          </Pressable>
          {songTypes.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => setTypeFilter(t.id)}
              style={[styles.filterChip, typeFilter === t.id && styles.filterChipActive]}
            >
              <Caption style={typeFilter === t.id ? styles.filterChipTextActive : undefined}>{t.name}</Caption>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <View style={styles.list}>
        {filtered.length === 0 && <Body style={styles.emptyText}>No songs match — start a new one below.</Body>}
        {filtered.map((song) => {
          const type = songTypes.find((t) => t.id === song.songTypeId);
          const wordCount = song.sections.reduce((sum, sec) => sum + sec.text.split(/\s+/).filter(Boolean).length, 0);
          return (
            <Pressable key={song.id} onPress={() => setSelectedSongId(song.id)}>
              <Card style={styles.songCard}>
                <View style={styles.songCardTop}>
                  <SectionHeading style={styles.songTitle}>{song.title}</SectionHeading>
                  <View style={[styles.songStatusPill, song.status === 'finished' && styles.songStatusPillFinished]}>
                    <Caption style={song.status === 'finished' ? styles.songStatusTextFinished : styles.songStatusText}>
                      {song.status === 'in-progress' ? 'In progress' : 'Finished'}
                    </Caption>
                  </View>
                </View>
                <Caption>
                  {type?.name} · {wordCount} words · {song.versions.length} saved version{song.versions.length === 1 ? '' : 's'}
                </Caption>
              </Card>
            </Pressable>
          );
        })}
      </View>

      <PrimaryButton label="New Song" style={styles.newSongButton} onPress={() => setNewSongVisible(true)} />

      <NewSongModal
        visible={newSongVisible}
        onClose={() => setNewSongVisible(false)}
        onCreate={(title, typeId) => {
          const id = createSong(title, typeId);
          setSelectedSongId(id);
        }}
      />
    </Screen>
  );
}

const styles = themedStyles(() => ({
  subtitle: {
    marginTop: 2,
    marginBottom: spacing.md,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  typeFilterScroll: {
    marginBottom: spacing.md,
  },
  filterChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  filterChipActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  filterChipTextActive: {
    color: colors.white,
  },
  list: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  emptyText: {
    color: colors.inkSoft,
  },
  songCard: {
    gap: 4,
  },
  songCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  songTitle: {
    flex: 1,
  },
  songStatusPill: {
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: withAlpha(colors.amber, 0.16),
  },
  songStatusPillFinished: {
    backgroundColor: withAlpha(colors.teal, 0.16),
  },
  songStatusText: {
    color: colors.amber,
  },
  songStatusTextFinished: {
    color: colors.teal,
  },
  newSongButton: {
    marginBottom: spacing.lg,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  saveButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  titleInput: {
    flex: 1,
    fontFamily: fonts.headingSemiBold,
    fontSize: 26,
    color: colors.ink,
    padding: 0,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  statusToggle: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  statusChip: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
  },
  statusChipActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  statusChipTextActive: {
    color: colors.white,
  },
  sectionsList: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  sectionCard: {
    gap: spacing.xs,
  },
  tipText: {
    fontStyle: 'italic',
  },
  sectionInput: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  syllableRow: {
    gap: 2,
  },
  syllableText: {},
  rhymeBox: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.xs,
    gap: 4,
  },
  rhymeLabel: {
    color: colors.teal,
  },
  rhymeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  rhymeChip: {
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.stone,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  section: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  inspirationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  inspirationText: {
    flex: 1,
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
    paddingVertical: 4,
  },
  fieldSpacing: {
    marginTop: spacing.sm,
  },
  textInput: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.ink,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingVertical: 4,
  },
  voiceMemoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  versionInfo: {
    flex: 1,
  },
  restoreText: {
    color: colors.teal,
  },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
  },
  deleteText: {
    color: '#B3413A',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
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
  typePickerRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  typePickerChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.stone,
  },
  typePickerChipActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  typePickerTextActive: {
    color: colors.white,
  },
}));
