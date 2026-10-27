# Infern a Sant Andreu

Un shooter en primera persona a l'estil dels 90 (pensa en el Doom) pels carrers **reals** de **Sant Andreu de Palomar** (Barcelona). El mapa surt de les dades obertes d'[OpenStreetMap](https://www.openstreetmap.org) i de l'Ajuntament de Barcelona, i és el mateix de [Sant Andreu RPG](https://github.com/realbluehead/sant-andreu-rpg) i [Iso Sant Andreu](https://github.com/realbluehead/iso-sant-andreu): cada edifici és una paret amb les façanes de la seva zona, i cada carrer, plaça i parc té el seu terra.

Juga a **https://realbluehead.github.io/infern-sant-andreu/**

## Com es juga

| Tecla | Acció |
|---|---|
| WASD | caminar i anar de costat |
| ratolí / fletxes / Q E | girar (clica la pantalla per capturar el ratolí) |
| clic / ESPAI / CTRL | disparar |
| 1 2 3 / roda | puny, pistola, escopeta |
| SHIFT | córrer |
| TAB / M | automapa (+/− per fer zoom) |
| T / ENTER | xat |
| B | música |
| H | ajuda |

Al mòbil: joystick a l'esquerra per caminar, arrossega la pantalla per girar, i els botons FOC!, ARMA, MAPA i XAT.

- **Monstres**: zombis, dimonis que llancen boles de foc, fantasmes (de nit) i lladres que et pispen monedes (abat-los per recuperar-les). Apareixen al teu voltant, fora de la vista. **De 20 a 6 h** n'hi ha molts més i la música canvia.
- **Objectes**: caixes de bales, cartutxos, farmacioles, armilles i l'escopeta. Els monstres també en deixen quan cauen. Les **farmàcies** del barri et curen si t'hi acostes.
- **Monedes**: les mateixes per a tothom (les crea el servidor). Si mors, en perds la meitat.
- **Multijugador**: veus els altres jugadors pel carrer i pots xatejar. Al marcador, de dalt a la dreta, surt el carrer on ets.
- El rellotge és el mateix per a tothom: **1 minut = 1 hora**. També plou, hi ha boira i neva.

## Com està fet

JavaScript sense dependències ni compilació (scripts clàssics, en l'ordre d'`index.html`):

- `raycast.js` — el motor 3D per raigs a 200 píxels d'alt (més amb el mòbil dret), ampliat sense suavitzar. Cada columna llança un raig que continua després del primer edifici, així es veuen els edificis més alts del darrere (2-4 plantes). Terra amb les rajoles de cada casella, cel segons l'hora, estrelles, boira de distància i llum de nit (fanals, rètols i el fanalet del jugador). Sprites amb profunditat per columna.
- `art.js` — pixel art propi: armes en primera persona, dimonis, fantasmes, restes, boles de foc, objectes, rètols i la cara del marcador.
- `monsters.js` — monstres (aparició, visió, persecució, atac), boles de foc i objectes.
- `hud.js` — marcador, arma, missatges, flaixos i automapa.
- `game.js` — jugador, armes, monedes, rellotge, controls, portada i bucle.
- `net.js` — multijugador. `music.js` — música chiptune (amb un tema de "metal" propi de dia i el de terror de nit).
- Del Sant Andreu RPG: `core.js`, `tiles.js`, `themes.js` (les 6 zones i els seus estils) i `sprites.js`.
- `server/` — servidor multijugador a Cloudflare (Durable Object): posicions, xat, monedes i registre de connexions.

En local (joc, servidor i admin):

```bash
python3 -m http.server 8757 --directory public
```

```bash
cd server && npm install && npm run dev      # ws://localhost:8807/ws
```

```bash
node admin/server.mjs                        # http://localhost:8792
```

### Test de fum

`tests/smoke.mjs` obre el joc en un Chromium sense finestra (escriptori i mòbil) i hi juga: caminar, abatre un zombi, curar-se, fer-se de nit, l'automapa i morir. GitHub Actions el passa abans de publicar.

```bash
cd tests && npm install && npm run smoke
```

## Admin

`node admin/server.mjs` obre un editor de `public/config.json` (velocitats, monstres, nit, armes, distància de visió, monedes, xat) amb el registre de connexions del servidor. **Publicar a GitHub** fa un commit d'aquest fitxer i el puja. El token del registre és a `admin/.admin-token` (no es puja) i ha de coincidir amb el secret `ADMIN_TOKEN` del worker.

## Llicència de les dades

Dades del mapa © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), sota la llicència ODbL. Establiments: cens de locals de l'Ajuntament de Barcelona ([Open Data BCN](https://opendata-ajuntament.barcelona.cat), CC-BY 4.0) i [Overture Maps](https://overturemaps.org) (CDLA-Permissive-2.0). Tots els gràfics i la música són originals, generats per codi.
