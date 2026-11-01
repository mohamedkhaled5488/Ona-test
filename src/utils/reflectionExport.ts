// A reflection as a PDF (Plus, like the other PDF exports): its title, date,
// theme and time, the take-away, then each question with its answer and
// follow-up. Only what the person chose to export, shared through the system
// sheet; nothing is sent anywhere by Ona.
import { Platform } from 'react-native';
import type { ReflectSession } from '../types/sections';
import { themeById } from '../reflect/questions';
import { localDateOf } from '../quit/journey';
import { formatDisplayDate } from './date';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const paragraphs = (text: string) => escapeHtml(text.trim()).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br/>');

export function buildReflectionHtml(s: ReflectSession): string {
  const theme = themeById(s.theme);
  const minutes = Math.round(s.seconds / 60);
  const meta = [formatDisplayDate(localDateOf(s.startedAt)), theme?.title, minutes ? `${minutes} min` : ''].filter(Boolean).map((m) => escapeHtml(m!)).join(' · ');
  const answered = s.answers.filter((a) => a.answer.trim() || a.followUp?.answer.trim());
  const qa = answered
    .map(
      (a) =>
        `<section><h3>${escapeHtml(a.question)}</h3><p>${paragraphs(a.answer) || '—'}</p>` +
        (a.followUp?.answer.trim() ? `<h4>${escapeHtml(a.followUp.question)}</h4><p>${paragraphs(a.followUp.answer)}</p>` : '') +
        '</section>'
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
body{font-family:-apple-system,Roboto,sans-serif;color:#222;margin:32px;line-height:1.5}
h1{font-size:22px;margin:0 0 4px}.meta{color:#777;font-size:13px;margin-bottom:20px}
.take{border-left:3px solid #8C7BA8;padding:4px 12px;margin:0 0 20px;color:#444}
h3{font-size:15px;margin:18px 0 4px}h4{font-size:13px;color:#555;margin:10px 0 2px}p{margin:0 0 6px}
</style></head><body><h1>${escapeHtml(s.title)}</h1><div class="meta">${meta}</div>${s.takeaway ? `<div class="take">${escapeHtml(s.takeaway)}</div>` : ''}${qa}</body></html>`;
}

export async function exportReflectionAsPdf(s: ReflectSession): Promise<{ ok: boolean; reason?: string }> {
  if (Platform.OS === 'web') return { ok: false, reason: 'PDF export isn’t available in the web preview. Try it on your phone.' };
  try {
    const Print = await import('expo-print');
    const Sharing = await import('expo-sharing');
    const { uri } = await Print.printToFileAsync({ html: buildReflectionHtml(s) });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Could not make a PDF right now. Please try again.' };
  }
}
