import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Song, SongStatus } from '../types/sections';
import { mockSongs } from '../data/mockData';
import { songTypes } from '../data/songTypes';
import { genId } from '../utils/id';
import { todayISO } from '../utils/date';

interface SongwritingState {
  songs: Song[];

  createSong: (title: string, songTypeId: string) => string;
  deleteSong: (id: string) => void;
  setTitle: (id: string, title: string) => void;
  setStatus: (id: string, status: SongStatus) => void;
  commitDraft: (songId: string, title: string, sectionTexts: Record<string, string>) => void;

  addInspiration: (songId: string, note: string) => void;
  removeInspiration: (songId: string, index: number) => void;
  setCollaborator: (songId: string, name: string) => void;
  toggleVoiceMemo: (songId: string) => void;

  saveVersion: (songId: string, label?: string) => void;
  restoreVersion: (songId: string, versionId: string) => void;
}

export const useSongwritingStore = create<SongwritingState>()(
  immer((set) => ({
    songs: mockSongs,

    createSong: (title, songTypeId) => {
      const id = genId('song');
      const songType = songTypes.find((t) => t.id === songTypeId);
      const now = todayISO();
      set((state) => {
        state.songs.unshift({
          id,
          title: title.trim() || 'Untitled song',
          songTypeId,
          status: 'in-progress',
          sections: (songType?.structure ?? []).map((label) => ({ id: genId('section'), label, text: '' })),
          versions: [],
          inspiration: [],
          hasVoiceMemo: false,
          createdAt: now,
          updatedAt: now,
        });
      });
      return id;
    },

    deleteSong: (id) =>
      set((state) => {
        state.songs = state.songs.filter((s) => s.id !== id);
      }),

    setTitle: (id, title) =>
      set((state) => {
        const song = state.songs.find((s) => s.id === id);
        if (song) song.title = title;
      }),

    setStatus: (id, status) =>
      set((state) => {
        const song = state.songs.find((s) => s.id === id);
        if (song) song.status = status;
      }),

    commitDraft: (songId, title, sectionTexts) =>
      set((state) => {
        const song = state.songs.find((s) => s.id === songId);
        if (!song) return;
        song.title = title.trim() || 'Untitled song';
        song.sections.forEach((section) => {
          if (sectionTexts[section.id] !== undefined) section.text = sectionTexts[section.id];
        });
        song.updatedAt = todayISO();
      }),

    addInspiration: (songId, note) =>
      set((state) => {
        const trimmed = note.trim();
        if (!trimmed) return;
        const song = state.songs.find((s) => s.id === songId);
        if (song) song.inspiration.push(trimmed);
      }),

    removeInspiration: (songId, index) =>
      set((state) => {
        const song = state.songs.find((s) => s.id === songId);
        if (song) song.inspiration.splice(index, 1);
      }),

    setCollaborator: (songId, name) =>
      set((state) => {
        const song = state.songs.find((s) => s.id === songId);
        if (song) song.collaborator = name.trim() || undefined;
      }),

    toggleVoiceMemo: (songId) =>
      set((state) => {
        const song = state.songs.find((s) => s.id === songId);
        if (song) song.hasVoiceMemo = !song.hasVoiceMemo;
      }),

    saveVersion: (songId, label) =>
      set((state) => {
        const song = state.songs.find((s) => s.id === songId);
        if (!song) return;
        song.versions.unshift({
          id: genId('version'),
          savedAt: new Date().toISOString(),
          label: label?.trim() || undefined,
          sections: song.sections.map((s) => ({ ...s })),
        });
      }),

    restoreVersion: (songId, versionId) =>
      set((state) => {
        const song = state.songs.find((s) => s.id === songId);
        const version = song?.versions.find((v) => v.id === versionId);
        if (song && version) {
          song.sections = version.sections.map((s) => ({ ...s }));
          song.updatedAt = todayISO();
        }
      }),
  }))
);
