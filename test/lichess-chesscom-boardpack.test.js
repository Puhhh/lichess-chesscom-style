const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'lichess-chesscom-boardpack.user.js');

function loadScript({ hostname = 'lichess.org', withHead = true } = {}) {
  const appended = [];
  const elementsById = new Map();
  const parent = {
    appendChild(element) {
      appended.push(element);
      if (element.id) elementsById.set(element.id, element);
      return element;
    },
  };

  const document = {
    head: withHead ? parent : null,
    documentElement: {
      classList: {
        added: [],
        add(name) {
          this.added.push(name);
        },
      },
      appendChild: parent.appendChild,
    },
    createElement(tagName) {
      return {
        tagName: tagName.toUpperCase(),
        textContent: '',
      };
    },
    getElementById(id) {
      return elementsById.get(id) || null;
    },
  };

  const window = {
    location: { hostname },
    document,
    addEventListener() {},
  };

  const context = vm.createContext({
    document,
    window,
  });

  vm.runInContext(fs.readFileSync(scriptPath, 'utf8'), context);

  return { appended };
}

test('injects a Chess.com board stylesheet on Lichess', () => {
  const { appended } = loadScript();

  assert.equal(appended.length, 1);
  assert.equal(appended[0].tagName, 'STYLE');
  assert.equal(appended[0].id, 'lichess-chesscom-boardpack-style');
  assert.match(appended[0].textContent, /cg-board::before/);
  assert.match(appended[0].textContent, /background-image:\s*url\("https:\/\/images\.chesscomfiles\.com\/chess-themes\/boards\/brown\/200\.png"\)/);
  assert.match(appended[0].textContent, /background-size:\s*cover !important/);
  assert.match(appended[0].textContent, /\.lichess-chesscom-boardpack\.lichess-chesscom-boardpack\.lichess-chesscom-boardpack cg-board::before/);
});

test('does not inject the board stylesheet outside Lichess', () => {
  const { appended } = loadScript({ hostname: 'example.com' });

  assert.deepEqual(appended, []);
});

test('can inject before document head is ready', () => {
  const { appended } = loadScript({ withHead: false });

  assert.equal(appended.length, 1);
  assert.equal(appended[0].id, 'lichess-chesscom-boardpack-style');
});
