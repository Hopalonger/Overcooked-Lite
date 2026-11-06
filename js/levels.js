'use strict';
/* ============================================================
   Campaign levels. All kitchens are 15x9 tiles.
   Legend: C counter  . floor  i ice  r/l/u/d conveyor (east/west/north/south)
           B bun  P patty  H cheese  L lettuce  T tomato   (crates)
           K chopping board  S stove  D serve window  W sink  R plate rack  X trash  V dirty-plate return
   Per level:
     time      seconds on the clock
     pool      [{r: recipeId, at: secondsUnlocked, w: weight}]   (see RECIPES in sim.js)
     first     recipe ids that are always the first orders (so tutorials are predictable)
     iv        [start, end] seconds between new orders (for 2 players; scaled for other counts)
     max       [start, end] orders allowed on screen at once
     ot        [start, end] seconds each order stays on the board
     penalty   points lost when an order expires
     cfg       overrides of the tunables in `T` (cookTime, burnTime, startPlates, iceGrip...)
     dishes    false = unlimited clean plates, nothing gets dirty (used while learning)
     tips      on-screen hints at given times
     stars     [1, 2, 3] star thresholds (auto-calculated below for 2 players, scaled by player count)
   ============================================================ */

const iceify = (rows, c0, c1) => rows.map((r, y) => (y < 1 || y > 7) ? r :
  r.split('').map((ch, x) => (ch === '.' && x >= c0 && x <= c1) ? 'i' : ch).join(''));

const LEVELS = [
  // ---------------------------------------------------------------- 1-5: learning the ropes
  {
    name: 'First Day', blurb: 'Meet the kitchen. Burgers only, no dishes, plenty of time.',
    map: [
      'CCCBCCCPCCCCCCC',
      'C.............C',
      'S.............D',
      'S.............D',
      'C....CCCCC....C',
      'C.............C',
      'C.............C',
      'C.............C',
      'CCCCRCCCCCCXCCC',
    ],
    time: 120, pool: [{ r: 0 }], first: [0, 0, 0], iv: [30, 24], max: [2, 3], ot: [100, 90], penalty: 0, dishes: false,
    tips: [
      { t: 2, s: 'Welcome! A Burger = BUN + cooked PATTY. Orders are the tickets at the top.' },
      { t: 10, s: 'Face a crate and press PICK UP to grab food. Face a counter to put it down.' },
      { t: 20, s: 'Put a raw patty on a stove. It cooks in 8s – take it off before it burns!' },
      { t: 32, s: 'Grab a plate from the rack, add the bun and patty, then deliver at SERVE.' },
    ],
  },
  {
    name: 'Say Cheese', blurb: 'Cheese joins the menu. Read each ticket carefully.',
    map: [
      'CCBCPCHCCCCCCCC',
      'C.............C',
      'S.............D',
      'S.............D',
      'C....CCCCC....C',
      'C.............C',
      'C.............C',
      'C.............C',
      'CCCCRCCCCCCXCCC',
    ],
    time: 120, pool: [{ r: 0 }, { r: 2 }], first: [0, 2], iv: [28, 22], max: [2, 3], ot: [95, 85], penalty: 0, dishes: false,
    tips: [
      { t: 2, s: 'Cheeseburger = bun + patty + cheese. Burgers and cheeseburgers are both on the menu.' },
      { t: 14, s: 'Teamwork: one cook, one plater. Holding a plate, face a counter item to add it.' },
    ],
  },
  {
    name: 'Fresh Greens', blurb: 'Lettuce and tomato need chopping. Hold the work key at a board.',
    map: [
      'CCBCPCHCLCTCCCC',
      'C.............C',
      'K.............D',
      'K.............D',
      'C....CCCCC....C',
      'S.............C',
      'S.............C',
      'C.............C',
      'CCCCRCCKCCCXCCC',
    ],
    time: 150, pool: [{ r: 0 }, { r: 2 }, { r: 1, at: 20 }, { r: 3, at: 50 }], first: [1, 0], iv: [28, 22], max: [2, 3], ot: [95, 85], penalty: 0, dishes: false,
    tips: [
      { t: 2, s: 'Lettuce & tomato must be CHOPPED: put one on a board, then HOLD your work key.' },
      { t: 16, s: 'A Side Salad is just chopped lettuce + chopped tomato on a plate.' },
    ],
  },
  {
    name: 'Dish Duty', blurb: 'Plates are limited now. Served plates come back dirty!',
    map: [
      'CCBCPCHCLCTCCCC',
      'C.............D',
      'S.............D',
      'S...CCCCCCC...C',
      'C.............V',
      'K...CCCCCCC...W',
      'K.............W',
      'C.............X',
      'CCCCCCCCCCRCCCC',
    ],
    time: 150, pool: [{ r: 0 }, { r: 2 }, { r: 1 }, { r: 3, at: 40 }], first: [0, 2], iv: [26, 20], max: [3, 3], ot: [90, 80], penalty: 0,
    cfg: { startPlates: 3 },
    tips: [
      { t: 2, s: 'You only have 3 plates! Dirty ones appear at DIRTY. Drop them in the sink...' },
      { t: 10, s: '...then HOLD your work key at the sink to wash. Clean plates go back to the rack.' },
    ],
  },
  {
    name: 'The Classic', blurb: 'Everything together: cook, chop, plate, wash, serve.',
    map: [
      'CCBCPCHCLCTCCCC',
      'C.............D',
      'K.............D',
      'K...CCCSSCC...C',
      'C.............V',
      'C...CCCKKCC...W',
      'C.............W',
      'C.............X',
      'CCCCCCCCCCRCCCC',
    ],
    time: 180, pool: [{ r: 0 }, { r: 2 }, { r: 3 }, { r: 1 }, { r: 4, at: 40 }], first: [0, 4], iv: [27.5, 21], max: [3, 4], ot: [90, 78], penalty: 10,
    tips: [
      { t: 2, s: 'The Classic: bun, patty, chopped lettuce AND chopped tomato. Split the jobs!' },
      { t: 14, s: 'Missed orders now cost points. A streak of quick serves boosts your score.' },
    ],
  },
  // ---------------------------------------------------------------- 6-10: new kitchens
  {
    name: 'Divide & Conquer', blurb: 'A wall splits the kitchen. Pass food over the middle counters.',
    map: [
      'CCBCPCCCCLCTCHC',
      'C......C......D',
      'S......C......D',
      'S......C......C',
      'C......C......V',
      'C......C......W',
      'C......C......W',
      'C.............X',
      'CCRCCCCCCKCCKCC',
    ],
    spawns: [[2.5, 2.5], [10.5, 2.5], [2.5, 5.5], [10.5, 5.5]],
    time: 180, pool: [{ r: 0 }, { r: 2 }, { r: 3 }, { r: 1 }, { r: 4, at: 50 }], first: [0, 2], iv: [24, 18.5], max: [3, 4], ot: [92, 80], penalty: 10,
    tips: [
      { t: 2, s: 'Patties & buns are on the LEFT, veggies & serving on the RIGHT. Drop food on the wall counters to pass it over!' },
      { t: 14, s: 'On your own? Walk around through the gap at the bottom.' },
    ],
  },
  {
    name: 'Tight Squeeze', blurb: 'A small kitchen. You will bump into each other. Dash helps.',
    map: [
      'CCCCBPHLTCCCCCC',
      'CCC.........CCC',
      'CCS.........DCC',
      'CCS...CCC...WCC',
      'CCC.........VCC',
      'CCK...CCC...XCC',
      'CCK.........CCC',
      'CCC.........CCC',
      'CCCCCRCCCCCCCCC',
    ],
    spawns: [[4.5, 2.5], [10.5, 2.5], [4.5, 6.5], [10.5, 6.5]],
    time: 180, pool: [{ r: 0 }, { r: 2 }, { r: 8, at: 20 }, { r: 4, at: 45 }, { r: 1 }], first: [0, 2], iv: [22.5, 17], max: [3, 4], ot: [88, 76], penalty: 10,
    tips: [{ t: 2, s: 'Cosy! Chefs block each other – tap DASH to squeeze past.' }],
  },
  {
    name: 'Double Up', blurb: 'Double Cheese needs TWO patties. Three stoves, keep them busy.',
    map: [
      'CCBCPCPCHCLCTCC',
      'C.............D',
      'S.............D',
      'S...CCCCCCC...C',
      'S.............V',
      'K...CCCCCCC...W',
      'K.............W',
      'C.............X',
      'CCCCKCCCCCRCCCC',
    ],
    time: 180, pool: [{ r: 0 }, { r: 2 }, { r: 5, at: 15 }, { r: 4, at: 50 }, { r: 3 }], first: [0, 5], iv: [22, 16.5], max: [3, 4], ot: [90, 78], penalty: 10,
    tips: [{ t: 2, s: 'Double Cheese = bun + 2 patties + cheese. Load several stoves at once!' }],
  },
  {
    name: 'Salad Bar', blurb: 'Lots of veg and only ONE chopping board. Keep it busy.',
    map: [
      'CCBCPCHCLCTCCCC',
      'C.............D',
      'S.............D',
      'S...CCCKCCC...C',
      'C.............V',
      'C...CCCCCCC...W',
      'C.............W',
      'C.............X',
      'CCCCCCCCCCRCCCC',
    ],
    time: 180, pool: [{ r: 1 }, { r: 9, at: 10 }, { r: 8, at: 30 }, { r: 3 }, { r: 4, at: 60 }], first: [1, 9], iv: [23.5, 17], max: [3, 4], ot: [88, 76], penalty: 10,
    tips: [{ t: 2, s: 'One chopping board in the middle for the whole team. Queue up and chop fast!' }],
  },
  {
    name: 'Grand Opening', blurb: 'The first big test. The full menu is in play.',
    map: CLASSIC_MAP,
    time: 200, pool: [{ r: 0 }, { r: 2 }, { r: 3 }, { r: 4 }, { r: 5, at: 30 }, { r: 6, at: 80 }], first: [0, 2, 4], iv: [21.5, 15.5], max: [3, 5], ot: [85, 68], penalty: 10,
    tips: [{ t: 2, s: 'Grand Opening! Deluxe burgers are on the way. Good luck, chefs!' }],
  },
  // ---------------------------------------------------------------- 11-15: hazards
  {
    name: 'Slippery Slope', blurb: 'The middle of the kitchen is an ice rink. Plan your stops!',
    map: [
      'CCBCPCHCLCTCCCC',
      'C....iiiii....D',
      'S....iiiii....D',
      'S....iiiii....C',
      'C....iiiii....V',
      'K....iiiii....W',
      'K....iiiii....W',
      'C....iiiii....X',
      'CCCCCCCCCCRCCCC',
    ],
    time: 180, pool: [{ r: 0 }, { r: 2 }, { r: 3 }, { r: 4, at: 40 }, { r: 1 }, { r: 8, at: 70 }], first: [0, 2], iv: [20, 15], max: [3, 4], ot: [88, 76], penalty: 10,
    tips: [{ t: 2, s: 'Ice! You slide when you let go. Release the stick EARLY to stop where you want.' }],
  },
  {
    name: 'Conveyor Belt', blurb: 'Two moving walkways carry chefs up and down the kitchen.',
    map: [
      'CCBCPCHCLCTCCCC',
      'S.............D',
      'S.............D',
      'CrrrrrrrrrrrrrC',
      'K.CCCCCCCCCCC.V',
      'ClllllllllllllW',
      'K.............W',
      'C.............X',
      'CCCCCCCCCCRCCCC',
    ],
    time: 180, pool: [{ r: 0 }, { r: 2 }, { r: 4 }, { r: 1 }, { r: 5, at: 50 }, { r: 9, at: 80 }], first: [0, 2], iv: [19.5, 14.5], max: [3, 5], ot: [86, 74], penalty: 10,
    tips: [{ t: 2, s: 'The top belt runs EAST, the bottom belt runs WEST. Ride them – or walk against them.' }],
  },
  {
    name: 'Rush Hour', blurb: 'Short, snappy orders arrive fast. Keep it simple, keep it moving.',
    map: [
      'CCCCCCCCCCCCCCC',
      'CCBCPCHCLCTCCCC',
      'C.............D',
      'S.............D',
      'S...CCCCCCC...C',
      'K.............V',
      'K.............W',
      'CCRCCCCCCCCCXCC',
      'CCCCCCCCCCCCCCC',
    ],
    time: 150, pool: [{ r: 0 }, { r: 2 }, { r: 1 }, { r: 3 }], first: [0, 0, 2], iv: [17, 11.5], max: [3, 5], ot: [56, 46], penalty: 10,
    tips: [{ t: 2, s: 'Rush hour! Orders expire quickly. Split up and avoid overthinking.' }],
  },
  {
    name: 'Burnt Offerings', blurb: 'Hot stoves! Patties burn fast. Four burners, no daydreaming.',
    map: [
      'CCBCPCPCHCLCTCC',
      'C.............D',
      'K.............D',
      'K...CSSSSCC...C',
      'C.............V',
      'C...CCCCCCC...W',
      'C.............W',
      'C.............X',
      'CCCCCCCCCCRCCCC',
    ],
    time: 180, pool: [{ r: 0 }, { r: 2 }, { r: 5, at: 15 }, { r: 3 }, { r: 10, at: 90 }], first: [0, 2], iv: [18, 13], max: [3, 5], ot: [86, 72], penalty: 10,
    cfg: { cookTime: 6, burnTime: 14 },
    tips: [{ t: 2, s: 'The stoves run HOT: patties cook in 6s and burn at 14s. Watch the warning!' }],
  },
  {
    name: 'Two Kitchens', blurb: 'Prep upstairs, cook and serve downstairs. Pass over the divider.',
    map: [
      'CCBCPCHCLCTCCCC',
      'K.............C',
      'K.............R',
      'C.............C',
      'CCCCCCCCCCCCC.C',
      'S.............D',
      'S.............D',
      'C.............V',
      'CCWCCWCCCCCXCCC',
    ],
    time: 200, pool: [{ r: 0 }, { r: 2 }, { r: 3 }, { r: 1 }, { r: 4, at: 40 }, { r: 6, at: 100 }, { r: 9, at: 60 }], first: [0, 2], iv: [19, 14], max: [3, 5], ot: [90, 76], penalty: 10,
    tips: [{ t: 2, s: 'Ingredients & plates are upstairs, stoves & serving downstairs. Drop food on the divider counters!' }],
  },
  // ---------------------------------------------------------------- 16-20: master chef
  {
    name: 'Ice Rink', blurb: 'The whole floor is ice. Careful with those hot plates!',
    map: iceify(CLASSIC_MAP, 2, 12),
    time: 200, pool: [{ r: 0 }, { r: 2 }, { r: 4 }, { r: 1 }, { r: 5, at: 40 }, { r: 6, at: 100 }], first: [0, 2], iv: [17.5, 12.5], max: [3, 5], ot: [88, 74], penalty: 10,
    cfg: { iceGrip: 4 },
    tips: [{ t: 2, s: 'Ice rink! Only the outer lanes have grip. Everything else slides.' }],
  },
  {
    name: 'Triple Threat', blurb: 'Big stacks with lots of patties. Plan your stoves!',
    map: [
      'CCBCPCPCHCLCTCC',
      'S.............D',
      'S.............D',
      'S...CCCCCCC...C',
      'C.............V',
      'K...CCCCCCC...W',
      'K.............W',
      'S.............X',
      'CCCCCCCCCCRCCCC',
    ],
    time: 210, pool: [{ r: 0 }, { r: 2 }, { r: 5 }, { r: 4 }, { r: 6, at: 40 }, { r: 10, at: 100 }, { r: 7, at: 150 }], first: [0, 5], iv: [19.5, 13.5], max: [3, 5], ot: [90, 78], penalty: 10,
    cfg: { startPlates: 4 },
    tips: [{ t: 2, s: 'Triple Stack needs THREE patties. Four stoves on the wall – use them all.' }],
  },
  {
    name: 'Lunch Crush', blurb: 'A flood of small orders. Organise or drown. Great with 4 players.',
    map: [
      'CCBCPCHCLCTCCCC',
      'S.............D',
      'S.............D',
      'K...CCCCCCC...C',
      'K.............V',
      'C...CCCCCCC...W',
      'S.............W',
      'S.............X',
      'CCCCRCCCCCRCCCC',
    ],
    time: 210, pool: [{ r: 0 }, { r: 2 }, { r: 1 }, { r: 3 }, { r: 4 }, { r: 8 }, { r: 9 }, { r: 5, at: 80 }], first: [0, 0, 2], iv: [18.5, 10], max: [4, 6], ot: [72, 56], penalty: 10,
    cfg: { startPlates: 6 },
    tips: [{ t: 2, s: 'Lunch crush! Two plate racks, two sinks, four stoves. Pick a job and own it.' }],
  },
  {
    name: 'Conveyor Chaos', blurb: 'Belts run along the top and bottom walls. Ride the flow.',
    map: [
      'CCBCPCHCLCTCCCC',
      'CrrrrrrrrrrrrrD',
      'S.............D',
      'S...CCCCCCC...C',
      'K.............V',
      'K...CCCCCCC...W',
      'C.............W',
      'ClllllllllllllX',
      'CCCCCCCCCCRCCCC',
    ],
    time: 210, pool: [{ r: 0 }, { r: 2 }, { r: 4 }, { r: 1 }, { r: 5, at: 40 }, { r: 6, at: 90 }, { r: 9, at: 60 }], first: [0, 2], iv: [17.5, 12], max: [3, 5], ot: [86, 72], penalty: 10,
    tips: [{ t: 2, s: 'The belt by the crates pushes EAST, the one by the plates pushes WEST. Time your grabs!' }],
  },
  {
    name: 'Michelin Star', blurb: 'The final exam: ice, belts and the whole menu. Serve like a pro.',
    map: [
      'CCBCPCHCLCTCCCC',
      'S.....iii.....D',
      'S.....iii.....D',
      'K.....CCC.....C',
      'C.rrrrrrrrrr..V',
      'K.....CCC.....W',
      'S.....iii.....W',
      'C.....iii.....X',
      'CCCCCCCCCCRCCCC',
    ],
    time: 240, pool: [{ r: 0 }, { r: 2 }, { r: 4 }, { r: 1 }, { r: 5, at: 30 }, { r: 6, at: 60 }, { r: 9, at: 45 }, { r: 10, at: 120 }, { r: 7, at: 160 }], first: [0, 2], iv: [17.5, 10.5], max: [4, 6], ot: [80, 60], penalty: 10,
    tips: [{ t: 2, s: 'Michelin inspectors are in! Ice in the middle, a belt across the centre. Show them what you can do.' }],
  },
];

LEVELS.forEach((lv, i) => {
  lv.id = i + 1;
  lv.cfg = lv.cfg || {};
  // star thresholds (for 2 chefs): fractions of the "ideal" points available if every order spawned were served
  if (!lv.stars) {
    const factor = lv.id <= 4 ? [0.25, 0.5, 0.8] : lv.id <= 12 ? [0.3, 0.6, 0.9] : [0.33, 0.65, 1.0];
    let U = 0;
    for (let t = 2; t < lv.time; t += 1) {
      const f = t / lv.time;
      const iv = lv.iv[0] + (lv.iv[1] - lv.iv[0]) * f;
      const live = lv.pool.filter(e => (e.at || 0) <= t);
      let wsum = 0, bsum = 0;
      live.forEach(e => { const w = e.w || 1; wsum += w; bsum += w * 15 * RECIPES[e.r].ing.length; });
      U += (1 / iv) * (bsum / wsum);
    }
    lv.stars = factor.map(x => Math.max(10, Math.round(U * x / 5) * 5));
  }
});

/** stars earned for a score given the (player-scaled) thresholds */
function starsFor(score, th) {
  if (!th) return 0;
  return th.reduce((n, v) => n + (score >= v ? 1 : 0), 0);
}
