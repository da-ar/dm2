/* DM2 app: screens, setup, playback and results. */
(function () {
  'use strict';

  var DM2 = window.DM2, E = DM2.engine, FIGHTERS = DM2.roster.FIGHTERS, audio = DM2.audio, Arena = DM2.Arena;
  var $ = function (id) { return document.getElementById(id); };

  var EXAMPLES = {
    decide: { question: 'Where should we eat tonight?', labels: ['Pizza', 'Tacos', 'Sushi', 'Burgers'] },
    share: { question: 'Secret Santa: who gets which present?', labels: ['Amy', 'Ben', 'Cal', 'Dee'], gifts: ['Lego set', 'Cosy scarf', 'Coffee mug', 'Fancy socks'] }
  };
  var EXAMPLE = EXAMPLES.decide;

  var state = {
    screen: 'title',
    question: EXAMPLE.question,
    rows: [],
    gifts: [],
    mode: 'decide',
    example: true,
    tally: [],
    match: null,
    result: null,
    code: '',
    speed: 1,
    playToken: 0,
    playing: false,
    pickerRow: -1,
    loaded: null
  };

  /* ---------- arena ---------- */
  var canvas = document.createElement('canvas');
  canvas.width = Arena.W; canvas.height = Arena.H;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Pixel art arena');
  var arena = new Arena(canvas);
  arena.start();

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function portrait(id, w, h, opts) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    Arena.drawPortrait(c, id, opts);
    return c;
  }
  function fighterAt(index) { return FIGHTERS[index] || FIGHTERS[0]; }

  /* ---------- screens ---------- */
  var titleCycle = null;
  function show(name) {
    if (state.screen === 'fight' && name !== 'fight') stopPlayback();
    state.screen = name;
    document.querySelectorAll('.screen').forEach(function (s) { s.hidden = s.getAttribute('data-screen') !== name; });
    if (titleCycle) { clearInterval(titleCycle); titleCycle = null; }
    if (name === 'title') {
      $('title-frame').appendChild(canvas);
      arena.speed = 1;
      arena.setStage(Math.floor(Math.random() * Arena.STAGES.length));
      arena.startParade(shuffled(FIGHTERS.map(function (f) { return f.id; })));
      titleCycle = setInterval(function () {
        arena.tween(arena, { fade: 16 }, 300, 'linear').then(function () {
          arena.setStage((arena.stageIndex + 1) % Arena.STAGES.length);
          return arena.tween(arena, { fade: 0 }, 300, 'linear');
        }).catch(function () { /* interrupted by a screen change */ });
      }, 7000);
    }
    if (name === 'fight') $('fight-frame').insertBefore(canvas, $('fight-frame').firstChild);
    window.scrollTo(0, 0);
  }

  /* ---------- setup ---------- */
  function unusedFighter() {
    var used = state.rows.map(function (r) { return r.fighter; });
    var free = [];
    for (var i = 0; i < FIGHTERS.length; i++) if (used.indexOf(i) < 0) free.push(i);
    return free.length ? free[Math.floor(Math.random() * free.length)] : Math.floor(Math.random() * FIGHTERS.length);
  }
  function initRows(labels) {
    state.rows = [];
    labels.forEach(function (l) { state.rows.push({ label: l, fighter: unusedFighter() }); });
  }

  function loadExample(mode) {
    var ex = EXAMPLES[mode];
    state.question = ex.question;
    initRows(ex.labels);
    state.gifts = (ex.gifts || ['', '']).slice();
    state.example = true;
  }

  function setMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    if (state.example) loadExample(mode);
    else if (mode === 'share' && !state.gifts.length) state.gifts = ['', ''];
    renderSetup();
  }

  function renderSetup() {
    var share = state.mode === 'share';
    $('mode-decide').setAttribute('aria-pressed', String(!share));
    $('mode-share').setAttribute('aria-pressed', String(share));
    $('setup-title').textContent = share ? 'Who gets what?' : 'Choose your contenders';
    $('contenders-label').textContent = share ? 'People' : 'Contenders';
    $('question').placeholder = share ? 'Secret Santa: who gets which present?' : 'Where should we eat tonight?';
    $('gifts-panel').hidden = !share;
    $('fighter-hint').textContent = 'Tap a fighter to choose who represents that ' + (share ? 'person.' : 'option.');
    if (share) renderGifts();
    $('question').value = state.question;
    $('example-note').hidden = !state.example;
    var list = $('contenders');
    list.innerHTML = '';
    state.rows.forEach(function (row, i) {
      var f = fighterAt(row.fighter);
      var li = document.createElement('li');
      li.className = 'contender';

      var fb = document.createElement('button');
      fb.type = 'button'; fb.className = 'fighter-btn';
      fb.id = 'fighter-' + i;
      fb.setAttribute('aria-label', 'Fighter for contender ' + (i + 1) + ': ' + f.name + '. Change fighter');
      fb.appendChild(portrait(f.id, 20, 16, { head: true }));
      var nm = document.createElement('span'); nm.textContent = f.name; fb.appendChild(nm);
      fb.addEventListener('click', function () { audio.play('select'); openPicker(i); });

      var input = document.createElement('input');
      input.className = 'field'; input.type = 'text'; input.maxLength = E.MAX_LABEL;
      input.id = 'contender-' + i;
      input.value = row.label;
      input.placeholder = (state.mode === 'share' ? 'Person ' : 'Option ') + (i + 1);
      input.autocomplete = 'off';
      input.setAttribute('aria-label', (state.mode === 'share' ? 'Person ' : 'Contender ') + (i + 1));
      input.addEventListener('input', function () { row.label = input.value; markEdited(); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (i === state.rows.length - 1 && state.rows.length < E.MAX_OPTIONS && input.value.trim()) addRow();
          else { var next = $('contender-' + (i + 1)); if (next) next.focus(); }
        }
      });

      var rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'remove'; rm.textContent = 'X';
      rm.setAttribute('aria-label', 'Remove contender ' + (i + 1));
      rm.disabled = state.rows.length <= 2;
      rm.addEventListener('click', function () {
        audio.play('back');
        state.rows.splice(i, 1);
        markEdited();
        renderSetup();
      });

      li.appendChild(fb); li.appendChild(input); li.appendChild(rm);
      list.appendChild(li);
    });
    $('count').textContent = state.rows.length + ' / ' + E.MAX_OPTIONS;
    $('btn-add').disabled = state.rows.length >= E.MAX_OPTIONS;
  }

  function renderGifts() {
    var list = $('gifts');
    list.innerHTML = '';
    state.gifts.forEach(function (gift, i) {
      var li = document.createElement('li');
      var row = document.createElement('div');
      row.className = 'gift-row';
      var input = document.createElement('input');
      input.className = 'field'; input.type = 'text'; input.maxLength = E.MAX_LABEL;
      input.id = 'gift-' + i;
      input.value = gift;
      input.placeholder = 'Gift ' + (i + 1);
      input.autocomplete = 'off';
      input.setAttribute('aria-label', 'Gift ' + (i + 1));
      input.addEventListener('input', function () { state.gifts[i] = input.value; markEdited(); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (i === state.gifts.length - 1 && state.gifts.length < E.MAX_GIFTS && input.value.trim()) addGift();
          else { var next = $('gift-' + (i + 1)); if (next) next.focus(); }
        }
      });
      var rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'remove'; rm.textContent = 'X';
      rm.setAttribute('aria-label', 'Remove gift ' + (i + 1));
      rm.disabled = state.gifts.length <= 1;
      rm.addEventListener('click', function () {
        audio.play('back');
        state.gifts.splice(i, 1);
        markEdited();
        renderGifts();
      });
      row.appendChild(input); row.appendChild(rm);
      li.appendChild(row);
      list.appendChild(li);
    });
    $('gift-count').textContent = state.gifts.length + ' / ' + E.MAX_GIFTS;
    $('btn-add-gift').disabled = state.gifts.length >= E.MAX_GIFTS;
  }

  function addGift() {
    if (state.gifts.length >= E.MAX_GIFTS) return;
    audio.play('add');
    state.gifts.push('');
    markEdited();
    renderGifts();
    $('gift-' + (state.gifts.length - 1)).focus();
  }

  function markEdited() {
    if (state.example) { state.example = false; $('example-note').hidden = true; }
    $('setup-error').hidden = true;
  }

  function addRow() {
    if (state.rows.length >= E.MAX_OPTIONS) return;
    audio.play('add');
    state.rows.push({ label: '', fighter: unusedFighter() });
    markEdited();
    renderSetup();
    $('contender-' + (state.rows.length - 1)).focus();
  }

  function openSetup(fromMatch, mode) {
    if (fromMatch) {
      state.mode = fromMatch.mode === 'share' ? 'share' : 'decide';
      state.question = fromMatch.question;
      state.rows = fromMatch.options.map(function (o) { return { label: o.label, fighter: o.fighter }; });
      if (fromMatch.gifts) state.gifts = fromMatch.gifts.slice();
      state.example = false;
    } else if (mode && mode !== state.mode) {
      state.mode = mode;
      if (state.example) loadExample(mode);
      else if (mode === 'share' && !state.gifts.length) state.gifts = ['', ''];
    }
    show('setup');
    renderSetup();
  }

  /* ---------- fighter picker ---------- */
  function openPicker(rowIndex) {
    state.pickerRow = rowIndex;
    var row = state.rows[rowIndex];
    $('picker-for').textContent = 'Who fights for ' + (row.label.trim() ? '"' + row.label.trim() + '"' : (state.mode === 'share' ? 'person ' : 'option ') + (rowIndex + 1)) + '? Picking a fighter already in use swaps the two.';
    var grid = $('picker-grid');
    grid.innerHTML = '';
    FIGHTERS.forEach(function (f, fi) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'pick' + (fi === row.fighter ? ' current' : '');
      b.appendChild(portrait(f.id, 24, 32));
      var strong = document.createElement('strong'); strong.textContent = f.name; b.appendChild(strong);
      var small = document.createElement('small'); small.textContent = f.from; b.appendChild(small);
      var owner = -1;
      state.rows.forEach(function (r, ri) { if (r.fighter === fi && ri !== rowIndex) owner = ri; });
      if (owner >= 0) {
        var em = document.createElement('em');
        em.textContent = 'Fighting for ' + (state.rows[owner].label.trim() || 'option ' + (owner + 1));
        b.appendChild(em);
      }
      b.addEventListener('click', function () {
        if (owner >= 0) state.rows[owner].fighter = row.fighter;
        row.fighter = fi;
        audio.play('select');
        closePicker();
        renderSetup();
        var fb = $('fighter-' + rowIndex); if (fb) fb.focus();
      });
      grid.appendChild(b);
    });
    $('picker').hidden = false;
    var cur = grid.querySelector('.current');
    (cur || grid.firstChild).focus();
  }
  function closePicker() { $('picker').hidden = true; }

  /* ---------- playback ---------- */
  function sideInfo(index) {
    var opt = state.match.options[index];
    return { label: opt.label, fighter: fighterAt(opt.fighter) };
  }

  function setHud(side, index, hp, instant) {
    var el = $('hud-' + side), info = sideInfo(index);
    el.classList.remove('empty');
    el.querySelector('.hud-label').textContent = info.label;
    el.querySelector('.hud-char').textContent = info.fighter.name;
    Arena.drawPortrait(el.querySelector('.hud-face'), info.fighter.id, { head: true });
    setHp(side, hp, instant);
  }
  function setHp(side, hp, instant) {
    var el = $('hud-' + side), fill = el.querySelector('.hp-fill'), ghost = el.querySelector('.hp-ghost');
    if (instant) {
      fill.style.transition = 'none'; ghost.style.transition = 'none';
      void fill.offsetWidth;
    }
    fill.style.width = hp + '%';
    ghost.style.width = hp + '%';
    fill.classList.toggle('mid', hp <= 50 && hp > 25);
    fill.classList.toggle('low', hp <= 25);
    if (instant) { void fill.offsetWidth; fill.style.transition = ''; ghost.style.transition = ''; }
  }

  function banner(text, kind, ms, fx) {
    var b = $('banner');
    var span = document.createElement('span');
    span.className = 'b-' + kind;
    span.textContent = text;
    var dur = Math.round(ms / arena.speed);
    span.style.setProperty('--dur', dur + 'ms');
    if (fx) span.style.setProperty('--fx', fx);
    b.innerHTML = '';
    b.appendChild(span);
    setTimeout(function () { if (span.parentNode === b) b.removeChild(span); }, dur);
  }

  var LINES = {
    hit: ['{A} lands a clean hit on {B}.', '{A} smacks {B} right in the pixels.', '{B} eats a solid shot from {A}.', '{A} connects. {B} staggers!', 'A cheap shot from {A}. {B} is not amused.'],
    crit: ['CRITICAL! {A} wallops {B}!', '{A} finds a weak spot. Huge damage to {B}!', 'That one rattled the cabinet. {A} crushes {B}!'],
    special: ['{A} unleashes {S}!', '{S}! {A} goes all in on {B}!'],
    miss: ['{A} swings and whiffs. {B} dodges!', '{B} sidesteps. {A} hits nothing but air.', 'Missed! {B} is too quick.'],
    block: ['{B} blocks it cold.', '{B} shrugs it off with a perfect block.', 'Blocked! {A} hits a wall.']
  };
  function comment(a, c, i) {
    var list = LINES[a.type], fight = c.fight;
    var line = list[(fight.round * 31 + i * 7) % list.length];
    var A = '<b>' + escapeHtml(c.labels[a.by]) + '</b>', B = '<b>' + escapeHtml(c.labels[1 - a.by]) + '</b>';
    var html = line.replace('{A}', A).replace('{B}', B).replace('{S}', escapeHtml(c.meta[a.by].special));
    if (a.ko) html += ' ' + A + ' finishes ' + B + '!';
    $('commentary').innerHTML = html;
  }

  function renderQueue(order) {
    var q = $('queue');
    q.innerHTML = '';
    order.forEach(function (idx) {
      var info = sideInfo(idx);
      var li = document.createElement('li');
      li.id = 'q-' + idx;
      li.appendChild(portrait(info.fighter.id, 20, 16, { head: true }));
      var sp = document.createElement('span'); sp.textContent = info.label; li.appendChild(sp);
      li.title = info.label + ' (' + info.fighter.name + ')';
      q.appendChild(li);
    });
  }
  function queueState(idx, cls) {
    var li = $('q-' + idx);
    if (!li) return;
    li.classList.remove('fighting', 'out', 'champ', 'got');
    if (!cls && state.tally[idx]) cls = 'got';
    if (cls) li.classList.add(cls);
    var badge = li.querySelector('.badge');
    if (state.tally[idx] && !badge) { badge = document.createElement('span'); badge.className = 'badge'; li.appendChild(badge); }
    if (badge) badge.textContent = state.tally[idx] > 1 ? state.tally[idx] + ' GIFTS' : 'GIFT';
    if (cls === 'fighting') { // scroll the strip only, never the page
      var q = $('queue');
      q.scrollTo({ left: li.offsetLeft - q.offsetLeft - q.clientWidth / 2 + li.offsetWidth / 2, behavior: 'smooth' });
    }
  }

  arena.hooks = {
    sfx: function (n) { audio.play(n); },
    banner: banner,
    comment: comment,
    stageName: function (name) { $('stage-name').textContent = name; },
    matchup: function (c) {
      if (c.prize) return shareMatchup(c);
      var f = c.fight;
      setHud(0, f.sides[0], 100, true);
      setHud(1, f.sides[1], 100, true);
      $('hud-round').textContent = 'R' + f.round + '/' + state.result.fights.length;
      queueState(f.sides[0], 'fighting');
      queueState(f.sides[1], 'fighting');
      $('commentary').innerHTML = c.first
        ? 'First up: <b>' + escapeHtml(c.labels[0]) + '</b> versus <b>' + escapeHtml(c.labels[1]) + '</b>.'
        : '<b>' + escapeHtml(c.labels[0]) + '</b> stays on. Here comes <b>' + escapeHtml(c.labels[1]) + '</b>!';
    },
    hp: function (side, hp) { setHp(side, hp); },
    heal: function (side) {
      var fill = $('hud-' + side).querySelector('.hp-fill');
      fill.classList.add('heal');
      setHp(side, 100);
      setTimeout(function () { fill.classList.remove('heal'); }, 700);
    },
    koDone: function (c) {
      if (c.prize) return shareAward(c);
      var f = c.fight;
      queueState(f.loser, 'out');
      queueState(f.winner, c.final ? 'champ' : 'fighting');
      var label = c.labels[f.winnerSide];
      banner(c.final ? label + ' wins it all!' : label + ' wins!', 'win', c.final ? 2200 : 1200);
      $('commentary').innerHTML = c.final
        ? '<b>' + escapeHtml(label) + '</b> is the last one standing!'
        : '<b>' + escapeHtml(label) + '</b> wins round ' + f.round + '. Winner stays on!';
    }
  };

  /* ---------- who gets what: HUD and tallies ---------- */
  function giftName(i) { return state.match.gifts[i]; }

  function renderGiftTable() {
    var t = $('gift-table');
    t.innerHTML = '';
    state.match.gifts.forEach(function (g, i) {
      var li = document.createElement('li');
      li.id = 'gt-' + i;
      li.innerHTML = '<b>' + escapeHtml(g) + '</b> <span>&rarr; ?</span>';
      t.appendChild(li);
    });
  }

  function shareMatchup(c) {
    var r = c.round, total = state.match.gifts.length, gift = giftName(r.gift);
    $('hud-round').textContent = 'GIFT ' + r.round + '/' + total;
    $('prize-line').innerHTML = 'Up for grabs: <b>' + escapeHtml(gift) + '</b>';
    var row = $('gt-' + r.gift);
    if (row) row.classList.add('current');
    setHud(0, r.sides[0], 100, true);
    if (r.walkover) {
      $('hud-1').classList.add('empty');
      queueState(r.sides[0], 'fighting');
      $('commentary').innerHTML = '<b>' + escapeHtml(c.labels[0]) + '</b> is the last one waiting. No fight needed for <b>' + escapeHtml(gift) + '</b>.';
    } else {
      setHud(1, r.sides[1], 100, true);
      queueState(r.sides[0], 'fighting');
      queueState(r.sides[1], 'fighting');
      $('commentary').innerHTML = '<b>' + escapeHtml(c.labels[0]) + '</b> and <b>' + escapeHtml(c.labels[1]) +
        '</b> are drawn to fight for <b>' + escapeHtml(gift) + '</b>!';
    }
  }

  function shareAward(c) {
    var r = c.round, gift = giftName(r.gift), who = sideInfo(r.winner).label;
    state.tally[r.winner] = (state.tally[r.winner] || 0) + 1;
    queueState(r.winner, 'got');
    if (!r.walkover) queueState(r.loser, null);
    var row = $('gt-' + r.gift);
    if (row) {
      row.classList.remove('current'); row.classList.add('won');
      row.querySelector('span').innerHTML = '&rarr; ' + escapeHtml(who);
    }
    banner(who + ' gets ' + gift + '!', 'win', c.final ? 2200 : 1500);
    $('commentary').innerHTML = '<b>' + escapeHtml(who) + '</b> ' + (r.walkover ? 'takes' : 'wins') + ' <b>' + escapeHtml(gift) + '</b>!' +
      (c.final ? ' Every gift has a home.' : '');
  }

  function stopPlayback() {
    state.playToken++;
    state.playing = false;
    arena.abort();
    audio.stopMusic();
    $('banner').innerHTML = '';
  }

  function play(match) {
    stopPlayback();
    var token = state.playToken;
    state.match = match;
    state.result = E.simulate(match);
    state.code = E.encodeMatch(match);
    state.playing = true;
    show('fight');
    arena.reset();
    arena.speed = state.speed;
    $('fight-q').textContent = match.question ? match.question : '';
    $('stage-name').textContent = '';
    var share = match.mode === 'share';
    state.tally = match.options.map(function () { return 0; });
    $('prize-line').hidden = !share;
    $('gift-wrap').hidden = !share;
    $('hud-1').classList.remove('empty');
    $('queue-label').textContent = share ? 'People' : 'Fight order';
    renderQueue(share ? match.options.map(function (o, i) { return i; }) : state.result.order);
    if (share) renderGiftTable();
    audio.startMusic();
    var fights = state.result.fights;

    (async function () {
      try {
        if (share) {
          var rounds = state.result.rounds;
          for (var g = 0; g < rounds.length; g++) {
            var r = rounds[g];
            var common = {
              round: r, prize: { index: r.gift }, first: g === 0, final: g === rounds.length - 1,
              intro: 'Gift ' + r.round + ': ' + giftName(r.gift)
            };
            if (r.walkover) {
              var solo = sideInfo(r.winner);
              await arena.playWalkover(Object.assign(common, { id: solo.fighter.id, meta: [solo.fighter], labels: [solo.label] }));
            } else {
              var pa = sideInfo(r.sides[0]), pb = sideInfo(r.sides[1]);
              await arena.playFight(Object.assign(common, {
                fight: r, fresh: true,
                ids: [pa.fighter.id, pb.fighter.id], meta: [pa.fighter, pb.fighter], labels: [pa.label, pb.label]
              }));
            }
          }
          fights = [];
        }
        for (var i = 0; i < fights.length; i++) {
          var f = fights[i];
          var a = sideInfo(f.sides[0]), b = sideInfo(f.sides[1]);
          await arena.playFight({
            fight: f,
            ids: [a.fighter.id, b.fighter.id],
            meta: [a.fighter, b.fighter],
            labels: [a.label, b.label],
            first: i === 0,
            final: i === fights.length - 1
          });
        }
        await arena.wait(1600);
        if (token !== state.playToken) return;
        audio.stopMusic();
        showResult();
      } catch (e) {
        if (!(e && e.aborted)) { console.error(e); }
      }
    })();
  }

  /* ---------- results ---------- */
  function showResult() {
    var m = state.match, r = state.result;
    stopPlayback();
    show('result');
    $('code-box').textContent = state.code;
    $('copy-toast').textContent = '';
    $('btn-copy-link').hidden = !shareLinkAvailable();
    var share = m.mode === 'share';
    $('code-hint').textContent = share
      ? 'Anyone who enters this code sees the same people, the same gifts, the same fights and the same result.'
      : 'Anyone who enters this code sees the same contenders, the same fights and the same winner.';
    $('share-hero').hidden = !share;
    $('decide-hero').hidden = share;
    if (share) return showShareResult();
    var w = sideInfo(r.winner);
    $('result-q').textContent = m.question || '';
    $('winner-label').textContent = w.label;
    var wins = r.fights.filter(function (f) { return f.winner === r.winner; }).length;
    $('winner-sub').textContent = 'Fought as ' + w.fighter.name + ' and won ' + wins + (wins === 1 ? ' fight' : ' fights') +
      '. Every contender had the same 1 in ' + m.options.length + ' chance.';
    Arena.drawPortrait($('winner-canvas'), w.fighter.id);
    var log = $('fight-log');
    log.innerHTML = '';
    r.fights.forEach(function (f, i) {
      var W = sideInfo(f.winner), L = sideInfo(f.loser);
      var last = f.actions[f.actions.length - 1];
      var how = last.type === 'special' ? W.fighter.special : (last.type === 'crit' ? 'a critical hit' : 'a final blow');
      var li = document.createElement('li');
      if (i === r.fights.length - 1) li.className = 'final';
      li.innerHTML = '<b>' + escapeHtml(W.label) + '</b> (' + escapeHtml(W.fighter.name) + ') beat ' + escapeHtml(L.label) +
        ' (' + escapeHtml(L.fighter.name) + ') with ' + escapeHtml(how) + ' in ' + f.actions.length + ' moves.';
      log.appendChild(li);
    });
    audio.play('victory');
  }

  function showShareResult() {
    var m = state.match, r = state.result;
    $('share-q').textContent = m.question || '';
    var list = $('share-list');
    list.innerHTML = '';
    function personCell(idx) {
      var info = sideInfo(idx);
      var who = document.createElement('div');
      who.className = 'share-who';
      var sp = document.createElement('span');
      sp.textContent = info.label;
      var sm = document.createElement('small'); sm.textContent = info.fighter.name; sp.appendChild(sm);
      who.appendChild(sp);
      who.appendChild(portrait(info.fighter.id, 20, 16, { head: true }));
      return who;
    }
    r.rounds.forEach(function (round) {
      var li = document.createElement('li');
      var g = document.createElement('span');
      g.className = 'share-gift';
      g.textContent = giftName(round.gift);
      li.appendChild(g);
      li.appendChild(personCell(round.winner));
      list.appendChild(li);
    });
    r.awards.forEach(function (gifts, idx) {
      if (gifts.length) return;
      var li = document.createElement('li');
      li.className = 'nothing';
      var g = document.createElement('span');
      g.className = 'share-gift';
      g.textContent = 'No gift this time';
      li.appendChild(g);
      li.appendChild(personCell(idx));
      list.appendChild(li);
    });
    var fightsFought = r.rounds.filter(function (x) { return !x.walkover; }).length;
    $('share-sub').textContent = m.gifts.length + (m.gifts.length === 1 ? ' gift' : ' gifts') + ' shared out in ' + fightsFought +
      (fightsFought === 1 ? ' fight' : ' fights') + '. Everyone had the same chance at every gift.';

    var log = $('fight-log');
    log.innerHTML = '';
    r.rounds.forEach(function (round, i) {
      var li = document.createElement('li');
      if (i === r.rounds.length - 1) li.className = 'final';
      var W = sideInfo(round.winner), gift = escapeHtml(giftName(round.gift));
      if (round.walkover) {
        li.innerHTML = gift + ': <b>' + escapeHtml(W.label) + '</b> (' + escapeHtml(W.fighter.name) + ') was the last one waiting and took it on a walkover.';
      } else {
        var L = sideInfo(round.loser), last = round.actions[round.actions.length - 1];
        var how = last.type === 'special' ? W.fighter.special : (last.type === 'crit' ? 'a critical hit' : 'a final blow');
        li.innerHTML = gift + ': <b>' + escapeHtml(W.label) + '</b> (' + escapeHtml(W.fighter.name) + ') beat ' + escapeHtml(L.label) +
          ' (' + escapeHtml(L.fighter.name) + ') with ' + escapeHtml(how) + ' in ' + round.actions.length + ' moves.';
      }
      log.appendChild(li);
    });
    audio.play('victory');
  }

  function shareLinkAvailable() {
    try { return window.top === window.self && /^https?:$/.test(location.protocol); } catch (e) { return false; }
  }

  function copyText(text, okMsg) {
    var toast = $('copy-toast');
    function fallback() {
      var range = document.createRange();
      range.selectNodeContents($('code-box'));
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      toast.textContent = 'Code selected. Copy it with your keyboard or long-press.';
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast.textContent = okMsg; audio.play('select'); }, fallback);
    } else fallback();
  }

  /* ---------- code entry ---------- */
  function loadCode() {
    var err = $('code-error');
    err.hidden = true;
    $('code-preview').hidden = true;
    try {
      var m = E.decodeMatch($('code-input').value, FIGHTERS.length);
      state.loaded = m;
      $('preview-q').textContent = m.question || 'No question given. Just a good old death match.';
      var list = $('preview-list');
      list.innerHTML = '';
      m.options.forEach(function (o) {
        var f = fighterAt(o.fighter);
        var li = document.createElement('li');
        li.appendChild(portrait(f.id, 20, 16, { head: true }));
        var sp = document.createElement('span');
        sp.textContent = o.label;
        var sm = document.createElement('small'); sm.textContent = f.name; sp.appendChild(sm);
        li.appendChild(sp);
        list.appendChild(li);
      });
      var share = m.mode === 'share';
      $('preview-people-label').textContent = share ? 'People' : 'Contenders';
      $('preview-gifts-wrap').hidden = !share;
      if (share) {
        var gl = $('preview-gifts');
        gl.innerHTML = '';
        m.gifts.forEach(function (g) { var li = document.createElement('li'); li.textContent = g; gl.appendChild(li); });
      }
      $('code-preview').hidden = false;
      audio.play('add');
      return true;
    } catch (e) {
      err.textContent = e.message;
      err.hidden = false;
      audio.play('back');
      return false;
    }
  }

  function codeFromHash() {
    var h = decodeURIComponent(location.hash.replace(/^#/, ''));
    return /^dm2-/i.test(h) ? h : '';
  }
  function openCode(prefill) {
    show('code');
    $('code-error').hidden = true;
    $('code-preview').hidden = true;
    if (prefill) { $('code-input').value = prefill; loadCode(); }
    else $('code-input').focus();
  }

  /* ---------- wiring ---------- */
  function on(id, fn) { $(id).addEventListener('click', fn); }

  on('btn-new', function () { audio.play('select'); openSetup(null, 'decide'); });
  on('btn-share', function () { audio.play('select'); openSetup(null, 'share'); });
  on('mode-decide', function () { audio.play('select'); setMode('decide'); });
  on('mode-share', function () { audio.play('select'); setMode('share'); });
  on('btn-add-gift', addGift);
  on('btn-have-code', function () { audio.play('select'); openCode(); });
  on('brand', function () { audio.play('back'); show('title'); });
  on('btn-add', addRow);
  on('btn-shuffle', function () {
    audio.play('select');
    var picks = shuffled(FIGHTERS.map(function (f, i) { return i; }));
    state.rows.forEach(function (r, i) { r.fighter = picks[i % picks.length]; });
    renderSetup();
  });
  on('btn-clear', function () {
    audio.play('back');
    state.question = '';
    state.rows = [];
    initRows(['', '']);
    state.gifts = ['', ''];
    state.example = false;
    renderSetup();
    $('contender-0').focus();
  });
  $('question').addEventListener('input', function () { state.question = $('question').value; markEdited(); });
  on('btn-fight', function () {
    var share = state.mode === 'share';
    var named = state.rows.filter(function (r) { return r.label.trim(); });
    var gifts = state.gifts.map(function (g) { return g.trim(); }).filter(Boolean);
    var err = $('setup-error');
    var problem = named.length < 2 ? (share ? 'Name at least two people to fight over the gifts.' : 'Name at least two contenders to start the death match.')
      : (share && !gifts.length) ? 'Add at least one gift for the people to fight over.' : '';
    if (problem) {
      err.textContent = problem;
      err.hidden = false;
      audio.play('back');
      return;
    }
    err.hidden = true;
    audio.unlock();
    var match = {
      mode: state.mode,
      seed: E.randomSeed(),
      question: state.question.trim(),
      options: named.map(function (r) { return { label: r.label.trim(), fighter: r.fighter }; })
    };
    if (share) match.gifts = gifts;
    // play exactly what the code will contain
    play(E.decodeMatch(E.encodeMatch(match), FIGHTERS.length));
  });

  on('btn-load-code', loadCode);
  $('code-input').addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); loadCode(); } });
  on('btn-watch-code', function () { if (state.loaded) { audio.unlock(); play(state.loaded); } });

  on('btn-skip', function () { audio.play('select'); showResult(); });
  document.querySelectorAll('[data-speed]').forEach(function (b) {
    b.addEventListener('click', function () {
      state.speed = Number(b.getAttribute('data-speed'));
      arena.speed = state.speed;
      document.querySelectorAll('[data-speed]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      audio.play('select');
    });
  });

  on('btn-copy-code', function () { copyText(state.code, 'Code copied. Send it to anyone with DM2.'); });
  on('btn-copy-link', function () { copyText(location.origin + location.pathname + '#' + state.code, 'Link copied. Opening it replays this death match.'); });
  on('btn-replay', function () { audio.play('select'); play(state.match); });
  on('btn-rematch', function () {
    audio.play('select');
    var m = { mode: state.match.mode, seed: E.randomSeed(), question: state.match.question, options: state.match.options.slice() };
    if (state.match.gifts) m.gifts = state.match.gifts.slice();
    play(m);
  });
  on('btn-edit', function () { audio.play('select'); openSetup(state.match); });

  on('picker-close', function () { closePicker(); var fb = $('fighter-' + state.pickerRow); if (fb) fb.focus(); });
  $('picker').addEventListener('click', function (e) { if (e.target === $('picker')) closePicker(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('picker').hidden) { closePicker(); var fb = $('fighter-' + state.pickerRow); if (fb) fb.focus(); }
  });

  function syncToggles() {
    $('toggle-sound').setAttribute('aria-pressed', String(audio.sound));
    $('toggle-music').setAttribute('aria-pressed', String(audio.music));
  }
  on('toggle-sound', function () { audio.setSound(!audio.sound); syncToggles(); audio.play('select'); });
  on('toggle-music', function () { audio.setMusic(!audio.music); syncToggles(); });
  syncToggles();

  document.addEventListener('pointerdown', function () { audio.unlock(); }, { once: true });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) audio.stopMusic();
    else if (state.screen === 'fight' && state.playing) audio.startMusic();
  });
  window.addEventListener('hashchange', function () { var c = codeFromHash(); if (c) openCode(c); });

  /* ---------- boot ---------- */
  initRows(EXAMPLE.labels);
  var hashCode = codeFromHash();
  if (hashCode) openCode(hashCode);
  else show('title');

  DM2.app = { state: state, arena: arena, play: play, showResult: showResult };
})();
