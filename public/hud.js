// Marcador a l'estil dels shooters dels 90 (barra de baix amb munició, salut, cara, armes,
// armadura i monedes), l'arma en primera persona, els missatges de dalt i l'automapa.
// Tot es dibuixa sobre el canvas de baixa resolució del motor (R.c), abans d'ampliar-lo.
"use strict";

const hud = { faces: null, weapons: null, msgs: [], flash: 0, pickupFlash: 0, look: 1, lookT: 0, ouch: 0, stone: null, coinImg: null };
const FONT = (px) => `${px}px "Press Start 2P", monospace`;

function initHud() {
  hud.faces = [];
  for (let lvl = 0; lvl < 5; lvl++) hud.faces.push([0, 1, 2].map((l) => makeFace(lvl, l, false, false)));
  hud.facesOuch = [0, 1, 2, 3, 4].map((l) => makeFace(l, 1, true, false));
  hud.faceDead = makeFace(4, 1, false, true);
  hud.weapons = { fist: [makeWeapon("fist", 0), makeWeapon("fist", 1)], pistol: [makeWeapon("pistol", 0), makeWeapon("pistol", 1)],
    shotgun: [makeWeapon("shotgun", 0), makeWeapon("shotgun", 1), makeWeapon("shotgun", 2)] };
  hud.coinImg = makeCoinFrame(0);
  // textura de pedra per a la barra
  const p = new Pix(64, HUD_H), r = rng(77);
  for (let y = 0; y < HUD_H; y++) for (let x = 0; x < 64; x++) p.set(x, y, shade(hex("#5a5248"), ((r() * 30) | 0) - 15 + ((x % 16 === 0 || y % 8 === 0) ? -22 : 0)));
  hud.stone = p.toCanvas();
}

function message(text) {
  hud.msgs.push({ text, t: 0 });
  if (hud.msgs.length > 4) hud.msgs.shift();
}

// Arma en primera persona (balanceig en caminar i retrocés en disparar)
function drawWeapon(dt) {
  const c = R.c, wpn = game.weapon, frames = hud.weapons[wpn], pl = game.player;
  const bob = pl.moving ? Math.sin(game.walkT * 9) : 0;
  let f = 0;
  if (game.fireT > 0) f = wpn === "shotgun" ? (game.fireT > 0.55 ? 1 : game.fireT > 0.2 ? 2 : 0) : game.fireT > 0.12 ? 1 : 0;
  const img = frames[f], sc = 1.25;
  const x = Math.round(R.w / 2 - (img.width * sc) / 2 + bob * 6), y = Math.round(R.vh - img.height * sc + 6 + Math.abs(bob) * 4);
  c.imageSmoothingEnabled = false;
  c.drawImage(img, x, y, img.width * sc, img.height * sc);
}

function drawStatusBar() {
  const c = R.c, w = R.w, y0 = R.vh, p = game;
  c.imageSmoothingEnabled = false;
  for (let x = 0; x < w; x += 64) c.drawImage(hud.stone, x, y0);
  c.fillStyle = "#2a2420"; c.fillRect(0, y0, w, 1);
  // caselles
  const cell = (x, cw, label) => {
    c.fillStyle = "rgba(20,14,10,.55)"; c.fillRect(x, y0 + 2, cw, HUD_H - 4);
    c.fillStyle = "#c8b89a"; c.font = FONT(5); c.textAlign = "center"; c.textBaseline = "alphabetic";
    c.fillText(label, x + cw / 2, y0 + HUD_H - 3);
  };
  const big = (text, x, color) => {
    c.font = FONT(10); c.textAlign = "center"; c.textBaseline = "alphabetic";
    c.fillStyle = "#1a0806"; c.fillText(text, x + 1, y0 + 18);
    c.fillStyle = color; c.fillText(text, x, y0 + 17);
  };
  // amplades de les caselles (s'encongeixen si la pantalla és estreta)
  const base = [46, 54, 36, 30, 54], extra = w - base.reduce((a, b) => a + b, 0) - 8;
  const showCoins = extra >= 50, k = showCoins ? 1 : Math.max(0.6, (w - 8) / base.reduce((a, b) => a + b, 0));
  const ws = base.map((b) => Math.floor(b * k));
  let x = 2;
  const next = (i) => { const x0 = x; x += ws[i] + 1; return x0; };
  const ammo = p.weapon === "fist" ? "–" : String(p.weapon === "shotgun" ? p.shells : p.bullets);
  let cx = next(0); cell(cx, ws[0], "MUNICIÓ"); big(ammo, cx + ws[0] / 2, "#e02a1a");
  cx = next(1); cell(cx, ws[1], "SALUT"); big(`${Math.max(0, Math.round(p.hp))}%`, cx + ws[1] / 2, "#e02a1a");
  cx = next(2); cell(cx, ws[2], "ARMES");
  c.font = FONT(6); c.textAlign = "center";
  [["1", "fist"], ["2", "pistol"], ["3", "shotgun"]].forEach(([n, key], i) => {
    c.fillStyle = p.weapon === key ? "#ffd23f" : p.has[key] ? "#c8b89a" : "#4a4038";
    c.fillText(n, cx + ws[2] / 2 + (i - 1) * 10, y0 + 14);
  });
  // cara
  cx = next(3);
  c.fillStyle = "#1a1410"; c.fillRect(cx, y0 + 1, ws[3], HUD_H - 2);
  const lvl = Math.min(4, Math.floor((100 - Math.max(0, p.hp)) / 20));
  const face = p.dead ? hud.faceDead : hud.ouch > 0 ? hud.facesOuch[lvl] : hud.faces[lvl][hud.look];
  c.drawImage(face, cx + ws[3] / 2 - 12, y0 + 2);
  cx = next(4); cell(cx, ws[4], "ARMADURA"); big(`${Math.round(p.armor)}%`, cx + ws[4] / 2, "#e02a1a");
  if (showCoins) {
    const x2 = x, cw = w - x2 - 2;
    cell(x2, cw, cw > 80 ? "MONEDES · BAIXES" : "MONEDES");
    c.drawImage(hud.coinImg, x2 + 4, y0 + 7);
    c.font = FONT(7); c.textAlign = "left"; c.fillStyle = "#ffd23f";
    c.fillText(String(p.wallet), x2 + 16, y0 + 15);
    if (cw > 80) { c.textAlign = "right"; c.fillStyle = "#e8dcc0"; c.fillText(String(p.kills), x2 + cw - 4, y0 + 15); }
  }
  c.textAlign = "left";
}

function drawMessages(dt) {
  const c = R.c;
  c.font = FONT(5); c.textBaseline = "top"; c.textAlign = "left";
  hud.msgs.forEach((m, i) => {
    m.t += dt;
    c.fillStyle = "#1a0806"; c.fillText(m.text, 4, 4 + i * 8);
    c.fillStyle = m.chat ? "#9fd3ff" : "#ffd23f"; c.fillText(m.text, 3, 3 + i * 8);
  });
  hud.msgs = hud.msgs.filter((m) => m.t < (m.chat ? 10 : 4));
  // carrer on ets, a dalt a la dreta
  if (game.street) {
    c.textAlign = "right"; c.fillStyle = "rgba(0,0,0,.5)"; c.fillText(game.street, R.w - 2, 4);
    c.fillStyle = "#e8dcc0"; c.fillText(game.street, R.w - 3, 3);
  }
  // noms dels altres jugadors
  c.textAlign = "center"; c.textBaseline = "bottom";
  for (const l of R.labels) { c.fillStyle = "#000"; c.fillText(l.text, l.x + 1, l.y + 1); c.fillStyle = l.color; c.fillText(l.text, l.x, l.y); }
  c.textAlign = "left"; c.textBaseline = "alphabetic";
}

// Vermell quan et fan mal, groc quan reculls alguna cosa
function drawFlashes(dt) {
  const c = R.c;
  if (hud.flash > 0) { c.fillStyle = `rgba(200,20,10,${Math.min(0.5, hud.flash)})`; c.fillRect(0, 0, R.w, R.vh); hud.flash -= dt; }
  if (hud.pickupFlash > 0) { c.fillStyle = `rgba(255,220,80,${hud.pickupFlash})`; c.fillRect(0, 0, R.w, R.vh); hud.pickupFlash -= dt; }
  if (hud.ouch > 0) hud.ouch -= dt;
  if ((hud.lookT -= dt) <= 0) { hud.lookT = 1 + Math.random() * 2; hud.look = [0, 1, 1, 2][(Math.random() * 4) | 0]; }
  if (game.dead) {
    c.fillStyle = "rgba(120,0,0,.45)"; c.fillRect(0, 0, R.w, R.vh);
    c.font = FONT(12); c.textAlign = "center"; c.fillStyle = "#000"; c.fillText("HAS MORT", R.w / 2 + 1, R.vh / 2 - 7);
    c.fillStyle = "#ff3a2a"; c.fillText("HAS MORT", R.w / 2, R.vh / 2 - 8);
    c.font = FONT(5); c.fillStyle = "#f4e8d0";
    c.fillText(game.touch ? "Toca la pantalla per tornar a Sant Andreu" : "Prem ESPAI per tornar a Sant Andreu", R.w / 2, R.vh / 2 + 10);
    c.textAlign = "left";
  }
}

// Mira al centre
function drawCrosshair() {
  const c = R.c, x = R.w / 2, y = R.horizon;
  c.fillStyle = "rgba(255,240,200,.7)";
  c.fillRect(x - 3, y, 2, 1); c.fillRect(x + 2, y, 2, 1); c.fillRect(x, y - 3, 1, 2); c.fillRect(x, y + 2, 1, 2);
}

// Automapa: edificis en vermell sobre negre, el jugador amb una fletxa (tecla TAB o M)
function drawAutomap() {
  const c = R.c, w = R.w, h = R.vh, k = game.mapZoom, pl = game.player;
  c.fillStyle = "#000"; c.fillRect(0, 0, w, h);
  const cxT = pl.x / TS, cyT = pl.y / TS, hw = w / 2 / k, hh = h / 2 / k;
  const x0 = Math.max(1, Math.floor(cxT - hw)), x1 = Math.min(state.W - 2, Math.ceil(cxT + hw));
  const y0 = Math.max(1, Math.floor(cyT - hh)), y1 = Math.min(state.H - 2, Math.ceil(cyT + hh));
  const sx = (tx) => (tx - cxT) * k + w / 2, sy = (ty) => (ty - cyT) * k + h / 2;
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const v = g(tx, ty);
    const b = isBuilding(v);
    if (!b) {
      const vv = v & 127;
      if (vv === T.WATER || vv === T.POOL) { c.fillStyle = "#123a6a"; c.fillRect(sx(tx), sy(ty), k, k); }
      else if (vv === T.PARK || vv === T.GRASS || vv === T.FOREST || vv === T.PITCH) { c.fillStyle = "#0c2a10"; c.fillRect(sx(tx), sy(ty), k, k); }
      continue;
    }
    c.fillStyle = "#e02a1a";
    if (!isBuilding(g(tx, ty - 1))) c.fillRect(sx(tx), sy(ty), k, 1);
    if (!isBuilding(g(tx, ty + 1))) c.fillRect(sx(tx), sy(ty + 1) - 1, k, 1);
    if (!isBuilding(g(tx - 1, ty))) c.fillRect(sx(tx), sy(ty), 1, k);
    if (!isBuilding(g(tx + 1, ty))) c.fillRect(sx(tx + 1) - 1, sy(ty), 1, k);
  }
  // límit del barri
  c.strokeStyle = "#c8a030"; c.lineWidth = 1; c.beginPath();
  for (const ring of state.meta.boundary) ring.forEach(([x, y], i) => i ? c.lineTo(sx(x), sy(y)) : c.moveTo(sx(x), sy(y)));
  c.stroke();
  for (const o of net.others.values()) { c.fillStyle = "#4ade80"; c.fillRect(sx(o.x / TS) - 1, sy(o.y / TS) - 1, 3, 3); }
  for (const cn of coinsList()) { c.fillStyle = "#ffd23f"; c.fillRect(sx(cn.x) - 0.5, sy(cn.y) - 0.5, 1.5, 1.5); }
  // jugador
  const a = pl.a, px = w / 2, py = h / 2;
  c.strokeStyle = "#ffffff"; c.beginPath();
  c.moveTo(px + Math.cos(a) * 6, py + Math.sin(a) * 6);
  c.lineTo(px + Math.cos(a + 2.5) * 4, py + Math.sin(a + 2.5) * 4);
  c.lineTo(px + Math.cos(a - 2.5) * 4, py + Math.sin(a - 2.5) * 4);
  c.closePath(); c.stroke();
  c.font = FONT(5); c.fillStyle = "#e02a1a"; c.textBaseline = "top";
  c.fillText("SANT ANDREU DE PALOMAR", 3, 3);
  c.textAlign = "right"; c.fillText(game.touch ? "MAPA: tanca" : "TAB: tanca · +/-: zoom", w - 3, 3); c.textAlign = "left";
  c.textBaseline = "alphabetic";
}
