// Quick Math's questions: shared by Mind Games and the gentle version in
// Quit's craving toolkit (no countdown, no count there).
import type { Difficulty } from '../types/sections';

export interface MathProblem {
  question: string;
  answer: number;
  choices: number[];
}

export function generateProblem(difficulty: Difficulty): MathProblem {
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
