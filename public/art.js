// Pixel art propi del joc (generat per codi): armes en primera persona, monstres, objectes per
// recollir i la cara del marcador. Són dissenys originals inspirats en els shooters dels 90.
"use strict";

const P = (h) => hex(h);
const C8 = {
  ink: P("#141018"), steel: P("#7c8494"), steelD: P("#4a5060"), steelL: P("#b8c0cc"), wood: P("#7a4a26"), woodD: P("#4e2e16"),
  skin: P("#e0a878"), skinD: P("#b07850"), sleeve: P("#3e5a2e"), sleeveD: P("#2a3e20"), flash: P("#fff2a0"), flash2: P("#ff9a2a"),
  red: P("#c0281e"), redD: P("#7a1410"), yellow: P("#ffd23f"), green: P("#3fa03a"), greenD: P("#246a22"), white: P("#f4f1e8"),
};

// Mà amb màniga (part comuna de les armes)
function hand(p, x, y, flip) {
  for (let j = 0; j < 12; j++) for (let i = 0; i < 12; i++) {
    const dx = flip ? 11 - i : i;
    if (j > 6) p.set(x + dx, y + j, j > 9 ? C8.sleeveD : C8.sleeve);
    else if ((i - 6) ** 2 / 36 + (j - 4) ** 2 / 20 < 1) p.set(x + dx, y + j, i < 3 || j < 2 ? C8.skinD : C8.skin);
  }
}

// Armes: [repòs, tret] (el puny: [repòs, cop])
function makeWeapon(kind, f) {
  const p = new Pix(80, 60);
  if (kind === "fist") {
    const up = f ? -14 : 0, x = f ? 30 : 46;
    for (let j = 0; j < 22; j++) for (let i = 0; i < 20; i++) {
      const d = (i - 10) ** 2 / 100 + (j - 9) ** 2 / 81;
      if (d < 1) p.set(x + i, 30 + up + j, j < 6 && i % 5 === 0 ? C8.skinD : d > 0.75 ? C8.skinD : C8.skin);
    }
    p.rect(x + 2, 50 + up, 16, 30, C8.sleeve); p.rect(x + 2, 56 + up, 16, 4, C8.sleeveD);
  } else if (kind === "pistol") {
    const kick = f ? -4 : 0;
    p.rect(35, 24 + kick, 10, 22, C8.steelD); p.rect(36, 24 + kick, 8, 20, C8.steel); p.rect(37, 25 + kick, 2, 18, C8.steelL);
    p.rect(38, 22 + kick, 4, 3, C8.ink); // forat del canó
    p.rect(33, 40 + kick, 14, 8, C8.woodD); p.rect(34, 41 + kick, 12, 6, C8.wood);
    hand(p, 30, 42 + kick, false); hand(p, 40, 44 + kick, true);
    if (f) for (let j = 0; j < 14; j++) for (let i = 0; i < 16; i++) {
      const d = (i - 8) ** 2 / 64 + (j - 7) ** 2 / 49;
      if (d < 1) p.set(32 + i, 6 + j, d < 0.35 ? C8.white : d < 0.7 ? C8.flash : C8.flash2);
    }
  } else { // escopeta de dos canons
    const kick = f === 1 ? -6 : f === 2 ? 4 : 0;
    for (let k = 0; k < 2; k++) { p.rect(31 + k * 10, 18 + kick, 8, 30, C8.steelD); p.rect(32 + k * 10, 18 + kick, 6, 28, C8.steel); p.rect(33 + k * 10, 19 + kick, 2, 26, C8.steelL); p.rect(33 + k * 10, 16 + kick, 4, 3, C8.ink); }
    p.rect(28, 38 + kick, 24, 12, C8.woodD); p.rect(29, 39 + kick, 22, 9, C8.wood); p.rect(31, 41 + kick, 18, 2, C8.woodD);
    hand(p, 24, 44 + kick, false); hand(p, 44, 46 + kick, true);
    if (f === 1) for (let j = 0; j < 18; j++) for (let i = 0; i < 30; i++) {
      const d = (i - 15) ** 2 / 225 + (j - 9) ** 2 / 81;
      if (d < 1) p.set(25 + i, j - 2, d < 0.3 ? C8.white : d < 0.65 ? C8.flash : C8.flash2);
    }
  }
  p.outline(C8.ink);
  return p.toCanvas();
}

// Dimoni: bèstia vermella amb banyes, ulls grocs i urpes (llança boles de foc)
function makeDemon(f) {
  const p = new Pix(24, 30), body = P("#a8321e"), bodyD = P("#6e1e12"), belly = P("#d8784a"), horn = P("#e8dcc0");
  const step = f === 1 ? 1 : 0;
  for (let y = 4; y < 22; y++) for (let x = 3; x < 21; x++) {
    const dx = (x - 12) / 8.5, dy = (y - 13) / 9;
    if (dx * dx + dy * dy < 1) p.set(x, y, x > 15 ? bodyD : body);
  }
  for (let y = 12; y < 20; y++) for (let x = 9; x < 15; x++) p.set(x, y, belly);
  // banyes
  p.set(6, 3, horn); p.set(5, 2, horn); p.set(5, 1, horn); p.set(17, 3, horn); p.set(18, 2, horn); p.set(18, 1, horn);
  // ulls i boca
  p.rect(8, 8, 3, 2, C8.yellow); p.rect(13, 8, 3, 2, C8.yellow); p.set(9, 8, C8.ink); p.set(14, 8, C8.ink);
  p.rect(9, 11, 6, 2, C8.ink); p.set(10, 11, C8.white); p.set(13, 11, C8.white);
  // braços (a dalt quan ataca)
  if (f === 2) { p.rect(1, 2, 3, 10, body); p.rect(20, 2, 3, 10, body); p.rect(0, 0, 4, 3, C8.flash2); p.rect(20, 0, 4, 3, C8.flash2); }
  else { p.rect(1, 12, 3, 9, body); p.rect(20, 12, 3, 9, bodyD); p.rect(0, 20, 4, 2, horn); p.rect(20, 20, 4, 2, horn); }
  // cames
  p.rect(7, 22, 4, 6 - step, bodyD); p.rect(13, 22, 4, 5 + step, bodyD); p.rect(6, 28 - step, 5, 2, C8.ink); p.rect(13, 27 + step, 5, 2, C8.ink);
  if (f === 3) for (let i = 0; i < 24 * 30; i++) if (p.data[i]) p.data[i] = shade(p.data[i], 60); // dolor: s'il·lumina
  p.outline(C8.ink);
  return p.toCanvas();
}

// Restes d'un monstre abatut
function makeCorpse(col) {
  const p = new Pix(22, 8), c = P(col);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 22; x++) {
    const d = (x - 11) ** 2 / 121 + (y - 5) ** 2 / 12;
    if (d < 1) p.set(x, y, d < 0.4 ? shade(c, 20) : (x + y) % 5 === 0 ? C8.redD : c);
  }
  for (let i = 0; i < 6; i++) p.set(3 + i * 3, 6 + (i % 2), C8.red);
  p.outline(C8.ink);
  return p.toCanvas();
}

function makeFireball(f) {
  const p = new Pix(10, 10);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    const d = Math.hypot(x - 4.5, y - 4.5) / (f ? 4.6 : 4.2);
    if (d < 1) p.set(x, y, d < 0.4 ? C8.white : d < 0.7 ? C8.flash : C8.flash2);
  }
  return p.toCanvas();
}
function makePuff(f) {
  const p = new Pix(8, 8), c = f ? P("#9a9aa4") : P("#d8d8e0");
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (Math.hypot(x - 3.5, y - 3.5) < 3.5 - f) p.set(x, y, c);
  return p.toCanvas();
}

// Objectes per recollir
function makePickup(kind) {
  const p = new Pix(16, 12);
  if (kind === "ammo") { // caixa de bales
    p.rect(1, 3, 14, 9, P("#6a5a2a")); p.rect(2, 4, 12, 7, P("#8e7a3a")); p.rect(2, 6, 12, 1, P("#5a4a20"));
    for (let i = 0; i < 4; i++) { p.rect(3 + i * 3, 0, 2, 4, P("#d8b040")); p.set(3 + i * 3, 0, P("#a07020")); }
  } else if (kind === "shells") { // cartutxos vermells
    for (let i = 0; i < 4; i++) { p.rect(1 + i * 4, 2, 3, 8, C8.red); p.rect(1 + i * 4, 8, 3, 3, P("#d8b040")); p.set(2 + i * 4, 3, P("#f07060")); }
  } else if (kind === "health") { // farmaciola
    p.rect(1, 2, 14, 10, C8.white); p.rect(2, 3, 12, 8, P("#e8e4dc")); p.rect(7, 4, 2, 6, C8.red); p.rect(5, 6, 6, 2, C8.red); p.rect(6, 0, 4, 2, P("#9a9a9a"));
  } else if (kind === "armor") { // armilla verda
    p.rect(2, 1, 12, 11, C8.greenD); p.rect(3, 2, 10, 9, C8.green); p.rect(6, 1, 4, 3, C8.ink); p.rect(5, 6, 6, 1, C8.greenD);
  } else if (kind === "shotgun") { // escopeta a terra
    p.rect(0, 5, 11, 2, C8.steel); p.rect(0, 7, 11, 1, C8.steelD); p.rect(10, 4, 6, 5, C8.wood); p.rect(12, 8, 3, 2, C8.woodD);
  }
  p.outline(C8.ink);
  return p.toCanvas();
}

// Cara del marcador: 5 nivells de salut × 3 mirades, més "ai!" i mort
function makeFace(level, look, ouch, dead) {
  const p = new Pix(24, 28), skin = level >= 3 ? P("#d09070") : C8.skin, hair = P("#4a2b1a"), stub = P("#a07050");
  for (let y = 3; y < 27; y++) for (let x = 2; x < 22; x++) {
    const d = ((x - 12) / 10) ** 2 + ((y - 15) / 12) ** 2;
    if (d < 1) p.set(x, y, x > 17 ? shade(skin, -30) : skin);
  }
  for (let y = 1; y < 9; y++) for (let x = 2; x < 22; x++) if (((x - 12) / 10.5) ** 2 + ((y - 9) / 8) ** 2 < 1 && y < 8) p.set(x, y, hair);
  for (let x = 5; x < 19; x++) for (let y = 20; y < 26; y++) if (((x - 12) / 7) ** 2 + ((y - 21) / 5) ** 2 < 1 && (x + y) % 2) p.set(x, y, stub);
  if (dead) { // ulls en creu
    for (const ex of [6, 14]) { p.set(ex, 11, C8.ink); p.set(ex + 2, 13, C8.ink); p.set(ex + 1, 12, C8.ink); p.set(ex + 2, 11, C8.ink); p.set(ex, 13, C8.ink); }
    p.rect(9, 19, 6, 2, C8.ink);
  } else {
    const off = look - 1;
    for (const ex of [6, 14]) { p.rect(ex, 11, 4, 3, C8.white); p.rect(ex + 1 + off, 11, 2, 3, ouch ? C8.red : C8.ink); }
    p.rect(6, 9, 4, 1, hair); p.rect(14, 9, 4, 1, hair);
    if (ouch) { p.rect(9, 18, 6, 4, C8.ink); p.rect(10, 19, 4, 2, C8.redD); }
    else if (level <= 1) { p.rect(9, 19, 6, 1, C8.ink); p.set(8, 18, C8.ink); p.set(15, 18, C8.ink); } // somriu
    else p.rect(9, 19, 6, 1, C8.ink);
  }
  p.rect(11, 14, 2, 4, shade(skin, -40)); // nas
  // ferides segons la salut
  const blood = [[4, 16], [18, 6], [7, 23], [16, 21], [12, 4], [19, 15]];
  for (let i = 0; i < Math.min(blood.length, level * 2); i++) { const [bx, by] = blood[i]; p.rect(bx, by, 2, 2, C8.red); p.set(bx, by + 2, C8.redD); }
  p.outline(C8.ink);
  return p.toCanvas();
}

// Fantasma semitransparent (2 fotogrames)
function makeGhost(f) {
  const p = new Pix(16, 18), body = [236, 242, 255, 170], shadowC = [176, 190, 230, 170];
  for (let y = 0; y < 18; y++) for (let x = 0; x < 16; x++) {
    const dx = (x - 7.5) / 7, dy = (y - 7) / 7;
    const top = y < 8 ? dx * dx + dy * dy < 1 : Math.abs(x - 7.5) < 7;
    const wave = y >= 15 && ((x + f * 2) % 4 < 2 ? y > 15 : false);
    if (top && !wave && y < 18 - ((x + f * 2) % 4 === 3 ? 2 : 0)) p.set(x, y, x > 10 ? shadowC : body);
  }
  p.rect(4, 6, 2, 3, [30, 30, 50, 255]); p.rect(9, 6, 2, 3, [30, 30, 50, 255]);
  p.rect(6, 10, 3, 2, [30, 30, 50, 230]);
  return p.toCanvas();
}

// Moneda que gira (4 fotogrames)
function makeCoinFrame(f) {
  const p = new Pix(10, 10);
  const gold = hex("#facc15"), rim = hex("#b45309"), hi = hex("#fef9c3"), mid = hex("#eab308");
  const half = [4.6, 3.2, 1.1, 3.2][f];
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
    const dx = (x - 4.5) / half, dy = (y - 4.5) / 4.6, d = dx * dx + dy * dy;
    if (d <= 1) p.set(x, y, d > 0.6 ? rim : gold);
  }
  if (f !== 2) { p.rect(4, 3, 2, 4, mid); if (f === 0) { p.set(3, 2, hi); p.set(2, 3, hi); } }
  return p.toCanvas();
}

// Rètol d'un local (farmàcia, bar…) a sobre de la porta
function makeSign(kind) {
  const p = new Pix(14, 10), bg = { pharmacy: P("#1f8a4a"), beer: P("#8a4a1a"), coffee: P("#5a3a22"), bank: P("#1f3a6a") }[kind] || P("#3a3a4a");
  p.rect(0, 0, 14, 10, bg);
  if (kind === "pharmacy") { p.rect(6, 1, 2, 8, C8.white); p.rect(3, 4, 8, 2, C8.white); }
  else if (kind === "beer") { p.rect(4, 2, 5, 7, C8.yellow); p.rect(4, 1, 5, 2, C8.white); p.rect(9, 4, 2, 3, C8.yellow); }
  else if (kind === "coffee") { p.rect(3, 4, 7, 5, C8.white); p.rect(10, 5, 2, 2, C8.white); p.set(5, 2, C8.white); p.set(7, 1, C8.white); }
  else if (kind === "bank") { p.rect(3, 3, 8, 1, C8.yellow); p.rect(4, 4, 1, 4, C8.yellow); p.rect(6, 4, 1, 4, C8.yellow); p.rect(8, 4, 1, 4, C8.yellow); p.rect(3, 8, 8, 1, C8.yellow); }
  p.outline(C8.ink);
  return p.toCanvas();
}
