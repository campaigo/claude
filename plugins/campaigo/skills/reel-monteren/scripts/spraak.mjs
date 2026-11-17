/**
 * Spraak uitschrijven, op de computer zelf, met tijden per woord. Gebruikt Whisper (large-v3-turbo, Nederlands)
 * via transformers.js; alles staat in <studio>/.studio/spraak, los van de rest van de studio.
 *
 *   node spraak.mjs --inrichten [--studio <map>]    onderdelen en het spraakmodel ophalen (eenmalig, ongeveer 900 MB)
 *   node spraak.mjs <geluid of video> <uit.json>     uitschrijven naar [{ tekst, van, tot }]
 *
 * Dit is bewust een los onderdeel: als Campaigo zelf kan uitschrijven, vervangt die route dit bestand en hoeft de
 * ondernemer het model niet meer te downloaden. De rest van de montage verandert dan niet.
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import { ffmpeg, leesGeluid, meld, optie, standaardStudio, vindStudio } from "./gemeen.mjs";

export const MODEL = { id: "onnx-community/whisper-large-v3-turbo_timestamped", dtype: { encoder_model: "q4", decoder_model_merged: "q4" } };
const VERSIES = { "@huggingface/transformers": "4.3.2" };

const spraakMap = (studio) => path.join(studio, ".studio", "spraak");

/** Is alles er al (onderdelen en model)? */
export function spraakKlaar(studio) {
  const d = spraakMap(studio);
  return fs.existsSync(path.join(d, "klaar.json"));
}

async function laadTransformers(studio) {
  const d = spraakMap(studio);
  const req = createRequire(path.join(d, "package.json"));
  let ingang;
  try { ingang = req.resolve("@huggingface/transformers"); } catch { return null; }
  // de ESM-ingang naast de CommonJS-ingang
  const mjs = ingang.replace(/transformers\.node\.cjs$/, "transformers.node.mjs");
  const t = await import(pathToFileURL(fs.existsSync(mjs) ? mjs : ingang).href);
  t.env.cacheDir = path.join(d, "modellen");
  t.env.allowLocalModels = false;
  return t;
}

/** Wat niet bij deze computer hoort weggooien: de rekenmotor bestaat voor elk systeem, wij hebben er één nodig. */
function opruimen(d) {
  const nm = path.join(d, "node_modules");
  fs.rmSync(path.join(nm, "onnxruntime-web"), { recursive: true, force: true });
  const bin = path.join(nm, "onnxruntime-node", "bin");
  if (!fs.existsSync(bin)) return;
  for (const napi of fs.readdirSync(bin)) {
    for (const os of fs.readdirSync(path.join(bin, napi))) {
      const osMap = path.join(bin, napi, os);
      if (os !== process.platform) { fs.rmSync(osMap, { recursive: true, force: true }); continue; }
      for (const arch of fs.readdirSync(osMap)) {
        const archMap = path.join(osMap, arch);
        if (arch !== process.arch) { fs.rmSync(archMap, { recursive: true, force: true }); continue; }
        for (const f of fs.readdirSync(archMap)) if (/providers_(cuda|tensorrt)/.test(f)) fs.rmSync(path.join(archMap, f), { force: true });
      }
    }
  }
}

export async function inrichten(studio) {
  const d = spraakMap(studio);
  fs.mkdirSync(d, { recursive: true });
  const stappen = [];
  const pakket = path.join(d, "package.json");
  const huidig = fs.existsSync(pakket) ? JSON.parse(fs.readFileSync(pakket, "utf8")) : null;
  const aanwezig = fs.existsSync(path.join(d, "node_modules", "@huggingface", "transformers", "package.json"));
  if (JSON.stringify(huidig?.dependencies) !== JSON.stringify(VERSIES) || !aanwezig) {
    fs.rmSync(path.join(d, "klaar.json"), { force: true });
    fs.writeFileSync(pakket, JSON.stringify({ name: "campaigo-spraak", private: true, description: "Spraak uitschrijven voor de Reel-studio van Campaigo", dependencies: VERSIES }, null, 2));
    const dir = path.dirname(process.execPath);
    const cli = [path.join(dir, "node_modules", "npm", "bin", "npm-cli.js"), path.join(dir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js")].find((p) => fs.existsSync(p));
    const npmArgs = ["install", "--no-audit", "--no-fund", "--loglevel=error", "--omit=dev"];
    const sleutel = Object.keys(process.env).find((k) => k.toLowerCase() === "path") || "PATH";
    const env = { ...process.env, [sleutel]: `${dir}${path.delimiter}${process.env[sleutel] || ""}` };
    const r = cli
      ? spawnSync(process.execPath, [cli, ...npmArgs], { cwd: d, encoding: "utf8", env })
      : spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", npmArgs, { cwd: d, encoding: "utf8", env, shell: process.platform === "win32" });
    if (r.status !== 0) meld({ ok: false, fout: "Installeren van het uitschrijven lukte niet.", detail: (r.stderr || String(r.error || "")).slice(-1500) }, 1);
    stappen.push("onderdelen voor het uitschrijven geïnstalleerd");
  }
  opruimen(d);
  if (!fs.existsSync(path.join(d, "klaar.json"))) {
    // het model één keer laden: dan staat het in de map en werkt het daarna ook zonder internet
    const t = await laadTransformers(studio);
    if (!t) meld({ ok: false, fout: "transformers ontbreekt na het installeren." }, 1);
    try {
      const asr = await t.pipeline("automatic-speech-recognition", MODEL.id, { dtype: MODEL.dtype });
      await asr(new Float32Array(16000), { language: "dutch", task: "transcribe", return_timestamps: "word" });
    } catch (e) {
      meld({ ok: false, fout: "Het spraakmodel downloaden of starten lukte niet. Waarschijnlijk blokkeerde het netwerk huggingface.co.", detail: String(e?.message || e).slice(-800) }, 1);
    }
    fs.writeFileSync(path.join(d, "klaar.json"), JSON.stringify({ model: MODEL.id, klaar: new Date().toISOString() }, null, 2));
    stappen.push("spraakmodel gedownload");
  }
  let grootte = 0;
  const tel = (p) => { for (const n of fs.readdirSync(p, { withFileTypes: true })) { const q = path.join(p, n.name); if (n.isDirectory()) tel(q); else grootte += fs.statSync(q).size; } };
  tel(d);
  return { stappen: stappen.length ? stappen : ["alles stond al klaar"], mb: Math.round(grootte / 1e6) };
}

/**
 * Een uitschrijver: (pcm op 16 kHz, beginseconde) -> [{ tekst, van, tot }] in seconden van de opname.
 * Het model wordt één keer geladen; daarna kan hij vaker gebruikt worden (bijvoorbeeld voor stukken die de eerste keer
 * oversprongen).
 */
export async function maakUitschrijver(studio) {
  const t = await laadTransformers(studio);
  if (!t || !spraakKlaar(studio)) meld({ ok: false, fout: "Het uitschrijven is nog niet ingericht. Draai eerst spraak.mjs --inrichten." }, 2);
  const asr = await t.pipeline("automatic-speech-recognition", MODEL.id, { dtype: MODEL.dtype });
  return async (pcm, begin = 0) => {
    const r = await asr(pcm, { language: "dutch", task: "transcribe", return_timestamps: "word", chunk_length_s: 30, stride_length_s: 5 });
    const duur = pcm.length / 16000;
    const uit = [];
    for (const c of r.chunks || []) {
      const tekst = String(c.text || "").trim();
      if (!tekst) continue;
      const van = Math.max(0, Math.min(duur, c.timestamp?.[0] ?? 0));
      let tot = c.timestamp?.[1];
      if (tot == null || tot <= van) tot = Math.min(duur, van + 0.3);
      uit.push({ tekst, van: +(begin + van).toFixed(3), tot: +(begin + Math.min(duur, tot)).toFixed(3) });
    }
    return uit;
  };
}

/** Uitschrijven van een heel bestand. */
export async function uitschrijven(studio, bestand) {
  const schrijf = await maakUitschrijver(studio);
  return schrijf(leesGeluid(ffmpeg(studio), bestand, 16000));
}

// ---------- vanaf de opdrachtregel ----------
const isHoofd = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isHoofd) {
  const args = process.argv.slice(2);
  if (args.includes("--inrichten")) {
    const studio = path.resolve(optie(args, "--studio") || vindStudio() || standaardStudio());
    if (!fs.existsSync(path.join(studio, ".studio", "instellingen.json"))) meld({ ok: false, fout: "Richt eerst de Reel-studio in (inrichten.sh of inrichten.ps1)." }, 2);
    const r = await inrichten(studio);
    meld({ ok: true, studio, ...r });
  } else {
    const [bestand, uitPad] = args.filter((a) => !a.startsWith("--"));
    if (!bestand || !uitPad) meld({ ok: false, fout: "Gebruik: node spraak.mjs <geluid of video> <uit.json>" }, 2);
    const studio = vindStudio(path.dirname(path.resolve(bestand)));
    if (!studio) meld({ ok: false, fout: "Geen studio gevonden." }, 2);
    const woorden = await uitschrijven(studio, path.resolve(bestand));
    fs.writeFileSync(uitPad, JSON.stringify(woorden, null, 1));
    meld({ ok: true, woorden: woorden.length, uit: uitPad });
  }
}
