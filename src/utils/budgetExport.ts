import { Platform, Share } from 'react-native';
import type { Budget, BudgetEntry } from '../types/sections';
import { formatMoney } from '../data/currencies';
import { formatDisplayDate } from './date';

function sorted(entries: BudgetEntry[]): BudgetEntry[] {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

export function buildBudgetReportText(budget: Budget, entries: BudgetEntry[], total: number): string {
  const header = `${budget.name} — ${budget.mode === 'goal' ? 'savings goal' : 'spending limit'}: ${formatMoney(budget.targetAmount, budget.currency)}`;
  const totalLine = `${budget.mode === 'goal' ? 'Saved' : 'Spent'} so far: ${formatMoney(total, budget.currency)}`;
  const body = sorted(entries)
    .map((e) => {
      const lines = [`${formatDisplayDate(e.date)} — ${formatMoney(e.amount, budget.currency)}`];
      if (e.categoryId) {
        const cat = budget.categories.find((c) => c.id === e.categoryId);
        if (cat) lines[0] += ` (${cat.label})`;
      }
      if (e.note) lines.push(e.note);
      return lines.join('\n');
    })
    .join('\n\n');
  return [header, totalLine, '', body || 'Nothing logged yet.'].join('\n').trim();
}

export async function shareBudgetAsText(budget: Budget, entries: BudgetEntry[], total: number): Promise<void> {
  await Share.share({ message: buildBudgetReportText(budget, entries, total) });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildBudgetHtml(budget: Budget, entries: BudgetEntry[], total: number): string {
  const rows = sorted(entries)
    .map((e) => {
      const cat = e.categoryId ? budget.categories.find((c) => c.id === e.categoryId) : undefined;
      return `
        <div class="entry">
          <p class="meta">${escapeHtml(formatDisplayDate(e.date))} · ${escapeHtml(formatMoney(e.amount, budget.currency))}${cat ? ` · ${escapeHtml(cat.label)}` : ''}</p>
          ${e.photoUri ? `<img src="${e.photoUri}" class="photo" />` : ''}
          ${e.note ? `<p class="notes">${escapeHtml(e.note)}</p>` : ''}
        </div>`;
    })
    .join('\n');
  return `
    <html>
      <head><meta charset="utf-8" />
        <style>
          body { font-family: Georgia, serif; padding: 32px; color: #17150F; }
          h1 { margin-bottom: 0; }
          h2 { color: #6B6455; font-weight: normal; margin-top: 4px; }
          .entry { margin: 20px 0; padding-left: 16px; border-left: 3px solid #4E9A7A; }
          .meta { font-size: 12px; color: #6B6455; }
          .notes { font-size: 15px; line-height: 1.5; }
          .photo { max-width: 320px; border-radius: 8px; margin: 8px 0; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(budget.name)}</h1>
        <h2>${budget.mode === 'goal' ? 'Saved' : 'Spent'} ${escapeHtml(formatMoney(total, budget.currency))} of ${escapeHtml(formatMoney(budget.targetAmount, budget.currency))}</h2>
        ${rows || '<p>Nothing logged yet.</p>'}
      </body>
    </html>`;
}

// Native-only, same disclosed limitation as Skills'/Books' PDF export.
export async function exportBudgetAsPdf(budget: Budget, entries: BudgetEntry[], total: number): Promise<{ ok: boolean; reason?: string }> {
  if (Platform.OS === 'web') {
    return { ok: false, reason: 'PDF export isn’t available in the web preview — try "Share as text" instead, or use your phone.' };
  }
  try {
    const Print = await import('expo-print');
    const Sharing = await import('expo-sharing');
    const { uri } = await Print.printToFileAsync({ html: buildBudgetHtml(budget, entries, total) });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Could not generate a PDF right now — try "Share as text" instead.' };
  }
}
