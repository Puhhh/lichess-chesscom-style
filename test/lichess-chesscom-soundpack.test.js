const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'lichess-chesscom-soundpack.user.js');

function createScheduler() {
  const queue = [];

  return {
    setTimeout(callback) {
      queue.push(callback);
      return queue.length;
    },
    run(limit = 20) {
      for (let i = 0; queue.length > 0 && i < limit; i += 1) {
        queue.shift()();
      }
    },
  };
}

function loadScript({ withSound = true } = {}) {
  const scheduler = createScheduler();
  const calls = [];
  const sound = withSound
    ? {
        async load(name, path) {
          calls.push(['load', name, path]);
          return { name, path };
        },
        async play(name, volume) {
          calls.push(['play', name, volume]);
          return { name, volume };
        },
        async move(options) {
          calls.push(['move', options]);
        },
        async countdown(count, interval) {
          calls.push(['countdown', count, interval]);
        },
      }
    : undefined;

  const window = {
    location: { hostname: 'lichess.org' },
    console: {
      debug: () => {},
      warn: () => {},
      error: () => {},
    },
    setTimeout: scheduler.setTimeout,
    clearTimeout: () => {},
    lichess: withSound ? { sound } : undefined,
  };

  const context = vm.createContext({
    window,
    unsafeWindow: window,
    console: window.console,
    setTimeout: scheduler.setTimeout,
    clearTimeout: () => {},
  });

  vm.runInContext(fs.readFileSync(scriptPath, 'utf8'), context);
  scheduler.run();

  return { calls, scheduler, sound, window };
}

test('maps known Lichess sound names to Chess.com URLs', async () => {
  const { calls, sound } = loadScript();

  await sound.load('move');
  await sound.load('capture');
  await sound.load('check');
  await sound.load('checkmate');

  assert.deepEqual(calls, [
    ['load', 'move', 'https://www.chess.com/bundles/web/sounds/move-self.mp3'],
    ['load', 'capture', 'https://www.chess.com/bundles/web/sounds/capture.mp3'],
    ['load', 'check', 'https://www.chess.com/bundles/web/sounds/move-check.mp3'],
    [
      'load',
      'checkmate',
      'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/game-end.mp3',
    ],
  ]);
});

test('falls back to original Lichess sound handling for unmapped names', async () => {
  const { calls, sound } = loadScript();

  await sound.load('unknownSound');
  await sound.load('unknownSound', 'https://lichess.example/original.mp3');

  assert.deepEqual(calls, [
    ['load', 'unknownSound', undefined],
    ['load', 'unknownSound', 'https://lichess.example/original.mp3'],
  ]);
});

test('derives move, capture, check, and checkmate sounds from move options', async () => {
  const { calls, sound } = loadScript();

  await sound.move({ san: 'e4' });
  await sound.move({ san: 'Qxe5+' });
  await sound.move({ san: 'Qxf7#' });

  assert.deepEqual(calls, [
    ['play', 'move', 1],
    ['play', 'capture', 1],
    ['play', 'check', 1],
    ['play', 'capture', 1],
    ['play', 'checkmate', 1],
  ]);
});

test('waits for lichess.sound when the page object is not ready immediately', async () => {
  const { calls, scheduler, window } = loadScript({ withSound: false });

  window.lichess = {
    sound: {
      async load(name, path) {
        calls.push(['load', name, path]);
      },
    },
  };
  scheduler.run();
  await window.lichess.sound.load('move');

  assert.deepEqual(calls, [
    ['load', 'move', 'https://www.chess.com/bundles/web/sounds/move-self.mp3'],
  ]);
});

test('does not install hooks twice on the same sound object', async () => {
  const { calls, scheduler, sound } = loadScript();

  scheduler.run();
  await sound.load('move');

  assert.deepEqual(calls, [
    ['load', 'move', 'https://www.chess.com/bundles/web/sounds/move-self.mp3'],
  ]);
});
