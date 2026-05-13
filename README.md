# Lichess Chess.com Soundpack

Tampermonkey userscript that replaces Lichess board sound events with Chess.com sound URLs.

## Install

1. Install Tampermonkey in Chrome or another Chromium browser.
2. Open Tampermonkey dashboard.
3. Create a new script.
4. Paste the contents of `lichess-chesscom-soundpack.user.js`.
5. Save the script and open `https://lichess.org`.

## Configure Sounds

Edit the `SOUND_MAP` object near the top of `lichess-chesscom-soundpack.user.js`.

Each key is a Lichess sound event name, and each value is the audio URL that should be loaded instead:

```js
const SOUND_MAP = Object.freeze({
  move: 'https://www.chess.com/bundles/web/sounds/move-self.mp3',
  capture: 'https://www.chess.com/bundles/web/sounds/capture.mp3',
  check: 'https://www.chess.com/bundles/web/sounds/move-check.mp3',
});
```

If a sound event is not listed, Lichess keeps its original behavior.

## Notes

- This script does not include or redistribute Chess.com audio files. It references external URLs.
- Chess.com can change or remove those URLs at any time.
- Lichess sound settings still matter. If sound is disabled or volume is zero in Lichess, the script should not force playback.

## Test

```sh
npm test
```
