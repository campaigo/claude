/**
 * Legt het voorstel van Claude vast in keuzes.json: wat eruit gaat, welke woorden nadruk krijgen, de ondertitels,
 * de kaarten (haak, lijstjes, oproep) en de kleur. Daarna kan de ondernemer alles op de controlepagina bekijken en aanpassen.
 *   node voorstel.mjs <map van de Reel> <voorstel.json>
 *
 * voorstel.json (alles is optioneel; woordnummers komen uit tekst.txt):
 * {
 *   "tempo": "strak",                                   rustig | strak | vlot
 *   "weg": [{ "regel": 1, "waarom": "dubbel" }, { "van": 40, "tot": 44, "waarom": "verspreking" }],
 *   "houden": [{ "van": 12, "tot": 12 }],                  terugzetten (bijvoorbeeld een stopwoord dat bij de toon past)
 *   "nadruk": [8, 27],                                    woorden die in de accentkleur komen (één per zin)
 *   "spelling": { "17": "Campaigo" },                     hoe een woord in de ondertitel moet (namen, merken)
 *   "nieuweRegel": [30],                                  hier begint een nieuwe ondertitelregel
 *   "ondertitels": { "stijl": "zin", "hoofdletters": "zoals", "y": 1240 },
 *   "kaarten": [{ "id": "haak", "soort": "kop", "tekst": "Zo knip je / in 3 stappen", "bij": 0, "duur": 3,
 *                 "plek": "boven", "geluid": "whoosh", "waarom": "de belofte uit de eerste zin" }],
 *   "kleur": "warm"                                       zoals | warm | fris | helder
 * }
 * Uitkomst: wat er veranderde en hoe lang de Reel wordt.
 */
import fs from "fs";
import path from "path";
import { leesJson, meld, schrijfJson } from "./gemeen.mjs";
import { LOOKS, TEMPO, reelTijdlijn } from "./knippen.mjs";

const [mapArg, voorstelArg] = process.argv.slice(2);
if (!mapArg || !voorstelArg) meld({ ok: false, fout: "Gebruik: node voorstel.mjs <map van de Reel> <voorstel.json>" }, 2);
const map = path.resolve(mapArg);
const pad = path.join(map, "keuzes.json");
if (!fs.existsSync(pad)) meld({ ok: false, fout: "Geen keuzes.json. Draai eerst voorbereiden.mjs." }, 2);
const k = leesJson(pad);
let v;
try { v = leesJson(path.resolve(voorstelArg)); } catch (e) { meld({ ok: false, fout: `voorstel.json is geen geldige JSON: ${e.message}` }, 2); }

// zinnen zoals in tekst.txt, om "regel": n te kunnen gebruiken
const zinnen = [];
let zin = [];
k.units.forEach((u, n) => {
  zin.push(u.i);
  const volgende = k.units[n + 1];
  if (/[.!?]$/.test(u.tekst) || !volgende || volgende.van - u.tot > 1.0) { zinnen.push(zin); zin = []; }
});
const fouten = [];
const bereik = (x) => {
  if (x.regel != null) { const z = zinnen[x.regel - 1]; if (!z) { fouten.push(`regel ${x.regel} bestaat niet`); return []; } return z; }
  const a = +x.van, b = +(x.tot ?? x.van);
  if (!(a >= 0 && b >= a && b < k.units.length)) { fouten.push(`woorden ${x.van}-${x.tot} bestaan niet`); return []; }
  return Array.from({ length: b - a + 1 }, (_, n) => a + n);
};
const unit = (i) => k.units.find((u) => u.i === i);
const voor = reelTijdlijn(k).duur;
const gedaan = [];

if (v.tempo) {
  if (!TEMPO[v.tempo]) fouten.push(`tempo "${v.tempo}" bestaat niet (rustig, strak, vlot)`);
  else {
    k.tempo = v.tempo;
    for (const p of k.pauzes) p.inkorten = p.tot - p.van > TEMPO[v.tempo].pauzeMin;
    gedaan.push(`tempo ${v.tempo}`);
  }
}
for (const x of v.weg || []) {
  const ids = bereik(x);
  for (const i of ids) { const u = unit(i); if (u) { u.weg = true; if (x.waarom) u.waarom = x.waarom; } }
  if (ids.length) gedaan.push(`weg: ${ids.length} woorden${x.waarom ? ` (${x.waarom})` : ""}`);
}
for (const x of v.houden || []) for (const i of bereik(x)) { const u = unit(i); if (u) { u.weg = false; delete u.waarom; } }
if (v.nadruk) {
  for (const u of k.units) u.nadruk = false;
  for (const i of v.nadruk) { const u = unit(+i); if (u) u.nadruk = true; else fouten.push(`nadruk: woord ${i} bestaat niet`); }
}
for (const [i, t] of Object.entries(v.spelling || {})) { const u = unit(+i); if (u) u.ondertitel = t; else fouten.push(`spelling: woord ${i} bestaat niet`); }
if (v.nieuweRegel) { for (const u of k.units) delete u.nieuweRegel; for (const i of v.nieuweRegel) { const u = unit(+i); if (u) u.nieuweRegel = true; } }
if (v.ondertitels) k.ondertitels = { ...k.ondertitels, ...v.ondertitels };
if (v.kaarten) {
  const SOORTEN = ["kop", "lijst", "label", "getal", "foto", "oproep", "vrij"];
  k.kaarten = v.kaarten.map((x, n) => {
    if (!SOORTEN.includes(x.soort)) fouten.push(`kaart ${x.id || n}: soort "${x.soort}" is onbekend (${SOORTEN.join(", ")})`);
    if (x.bij != null && !unit(+x.bij)) fouten.push(`kaart ${x.id || n}: woord ${x.bij} bestaat niet`);
    const oud = (k.kaarten || []).find((y) => y.id === x.id);
    return { id: x.id || `k${n + 1}`, soort: x.soort, tekst: x.tekst || "", bij: +(x.bij ?? 0), duur: +(x.duur ?? 2.5), plek: x.plek || "boven", geluid: x.geluid || null, waarom: x.waarom || "", beeld: x.beeld || null, status: oud?.status === "weg" ? "weg" : "houden", notitie: oud?.notitie || "" };
  });
  gedaan.push(`${k.kaarten.length} kaarten`);
}
if (v.kleur) { if (LOOKS[v.kleur]) { k.kleur = { look: v.kleur }; gedaan.push(`kleur ${v.kleur}`); } else fouten.push(`kleur "${v.kleur}" bestaat niet`); }
if (fouten.length) meld({ ok: false, fout: "Het voorstel klopt niet helemaal; er is niets opgeslagen.", details: fouten }, 2);

k.bijgewerkt = new Date().toISOString();
k.klaar = false;
schrijfJson(pad, k);
const na = reelTijdlijn(k);
const waarschuwingen = [];
if (na.duur > 90) waarschuwingen.push(`De Reel wordt ${na.duur.toFixed(0)} s. Reels tot 90 seconden werken het best; stel meer knippen voor.`);
else if (na.duur > 60) waarschuwingen.push(`De Reel wordt ${na.duur.toFixed(0)} s. Onder de 60 seconden kijken meer mensen hem af.`);
if (!(k.kaarten || []).some((x) => x.bij === 0 && x.soort === "kop")) waarschuwingen.push("Er staat geen kop op het eerste beeld (kaart met soort kop en bij 0). In de feed begint de Reel daar.");
meld({ ok: true, gedaan, duurVoor: +voor.toFixed(1), duurNa: na.duur, stukken: na.stukken.length, regels: na.regels.length, waarschuwingen });
