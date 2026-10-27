// Monstres, projectils i objectes per recollir. Els monstres són locals de cada jugador (com al
// Sant Andreu RPG): apareixen al voltant teu en carrers i places, fora de la vista, i de nit
// (CFG.night) n'hi ha molts més. Quan et veuen t'empaiten; els dimonis llancen boles de foc.
// Quan cauen deixen munició o, de tant en tant, una farmaciola.
"use strict";

const MONSTER_TYPES = {
  zombie: { hp: 30, speed: 0.9, h: 14, melee: 8, ranged: false, sight: 14, score: 1, corpse: "#5a7a4a", pain: 0.4,
    lines: ["Grrrr…", "Cerveeells…"] },
  demon: { hp: 60, speed: 1.15, h: 17, melee: 12, ranged: true, sight: 18, score: 2, corpse: "#8a2a1a", pain: 0.5 },
  ghost: { hp: 20, speed: 1.9, h: 12, melee: 5, ranged: false, sight: 12, score: 1, corpse: null, pain: 0.2, flies: true },
  thief: { hp: 25, speed: 1.6, h: 14, melee: 0, ranged: false, sight: 16, score: 1, corpse: "#2a2a34", pain: 0.3, steals: true },
};
const SPAWN_TILES = new Set([T.SIDEWALK, T.PLAZA, T.GROUND, T.PARK, T.GRASS, T.DIRT, T.ROAD, T.PEDESTRIAN ?? T.PLAZA, T.CYCLEWAY]);

const mobs = { list: [], shots: [], puffs: [], items: [], sprites: null, spawnT: 0, nextId: 1 };

function initMonsters() {
  const zLook = { ...DEFAULT_LOOK, name: "", zombie: true, eyes: "#e03030", skin: "#8fbf6a", hair: "#2a2a1e", shirt: "#5a5048", pants: "#3a3430" };
  const tLook = { ...DEFAULT_LOOK, name: "", mask: true, shirt: "#1d1d26", pants: "#1d1d26", hair: "#111111", extra: "cap", extraColor: "#111111" };
  mobs.sprites = {
    zombie: [makeHero("down", 1, zLook), makeHero("down", 3, zLook)],
    thief: [makeHero("down", 1, tLook), makeHero("down", 3, tLook)],
    demon: [makeDemon(0), makeDemon(1), makeDemon(2), makeDemon(3)],
    ghost: [makeGhost(0), makeGhost(1)],
    corpse: Object.fromEntries(Object.entries(MONSTER_TYPES).filter(([, t]) => t.corpse).map(([k, t]) => [k, makeCorpse(t.corpse)])),
    fireball: [makeFireball(0), makeFireball(1)], puff: [makePuff(0), makePuff(1)],
    items: Object.fromEntries(["ammo", "shells", "health", "armor", "shotgun"].map((k) => [k, makePickup(k)])),
  };
}

const walkableTile = (tx, ty) => {
  const v = g(tx, ty);
  return v !== 255 && !(v & OUTSIDE) && SPAWN_TILES.has(v & 127) && !blocked(tx, ty);
};

// Col·lisió d'un cercle (radi en caselles) amb el mapa
function circleBlocked(x, y, r = 0.28) {
  for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) if (blocked(Math.floor(x / TS + ox), Math.floor(y / TS + oy))) return true;
  return false;
}
// Mou una entitat amb lliscament per les parets; torna quant s'ha mogut
function moveEntity(e, dx, dy, r) {
  const x0 = e.x, y0 = e.y;
  if (!circleBlocked(e.x + dx, e.y, r)) e.x += dx;
  if (!circleBlocked(e.x, e.y + dy, r)) e.y += dy;
  return Math.hypot(e.x - x0, e.y - y0);
}

function wantedMonsters() {
  const n = night() ? CFG.night.multiplier : 1, m = CFG.monsters;
  return { zombie: Math.round(m.zombies * n), demon: Math.round(m.demons * n), ghost: night() ? Math.round(m.ghosts * n) : 0, thief: night() ? 0 : m.thieves };
}

function spawnMonster(kind) {
  const pl = game.player;
  for (let tries = 0; tries < 30; tries++) {
    const ang = Math.random() * Math.PI * 2, d = CFG.monsters.spawnMin + Math.random() * (CFG.monsters.spawnMax - CFG.monsters.spawnMin);
    const tx = Math.floor(pl.x / TS + Math.cos(ang) * d), ty = Math.floor(pl.y / TS + Math.sin(ang) * d);
    if (!walkableTile(tx, ty)) continue;
    const x = tx * TS + 8, y = ty * TS + 8;
    if (lineOfSight(pl.x, pl.y, x, y) && d < 22) continue; // millor que no aparegui davant teu
    const t = MONSTER_TYPES[kind];
    mobs.list.push({ id: mobs.nextId++, kind, x, y, hp: t.hp, state: "idle", t: Math.random() * 3, cd: 0, pain: 0, anim: Math.random() * 2,
      wx: 0, wy: 0, wt: 0, loot: 0 });
    return;
  }
}

function updateMonsters(dt) {
  const pl = game.player, alive = !game.dead;
  // n'apareixen de nous (i desapareixen els que queden massa lluny)
  mobs.list = mobs.list.filter((m) => m.state === "dead" ? m.t < 60 : Math.hypot(m.x - pl.x, m.y - pl.y) / TS < CFG.monsters.spawnMax + 25);
  if ((mobs.spawnT -= dt) <= 0) {
    mobs.spawnT = 0.5;
    const want = wantedMonsters();
    for (const [k, n] of Object.entries(want)) if (mobs.list.filter((m) => m.kind === k && m.state !== "dead").length < n) { spawnMonster(k); break; }
  }
  for (const m of mobs.list) {
    const t = MONSTER_TYPES[m.kind];
    m.t += dt; m.cd -= dt; m.anim += dt * 3;
    if (m.state === "dead") continue;
    if (m.pain > 0) { m.pain -= dt; continue; }
    const dx = pl.x - m.x, dy = pl.y - m.y, dist = Math.hypot(dx, dy) / TS;
    const sees = alive && dist < t.sight && (t.flies || lineOfSight(m.x, m.y, pl.x, pl.y));
    if (sees) m.state = "chase";
    else if (m.state === "chase" && dist > t.sight * 1.6) m.state = "idle";
    const speed = t.speed * TS * dt * (night() ? 1.15 : 1);
    if (m.state === "chase") {
      if (t.steals && m.loot) { // el lladre fuig amb el botí
        moveEntity(m, (-dx / (dist * TS)) * speed * 1.1, (-dy / (dist * TS)) * speed * 1.1, 0.25);
        continue;
      }
      if (t.ranged && sees && dist > 2.5 && dist < 16 && m.cd <= 0 && Math.random() < dt * 1.2) {
        m.cd = 1.6 + Math.random(); m.attack = 0.5;
        const a = Math.atan2(dy, dx);
        mobs.shots.push({ x: m.x, y: m.y, vx: Math.cos(a) * 6 * TS, vy: Math.sin(a) * 6 * TS, t: 0, dmg: CFG.monsters.fireballDamage });
        sfx("fireball");
      }
      if (m.attack > 0) { m.attack -= dt; continue; }
      if (dist < 0.9) {
        if (m.cd <= 0) {
          m.cd = 1;
          if (t.steals) {
            const n = Math.min(game.wallet, 3 + ((Math.random() * 4) | 0));
            if (n > 0) { game.wallet -= n; m.loot = n; message(`Un lladre t'ha pispat ${n} monedes! Atrapa'l!`); sfx("hurt"); }
            else { m.state = "idle"; m.wt = 0; }
          } else hurtPlayer(t.melee, m);
        }
      } else if (t.flies) { m.x += (dx / (dist * TS)) * speed; m.y += (dy / (dist * TS)) * speed; }
      else if (moveEntity(m, (dx / (dist * TS)) * speed, (dy / (dist * TS)) * speed, 0.25) < speed * 0.3) {
        // encallat: prova de vorejar
        const side = (m.id % 2 ? 1 : -1);
        moveEntity(m, (-dy / (dist * TS)) * speed * side, (dx / (dist * TS)) * speed * side, 0.25);
      }
    } else { // passeja
      if ((m.wt -= dt) <= 0) { const a = Math.random() * Math.PI * 2; m.wx = Math.cos(a); m.wy = Math.sin(a); m.wt = 1 + Math.random() * 3; }
      if (t.flies) { m.x += m.wx * speed * 0.4; m.y += m.wy * speed * 0.4; }
      else if (moveEntity(m, m.wx * speed * 0.4, m.wy * speed * 0.4, 0.25) < 0.01) m.wt = 0;
    }
  }
  // boles de foc
  for (const s of mobs.shots) {
    s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt;
    if (blocked(Math.floor(s.x / TS), Math.floor(s.y / TS)) && isBuilding(g(Math.floor(s.x / TS), Math.floor(s.y / TS)))) s.done = true;
    else if (alive && Math.hypot(s.x - pl.x, s.y - pl.y) < TS * 0.5) { hurtPlayer(s.dmg, s); s.done = true; }
    if (s.t > 4) s.done = true;
    if (s.done) mobs.puffs.push({ x: s.x, y: s.y, t: 0, fire: true });
  }
  mobs.shots = mobs.shots.filter((s) => !s.done);
  for (const p of mobs.puffs) p.t += dt;
  mobs.puffs = mobs.puffs.filter((p) => p.t < 0.3);
  // objectes
  for (const it of mobs.items) {
    it.t += dt;
    if (alive && Math.hypot(it.x - pl.x, it.y - pl.y) < TS * 0.7 && pickUp(it.kind)) it.done = true;
  }
  mobs.items = mobs.items.filter((it) => !it.done && it.t < 120);
}

function damageMonster(m, dmg) {
  if (m.state === "dead") return;
  const t = MONSTER_TYPES[m.kind];
  m.hp -= dmg; m.state = "chase";
  if (Math.random() < t.pain) m.pain = 0.25;
  if (m.hp > 0) return;
  m.state = "dead"; m.t = 0;
  game.kills++;
  game.score += t.score;
  sfx("die");
  // botí
  const r = Math.random();
  if (m.loot) { game.wallet += m.loot; message(`Has recuperat ${m.loot} monedes!`); }
  if (m.kind === "zombie" || m.kind === "thief") mobs.items.push({ kind: r < 0.12 ? "health" : "ammo", x: m.x, y: m.y, t: 0 });
  else if (m.kind === "demon") mobs.items.push({ kind: r < 0.25 ? "health" : r < 0.35 ? "armor" : "shells", x: m.x, y: m.y, t: 0 });
}

// Sprites per al motor
function pushMonsterSprites(list) {
  const S = mobs.sprites;
  for (const m of mobs.list) {
    const t = MONSTER_TYPES[m.kind];
    if (m.state === "dead") {
      if (S.corpse[m.kind]) list.push({ x: m.x, y: m.y, img: S.corpse[m.kind], h: 3 });
      continue;
    }
    let img;
    if (m.kind === "demon") img = m.pain > 0 ? S.demon[3] : m.attack > 0 ? S.demon[2] : S.demon[Math.floor(m.anim) % 2];
    else img = S[m.kind][Math.floor(m.anim) % 2];
    list.push({ x: m.x, y: m.y, img, h: t.h, z: t.flies ? 0.3 + Math.sin(m.t * 2) * 0.1 : 0, mob: m });
  }
  for (const s of mobs.shots) list.push({ x: s.x, y: s.y, img: S.fireball[Math.floor(s.t * 10) % 2], h: 4, z: 0.45, bright: true });
  for (const p of mobs.puffs) list.push({ x: p.x, y: p.y, img: p.fire ? S.fireball[1] : S.puff[p.t > 0.15 ? 1 : 0], h: p.fire ? 5 : 3, z: p.z ?? 0.5, bright: p.fire });
  for (const it of mobs.items) list.push({ x: it.x, y: it.y, img: S.items[it.kind], h: 5, z: 0 });
}

// De tant en tant apareix munició o salut pel barri, a prop teu
function scatterItems(dt) {
  game.itemT = (game.itemT || 0) - dt;
  if (game.itemT > 0 || mobs.items.length > 25) return;
  game.itemT = 6;
  const pl = game.player;
  for (let tries = 0; tries < 20; tries++) {
    const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 20;
    const tx = Math.floor(pl.x / TS + Math.cos(a) * d), ty = Math.floor(pl.y / TS + Math.sin(a) * d);
    if (!walkableTile(tx, ty)) continue;
    const r = Math.random();
    const kind = r < 0.45 ? "ammo" : r < 0.7 ? "shells" : r < 0.88 ? "health" : r < 0.97 ? "armor" : "shotgun";
    mobs.items.push({ kind, x: tx * TS + 8, y: ty * TS + 8, t: 0 });
    return;
  }
}
