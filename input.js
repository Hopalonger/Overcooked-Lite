'use strict';
/* Keyboard + gamepad input.
   Each "scheme" is one player's controls. Edge actions (pick up / dash) are counters so a
   press is never lost between network packets; "work" (chop / wash) is a held state. */
const SCHEMES = [
  { name: 'WASD',  up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', act: 'KeyQ', work: 'KeyE', dash: 'ShiftLeft',
    help: 'WASD move · Q pick up/put down · E hold to chop/wash · Shift dash' },
  { name: 'Arrows', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', act: 'Period', work: 'Comma', dash: 'Slash',
    help: 'Arrows move · . pick up/put down · , hold to chop/wash · / dash' },
  { name: 'IJKL',  up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', act: 'KeyU', work: 'KeyO', dash: 'KeyP',
    help: 'IJKL move · U pick up/put down · O hold to chop/wash · P dash' },
  { name: 'Gamepad only' },
  // solo (online): WASD or arrows, Space / E / Shift
  { name: 'Solo', up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    act: ['Space', 'KeyQ'], work: ['KeyE', 'KeyF'], dash: ['ShiftLeft', 'ShiftRight'] },
];
const SOLO = 4;
const arr = (v) => v === undefined ? [] : Array.isArray(v) ? v : [v];

const Input = {
  down: new Set(),
  counters: SCHEMES.map(() => ({ act: 0, dash: 0 })),
  padPrev: {},
  onKey: null,   // optional hook for Esc / M

  init() {
    window.addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      SCHEMES.forEach((s, i) => {
        if (arr(s.act).includes(e.code)) this.counters[i].act++;
        if (arr(s.dash).includes(e.code)) this.counters[i].dash++;
      });
      if (this.onKey) this.onKey(e);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());
  },

  anyDown(list) { return arr(list).some(c => this.down.has(c)); },

  pads() {
    try { return Array.from(navigator.getGamepads ? navigator.getGamepads() : []).filter(Boolean); } catch (e) { return []; }
  },

  /** Poll gamepad edges once per frame (call before read) */
  pollPads() {
    const pads = this.pads();
    for (const g of pads) {
      const prev = this.padPrev[g.index] || {};
      const cur = { a: !!(g.buttons[0] && g.buttons[0].pressed), b: !!(g.buttons[1] && g.buttons[1].pressed),
        rb: !!(g.buttons[5] && g.buttons[5].pressed), rt: !!(g.buttons[7] && g.buttons[7].pressed) };
      const slot = this.padSlot(g.index);
      if (slot >= 0) {
        if (cur.a && !prev.a) this.counters[slot].act++;
        if ((cur.b && !prev.b) || (cur.rb && !prev.rb) || (cur.rt && !prev.rt)) this.counters[slot].dash++;
      }
      this.padPrev[g.index] = cur;
    }
  },
  // which counter slot a pad feeds: in solo mode all pads feed SOLO; in local mode pad i feeds player i
  mode: 'local',
  padSlot(idx) { return this.mode === 'solo' ? SOLO : (idx < 4 ? idx : -1); },

  readPad(g) {
    let dx = g.axes[0] || 0, dy = g.axes[1] || 0;
    if (Math.hypot(dx, dy) < 0.28) { dx = 0; dy = 0; }
    const b = (i) => !!(g.buttons[i] && g.buttons[i].pressed);
    if (b(14)) dx = -1; if (b(15)) dx = 1; if (b(12)) dy = -1; if (b(13)) dy = 1;
    return { dx, dy, work: b(2) || b(3) };
  },

  /** Read input for a scheme index (0-3 local players, SOLO for online). */
  read(slot) {
    const s = SCHEMES[slot];
    let dx = 0, dy = 0, work = false;
    if (s.up) {
      if (this.anyDown(s.left)) dx -= 1;
      if (this.anyDown(s.right)) dx += 1;
      if (this.anyDown(s.up)) dy -= 1;
      if (this.anyDown(s.down)) dy += 1;
      work = this.anyDown(s.work);
    }
    for (const g of this.pads()) {
      if (this.mode === 'solo' || g.index === slot) {
        const r = this.readPad(g);
        if (r.dx || r.dy) { dx = r.dx; dy = r.dy; }
        work = work || r.work;
      }
    }
    return { dx, dy, work, act: this.counters[slot].act, dash: this.counters[slot].dash };
  },
};
