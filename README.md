# Lichess Chess.com Soundpack

> A Tampermonkey userscript that replaces Lichess board and navigation sounds with Chess.com-style sound files.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-compatible-blue)](https://www.tampermonkey.net/)

---

## Why This Exists

Lichess has its own sound sets, but some players prefer the Chess.com sound style for moves, captures, checks, castling, and game events. This script keeps the Lichess interface intact while routing supported Lichess sound events to Chess.com sound URLs.

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser.
2. Open the Tampermonkey dashboard and click **Create a new script**.
3. Delete the default content, then paste the full contents of [`lichess-chesscom-soundpack.user.js`](lichess-chesscom-soundpack.user.js).
4. Press **Ctrl+S** (or **Cmd+S**) to save.
5. Open any Lichess page — the sound replacement is installed automatically.

## How It Works

The script hooks into Lichess's shared sound object (`site.sound` or `lichess.sound`) and replaces configured sound names with Chess.com sound URLs.

Lichess blocks direct page-level `fetch()` requests to Chess.com through Content Security Policy, so the script downloads configured audio files through Tampermonkey (`GM.xmlHttpRequest`), converts them to local `blob:` URLs, and passes those safe local URLs back to Lichess.

It also handles two Lichess-specific cases:

**Checks and checkmates**

Lichess can first play a speculative move/capture sound, then report check or checkmate shortly after. The script delays speculative game move sounds briefly and cancels them if a check or checkmate sound arrives.

**Backward navigation**

When moving backward through a game tree, Lichess may update the current ply without calling its normal move sound path. The script listens to Lichess's public `ply` event and plays a move sound when the ply decreases.

## Configuration

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

## Compatibility

| Browser | Extension |
|---------|-----------|
| Chrome / Chromium | Tampermonkey |
| Firefox | Tampermonkey |
| Edge | Tampermonkey |

The script uses `GM.xmlHttpRequest`, `@connect`, `unsafeWindow`, and `blob:` URLs. Tampermonkey is the primary tested userscript manager.

## Features

- Replaces Lichess board sounds with Chess.com-style audio URLs
- Works across Lichess pages that use the shared sound API
- Handles move, capture, check, checkmate, castle, countdown, notifications, and result sounds
- Avoids Lichess CSP blocks by loading external audio through Tampermonkey
- Plays a sound when navigating backward through game trees
- Respects Lichess sound settings — disabled or zero-volume sound is not forced
- Does not bundle or redistribute Chess.com audio files

## Disclaimer

This is an unofficial tool with no affiliation with Lichess or Chess.com. It references external Chess.com audio URLs, which may change or stop working at any time. Use at your own risk.

## Contributing

Pull requests and issues are welcome. Lichess and Chess.com can both change their frontend behavior or asset paths, so bug reports are most useful when they include:

1. The Lichess page where the issue happens.
2. The move or action that triggered the wrong sound.
3. Any console errors from the browser developer tools.
4. Whether `DEBUG = true` logs show `installed`, `ply hook installed`, or `move`.

To test locally:

```sh
npm test
node --check lichess-chesscom-soundpack.user.js
```

## License

MIT © [Aleksei Blinov](https://github.com/puhhh)
