// Debug builds only: keeps the last warnings and errors so Developer tools can
// show them on the device. Never runs in production and never leaves the device.
export interface LogLine {
  at: string;
  level: 'warn' | 'error';
  message: string;
}

const MAX = 200;
const lines: LogLine[] = [];

export function installDevLog(): void {
  if (!__DEV__) return;
  for (const level of ['warn', 'error'] as const) {
    const original = console[level];
    console[level] = (...args: unknown[]) => {
      lines.push({ at: new Date().toISOString(), level, message: args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : safeString(a))).join(' ').slice(0, 500) });
      if (lines.length > MAX) lines.shift();
      original(...args);
    };
  }
}

export function devLogLines(): LogLine[] {
  return [...lines].reverse();
}

export function clearDevLog(): void {
  lines.length = 0;
}

function safeString(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
