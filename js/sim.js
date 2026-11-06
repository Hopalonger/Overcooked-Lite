'use strict';
/* ============================================================
   Overcooked Lite - game simulation
   Pure game logic, no DOM. Runs on the host (or locally for couch co-op).
   Clients never run this; they just render snapshots.
   ============================================================ */

const COLS = 15, ROWS = 9;

// Legend:  . floor   C counter   V dirty-plate return counter
//          B bun crate  P patty crate  H cheese crate  L lettuce crate  T tomato crate
//          K chopping board  S stove  D serving window  W sink  R plate rack  X trash
const CLASSIC_MAP = [
  'CCBCPCHCLCTCCCC',
  'C.............D',
  'K.............D',
  'K...CCCCCCC...C',
  'C.............V',
  'S...CCCCCCC...W',
  'S.............W',
  'C.............X',
  'CCKCCKCCCCRCCCC',
];
let MAP = CLASSIC_MAP;               // the active kitchen layout (levels swap this)
function setMap(m) { MAP = m; }
// Floor types: . normal   i ice (slippery)   r l u d conveyor belts (push east/west/north/south)
const FLOORS = '.irlud';
const isFloor = (ch) => FLOORS.indexOf(ch) >= 0;
const BELT = { r: [1, 0], l: [-1, 0], u: [0, -1], d: [0, 1] };

const CRATE = { B: 'bun', P: 'patty', H: 'cheese', L: 'lettuce', T: 'tomato' };
const CHOPPABLE = { lettuce: true, tomato: true };

// Tunables
const T = {
  playerRadius: 0.32,
  speed: 4.6,
  dashSpeed: 10.5,
  dashTime: 0.16,
  dashCooldown: 1.0,
  chopTime: 2.4,       // seconds of holding "work" to chop
  washTime: 2.0,
  cookTime: 8,         // seconds on the stove until cooked
  burnTime: 18,        // seconds on the stove until burnt
  dirtyDelay: 6,       // seconds after serving until the dirty plate comes back
  startPlates: 3,
  maxPlate: 6,
  startLives: 3,
  timedLength: 300,
  beltSpeed: 1.9,
  iceGrip: 3.2,        // lower = more slippery
};

// Recipes unlock as the game goes on (`at` = seconds elapsed).
const RECIPES = [
  { id: 0, name: 'Burger',          at: 0,   ing: ['bun', 'patty'] },
  { id: 1, name: 'Side Salad',      at: 30,  ing: ['lettuce', 'tomato'] },
  { id: 2, name: 'Cheeseburger',    at: 60,  ing: ['bun', 'patty', 'cheese'] },
  { id: 3, name: 'Lettuce Burger',  at: 95,  ing: ['bun', 'patty', 'lettuce'] },
  { id: 4, name: 'Classic',         at: 130, ing: ['bun', 'patty', 'lettuce', 'tomato'] },
  { id: 5, name: 'Double Cheese',   at: 165, ing: ['bun', 'patty', 'patty', 'cheese'] },
  { id: 6, name: 'Deluxe',          at: 200, ing: ['bun', 'patty', 'cheese', 'lettuce', 'tomato'] },
  { id: 7, name: 'Double Deluxe',   at: 250, ing: ['bun', 'patty', 'patty', 'cheese', 'lettuce', 'tomato'] },
  // level-only recipes (never unlock in endless modes)
  { id: 8, name: 'Tomato Burger',   at: 1e9, ing: ['bun', 'patty', 'tomato'] },
  { id: 9, name: 'Cheese Salad',    at: 1e9, ing: ['lettuce', 'tomato', 'cheese'] },
  { id: 10, name: 'Triple Stack',   at: 1e9, ing: ['bun', 'patty', 'patty', 'patty', 'cheese', 'tomato'] },
];
RECIPES.forEach(r => { r.sig = sigOf(r.ing); });

function sigOf(list) { return list.slice().sort().join(','); }
const rnd = (v, d = 3) => { const m = Math.pow(10, d); return Math.round(v * m) / m; };

function isSolid(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
  return !isFloor(MAP[ty][tx]);
}
function circleHits(x, y, r) {
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
  const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
  for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) {
    if (!isSolid(tx, ty)) continue;
    const nx = Math.max(tx, Math.min(x, tx + 1));
    const ny = Math.max(ty, Math.min(y, ty + 1));
    const dx = x - nx, dy = y - ny;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}
function moveEntity(p, dx, dy) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 0.05));
  const sx = dx / steps, sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    if (!circleHits(p.x + sx, p.y, T.playerRadius)) p.x += sx;
    if (!circleHits(p.x, p.y + sy, T.playerRadius)) p.y += sy;
  }
}

function newItem(kind) {
  if (kind === 'plate') return { k: 'plate', c: [] };
  if (kind === 'dirty') return { k: 'dirty' };
  return { k: kind, s: 0, p: 0 };
}
// Can this item be put on a plate?
function canPlate(it) {
  if (!it) return false;
  switch (it.k) {
    case 'bun': case 'cheese': return true;
    case 'patty': return it.s === 1;
    case 'lettuce': case 'tomato': return it.s === 1;
  }
  return false;
}

const SPAWNS = [[3.5, 2.5], [3.5, 6.5], [10.5, 2.5], [10.5, 6.5]];

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const lerp = (a, b, f) => a + (b - a) * f;
// Orders arrive more slowly with fewer cooks (multiplier on the gap between orders)
const IV_SCALE = { 1: 1.8, 2: 1, 3: 0.78, 4: 0.64 };

/** setup: { kind: 'level', level: n } | { kind: 'survival' } | { kind: 'timed' } */
function mapFor(setup) {
  if (setup && setup.kind === 'level' && typeof LEVELS !== 'undefined' && LEVELS[setup.level - 1]) return LEVELS[setup.level - 1].map;
  return CLASSIC_MAP;
}
function levelOf(setup) {
  return (setup && setup.kind === 'level' && typeof LEVELS !== 'undefined') ? LEVELS[setup.level - 1] || null : null;
}

class Sim {
  /** players: [{id, name, color}] */
  constructor(players, setup, prevInputs) {
    if (typeof setup === 'string') setup = { kind: setup };
    setup = setup || { kind: 'survival' };
    const lv = this.level = levelOf(setup);
    this.mode = lv ? 'level' : setup.kind;
    setMap(lv ? lv.map : CLASSIC_MAP);
    this.cfg = Object.assign({}, T, lv && lv.cfg);
    this.rand = lv ? mulberry32(lv.id * 1013 + 7) : Math.random;
    this.spawns = (lv && lv.spawns) || SPAWNS;
    this.phase = 'play';
    this.t = 0;
    this.timeLeft = lv ? lv.time : T.timedLength;
    this.score = 0;
    this.lives = T.startLives;
    this.streak = 0;
    this.delivered = 0;
    this.expired = 0;
    this.orders = [];
    this.orderSeq = 1;
    this.spawnTimer = 2;
    this.forced = lv && lv.first ? lv.first.slice() : [];
    this.tipI = 0;
    this.dirtyQ = [];
    this.ev = [];
    this.inputs = {};
    this.ts = {};       // per-tile state
    this.returnIdx = -1;
    this.racks = [];
    const dishes = !(lv && lv.dishes === false);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const ch = MAP[y][x], i = y * COLS + x;
      if ('CVKS'.includes(ch)) this.ts[i] = { item: null };
      if (ch === 'V') this.returnIdx = i;
      if (ch === 'W') this.ts[i] = { dirty: 0, p: 0 };
      if (ch === 'R') { const r = this.ts[i] = { clean: 0, inf: !dishes }; this.racks.push(r); }
    }
    const np = Math.max(1, this.racks.length), total = this.cfg.startPlates;
    this.racks.forEach((r, k) => { r.clean = r.inf ? 99 : Math.floor(total / np) + (k < total % np ? 1 : 0); });
    this.dishes = dishes;
    this.players = [];
    players.forEach((pl, n) => this.addPlayer(pl, n, prevInputs));
    const ps = IV_SCALE[Math.max(1, Math.min(4, players.length))] || 1;
    this.ivScale = ps;
    this.th = lv ? lv.stars.map(v => Math.max(5, Math.round(v / ps / 5) * 5)) : null;
  }

  addPlayer(pl, n, prevInputs) {
    const sp = this.spawns[n % 4];
    const old = (prevInputs && prevInputs[pl.id]) || {};
    this.players.push({
      id: pl.id, name: pl.name, color: pl.color,
      x: sp[0], y: sp[1], fx: 0, fy: 1, vx: 0, vy: 0,
      item: null, working: false,
      dashT: 0, dashCD: 0, ddx: 0, ddy: 0,
      actSeen: old.act || 0, dashSeen: old.dash || 0,
    });
  }
  removePlayer(id) {
    this.players = this.players.filter(p => p.id !== id);
    delete this.inputs[id];
  }
  setInput(id, inp) { this.inputs[id] = inp; }

  // ---------- targeting ----------
  target(p) {
    for (const d of [0.62, 0.95]) {
      const tx = Math.floor(p.x + p.fx * d), ty = Math.floor(p.y + p.fy * d);
      if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) continue;
      const ch = MAP[ty][tx];
      if (!isFloor(ch)) return { x: tx, y: ty, ch, idx: ty * COLS + tx };
    }
    return null;
  }

  // ---------- main tick ----------
  step(dt) {
    if (this.phase !== 'play') return;
    this.t += dt;
    if (this.level) {
      const tips = this.level.tips || [];
      while (this.tipI < tips.length && this.t >= tips[this.tipI].t) this.ev.push({ e: 'tip', s: tips[this.tipI++].s });
    }
    if (this.mode === 'timed' || this.mode === 'level') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.phase = 'over'; this.ev.push({ e: 'over' }); return; }
    }
    for (const p of this.players) this.updatePlayer(p, dt);
    this.separate();
    this.updateStoves(dt);
    this.updateDishes(dt);
    this.updateOrders(dt);
  }

  updatePlayer(p, dt) {
    const inp = this.inputs[p.id] || {};
    let dx = inp.dx || 0, dy = inp.dy || 0;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    if (len > 0.2) {
      if (Math.abs(dx) > Math.abs(dy)) { p.fx = Math.sign(dx); p.fy = 0; }
      else { p.fx = 0; p.fy = Math.sign(dy); }
    }
    p.dashCD = Math.max(0, p.dashCD - dt);
    if ((inp.dash || 0) > p.dashSeen) {
      p.dashSeen = inp.dash;
      if (p.dashCD <= 0) {
        p.dashT = T.dashTime; p.dashCD = T.dashCooldown;
        const m = Math.hypot(dx, dy);
        if (len > 0.2 && m > 0) { p.ddx = dx / m; p.ddy = dy / m; }
        else { p.ddx = p.fx; p.ddy = p.fy; }
        this.ev.push({ e: 'dash', x: p.x, y: p.y });
      }
    }
    const fl = (MAP[Math.floor(p.y)] || '')[Math.floor(p.x)] || '.';
    const wantX = len > 0.05 ? dx * T.speed : 0, wantY = len > 0.05 ? dy * T.speed : 0;
    if (fl === 'i') {                        // ice: velocity eases toward the wanted velocity
      const k = Math.min(1, dt * this.cfg.iceGrip);
      p.vx += (wantX - p.vx) * k; p.vy += (wantY - p.vy) * k;
    } else { p.vx = wantX; p.vy = wantY; }
    const ox = p.x, oy = p.y;
    if (p.dashT > 0) {
      p.dashT -= dt;
      moveEntity(p, p.ddx * T.dashSpeed * dt, p.ddy * T.dashSpeed * dt);
      p.vx = p.ddx * T.speed; p.vy = p.ddy * T.speed;
    } else if (Math.abs(p.vx) + Math.abs(p.vy) > 0.02) {
      moveEntity(p, p.vx * dt, p.vy * dt);
      if (Math.abs(p.x - ox) < Math.abs(p.vx * dt) * 0.3) p.vx = 0;   // bumped a wall
      if (Math.abs(p.y - oy) < Math.abs(p.vy * dt) * 0.3) p.vy = 0;
    }
    const b = BELT[fl];
    if (b) moveEntity(p, b[0] * T.beltSpeed * dt, b[1] * T.beltSpeed * dt);

    if ((inp.act || 0) > p.actSeen) {
      p.actSeen = inp.act;
      this.interact(p);
    }
    if (inp.work) this.work(p, dt); else p.working = false;
  }

  separate() {
    const ps = this.players, D = T.playerRadius * 2 * 0.95;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d >= D) continue;
      if (d < 1e-4) { dx = 1; dy = 0; d = 1; }
      const push = (D - d) / 2 + 0.001;
      const ux = dx / d, uy = dy / d;
      moveEntity(a, -ux * push, -uy * push);
      moveEntity(b, ux * push, uy * push);
    }
  }

  updateStoves(dt) {
    const c = this.cfg;
    for (const k in this.ts) {
      const ts = this.ts[k];
      if (MAP[Math.floor(k / COLS)][k % COLS] !== 'S') continue;
      const it = ts.item;
      if (it && it.k === 'patty') {
        const before = it.s;
        it.p += dt;
        it.s = it.p >= c.burnTime ? 2 : it.p >= c.cookTime ? 1 : 0;
        if (it.s !== before) {
          const x = k % COLS + 0.5, y = Math.floor(k / COLS) + 0.5;
          this.ev.push({ e: it.s === 1 ? 'cooked' : 'burnt', x, y });
        }
      }
    }
  }

  updateDishes(dt) {
    for (let i = this.dirtyQ.length - 1; i >= 0; i--) {
      this.dirtyQ[i] -= dt;
      if (this.dirtyQ[i] <= 0) {
        const ts = this.ts[this.returnIdx];
        if (ts && !ts.item) {
          ts.item = newItem('dirty');
          this.dirtyQ.splice(i, 1);
          this.ev.push({ e: 'dirty', x: this.returnIdx % COLS + 0.5, y: Math.floor(this.returnIdx / COLS) + 0.5 });
        }
      }
    }
  }

  // ---------- difficulty ramp ----------
  frac() { return this.level ? Math.min(1, this.t / this.level.time) : 0; }
  maxActive() {
    const lv = this.level;
    if (lv) return Math.round(lerp(lv.max[0], lv.max[1], this.frac()));
    return Math.min(6, 2 + Math.floor(this.t / 50));
  }
  spawnInterval() {
    const lv = this.level;
    if (lv) return lerp(lv.iv[0], lv.iv[1], this.frac()) * this.ivScale;
    const np = Math.max(1, this.players.length);
    return Math.max(6.5, 24 - this.t * 0.06) * (1 - 0.12 * (np - 2));
  }
  orderLimit(n) {
    const lv = this.level;
    if (lv) return lerp(lv.ot[0], lv.ot[1], this.frac()) + 5 * (n - 2);
    return Math.max(50, 80 - this.t * 0.1) + 6 * (n - 2);
  }
  unlockedEntries() {
    if (this.level) return this.level.pool.filter(e => (e.at || 0) <= this.t).sort((a, b) => (a.at || 0) - (b.at || 0));
    return RECIPES.filter(r => r.at <= this.t).map(r => ({ r: r.id, w: 1 }));
  }
  unlocked() { return this.unlockedEntries().map(e => RECIPES[e.r]); }

  spawnOrder() {
    let r;
    if (this.forced.length) r = RECIPES[this.forced.shift()];
    else {
      const pool = this.unlockedEntries();
      // endless mode: newer recipes are a bit more likely so the mix shifts toward harder dishes
      const w = pool.map((e, i) => this.level ? (e.w || 1) : 1 + i * 0.5);
      let x = this.rand() * w.reduce((a, b) => a + b, 0);
      r = RECIPES[pool[0].r];
      for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) { r = RECIPES[pool[i].r]; break; } }
    }
    const limit = this.orderLimit(r.ing.length);
    this.orders.push({ id: this.orderSeq++, r: r.id, sig: r.sig, t: limit, limit });
    this.ev.push({ e: 'order' });
  }

  updateOrders(dt) {
    for (let i = this.orders.length - 1; i >= 0; i--) {
      const o = this.orders[i];
      o.t -= dt;
      if (o.t <= 0) {
        this.orders.splice(i, 1);
        this.streak = 0;
        this.expired++;
        const pen = this.level ? (this.level.penalty || 0) : 0;
        if (pen) this.score = Math.max(0, this.score - pen);
        this.ev.push({ e: 'expire', pen });
        if (this.mode === 'survival') {
          this.lives--;
          if (this.lives <= 0) { this.lives = 0; this.phase = 'over'; this.ev.push({ e: 'over' }); return; }
        }
      }
    }
    this.spawnTimer -= dt;
    if (this.orders.length === 0 && this.spawnTimer > 3) this.spawnTimer = 3;
    if (this.spawnTimer <= 0) {
      if (this.orders.length < this.maxActive()) this.spawnOrder();
      this.spawnTimer = this.spawnInterval();
    }
  }

  // ---------- actions ----------
  work(p, dt) {
    p.working = false;
    if (p.item) return;
    const t = this.target(p);
    if (!t) return;
    const ts = this.ts[t.idx];
    if (t.ch === 'K') {
      const it = ts.item;
      if (it && CHOPPABLE[it.k] && it.s === 0) {
        p.working = true;
        it.p += dt / T.chopTime;
        if (it.p >= 1) { it.s = 1; it.p = 0; this.ev.push({ e: 'chopped', x: t.x + 0.5, y: t.y + 0.5 }); }
      }
    } else if (t.ch === 'W') {
      if (ts.dirty > 0) {
        p.working = true;
        ts.p += dt / T.washTime;
        if (ts.p >= 1) {
          ts.p = 0; ts.dirty--;
          const rack = this.racks.reduce((a, b) => (b.clean < a.clean ? b : a), this.racks[0]);
          if (rack) rack.clean++;
          this.ev.push({ e: 'washed', x: t.x + 0.5, y: t.y + 0.5 });
        }
      } else ts.p = 0;
    }
  }

  interact(p) {
    const t = this.target(p);
    if (!t) return;
    const ch = t.ch, ts = this.ts[t.idx], held = p.item;
    const cx = t.x + 0.5, cy = t.y + 0.5;
    const ok = (e) => this.ev.push({ e, x: cx, y: cy });
    const bad = () => this.ev.push({ e: 'bad', x: cx, y: cy });

    if (CRATE[ch]) {
      if (!held) { p.item = newItem(CRATE[ch]); ok('pick'); } else bad();
      return;
    }
    if (ch === 'X') {
      if (!held) return bad();
      if (held.k === 'plate') { if (held.c.length) { held.c = []; ok('trash'); } else bad(); }
      else { p.item = null; ok('trash'); }
      return;
    }
    if (ch === 'D') {
      if (!held || held.k !== 'plate' || !held.c.length) return bad();
      const sig = sigOf(held.c);
      const o = this.orders.find(o => o.sig === sig);
      if (!o) return bad();
      this.orders.splice(this.orders.indexOf(o), 1);
      const n = held.c.length, base = 15 * n;
      const tip = Math.round(base * 0.5 * Math.max(0, o.t / o.limit));
      const mult = 1 + 0.1 * Math.min(this.streak, 5);
      const pts = Math.round((base + tip) * mult);
      this.score += pts;
      this.streak++;
      this.delivered++;
      p.item = null;
      if (this.dishes) this.dirtyQ.push(T.dirtyDelay);
      this.ev.push({ e: 'deliver', x: cx, y: cy, pts, tip });
      return;
    }
    if (ch === 'W') {
      if (held && held.k === 'dirty') { ts.dirty++; p.item = null; ok('put'); } else bad();
      return;
    }
    if (ch === 'R') {
      if (!held) {
        if (ts.inf || ts.clean > 0) { if (!ts.inf) ts.clean--; p.item = newItem('plate'); ok('pick'); } else bad();
      } else if (held.k === 'plate' && !held.c.length) { if (!ts.inf) ts.clean++; p.item = null; ok('put'); }
      else bad();
      return;
    }
    // surfaces: C V K S
    const tgt = ts.item;
    if (!held && tgt) { p.item = tgt; ts.item = null; ok('pick'); return; }
    if (held && !tgt) {
      const accepts = (ch === 'C' || ch === 'V') ||
        (ch === 'K' && CHOPPABLE[held.k] && held.s === 0) ||
        (ch === 'S' && held.k === 'patty');
      if (accepts) { ts.item = held; p.item = null; ok('put'); } else bad();
      return;
    }
    if (held && tgt) {
      if (held.k === 'plate' && canPlate(tgt) && held.c.length < T.maxPlate) {
        held.c.push(tgt.k); ts.item = null; ok('put');
      } else if (tgt.k === 'plate' && canPlate(held) && tgt.c.length < T.maxPlate) {
        tgt.c.push(held.k); p.item = null; ok('put');
      } else bad();
    }
  }

  // ---------- serialization ----------
  drainEvents() { const e = this.ev; this.ev = []; return e; }

  snapshot() {
    const clone = (it) => {
      if (!it) return null;
      if (it.k === 'plate') return { k: 'plate', c: it.c.slice() };
      if (it.k === 'dirty') return { k: 'dirty' };
      return { k: it.k, s: it.s, p: rnd(it.p, 2) };
    };
    const tiles = [];
    for (const k in this.ts) {
      const s = this.ts[k];
      if (s.item) tiles.push({ i: +k, item: clone(s.item) });
      else if (s.dirty !== undefined) tiles.push({ i: +k, dirty: s.dirty, p: rnd(s.p, 2) });
      else if (s.clean !== undefined) tiles.push({ i: +k, clean: s.clean, inf: s.inf ? 1 : 0 });
    }
    const un = this.unlockedEntries();
    return {
      ph: this.phase, mode: this.mode, lid: this.level ? this.level.id : 0, th: this.th,
      cc: this.cfg.cookTime, cb: this.cfg.burnTime,
      t: rnd(this.t, 1), tl: rnd(this.timeLeft, 1),
      sc: this.score, lv: this.lives, st: this.streak, dl: this.delivered, ex: this.expired,
      p: this.players.map(p => ({
        id: p.id, n: p.name, c: p.color,
        x: rnd(p.x), y: rnd(p.y), fx: p.fx, fy: p.fy,
        it: clone(p.item), w: p.working ? 1 : 0,
        dc: rnd(p.dashCD, 2), dt: p.dashT > 0 ? 1 : 0,
      })),
      o: this.orders.map(o => ({ id: o.id, r: o.r, t: rnd(o.t, 1), l: Math.round(o.limit) })),
      ts: tiles,
      nr: un.length, nw: un.length ? un[un.length - 1].r : 0,
    };
  }
}
