# DM2: Death Match Decision Maker

Can't decide? Give every option a fighter and let them settle it. Two fighters brawl at a time, the winner stays on, and the last one standing is your decision.

DM2 is a static web game with no build step, no server and no dependencies. It runs in any modern browser on desktop or mobile.

## Play

- **Open `dist/dm2.html`** in a browser. It is one self-contained file you can share or host anywhere.
- Or serve the repo folder (`npm start`, or any static host such as GitHub Pages) and open `index.html`.

## How it works

1. **Enter your options** (2 to 20) and an optional question. Tap a fighter to choose who represents each option.
2. **Watch the death match.** Fights play at 1x, 2x or 4x, or skip straight to the result.
3. **Share the code.** The results screen shows a match code like `DM2-AQ...`. Anyone who enters it under **I have a code** sees the same contenders, the same fights and the same winner. A link ending in `#DM2-...` opens the code directly.

### Codes without a server

The code is the whole match: a version byte, a 32-bit random seed, the question, each option's text and fighter, and a checksum, encoded as URL-safe base64. Every fight (order, arenas, hits, misses, specials) comes from a seeded PRNG (mulberry32) using integer maths only, so the same code plays out identically in every browser. Nothing is stored anywhere.

### It's fair

Winner-stays-on normally favours late entrants. DM2 decides each fight with the reservoir-sampling rule: the challenger in fight *i* wins with probability 1/(i+1). That gives every option exactly a 1-in-*n* chance of being the decision, whatever its place in the queue. The fight is then scripted to reach that result. `tests/engine.test.js` checks this over 50,000 simulated matches.

## The fighters

Twenty parody legends drawn as 24x32 pixel art in `js/sprites.js`: The Lych Kinge, Skullator, Leo-Oh, He-Manly, Mumm-Rah, Super Mardio, King Browser, Sonik the Hedgefox, Pak-Muncher, Lenk of Hyrool, Mega Dude, Optimal Prime, The Shreddor, Leonardough, Ryo, Scorpyon, Samos Arran, Dinky Kongo, Kobra Kommander and Dr. Robutnik. They are affectionate parodies with altered names. They are not official characters and DM2 has no connection to any rights holder.

## Project layout

| Path | What it does |
| --- | --- |
| `index.html`, `css/style.css` | Page structure and the arcade-cabinet styling |
| `js/engine.js` | Seeded RNG, match codes, tournament simulation (pure, also runs in Node) |
| `js/roster.js` | Fighter names, special moves and attack styles |
| `js/sprites.js` | Pixel art for every fighter |
| `js/arena.js` | Canvas renderer: six procedural arenas, effects and the fight director |
| `js/audio.js` | Synthesised chiptune sound effects and battle music (WebAudio) |
| `js/app.js` | Screens, setup, playback and results |
| `tools/build.js` | Bundles everything into `dist/dm2.html` |

## Develop

```sh
npm test        # engine, code and fairness tests (Node 18+)
npm run build   # rebuild dist/dm2.html after changing anything
npm start       # serve locally on http://localhost:8080
```

**Keep old codes working.** Fighter indexes are stored in codes, so only ever append to `FIGHTERS` in `js/roster.js`. Any change to `simulate()` or `scriptFight()` changes what old codes replay; a fingerprint test fails if that happens. Bump `CODE_VERSION` and keep the old logic for old codes if you need to change it.
