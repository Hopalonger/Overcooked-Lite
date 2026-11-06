# 🍔 Overcooked Lite

A tiny co-op kitchen game for 1–4 players that runs entirely in the browser. No server to run:
online play is peer-to-peer (WebRTC via [PeerJS](https://peerjs.com), vendored in `js/`).

## Host it free on GitHub Pages

1. Create a new GitHub repo and push everything in this folder to it (`index.html` must be at the repo root).
2. Repo → **Settings → Pages** → *Build and deployment*: **Deploy from a branch** → `main` / `/ (root)` → Save.
3. After a minute your game is live at `https://<your-username>.github.io/<repo-name>/`.

Send friends that link. To play online: one person clicks **Host a room**, then shares the 4-letter
code (or the **Copy link** button, which makes a join link). Everyone else opens the site and enters the code.

You can also just double-click `index.html` to play same-screen locally.

## How to play

* **Space / Q** – pick up / put down whatever you're facing (ingredients, plates, items on counters)
* **Hold E** – chop lettuce/tomato on a chopping board, or wash plates at the sink
* **Shift** – dash
* Cook patties on a stove (they burn if you forget them!), assemble on a plate, hit **SERVE** to match a ticket.
* Dirty plates come back after serving – wash them or you'll run out.
* Fast serves earn tips, back-to-back serves build a streak multiplier.

The longer you survive, the more tickets arrive at once, the faster they come, and new bigger recipes
unlock (Salad → Cheeseburger → … → Double Deluxe). It scales slightly with player count.

## Campaign: 20 levels

Pick a level with **Change** on the menu (local) or in the lobby (online host). Each level has a fixed clock and
a **1–3 star** rating based on your team's score. Score for one star to unlock the next level (progress is saved in
your browser; there's an *Unlock all levels* checkbox if you'd rather jump around). Star targets automatically
scale with the number of players, and so does how fast orders arrive.

| # | Level | What's new |
|---|---|---|
| 1 | First Day | Burgers only, unlimited plates. Hints walk you through it |
| 2 | Say Cheese | Cheeseburgers |
| 3 | Fresh Greens | Chopping lettuce & tomato, salads |
| 4 | Dish Duty | Limited plates, dirty dishes, sink |
| 5 | The Classic | Full burger with everything; missed orders cost points |
| 6 | Divide & Conquer | Kitchen split by a wall: pass food across the counters |
| 7 | Tight Squeeze | Cramped kitchen, use dash |
| 8 | Double Up | Two-patty burgers, three stoves |
| 9 | Salad Bar | Veg-heavy menu, one shared chopping board |
| 10 | Grand Opening | Deluxe burgers, full menu |
| 11 | Slippery Slope | Ice rink in the middle |
| 12 | Conveyor Belt | Moving walkways |
| 13 | Rush Hour | Short order timers, fast pace |
| 14 | Burnt Offerings | Hot stoves: patties burn quickly |
| 15 | Two Kitchens | Split into two rooms |
| 16 | Ice Rink | Slippery everywhere |
| 17 | Triple Threat | Triple-patty stacks, four stoves |
| 18 | Lunch Crush | Flood of orders, two racks, two sinks |
| 19 | Conveyor Chaos | Belts along both walls |
| 20 | Michelin Star | Ice + belt + full menu |

The two **Endless** modes are still there: *Survival* (3 lives, orders escalate forever) and *Timed* (5:00).

Difficulty and star targets are estimates from a workload model, not extensive playtesting. If a level feels too
easy or too hard, tweak `iv` (seconds between orders) or `stars` for that level in `js/levels.js`.

### Same-screen controls

| Player | Move | Pick up/put down | Chop/wash (hold) | Dash |
|---|---|---|---|---|
| 1 (red)    | WASD   | Q | E | Left Shift |
| 2 (blue)   | Arrows | . | , | / |
| 3 (green)  | IJKL   | U | O | P |
| 4 (yellow) | gamepad only | | | |

Gamepads (stick/d-pad = move, A = pick up, X = hold, B/RB/RT = dash) work for any player.

## How the networking works

The host's browser runs the game and streams state to the others ~30×/sec; clients just send their key
presses. PeerJS's free public broker is only used for the initial handshake. That means:

* The **host must keep their tab open and visible** (background tabs get throttled by browsers).
* Some strict networks (corporate Wi-Fi, some mobile carriers) block peer-to-peer. If a friend can't
  connect, try another network or have them host.
* If you ever want rock-solid connectivity, add a TURN server to `Net.peerOpts()` in `js/net.js`,
  or self-host a [PeerJS server](https://github.com/peers/peerjs-server).

## Tweaking the game

Global balance numbers live at the top of `js/sim.js` (`T`: speeds, chop/cook times; `RECIPES`). Each campaign level
is a block in `js/levels.js`: the kitchen layout is an array of 9 strings (legend at the top of that file), plus its
order schedule, timer, hints and per-level overrides. Copy one to make your own level.

## Files

```
index.html, style.css      UI
js/sim.js                  game rules + simulation (runs on host / locally)
js/levels.js               the 20 campaign levels
js/render.js               canvas drawing
js/input.js, audio.js      keyboard/gamepad, synthesized sound
js/net.js                  PeerJS wrapper
js/main.js                 menus, lobby, game loop
js/peerjs.min.js           PeerJS 1.5.5 (MIT)
```
