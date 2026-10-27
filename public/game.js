// Infern a Sant Andreu — game.js: el jugador, les armes, els objectes, les monedes compartides,
// el rellotge (dia, nit i temps), els controls (teclat, ratolí i pantalla tàctil), la portada i
// el bucle. El dibuix és a raycast.js (món) i hud.js (marcador); els monstres, a monsters.js.
"use strict";

const SAVE_KEY = "infern-santandreu-save";
const WEAPONS = {
  fist: { cool: 0.45, pellets: 1, spread: 0, range: 1.7, dmg: () => 6 + Math.random() * 14, ammo: null, sfx: "punch" },
  pistol: { cool: 0.38, pellets: 1, spread: 0.02, range: 40, dmg: () => CFG.weapons.pistolDamage * (0.7 + Math.random() * 0.6), ammo: "bullets", sfx: "pistol" },
  shotgun: { cool: 0.95, pellets: 7, spread: 0.1, range: 30, dmg: () => CFG.weapons.shotgunDamage * (0.6 + Math.random() * 0.8), ammo: "shells", sfx: "shotgun" },
};
const ORDER = ["fist", "pistol", "shotgun"];

const game = {
  player: { x: 0, y: 0, a: 0, moving: false }, hp: 100, armor: 0, bullets: 50, shells: 0, has: { fist: true, pistol: true, shotgun: false },
  weapon: "pistol", fireT: 0, walkT: 0, wallet: 0, kills: 0, score: 0, dead: false, touch: false, mapOpen: false, mapZoom: 3,
  street: "", onTitle: true, chatting: false, keys: new Set(), turn: 0, joy: { x: 0, y: 0 }, firing: false, healT: 0,
};
const world = { hour: 12, day: 0, dark: 0, monsters: false, weather: "clear", skyKey: "", sky: null, offset: 0 };
const pharmacies = [];
let streetGrid = null;

// ---------------------------------------------------------------------------
// Rellotge: 1 minut real = 1 hora (CFG.world.secondsPerHour), igual per a tothom
const worldNow = () => Date.now() + world.offset;
function updateClock() {
  const hours = worldNow() / (CFG.world.secondsPerHour * 1000);
  world.day = Math.floor(hours / 24); world.hour = hours % 24;
  const h = world.hour;
  world.dark = h >= 21 || h < 5 ? 1 : h >= 18 ? (h - 18) / 3 : h < 8 ? 1 - (h - 5) / 3 : 0;
  world.weather = ["clear", "clear", "rain", "clear", "fog", "clear", "snow"][hash2(Math.floor(world.day / 2), 17) % 7];
  const m = night();
  if (m !== world.monsters) {
    if (world.started) message(m ? "Ha caigut la nit… l'infern surt al carrer!" : "Es fa de dia. Els monstres s'amaguen.");
    world.monsters = m; world.started = true;
    applyMusic();
  }
}
function night() {
  const s = CFG.night.startHour, e = CFG.night.endHour, h = world.hour;
  return s > e ? h >= s || h < e : h >= s && h < e;
}

// ---------------------------------------------------------------------------
// Jugador
function placeAt(tx, ty) {
  for (let r = 0; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = Math.round(tx) + dx, y = Math.round(ty) + dy;
    if (!circleBlocked(x * TS + 8, y * TS + 8, 0.4)) { game.player.x = x * TS + 8; game.player.y = y * TS + 8; return; }
  }
}

function updatePlayer(dt) {
  const pl = game.player, k = game.keys;
  if (game.dead || game.chatting || game.onTitle) { pl.moving = false; return; }
  // girar: fletxes, ratolí i el dit (game.turn s'acumula des dels esdeveniments)
  const turnKeys = (k.has("ArrowLeft") || k.has("KeyQ") ? -1 : 0) + (k.has("ArrowRight") || k.has("KeyE") ? 1 : 0);
  pl.a += turnKeys * CFG.player.turnSpeed * dt + game.turn;
  game.turn = 0;
  let fwd = (k.has("ArrowUp") || k.has("KeyW") ? 1 : 0) - (k.has("ArrowDown") || k.has("KeyS") ? 1 : 0);
  let str = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0);
  if (game.joy.x || game.joy.y) { fwd = -game.joy.y; str = game.joy.x; }
  const len = Math.hypot(fwd, str);
  pl.moving = len > 0.15;
  if (pl.moving) {
    if (len > 1) { fwd /= len; str /= len; }
    const v = g(Math.floor(pl.x / TS), Math.floor(pl.y / TS)) & 127, wet = v === T.WATER || v === T.POOL;
    const run = k.has("ShiftLeft") || k.has("ShiftRight") || game.touch;
    const sp = (run ? CFG.player.runSpeed : CFG.player.walkSpeed) * TS * dt * (wet ? 0.55 : 1);
    const ca = Math.cos(pl.a), sa = Math.sin(pl.a);
    moveEntity(pl, (ca * fwd - sa * str) * sp, (sa * fwd + ca * str) * sp, 0.25);
    game.walkT += dt * (run ? 1.4 : 1);
  }
  if (game.fireT > 0) game.fireT -= dt;
  if (game.firing) fire();
  // les farmàcies et curen
  if (game.hp < CFG.player.maxHp) {
    const near = pharmacies.some((p) => Math.hypot(p.x - pl.x / TS, p.y - pl.y / TS) < 4);
    if (near) {
      game.hp = Math.min(CFG.player.maxHp, game.hp + 15 * dt);
      if ((game.healT -= dt) <= 0) { game.healT = 3; message("La farmàcia et cura les ferides…"); sfx("pickup"); }
    }
  }
}

function hurtPlayer(dmg, src) {
  if (game.dead) return;
  const save = Math.min(game.armor, dmg / 3);
  game.armor -= save;
  game.hp -= dmg - save;
  hud.flash = 0.45; hud.ouch = 0.5;
  sfx("hurt");
  if (game.hp <= 0) {
    game.hp = 0; game.dead = true; game.firing = false;
    const lost = Math.ceil(game.wallet / 2);
    game.wallet -= lost;
    message(lost ? `Has mort i has perdut ${lost} monedes.` : "Has mort.");
    sfx("die");
  }
}

function respawn() {
  Object.assign(game, { hp: CFG.player.maxHp, armor: 0, bullets: Math.max(game.bullets, 50), dead: false, weapon: "pistol" });
  placeAt(...state.meta.start);
  mobs.list = mobs.list.filter((m) => Math.hypot(m.x - game.player.x, m.y - game.player.y) / TS > 25);
  message("Has tornat a la Plaça d'Orfila.");
}

function pickUp(kind) {
  const max = { bullets: 200, shells: 50 };
  if (kind === "ammo") { if (game.bullets >= max.bullets) return false; game.bullets = Math.min(max.bullets, game.bullets + 15); message("Has agafat una caixa de bales."); }
  else if (kind === "shells") { if (game.shells >= max.shells) return false; game.shells = Math.min(max.shells, game.shells + 6); message("Has agafat uns cartutxos."); }
  else if (kind === "health") { if (game.hp >= CFG.player.maxHp) return false; game.hp = Math.min(CFG.player.maxHp, game.hp + 25); message("Has agafat una farmaciola."); }
  else if (kind === "armor") { if (game.armor >= 100) return false; game.armor = 100; message("Has agafat una armilla!"); }
  else if (kind === "shotgun") {
    const first = !game.has.shotgun;
    game.has.shotgun = true; game.shells = Math.min(max.shells, game.shells + 8);
    if (first) { game.weapon = "shotgun"; message("Tens una escopeta! (tecla 3)"); } else message("Has agafat cartutxos.");
  }
  hud.pickupFlash = 0.22; sfx("pickup");
  return true;
}

// ---------------------------------------------------------------------------
// Armes
function selectWeapon(k) {
  if (!game.has[k]) return;
  game.weapon = k;
}
function nextWeapon() {
  const i = ORDER.indexOf(game.weapon);
  for (let j = 1; j <= ORDER.length; j++) { const k = ORDER[(i + j) % ORDER.length]; if (game.has[k]) { game.weapon = k; return; } }
}

// Distància fins a la primera paret en una direcció (en caselles)
function wallDist(x, y, a, max) {
  const dx = Math.cos(a) * 0.2, dy = Math.sin(a) * 0.2;
  let tx = x / TS, ty = y / TS;
  for (let d = 0; d < max; d += 0.2) { tx += dx; ty += dy; if (isBuilding(g(Math.floor(tx), Math.floor(ty)))) return d; }
  return max;
}

function fire() {
  if (game.dead || game.fireT > 0 || game.mapOpen) return;
  const w = WEAPONS[game.weapon];
  if (w.ammo && game[w.ammo] <= 0) {
    message("Sense munició!");
    nextWeapon();
    if (game.weapon === "pistol" && game.bullets <= 0) game.weapon = "fist";
    game.fireT = 0.3;
    return;
  }
  if (w.ammo) game[w.ammo]--;
  game.fireT = w.cool;
  sfx(w.sfx);
  const pl = game.player;
  for (let i = 0; i < w.pellets; i++) {
    const a = pl.a + (Math.random() - 0.5) * 2 * w.spread;
    const wall = wallDist(pl.x, pl.y, a, w.range);
    let best = null, bd = wall;
    for (const m of mobs.list) {
      if (m.state === "dead") continue;
      const dx = m.x - pl.x, dy = m.y - pl.y, d = Math.hypot(dx, dy) / TS;
      if (d >= bd) continue;
      let da = Math.atan2(dy, dx) - a;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < Math.atan2(0.38, d)) { best = m; bd = d; }
    }
    if (best) { damageMonster(best, w.dmg()); mobs.puffs.push({ x: best.x, y: best.y, t: 0, z: 0.6 }); }
    else if (wall < w.range) mobs.puffs.push({ x: pl.x + Math.cos(a) * (wall - 0.1) * TS, y: pl.y + Math.sin(a) * (wall - 0.1) * TS, t: 0, z: 0.4 + Math.random() * 0.6 });
  }
  // el soroll desperta els monstres propers
  if (game.weapon !== "fist") for (const m of mobs.list) if (m.state !== "dead" && Math.hypot(m.x - pl.x, m.y - pl.y) / TS < 18) m.state = "chase";
}

// ---------------------------------------------------------------------------
// Monedes compartides (el servidor en crea i quan algú n'agafa una desapareix per a tothom)
const coins = { list: new Map(), pending: new Map(), sprites: null };
const coinsList = () => coins.list.values();
function coinsOnMessage(m) {
  if (m.t === "welcome") { coins.list = new Map((m.coins || []).map((c) => [c.id, c])); coins.pending.clear(); }
  else if (m.t === "coin") coins.list.set(m.c.id, m.c);
  else if (m.t === "taken") {
    coins.list.delete(m.id); coins.pending.delete(m.id);
    if (m.by === net.id) { game.wallet++; sfx("coin"); message(`+1 moneda (${game.wallet})`); }
  }
}
function updateCoins() {
  const pl = game.player, tx = pl.x / TS, ty = pl.y / TS, now = Date.now();
  for (const [id, t] of coins.pending) if (now - t > 2000) coins.pending.delete(id);
  if (game.dead || !net.connected) return;
  for (const c of coins.list.values()) {
    if (Math.hypot(c.x - tx, c.y - ty) < 0.9 && !coins.pending.has(c.id)) {
      coins.pending.set(c.id, now);
      net.send({ t: "take", id: c.id, x: Math.round(pl.x), y: Math.round(pl.y) });
    }
  }
}

// ---------------------------------------------------------------------------
// Carrer més proper (per al rètol de dalt a la dreta)
function buildStreetGrid() {
  const B = 16, gw = Math.ceil(state.W / B), gh = Math.ceil(state.H / B);
  streetGrid = { B, gw, cells: Array.from({ length: gw * gh }, () => []) };
  for (const s of state.meta.streets) for (const line of s.lines) for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 3);
    for (let k = 0; k <= n; k++) {
      const x = a.x + (b.x - a.x) * (k / n), y = a.y + (b.y - a.y) * (k / n);
      const ci = Math.floor(y / B) * gw + Math.floor(x / B);
      if (streetGrid.cells[ci]) streetGrid.cells[ci].push([x, y, s.name]);
    }
  }
}
function nearestStreet(tx, ty) {
  const { B, gw, cells } = streetGrid;
  let best = "", bd = 7 * 7;
  for (let cy = Math.floor(ty / B) - 1; cy <= Math.floor(ty / B) + 1; cy++) for (let cx = Math.floor(tx / B) - 1; cx <= Math.floor(tx / B) + 1; cx++) {
    for (const [x, y, n] of cells[cy * gw + cx] || []) { const d = (x - tx) ** 2 + (y - ty) ** 2; if (d < bd) { bd = d; best = n; } }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Sprites del món per a cada fotograma
const SIGN_KIND = { pharmacy: "pharmacy", beer: "beer", coffee: "coffee", bank: "bank" };
let decorImgs = null, signs = [];
function initWorldSprites() {
  decorImgs = {
    trees: THEMES.map((th) => [1, 2, 3].map((s) => makeTree(true, s * 977, th.tree))),
    pines: THEMES.map((th) => [1, 2].map((s) => makeTree(false, s * 541, th.tree))),
    lamp: makeLamp(), bench: makeBench(), fountain: makeFountain(),
    signs: Object.fromEntries(Object.keys(SIGN_KIND).map((k) => [k, makeSign(k)])),
  };
  coins.sprites = [0, 1, 2, 3].map(makeCoinFrame);
  // rètols: a la façana, mirant al carrer (la posició del local sol ser dins de l'edifici)
  for (const p of state.meta.pois || []) {
    if (!SIGN_KIND[p.c]) continue;
    if (p.c === "pharmacy") pharmacies.push(p);
    let best = null, bd = 9;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const tx = Math.round(p.x) + dx, ty = Math.round(p.y) + dy;
      if (isBuilding(g(tx, ty)) || blocked(tx, ty)) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = [tx, ty]; }
    }
    if (best) signs.push({ x: best[0] * TS + 8, y: best[1] * TS + 8, kind: p.c, name: p.n });
  }
}
function worldSprites() {
  const list = [], pl = game.player, ptx = Math.floor(pl.x / TS), pty = Math.floor(pl.y / TS), R2 = CFG.render.drawDistance;
  const ca = Math.cos(pl.a), sa = Math.sin(pl.a);
  for (let ty = Math.max(0, pty - R2); ty <= Math.min(state.H - 1, pty + R2); ty++) for (let tx = Math.max(0, ptx - R2); tx <= Math.min(state.W - 1, ptx + R2); tx++) {
    const d = state.decor[ty * state.W + tx];
    if (!d) continue;
    const dx = tx - ptx, dy = ty - pty;
    if (dx * ca + dy * sa < -1) continue; // al darrere
    const th = sectorAt(tx, ty), S = decorImgs;
    const x = tx * TS + 8, y = ty * TS + 8;
    if (d === D.TREE) list.push({ x, y, img: S.trees[th][hash2(tx, ty) % 3], h: 36 });
    else if (d === D.TREE2) list.push({ x, y, img: S.pines[th][hash2(tx, ty) % 2], h: 40 });
    else if (d === D.LAMP) list.push({ x, y, img: S.lamp, h: 30, bright: world.dark > 0.4 });
    else if (d === D.BENCH) list.push({ x, y, img: S.bench, h: 7 });
    else if (d === D.FOUNTAIN) list.push({ x, y, img: S.fountain, h: 14 });
  }
  for (const s of signs) {
    const dx = s.x - pl.x, dy = s.y - pl.y;
    if (dx * dx + dy * dy < (30 * TS) ** 2) list.push({ x: s.x, y: s.y, img: decorImgs.signs[s.kind], h: 7, z: 1.2, bright: world.dark > 0.4, label: s.name, labelColor: "#ffd23f" });
  }
  const t = Date.now();
  for (const c of coins.list.values()) {
    const dx = c.x - pl.x / TS, dy = c.y - pl.y / TS;
    if (dx * dx + dy * dy < R2 * R2) list.push({ x: c.x * TS, y: c.y * TS, img: coins.sprites[Math.floor(t / 120 + c.id) % 4], h: 5, z: 0.15 + Math.sin(t / 300 + c.id) * 0.05, bright: true });
  }
  for (const o of net.others.values()) {
    const fa = DIR_ANGLE[o.dir] ?? 0, toMe = Math.atan2(pl.y - o.y, pl.x - o.x);
    let rel = Math.atan2(Math.sin(toMe - fa), Math.cos(toMe - fa));
    const dir = Math.abs(rel) < Math.PI / 4 ? "down" : Math.abs(rel) > (3 * Math.PI) / 4 ? "up" : rel > 0 ? "left" : "right";
    list.push({ x: o.x, y: o.y, img: o.sprites[dir][o.frame], h: 14, label: o.look.name });
  }
  pushMonsterSprites(list);
  return list;
}
const DIR_ANGLE = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
const angleDir = (a) => { const c = Math.cos(a), s = Math.sin(a); return Math.abs(c) > Math.abs(s) ? (c > 0 ? "right" : "left") : (s > 0 ? "down" : "up"); };

// ---------------------------------------------------------------------------
// Sons (sintetitzats)
let sfxCtx = null;
function sfx(kind) {
  if (!music.on) return;
  try {
    sfxCtx ||= music.ctx || new AudioContext();
    const c = sfxCtx, t = c.currentTime;
    const noise = (dur, vol, freq, q = 1) => {
      const b = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
      const s = c.createBufferSource(), f = c.createBiquadFilter(), gn = c.createGain();
      s.buffer = b; f.type = "lowpass"; f.frequency.value = freq; f.Q.value = q; gn.gain.value = vol;
      s.connect(f).connect(gn).connect(c.destination); s.start(t);
    };
    const tone = (f0, f1, dur, vol, type = "square") => {
      const o = c.createOscillator(), gn = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      gn.gain.setValueAtTime(vol, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gn).connect(c.destination); o.start(t); o.stop(t + dur);
    };
    if (kind === "pistol") noise(0.18, 0.5, 2600);
    else if (kind === "shotgun") { noise(0.45, 0.8, 1400); tone(120, 40, 0.25, 0.25); }
    else if (kind === "punch") noise(0.08, 0.35, 600);
    else if (kind === "hurt") tone(220, 110, 0.18, 0.15, "sawtooth");
    else if (kind === "die") tone(300, 40, 0.5, 0.15, "sawtooth");
    else if (kind === "pickup") { tone(660, 990, 0.08, 0.08); }
    else if (kind === "coin") { tone(988, 1318, 0.12, 0.08); }
    else if (kind === "fireball") tone(180, 520, 0.3, 0.08, "triangle");
  } catch { /* sense àudio */ }
}

// ---------------------------------------------------------------------------
// Desar la partida al navegador
function saveGame() {
  if (game.onTitle) return;
  const pl = game.player;
  store.setJSON(SAVE_KEY, { x: Math.round(pl.x), y: Math.round(pl.y), a: +pl.a.toFixed(2), hp: game.hp, armor: game.armor, bullets: game.bullets,
    shells: game.shells, has: game.has, weapon: game.weapon, wallet: game.wallet, kills: game.kills, look: state.look });
}
function loadGame() {
  const s = store.getJSON(SAVE_KEY);
  state.look = s?.look ? { ...DEFAULT_LOOK, ...s.look } : { ...randomLook(rng(Date.now())), name: "" };
  if (!s) { placeAt(...state.meta.start); game.player.a = -Math.PI / 2; return; }
  Object.assign(game, { hp: s.hp > 0 ? s.hp : 100, armor: s.armor || 0, bullets: s.bullets ?? 50, shells: s.shells || 0,
    has: { fist: true, pistol: true, shotgun: !!s.has?.shotgun }, weapon: s.weapon || "pistol", wallet: s.wallet || 0, kills: s.kills || 0 });
  if (Number.isFinite(s.x) && !circleBlocked(s.x, s.y)) { game.player.x = s.x; game.player.y = s.y; } else placeAt(...state.meta.start);
  game.player.a = s.a || 0;
}
function randomLook(r) {
  const pick = (a) => a[(r() * a.length) | 0];
  return { ...DEFAULT_LOOK, skin: pick(["#ffe0bd", "#f1c27d", "#e0ac69", "#c68642", "#8d5524"]), hair: pick(["#1c1414", "#4a2b1a", "#8b5a2b", "#d6a756"]),
    hairStyle: pick(["short", "long", "ponytail", "afro", "bald"]), shirt: pick(["#3e5a2e", "#c0392b", "#2980b9", "#2c3e50", "#8e44ad"]),
    pants: pick(["#2c3e70", "#1f2a44", "#5d6d7e", "#3a3430"]), extra: pick(["none", "cap", "glasses"]) };
}

// ---------------------------------------------------------------------------
// Controls
function bindInput() {
  addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (game.onTitle) return;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Tab"].includes(e.code)) e.preventDefault();
    if (game.dead) { if (e.code === "Space" && !e.repeat) respawn(); return; }
    if ((e.code === "Enter" || e.code === "KeyT") && !e.repeat) { e.preventDefault(); openChat(); return; }
    game.keys.add(e.code);
    if (e.repeat) return;
    if (e.code === "Space" || e.code === "ControlLeft" || e.code === "ControlRight") game.firing = true;
    if (e.code === "Digit1") selectWeapon("fist");
    if (e.code === "Digit2") selectWeapon("pistol");
    if (e.code === "Digit3") selectWeapon("shotgun");
    if (e.code === "KeyX") nextWeapon();
    if (e.code === "Tab" || e.code === "KeyM") game.mapOpen = !game.mapOpen;
    if (game.mapOpen && (e.key === "+" || e.key === "=")) game.mapZoom = Math.min(8, game.mapZoom + 1);
    if (game.mapOpen && (e.key === "-" || e.key === "_")) game.mapZoom = Math.max(1, game.mapZoom - 1);
    if (e.code === "KeyH") document.getElementById("help").classList.toggle("hidden");
  });
  addEventListener("keyup", (e) => {
    game.keys.delete(e.code);
    if (e.code === "Space" || e.code === "ControlLeft" || e.code === "ControlRight") game.firing = false;
  });
  addEventListener("blur", () => { game.keys.clear(); game.firing = false; });
  // ratolí: clic per capturar-lo (girar movent-lo) i disparar
  canvas.addEventListener("mousedown", (e) => {
    if (game.onTitle || game.touch) return;
    if (game.dead) return respawn();
    if (document.pointerLockElement !== canvas) { lockPointer(); return; }
    if (e.button === 0) game.firing = true;
  });
  addEventListener("mouseup", () => { if (!game.touch) game.firing = false; });
  addEventListener("mousemove", (e) => { if (document.pointerLockElement === canvas) game.turn += e.movementX * 0.0028 * CFG.player.mouseSensitivity; });
  canvas.addEventListener("wheel", (e) => { if (!game.onTitle) { e.preventDefault(); nextWeapon(); } }, { passive: false });
  addEventListener("resize", () => { resize(); resizeRenderer(); });
}

// Captura el ratolí per girar movent-lo (alguns navegadors no ho deixen: llavors es gira amb les fletxes)
function lockPointer() {
  try { canvas.requestPointerLock?.()?.catch?.(() => {}); } catch { /* sense captura del ratolí */ }
}

// Pantalla tàctil: joystick a l'esquerra per caminar, arrossegar a la dreta per girar
function bindTouch() {
  const isTouch = matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
  if (!isTouch) return;
  game.touch = true;
  document.body.classList.add("touch");
  const joy = document.getElementById("joystick"), knob = joy.querySelector(".knob");
  let jid = null, lid = null, lx = 0;
  joy.addEventListener("pointerdown", (e) => { jid = e.pointerId; joy.setPointerCapture(jid); moveJoy(e); });
  joy.addEventListener("pointermove", (e) => { if (e.pointerId === jid) moveJoy(e); });
  const endJoy = () => { jid = null; game.joy.x = game.joy.y = 0; knob.style.transform = ""; };
  joy.addEventListener("pointerup", endJoy); joy.addEventListener("pointercancel", endJoy);
  function moveJoy(e) {
    const r = joy.getBoundingClientRect(), R0 = r.width / 2;
    let x = (e.clientX - r.left - R0) / (R0 * 0.7), y = (e.clientY - r.top - R0) / (R0 * 0.7);
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    game.joy.x = Math.abs(x) < 0.15 ? 0 : x; game.joy.y = Math.abs(y) < 0.15 ? 0 : y;
    knob.style.transform = `translate(${x * R0 * 0.6}px, ${y * R0 * 0.6}px)`;
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (game.onTitle) return;
    if (game.dead) return respawn();
    lid = e.pointerId; lx = e.clientX; canvas.setPointerCapture(lid);
  });
  canvas.addEventListener("pointermove", (e) => { if (e.pointerId === lid) { game.turn += (e.clientX - lx) * 0.008 * CFG.player.mouseSensitivity; lx = e.clientX; } });
  const endLook = () => { lid = null; };
  canvas.addEventListener("pointerup", endLook); canvas.addEventListener("pointercancel", endLook);
  const fireBtn = document.getElementById("fire-btn");
  fireBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); if (game.dead) respawn(); else game.firing = true; });
  fireBtn.addEventListener("pointerup", () => { game.firing = false; });
  fireBtn.addEventListener("pointercancel", () => { game.firing = false; });
  document.getElementById("weapon-btn").addEventListener("click", nextWeapon);
  document.getElementById("map-btn").addEventListener("click", () => { game.mapOpen = !game.mapOpen; });
  document.getElementById("chat-btn").addEventListener("click", openChat);
}

// Xat: ENTER o T obre la caixa
const chatBox = document.getElementById("chat"), chatInput = document.getElementById("chat-input");
function openChat() {
  game.chatting = true; game.keys.clear(); game.firing = false;
  if (document.pointerLockElement) document.exitPointerLock();
  chatBox.classList.remove("hidden"); chatInput.maxLength = CFG.chat.maxLength; chatInput.value = ""; chatInput.focus();
}
function closeChat() { game.chatting = false; chatBox.classList.add("hidden"); chatInput.blur(); }
function bindChat() {
  chatBox.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, CFG.chat.maxLength);
    if (text) { net.send({ t: "say", text }); hud.msgs.push({ text: `${state.look.name}: ${text}`, t: 0, chat: true }); }
    closeChat();
  });
  chatInput.addEventListener("keydown", (e) => { if (e.key === "Escape") closeChat(); });
  chatInput.addEventListener("blur", () => setTimeout(() => game.chatting && closeChat(), 150));
}

// ---------------------------------------------------------------------------
// Portada: el barri de nit girant lentament, el títol i el nom
function initTitle() {
  const name = document.getElementById("title-name");
  name.value = state.look.name || "";
  const go = () => {
    state.look.name = (name.value.trim() || "Andreuenc").slice(0, 16);
    game.onTitle = false;
    document.getElementById("title").classList.add("hidden");
    saveGame();
    net.sendLook();
    if (music.on) startMusic();
    if (!game.touch) lockPointer();
    message(`Benvingut/da a Sant Andreu, ${state.look.name}. Compte de nit…`);
  };
  document.getElementById("title-go").addEventListener("click", go);
  name.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
}

// ---------------------------------------------------------------------------
// Bucle
function frame(dt) {
  updateClock();
  const pl = game.player;
  if (!game.onTitle) {
    updatePlayer(dt);
    updateMonsters(dt);
    scatterItems(dt);
    updateCoins();
    runSystems("update", dt);
    if ((game.streetT = (game.streetT || 0) - dt) <= 0) { game.streetT = 0.5; game.street = nearestStreet(pl.x / TS, pl.y / TS); }
  } else pl.a += dt * 0.12;
  net.update(dt);
  // càmera
  const dark = world.dark, weather = world.weather;
  const skyKey = `${Math.round(dark * 20)}:${weather}`;
  if (skyKey !== world.skyKey) { world.skyKey = skyKey; world.sky = skyGradient(dark, weather); }
  const fogC = world.sky[100], amb = 1 - dark * 0.8 - (weather === "clear" ? 0 : 0.1);
  const cam = {
    x: pl.x, y: pl.y, a: pl.a, bob: pl.moving ? Math.sin(game.walkT * 18) * 1.5 : 0,
    maxD: weather === "fog" ? Math.min(20, CFG.render.drawDistance) : CFG.render.drawDistance, ambient: Math.max(0.12, amb),
    fog: [fogC & 255, (fogC >> 8) & 255, (fogC >> 16) & 255], sky: world.sky, stars: dark > 0.6 && weather === "clear", lantern: dark > 0.5 ? 1 : 0,
  };
  renderView(cam, worldSprites());
  if (game.mapOpen) drawAutomap();
  else if (!game.onTitle) { drawWeather(); drawCrosshair(); if (!game.dead) drawWeapon(dt); }
  if (!game.onTitle) { drawMessages(dt); drawFlashes(dt); drawStatusBar(); }
  // amplia el canvas de baixa resolució a la pantalla, sense suavitzar
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const s = Math.min(canvas.width / R.w, canvas.height / R.h);
  const dw = Math.round(R.w * s), dh = Math.round(R.h * s);
  ctx.drawImage(R.cv, Math.round((canvas.width - dw) / 2), game.touch ? 0 : Math.round((canvas.height - dh) / 2), dw, dh);
}

// Pluja, boira i neu sobre la vista
function drawWeather() {
  const c = R.c, t = Date.now() / 1000, id = world.weather;
  if (id === "rain") {
    c.strokeStyle = "rgba(190,210,255,.45)"; c.beginPath();
    for (let i = 0; i < 90; i++) { const x = (hash2(i, 1) % R.w + t * 40) % R.w, y = (hash2(i, 2) % R.vh + t * 260 * (1 + (i % 3) * 0.2)) % R.vh; c.moveTo(x, y); c.lineTo(x - 1, y + 5); }
    c.stroke();
  } else if (id === "snow") {
    c.fillStyle = "rgba(255,255,255,.85)";
    for (let i = 0; i < 80; i++) { const x = (hash2(i, 1) % R.w + Math.sin(t + i) * 6 + R.w) % R.w, y = (hash2(i, 2) % R.vh + t * 25 * (1 + (i % 4) * 0.3)) % R.vh; c.fillRect(x, y, 1, 1); }
  }
}

async function loadMap() {
  const [bin, meta] = await Promise.all([
    fetch("map.bin?v=" + DATA_VERSION).then((r) => r.body.pipeThrough(new DecompressionStream("deflate"))).then((s) => new Response(s).arrayBuffer()),
    fetch("map.json?v=" + DATA_VERSION).then((r) => r.json()),
  ]);
  const dv = new DataView(bin);
  const W = dv.getUint16(4, true), H = dv.getUint16(6, true);
  state.W = W; state.H = H;
  state.ground = new Uint8Array(bin, 8, W * H);
  state.decor = new Uint8Array(bin, 8 + W * H, W * H);
  state.meta = meta;
}

async function main() {
  resize();
  await Promise.all([loadMap(), loadConfig()]);
  initThemes();
  try { await document.fonts.load('8px "Press Start 2P"'); } catch { /* font opcional */ }
  initRenderer();
  initHud();
  initMonsters();
  initWorldSprites();
  buildStreetGrid();
  loadGame();
  // a la portada, la vista gira sobre la Plaça d'Orfila
  if (game.onTitle && !store.getJSON(SAVE_KEY)) game.player.a = 0;
  bindTouch();
  bindInput();
  bindChat();
  initTitle();
  runSystems("init");
  state.player = game.player; // themes.js (zona actual) llegeix state.player
  net.connect();
  setInterval(saveGame, 3000);
  addEventListener("pagehide", saveGame);
  document.getElementById("loading").classList.add("hidden");
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (canvas.width !== Math.floor(innerWidth * (window.devicePixelRatio || 1))) { resize(); resizeRenderer(); }
    frame(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// themes.js i music.js criden aquestes dues en canviar de zona
function showBanner(text) { message(text); }

const start = () => main().catch((e) => {
  document.getElementById("loading").textContent = "Error carregant el mapa: " + e.message;
  console.error(e);
});
if (document.readyState === "loading") addEventListener("DOMContentLoaded", start);
else start();
