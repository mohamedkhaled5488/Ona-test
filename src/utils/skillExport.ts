import { Platform, Share } from 'react-native';
import type { PracticeSession, Skill } from '../types/sections';
import { formatDisplayDate } from './date';
import {
  DIFFICULTY_LABELS,
  LEVEL_LABELS,
  buildJourney,
  describeMetricChange,
  formatHours,
  formatMetricValue,
  metricChange,
  metricSeries,
  primaryMetric,
  subSkillName,
  totalMinutesFor,
  type MetricPoint,
} from './skillProgress';

function sorted(sessions: PracticeSession[]): PracticeSession[] {
  return [...sessions].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

function sessionDetailLines(skill: Skill, s: PracticeSession): string[] {
  const lines: string[] = [];
  if (s.focusSubSkillIds?.length) lines.push(`Focus: ${s.focusSubSkillIds.map((id) => subSkillName(skill, id)).join(', ')}`);
  if (s.difficulty) lines.push(`Difficulty: ${DIFFICULTY_LABELS[s.difficulty]}`);
  Object.entries(s.metricValues ?? {}).forEach(([id, v]) => {
    const m = (skill.metrics ?? []).find((x) => x.id === id);
    lines.push(`${m?.name ?? 'Metric'}: ${formatMetricValue(v, m?.unit ?? '')}`);
  });
  const struggled = [...(s.struggledSubSkillIds ?? []).map((id) => subSkillName(skill, id)), s.struggledText].filter(Boolean);
  if (struggled.length) lines.push(`Struggled with: ${struggled.join(' · ')}`);
  if (s.breakthrough) lines.push('Something clicked');
  if (s.feedback) lines.push(`Feedback (${s.feedback.from}): ${s.feedback.text}`);
  return lines;
}

function headerLines(skill: Skill, sessions: PracticeSession[]): string[] {
  const level = skill.currentLevel ?? skill.startingLevel;
  const lines = [`${formatHours(totalMinutesFor(sessions, skill.id))} invested over ${sessions.length} session${sessions.length === 1 ? '' : 's'}`];
  if (level) lines.push(`Level: ${LEVEL_LABELS[level]}`);
  if (skill.goal) lines.push(`Goal: ${skill.goal}${skill.goalTargetDate ? ` (by ${formatDisplayDate(skill.goalTargetDate)})` : ''}`);
  const metric = primaryMetric(skill);
  if (metric) {
    const change = metricChange(metricSeries(sessions, skill.id, metric.id), metric.direction);
    if (change) lines.push(`${metric.name}: ${describeMetricChange(metric, change)}`);
  }
  return lines;
}

export function buildPortfolioText(skill: Skill, sessions: PracticeSession[]): string {
  const header = `${skill.name} — practicing since ${formatDisplayDate(skill.startDate)}`;
  const milestones = skill.milestones.map((m) => `${m.achieved ? '✓' : '○'} ${m.text}${m.achievedAt ? ` — ${formatDisplayDate(m.achievedAt)}` : ''}`);
  const journey = buildJourney(skill, sessions)
    .filter((e) => e.kind !== 'photo')
    .map((e) => `${e.kind === 'next' ? 'Next' : formatDisplayDate(e.date)} — ${e.title}`);
  const body = sorted(sessions)
    .map((s) => {
      const lines = [`${formatDisplayDate(s.date)}${s.minutes ? ` — ${s.minutes} min` : ''}${s.tag ? ` (${s.tag})` : ''}`];
      if (s.notes) lines.push(s.notes);
      lines.push(...sessionDetailLines(skill, s));
      if (s.photoUri) lines.push('[photo attached]');
      return lines.join('\n');
    })
    .join('\n\n');
  return [
    header,
    ...headerLines(skill, sessions),
    ...(milestones.length ? ['', 'Milestones', ...milestones] : []),
    '',
    'Journey',
    ...journey,
    '',
    'Sessions',
    body || 'No sessions logged yet.',
  ]
    .join('\n')
    .trim();
}

export async function shareSkillPortfolioAsText(skill: Skill, sessions: PracticeSession[]): Promise<void> {
  await Share.share({ message: buildPortfolioText(skill, sessions) });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// A small static line chart of the primary metric, drawn as SVG so it prints.
export function metricChartSvg(series: MetricPoint[], color: string, width = 480, height = 160): string {
  if (series.length < 2) return '';
  const pad = 16;
  const t0 = new Date(`${series[0].date}T00:00:00`).getTime();
  const t1 = new Date(`${series[series.length - 1].date}T00:00:00`).getTime();
  const vs = series.map((p) => p.value);
  const lo = Math.min(...vs);
  const hi = Math.max(...vs);
  const x = (d: string) => pad + ((new Date(`${d}T00:00:00`).getTime() - t0) / Math.max(1, t1 - t0)) * (width - 2 * pad);
  const y = (v: number) => height - pad - ((v - lo) / Math.max(1e-9, hi - lo)) * (height - 2 * pad);
  const path = series.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const dots = series.map((p) => `<circle cx="${x(p.date).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3" fill="${color}" />`).join('');
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><path d="${path}" fill="none" stroke="${color}" stroke-width="2" />${dots}</svg>`;
}

function buildPortfolioHtml(skill: Skill, sessions: PracticeSession[]): string {
  const metric = primaryMetric(skill);
  const series = metric ? metricSeries(sessions, skill.id, metric.id) : [];
  const rows = sorted(sessions)
    .map(
      (s) => `
        <div class="session">
          <p class="meta">${escapeHtml(formatDisplayDate(s.date))}${s.minutes ? ` · ${s.minutes} min` : ''}${s.tag ? ` · ${escapeHtml(s.tag)}` : ''}</p>
          ${s.photoUri ? `<img src="${s.photoUri}" class="photo" />` : ''}
          ${s.notes ? `<p class="notes">${escapeHtml(s.notes)}</p>` : ''}
          ${sessionDetailLines(skill, s).map((l) => `<p class="detail">${escapeHtml(l)}</p>`).join('')}
        </div>`
    )
    .join('\n');
  const milestones = skill.milestones
    .map((m) => `<li>${m.achieved ? '✓' : '○'} ${escapeHtml(m.text)}${m.achievedAt ? ` — ${escapeHtml(formatDisplayDate(m.achievedAt))}` : ''}</li>`)
    .join('');
  const journey = buildJourney(skill, sessions)
    .filter((e) => e.kind !== 'photo')
    .map((e) => `<li><span class="meta">${e.kind === 'next' ? 'Next' : escapeHtml(formatDisplayDate(e.date))}</span> ${escapeHtml(e.title)}</li>`)
    .join('');
  return `
    <html>
      <head><meta charset="utf-8" />
        <style>
          body { font-family: Georgia, serif; padding: 32px; color: #17150F; }
          h1 { margin-bottom: 0; }
          h2 { color: #6B6455; font-weight: normal; margin-top: 4px; }
          h3 { margin-top: 28px; }
          .summary p { margin: 2px 0; font-size: 14px; }
          .session { margin: 24px 0; padding-left: 16px; border-left: 3px solid ${skill.color}; }
          .meta { font-size: 12px; color: #6B6455; }
          .notes { font-size: 15px; line-height: 1.5; }
          .detail { font-size: 13px; margin: 2px 0; }
          .photo { max-width: 320px; border-radius: 8px; margin: 8px 0; }
          ul { padding-left: 18px; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(skill.name)}</h1>
        <h2>Practicing since ${escapeHtml(formatDisplayDate(skill.startDate))}</h2>
        <div class="summary">${headerLines(skill, sessions).map((l) => `<p>${escapeHtml(l)}</p>`).join('')}</div>
        ${metric && series.length >= 2 ? `<h3>${escapeHtml(metric.name)}${metric.direction === 'lower' ? ' (lower is better)' : ''}</h3>${metricChartSvg(series, skill.color)}` : ''}
        ${milestones ? `<h3>Milestones</h3><ul>${milestones}</ul>` : ''}
        <h3>Journey</h3><ul>${journey}</ul>
        <h3>Sessions</h3>
        ${rows || '<p>No sessions logged yet.</p>'}
      </body>
    </html>`;
}

// Native-only, same disclosed limitation as Books' PDF export — expo-print
// doesn't behave reliably on web.
export async function exportSkillPortfolioAsPdf(skill: Skill, sessions: PracticeSession[]): Promise<{ ok: boolean; reason?: string }> {
  if (Platform.OS === 'web') {
    return { ok: false, reason: 'PDF export isn’t available in the web preview — try "Share as text" instead, or use your phone.' };
  }
  try {
    const Print = await import('expo-print');
    const Sharing = await import('expo-sharing');
    const { uri } = await Print.printToFileAsync({ html: buildPortfolioHtml(skill, sessions) });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf' });
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'Could not generate a PDF right now — try "Share as text" instead.' };
  }
}
