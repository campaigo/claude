/**
 * De controlepagina: de ondernemer kijkt de montage na in zijn eigen browser, op zijn eigen computer. Niets gaat naar
 * buiten. Elke keuze wordt meteen in keuzes.json bewaard.
 *   node beoordelen.mjs <map van de Reel> [--niet-openen]
 * Start op de achtergrond. Schrijft één regel JSON met de link en blijft draaien tot hij gestopt wordt.
 * Verandert keuzes.json terwijl de pagina open staat (Claude past het voorstel aan), dan ververst de pagina vanzelf.
 */
import fs from "fs";
import http from "http";
import path from "path";
import { spawn } from "child_process";
import { PAGINA, SKILL, meld, vindStudio } from "./gemeen.mjs";

const args = process.argv.slice(2);
const map = path.resolve(args.find((a) => !a.startsWith("--")) || ".");
const keuzesPad = path.join(map, "keuzes.json");
if (!fs.existsSync(keuzesPad)) meld({ ok: false, fout: "Geen keuzes.json in deze map. Draai eerst voorbereiden.mjs." }, 2);
const studio = vindStudio(map);

const SOORTEN = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png", ".mp4": "video/mp4", ".wav": "audio/wav",
  ".ttf": "font/ttf", ".otf": "font/otf", ".woff": "font/woff", ".woff2": "font/woff2",
};
// wat de pagina mag lezen: de pagina zelf, de gedeelde knip-logica, het merk en de lichte bestanden van de Reel
const routes = [
  ["/pagina/", PAGINA],
  ["/knippen.mjs", path.join(SKILL, "scripts", "knippen.mjs")],
  ["/merk/", studio ? path.join(studio, "merk") : null],
  ["/montage/", path.join(map, "montage")],
];
const versie = () => String(Math.round(fs.statSync(keuzesPad).mtimeMs));

function stuurBestand(req, res, bestand) {
  if (!fs.existsSync(bestand) || fs.statSync(bestand).isDirectory()) { res.writeHead(404).end(); return; }
  const grootte = fs.statSync(bestand).size;
  const kop = { "content-type": SOORTEN[path.extname(bestand).toLowerCase()] ?? "application/octet-stream", "cache-control": "no-store", "accept-ranges": "bytes" };
  const bereik = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
  if (bereik) {
    const a = bereik[1] ? +bereik[1] : 0, b = bereik[2] ? Math.min(+bereik[2], grootte - 1) : grootte - 1;
    res.writeHead(206, { ...kop, "content-range": `bytes ${a}-${b}/${grootte}`, "content-length": b - a + 1 });
    fs.createReadStream(bestand, { start: a, end: b }).pipe(res);
  } else {
    res.writeHead(200, { ...kop, "content-length": grootte });
    fs.createReadStream(bestand).pipe(res);
  }
}

function leesBody(req) {
  return new Promise((ok, fout) => {
    let n = 0;
    const delen = [];
    req.on("data", (d) => { n += d.length; if (n > 8 * 1024 * 1024) { fout(new Error("te groot")); req.destroy(); } else delen.push(d); });
    req.on("end", () => ok(Buffer.concat(delen).toString("utf8")));
    req.on("error", fout);
  });
}

function schrijfKeuzes(k) {
  const tmp = `${keuzesPad}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(k, null, 1));
  fs.renameSync(tmp, keuzesPad);
}

const srv = http.createServer(async (req, res) => {
  let pad;
  try { pad = decodeURIComponent(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400).end(); return; }
  const json = (code, d) => res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }).end(JSON.stringify(d));
  try {
    if (pad === "/" || pad === "/index.html") return stuurBestand(req, res, path.join(PAGINA, "controle.html"));
    if (pad === "/keuzes" && req.method === "GET") return json(200, { versie: versie(), keuzes: JSON.parse(fs.readFileSync(keuzesPad, "utf8")) });
    if (pad === "/versie") return json(200, { versie: versie() });
    if (pad === "/keuzes" && req.method === "POST") {
      const k = JSON.parse(await leesBody(req));
      if (!Array.isArray(k.units) || typeof k.bron !== "string") return json(400, { fout: "Ongeldige keuzes." });
      k.bijgewerkt = new Date().toISOString();
      schrijfKeuzes(k);
      return json(200, { versie: versie(), bijgewerkt: k.bijgewerkt });
    }
    if (pad === "/favicon.ico") { res.writeHead(204).end(); return; }
    for (const [voor, wortel] of routes) {
      if (!wortel) continue;
      if (voor.endsWith("/") ? pad.startsWith(voor) : pad === voor) {
        const bestand = voor.endsWith("/") ? path.resolve(wortel, "." + pad.slice(voor.length - 1)) : wortel;
        if (voor.endsWith("/") && !bestand.startsWith(path.resolve(wortel) + path.sep)) break;
        return stuurBestand(req, res, bestand);
      }
    }
    res.writeHead(404).end();
  } catch (e) {
    json(500, { fout: e.message });
  }
});

// een vaste poort als het kan, zodat de link na een herstart dezelfde blijft
let poort = null;
for (let p = 5220; p < 5240 && !poort; p++) {
  try { await new Promise((ok, fout) => { srv.once("error", fout); srv.listen(p, "127.0.0.1", ok); }); poort = p; } catch { /* bezet */ }
}
if (!poort) meld({ ok: false, fout: "Geen vrije poort gevonden voor de controlepagina." }, 3);
const link = `http://127.0.0.1:${poort}/`;
console.log(JSON.stringify({ ok: true, link, map }));
if (!args.includes("--niet-openen")) {
  const [cmd, cmdArgs] = process.platform === "win32" ? ["cmd", ["/c", "start", '""', link]] : process.platform === "darwin" ? ["open", [link]] : ["xdg-open", [link]];
  try { spawn(cmd, cmdArgs, { detached: true, stdio: "ignore", windowsVerbatimArguments: process.platform === "win32" }).on("error", () => {}).unref(); } catch { /* geen browser te openen */ }
}
