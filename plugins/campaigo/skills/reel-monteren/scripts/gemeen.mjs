/**
 * Gedeeld door de scripts van reel-monteren. Bouwt voort op de Reel-studio (zelfde studiomap, Node, ffmpeg en browser):
 * de helpers daarvan worden hier doorgegeven, aangevuld met wat montage nodig heeft (geluid lezen, stiltes vinden).
 */
import fs from "fs";
import path from "path";
import { spawn, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { ffmpeg, meld, optie, vindStudio } from "../../reel-studio/scripts/gedeeld.mjs";

export { meld, optie, vindStudio, ffmpeg };
export { server, standaardStudio, browser } from "../../reel-studio/scripts/gedeeld.mjs";

export const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PAGINA = path.join(SKILL, "pagina");

/** De map van een Reel en de studio eromheen; stopt met een duidelijke melding als het niet klopt. */
export function reelEnStudio(args) {
  const map = path.resolve(args.find((a) => !a.startsWith("--")) || ".");
  if (!fs.existsSync(map) || !fs.statSync(map).isDirectory()) meld({ ok: false, fout: `Map ${map} bestaat niet.` }, 2);
  const studio = vindStudio(map);
  if (!studio) meld({ ok: false, fout: "De studio is nog niet ingericht. Draai eerst het inrichten van de Reel-studio." }, 2);
  return { map, studio, ff: ffmpeg(studio) };
}

/** ffmpeg draaien; geeft stderr terug, of stopt met een melding. */
export function ffDraai(ff, args, fout) {
  const r = spawnSync(ff, ["-hide_banner", "-nostdin", "-loglevel", "error", "-y", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) meld({ ok: false, fout, detail: (r.stderr || String(r.error || "")).slice(-800) }, 3);
  return r.stderr || "";
}

/** Hetzelfde, maar zonder het programma eerst te blokkeren (lange stappen, terwijl iets anders doorloopt). */
export function ffAsync(ff, args) {
  return new Promise((ok) => {
    const p = spawn(ff, ["-hide_banner", "-nostdin", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("close", (code) => ok({ code, err }));
  });
}

/** Wat ffmpeg over een bestand weet: duur, beeldformaat, of er geluid en beeld is. */
export function onderzoek(ff, bestand) {
  const r = spawnSync(ff, ["-hide_banner", "-nostdin", "-i", bestand], { encoding: "utf8" });
  const t = r.stderr || "";
  const duur = /Duration: (\d+):(\d+):([\d.]+)/.exec(t);
  const v = /Stream #[^\n]*Video: (\w+)[^\n]*?, (\d{2,5})x(\d{2,5})/.exec(t);
  const rot = /rotate\s*:\s*(-?\d+)|rotation of (-?[\d.]+)/.exec(t);
  const fps = /([\d.]+) fps/.exec(t);
  let b = v ? +v[2] : 0, h = v ? +v[3] : 0;
  const graden = rot ? Math.abs(Math.round(+(rot[1] ?? rot[2]))) % 180 : 0;
  if (graden === 90) [b, h] = [h, b];   // telefoon staand gefilmd: ffmpeg draait het beeld zelf
  return {
    duur: duur ? +duur[1] * 3600 + +duur[2] * 60 + +duur[3] : 0,
    beeld: !!v, codec: v?.[1] || null, breedte: b, hoogte: h, fps: fps ? +fps[1] : null,
    geluid: /Stream #[^\n]*Audio:/.test(t),
  };
}

/** Geluid als mono Float32Array op de gegeven samplefrequentie. */
export function leesGeluid(ff, bestand, sr = 16000) {
  const r = spawnSync(ff, ["-hide_banner", "-nostdin", "-loglevel", "error", "-i", bestand, "-vn", "-ac", "1", "-ar", String(sr), "-f", "f32le", "pipe:1"], { maxBuffer: 1024 * 1024 * 1024 });
  if (r.status !== 0) meld({ ok: false, fout: `Geluid uit ${path.basename(bestand)} lezen lukte niet.`, detail: String(r.stderr || "").slice(-600) }, 3);
  const buf = r.stdout;
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
}

/** Geluidssterkte in dB per stapje van `stap` seconden. */
export function niveaus(pcm, sr, stap = 0.01) {
  const n = Math.max(1, Math.round(sr * stap));
  const uit = new Float32Array(Math.floor(pcm.length / n));
  for (let k = 0; k < uit.length; k++) {
    let s = 0;
    for (let i = k * n; i < (k + 1) * n; i++) s += pcm[i] * pcm[i];
    uit[k] = 10 * Math.log10(s / n + 1e-12);
  }
  return uit;
}

/** Het achtergrondniveau: het 10e percentiel van de niveaus (de stilte tussen woorden). */
export function achtergrond(lv) {
  const s = [...lv].sort((a, b) => a - b);
  return s[Math.floor(s.length * 0.1)] ?? -90;
}

/** Stiltes van minstens `min` seconden: [{ van, tot }]. De drempel ligt net boven de achtergrond van deze opname. */
export function stiltes(lv, stap, min) {
  const vloer = achtergrond(lv);
  // net boven de achtergrond, maar nooit zo laag dat de galm van een woord als spraak telt (bij een heel stille opname)
  const drempel = Math.min(Math.max(vloer + 12, -55), -30);
  const uit = [];
  let begin = null;
  for (let k = 0; k <= lv.length; k++) {
    const stil = k < lv.length && lv[k] < drempel;
    if (stil && begin === null) begin = k;
    if (!stil && begin !== null) {
      if ((k - begin) * stap >= min) uit.push({ van: +(begin * stap).toFixed(3), tot: +(k * stap).toFixed(3) });
      begin = null;
    }
  }
  return { stiltes: uit, vloer, drempel };
}

export const leesJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
export const schrijfJson = (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 1));

/** Tijd als 0:04,1 (zoals de ondernemer hem leest). */
export const klok = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0").replace(".", ",")}`;
