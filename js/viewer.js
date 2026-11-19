// Necesse Map Viewer: reads the world save, draws the map and runs the generator in background workers.
(function () {
'use strict';

// <parser>
function b64urlToBytes(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  var bin = atob(s), out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function inflate(bytes) {
  var ds = new DecompressionStream('deflate');
  var buf = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}
async function parseMapData(text) {
  var regions = [], errors = [];
  var re = /(-?\d+)\s*x\s*(-?\d+)\s*=\s*\{([^}]*)\}/g, m;
  while ((m = re.exec(text))) {
    var key = m[1] + 'x' + m[2], body = m[3];
    try {
      var w = +(/width\s*=\s*(\d+)/.exec(body) || [])[1];
      var h = +(/height\s*=\s*(\d+)/.exec(body) || [])[1];
      var cm = /colors\s*=\s*([A-Za-z0-9_\-+\/=]+)/.exec(body);
      if (!w || !h || !cm) throw new Error('missing width, height or colors');
      var raw = await inflate(b64urlToBytes(cm[1]));
      var rgb;
      if (raw.length === w * h * 3) rgb = raw;
      else if (raw.length === w * h * 4) {
        rgb = new Uint8Array(w * h * 3);
        for (var i = 0; i < w * h; i++) { rgb[i*3] = raw[i*4]; rgb[i*3+1] = raw[i*4+1]; rgb[i*3+2] = raw[i*4+2]; }
      } else throw new Error('unexpected data size ' + raw.length + ' for ' + w + 'x' + h);
      regions.push({ rx: +m[1], ry: +m[2], w: w, h: h, rgb: rgb, key: key });
    } catch (e) { errors.push(key + ': ' + e.message); }
  }
  if (!regions.length && !errors.length) errors.push('no map regions found');
  return { regions: regions, errors: errors };
}
// </parser>

var SAMPLE_TEXT = '';
var SAMPLE = 'Main world (sample)';
var $ = function (s) { return document.querySelector(s); };
var LS = {
  get: function (k, d) { try { var v = localStorage.getItem('nmv:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set: function (k, v) { try { localStorage.setItem('nmv:' + k, JSON.stringify(v)); } catch (e) {} }
};
var hex = function (c) { return '#' + c.toString(16).padStart(6, '0'); };
var fmt = function (n) { return n.toLocaleString('en-US'); };

var GEN_C = NMV_DATA.constants;
NecesseGen.init(GEN_C);
var SEED_PAL = GEN_C.surface.palette.map(function (p) { return parseInt(p[0].slice(1), 16); });
function titleCase(t) { return t.replace(/(^|[\s(])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }); }
var COLOR_NAMES = {};
GEN_C.surface.palette.forEach(function (p) { COLOR_NAMES[parseInt(p[0].slice(1), 16)] = titleCase(p[1]); });
var LEVELS = [['surface', 'Surface'], ['cave', 'Cave'], ['deepcave', 'Deep Cave']];
var LEVEL_LABEL = {}; LEVELS.forEach(function (l) { LEVEL_LABEL[l[0]] = l[1]; });
var PALS = { surface: SEED_PAL }, NAMES = { surface: COLOR_NAMES };
['cave', 'deepcave'].forEach(function (lv) {
  PALS[lv] = GEN_C.levelPalettes[lv].palette.map(function (p) { return parseInt(p[0].slice(1), 16); });
  NAMES[lv] = {}; GEN_C.levelPalettes[lv].palette.forEach(function (p) { NAMES[lv][parseInt(p[0].slice(1), 16)] = p[1]; });
});
var DETAIL = {"surface": {"base": 8, "extra": [4548864, 7948823, 7619883, 16358222, 11942965, 8555416, 1072546, 12092181, 11549465, 8726028, 15391689, 12077850, 3100424, 5793587, 6501426, 8406175, 7160861, 5795374, 4408649, 13036031, 4931876, 5403845, 3247800], "table": {"2": [[0.4025, 8], [0.4342, 9], [0.462, 10], [0.4701, 11], [0.4778, 12], [0.4801, 13], [0.4822, 14]], "3": [[0.5666, 15], [0.583, 16], [0.5955, 17], [0.605, 18], [0.6138, 19], [0.6165, 13]], "4": [[0.0043, 20]], "5": [[0.519, 21], [0.5416, 22], [0.5477, 23], [0.5536, 24], [0.5593, 24], [0.565, 24], [0.5706, 24], [0.5737, 25], [0.5758, 26]], "6": [[0.0617, 27], [0.1054, 27], [0.1431, 27], [0.1787, 27], [0.2105, 28], [0.2188, 29], [0.2211, 30]]}}, "cave": {"base": 13, "extra": [5476185, 5005107, 6501426, 4165435, 3247800, 8555416, 5714966, 10572586, 11108458, 13013295, 7552315, 11975838, 13412718, 5793587, 3163978, 5997092, 7981536], "table": {"0": [[0.0784, 13], [0.0988, 14], [0.1121, 15], [0.1184, 16], [0.1212, 17], [0.1238, 18]], "1": [[0.0041, 18]], "2": [[0.0044, 17]], "3": [[0.008, 18], [0.011, 18]], "4": [[0.0391, 19], [0.0521, 20], [0.0632, 21], [0.0656, 22]], "5": [[0.0071, 23], [0.0098, 23]], "6": [[0.0165, 20], [0.0282, 21], [0.0317, 22], [0.0339, 23]], "7": [[0.011, 24], [0.0195, 25], [0.0229, 25]], "8": [[0.0057, 21], [0.0112, 20], [0.0138, 22]], "9": [[0.6197, 26], [0.6269, 27], [0.6301, 27]], "10": [[0.0087, 20], [0.0171, 21], [0.0241, 28], [0.0284, 22], [0.0305, 27]], "11": [[0.0152, 29], [0.0238, 17], [0.027, 17]], "12": [[0.0098, 20], [0.0166, 21], [0.0214, 22]]}}, "deepcave": {"base": 14, "extra": [10572586, 11108458, 13013295, 2634041, 11809341, 5395291, 14907456, 3818856, 10249758, 11163416, 6911809, 5794266, 35203], "table": {"5": [[0.01, 14], [0.02, 15], [0.025, 16], [0.033, 17], [0.037, 18]], "4": [[0.008, 19], [0.011, 19]], "7": [[0.01, 14], [0.02, 15], [0.025, 16], [0.033, 17], [0.037, 18], [0.041, 20]], "6": [[0.008, 21], [0.011, 21]], "9": [[0.01, 14], [0.02, 15], [0.025, 16], [0.029, 18]], "8": [[0.008, 22], [0.011, 22]], "11": [[0.01, 14], [0.02, 15], [0.025, 16], [0.033, 17], [0.037, 18], [0.043, 23]], "10": [[0.008, 24], [0.011, 24]], "13": [[0.01, 14], [0.02, 15], [0.025, 16], [0.033, 17], [0.037, 18], [0.043, 25]], "12": [[0.008, 26], [0.011, 26]]}}};
var PARENT = {};   // palette index -> ground color it belongs to (for highlight and hide)
Object.keys(DETAIL).forEach(function (lv) {
  var D = DETAIL[lv]; PALS[lv] = PALS[lv].slice(0, D.base).concat(D.extra);
  PARENT[lv] = PALS[lv].map(function (c) { return c; });
  Object.keys(D.table).forEach(function (b) { D.table[b].forEach(function (e) { PARENT[lv][e[1]] = PALS[lv][+b]; }); });
});
function colorName(c) { var lv = state.level || 'surface'; return (NAMES[lv] && NAMES[lv][c]) || COLOR_NAMES[c] || ''; }
// explored files go to a level by their folder name (surface, cave, deepcave)
function levelOf(path) {
  var dirs = path.toLowerCase().split('/').slice(0, -1).join('/');
  if (/deep/.test(dirs)) return 'deepcave';
  if (/cave/.test(dirs)) return 'cave';
  if (/surface/.test(dirs)) return 'surface';
  return state.level;   // loose files go to the level being viewed
}
var state = {
  layers: new Map(), layer: null, view: { cx: 0, cy: 0, s: 4 }, fill: true, spawn: null, structures: true, level: 'surface',
  focus: null, hidden: new Set(), labels: LS.get('labels', {}), markers: [],
  arm: false, borders: true, grid: false, hover: null, ping: null, found: { color: null, visited: [] }, search: ''
};

(function () {  // default names for the game's ground colors, without overwriting the viewer's own names
  var labels = LS.get('labels', null) || {};
  GEN_C.surface.palette.forEach(function (p) { if (!labels[p[0]]) labels[p[0]] = p[1]; });
  state.labels = labels;
})();
var cv = $('#cv'), ctx = cv.getContext('2d'), mini = $('#mini'), mctx = mini.getContext('2d'), stage = $('#stage');
var W = 800, H = 600, dpr = 1, raf = 0;

function cur() { return state.layers.get(state.level) || seedLayer() || null; }
function boundsOf(L) {
  if (L.bounds) return L.bounds;
  var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  L.regions.forEach(function (r) {
    x0 = Math.min(x0, r.rx * r.w); y0 = Math.min(y0, r.ry * r.h);
    x1 = Math.max(x1, (r.rx + 1) * r.w); y1 = Math.max(y1, (r.ry + 1) * r.h);
  });
  return (L.bounds = { x0: x0, y0: y0, x1: x1, y1: y1 });
}
function addRegion(name, r) {
  var L = state.layers.get(name);
  if (!L) { L = { name: name, regions: new Map(), files: [], counts: null, bounds: null, rw: r.w, rh: r.h }; state.layers.set(name, L); }
  var c = document.createElement('canvas'); c.width = r.w; c.height = r.h;
  L.regions.set(r.key, { rx: r.rx, ry: r.ry, w: r.w, h: r.h, rgb: r.rgb, key: r.key, canvas: c, ctx: c.getContext('2d'), img: null, dirty: true });
  L.counts = null; L.bounds = null;
  return L;
}
function paint(reg) {
  var w = reg.w, h = reg.h, d = reg.rgb;
  var img = reg.img || (reg.img = new ImageData(w, h)), o = img.data;
  var focus = state.focus, hid = state.hidden, anyHid = hid.size > 0;
  for (var i = 0, p = 0; i < w * h; i++, p += 4) {
    var r = d[i*3], g = d[i*3+1], b = d[i*3+2], c = (r << 16) | (g << 8) | b, a = 255;
    if (anyHid && hid.has(c)) a = 0;
    else if (c === 0 && state.fillActive) a = 0;
    else if (focus !== null && c !== focus) { r = r * .26; g = g * .26; b = b * .26; }
    o[p] = r; o[p+1] = g; o[p+2] = b; o[p+3] = a;
  }
  reg.ctx.putImageData(img, 0, 0);
  reg.dirty = false;
}
function dirtyAll() { state.layers.forEach(function (L) { L.regions.forEach(function (r) { r.dirty = true; }); }); }
function counts(L) {
  if (L.counts) return L.counts;
  var m = new Map();
  L.regions.forEach(function (reg) {
    var d = reg.rgb;
    for (var i = 0; i < d.length; i += 3) { var c = (d[i] << 16) | (d[i+1] << 8) | d[i+2]; m.set(c, (m.get(c) || 0) + 1); }
  });
  return (L.counts = m);
}
function colorAt(L, tx, ty) {
  if (L.kind === 'seed') {
    var st = L.probe || (L.probe = new NecesseGen.BiomeStack(L.seedInt));
    var biome = GEN_C.surface.biomes[st.getExpensiveBiomeID(tx, ty)];
    return { c: PALS[state.level][st.levelIndex(tx, ty, state.level, 1)], biome: biome ? biome.name : '', key: Math.floor(tx / 256) + 'x' + Math.floor(ty / 256), lx: ((tx % 256) + 256) % 256, ly: ((ty % 256) + 256) % 256 };
  }
  var reg = L.regions.get(Math.floor(tx / L.rw) + 'x' + Math.floor(ty / L.rh));
  if (!reg) return null;
  var lx = tx - reg.rx * reg.w, ly = ty - reg.ry * reg.h, i = (ly * reg.w + lx) * 3;
  return { c: (reg.rgb[i] << 16) | (reg.rgb[i+1] << 8) | reg.rgb[i+2], key: reg.key, lx: lx, ly: ly };
}

/* ---------- drawing ---------- */
function theme() {
  var cs = getComputedStyle(document.documentElement);
  var g = function (n) { return cs.getPropertyValue(n).trim(); };
  return { bg: g('--map-bg') || '#0d1619', fg: g('--map-fg') || '#e2ecee', accent: g('--accent') || '#4fd1c0' };
}
function requestDraw() { if (!raf) raf = requestAnimationFrame(draw); }
var frameNo = 0;
function draw() {
  raf = 0; frameNo++;
  var t = theme(), L = cur(), v = state.view, s = v.s;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = t.bg; ctx.fillRect(0, 0, W, H);
  ctx.font = '500 13px Inter, system-ui, sans-serif';
  if (!L) {
    ctx.fillStyle = t.fg; ctx.globalAlpha = .7; ctx.textAlign = 'center';
    ctx.fillText('Open your world save (.zip) to see its map.', W / 2, H / 2);
    ctx.globalAlpha = 1; ctx.textAlign = 'start'; drawMini(); return;
  }
  var ox = W / 2 - v.cx * s, oy = H / 2 - v.cy * s;
  var SL = seedLayer(), fillNow = L.kind !== 'seed' && SL && state.fill;
  if (fillNow !== !!state.fillActive) { state.fillActive = !!fillNow; dirtyAll(); }
  var seedRange = null;
  if (L.kind === 'seed') seedRange = drawSeed(L, ox, oy, s, 1);
  else if (fillNow) drawSeed(SL, ox, oy, s, 0.5);
  if (SL && (L.kind === 'seed' || fillNow)) drawVillages(SL, ox, oy, s, L.kind === 'seed' ? 1 : 0.5);
  ctx.imageSmoothingEnabled = false;
  L.regions.forEach(function (reg) {
    var x0 = Math.round(ox + reg.rx * reg.w * s), x1 = Math.round(ox + (reg.rx + 1) * reg.w * s);
    var y0 = Math.round(oy + reg.ry * reg.h * s), y1 = Math.round(oy + (reg.ry + 1) * reg.h * s);
    if (x1 < 0 || y1 < 0 || x0 > W || y0 > H) return;
    if (reg.dirty) paint(reg);
    ctx.drawImage(reg.canvas, x0, y0, x1 - x0, y1 - y0);
  });
  if (state.objFind) { ctx.fillStyle = 'rgba(0,0,0,.74)'; ctx.fillRect(0, 0, W, H); }   // dim everything; the matches are drawn above the icons
  if (SL && (L.kind === 'seed' || fillNow)) drawStructures(SL, ox, oy, s, t);
  if (!state.objFind) drawChests(ox, oy, s, t);
  drawLadders(ox, oy, s, t);
  if (state.objFind) drawObjFind(L, SL && (L.kind === 'seed' || fillNow) ? SL : null, ox, oy, s);
  if (state.grid) {
    // single tiles up close; zoomed out, 16-tile chunks, then 64 and 1024 so lines stay at least 8px apart
    var gs = [1, 16, 64, 1024].filter(function (g) { return g * s >= 8; })[0];
    if (gs) {
      ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1; ctx.beginPath();
      var tx0 = Math.floor(-ox / s / gs), tx1 = Math.ceil((W - ox) / s / gs), ty0 = Math.floor(-oy / s / gs), ty1 = Math.ceil((H - oy) / s / gs);
      for (var x = tx0; x <= tx1; x++) { var px = Math.round(ox + x * gs * s) + .5; ctx.moveTo(px, 0); ctx.lineTo(px, H); }
      for (var y = ty0; y <= ty1; y++) { var py = Math.round(oy + y * gs * s) + .5; ctx.moveTo(0, py); ctx.lineTo(W, py); }
      ctx.stroke();
    }
  }
  if (state.borders && seedRange && 256 * s > 40) {
    ctx.strokeStyle = t.accent; ctx.globalAlpha = .45; ctx.setLineDash([6, 4]); ctx.lineWidth = 1;
    for (var bry = seedRange.ry0; bry <= seedRange.ry1; bry++) for (var brx = seedRange.rx0; brx <= seedRange.rx1; brx++) {
      var bx = ox + brx * 256 * s, by = oy + bry * 256 * s;
      ctx.strokeRect(Math.round(bx) + .5, Math.round(by) + .5, 256 * s, 256 * s);
      if (256 * s > 110) { ctx.globalAlpha = .8; ctx.fillStyle = t.accent; ctx.fillText(brx + 'x' + bry, bx + 6, by + 16); ctx.globalAlpha = .45; }
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  if (state.borders) {
    ctx.strokeStyle = t.accent; ctx.globalAlpha = .55; ctx.setLineDash([6, 4]); ctx.lineWidth = 1;
    L.regions.forEach(function (reg) {
      var x0 = ox + reg.rx * reg.w * s, y0 = oy + reg.ry * reg.h * s, ww = reg.w * s, hh = reg.h * s;
      if (x0 + ww < 0 || y0 + hh < 0 || x0 > W || y0 > H) return;
      ctx.strokeRect(Math.round(x0) + .5, Math.round(y0) + .5, ww, hh);
    });
    ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.fillStyle = t.accent;
    L.regions.forEach(function (reg) {
      var x0 = ox + reg.rx * reg.w * s, y0 = oy + reg.ry * reg.h * s;
      if (reg.w * s > 110 && x0 + 60 > 0 && y0 + 20 > 0 && x0 < W && y0 < H) ctx.fillText(reg.key, x0 + 6, y0 + 16);
    });
  }
  if (state.hover && s >= 5) {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.strokeRect(ox + state.hover.x * s, oy + state.hover.y * s, s, s);
  }
  ctx.font = '600 12px Inter, system-ui, sans-serif';
  if (state.spawn && seedLayer() && state.level === 'surface') {
    var spx = ox + (state.spawn.x + .5) * s, spy = oy + (state.spawn.y + .5) * s;
    if (spx > -60 && spy > -60 && spx < W + 60 && spy < H + 60) {
      // a flag on a pole, so it reads differently from the round user markers
      ctx.lineWidth = 2; ctx.strokeStyle = t.bg; ctx.fillStyle = '#ffcf4a';
      ctx.beginPath(); ctx.moveTo(spx, spy); ctx.lineTo(spx, spy - 22); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(spx, spy); ctx.lineTo(spx, spy - 22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(spx, spy - 22); ctx.lineTo(spx + 14, spy - 17); ctx.lineTo(spx, spy - 12); ctx.closePath();
      ctx.lineWidth = 2; ctx.strokeStyle = t.bg; ctx.stroke(); ctx.fill();
      ctx.beginPath(); ctx.arc(spx, spy, 3.5, 0, 6.2832); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = t.bg; ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = t.bg; ctx.strokeText('Spawn', spx + 17, spy - 13);
      ctx.fillStyle = t.fg; ctx.fillText('Spawn', spx + 17, spy - 13);
    }
  }
  state.markers.forEach(function (m) {
    if (m.layer !== state.layer) return;
    var sx = ox + (m.x + .5) * s, sy = oy + (m.y + .5) * s;
    if (sx < -80 || sy < -20 || sx > W + 80 || sy > H + 20) return;
    ctx.beginPath(); ctx.arc(sx, sy, 6, 0, 6.2832);
    ctx.fillStyle = t.accent; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = t.bg; ctx.stroke();
    if (m.name) {
      ctx.lineWidth = 3; ctx.strokeStyle = t.bg; ctx.strokeText(m.name, sx + 10, sy + 4);
      ctx.fillStyle = t.fg; ctx.fillText(m.name, sx + 10, sy + 4);
    }
  });
  if (state.ping) {
    var age = (performance.now() - state.ping.t) / 1000;
    if (age > 2.6) state.ping = null;
    else {
      var sx2 = ox + (state.ping.x + .5) * s, sy2 = oy + (state.ping.y + .5) * s;
      for (var k = 0; k < 2; k++) {
        var ph = ((age * 1.1) + k * .5) % 1;
        ctx.beginPath(); ctx.arc(sx2, sy2, 8 + ph * 36, 0, 6.2832);
        ctx.strokeStyle = t.accent; ctx.globalAlpha = (1 - ph) * (1 - age / 2.6); ctx.lineWidth = 2.5; ctx.stroke();
      }
      ctx.globalAlpha = 1; requestDraw();
    }
  }
  drawMini();
}
var mw = 150, mh = 150;
function miniGeom() {
  var L = cur(); if (!L || !L.regions.size) return null;
  var b = boundsOf(L), bw = b.x1 - b.x0, bh = b.y1 - b.y0, pad = 6;
  var sc = Math.min((mw - pad * 2) / bw, (mh - pad * 2) / bh);
  return { b: b, sc: sc, ox: (mw - bw * sc) / 2, oy: (mh - bh * sc) / 2 };
}
function drawMini() {
  var r = mini.getBoundingClientRect(); mw = r.width || 150; mh = r.height || 150;
  if (mini.width !== Math.round(mw * dpr)) { mini.width = Math.round(mw * dpr); mini.height = Math.round(mh * dpr); }
  mctx.setTransform(dpr, 0, 0, dpr, 0, 0); mctx.clearRect(0, 0, mw, mh);
  var CL = cur(); mini.hidden = !CL || CL.kind === 'seed';
  var g = miniGeom(); if (!g) return;
  mctx.imageSmoothingEnabled = true;
  cur().regions.forEach(function (reg) {
    if (reg.dirty) paint(reg);
    mctx.drawImage(reg.canvas, g.ox + (reg.rx * reg.w - g.b.x0) * g.sc, g.oy + (reg.ry * reg.h - g.b.y0) * g.sc, reg.w * g.sc, reg.h * g.sc);
  });
  var v = state.view, vw = W / v.s, vh = H / v.s;
  mctx.strokeStyle = theme().accent; mctx.lineWidth = 1.5;
  mctx.strokeRect(g.ox + (v.cx - vw / 2 - g.b.x0) * g.sc, g.oy + (v.cy - vh / 2 - g.b.y0) * g.sc, vw * g.sc, vh * g.sc);
}


/* ---------- seed map: the world generator running in background workers ---------- */
var GEN_URLS = ["js/generator/necesse-gen.js", "js/generator/cave-presets.js", "js/generator/cave-chests.js", "js/generator/village-gen.js", "js/generator/jhashmap.js", "js/generator/structures.js", "js/generator/biome-deco.js"].map(function (f) { return new URL(f, location.href).href; });
var GEN_LOOT = NMV_DATA.loot;
var GEN_VILLAGE = NMV_DATA.village;
var GEN_PRESETS = NMV_DATA.presets;
var GEN_SETS = NMV_DATA.presetSets;
var GEN_GP = NMV_DATA.gpData;
var GEN_DECO = NMV_DATA.biomeRules;
// palette entries for what the biome rules place: one per object (and per new ground tile) on each level, added
// after the base and scatter colours; each one's parent is the ground of the biome that places it (ores: its rock)
var DECO_PAL = null;
function decoPalette() {
  if (DECO_PAL) return DECO_PAL;
  DECO_PAL = {};
  var BN = { 1: 'Forest', 2: 'Plains', 3: 'Desert', 4: 'Swamp', 5: 'Snow' }, ON = GEN_VILLAGE.objects, TN = GEN_VILLAGE.tiles;
  LEVELS.forEach(function (l) {
    var lv = l[0], map = {}, pal = PALS[lv], par = PARENT[lv], look = lv === 'surface' ? null : GEN_C.levelPalettes[lv].lookup;
    function add(key, color, parent) {
      if (map[key] !== undefined || pal.length >= 255) return;
      map[key] = pal.length; pal.push(color); par.push(parent);
    }
    // the ground and base rocks already have colours
    if (look) for (var k in look) { var id = +k.slice(1); map[(k[0] === 't' ? 't:' + TN[id] : 'o:' + ON[id])] = look[k]; }
    else SURFACE_TILES.forEach(function (t, i) { if (map['t:' + t] === undefined && i !== 1) map['t:' + t] = i; });
    Object.keys(BN).forEach(function (b) {
      var rules = GEN_DECO.rules[BN[b] + ':' + lv]; if (!rules) return;
      var ground, rock;
      if (lv === 'surface') ground = pal[GEN_C.surface.biomes[b].terrain];
      else { var cb = GEN_C.caveBiomes[b]; ground = pal[look['t' + (lv === 'cave' ? cb.caveTile : cb.deepTile)]]; rock = pal[look['o' + (lv === 'cave' ? cb.caveRock : cb.deepRock)]]; }
      rules.forEach(function (r) {
        if (r.op !== 'place') return;
        var P = r.place, ore = r.tests.some(function (t) { return t[0] === 'object' && /rock/i.test(t[1]); }), names = [];
        if (P[0] === 'tile') { var tn = GEN_DECO.tilefields[P[1]] || P[1]; add('t:' + tn, saveColor(tn, 'air'), ground); return; }
        if (P[0] === 'mob') return;
        if (P[0] === 'crates' || P[0] === 'custom') names = P[0] === 'crates' ? P[1] : P[2]; else names = [P[1]];
        if (P[1] === 'SwampBiome$1') add('t:mudtile', saveColor('mudtile', 'air'), ground);
        names.forEach(function (n) {
          var all = n === 'snowpile' ? ['snowpile0', 'snowpile1', 'snowpile2', 'snowpile3'] : [n], m = GEN_DECO.multi[n];
          if (m) { var id = ON.indexOf(n); for (var i = 1; i < m[1] * m[2]; i++) all.push(ON[id + i]); }
          all.forEach(function (o) { add('o:' + o, saveColor('grasstile', o), ore ? rock : ground); });
        });
      });
    });
    if (lv !== 'surface') add('t:rocktile', saveColor('rocktile', 'air'), pal[look['t' + GEN_C.caveBiomes[1][lv === 'cave' ? 'caveTile' : 'deepTile']]]);   // water cooled by lava
    DECO_PAL[lv] = map;
  });
  return DECO_PAL;
}
var WORKER_SRC = 'importScripts(' + GEN_URLS.map(function (u) { return JSON.stringify(u); }).join(', ') + ');\n' + '(' + function () {
  var st = null, detail = null, dseed = 0, decoPal = null, TID = {}, OID = {}, VT = null, VO = null, decoCache = {};
  var SURF = ['watertile', 'watertile', 'grasstile', 'plainsgrasstile', 'sandtile', 'swampgrasstile', 'snowtile', 'icetile'];
  // one 256 x 256 block, one sample per tile, with every biome placement rule applied: palette indices for the
  // picture, and the tile and object at each tile (indices into the village data names) for hover and search
  function decoBlock(level, x0, y0) {
    var n = 256, idx = new Uint8Array(n * n), tt = new Uint8Array(n * n), oo = new Uint16Array(n * n), pal = decoPal[level];
    var DC = st._decoCache || (st._decoCache = {}), deep = level === 'deepcave', cache = DC[level] || (DC[level] = new Map());   // shared with the structures, which see the decoration
    var base = level === 'surface' ? function (x, y) { return [SURF[st.surfaceIndex(x, y, 1)], 'air']; }
                                   : function (x, y) { var to = st.caveTileObject(x, y, deep, 1); return [VT[to[0]], VO[to[1]]]; };
    for (var ry = 0; ry < 16; ry++) for (var rx = 0; rx < 16; rx++) {
      var grx = (x0 >> 4) + rx, gry = (y0 >> 4) + ry, R = st.decoratedRegion(level, grx, gry, base, cache), BR = cache.get('b' + grx + ',' + gry);
      for (var k = 0; k < 256; k++) {
        var lx = rx * 16 + (k & 15), ly = ry * 16 + (k >> 4), i = ly * n + lx, gx = x0 + lx, gy = y0 + ly;
        var t = R.T[k], o = R.O[k], bt0 = BR.T[k], bt1 = BR.O[k], p = undefined, b;
        if (level === 'surface') b = bt0 === 'watertile' ? st.surfaceIndex(gx, gy, 1) : pal['t:' + bt0];
        else b = bt1 !== 'air' ? pal['o:' + bt1] : pal['t:' + bt0];
        if (b === undefined) b = st.levelIndex(gx, gy, level, 1);
        if (o !== 'air' && o !== bt1) p = pal['o:' + o];
        else if (t !== bt0) p = pal['t:' + t];
        idx[i] = p === undefined ? b : p; tt[i] = TID[t] || 0; oo[i] = o === 'air' ? 0 : OID[o] || 0;
      }
    }
    return { idx: idx, t: tt, o: oo };
  }
  // scatter trees, grass, ores and small rocks over generated ground at the rates measured in real saves
  // (decorative: the positions are not the ones the game would choose)
  function speckle(i, x, y, level, step) {
    var tb = detail && step <= 8 && detail[level].table[i];
    if (!tb) return i;
    var h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ dseed;
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); h ^= h >>> 15;
    var r = (h >>> 0) / 4294967296;
    for (var k = 0; k < tb.length; k++) if (r < tb[k][0]) return tb[k][1];
    return i;
  }
  self.onmessage = function (e) {
    var m = e.data;
    if (m.type === 'init') {
      NecesseGen.init(m.constants); st = new NecesseGen.BiomeStack(m.seedInt); detail = m.detail; dseed = m.seedInt;
      if (m.loot) { NecesseCave.install(NecesseGen); NecesseChests.install(NecesseGen, m.loot); }
      if (m.village) NecesseVillage.install(NecesseGen, m.village, NecesseGen.Chests);
      if (m.gp) { NecesseGen.GPData = m.gp.data; NecesseGen.GPSets = m.gp.sets; NecesseGen.GPSpec = m.gp.spec; }
      if (m.presets) { NecesseGen.PresetData = m.presets; NecesseGen.SetData = m.sets; NecesseStructures.install(NecesseGen); }
      if (m.deco && m.village) {
        NecesseDeco.install(NecesseGen, m.village.objects); NecesseGen.setDecoRules(m.deco); decoPal = m.decoPal;
        m.village.tiles.forEach(function (t, i) { TID[t] = i; }); m.village.objects.forEach(function (o, i) { if (OID[o] === undefined) OID[o] = i; });
        VT = m.village.tiles; VO = m.village.objects;
      }
      return;
    }
    if (m.type === 'village') {
      var v = null;
      try { v = m.id === 'surfacevillages' ? st.villageAt(m.px, m.py, m.x, m.y) : st.packOverlay(st.structureAt(m.level, m.px, m.py, m.id, m.x, m.y, m.rt || 0)); } catch (err) { v = null; }
      self.postMessage({ type: 'village', key: m.key, v: v }, v ? [v.t.buffer, v.o.buffer] : []);
      return;
    }
    if (m.type === 'chests') { self.postMessage({ type: 'chests', key: m.key, list: m.level === 'surface' ? st.surfaceChests(m.px, m.py, m.spawn) : st.caveChests(m.px, m.py, m.level) }); return; }
    if (m.type === 'tile' && m.step === 1 && decoPal) {
      var D = decoBlock(m.level, m.bx * 256, m.by * 256);
      self.postMessage({ type: 'tile', key: m.key, n: 256, idx: D.idx, dt: D.t, do: D.o }, [D.idx.buffer, D.t.buffer, D.o.buffer]);
    } else if (m.type === 'tile') {
      var n = m.B * 256 / m.step, out = new Uint8Array(n * n), x0 = m.bx * m.B * 256, y0 = m.by * m.B * 256;
      for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) { var gx = x0 + x * m.step, gy = y0 + y * m.step; out[y * n + x] = speckle(st.levelIndex(gx, gy, m.level, m.step), gx, gy, m.level, m.step); }
      self.postMessage({ type: 'tile', key: m.key, n: n, idx: out }, [out.buffer]);
    } else if (m.type === 'presets') {
      function surfaceStructures(st, px, py) {
        var out = st.presetsInRegion(px, py).map(function (e) { var c = {}; for (var k in e) c[k] = e[k]; c.rx = px; c.ry = py; return c; });
        if (st.surfacePresetsFull) st.edgeFlags('surfacePresetsFull', px, py).forEach(function (p) {
          if (p.id === 'surfaceruins') { var q = p.rects[0]; out.push({ type: 'ruin', id: p.id, rx: px, ry: py, x: q[0], y: q[1], w: q[2], h: q[3] }); }
          else if (!p.regionTile && !p.regionOnly && NecesseGen.Structures && NecesseGen.Structures.has('surface', p) && ['surfacevillages', 'dungeonentrance', 'piratevillages', 'charredforest'].indexOf(p.id) < 0) { var q3 = p.rects[0]; out.push({ type: 'ov', id: p.id, rx: px, ry: py, x: q3[0], y: q3[1], w: q3[2], h: q3[3] }); }
          else if (p.regionTile && !p.skip && NecesseGen.Structures && NecesseGen.Structures.has('surface', p)) { var q2 = p.rects[0]; out.push({ type: 'ov', id: p.id, rx: px, ry: py, rt: p.index + 1, x: q2[0], y: q2[1], w: q2[2], h: q2[3] }); }
        });
        return out;
      }
      function caveStructures(st, level, px, py) {
        var MAP = {
          chieftainarena: 'chieftain', vulturearenas: 'vulture', forestvampirecrypts: 'crypt', snowvampirecrypts: 'crypt',
          forestbearcave: 'bearcave', plainsbearcave: 'bearcave', plainsruneboundtribes: 'tribe',
          forestspidernests: 'spidernest', snowspidernests: 'spidernest', swampspidernests: 'spidernest', deepswampspidernests: 'spidernest',
          forestsapphirecrystals: 'sapphire', desertamethystcrystals: 'amethyst', deepforestrubycrystals: 'ruby', deepplainstopazcrystals: 'topaz', deepswampemeralcrystals: 'emerald',
          forestlootareas: 'lootarea', snowlootareas: 'lootarea', swampwitchcastle: 'witchcastle', desertcavelingoasis: 'oasis',
          frenchhorn: 'frenchhorn', snowmusicplayer: 'musicroom', deepsnowmusicplayer: 'musicroom',
          cursedcronearena: 'crone', deserttemple: 'temple', deepforestabandonedmines: 'mine', deepplainsruneboundtombs: 'tomb',
          deepswampfishianbiome: 'fishian', deepswampagedchampion: 'champion', corekeepercore: 'core', palworldgrizzbolt: 'grizzbolt', shrineofthemoon: 'shrine'
        };
        var list = st.edgeFlags(level === 'cave' ? 'cavePresets' : 'deepPresets', px, py), out = [];
        for (var i = 0; i < list.length; i++) {
          var p = list[i], type = MAP[p.id], SX = NecesseGen.Structures;
          if (p.skip) continue;
          if (SX && (!type || p.regionTile) && (!p.regionOnly || p.regionTile) && SX.has(level, p)) { var qo = p.rects[0]; out.push({ type: 'ov', id: p.id, lv: level, rx: px, ry: py, rt: p.regionTile ? p.index + 1 : 0, x: qo[0], y: qo[1], w: qo[2], h: qo[3] }); continue; }
          if (!type || p.regionOnly || p.regionTile) continue;
          if (type === 'fishian' && !(p.data && p.data.house != null)) continue;
          var q = p.rects[0];
          out.push({ type: type, id: p.id, lv: level, rx: px, ry: py, x: q[0], y: q[1], w: q[2], h: q[3] });
        }
        return out;
      }
      self.postMessage({ type: 'presets', key: m.key, list: m.level === 'cave' || m.level === 'deepcave' ? caveStructures(st, m.level, m.px, m.py) : surfaceStructures(st, m.px, m.py) });
    } else if (m.type === 'find') {
      // grow square rings around the start, 8 tiles apart, and return the first match outside the visited spots
      var step = 8, maxR = 6144, vis = m.visited || [];
      function ok(x, y) {
        if (st.surfaceIndex(x, y, 1) !== m.target) return false;
        for (var k = 0; k < vis.length; k++) if (Math.abs(vis[k][0] - x) < 48 && Math.abs(vis[k][1] - y) < 48) return false;
        return true;
      }
      for (var r = 0; r <= maxR; r += step) {
        for (var i = -r; i <= r; i += step) {
          var pts = r === 0 ? [[0, 0]] : [[i, -r], [i, r], [-r, i], [r, i]];
          for (var j = 0; j < pts.length; j++) { var px = m.cx + pts[j][0], py = m.cy + pts[j][1]; if (ok(px, py)) { self.postMessage({ type: 'found', id: m.id, x: px, y: py }); return; } }
        }
      }
      self.postMessage({ type: 'found', id: m.id, x: null, y: null });
    }
  };
}.toString() + ')();';
var workerURL = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));

function seedLayer() { var s = null; state.layers.forEach(function (L) { if (L.kind === 'seed') s = L; }); return s; }
function makeSeedLayer(text, home) {
  var old = seedLayer();
  if (old) { old.workers.forEach(function (w) { w.w.terminate(); }); state.layers.delete(old.name); }
  var L = { name: 'Seed ' + text, kind: 'seed', seedText: text, seedInt: NecesseGen.javaStringHash(text), regions: new Map(), files: [],
            tiles: new Map(), pending: new Map(), queue: [], pqueue: [], cqueue: [], vqueue: [], villages: new Map(), gchests: new Map(), presets: new Map(), pidx: new Map(), vrk: new Map(), workers: [], home: home || { x: 0, y: 0 }, findId: 0, finds: {}, done: 0 };
  var n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
  for (var i = 0; i < n; i++) {
    var w = new Worker(workerURL), slot = { w: w, busy: null };
    w.postMessage({ type: 'init', constants: GEN_C, seedInt: L.seedInt, detail: DETAIL, loot: GEN_LOOT, village: GEN_VILLAGE, presets: GEN_PRESETS, sets: GEN_SETS, gp: GEN_GP, deco: GEN_DECO, decoPal: decoPalette() });
    w.onmessage = onWorkerMessage.bind(null, L, slot);
    w.onerror = function (ev) { toast('The generator stopped: ' + (ev.message || 'unknown error')); };
    L.workers.push(slot);
  }
  state.layers.set(L.name, L);
  // the spawn point is known when it comes from a world save; a typed seed alone does not say where spawn is
  if (home) state.spawn = { x: home.x, y: home.y, seed: text };
  else if (state.spawn && state.spawn.seed !== text) state.spawn = null;
  return L;
}
function onWorkerMessage(L, slot, e) {
  var m = e.data;
  if (m.type === 'tile') {
    slot.busy = null; L.pending.delete(m.key);
    var c = document.createElement('canvas'); c.width = c.height = m.n;
    L.tiles.set(m.key, { level: m.key.split(':')[0], idx: m.idx, n: m.n, canvas: c, ctx: c.getContext('2d'), dirty: true, used: performance.now(), dt: m.dt, do: m.do });
    L.done++;
    pumpSeed(L); requestDraw();
  } else if (m.type === 'presets') {
    slot.busy = null; L.pending.delete(m.key);
    L.presets.set(m.key, m.list); indexRegion(L, m.key, m.list);
    scheduleStructList(); pumpSeed(L); requestDraw();
  } else if (m.type === 'village') {
    slot.busy = null; L.pending.delete(m.key);
    L.villages.set(m.key, m.v || { n: 0 });
    var R = L.pidx.get(L.vrk.get(m.key)); L.vrk.delete(m.key);
    if (R) { R.have++; if (R.comp) compAdd(L, R, L.villages.get(m.key), m.key); }
    pumpSeed(L); requestDraw();
  } else if (m.type === 'chests') {
    slot.busy = null; L.pending.delete(m.key);
    m.list.forEach(function (c) { c.gen = true; });
    L.gchests.set(m.key, m.list.filter(function (c) { return c.kind !== 'trial'; })); state.chestVer++;
    if (state.chestQ && !$('#panel [data-pane="chests"]').hidden) { clearTimeout(chestSearchTimer); chestSearchTimer = setTimeout(runChestSearch, 300); }
    pumpSeed(L); requestDraw();
  } else if (m.type === 'found') {
    slot.busy = null; var cb = L.finds[m.id]; delete L.finds[m.id]; if (cb) cb(m); pumpSeed(L);
  }
}
function pumpSeed(L) {
  L.workers.forEach(function (slot, wi) {
    if (slot.busy) return;
    // one worker keeps structures coming while the rest fill in the terrain
    var job = wi === 0 && L.workers.length > 1 ? L.pqueue.shift() || L.vqueue.shift() || L.queue.shift() || L.cqueue.shift()
                                               : L.queue.shift() || L.pqueue.shift() || L.vqueue.shift() || L.cqueue.shift();
    if (!job) return;
    slot.busy = job.key; L.pending.set(job.key, slot);
    slot.w.postMessage(job);
  });
  var gen = $('#stGen'), busy = L.pending.size + L.queue.length + L.pqueue.length + L.cqueue.length + L.vqueue.length;
  if (L === seedLayer() && !busy && L.structHint && state.structures) { gen.hidden = false; gen.textContent = 'Zoom in to see structures'; return; }
  if (L === seedLayer() && busy) { gen.hidden = false; gen.textContent = 'Generating ' + busy + (busy === 1 ? ' block' : ' blocks') + '…'; }
  else gen.hidden = true;
}
function seedStep(s) { var p = 1; while (s * p < 0.75 && p < 64) p *= 2; return p; }
function paintSeedTile(t) {
  var n = t.n, img = t.img || (t.img = new ImageData(n, n)), o = img.data, idx = t.idx, pal = PALS[t.level], par = PARENT[t.level];
  var focus = state.focus, hid = state.hidden, anyHid = hid.size > 0;
  for (var i = 0, p = 0; i < n * n; i++, p += 4) {
    var c = pal[idx[i]], pc = par[idx[i]], r = c >> 16, g = (c >> 8) & 255, b = c & 255, a = 255;
    if (anyHid && hid.has(pc)) a = 0;
    else if (focus !== null && pc !== focus) { r *= .26; g *= .26; b *= .26; }
    o[p] = r; o[p + 1] = g; o[p + 2] = b; o[p + 3] = a;
  }
  t.ctx.putImageData(img, 0, 0); t.dirty = false;
}
function blockSize(step) { return Math.max(1, step / 2); }   // regions per job side: about 128 samples per side when zoomed out
function drawSeed(L, ox, oy, s, alpha) {
  var step = seedStep(s), B = blockSize(step), v = state.view, span = B * 256;
  var vx0 = v.cx - W / 2 / s, vx1 = v.cx + W / 2 / s, vy0 = v.cy - H / 2 / s, vy1 = v.cy + H / 2 / s;
  var bx0 = Math.floor(vx0 / span), bx1 = Math.floor(vx1 / span), by0 = Math.floor(vy0 / span), by1 = Math.floor(vy1 / span);
  var want = [], now = performance.now(), ccx = v.cx / span, ccy = v.cy / span;
  ctx.imageSmoothingEnabled = false; ctx.globalAlpha = alpha;
  for (var by = by0; by <= by1; by++) for (var bx = bx0; bx <= bx1; bx++) {
    var key = state.level + ':' + bx + ',' + by + ',' + step, t = L.tiles.get(key), tb = B, tbx = bx, tby = by;
    if (!t) {
      if (!L.pending.has(key)) want.push({ type: 'tile', key: key, level: state.level, bx: bx, by: by, B: B, step: step, d: (bx + .5 - ccx) * (bx + .5 - ccx) + (by + .5 - ccy) * (by + .5 - ccy) });
      for (var p = step * 2; p <= 64 && !t; p *= 2) {   // show a coarser level while this one is generating
        tb = blockSize(p); tbx = Math.floor(bx * B / tb); tby = Math.floor(by * B / tb);
        t = L.tiles.get(state.level + ':' + tbx + ',' + tby + ',' + p);
      }
    }
    if (!t) continue;
    t.used = now;
    if (t.dirty) paintSeedTile(t);
    var full = tb * 256, x0 = ox + tbx * full * s, y0 = oy + tby * full * s;
    if (tb === B) { ctx.drawImage(t.canvas, Math.round(x0), Math.round(y0), Math.round(x0 + full * s) - Math.round(x0), Math.round(y0 + full * s) - Math.round(y0)); continue; }
    // coarser stand-in: draw only the part that covers this block
    var frac = B / tb, sx = (bx * B - tbx * tb) / tb * t.n, sw = frac * t.n;
    var dx = ox + bx * span * s, dy = oy + by * span * s;
    ctx.drawImage(t.canvas, sx, (by * B - tby * tb) / tb * t.n, sw, sw, Math.round(dx), Math.round(dy), Math.round(dx + span * s) - Math.round(dx), Math.round(dy + span * s) - Math.round(dy));
  }
  ctx.globalAlpha = 1;
  want.sort(function (a, b) { return a.d - b.d; });
  L.queue = want;
  if (L.tiles.size > 600) {  // forget the least recently drawn blocks
    var arr = Array.from(L.tiles.entries()).sort(function (a, b) { return a[1].used - b[1].used; });
    for (var i = 0; i < arr.length - 450; i++) if (arr[i][1].used < now) L.tiles.delete(arr[i][0]);
  }
  pumpSeed(L);
  return { rx0: Math.floor(vx0 / 256), rx1: Math.floor(vx1 / 256), ry0: Math.floor(vy0 / 256), ry1: Math.floor(vy1 / 256) };
}
var STRUCT = {
  village: { name: 'Village', color: '#f0a542' },
  pirate: { name: 'Pirate Village', color: '#e2574c' },
  dungeon: { name: 'Dungeon Entrance', color: '#a07cf0' }
};
Object.assign(STRUCT, {"chieftain": {"name": "Runebound Chieftain arena", "color": "#d9a34a", "tier": 0}, "vulture": {"name": "Ancient Vulture arena", "color": "#e0b25a", "tier": 0}, "crypt": {"name": "Vampire crypt", "color": "#c0485a", "tier": 1}, "bearcave": {"name": "Bear cave", "color": "#a8743f", "tier": 0}, "tribe": {"name": "Runebound tribe", "color": "#c98a4b", "tier": 0}, "witchcastle": {"name": "Witch castle", "color": "#8bc34a", "tier": 0}, "oasis": {"name": "Caveling oasis", "color": "#e8c46a", "tier": 0}, "frenchhorn": {"name": "French horn room", "color": "#e0b040", "tier": 0}, "musicroom": {"name": "Music player room", "color": "#7fb6e8", "tier": 0}, "crone": {"name": "Cursed Crone arena", "color": "#9b6ad6", "tier": 0}, "temple": {"name": "Desert temple", "color": "#e6b35a", "tier": 0}, "mine": {"name": "Abandoned mine", "color": "#b0a090", "tier": 0}, "tomb": {"name": "Runebound tomb", "color": "#c98a4b", "tier": 0}, "fishian": {"name": "Fishian house", "color": "#4fb8a8", "tier": 0}, "champion": {"name": "Aged Champion arena", "color": "#d0d060", "tier": 0}, "core": {"name": "Core Keeper core", "color": "#e07a40", "tier": 0}, "grizzbolt": {"name": "Grizzbolt den", "color": "#f0d040", "tier": 0}, "shrine": {"name": "Shrine of the Moon", "color": "#b8c8f0", "tier": 0}, "spidernest": {"name": "Spider nest", "color": "#9a9a9a", "tier": 2}, "lootarea": {"name": "Loot area", "color": "#d8b860", "tier": 2}, "sapphire": {"name": "Sapphire crystals", "color": "#4a8ae8", "tier": 1}, "amethyst": {"name": "Amethyst crystals", "color": "#a070e0", "tier": 1}, "ruby": {"name": "Ruby crystals", "color": "#e04a5a", "tier": 1}, "topaz": {"name": "Topaz crystals", "color": "#e8b040", "tier": 1}, "emerald": {"name": "Emerald crystals", "color": "#40c070", "tier": 1}});
// villages and pirate villages within 7 regions of spawn are removed when the world is made; dungeons and cave structures never are
function removedBySpawn(L, p) {
  var sp = state.spawn;
  if (!sp || sp.seed !== L.seedText || p.type === 'dungeon' || p.lv) return false;
  if (sp.x >= p.x && sp.x < p.x + p.w && sp.y >= p.y && sp.y < p.y + p.h) return true;
  var srx = Math.floor(sp.x / 16), sry = Math.floor(sp.y / 16);
  var dx = Math.max(0, Math.floor(p.x / 16) - srx, srx - Math.floor((p.x + p.w - 1) / 16));
  var dy = Math.max(0, Math.floor(p.y / 16) - sry, sry - Math.floor((p.y + p.h - 1) / 16));
  return Math.max(dx, dy) <= 7;
}
// below this zoom a structure is only a few pixels across, so its drawing is not worth generating
var OV_MIN = { surface: 1 / 8, cave: 1 / 4, deepcave: 1 / 4 }, COMP_BELOW = 1, COMP_PAD = 128, COMP_N = (1024 + COMP_PAD * 2) / 2;
function presetKey(level, px, py) { return (level === 'surface' ? 'p' : level === 'cave' ? 'pc' : 'pd') + px + ',' + py; }
function indexRegion(L, key, list) {
  var level = key[1] === 'c' ? 'cave' : key[1] === 'd' ? 'deepcave' : 'surface', m = /(-?\d+),(-?\d+)$/.exec(key);
  var R = { key: key, level: level, rx: +m[1], ry: +m[2], ov: [], tiers: [[], [], []], have: 0, comp: null, ordered: false, used: 0 };
  for (var i = 0; i < list.length; i++) {
    var p = list[i], sid = p.id || STRUCT_ID[p.type];
    if (sid) {
      p._vk = 'v' + level + ':' + sid + ':' + p.x + ',' + p.y + (p.rt ? ':' + p.rt : '');
      R.ov.push(p); if (L.villages.has(p._vk)) R.have++;
    }
    if (STRUCT[p.type]) R.tiers[Math.min(2, STRUCT[p.type].tier || 0)].push(p);
  }
  L.pidx.set(key, R);
  return R;
}
// the regions in view (once per frame); asks for the lists of regions not worked out yet
function visibleRegions(L, s) {
  if (L._visFrame === frameNo && L._visS === s && L._visLv === state.level) return L._vis;
  var v = state.view, out = [], want = [], now = performance.now();
  var px0 = Math.floor((v.cx - W / 2 / s) / 1024), px1 = Math.floor((v.cx + W / 2 / s) / 1024);
  var py0 = Math.floor((v.cy - H / 2 / s) / 1024), py1 = Math.floor((v.cy + H / 2 / s) / 1024);
  for (var py = py0; py <= py1; py++) for (var px = px0; px <= px1; px++) {
    var key = presetKey(state.level, px, py), R = L.pidx.get(key);
    if (!R) { var list = L.presets.get(key); if (list) R = indexRegion(L, key, list); }
    if (!R) { if (!L.pending.has(key)) want.push({ type: 'presets', key: key, level: state.level, px: px, py: py, d: Math.abs(px * 1024 + 512 - v.cx) + Math.abs(py * 1024 + 512 - v.cy) }); continue; }
    R.used = now; out.push(R);
  }
  want.sort(function (a, b) { return a.d - b.d; });
  L.pqueue = want;
  L._vis = out; L._visFrame = frameNo; L._visS = s; L._visLv = state.level;
  return out;
}
function structuresVisible(L, s) {
  var out = [];
  visibleRegions(L, s).forEach(function (R) { var l = L.presets.get(R.key) || []; for (var i = 0; i < l.length; i++) if (!removedBySpawn(L, l[i])) out.push(l[i]); });
  return out;
}
// zoomed out, each region's structures are drawn once into one half-resolution image instead of one by one
function compAdd(L, R, vg, key) {
  if (!vg || !vg.n) return;
  if (R.spawnChecked !== state.spawn) { R.spawnChecked = state.spawn; R.skip = new Set(); R.ov.forEach(function (p) { if (removedBySpawn(L, p)) R.skip.add(p._vk); }); }
  if (R.skip.has(key)) return;
  if (!vg.canvas) villageCanvas(vg);
  var bx = R.rx * 1024 - COMP_PAD, by = R.ry * 1024 - COMP_PAD;
  R.cctx.drawImage(vg.canvas, (vg.x0 - bx) / 2, (vg.y0 - by) / 2, vg.n / 2, vg.n / 2);
}
function buildComposite(L, R) {
  if (!R.comp) { R.comp = document.createElement('canvas'); R.comp.width = R.comp.height = COMP_N; R.cctx = R.comp.getContext('2d'); }
  var g = R.cctx; g.clearRect(0, 0, COMP_N, COMP_N); g.imageSmoothingEnabled = false;
  R.have = 0;
  for (var i = 0; i < R.ov.length; i++) { var vg = L.villages.get(R.ov[i]._vk); if (!vg) continue; R.have++; compAdd(L, R, vg, R.ov[i]._vk); }
  R.ordered = R.have >= R.ov.length;   // once every drawing is in, it is redrawn in list order, like the close-up view
}
function evictOverlays(L) {
  if (frameNo % 30) return;
  var regs = Array.from(L.pidx.values()).sort(function (a, b) { return a.used - b.used; }), cur = L._vis || [];
  if (L.vrk.size > 5000) L.vrk.clear();
  var comps = regs.filter(function (R) { return R.comp; }).length;
  for (var i = 0; i < regs.length && (L.villages.size > 16000 || comps > 48); i++) {
    var R = regs[i]; if (cur.indexOf(R) >= 0) continue;
    if (R.comp) { R.comp = R.cctx = null; R.ordered = false; comps--; }
    if (L.villages.size > 16000) { R.ov.forEach(function (p) { L.villages.delete(p._vk); }); R.have = 0; }
  }
}
var GAME_ICONS = {"village": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABNklEQVR4XmP8//8/A6lAWUUFpAVdI+PdO3dINoskB0AtZtCR42C48ugHigOAYoxAMbADSHEICwPp4D/IorsztVF0KqdfhTmIkRQjiXIAms/xmg8KHZh6YkKCqChAjnOYz3/dR3UHmyKEDwwJmARRaQJvCJDic/RgITYk8IYAMT5Ht5jUkMAaApT4nNSQwBoCxPj81d1PKHaJKfOh8IkNCZQQoKbPiQ0JlBAgx+foFpEaEuAQoKXPCYUEOASo4XNyQ4KJYYABRgigu+dgqCxFTrRf/RiXfnBJOeAhgJwN0WsxlOr28pGvKD7RteFG4ROSByrGWkuCHYBea8FyBbWTB7baccCjYNQBgyoXUJTm0HMFsYaNpoHREBgctSF6isXR96O0ZGYclEUxvo4JIwMdAFndc2q6CwDVH6OWIbPk9wAAAABJRU5ErkJggg==", "pirate": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACgUlEQVR4XmP8//8/A6lAQ14IpAVdI+ONh+9INgvFAVCDCRoiyMvB8P7zDxQHAMUYgWJEOQDZoSxYdBAMEpBFoS6aKFpX77lObFAyImsEOwDmcx5OVoYv338z0BKA7IDZBwoJ5BD4D7LcRl8axf7TD5nAfFP5f1jd9fz1J7A4sfqOXHwKCylwSDAxDDAAJ0IcqRrsNHYBWRQn/vzwGK+TSVAPzjUDHgLIaYDxPzMHAwMrL0pq/vHjB9jHHBwcYHrz7iN4QyAkNBIsD9PHwCGKqv73Z0bGvz/gYmAHwPKlkpISAyuN08RvBg6Gew+fwW1BKYjk5OQY/vz5Aw6BXTs2ghUFh8aA6S2b15PkNB/fQLD6tauXgGk3D38wzcLCwvjo0SO4WShpAGg5A60Buh0suCyE+RzmA5iPCIUEus9h5uCyZ1DlApgjGZmYmBg+f/6MkhuAfLC8vYMLmD54YA+Kp2Di6D6F6QOayfjvH2ZpihIFz55BUqeUlBTVkwLIcpj5yIazEGsTLFfA1KP7GF2eWHMHR12A7lpoFKCkAVJ9CMv3SGYzYosCrCFAi/IAl5lY08Dfv38Zfv36BXb8kUO7wTTMR7CQQPchujiMb2PnCtbPzMyMNVlgDQGQA6idDXCZibVVLCAgALL/P5UdwfjhwwcMIwdlSQhzJSMo4fz+/ZuikGBlZWUE1oA4AxNvx4SdnZ0aUcH48+dPnA4gpiSEt+N5OVkYRPjZwSGCpV8AtuTNx5+Mn7//ITr54HUAzOWwdjw7GzPDz19/8RquKsPPAOshEdNVYyEhpf8HWa4uB+4XMsD6AzD9sBBB6iExEmP24KwL0F2Or9+Ax5dE9ZYHPAQAw+j8bafO8zwAAAAASUVORK5CYII=", "dungeon": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAACcklEQVR4XmP8//8/w0ACFnIs12UUwKrt8v8PJBvHQoHv0YOOkRyzSIoCmM8F2ZgY3v/6h+IAoBgjUAzsBlJCgpwQ+A+yKEyRD8XDq+5/gjmIpJAgygFoPscb0qDQgaknJiSIigKogWAfovsc3TXAkIAJMRLjAKwhgCuVk5rI0M3B5iAmPIaCfIyMwUpNpCUYQBhdHxZxrPrR9aGEAClxTWpo4Eob2KIAJZXPEOIH2+Vy5SmYPvP0BTwkkB0BEzdihwTqHh1psHTGu49gGlcuATuAlj5HDyn0kEAOAaz5W05OBGzGHphJ0JBgYHiBYvadZ18g6qA+h+ljgIYALPeghwQTwwADcDmArYhFz+/bDJTBTn306A1eJ8N87nXhLoo6WPmAXmSDowCWP6mV//G5EFSMI5cHKCUhtpAo16gBmxdzIwbF3CUsbSj8mD9VqPIaS8D8zhstYBpXZYWSDeEhISjLwPDrMwM1wXsubobLPx9jGIm1LtBV1GJgFOTF21QqjLRAMax/+Qm87v3//jPj5fvXMNSglANwWVlxBqqDv38ZsNUNyLkAxceMhupgN0iLQRzz9NVLrHyYQwmp+3/+JrqfwLXlgJcDGHUBrCxX+fAc7OLVUHfDfAjzhq6aIYqP3n14hjWEQqHm3IHWEed+/kPRN6hCgJEL2JoDuhCSFqBleygD/pBAj1hYWoH7HGoOzOdAOxi/IaU2upeEIMsJloSgkAAqxFoOoOcOWAjAfI4ltYOVIPsc2QHYS0IcPR9KygZ0n8PMwl4S4nIAJzsDw/ef+DuTnOyMQDVY3YqtUUpOz4hQb5aR1j0jRgYqggHvngMA/NoqfimhB4UAAAAASUVORK5CYII="};
Object.assign(GAME_ICONS, NMV_DATA.icons);
var ICON_IMG = {};
Object.keys(GAME_ICONS).forEach(function (k) { var im = new Image(); im.onload = requestDraw; im.src = GAME_ICONS[k]; ICON_IMG[k] = im; });
function drawStructIcon(type, x, y, t, minor) {
  var im = ICON_IMG[type];
  if (im && im.complete && im.naturalWidth) {
    var sz = minor ? 20 : state.view.s >= 0.5 ? 32 : 24;   // the game draws these at 32px; a little smaller when zoomed far out
    var prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    ctx.drawImage(im, Math.round(x - sz / 2), Math.round(y - sz / 2), sz, sz);
    ctx.imageSmoothingEnabled = prev;
    return;
  }
  drawStructIconFallback(type, x, y, t);
}
function drawStructIconFallback(type, x, y, t) {
  var c = STRUCT[type].color;
  ctx.lineWidth = 2; ctx.strokeStyle = t.bg; ctx.fillStyle = c;
  ctx.beginPath();
  if (type === 'dungeon') {          // arched doorway
    ctx.moveTo(x - 7, y + 7); ctx.lineTo(x - 7, y - 1); ctx.arc(x, y - 1, 7, Math.PI, 0); ctx.lineTo(x + 7, y + 7); ctx.closePath();
    ctx.stroke(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 3, y + 7); ctx.lineTo(x - 3, y + 1); ctx.arc(x, y + 1, 3, Math.PI, 0); ctx.lineTo(x + 3, y + 7); ctx.closePath();
    ctx.fillStyle = '#1a1325'; ctx.fill();
  } else {                           // house; the pirate one gets a flag
    ctx.moveTo(x - 7, y + 6); ctx.lineTo(x - 7, y - 1); ctx.lineTo(x, y - 8); ctx.lineTo(x + 7, y - 1); ctx.lineTo(x + 7, y + 6); ctx.closePath();
    ctx.stroke(); ctx.fill();
    ctx.fillStyle = '#2a1a0c'; ctx.fillRect(x - 2, y + 1, 4, 5);
    if (type === 'pirate') {
      ctx.strokeStyle = t.bg; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x + 4, y - 4); ctx.lineTo(x + 4, y - 14); ctx.stroke();
      ctx.fillStyle = '#111'; ctx.fillRect(x + 4, y - 14, 7, 5);
    }
  }
}
// village buildings, paths and farms, under the save (which covers the parts you have explored)
var STRUCT_ID = { village: 'surfacevillages', dungeon: 'dungeonentrance', pirate: 'piratevillages' };
function drawVillages(L, ox, oy, s, alpha) {
  if (s < 1 / 16) { L.vqueue = []; return; }
  var regs = visibleRegions(L, s), v = state.view, K = 96, want = [], built = 0;
  var canGen = s >= (OV_MIN[state.level] || 1 / 4);
  var vx0 = -ox / s, vy0 = -oy / s, vx1 = (W - ox) / s, vy1 = (H - oy) / s;
  ctx.imageSmoothingEnabled = false; ctx.globalAlpha = alpha;
  for (var r = 0; r < regs.length; r++) {
    var R = regs[r], i, p;
    if (canGen && R.have < R.ov.length) for (i = 0; i < R.ov.length; i++) {   // queue the nearest missing drawings
      p = R.ov[i];
      if (p.x > vx1 || p.y > vy1 || p.x + p.w < vx0 || p.y + p.h < vy0) continue;
      if (L.villages.has(p._vk) || L.pending.has(p._vk) || removedBySpawn(L, p)) continue;
      var d = Math.abs(p.x - v.cx) + Math.abs(p.y - v.cy);
      if (want.length >= K && d >= want[K - 1].d) continue;
      var job = { type: 'village', key: p._vk, level: R.level, id: p.id || STRUCT_ID[p.type], rt: p.rt || 0, px: p.rx != null ? p.rx : Math.floor(p.x / 1024), py: p.ry != null ? p.ry : Math.floor(p.y / 1024), x: p.x, y: p.y, d: d, rk: R.key };
      var j = want.length; if (j >= K) { want.pop(); j--; }
      while (j > 0 && want[j - 1].d > d) j--;
      want.splice(j, 0, job);
    }
    if (!R.ov.length || !R.have) continue;
    if (s < COMP_BELOW) {
      if ((!R.comp || (!R.ordered && R.have >= R.ov.length)) && built < 3) { buildComposite(L, R); built++; }
      if (!R.comp) continue;
      var cx0 = Math.round(ox + (R.rx * 1024 - COMP_PAD) * s), cy0 = Math.round(oy + (R.ry * 1024 - COMP_PAD) * s), sz = Math.round(COMP_N * 2 * s);
      ctx.drawImage(R.comp, cx0, cy0, sz, sz);
      continue;
    }
    for (i = 0; i < R.ov.length; i++) {
      p = R.ov[i];
      if (p.x > vx1 + 64 || p.y > vy1 + 64 || p.x + p.w < vx0 - 64 || p.y + p.h < vy0 - 64) continue;
      var vg = L.villages.get(p._vk);
      if (!vg || !vg.n || removedBySpawn(L, p)) continue;
      if (!vg.canvas) villageCanvas(vg);
      var x0 = Math.round(ox + vg.x0 * s), y0 = Math.round(oy + vg.y0 * s);
      ctx.drawImage(vg.canvas, x0, y0, Math.round(ox + (vg.x0 + vg.n) * s) - x0, Math.round(oy + (vg.y0 + vg.n) * s) - y0);
    }
  }
  ctx.globalAlpha = 1;
  want.forEach(function (j) { L.vrk.set(j.key, j.rk); });
  L.vqueue = want;
  pumpSeed(L);   // the queues were just refilled after this frame's pump: start idle workers now, not on the next input
  if (built >= 3) requestDraw();
  evictOverlays(L);
}
function villageCanvas(vg) {
  var n = vg.n, c = document.createElement('canvas'); c.width = c.height = n;
  var cx = c.getContext('2d'), img = cx.createImageData(n, n), d = img.data, TN = GEN_VILLAGE.tiles, ON = GEN_VILLAGE.objects;
  for (var k = 0; k < n * n; k++) {
    var t = vg.t[k], o = vg.o[k];
    if (t === -2 && o === -2) continue;
    var col = saveColor(t >= 0 ? TN[t] : 'grasstile', o > 0 ? ON[o] : 'air');
    d[k * 4] = col >> 16; d[k * 4 + 1] = (col >> 8) & 255; d[k * 4 + 2] = col & 255; d[k * 4 + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  vg.canvas = c;
}
function drawStructures(L, ox, oy, s, t) {
  if (!state.structures) { if (state.level !== 'surface') L.pqueue = []; return; }
  if (s < 1 / 16) { L.pqueue = []; L.structHint = true; return; }
  L.structHint = false;
  var regs = visibleRegions(L, s);
  if (!$('#panel [data-pane="markers"]').hidden) scheduleStructList();
  ctx.font = '600 12px Inter, system-ui, sans-serif';
  var TIER_ICON = [1 / 16, 1, 2], TIER_BOX = [0.5, 2, 3], TIER_LABEL = [0.25, 2, 4], taken = [];
  for (var tier = 0; tier < 3 && s >= TIER_ICON[tier]; tier++) for (var r = 0; r < regs.length; r++) {
    var list = regs[r].tiers[tier];
    for (var i = 0; i < list.length; i++) {
      var p = list[i], x0 = ox + p.x * s, y0 = oy + p.y * s, cx = ox + (p.x + p.w / 2) * s, cy = oy + (p.y + p.h / 2) * s;
      if (cx < -60 || cy < -60 || cx > W + 60 || cy > H + 60) continue;
      if (removedBySpawn(L, p)) continue;
      var minor = tier > 0;
      if (s >= TIER_BOX[tier]) {
        ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5; ctx.strokeStyle = STRUCT[p.type].color; ctx.globalAlpha = .85;
        ctx.strokeRect(Math.round(x0) + .5, Math.round(y0) + .5, p.w * s, p.h * s); ctx.setLineDash([]); ctx.globalAlpha = 1;
      }
      drawStructIcon(p.type, cx, cy, t, minor);
      if (s >= TIER_LABEL[tier]) {
        var lx = cx + (minor ? 13 : s >= 0.5 ? 18 : 14), lw = ctx.measureText(STRUCT[p.type].name).width, hit = false;
        for (var k = 0; k < taken.length; k++) { var q = taken[k]; if (lx < q[0] + q[2] && lx + lw > q[0] && cy - 8 < q[1] + 14 && cy + 6 > q[1]) { hit = true; break; } }
        if (hit) continue;
        taken.push([lx, cy - 8, lw, 14]);
        ctx.lineWidth = 3; ctx.strokeStyle = t.bg; ctx.strokeText(STRUCT[p.type].name, lx, cy + 4);
        ctx.fillStyle = t.fg; ctx.fillText(STRUCT[p.type].name, lx, cy + 4);
      }
    }
  }
  pumpSeed(L);
}
var structTimer = 0;
function scheduleStructList() { clearTimeout(structTimer); structTimer = setTimeout(renderStructList, 250); }
function renderStructList() {
  var box = $('#structList'), L = seedLayer();
  if (!box) return;
  box.textContent = '';
  if (!L) { box.innerHTML = '<li class="empty">Open a world save or type a seed to find villages and dungeons.</li>'; return; }
  var v = state.view, all = [];
  L.pidx.forEach(function (R) { if (R.level !== state.level) return; [R.tiers[0], R.tiers[1]].forEach(function (l) { l.forEach(function (p) { if (!removedBySpawn(L, p)) all.push(p); }); }); });
  (state.ladders[state.level] || []).forEach(function (q) { all.push({ type: q.type, ladder: true, x: q.x, y: q.y, w: 1, h: 1 }); });
  all.forEach(function (p) { var dx = p.x + p.w / 2 - v.cx, dy = p.y + p.h / 2 - v.cy; p._d = Math.sqrt(dx * dx + dy * dy); });
  all.sort(function (a, b) { return a._d - b._d; });
  if (!all.length) { box.innerHTML = '<li class="empty">Pan or zoom the map; structures appear as their areas are worked out.</li>'; return; }
  all.slice(0, 15).forEach(function (p) {
    var li = document.createElement('li'); li.className = 'mk';
    var nm = document.createElement('div'); nm.style.display = 'flex'; nm.style.alignItems = 'center'; nm.style.gap = '8px';
    var dot = document.createElement('img'); dot.src = p.ladder ? LADDER_ICONS[p.type] : GAME_ICONS[p.type]; dot.alt = ''; dot.width = 20; dot.height = 20; dot.style.cssText = 'flex:none;image-rendering:pixelated';
    nm.appendChild(dot); nm.appendChild(document.createTextNode(p.ladder ? LADDER_NAME[p.type] : STRUCT[p.type].name));
    var go = document.createElement('button'); go.className = 'mini-btn'; go.type = 'button'; go.textContent = 'Go';
    var cx = Math.floor(p.x + p.w / 2), cy = Math.floor(p.y + p.h / 2);
    go.addEventListener('click', function () { goTo(cx, cy, 2); state.ping = { x: cx, y: cy, t: performance.now() }; requestDraw(); scheduleStructList(); });
    var meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = 'x ' + cx + ', y ' + cy + ' · ' + fmt(Math.round(p._d)) + ' tiles from view center';
    li.appendChild(nm); li.appendChild(go); li.appendChild(document.createElement('span')); li.appendChild(meta);
    box.appendChild(li);
  });
}
$('#structRefresh').addEventListener('click', renderStructList);
$('#structChk').addEventListener('change', function (e) { state.structures = e.target.checked; requestDraw(); });
function dirtySeed() { var L = seedLayer(); if (L) L.tiles.forEach(function (t) { t.dirty = true; }); }
function loadSeed(text, home, quiet) {
  text = String(text || '').trim();
  if (!text) { toast('Open your world save (.zip) to see its map.'); return; }
  var L = makeSeedLayer(text, home);
  showSeed(text);
  setLayer(L.name, true);
  if (!quiet) toast('Generating ' + L.name + ' in your browser: biomes, water and beaches.');
}
function showSeed(text) { $('#seedShow').textContent = text; $('#seedTag').hidden = !text; }


/* ---------- view control ---------- */
function clampScale(s) { return Math.max(1 / 32, Math.min(80, s)); }
function exploredBounds() {
  var set = state.savedChunks && state.savedChunks[state.level];
  if (!set || !set.size) return null;
  var xs = [], ys = [];
  set.forEach(function (k) { var i = k.indexOf(','); xs.push(+k.slice(0, i)); ys.push(+k.slice(i + 1)); });
  xs.sort(function (a, b) { return a - b; }); ys.sort(function (a, b) { return a - b; });
  var lo = Math.floor((xs.length - 1) * 0.04), hi = Math.ceil((xs.length - 1) * 0.96);
  return { x0: xs[lo] * 16, x1: (xs[hi] + 1) * 16, y0: ys[lo] * 16, y1: (ys[hi] + 1) * 16 };
}
function fit() {
  var L = cur(); if (!L) return;
  if (L.kind === 'seed') { state.view.cx = L.home.x + .5; state.view.cy = L.home.y + .5; state.view.s = 1; updateZoom(); requestDraw(); return; }
  if (!L.regions.size) return;
  var b = exploredBounds() || boundsOf(L);
  state.view.s = clampScale(Math.min(W / ((b.x1 - b.x0) * 1.04), H / ((b.y1 - b.y0) * 1.04)));
  state.view.cx = (b.x0 + b.x1) / 2; state.view.cy = (b.y0 + b.y1) / 2;
  updateZoom(); requestDraw();
}
function zoomAt(sx, sy, f) {
  var v = state.view, tx = (sx - W / 2) / v.s + v.cx, ty = (sy - H / 2) / v.s + v.cy;
  v.s = clampScale(v.s * f);
  v.cx = tx - (sx - W / 2) / v.s; v.cy = ty - (sy - H / 2) / v.s;
  updateZoom(); requestDraw();
}
function updateZoom() {}
function goTo(x, y, minScale) {
  state.view.cx = x + .5; state.view.cy = y + .5;
  state.view.s = clampScale(Math.max(state.view.s, minScale || 10));
  updateZoom(); requestDraw();
}
function resize() {
  var r = stage.getBoundingClientRect();
  dpr = window.devicePixelRatio || 1; W = r.width; H = r.height;
  cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
  requestDraw();
}
function tileAt(sx, sy) {
  var v = state.view;
  return { x: Math.floor((sx - W / 2) / v.s + v.cx), y: Math.floor((sy - H / 2) / v.s + v.cy) };
}

/* ---------- pointer input ---------- */
var ptrs = new Map(), drag = null, pinch = null;
function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
cv.addEventListener('pointerdown', function (e) {
  cv.setPointerCapture(e.pointerId);
  var p = pos(e); ptrs.set(e.pointerId, p);
  drag = { moved: 0, last: p, multi: ptrs.size > 1 };
  if (ptrs.size > 1) drag.multi = true;
  pinch = null;
});
cv.addEventListener('pointermove', function (e) {
  var p = pos(e);
  if (!ptrs.has(e.pointerId)) { setHover(p); return; }
  ptrs.set(e.pointerId, p);
  if (ptrs.size === 1 && drag) {
    var dx = p.x - drag.last.x, dy = p.y - drag.last.y;
    drag.moved += Math.abs(dx) + Math.abs(dy); drag.last = p;
    state.view.cx -= dx / state.view.s; state.view.cy -= dy / state.view.s;
    setHover(p); requestDraw();
  } else if (ptrs.size === 2) {
    var a = Array.from(ptrs.values()), q = { d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2 };
    if (pinch && pinch.d > 0) {
      zoomAt(q.mx, q.my, q.d / pinch.d);
      state.view.cx -= (q.mx - pinch.mx) / state.view.s; state.view.cy -= (q.my - pinch.my) / state.view.s;
    }
    pinch = q; if (drag) drag.multi = true; requestDraw();
  }
});
function endPtr(e) {
  var p = pos(e), had = ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  if (had && ptrs.size === 0 && drag && !drag.multi && drag.moved < 5 && e.type === 'pointerup') {
    if (state.arm) { var t = tileAt(p.x, p.y); addMarker(t.x, t.y); setArm(false); }
    else { var ch = chestAt(p.x, p.y), ld = ch ? null : ladderAt(p.x, p.y); if (ld) followLadder(ld); else openChest(ch); }
  }
  if (ptrs.size === 0) drag = null;
}
cv.addEventListener('pointerup', endPtr);
cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('pointerleave', function () { if (!ptrs.size) { state.hover = null; updateStatus(null); requestDraw(); } });
cv.addEventListener('wheel', function (e) {
  e.preventDefault();
  var p = pos(e), unit = e.deltaMode === 1 ? 16 : 1;
  zoomAt(p.x, p.y, Math.exp(-e.deltaY * unit * .0016));
}, { passive: false });

cv.addEventListener('keydown', function (e) {
  var step = 60 / state.view.s, v = state.view, k = e.key, used = true;
  if (k === 'ArrowLeft') v.cx -= step; else if (k === 'ArrowRight') v.cx += step;
  else if (k === 'ArrowUp') v.cy -= step; else if (k === 'ArrowDown') v.cy += step;
  else if (k === '+' || k === '=') zoomAt(W / 2, H / 2, 1.3); else if (k === '-') zoomAt(W / 2, H / 2, 1 / 1.3);
  else if (k === '0') fit(); else used = false;
  if (used) { e.preventDefault(); requestDraw(); }
});
function setHover(p) {
  var L = cur(); if (!L) return;
  var t = tileAt(p.x, p.y); state.hover = t; updateStatus(t); requestDraw();
}
mini.addEventListener('pointerdown', function (e) {
  mini.setPointerCapture(e.pointerId); miniJump(e);
  var mv = function (ev) { miniJump(ev); };
  mini.addEventListener('pointermove', mv);
  var up = function () { mini.removeEventListener('pointermove', mv); mini.removeEventListener('pointerup', up); mini.removeEventListener('pointercancel', up); };
  mini.addEventListener('pointerup', up); mini.addEventListener('pointercancel', up);
});
function miniJump(e) {
  var g = miniGeom(); if (!g) return;
  var r = mini.getBoundingClientRect();
  state.view.cx = (e.clientX - r.left - g.ox) / g.sc + g.b.x0; state.view.cy = (e.clientY - r.top - g.oy) / g.sc + g.b.y0;
  requestDraw();
}

/* ---------- placed object search ---------- */
// state.objFind = { ids: Set of tile/object string IDs, tok: number }; matches are cached per region and per structure drawing
var objTok = 0, objTimer = 0;
function objGroups(q) {
  // every display name containing the query, with the IDs that carry it (several pieces or growth stages share one name)
  var g = new Map();
  [['objects', 'object'], ['tiles', 'tile']].forEach(function (k) {
    var tab = TILE_NAMES[k[0]];
    for (var id in tab) {
      if (id === 'air') continue;
      var n = tab[id], key = k[1] + ':' + n;
      if (n.toLowerCase().indexOf(q) < 0 && id.indexOf(q.replace(/\s+/g, '')) < 0) continue;
      var e = g.get(key); if (!e) g.set(key, e = { name: n, kind: k[1], ids: [] }); e.ids.push(id);
    }
  });
  return Array.from(g.values());
}
function objIxSet(ids) { var s = new Set(); ids.forEach(function (id) { if (NAME_IX[id] !== undefined) s.add(NAME_IX[id]); }); return s; }
// explored tiles of a save region that match: a flat list of tile indices, worked out once per search
function regMatches(reg) {
  var f = state.objFind;
  if (reg.objTok === f.tok) return reg.objHits;
  var hits = [];
  if (reg.ti) {
    var ix = f.ix || (f.ix = objIxSet(f.ids)), oi = reg.oi, ti = reg.ti;
    for (var i = 0; i < 65536; i++) if (ix.has(oi[i]) || ix.has(ti[i])) hits.push(i);
  }
  reg.objTok = f.tok; reg.objHits = hits;
  return hits;
}
function vgMatches(vg) {
  var f = state.objFind;
  if (vg.objTok === f.tok) return vg.objHits;
  var hits = [], TN = GEN_VILLAGE.tiles, ON = GEN_VILLAGE.objects, n = vg.n * vg.n;
  for (var i = 0; i < n; i++) { var o = vg.o[i], t = vg.t[i]; if ((o > 0 && f.ids.has(ON[o])) || (t >= 0 && f.ids.has(TN[t]))) hits.push(i); }
  vg.objTok = f.tok; vg.objHits = hits;
  return hits;
}
// whether a structure drawn from the seed covers this tile (structures are built over the natural ground)
function overlaid(SL, lv, x, y) {
  if (!SL.pidx) return false;
  var rx = Math.floor(x / 1024), ry = Math.floor(y / 1024);
  for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
    var R = SL.pidx.get(presetKey(lv, rx + dx, ry + dy)); if (!R) continue;
    for (var i = 0; i < R.ov.length; i++) {
      var q = R.ov[i]; if (x < q.x - 48 || y < q.y - 48 || x > q.x + q.w + 48 || y > q.y + q.h + 48) continue;
      var vg = SL.villages.get(q._vk); if (!vg || !vg.n) continue;
      var lx = x - vg.x0, ly = y - vg.y0; if (lx < 0 || ly < 0 || lx >= vg.n || ly >= vg.n) continue;
      var k = ly * vg.n + lx; if (vg.t[k] >= 0 || vg.o[k] >= 0) return true;
    }
  }
  return false;
}
function dbMatches(t, SL, x0, y0) {
  var f = state.objFind;
  if (t.objTok === f.tok && t.objVer === SL.villages.size) return t.objHits;
  var hits = [], TN = GEN_VILLAGE.tiles, ON = GEN_VILLAGE.objects, ti = new Uint8Array(TN.length), oi = new Uint8Array(ON.length);
  TN.forEach(function (n, i) { if (f.ids.has(n)) ti[i] = 1; }); ON.forEach(function (n, i) { if (i && f.ids.has(n)) oi[i] = 1; });
  for (var i = 0; i < 65536; i++) if ((oi[t.do[i]] || ti[t.dt[i]]) && !overlaid(SL, t.level, x0 + (i & 255), y0 + (i >> 8))) hits.push(i);
  t.objTok = f.tok; t.objVer = SL.villages.size; t.objHits = hits;
  return hits;
}
function drawObjFind(L, SL, ox, oy, s) {
  var sz = Math.max(s, 3), off = (sz - s) / 2, lv = state.level;
  ctx.globalAlpha = 1;
  // zoomed out a match is a bright dot; close up it keeps its own colour inside a bright outline
  var HL = '#ffd84a', close = s >= 4;
  function mark(x, y, c) {
    var px = ox + x * s - off, py = oy + y * s - off;
    if (px < -sz || py < -sz || px > W || py > H) return;
    var X = Math.round(px), Y = Math.round(py), Z = Math.ceil(sz);
    if (!close) { ctx.fillStyle = HL; ctx.fillRect(X, Y, Z, Z); return; }
    ctx.fillStyle = HL; ctx.fillRect(X - 1, Y - 1, Z + 2, Z + 2);
    ctx.fillStyle = c; ctx.fillRect(X + 1, Y + 1, Z - 2, Z - 2);
  }
  if (L.kind !== 'seed') L.regions.forEach(function (reg) {
    var x0 = reg.rx * reg.w, y0 = reg.ry * reg.h;
    if (ox + (x0 + reg.w) * s < 0 || oy + (y0 + reg.h) * s < 0 || ox + x0 * s > W || oy + y0 * s > H) return;
    var hits = regMatches(reg), d = reg.rgb;
    for (var i = 0; i < hits.length; i++) { var k = hits[i]; mark(x0 + (k & 255), y0 + (k >> 8), 'rgb(' + d[k * 3] + ',' + d[k * 3 + 1] + ',' + d[k * 3 + 2] + ')'); }
  });
  if (SL) SL.tiles.forEach(function (t, key) {
    if (!t.dt || t.level !== lv) return;
    var m = /:(-?\d+),(-?\d+),1$/.exec(key); if (!m) return;
    var x0 = +m[1] * 256, y0 = +m[2] * 256;
    if (ox + (x0 + 256) * s < 0 || oy + (y0 + 256) * s < 0 || ox + x0 * s > W || oy + y0 * s > H) return;
    var hits = dbMatches(t, SL, x0, y0), TN = GEN_VILLAGE.tiles, ON = GEN_VILLAGE.objects, saved = L.kind !== 'seed' && state.savedChunks[lv];
    for (var j = 0; j < hits.length; j++) {
      var k = hits[j], x = x0 + (k & 255), y = y0 + (k >> 8);
      if (saved && saved.has(Math.floor(x / 16) + ',' + Math.floor(y / 16))) continue;
      mark(x, y, hex(saveColor(TN[t.dt[k]], t.do[k] ? ON[t.do[k]] : 'air')));
    }
  });
  if (SL && s >= 1 / 16 && SL.pidx) visibleRegions(SL, s).forEach(function (R) {
    for (var i = 0; i < R.ov.length; i++) {
      var vg = SL.villages.get(R.ov[i]._vk); if (!vg || !vg.n) continue;
      if (ox + (vg.x0 + vg.n) * s < 0 || oy + (vg.y0 + vg.n) * s < 0 || ox + vg.x0 * s > W || oy + vg.y0 * s > H) continue;
      var hits = vgMatches(vg), TN = GEN_VILLAGE.tiles, ON = GEN_VILLAGE.objects;
      for (var j = 0; j < hits.length; j++) {
        var k = hits[j], lx = k % vg.n, ly = (k / vg.n) | 0, x = vg.x0 + lx, y = vg.y0 + ly;
        if (L.kind !== 'seed' && state.savedChunks[lv] && state.savedChunks[lv].has(Math.floor(x / 16) + ',' + Math.floor(y / 16))) continue;   // explored: the save says what is there
        var o = vg.o[k], t = vg.t[k];
        mark(x, y, hex(saveColor(t >= 0 ? TN[t] : 'grasstile', o > 0 ? ON[o] : 'air')));
      }
    }
  });
}
function setObjFind(ids) {
  if (!ids || !ids.length) state.objFind = null;
  else state.objFind = { ids: new Set(ids), tok: ++objTok };
  $('#objClear').hidden = !state.objFind;
  requestDraw();
}
// the explored tiles on this layer holding any of these IDs: how many, and the nearest to the view
function objCount(ids) {
  var ix = objIxSet(ids), L = cur(), n = 0, best = null, v = state.view;
  if (!L || L.kind === 'seed' || !ix.size) return { n: 0 };
  L.regions.forEach(function (reg) {
    if (!reg.ti) return;
    var oi = reg.oi, ti = reg.ti, x0 = reg.rx * reg.w, y0 = reg.ry * reg.h;
    for (var i = 0; i < 65536; i++) if (ix.has(oi[i]) || ix.has(ti[i])) {
      n++; var x = x0 + (i & 255), y = y0 + (i >> 8), d = Math.abs(x - v.cx) + Math.abs(y - v.cy);
      if (!best || d < best.d) best = { x: x, y: y, d: d };
    }
  });
  return { n: n, best: best };
}
function runObjSearch() {
  var q = ($('#objQ').value || '').trim().toLowerCase(), res = $('#objRes'), sum = $('#objSum');
  res.textContent = '';
  if (!q) { sum.textContent = ''; sum.hidden = true; state.objSel = null; setObjFind(null); res.innerHTML = '<li class="empty">Type the name of anything placed in the world, for example \u201cblueberry bush\u201d, then pick it from the list to light it up on the map.</li>'; return; }
  // typing only filters names; the map is searched once a name is picked
  var groups = objGroups(q), ORES = TILE_NAMES.ores || {}, parents = new Map();
  // ore rocks gather under one entry per ore ("Iron Ore"), which covers every rock that ore is found in
  groups = groups.filter(function (g) {
    var ore = g.kind === 'object' && ORES[g.ids[0]]; if (!ore) return true;
    var P = parents.get(ore[0]);
    if (!P) {
      P = { name: ore[0], kind: 'ore', icon: ore[1], ids: [], kids: [] };
      for (var id in ORES) if (ORES[id][0] === ore[0]) P.ids.push(id);
      parents.set(ore[0], P);
    }
    P.kids.push(g); return false;
  });
  // an ore's own name (e.g. "iron") also brings up its entry
  for (var id in ORES) {
    var on = ORES[id][0];
    if (!parents.has(on) && on.toLowerCase().indexOf(q) >= 0) {
      var P2 = { name: on, kind: 'ore', icon: ORES[id][1], ids: [], kids: [] };
      for (var id2 in ORES) if (ORES[id2][0] === on) P2.ids.push(id2);
      parents.set(on, P2);
    }
  }
  var top = groups.concat(Array.from(parents.values())), lq = q;
  function rank(g) { var n = g.name.toLowerCase(); return n === lq ? 0 : n.indexOf(lq) === 0 ? 1 : 2; }
  top.sort(function (a, b) { return rank(a) - rank(b) || (b.kind === 'ore') - (a.kind === 'ore') || a.name.localeCompare(b.name); });
  var flat = [];
  top.forEach(function (g) { g.depth = 0; flat.push(g); if (g.kids) { g.kids.sort(function (a, b) { return a.name.localeCompare(b.name); }); g.kids.forEach(function (k) { k.depth = 1; flat.push(k); }); } });
  flat.forEach(function (g) { g.key = g.kind + ':' + g.name; });
  var sel = state.objSel && flat.filter(function (g) { return g.key === state.objSel; })[0];
  if (!sel) state.objSel = null;
  if (sel) { sel.count = objCount(sel.ids); setObjFind(sel.ids); } else setObjFind(null);
  sum.textContent = flat.length ? '' : 'Nothing is called \u201c' + q + '\u201d.'; sum.hidden = !!flat.length;
  flat.slice(0, 150).forEach(function (g) {
    var li = document.createElement('li'), ic = document.createElement('span'), nm = document.createElement('span'), ct = document.createElement('span');
    li.className = (g === sel ? 'on' : '') + (g.depth ? ' kid' : '') + (g.kind === 'ore' ? ' ore' : '');
    ic.className = 'ic'; chestIcon(g.kind === 'ore' ? g.icon : g.ids[0], ic, 20);
    nm.className = 'cn'; nm.textContent = g.name + (g.kind === 'tile' ? ' (ground)' : '');
    ct.className = 'meta'; ct.style.gridColumn = 'auto'; ct.textContent = g === sel ? fmt(g.count.n) : '';
    li.appendChild(ic); li.appendChild(nm); li.appendChild(ct);
    li.addEventListener('click', function () {
      state.objSel = state.objSel === g.key ? null : g.key;
      runObjSearch();
      var now = state.objSel && flat.filter(function (x) { return x.key === state.objSel; })[0];
      if (now && now.count && now.count.best) goTo(now.count.best.x, now.count.best.y, Math.max(state.view.s, 2));
    });
    res.appendChild(li);
  });
  var groups = flat;
  $('#objNav').hidden = !state.objFind;
  if (!state.objFind || objNav.tok !== state.objFind.tok) { objNavReset(); $('#objPos').textContent = state.objFind ? 'Step through the matches' : ''; }
  savePrefs();
  if (groups.length > 150) { var li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Showing 150 names. Type more to narrow it down.'; res.appendChild(li); }
}
$('#objQ').addEventListener('input', function () { clearTimeout(objTimer); state.objSel = null; objTimer = setTimeout(runObjSearch, 250); });
$('#objClear').addEventListener('click', function () { $('#objQ').value = ''; state.objSel = null; runObjSearch(); });
document.querySelector('.tab[data-tab="objects"]').addEventListener('click', runObjSearch);

/* ---------- stepping through search matches ---------- */
// Matches close together (tiles within a few steps, such as one ore vein or a patch of bushes) count as one place.
// Next goes to the nearest place not visited yet, Previous back along the places visited.
var objNav = { tok: -1, hist: [], at: -1, seen: new Set() };
function objPoints() {
  var f = state.objFind, L = cur(), lv = state.level, SL = seedLayer(), seen = new Set(), pts = [];
  if (!f || !L) return pts;
  function add(x, y) { var k = x + ',' + y; if (!seen.has(k)) { seen.add(k); pts.push([x, y]); } }
  if (L.kind !== 'seed') L.regions.forEach(function (reg) { var x0 = reg.rx * reg.w, y0 = reg.ry * reg.h; regMatches(reg).forEach(function (k) { add(x0 + (k & 255), y0 + (k >> 8)); }); });
  if (!SL || !(L.kind === 'seed' || state.fill)) return pts;
  var saved = L.kind !== 'seed' && state.savedChunks[lv];
  function fresh(x, y) { return !(saved && saved.has(Math.floor(x / 16) + ',' + Math.floor(y / 16))); }
  SL.tiles.forEach(function (t, key) {
    if (!t.dt || t.level !== lv) return;
    var m = /:(-?\d+),(-?\d+),1$/.exec(key); if (!m) return;
    var x0 = +m[1] * 256, y0 = +m[2] * 256;
    dbMatches(t, SL, x0, y0).forEach(function (k) { var x = x0 + (k & 255), y = y0 + (k >> 8); if (fresh(x, y)) add(x, y); });
  });
  if (SL.pidx) SL.pidx.forEach(function (R) {
    if (R.level !== lv) return;
    R.ov.forEach(function (q) {
      var vg = SL.villages.get(q._vk); if (!vg || !vg.n) return;
      vgMatches(vg).forEach(function (k) { var x = vg.x0 + k % vg.n, y = vg.y0 + ((k / vg.n) | 0); if (fresh(x, y)) add(x, y); });
    });
  });
  return pts;
}
function objPlaces() {
  var cells = new Map(), out = [];
  objPoints().forEach(function (p) { var k = Math.floor(p[0] / 8) + ',' + Math.floor(p[1] / 8), c = cells.get(k); if (!c) cells.set(k, c = []); c.push(p); });
  var done = new Set();
  cells.forEach(function (_, start) {
    if (done.has(start)) return;
    var stack = [start], keys = [], pts = []; done.add(start);
    while (stack.length) {
      var k = stack.pop(), c = k.split(','), cx = +c[0], cy = +c[1]; keys.push(k); pts = pts.concat(cells.get(k));
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var n = (cx + dx) + ',' + (cy + dy); if (cells.has(n) && !done.has(n)) { done.add(n); stack.push(n); } }
    }
    var mx = 0, my = 0; pts.forEach(function (p) { mx += p[0]; my += p[1]; }); mx /= pts.length; my /= pts.length;
    var best = pts[0], bd = Infinity;
    pts.forEach(function (p) { var d = (p[0] - mx) * (p[0] - mx) + (p[1] - my) * (p[1] - my); if (d < bd) { bd = d; best = p; } });
    out.push({ x: best[0], y: best[1], keys: keys, n: pts.length });
  });
  return out;
}
function objNavReset() { objNav = { tok: state.objFind ? state.objFind.tok : -1, hist: [], at: -1, seen: new Set() }; }
function objNavShow(p, total) {
  goTo(p.x, p.y, Math.max(state.view.s, 4));
  // on a phone the panel covers the lower part of the map: centre the match in the part still showing
  var pn = $('#panel');
  if (window.matchMedia('(max-width: 780px)').matches && pn.classList.contains('open')) { state.view.cy += pn.getBoundingClientRect().height / 2 / state.view.s; requestDraw(); }
  state.ping = { x: p.x, y: p.y, t: performance.now() }; requestDraw();
  $('#objPos').textContent = (objNav.at + 1) + ' of ' + fmt(total) + (total === 1 ? ' place' : ' places');
  $('#objPos').title = fmt(p.n) + (p.n === 1 ? ' matching tile' : ' matching tiles') + ' here, at x ' + p.x + ', y ' + p.y;
}
function objStep(dir) {
  if (!state.objFind) return;
  if (objNav.tok !== state.objFind.tok) objNavReset();
  var places = objPlaces();
  if (!places.length) { $('#objPos').textContent = 'No matches here yet'; return; }
  if (dir < 0) {
    if (objNav.at <= 0) return;
    objNav.at--; objNavShow(objNav.hist[objNav.at], places.length); return;
  }
  if (objNav.at < objNav.hist.length - 1) { objNav.at++; objNavShow(objNav.hist[objNav.at], places.length); return; }
  var v = state.view, best = null, bd = Infinity;
  places.forEach(function (p) {
    if (p.keys.some(function (k) { return objNav.seen.has(k); })) return;
    var d = (p.x - v.cx) * (p.x - v.cx) + (p.y - v.cy) * (p.y - v.cy); if (d < bd) { bd = d; best = p; }
  });
  if (!best) { $('#objPos').textContent = 'Visited all ' + fmt(places.length) + (places.length === 1 ? ' place' : ' places'); return; }
  best.keys.forEach(function (k) { objNav.seen.add(k); });
  objNav.hist.push(best); objNav.at = objNav.hist.length - 1;
  objNavShow(best, places.length);
}
$('#objNext').addEventListener('click', function () { objStep(1); });
$('#objPrev').addEventListener('click', function () { objStep(-1); });

/* ---------- status ---------- */
var SURFACE_TILES = ['watertile', 'watertile', 'grasstile', 'plainsgrasstile', 'sandtile', 'swampgrasstile', 'snowtile', 'icetile'];
function tileName(id) { return TILE_NAMES.tiles[id] || TILE_NAMES.objects[id] || itemName(id); }
function objectName(id) { return TILE_NAMES.objects[id] || itemName(id); }
// what is at a tile: the save where it has been explored, otherwise the structures and terrain made from the seed
function tileInfo(L, x, y) {
  var lv = state.level;
  if (L.kind !== 'seed') {
    var reg = L.regions.get(Math.floor(x / L.rw) + 'x' + Math.floor(y / L.rh));
    if (reg && reg.ti && state.savedChunks[lv] && state.savedChunks[lv].has(Math.floor(x / 16) + ',' + Math.floor(y / 16))) {
      var k = (y - reg.ry * reg.h) * reg.w + (x - reg.rx * reg.w);
      var sv = { tile: NAME_LIST[reg.ti[k]], obj: NAME_LIST[reg.oi[k]], from: 'save' }, SLb = seedLayer();
      if (SLb && lv === 'surface') { var stb = SLb.probe || (SLb.probe = new NecesseGen.BiomeStack(SLb.seedInt)), bb = GEN_C.surface.biomes[stb.getExpensiveBiomeID(x, y)]; if (bb) sv.biome = bb.name; }
      return sv;
    }
  }
  var SL = L.kind === 'seed' ? L : (state.fill ? seedLayer() : null);
  if (!SL) return null;
  var st = SL.probe || (SL.probe = new NecesseGen.BiomeStack(SL.seedInt)), out = { tile: null, obj: null, from: 'seed' };
  // structures drawn here: the last one listed is on top
  var TN = GEN_VILLAGE.tiles, ON = GEN_VILLAGE.objects, rx = Math.floor(x / 1024), ry = Math.floor(y / 1024);
  if (SL.pidx) for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
    var R = SL.pidx.get(presetKey(lv, rx + dx, ry + dy)); if (!R) continue;
    for (var i = 0; i < R.ov.length; i++) {
      var q = R.ov[i]; if (x < q.x - 48 || y < q.y - 48 || x > q.x + q.w + 48 || y > q.y + q.h + 48) continue;   // drawings reach a little past their area
      var vg = SL.villages.get(q._vk); if (!vg || !vg.n) continue;
      var lx = x - vg.x0, ly = y - vg.y0; if (lx < 0 || ly < 0 || lx >= vg.n || ly >= vg.n) continue;
      var t = vg.t[ly * vg.n + lx], o = vg.o[ly * vg.n + lx];
      if (t >= 0) out.tile = TN[t]; if (o >= 0) out.obj = o > 0 ? ON[o] : 'air';
      if (t >= 0 || o >= 0) out.struct = R.ov[i];
    }
  }
  var DB = SL.tiles.get(lv + ':' + Math.floor(x / 256) + ',' + Math.floor(y / 256) + ',1');
  if (DB && DB.dt) {
    var dk = (y - Math.floor(y / 256) * 256) * 256 + (x - Math.floor(x / 256) * 256);
    if (!out.tile) out.tile = TN[DB.dt[dk]];
    if (out.obj === null) out.obj = DB.do[dk] ? ON[DB.do[dk]] : 'air';
  }
  if (lv === 'surface') {
    if (!out.tile) out.tile = SURFACE_TILES[st.levelIndex(x, y, 'surface', 1)] || 'grasstile';
    var b = GEN_C.surface.biomes[st.getExpensiveBiomeID(x, y)]; if (b) out.biome = b.name;
  } else if (!out.tile || out.obj === null) {
    var to = st.caveTileObject(x, y, lv === 'deepcave', 1);
    if (!out.tile) out.tile = (GEN_C.caveTiles[to[0]] || [])[0];
    if (out.obj === null) out.obj = to[1] ? (GEN_C.caveObjects[to[1]] || [])[0] : 'air';
  }
  return out;
}
function describeTile(info) {
  var tn = info.tile ? tileName(info.tile) : '', on = info.obj && info.obj !== 'air' ? objectName(info.obj) : '';
  return on && tn ? on + ' on ' + tn + (on === tn ? ' ground' : '') : on || tn || 'Unknown';   // the game calls both the cave floor and its rock "Rock"
}
function updateStatus(t) {
  var L = cur(), pos = $('#stPos'), col = $('#stColor'), info = $('#stInfo');
  if (!L) { pos.textContent = 'No map loaded'; col.textContent = ''; info.textContent = ''; return; }
  if (t) {
    pos.innerHTML = 'x <b>' + t.x + '</b>, y <b>' + t.y + '</b>';
    var hit = colorAt(L, t.x, t.y);
    col.textContent = '';
    if (hit) {
      var sw = document.createElement('span'); sw.className = 'sw2'; sw.style.background = hex(hit.c);
      col.appendChild(sw);
      var ti = tileInfo(L, t.x, t.y), biome = (ti && ti.biome) || hit.biome;
      col.appendChild(document.createTextNode((ti ? describeTile(ti) : colorName(hit.c) || 'Unknown') + (biome ? '  \u00b7  ' + titleCase(biome) + ' biome' : '') + (ti && ti.from === 'seed' && L.kind !== 'seed' ? '  \u00b7  not explored yet' : '')));
    } else {
      var ti2 = tileInfo(L, t.x, t.y);
      if (ti2) {
        var sw3 = document.createElement('span'); sw3.className = 'sw2'; sw3.style.background = hex(saveColor(ti2.tile, ti2.obj || 'air')); col.appendChild(sw3);
        col.appendChild(document.createTextNode(describeTile(ti2) + (ti2.biome ? '  \u00b7  ' + titleCase(ti2.biome) + ' biome' : '') + (L.kind !== 'seed' ? '  \u00b7  not explored yet' : '')));
      } else col.textContent = '';
    }
  } else { pos.innerHTML = 'x &ndash;, y &ndash;'; col.textContent = ''; }
  if (L.kind === 'seed') { info.textContent = ''; return; }
  info.textContent = (LEVEL_LABEL[L.name] || L.name) + (L.name === SAMPLE ? ' · built-in sample: your Main world around spawn, generated from its seed' : '');
}
var toastTimer = 0;
function toast(msg, ms) {
  var el = $('#toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(function () { el.hidden = true; }, ms || 3200);
}

/* ---------- palette panel ---------- */
function renderPalette() {
  var ul = $('#palList'); ul.textContent = '';
  var L = cur();
  if (!L) { ul.innerHTML = '<li class="empty">Load a map to see its biomes.</li>'; return; }
  var q = state.search.toLowerCase();
  $('#palNote').textContent = 'Click a swatch to highlight that ground type and dim the rest. Hide removes it from the map. In areas outside your save, trees, grass, ores and small rocks are scattered at typical rates for the look; their exact spots are not the game\u2019s.';
  // known ground colors only; on explored maps, only those that appear in the loaded regions
  var present = L.kind === 'seed' ? null : counts(L);
  var shown = 0;
  PALS[state.level].slice(0, DETAIL[state.level].base).forEach(function (c) {
    if (present && !present.has(c)) return;
    var name = colorName(c);
    if (q && name.toLowerCase().indexOf(q) < 0) return;
    shown++;
    var li = document.createElement('li');
    li.className = 'row' + (state.focus === c ? ' on' : '') + (state.hidden.has(c) ? ' off' : '');
    var sw = document.createElement('button'); sw.className = 'sw'; sw.type = 'button'; sw.style.background = hex(c);
    sw.title = 'Highlight ' + name; sw.setAttribute('aria-label', 'Highlight ' + name); sw.setAttribute('aria-pressed', state.focus === c);
    sw.addEventListener('click', function () { state.focus = state.focus === c ? null : c; dirtyAll(); dirtySeed(); renderPalette(); requestDraw(); });
    var lbl = document.createElement('span'); lbl.className = 'cname'; lbl.textContent = name;
    var eye = document.createElement('button'); eye.className = 'mini-btn'; eye.type = 'button';
    eye.textContent = state.hidden.has(c) ? 'Show' : 'Hide';
    eye.addEventListener('click', function () {
      if (state.hidden.has(c)) state.hidden.delete(c); else state.hidden.add(c);
      dirtyAll(); dirtySeed(); renderPalette(); requestDraw();
    });
    li.appendChild(sw); li.appendChild(lbl); li.appendChild(eye);
    ul.appendChild(li);
  });
  if (!shown) ul.innerHTML = '<li class="empty">No colors match.</li>';
}
function findColor(c) {
  var L = cur(); if (!L) return;
  if (L.kind === 'seed') {
    if (state.found.color !== c) state.found = { color: c, visited: [] };
    var slot = L.workers.filter(function (w) { return !w.busy; })[0] || L.workers[0];
    var id = ++L.findId, target = SEED_PAL.indexOf(c);
    toast('Searching\u2026', 20000);
    L.finds[id] = function (m) {
      if (m.x === null) { toast(state.found.visited.length ? 'No more within 6,000 tiles. Starting again from the nearest.' : 'None within 6,000 tiles of the view.'); state.found.visited = []; return; }
      $('#toast').hidden = true;
      state.found.visited.push([m.x, m.y]); goTo(m.x, m.y, 6);
      state.ping = { x: m.x, y: m.y, t: performance.now() }; requestDraw();
    };
    slot.busy = slot.busy || 'find';
    slot.w.postMessage({ type: 'find', id: id, target: target, cx: Math.round(state.view.cx), cy: Math.round(state.view.cy), visited: state.found.visited });
    return;
  }
  if (state.found.color !== c) state.found = { color: c, visited: [] };
  var v = state.view, best = null, bd = Infinity, vis = state.found.visited;
  L.regions.forEach(function (reg) {
    var d = reg.rgb;
    for (var i = 0, p = 0; i < d.length; i += 3, p++) {
      if (((d[i] << 16) | (d[i+1] << 8) | d[i+2]) !== c) continue;
      var x = reg.rx * reg.w + (p % reg.w), y = reg.ry * reg.h + ((p / reg.w) | 0);
      var dd = (x - v.cx) * (x - v.cx) + (y - v.cy) * (y - v.cy);
      if (dd >= bd) continue;
      var skip = false;
      for (var k = 0; k < vis.length; k++) { if (Math.abs(vis[k][0] - x) < 6 && Math.abs(vis[k][1] - y) < 6) { skip = true; break; } }
      if (!skip) { bd = dd; best = [x, y]; }
    }
  });
  if (!best) {
    if (vis.length) { state.found.visited = []; toast('That was the last one. Starting again from the nearest.'); return findColor(c); }
    toast('No tiles of that color in this layer.'); return;
  }
  vis.push(best); goTo(best[0], best[1], 14);
  state.ping = { x: best[0], y: best[1], t: performance.now() }; requestDraw();
}

/* ---------- markers ---------- */
function saveMarkers() { LS.set('markers', state.markers); }
function addMarker(x, y) {
  var L = cur(); if (!L) return;
  var n = state.markers.filter(function (m) { return m.layer === state.layer; }).length + 1;
  var m = { id: Date.now() + Math.random(), layer: state.layer, x: x, y: y, name: 'Marker ' + n };
  state.markers.push(m); saveMarkers(); renderMarkers(); requestDraw();
  showTab('markers'); var inp = document.querySelector('[data-mk="' + m.id + '"]'); if (inp) { inp.focus(); inp.select(); }
}
function renderMarkers() {
  var ul = $('#mkList'); ul.textContent = '';
  var mine = state.markers.filter(function (m) { return m.layer === state.layer; });
  if (state.spawn && seedLayer()) {
    var sli = document.createElement('li'); sli.className = 'mk';
    var sname = document.createElement('div'); sname.style.fontWeight = '600'; sname.textContent = 'Spawn';
    var sgo = document.createElement('button'); sgo.className = 'mini-btn'; sgo.type = 'button'; sgo.textContent = 'Go';
    sgo.addEventListener('click', function () { goTo(state.spawn.x, state.spawn.y, 6); state.ping = { x: state.spawn.x, y: state.spawn.y, t: performance.now() }; requestDraw(); });
    var smeta = document.createElement('div'); smeta.className = 'meta'; smeta.textContent = 'x ' + state.spawn.x + ', y ' + state.spawn.y + ' · from world save (seed ' + state.spawn.seed + ')';
    sli.appendChild(sname); sli.appendChild(sgo); sli.appendChild(document.createElement('span')); sli.appendChild(smeta); ul.appendChild(sli);
  }
  if (!mine.length && !(state.spawn && seedLayer())) ul.innerHTML = '';
  mine.forEach(function (m) {
    var li = document.createElement('li'); li.className = 'mk';
    var inp = document.createElement('input'); inp.type = 'text'; inp.value = m.name; inp.setAttribute('data-mk', m.id); inp.setAttribute('aria-label', 'Marker name');
    inp.addEventListener('change', function () { m.name = inp.value.trim(); saveMarkers(); requestDraw(); });
    var go = document.createElement('button'); go.className = 'mini-btn'; go.type = 'button'; go.textContent = 'Go';
    go.addEventListener('click', function () { goTo(m.x, m.y, 12); state.ping = { x: m.x, y: m.y, t: performance.now() }; requestDraw(); });
    var del = document.createElement('button'); del.className = 'mini-btn'; del.type = 'button'; del.textContent = 'Delete';
    del.addEventListener('click', function () { state.markers = state.markers.filter(function (k) { return k !== m; }); saveMarkers(); renderMarkers(); requestDraw(); });
    var meta = document.createElement('div'); meta.className = 'meta'; meta.textContent = 'x ' + m.x + ', y ' + m.y;
    li.appendChild(inp); li.appendChild(go); li.appendChild(del); li.appendChild(meta); ul.appendChild(li);
  });

}
/* ---------- files panel ---------- */
function renderFiles() {
  var box = $('#fileList'); if (!box) return; box.textContent = '';
  if (!state.layers.size) { box.innerHTML = '<div class="empty">Nothing loaded.</div>'; return; }
  state.layers.forEach(function (L) {
    if (L.kind === 'seed') {
      var sh = document.createElement('div'); sh.className = 'file';
      sh.innerHTML = '<b></b><span class="meta"></span>'; sh.querySelector('b').textContent = L.name;
      sh.querySelector('.meta').textContent = 'Generated in this browser from the seed (seed number ' + L.seedInt + '). ' + L.done + ' map blocks generated so far.';
      box.appendChild(sh); return;
    }
    var head = document.createElement('div'); head.className = 'file';
    head.innerHTML = '<b></b><span class="meta"></span>';
    head.querySelector('b').textContent = L.name;
    head.querySelector('.meta').textContent = L.regions.size + ' regions: ' + Array.from(L.regions.keys()).slice(0, 40).join(', ') + (L.regions.size > 40 ? ' …' : '');
    box.appendChild(head);
    L.files.forEach(function (f) {
      if (!f.errors.length) return;
      var d = document.createElement('div'); d.className = 'file err'; d.textContent = f.name + ': ' + f.errors.join('; '); box.appendChild(d);
    });
  });
}

/* ---------- loading ---------- */
function renderLayers() {
  var sel = $('#layerSel'); sel.textContent = '';
  LEVELS.forEach(function (l) { var o = document.createElement('option'); o.value = l[0]; o.textContent = l[1]; sel.appendChild(o); });
  $('#layerWrap').hidden = state.layers.size === 0;
  $('#structWrap').hidden = !seedLayer();
  $('#chestWrap').hidden = !(state.chests.surface.length + state.chests.cave.length + state.chests.deepcave.length);
  if (state.chestSel && state.chests[state.level].indexOf(state.chestSel) < 0) openChest(null);
  if (!$('#panel [data-pane="chests"]').hidden) runChestSearch();
  sel.value = state.level;
}
function refreshAll() { scheduleStructList(); renderLayers(); renderPalette(); renderMarkers(); renderFiles(); updateStatus(state.hover); requestDraw(); }
function setLayer(name, doFit) {
  dirtySeed();
  if (LEVEL_LABEL[name]) { state.level = name; savePrefs(); }
  state.layer = name; state.focus = null; state.found = { color: null, visited: [] };
  if (state.objFind) { state.objFind.tok = ++objTok; setTimeout(function () { if (!$('#panel [data-pane="objects"]').hidden) runObjSearch(); }, 0); }
  dirtyAll(); refreshAll(); if (doFit) fit();
}
var tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };
/* ---------- zip files (Necesse world saves) ---------- */
async function inflateRaw(bytes) {
  var ds = new DecompressionStream('deflate-raw');
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer());
}
async function readZip(file) {
  var buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer), eocd = -1;
  for (var i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip file');
  var count = dv.getUint16(eocd + 10, true), p = dv.getUint32(eocd + 16, true), out = [], dec = new TextDecoder();
  for (var k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('damaged zip directory');
    var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    var nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), loc = dv.getUint32(p + 42, true);
    var name = dec.decode(buf.subarray(p + 46, p + 46 + nlen)).replace(/\\/g, '/');
    p += 46 + nlen + elen + clen;
    if (/\/$/.test(name)) continue;
    var start = loc + 30 + dv.getUint16(loc + 26, true) + dv.getUint16(loc + 28, true);
    out.push({ path: name, method: method, data: buf.subarray(start, start + csize) });
  }
  return out;
}
async function zipEntryText(e) {
  if (e.method === 0) return new TextDecoder().decode(e.data);
  if (e.method === 8) return new TextDecoder().decode(await inflateRaw(e.data));
  throw new Error('unsupported compression in ' + e.path);
}
var SAVE_COLORS = NMV_DATA.saveColors;
var SAVE_TILE = {}, SAVE_OBJ = {};
Object.keys(SAVE_COLORS.tiles).forEach(function (k) { var v = SAVE_COLORS.tiles[k]; SAVE_TILE[k] = v ? parseInt(v.slice(1), 16) : 1; });
Object.keys(SAVE_COLORS.objects).forEach(function (k) { var v = SAVE_COLORS.objects[k]; if (v) SAVE_OBJ[k] = parseInt(v.slice(1), 16); });
SAVE_TILE.watertile = 0x4191b0;   // the game blends water by depth; this is its usual shade on explored maps
// same rule as the in-game map: an object's color wins over the tile under it
function saveColor(tname, oname) {
  if (oname && oname !== 'air' && SAVE_OBJ[oname] !== undefined) return SAVE_OBJ[oname] || 1;
  var c = SAVE_TILE[tname]; return c === undefined ? 1 : (c || 1);   // never pure black, which means unexplored
}
var TILE_NAMES = NMV_DATA.names;
var NAME_LIST = ['air'], NAME_IX = { air: 0 };
function nameIx(id) { var i = NAME_IX[id]; if (i === undefined) { i = NAME_IX[id] = NAME_LIST.length; NAME_LIST.push(id); } return i; }
function idList(s) { var p = s.replace(/^\[|\]$/g, '').split(','), o = {}; for (var i = 0; i + 1 < p.length; i += 2) o[parseInt(p[i], 10)] = p[i + 1].trim(); return o; }
var LADDER_ICONS = {"ladderdown": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABQUlEQVR4XmP8//8/w0ACFmyWF4co4nVT75r7DNTSx4LHJlxBw0ggxEjSx8QwwICgAySkWBlAmFR3EqsPaxS8fPWdQVyME6ud129+YDAQZscqJyXFxaCpLoBVDmQmNgmsDngFdMCVq+/B6pur1cD00qUPYfpxZptnz74xgDBIIbo+MVEOrA7DGgWvXv+gesrAZSYLIZtuPPgJViIhyQWmuXlRtXBzQ/hfv/4By3/9DKFh+giZP+C5gGAI/Pz1D+yJF8+/QTzznLjYgekb+iEA8wGpaYDYVDz408DnL3/ISgOfv/ATFQiDPwRG08DzFz/JSgNiEhzDJA3AynhSywGYvqFfEsJqN1LrAgkGrtFyYJiFAMlpQHK4pAG4zxExSlTPCIs+rGmChYEMcOHtT6y6cPUX8FmBzwGMDOQBkvQNePccAHQ6iBH/VNVKAAAAAElFTkSuQmCC", "ladderup": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABk0lEQVR4XmP8//8/w0ACJoYBBgPuABZiAkBdgpGscLr5gnD0spBgMqmJhShX402EMJ8zMjMy/P9LWmoF6mEE6gH7D19IEBMC/0EGcQiwkhQNPz78hoUY3pDA6gA0n1OUT0ChBzMPW0jgCwEUnwN9BHbIrZf43aMmDpGHhRihkBj82ZBYn8PCBRZCagy/iYq6QR0CsNQLTs2wuIV5Cz1XwEIKi7fx5gK85YCWGDPDX6Z/WAsgYh3A/I+J8dqrvzijA285ANTMwPYXoiQ6Wh5syNKlDyGGvUY1k5OBDSyAru4v4z+8aQFvGmD+T3kSIWQG0XXBz18Qn/wXhcSINL80is+efnwK5sPUMRAJhkZ1DPLMrTtfwX66dBOSvy8xPMDqR32ZrwykgKETAjBf6alDakVcaYCBRDB0QuDr1z9gvzG+hhRsz14/Q/ErIwNE/Kvgn2GeBpC8h17Gk9XBoCgNXHj7kwGEGSgARJeEXz8TF7fEqoO5eUjkAkYODmaGH98hIQBm/8BavRKrDjX3jHZOGQYYAACvoY+qS6B7JgAAAABJRU5ErkJggg==", "deepladderdown": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABEUlEQVR4XmP8//8/w0ACFmyWM/rF43XT/00LGfDqA3kK5jFGRgYGEAZqwKaPBY9NuIKGkUCI/Qdb+O8fRBkTE0w5Vn1MDAMMWAjar6QNUXLvKmlOVdUjSh/2EHj2ALdlF48DQ5gRK2YAyuHUiMtMUC5AxwyS8iBzQGngv1HPcjAGCvwnBWPoA5qJzS7sIfD8IfVTBg4zCaaBm7duQBzjGwemuSUVURynrqYB5sPUfX1+H4VPyCdDIBfAvLB5EZj1Fc1L53B5Ma2egRgwhEKAxDTAQCQYTQOjaWA0DYymgdE0MJoGRtPAgIcA1r4hI6QrRX7PCHtbAKtdLAxkAFwdWqjDSTIRnwMYGcgDJOkb8O45ACTjn+mXPel6AAAAAElFTkSuQmCC", "deepladderup": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABb0lEQVR4XmP8//8/w0ACJoYBBgPuABZiAsBQVZOscDp/+zpBfSwkmExqYmEkxmy8iRDmc1ZmFobff/+Q5ACgHkagHrAb8IUEMSHwH2SQlKAISdHw7P0bmIPxhgRWB6D5nKJ8Ago9mHnYQgJfCKD4HOgjsEOe//iJ10GSHOxgeViIEQqJwZ8NifU5LFjgIfT+DVFRN6hDgPHNxw8MT16/AKdmL1MbFB89Q/Mhei7ZdvoIWL2MqASjCL8AztDAmghhqZWRkZGBUgD0AMPjV89xGoO3III6AKUAMlDRwOumC3duoMvjtWNoVEYgLxn1LAf77FxJJN4QIFYdzJChEwI3b0Hj1jcO7HhuSUUwra4GSRPnDm4H8+HqiEy9QycE4B7avAjM/AoVOIfu07R6BlLAEAwBAmmAgUQwmgaGYAgg4hi9piKri0VRCIC6dZR27YhpFTMyK2kx/Ll3Fex3EPvvvWvY0jqx6lD0jnZOBzwXAAC2UYpaAtZDEwAAAABJRU5ErkJggg=="};
var LADDER_IMG = {};
Object.keys(LADDER_ICONS).forEach(function (k) { var im = new Image(); im.onload = requestDraw; im.src = LADDER_ICONS[k]; LADDER_IMG[k] = im; });
var LADDER_NAME = { ladderdown: 'Ladder Down', ladderup: 'Ladder Up', deepladderdown: 'Deep Ladder Down', deepladderup: 'Deep Ladder Up' };
state.ladders = { surface: [], cave: [], deepcave: [] };
function drawLadders(ox, oy, s, t) {
  var list = state.ladders[state.level] || [];
  if (!list.length || s < 1 / 16) return;
  ctx.font = '600 12px Inter, system-ui, sans-serif';
  var prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  var sz = s >= 0.5 ? 28 : 22;
  for (var i = 0; i < list.length; i++) {
    var p = list[i], cx = ox + (p.x + .5) * s, cy = oy + (p.y + .5) * s;
    if (cx < -40 || cy < -40 || cx > W + 40 || cy > H + 40) continue;
    var im = LADDER_IMG[p.type];
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.arc(cx, cy, sz / 2 + 2, 0, Math.PI * 2); ctx.fill();
    if (im && im.complete && im.naturalWidth) ctx.drawImage(im, Math.round(cx - sz / 2), Math.round(cy - sz / 2), sz, sz);
  }
  ctx.imageSmoothingEnabled = prev;
}
var ITEMS = NMV_DATA.items;
var ATLAS = new Image(); ATLAS.onload = requestDraw; ATLAS.src = ITEMS.atlas;
state.chests = { surface: [], cave: [], deepcave: [] }; state.showChests = true; state.chestSel = null;
function itemName(id) { return (TILE_NAMES.items && TILE_NAMES.items[id]) || ITEMS.name[id] || id.charAt(0).toUpperCase() + id.slice(1); }
var CHEST_RE = /chest|storagebox|barrel|coffin|sack|coolingbox|crate/;
function readChests(level, body, cx, cy, ob, om) {
  var i = body.indexOf('\n\t\tOBJECTENTITIES = {'); if (i < 0) return;
  var e = body.indexOf('\n\t\t}', i), sec = body.slice(i, e < 0 ? body.length : e);
  sec.split('\n\t\t\tOBJENT = {').slice(1).forEach(function (ent) {
    var inv = ent.indexOf('\n\t\t\t\tINVENTORY = {'); if (inv < 0) return;
    var mx = /\n\t\t\t\tx = (-?\d+)/.exec(ent), my = /\n\t\t\t\ty = (-?\d+)/.exec(ent); if (!mx || !my) return;
    var x = +mx[1], y = +my[1], lx = x - cx * 16, ly = y - cy * 16, obj = '';
    if (ob && lx >= 0 && lx < 16 && ly >= 0 && ly < 16) { var k = ly * 16 + lx; obj = om[((ob[2 * k] << 8) | ob[2 * k + 1]) << 16 >> 16] || ''; }
    var items = [];
    ent.slice(inv).split('\n\t\t\t\t\tITEM = {').slice(1).forEach(function (it) {
      var sid = /\n\t\t\t\t\t\tstringID = ([^,\n]+)/.exec(it), am = /\n\t\t\t\t\t\tamount = (\d+)/.exec(it), sl = /\n\t\t\t\t\t\tslot = (\d+)/.exec(it);
      if (!sid) return;
      var en = /gndType = itemenchant,\s*\n\s*value = (\w+)/.exec(it);
      items.push({ id: sid[1].trim(), n: am ? +am[1] : 1, slot: sl ? +sl[1] : 0, ench: en && en[1] !== 'noenchant' ? en[1] : '' });
    });
    if (!items.length && !CHEST_RE.test(obj)) return;
    items.sort(function (a, b) { return a.slot - b.slot; });
    state.chests[level].push({ x: x, y: y, obj: obj, items: items }); state.chestVer++;
  });
}
var ATLAS_URL = (function () {
  try {
    var b64 = ITEMS.atlas.slice(ITEMS.atlas.indexOf(',') + 1), bin = atob(b64), u = new Uint8Array(bin.length);
    for (var k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
    return URL.createObjectURL(new Blob([u], { type: 'image/png' }));
  } catch (e) { return ITEMS.atlas; }
})();
function chestIcon(id, el, size) {
  var i = ITEMS.icon[id];
  if (i !== undefined) {
    var c = ITEMS.cols, sc = size / 32;
    el.style.backgroundImage = 'url(' + ATLAS_URL + ')';
    el.style.backgroundSize = (ATLAS.naturalWidth * sc) + 'px ' + (ATLAS.naturalHeight * sc) + 'px';
    el.style.backgroundPosition = (-(i % c) * size) + 'px ' + (-Math.floor(i / c) * size) + 'px';
  } else el.style.background = ITEMS.swatch[id] || 'var(--line)';
}
state.chestQ = '';
var LNAME = {};
function lowName(id) { return LNAME[id] || (LNAME[id] = itemName(id).toLowerCase() + '\u0000' + id); }
function itemMatches(it, q) { var n = lowName(it.id); return n.indexOf(q) >= 0 || (q.indexOf(' ') >= 0 && n.indexOf(q.replace(/\s+/g, '')) >= 0); }
// each chest remembers its matches for the current query, so drawing and listing do not search again
function chestHits(p) {
  var q = state.chestQ; if (!q) return p.items;
  if (p._q !== q) { p._q = q; p._h = p.items.filter(function (it) { return itemMatches(it, q); }); }
  return p._h;
}
var chestSearchTimer = 0;
function runChestSearch() {
  var q = state.chestQ, res = $('#chestRes'), sum = $('#chestSum');
  res.textContent = '';
  var total = state.chests.surface.length + state.chests.cave.length + state.chests.deepcave.length, gtotal = genChestsAll('surface').length + genChestsAll('cave').length + genChestsAll('deepcave').length;
  if (!total && !gtotal) { sum.textContent = ''; res.innerHTML = '<li class="empty">Open a world save to search its chests.</li>'; return; }
  if (!q) { sum.textContent = ''; res.innerHTML = '<li class="empty">Type an item name, for example \u201cpotion\u201d or \u201ciron bar\u201d.</li>'; return; }
  var found = [], items = 0, v = state.view;
  LEVELS.forEach(function (lv) {
    chestsHere(lv[0]).forEach(function (p) {
      var h = chestHits(p); if (!h.length) return;
      var n = h.reduce(function (a, b) { return a + b.n; }, 0); items += n;
      found.push({ p: p, lv: lv[0], hits: h, n: n, d: lv[0] === state.level ? Math.hypot(p.x - v.cx, p.y - v.cy) : 1e9 + n });
    });
  });
  found.sort(function (a, b) { return a.d - b.d; });
  sum.textContent = found.length ? fmt(items) + (items === 1 ? ' item' : ' items') + ' in ' + fmt(found.length) + (found.length === 1 ? ' chest' : ' chests') + ', nearest first.' : 'No chest holds an item matching \u201c' + q + '\u201d.';
  found.slice(0, 200).forEach(function (f) {
    var li = document.createElement('li'), cn = document.createElement('span'), lvl = document.createElement('span'), meta = document.createElement('span'), hits = document.createElement('span');
    cn.className = 'cn'; cn.textContent = itemName(f.p.obj || 'chest') + (f.p.gen ? ' (unexplored)' : '');
    lvl.className = 'meta'; lvl.style.gridColumn = 'auto'; lvl.textContent = LEVEL_LABEL[f.lv];
    meta.className = 'meta'; meta.textContent = 'x ' + f.p.x + ', y ' + f.p.y + (f.lv === state.level ? ' \u00b7 ' + fmt(Math.round(f.d)) + ' tiles from view center' : '');
    hits.className = 'hits';
    f.hits.slice(0, 6).forEach(function (it) {
      var h = document.createElement('span'), ic = document.createElement('span');
      h.className = 'hit'; ic.className = 'ic'; chestIcon(it.id, ic, 20);
      h.appendChild(ic); h.appendChild(document.createTextNode(itemName(it.id) + (it.n > 1 ? ' \u00d7' + fmt(it.n) : '')));
      hits.appendChild(h);
    });
    if (f.hits.length > 6) { var more = document.createElement('span'); more.className = 'hit'; more.textContent = '+' + (f.hits.length - 6) + ' more'; hits.appendChild(more); }
    li.appendChild(cn); li.appendChild(lvl); li.appendChild(hits); li.appendChild(meta);
    li.addEventListener('click', function () {
      if (f.lv !== state.level) { $('#layerSel').value = f.lv; setLayer(f.lv, false); }
      goTo(f.p.x, f.p.y, 3); openChest(f.p);
      if (window.matchMedia('(max-width: 780px)').matches) setPanel(false);
    });
    res.appendChild(li);
  });
  if (found.length > 200) { var li = document.createElement('li'); li.className = 'empty'; li.textContent = 'Showing the nearest 200. Type more of the name to narrow it down.'; res.appendChild(li); }
}
$('#chestQ').addEventListener('input', function (e) {
  var q = e.target.value.trim().toLowerCase();
  clearTimeout(chestSearchTimer);
  // wait for a short pause in typing, then search once
  chestSearchTimer = setTimeout(function () {
    if (q === state.chestQ) return;
    state.chestQ = q; runChestSearch();
    if (state.chestSel) openChest(state.chestSel);
    requestDraw();
  }, q.length < 3 ? 350 : 200);
});
document.querySelector('.tab[data-tab="chests"]').addEventListener('click', runChestSearch);
// generated chests for a level (surface ruins; Cave and Deep Cave chest rooms and ruins)
function genChestsAll(level) {
  var L = seedLayer(), out = [];
  if (!L) return out;
  var seen = state.savedChunks[level], pre = level === 'cave' ? 'c' : level === 'deepcave' ? 'd' : 's';
  L.gchests.forEach(function (list, key) { if (key.charAt(0) !== pre) return; for (var i = 0; i < list.length; i++) { var c = list[i]; if (!seen.has((c.x >> 4) + ',' + (c.y >> 4))) out.push(c); } });
  return out;
}
function genChestsWant() {
  var L = seedLayer(), s = state.view.s, v = state.view;
  if (!L || !state.showChests || s < 1 / 8) { if (L) L.cqueue = []; return; }
  var px0 = Math.floor((v.cx - W / 2 / s) / 1024), px1 = Math.floor((v.cx + W / 2 / s) / 1024);
  var py0 = Math.floor((v.cy - H / 2 / s) / 1024), py1 = Math.floor((v.cy + H / 2 / s) / 1024), want = [];
  for (var py = py0; py <= py1; py++) for (var px = px0; px <= px1; px++) {
    var key = (state.level === 'cave' ? 'c' : state.level === 'deepcave' ? 'd' : 's') + px + ',' + py;
    var sp = state.spawn && state.spawn.seed === L.seedText ? { x: state.spawn.x, y: state.spawn.y } : null;
    if (!L.gchests.has(key) && !L.pending.has(key)) want.push({ type: 'chests', key: key, level: state.level, spawn: sp, px: px, py: py, d: Math.abs(px * 1024 + 512 - v.cx) + Math.abs(py * 1024 + 512 - v.cy) });
  }
  want.sort(function (a, b) { return a.d - b.d; });
  L.cqueue = want;
  if (want.length) pumpSeed(L);
}
state.chestVer = 0; var chestCache = {};
function chestsHere(level) {
  var c = chestCache[level];
  if (c && c.ver === state.chestVer) return c.list;
  var list = (state.chests[level] || []).concat(genChestsAll(level));
  chestCache[level] = { ver: state.chestVer, list: list };
  return list;
}
function drawChests(ox, oy, s, t) {
  genChestsWant();
  var list = state.showChests ? chestsHere(state.level) : [];
  if (!list.length || s < 1 / 8) return;
  var prev = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
  var big = s >= 1.5, sz = Math.max(16, Math.min(32, s * 1.2));
  for (var i = 0; i < list.length; i++) {
    var p = list[i], cx = ox + (p.x + .5) * s, cy = oy + (p.y + .5) * s;
    if (cx < -20 || cy < -20 || cx > W + 20 || cy > H + 20) continue;
    var ic = ITEMS.icon[p.obj], hit = !state.chestQ || chestHits(p).length > 0;
    ctx.globalAlpha = hit ? 1 : .22;
    if (big && ic !== undefined && ATLAS.complete && ATLAS.naturalWidth) {
      ctx.globalAlpha = hit ? (p.items.length ? 1 : .55) : .22;
      ctx.drawImage(ATLAS, (ic % ITEMS.cols) * 32, Math.floor(ic / ITEMS.cols) * 32, 32, 32, Math.round(cx - sz / 2), Math.round(cy - sz / 2), sz, sz);
      ctx.globalAlpha = 1;
      if (p.gen) { ctx.setLineDash([2, 3]); ctx.strokeStyle = '#7fd3ff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, sz / 2 + 3, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    } else {
      var r = s >= .5 ? 3.5 : 2.5;
      ctx.fillStyle = p.gen ? '#7fd3ff' : p.items.length ? '#f3c14b' : '#9aa4a6'; ctx.strokeStyle = p.gen ? '#06202b' : '#1b1206'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.rect(Math.round(cx - r), Math.round(cy - r), r * 2, r * 2); ctx.fill(); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (state.chestQ && hit) { ctx.strokeStyle = '#ff5ad1'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, (big ? sz / 2 : 4) + 3, 0, Math.PI * 2); ctx.stroke(); }
    if (p === state.chestSel) {
      ctx.strokeStyle = t.accent; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(cx, cy, (big ? sz / 2 : 4) + 5, 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.imageSmoothingEnabled = prev;
}
function chestAt(px, py) {
  var list = state.showChests ? chestsHere(state.level) : [], s = state.view.s;
  if (!list.length || s < 1 / 8) return null;
  var ox = W / 2 - state.view.cx * s, oy = H / 2 - state.view.cy * s, best = null, bd = Math.max(10, Math.min(18, s * .8)) ;
  for (var i = 0; i < list.length; i++) {
    var p = list[i], d = Math.hypot(ox + (p.x + .5) * s - px, oy + (p.y + .5) * s - py);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
function openChest(p) {
  state.chestSel = p; requestDraw();
  var pop = $('#chestPop');
  if (!p) { pop.hidden = true; return; }
  $('#cpName').textContent = chestName(p);
  var total = p.items.reduce(function (a, b) { return a + b.n; }, 0);
  $('#cpMeta').textContent = 'x ' + p.x + ', y ' + p.y + (p.gen ? ' \u00b7 unexplored, worked out from the seed' : '') + ' \u00b7 ' + (p.items.length ? p.items.length + (p.items.length === 1 ? ' stack' : ' stacks') + ', ' + fmt(total) + (total === 1 ? ' item' : ' items') : 'empty');
  var ul = $('#cpList'); ul.textContent = '';
  if (!p.items.length) { ul.innerHTML = '<li class="empty">Nothing inside.</li>'; }
  p.items.forEach(function (it) {
    var li = document.createElement('li'), ic = document.createElement('span'), nm = document.createElement('span'), am = document.createElement('span');
    if (state.chestQ && itemMatches(it, state.chestQ)) li.className = 'match';
    ic.className = 'ic'; chestIcon(it.id, ic, 28);
    nm.className = 'nm'; nm.textContent = itemName(it.id);
    if (it.ench) { var en = document.createElement('span'); en.className = 'en'; en.textContent = it.ench.charAt(0).toUpperCase() + it.ench.slice(1); nm.appendChild(en); }
    am.className = 'am'; am.textContent = it.n > 1 ? '\u00d7' + fmt(it.n) : '';
    li.appendChild(ic); li.appendChild(nm); li.appendChild(am); ul.appendChild(li);
  });
  pop.hidden = false;
}
$('#cpClose').addEventListener('click', function () { openChest(null); });
// a chest's name as the game shows it (Storage Box, not storagebox)
function chestName(p) { return (TILE_NAMES.objects && TILE_NAMES.objects[p.obj]) || itemName(p.obj || 'chest'); }
// a ladder at the same tile on the next layer: down from the surface to the cave (and on to the deep cave), up the other way
// every way up leads to the surface (the deep cave's ladder up included); down goes one layer deeper, and a deep ladder down to the deep cave
var LADDER_TO = { ladderdown: 1, deepladderdown: 1, ladderup: 1, deepladderup: 1 };
function ladderTarget(ld) {
  if (/up$/.test(ld.type)) return 'surface';
  if (ld.type === 'deepladderdown' || state.level === 'cave') return 'deepcave';
  return 'cave';
}
function ladderAt(px, py) {
  var list = state.ladders[state.level] || [], s = state.view.s;
  if (!list.length || s < 1 / 16) return null;
  var ox = W / 2 - state.view.cx * s, oy = H / 2 - state.view.cy * s, best = null, bd = s >= 0.5 ? 16 : 13;
  for (var i = 0; i < list.length; i++) {
    var p = list[i], d = Math.hypot(ox + (p.x + .5) * s - px, oy + (p.y + .5) * s - py);
    if (d < bd && LADDER_TO[p.type]) { bd = d; best = p; }
  }
  return best;
}
function followLadder(ld) {
  var to = ladderTarget(ld), x = ld.x, y = ld.y;
  // the other end is normally on the very same tile; take it if it is a step or two away
  var other = (state.ladders[to] || []).filter(function (q) { return Math.abs(q.x - x) <= 3 && Math.abs(q.y - y) <= 3; })[0];
  if (other) { x = other.x; y = other.y; }
  $('#layerSel').value = to; setLayer(to, false);
  state.view.cx = x + .5; state.view.cy = y + .5; updateZoom();
  state.ping = { x: x, y: y, t: performance.now() }; hideTip(); requestDraw();
  toast((/down/.test(ld.type) ? 'Down' : 'Up') + ' to the ' + LEVEL_LABEL[to] + ' at x ' + x + ', y ' + y + (other ? '' : ' (that end has not been explored yet)') + '.', 2500);
}

// the hover card: a chest's first items, or where a ladder leads
var tipKey = null;
function hideTip() { $('#hoverTip').hidden = true; tipKey = null; cv.style.cursor = ''; }
function showTipAt(px, py, key, build) {
  var tip = $('#hoverTip');
  if (tipKey !== key) { tip.textContent = ''; build(tip); tipKey = key; }
  tip.hidden = false;
  var w = tip.offsetWidth, h = tip.offsetHeight, x = px + 16, y = py + 16;
  if (x + w > W - 6) x = px - w - 12; if (y + h > H - 6) y = Math.max(6, py - h - 12);
  tip.style.left = Math.max(6, x) + 'px'; tip.style.top = y + 'px';
  cv.style.cursor = 'pointer';
}
cv.addEventListener('pointermove', function (e) {
  if (e.pointerType !== 'mouse' || ptrs.size || state.arm) { hideTip(); return; }
  var p = pos(e), ch = chestAt(p.x, p.y);
  if (ch && ch !== state.chestSel) {
    showTipAt(p.x, p.y, 'c' + ch.x + ',' + ch.y + ':' + state.level, function (tip) {
      var b = document.createElement('b'); b.textContent = chestName(ch) + (ch.gen ? ' (unexplored)' : ''); tip.appendChild(b);
      if (!ch.items.length) { var e0 = document.createElement('div'); e0.className = 'more'; e0.textContent = 'Nothing inside'; tip.appendChild(e0); }
      // the biggest stacks first, as a quick look
      ch.items.slice().sort(function (a, b) { return b.n - a.n; }).slice(0, 6).forEach(function (it) {
        var row = document.createElement('div'), ic = document.createElement('span'), nm = document.createElement('span'), n = document.createElement('span');
        row.className = 'it'; ic.className = 'ic'; chestIcon(it.id, ic, 20); nm.textContent = itemName(it.id); n.className = 'n'; n.textContent = it.n > 1 ? '×' + fmt(it.n) : '';
        row.appendChild(ic); row.appendChild(nm); row.appendChild(n); tip.appendChild(row);
      });
      var more = ch.items.length - 6, h2 = document.createElement('div'); h2.className = 'hint2';
      h2.textContent = (more > 0 ? '+' + more + ' more · ' : '') + 'click to open'; tip.appendChild(h2);
    });
    return;
  }
  var ld = ch ? null : ladderAt(p.x, p.y);
  if (ld) {
    showTipAt(p.x, p.y, 'l' + ld.x + ',' + ld.y + ':' + state.level, function (tip) {
      var b = document.createElement('b'); b.textContent = LADDER_NAME[ld.type]; tip.appendChild(b);
      var h2 = document.createElement('div'); h2.className = 'hint2'; h2.textContent = 'Click to go ' + (/down/.test(ld.type) ? 'down' : 'up') + ' to the ' + LEVEL_LABEL[ladderTarget(ld)]; tip.appendChild(h2);
    });
    return;
  }
  hideTip();
});
cv.addEventListener('pointerleave', hideTip);
cv.addEventListener('pointerdown', hideTip);
cv.addEventListener('wheel', hideTip, { passive: true });

// saving a picture
function picName(what) {
  var w = (($('#openFiles').textContent || '').replace(/\.zip$/i, '') || 'map').replace(/[^\w-]+/g, '_');
  if (w === 'Open_files') w = seedLayer() ? 'seed_' + seedLayer().seedText.replace(/[^\w-]+/g, '_') : 'map';
  return 'necesse-' + w + '-' + state.level + '-' + what + '.png';
}
// inside claude.ai a page may not download by itself: the viewer's downloads capability asks them to save it
var DL = null;
try { if (window.claude && typeof window.claude.use === 'function') window.claude.use('downloads').then(function (n) { DL = n; }, function () {}); } catch (e) {}
function savePng(canvas, name) {
  canvas.toBlob(function (b) {
    if (!b) { toast('The picture is too big for this browser to save.', 5000); return; }
    if (DL) {
      DL.save({ filename: name, data: b }).then(function () { toast('Saved ' + name + ' (' + canvas.width + ' \u00d7 ' + canvas.height + ' pixels).', 4000); },
        function (err) { if (err && err.code !== 'declined') toast('The picture could not be saved here' + (err.code === 'too_large' ? ': it is too big' : '') + '.', 5000); });
      return;
    }
    var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    toast('Saved ' + name + ' (' + canvas.width + ' × ' + canvas.height + ' pixels).', 4000);
  }, 'image/png');
}
// the explored part of the layer, from the save, one tile = k pixels, as large as browsers can save
function layerPicture() {
  var L = state.layers.get(state.level);
  if (!L || L.kind === 'seed' || !L.regions.size) return null;
  var b = boundsOf(L), w = b.x1 - b.x0, h = b.y1 - b.y0, MAX = 16384, k = Math.max(1, Math.min(4, Math.floor(MAX / Math.max(w, h))));
  var down = Math.max(w, h) > MAX ? MAX / Math.max(w, h) : 1;
  return { L: L, b: b, w: w, h: h, k: k, down: down, W: Math.round(w * k * down), H: Math.round(h * k * down) };
}
function updatePicMenu() {
  var P = layerPicture(), btn = $('#picLayer');
  btn.disabled = !P;
  $('#picLayerSize').textContent = P ? fmt(P.W) + ' × ' + fmt(P.H) + ' pixels' + (P.k > 1 ? ', ' + P.k + ' per tile' : P.down < 1 ? ', shrunk to fit' : ', 1 per tile') : 'open a world save first';
}
function setPicMenu(on) { $('#picMenu').hidden = !on; $('#picBtn').setAttribute('aria-expanded', on); if (on) updatePicMenu(); }
$('#picBtn').addEventListener('click', function (e) { e.stopPropagation(); setPicMenu($('#picMenu').hidden); });
document.addEventListener('click', function (e) { if (!e.target.closest('.menuwrap')) setPicMenu(false); });
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setPicMenu(false); });
$('#picView').addEventListener('click', function () {
  setPicMenu(false);
  var keep = state.hover; state.hover = null; hideTip(); draw(); state.hover = keep;
  var v = state.view; savePng(cv, picName('x' + Math.round(v.cx) + '_y' + Math.round(v.cy)));
});
$('#picLayer').addEventListener('click', function () {
  setPicMenu(false);
  var P = layerPicture(); if (!P) return;
  toast('Drawing the picture…', 8000);
  setTimeout(function () {
    var full = document.createElement('canvas'); full.width = P.w; full.height = P.h;
    var fx = full.getContext('2d'), img = fx.createImageData(P.w, P.h), o = img.data;
    P.L.regions.forEach(function (reg) {
      var x0 = reg.rx * reg.w - P.b.x0, y0 = reg.ry * reg.h - P.b.y0, d = reg.rgb;
      for (var y = 0; y < reg.h; y++) for (var x = 0; x < reg.w; x++) {
        var i = (y * reg.w + x) * 3, r = d[i], g = d[i + 1], bl = d[i + 2]; if (!(r | g | bl)) continue;   // never explored: transparent
        var q = ((y0 + y) * P.w + x0 + x) * 4; o[q] = r; o[q + 1] = g; o[q + 2] = bl; o[q + 3] = 255;
      }
    });
    fx.putImageData(img, 0, 0);
    var out = full;
    if (P.k > 1 || P.down < 1) {
      out = document.createElement('canvas'); out.width = P.W; out.height = P.H;
      var ox2 = out.getContext('2d'); ox2.imageSmoothingEnabled = P.down < 1; ox2.drawImage(full, 0, 0, P.W, P.H);
    }
    savePng(out, picName('explored'));
  }, 30);
});
document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('#chestPop').hidden) openChest(null); });
$('#chestChk').addEventListener('change', function (e) { state.showChests = e.target.checked; if (!state.showChests) openChest(null); requestDraw(); });
state.savedChunks = { surface: new Set(), cave: new Set(), deepcave: new Set() };
function paintChunk(level, cx, cy, tb, ob, tm, om) {
  state.savedChunks[level].add(cx + ',' + cy);
  var rx = Math.floor(cx / 16), ry = Math.floor(cy / 16), key = rx + 'x' + ry;
  var L = state.layers.get(level), reg = L && L.regions.get(key);
  if (!reg) { addRegion(level, { rx: rx, ry: ry, w: 256, h: 256, rgb: new Uint8Array(196608), key: key }); reg = state.layers.get(level).regions.get(key); }
  var ox = (cx - rx * 16) * 16, oy = (cy - ry * 16) * 16, d = reg.rgb;
  for (var i = 0; i < 256; i++) {
    var lx = i & 15, ly = i >> 4;
    var t = ((tb[2 * i] << 8) | tb[2 * i + 1]) << 16 >> 16, o = ob ? ((ob[2 * i] << 8) | ob[2 * i + 1]) << 16 >> 16 : 0;
    var c = saveColor(tm[t], om[o]), k = ((oy + ly) * 256 + ox + lx) * 3;
    if (!reg.ti) { reg.ti = new Uint16Array(65536); reg.oi = new Uint16Array(65536); }
    reg.ti[k / 3] = nameIx(tm[t] || ''); reg.oi[k / 3] = nameIx(o > 0 ? om[o] || '' : 'air');
    if (o && LADDER_NAME[om[o]]) state.ladders[level].push({ type: om[o], x: cx * 16 + lx, y: cy * 16 + ly });
    d[k] = c >> 16; d[k + 1] = (c >> 8) & 255; d[k + 2] = c & 255;
  }
  reg.dirty = true;
}
async function applySaves(saves) {
  var n = 0; state.chestVer++; state.ladders = { surface: [], cave: [], deepcave: [] }; state.savedChunks = { surface: new Set(), cave: new Set(), deepcave: new Set() }; state.chests = { surface: [], cave: [], deepcave: [] }; openChest(null);
  for (var i = 0; i < saves.length; i++) {
    var sv = saves[i], text = await zipEntryText(sv.entry), re = /\n\t(-?\d+)x(-?\d+) = \{([\s\S]*?)\n\t\}/g, m;
    while ((m = re.exec(text))) {
      var g = {};
      m[3].split('\n').forEach(function (line) { var mm = /^\t\t(\w+) = (.*?),?$/.exec(line); if (mm) g[mm[1]] = mm[2]; });
      if (!g.tiles || !g.tileIDs) continue;
      try {
        var tb = await inflate(b64urlToBytes(g.tiles)), ob = g.objects ? await inflate(b64urlToBytes(g.objects)) : null;
        if (tb.length !== 512) continue;
        paintChunk(sv.level, +m[1], +m[2], tb, ob && ob.length === 512 ? ob : null, idList(g.tileIDs), g.objectIDs ? idList(g.objectIDs) : {});
        if (m[3].indexOf('OBJECTENTITIES') >= 0) readChests(sv.level, m[3], +m[1], +m[2], ob && ob.length === 512 ? ob : null, g.objectIDs ? idList(g.objectIDs) : {});
        n++;
      } catch (e) { /* skip a damaged chunk */ }
    }
    toast('Reading your saved world\u2026 ' + fmt(n) + ' chunks', 8000); await tick();
  }
  state.layers.forEach(function (L) { if (L.kind !== 'seed') { L.counts = null; L.bounds = null; } });
  return n;
}
async function expandZips(items, found, saves) {
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (!/\.zip$/i.test(it.path)) { out.push(it); continue; }
    try {
      var base = it.path.replace(/\.zip$/i, ''), entries = await readZip(it.file);
      for (var j = 0; j < entries.length; j++) {
        var e = entries[j];
        if (/(^|\/)world\.dat$/i.test(e.path)) {
          var txt = await zipEntryText(e), sm = /worldSeed\s*=\s*([^,\s]+)/.exec(txt), sp = /spawnTile\s*=\s*\[\s*(-?\d+)\s*,\s*(-?\d+)/.exec(txt);
          if (sm) found.push({ seed: sm[1], spawn: sp ? { x: +sp[1], y: +sp[2] } : null, name: base.split('/').pop() });
        } else if (saves && /(^|\/)levels\/regions\/(surface|cave|deepcave)\/[^\/]+\.dat$/i.test(e.path)) {
          saves.push({ level: /regions\/(surface|cave|deepcave)\//i.exec(e.path)[1].toLowerCase(), entry: e });
        } else if (/\.mapdata$/i.test(e.path)) {
          out.push({ path: base + '/' + e.path, file: { text: zipEntryText.bind(null, e) } });
        }
      }
    } catch (err) { toast('Could not read ' + it.path + ': ' + err.message, 6000); }
  }
  return out;
}
function pickedLabel(items) {
  var names = [];
  items.forEach(function (it) { var top = it.path.split('/')[0]; if (names.indexOf(top) < 0) names.push(top); });
  return { short: names.length > 1 ? names[0] + ' +' + (names.length - 1) + ' more' : (names[0] || 'Open files'), full: names.join(', ') };
}
function showPicked(lbl) { var btn = $('#openFiles'); btn.textContent = lbl.short; btn.title = lbl.full + ' (click to open other files)'; }
async function loadFiles(items, opts) {
  var keep = !!(opts && opts.keep), picked = pickedLabel(items);
  var when = 0; items.forEach(function (i) { var t = i.file && +i.file.lastModified; if (t > when) when = t; });
  if (keep) state.layers.forEach(function (L, k) { if (L.kind !== 'seed') state.layers.delete(k); });
  var worlds = [], saves = [];
  items = await expandZips(items, worlds, saves);
  var world = worlds[0] || null;
  var ok = items.filter(function (i) { return /\.(mapdata|txt)$/i.test(i.path); });
  if (!ok.length && !world && !saves.length) { toast('No world save or .mapdata files in that selection.'); return; }
  var sameSeed = world && seedLayer() && seedLayer().seedText === world.seed;
  if (world && !(keep && sameSeed)) { makeSeedLayer(world.seed, world.spawn); showSeed(world.seed); }
  if (keep && world && !sameSeed) keep = false;   // a different world: start fresh
  var total = 0;
  for (var n = 0; n < ok.length; n++) {
    var it = ok[n];
    if (n % 8 === 0) { toast('Reading ' + (n + 1) + ' of ' + ok.length + '…', 8000); await tick(); }
    try {
      var res = await parseMapData(await it.file.text());
      var name = levelOf(it.path);
      res.regions.forEach(function (r) { addRegion(name, r); });
      total += res.regions.length;
    } catch (e) { /* skip unreadable file */ }
  }
  // the save holds the world as it is now (buildings, mining), so it is painted over any .mapdata images
  var chunks = saves.length ? await applySaves(saves) : 0;
  state.layers.forEach(function (L, k) { if (!L.regions.size && L.kind !== 'seed') state.layers.delete(k); });
  if (!state.layers.size) { toast('Could not read any map data from that selection.'); return; }
  setLayer(state.level, false);
  showPicked(picked);
  if (keep) {
    updateZoom(); requestDraw();
    toast('Reloaded ' + picked.short + (when ? ' (saved by the game at ' + new Date(when).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ')' : '') + '.', 4000);
    return;
  }
  if (world && world.spawn) { state.view.cx = world.spawn.x + .5; state.view.cy = world.spawn.y + .5; state.view.s = 1; updateZoom(); requestDraw(); }
  else fit();
  if (world) {
    toast('World ' + world.name + ' (seed ' + world.seed + '): ' + (chunks ? 'showing your saved world, ' + fmt(chunks) + ' chunks' : 'generated from its seed') +
      (total ? ', plus ' + total + ' explored map ' + (total === 1 ? 'region' : 'regions') : '') + '. Areas the save does not cover come from the seed.', 7000);
    return;
  }
  toast('Loaded ' + total + ' map ' + (total === 1 ? 'region' : 'regions') + '.');
}
async function loadSample() {
  var res = await parseMapData(SAMPLE_TEXT);
  res.regions.forEach(function (r) { addRegion(SAMPLE, r); });
  var L = state.layers.get(SAMPLE); if (L) { L.files = [{ name: 'Built-in sample (' + res.regions.length + ' regions)', count: res.regions.length, errors: res.errors }]; }
  setLayer(SAMPLE, true);
}
var src = null, reloadKeep = false;   // { handles: [...] } or { items: [...] }
function framed() { try { return window.top !== window; } catch (e) { return true; } }
function setSource(s) { src = s; $('#reloadBtn').hidden = !s; }
async function itemsFromHandles(hs) {
  var out = [];
  async function walk(h, path) {
    if (h.kind === 'file') { out.push({ file: await h.getFile(), path: path + h.name }); return; }
    for await (var e of h.values()) await walk(e, path + h.name + '/');
  }
  for (var i = 0; i < hs.length; i++) await walk(hs[i], '');
  return out;
}
async function openPicked(items, s) {
  var keep = reloadKeep; reloadKeep = false;
  setSource(s);
  await loadFiles(items, { keep: keep });
}
// The plain file picker: Chrome's newer picker (which could re-read files by itself) refuses the AppData folder
// where Necesse keeps its saves ("contains system files"), so it is not used for opening.
$('#openFiles').addEventListener('click', function () { $('#fileIn').click(); });
// Reload: read the same files again. Handles always give the file as it is now; plain picked files usually
// cannot be read once the game has rewritten them, so then the picker opens to choose the save again.
async function reloadSave() {
  if (!src) return;
  var btn = $('#reloadBtn'); if (btn.classList.contains('busy')) return;
  btn.classList.add('busy');
  try {
    var items;
    if (src.handles) items = await itemsFromHandles(src.handles);
    else { items = src.items; await Promise.all(items.map(function (i) { return i.file.slice(0, 1).arrayBuffer(); })); }
    await loadFiles(items, { keep: true });
  } catch (e) {
    toast('The game has saved since this file was opened. Choose ' + pickedLabel(src.items || []).short + ' again to load the new version; the view stays where it is.', 6000);
    reloadKeep = true; $('#fileIn').click();
  } finally { btn.classList.remove('busy'); }
}
$('#reloadBtn').addEventListener('click', reloadSave);
$('#reportLink').addEventListener('click', function () {
  var v = state.view, L = cur();
  var body = '**What went wrong?**\n\n\n**What did you expect instead?**\n\n\n**Where on the map?** (the x and y from the bar at the bottom, if it is about one spot)\n\n\n' +
    '---\nLayer: ' + (LEVEL_LABEL[state.level] || state.level) + ' \u00b7 view x ' + Math.round(v.cx) + ', y ' + Math.round(v.cy) + ' \u00b7 zoom ' + (Math.round(v.s * 100) / 100) +
    ' \u00b7 ' + (L ? (L.kind === 'seed' ? 'seed only' : 'world save loaded') : 'nothing loaded') + '\nBrowser: ' + navigator.userAgent + '\nScreen: ' + innerWidth + ' x ' + innerHeight;
  this.href = 'https://github.com/Tacitts/necesse-map-viewer/issues/new?body=' + encodeURIComponent(body);
});
window.addEventListener('keydown', function (e) {
  if ((e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) { e.preventDefault(); reloadSave(); }
});


function fromInput(inp) {
  var items = Array.from(inp.files).map(function (f) { return { file: f, path: f.webkitRelativePath || f.name }; });
  inp.value = ''; if (!items.length) return;
  openPicked(items, { items: items });
}
$('#fileIn').addEventListener('change', function (e) { fromInput(e.target); });
$('#dirIn').addEventListener('change', function (e) { fromInput(e.target); });
$('#layerSel').addEventListener('change', function (e) { setLayer(e.target.value, false); });

/* drag and drop, including folders */
async function itemsFromDrop(dt) {
  var ents = Array.from(dt.items || []).map(function (i) { return i.webkitGetAsEntry && i.webkitGetAsEntry(); }).filter(Boolean);
  if (!ents.length) return Array.from(dt.files).map(function (f) { return { file: f, path: f.name }; });
  var out = [];
  async function walk(e, path) {
    if (e.isFile) { out.push({ file: await new Promise(function (res, rej) { e.file(res, rej); }), path: path + e.name }); return; }
    var rd = e.createReader(), all = [];
    for (;;) { var b = await new Promise(function (res, rej) { rd.readEntries(res, rej); }); if (!b.length) break; all = all.concat(Array.from(b)); }
    for (var i = 0; i < all.length; i++) await walk(all[i], path + e.name + '/');
  }
  for (var i = 0; i < ents.length; i++) await walk(ents[i], '');
  return out;
}
var dragDepth = 0;
window.addEventListener('dragenter', function (e) { e.preventDefault(); dragDepth++; $('#drop').hidden = false; });
window.addEventListener('dragover', function (e) { e.preventDefault(); });
window.addEventListener('dragleave', function () { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#drop').hidden = true; });
window.addEventListener('drop', function (e) {
  e.preventDefault(); dragDepth = 0; $('#drop').hidden = true;
  // handles have to be asked for while the drop event runs
  var hp = !framed() ? Array.from(e.dataTransfer.items || []).map(function (i) { return i.kind === 'file' && i.getAsFileSystemHandle ? i.getAsFileSystemHandle() : null; }) : [];
  itemsFromDrop(e.dataTransfer).then(async function (items) {
    var hs = hp.length && hp.every(Boolean) ? (await Promise.all(hp.map(function (p) { return p.catch(function () { return null; }); }))).filter(Boolean) : [];
    openPicked(items, hs.length === hp.length && hs.length ? { handles: hs } : { items: items });
  });
});

/* ---------- chrome ---------- */
function showTab(name) {
  document.querySelectorAll('.tab').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === name); });
  document.querySelectorAll('.pane').forEach(function (p) { p.hidden = p.dataset.pane !== name; });
  if (window.matchMedia('(max-width: 780px)').matches) setPanel(true);
}
function setPanel(on) { $('#panel').classList.toggle('open', on); $('#panelBtn').setAttribute('aria-pressed', on); }
document.querySelectorAll('.tab').forEach(function (b) { b.addEventListener('click', function () { showTab(b.dataset.tab); }); });
$('#panelBtn').addEventListener('click', function () { setPanel(!$('#panel').classList.contains('open')); });
function setViewOpts(on) { $('#viewOpts').classList.toggle('open', on); $('#viewBtn').setAttribute('aria-expanded', on); $('#viewBtn').setAttribute('aria-pressed', on); }
$('#viewBtn').addEventListener('click', function (e) { e.stopPropagation(); setViewOpts(!$('#viewOpts').classList.contains('open')); });
document.addEventListener('click', function (e) { if (!e.target.closest('#viewOpts') && e.target.id !== 'viewBtn') setViewOpts(false); });
$('#zoomIn').addEventListener('click', function () { zoomAt(W / 2, H / 2, 1.5); });
$('#zoomOut').addEventListener('click', function () { zoomAt(W / 2, H / 2, 1 / 1.5); });
$('#fitBtn').addEventListener('click', fit);
$('#bordersChk').addEventListener('change', function (e) { state.borders = e.target.checked; requestDraw(); });
$('#gridChk').addEventListener('change', function (e) { state.grid = e.target.checked; requestDraw(); });

$('#palReset').addEventListener('click', function () { state.focus = null; state.hidden.clear(); dirtyAll(); dirtySeed(); renderPalette(); requestDraw(); });
if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);
if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', requestDraw);

if (typeof DecompressionStream === 'undefined') {
  toast('This browser cannot unpack map data. Use a current Chrome, Edge, Firefox or Safari.', 9000);
}
// settings kept between visits (this browser only)
var PREF_IDS = { borders: 'bordersChk', grid: 'gridChk', chests: 'chestChk', structs: 'structChk' }, prefsReady = false;
function savePrefs() {
  if (!prefsReady) return;
  var p = { level: state.level, objQ: $('#objQ').value, objSel: state.objSel || null, chestQ: $('#chestQ').value };
  for (var k in PREF_IDS) p[k] = $('#' + PREF_IDS[k]).checked;
  var tab = document.querySelector('.tab[aria-selected="true"]'); if (tab) p.tab = tab.dataset.tab;
  LS.set('prefs', p);
}
(function () {
  var p = LS.get('prefs', null) || {};
  for (var k in PREF_IDS) if (typeof p[k] === 'boolean') { var el = $('#' + PREF_IDS[k]); if (el.checked !== p[k]) { el.checked = p[k]; el.dispatchEvent(new Event('change')); } }
  if (LEVEL_LABEL[p.level]) state.level = p.level;
  if (p.tab && document.querySelector('.tab[data-tab="' + p.tab + '"]')) {
    document.querySelectorAll('.tab').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === p.tab); });
    document.querySelectorAll('.pane').forEach(function (pn) { pn.hidden = pn.dataset.pane !== p.tab; });
  }
  if (p.chestQ) { $('#chestQ').value = p.chestQ; $('#chestQ').dispatchEvent(new Event('input')); }
  if (p.objQ) { $('#objQ').value = p.objQ; state.objSel = p.objSel || null; }
  prefsReady = true;
  if (p.objQ) runObjSearch();
  Object.keys(PREF_IDS).forEach(function (k) { $('#' + PREF_IDS[k]).addEventListener('change', savePrefs); });
  $('#objQ').addEventListener('input', savePrefs); $('#chestQ').addEventListener('input', savePrefs);
  document.querySelectorAll('.tab').forEach(function (b) { b.addEventListener('click', function () { setTimeout(savePrefs, 0); }); });
})();
resize(); updateZoom();
refreshAll();
})();
