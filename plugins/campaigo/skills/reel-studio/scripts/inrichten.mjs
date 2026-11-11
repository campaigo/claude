/**
 * Richt de Reel-studio in op de computer van de klant, of controleert dat alles nog werkt.
 *   node inrichten.mjs [--studio <map>]
 * Standaard map: <thuismap>/Campaigo Reels. Daarin:
 *   .studio/       de onderdelen (playwright-core om een browser te besturen, ffmpeg-static voor de video)
 *   merk/          merk.json, logo en lettertypen van de klant, gedeeld door alle Reels
 *   <Reel>/        een map per Reel
 * Een browser: eerst Chrome, dan Edge; staat geen van beide erop, dan haalt dit een eigen Chromium (ongeveer 100 MB).
 * Uitkomst als JSON op stdout. Mag vaker gedraaid worden: wat er al staat, blijft staan.
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { meld, optie, standaardStudio, vereist } from "./gedeeld.mjs";

const VERSIES = { "playwright-core": "1.56.1", "ffmpeg-static": "5.2.0" };
const args = process.argv.slice(2);
const studio = path.resolve(optie(args, "--studio") || standaardStudio());
const intern = path.join(studio, ".studio");
const stappen = [];

const [hoofd] = process.versions.node.split(".").map(Number);
if (hoofd < 18) meld({ ok: false, fout: `Node ${process.versions.node} is te oud; nodig is 18 of nieuwer. Draai inrichten.ps1 of inrichten.sh, die zet een eigen Node klaar.` }, 1);

fs.mkdirSync(path.join(studio, "merk", "fonts"), { recursive: true });
fs.mkdirSync(intern, { recursive: true });
const leesmij = path.join(studio, "LEESMIJ.txt");
if (!fs.existsSync(leesmij)) {
  fs.writeFileSync(leesmij, [
    "Campaigo Reels",
    "",
    "In deze map maakt Claude je bewegende Reels. Elke Reel heeft een eigen map; de video staat daarin in export/reel.mp4.",
    "In merk/ staan je kleuren, logo en lettertype, die gebruikt Claude voor elke Reel.",
    "De map .studio bevat de onderdelen om video's te maken. Die kun je laten staan.",
    "Weggooien kan altijd: je Reels in Campaigo blijven gewoon bestaan.",
    "",
  ].join("\r\n"));
}

// ---------- onderdelen ----------
const pakket = path.join(intern, "package.json");
const gewenst = { name: "campaigo-reel-studio", private: true, description: "Onderdelen van de Reel-studio van Campaigo", dependencies: VERSIES };
const huidig = fs.existsSync(pakket) ? JSON.parse(fs.readFileSync(pakket, "utf8")) : null;
const aanwezig = (n) => fs.existsSync(path.join(intern, "node_modules", n, "package.json"));
if (JSON.stringify(huidig?.dependencies) !== JSON.stringify(VERSIES) || !Object.keys(VERSIES).every(aanwezig)) {
  fs.writeFileSync(pakket, JSON.stringify(gewenst, null, 2));
  // npm zoeken: naast deze Node (ook een losse Node uit inrichten.ps1/.sh), anders op het PATH
  const dir = path.dirname(process.execPath);
  const cli = [path.join(dir, "node_modules", "npm", "bin", "npm-cli.js"), path.join(dir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js")].find((p) => fs.existsSync(p));
  const npmArgs = ["install", "--no-audit", "--no-fund", "--loglevel=error", "--omit=dev"];
  // deze Node vooraan op het PATH: installatiescripts van pakketten roepen zelf "node" aan
  const sleutel = Object.keys(process.env).find((k) => k.toLowerCase() === "path") || "PATH";
  const env = { ...process.env, [sleutel]: `${dir}${path.delimiter}${process.env[sleutel] || ""}` };
  const r = cli
    ? spawnSync(process.execPath, [cli, ...npmArgs], { cwd: intern, encoding: "utf8", env })
    : spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", npmArgs, { cwd: intern, encoding: "utf8", env, shell: process.platform === "win32" });
  if (r.status !== 0) meld({ ok: false, fout: "Installeren van de onderdelen lukte niet.", detail: (r.stderr || String(r.error || "")).slice(-1500) }, 1);
  stappen.push("onderdelen geïnstalleerd");
}

// ---------- ffmpeg ----------
let ffmpegPad;
try { ffmpegPad = vereist(studio, "ffmpeg-static"); } catch (e) { meld({ ok: false, fout: "ffmpeg-static ontbreekt.", detail: e.message }, 1); }
if (!ffmpegPad || !fs.existsSync(ffmpegPad)) meld({ ok: false, fout: "ffmpeg is niet gedownload. Waarschijnlijk blokkeerde het netwerk of een virusscanner de download van GitHub. Draai dit script nog eens." }, 1);
const enc = spawnSync(ffmpegPad, ["-hide_banner", "-encoders"], { encoding: "utf8" });
if (enc.status !== 0 || !/libx264/.test(enc.stdout)) meld({ ok: false, fout: "ffmpeg werkt niet of kan geen H.264 maken.", detail: (enc.stderr || "").slice(-600) }, 1);

// ---------- browser ----------
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(intern, "browsers");
const { chromium } = vereist(studio, "playwright-core");
async function probeer(opties) {
  try {
    const b = await chromium.launch({ ...opties, args: ["--force-device-scale-factor=1"] });
    const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
    await p.setContent('<div style="width:1080px;height:1920px;background:#e4572e"></div>');
    const foto = await p.screenshot({ type: "jpeg", quality: 60 });
    await b.close();
    return foto.length > 1000;
  } catch { return false; }
}
let keuze = null;
for (const channel of ["chrome", "msedge"]) if (!keuze && (await probeer({ channel }))) keuze = { channel };
if (!keuze) {
  if (!(await probeer({}))) {
    const cli = path.join(intern, "node_modules", "playwright-core", "cli.js");
    const r = spawnSync(process.execPath, [cli, "install", "chromium-headless-shell"], { cwd: intern, encoding: "utf8", env: process.env });
    if (r.status !== 0) meld({ ok: false, fout: "Er staat geen Chrome of Edge op deze computer en een eigen browser downloaden lukte niet.", detail: (r.stderr || "").slice(-1200) }, 1);
    stappen.push("eigen browser gedownload");
    if (!(await probeer({}))) meld({ ok: false, fout: "De gedownloade browser start niet." }, 1);
  }
  keuze = { channel: null };
}

const inst = {
  versie: 1,
  node: process.execPath,
  ffmpeg: ffmpegPad,
  browser: keuze,
  platform: `${process.platform}-${process.arch}`,
  ingericht: new Date().toISOString(),
};
fs.writeFileSync(path.join(intern, "instellingen.json"), JSON.stringify(inst, null, 2));
meld({
  ok: true,
  studio,
  node: process.execPath,
  browser: keuze.channel || "eigen Chromium",
  stappen: stappen.length ? stappen : ["alles stond al klaar"],
  merk: fs.existsSync(path.join(studio, "merk", "merk.json")) ? path.join(studio, "merk", "merk.json") : null,
});
