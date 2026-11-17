/**
 * Monteert de opname volgens keuzes.json (zoals goedgekeurd op de controlepagina).
 *   node monteren.mjs <map van de Reel> [--snel]
 *
 * Maakt in de map van de Reel:
 *   master.mp4    het beeld: de bewaarde stukken achter elkaar, in de gekozen kleur, staand 1080x1920, 30 beelden per seconde
 *   master.wav    de schone stem, op dezelfde plekken geknipt, met een heel korte fade op elke knip (geen tikjes)
 *   woorden.json  alles in de tijd van de Reel: woorden, ondertitelregels, knippen (naden) en de goedgekeurde kaarten.
 *                 Hier bouwt reel.html op (zie de skill).
 * Daarna schrijft hij master.wav nog een keer uit en vergelijkt dat met wat er moest blijven (niet met --snel): zo valt op
 * als er bij een knip een woord is afgekapt.
 * Uitkomst: duur, aantal knippen, wat de ondernemer op de pagina vroeg (wijzigingen, notities) en of er woorden misten.
 */
import fs from "fs";
import path from "path";
import { ffDraai, leesGeluid, leesJson, meld, niveaus, onderzoek, reelEnStudio, schrijfJson } from "./gemeen.mjs";
import { LOOKS, bewaardeStukken, reelTijdlijn, tempoVan } from "./knippen.mjs";
import { maakUitschrijver } from "./spraak.mjs";

const args = process.argv.slice(2);
const { map, studio, ff } = reelEnStudio(args);
const begin = Date.now();
const pad = path.join(map, "keuzes.json");
if (!fs.existsSync(pad)) meld({ ok: false, fout: "Geen keuzes.json. Draai eerst voorbereiden.mjs." }, 2);
const k = leesJson(pad);
const ruw = path.join(map, k.bron);
const schoon = path.join(map, "montage", "schoon.wav");
for (const f of [ruw, schoon]) if (!fs.existsSync(f)) meld({ ok: false, fout: `${path.relative(map, f)} ontbreekt. Draai voorbereiden.mjs opnieuw.` }, 2);

// ---------- de knippen op de stilste plek leggen ----------
// woordtijden kunnen een paar honderdsten verschuiven; een knip midden in een klank hoor je, in de stilte niet
const STAP = 0.005;
const pcm = leesGeluid(ff, schoon, 16000);
const lv = niveaus(pcm, 16000, STAP);
const stilste = (t, links, rechts) => {
  let best = t, laag = Infinity;
  for (let x = t - links; x <= t + rechts + 1e-9; x += STAP) {
    const i = Math.round(x / STAP);
    if (i < 0 || i >= lv.length) continue;
    const v = lv[i] + Math.abs(x - t) * 20;   // liever dichtbij: 1 dB per 5 ms afstand
    if (v < laag) { laag = v; best = x; }
  }
  return +best.toFixed(3);
};
const ruweStukken = bewaardeStukken(k);
if (!ruweStukken.length) meld({ ok: false, fout: "Alles is weggeknipt: er blijft niets over." }, 2);
const stukken = ruweStukken.map(([a, b], n) => [n === 0 ? a : stilste(a, 0.04, 0.03), n === ruweStukken.length - 1 ? b : stilste(b, 0.03, 0.05)]);
for (let n = 1; n < stukken.length; n++) if (stukken[n][0] < stukken[n - 1][1]) stukken[n][0] = stukken[n - 1][1];
const lijn = reelTijdlijn(k, stukken.filter(([a, b]) => b - a > 0.05));
const { snelheid } = tempoVan(k);

// ---------- knippen ----------
const look = LOOKS[k.kleur?.look] || LOOKS.zoals;
const FADE = 0.012;
const vp = [], ap = [];
lijn.stukken.forEach(([a, b], n) => {
  vp.push(`[0:v]trim=start=${a}:end=${b},setpts=PTS-STARTPTS[v${n}]`);
  ap.push(`[1:a]atrim=start=${a}:end=${b},asetpts=PTS-STARTPTS,afade=t=in:d=${FADE},afade=t=out:st=${Math.max(b - a - FADE, 0).toFixed(3)}:d=${FADE}[a${n}]`);
});
const n = lijn.stukken.length;
const naVideo = [`setpts=PTS/${snelheid}`, ...(look.filter ? [look.filter] : []), "scale=1080:1920:force_original_aspect_ratio=increase", "crop=1080:1920", "fps=30", "format=yuv420p"];
const filter = [...vp, ...ap,
  lijn.stukken.map((_, i) => `[v${i}]`).join("") + `concat=n=${n}:v=1:a=0,${naVideo.join(",")}[vuit]`,
  lijn.stukken.map((_, i) => `[a${i}]`).join("") + `concat=n=${n}:v=0:a=1${snelheid !== 1 ? `,atempo=${snelheid}` : ""}[auit]`,
].join(";\n");
const script = path.join(map, "montage", "knippen.txt");
fs.writeFileSync(script, filter);
const mp4 = path.join(map, "master.mp4"), wav = path.join(map, "master.wav");
ffDraai(ff, ["-i", ruw, "-i", schoon, "-filter_complex_script", script,
  "-map", "[vuit]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-g", "30", "-movflags", "+faststart", mp4,
  "-map", "[auit]", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", wav], "Het knippen lukte niet.");

const beeld = onderzoek(ff, mp4), stem = onderzoek(ff, wav);
const waarschuwingen = [];
if (Math.abs(beeld.duur - lijn.duur) > 0.15 || Math.abs(stem.duur - lijn.duur) > 0.15) waarschuwingen.push(`Beeld (${beeld.duur.toFixed(2)} s) en stem (${stem.duur.toFixed(2)} s) zijn niet even lang als verwacht (${lijn.duur.toFixed(2)} s).`);
if (lijn.duur > 90) waarschuwingen.push(`De Reel duurt ${lijn.duur.toFixed(0)} s; Reels tot 90 seconden werken het best.`);

// ---------- woorden.json ----------
const duur = +Math.min(beeld.duur || lijn.duur, stem.duur || lijn.duur).toFixed(3);
schrijfJson(path.join(map, "woorden.json"), {
  versie: 1, duur, video: "master.mp4", stem: "master.wav",
  ondertitels: k.ondertitels, kleur: k.kleur?.look || "zoals",
  woorden: lijn.woorden, regels: lijn.regels, naden: lijn.naden, kaarten: lijn.kaarten,
});

// ---------- nakijken: is elk woord dat moest blijven nog te horen? ----------
let gemist = null;
if (!args.includes("--snel")) {
  const schrijf = await maakUitschrijver(studio);
  const gehoord = (await schrijf(leesGeluid(ff, wav, 16000), 0)).map((w) => w.tekst);
  const norm = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const a = lijn.woorden.map((w) => norm(w.gesproken || w.tekst)), b = gehoord.map(norm);
  // Whisper spelt een woord de tweede keer soms anders ("excursus"): bijna gelijk telt als gelijk
  const afstand = (x, y) => {
    const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
    for (let j = 1; j <= y.length; j++) d[0][j] = j;
    for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    return d[x.length][y.length];
  };
  const gelijk = (x, y) => x === y || (Math.min(x.length, y.length) >= 4 && afstand(x, y) <= Math.max(1, Math.round(Math.max(x.length, y.length) * 0.3)));
  // langste gemeenschappelijke reeks: wat daar niet in zit, is niet (goed) te horen
  const L = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) L[i][j] = gelijk(a[i], b[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const mist = [];
  for (let i = 0, j = 0; i < a.length;) {
    if (j < b.length && gelijk(a[i], b[j])) { i++; j++; } else if (j < b.length && L[i][j + 1] >= L[i + 1][j]) j++; else { mist.push(lijn.woorden[i]); i++; }
  }
  // een los woord dat Whisper anders spelt, is geen probleem; twee of meer op een rij rond een knip wel
  gemist = mist.map((w) => ({ woord: w.tekst, seconde: w.van, bijKnip: lijn.naden.some((t) => Math.abs(t - w.van) < 0.6 || Math.abs(t - w.tot) < 0.6) }));
  const ernstig = gemist.filter((m) => m.bijKnip);
  if (ernstig.length) waarschuwingen.push(`Mogelijk afgekapt bij een knip: ${ernstig.map((m) => `"${m.woord}" (${m.seconde.toFixed(1)} s)`).join(", ")}. Luister die plekken na.`);
}

meld({
  ok: true, map, duur, knippen: lijn.naden.length, kleur: look.naam, tempo: tempoVan(k).naam,
  bestanden: { video: mp4, stem: wav, woorden: path.join(map, "woorden.json") },
  ondertitelregels: lijn.regels.length, kaarten: lijn.kaarten.map((x) => ({ id: x.id, soort: x.soort, tekst: x.tekst, van: x.van, status: x.status })),
  gevraagd: {
    wijzigen: (k.kaarten || []).filter((x) => x.status === "wijzigen").map((x) => ({ id: x.id, notitie: x.notitie })),
    weg: (k.kaarten || []).filter((x) => x.status === "weg").map((x) => x.id),
    notities: k.notities || "",
  },
  gemist, tijd: `${Math.round((Date.now() - begin) / 1000)} s`, waarschuwingen,
});
