/**
 * Zet een video of foto in Campaigo via een uploadlink (die geeft de tool "uploadlink" van Campaigo).
 *   node upload.mjs <bestand> <uploadlink>
 * Tot 10 MB in één keer, grotere bestanden in stukken van 10 MB (zoals de uploadpagina doet).
 * Uitkomst als JSON op stdout: { ok, id, mime, grootte } of { ok: false, fout }.
 */
import fs from "fs";
import { meld } from "./gedeeld.mjs";
import { tt } from "./taal.mjs";

const [bestand, link] = process.argv.slice(2);
if (!bestand || !link) meld({ ok: false, fout: tt("Gebruik: node upload.mjs <bestand> <uploadlink>", "Usage: node upload.mjs <file> <uploadlink>") }, 2);
if (!fs.existsSync(bestand)) meld({ ok: false, fout: tt(`Bestand ${bestand} niet gevonden.`, `File ${bestand} not found.`) }, 2);
let basis;
try { basis = new URL(link); } catch { meld({ ok: false, fout: tt("Dit is geen geldige uploadlink.", "This isn't a valid upload link.") }, 2); }
if (!/^\/upload\/\d+\/[^/]+\/[0-9a-f-]{36}\/?$/.test(basis.pathname)) meld({ ok: false, fout: tt("Dit lijkt geen uploadlink van Campaigo. Vraag een nieuwe met de tool uploadlink.", "This doesn't look like a Campaigo upload link. Ask for a new one with the uploadlink tool.") }, 2);
const B = link.replace(/\/$/, "");
const STUK = 10 * 1024 * 1024;
const data = fs.readFileSync(bestand);

async function stuur(methode, pad, body) {
  for (let poging = 1; poging <= 3; poging++) {
    let r;
    try {
      r = await fetch(B + pad, { method: methode, body, headers: { "content-type": "application/octet-stream" } });
    } catch {
      if (poging === 3) return { status: 0, data: { fout: tt("Geen verbinding met Campaigo. Controleer het internet.", "No connection to Campaigo. Check your internet connection.") } };
      await new Promise((ok) => setTimeout(ok, poging * 2000));
      continue;
    }
    const json = await r.json().catch(() => ({}));
    const tijdelijk = r.status >= 500 || r.status === 429 || json.opnieuw === true;
    if (r.ok || !tijdelijk || poging === 3) return { status: r.status, data: json };
    await new Promise((ok) => setTimeout(ok, poging * 2000));
  }
}

if (data.length <= STUK) {
  const r = await stuur("POST", "/klein", data);
  if (r.status >= 200 && r.status < 300 && r.data.ok) meld({ ok: true, id: r.data.id, mime: r.data.mime, grootte: r.data.grootte });
  meld({ ok: false, fout: r.data.fout || tt(`Uploaden lukte niet (status ${r.status}).`, `The upload didn't work (status ${r.status}).`) }, 1);
}

const start = await stuur("POST", `/start?grootte=${data.length}`, data.subarray(0, STUK));
if (!(start.status >= 200 && start.status < 300) || !start.data.upload) meld({ ok: false, fout: start.data.fout || tt(`Beginnen lukte niet (status ${start.status}).`, `Starting the upload didn't work (status ${start.status}).`) }, 1);
const id = start.data.upload;
const aantal = Math.ceil(data.length / STUK);
for (let k = 2; k <= aantal; k++) {
  const r = await stuur("PUT", `/stuk/${id}/${k}`, data.subarray((k - 1) * STUK, k * STUK));
  if (!(r.status >= 200 && r.status < 300)) {
    await stuur("POST", `/stop/${id}`);
    meld({ ok: false, fout: r.data.fout || tt(`Stuk ${k} van ${aantal} lukte niet (status ${r.status}).`, `Part ${k} of ${aantal} didn't work (status ${r.status}).`) }, 1);
  }
}
const klaar = await stuur("POST", `/klaar/${id}`);
if (klaar.status >= 200 && klaar.status < 300 && klaar.data.ok) meld({ ok: true, id: klaar.data.id, mime: klaar.data.mime, grootte: klaar.data.grootte });
meld({ ok: false, fout: klaar.data.fout || tt(`Afronden lukte niet (status ${klaar.status}).`, `Finishing the upload didn't work (status ${klaar.status}).`) }, 1);
