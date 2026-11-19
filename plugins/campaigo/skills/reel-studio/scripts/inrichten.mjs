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
import { tt } from "./taal.mjs";

const VERSIES = { "playwright-core": "1.56.1", "ffmpeg-static": "5.2.0" };
const args = process.argv.slice(2);
const studio = path.resolve(optie(args, "--studio") || standaardStudio());
const intern = path.join(studio, ".studio");
const stappen = [];

const [hoofd] = process.versions.node.split(".").map(Number);
if (hoofd < 18) meld({ ok: false, fout: tt(`Node ${process.versions.node} is te oud; nodig is 18 of nieuwer. Draai inrichten.ps1 of inrichten.sh, die zet een eigen Node klaar.`, `Node ${process.versions.node} is too old; version 18 or newer is needed. Run inrichten.ps1 or inrichten.sh, which sets up its own Node.`) }, 1);

fs.mkdirSync(path.join(studio, "merk", "fonts"), { recursive: true });
fs.mkdirSync(intern, { recursive: true });
const leesmij = path.join(studio, "LEESMIJ.txt");
if (!fs.existsSync(leesmij)) {
  fs.writeFileSync(leesmij, [
    "Campaigo Reels",
    "",
    tt("In deze map maakt Claude je bewegende Reels. Elke Reel heeft een eigen map; de video staat daarin in export/reel.mp4.", "In this folder Claude makes your animated Reels. Each Reel has its own folder, and the video is inside it at export/reel.mp4."),
    tt("In merk/ staan je kleuren, logo en lettertype, die gebruikt Claude voor elke Reel.", "merk/ holds your colours, logo and font. Claude uses them for every Reel."),
    tt("De map .studio bevat de onderdelen om video's te maken. Die kun je laten staan.", "The .studio folder holds the parts for making the videos. You can leave it be."),
    tt("Weggooien kan altijd: je Reels in Campaigo blijven gewoon bestaan.", "You can delete it at any time. Your Reels stay in Campaigo."),
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
  if (r.status !== 0) meld({ ok: false, fout: tt("Installeren van de onderdelen lukte niet.", "Installing the parts didn't work."), detail: (r.stderr || String(r.error || "")).slice(-1500) }, 1);
  stappen.push(tt("onderdelen geïnstalleerd", "parts installed"));
}

// ---------- ffmpeg ----------
let ffmpegPad;
try { ffmpegPad = vereist(studio, "ffmpeg-static"); } catch (e) { meld({ ok: false, fout: tt("ffmpeg-static ontbreekt.", "ffmpeg-static is missing."), detail: e.message }, 1); }
if (!ffmpegPad || !fs.existsSync(ffmpegPad)) meld({ ok: false, fout: tt("ffmpeg is niet gedownload. Waarschijnlijk blokkeerde het netwerk of een virusscanner de download van GitHub. Draai dit script nog eens.", "ffmpeg wasn't downloaded. A network or virus scanner probably blocked the download from GitHub. Run this script again.") }, 1);
const enc = spawnSync(ffmpegPad, ["-hide_banner", "-encoders"], { encoding: "utf8" });
if (enc.status !== 0 || !/libx264/.test(enc.stdout)) meld({ ok: false, fout: tt("ffmpeg werkt niet of kan geen H.264 maken.", "ffmpeg doesn't work, or can't make H.264."), detail: (enc.stderr || "").slice(-600) }, 1);

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
    if (r.status !== 0) meld({ ok: false, fout: tt("Er staat geen Chrome of Edge op deze computer en een eigen browser downloaden lukte niet.", "Neither Chrome nor Edge is installed on this computer, and downloading a browser of its own didn't work."), detail: (r.stderr || "").slice(-1200) }, 1);
    stappen.push(tt("eigen browser gedownload", "own browser downloaded"));
    if (!(await probeer({}))) meld({ ok: false, fout: tt("De gedownloade browser start niet.", "The downloaded browser won't start.") }, 1);
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
  browser: keuze.channel || tt("eigen Chromium", "own Chromium"),
  stappen: stappen.length ? stappen : [tt("alles stond al klaar", "everything was already in place")],
  merk: fs.existsSync(path.join(studio, "merk", "merk.json")) ? path.join(studio, "merk", "merk.json") : null,
});
