'use strict';
/* ============================================================
   Overcooked Lite - app glue: menus, lobby, game loop, networking roles
   Roles:  local  = couch co-op, everything in this tab
           host   = runs the simulation, streams snapshots to clients
           client = sends inputs, renders snapshots from the host
   ============================================================ */
const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
};

const App = {
  screen: 'menu',     // menu | lobby | play | over
  role: 'none',       // none | local | host | client
  roster: [],         // [{id, name, color, pid?}]
  myId: 0, code: null,
  setup: 'L1',        // 'L<n>' campaign level, or 'survival' / 'timed' endless
  sim: null, view: null,
  cd: 0, lastCd: -1, paused: false,
  evBuf: [], netEv: [], inputs: {}, lastSeen: {}, fresh: {},
  sendT: 0, lastSent: null, lastSentAt: 0, alive: {},
  idle: null,
};

function cleanName(n) { n = String(n || '').replace(/[<>]/g, '').trim().slice(0, 10); return n || 'Chef'; }
function myName() { return cleanName($('name').value); }
function toast(msg, ms) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('show'), ms || 3500);
}

// ---------- campaign progress & setups ----------
const Prog = {
  data: (() => { try { return JSON.parse(store.get('oc-prog', '{}')) || {}; } catch (e) { return {}; } })(),
  all() { return store.get('oc-unlockall', '0') === '1'; },
  stars(n) { return (this.data[n] && this.data[n].stars) || 0; },
  best(n) { return (this.data[n] && this.data[n].best) || 0; },
  unlocked(n) { return n <= 1 || this.all() || this.stars(n - 1) >= 1; },
  total() { let s = 0; for (let n = 1; n <= LEVELS.length; n++) s += this.stars(n); return s; },
  next() { for (let n = 1; n <= LEVELS.length; n++) if (this.stars(n) < 1) return n; return LEVELS.length; },
  record(n, stars, score) {
    const cur = this.data[n] || { stars: 0, best: 0 };
    const record = score > cur.best;
    this.data[n] = { stars: Math.max(cur.stars, stars), best: Math.max(cur.best, score) };
    store.set('oc-prog', JSON.stringify(this.data));
    return record;
  },
};
function parseSetup(s) { return (s && s[0] === 'L') ? { kind: 'level', level: +s.slice(1) } : { kind: s || 'survival' }; }
function setupTitle(s) {
  const p = parseSetup(s);
  if (p.kind === 'level') return 'Level ' + p.level + ': ' + LEVELS[p.level - 1].name;
  return p.kind === 'timed' ? 'Endless: Timed (5:00)' : 'Endless: Survival (3 lives)';
}
function setupBlurb(s) {
  const p = parseSetup(s);
  if (p.kind === 'level') return LEVELS[p.level - 1].blurb;
  return p.kind === 'timed' ? 'Score as much as you can in five minutes. Orders keep escalating.'
    : 'No time limit. Each missed order costs a life. How long can you last?';
}
function showTip(s) {
  const el = $('tip'); el.textContent = s; el.classList.add('show');
  clearTimeout(showTip.h); showTip.h = setTimeout(() => el.classList.remove('show'), Math.max(7000, s.length * 110));
}
function cdShow(n) { return n > 3 ? -1 : n; }

// ---------- screens ----------
function show(screen) {
  App.screen = screen;
  for (const s of ['menu', 'lobby', 'over', 'picker']) $(s).classList.toggle('hidden', s !== screen);
  $('hint').classList.toggle('hidden', screen !== 'play' && screen !== 'over');
  if (screen !== 'play') setCd(-1);
  if (screen !== 'play' && screen !== 'over') $('tip').classList.remove('show');
}

function backToMenu(msg) {
  App.role = 'none';
  Net.close();
  App.sim = null; App.view = null; App.paused = false;
  Renderer.reset(); show('menu'); renderMenuLevel();
  if (msg) toast(msg);
}

// ---------- local co-op ----------
function startLocal() {
  Audio_.unlock();
  const n = +$('localCount').value;
  App.role = 'local'; Input.mode = 'local';
  App.roster = [];
  for (let i = 0; i < n; i++) App.roster.push({ id: i, name: PNAME[i], color: i });
  startGame();
}

// ---------- hosting ----------
function startHosting() {
  Audio_.unlock();
  $('btnHost').disabled = true; toast('Opening room…', 8000);
  App.role = 'host'; Input.mode = 'solo';
  Net.host({
    onOpen(code) {
      $('btnHost').disabled = false; $('toast').classList.remove('show');
      App.code = code; App.myId = 0;
      App.roster = [{ id: 0, name: myName(), color: 0 }];
      showLobby();
    },
    onJoin(pid, conn) {
      if (App.screen !== 'lobby' || App.roster.length >= 4) {
        conn.send({ t: 'full', why: App.screen !== 'lobby' ? 'That game has already started.' : 'That room is full (4 players max).' });
        Net.kick(pid); return;
      }
      let id = 0; while (App.roster.some(r => r.id === id)) id++;
      App.roster.push({ id, name: 'Chef', color: id, pid });
      App.alive[pid] = performance.now();
      Net.sendTo(pid, { t: 'welcome', id });
      broadcastLobby();
    },
    onMsg(pid, m) {
      const r = App.roster.find(r => r.pid === pid);
      if (!r || !m) return;
      App.alive[pid] = performance.now();
      if (m.t === 'hello') { r.name = cleanName(m.name); broadcastLobby(); }
      else if (m.t === 'in') {
        if (App.fresh[r.id] && App.sim) {
          const p = App.sim.players.find(p => p.id === r.id);
          if (p) { p.actSeen = m.act || 0; p.dashSeen = m.dash || 0; }
          delete App.fresh[r.id];
        }
        App.inputs[r.id] = { dx: +m.dx || 0, dy: +m.dy || 0, work: !!m.work, act: m.act | 0, dash: m.dash | 0 };
        App.lastSeen[r.id] = performance.now();
      }
    },
    onLeave(pid) {
      const r = App.roster.find(r => r.pid === pid);
      if (!r) return;
      App.roster = App.roster.filter(x => x !== r);
      if (App.sim) App.sim.removePlayer(r.id);
      toast(r.name + ' left the kitchen');
      broadcastLobby();
    },
    onError(err) {
      $('btnHost').disabled = false;
      backToMenu(err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error'
        ? "Couldn't reach the matchmaking server. Check your connection and try again."
        : 'Network error: ' + (err.type || err));
    },
  });
}

// Drop clients whose connection died without a clean close (PeerJS can take ~30s to notice).
function pruneDead() {
  if (App.role !== 'host') return;
  const now = performance.now();
  for (const r of App.roster.slice()) {
    if (r.pid && now - (App.alive[r.pid] || now) > 8000) { Net.kick(r.pid); r.dead = true; }
  }
  const dead = App.roster.filter(r => r.dead);
  if (dead.length) {
    App.roster = App.roster.filter(r => !r.dead);
    dead.forEach(r => { if (App.sim) App.sim.removePlayer(r.id); toast(r.name + ' timed out'); });
    broadcastLobby();
  }
}

function broadcastLobby(back) {
  Net.broadcast({ t: 'lobby', back: !!back, roster: App.roster.map(r => ({ id: r.id, name: r.name, color: r.color })), setup: App.setup, code: App.code });
  if (App.screen === 'lobby') renderLobby();
}

// ---------- joining ----------
function joinRoom(code) {
  code = String(code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (code.length !== 4) return toast('Room codes are 4 letters.');
  Audio_.unlock();
  App.role = 'client'; Input.mode = 'solo'; App.code = code;
  toast('Joining ' + code + '…', 15000);
  Net.join(code, {
    onOpen() { $('toast').classList.remove('show'); Net.sendHost({ t: 'hello', name: myName() }); },
    onMsg: handleClientMsg,
    onClose() { setTimeout(() => { if (App.role === 'client') backToMenu('Disconnected from the host.'); }, 400); },
    onError(err) {
      backToMenu(err.type === 'peer-unavailable' ? 'No room found with code ' + code + '.'
        : err.type === 'timeout' ? "Couldn't connect. A strict network/firewall may be blocking peer-to-peer."
        : 'Connection error: ' + (err.type || err));
    },
  });
}

function handleClientMsg(m) {
  if (!m) return;
  switch (m.t) {
    case 'welcome': App.myId = m.id; break;
    case 'full': backToMenu(m.why || 'Could not join.'); break;
    case 'lobby':
      App.roster = m.roster; App.setup = m.setup || App.setup; App.code = m.code || App.code;
      if (App.screen !== 'lobby' && (m.back || App.screen === 'menu')) { App.view = null; Renderer.reset(); show('lobby'); }
      renderLobby();
      break;
    case 'start':
      App.setup = m.setup || App.setup; setMap(mapFor(parseSetup(App.setup)));
      App.view = null; App.lastCd = -1; Renderer.reset(); setupHint(); show('play');
      break;
    case 's':
      if (App.screen !== 'play' && App.screen !== 'over') break;
      App.view = m.v;
      for (const e of m.ev || []) App.evBuf.push(e);
      if (m.v.ph === 'over' && App.screen === 'play') showOver(m.v);
      break;
  }
}

// ---------- lobby ----------
function renderLobby() {
  const isHost = App.role === 'host';
  $('lobbyCode').textContent = App.code || '----';
  const list = $('players'); list.innerHTML = '';
  App.roster.forEach(r => {
    const li = document.createElement('li');
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = PCOL[r.color % 4];
    li.appendChild(dot);
    li.appendChild(document.createTextNode(r.name + (r.id === 0 ? ' (host)' : '') + (r.id === App.myId ? ' — you' : '')));
    list.appendChild(li);
  });
  for (let i = App.roster.length; i < 4; i++) {
    const li = document.createElement('li'); li.className = 'empty'; li.textContent = 'waiting for player…'; list.appendChild(li);
  }
  $('lobbyLevelName').textContent = setupTitle(App.setup);
  $('lobbyLevelBlurb').textContent = setupBlurb(App.setup);
  $('btnLobbyLevel').classList.toggle('hidden', !isHost);
  $('btnStart').classList.toggle('hidden', !isHost);
  $('lobbyWait').classList.toggle('hidden', isHost);
  $('lobbyUrl').textContent = shareLink();
}
function shareLink() { return location.origin + location.pathname + '?room=' + (App.code || ''); }

function showLobby() { Renderer.reset(); show('lobby'); renderLobby(); }

// ---------- game start ----------
function setupHint() {
  const h = $('hint'); h.innerHTML = '';
  const line = (col, txt) => {
    const d = document.createElement('div'); d.className = 'hl';
    const dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = col;
    d.appendChild(dot); d.appendChild(document.createTextNode(txt)); h.appendChild(d);
  };
  if (App.role === 'local') {
    App.roster.forEach((r, i) => line(PCOL[i], i < 3 ? SCHEMES[i].help : 'Gamepad: stick move · A pick up/put down · X hold to chop/wash · B dash'));
    if (App.roster.length > 0) line('#999', 'Gamepads also work for any player (1st pad = player 1, etc).  Esc = pause · M = mute');
  } else {
    line(PCOL[App.myId % 4], 'WASD / arrows move · Space pick up/put down · hold E chop/wash · Shift dash · gamepad works too · M mute');
  }
}

function startGame() {
  const players = App.roster.map(r => ({ id: r.id, name: r.name, color: r.color }));
  const prev = {};
  if (App.role === 'local') App.roster.forEach((r, i) => { prev[r.id] = Input.read(i); });
  else { prev[0] = Input.read(SOLO); }
  const setup = parseSetup(App.setup);
  App.sim = new Sim(players, setup, prev);
  App.inputs = {}; App.lastSeen = {}; App.fresh = {};
  if (App.role === 'host') App.roster.forEach(r => { if (r.id !== 0) App.fresh[r.id] = true; });
  App.cd = setup.kind === 'level' ? 6.4 : 3.4; App.lastCd = -1; App.paused = false; App.netEv = []; App.evBuf = [];
  Renderer.reset(); setupHint(); show('play');
  if (App.role === 'host') Net.broadcast({ t: 'start', setup: App.setup });
}

// ---------- countdown / over ----------
function setCd(n) {
  const el = $('cd');
  if (n === App.lastCd) return;
  const prev = App.lastCd; App.lastCd = n;
  if (n > 0) { el.textContent = n; el.className = 'show'; Audio_.play('beep'); }
  else if (n === 0 && prev > 0) { el.textContent = 'GO!'; el.className = 'show go'; Audio_.play('go'); setTimeout(() => { if (App.lastCd === 0) el.className = ''; }, 700); }
  else el.className = '';
}

function showOver(v) {
  show('over');
  const isHost = App.role !== 'client';
  let html, title;
  if (v.mode === 'level') {
    const stars = starsFor(v.sc, v.th), prevBest = Prog.stars(v.lid);
    const record = Prog.record(v.lid, stars, v.sc);
    title = stars > 0 ? (stars === 3 ? 'Perfect service!' : 'Level complete!') : 'Not quite…';
    const next = v.th.find(t => v.sc < t);
    html = `<div class="stars">${[0, 1, 2].map(i => `<span class="${i < stars ? 'on' : ''}">★</span>`).join('')}</div>` +
      `<div class="big">${v.sc}</div>` +
      `<div class="sub">${stars === 0 ? 'Score ' + v.th[0] + ' for one star – give it another go!' : next ? 'Next star at ' + next : 'All stars earned!'}${record && v.sc > 0 ? ' · New best!' : ''}</div>` +
      `<div class="row"><span>Orders served</span><b>${v.dl}</b></div><div class="row"><span>Orders missed</span><b>${v.ex}</b></div>`;
    const hasNext = stars > 0 && v.lid < LEVELS.length;
    $('btnNext').classList.toggle('hidden', !(isHost && hasNext));
    $('btnAgain').textContent = 'Retry level';
    $('btnAgain').className = (isHost && hasNext) ? 'ghost' : 'primary';
    if (stars > 0 && v.lid < LEVELS.length && !prevBest) $('overNote').textContent = 'Level ' + (v.lid + 1) + ' unlocked!';
    else $('overNote').textContent = '';
  } else {
    const survival = v.mode === 'survival';
    title = survival ? 'Kitchen shut down!' : "Time's up!";
    const key = 'oc-best-' + v.mode, best = +store.get(key, 0);
    const record = v.sc > best;
    if (record) store.set(key, v.sc);
    const mm = Math.floor(v.t / 60) + ':' + String(Math.floor(v.t % 60)).padStart(2, '0');
    html = `<div class="big">${v.sc}</div><div class="sub">${record && v.sc > 0 ? 'New personal best!' : 'Best on this device: ' + Math.max(best, v.sc)}</div>` +
      `<div class="row"><span>Orders served</span><b>${v.dl}</b></div><div class="row"><span>Orders missed</span><b>${v.ex}</b></div>` +
      `<div class="row"><span>Kitchen survived</span><b>${mm}</b></div>`;
    $('btnNext').classList.add('hidden');
    $('btnAgain').textContent = 'Play again'; $('btnAgain').className = 'primary';
    $('overNote').textContent = '';
  }
  $('overTitle').textContent = title;
  $('overStats').innerHTML = html;
  $('overHost').classList.toggle('hidden', !isHost);
  $('overClient').classList.toggle('hidden', isHost);
  $('btnLobby').textContent = App.role === 'local' ? 'Main menu' : 'Back to lobby';
}


// ---------- level briefing during the countdown ----------
let briefKey = '';
function updateBrief(view) {
  const el = $('brief');
  const on = !!(view && view.lid && view.cd > 0 && (App.screen === 'play'));
  if (!on) { el.classList.add('hidden'); briefKey = ''; return; }
  const key = view.lid + ':' + view.th.join();
  if (key !== briefKey) {
    briefKey = key;
    const lv = LEVELS[view.lid - 1];
    const names = [...new Set(lv.pool.map(e => RECIPES[e.r].name))];
    el.innerHTML = `<div class="bl">LEVEL ${lv.id}</div><div class="bt">${lv.name}</div><div class="bd">${lv.blurb}</div>` +
      `<div class="bs">★ ${view.th[0]} &nbsp; ★★ ${view.th[1]} &nbsp; ★★★ ${view.th[2]}</div>` +
      `<div class="bm">Menu: ${names.join(' · ')}</div>`;
  }
  el.classList.remove('hidden');
}

// ---------- level picker ----------
const Picker = {
  from: 'menu', sel: 'L1', built: false,
  thFor(lv, np) { const ps = IV_SCALE[Math.max(1, Math.min(4, np))] || 1; return lv.stars.map(v => Math.max(5, Math.round(v / ps / 5) * 5)); },
  players() { return App.role === 'host' ? App.roster.length : +$('localCount').value; },
  open(from) {
    this.from = from; this.sel = App.setup; this.build(); this.refresh(); show('picker');
  },
  build() {
    const grid = $('pickGrid'); grid.innerHTML = '';
    LEVELS.forEach(lv => {
      const b = document.createElement('button'); b.className = 'card'; b.dataset.v = 'L' + lv.id;
      const cv = document.createElement('canvas'); drawMapThumb(cv, lv.map); b.appendChild(cv);
      const n = document.createElement('div'); n.className = 'cn'; n.textContent = lv.id + '. ' + lv.name; b.appendChild(n);
      const s = document.createElement('div'); s.className = 'cs'; b.appendChild(s);
      b.onclick = () => { if (!b.classList.contains('locked')) { this.sel = b.dataset.v; this.refresh(); } };
      grid.appendChild(b);
    });
    const eg = $('pickEndless'); eg.innerHTML = '';
    [['survival', 'Survival', '3 lives, no time limit'], ['timed', 'Timed', '5 minutes']].forEach(([v, n, d]) => {
      const b = document.createElement('button'); b.className = 'card endless'; b.dataset.v = v;
      b.innerHTML = `<div class="cn">∞ ${n}</div><div class="cs">${d}</div>`;
      b.onclick = () => { this.sel = v; this.refresh(); };
      eg.appendChild(b);
    });
    $('pickAll').checked = Prog.all();
    this.built = true;
  },
  refresh() {
    document.querySelectorAll('#picker .card').forEach(b => {
      const v = b.dataset.v;
      if (v[0] === 'L') {
        const n = +v.slice(1), st = Prog.stars(n), ok = Prog.unlocked(n);
        b.classList.toggle('locked', !ok);
        b.querySelector('.cs').textContent = ok ? '★'.repeat(st) + '☆'.repeat(3 - st) : '🔒 locked';
        b.querySelector('.cs').className = 'cs' + (st ? ' got' : '');
      }
      b.classList.toggle('sel', v === this.sel);
    });
    const p = parseSetup(this.sel), np = this.players();
    let h = `<h3>${setupTitle(this.sel)}</h3><p>${setupBlurb(this.sel)}</p>`;
    if (p.kind === 'level') {
      const lv = LEVELS[p.level - 1], th = this.thFor(lv, np);
      const names = [...new Set(lv.pool.map(e => RECIPES[e.r].name))];
      h += `<p class="small">${Math.floor(lv.time / 60)}:${String(lv.time % 60).padStart(2, '0')} on the clock · Stars for ${np} player${np > 1 ? 's' : ''}: ★ ${th[0]} · ★★ ${th[1]} · ★★★ ${th[2]}` +
        (Prog.best(lv.id) ? ` · Your best: ${Prog.best(lv.id)}` : '') + `</p><p class="small">Menu: ${names.join(', ')}</p>`;
    }
    $('pickInfo').innerHTML = h;
  },
  confirm() {
    App.setup = this.sel;
    if (this.from === 'lobby') { show('lobby'); broadcastLobby(); renderLobby(); }
    else { show('menu'); renderMenuLevel(); }
  },
  cancel() { show(this.from); },
};
function renderMenuLevel() {
  $('menuLevelName').textContent = setupTitle(App.setup);
  $('menuProg').textContent = '★ ' + Prog.total() + ' / ' + LEVELS.length * 3;
}

// ---------- main loop ----------
function frame(now) {
  const dt = Math.min(0.05, (now - (frame.last || now)) / 1000);
  frame.last = now;
  Input.pollPads();
  let view = null, smooth = false;

  if (App.role === 'local' || App.role === 'host') {
    if (App.sim && (App.screen === 'play' || App.screen === 'over')) {
      const sim = App.sim;
      if (App.role === 'local') {
        App.roster.forEach((r, i) => sim.setInput(r.id, Input.read(i)));
      } else {
        sim.setInput(0, Input.read(SOLO));
        const t = performance.now();
        for (const r of App.roster) if (r.id !== 0) {
          const inp = App.inputs[r.id];
          if (!inp) continue;
          // if a client goes quiet (tab hidden etc.) stop their cook from running off
          sim.setInput(r.id, (t - (App.lastSeen[r.id] || 0) > 600) ? { ...inp, dx: 0, dy: 0, work: false } : inp);
        }
      }
      if (App.cd > 0) App.cd -= dt;
      else if (!App.paused) sim.step(dt);
      const evs = sim.drainEvents();
      for (const e of evs) { App.evBuf.push(e); if (App.role === 'host') App.netEv.push(e); }
      view = sim.snapshot();
      view.cd = App.cd > 0 ? Math.ceil(App.cd - 0.4) : 0;
      if (App.screen === 'play' && !App.paused) setCd(App.cd > 0 ? cdShow(Math.max(0, Math.ceil(App.cd - 0.4))) : -1);
      if (App.role === 'host') {
        App.sendT += dt;
        if (App.sendT >= 1 / 30) {
          App.sendT = 0;
          Net.broadcast({ t: 's', v: view, ev: App.netEv }); App.netEv = [];
        }
      }
      if (view.ph === 'over' && App.screen === 'play') showOver(view);
      App.view = view;
    }
  } else if (App.role === 'client') {
    view = App.view; smooth = true;
    if (view && App.screen === 'play') {
      setCd(view.cd > 0 ? cdShow(view.cd) : (App.lastCd > 0 ? 0 : -1));
      const inp = Input.read(SOLO), t = now;
      const s = App.lastSent;
      const changed = !s || s.dx !== inp.dx || s.dy !== inp.dy || s.work !== inp.work || s.act !== inp.act || s.dash !== inp.dash;
      if (changed || t - App.lastSentAt > 100) {
        Net.sendHost({ t: 'in', dx: inp.dx, dy: inp.dy, work: inp.work, act: inp.act, dash: inp.dash });
        App.lastSent = inp; App.lastSentAt = t;
      }
    }
  }

  updateBrief(view);
  if (App.evBuf.length) { Renderer.handleEvents(App.evBuf); App.evBuf = []; }
  Renderer.myIds = App.role === 'local' ? App.roster.map(r => r.id) : [App.myId];
  if (App.role === 'local') Renderer.myIds = [];
  Renderer.draw(view || App.idle, dt, smooth);
  requestAnimationFrame(frame);
}

// ---------- wiring ----------
function init() {
  Renderer.init($('game'));
  Input.init();
  App.idle = new Sim([], 'survival').snapshot();
  $('name').value = store.get('oc-name', '');
  $('name').addEventListener('input', () => store.set('oc-name', $('name').value));

  $('btnHost').onclick = startHosting;
  $('btnJoin').onclick = () => joinRoom($('joinCode').value);
  $('joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom($('joinCode').value); });
  $('joinCode').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); });
  $('btnLocal').onclick = startLocal;
  $('btnStart').onclick = () => { if (App.role === 'host') startGame(); };
  App.setup = 'L' + Prog.next();
  renderMenuLevel();
  $('btnMenuLevel').onclick = () => Picker.open('menu');
  $('btnLobbyLevel').onclick = () => Picker.open('lobby');
  $('pickOk').onclick = () => Picker.confirm();
  $('pickBack').onclick = () => Picker.cancel();
  $('pickAll').onchange = () => { store.set('oc-unlockall', $('pickAll').checked ? '1' : '0'); Picker.refresh(); };
  $('localCount').onchange = () => { if (App.screen === 'picker') Picker.refresh(); };
  $('btnNext').onclick = () => {
    const p = parseSetup(App.setup);
    if (p.kind === 'level' && p.level < LEVELS.length && (App.role === 'local' || App.role === 'host')) { App.setup = 'L' + (p.level + 1); startGame(); }
  };
  $('btnLeave').onclick = () => backToMenu();
  $('btnLeave2').onclick = () => backToMenu();
  $('btnCopy').onclick = () => {
    const link = shareLink();
    (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast('Link copied!'), () => toast(link, 6000));
  };
  $('btnAgain').onclick = () => { if (App.role === 'local' || App.role === 'host') startGame(); };
  $('btnLobby').onclick = () => {
    if (App.role === 'local') backToMenu();
    else if (App.role === 'host') { App.sim = null; App.view = null; show('lobby'); broadcastLobby(true); }
  };
  $('mute').onclick = toggleMute;
  document.addEventListener('pointerdown', () => Audio_.unlock());

  Input.onKey = (e) => {
    if (e.code === 'KeyM') toggleMute();
    if (e.code === 'Escape' && App.role === 'local' && App.screen === 'play' && App.cd <= 0) {
      App.paused = !App.paused;
      const el = $('cd'); el.textContent = App.paused ? 'PAUSED' : ''; el.className = App.paused ? 'show pause' : '';
      App.lastCd = App.paused ? -2 : -1;
    }
  };

  const room = new URLSearchParams(location.search).get('room');
  if (room) { $('joinCode').value = room.toUpperCase().slice(0, 4); joinRoom(room); }
  setInterval(() => {
    if (App.role === 'client') Net.sendHost({ t: 'ping' });
    pruneDead();
  }, 1000);
  window.addEventListener('pagehide', () => Net.close());
  requestAnimationFrame(frame);
}
function toggleMute() { Audio_.muted = !Audio_.muted; $('mute').textContent = Audio_.muted ? '🔇' : '🔊'; }

window.addEventListener('DOMContentLoaded', init);
