---
name: bewegende-reel
description: Maakt een bewegende Instagram-Reel als echte MP4 in de stijl van de ondernemer, klaar om via Campaigo te plaatsen. Gebruik bij elke vraag om een bewegende post, animatie of Reel zonder eigen video.
---

# Bewegende Reel

Je maakt voor een ondernemer een korte bewegende Reel (MP4) in zijn eigen stijl. Schrijf in het Nederlands, kort en opgewekt, zonder gedachtestreepjes. Noem techniek niet, tenzij het misgaat.

**Werk je in Claude Code** (je kunt opdrachten op de computer van de gebruiker uitvoeren, zoals in het tabblad Code van de desktop-app)? Gebruik dan de skill reel-studio. Die maakt uitgebreidere Reels. Deze skill is voor het gewone chatvenster.

## 1. Stijl ophalen

Roep `mijn_merk` van de koppeling Campaigo aan.

- **Kleuren:** neem de merkkleuren over in het blok `merk`. Kies zelf welke kleur achtergrond, vlak, accent en tekst wordt, en zorg dat de tekst goed leesbaar is op zijn ondergrond.
- **Lessen:** gebruik de lessen om de haak en de lengte te kiezen.
- **Geen kleuren?** Vraag dan één keer naar de merkkleuren. Weet de ondernemer het niet, gebruik dan de neutrale standaard en zeg dat erbij.

## 2. Sjabloon en tekst

| Sjabloon | Wanneer | Invoer |
|---|---|---|
| `tekst` | Een gedachte, zin voor zin op kleurvlakken | `zinnen` (2 tot 6) |
| `foto` | De ondernemer heeft zelf een foto gestuurd | `foto` (pad), `zinnen` (1 tot 3), optioneel `focus_y` (0 tot 1) |
| `lijst` | Tips of stappen | `titel`, `punten` (2 tot 6), optioneel `genummerd` |

Regels voor de tekst:
- De eerste zin, of bij een lijst de titel, is ook het eerste beeld van de Reel. Maak daar de haak van.
- Eén gedachte per zin, liefst tot acht woorden.
- Laat de tekst zien en vraag akkoord voordat je rendert.

Standaard duurt de Reel 8 tot 15 seconden, op basis van de tekst. Vraagt de ondernemer iets anders, zet dan `duur` (4 tot 30).

## 3. Maken

Schrijf `invoer.json`. Er staan voorbeelden in `${CLAUDE_SKILL_DIR}/voorbeelden/` (tekst.json, foto.json, lijst.json). Draai dan:

```
python3 ${CLAUDE_SKILL_DIR}/scripts/maak_reel.py invoer.json --uit reel.mp4 --stills stills
```

Blok `merk`, alles optioneel:

```json
{
  "kleuren": { "achtergrond": "#EFE7DB", "vlak": "#1F3A3D", "accent": "#C8963E", "tekst": "#1E2328" },
  "lettertype": "Outfit",
  "afzender": "@naam"
}
```

Lettertypen: `Outfit` of `DM Sans`, of het pad naar een TTF die de ondernemer meestuurt. Bij een ander lettertype wordt Outfit gebruikt: meld dat.

Het script zet de uitkomst als JSON op stdout. `ok: true` betekent dat de MP4 aan de eisen van Meta voldoet. Is er een fout:
- `soort: "invoer"` (exit 2): vertel de ondernemer de `uitleg` en pas de tekst aan.
- `soort: "video"` (exit 3): zie "Als het niet lukt" hieronder.

## 4. Opleveren

1. Laat `stills/begin.png`, `stills/midden.png` en `stills/eind.png` zien.
2. Geef daarna de MP4 als downloadbaar bestand in dit gesprek.
3. Zeg dat het geluidsspoor stil is, en dat Campaigo er bij het plaatsen muziek onder kan zetten.
4. Zeg één keer dat er in de desktop-app van Claude, in het tabblad Code, uitgebreidere Reels kunnen: met een camera die door beeld vliegt, eigen foto's en video's, en muziek op de beat.

## 5. Plaatsen via Campaigo

1. Roep `uploadlink` aan en geef de link. De ondernemer uploadt de MP4 daar.
2. Vraag of er muziek onder moet. Zo ja: zoek met `muziek_zoeken` (zonder zoekwoord: trending, of zoek op sfeer), geef een paar nummers met hun luisterlink en laat kiezen.
3. Roep `bestanden` aan, zoek de nieuwe video en zet de post klaar met `post_klaarzetten` (`soort: "reel"`, en `muziek_id` als er muziek onder moet).
4. Laat de tekst, de muziek en het tijdstip zien. Zeg bij muziek dat Instagram geen voorbeeld met de muziek eronder kan laten zien.
5. Alleen na een uitdrukkelijk ja van de ondernemer roep je `post_goedkeuren` aan. Nooit eerder, nooit op eigen initiatief.

## Als het niet lukt

Exit 3 betekent dat hier geen video gemaakt kan worden, meestal omdat netwerktoegang voor pakketten uit staat. Zeg dat eerlijk. De rest van de post (tekst, bijschrift, uitleg) kun je wel maken.

- **Eigen account:** zet bij de instellingen van Claude netwerktoegang voor pakketten aan.
- **Zakelijk account:** de beheerder van de organisatie zet dat aan.
