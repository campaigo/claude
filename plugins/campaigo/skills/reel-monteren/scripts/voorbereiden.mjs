/**
 * Bereidt een eigen opname voor op de montage. In de map van de Reel staat de opname als ruw.<ext> (of geef --bron mee,
 * dan wordt hij daarheen gekopieerd; het origineel blijft onaangeroerd).
 *   node voorbereiden.mjs <map van de Reel> [--bron <video>] [--tempo rustig|strak|vlot] [--opnieuw]
 *
 * Maakt in <map>/montage/:
 *   schoon.wav          de stem, opgeschoond: lichte ruisonderdrukking, sisklanken getemperd, warmer en helderder,
 *                       op de luidheid die Instagram verwacht (-14 LUFS)
 *   woorden.json        wat er gezegd wordt, met tijden per woord (spraak.mjs)
 *   proxy.mp4           lichte versie (540x960, met de schone stem) voor de controlepagina
 *   geluid-voor.wav, geluid-na.wav    dezelfde 10 seconden voor en na het opschonen
 *   kleur-<look>.jpg    hetzelfde beeld in elke kleurlook
 *   begin.jpg, eind.jpg de eerste en laatste 4 seconden (elke halve seconde een beeld), om opstarten en afsluiten te zien
 * En in <map>: keuzes.json (het startpunt: alles blijft, stopwoorden en lange pauzes gaan eruit) en tekst.txt (de tekst
 * per zin met de nummers van de woorden, voor het voorstel). Een bestaande keuzes.json blijft staan, tenzij --opnieuw.
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { ffAsync, ffDraai, klok, leesGeluid, meld, niveaus, onderzoek, optie, reelEnStudio, schrijfJson, stiltes } from "./gemeen.mjs";
import { LOOKS, TEMPO, isStopwoord } from "./knippen.mjs";
import { maakUitschrijver, spraakKlaar } from "./spraak.mjs";

const args = process.argv.slice(2);
const { map, studio, ff } = reelEnStudio(args);
const begin = Date.now();
const waarschuwingen = [];
const M = path.join(map, "montage");
fs.mkdirSync(M, { recursive: true });

// ---------- de opname ----------
const bronArg = optie(args, "--bron");
if (bronArg && bronArg !== true) {
  const bron = path.resolve(bronArg);
  if (!fs.existsSync(bron)) meld({ ok: false, fout: `Video ${bron} niet gevonden.` }, 2);
  for (const f of fs.readdirSync(map)) if (/^ruw\./i.test(f)) fs.rmSync(path.join(map, f));
  fs.copyFileSync(bron, path.join(map, `ruw${path.extname(bron).toLowerCase() || ".mp4"}`));
}
const ruwNaam = fs.readdirSync(map).find((f) => /^ruw\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(f));
if (!ruwNaam) meld({ ok: false, fout: "Geen opname gevonden. Zet de video in de map als ruw.mp4 of ruw.mov, of geef --bron mee." }, 2);
const ruw = path.join(map, ruwNaam);
const info = onderzoek(ff, ruw);
if (!info.beeld) meld({ ok: false, fout: "In dit bestand zit geen beeld. Is het wel een video?" }, 2);
if (!info.geluid) meld({ ok: false, fout: "In deze video zit geen geluid. Monteren op wat er gezegd wordt kan dan niet." }, 2);
if (info.duur < 3) meld({ ok: false, fout: "Deze video is korter dan 3 seconden." }, 2);
if (info.duur > 600) meld({ ok: false, fout: "Deze video is langer dan 10 minuten. Knip hem eerst in stukken, of kies het stuk dat een Reel moet worden." }, 2);
if (info.duur > 180) waarschuwingen.push(`De opname duurt ${klok(info.duur)}. Een Reel werkt het best onder de 60 seconden: er moet flink geknipt worden.`);
if (info.breedte > info.hoogte) waarschuwingen.push("De video is liggend gefilmd. Voor een Reel wordt het midden eruit gesneden (staand); kijk of het gezicht in het midden staat.");
const tempo = TEMPO[optie(args, "--tempo")] ? optie(args, "--tempo") : "rustig";

// ---------- de stem opschonen ----------
// ruis zacht weg, poort tussen woorden, brom eraf, minder dof, meer helderheid en lucht, sisklanken getemperd,
// lichte compressie. Daarna in twee keer naar -14 LUFS (de luidheid van Instagram), zonder pieken boven -1,5 dB.
const KETEN = "afftdn=nf=-25,agate=threshold=0.015:ratio=3:range=0.25:attack=4:release=150,highpass=f=85,equalizer=f=220:t=q:w=1:g=-2.5,equalizer=f=3200:t=q:w=1:g=2.5,highshelf=f=9000:g=2,deesser=i=0.4:m=0.5:f=0.5,acompressor=ratio=3:threshold=-20dB:attack=5:release=80";
function luidheid(bestand, keten) {
  const r = spawnSync(ff, ["-hide_banner", "-nostdin", "-i", bestand, "-vn", "-af", `${keten ? keten + "," : ""}loudnorm=I=-14:TP=-1.5:LRA=7:print_format=json`, "-f", "null", "-"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const m = /\{[\s\S]*?"input_i"[\s\S]*?\}/.exec(r.stderr || "");
  if (!m) meld({ ok: false, fout: "Het geluid meten lukte niet.", detail: (r.stderr || "").slice(-600) }, 3);
  return JSON.parse(m[0]);
}
const ln = (j) => `loudnorm=I=-14:TP=-1.5:LRA=7:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
const schoon = path.join(M, "schoon.wav");
// eerst op een vaste sterkte brengen, zodat ruisonderdrukking en poort bij zachte en harde opnames hetzelfde doen
const ruwJ = luidheid(ruw, "");
const ruwI = Number.isFinite(+ruwJ.input_i) ? +ruwJ.input_i : -70;
if (ruwI < -60) meld({ ok: false, fout: "Er is bijna niets te horen in deze video. Staat de microfoon aan, of is het geluid weggevallen?" }, 2);
const versterk = Math.max(-10, Math.min(40, -23 - ruwI));
const keten = `volume=${versterk.toFixed(1)}dB,${KETEN}`;
ffDraai(ff, ["-i", ruw, "-vn", "-ac", "1", "-af", `${keten},${ln(luidheid(ruw, keten))}`, "-ar", "48000", schoon], "De stem opschonen lukte niet.");

// ---------- uitschrijven (op de achtergrond verder met de rest) ----------
if (!spraakKlaar(studio)) meld({ ok: false, fout: "Het uitschrijven is nog niet ingericht. Draai eerst spraak.mjs --inrichten (eenmalig)." }, 2);
const proxyKlaar = ffAsync(ff, ["-i", ruw, "-i", schoon, "-map", "0:v:0", "-map", "1:a:0",
  "-vf", "scale=540:960:force_original_aspect_ratio=increase,crop=540:960,fps=30,format=yuv420p",
  "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-g", "15", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", path.join(M, "proxy.mp4")]);
const STAP = 0.01, SR = 16000;
const pcm = leesGeluid(ff, schoon, SR);
const schrijf = await maakUitschrijver(studio);
let woorden = await schrijf(pcm, 0);

// ---------- stiltes, woordgrenzen en stopwoorden ----------
const lv = niveaus(pcm, SR, STAP);
const { stiltes: stil, vloer, drempel } = stiltes(lv, STAP, 0.2);
if (vloer > -45) waarschuwingen.push(`Er blijft wat achtergrondgeluid hoorbaar tussen de woorden (${Math.round(vloer)} dB). Wind of geroezemoes gaat er niet helemaal uit.`);
const stilAandeel = (a, b) => {
  const i0 = Math.floor(a / STAP), i1 = Math.max(i0 + 1, Math.floor(b / STAP));
  let n = 0;
  for (let i = i0; i < i1 && i < lv.length; i++) if (lv[i] < drempel) n++;
  return n / (i1 - i0);
};

// Whisper kapt het laatste woord voor een pauze vaak te vroeg af: laat het doorlopen tot de stilte die erop volgt
function rekUit() {
  woorden.sort((p, q) => p.van - q.van);
  woorden.forEach((w, k) => {
    const volgende = woorden[k + 1]?.van ?? Infinity;
    const s = stil.find((x) => x.tot > w.tot);
    if (!s) { w.tot = Math.max(w.tot, Math.min(volgende, pcm.length / SR, w.tot + 1.2)); return; }
    const eind = Math.min(s.van, volgende);
    if (eind > w.tot && eind - w.tot <= 1.2) w.tot = +eind.toFixed(3);
  });
}
rekUit();

// Whisper slaat soms een stuk over (vooral een zin die herhaald wordt). Elk stuk spraak zonder woorden schrijven we
// nog een keer apart uit, zodat er nooit ongemerkt iets wegvalt.
const gedekt = (a, b) => woorden.some((w) => w.tot > a && w.van < b);
const spraakStukken = [];
{
  let a = 0;
  for (const s of [...stil, { van: pcm.length / SR, tot: pcm.length / SR }]) {
    if (s.van - a >= 0.5) spraakStukken.push([a, s.van]);
    a = s.tot;
  }
}
let overgeslagen = 0;
for (const [a, b] of spraakStukken) {
  // alleen het deel dat niet door woorden gedekt is
  const binnen = woorden.filter((w) => w.tot > a && w.van < b);
  const vrij = [];
  let c = a;
  // pas vanaf een seconde: kortere stukjes zijn meestal het staartje van een woord dat Whisper iets te vroeg afkapte
  for (const w of binnen) { if (w.van - c >= 1.0) vrij.push([c, w.van]); c = Math.max(c, w.tot); }
  if (b - c >= 1.0) vrij.push([c, b]);
  for (const [x, y] of vrij) {
    if (stilAandeel(x, y) > 0.5) continue;
    const x0 = Math.max(0, x - 0.15), y0 = Math.min(pcm.length / SR, y + 0.15);
    const extra = (await schrijf(pcm.slice(Math.floor(x0 * SR), Math.floor(y0 * SR)), x0)).filter((w) => !gedekt(w.van + 0.05, w.tot - 0.05));
    if (extra.length) { overgeslagen += extra.length; woorden.push(...extra); }
  }
}
rekUit();
const proxy = await proxyKlaar;
if (proxy.code !== 0) meld({ ok: false, fout: "De lichte versie voor de controlepagina maken lukte niet.", detail: proxy.err.slice(-600) }, 3);
// Whisper rekt woorden soms over een stilte heen: de woordgrens naar de stilte schuiven
for (const w of woorden) {
  for (const s of stil) {
    if (s.van <= w.van + 0.02 && s.tot > w.van + 0.1 && s.tot < w.tot - 0.08) w.van = s.tot;
    if (s.van > w.van + 0.08 && s.van < w.tot - 0.1 && s.tot >= w.tot - 0.02) w.tot = s.van;
  }
}
// verzinsels van Whisper in stilte ("Ondertiteling door...") en woorden zonder geluid eronder
const VERZONNEN = /ondertitel|amara\.org|tv gelderland|bedankt voor het kijken|abonneer/i;
const verzonnen = woorden.filter((w) => VERZONNEN.test(w.tekst) || !/[\p{L}\p{N}]/u.test(w.tekst) || (w.tot - w.van > 0.25 && stilAandeel(w.van, w.tot) > 0.9));
if (verzonnen.length) woorden = woorden.filter((w) => !verzonnen.includes(w));
if (!woorden.length) meld({ ok: false, fout: "Er is geen gesproken tekst gevonden in deze video." }, 2);

const units = [];
woorden.forEach((w, k) => {
  const eh = isStopwoord(w.tekst);
  units.push({ soort: eh ? "eh" : "woord", tekst: w.tekst, van: w.van, tot: w.tot, weg: eh });
  // een klank zonder woord tussen twee woorden (vaak een eh die Whisper niet opschrijft): voorstellen, niet weghalen
  const volgende = woorden[k + 1];
  if (volgende && volgende.van - w.tot >= 0.5 && stilAandeel(w.tot, volgende.van) < 0.4) {
    units.push({ soort: "geluid", tekst: "klank", van: +(w.tot + 0.02).toFixed(3), tot: +(volgende.van - 0.02).toFixed(3), weg: false });
  }
});
units.forEach((u, i) => { u.i = i; });
const eerste = units[0].van, laatste = units[units.length - 1].tot;
const pauzes = stil.filter((s) => s.van >= eerste && s.tot <= laatste + 0.01 && s.tot - s.van >= 0.25)
  .map((s) => ({ van: s.van, tot: s.tot, inkorten: s.tot - s.van > TEMPO[tempo].pauzeMin }));

// ---------- keuzes.json ----------
const keuzesPad = path.join(map, "keuzes.json");
let keuzes;
if (fs.existsSync(keuzesPad) && !args.includes("--opnieuw")) {
  keuzes = JSON.parse(fs.readFileSync(keuzesPad, "utf8"));
  waarschuwingen.push("keuzes.json bestond al en is blijven staan (geef --opnieuw mee om opnieuw te beginnen).");
} else {
  keuzes = {
    versie: 1, bron: ruwNaam, duur: +info.duur.toFixed(3), tempo,
    units, pauzes,
    ondertitels: { stijl: "zin", hoofdletters: "zoals", y: 1240 },
    kaarten: [],
    kleur: { look: "zoals" },
    notities: "", klaar: false, bijgewerkt: new Date().toISOString(),
  };
  schrijfJson(keuzesPad, keuzes);
}

// ---------- tekst.txt: de tekst per zin, met de nummers van de woorden ----------
const zinnen = [];
let zin = [];
keuzes.units.forEach((u, k) => {
  zin.push(u);
  const volgende = keuzes.units[k + 1];
  if (/[.!?]$/.test(u.tekst) || !volgende || volgende.van - u.tot > 1.0) { zinnen.push(zin); zin = []; }
});
const regels = zinnen.map((z, n) => `r${n + 1}  [${z[0].i}-${z[z.length - 1].i}]  ${klok(z[0].van)}  ` + z.map((u) => (u.soort === "woord" ? u.tekst : `(${u.tekst})`) + (u.weg ? "✂" : "")).join(" "));
fs.writeFileSync(path.join(map, "tekst.txt"), [
  `Opname ${ruwNaam}, ${klok(info.duur)}. Per zin: r<nummer>  [eerste-laatste woord]  tijd  tekst.`,
  "(eh) is een stopwoord, (klank) geluid zonder woord (vaak een eh); ✂ betekent: gaat er nu uit.",
  "",
  ...regels, "",
].join("\n"));

// ---------- geluid voor en na, kleuren, begin en eind ----------
const v0 = Math.max(0, Math.min(eerste, info.duur - 10));
const d10 = Math.min(10, info.duur - v0);
ffDraai(ff, ["-ss", v0.toFixed(2), "-t", d10.toFixed(2), "-i", ruw, "-vn", "-ac", "1", "-af", ln(ruwJ), "-ar", "48000", path.join(M, "geluid-voor.wav")], "Het geluidsfragment (voor) maken lukte niet.");
ffDraai(ff, ["-ss", v0.toFixed(2), "-t", d10.toFixed(2), "-i", schoon, "-ac", "1", path.join(M, "geluid-na.wav")], "Het geluidsfragment (na) maken lukte niet.");
const midden = units[Math.floor(units.length * 0.4)];
const kt = Math.min(info.duur - 0.1, (midden.van + midden.tot) / 2);
for (const [naam, look] of Object.entries(LOOKS)) {
  ffDraai(ff, ["-ss", kt.toFixed(2), "-i", ruw, "-frames:v", "1", "-vf", `scale=540:960:force_original_aspect_ratio=increase,crop=540:960${look.filter ? "," + look.filter : ""}`, "-q:v", "3", path.join(M, `kleur-${naam}.jpg`)], "Een kleurvoorbeeld maken lukte niet.");
}
const strook = (van, uit) => ffDraai(ff, ["-ss", van.toFixed(2), "-t", "4", "-i", ruw, "-vf", "fps=2,scale=200:356:force_original_aspect_ratio=increase,crop=200:356,tile=8x1:padding=4", "-frames:v", "1", "-q:v", "4", uit], "Beelden van begin of eind maken lukte niet.");
strook(0, path.join(M, "begin.jpg"));
strook(Math.max(0, info.duur - 4), path.join(M, "eind.jpg"));

meld({
  ok: true, map, opname: ruwNaam, duur: +info.duur.toFixed(1), formaat: `${info.breedte}x${info.hoogte}`,
  woorden: units.filter((u) => u.soort === "woord").length,
  stopwoorden: units.filter((u) => u.soort === "eh").length,
  klankenZonderWoord: units.filter((u) => u.soort === "geluid").length,
  pauzes: pauzes.length, tweedeKeerUitgeschreven: overgeslagen, verzonnenWeggehaald: verzonnen.map((w) => w.tekst),
  achtergrondDb: Math.round(vloer),
  tekst: path.join(map, "tekst.txt"), keuzes: keuzesPad,
  beginEnEind: [path.join(M, "begin.jpg"), path.join(M, "eind.jpg")],
  tijd: `${Math.round((Date.now() - begin) / 1000)} s`, waarschuwingen,
});
