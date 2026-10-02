/* DM2 arena: draws the stages, fighters and effects on a 320x180 canvas,
   and plays back fights that the engine has already decided.
   Cosmetic randomness (sparks, snow) uses Math.random; outcomes never do. */
(function (root) {
  'use strict';

  var W = 320, H = 180, FLOOR_Y = 128, FEET_Y = 160, LAYER_W = 400;
  var SLOT_X = [100, 220];
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  function rgb(hex) {
    var h = hex.replace('#', '');
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function frandFrom(seed) {
    var r = root.DM2.engine.makeRng(seed);
    return function () { return r.next() / 4294967296; };
  }

  /* ---------- pixel layer helper (ImageData backed) ---------- */
  function Layer(w, h) {
    this.w = w; this.h = h;
    this.c = document.createElement('canvas'); this.c.width = w; this.c.height = h;
    this.ctx = this.c.getContext('2d');
    this.img = this.ctx.createImageData(w, h); this.d = this.img.data;
  }
  Layer.prototype.px = function (x, y, c) {
    x = x | 0; y = y | 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    var i = (y * this.w + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2]; this.d[i + 3] = 255;
  };
  Layer.prototype.dpx = function (x, y, c, level) { // ordered-dither pixel, level 0..16
    if (BAYER[((y | 0) & 3) * 4 + ((x | 0) & 3)] < level) this.px(x, y, c);
  };
  Layer.prototype.rect = function (x, y, w, h, c) {
    for (var j = y; j < y + h; j++) for (var i = x; i < x + w; i++) this.px(i, j, c);
  };
  Layer.prototype.grad = function (y0, y1, stops) {
    var n = stops.length - 1;
    for (var y = y0; y < y1; y++) {
      var t = (y - y0) / (y1 - y0) * n, b = Math.min(n - 1, Math.floor(t)), f = (t - b) * 16;
      for (var x = 0; x < this.w; x++) this.px(x, y, BAYER[(y & 3) * 4 + (x & 3)] < f ? stops[b + 1] : stops[b]);
    }
  };
  Layer.prototype.circle = function (cx, cy, r, c, fn) {
    for (var y = -r; y <= r; y++) for (var x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r + r * 0.8) { if (!fn || fn(x, y)) this.px(cx + x, cy + y, c); }
    }
  };
  Layer.prototype.ridge = function (rand, base, amp, scale, col, cap, capDepth) {
    var p = [rand() * 6.3, rand() * 6.3, rand() * 6.3, rand() * 6.3];
    for (var x = 0; x < this.w; x++) {
      var h = Math.sin(x * 0.011 * scale + p[0]) * 0.45 + Math.sin(x * 0.027 * scale + p[1]) * 0.3 +
        Math.abs(Math.sin(x * 0.061 * scale + p[2])) * 0.25 + Math.sin(x * 0.13 * scale + p[3]) * 0.06;
      var top = Math.round(base - amp * (0.5 + 0.5 * h));
      for (var y = top; y < base; y++) {
        var c = col;
        if (cap && y < top + capDepth) c = cap;
        else if (cap && y < top + capDepth + 3 && BAYER[(y & 3) * 4 + (x & 3)] < 6) c = cap;
        this.px(x, y, c);
      }
    }
  };
  Layer.prototype.done = function () { this.ctx.putImageData(this.img, 0, 0); return this.c; };

  /* Mode-7 style perspective floor. phase scrolls it toward the viewer. */
  function buildFloor(spec, phase) {
    var L = new Layer(LAYER_W, H);
    var a = rgb(spec.a), b = rgb(spec.b || spec.a), fog = rgb(spec.fog), line = spec.line ? rgb(spec.line) : null;
    var cx = LAYER_W / 2, hy = FLOOR_Y - 30;
    for (var y = FLOOR_Y; y < H; y++) {
      var depth = 640 / (y - hy);
      var vf = depth / 2.4 - phase;
      var v = Math.floor(vf);
      var fogLevel = Math.max(0, Math.min(16, Math.round((depth - 9) * 1.6)));
      for (var x = 0; x < LAYER_W; x++) {
        var uf = (x - cx) * depth / 150;
        var u = Math.floor(uf);
        var c;
        if (spec.mode === 'grid') {
          var nearU = Math.abs(uf - Math.round(uf)) < depth / 300;
          var nearV = Math.abs(vf - Math.round(vf)) < 0.12;
          c = (nearU || nearV) ? line : a;
        } else if (spec.mode === 'plates') {
          c = ((u + v) & 1) ? a : b;
          if (Math.abs(uf - Math.round(uf)) < depth / 400 || Math.abs(vf - Math.round(vf)) < 0.06) c = line;
        } else {
          c = ((u + v) & 1) ? a : b;
        }
        if (BAYER[(y & 3) * 4 + (x & 3)] < fogLevel) c = fog;
        L.px(x, y, c);
      }
    }
    if (spec.edge) for (var ex = 0; ex < LAYER_W; ex++) L.px(ex, FLOOR_Y, rgb(spec.edge));
    return L;
  }

  /* ---------- stages ---------- */
  var STAGES = [
    {
      name: 'Frozen Thrown Peak', ambient: 'snow',
      build: function () {
        var R = frandFrom(101);
        var sky = new Layer(LAYER_W, H);
        sky.grad(0, FLOOR_Y, ['#070a24', '#121a4a', '#26307a', '#4a48a8', '#8a78d0'].map(rgb));
        for (var i = 0; i < 90; i++) sky.px(R() * LAYER_W, R() * 80, rgb(R() < 0.3 ? '#a8c8ff' : '#ffffff'));
        for (var x = 0; x < LAYER_W; x++) { // aurora
          var cy = 38 + Math.sin(x * 0.03) * 9 + Math.sin(x * 0.011 + 1) * 8;
          for (var y = cy - 14; y < cy + 6; y++) {
            var k = 1 - Math.abs(y - cy) / 14;
            sky.dpx(x, y, rgb(y < cy - 5 ? '#40e0ff' : '#50ffa0'), Math.round(k * 9));
          }
        }
        sky.circle(300, 26, 11, rgb('#e8f0ff'));
        sky.circle(296, 23, 3, rgb('#b8c8e8')); sky.circle(304, 30, 2, rgb('#b8c8e8'));
        var far = new Layer(LAYER_W, H);
        far.ridge(R, FLOOR_Y, 62, 1, rgb('#2c3a80'), rgb('#c8d8ff'), 4);
        var mid = new Layer(LAYER_W, H);
        mid.ridge(R, FLOOR_Y, 26, 1.6, rgb('#1c2660'), rgb('#8aa0e8'), 2);
        [[40, 14, 54], [70, 10, 38], [300, 16, 62], [334, 10, 40], [362, 12, 48]].forEach(function (t) {
          var x0 = t[0], w = t[1], h = t[2], top = FLOOR_Y - h;
          mid.rect(x0, top, w, h, rgb('#3a4c9a'));
          mid.rect(x0 + w - 3, top, 3, h, rgb('#28367a'));
          for (var s = 0; s < w; s++) { // spire roof
            var rh = Math.round((w / 2 - Math.abs(s - w / 2 + 0.5)) * 2.2);
            for (var q = 0; q < rh; q++) mid.px(x0 + s, top - q, rgb(s < w / 2 ? '#7a90e0' : '#5a70c8'));
          }
          for (var wy = top + 6; wy < FLOOR_Y - 6; wy += 9) mid.rect(x0 + Math.floor(w / 2) - 1, wy, 2, 3, rgb('#7af0ff'));
        });
        return { sky: sky.done(), far: far.done(), mid: mid.done(),
          floors: [buildFloor({ a: '#d8e4ff', b: '#aabfee', fog: '#7a78c0', edge: '#ffffff' }, 0).done()] };
      }
    },
    {
      name: 'Magma Maw', ambient: 'embers',
      build: function () {
        var R = frandFrom(202);
        var sky = new Layer(LAYER_W, H);
        sky.grad(0, FLOOR_Y, ['#140306', '#320810', '#5a0e14', '#8e1c14', '#d04a18', '#ff9a30'].map(rgb));
        for (var i = 0; i < 30; i++) sky.px(R() * LAYER_W, R() * 50, rgb('#ff8a60'));
        var far = new Layer(LAYER_W, H);
        far.ridge(R, FLOOR_Y, 30, 1.2, rgb('#4a1014'));
        var vx = 230, top = 34, craterW = 14;
        for (var y = top; y < FLOOR_Y; y++) {
          var half = craterW + (y - top) * 1.25;
          for (var x = Math.round(vx - half); x < vx + half; x++) far.px(x, y, rgb(x < vx - half * 0.2 ? '#341014' : '#24080c'));
        }
        for (var g = 0; g < 26; g++) for (var gx = -craterW - 10; gx < craterW + 10; gx++) {
          far.dpx(vx + gx, top - g, rgb(g < 8 ? '#ff7a20' : '#5a2a2a'), Math.max(0, 12 - g / 2 - Math.abs(gx) / 3));
        }
        for (var s = 0; s < 4; s++) { // lava streams
          var lx = vx - 8 + s * 5, ly = top;
          while (ly < FLOOR_Y) { far.px(lx, ly, rgb('#ffd040')); far.px(lx + 1, ly, rgb('#ff6a20')); ly++; if (R() < 0.35) lx += (s < 2 ? -1 : 1); }
        }
        var mid = new Layer(LAYER_W, H);
        for (var mx = 0; mx < LAYER_W; mx++) {
          var hgt = 10 + Math.abs(Math.sin(mx * 0.09) * 14) + Math.abs(Math.sin(mx * 0.023 + 2) * 18) + (mx % 7 === 0 ? 4 : 0);
          for (var my = FLOOR_Y - hgt; my < FLOOR_Y; my++) mid.px(mx, my, rgb(my < FLOOR_Y - hgt + 1 ? '#ff7030' : '#1a0808'));
        }
        var floors = [];
        for (var p = 0; p < 4; p++) {
          var F = buildFloor({ a: '#3a1a16', b: '#2a1210', fog: '#8a2a14', edge: '#ff7030' }, 0);
          var CR = frandFrom(303);
          for (var c = 0; c < 9; c++) { // glowing cracks, brightness pulses per frame
            var cx = CR() * LAYER_W, cy = FLOOR_Y + 6 + CR() * 44, len = 10 + CR() * 30;
            for (var t = 0; t < len; t++) { F.px(cx, cy, rgb(p % 2 ? '#ffd040' : '#ff6a20')); cx += CR() < 0.5 ? 1 : 2; if (CR() < 0.4) cy += CR() < 0.5 ? -1 : 1; }
          }
          floors.push(F.done());
        }
        return { sky: sky.done(), far: far.done(), mid: mid.done(), floors: floors, floorFps: 3 };
      }
    },
    {
      name: 'Snake Mountin Keep', ambient: 'fireflies', ambientColor: '#c8ff60',
      build: function () {
        var R = frandFrom(404);
        var sky = new Layer(LAYER_W, H);
        sky.grad(0, FLOOR_Y, ['#060c14', '#0e2230', '#16383a', '#2a5a40', '#6a8a48', '#c8b860'].map(rgb));
        for (var i = 0; i < 50; i++) sky.px(R() * LAYER_W, R() * 60, rgb('#d8ffd0'));
        sky.circle(70, 32, 15, rgb('#c8ffb0'));
        sky.circle(65, 28, 3, rgb('#a0e090')); sky.circle(76, 37, 4, rgb('#a0e090'));
        var far = new Layer(LAYER_W, H);
        far.ridge(R, FLOOR_Y, 44, 1, rgb('#142a2a'), rgb('#2a4a3a'), 2);
        var mid = new Layer(LAYER_W, H);
        var sx = 230, sy = 82, bone = rgb('#7a6a9a'), dark = rgb('#4a3c6a'), black = rgb('#0a0610');
        [[sx - 66, 30, 60], [sx + 46, 30, 56]].forEach(function (t) { // towers
          mid.rect(t[0], FLOOR_Y - t[2], t[1] - 10, t[2], dark);
          for (var c = 0; c < t[1] - 10; c += 4) mid.rect(t[0] + c, FLOOR_Y - t[2] - 3, 2, 3, dark);
          mid.rect(t[0] + 8, FLOOR_Y - t[2] + 10, 3, 5, rgb('#60ff60'));
        });
        mid.circle(sx, sy, 32, bone, function (x, y) { return y < 14; });
        mid.rect(sx - 22, sy + 12, 44, FLOOR_Y - sy - 12, bone);
        mid.rect(sx + 10, sy - 26, 20, 56, rgb('#5c4e7c')); // shading
        mid.circle(sx - 12, sy - 2, 8, black); mid.circle(sx + 12, sy - 2, 8, black);
        mid.circle(sx - 12, sy - 1, 2, rgb('#60ff60')); mid.circle(sx + 12, sy - 1, 2, rgb('#60ff60'));
        for (var n = 0; n < 6; n++) for (var nx = -n; nx <= n; nx++) mid.px(sx + nx, sy + 8 + n, black);
        for (var tx = -18; tx < 18; tx += 6) mid.rect(sx + tx, sy + 18, 4, 7, rgb('#d8d0e8'));
        mid.rect(sx - 8, FLOOR_Y - 18, 16, 18, black); // the gate
        return { sky: sky.done(), far: far.done(), mid: mid.done(),
          floors: [buildFloor({ a: '#5a5a70', b: '#46465a', fog: '#2a4a40', edge: '#8a8aa8' }, 0).done()] };
      }
    },
    {
      name: 'Neon Grid 1987', ambient: 'none',
      build: function () {
        var R = frandFrom(505);
        var sky = new Layer(LAYER_W, H);
        sky.grad(0, FLOOR_Y, ['#07021a', '#14063a', '#2e0a5a', '#5a1278', '#a0207a', '#ff4a7a'].map(rgb));
        for (var i = 0; i < 40; i++) sky.px(R() * LAYER_W, R() * 50, rgb('#ffffff'));
        var scx = 200, scy = 96, r = 40;
        var sunCols = ['#ffe040', '#ffb030', '#ff7a40', '#ff4a7a', '#ff2aa0'].map(rgb);
        sky.circle(scx, scy, r, sunCols[0], function (x, y) {
          var t = (y + r) / (2 * r) * (sunCols.length - 1), b = Math.min(sunCols.length - 2, Math.floor(t));
          var gap = y > 0 && ((y + 2) % 7) < 1 + y / 12;
          if (gap) return false;
          sky.px(scx + x, scy + y, BAYER[((scy + y) & 3) * 4 + ((scx + x) & 3)] < (t - b) * 16 ? sunCols[b + 1] : sunCols[b]);
          return false;
        });
        var far = new Layer(LAYER_W, H);
        var wins = ['#ffe060', '#60e0ff', '#ff60c0'].map(rgb);
        for (var bx = 0; bx < LAYER_W;) {
          var bw = 10 + Math.floor(R() * 20), bh = 18 + Math.floor(R() * 46);
          far.rect(bx, FLOOR_Y - bh, bw, bh, rgb('#160a34'));
          far.rect(bx, FLOOR_Y - bh, 1, bh, rgb('#3a1a6a'));
          for (var wy = FLOOR_Y - bh + 3; wy < FLOOR_Y - 2; wy += 4) for (var wx = bx + 2; wx < bx + bw - 2; wx += 3) if (R() < 0.3) far.px(wx, wy, wins[Math.floor(R() * 3)]);
          bx += bw + Math.floor(R() * 3);
        }
        var mid = new Layer(LAYER_W, H);
        [[30, 'DM2'], [330, 'K.O.']].forEach(function (s) { // neon sign posts
          mid.rect(s[0] + 10, FLOOR_Y - 34, 2, 34, rgb('#2a1048'));
          mid.rect(s[0], FLOOR_Y - 48, 24, 14, rgb('#1a0630'));
          for (var e = 0; e < 24; e++) { mid.px(s[0] + e, FLOOR_Y - 48, rgb('#ff2ad8')); mid.px(s[0] + e, FLOOR_Y - 35, rgb('#ff2ad8')); }
          for (var e2 = 0; e2 < 14; e2++) { mid.px(s[0], FLOOR_Y - 48 + e2, rgb('#ff2ad8')); mid.px(s[0] + 23, FLOOR_Y - 48 + e2, rgb('#ff2ad8')); }
          mid.rect(s[0] + 4, FLOOR_Y - 44, 16, 2, rgb('#60e0ff')); mid.rect(s[0] + 4, FLOOR_Y - 40, 10, 2, rgb('#60e0ff'));
        });
        var floors = [];
        for (var p = 0; p < 8; p++) floors.push(buildFloor({ mode: 'grid', a: '#0a0218', line: '#ff2ad8', fog: '#5a1278', edge: '#ff8af0' }, p / 8).done());
        return { sky: sky.done(), far: far.done(), mid: mid.done(), floors: floors, floorFps: 10 };
      }
    },
    {
      name: 'Jungle Ruins of Doom', ambient: 'fireflies', ambientColor: '#ffe080',
      build: function () {
        var R = frandFrom(606);
        var sky = new Layer(LAYER_W, H);
        sky.grad(0, FLOOR_Y, ['#1e1450', '#4a2470', '#943a78', '#e8607a', '#ffa060', '#ffe08a'].map(rgb));
        sky.circle(110, 100, 22, rgb('#fff0b0'));
        var far = new Layer(LAYER_W, H);
        far.ridge(R, FLOOR_Y, 34, 0.7, rgb('#4a2a6a'));
        var mid = new Layer(LAYER_W, H);
        var px = 250;
        for (var tier = 0; tier < 6; tier++) {
          var half = 60 - tier * 9, y0 = FLOOR_Y - (tier + 1) * 10;
          mid.rect(px - half, y0, half * 2, 10, rgb('#8a6a4a'));
          mid.rect(px - half, y0, half * 2, 1, rgb('#c8a878'));
          mid.rect(px + half - 10, y0 + 1, 10, 9, rgb('#5a4030'));
        }
        mid.rect(px - 7, FLOOR_Y - 60, 14, 60, rgb('#a88a5a'));
        for (var st = FLOOR_Y - 60; st < FLOOR_Y; st += 3) mid.rect(px - 7, st, 14, 1, rgb('#6a5038'));
        mid.rect(px - 12, FLOOR_Y - 74, 24, 14, rgb('#7a5c3c'));
        mid.rect(px - 4, FLOOR_Y - 70, 8, 10, rgb('#1a0c08'));
        [[50, 70], [96, 54], [370, 64]].forEach(function (t) { // palm trees
          var x = t[0], h = t[1], leaf = rgb('#1e4a28'), trunk = rgb('#3a2a1a');
          for (var y = 0; y < h; y++) { var bend = Math.round(Math.sin(y / h * 1.4) * 6); mid.rect(x + bend, FLOOR_Y - y, 3, 1, trunk); }
          var topX = x + Math.round(Math.sin(1.4) * 6) + 1, topY = FLOOR_Y - h;
          [[-1, 0.3], [1, 0.3], [-1, -0.2], [1, -0.2], [-0.4, -0.7], [0.5, -0.6]].forEach(function (d) {
            for (var l = 0; l < 20; l++) {
              var lx = topX + d[0] * l, ly = topY + d[1] * l * 0.8 + (l * l) / 40;
              mid.rect(Math.round(lx), Math.round(ly), 2, 2, leaf);
            }
          });
        });
        return { sky: sky.done(), far: far.done(), mid: mid.done(),
          floors: [buildFloor({ a: '#4aa83a', b: '#3a8a2e', fog: '#b0606a', edge: '#8ad070' }, 0).done()] };
      }
    },
    {
      name: 'Orbital Station Omega', ambient: 'twinkle',
      build: function () {
        var R = frandFrom(707);
        var sky = new Layer(LAYER_W, H);
        sky.grad(0, FLOOR_Y, ['#02020a', '#060a1e', '#0e1430', '#141a40'].map(rgb));
        for (var n = 0; n < 2; n++) { // nebulae
          var nx = 120 + n * 160, ny = 40 + n * 20, col = rgb(n ? '#2a4a9a' : '#6a2a8a');
          for (var y = -30; y < 30; y++) for (var x = -60; x < 60; x++) {
            var d = Math.sqrt((x * x) / 3600 + (y * y) / 900);
            sky.dpx(nx + x, ny + y, col, Math.round((1 - d) * 7 + Math.sin(x * 0.2 + y * 0.3) * 2));
          }
        }
        for (var i = 0; i < 150; i++) sky.px(R() * LAYER_W, R() * FLOOR_Y, rgb(R() < 0.2 ? '#ffe0a0' : '#ffffff'));
        var pcx = 80, pcy = 52, pr = 26;
        sky.circle(pcx, pcy, pr, rgb('#c87a4a'), function (x, y) {
          var band = Math.floor((y + pr + Math.sin(x * 0.2) * 1.5) / 5) % 2;
          sky.px(pcx + x, pcy + y, rgb(x + y > 14 ? (band ? '#7a4028' : '#8a4a30') : (band ? '#c87a4a' : '#e8a060')));
          return false;
        });
        for (var a = 0; a < 360; a += 0.5) {
          var rx = Math.cos(a * Math.PI / 180) * 44, ry = Math.sin(a * Math.PI / 180) * 8;
          if (ry < 0 && rx * rx / 676 + (ry - 0) * (ry) / 676 < 1 && Math.abs(rx) < pr) continue;
          sky.px(pcx + rx, pcy + ry + (rx * 0.15), rgb('#e8c890'));
        }
        var far = new Layer(LAYER_W, H);
        var mid = new Layer(LAYER_W, H);
        for (var px = 20; px < LAYER_W; px += 96) {
          mid.rect(px, 20, 12, FLOOR_Y - 20, rgb('#3a4258'));
          mid.rect(px + 9, 20, 3, FLOOR_Y - 20, rgb('#262c3c'));
          mid.rect(px + 4, 24, 4, 3, rgb('#ff4040'));
          mid.rect(px - 6, 18, 24, 4, rgb('#4a5268'));
        }
        mid.rect(0, 14, LAYER_W, 6, rgb('#4a5268')); mid.rect(0, 20, LAYER_W, 1, rgb('#262c3c'));
        mid.rect(0, FLOOR_Y - 10, LAYER_W, 3, rgb('#5a6278')); mid.rect(0, FLOOR_Y - 7, LAYER_W, 1, rgb('#262c3c'));
        for (var r2 = 0; r2 < LAYER_W; r2 += 16) mid.rect(r2, FLOOR_Y - 7, 2, 7, rgb('#3a4258'));
        var F = buildFloor({ mode: 'plates', a: '#5a6070', b: '#4e5464', line: '#30343e', fog: '#141a40' }, 0);
        for (var hx = 0; hx < LAYER_W; hx++) for (var hy = 0; hy < 3; hy++) F.px(hx, FLOOR_Y + hy, rgb(((hx + hy) >> 2) % 2 ? '#ffd040' : '#1a1a20'));
        return { sky: sky.done(), far: far.done(), mid: mid.done(), floors: [F.done()] };
      }
    }
  ];

  /* ---------- 3x5 pixel font for in-arena numbers and callouts ---------- */
  var FONT = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
    F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
    K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
    P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
    Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
    '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010', '8': '111101111101111',
    '9': '111101111001110', '!': '010010010000010', '-': '000000111000000', '+': '000010111010000', '.': '000000000000010',
    '?': '110001010000010', ' ': '000000000000000'
  };
  function drawText(ctx, text, x, y, color, scale, outline) {
    scale = scale || 1;
    text = String(text).toUpperCase();
    var w = text.length * 4 * scale - scale;
    var x0 = Math.round(x - w / 2), y0 = Math.round(y);
    var passes = outline ? [[outline, -1, 0], [outline, 1, 0], [outline, 0, -1], [outline, 0, 1], [outline, 1, 1], [color, 0, 0]] : [[color, 0, 0]];
    passes.forEach(function (p) {
      ctx.fillStyle = p[0];
      for (var i = 0; i < text.length; i++) {
        var g = FONT[text[i]] || FONT['?'];
        for (var b = 0; b < 15; b++) if (g[b] === '1') ctx.fillRect(x0 + (i * 4 + (b % 3)) * scale + p[1] * scale, y0 + Math.floor(b / 3) * scale + p[2] * scale, scale, scale);
      }
    });
  }

  /* ---------- sprite cache ---------- */
  var spriteCache = {};
  function spriteCanvas(id, tint) {
    var key = id + '|' + (tint || '');
    if (spriteCache[key]) return spriteCache[key];
    var c = document.createElement('canvas'); c.width = 24; c.height = 32;
    var x = c.getContext('2d');
    root.DM2.sprites.pixels(id).forEach(function (p) { x.fillStyle = tint || p.c; x.fillRect(p.x, p.y, 1, 1); });
    spriteCache[key] = c;
    return c;
  }

  /* Draw a fighter portrait into any canvas (used by the menus). */
  function drawPortrait(canvas, id, opts) {
    opts = opts || {};
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var img = spriteCanvas(id);
    if (opts.head) {
      var s = Math.floor(Math.min(canvas.width / 20, canvas.height / 16));
      ctx.drawImage(img, 2, 0, 20, 16, (canvas.width - 20 * s) / 2, (canvas.height - 16 * s) / 2, 20 * s, 16 * s);
    } else {
      var sc = Math.floor(Math.min(canvas.width / 24, canvas.height / 32));
      ctx.save();
      if (opts.flip) { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
      ctx.drawImage(img, Math.floor((canvas.width - 24 * sc) / 2), canvas.height - 32 * sc, 24 * sc, 32 * sc);
      ctx.restore();
    }
  }

  function ease(t, kind) {
    if (kind === 'in') return t * t;
    if (kind === 'out') return 1 - (1 - t) * (1 - t);
    if (kind === 'linear') return t;
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function Aborted() { this.aborted = true; }

  /* ---------- the arena ---------- */
  function Arena(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;
    this.time = 0;
    this.speed = 1;
    this.timeScale = 1;
    this.stages = [];
    this.stageIndex = 0;
    this.fighters = [null, null];
    this.particles = [];
    this.ambient = [];
    this.texts = [];
    this.projectiles = [];
    this.tweens = [];
    this.waits = [];
    this.flash = null;
    this.shake = 0;
    this.camX = 0;
    this.fade = 0; // 0 = clear, 16 = black
    this.parade = null;
    this.prize = null;
    this.hooks = {};
    this.token = 0;
    this.running = false;
    this.paused = false;
    this.reducedMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._last = 0;
    this._frame = this._frame.bind(this);
    this.setStage(0);
  }

  Arena.STAGES = STAGES;
  Arena.drawPortrait = drawPortrait;

  Arena.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    this._last = performance.now();
    requestAnimationFrame(this._frame);
  };
  Arena.prototype.stop = function () { this.running = false; };

  Arena.prototype.stage = function (i) {
    if (!this.stages[i]) this.stages[i] = STAGES[i].build();
    return this.stages[i];
  };
  Arena.prototype.setStage = function (i) {
    this.stageIndex = i;
    this.stage(i);
    this.ambient = [];
    var kind = STAGES[i].ambient, n = kind === 'snow' ? 70 : kind === 'embers' ? 40 : kind === 'fireflies' ? 18 : kind === 'twinkle' ? 24 : 0;
    for (var k = 0; k < n; k++) this.ambient.push(this._spawnAmbient(kind, true));
  };
  Arena.prototype._spawnAmbient = function (kind, anywhere) {
    var p = { kind: kind, x: Math.random() * W, y: anywhere ? Math.random() * H : (kind === 'embers' ? H + 2 : -2), t: Math.random() * 10 };
    if (kind === 'snow') { p.vy = 10 + Math.random() * 18; p.c = Math.random() < 0.3 ? '#c8e0ff' : '#ffffff'; }
    if (kind === 'embers') { p.vy = -(12 + Math.random() * 30); p.c = ['#ffd040', '#ff8020', '#ff4010'][Math.floor(Math.random() * 3)]; }
    if (kind === 'fireflies') { p.y = 60 + Math.random() * 100; p.vx = (Math.random() - 0.5) * 10; p.vy = (Math.random() - 0.5) * 6; }
    if (kind === 'twinkle') { p.y = Math.random() * 110; }
    return p;
  };

  /* ---------- clock: everything waits on game time, so speed and tab switches just work ---------- */
  Arena.prototype.wait = function (ms) {
    var self = this, token = this.token;
    return new Promise(function (resolve, reject) {
      self.waits.push({ at: self.time + ms, resolve: resolve, reject: reject, token: token });
    });
  };
  Arena.prototype.tween = function (obj, props, ms, kind) {
    var self = this, token = this.token;
    return new Promise(function (resolve, reject) {
      var from = {};
      for (var k in props) from[k] = obj[k];
      self.tweens.push({ obj: obj, from: from, to: props, start: self.time, dur: Math.max(1, ms), kind: kind, resolve: resolve, reject: reject, token: token });
    });
  };
  Arena.prototype.abort = function () {
    this.token++;
    var err = new Aborted();
    this.waits.forEach(function (w) { w.reject(err); });
    this.tweens.forEach(function (t) { t.reject(err); });
    this.waits = []; this.tweens = [];
    this.timeScale = 1;
  };
  Arena.prototype.reset = function () {
    this.abort();
    this.fighters = [null, null];
    this.particles = []; this.texts = []; this.projectiles = [];
    this.flash = null; this.shake = 0; this.fade = 0; this.parade = null; this.prize = null;
  };

  Arena.prototype._frame = function (now) {
    if (!this.running) return;
    var realDt = Math.max(0, Math.min(50, now - this._last)); // rAF stamps can predate start()
    this._last = now;
    try {
      this._tick(realDt);
    } finally {
      requestAnimationFrame(this._frame); // one bad frame must never stop the game
    }
  };

  Arena.prototype._tick = function (realDt) {
    if (!this.paused) {
      var dt = realDt * this.speed * this.timeScale;
      this.time += dt;
      this._update(dt / 1000, realDt / 1000);
    }
    this._draw();
  };

  Arena.prototype._update = function (dt, realDt) {
    var t = this.time, self = this;
    this.tweens = this.tweens.filter(function (tw) {
      var p = Math.min(1, (t - tw.start) / tw.dur), e = ease(p, tw.kind);
      for (var k in tw.to) tw.obj[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e;
      if (p >= 1) { tw.resolve(); return false; }
      return true;
    });
    this.waits = this.waits.filter(function (w) { if (t >= w.at) { w.resolve(); return false; } return true; });

    this.particles = this.particles.filter(function (p) {
      p.life -= dt; p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.floor && p.y > FEET_Y + 2) { p.y = FEET_Y + 2; p.vy *= -0.3; p.vx *= 0.6; }
      return p.life > 0;
    });
    this.texts = this.texts.filter(function (x) { x.life -= dt; x.y += x.vy * dt; x.vy *= 0.92; return x.life > 0; });
    this.projectiles.forEach(function (pr) {
      if (pr.wave) pr.y = pr.wave.y0 + Math.sin((pr.x - pr.wave.x0) / (pr.wave.tx - pr.wave.x0 || 1) * Math.PI * 2) * 10;
      if (Math.random() < 0.9) self.particles.push({ x: pr.x + (Math.random() - 0.5) * pr.size, y: pr.y + (Math.random() - 0.5) * pr.size, vx: -pr.dir * 20 * Math.random(), vy: (Math.random() - 0.5) * 30, life: 0.25, max: 0.25, c: Math.random() < 0.5 ? pr.color : '#ffffff', s: 1 + (Math.random() < 0.3 ? 1 : 0) });
    });
    if (this.flash) { this.flash.a -= realDt * 3; if (this.flash.a <= 0) this.flash = null; }
    this.shake = Math.max(0, this.shake - realDt * 30);

    var a = this.ambient;
    for (var i = 0; i < a.length; i++) {
      var p = a[i]; p.t += realDt;
      if (p.kind === 'snow') { p.y += p.vy * realDt; p.x += Math.sin(p.t * 1.5) * 8 * realDt; if (p.y > H) a[i] = this._spawnAmbient('snow'); }
      if (p.kind === 'embers') { p.y += p.vy * realDt; p.x += Math.sin(p.t * 3) * 10 * realDt; if (p.y < -2) a[i] = this._spawnAmbient('embers'); }
      if (p.kind === 'fireflies') { p.x += p.vx * realDt; p.y += p.vy * realDt + Math.sin(p.t * 2) * 4 * realDt; if (p.x < -4 || p.x > W + 4) p.x = (p.x + W) % W; }
    }
    if (this.parade) {
      this.parade.offset += realDt * 28;
    }

    // camera eases toward the middle of the action
    var f0 = this.fighters[0], f1 = this.fighters[1];
    var target = (f0 && f1) ? ((f0.x + f1.x) / 2 - 160) * 0.5 : 0;
    target = Math.max(-36, Math.min(36, target));
    this.camX += (target - this.camX) * Math.min(1, realDt * 4);
  };

  Arena.prototype._draw = function () {
    var ctx = this.ctx, st = this.stage(this.stageIndex), meta = STAGES[this.stageIndex];
    var shake = this.reducedMotion ? 0 : this.shake;
    var sx = shake ? Math.round((Math.random() - 0.5) * shake) : 0, sy = shake ? Math.round((Math.random() - 0.5) * shake) : 0;
    var cam = this.camX;
    ctx.save();
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    ctx.translate(sx, sy);
    var base = -(LAYER_W - W) / 2;
    ctx.drawImage(st.sky, Math.round(base - cam * 0.1), 0);
    if (meta.ambient === 'twinkle') this._drawTwinkle(ctx);
    ctx.drawImage(st.far, Math.round(base - cam * 0.3), 0);
    ctx.drawImage(st.mid, Math.round(base - cam * 0.6), 0);
    var fi = st.floors.length > 1 ? Math.abs(Math.floor(this.time / 1000 * (st.floorFps || 4))) % st.floors.length : 0;
    ctx.drawImage(st.floors[fi], Math.round(base - cam), 0);

    var self = this;
    this.ambient.forEach(function (p) {
      if (p.kind === 'snow' || p.kind === 'embers') { ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
      if (p.kind === 'fireflies' && Math.sin(p.t * 3) > -0.2) { ctx.fillStyle = meta.ambientColor || '#ffe080'; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
    });

    if (this.parade) this._drawParade(ctx);

    // shadows, then fighters (the attacker is drawn on top)
    var order = [0, 1];
    if (this.fighters[0] && this.fighters[0].front) order = [1, 0];
    order.forEach(function (i) { var f = self.fighters[i]; if (f && f.visible) self._drawShadow(ctx, f.x - cam, f.y); });
    order.forEach(function (i) { var f = self.fighters[i]; if (f && f.visible) self._drawFighter(ctx, f, cam); });

    if (this.prize) this._drawPrize(ctx, cam);
    this.projectiles.forEach(function (pr) { self._drawProjectile(ctx, pr, cam); });
    this.particles.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / (p.max || 1) * 1.5));
      ctx.fillStyle = p.c;
      var s = p.s || 1;
      ctx.fillRect(Math.round(p.x - (p.world ? cam : 0)), Math.round(p.y), s, s);
    });
    ctx.globalAlpha = 1;
    this.texts.forEach(function (x) {
      if (x.life < 0.25 && Math.floor(x.life * 20) % 2) return;
      drawText(ctx, x.text, x.x - cam, x.y, x.color, x.scale || 2, '#140c1c');
    });
    ctx.restore();

    if (this.flash) {
      ctx.globalAlpha = Math.max(0, this.flash.a);
      ctx.fillStyle = this.flash.c; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (this.fade > 0) this._drawFade(ctx, Math.round(this.fade));
  };

  Arena.prototype._drawTwinkle = function (ctx) {
    var t = this.time;
    this.ambient.forEach(function (p) {
      var on = Math.sin(t / 300 + p.t * 7) > 0.6;
      if (on) { ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(p.x) - 1, Math.round(p.y), 3, 1); ctx.fillRect(Math.round(p.x), Math.round(p.y) - 1, 1, 3); }
    });
  };

  Arena.prototype._drawFade = function (ctx, level) {
    if (!this._fadePatterns) {
      this._fadePatterns = [];
      for (var l = 0; l <= 16; l++) {
        var c = document.createElement('canvas'); c.width = 4; c.height = 4;
        var x = c.getContext('2d'); x.fillStyle = '#05030a';
        for (var i = 0; i < 16; i++) if (BAYER[i] < l) x.fillRect(i % 4, Math.floor(i / 4), 1, 1);
        this._fadePatterns.push(ctx.createPattern(c, 'repeat'));
      }
    }
    ctx.fillStyle = this._fadePatterns[Math.max(0, Math.min(16, level))];
    ctx.fillRect(0, 0, W, H);
  };

  Arena.prototype._drawShadow = function (ctx, x, y) {
    var lift = Math.min(1, Math.max(0, -y / 40));
    var w = Math.round(30 * (1 - lift * 0.5)), h = 4;
    ctx.fillStyle = 'rgba(10,4,20,0.45)';
    for (var r = 0; r < h; r++) {
      var rw = Math.round(w * Math.sqrt(1 - Math.pow((r - h / 2 + 0.5) / (h / 2), 2)));
      ctx.fillRect(Math.round(x - rw / 2), FEET_Y - 1 + r, rw, 1);
    }
  };

  Arena.prototype._drawFighter = function (ctx, f, cam) {
    var bob = (f.idle && !this.reducedMotion) ? (Math.floor((this.time + f.phase) / 380) % 2) * 2 : 0;
    var x = Math.round(f.x - cam), y = Math.round(FEET_Y + f.y + bob);
    ctx.save();
    ctx.translate(x, y);
    if (f.rot) ctx.rotate(f.rot);
    if (f.facing < 0) ctx.scale(-1, 1);
    ctx.globalAlpha = f.alpha;
    if (f.aura) {
      var tint = spriteCanvas(f.id, f.aura), o = Math.floor(this.time / 60) % 2 ? 2 : 3;
      ctx.globalAlpha = f.alpha * 0.85;
      [[-o, 0], [o, 0], [0, -o], [0, o]].forEach(function (d) { ctx.drawImage(tint, -24 + d[0], -64 + d[1], 48, 64); });
      ctx.globalAlpha = f.alpha;
    }
    ctx.drawImage(f.flash ? spriteCanvas(f.id, '#ffffff') : spriteCanvas(f.id), -24, -64, 48, 64);
    ctx.restore();
    if (f.crown) this._drawCrown(ctx, x, y - 70 + Math.round(Math.sin(this.time / 200) * 2));
  };

  Arena.prototype._drawCrown = function (ctx, x, y) {
    var rows = ['y.y.y', 'yyyyy', 'yryby', 'yyyyy'];
    rows.forEach(function (r, j) {
      for (var i = 0; i < r.length; i++) {
        var c = r[i]; if (c === '.') continue;
        ctx.fillStyle = c === 'y' ? '#ffd840' : c === 'r' ? '#e83838' : '#3a78f0';
        ctx.fillRect(x - 5 + i * 2, y + j * 2, 2, 2);
      }
    });
  };

  Arena.prototype._drawProjectile = function (ctx, pr, cam) {
    var x = Math.round(pr.x - cam), y = Math.round(pr.y), r = pr.size / 2;
    var pulse = Math.floor(this.time / 50) % 2;
    ctx.fillStyle = pr.color;
    for (var j = -r; j <= r; j++) {
      var w = Math.round(Math.sqrt(r * r - j * j)) + (pr.kind === 'beam' ? Math.round(r * 0.8) : 0);
      ctx.fillRect(x - w, y + j, w * 2 + 1, 1);
    }
    ctx.fillStyle = '#ffffff';
    var cr = Math.max(1, Math.round(r / 2) - pulse);
    ctx.fillRect(x - cr, y - cr, cr * 2 + 1, cr * 2 + 1);
  };

  Arena.prototype._drawParade = function (ctx) {
    var ids = this.parade.ids, spacing = 46, total = ids.length * spacing;
    for (var i = 0; i < ids.length; i++) {
      var x = ((i * spacing + this.parade.offset) % total) - 30;
      if (x < -30 || x > W + 30) continue;
      var hop = Math.floor((this.time + i * 170) / 220) % 2 ? 0 : -2;
      this._drawShadow(ctx, x, 0);
      ctx.drawImage(spriteCanvas(ids[i]), Math.round(x - 24), FEET_Y - 64 + hop, 48, 64);
    }
  };

  /* ---------- effects ---------- */
  Arena.prototype.burst = function (x, y, color, n, power) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, v = (0.3 + Math.random()) * (power || 90);
      this.particles.push({ world: true, x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, g: 160, life: 0.3 + Math.random() * 0.4, max: 0.7, c: Math.random() < 0.35 ? '#ffffff' : color, s: Math.random() < 0.3 ? 2 : 1 });
    }
  };
  Arena.prototype.ring = function (x, y, color) {
    for (var i = 0; i < 24; i++) {
      var a = i / 24 * Math.PI * 2;
      this.particles.push({ world: true, x: x + Math.cos(a) * 6, y: y + Math.sin(a) * 10, vx: Math.cos(a) * 60, vy: Math.sin(a) * 80, life: 0.25, max: 0.25, c: color, s: 1 });
    }
  };
  Arena.prototype.say = function (text, x, y, color, scale) {
    this.texts.push({ text: text, x: x, y: y, vy: -40, life: 0.9, color: color, scale: scale || 2 });
  };
  Arena.prototype.flashScreen = function (color, a) { if (!this.reducedMotion) this.flash = { c: color, a: a || 0.6 }; };
  Arena.prototype.quake = function (n) { this.shake = Math.max(this.shake, n); };
  Arena.prototype.confetti = function (n) {
    var cols = ['#ff4a7a', '#ffd840', '#4ad8ff', '#7aff6a', '#c060ff', '#ff9a2a'];
    for (var i = 0; i < n; i++) this.particles.push({ x: Math.random() * W, y: -10 - Math.random() * 80, vx: (Math.random() - 0.5) * 30, vy: 30 + Math.random() * 40, g: 10, life: 4, max: 4, c: cols[i % cols.length], s: 2 });
  };
  Arena.prototype.disintegrate = function (f) {
    var cos = Math.cos(f.rot || 0), sin = Math.sin(f.rot || 0), self = this;
    root.DM2.sprites.pixels(f.id).forEach(function (p) {
      var lx = (-24 + p.x * 2) * (f.facing < 0 ? -1 : 1), ly = -64 + p.y * 2;
      var wx = f.x + lx * cos - ly * sin, wy = FEET_Y + f.y + lx * sin + ly * cos;
      self.particles.push({ world: true, x: wx, y: wy, vx: (Math.random() - 0.5) * 60, vy: -30 - Math.random() * 70, g: 140, life: 0.6 + Math.random() * 0.8, max: 1.2, c: p.c, s: 2, floor: true });
    });
  };

  /* ---------- fighters ---------- */
  Arena.prototype.makeFighter = function (id, side) {
    return { id: id, x: side ? W + 40 : -40, y: 0, facing: side ? -1 : 1, alpha: 1, rot: 0, flash: false, aura: null, idle: true, visible: true, phase: side * 190, crown: false, front: false };
  };

  Arena.prototype.startParade = function (ids) {
    this.reset();
    this.parade = { ids: ids, offset: 0 };
  };

  /* ---------- the director: plays one fight from the engine's script ----------
     ctx: { fight, ids: [leftId, rightId], meta: [leftMeta, rightMeta], labels: [..], first, final } */
  Arena.prototype.playFight = function (c) {
    var self = this, token = this.token;
    var hooks = this.hooks;
    var sfx = function (n) { if (token === self.token && hooks.sfx) hooks.sfx(n); };
    var F = this.fighters;
    var fight = c.fight;

    function check() { if (token !== self.token) throw new Aborted(); }

    return (async function () {
      // set the scene
      if (c.first || c.fresh) { // a brand new pair walks in (always the case in prize fights)
        self.parade = null;
        if (c.first) self.fade = 16;
        else { await self.tween(self, { fade: 16 }, 300, 'linear'); check(); }
        self.setStage(fight.stage);
        F[0] = self.makeFighter(c.ids[0], 0);
        F[1] = self.makeFighter(c.ids[1], 1);
        self.setPrize(c.prize);
        hooks.matchup && hooks.matchup(c);
        await self.tween(self, { fade: 0 }, 350, 'linear');
        sfx('step');
        await Promise.all([self.tween(F[0], { x: SLOT_X[0] }, 750, 'out'), self.tween(F[1], { x: SLOT_X[1] }, 750, 'out')]);
      } else {
        await self.tween(self, { fade: 16 }, 300, 'linear');
        check();
        self.setStage(fight.stage);
        F[1] = self.makeFighter(c.ids[1], 1);
        F[0].x = SLOT_X[0]; F[0].facing = 1;
        hooks.matchup && hooks.matchup(c);
        await self.tween(self, { fade: 0 }, 300, 'linear');
        sfx('step');
        await self.tween(F[1], { x: SLOT_X[1] }, 700, 'out');
      }
      check();
      hooks.stageName && hooks.stageName(STAGES[fight.stage].name);
      hooks.banner && hooks.banner(c.intro || (c.final ? 'FINAL ROUND' : 'ROUND ' + fight.round), 'round', c.intro ? 1300 : 900);
      sfx('round');
      await self.wait(c.intro ? 1400 : 1000);
      hooks.banner && hooks.banner('FIGHT!', 'fight', 650);
      sfx('fight');
      await self.wait(650);

      for (var i = 0; i < fight.actions.length; i++) {
        check();
        await self._playAction(fight.actions[i], c, i, sfx);
      }
      check();
      await self._playKO(c, sfx);
    })();
  };

  Arena.prototype._playAction = async function (a, c, index, sfx) {
    var self = this, hooks = this.hooks, F = this.fighters;
    var att = F[a.by], def = F[1 - a.by], dir = att.x < def.x ? 1 : -1;
    var meta = c.meta[a.by];
    var special = a.type === 'special';
    var crit = a.type === 'crit' || special;
    var home = att.x;
    F[0].front = a.by === 0; // the attacker is drawn on top

    hooks.comment && hooks.comment(a, c, index);

    if (special) {
      hooks.banner && hooks.banner(meta.special, 'special', 1000, meta.fx);
      att.aura = meta.fx;
      sfx('charge');
      for (var s = 0; s < 6; s++) this.burst(att.x, FEET_Y - 30, meta.fx, 3, 40);
      await this.wait(850);
      this.flashScreen(meta.fx, 0.5);
    }

    var melee = meta.style === 'melee';
    if (melee) {
      att.idle = false;
      await this.tween(att, { x: home - dir * 6 }, 90, 'out');
      sfx('whoosh');
      await this.tween(att, { x: def.x - dir * (a.type === 'miss' ? 16 : 30), y: special ? -10 : 0 }, special ? 130 : 170, 'in');
      att.y = 0;
    } else {
      att.idle = false;
      await this.tween(att, { x: home - dir * 5 }, 100, 'out');
      sfx(meta.style === 'beam' ? 'beam' : 'magic');
      var pr = { x: att.x + dir * 22, y: FEET_Y - 38, dir: dir, color: meta.fx, size: special ? 12 : 7, kind: meta.style === 'beam' ? 'beam' : 'orb' };
      this.projectiles.push(pr);
      var tx = a.type === 'miss' ? def.x + dir * 50 : def.x - dir * 10;
      if (meta.style === 'magic') pr.wave = { x0: pr.x, y0: pr.y, tx: tx }; // orbs weave toward the target
      await this.tween(pr, { x: tx }, special ? 380 : (meta.style === 'magic' ? 320 : 240), 'linear');
      this.projectiles.splice(this.projectiles.indexOf(pr), 1);
    }

    var hitX = def.x - dir * 8, hitY = FEET_Y - 36;
    var targetSide = 1 - a.by;
    if (a.type === 'miss') {
      sfx('miss');
      await this.tween(def, { y: -16, x: def.x + dir * 10 }, 140, 'out');
      this.say('MISS', def.x, FEET_Y - 82, '#c8c8dc');
      await this.tween(def, { y: 0 }, 140, 'in');
    } else if (a.type === 'block') {
      sfx('block');
      this.ring(hitX, hitY, '#a8f0ff');
      this.burst(hitX, hitY, '#ffffff', 8, 60);
      this.say('BLOCK', def.x, FEET_Y - 82, '#6ae4ff');
      await this.tween(def, { x: def.x + dir * 4 }, 80, 'out');
    } else {
      sfx(crit ? 'crit' : 'hit');
      def.flash = true;
      def.idle = false;
      this.burst(hitX, hitY, crit ? '#ffd040' : '#ff7a3a', crit ? 26 : 14, crit ? 130 : 90);
      if (special) this.burst(hitX, hitY, meta.fx, 30, 160);
      this.quake(special ? 10 : crit ? 6 : 3);
      this.say((crit && !special ? 'CRIT ' : '') + '-' + a.dmg, def.x, FEET_Y - 84, crit ? '#ffd840' : '#ffffff', crit ? 2 : 2);
      hooks.hp && hooks.hp(targetSide, a.hp[targetSide], a.dmg);
      await this.wait(crit ? 160 : 90); // hit-stop
      def.flash = false;
      await this.tween(def, { x: def.x + dir * (special ? 14 : crit ? 9 : 5) }, 110, 'out');
    }
    att.aura = null;

    if (!a.ko) {
      var back = [this.tween(att, { x: home }, melee ? 220 : 140, 'out')];
      var defHome = SLOT_X[targetSide];
      back.push(this.tween(def, { x: defHome }, 260, 'inout'));
      await Promise.all(back);
      att.idle = true; def.idle = true;
      await this.wait(230);
    }
  };

  Arena.prototype._playKO = async function (c, sfx) {
    var hooks = this.hooks, F = this.fighters, fight = c.fight;
    var winner = F[fight.winnerSide], loser = F[1 - fight.winnerSide];
    var dir = winner.x < loser.x ? 1 : -1;
    sfx('ko');
    this.timeScale = 0.4;
    hooks.banner && hooks.banner('K.O.!', 'ko', 1300);
    this.flashScreen('#ffffff', 0.8);
    this.quake(12);
    for (var i = 0; i < 6; i++) { loser.flash = !loser.flash; await this.wait(70); }
    loser.flash = false;
    this.timeScale = 1;
    loser.idle = false;
    await this.tween(loser, { rot: dir * Math.PI / 2, x: loser.x + dir * 12 }, 380, 'in');
    sfx('thud');
    this.quake(5);
    await this.wait(260);
    sfx('explode');
    this.disintegrate(loser);
    loser.visible = false;
    await this.tween(winner, { x: SLOT_X[fight.winnerSide] }, 200, 'out');
    winner.idle = false;
    hooks.koDone && hooks.koDone(c);
    for (var h = 0; h < 2; h++) {
      sfx('jump');
      await this.tween(winner, { y: -18 }, 160, 'out');
      await this.tween(winner, { y: 0 }, 160, 'in');
    }
    winner.idle = true;

    if (c.prize) {
      await this.awardPrize(winner, sfx);
      if (c.final) { this.confetti(120); sfx('victory'); }
      await this.wait(c.final ? 1200 : 700);
      return;
    }

    if (c.final) {
      winner.crown = true;
      this.confetti(120);
      sfx('victory');
      await this.tween(winner, { x: 160 }, 600, 'inout');
      winner.facing = 1;
      await this.wait(400);
      return;
    }
    await this.wait(350);
    sfx('heal');
    hooks.heal && hooks.heal(fight.winnerSide);
    for (var s = 0; s < 4; s++) { this.burst(winner.x, FEET_Y - 30, '#7aff6a', 6, 50); await this.wait(120); }
    if (fight.winnerSide === 1) {
      winner.facing = -1;
      sfx('step');
      await this.tween(winner, { x: SLOT_X[0] }, 700, 'inout');
      winner.facing = 1;
      F[0] = winner;
      F[1] = null;
    } else {
      F[1] = null;
    }
    await this.wait(250);
  };

  /* ---------- prize fights (who gets what) ---------- */
  var PRIZE_COLORS = ['#e83838', '#3a78f0', '#3cc84a', '#a64ae8', '#ff9a2a', '#ff5aa8'];

  Arena.prototype.setPrize = function (prize) {
    this.prize = prize ? { x: 160, y: 36, color: PRIZE_COLORS[prize.index % PRIZE_COLORS.length], held: null } : null;
  };

  Arena.prototype.awardPrize = async function (winner, sfx) {
    var pr = this.prize;
    if (!pr) return;
    sfx('heal');
    await this.tween(pr, { x: winner.x, y: FEET_Y - 82 }, 450, 'inout');
    pr.held = winner;
    this.burst(winner.x, FEET_Y - 82, '#ffe14a', 22, 90);
    this.burst(winner.x, FEET_Y - 82, pr.color, 12, 70);
    for (var h = 0; h < 2; h++) {
      sfx('jump');
      await this.tween(winner, { y: -14 }, 150, 'out');
      await this.tween(winner, { y: 0 }, 150, 'in');
    }
  };

  /* The last person waiting takes a gift without a fight. c: { round, id, meta, label, prize, first, final, intro } */
  Arena.prototype.playWalkover = function (c) {
    var self = this, token = this.token, hooks = this.hooks, F = this.fighters;
    var sfx = function (n) { if (token === self.token && hooks.sfx) hooks.sfx(n); };
    function check() { if (token !== self.token) throw new Aborted(); }
    return (async function () {
      self.parade = null;
      if (c.first) self.fade = 16;
      else { await self.tween(self, { fade: 16 }, 300, 'linear'); check(); }
      self.setStage(c.round.stage);
      F[0] = self.makeFighter(c.id, 0);
      F[1] = null;
      self.setPrize(c.prize);
      hooks.matchup && hooks.matchup(c);
      await self.tween(self, { fade: 0 }, 300, 'linear');
      hooks.stageName && hooks.stageName(STAGES[c.round.stage].name);
      sfx('step');
      await self.tween(F[0], { x: 160 }, 900, 'out');
      check();
      hooks.banner && hooks.banner(c.intro, 'round', 1300);
      sfx('round');
      await self.wait(1400);
      hooks.banner && hooks.banner('WALKOVER!', 'fight', 900);
      sfx('fight');
      await self.wait(700);
      hooks.koDone && hooks.koDone(c);
      await self.awardPrize(F[0], sfx);
      if (c.final) { self.confetti(120); sfx('victory'); }
      await self.wait(c.final ? 1200 : 700);
    })();
  };

  function drawPresent(ctx, x, y, color, t) {
    x = Math.round(x); y = Math.round(y);
    var ink = '#140c1c', ribbon = '#ffe14a';
    ctx.fillStyle = ink;
    ctx.fillRect(x - 7, y - 4, 14, 14); ctx.fillRect(x - 5, y - 8, 4, 4); ctx.fillRect(x + 1, y - 8, 4, 4);
    ctx.fillStyle = color;
    ctx.fillRect(x - 6, y - 3, 12, 3); ctx.fillRect(x - 5, y + 1, 10, 8);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 2, y + 1, 3, 8);
    ctx.fillStyle = ribbon;
    ctx.fillRect(x - 1, y - 3, 2, 12); ctx.fillRect(x - 4, y - 7, 2, 2); ctx.fillRect(x + 2, y - 7, 2, 2);
    ctx.fillRect(x - 2, y - 5, 4, 1);
    if (Math.floor(t / 180) % 3 === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 4, y - 2, 1, 1); }
  }

  Arena.prototype._drawPrize = function (ctx, cam) {
    var pr = this.prize, t = this.time;
    if (pr.held) {
      if (!pr.held.visible) return;
      pr.x = pr.held.x; pr.y = FEET_Y - 82 + pr.held.y;
    }
    var bob = pr.held ? 0 : Math.round(Math.sin(t / 260) * 3);
    if (!pr.held && Math.floor(t / 120) % 4 === 0) { // sparkle around the prize while it is up for grabs
      var a = (t / 300) % (Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(pr.x - cam + Math.cos(a) * 14), Math.round(pr.y + bob + Math.sin(a) * 10), 1, 1);
      ctx.fillRect(Math.round(pr.x - cam - Math.cos(a) * 14), Math.round(pr.y + bob - Math.sin(a) * 10), 1, 1);
    }
    drawPresent(ctx, pr.x - cam, pr.y + bob, pr.color, t);
  };

  Arena.Aborted = Aborted;
  Arena.W = W; Arena.H = H;
  root.DM2 = root.DM2 || {};
  root.DM2.Arena = Arena;
})(this);
