// ==UserScript==
// @name         Lichess Chess.com Soundpack
// @namespace    https://github.com/Puhhh/lichess-chesscom-soundpack
// @version      0.1.0
// @description  Replace Lichess board sounds with Chess.com sound URLs.
// @author       Puhhh
// @match        https://lichess.org/*
// @match        https://*.lichess.org/*
// @run-at       document-start
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const root = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const DEBUG = false;
  const INSTALL_FLAG = '__chesscomSoundpackInstalled';
  const MAX_INSTALL_ATTEMPTS = 120;
  const INSTALL_RETRY_MS = 250;

  const chessComDefault = 'https://www.chess.com/bundles/web/sounds/';
  const chessComTheme = 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/';

  const SOUND_MAP = Object.freeze({
    berserk: `${chessComTheme}notify.mp3`,
    capture: `${chessComDefault}capture.mp3`,
    check: `${chessComDefault}move-check.mp3`,
    checkmate: `${chessComTheme}game-end.mp3`,
    confirmation: `${chessComTheme}notify.mp3`,
    countDown0: `${chessComTheme}notify.mp3`,
    countDown1: `${chessComTheme}notify.mp3`,
    countDown2: `${chessComTheme}notify.mp3`,
    countDown3: `${chessComTheme}notify.mp3`,
    countDown4: `${chessComTheme}notify.mp3`,
    countDown5: `${chessComTheme}notify.mp3`,
    countDown6: `${chessComTheme}notify.mp3`,
    countDown7: `${chessComTheme}notify.mp3`,
    countDown8: `${chessComTheme}notify.mp3`,
    countDown9: `${chessComTheme}notify.mp3`,
    countDown10: `${chessComTheme}notify.mp3`,
    defeat: `${chessComTheme}game-end.mp3`,
    draw: `${chessComTheme}game-end.mp3`,
    error: `${chessComTheme}notify.mp3`,
    explosion: `${chessComTheme}capture.mp3`,
    genericNotify: `${chessComTheme}notify.mp3`,
    lowTime: `${chessComTheme}notify.mp3`,
    move: `${chessComDefault}move-self.mp3`,
    newChallenge: `${chessComTheme}notify.mp3`,
    newPM: `${chessComTheme}notify.mp3`,
    outOfBound: `${chessComTheme}notify.mp3`,
    select: `${chessComTheme}move-self.mp3`,
    socialNotify: `${chessComTheme}notify.mp3`,
    tournament1st: `${chessComTheme}game-end.mp3`,
    tournament2nd: `${chessComTheme}game-end.mp3`,
    tournament3rd: `${chessComTheme}game-end.mp3`,
    tournamentOther: `${chessComTheme}notify.mp3`,
    victory: `${chessComTheme}game-end.mp3`,
  });

  function debug(...args) {
    if (DEBUG) root.console?.debug?.('[lichess-chesscom-soundpack]', ...args);
  }

  function mappedPath(name) {
    return SOUND_MAP[name];
  }

  function install(sound) {
    if (!sound || sound[INSTALL_FLAG]) return Boolean(sound?.[INSTALL_FLAG]);

    const originalLoad = typeof sound.load === 'function' ? sound.load.bind(sound) : undefined;
    const originalPlay = typeof sound.play === 'function' ? sound.play.bind(sound) : undefined;
    const originalMove = typeof sound.move === 'function' ? sound.move.bind(sound) : undefined;
    const originalCountdown = typeof sound.countdown === 'function' ? sound.countdown.bind(sound) : undefined;

    if (!originalLoad) return false;

    sound.load = function chessComSoundpackLoad(name, path) {
      return originalLoad(name, path || mappedPath(name));
    };

    if (originalMove && originalPlay) {
      sound.move = function chessComSoundpackMove(options) {
        const volume = options?.volume ?? 1;

        if (options?.filter === 'music') return originalMove(options);
        if (options?.name) return sound.play(options.name, volume);

        const san = options?.san ?? '';
        if (san.includes('x')) sound.play('capture', volume);
        else sound.play('move', volume);

        if (san.includes('#')) sound.play('checkmate', volume);
        else if (san.includes('+')) sound.play('check', volume);

        return undefined;
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

  function waitAndInstall(attempt = 0) {
    if (install(root.lichess?.sound)) return;
    if (attempt >= MAX_INSTALL_ATTEMPTS) {
      debug('lichess.sound was not found');
      return;
    }
    root.setTimeout(() => waitAndInstall(attempt + 1), INSTALL_RETRY_MS);
  }

  waitAndInstall();
})();
