/* Run with: node --test tests/ */
const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/engine.js');
const { FIGHTERS } = require('../js/roster.js');
const S = require('../js/sprites.js');

const sample = {
  seed: 3735928559,
  question: 'Where should we eat? 🍕',
  options: [
    { fighter: 0, label: 'Pizza' },
    { fighter: 1, label: 'Tacos' },
    { fighter: 2, label: 'Sushi 🍣' },
    { fighter: 19, label: 'Ünïcödé café' }
  ]
};

test('a code round-trips the question, options and seed', () => {
  const code = E.encodeMatch(sample);
  assert.match(code, /^DM2-[A-Za-z0-9_-]+$/);
  assert.deepStrictEqual(E.decodeMatch(code, FIGHTERS.length), sample);
});

test('codes survive share links, whitespace and lowercase prefixes', () => {
  const code = E.encodeMatch(sample);
  const body = code.slice(4);
  assert.deepStrictEqual(E.decodeMatch('https://example.com/dm2/#' + code), sample);
  assert.deepStrictEqual(E.decodeMatch('  dm2-' + body.slice(0, 10) + '\n' + body.slice(10) + ' '), sample);
});

test('damaged codes are rejected with a readable message', () => {
  const code = E.encodeMatch(sample);
  const flipped = code.slice(0, 12) + (code[12] === 'A' ? 'B' : 'A') + code.slice(13);
  assert.throws(() => E.decodeMatch(flipped), /damaged|incomplete|impossible|extra/);
  assert.throws(() => E.decodeMatch(code.slice(0, -5)), /damaged|incomplete|short/);
  assert.throws(() => E.decodeMatch('DM2-***'), /characters/);
  assert.throws(() => E.decodeMatch(''), /Paste/);
});

test('the same code replays the exact same tournament', () => {
  const a = E.simulate(E.decodeMatch(E.encodeMatch(sample)));
  const b = E.simulate(sample);
  assert.deepStrictEqual(a, b);
});

test('the simulation snapshot is stable (changing it breaks old codes)', () => {
  const r = E.simulate(sample);
  const fingerprint = r.order.join(',') + '|' + r.fights.map(f => f.winner + ':' + f.stage + ':' + f.actions.length).join(',') + '|' + r.winner;
  // If this fails you changed the simulation: every code already shared would replay differently.
  // Bump CODE_VERSION and keep the old simulation for old codes instead.
  assert.strictEqual(fingerprint, '1,0,3,2|0:2:13,0:1:12,0:5:6|0');
});

test('every fight is consistent: loser hits 0 on the last action, winner never does', () => {
  for (let seed = 1; seed < 400; seed++) {
    const n = 2 + (seed % 19);
    const opts = Array.from({ length: n }, (_, i) => ({ fighter: i, label: 'O' + i }));
    const r = E.simulate({ seed, question: '', options: opts });
    assert.strictEqual(r.fights.length, n - 1);
    let champ = r.order[0];
    r.fights.forEach((f, i) => {
      assert.strictEqual(f.sides[0], champ);
      assert.strictEqual(f.sides[1], r.order[i + 1]);
      const last = f.actions[f.actions.length - 1];
      assert.ok(last.ko);
      assert.strictEqual(last.hp[1 - f.winnerSide], 0);
      f.actions.forEach(a => assert.ok(a.hp[f.winnerSide] > 0));
      assert.ok(f.stage >= 0 && f.stage < E.STAGE_COUNT);
      if (i > 0) assert.notStrictEqual(f.stage, r.fights[i - 1].stage);
      champ = f.winner;
    });
    assert.strictEqual(r.winner, champ);
  }
});

test('every option has an equal chance to win', () => {
  const n = 5, trials = 50000;
  const wins = new Array(n).fill(0);
  const opts = Array.from({ length: n }, (_, i) => ({ fighter: i, label: 'O' + i }));
  for (let s = 0; s < trials; s++) wins[E.simulate({ seed: s * 2654435761 >>> 0, question: '', options: opts }).winner]++;
  wins.forEach(w => assert.ok(Math.abs(w / trials - 1 / n) < 0.012, 'win share ' + w / trials));
});

test('labels are clipped to the limits without splitting emoji', () => {
  const long = { seed: 1, question: 'q'.repeat(100), options: [{ fighter: 0, label: '😀'.repeat(50) }, { fighter: 1, label: 'b' }] };
  const back = E.decodeMatch(E.encodeMatch(long));
  assert.strictEqual(Array.from(back.options[0].label).length, E.MAX_LABEL);
  assert.strictEqual(back.question.length, E.MAX_QUESTION);
});

test('a full 20-fighter code stays a reasonable length', () => {
  const opts = FIGHTERS.map((f, i) => ({ fighter: i, label: 'Option number ' + i }));
  const code = E.encodeMatch({ seed: 42, question: 'What should we do this weekend?', options: opts });
  assert.ok(code.length < 600, code.length);
});

test('every roster fighter has a valid sprite', () => {
  assert.strictEqual(FIGHTERS.length, 20);
  FIGHTERS.forEach(f => {
    const sp = S.SPRITES[f.id];
    assert.ok(sp, f.id);
    assert.strictEqual(sp.rows.length, 32);
    sp.rows.forEach(r => assert.strictEqual(r.length, 24, f.id));
    assert.ok(S.pixels(f.id).some(p => p.y === 31), f.id + ' stands on the floor');
  });
});
