import { Platform, Share } from 'react-native';
import type { FeelingCheckIn, Habit, HabitCheckIn, PersonalFeeling, QuitFeelingEntry, QuitHabit, QuitTrack } from '../types/sections';
import { findFeeling, zoneMeta } from '../data/feelingsWheel';
import { formatDisplayDate } from './date';
import { frequencyLabel } from './habitFrequency';
import { longestHabitStreak, quitHeaderStats, quitJourneyLog, type QuitLogEvent } from './habitStats';

// Same shape as skillExport.ts / bookExport.ts: a plain-text version for the
// share sheet, and an HTML version rendered to PDF on native.

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function shareHtmlAsPdf(html: string): Promise<{ ok: boolean; reason?: string }> {
  // Native-only, the same disclosed limitation as Books/Skills — expo-print
  // doesn't behave reliably on web.
  if (Platform.OS === 'web') {
    return { ok: false, reason: 'PDF export isn’t available in the web preview — try "Share as text" instead, or use your phone.' };
  }
  try {
    const Print = await import('expo-print');
    const Sharing = await import('expo-sharing');
    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Could not generate a PDF right now — try "Share as text" instead.' };
  }
}

const PDF_STYLE = `
  body { font-family: Georgia, serif; padding: 32px; color: #17150F; }
  h1 { margin-bottom: 0; }
  h2 { color: #6B6455; font-weight: normal; margin-top: 4px; }
  .stats { color: #6B6455; font-size: 13px; margin: 12px 0 24px; }
  .entry { margin: 18px 0; padding-left: 14px; border-left: 3px solid #8A8577; }
  .entry.done { border-left-color: #6E7F91; }
  .entry.missed, .entry.relapse { border-left-color: #A39E94; }
  .entry.resisted { border-left-color: #E8B23D; }
  .meta { font-size: 12px; color: #6B6455; margin: 0 0 4px; }
  .line { font-size: 14px; margin: 2px 0; }
  .note { font-size: 15px; line-height: 1.5; font-style: italic; }
  .photo { max-width: 320px; border-radius: 8px; margin: 8px 0; }`;

// --- Build habit ---

function habitFeelingByDate(feelings: FeelingCheckIn[], habitId: string): Map<string, FeelingCheckIn> {
  return new Map(feelings.filter((e) => e.source?.kind === 'habit' && e.source.refId === habitId).map((e) => [e.date, e]));
}

function habitStatsLine(habit: Habit, checkIns: HabitCheckIn[]): string {
  const mine = checkIns.filter((c) => c.habitId === habit.id);
  const done = mine.filter((c) => c.done).length;
  const longest = longestHabitStreak(checkIns, habit.id, habit.frequency);
  const unit = habit.frequency?.kind === 'perWeek' ? (longest === 1 ? 'week' : 'weeks') : longest === 1 ? 'day' : 'days';
  return `${frequencyLabel(habit.frequency)} · ${done} completion${done === 1 ? '' : 's'} · longest streak ${longest} ${unit} · target ${habit.targetDays} days`;
}

function sortedCheckIns(habitId: string, checkIns: HabitCheckIn[]): HabitCheckIn[] {
  return checkIns.filter((c) => c.habitId === habitId).sort((a, b) => a.date.localeCompare(b.date));
}

export function buildHabitReportText(habit: Habit, checkIns: HabitCheckIn[], feelings: FeelingCheckIn[]): string {
  const feelingByDate = habitFeelingByDate(feelings, habit.id);
  const header = [
    `${habit.name} — since ${formatDisplayDate(habit.createdAt)}`,
    habit.cueRoutine ? `After I ${habit.cueRoutine}, I will ${habit.name.toLowerCase()}.` : '',
    habitStatsLine(habit, checkIns),
  ].filter(Boolean);
  const body = sortedCheckIns(habit.id, checkIns)
    .map((c) => {
      const lines = [`${formatDisplayDate(c.date)} — ${c.done ? (c.minimum ? 'Done (minimum version)' : 'Done') : 'Missed'}${c.durationMinutes ? ` · ${c.durationMinutes} min session` : ''}`];
      const feeling = feelingByDate.get(c.date);
      if (feeling) lines.push(`Felt ${zoneMeta(feeling.zone).label}`);
      if (c.reasonTags?.length) lines.push(`What got in the way: ${c.reasonTags.join(', ')}`);
      if (c.note) lines.push(c.note);
      if (c.photoUri) lines.push('[photo attached]');
      return lines.join('\n');
    })
    .join('\n\n');
  return [...header, '', body || 'No check-ins yet.'].join('\n').trim();
}

export async function shareHabitReportAsText(habit: Habit, checkIns: HabitCheckIn[], feelings: FeelingCheckIn[]): Promise<void> {
  await Share.share({ message: buildHabitReportText(habit, checkIns, feelings) });
}

export function buildHabitReportHtml(habit: Habit, checkIns: HabitCheckIn[], feelings: FeelingCheckIn[]): string {
  const feelingByDate = habitFeelingByDate(feelings, habit.id);
  const rows = sortedCheckIns(habit.id, checkIns)
    .map((c) => {
      const feeling = feelingByDate.get(c.date);
      return `
        <div class="entry ${c.done ? 'done' : 'missed'}">
          <p class="meta">${escapeHtml(formatDisplayDate(c.date))} · ${c.done ? (c.minimum ? 'Done (minimum version)' : 'Done') : 'Missed'}${c.durationMinutes ? ` · ${c.durationMinutes} min session` : ''}</p>
          ${feeling ? `<p class="line">Felt ${escapeHtml(zoneMeta(feeling.zone).label)}</p>` : ''}
          ${c.reasonTags?.length ? `<p class="line">What got in the way: ${escapeHtml(c.reasonTags.join(', '))}</p>` : ''}
          ${c.photoUri ? `<img src="${c.photoUri}" class="photo" />` : ''}
          ${c.note ? `<p class="note">${escapeHtml(c.note)}</p>` : ''}
        </div>`;
    })
    .join('\n');
  return `
    <html><head><meta charset="utf-8" /><style>${PDF_STYLE}</style></head>
      <body>
        <h1>${escapeHtml(habit.name)}</h1>
        <h2>Since ${escapeHtml(formatDisplayDate(habit.createdAt))}</h2>
        <p class="stats">${escapeHtml(habitStatsLine(habit, checkIns))}</p>
        ${rows || '<p>No check-ins yet.</p>'}
      </body>
    </html>`;
}

export function exportHabitReportAsPdf(habit: Habit, checkIns: HabitCheckIn[], feelings: FeelingCheckIn[]) {
  return shareHtmlAsPdf(buildHabitReportHtml(habit, checkIns, feelings));
}

// --- Quit habit: the whole Journey, every track ---

function feelingName(id: string | undefined, personal: PersonalFeeling[]): string {
  if (!id) return '';
  return findFeeling(id)?.name ?? personal.find((p) => p.id === id)?.name ?? 'Feeling';
}

function quitStatsLine(tracks: QuitTrack[], entries: QuitFeelingEntry[], habitId: string, today: string): string {
  const s = quitHeaderStats(tracks, entries, habitId, today);
  return `${s.trackCount} track${s.trackCount === 1 ? '' : 's'} · longest stretch ${s.longestDays} days · ${s.resistedTotal} urge${s.resistedTotal === 1 ? '' : 's'} resisted`;
}

function describeEvent(e: QuitLogEvent, personal: PersonalFeeling[]): { cls: string; title: string; lines: string[]; note?: string } {
  if (e.kind === 'trackStart') return { cls: '', title: `Track ${e.trackNumber} started`, lines: [] };
  if (e.kind === 'trackEnd') {
    return {
      cls: 'relapse',
      title: `Went back to it — track ${e.trackNumber} ended after ${e.days} day${e.days === 1 ? '' : 's'}`,
      lines: e.reasonTags?.length ? [`What was going on: ${e.reasonTags.join(', ')}`] : [],
      note: e.reflection,
    };
  }
  const entry = e.entry;
  const felt = feelingName(entry.feelingId, personal) || (entry.zone ? zoneMeta(entry.zone).label : '');
  const lines = felt ? [`Felt ${felt}`] : [];
  if (entry.isResistedUrge && entry.approach) {
    lines.push(`${entry.approach}${entry.urgePassed === true ? ' — the urge passed' : entry.urgePassed === false ? " — didn't act on it" : ''}`);
  }
  return {
    cls: entry.isResistedUrge ? 'resisted' : entry.isRelapseMoment ? 'relapse' : '',
    title: entry.isResistedUrge ? 'Resisted an urge' : entry.isRelapseMoment ? 'Felt, as the track ended' : 'Checked in',
    lines,
    note: entry.note,
  };
}

// Oldest first in an export — it reads as the story of the journey.
function chronological(tracks: QuitTrack[], entries: QuitFeelingEntry[], habitId: string): QuitLogEvent[] {
  return quitJourneyLog(tracks, entries, habitId).reverse();
}

export function buildQuitJourneyText(habit: QuitHabit, tracks: QuitTrack[], entries: QuitFeelingEntry[], personal: PersonalFeeling[], today: string): string {
  const header = [`${habit.name} — the journey since ${formatDisplayDate(habit.createdAt)}`, habit.why ? `Why: ${habit.why}` : '', quitStatsLine(tracks, entries, habit.id, today)].filter(Boolean);
  const body = chronological(tracks, entries, habit.id)
    .map((e) => {
      const d = describeEvent(e, personal);
      return [`${formatDisplayDate(e.date)} — ${d.title}`, ...d.lines, ...(d.note ? [d.note] : [])].join('\n');
    })
    .join('\n\n');
  return [...header, '', body].join('\n').trim();
}

export async function shareQuitJourneyAsText(habit: QuitHabit, tracks: QuitTrack[], entries: QuitFeelingEntry[], personal: PersonalFeeling[], today: string): Promise<void> {
  await Share.share({ message: buildQuitJourneyText(habit, tracks, entries, personal, today) });
}

export function buildQuitJourneyHtml(habit: QuitHabit, tracks: QuitTrack[], entries: QuitFeelingEntry[], personal: PersonalFeeling[], today: string): string {
  const rows = chronological(tracks, entries, habit.id)
    .map((e) => {
      const d = describeEvent(e, personal);
      return `
        <div class="entry ${d.cls}">
          <p class="meta">${escapeHtml(formatDisplayDate(e.date))} · ${escapeHtml(d.title)}</p>
          ${d.lines.map((l) => `<p class="line">${escapeHtml(l)}</p>`).join('')}
          ${d.note ? `<p class="note">${escapeHtml(d.note)}</p>` : ''}
        </div>`;
    })
    .join('\n');
  return `
    <html><head><meta charset="utf-8" /><style>${PDF_STYLE}</style></head>
      <body>
        <h1>${escapeHtml(habit.name)}</h1>
        <h2>The journey since ${escapeHtml(formatDisplayDate(habit.createdAt))}</h2>
        ${habit.why ? `<p class="note">${escapeHtml(habit.why)}</p>` : ''}
        <p class="stats">${escapeHtml(quitStatsLine(tracks, entries, habit.id, today))}</p>
        ${rows}
      </body>
    </html>`;
}

export function exportQuitJourneyAsPdf(habit: QuitHabit, tracks: QuitTrack[], entries: QuitFeelingEntry[], personal: PersonalFeeling[], today: string) {
  return shareHtmlAsPdf(buildQuitJourneyHtml(habit, tracks, entries, personal, today));
}
