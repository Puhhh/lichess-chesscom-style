# Lichess Chess.com Style

> Tampermonkey userscripts that replace Lichess board sounds, chess pieces, and board texture with Chess.com-style assets.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-compatible-blue)](https://www.tampermonkey.net/)

---

## Why This Exists

Lichess has its own sound sets, piece themes, and board textures, but some players prefer the Chess.com style for moves, captures, checks, castling, game events, piece graphics, and board appearance. These scripts keep the Lichess interface intact while routing supported sound events to Chess.com sound URLs and applying Chess.com-style piece and board images through CSS.

## Scripts

| Script | Purpose |
|--------|---------|
| [`lichess-chesscom-soundpack.user.js`](lichess-chesscom-soundpack.user.js) | Replaces supported Lichess sound events with Chess.com-style audio. |
| [`lichess-chesscom-piecepack.user.js`](lichess-chesscom-piecepack.user.js) | Replaces Lichess 2D chess pieces with a Chess.com-style piece set. |
| [`lichess-chesscom-boardpack.user.js`](lichess-chesscom-boardpack.user.js) | Replaces the Lichess 2D board texture with a Chess.com-style board. |

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. Open the Tampermonkey dashboard and click **Create a new script**.
3. Delete the default content, then paste the full contents of the script you want to use:
   - [`lichess-chesscom-soundpack.user.js`](lichess-chesscom-soundpack.user.js) for sounds.
   - [`lichess-chesscom-piecepack.user.js`](lichess-chesscom-piecepack.user.js) for pieces.
   - [`lichess-chesscom-boardpack.user.js`](lichess-chesscom-boardpack.user.js) for the board texture.
4. Press **Ctrl+S** (or **Cmd+S**) to save.
5. Repeat the same steps for any other script you want to enable.
6. Open any Lichess page — the enabled replacements are installed automatically.

## How It Works

**Soundpack**

The script hooks into Lichess's shared sound object (`site.sound` or `lichess.sound`) and replaces configured sound names with Chess.com sound URLs.

Lichess blocks direct page-level `fetch()` requests to Chess.com through Content Security Policy, so the script downloads configured audio files through Tampermonkey (`GM.xmlHttpRequest`), converts them to local `blob:` URLs, and passes those safe local URLs back to Lichess.

It also handles two Lichess-specific cases:

**Checks and checkmates**

Lichess can first play a speculative move/capture sound, then report check or checkmate shortly after. The script delays speculative game move sounds briefly and cancels them if a check or checkmate sound arrives.

**Backward navigation**

When moving backward through a game tree, Lichess may update the current ply without calling its normal move sound path. The script listens to Lichess's public `ply` event and plays a move sound when the ply decreases.

**Piecepack**

The piecepack injects a small stylesheet on Lichess pages. It targets Lichess 2D piece classes such as `piece.white.king` and `piece.black.pawn`, then replaces their backgrounds with Chess.com piece image URLs.

**Boardpack**

The boardpack injects a small stylesheet on Lichess pages. Lichess renders the 2D board texture on `cg-board::before`, so the script targets that pseudo-element and replaces its background with a Chess.com board image URL.

## Configuration

**Sounds**

Edit the `SOUND_MAP` object near the top of [`lichess-chesscom-soundpack.user.js`](lichess-chesscom-soundpack.user.js).

Each key is a Lichess sound event name, and each value is the audio URL that should be used. The script contains the full map; this is a shortened example:

```js
const SOUND_MAP = Object.freeze({
  move: 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-self.mp3',
  capture: 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/capture.mp3',
  check: 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/move-check.mp3',
  castle: 'https://images.chesscomfiles.com/chess-themes/sounds/_MP3_/default/castle.mp3',
});
```

If a sound event is not listed, Lichess keeps its original behavior.

**Pieces**

Edit `PIECE_THEME` and `PIECE_SIZE` near the top of [`lichess-chesscom-piecepack.user.js`](lichess-chesscom-piecepack.user.js).

```js
const PIECE_THEME = 'neo';
const PIECE_SIZE = 150;
```

The piece script uses Chess.com URLs like `https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wk.png`.

**Board**

Edit `BOARD_THEME` and `BOARD_SIZE` near the top of [`lichess-chesscom-boardpack.user.js`](lichess-chesscom-boardpack.user.js).

```js
const BOARD_THEME = 'brown';
const BOARD_SIZE = 200;
```

The board script uses Chess.com URLs like `https://images.chesscomfiles.com/chess-themes/boards/brown/200.png`.

## Compatibility

| Browser | Extension |
|---------|-----------|
| Chrome / Chromium | Tampermonkey |
| Firefox | Tampermonkey |
| Edge | Tampermonkey |

The soundpack uses `GM.xmlHttpRequest`, `@connect`, `unsafeWindow`, and `blob:` URLs. The piecepack and boardpack only inject CSS and do not require Tampermonkey grants. Tampermonkey is the primary tested userscript manager.

## Features

- Replaces Lichess board sounds with Chess.com-style audio URLs
- Replaces Lichess 2D chess pieces with Chess.com-style image URLs
- Replaces the Lichess 2D board texture with a Chess.com-style image URL
- Works across Lichess pages that use the shared sound API
- Handles move, capture, check, checkmate, castle, countdown, notifications, and result sounds
- Avoids Lichess CSP blocks by loading external audio through Tampermonkey
- Applies piece and board styling through CSS without changing Lichess game logic
- Plays a sound when navigating backward through game trees
- Respects Lichess sound settings — disabled or zero-volume sound is not forced
- Does not bundle or redistribute Chess.com audio, piece image, or board image files

## Disclaimer

This is an unofficial tool with no affiliation with Lichess or Chess.com. It references external Chess.com audio, piece image, and board image URLs, which may change or stop working at any time. Use at your own risk.

## Contributing

Pull requests and issues are welcome. Lichess and Chess.com can both change their frontend behavior or asset paths, so bug reports are most useful when they include:

1. The Lichess page where the issue happens.
2. The move, action, or board page where the issue happens.
3. Any console errors from the browser developer tools.
4. Whether `DEBUG = true` logs show `installed`, `ply hook installed`, or `move`.

To test locally:

```sh
npm test
node --check lichess-chesscom-soundpack.user.js
node --check lichess-chesscom-piecepack.user.js
node --check lichess-chesscom-boardpack.user.js
```

## License

MIT © [Aleksei Blinov](https://github.com/puhhh)
