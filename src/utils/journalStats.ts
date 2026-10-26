import type { JournalEntry } from '../types/sections';
import { addDaysISO } from './date';
import { zoneMeta, feelings } from '../data/feelingsWheel';

// "Peaceful" by default, or "Peaceful · Serene" once "Be more specific" has
// been used — the one place this composed label is built, so list, calendar
// preview, and the read/edit page all say the same thing the same way.
// An entry's feeling in words; '' when it has no colour.
export function feelingLabel(entry: Pick<JournalEntry, 'zone' | 'preciseFeelingId'>): string {
  if (!entry.zone) return '';
  const zoneLabel = zoneMeta(entry.zone).label;
  const precise = entry.preciseFeelingId ? feelings.find((f) => f.id === entry.preciseFeelingId) : undefined;
  return precise ? `${zoneLabel} · ${precise.name}` : zoneLabel;
}

export function computeStreak(entries: JournalEntry[], fromDate: string): number {
  const dates = new Set(entries.map((e) => e.date));
  let streak = 0;
  let cursor = fromDate;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = addDaysISO(cursor, -1);
  }
  return streak;
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function totalWordCount(entries: JournalEntry[]): number {
  return entries.reduce((sum, e) => sum + countWords(e.text), 0);
}

// Finds an entry from the same month/day in a previous year ("On this day").
export function findOnThisDay(entries: JournalEntry[], today: string): JournalEntry | undefined {
  const monthDay = today.slice(5); // "MM-DD"
  return entries
    .filter((e) => e.date !== today && e.date.slice(5) === monthDay)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}
