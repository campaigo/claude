# Bouwstenen

Naslag voor de motor: hoe een Reel in elkaar zit, hoe je een bewegingsstijl bouwt, en alles wat de motor en de bouwstenen kunnen.

## Hoe een Reel in elkaar zit

Een Reel is een map met `reel.html` (plus `fotos/`, `clips/`). De scripts serveren hem lokaal:
- `/motor/...` en `/fonts/...` komen uit de skill;
- `/merk/...` komt uit `Campaigo Reels/merk/` (merk.json, beweging.js, logo, lettertypen);
- `/voorbeelden/...` komt uit de voorbeelden van de skill;
- de rest uit de map van de Reel.

```html
<!doctype html>
<html lang="nl">
<head><meta charset="utf-8"><title>Reel</title><link rel="stylesheet" href="/motor/reel.css"></head>
<body>
<div id="stage"></div>
<script src="/motor/reel.js"></script>
<script src="/motor/blokken.js"></script>
<script src="/merk/beweging.js"></script>
<script>
  R.merk("/merk/merk.json");
  // het eigen script van deze Reel, met de onderdelen uit beweging.js
</script>
</body>
</html>
```

Het beeld is 1080 x 1920 px, 30 beelden per seconde. Alles staat in **beats** (B): bij 120 BPM is 1 beat 0,5 s.

## De drie regels

1. **Elk beeld volgt alleen uit de tijd.** Een frame-functie zet alles neer vanuit B, zonder iets te onthouden van het vorige beeld. Geen CSS-animaties of transitions, geen `setTimeout`, geen teller die oploopt, en lees nooit een stijl terug om te beslissen ("als hij verborgen was, dan..."). De render springt heen en weer in de tijd; `--controle` waarschuwt als een beeld daarvan afhangt.
2. **Tekst in de veilige zone:** x van 60 tot 940, y van 240 tot 1480. Daarbuiten vallen knoppen en het bijschrift van Instagram eroverheen. Tekst heeft de klasse `r-tekst` (`R.zin` en de andere bouwstenen doen dat zelf). Iets dat geen tekst is maar wel binnen de zone moet blijven, zoals een stip achter een zin: geef het `data-veilig="naam"`. Decoratie (een held onderin, vormen) mag erbuiten.
3. **Bouwen gebeurt in `R.bouw(() => {...})`**: pas dan zijn het merk en de lettertypen geladen en kun je tekst meten. Een Reel mag meer dan één `R.bouw` hebben; ze lopen op volgorde, en een bouwfunctie mag `async` zijn (de motor wacht erop).

Hoe de controle op de veilige zone werkt: hij kijkt naar elk woord dat echt te zien is (dekking van minstens 0,6 en niet weggeknipt door zijn masker). Een `clip-path` op een ouder telt hij niet mee. Maak je voor een overgang een kopie van tekst die maar half te zien is (zoals een zin die in twee helften uiteen wijkt), geef de kopie dan `data-niet-controleren`, zodat de tekst niet dubbel telt. De volledige render controleert alleen beelden die stilstaan; wil je een overgang controleren, gebruik dan `--controle` met die seconden.

Verder:
- **Zichtbaarheid terugzetten met `""`**, nooit met `"visible"`: een element met `visible` blijft zichtbaar in een verborgen ouder.
- **Woorden bij elkaar houden:** zet er een harde spatie tussen (`\u00a0` in een JavaScript-tekst, bijvoorbeeld `"vanaf 1\u00a0december"`). Woorden met `*nadruk*` blijven ook bij elkaar.
- **Eigen bestanden in de map van de Reel** (bijvoorbeeld `fonts/` of `beelden/`) zijn gewoon bereikbaar; staat er in de skill een bestand met dezelfde naam, dan wint de skill.
- **Grote 3D-werelden:** houd lagen kleiner dan ongeveer 10.000 px en de camera niet verder dan 5.400 px; anders laat Chrome stukken weg.
- `clip-path: path("...")` werkt voor vormen als een bolle rand of een golf; `circle()` en `inset()` voor rondjes en vegen.

## Een bewegingsstijl bouwen (merk/beweging.js)

Eén bestand per zaak, met een eigen naam op `window` (bijvoorbeeld `VD` of `BB`). Opzet, zoals in `voorbeelden/bewegingsstijlen/`:

```js
(function () {
  const { maak, zet, ease, p, mix, clamp, veer, stoot, kleur } = R;
  // 1. eigen CSS voor de typografie (lettertype komt uit merk.json)
  // 2. vaste keuzes
  const X = { tempo: 110, muziek: { klank: "warm", toon: 0, variant: 1 } };
  // 3. kleuren met een rol: X.kleuren = () => ({ ... uit R.M ... })
  // 4. de held: X.held(ouder) maakt hem, X.zetHeld(el, ..., B) zet hem neer vanuit de tijd
  // 5. de overgang: X.overgang(vlak, B, b0, d) laat een vlak binnenkomen
  // 6. typografie: X.kop(ouder, tekst, kleur) en X.kopIn(ws, B, b0)
  // 7. een opbouw voor een hele Reel: X.reeks({ zinnen, oproep }) met draaiboek, geluid, omslag en momenten
  window.X = X;
})();
```

Zet in de opbouw altijd: `R.tempo`, `R.lengte`, `R.muziek` (secties en klank), de geluidjes (`R.cue`), `R.omslag(...)` (meestal 0; zie "De omslag" in het REGIEBOEK) en `R.moment(...)` op het einde van elke zin (dan is alles binnen en het grootst), en `R.onscherpte(4 tot 10, beweegt)` voor de snelle momenten.

Kijk in de voorbeelden hoe de fietsenmaker en de bakkerij dat doen, maar maak voor elke zaak iets eigens.

## De motor: R

| Wat | Gebruik |
|---|---|
| `R.merk(m, aanvulling)` | `"/merk/merk.json"` of een object `{ kleuren, lettertype, afzender, logo }`. `kleuren` is een lijst of `{ achtergrond, tekst, accent, licht, donker, vlakken }`. Met `aanvulling` overschrijf je voor deze Reel iets uit merk.json, bijvoorbeeld een lettertype in een proefje. |
| `R.M` | Het merk na het laden: `achtergrond, tekst, accent, licht, donker, vlakken, accentOp, accentTekst, afzender, logo, lettertype`. |
| `R.tempo(bpm)`, `R.BEAT` | Tempo; seconden per beat. |
| `R.lengte(beats)` | Lengte van de Reel. |
| `R.scene(van, tot, maak(el), frame(lb, B))` | Een scène van beat `van` tot `tot`. `lb` = beats sinds het begin van de scène. |
| `R.elkFrame((B, t) => {})` | Wordt elk beeld aangeroepen (t in seconden). |
| `R.bouw(fn)` | Bouwen nadat merk en lettertypen klaar zijn. |
| `R.cue(b, soort, { vol, pan, toon, lengte })` | Een geluidje op beat b. |
| `R.muziek([{ van, tot, soort, akk0 }], { klank, toon, variant, geluid })` | Muzieksecties in beats en de klank. |
| `R.omslag(b)`, `R.moment(naam, b)` | Het beeld dat de omslag wordt (in het profiel en bij Reels; de render geeft het als `omslag.jpg` en `omslag_ms`); beelden die `--controle` maakt (het eerste beeld komt er altijd bij). |
| `R.onscherpte(sub, beweegt(B))` | Bewegingsonscherpte: `sub` opnames per beeld waar `beweegt` waar is. 4 tot 10 voor snelle bewegingen. |
| `R.clip(ouder, { bron, start, duur, van, snelheid })` | Videofragment van de klant; `van` = beat waarop het begint te spelen. |
| `R.zet(el, { x, y, z, s, sx, sy, r, rx, ry, o, blur })` | Transform, dekking en vervaging in één keer. |
| `R.maak(html, ouder)`, `R.zicht(el, aan)` | Element maken; tonen of verbergen. |
| `R.woorden(el, masker)`, `R.opmaak(tekst)` | Tekst in woorden splitsen; tekst veilig maken met `*nadruk*`. |
| `R.ease.uit / inuit / over / in / snap / zacht` | Bewegingscurves (binnenkomen, verplaatsen, overschieten, weggaan, zwiep, rustig). |
| `R.p(B, a, d)`, `R.mix(a, b, u)`, `R.clamp` | Voortgang van beat a over d beats (0 tot 1); mengen. |
| `R.veer(B, b0)`, `R.puls(B, b0, d)`, `R.stoot(B, b0)` | Veer met overschot; korte puls; klap die uitsterft. |
| `R.toeval(seed)` | Vast toeval: elke render dezelfde wereld. |
| `R.kleur.contrast(a, b)`, `.leesbaar(bg, kandidaten, minimum)`, `.meng(a, b, u)`, `.rgba(hex, a)`, `.lum`, `.verzadiging`, `.rgb` | Kleur rekenen. |

## Bouwstenen (blokken.js)

| Wat | Gebruik |
|---|---|
| `R.zin(ouder, tekst, { x, midY, breedte, maxHoogte, max, min, uitlijning, kleur, nadruk, streep, punt, ruimteNa, klasse })` | Zin zo groot als past. `klasse` voor de eigen typografie (die wordt meegemeten). `streep: false` als je de nadruk zelf opmaakt. `ruimteNa` (em) houdt ruimte vrij achter het laatste woord. Geeft `{ el, ws, grootte, basis }`; `basis` is het punt na het laatste woord. |
| `R.woordenIn(ws, B, b0, stap, soort, d)` | Woorden binnen laten komen: `"masker"` (omhoog uit een masker), `"punch"` (knallen) of `"veer"`. Eigen manieren schrijf je zelf, zoals de voorbeelden. |
| `R.woordenUit(ws, B, b0)`, `R.streep(el, B, b0)` | Woorden weg; de streep onder `*nadruk*` tekenen. |
| `R.vlak(ouder, kleur)`, `R.vloed(el, B, b0, d, x, y)` | Kleurvlak; vlak als cirkel uit punt (x, y) laten binnenstromen. |
| `R.labels(ouder, tekst, { x, y, onder, breedte, grootte, achtergrond, kleur, nadruk })`, `R.labelsIn`, `R.labelsUit` | Tekst in blokjes, leesbaar op elke foto. |
| `R.foto(ouder, src, { focus, x, y, b, h, rond })`, `R.kenBurns(el, u, { van, naar, dx, dy })` | Foto die zijn vak vult; langzaam inzoomen. |
| `R.vormen(ouder, { aantal, kleuren, seed, vrij, grootte })` | Zwevende vormen in de merkkleuren; `.frame(B)` elk beeld aanroepen. |
| `R.korrel(ouder, sterkte)` | Filmkorrel; geeft een functie die je elk beeld met B aanroept. Het element zelf is `.el` van die functie. |
| `R.oproep(ouder, { kop, sub, knop, kleur, midY })`, `R.oproepIn(o, B, b0)` | Gecentreerde eindkaart met afzender en logo. Past dat niet bij de stijl, bouw dan een eigen oproep. |
| `R.typen(el, tekst, B, b0, cps)` | Tekst die getypt wordt. |

## Geluid

Klank (`klank` in `R.muziek`): `"stevig"` (zaagstoten, marimba, clap), `"warm"` (elektrische piano, vibrafoon, ronde bas, vingerknip), `"fris"` (plukjes, heldere melodie, veel hihat).

Secties (`soort`): `intro` (zacht), `bouw` (kick, bas, akkoorden), `vol` (alles, met melodie), `stil` (adempauze), `eind` (slotakkoord), `puls` (hartslag en klok, spanning), `groei` (versnellende arpeggio), `nacht` (halve maat, donker). Tussen twee secties zonder muziek valt het echt stil.

Geluidjes (`R.cue`): `tik`, `pop`, `whoosh`, `swoosh`, `klik`, `ding`, `impact`, `riser` (lengte in beats, eindigt op de beat), `hartje`, `sparkle`, `stempel`, `hart`, `klok`, `dicht`, `inzuig` (zwelt aan tot de beat), `druppel`, `fietsbel`, `ratel` (lengte in beats), `knip` (schaar). Mis je een geluid dat bij de zaak hoort, gebruik dan het dichtstbijzijnde en meld het: dan kan Campaigo het toevoegen.

## Lettertypen

`Outfit` en `DM Sans` zitten erin. Een ander lettertype van Google Fonts (alleen met een open licentie):
1. Haal de bestanden op uit `https://github.com/google/fonts/raw/main/ofl/<naam in kleine letters zonder spaties>/<bestand>`. Kijk eerst in `https://github.com/google/fonts/tree/main/ofl/<naam>` welke bestanden er zijn: een `.ttf` per gewicht, of één variabel bestand met `[wght]` in de naam (zet `[` en `]` in de link als `%5B` en `%5D`). Neem ook `OFL.txt` mee.
2. Zet ze in `Campaigo Reels/merk/fonts/`.
3. In merk.json: `"lettertype": { "naam": "Barlow Condensed", "bestanden": { "800": "fonts/BarlowCondensed-ExtraBold.ttf", "600": "fonts/BarlowCondensed-SemiBold.ttf" } }`. Een sleutel vanaf 600 is vet, daaronder normaal; met een `i` erachter cursief (`"700i"`). Bij een variabel bestand mag het twee keer hetzelfde pad zijn.
4. De motor zet gewone cijfers aan (`font-variant-numeric: lining-nums`). Toch tekent niet elk lettertype een 1 als 1: controleer een datum of prijs in een proefje.

Een lettertype dat de ondernemer zelf heeft gekocht, mag alleen als de licentie gebruik in video toestaat. Vraag ernaar.

## Een eigen Reel, kort voorbeeld

```js
R.merk("/merk/merk.json");
R.bouw(() => {
  const M = R.M;
  R.lengte(16);
  R.muziek([{ van: 0, tot: 12, soort: "bouw" }, { van: 12, tot: 20, soort: "eind" }], { klank: "fris" });
  let zin, korrel;
  R.scene(0, 17, (el) => {
    R.vlak(el, M.donker);
    zin = R.zin(el, "Eén *zin* die telt.", { kleur: M.licht, nadruk: M.accent });
    korrel = R.korrel(el);
  }, (lb, B) => {
    R.woordenIn(zin.ws, B, -2, 0.5);   // staat er al op het eerste beeld
    korrel(B);
  });
  R.cue(12, "sparkle");
  R.omslag(0);
  R.moment("zin", 4);
});
```

## Studies

`voorbeelden/stijlen/` bevat drie complete bewegingstalen (een stip die van zin naar zin springt, een camera door een wereld van kaarten, foto's met tekstblokjes). Lees ze om te zien hoe timing, overgangen en geluid samenwerken. Gebruik ze niet zoals ze zijn voor een klant.
