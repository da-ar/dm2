/* DM2 chip sound: every effect and the battle loop are synthesised with WebAudio. */
(function (root) {
  'use strict';

  var ac = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  var state = { sound: true, music: true };
  try {
    var saved = JSON.parse(localStorage.getItem('dm2-audio') || 'null');
    if (saved) { state.sound = saved.sound !== false; state.music = saved.music !== false; }
  } catch (e) { /* storage unavailable: keep defaults */ }

  function save() { try { localStorage.setItem('dm2-audio', JSON.stringify(state)); } catch (e) { /* ignore */ } }

  function ensure() {
    if (!ac) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.connect(master);
      musicBus = ac.createGain(); musicBus.gain.value = 0.28; musicBus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      applyState();
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }

  function applyState() {
    if (!ac) return;
    sfxBus.gain.value = state.sound ? 1 : 0;
    musicBus.gain.value = state.sound && state.music ? 0.28 : 0;
  }

  function tone(freq, dur, type, vol, slideTo, delay, bus) {
    if (!ac) return;
    var t = ac.currentTime + (delay || 0);
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(bus || sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filter, freq, delay, freqTo) {
    if (!ac) return;
    var t = ac.currentTime + (delay || 0);
    var src = ac.createBufferSource(); src.buffer = noiseBuf;
    var f = ac.createBiquadFilter(); f.type = filter || 'lowpass';
    f.frequency.setValueAtTime(freq || 2000, t);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    var g = ac.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t); src.stop(t + dur + 0.02);
  }

  var N = function (semi) { return 440 * Math.pow(2, (semi - 9) / 12) / 2; }; // semitone above C4-ish

  var SFX = {
    select: function () { tone(880, 0.06, 'square', 0.12); },
    back: function () { tone(440, 0.06, 'square', 0.1); },
    add: function () { tone(660, 0.05, 'square', 0.1); tone(990, 0.07, 'square', 0.1, null, 0.05); },
    step: function () { for (var i = 0; i < 4; i++) noise(0.03, 0.12, 'lowpass', 600, i * 0.15); },
    round: function () { tone(523, 0.12, 'square', 0.18); tone(659, 0.18, 'square', 0.18, null, 0.13); },
    fight: function () { [523, 659, 784, 1046].forEach(function (f) { tone(f, 0.35, 'square', 0.1); }); noise(0.2, 0.2, 'highpass', 3000); },
    whoosh: function () { noise(0.14, 0.15, 'bandpass', 800, 0, 3000); },
    hit: function () { noise(0.09, 0.5, 'lowpass', 1800); tone(200, 0.08, 'square', 0.25, 70); },
    crit: function () { noise(0.2, 0.6, 'lowpass', 2600, 0, 300); tone(160, 0.2, 'sawtooth', 0.3, 40); tone(900, 0.05, 'square', 0.15); },
    miss: function () { noise(0.16, 0.12, 'highpass', 2000, 0, 6000); tone(600, 0.1, 'triangle', 0.1, 300); },
    block: function () { tone(1400, 0.05, 'square', 0.15); tone(2100, 0.08, 'square', 0.12, null, 0.05); },
    beam: function () { tone(1200, 0.22, 'square', 0.13, 240); },
    magic: function () { tone(500, 0.3, 'triangle', 0.18, 1400); tone(750, 0.3, 'sine', 0.1, 2000, 0.05); },
    charge: function () { tone(150, 0.8, 'sawtooth', 0.12, 1200); for (var i = 0; i < 8; i++) tone(400 + i * 120, 0.06, 'square', 0.07, null, i * 0.09); },
    ko: function () { tone(500, 0.8, 'sawtooth', 0.28, 40); noise(0.7, 0.5, 'lowpass', 1200, 0, 100); },
    thud: function () { noise(0.2, 0.5, 'lowpass', 400); tone(90, 0.2, 'sine', 0.4, 40); },
    explode: function () { noise(0.6, 0.45, 'lowpass', 3000, 0, 120); },
    jump: function () { tone(300, 0.12, 'square', 0.13, 800); },
    heal: function () { [523, 659, 784, 1046, 1318].forEach(function (f, i) { tone(f, 0.12, 'triangle', 0.15, null, i * 0.07); }); },
    victory: function () {
      var mel = [[0, 0.12], [0, 0.12], [0, 0.12], [0, 0.36], [-4, 0.36], [-2, 0.36], [0, 0.24], [-2, 0.12], [0, 0.7]];
      var t = 0;
      mel.forEach(function (n) { tone(N(n[0] + 24), n[1] * 0.95, 'square', 0.16, null, t); tone(N(n[0] + 12), n[1] * 0.95, 'triangle', 0.14, null, t); t += n[1]; });
    }
  };

  /* ---------- battle music: a short looping chiptune ---------- */
  var music = { on: false, timer: null, next: 0, step: 0 };
  var BPM = 150, STEP = 60 / BPM / 2;
  var BASS = [0, 0, 12, 0, 0, 0, 10, 12, -2, -2, 10, -2, -4, -4, 8, -2];
  var LEAD = [12, null, 15, null, 19, 17, 15, null, 14, null, 10, null, 12, null, null, null,
              12, null, 15, null, 19, 22, 24, null, 22, 19, 17, null, 15, null, 14, null];
  function schedule() {
    if (!ac) return;
    while (music.next < ac.currentTime + 0.25) {
      var i = music.step;
      var b = BASS[i % 16];
      var t = music.next - ac.currentTime;
      tone(N(b - 12), STEP * 0.9, 'triangle', 0.5, null, t, musicBus);
      var l = LEAD[i % 32];
      if (l !== null && Math.floor(i / 32) % 2 === 1) tone(N(l + 12), STEP * 1.6, 'square', 0.12, null, t, musicBus);
      if (i % 4 === 2) {
        var src = ac.createBufferSource(); src.buffer = noiseBuf;
        var g = ac.createGain(), at = music.next;
        g.gain.setValueAtTime(0.18, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.05);
        var f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5000;
        src.connect(f); f.connect(g); g.connect(musicBus); src.start(at); src.stop(at + 0.06);
      }
      music.next += STEP;
      music.step++;
    }
  }

  var api = {
    unlock: function () { ensure(); },
    play: function (name) {
      if (!state.sound || !SFX[name]) return;
      if (!ensure()) return;
      try { SFX[name](); } catch (e) { /* audio is optional */ }
    },
    startMusic: function () {
      if (!ensure() || music.on) return;
      music.on = true; music.next = ac.currentTime + 0.05; music.step = 0;
      music.timer = setInterval(schedule, 80);
    },
    stopMusic: function () {
      music.on = false;
      if (music.timer) clearInterval(music.timer);
      music.timer = null;
    },
    get sound() { return state.sound; },
    get music() { return state.music; },
    setSound: function (v) { state.sound = !!v; save(); applyState(); },
    setMusic: function (v) { state.music = !!v; save(); applyState(); }
  };

  root.DM2 = root.DM2 || {};
  root.DM2.audio = api;
})(this);
