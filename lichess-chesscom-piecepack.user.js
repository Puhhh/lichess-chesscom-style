// ==UserScript==
// @name         Lichess Chess.com Piecepack
// @namespace    https://github.com/Puhhh/lichess-chesscom-style
// @version      0.1.0
// @description  Replace the Lichess chess pieces with a Chess.com-style piece set.
// @author       Puhhh
// @match        https://lichess.org/*
// @match        https://*.lichess.org/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const STYLE_ID = 'lichess-chesscom-piecepack-style';
  const ROOT_CLASS = 'lichess-chesscom-piecepack';
  const PIECE_THEME = 'neo';
  const PIECE_SIZE = 150;
  const chessComPieces = 'https://images.chesscomfiles.com/chess-themes/pieces/';

  const PIECE_NAMES = Object.freeze({
    king: 'k',
    queen: 'q',
    rook: 'r',
    bishop: 'b',
    knight: 'n',
    pawn: 'p',
  });

  function pieceUrl(color, piece, theme = PIECE_THEME, size = PIECE_SIZE) {
    const colorPrefix = color === 'white' ? 'w' : color === 'black' ? 'b' : undefined;
    const pieceCode = PIECE_NAMES[piece];
    if (!colorPrefix || !pieceCode) return undefined;
    return `${chessComPieces}${theme}/${size}/${colorPrefix}${pieceCode}.png`;
  }

  function isLichessHost(hostname) {
    return hostname === 'lichess.org' || hostname.endsWith('.lichess.org');
  }

  function pieceRule(color, piece) {
    return `
.${ROOT_CLASS}.${ROOT_CLASS}.${ROOT_CLASS} cg-board piece.${color}.${piece},
.${ROOT_CLASS}.${ROOT_CLASS}.${ROOT_CLASS} .is2d piece.${color}.${piece},
.${ROOT_CLASS}.${ROOT_CLASS}.${ROOT_CLASS} piece.${color}.${piece} {
  background-image: url("${pieceUrl(color, piece)}") !important;
  background-size: contain !important;
}`;
  }

  function pieceCss() {
    return Object.keys(PIECE_NAMES)
      .flatMap(piece => ['white', 'black'].map(color => pieceRule(color, piece)))
      .join('\n');
  }

  function installPieceTheme() {
    if (!isLichessHost(window.location.hostname)) return false;

    document.documentElement.classList.add(ROOT_CLASS);

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }

    style.textContent = pieceCss();
    return true;
  }

  installPieceTheme();
  window.addEventListener('DOMContentLoaded', installPieceTheme, { once: true });
  window.addEventListener('load', installPieceTheme, { once: true });
})();
