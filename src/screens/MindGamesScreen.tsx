import React, { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { TextInput } from '../components/TextInput';
import { Ionicons } from '@expo/vector-icons';
import { useBackHandler } from '../hooks/useBackHandler';
import { Screen } from '../components/Screen';
import { Card } from '../components/Card';
import { ScreenTitle, SectionHeading, Eyebrow, Body, Caption } from '../components/Typography';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, spacing, radii, fonts } from '../theme';
import { withAlpha } from '../utils/color';
import { useMindGamesStore, personalBest } from '../store/useMindGamesStore';
import {
  gameOrder,
  gameMeta,
  memoryPairsByDifficulty,
  reactionRoundsByDifficulty,
  mathSecondsByDifficulty,
  wordListByDifficulty,
  difficultyLabels,
  difficultyOrder,
} from '../data/gameMeta';
import { dayOfYear, todayISO } from '../utils/date';
import type { Difficulty, GameId } from '../types/sections';
import { themedStyles } from '../theme/runtime';

const memoryIcons = ['leaf', 'star', 'heart', 'moon', 'sunny', 'flower', 'paw', 'rocket', 'musical-notes', 'diamond'];

function DifficultyPicker({ value, onChange }: { value: Difficulty; onChange: (d: Difficulty) => void }) {
  return (
    <View style={styles.difficultyRow}>
      {difficultyOrder.map((d) => (
        <Pressable key={d} onPress={() => onChange(d)} style={[styles.difficultyChip, value === d && styles.difficultyChipActive]}>
          <Body style={value === d ? styles.difficultyChipTextActive : undefined}>{difficultyLabels[d]}</Body>
        </Pressable>
      ))}
    </View>
  );
}

function ResultCard({ gameId, difficulty, score, onPlayAgain, onBack }: { gameId: GameId; difficulty: Difficulty; score: number; onPlayAgain: () => void; onBack: () => void }) {
  const results = useMindGamesStore((s) => s.results);
  const meta = gameMeta[gameId];
  const best = personalBest(results, gameId, difficulty, meta.betterWhen);
  const isNewBest = best === score;

  return (
    <Card style={styles.resultCard}>
      <Eyebrow>Result</Eyebrow>
      <SectionHeading>
        {score} {meta.unit}
      </SectionHeading>
      {isNewBest ? (
        <Caption style={styles.newBestText}>New personal best for {difficultyLabels[difficulty]}!</Caption>
      ) : (
        best !== undefined && <Caption>Personal best: {best} {meta.unit}</Caption>
      )}
      <View style={styles.resultActions}>
        <PrimaryButton label="Play again" style={styles.resultButton} onPress={onPlayAgain} />
        <PrimaryButton label="Back to games" variant="outline" style={styles.resultButton} onPress={onBack} />
      </View>
    </Card>
  );
}

// --- Memory Match ---
interface MemoryCard {
  key: string;
  icon: string;
  matched: boolean;
}

function MemoryMatchGame({ onExit }: { onExit: () => void }) {
  const addResult = useMindGamesStore((s) => s.addResult);
  const [phase, setPhase] = useState<'setup' | 'playing' | 'result'>('setup');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [cards, setCards] = useState<MemoryCard[]>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);

  const setup = () => {
    const pairCount = memoryPairsByDifficulty[difficulty];
    const icons = memoryIcons.slice(0, pairCount);
    const deck = [...icons, ...icons]
      .map((icon, i) => ({ key: `${icon}-${i}`, icon, matched: false }))
      .sort(() => Math.random() - 0.5);
    setCards(deck);
    setFlipped([]);
    setMoves(0);
    setPhase('playing');
  };

  const onTapCard = (index: number) => {
    if (flipped.length === 2 || flipped.includes(index) || cards[index].matched) return;
    const next = [...flipped, index];
    setFlipped(next);
    if (next.length === 2) {
      setMoves((m) => m + 1);
      const [a, b] = next;
      if (cards[a].icon === cards[b].icon) {
        const updated = cards.map((c, i) => (i === a || i === b ? { ...c, matched: true } : c));
        setCards(updated);
        setFlipped([]);
        if (updated.every((c) => c.matched)) {
          addResult('memory', difficulty, moves + 1);
          setTimeout(() => setPhase('result'), 300);
        }
      } else {
        setTimeout(() => setFlipped([]), 700);
      }
    }
  };

  if (phase === 'setup') {
    return (
      <Card style={styles.setupCard}>
        <Eyebrow>Difficulty</Eyebrow>
        <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        <PrimaryButton label="Start" onPress={setup} />
      </Card>
    );
  }

  if (phase === 'result') {
    return <ResultCard gameId="memory" difficulty={difficulty} score={moves} onPlayAgain={setup} onBack={onExit} />;
  }

  return (
    <View>
      <Caption style={styles.movesText}>{moves} {moves === 1 ? 'move' : 'moves'}</Caption>
      <View style={styles.memoryGrid}>
        {cards.map((card, i) => {
          const isFaceUp = card.matched || flipped.includes(i);
          return (
            <Pressable key={card.key} onPress={() => onTapCard(i)} style={styles.memoryCard}>
              <View style={[styles.memoryCardInner, isFaceUp && styles.memoryCardFaceUp]}>
                {isFaceUp && <Ionicons name={card.icon as any} size={22} color={card.matched ? colors.teal : colors.ink} />}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// --- Reaction Time ---
function ReactionGame({ onExit }: { onExit: () => void }) {
  const addResult = useMindGamesStore((s) => s.addResult);
  const [phase, setPhase] = useState<'setup' | 'waiting' | 'go' | 'tooSoon' | 'result'>('setup');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [round, setRound] = useState(0);
  const [times, setTimes] = useState<number[]>([]);
  const goAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalRounds = reactionRoundsByDifficulty[difficulty];

  const startRound = () => {
    setPhase('waiting');
    const delay = 1200 + Math.random() * 2500;
    timerRef.current = setTimeout(() => {
      goAtRef.current = Date.now();
      setPhase('go');
    }, delay);
  };

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const setup = () => {
    setTimes([]);
    setRound(0);
    startRound();
  };

  const onTap = () => {
    if (phase === 'waiting') {
      if (timerRef.current) clearTimeout(timerRef.current);
      setPhase('tooSoon');
      return;
    }
    if (phase === 'go') {
      const reactionMs = Date.now() - goAtRef.current;
      const newTimes = [...times, reactionMs];
      setTimes(newTimes);
      if (newTimes.length >= totalRounds) {
        const avg = Math.round(newTimes.reduce((a, b) => a + b, 0) / newTimes.length);
        addResult('reaction', difficulty, avg);
        setPhase('result');
      } else {
        setRound((r) => r + 1);
        startRound();
      }
    } else if (phase === 'tooSoon') {
      startRound();
    }
  };

  if (phase === 'setup') {
    return (
      <Card style={styles.setupCard}>
        <Eyebrow>Difficulty (rounds)</Eyebrow>
        <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        <PrimaryButton label="Start" onPress={setup} />
      </Card>
    );
  }

  if (phase === 'result') {
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    return <ResultCard gameId="reaction" difficulty={difficulty} score={avg} onPlayAgain={setup} onBack={onExit} />;
  }

  return (
    <View>
      <Caption style={styles.movesText}>Round {round + 1} of {totalRounds}</Caption>
      <Pressable
        onPress={onTap}
        style={[
          styles.reactionBox,
          phase === 'go' && styles.reactionBoxGo,
          phase === 'tooSoon' && styles.reactionBoxTooSoon,
        ]}
      >
        <Body style={styles.reactionText}>
          {phase === 'waiting' && 'Wait for green...'}
          {phase === 'go' && 'Tap now!'}
          {phase === 'tooSoon' && 'Too soon — tap to retry'}
        </Body>
      </Pressable>
    </View>
  );
}

// --- Quick Math ---
interface MathProblem {
  question: string;
  answer: number;
  choices: number[];
}

function generateProblem(difficulty: Difficulty): MathProblem {
  const rand = (max: number) => Math.floor(Math.random() * max) + 1;
  let a: number, b: number, op: string, answer: number;

  if (difficulty === 'easy') {
    a = rand(20); b = rand(20); op = Math.random() < 0.5 ? '+' : '-';
    answer = op === '+' ? a + b : a - b;
  } else if (difficulty === 'medium') {
    const ops = ['+', '-', '×'];
    op = ops[Math.floor(Math.random() * ops.length)];
    if (op === '×') { a = rand(12); b = rand(12); answer = a * b; }
    else { a = rand(40); b = rand(40); answer = op === '+' ? a + b : a - b; }
  } else {
    const ops = ['+', '-', '×', '÷'];
    op = ops[Math.floor(Math.random() * ops.length)];
    if (op === '×') { a = rand(12); b = rand(12); answer = a * b; }
    else if (op === '÷') { b = rand(12); answer = rand(12); a = b * answer; }
    else { a = rand(60); b = rand(60); answer = op === '+' ? a + b : a - b; }
  }

  const choices = new Set([answer]);
  while (choices.size < 4) {
    const offset = Math.floor(Math.random() * 10) - 5;
    if (offset !== 0) choices.add(answer + offset);
  }
  return { question: `${a} ${op} ${b}`, answer, choices: Array.from(choices).sort(() => Math.random() - 0.5) };
}

function MathGame({ onExit }: { onExit: () => void }) {
  const addResult = useMindGamesStore((s) => s.addResult);
  const [phase, setPhase] = useState<'setup' | 'playing' | 'result'>('setup');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [problem, setProblem] = useState<MathProblem | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const setup = () => {
    setCorrectCount(0);
    setProblem(generateProblem(difficulty));
    setSecondsLeft(mathSecondsByDifficulty[difficulty]);
    setPhase('playing');
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    if (phase === 'playing' && secondsLeft === 0) {
      addResult('math', difficulty, correctCount);
      setPhase('result');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, phase]);

  const onAnswer = (choice: number) => {
    if (!problem) return;
    if (choice === problem.answer) setCorrectCount((c) => c + 1);
    setProblem(generateProblem(difficulty));
  };

  if (phase === 'setup') {
    return (
      <Card style={styles.setupCard}>
        <Eyebrow>Difficulty</Eyebrow>
        <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        <PrimaryButton label="Start" onPress={setup} />
      </Card>
    );
  }

  if (phase === 'result') {
    return <ResultCard gameId="math" difficulty={difficulty} score={correctCount} onPlayAgain={setup} onBack={onExit} />;
  }

  return (
    <View>
      <View style={styles.mathHeaderRow}>
        <Caption>{secondsLeft}s left</Caption>
        <Caption>{correctCount} correct</Caption>
      </View>
      <Card style={styles.mathProblemCard}>
        <SectionHeading style={styles.mathQuestion}>{problem?.question} = ?</SectionHeading>
      </Card>
      <View style={styles.mathChoices}>
        {problem?.choices.map((choice) => (
          <Pressable key={choice} onPress={() => onAnswer(choice)} style={styles.mathChoiceButton}>
            <Body>{choice}</Body>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// --- Word Recall ---
function WordRecallGame({ onExit }: { onExit: () => void }) {
  const addResult = useMindGamesStore((s) => s.addResult);
  const [phase, setPhase] = useState<'setup' | 'memorize' | 'recall' | 'result'>('setup');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [input, setInput] = useState('');
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState<string[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const words = wordListByDifficulty[difficulty];

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const setup = () => {
    setInput('');
    const memorizeSeconds = words.length + 3;
    setSecondsLeft(memorizeSeconds);
    setPhase('memorize');
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    if (phase === 'memorize' && secondsLeft === 0) setPhase('recall');
  }, [phase, secondsLeft]);

  const submit = () => {
    const submitted = input
      .split(/[,\n]/)
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);
    const wordSet = words.map((w) => w.toLowerCase());
    const recalled = wordSet.filter((w) => submitted.includes(w));
    setScore(recalled.length);
    setMissed(words.filter((w) => !submitted.includes(w.toLowerCase())));
    addResult('word', difficulty, recalled.length);
    setPhase('result');
  };

  if (phase === 'setup') {
    return (
      <Card style={styles.setupCard}>
        <Eyebrow>Difficulty (list length)</Eyebrow>
        <DifficultyPicker value={difficulty} onChange={setDifficulty} />
        <PrimaryButton label="Start" onPress={setup} />
      </Card>
    );
  }

  if (phase === 'memorize') {
    return (
      <Card style={styles.setupCard}>
        <Caption>Memorize these — {secondsLeft}s left</Caption>
        <View style={styles.wordList}>
          {words.map((w) => (
            <Body key={w} style={styles.wordListItem}>{w}</Body>
          ))}
        </View>
      </Card>
    );
  }

  if (phase === 'recall') {
    return (
      <Card style={styles.setupCard}>
        <Eyebrow>Type the words you remember</Eyebrow>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="word, word, word..."
          placeholderTextColor={colors.inkSoft}
          style={styles.recallInput}
          multiline
          autoFocus
        />
        <PrimaryButton label="Submit" onPress={submit} />
      </Card>
    );
  }

  return (
    <View>
      <ResultCard gameId="word" difficulty={difficulty} score={score} onPlayAgain={setup} onBack={onExit} />
      {missed.length > 0 && (
        <Card style={styles.missedCard}>
          <Caption>Missed: {missed.join(', ')}</Caption>
        </Card>
      )}
    </View>
  );
}

export function MindGamesScreen() {
  const [activeGame, setActiveGame] = useState<GameId | null>(null);
  useBackHandler({ stepBack: activeGame ? () => setActiveGame(null) : undefined });
  const results = useMindGamesStore((s) => s.results);

  const featuredGameId = gameOrder[dayOfYear(todayISO()) % gameOrder.length];

  if (activeGame) {
    const meta = gameMeta[activeGame];
    return (
      <Screen>
        <Pressable onPress={() => setActiveGame(null)} style={styles.backLink}>
          <Ionicons name="chevron-back" size={16} color={colors.inkSoft} />
          <Caption> Mind Games</Caption>
        </Pressable>
        <ScreenTitle>{meta.name}</ScreenTitle>
        <Caption style={styles.subtitle}>{meta.description}</Caption>
        {activeGame === 'memory' && <MemoryMatchGame onExit={() => setActiveGame(null)} />}
        {activeGame === 'reaction' && <ReactionGame onExit={() => setActiveGame(null)} />}
        {activeGame === 'math' && <MathGame onExit={() => setActiveGame(null)} />}
        {activeGame === 'word' && <WordRecallGame onExit={() => setActiveGame(null)} />}
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenTitle>Mind Games</ScreenTitle>
      <Caption style={styles.subtitle}>Four quick mental workouts</Caption>

      <View style={styles.grid}>
        {gameOrder.map((gameId) => {
          const meta = gameMeta[gameId];
          const isFeatured = gameId === featuredGameId;
          const bests = difficultyOrder
            .map((d) => ({ d, best: personalBest(results, gameId, d, meta.betterWhen) }))
            .filter((b) => b.best !== undefined);
          return (
            <Pressable key={gameId} onPress={() => setActiveGame(gameId)} style={({ pressed }) => pressed && styles.pressed}>
              <Card style={[styles.gameCard, { borderLeftColor: meta.accent, borderLeftWidth: 3 }]}>
                <View style={styles.gameCardHeader}>
                  <View style={[styles.iconWrap, { backgroundColor: withAlpha(meta.accent, 0.16) }]}>
                    <Ionicons name={meta.icon as any} size={24} color={meta.accent} />
                  </View>
                  {isFeatured && (
                    <View style={styles.featuredBadge}>
                      <Ionicons name="sparkles" size={11} color={colors.amber} />
                      <Caption style={styles.featuredText}> Today's pick</Caption>
                    </View>
                  )}
                </View>
                <SectionHeading>{meta.name}</SectionHeading>
                <Body style={styles.gameDesc}>{meta.description}</Body>
                {bests.length > 0 && (
                  <Caption style={styles.bestSummary}>
                    Best: {bests.map((b) => `${difficultyLabels[b.d]} ${b.best}${meta.unit === 'ms' ? 'ms' : ` ${meta.unit}`}`).join(' · ')}
                  </Caption>
                )}
              </Card>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = themedStyles(() => ({
  subtitle: {
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  grid: {
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.85,
  },
  gameCard: {
    gap: spacing.xs,
  },
  gameCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  featuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withAlpha(colors.amber, 0.14),
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
  },
  featuredText: {
    color: colors.amber,
  },
  gameDesc: {
    color: colors.inkSoft,
  },
  bestSummary: {
    marginTop: 2,
    color: colors.teal,
  },
  setupCard: {
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  difficultyRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  difficultyChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.stone,
  },
  difficultyChipActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  difficultyChipTextActive: {
    color: colors.white,
  },
  resultCard: {
    gap: spacing.xs,
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  newBestText: {
    color: colors.amber,
  },
  resultActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  resultButton: {
    flex: 1,
  },
  movesText: {
    marginBottom: spacing.sm,
  },
  memoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  memoryCard: {
    width: '22%',
    aspectRatio: 1,
  },
  memoryCardInner: {
    flex: 1,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memoryCardFaceUp: {
    backgroundColor: withAlpha(colors.teal, 0.14),
    borderColor: colors.teal,
  },
  reactionBox: {
    height: 220,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionBoxGo: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  reactionBoxTooSoon: {
    backgroundColor: withAlpha('#B3413A', 0.16),
    borderColor: '#B3413A',
  },
  reactionText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 18,
  },
  mathHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  mathProblemCard: {
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingVertical: spacing.lg,
  },
  mathQuestion: {
    fontSize: 28,
  },
  mathChoices: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  mathChoiceButton: {
    width: '48%',
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  wordList: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  wordListItem: {
    fontFamily: fonts.bodyMedium,
  },
  recallInput: {
    fontFamily: fonts.body,
    fontSize: 16,
    color: colors.ink,
    minHeight: 80,
    textAlignVertical: 'top',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingBottom: spacing.sm,
  },
  missedCard: {
    marginTop: spacing.sm,
  },
}));
