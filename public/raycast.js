// Motor 3D en primera persona per raigs ("raycasting"), com els shooters dels 90. Es dibuixa a
// una resolució baixa (200 píxels d'alt) i s'amplia sense suavitzar. El mapa és el de sempre:
// cada casella d'edifici és una paret alta (2-4 plantes amb les façanes de la zona), i el terra
// té les rajoles dels carrers, voreres, places i parcs. Cada columna llança un raig que continua
// després del primer edifici, així es veuen els edificis més alts del darrere.
"use strict";

const RH = 200, HUD_H = 32;
const EYE = 0.85;          // alçada dels ulls, en caselles (1 casella = 2 m)
const STOREY = 1.5;        // alçada d'una planta, en caselles
const R = {
  w: 320, h: RH, vh: RH - HUD_H, cv: null, c: null, img: null, buf: null, zbuf: null, top: null,
  fov: (66 * Math.PI) / 180, proj: 0, horizon: 0,
  atlas: null, tileTex: null, wallTex: null, light: null, texCount: 0, sprData: new WeakMap(), labels: [],
};
const storeys = (v) => 2 + (hash2(v, 3) % 3);

// Píxels RGBA com a enter (little-endian: 0xAABBGGRR)
const rgba = (r, g, b) => (255 << 24) | (b << 16) | (g << 8) | r;

function initRenderer() {
  R.cv = document.createElement("canvas");
  R.c = R.cv.getContext("2d");
  resizeRenderer();
  buildTextures();
  buildLightMap();
}

// L'amplada interna s'adapta a la forma de la pantalla (l'alçada és de 200 píxels, o més amb el mòbil dret)
function resizeRenderer() {
  const aspect = innerWidth / Math.max(1, innerHeight);
  R.w = Math.max(240, Math.min(480, Math.round(RH * aspect / 2) * 2));
  // amb el mòbil dret, la vista es fa més alta (a sota queden els controls)
  R.h = innerHeight > innerWidth * 1.2 ? Math.min(340, Math.round((R.w * innerHeight * 0.62) / innerWidth)) : RH;
  R.vh = R.h - HUD_H;
  R.cv.width = R.w; R.cv.height = R.h;
  R.img = R.c.createImageData(R.w, R.h);
  R.buf = new Uint32Array(R.img.data.buffer);
  R.zbuf = new Float32Array(R.w);
  R.top = new Float32Array(R.w);
  R.proj = (R.w / 2) / Math.tan(R.fov / 2);
}

// Textures: totes les rajoles de 16×16 en un sol vector (atlas). Cada casella del mapa sap quina
// textura de terra li toca; cada edifici, quina façana.
function buildTextures() {
  const list = [], ids = new Map();
  const texOf = (key, canvas) => {
    let id = ids.get(key);
    if (id !== undefined) return id;
    const d = canvas.getContext("2d").getImageData(0, 0, TS, TS).data, t = new Uint32Array(TS * TS);
    for (let i = 0; i < TS * TS; i++) t[i] = rgba(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    id = list.length; list.push(t); ids.set(key, id);
    return id;
  };
  const { W, H, ground } = state;
  R.tileTex = new Uint16Array(W * H);
  R.wallTex = new Uint16Array(W * H);
  const cacheG = new Int32Array(128 * 64).fill(-1), cacheF = new Int32Array(128 * 64).fill(-1);
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) {
    const i = ty * W + tx, v = ground[i] & 127, th = sectorAt(tx, ty), variant = hash2(tx, ty) % 4;
    if (v >= BUILDING_BASE) {
      const k = v * 64 + variant * 8 + th;
      if (cacheF[k] < 0) cacheF[k] = texOf("f" + k, getTile("f", v, variant, th));
      R.wallTex[i] = cacheF[k];
      const ks = T.SIDEWALK * 64 + variant * 8 + th; // sota els edificis, vorera
      if (cacheG[ks] < 0) cacheG[ks] = texOf("g" + ks, getTile("g", T.SIDEWALK, variant, th));
      R.tileTex[i] = cacheG[ks];
    } else {
      const vv = v === T.ROAD_LINE ? T.ROAD : v, k = vv * 64 + variant * 8 + th;
      if (cacheG[k] < 0) cacheG[k] = texOf("g" + k, getTile("g", vv, variant, th));
      R.tileTex[i] = cacheG[k];
    }
  }
  R.texCount = list.length;
  R.atlas = new Uint32Array(list.length * TS * TS);
  list.forEach((t, i) => R.atlas.set(t, i * TS * TS));
}

// Llum de nit: fanals i rètols il·luminen el seu voltant (0..255 per casella)
function buildLightMap() {
  const { W, H } = state, L = new Uint8Array(W * H);
  const spot = (cx, cy, rad, amt) => {
    for (let y = Math.max(0, cy - rad); y <= Math.min(H - 1, cy + rad); y++) for (let x = Math.max(0, cx - rad); x <= Math.min(W - 1, cx + rad); x++) {
      const d = Math.hypot(x - cx, y - cy) / rad;
      if (d < 1) { const i = y * W + x; L[i] = Math.min(255, L[i] + amt * (1 - d) * (1 - d)); }
    }
  };
  for (let i = 0; i < W * H; i++) if (state.decor[i] === D.LAMP) spot(i % W, (i / W) | 0, 6, 230);
  for (const p of state.meta.pois || []) spot(Math.round(p.x), Math.round(p.y), 3, 120);
  R.light = L;
}

// ---------------------------------------------------------------------------
// Dibuix d'un fotograma
function renderView(cam, sprites) {
  const { w, vh, buf, zbuf, top, proj, atlas, tileTex, wallTex, light } = R;
  const W = state.W, Hm = state.H, ground = state.ground;
  const horizon = R.horizon = Math.round(vh / 2 + (cam.bob || 0));
  const px = cam.x / TS, py = cam.y / TS;
  const dirX = Math.cos(cam.a), dirY = Math.sin(cam.a);
  const pl = Math.tan(R.fov / 2), planeX = -dirY * pl, planeY = dirX * pl;
  const maxD = cam.maxD;
  const amb = cam.ambient, night = 1 - amb;     // 1 = de dia
  const fogR = cam.fog[0], fogG = cam.fog[1], fogB = cam.fog[2];
  const lantern = cam.lantern;

  // ombra segons la distància, la llum del dia i la de nit de la casella
  const shadeAt = (d, li) => {
    let s = amb * (1 - Math.min(1, d / maxD) * 0.55);
    if (night > 0) s += night * (li / 255) * 0.9 + (lantern > 0 ? lantern * Math.max(0, 1 - d / 7) * 0.8 : 0);
    return s > 1.15 ? 1.15 : s;
  };
  const mix = (c, s, f) => {
    const r = Math.min(255, (c & 255) * s), g = Math.min(255, ((c >> 8) & 255) * s), b = Math.min(255, ((c >> 16) & 255) * s);
    return f > 0 ? rgba(r + (fogR - r) * f, g + (fogG - g) * f, b + (fogB - b) * f) : rgba(r, g, b);
  };

  // cel
  const sky = cam.sky;
  for (let y = 0; y < vh; y++) {
    const c = sky[Math.min(sky.length - 1, Math.max(0, y - horizon + 100))];
    buf.fill(c, y * w, y * w + w);
  }
  if (cam.stars) { // estrelles (es mouen en girar)
    const off = Math.round((cam.a / (Math.PI * 2)) * 1600);
    for (let i = 0; i < 220; i++) {
      const sx = ((hash2(i, 7) % 1600) - off + 1600 * 4) % 1600;
      if (sx >= w) continue;
      const sy = horizon - 10 - (hash2(i, 9) % 110);
      if (sy >= 0 && (hash2(i, 3) + (Date.now() >> 9)) % 13) buf[sy * w + sx] = rgba(230, 230, 255);
    }
  }

  for (let x = 0; x < w; x++) {
    const cx = (2 * x) / w - 1;
    const rdx = dirX + planeX * cx, rdy = dirY + planeY * cx;
    let mx = Math.floor(px), my = Math.floor(py);
    const ddx = Math.abs(1 / rdx), ddy = Math.abs(1 / rdy);
    const sx = rdx < 0 ? -1 : 1, sy = rdy < 0 ? -1 : 1;
    let sdx = rdx < 0 ? (px - mx) * ddx : (mx + 1 - px) * ddx;
    let sdy = rdy < 0 ? (py - my) * ddy : (my + 1 - py) * ddy;
    let clip = vh, first = true, inside = (ground[my * W + mx] & 127) >= BUILDING_BASE, floorFrom = horizon + 1;
    zbuf[x] = maxD;
    while (true) {
      let side;
      if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; }
      if (mx < 0 || my < 0 || mx >= W || my >= Hm) break;
      const dist = side === 0 ? sdx - ddx : sdy - ddy;
      if (dist > maxD) break;
      const i = my * W + mx, v = ground[i] & 127;
      if (v < BUILDING_BASE) { inside = false; continue; }
      if (inside) continue;
      inside = true;
      // paret: de terra fins a dalt de tot de l'edifici
      const hgt = storeys(v) * STOREY;
      const yb = horizon + (EYE / dist) * proj, yt = horizon - ((hgt - EYE) / dist) * proj;
      if (first) { first = false; zbuf[x] = dist; floorFrom = Math.min(vh, Math.ceil(yb)); }
      const y0 = Math.max(0, Math.ceil(yt)), y1 = Math.min(clip, Math.ceil(yb));
      if (y1 > y0) {
        let wx = side === 0 ? py + dist * rdy : px + dist * rdx;
        wx -= Math.floor(wx);
        let u = Math.floor(wx * TS);
        if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) u = TS - 1 - u;
        const tex = wallTex[i] * TS * TS;
        // llum: la de la casella de davant de la paret
        const li = light[(my - (side === 1 ? sy : 0)) * W + (mx - (side === 0 ? sx : 0))] || 0;
        const s = shadeAt(dist, li) * (side === 1 ? 0.78 : 1), f = Math.min(1, (dist / maxD) ** 2);
        const zk = dist / proj;
        for (let y = y0; y < y1; y++) {
          const z = EYE + (horizon - y) * zk;          // alçada del punt de la paret
          let c;
          if (z > hgt - 0.12) c = 0xff1a1420 | 0;       // cornisa
          else {
            const t = (z % STOREY) / STOREY;
            const ty = Math.min(TS - 1, Math.floor((1 - t) * TS));
            c = atlas[tex + ty * TS + u];
          }
          buf[y * w + x] = mix(c, s, f);
        }
      }
      if (yt < clip) clip = Math.max(0, yt);
      if (clip <= 0) break;
    }
    top[x] = clip;
    // terra: des del peu de la primera paret fins a baix
    for (let y = Math.max(floorFrom, horizon + 1); y < vh; y++) {
      const d = (EYE * proj) / (y - horizon);
      const fx = px + rdx * d, fy = py + rdy * d;
      const tx = fx | 0, ty = fy | 0;
      if (tx < 0 || ty < 0 || tx >= W || ty >= Hm) { buf[y * w + x] = rgba(fogR, fogG, fogB); continue; }
      const i = ty * W + tx;
      const c = atlas[tileTex[i] * TS * TS + (((fy - ty) * TS) | 0) * TS + (((fx - tx) * TS) | 0)];
      buf[y * w + x] = mix(c, shadeAt(d, light[i]), Math.min(1, (d / maxD) ** 2));
    }
  }

  // sprites, de lluny a prop
  const invDet = 1 / (planeX * dirY - dirX * planeY);
  R.labels.length = 0;
  for (const sp of sprites) {
    const dx = sp.x / TS - px, dy = sp.y / TS - py;
    sp.tx = invDet * (dirY * dx - dirX * dy);
    sp.ty = invDet * (-planeY * dx + planeX * dy);
  }
  sprites.sort((a, b) => b.ty - a.ty);
  for (const sp of sprites) {
    const d = sp.ty;
    if (d < 0.35 || d > maxD) continue;
    const img = spriteData(sp.img);
    const sh = (sp.h / TS / d) * proj, sw = sh * (img.w / img.h) * (sp.wide || 1);
    const scx = (w / 2) * (1 + sp.tx / d);
    const yb = horizon + ((EYE - (sp.z || 0)) / d) * proj, yt = yb - sh;
    const x0 = Math.max(0, Math.floor(scx - sw / 2)), x1 = Math.min(w, Math.ceil(scx + sw / 2));
    if (x1 <= x0) continue;
    const tx = Math.max(0, Math.min(W - 1, sp.x / TS | 0)), ty = Math.max(0, Math.min(Hm - 1, sp.y / TS | 0));
    const s = sp.bright ? 1.1 : shadeAt(d, light[ty * W + tx]), f = Math.min(1, (d / maxD) ** 2);
    const y0 = Math.max(0, Math.floor(yt)), y1 = Math.min(vh, Math.ceil(yb));
    let shown = false;
    for (let x = x0; x < x1; x++) {
      if (d >= zbuf[x]) continue;
      const u = Math.floor(((x - (scx - sw / 2)) / sw) * img.w);
      if (u < 0 || u >= img.w) continue;
      shown = true;
      for (let y = y0; y < y1; y++) {
        const vtx = Math.floor(((y - yt) / sh) * img.h);
        if (vtx < 0 || vtx >= img.h) continue;
        const c = img.px[vtx * img.w + u];
        const a = c >>> 24;
        if (a < 40) continue;
        if (a < 230) { // semitransparent (fantasmes): barreja amb el que hi ha
          const o = buf[y * w + x], k = a / 255;
          buf[y * w + x] = rgba(((c & 255) * k + (o & 255) * (1 - k)) | 0, (((c >> 8) & 255) * k + ((o >> 8) & 255) * (1 - k)) | 0, (((c >> 16) & 255) * k + ((o >> 16) & 255) * (1 - k)) | 0);
        } else buf[y * w + x] = mix(c, s, f);
      }
    }
    if (shown && sp.label && d < 14) R.labels.push({ x: scx, y: yt - 3, text: sp.label, color: sp.labelColor || "#9fd3ff" });
  }
  R.c.putImageData(R.img, 0, 0);
}

// Píxels d'una imatge (canvas) per dibuixar-la dins del buffer
function spriteData(cv) {
  let d = R.sprData.get(cv);
  if (d) return d;
  const id = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height);
  d = { w: cv.width, h: cv.height, px: new Uint32Array(id.data.buffer.slice(0)) };
  R.sprData.set(cv, d);
  return d;
}

// Té visió directa? (els edificis tapen; arbres i fanals no) — coordenades en píxels del món
function lineOfSight(x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (TS / 3));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (isBuilding(g(Math.floor((x0 + (x1 - x0) * t) / TS), Math.floor((y0 + (y1 - y0) * t) / TS)))) return false;
  }
  return true;
}

// Gradient del cel segons l'hora (200 colors: de dalt a baix, centrat a l'horitzó)
function skyGradient(dark, weather) {
  const out = new Uint32Array(200);
  const day = [[96, 150, 230], [180, 214, 250]], dusk = [[60, 50, 120], [250, 150, 110]], nite = [[6, 8, 26], [24, 30, 70]];
  const grey = weather === "rain" || weather === "fog" || weather === "snow";
  for (let i = 0; i < 200; i++) {
    const t = Math.min(1, i / 100);
    const mixc = (a, b, k) => a.map((v, j) => v + (b[j] - v) * k);
    let top = mixc(day[0], dusk[0], Math.min(1, dark * 2)), bot = mixc(day[1], dusk[1], Math.min(1, dark * 2));
    if (dark > 0.5) { top = mixc(top, nite[0], (dark - 0.5) * 2); bot = mixc(bot, nite[1], (dark - 0.5) * 2); }
    let c = mixc(top, bot, t);
    if (grey) c = mixc(c, [150, 156, 166].map((v) => v * (1 - dark * 0.8)), 0.6);
    if (i > 100) c = bot;
    out[i] = rgba(c[0], c[1], c[2]);
  }
  return out;
}
