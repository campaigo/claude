/**
 * Maakt van een Reel (<map>/reel.html) een MP4 voor Instagram, op de computer van de klant.
 *   node render.mjs <map van de Reel>                 export/reel.mp4, export/omslag.jpg, export/stills/*.jpg, export/controle.json
 *   node render.mjs <map> --controle                  alleen de stilstaande beelden (snel nakijken, geen video)
 *   node render.mjs <map> --controle 1,4.5,9          beelden op die seconden
 *   node render.mjs <map> --snel                      sneller, zonder bewegingsonscherpte (om te proberen)
 *   --werkers 4                                       aantal browsertabbladen tegelijk (standaard 4)
 * Uitkomst als JSON op stdout: ok, de paden, de duur, en "fouten" (eisen van Meta) en "waarschuwingen"
 * (tekst buiten de veilige zone, meldingen van de Reel).
 *
 * Werkwijze: elk beeld wordt in de browser neergezet (window.__seek) en gefotografeerd. Bewegingsonscherpte:
 * per beeld sub opnames binnen een halve beeldduur (sluiter van 180 graden), ffmpeg middelt ze. Beelden die
 * niet bewegen (window.__MOVING__) worden één keer gefotografeerd en daarna gekoppeld in plaats van gekopieerd.
 */
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { pathToFileURL } from "url";
import { MOTOR, browser, ffmpeg, meld, optie, server, vindStudio } from "./gedeeld.mjs";

const args = process.argv.slice(2);
const map = path.resolve(args.find((a) => !a.startsWith("--") && !/^[\d.,]+$/.test(a)) || ".");
if (!fs.existsSync(path.join(map, "reel.html"))) meld({ ok: false, fout: `Geen reel.html in ${map}.` }, 2);
const studio = vindStudio(map);
if (!studio) meld({ ok: false, fout: "De studio is nog niet ingericht. Draai eerst inrichten." }, 2);
const controle = optie(args, "--controle");
const snel = args.includes("--snel");
const WERKERS = Math.max(1, +(optie(args, "--werkers") || 4));
const FPS = 30;
const EXPORT = path.join(map, "export");
fs.rmSync(path.join(EXPORT, "stills"), { recursive: true, force: true });   // geen oude beelden tussen de nieuwe
fs.mkdirSync(path.join(EXPORT, "stills"), { recursive: true });
const ff = ffmpeg(studio);
const begin = Date.now();

const { srv, url } = await server(map, studio);
const b = await browser(studio);
const fouten = [], waarschuwingen = [];

async function open() {
  const page = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const pagFouten = [];
  page.on("pageerror", (e) => pagFouten.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) pagFouten.push(m.text()); });
  page.on("response", (r) => { if (r.status() >= 400) pagFouten.push(`${r.status()} bij ${decodeURIComponent(new URL(r.url()).pathname)} (bestand ontbreekt of de naam klopt niet)`); });
  await page.goto(`${url}/reel.html?render`);
  try {
    await page.waitForFunction(() => window.__READY__ === true || window.__FOUT__, null, { timeout: 60000 });
  } catch {
    throw new Error(`De Reel wordt niet klaar. ${pagFouten.join(" | ")}`.trim());
  }
  const fout = await page.evaluate(() => window.__FOUT__ || null);
  if (fout || pagFouten.length) throw new Error([fout, ...pagFouten].filter(Boolean).join(" | "));
  const cdp = await page.context().newCDPSession(page);
  const foto = async (t, kwaliteit = 94) => {
    await page.evaluate((t) => window.__seek(t), t);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: kwaliteit, optimizeForSpeed: true });
    return Buffer.from(data, "base64");
  };
  // opwarmen: Chrome bouwt zijn lagen (zeker in 3D) pas bij het eerste gebruik; de eerste opnames gooien we weg
  const T = await page.evaluate(() => window.__T__);
  for (let i = 0; i <= 8; i++) await foto((T * i) / 8, 30);
  return { page, foto };
}

async function stop(uitkomst, code) {
  await b.close().catch(() => {});
  srv.close();
  meld(uitkomst, code);
}

let eerste;
try { eerste = await open(); } catch (e) { await stop({ ok: false, fout: "De Reel geeft een fout in de browser.", detail: e.message }, 3); }
const info = await eerste.page.evaluate(() => ({
  T: window.__T__, muziek: window.__MUZIEK__, omslag: window.__OMSLAG__, momenten: window.__MOMENTEN__,
  sub: window.__SUB__ || 1, beweegtGezet: typeof window.__MOVING__ === "function", clips: window.__CLIPS__ || [], meldingen: window.__MELDINGEN__ || [],
}));
waarschuwingen.push(...info.meldingen);
if (!(info.T >= 3)) await stop({ ok: false, fout: `De Reel duurt ${info.T} s; Instagram wil minstens 3 seconden.` }, 2);
if (info.T > 90) waarschuwingen.push(`De Reel duurt ${info.T.toFixed(1)} s. Reels tot 90 seconden werken het best.`);

// ---------- videofragmenten: eerst losse beelden ----------
for (const c of info.clips) {
  const bron = path.resolve(map, c.bron);
  if (!fs.existsSync(bron)) await stop({ ok: false, fout: `Video ${c.bron} niet gevonden.` }, 2);
  const dir = path.join(EXPORT, "frames", c.naam);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const snelheid = c.snelheid || 1;
  const r = spawnSync(ff, ["-hide_banner", "-loglevel", "error", "-ss", String(c.start || 0), "-t", String(c.duur + 0.2), "-i", bron,
    "-vf", `setpts=PTS/${snelheid},fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920`, "-q:v", "3", path.join(dir, "%04d.jpg")], { encoding: "utf8" });
  if (r.status !== 0) await stop({ ok: false, fout: `Video ${c.bron} kan niet gelezen worden.`, detail: (r.stderr || "").slice(-500) }, 2);
}

// ---------- veilige zone ----------
async function veiligOp(page, t) {
  await page.evaluate((t) => window.__seek(t), t);
  return page.evaluate(() => window.__VEILIG__());
}
const gezien = new Set();
async function noteerVeilig(page, t) {
  for (const v of await veiligOp(page, t)) {
    const sleutel = v.tekst;
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    waarschuwingen.push(`Tekst buiten de veilige zone op ${t.toFixed(1)} s: "${v.tekst}" (${v.buiten}).`);
  }
}

// ---------- stilstaande beelden ----------
const stills = [];
// altijd het allereerste beeld erbij: daar begint de Reel als hij in de feed vanzelf afspeelt
const momenten = [{ naam: "eerste-beeld", t: 0 }, ...(controle && controle !== true ? String(controle).split(/[,\s]+/).filter(Boolean).map((s) => ({ naam: `t${s}`, t: +s })) : info.momenten)];
await eerste.page.evaluate(() => window.__seek(0));
const eersteBeeld = await eerste.page.evaluate(() => (window.__TEKSTNU__ ? window.__TEKSTNU__() : ""));
if (!eersteBeeld) waarschuwingen.push("Op het eerste beeld staat geen leesbare tekst. Daar begint de Reel in de feed: laat de haak er vanaf het begin staan.");
for (const [i, m] of momenten.entries()) {
  const f = path.join(EXPORT, "stills", `${String(i + 1).padStart(2, "0")}-${m.naam}.jpg`);
  const t = Math.min(m.t, info.T - 0.04);
  const beeld = await eerste.foto(t, 86);
  fs.writeFileSync(f, beeld);
  await noteerVeilig(eerste.page, t);
  stills.push(f);
  // elk beeld moet alleen uit de tijd volgen: na een sprong naar het eind en naar het begin hetzelfde beeld
  // (Chrome rastert na een grote schaalsprong soms een paar pixels anders; pas onder 40 dB is het echt te zien)
  for (const via of [info.T - 0.04, 0]) {
    await eerste.page.evaluate((v) => window.__seek(v), via);
    const opnieuw = await eerste.foto(t, 86);
    if (!beeld.equals(opnieuw) && psnr(beeld, opnieuw) < 40) {
      waarschuwingen.push(`Het beeld op ${t.toFixed(1)} s ziet er anders uit na een sprong naar ${via ? "het eind" : "het begin"}: de Reel onthoudt iets tussen beelden. Zet in elke frame-functie alles opnieuw neer vanuit de tijd.`);
      break;
    }
  }
}
fs.writeFileSync(path.join(EXPORT, "omslag.jpg"), await eerste.foto(info.omslag, 92));
// voor Campaigo (post_klaarzetten, omslag_ms): het beeld dat in het profiel en bij Reels staat
const omslag_ms = Math.round(Math.min(info.omslag, info.T - 0.04) * 1000);

if (controle) {
  await stop({ ok: true, alleenControle: true, seconden: +info.T.toFixed(2), eersteBeeld, stills, omslag: path.join(EXPORT, "omslag.jpg"), omslag_ms, waarschuwingen }, 0);
} else {
  // ---------- geluid ----------
  await import(pathToFileURL(path.join(MOTOR, "geluid.js")).href);
  const wav = path.join(EXPORT, "geluid.wav");
  fs.writeFileSync(wav, globalThis.ReelGeluid.wav(globalThis.ReelGeluid.maak(info.muziek)));

  // ---------- beelden ----------
  const S = snel ? 1 : Math.max(1, info.sub);
  const n = Math.round(info.T * FPS);
  const dir = path.join(EXPORT, "frames", "_reel");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const naam = (k) => path.join(dir, `${String(k).padStart(6, "0")}.jpg`);
  let gedaan = 0, opnames = 0;
  const werkers = [eerste];
  try { for (let i = 1; i < WERKERS; i++) werkers.push(await open()); } catch (e) { await stop({ ok: false, fout: "Een extra tabblad openen lukte niet.", detail: e.message }, 3); }
  const stuk = Math.ceil(n / werkers.length);
  try {
    await Promise.all(werkers.map(async (w, wi) => {
      for (let i = wi * stuk; i < Math.min(n, (wi + 1) * stuk); i++) {
        const t = i / FPS;
        const beweegt = S > 1 && (!info.beweegtGezet || (await w.page.evaluate((t) => window.__MOVING__(t), t)));
        if (beweegt) {
          for (let j = 0; j < S; j++) { fs.writeFileSync(naam(i * S + j), await w.foto(t + (j * 0.5) / (S * FPS))); opnames++; }
        } else {
          const eersteBeeld = naam(i * S);
          fs.writeFileSync(eersteBeeld, await w.foto(t));
          opnames++;
          for (let j = 1; j < S; j++) { try { fs.linkSync(eersteBeeld, naam(i * S + j)); } catch { fs.copyFileSync(eersteBeeld, naam(i * S + j)); } }
          if (i % 12 === 0) await noteerVeilig(w.page, t);
        }
        gedaan++;
      }
    }));
  } catch (e) { await stop({ ok: false, fout: "Fotograferen van de beelden ging mis.", detail: e.message }, 3); }

  // ---------- video ----------
  const mp4 = path.join(EXPORT, "reel.mp4");
  const filter = S > 1 ? `[0:v]tmix=frames=${S},select='eq(mod(n\\,${S})\\,${S - 1})',setpts=N/(${FPS}*TB),format=yuv420p[v]` : "[0:v]format=yuv420p[v]";
  const f = spawnSync(ff, [
    "-hide_banner", "-loglevel", "error", "-y",
    "-framerate", String(FPS * S), "-i", path.join(dir, "%06d.jpg"), "-i", wav,
    "-filter_complex", filter, "-map", "[v]", "-map", "1:a", "-r", String(FPS),
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-profile:v", "high", "-g", String(FPS * 2), "-flags", "+cgop",
    "-maxrate", "16M", "-bufsize", "32M",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2", "-t", info.T.toFixed(3),
    "-movflags", "+faststart", "-use_editlist", "0", "-avoid_negative_ts", "disabled", "-f", "mp4", mp4,
  ], { encoding: "utf8" });
  if (f.status !== 0) await stop({ ok: false, fout: "ffmpeg kon de video niet maken.", detail: (f.stderr || "").slice(-800) }, 3);
  fs.rmSync(path.join(EXPORT, "frames"), { recursive: true, force: true });

  // ---------- controle tegen de eisen van Meta ----------
  const samenvatting = controleer(mp4, info.T);
  fs.writeFileSync(path.join(EXPORT, "controle.json"), JSON.stringify({ ...samenvatting, fouten, waarschuwingen }, null, 2));
  await stop({
    ok: fouten.length === 0,
    mp4, omslag: path.join(EXPORT, "omslag.jpg"), omslag_ms, eersteBeeld, stills,
    seconden: samenvatting.seconden, mb: samenvatting.mb,
    opnames, rendertijd: `${Math.round((Date.now() - begin) / 1000)} s`,
    fouten, waarschuwingen,
  }, fouten.length ? 4 : 0);
}

// verschil tussen twee beelden in dB (hoger is gelijker; boven 45 dB zie je geen verschil)
function psnr(a, b) {
  const pa = path.join(EXPORT, "stills", ".a.jpg"), pb = path.join(EXPORT, "stills", ".b.jpg");
  fs.writeFileSync(pa, a);
  fs.writeFileSync(pb, b);
  const r = spawnSync(ff, ["-hide_banner", "-i", pa, "-i", pb, "-lavfi", "psnr", "-f", "null", "-"], { encoding: "utf8" });
  fs.rmSync(pa, { force: true });
  fs.rmSync(pb, { force: true });
  const m = /average:(\S+)/.exec(r.stderr || "");
  return m ? (m[1] === "inf" ? 99 : +m[1]) : 0;
}

// MP4-boxen lezen: moov voor mdat (snel starten), geen edit list (Meta wil die niet)
function controleer(pad, verwacht) {
  const data = fs.readFileSync(pad);
  const boven = [];
  for (let i = 0; i + 8 <= data.length;) {
    let g = data.readUInt32BE(i);
    const soort = data.toString("latin1", i + 4, i + 8);
    if (g === 1) g = Number(data.readBigUInt64BE(i + 8));
    else if (g === 0) g = data.length - i;
    if (g < 8) break;
    boven.push({ soort, i, g });
    i += g;
  }
  const namen = boven.map((x) => x.soort);
  const moovVoor = namen.includes("moov") && namen.includes("mdat") && namen.indexOf("moov") < namen.indexOf("mdat");
  if (!moovVoor) fouten.push("moov staat niet vooraan in het bestand");
  const binnen = [];
  const loop = (a, e) => {
    for (let i = a; i + 8 <= e;) {
      const g = data.readUInt32BE(i), s = data.toString("latin1", i + 4, i + 8);
      if (g < 8 || i + g > e) return;
      binnen.push(s);
      if (["moov", "trak", "mdia", "minf", "stbl"].includes(s)) loop(i + 8, i + g);
      i += g;
    }
  };
  const moov = boven.find((x) => x.soort === "moov");
  if (moov) loop(moov.i + 8, moov.i + moov.g);
  if (binnen.includes("edts")) fouten.push("bestand bevat een edit list (Meta wil die niet)");
  const r = spawnSync(ff, ["-hide_banner", "-i", pad], { encoding: "utf8" });
  const tekst = r.stderr || "";
  const video = /Video: (\w+).*?, (yuv\w+)\(?[^,)]*\)?.*?(\d{3,5})x(\d{3,5})/.exec(tekst);
  const fps = /([\d.]+) fps/.exec(tekst);
  const audio = /Audio: (\w+).*?(\d+) Hz, (\w+)/.exec(tekst);
  const duur = /Duration: (\d+):(\d+):([\d.]+)/.exec(tekst);
  if (!video) fouten.push("geen videospoor gevonden");
  else {
    if (video[1] !== "h264") fouten.push(`codec is ${video[1]}, niet h264`);
    if (video[2] !== "yuv420p") fouten.push(`beeldopslag is ${video[2]}, niet yuv420p`);
    if (`${video[3]}x${video[4]}` !== "1080x1920") fouten.push(`formaat is ${video[3]}x${video[4]}, niet 1080x1920`);
  }
  if (!fps || Math.abs(+fps[1] - FPS) > 0.01) fouten.push("beeldsnelheid is niet 30 fps");
  if (!audio || audio[1] !== "aac") fouten.push("geen AAC-geluidsspoor");
  let seconden = null;
  if (duur) {
    seconden = +duur[1] * 3600 + +duur[2] * 60 + +duur[3];
    if (Math.abs(seconden - verwacht) > 0.15) fouten.push(`duur is ${seconden.toFixed(2)} s, verwacht ${verwacht.toFixed(2)} s`);
  }
  const mb = +(fs.statSync(pad).size / 1e6).toFixed(1);
  if (mb > 300) fouten.push(`bestand is ${mb} MB; Campaigo neemt tot 300 MB`);
  return { codec: video?.[1], formaat: video ? `${video[3]}x${video[4]}` : null, fps: fps ? +fps[1] : null, geluid: audio ? `${audio[1]} ${audio[2]} Hz ${audio[3]}` : null, seconden, mb, moovVooraan: moovVoor, editList: binnen.includes("edts") };
}
