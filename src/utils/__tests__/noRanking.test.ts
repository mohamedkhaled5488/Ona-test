// Ona never tells you an order: no "best day", "most often", "works better",
// "tends to", "usually", "mostly", "fullest", "least". Analysis, insights and
// Recap show the counts behind a pattern, in a fixed order, and explain what
// they are. This scans every string a person can read in those places.
// ("Best moment" is allowed: it's something you choose yourself.)
const fs = require('fs') as { readFileSync: (p: string, e: string) => string };
const path = require('path') as { join: (...p: string[]) => string };

const FILES = [
  'src/utils/planningInsights.ts',
  'src/utils/habitStats.ts',
  'src/utils/habitTimeOfDay.ts',
  'src/utils/feelingsInsights.ts',
  'src/utils/feelingsStats.ts',
  'src/utils/skillProgress.ts',
  'src/utils/skillStats.ts',
  'src/utils/recap.ts',
  'src/utils/recapStats.ts',
  'src/utils/dietStats.ts',
  'src/utils/habitExport.ts',
  'src/config/feelingsAnalysis.ts',
  'src/screens/BuildHabitAnalysis.tsx',
  'src/screens/QuitHabitAnalysis.tsx',
  'src/screens/SkillAnalysis.tsx',
  'src/screens/SkillJourney.tsx',
  'src/screens/MoodCheckScreen.tsx',
  'src/screens/PlanningInsightsScreen.tsx',
  'src/screens/RecapScreen.tsx',
  'src/screens/DietPlanningScreen.tsx',
  'src/screens/HabitBuilderScreen.tsx',
  'src/screens/QuitHabitScreen.tsx',
  'src/screens/SkillsScreen.tsx',
  'src/screens/dailyPlanning/WeeklyReviewCard.tsx',
  'src/discover/content.ts',
];

const RANKING = /\b(most often|the most|most common|most complete|most frequent|most repeated|named most|best (time|day|week|approach)|works? best|work better|seems? to work|strongest|stands? out|fullest|biggest|tends? to|tended to|usually|mostly|the least|has worked for you)\b/i;

// The text inside string literals and JSX text, with code comments removed.
function readableText(file: string): string[] {
  const src = fs
    .readFileSync(path.join(process.cwd(), file), 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');
  const literals = src.match(/`[^`]*`|'[^'\n]*'|"[^"\n]*"/g) ?? [];
  const jsxText = src.match(/>[^<>{}\n]*[A-Za-z][^<>{}\n]*</g) ?? [];
  return [...literals, ...jsxText].filter((s) => !/best moment/i.test(s));
}

describe('no rankings anywhere a person reads an insight', () => {
  for (const file of FILES) {
    test(file, () => {
      const hits = readableText(file).filter((s) => RANKING.test(s));
      expect(hits).toEqual([]);
    });
  }
});
