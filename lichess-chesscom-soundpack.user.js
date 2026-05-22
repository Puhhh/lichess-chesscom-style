// ==UserScript==
// @name         Lichess Chess.com Soundpack
// @namespace    https://github.com/Puhhh/lichess-chesscom-style
// @version      0.1.19
// @description  Replace Lichess board sounds with Chess.com sound URLs.
// @author       Puhhh
// @match        https://lichess.org/*
// @match        https://*.lichess.org/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM.xmlHttpRequest
// @connect      www.chess.com
// @connect      images.chesscomfiles.com
// ==/UserScript==

(function () {
  'use strict';

  const root = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const DEBUG = false;
  const INSTALL_FLAG = '__chesscomSoundpackInstalled';
  const MAX_INSTALL_ATTEMPTS = 120;
  const INSTALL_RETRY_MS = 250;
  const SPECULATIVE_MOVE_DELAY_MS = 180;
  const SOURCE_SOUND_PATH_PATTERN = /\/([^/?#.]+)(?:\.[a-f0-9]+)?\.mp3(?:[?#].*)?$/i;

  const chessComTheme = 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/';
  const SOUND_MAP = Object.freeze({
    castle: `${chessComTheme}castle.mp3`,
    capture: `${chessComTheme}capture.mp3`,
    check: `${chessComTheme}move-check.mp3`,
    checkmate: `${chessComTheme}game-end.mp3`,
    defeat: `${chessComTheme}game-end.mp3`,
    draw: `${chessComTheme}game-end.mp3`,
    genericnotify: `${chessComTheme}game-start.mp3`,
    lowtime: `${chessComTheme}tenseconds.mp3`,
    move: `${chessComTheme}move-self.mp3`,
    premove: `${chessComTheme}premove.mp3`,
    puzzlestormgood: 'https://www.chess.com/bundles/web/sounds/correct-2-15.mp3',
    victory: `${chessComTheme}game-end.mp3`,
  });
  const blobPathCache = new Map();
  let plyHookInstalled = false;
  let premoveHookInstalled = false;
  let boardPremovePlayAllowed = false;
  let currentPremoveSignature = '';
  let previousPly;

  function debug(...args) {
    if (DEBUG) root.console?.debug?.('[lichess-chesscom-soundpack]', ...args);
  }

  function normalizeSoundName(name) {
    if (typeof name !== 'string') return undefined;
    return name.split('/').pop().toLowerCase();
  }

  function mappedPath(name) {
    return SOUND_MAP[normalizeSoundName(name)];
  }

  function mappedPathFromSourcePath(path) {
    if (!path) return undefined;
    const match = path.match(SOURCE_SOUND_PATH_PATTERN);
    return match ? mappedPath(match[1]) : undefined;
  }

  function replacementPath(name, path) {
    return mappedPath(name) || mappedPathFromSourcePath(path) || path;
  }

  async function cspSafePath(path) {
    if (!path || !/^https:\/\/(?:www\.chess\.com|images\.chesscomfiles\.com)\//.test(path)) return path;
    if (blobPathCache.has(path)) return blobPathCache.get(path);
    if (typeof GM === 'undefined' || typeof GM.xmlHttpRequest !== 'function') return path;

    const response = await GM.xmlHttpRequest({
      method: 'GET',
      url: path,
      responseType: 'blob',
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`${path} failed ${response.status}`);
    }

    const blobUrl = root.URL.createObjectURL(response.response);
    blobPathCache.set(path, blobUrl);
    return blobUrl;
  }

  function optionFlag(options, name) {
    const value = options?.[name];
    return typeof value === 'function' ? Boolean(value.call(options)) : Boolean(value);
  }

  function isCastlingSan(san) {
    return /^[O0]-[O0](?:-[O0])?/.test(san);
  }

  function boardPremoveSignature() {
    const squares = Array.from(root.document?.querySelectorAll?.('cg-board square.current-premove') ?? []);
    if (squares.length === 0) return '';

    return squares
      .map((square, index) => square.cgKey || square.dataset?.key || square.getAttribute?.('data-key') || square.style?.transform || String(index))
      .sort()
      .join('|');
  }

  function playBoardPremove(sound) {
    Promise.resolve(sound.load?.('premove'))
      .then(() => {
        boardPremovePlayAllowed = true;
        return sound.play?.('premove', 1);
      })
      .finally(() => {
        boardPremovePlayAllowed = false;
      })
      .catch(error => root.console?.error?.(error));
  }

  function install(sound) {
    if (!sound || sound[INSTALL_FLAG]) return Boolean(sound?.[INSTALL_FLAG]);

    const originalLoad = typeof sound.load === 'function' ? sound.load.bind(sound) : undefined;
    const originalPlay = typeof sound.play === 'function' ? sound.play.bind(sound) : undefined;
    const originalMove = typeof sound.move === 'function' ? sound.move.bind(sound) : undefined;
    const originalCountdown = typeof sound.countdown === 'function' ? sound.countdown.bind(sound) : undefined;
    const originalSaySan = typeof sound.saySan === 'function' ? sound.saySan.bind(sound) : undefined;

    if (!originalLoad) return false;

    let speculativeMoveTimer;
    let speculativeMoveVolume = 1;

    function clearSpeculativeMoveTimer() {
      if (!speculativeMoveTimer) return;
      root.clearTimeout(speculativeMoveTimer);
      speculativeMoveTimer = undefined;
    }

    sound.load = async function chessComSoundpackLoad(name, path) {
      return originalLoad(name, await cspSafePath(replacementPath(name, path)));
    };

    if (originalPlay) {
      sound.play = async function chessComSoundpackPlay(name, volume) {
        if (normalizeSoundName(name) === 'premove' && !boardPremovePlayAllowed) return undefined;
        if ((name === 'check' || name === 'checkmate') && speculativeMoveTimer) {
          clearSpeculativeMoveTimer();
        }
        if (mappedPath(name) && String(name).includes('/')) {
          await sound.load(name);
        }
        return originalPlay(name, volume);
      };
    }

    if (originalMove && originalPlay) {
      sound.move = function chessComSoundpackMove(options) {
        const volume = options?.volume ?? 1;

        if (options?.filter === 'music') return originalMove(options);
        if (options?.name) {
          if (optionFlag(options, 'checkmate') || optionFlag(options, 'mate')) return sound.play('checkmate', volume);
          if (optionFlag(options, 'check')) return sound.play('check', volume);
          const san = options?.san ?? '';
          if (isCastlingSan(san)) {
            if (san.includes('#')) return sound.play('checkmate', volume);
            if (san.includes('+')) return sound.play('check', volume);
            return sound.play('castle', volume);
          }

          if (options.filter === 'game' && (options.name === 'move' || options.name === 'capture')) {
            clearSpeculativeMoveTimer();
            speculativeMoveVolume = volume;
            speculativeMoveTimer = root.setTimeout(() => {
              speculativeMoveTimer = undefined;
              sound.play(options.name, volume);
            }, SPECULATIVE_MOVE_DELAY_MS);
            return undefined;
          }
          return sound.play(options.name, volume);
        }

        const san = options?.san ?? '';
        let name;
        if (san.includes('#') || optionFlag(options, 'checkmate') || optionFlag(options, 'mate')) name = 'checkmate';
        else if (san.includes('+') || optionFlag(options, 'check')) name = 'check';
        else if (isCastlingSan(san)) name = 'castle';
        else if (san.includes('x')) name = 'capture';
        else name = 'move';

        debug('move', { name, san, check: optionFlag(options, 'check'), options });
        sound.play(name, volume);

        return undefined;
      };
    }

    if (originalSaySan && originalPlay) {
      sound.saySan = function chessComSoundpackSaySan(san, ...args) {
        if (speculativeMoveTimer && isCastlingSan(san ?? '')) {
          clearSpeculativeMoveTimer();
          if (!String(san).includes('+') && !String(san).includes('#')) {
            sound.play('castle', speculativeMoveVolume);
          }
        }
        return originalSaySan(san, ...args);
      };
    }

    if (originalCountdown) {
      sound.countdown = async function chessComSoundpackCountdown(count, interval = 500) {
        if (typeof sound.enabled === 'function' && !sound.enabled()) return undefined;

        try {
          while (count > 0) {
            await Promise.all([
              new Promise(resolve => root.setTimeout(resolve, interval)),
              sound.play(`countDown${count}`),
            ]);
            count -= 1;
          }
          return sound.play('genericNotify');
        } catch (error) {
          root.console?.error?.(error);
          return undefined;
        }
      };
    }

    Object.defineProperty(sound, INSTALL_FLAG, {
      configurable: false,
      enumerable: false,
      value: true,
    });

    debug('installed');
    return true;
  }

  function installPlyHook(sound) {
    const events = root.lichess?.events;
    if (plyHookInstalled || !sound || typeof events?.on !== 'function') return plyHookInstalled;

    events.on('ply', ply => {
      const nextPly = Number(ply);
      if (!Number.isFinite(nextPly)) return;

      if (
        Number.isFinite(previousPly) &&
        nextPly < previousPly
      ) {
        debug('backward ply', { previousPly, nextPly });
        sound.play('move', 1);
      }

      previousPly = nextPly;
    });
    plyHookInstalled = true;
    debug('ply hook installed');
    return true;
  }

  function installPremoveHook(sound) {
    const documentElement = root.document?.documentElement;
    const MutationObserver = root.MutationObserver;
    if (premoveHookInstalled || !sound || !documentElement || typeof MutationObserver !== 'function') {
      return premoveHookInstalled;
    }

    let pendingPremoveCheck = false;
    currentPremoveSignature = boardPremoveSignature();
    function checkBoardPremove() {
      pendingPremoveCheck = false;
      const nextSignature = boardPremoveSignature();
      if (!nextSignature) {
        currentPremoveSignature = '';
        return;
      }
      if (nextSignature === currentPremoveSignature) return;

      currentPremoveSignature = nextSignature;
      playBoardPremove(sound);
    }

    const observer = new MutationObserver(() => {
      if (pendingPremoveCheck) return;
      pendingPremoveCheck = true;
      root.setTimeout(checkBoardPremove, 0);
    });

    observer.observe(documentElement, {
      attributeFilter: ['class'],
      attributes: true,
      childList: true,
      subtree: true,
    });

    premoveHookInstalled = true;
    debug('premove hook installed');
    return true;
  }

  function waitAndInstall(attempt = 0) {
    const sound = root.site?.sound || root.lichess?.sound;
    const soundInstalled = install(sound);
    const plyHookReady = installPlyHook(sound);
    const premoveHookReady = installPremoveHook(sound);

    if (soundInstalled && plyHookReady && premoveHookReady) return;
    if (attempt >= MAX_INSTALL_ATTEMPTS) {
      debug('site.sound or lichess.sound was not found');
      return;
    }
    root.setTimeout(() => waitAndInstall(attempt + 1), INSTALL_RETRY_MS);
  }

  waitAndInstall();
})();
