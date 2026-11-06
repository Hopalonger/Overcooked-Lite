'use strict';
/* ============================================================
   Overcooked Lite - canvas renderer
   Draws a "view" (a Sim snapshot) - identical path for host, local and clients.
   ============================================================ */

const TS = 64;
const MAPW = COLS * TS, MAPH = ROWS * TS, HUDH = 104;
const CW = MAPW, CH = MAPH + HUDH;
const PCOL = ['#ef4444', '#3b82f6', '#22c55e', '#eab308'];
const PNAME = ['Red', 'Blue', 'Green', 'Yellow'];
let CUR_CC = 8, CUR_CB = 18;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function rr(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function circle(ctx, x, y, r, fill, stroke, lw) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
}
function bar(ctx, x, y, w, h, frac, color, bg) {
  ctx.fillStyle = bg || 'rgba(0,0,0,.55)'; rr(ctx, x, y, w, h, h / 2); ctx.fill();
  if (frac > 0) { ctx.fillStyle = color; rr(ctx, x + 1, y + 1, Math.max(h - 2, (w - 2) * Math.min(1, frac)), h - 2, (h - 2) / 2); ctx.fill(); }
}
function text(ctx, str, x, y, size, color, align, weight, stroke) {
  ctx.font = `${weight || 700} ${size}px ${FONT}`;
  ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = 4; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}

// ---------- ingredient / item drawing (x,y = centre, s = nominal size) ----------
function drawIngredient(ctx, k, st, x, y, s) {
  switch (k) {
    case 'bun': {
      ctx.fillStyle = '#c98a3f'; rr(ctx, x - s * .42, y + s * .02, s * .84, s * .17, s * .07); ctx.fill();
      ctx.fillStyle = '#e8a95a';
      ctx.beginPath(); ctx.ellipse(x, y + s * .04, s * .42, s * .36, 0, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#fff3d6';
      for (const [dx, dy] of [[-.18, -.14], [.02, -.22], [.2, -.12], [-.04, -.08]]) {
        ctx.beginPath(); ctx.ellipse(x + dx * s, y + dy * s, s * .04, s * .025, .5, 0, 7); ctx.fill();
      }
      break;
    }
    case 'patty': {
      const col = st === 2 ? '#26201e' : st === 1 ? '#7b4a2a' : '#e68e8e';
      circle(ctx, x, y, s * .38, col, 'rgba(0,0,0,.35)', 1.5);
      if (st === 1) {
        ctx.strokeStyle = 'rgba(30,15,5,.55)'; ctx.lineWidth = 2;
        for (const o of [-.14, 0, .14]) { ctx.beginPath(); ctx.moveTo(x - s * .26, y + o * s - s * .08); ctx.lineTo(x + s * .26, y + o * s + s * .08); ctx.stroke(); }
      } else if (st === 0) {
        circle(ctx, x - s * .1, y - s * .1, s * .09, 'rgba(255,255,255,.35)');
      }
      break;
    }
    case 'lettuce': {
      if (st === 0) {
        circle(ctx, x, y, s * .38, '#4fb83d', 'rgba(0,0,0,.3)', 1.5);
        ctx.strokeStyle = '#9be07e'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x - s * .06, y + s * .04, s * .22, 0.3, 4.2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x + s * .06, y, s * .12, 3, 7); ctx.stroke();
      } else {
        ctx.fillStyle = '#6fd152';
        for (const [dx, dy, rot] of [[-.2, -.1, .4], [.15, -.15, -.5], [0, .08, .1], [-.18, .18, -.3], [.2, .15, .6]]) {
          ctx.save(); ctx.translate(x + dx * s, y + dy * s); ctx.rotate(rot);
          rr(ctx, -s * .12, -s * .06, s * .24, s * .12, s * .04); ctx.fill(); ctx.restore();
        }
      }
      break;
    }
    case 'tomato': {
      if (st === 0) {
        circle(ctx, x, y, s * .36, '#e23a2e', 'rgba(0,0,0,.3)', 1.5);
        circle(ctx, x - s * .1, y - s * .1, s * .07, 'rgba(255,255,255,.4)');
        ctx.fillStyle = '#3f9c35';
        ctx.beginPath(); ctx.arc(x, y - s * .33, s * .1, 0, 7); ctx.fill();
      } else {
        for (const [dx, dy] of [[-.17, .1], [.17, .1], [0, -.17]]) {
          circle(ctx, x + dx * s, y + dy * s, s * .17, '#e23a2e', 'rgba(0,0,0,.25)', 1);
          circle(ctx, x + dx * s, y + dy * s, s * .07, '#ff8d7e');
        }
      }
      break;
    }
    case 'cheese': {
      ctx.save(); ctx.translate(x, y); ctx.rotate(-.2);
      ctx.fillStyle = '#ffd23f'; rr(ctx, -s * .33, -s * .28, s * .66, s * .56, s * .06); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.5; ctx.stroke();
      circle(ctx, -s * .1, -s * .05, s * .07, '#eab308'); circle(ctx, s * .14, s * .1, s * .05, '#eab308');
      ctx.restore();
      break;
    }
  }
}

function drawPlate(ctx, it, x, y, s) {
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(x, y + s * .08, s * .48, s * .4, 0, 0, 7); ctx.fill();
  circle(ctx, x, y, s * .46, '#f5f5f5', '#c9c9c9', 2);
  circle(ctx, x, y, s * .33, '#ffffff', '#e3e3e3', 1.5);
  const c = it.c || [];
  if (!c.length) return;
  const n = {}; c.forEach(k => { n[k] = (n[k] || 0) + 1; });
  const hasBun = !!n.bun;
  if (!hasBun && !n.patty) {            // salad pile
    for (let i = 0; i < (n.lettuce || 0) * 5; i++) {
      const a = i * 2.4; circle(ctx, x + Math.cos(a) * s * .13 * (1 + i % 2), y + Math.sin(a) * s * .1 * (1 + i % 2), s * .09, '#6fd152', 'rgba(0,0,0,.2)', 1);
    }
    for (let i = 0; i < (n.tomato || 0) * 3; i++) {
      const a = i * 2.1 + 1; circle(ctx, x + Math.cos(a) * s * .16, y + Math.sin(a) * s * .12, s * .07, '#e23a2e');
    }
    if (n.cheese) circle(ctx, x, y, s * .08, '#ffd23f');
    return;
  }
  let yy = y + s * .12;
  const layer = (h, col, wid) => {
    const w = s * (wid || .66);
    ctx.fillStyle = col; rr(ctx, x - w / 2, yy - h, w, h, h / 2.2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.stroke();
    yy -= h * .78;
  };
  if (hasBun) layer(s * .12, '#c98a3f');
  for (let i = 0; i < (n.patty || 0); i++) layer(s * .13, '#7b4a2a');
  for (let i = 0; i < (n.cheese || 0); i++) layer(s * .07, '#ffd23f', .72);
  for (let i = 0; i < (n.lettuce || 0); i++) layer(s * .09, '#6fd152', .74);
  for (let i = 0; i < (n.tomato || 0); i++) layer(s * .08, '#e23a2e', .68);
  if (hasBun) {
    ctx.fillStyle = '#e8a95a';
    ctx.beginPath(); ctx.ellipse(x, yy + s * .02, s * .34, s * .26, 0, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#fff3d6';
    ctx.beginPath(); ctx.ellipse(x - s * .1, yy - s * .1, s * .035, s * .02, .5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + s * .1, yy - s * .08, s * .035, s * .02, -.5, 0, 7); ctx.fill();
  }
}

function drawDirty(ctx, x, y, s) {
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(x, y + s * .08, s * .48, s * .4, 0, 0, 7); ctx.fill();
  circle(ctx, x, y, s * .46, '#d9d4c7', '#a39d8c', 2);
  circle(ctx, x, y, s * .33, '#cfc8b6', '#b5ae9c', 1.5);
  circle(ctx, x - s * .1, y - s * .05, s * .08, '#8a7a55'); circle(ctx, x + s * .12, y + s * .1, s * .06, '#7a6b49');
}

function drawItem(ctx, it, x, y, s) {
  if (!it) return;
  if (it.k === 'plate') drawPlate(ctx, it, x, y, s);
  else if (it.k === 'dirty') drawDirty(ctx, x, y, s);
  else drawIngredient(ctx, it.k, it.s, x, y, s);
}

// ---------- tiles ----------
function drawCounterBase(ctx, x, y) {
  ctx.fillStyle = '#8c6a47'; ctx.fillRect(x, y, TS, TS);
  ctx.fillStyle = '#c9a77c'; ctx.fillRect(x, y, TS, TS - 6);
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(x, y, TS, 3);
  ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, TS - 1, TS - 1);
}

function drawTile(ctx, ch, tx, ty, st, time) {
  const x = tx * TS, y = ty * TS, cx = x + TS / 2, cy = y + TS / 2;
  if (isFloor(ch)) {
    ctx.fillStyle = (tx + ty) % 2 ? '#eddcb9' : '#e5d2ab';
    ctx.fillRect(x, y, TS, TS);
    if (ch === 'i') {                       // ice
      ctx.fillStyle = (tx + ty) % 2 ? '#cfeaf7' : '#c2e2f2'; ctx.fillRect(x, y, TS, TS);
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 10, y + 20); ctx.lineTo(x + 26, y + 10); ctx.moveTo(x + 36, y + 52); ctx.lineTo(x + 54, y + 40); ctx.stroke();
      ctx.strokeStyle = 'rgba(120,180,215,.35)'; ctx.strokeRect(x + .5, y + .5, TS - 1, TS - 1);
    } else if (BELT[ch]) {                  // conveyor belt
      const [bx, by] = BELT[ch];
      ctx.fillStyle = '#4a4d55'; ctx.fillRect(x, y, TS, TS);
      ctx.fillStyle = '#3a3c42'; ctx.fillRect(x, y, TS, 4); ctx.fillRect(x, y + TS - 4, TS, 4);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, TS, TS); ctx.clip();
      ctx.strokeStyle = 'rgba(255,200,60,.85)'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const off = (time * 28) % 32;
      for (let k = -1; k < 3; k++) {
        const o = k * 32 + off - 16, cx = x + TS / 2 + bx * o, cy = y + TS / 2 + by * o;
        ctx.beginPath();
        ctx.moveTo(cx - bx * 6 + by * 12, cy - by * 6 + bx * 12); ctx.lineTo(cx + bx * 6, cy + by * 6); ctx.lineTo(cx - bx * 6 - by * 12, cy - by * 6 - bx * 12);
        ctx.stroke();
      }
      ctx.restore();
    }
    return;
  }
  drawCounterBase(ctx, x, y);
  if (CRATE[ch]) {
    ctx.fillStyle = '#7a4d22'; rr(ctx, x + 6, y + 6, TS - 12, TS - 14, 8); ctx.fill();
    ctx.fillStyle = '#a06a32'; rr(ctx, x + 9, y + 9, TS - 18, TS - 20, 6); ctx.fill();
    drawIngredient(ctx, CRATE[ch], 0, cx, cy - 2, TS * .62);
    return;
  }
  switch (ch) {
    case 'V':
      ctx.fillStyle = 'rgba(80,60,40,.25)'; rr(ctx, x + 8, y + 8, TS - 16, TS - 22, 6); ctx.fill();
      text(ctx, 'DIRTY', cx, y + TS - 12, 9, '#5b4630', 'center', 800);
      break;
    case 'K':
      ctx.fillStyle = '#d9b077'; rr(ctx, x + 7, y + 7, TS - 14, TS - 18, 6); ctx.fill();
      ctx.strokeStyle = '#a97e46'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#c8cdd4'; rr(ctx, x + TS - 22, y + 11, 6, 20, 2); ctx.fill();
      text(ctx, 'CHOP', cx, y + TS - 13, 9, '#6b4a22', 'center', 800);
      break;
    case 'S': {
      ctx.fillStyle = '#34343a'; rr(ctx, x + 3, y + 3, TS - 6, TS - 10, 8); ctx.fill();
      circle(ctx, cx, cy - 2, TS * .36, '#55555d', '#1f1f23', 2);
      circle(ctx, cx, cy - 2, TS * .3, '#6b6b74');
      break;
    }
    case 'D':
      ctx.fillStyle = '#2f8f4e'; rr(ctx, x + 5, y + 6, TS - 10, TS - 16, 8); ctx.fill();
      ctx.fillStyle = '#e9f7ee'; ctx.beginPath(); ctx.arc(cx, cy - 6, 11, Math.PI, 0); ctx.fill();
      ctx.fillRect(cx - 11, cy - 6, 22, 4); circle(ctx, cx, cy - 19, 2.5, '#e9f7ee');
      text(ctx, 'SERVE', cx, y + TS - 13, 10, '#e9f7ee', 'center', 800);
      break;
    case 'W': {
      ctx.fillStyle = '#9aa7b3'; rr(ctx, x + 5, y + 5, TS - 10, TS - 14, 8); ctx.fill();
      ctx.fillStyle = '#5aa9e6'; rr(ctx, x + 10, y + 10, TS - 20, TS - 24, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.fillRect(x + 14, y + 14 + Math.sin(time * 3 + ty) * 1.5, TS - 28, 3);
      const n = st && st.dirty || 0;
      for (let i = 0; i < Math.min(n, 5); i++) drawDirty(ctx, cx, cy - 4 - i * 3, TS * .5);
      if (n > 0) text(ctx, 'x' + n, x + TS - 12, y + 12, 12, '#fff', 'center', 800, 'rgba(0,0,0,.6)');
      if (st && st.p > 0) bar(ctx, x + 8, y + TS - 14, TS - 16, 7, st.p, '#7be0ff');
      break;
    }
    case 'R': {
      const n = st && st.clean || 0, inf = st && st.inf;
      for (let i = 0; i < Math.min(n, 6); i++) drawPlate(ctx, { c: [] }, cx, cy + 6 - i * 4, TS * .6);
      text(ctx, inf ? '\u221e' : n > 0 ? 'x' + n : 'EMPTY', cx, y + 12, inf ? 16 : 12, n > 0 ? '#fff' : '#ff8d7e', 'center', 800, 'rgba(0,0,0,.6)');
      break;
    }
    case 'X':
      ctx.fillStyle = '#5f6770'; rr(ctx, x + 12, y + 14, TS - 24, TS - 24, 5); ctx.fill();
      ctx.fillStyle = '#7a838d'; rr(ctx, x + 8, y + 8, TS - 16, 9, 4); ctx.fill();
      ctx.strokeStyle = '#464c53'; ctx.lineWidth = 2;
      for (const o of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(cx + o, y + 24); ctx.lineTo(cx + o, y + TS - 18); ctx.stroke(); }
      break;
  }
}

function drawTileItem(ctx, ch, tx, ty, it, time) {
  if (!it) return;
  const x = tx * TS, y = ty * TS, cx = x + TS / 2, cy = y + TS / 2 - 2;
  drawItem(ctx, it, cx, cy, TS * (ch === 'S' ? .6 : .66));
  if (ch === 'K' && it.p > 0 && it.s === 0) bar(ctx, x + 8, y + TS - 14, TS - 16, 7, it.p, '#7be07b');
  if (ch === 'S' && it.k === 'patty') {
    const frac = it.p / CUR_CB;
    const cookedAt = CUR_CC / CUR_CB;
    const warn = it.s === 1 && it.p > CUR_CB - 4;
    const blink = warn && Math.floor(time * 6) % 2 === 0;
    if (it.s < 2) {
      bar(ctx, x + 6, y + TS - 13, TS - 12, 8, frac, it.s === 0 ? '#ffb347' : (blink ? '#ff3b30' : '#ffd23f'));
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(x + 6 + (TS - 12) * cookedAt, y + TS - 14, 2, 10);
    }
    if (it.s === 1 && warn) text(ctx, '!', cx, y + 12, 20, blink ? '#ff3b30' : '#ffd23f', 'center', 900, '#000');
    if (it.s < 2) {                    // little flames
      for (let i = 0; i < 3; i++) {
        const fx = cx - 16 + i * 16, fh = 5 + Math.sin(time * 14 + i * 2) * 2.5;
        ctx.fillStyle = 'rgba(255,150,40,.9)'; ctx.beginPath(); ctx.ellipse(fx, y + TS - 20, 3.5, fh, 0, 0, 7); ctx.fill();
      }
    }
  }
}

// ---------- players ----------
function drawPlayer(ctx, p, x, y, time, mine) {
  const r = TS * .34, col = PCOL[p.c % 4];
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, y + r * .85, r * 1.0, r * .45, 0, 0, 7); ctx.fill();
  const bob = p.w ? Math.sin(time * 30) * 1.5 : 0;
  y += bob;
  circle(ctx, x, y, r, col, 'rgba(0,0,0,.45)', 2.5);
  // hat
  ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.5;
  rr(ctx, x - r * .55, y - r * 1.2, r * 1.1, r * .55, r * .15); ctx.fill(); ctx.stroke();
  for (const dx of [-.5, 0, .5]) circle(ctx, x + dx * r, y - r * 1.35, r * .42, '#fff', 'rgba(0,0,0,.2)', 1.2);
  // eyes
  const px = -p.fy, py = p.fx;
  for (const sgn of [-1, 1]) {
    const ex = x + p.fx * r * .38 + px * sgn * r * .34, ey = y + p.fy * r * .38 + py * sgn * r * .34 + r * .1;
    circle(ctx, ex, ey, r * .2, '#fff'); circle(ctx, ex + p.fx * r * .08, ey + p.fy * r * .08, r * .1, '#111');
  }
  if (p.dt) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r + 5, 0, 7); ctx.stroke(); }
  // held item
  if (p.it) drawItem(ctx, p.it, x + p.fx * r * 1.55, y + p.fy * r * 1.45 - 4, TS * .62);
  // name tag
  const label = p.n || PNAME[p.c % 4];
  ctx.font = `700 11px ${FONT}`;
  const w = ctx.measureText(label).width + 10;
  ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(ctx, x - w / 2, y - r * 2.45 - 7, w, 15, 7); ctx.fill();
  text(ctx, label, x, y - r * 2.45, 11, '#fff', 'center', 700);
  if (mine) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y - r * 2.45 - 9); ctx.lineTo(x - 4, y - r * 2.45 - 15); ctx.lineTo(x + 4, y - r * 2.45 - 15); ctx.fill(); }
}

// ---------- HUD ----------
function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

function drawHUD(ctx, v, time) {
  const g = ctx.createLinearGradient(0, 0, 0, HUDH);
  g.addColorStop(0, '#3a2c20'); g.addColorStop(1, '#2a1f16');
  ctx.fillStyle = g; ctx.fillRect(0, 0, CW, HUDH);
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, HUDH - 3, CW, 3);

  // left panel
  text(ctx, 'SCORE', 18, 20, 11, '#d8c3a5', 'left', 800);
  text(ctx, String(v.sc), 18, 46, 34, '#fff', 'left', 900);
  if (v.mode === 'timed' || v.mode === 'level') {
    text(ctx, fmtTime(v.tl), 18, 72, 20, v.tl < 30 ? '#ff6b5e' : '#ffd98a', 'left', 800);
    if (v.mode === 'level' && v.th) {
      const x = 18, w = 164, y = 93, top = v.th[2] * 1.05;
      bar(ctx, x, y, w, 9, v.sc / top, '#ffd23f');
      v.th.forEach((t, i) => {
        const mx = x + w * (t / top), got = v.sc >= t;
        ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(mx - 1, y - 2, 2, 13);
        text(ctx, '\u2605', mx, y - 5, 13, got ? '#ffd23f' : '#7a6a55', 'center', 900, got ? 'rgba(0,0,0,.5)' : null);
      });
    }
  } else {
    let hearts = '';
    for (let i = 0; i < T.startLives; i++) hearts += i < v.lv ? '♥' : '♡';
    text(ctx, hearts, 18, 78, 22, '#ff5d5d', 'left', 800);
    text(ctx, fmtTime(v.t), 98, 78, 14, '#d8c3a5', 'left', 700);
  }
  if (v.mode === 'level') text(ctx, 'LEVEL ' + v.lid, 98, 20, 11, '#d8c3a5', 'left', 800);
  if (v.st >= 1) {
    const m = 1 + 0.1 * Math.min(v.st, 5);
    text(ctx, 'x' + m.toFixed(1) + ' streak', 98, 46, 13, '#9be07e', 'left', 800);
  }

  // order tickets
  const tw = 118, gap = 6, x0 = 196;
  ctx.save(); ctx.beginPath(); ctx.rect(x0 - 4, 0, CW - x0 + 4, HUDH); ctx.clip();
  v.o.forEach((o, i) => {
    const r = RECIPES[o.r], frac = Math.max(0, o.t / o.l);
    let x = x0 + i * (tw + gap), y = 8;
    const urgent = o.t < 12;
    if (urgent) x += Math.sin(time * 40 + i) * 1.2;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; rr(ctx, x + 2, y + 3, tw, HUDH - 18, 8); ctx.fill();
    ctx.fillStyle = '#fbf3df'; rr(ctx, x, y, tw, HUDH - 18, 8); ctx.fill();
    ctx.fillStyle = urgent ? '#d94a3d' : '#6d4c2f'; rr(ctx, x, y, tw, 20, 8); ctx.fill(); ctx.fillRect(x, y + 12, tw, 8);
    text(ctx, r.name, x + tw / 2, y + 10, 12, '#fff', 'center', 800);
    // ingredient row
    const n = r.ing.length, sz = n > 4 ? 19 : 24, startX = x + tw / 2 - (n * (sz - 2)) / 2 + sz / 2 - 1;
    const order = ['bun', 'patty', 'cheese', 'lettuce', 'tomato'];
    const ing = r.ing.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
    ing.forEach((k, j) => {
      const st = (k === 'patty' || k === 'lettuce' || k === 'tomato') ? 1 : 0;
      drawIngredient(ctx, k, st, startX + j * (sz - 2), y + 46, sz);
    });
    const col = frac > .5 ? '#59c36a' : frac > .25 ? '#f2b705' : '#e5483c';
    bar(ctx, x + 8, y + 64, tw - 16, 8, frac, col, 'rgba(0,0,0,.2)');
  });
  ctx.restore();
}

// ---------- renderer object ----------
const Renderer = {
  canvas: null, ctx: null,
  disp: {},            // smoothed positions for networked clients
  parts: [], pops: [],
  time: 0, lastNr: 0, banner: null, tip: null, flash: 0, shake: 0, workSnd: 0,
  myIds: [],           // player ids that get the "you are here" arrow

  init(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    canvas.width = CW; canvas.height = CH;
  },
  reset() { this.disp = {}; this.parts = []; this.pops = []; this.lastNr = 0; this.banner = null; this.tip = null; this.flash = 0; },

  popup(str, x, y, color, size) { this.pops.push({ s: str, x, y, c: color || '#fff', t: 0, z: size || 20 }); },
  burst(x, y, color, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 7, v = (spd || 80) * (.4 + Math.random());
      this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, t: 0, life: .5 + Math.random() * .4, c: color, r: 2 + Math.random() * 3 });
    }
  },

  handleEvents(evs) {
    for (const e of evs) {
      const px = (e.x || 0) * TS, py = (e.y || 0) * TS;
      switch (e.e) {
        case 'pick': Audio_.play('pick'); break;
        case 'put': Audio_.play('put'); break;
        case 'bad': Audio_.play('bad'); this.popup('✖', px, py - 10, '#ff6b5e', 22); break;
        case 'trash': Audio_.play('trash'); this.burst(px, py, '#9aa', 6, 60); break;
        case 'chopped': Audio_.play('ding'); this.burst(px, py, '#6fd152', 8, 90); this.popup('✓', px, py - 12, '#9be07e', 22); break;
        case 'cooked': Audio_.play('ding'); this.popup('Cooked!', px, py - 24, '#ffd98a', 15); break;
        case 'burnt': Audio_.play('burn'); this.popup('Burnt!', px, py - 24, '#ff6b5e', 16); this.burst(px, py, '#333', 10, 70); break;
        case 'washed': Audio_.play('ding'); this.burst(px, py, '#9fe3ff', 8, 80); break;
        case 'dirty': Audio_.play('put'); this.popup('Dirty plate', px, py - 24, '#d8c3a5', 12); break;
        case 'deliver':
          Audio_.play('deliver');
          this.popup('+' + e.pts, px - 20, py + 10, '#9be07e', 28);
          if (e.tip) this.popup('tip +' + e.tip, px - 20, py + 34, '#ffd98a', 14);
          for (let i = 0; i < 18; i++) this.burst(px - 20, py, ['#ffd23f', '#ef4444', '#3b82f6', '#22c55e'][i % 4], 1, 160);
          break;
        case 'order': Audio_.play('order'); break;
        case 'expire': Audio_.play('expire'); this.flash = 1; this.shake = .35; if (e.pen) this.popup('-' + e.pen, CW / 2, HUDH + 60, '#ff6b5e', 30); break;
        case 'tip': showTip(e.s); Audio_.play('beep'); break;
        case 'dash': Audio_.play('dash'); this.burst(px, py, 'rgba(255,255,255,.8)', 6, 50); break;
        case 'over': Audio_.play('over'); break;
      }
    }
  },

  draw(v, dt, smooth) {
    const ctx = this.ctx; this.time += dt; const time = this.time;
    // smoothing for remote views
    const pos = {};
    for (const p of v.p) {
      let d = this.disp[p.id];
      if (!d || !smooth || Math.hypot(d.x - p.x, d.y - p.y) > 3) d = this.disp[p.id] = { x: p.x, y: p.y };
      else { const k = 1 - Math.exp(-dt * 22); d.x += (p.x - d.x) * k; d.y += (p.y - d.y) * k; }
      pos[p.id] = d;
    }
    // new-recipe banner
    CUR_CC = v.cc || 8; CUR_CB = v.cb || 18;
    if (v.nr > this.lastNr && this.lastNr > 0) {
      this.banner = { t: 0, s: 'NEW ON THE MENU: ' + RECIPES[v.nw].name.toUpperCase() };
      Audio_.play('order');
    }
    this.lastNr = v.nr;

    ctx.save();
    ctx.clearRect(0, 0, CW, CH);
    if (this.shake > 0) { this.shake -= dt; ctx.translate((Math.random() - .5) * 8, (Math.random() - .5) * 8); }
    drawHUD(ctx, v, time);

    ctx.save(); ctx.translate(0, HUDH);
    const tsMap = {};
    for (const t of v.ts) tsMap[t.i] = t;
    for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++) {
      drawTile(ctx, MAP[ty][tx], tx, ty, tsMap[ty * COLS + tx], time);
    }
    // target highlights
    for (const p of v.p) {
      const tg = Sim.prototype.target({ x: p.x, y: p.y, fx: p.fx, fy: p.fy });
      if (tg) {
        ctx.strokeStyle = PCOL[p.c % 4]; ctx.lineWidth = 3; ctx.globalAlpha = .75;
        rr(ctx, tg.x * TS + 2, tg.y * TS + 2, TS - 4, TS - 4, 6); ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
    for (const t of v.ts) if (t.item) drawTileItem(ctx, MAP[Math.floor(t.i / COLS)][t.i % COLS], t.i % COLS, Math.floor(t.i / COLS), t.item, time);
    // players sorted by y for overlap
    const ps = v.p.slice().sort((a, b) => pos[a.id].y - pos[b.id].y);
    for (const p of ps) {
      const d = pos[p.id];
      drawPlayer(ctx, p, d.x * TS, d.y * TS, time, this.myIds.includes(p.id));
      if (p.w) {
        this.workSnd -= dt;
        if (this.workSnd <= 0) { Audio_.play('tick'); this.workSnd = .22; this.burst(d.x * TS + p.fx * 22, d.y * TS + p.fy * 22, '#fff', 1, 40); }
      }
    }
    // particles & popups
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i]; q.t += dt;
      if (q.t > q.life) { this.parts.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 260 * dt;
      ctx.globalAlpha = 1 - q.t / q.life; circle(ctx, q.x, q.y, q.r, q.c); ctx.globalAlpha = 1;
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const q = this.pops[i]; q.t += dt;
      if (q.t > 1.1) { this.pops.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, (1.1 - q.t) * 2.2);
      text(ctx, q.s, q.x, q.y - q.t * 38, q.z, q.c, 'center', 900, 'rgba(0,0,0,.65)');
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    if (this.banner) {
      const b = this.banner; b.t += dt;
      if (b.t > 3.2) this.banner = null;
      else {
        const a = Math.min(1, b.t * 4, (3.2 - b.t) * 3);
        ctx.globalAlpha = a;
        ctx.fillStyle = 'rgba(20,12,6,.82)'; rr(ctx, CW / 2 - 230, HUDH + 14 + (1 - a) * -10, 460, 38, 19); ctx.fill();
        text(ctx, b.s, CW / 2, HUDH + 33 + (1 - a) * -10, 17, '#ffd98a', 'center', 900);
        ctx.globalAlpha = 1;
      }
    }
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,40,30,${this.flash * .28})`; ctx.fillRect(0, 0, CW, CH);
      this.flash -= dt * 2;
    }
    ctx.restore();
  },
};

// ---------- tiny map preview (level picker) ----------
function drawMapThumb(canvas, map) {
  const s = 6, ctx = canvas.getContext('2d');
  canvas.width = COLS * s; canvas.height = ROWS * s;
  const col = { '.': '#e5d2ab', C: '#8c6a47', i: '#bfe3f4', r: '#55585f', l: '#55585f', u: '#55585f', d: '#55585f',
    S: '#2d2d33', K: '#d9b077', D: '#2f8f4e', W: '#5aa9e6', R: '#fff', X: '#7a838d', V: '#a08a6b',
    B: '#e8a95a', P: '#e68e8e', H: '#ffd23f', L: '#4fb83d', T: '#e23a2e' };
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    ctx.fillStyle = col[map[y][x]] || '#888'; ctx.fillRect(x * s, y * s, s, s);
  }
}
