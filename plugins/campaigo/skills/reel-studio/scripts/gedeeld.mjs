/**
 * Gedeeld door de scripts van de Reel-studio: de studiomap vinden, de onderdelen uit de studio laden
 * (playwright-core en ffmpeg-static staan in <studio>/.studio, niet in de plugin), de lokale server en de browser.
 */
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

export const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MOTOR = path.join(SKILL, "motor");
export const FONTS = path.join(SKILL, "fonts");

export const standaardStudio = () => path.join(os.homedir(), "Campaigo Reels");

/** Antwoord als JSON op stdout (dat leest Claude) en stop. */
export function meld(uitkomst, code = 0) {
  console.log(JSON.stringify(uitkomst, null, 1));
  process.exit(code);
}

export function optie(args, naam, standaard = null) {
  const i = args.indexOf(naam);
  return i < 0 ? standaard : args[i + 1] ?? true;
}

/** Zoekt vanaf een map omhoog naar de studio (een map met .studio/instellingen.json). */
export function vindStudio(vanaf) {
  let d = path.resolve(vanaf || process.cwd());
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(d, ".studio", "instellingen.json"))) return d;
    const omhoog = path.dirname(d);
    if (omhoog === d) break;
    d = omhoog;
  }
  const std = standaardStudio();
  if (fs.existsSync(path.join(std, ".studio", "instellingen.json"))) return std;
  return null;
}

export function instellingen(studio) {
  return JSON.parse(fs.readFileSync(path.join(studio, ".studio", "instellingen.json"), "utf8"));
}

export function vereist(studio, naam) {
  return createRequire(path.join(studio, ".studio", "package.json"))(naam);
}

export function ffmpeg(studio) {
  const inst = instellingen(studio);
  return inst.ffmpeg || vereist(studio, "ffmpeg-static");
}

/** Start de browser die bij het inrichten gekozen is. */
export async function browser(studio) {
  const inst = instellingen(studio);
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(studio, ".studio", "browsers");
  const { chromium } = vereist(studio, "playwright-core");
  // eerst alles tekenen, dan pas een beeld opleveren: anders ontbreken na een grote sprong stukken (gloed, woorden)
  const args = ["--force-device-scale-factor=1", "--hide-scrollbars", "--disable-lcd-text", "--autoplay-policy=no-user-gesture-required",
    "--run-all-compositor-stages-before-draw", "--disable-checker-imaging", "--disable-threaded-animation", "--disable-threaded-scrolling"];
  return chromium.launch({ ...(inst.browser?.channel ? { channel: inst.browser.channel } : {}), args });
}

const SOORTEN = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
  ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2",
  ".mp4": "video/mp4", ".mov": "video/quicktime", ".m4v": "video/mp4", ".webm": "video/webm", ".wav": "audio/wav", ".mp3": "audio/mpeg",
};

/** Laatste wijziging van de bestanden van de Reel (zonder export), voor het vanzelf verversen. */
function versie(mappen) {
  let hoogste = 0, aantal = 0;
  const loop = (d, diepte) => {
    if (!fs.existsSync(d) || diepte > 3) return;
    for (const n of fs.readdirSync(d, { withFileTypes: true })) {
      if (n.name === "export" || n.name === "node_modules" || n.name.startsWith(".")) continue;
      const p = path.join(d, n.name);
      if (n.isDirectory()) loop(p, diepte + 1);
      else { aantal++; hoogste = Math.max(hoogste, fs.statSync(p).mtimeMs); }
    }
  };
  for (const m of mappen) loop(m, 0);
  return `${Math.round(hoogste)}-${aantal}`;
}

/**
 * Lokale server: /motor, /fonts en /voorbeelden uit de skill, /merk uit de studio (logo, lettertypen, merk.json, beweging.js),
 * de rest uit de map van de Reel. Ondersteunt Range, zodat video's in het voorbeeld kunnen springen.
 */
export async function server(reelMap, studio, poort = 0) {
  const wortels = [["/motor/", MOTOR], ["/fonts/", FONTS], ["/voorbeelden/", path.join(SKILL, "voorbeelden")], ["/merk/", studio ? path.join(studio, "merk") : null], ["/", reelMap]];
  const srv = http.createServer((req, res) => {
    let pad;
    try { pad = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400).end(); return; }
    if (pad === "/__versie") {
      res.writeHead(200, { "content-type": "text/plain", "cache-control": "no-store" }).end(versie([reelMap, path.join(MOTOR), studio ? path.join(studio, "merk") : null].filter(Boolean)));
      return;
    }
    if (pad === "/favicon.ico") { res.writeHead(204).end(); return; }
    if (pad === "/") pad = "/reel.html";
    for (const [voor, wortel] of wortels) {
      if (!wortel || !pad.startsWith(voor)) continue;
      const bestand = path.resolve(wortel, "." + pad.slice(voor.length - 1));
      if (!bestand.startsWith(path.resolve(wortel))) break;
      // niet hier? dan verder zoeken (bijvoorbeeld een map fonts/ in de Reel zelf)
      if (!fs.existsSync(bestand) || fs.statSync(bestand).isDirectory()) continue;
      const grootte = fs.statSync(bestand).size;
      const kop = { "content-type": SOORTEN[path.extname(bestand).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store", "accept-ranges": "bytes" };
      const bereik = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
      if (bereik) {
        const a = bereik[1] ? +bereik[1] : 0, b = bereik[2] ? +bereik[2] : grootte - 1;
        res.writeHead(206, { ...kop, "content-range": `bytes ${a}-${b}/${grootte}`, "content-length": b - a + 1 });
        fs.createReadStream(bestand, { start: a, end: b }).pipe(res);
      } else {
        res.writeHead(200, { ...kop, "content-length": grootte });
        fs.createReadStream(bestand).pipe(res);
      }
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise((ok, fout) => { srv.once("error", fout); srv.listen(poort, "127.0.0.1", ok); });
  return { srv, url: `http://127.0.0.1:${srv.address().port}` };
}
