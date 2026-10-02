/* DM2 engine: seeded randomness, match codes and the tournament simulation.
   Everything here is pure and integer-only, so the same code produces the same
   fights in every browser. Never use Math.random() in this file. */
(function (root) {
  'use strict';

  var CODE_VERSION = 1;
  var CODE_PREFIX = 'DM2-';
  var MAX_OPTIONS = 20;
  var MAX_LABEL = 32;     // characters
  var MAX_QUESTION = 60;  // characters
  var MAX_HP = 100;
  var STAGE_COUNT = 6;

  /* ---------- seeded RNG (mulberry32) ---------- */
  function makeRng(seed) {
    var a = seed >>> 0;
    function next() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0);
    }
    return {
      next: next,
      // integer in [0, n). Rejection sampling keeps it unbiased.
      int: function (n) {
        var limit = 4294967296 - (4294967296 % n);
        var v;
        do { v = next(); } while (v >= limit);
        return v % n;
      }
    };
  }

  /* ---------- UTF-8 and base64url without platform differences ---------- */
  function utf8Encode(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.codePointAt(i);
      if (c > 0xffff) i++;
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }

  function utf8Decode(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length;) {
      var b = bytes[i++], c;
      if (b < 0x80) c = b;
      else if (b >= 0xf0) c = ((b & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
      else if (b >= 0xe0) c = ((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
      else c = ((b & 31) << 6) | (bytes[i++] & 63);
      if (isNaN(c)) throw new Error('bad text');
      s += String.fromCodePoint(c);
    }
    return s;
  }

  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function b64Encode(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
      if (i + 1 < bytes.length) s += B64[(n >> 6) & 63];
      if (i + 2 < bytes.length) s += B64[n & 63];
    }
    return s;
  }
  function b64Decode(str) {
    var out = [], buf = 0, bits = 0;
    for (var i = 0; i < str.length; i++) {
      var v = B64.indexOf(str[i]);
      if (v < 0) throw new Error('bad char');
      buf = (buf << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); }
    }
    return out;
  }

  function checksum(bytes) {
    var h = 0x5a;
    for (var i = 0; i < bytes.length; i++) h = ((h * 31) + bytes[i] + 7) & 0xff;
    return h;
  }

  /* Clip a string to n characters (code points), so emoji are never cut in half. */
  function clip(str, n) {
    return Array.from(String(str || '')).slice(0, n).join('');
  }

  /* ---------- match codes ----------
     byte 0      version
     bytes 1-4   seed (uint32, big endian)
     byte 5      question length (bytes), then question UTF-8
     next byte   option count, then per option: fighter index, label length, label UTF-8
     last byte   checksum                                                        */
  function encodeMatch(match) {
    var bytes = [CODE_VERSION];
    var seed = match.seed >>> 0;
    bytes.push((seed >>> 24) & 255, (seed >>> 16) & 255, (seed >>> 8) & 255, seed & 255);
    var q = utf8Encode(clip(match.question, MAX_QUESTION));
    bytes.push(q.length); bytes = bytes.concat(q);
    bytes.push(match.options.length);
    match.options.forEach(function (o) {
      var l = utf8Encode(clip(o.label, MAX_LABEL));
      bytes.push(o.fighter & 255, l.length);
      bytes = bytes.concat(l);
    });
    bytes.push(checksum(bytes));
    return CODE_PREFIX + b64Encode(bytes);
  }

  /* Accepts a bare code, a code with spaces/newlines, or a whole share link. */
  function normalizeCode(input) {
    var s = String(input || '');
    var hash = s.lastIndexOf('#');
    if (hash >= 0) s = s.slice(hash + 1);
    s = s.replace(/\s+/g, '');
    if (s.slice(0, 4).toUpperCase() === CODE_PREFIX) s = s.slice(4);
    return s;
  }

  function decodeMatch(input, fighterCount) {
    var body = normalizeCode(input);
    if (!body) throw new Error('Paste a match code first.');
    var bytes;
    try { bytes = b64Decode(body); } catch (e) { throw new Error('That code has characters a DM2 code never uses. Check for typos.'); }
    if (bytes.length < 8) throw new Error('That code is too short. Make sure you copied all of it.');
    var sum = bytes.pop();
    if (checksum(bytes) !== sum) throw new Error('That code is damaged or incomplete. Copy it again from the results screen.');
    if (bytes[0] !== CODE_VERSION) throw new Error('That code comes from a different version of DM2.');
    var p = 1;
    var seed = ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0; p += 4;
    var qLen = bytes[p++];
    var question = utf8Decode(bytes.slice(p, p + qLen)); p += qLen;
    var n = bytes[p++];
    if (n < 2 || n > MAX_OPTIONS) throw new Error('That code has an impossible number of contenders.');
    var options = [];
    for (var i = 0; i < n; i++) {
      var f = bytes[p++], len = bytes[p++];
      if (f === undefined || len === undefined || p + len > bytes.length) throw new Error('That code is incomplete.');
      if (fighterCount && f >= fighterCount) throw new Error('That code uses a fighter this version of DM2 does not have.');
      options.push({ fighter: f, label: utf8Decode(bytes.slice(p, p + len)) });
      p += len;
    }
    if (p !== bytes.length) throw new Error('That code has extra data on the end.');
    return { seed: seed, question: question, options: options };
  }

  /* ---------- the tournament ----------
     Winner stays on. To keep the decision fair, the challenger in fight i (1-based)
     wins with probability 1/(i+1): the reservoir-sampling rule, which gives every
     option exactly a 1/n chance of being the last one standing, whatever its
     position in the queue. The fight script is then written to reach that result. */
  function simulate(match) {
    var rng = makeRng(match.seed);
    var n = match.options.length;

    var order = [];
    for (var i = 0; i < n; i++) order.push(i);
    for (var j = n - 1; j > 0; j--) { // Fisher-Yates
      var k = rng.int(j + 1);
      var t = order[j]; order[j] = order[k]; order[k] = t;
    }

    var champion = order[0];
    var fights = [];
    var lastStage = -1;
    for (var r = 1; r < n; r++) {
      var challenger = order[r];
      var challengerWins = rng.int(r + 1) === 0;
      var stage;
      if (lastStage < 0) stage = rng.int(STAGE_COUNT);
      else { stage = rng.int(STAGE_COUNT - 1); if (stage >= lastStage) stage++; } // never the same arena twice in a row
      lastStage = stage;
      var winnerSide = challengerWins ? 1 : 0;
      fights.push({
        round: r,
        sides: [champion, challenger],
        winner: challengerWins ? challenger : champion,
        loser: challengerWins ? champion : challenger,
        winnerSide: winnerSide,
        stage: stage,
        actions: scriptFight(rng, winnerSide)
      });
      champion = challengerWins ? challenger : champion;
    }
    return { order: order, fights: fights, winner: champion };
  }

  /* A fight is a list of actions: {by: side, type, dmg, hp: [left, right] after}.
     The winner never drops to 0; when a loser's blow would be fatal it is turned into a miss or a block. */
  function scriptFight(rng, winnerSide) {
    var hp = [MAX_HP, MAX_HP];
    var actions = [];
    var turn = rng.int(2);
    var loserSide = 1 - winnerSide;
    while (true) {
      var by = turn, target = 1 - turn;
      var roll = rng.int(100);
      var type, dmg = 0;
      if (roll < 10) type = 'miss';
      else if (roll < 18) type = 'block';
      else if (roll < 34) { type = 'crit'; dmg = 26 + rng.int(12); }
      else { type = 'hit'; dmg = 12 + rng.int(12); }
      if (type === 'crit' && rng.int(100) < 30) type = 'special';
      if (type === 'special') dmg += 4;

      var ko = false;
      if (by === loserSide && hp[target] - dmg <= 0) {
        // the predetermined winner survives: deflect the fatal blow
        type = rng.int(2) ? 'block' : 'miss'; dmg = 0;
      }
      if (by === winnerSide && dmg > 0 && hp[target] - dmg <= 0) {
        ko = true;
        if (rng.int(100) < 50) type = 'special';
        dmg = hp[target];
      }
      if (actions.length >= 13 && by === winnerSide && !ko) {
        // keep fights from dragging: the winner ends it with a special
        type = 'special'; dmg = hp[target]; ko = true;
      }
      hp[target] -= dmg;
      actions.push({ by: by, type: type, dmg: dmg, ko: ko, hp: [hp[0], hp[1]] });
      if (ko) break;
      // combos happen: sometimes the same side attacks again
      turn = rng.int(100) < 68 ? target : by;
    }
    return actions;
  }

  function randomSeed() {
    var c = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? crypto : null;
    if (c) { var a = new Uint32Array(1); c.getRandomValues(a); return a[0] >>> 0; }
    return Math.floor(Math.random() * 4294967296) >>> 0;
  }

  var api = {
    CODE_VERSION: CODE_VERSION, MAX_OPTIONS: MAX_OPTIONS, MAX_LABEL: MAX_LABEL,
    MAX_QUESTION: MAX_QUESTION, MAX_HP: MAX_HP, STAGE_COUNT: STAGE_COUNT,
    makeRng: makeRng, encodeMatch: encodeMatch, decodeMatch: decodeMatch,
    normalizeCode: normalizeCode, simulate: simulate, randomSeed: randomSeed, clip: clip
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.DM2 = root.DM2 || {}; root.DM2.engine = api; }
})(this);
