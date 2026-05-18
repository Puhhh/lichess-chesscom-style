const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'lichess-chesscom-soundpack.user.js');

function createScheduler() {
  const queue = [];
  let nextId = 1;

  return {
    setTimeout(callback, delay = 0) {
      const timer = { id: nextId, callback, delay, cancelled: false };
      nextId += 1;
      queue.push(timer);
      return timer.id;
    },
    clearTimeout(id) {
      const timer = queue.find(item => item.id === id);
      if (timer) timer.cancelled = true;
    },
    run(limit = 20) {
      for (let i = 0; queue.length > 0 && i < limit; i += 1) {
        const timer = queue.shift();
        if (!timer.cancelled) timer.callback();
      }
    },
  };
}

function loadScript({ pathname = '/', withSound = true, soundGlobal = 'lichess' } = {}) {
  const scheduler = createScheduler();
  const calls = [];
  const gmRequests = [];
  const blobUrls = [];
  const eventHandlers = {};
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
      saySan(san, cut, force) {
        calls.push(['saySan', san, cut, force]);
      },
      async countdown(count, interval) {
        calls.push(['countdown', count, interval]);
      },
    }
    : undefined;

  const window = {
    location: { hostname: 'lichess.org', pathname },
    console: {
      debug: () => { },
      warn: () => { },
      error: () => { },
    },
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
    lichess: withSound && soundGlobal === 'lichess' ? { sound } : {},
    site: withSound && soundGlobal === 'site' ? { sound } : {},
    URL: {
      createObjectURL(blob) {
        const url = `blob:mock-${blobUrls.length + 1}`;
        blobUrls.push({ url, blob });
        return url;
      },
    },
  };

  const context = vm.createContext({
    window,
    unsafeWindow: window,
    console: window.console,
    GM: {
      async xmlHttpRequest(details) {
        gmRequests.push(details);
        return { status: 200, response: { type: 'audio/mpeg', url: details.url } };
      },
    },
    setTimeout: scheduler.setTimeout,
    clearTimeout: scheduler.clearTimeout,
  });

  vm.runInContext(fs.readFileSync(scriptPath, 'utf8'), context);
  scheduler.run();

  return { blobUrls, calls, eventHandlers, gmRequests, scheduler, sound, window };
}

test('maps known Lichess sound names to Chess.com URLs', async () => {
  const { calls, sound } = loadScript();

  await sound.load('move');
  await sound.load('capture');
  await sound.load('check');
  await sound.load('checkmate');
  await sound.load('castle');

  assert.deepEqual(calls, [
    ['load', 'move', 'blob:mock-1'],
    ['load', 'capture', 'blob:mock-2'],
    ['load', 'check', 'blob:mock-3'],
    ['load', 'checkmate', 'blob:mock-4'],
    ['load', 'castle', 'blob:mock-5'],
  ]);
});

test('fetches external sound URLs through Tampermonkey and hands Lichess blob URLs', async () => {
  const { blobUrls, calls, gmRequests, sound } = loadScript();

  await sound.load('move');
  await sound.load('move');

  assert.equal(gmRequests.length, 1);
  assert.equal(gmRequests[0].method, 'GET');
  assert.equal(gmRequests[0].url, 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3');
  assert.equal(gmRequests[0].responseType, 'blob');
  assert.deepEqual(blobUrls, [
    {
      url: 'blob:mock-1',
      blob: {
        type: 'audio/mpeg',
        url: 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3',
      },
    },
  ]);
  assert.deepEqual(calls, [
    ['load', 'move', 'blob:mock-1'],
    ['load', 'move', 'blob:mock-1'],
  ]);
});

test('replaces known Lichess puzzle sounds even when Lichess passes hashed URLs', async () => {
  const { blobUrls, calls, gmRequests, sound } = loadScript();

  await sound.load('lisp/PuzzleStormGood', 'https://lichess1.org/assets/hashed/PuzzleStormGood.3ddd5aee.mp3');
  await sound.load('lisp/PuzzleStormEnd', 'https://lichess1.org/assets/hashed/PuzzleStormEnd.d8ac1783.mp3');

  assert.deepEqual(
    gmRequests.map(request => request.url),
    [
      'https://www.chess.com/bundles/web/sounds/correct-2-15.mp3',
      'https://www.chess.com/bundles/web/sounds/explosion.mp3',
    ],
  );
  assert.deepEqual(blobUrls, [
    {
      url: 'blob:mock-1',
      blob: {
        type: 'audio/mpeg',
        url: 'https://www.chess.com/bundles/web/sounds/correct-2-15.mp3',
      },
    },
    {
      url: 'blob:mock-2',
      blob: {
        type: 'audio/mpeg',
        url: 'https://www.chess.com/bundles/web/sounds/explosion.mp3',
      },
    },
  ]);
  assert.deepEqual(calls, [
    ['load', 'lisp/PuzzleStormGood', 'blob:mock-1'],
    ['load', 'lisp/PuzzleStormEnd', 'blob:mock-2'],
  ]);
});

test('replaces known Lichess puzzle sound URLs independent of the hashed asset name', async () => {
  const { calls, gmRequests, sound } = loadScript();

  await sound.load('unknownPuzzleSound', 'https://lichess1.org/assets/hashed/PuzzleStormGood.abcdef12.mp3');

  assert.deepEqual(gmRequests.map(request => request.url), [
    'https://www.chess.com/bundles/web/sounds/correct-2-15.mp3',
  ]);
  assert.deepEqual(calls, [
    ['load', 'unknownPuzzleSound', 'blob:mock-1'],
  ]);
});

test('replaces known Lichess puzzle sounds when they are played by name', async () => {
  const { calls, gmRequests, sound } = loadScript();

  await sound.play('lisp/PuzzleStormGood');
  await sound.play('lisp/PuzzleStormEnd');

  assert.deepEqual(
    gmRequests.map(request => request.url),
    [
      'https://www.chess.com/bundles/web/sounds/correct-2-15.mp3',
      'https://www.chess.com/bundles/web/sounds/explosion.mp3',
    ],
  );
  assert.deepEqual(calls, [
    ['load', 'lisp/PuzzleStormGood', 'blob:mock-1'],
    ['play', 'lisp/PuzzleStormGood', undefined],
    ['load', 'lisp/PuzzleStormEnd', 'blob:mock-2'],
    ['play', 'lisp/PuzzleStormEnd', undefined],
  ]);
});

test('replaces Lichess puzzle error sound', async () => {
  const { blobUrls, calls, gmRequests, sound } = loadScript();

  await sound.load('lisp/Error', 'https://lichess1.org/assets/hashed/Error.11bd3340.mp3');
  await sound.play('lisp/Error');

  assert.deepEqual(gmRequests.map(request => request.url), [
    'https://www.chess.com/bundles/web/sounds/incorrect-2-15.mp3',
  ]);
  assert.deepEqual(blobUrls, [
    {
      url: 'blob:mock-1',
      blob: {
        type: 'audio/mpeg',
        url: 'https://www.chess.com/bundles/web/sounds/incorrect-2-15.mp3',
      },
    },
  ]);
  assert.deepEqual(calls, [
    ['load', 'lisp/Error', 'blob:mock-1'],
    ['load', 'lisp/Error', 'blob:mock-1'],
    ['play', 'lisp/Error', undefined],
  ]);
});

test('keeps unknown puzzle sounds unchanged', async () => {
  const { calls, gmRequests, sound } = loadScript();

  await sound.load('lisp/PuzzleStormUnknown', 'https://lichess1.org/assets/hashed/PuzzleStormUnknown.12345678.mp3');

  assert.deepEqual(gmRequests, []);
  assert.deepEqual(calls, [
    ['load', 'lisp/PuzzleStormUnknown', 'https://lichess1.org/assets/hashed/PuzzleStormUnknown.12345678.mp3'],
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

test('derives one prioritized move sound from SAN move options', async () => {
  const { calls, sound } = loadScript();

  await sound.move({ san: 'e4' });
  await sound.move({ san: 'Qe5+' });
  await sound.move({ san: 'Qxe5+' });
  await sound.move({ san: 'Qxf7#' });
  await sound.move({ san: 'O-O' });
  await sound.move({ san: 'O-O-O+' });

  assert.deepEqual(calls, [
    ['play', 'move', 1],
    ['play', 'check', 1],
    ['play', 'check', 1],
    ['play', 'checkmate', 1],
    ['play', 'castle', 1],
    ['play', 'check', 1],
  ]);
});

test('uses analysis tree node check method when SAN has no check suffix', async () => {
  const { calls, sound } = loadScript();

  await sound.move({ san: 'Qe5', check: () => true });

  assert.deepEqual(calls, [['play', 'check', 1]]);
});

test('ignores premove flags when deriving move sounds', async () => {
  const { calls, sound } = loadScript();

  await sound.move({ san: 'e4', isPremove: true });
  await sound.move({ san: 'e5', premove: true });

  assert.deepEqual(calls, [
    ['play', 'move', 1],
    ['play', 'move', 1],
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
    ['load', 'move', 'blob:mock-1'],
  ]);
});

test('installs hook on site.sound for Lichess analysis pages', async () => {
  const { calls, sound } = loadScript({ soundGlobal: 'site' });

  await sound.move({ san: 'Qe5', check: () => true });

  assert.deepEqual(calls, [['play', 'check', 1]]);
});

test('does not install hooks twice on the same sound object', async () => {
  const { calls, scheduler, sound } = loadScript();

  scheduler.run();
  await sound.load('move');

  assert.deepEqual(calls, [
    ['load', 'move', 'blob:mock-1'],
  ]);
});

test('cancels speculative board move sound when server reports check', async () => {
  const { calls, scheduler, sound } = loadScript();

  sound.move({ name: 'move', filter: 'game' });
  await sound.play('check');
  scheduler.run();

  assert.deepEqual(calls, [['play', 'check', undefined]]);
});

test('plays check immediately when a named game move carries a check flag', () => {
  const { calls, scheduler, sound } = loadScript();

  sound.move({ name: 'move', filter: 'game', check: true });
  scheduler.run();

  assert.deepEqual(calls, [['play', 'check', 1]]);
});

test('plays speculative board move sound when no check arrives', () => {
  const { calls, scheduler, sound } = loadScript();

  sound.move({ name: 'move', filter: 'game' });
  scheduler.run();

  assert.deepEqual(calls, [['play', 'move', 1]]);
});

test('plays castle for named game moves that carry castling SAN', () => {
  const { calls, scheduler, sound } = loadScript();

  sound.move({ name: 'move', filter: 'game', san: 'O-O' });
  sound.move({ name: 'move', filter: 'game', san: '0-0-0' });
  scheduler.run();

  assert.deepEqual(calls, [
    ['play', 'castle', 1],
    ['play', 'castle', 1],
  ]);
});

test('uses live game SAN speech hook to replace speculative move with castle', () => {
  const { calls, scheduler, sound } = loadScript();

  sound.move({ name: 'move', filter: 'game' });
  sound.saySan('O-O');
  scheduler.run();

  assert.deepEqual(calls, [
    ['play', 'castle', 1],
    ['saySan', 'O-O', undefined, undefined],
  ]);
});

test('plays a move sound when ply goes backward', () => {
  const { calls, eventHandlers, scheduler, window } = loadScript({ pathname: '/analysis', soundGlobal: 'site' });
  window.lichess.events = {
    on(name, handler) {
      eventHandlers[name] = handler;
    },
  };

  scheduler.run();
  eventHandlers.ply(8);
  eventHandlers.ply(7);

  assert.deepEqual(calls, [['play', 'move', 1]]);
});

test('plays a move sound when game ply goes backward', () => {
  const { calls, eventHandlers, scheduler, window } = loadScript({ pathname: '/abcdefgh', soundGlobal: 'site' });
  window.lichess.events = {
    on(name, handler) {
      eventHandlers[name] = handler;
    },
  };

  scheduler.run();
  eventHandlers.ply(20);
  eventHandlers.ply(19);

  assert.deepEqual(calls, [['play', 'move', 1]]);
});
