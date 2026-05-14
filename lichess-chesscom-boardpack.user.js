// ==UserScript==
// @name         Lichess Chess.com Boardpack
// @namespace    https://github.com/Puhhh/lichess-chesscom-style
// @version      0.1.0
// @description  Replace the Lichess board texture with a Chess.com-style board.
// @author       Puhhh
// @match        https://lichess.org/*
// @match        https://*.lichess.org/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'lichess-chesscom-boardpack-style';
  const ROOT_CLASS = 'lichess-chesscom-boardpack';
  const BOARD_THEME = 'brown';
  const BOARD_SIZE = 200;
  const chessComBoards = 'https://images.chesscomfiles.com/chess-themes/boards/';

  const BOARD_MAP = Object.freeze({
    brown: {
      200: `${chessComBoards}brown/200.png`,
    },
  });

  function boardUrl(theme = BOARD_THEME, size = BOARD_SIZE) {
    return BOARD_MAP[theme]?.[size];
  }

  function isLichessHost(hostname) {
    return hostname === 'lichess.org' || hostname.endsWith('.lichess.org');
  }

  function boardCss(url) {
    return `
.${ROOT_CLASS}.${ROOT_CLASS}.${ROOT_CLASS} cg-board::before,
.${ROOT_CLASS}.${ROOT_CLASS}.${ROOT_CLASS} .is2d cg-board::before {
  background-image: url("${url}") !important;
  background-size: cover !important;
  background-position: center !important;
}
`;
  }

  function installBoardTheme() {
    if (!isLichessHost(window.location.hostname)) return false;

    const url = boardUrl();
    if (!url) return false;

    document.documentElement.classList.add(ROOT_CLASS);

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }

    style.textContent = boardCss(url);
    return true;
  }

  installBoardTheme();
  window.addEventListener('DOMContentLoaded', installBoardTheme, { once: true });
  window.addEventListener('load', installBoardTheme, { once: true });
})();
