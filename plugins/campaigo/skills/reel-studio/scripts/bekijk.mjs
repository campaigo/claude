/**
 * Opent een Reel in de browser van de klant, met geluid, een tijdbalk en de veilige zone. Blijft draaien:
 * start dit op de achtergrond. Verandert er een bestand van de Reel, dan ververst het voorbeeld vanzelf.
 *   node bekijk.mjs <map van de Reel> [--niet-openen]
 * Schrijft één regel JSON met de link en blijft daarna draaien tot het gestopt wordt.
 */
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { meld, server, vindStudio } from "./gedeeld.mjs";

const args = process.argv.slice(2);
const map = path.resolve(args.find((a) => !a.startsWith("--")) || ".");
if (!fs.existsSync(path.join(map, "reel.html"))) meld({ ok: false, fout: `Geen reel.html in ${map}.` }, 2);
const studio = vindStudio(map);

// een vaste poort als het kan, zodat de link na een herstart dezelfde blijft
let s = null;
for (let poort = 5180; poort < 5200 && !s; poort++) { try { s = await server(map, studio, poort); } catch { /* bezet */ } }
if (!s) s = await server(map, studio, 0);
const link = `${s.url}/reel.html`;
console.log(JSON.stringify({ ok: true, link, map }));

if (!args.includes("--niet-openen")) {
  const [cmd, cmdArgs] = process.platform === "win32" ? ["cmd", ["/c", "start", '""', link]] : process.platform === "darwin" ? ["open", [link]] : ["xdg-open", [link]];
  spawn(cmd, cmdArgs, { detached: true, stdio: "ignore", windowsVerbatimArguments: process.platform === "win32" }).unref();
}
