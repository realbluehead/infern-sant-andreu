// Multijugador: WebSocket cap al servidor de Cloudflare (sala única). Els altres jugadors es
// veuen com a sprites dins del món i el xat surt a dalt, amb els missatges.
"use strict";

const PROD_SERVER = "wss://infern-sant-andreu.realbluehead.workers.dev/ws";
function serverUrl() {
  const q = new URLSearchParams(location.search).get("server");
  if (q) return q;
  if (["localhost", "127.0.0.1"].includes(location.hostname)) return `ws://${location.hostname}:8807/ws`;
  return PROD_SERVER;
}

const net = {
  ws: null, id: null, others: new Map(), connected: false, retry: 0, sendT: 0, last: "", lookTimer: null,

  connect() {
    let ws;
    try { ws = new WebSocket(serverUrl()); } catch { return this.reconnect(); }
    this.ws = ws;
    ws.onopen = () => { this.retry = 0; this.send({ t: "hello", look: state.look, ...this.pos() }); };
    ws.onmessage = (e) => { try { this.onMessage(JSON.parse(e.data)); } catch { /* missatge invàlid */ } };
    ws.onclose = () => { this.connected = false; this.others.clear(); this.ws = null; coins.list.clear(); this.reconnect(); };
  },
  reconnect() { setTimeout(() => this.connect(), Math.min(30000, 1000 * 2 ** this.retry++)); },
  send(m) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); },
  pos() {
    const pl = game.player;
    return { x: Math.round(pl.x), y: Math.round(pl.y), dir: angleDir(pl.a), moving: pl.moving };
  },
  sendLook() {
    clearTimeout(this.lookTimer);
    this.lookTimer = setTimeout(() => this.send({ t: "look", look: state.look }), 300);
  },
  addOther(p) { this.others.set(p.id, { ...p, tx: p.x, ty: p.y, anim: 0, frame: 0, sprites: makeHeroSet(p.look) }); },
  onMessage(m) {
    coinsOnMessage(m);
    if (m.t === "welcome") {
      this.id = m.id; this.connected = true; this.others.clear();
      for (const p of m.players) this.addOther(p);
    } else if (m.t === "join") {
      this.addOther(m.p);
      if (!game.onTitle) message(`${m.p.look.name} ha arribat a Sant Andreu`);
    } else if (m.t === "leave") {
      this.others.delete(m.id);
    } else if (m.t === "move") {
      const o = this.others.get(m.id);
      if (o) Object.assign(o, { tx: m.x, ty: m.y, dir: m.dir, moving: m.moving });
    } else if (m.t === "say") {
      const o = this.others.get(m.id);
      if (o) hud.msgs.push({ text: `${o.look.name}: ${String(m.text).slice(0, CFG.chat.maxLength)}`, t: 0, chat: true });
    } else if (m.t === "look") {
      const o = this.others.get(m.id);
      if (o) { o.look = m.look; o.sprites = makeHeroSet(m.look); }
    }
  },
  update(dt) {
    if ((this.sendT -= dt) <= 0) {
      this.sendT = 1 / 8;
      const p = this.pos(), key = `${p.x},${p.y},${p.dir},${p.moving}`;
      if (key !== this.last && !game.onTitle) { this.last = key; this.send({ t: "move", ...p }); }
    }
    const a = 1 - Math.pow(0.0001, dt);
    for (const o of this.others.values()) {
      const dist = Math.hypot(o.tx - o.x, o.ty - o.y);
      if (dist > 400) { o.x = o.tx; o.y = o.ty; } else { o.x += (o.tx - o.x) * a; o.y += (o.ty - o.y) * a; }
      if (o.moving || dist > 2) { o.anim += dt * 8; o.frame = Math.floor(o.anim) % 4; } else o.frame = 0;
    }
  },
};
