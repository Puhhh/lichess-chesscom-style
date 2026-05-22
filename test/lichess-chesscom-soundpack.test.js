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

function createDocument() {
  const premoveSquares = [];
  return {
    document: {
      documentElement: {},
      querySelectorAll(selector) {
        if (selector === 'cg-board square.current-premove') return premoveSquares;
        return [];
      },
    },
    premoveSquares,
  };
}

function flushAsync() {
  return new Promise(resolve => setImmediate(resolve));
}

function loadScript({ pathname = '/', withSound = true, soundGlobal = 'lichess' } = {}) {
  const scheduler = createScheduler();
  const calls = [];
  const gmRequests = [];
  const blobUrls = [];
  const eventHandlers = {};
  const mutationObservers = [];
  const { document, premoveSquares } = createDocument();
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
    document,
    MutationObserver: class MockMutationObserver {
      constructor(callback) {
        this.callback = callback;
        mutationObservers.push(this);
      }

      observe(target, options) {
        this.target = target;
        this.options = options;
      }

      disconnect() { }
    },
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

  return { blobUrls, calls, eventHandlers, gmRequests, mutationObservers, premoveSquares, scheduler, sound, window };
}

test('maps known Lichess sound names to Chess.com URLs', async () => {
  const { calls, sound } = loadScript();

  await sound.load('move');
  await sound.load('capture');
  await sound.load('check');
  await sound.load('checkmate');
  await sound.load('castle');
  await sound.load('premove');

  assert.deepEqual(calls, [
    ['load', 'move', 'blob:mock-1'],
    ['load', 'capture', 'blob:mock-2'],
    ['load', 'check', 'blob:mock-3'],
    ['load', 'checkmate', 'blob:mock-4'],
    ['load', 'castle', 'blob:mock-5'],
    ['load', 'premove', 'blob:mock-6'],
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

test('replaces PuzzleStormGood and keeps other removed Lichess puzzle sounds unchanged when Lichess passes hashed URLs', async () => {
  const { blobUrls, calls, gmRequests, sound } = loadScript();

  await sound.load('PuzzleStormGood', 'https://lichess1.org/assets/hashed/PuzzleStormGood.3ddd5aee.mp3');
  await sound.load('PuzzleStormEnd', 'https://lichess1.org/assets/hashed/PuzzleStormEnd.d8ac1783.mp3');

  assert.deepEqual(gmRequests.map(request => request.url), [
    'https://www.chess.com/bundles/web/sounds/correct-2-15.mp3',
  ]);
  assert.deepEqual(blobUrls, [
    {
      url: 'blob:mock-1',
      blob: {
        type: 'audio/mpeg',
        url: 'https://www.chess.com/bundles/web/sounds/correct-2-15.mp3',
      },
    },
  ]);
  assert.deepEqual(calls, [
    ['load', 'PuzzleStormGood', 'blob:mock-1'],
    ['load', 'PuzzleStormEnd', 'https://lichess1.org/assets/hashed/PuzzleStormEnd.d8ac1783.mp3'],
  ]);
});

test('replaces PuzzleStormGood URLs independent of the passed sound name', async () => {
  const { calls, gmRequests, sound } = loadScript();

  await sound.load('unknownPuzzleSound', 'https://lichess1.org/assets/hashed/PuzzleStormGood.abcdef12.mp3');

  assert.deepEqual(gmRequests.map(request => request.url), [
    'https://www.chess.com/bundles/web/sounds/correct-2-15.mp3',
  ]);
  assert.deepEqual(calls, [
    ['load', 'unknownPuzzleSound', 'blob:mock-1'],
  ]);
});

test('replaces real Lichess Puzzle Storm good sound name when playing', async () => {
  const { calls, gmRequests, sound } = loadScript({ soundGlobal: 'site' });

  await sound.play('lisp/PuzzleStormGood', 0.7);

  assert.deepEqual(gmRequests.map(request => request.url), [
    'https://www.chess.com/bundles/web/sounds/correct-2-15.mp3',
  ]);
  assert.deepEqual(calls, [
    ['load', 'lisp/PuzzleStormGood', 'blob:mock-1'],
    ['play', 'lisp/PuzzleStormGood', 0.7],
  ]);
});

test('replaces real Lichess Puzzle Storm good sound after original preload', async () => {
  const { calls, gmRequests, sound } = loadScript({ soundGlobal: 'site' });

  await sound.load('lisp/PuzzleStormGood', 'https://lichess1.org/assets/hashed/PuzzleStormGood.3ddd5aee.mp3');
  await sound.play('lisp/PuzzleStormGood', 0.7);

  assert.deepEqual(gmRequests.map(request => request.url), [
    'https://www.chess.com/bundles/web/sounds/correct-2-15.mp3',
  ]);
  assert.deepEqual(calls, [
    ['load', 'lisp/PuzzleStormGood', 'blob:mock-1'],
    ['load', 'lisp/PuzzleStormGood', 'blob:mock-1'],
    ['play', 'lisp/PuzzleStormGood', 0.7],
  ]);
});

test('replaces known Lichess sound URLs by hashed asset name', async () => {
  const { calls, gmRequests, sound } = loadScript();

  await sound.load('unknownCastleSound', 'https://lichess1.org/assets/hashed/castle.abcdef12.mp3');
  await sound.load('unknownMoveSound', 'https://lichess1.org/assets/hashed/move.abcdef12.mp3');
  await sound.load('unknownCaptureSound', 'https://lichess1.org/assets/hashed/capture.abcdef12.mp3');
  await sound.load('unknownCheckSound', 'https://lichess1.org/assets/hashed/check.abcdef12.mp3');
  await sound.load('unknownGenericNotifySound', 'https://lichess1.org/assets/hashed/genericNotify.abcdef12.mp3');
  await sound.load('unknownLowTimeSound', 'https://lichess1.org/assets/hashed/lowTime.abcdef12.mp3');
  await sound.load('unknownPremoveSound', 'https://lichess1.org/assets/hashed/premove.abcdef12.mp3');
  await sound.load('unknownVictorySound', 'https://lichess1.org/assets/hashed/victory.abcdef12.mp3');

  assert.deepEqual(gmRequests.map(request => request.url), [
    'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/castle.mp3',
    'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3',
    'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3',
    'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-check.mp3',
    'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/game-start.mp3',
    'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/tenseconds.mp3',
    'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/premove.mp3',
    'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/game-end.mp3',
  ]);
  assert.deepEqual(calls, [
    ['load', 'unknownCastleSound', 'blob:mock-1'],
    ['load', 'unknownMoveSound', 'blob:mock-2'],
    ['load', 'unknownCaptureSound', 'blob:mock-3'],
    ['load', 'unknownCheckSound', 'blob:mock-4'],
    ['load', 'unknownGenericNotifySound', 'blob:mock-5'],
    ['load', 'unknownLowTimeSound', 'blob:mock-6'],
    ['load', 'unknownPremoveSound', 'blob:mock-7'],
    ['load', 'unknownVictorySound', 'blob:mock-8'],
  ]);
});

test('keeps other removed puzzle sounds unchanged by name', async () => {
  const { calls, gmRequests, sound } = loadScript();

  await sound.play('PuzzleStormEnd');
  await sound.play('Error');

  assert.deepEqual(gmRequests, []);
  assert.deepEqual(calls, [
    ['play', 'PuzzleStormEnd', undefined],
    ['play', 'Error', undefined],
  ]);
});

test('keeps removed Lichess puzzle error sound unchanged', async () => {
  const { blobUrls, calls, gmRequests, sound } = loadScript();

  await sound.load('Error', 'https://lichess1.org/assets/hashed/Error.11bd3340.mp3');
  await sound.play('Error');

  assert.deepEqual(gmRequests, []);
  assert.deepEqual(blobUrls, []);
  assert.deepEqual(calls, [
    ['load', 'Error', 'https://lichess1.org/assets/hashed/Error.11bd3340.mp3'],
    ['play', 'Error', undefined],
  ]);
});

test('keeps unknown puzzle sounds unchanged', async () => {
  const { calls, gmRequests, sound } = loadScript();

  await sound.load('PuzzleStormUnknown', 'https://lichess1.org/assets/hashed/PuzzleStormUnknown.12345678.mp3');

  assert.deepEqual(gmRequests, []);
  assert.deepEqual(calls, [
    ['load', 'PuzzleStormUnknown', 'https://lichess1.org/assets/hashed/PuzzleStormUnknown.12345678.mp3'],
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

test('keeps premove flags as normal executed move sounds', async () => {
  const { calls, sound } = loadScript();

  await sound.move({ san: 'e4', isPremove: true });
  await sound.move({ san: 'e5', premove: true });

  assert.deepEqual(calls, [
    ['play', 'move', 1],
    ['play', 'move', 1],
  ]);
});

test('keeps SAN priority when an executed move carries premove flags', async () => {
  const { calls, sound } = loadScript();

  await sound.move({ san: 'Qxf7#', isPremove: true });
  await sound.move({ san: 'O-O+', premove: true });

  assert.deepEqual(calls, [
    ['play', 'checkmate', 1],
    ['play', 'check', 1],
  ]);
});

test('does not play premove from regular sound events', async () => {
  const { calls, sound } = loadScript();

  await sound.play('premove', 0.8);
  await sound.move({ name: 'premove', filter: 'game' });

  assert.deepEqual(calls, []);
});

test('plays premove when Chessground marks a current premove on the board', async () => {
  const { calls, mutationObservers, premoveSquares } = loadScript();
  calls.length = 0;

  premoveSquares.push({ cgKey: 'e2' }, { cgKey: 'e4' });
  mutationObservers[0].callback([{ type: 'childList' }]);
  await flushAsync();

  assert.deepEqual(calls, [
    ['load', 'premove', 'blob:mock-1'],
    ['play', 'premove', 1],
  ]);
});

test('does not play premove for destination hints before a premove is set', async () => {
  const { calls, mutationObservers } = loadScript();
  calls.length = 0;

  mutationObservers[0].callback([{ type: 'attributes', attributeName: 'class' }]);
  await flushAsync();

  assert.deepEqual(calls, []);
});

test('does not replay the same current premove until it is cleared and set again', async () => {
  const { calls, mutationObservers, premoveSquares } = loadScript();
  calls.length = 0;

  premoveSquares.push({ cgKey: 'e2' }, { cgKey: 'e4' });
  mutationObservers[0].callback([{ type: 'childList' }]);
  await flushAsync();
  mutationObservers[0].callback([{ type: 'attributes', attributeName: 'class' }]);
  await flushAsync();

  premoveSquares.length = 0;
  mutationObservers[0].callback([{ type: 'childList' }]);
  await flushAsync();
  premoveSquares.push({ cgKey: 'g1' }, { cgKey: 'f3' });
  mutationObservers[0].callback([{ type: 'childList' }]);
  await flushAsync();

  assert.deepEqual(calls, [
    ['load', 'premove', 'blob:mock-1'],
    ['play', 'premove', 1],
    ['load', 'premove', 'blob:mock-1'],
    ['play', 'premove', 1],
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
