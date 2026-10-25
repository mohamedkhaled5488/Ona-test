// The real AsyncStorage needs its native module; tests use the package's
// own in-memory mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Screens use the keyboard-aware scroll view; the package ships its own mock.
jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));

// Reanimated (swipe rows, some animations) has no native side in tests; the
// package ships its own mock. Worklets use their own resolver (package.json).
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// expo-audio needs its native module. A silent stand-in: players that accept
// every call and never play. Tests that check audio behaviour mock it themselves.
jest.mock('expo-audio', () => {
  // __emit(): the status report a playing player sends about once a second.
  const player = () => {
    const listeners = [];
    return {
    play: jest.fn(),
    pause: jest.fn(),
    remove: jest.fn(),
    seekTo: jest.fn(async () => {}),
    replace: jest.fn(),
    setActiveForLockScreen: jest.fn(),
    clearLockScreenControls: jest.fn(),
    addListener: jest.fn((_event, cb) => {
      listeners.push(cb);
      return { remove: jest.fn() };
    }),
    __emit: () => listeners.forEach((cb) => cb({ playing: true })),
    volume: 1,
    loop: false,
    playing: false,
    currentTime: 0,
    duration: 0,
    };
  };
  return {
    createAudioPlayer: jest.fn(player),
    useAudioPlayer: jest.fn(player),
    setAudioModeAsync: jest.fn(async () => {}),
  };
});
