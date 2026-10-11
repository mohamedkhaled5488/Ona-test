// Which screen the app opens on: Home, or the first-run Welcome screen.
// Decided at start-up and when leaving Demo mode; read when the navigator
// (re)mounts. Kept apart from RootNavigator so screens can set it without an
// import cycle.
export type StartScreen = 'Main' | 'welcome';

let start: { name: StartScreen; hasData: boolean } = { name: 'Main', hasData: false };

export function setStartScreen(name: StartScreen, hasData = false): void {
  start = { name, hasData };
}

export function getStartScreen(): { name: StartScreen; hasData: boolean } {
  return start;
}
