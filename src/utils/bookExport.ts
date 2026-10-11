import { Platform, Share } from 'react-native';
import type { Quote, ReadingListEntry } from '../types/sections';

function sortedQuotes(quotes: Quote[]): Quote[] {
  return [...quotes].sort((a, b) => (a.pageNumber ?? 0) - (b.pageNumber ?? 0) || a.createdAt.localeCompare(b.createdAt));
}

export function buildQuotesText(entry: ReadingListEntry, quotes: Quote[]): string {
  const header = `${entry.book.title}${entry.book.authors.length ? ` — ${entry.book.authors.join(', ')}` : ''}`;
  const body = sortedQuotes(quotes)
    .map((q) => {
      const lines = [q.text || '(photo only, no text)'];
      if (q.pageNumber) lines.push(`— p. ${q.pageNumber}`);
      if (q.note) lines.push(`Note: ${q.note}`);
      return lines.join('\n');
    })
    .join('\n\n');
  const review = entry.notes ? `\n\nMy review:\n${entry.notes}` : '';
  return [header, '', body || 'No quotes saved yet.', review].join('\n').trim();
}

// Always works, on every platform — the reliable fallback (and, per the
// spec, one of the two acceptable export formats on its own).
export async function shareQuotesAsText(entry: ReadingListEntry, quotes: Quote[]): Promise<void> {
  await Share.share({ message: buildQuotesText(entry, quotes) });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildQuotesHtml(entry: ReadingListEntry, quotes: Quote[]): string {
  const rows = sortedQuotes(quotes)
    .map(
      (q) => `
        <div class="quote">
          <p class="text">${escapeHtml(q.text || '(photo only, no text)')}</p>
          ${q.pageNumber ? `<p class="page">p. ${q.pageNumber}</p>` : ''}
          ${q.note ? `<p class="note">${escapeHtml(q.note)}</p>` : ''}
        </div>`
    )
    .join('\n');
  return `
    <html>
      <head><meta charset="utf-8" />
        <style>
          body { font-family: Georgia, serif; padding: 32px; color: #17150F; }
          h1 { margin-bottom: 0; }
          h2 { color: #6B6455; font-weight: normal; margin-top: 4px; }
          .quote { margin: 24px 0; padding-left: 16px; border-left: 3px solid #C9A430; }
          .text { font-size: 16px; line-height: 1.5; }
          .page, .note { font-size: 12px; color: #6B6455; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(entry.book.title)}</h1>
        <h2>${escapeHtml(entry.book.authors.join(', '))}</h2>
        ${rows || '<p>No quotes saved yet.</p>'}
        ${entry.notes ? `<h2>My review</h2><p>${escapeHtml(entry.notes)}</p>` : ''}
      </body>
    </html>`;
}

// PDF generation/sharing needs native modules (expo-print / expo-sharing)
// that don't behave reliably on web, so it's native-only; the text export
// above is the guaranteed-everywhere option.
export async function exportQuotesAsPdf(entry: ReadingListEntry, quotes: Quote[]): Promise<{ ok: boolean; reason?: string }> {
  if (Platform.OS === 'web') {
    return { ok: false, reason: 'PDF export isn’t available in the web preview — try "Share as text" instead, or use your phone.' };
  }
  try {
    const Print = await import('expo-print');
    const Sharing = await import('expo-sharing');
    const { uri } = await Print.printToFileAsync({ html: buildQuotesHtml(entry, quotes) });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Could not generate a PDF right now — try "Share as text" instead.' };
  }
}
