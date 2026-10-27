// Test de fum: serveix public/ en un port local, obre el joc en un Chromium sense finestra
// (escriptori i mòbil) i hi juga uns segons: entrar, caminar, girar, disparar a un monstre,
// recollir un objecte, fer-se de nit i obrir l'automapa. Falla amb qualsevol error a la consola.
// No es connecta al servidor multijugador (el joc ha de funcionar igualment sense connexió).
// Ús:  cd tests && npm install && npm run smoke
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".bin": "application/octet-stream" };

const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`  ✗ ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);

// 1. Tots els .js de public/ s'han de carregar des d'index.html (i al revés)
const html = await readFile(join(PUBLIC, "index.html"), "utf8");
const loaded = [...html.matchAll(/<script src="([\w-]+\.js)\?v=\d+"/g)].map((m) => m[1]);
const files = (await readdir(PUBLIC)).filter((f) => f.endsWith(".js"));
console.log("Scripts");
for (const f of files) if (!loaded.includes(f)) fail(`${f} no es carrega a index.html`);
for (const f of loaded) if (!files.includes(f)) fail(`index.html carrega ${f}, que no existeix`);
if (!failures.length) ok(`${loaded.length} scripts, tots a index.html`);

const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  if (path === "/") path = "/index.html";
  try {
    const body = await readFile(join(PUBLIC, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/?server=ws://127.0.0.1:9/ws`;
const browser = await chromium.launch().catch(() => chromium.launch({ channel: "chrome" }));

async function run(label, contextOpts) {
  console.log(label);
  const page = await (await browser.newContext(contextOpts)).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/WebSocket|ERR_CONNECTION|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(url);
  try {
    await page.waitForFunction(() => document.getElementById("loading").classList.contains("hidden"), null, { timeout: 45000 });
    ok("el mapa es carrega");
  } catch {
    fail(`no arrenca: ${await page.locator("#loading").textContent()}`);
    errors.forEach((e) => fail(e));
    return;
  }
  await page.click("#title-go");

  // el bucle real ha de moure el jugador endavant
  const r0 = await page.evaluate(() => { game.player.a = 0; return [game.player.x, game.player.y]; });
  await page.evaluate(() => game.keys.add("KeyW"));
  await page.waitForTimeout(700);
  await page.evaluate(() => game.keys.clear());
  const r1 = await page.evaluate(() => [game.player.x, game.player.y]);
  if (r1[0] !== r0[0] || r1[1] !== r0[1]) ok("el jugador camina"); else fail("el jugador no s'ha mogut");

  const result = await page.evaluate(() => {
    const steps = [], pl = game.player;
    const frames = (n, label) => { for (let i = 0; i < n; i++) frame(0.03); steps.push(label); };
    frames(30, "30 fotogrames de dia");
    // un zombi just davant: s'ha d'abatre a trets
    const z = { id: 999, kind: "zombie", x: pl.x + Math.cos(pl.a) * TS * 3, y: pl.y + Math.sin(pl.a) * TS * 3, hp: 30, state: "idle", t: 0, cd: 9, pain: 0, anim: 0, wx: 0, wy: 0, wt: 9, loot: 0 };
    mobs.list.push(z);
    for (let i = 0; i < 30 && z.state !== "dead"; i++) { game.fireT = 0; game.bullets = 50; pl.a = Math.atan2(z.y - pl.y, z.x - pl.x); fire(); }
    const killed = z.state === "dead";
    // objecte als peus
    game.hp = 50;
    mobs.items.push({ kind: "health", x: pl.x, y: pl.y, t: 0 });
    frames(2, "recollir");
    const healed = game.hp > 50;
    // de nit
    world.offset = (((23 - (Date.now() / (CFG.world.secondsPerHour * 1000)) % 24) % 24) + 48) % 24 * CFG.world.secondsPerHour * 1000;
    frames(60, "60 fotogrames de nit");
    const night = world.monsters;
    game.mapOpen = true; frames(3, "automapa"); game.mapOpen = false;
    hurtPlayer(500, {}); const dead = game.dead; respawn(); frames(3, "mort i tornada");
    const d = R.c.getImageData(0, 0, R.w, R.h).data, colors = new Set();
    for (let i = 0; i < d.length; i += 4 * 499) colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return { steps, killed, healed, night, dead, alive: !game.dead, colors: colors.size, mobs: mobs.list.length };
  }).catch((e) => ({ error: e.message }));

  if (result.error) fail(`error jugant: ${result.error}`);
  else {
    ok(result.steps.join(", "));
    if (result.killed) ok("s'abat un zombi a trets"); else fail("no s'ha pogut abatre el zombi");
    if (result.healed) ok("es recull una farmaciola"); else fail("la farmaciola no cura");
    if (result.night) ok(`de nit surten els monstres (${result.mobs})`); else fail("de nit no surten els monstres");
    if (result.dead && result.alive) ok("es mor i es torna a la plaça"); else fail("la mort o la tornada no funcionen");
    if (result.colors > 20) ok(`la vista es dibuixa (${result.colors} colors)`); else fail(`la vista sembla buida (${result.colors} colors)`);
  }
  if (errors.length) errors.forEach((e) => fail(`error a la consola: ${e}`)); else ok("cap error a la consola");
  await page.context().close();
}

await run("Escriptori", { viewport: { width: 1280, height: 800 } });
await run("Mòbil", { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

await browser.close();
server.close();
console.log(failures.length ? `\n${failures.length} error(s)` : "\nTot correcte");
process.exit(failures.length ? 1 : 0);
