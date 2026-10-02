# DM2: Death Match Decision Maker

Can't decide? Give every option a fighter and let them settle it. DM2 has two game types:

- **Pick a winner.** Two fighters brawl at a time, the winner stays on, and the last one standing is your decision.
- **Prize Fights.** List some people and some gifts (or chores, seats, prizes). People fight for each gift in turn and the results show who gets what.

DM2 is a static web game with no build step, no server and no dependencies. It runs in any modern browser on desktop or mobile.

## Play

- **Open `dist/dm2.html`** in a browser. It is one self-contained file you can share or host anywhere.
- Or serve the repo folder (`npm start`, or any static host such as GitHub Pages) and open `index.html`.

## How it works

1. **Enter your options** (2 to 20) and an optional question, or switch to **Prize Fights** and list people (2 to 20) and gifts (1 to 20). Tap a fighter to choose who represents each option or person.
2. **Watch the death match.** Fights play at 1x, 2x or 4x, or skip straight to the result.
3. **Share the code.** The results screen shows a match code like `DM2-AQ...`. Anyone who enters it under **I have a code** sees the same contenders, the same fights and the same winner. A link ending in `#DM2-...` opens the code directly.

### Share links

On a hosted copy (GitHub Pages or any web server) the fight and results screens put the code in the address bar, so the browser's own share button works. The results screen also has **Copy share link** and, on devices that support it, a **Share** button. A local `dm2.html` file has no address other people can open, so it offers the code only.

Chat apps build link previews without running the game and never see the `#DM2-...` part of a link, so every DM2 link gets the same preview card (`og-image.png` plus the title and description in `index.html`). To show what the match is about, **Copy share link** and **Share** send the question as the message text, followed by the link. They never reveal the winner.

The preview image's address in `index.html` is absolute (`https://da-ar.github.io/dm2/og-image.png`). Change it if you host DM2 somewhere else. Regenerate the image after changing the roster or stages with `node tools/og-image.js` (needs Playwright).

If the game is shown inside another site's frame, it can't see the address people actually use. Build it with that address baked in: `node tools/build.js --share-base https://example.com/dm2/`.

### Prize Fights

Gifts are fought for in the order you list them, one fight per gift. For each gift, two people who don't have a gift yet are drawn at random and fight; the winner takes the gift and stops waiting, the loser goes back into the pool. When only one person is waiting they take the gift on a walkover.

- **More people than gifts:** whoever is still waiting when the gifts run out gets nothing, and the results say so.
- **More gifts than people:** once everyone has a gift, everyone waits again, so nobody gets a second gift before everyone has one. Gift counts never differ by more than one.
- **Fairness:** a uniformly random pair plus a 50/50 fight gives every waiting person exactly a 1-in-*k* chance at each gift. The tests check this over 40,000 matches.

### Codes without a server

The code is the whole match: a version byte (1 = pick a winner, 2 = Prize Fights), a 32-bit random seed, the question, each option's text and fighter, the gifts (Prize Fights only), and a checksum, encoded as URL-safe base64. Every fight (order, arenas, hits, misses, specials) comes from a seeded PRNG (mulberry32) using integer maths only, so the same code plays out identically in every browser. Nothing is stored anywhere.

### It's fair

In **Pick a winner**, winner-stays-on would normally favour late entrants. DM2 decides each fight with the reservoir-sampling rule: the challenger in fight *i* wins with probability 1/(i+1). That gives every option exactly a 1-in-*n* chance of being the decision, whatever its place in the queue. The fight is then scripted to reach that result. `tests/engine.test.js` checks this over 50,000 simulated matches.

## The fighters

Twenty-seven parody legends drawn as 24x32 pixel art in `js/sprites.js`: The Lych Kinge, Skullator, Leo-Oh, He-Manly, Mumm-Rah, Ganondork, King Browser, Sonik the Hedgefox, Pak-Muncher, Lenk of Hyrool, Mega Dude, Optimal Prime, The Shreddor, Leonardough, Ryo, Scorpyon, Samos Arran, Dinky Kongo, Kobra Kommander, Dr. Robutnik, Septiroth, Megatrom, Clara Loft, Mister Chief, Malfurious Stormcage, Solid Snack and Sorta. They are affectionate parodies with altered names. They are not official characters and DM2 has no connection to any rights holder.

Codes store each fighter by its position in `js/roster.js`. To retire a fighter, give its slot to a new one rather than deleting it: old codes keep the same fights and winner and simply show the new fighter. (Slot 5 was retired this way and now holds Ganondork.)

## Project layout

| Path | What it does |
| --- | --- |
| `index.html`, `css/style.css` | Page structure and the arcade-cabinet styling |
| `js/engine.js` | Seeded RNG, match codes, both simulations (pure, also runs in Node) |
| `js/roster.js` | Fighter names, special moves and attack styles |
| `js/sprites.js` | Pixel art for every fighter |
| `js/arena.js` | Canvas renderer: six procedural arenas, effects and the fight director |
| `js/audio.js` | Synthesised chiptune sound effects and battle music (WebAudio) |
| `js/app.js` | Screens, setup, playback and results |
| `tools/build.js` | Bundles everything into `dist/dm2.html` |
| `tools/og-image.js` | Renders `og-image.png`, the link-preview picture |

## Develop

```sh
npm test        # engine, code and fairness tests (Node 18+)
npm run build   # rebuild dist/dm2.html after changing anything
npm start       # serve locally on http://localhost:8080
```

**Keep old codes working.** Fighter indexes are stored in codes, so only ever append to `FIGHTERS` in `js/roster.js`. Any change to `simulate()`, `simulateShare()` or `scriptFight()` changes what old codes replay; a fingerprint test fails if that happens. Bump `CODE_VERSION` and keep the old logic for old codes if you need to change it.
