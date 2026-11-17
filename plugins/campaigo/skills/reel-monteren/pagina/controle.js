/*
 * De controlepagina van reel-monteren. Leest en bewaart keuzes.json via beoordelen.mjs en knipt met dezelfde logica
 * als de echte montage (knippen.mjs), zodat wat je hier ziet ook is wat je krijgt.
 */
import { LOOKS, TEMPO, reelTijdlijn, naarReel, tempoVan } from "/knippen.mjs";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const klok = (s) => `${Math.floor(s / 60)}:${(Math.max(0, s) % 60).toFixed(1).padStart(4, "0").replace(".", ",")}`;
const SOORT = { kop: "Kop bovenaan", lijst: "Lijstje", label: "Label", getal: "Getal", foto: "Foto of schermafbeelding", oproep: "Oproep aan het eind", vrij: "Eigen beeld" };
const PLEK = { boven: "boven je hoofd", midden: "in het midden", onder: "onderin" };
const TEMPO_UITLEG = {
  rustig: "Rustig: alleen lange stiltes worden korter. Natuurlijk, met ademruimte.",
  strak: "Strak: elke pauze wordt kort. Zo kijken de meeste Reels.",
  vlot: "Vlot: strak, en ook een tikje sneller afgespeeld.",
};

let k = null, versie = null, lijn = null, stukken = [];
let geschiedenis = [], bewaarTimer = null, wachtend = false;
const v = $("video");

// ---------- laden en bewaren ----------
async function laad() {
  const d = await (await fetch("/keuzes", { cache: "no-store" })).json();
  k = d.keuzes;
  versie = d.versie;
  herbereken();
  tekenAlles();
}
function herbereken() {
  lijn = reelTijdlijn(k);
  stukken = lijn.stukken;
  $("schuif").max = String(lijn.duur);
  $("totaal").textContent = klok(lijn.duur);
  v.playbackRate = tempoVan(k).snelheid;
}
function wijzig(fn) {
  geschiedenis.push(JSON.stringify(k));
  if (geschiedenis.length > 200) geschiedenis.shift();
  $("ongedaan").disabled = false;
  fn();
  k.klaar = false;
  herbereken();
  tekenAlles();
  bewaar();
}
function bewaar() {
  wachtend = true;
  $("bewaard").textContent = "Bewaren...";
  clearTimeout(bewaarTimer);
  bewaarTimer = setTimeout(async () => {
    try {
      const r = await fetch("/keuzes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(k) });
      if (!r.ok) throw new Error();
      versie = (await r.json()).versie;
      $("bewaard").textContent = `Bewaard om ${new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`;
    } catch {
      $("bewaard").textContent = "Niet bewaard. Vraag Claude de controlepagina opnieuw te starten.";
    }
    wachtend = false;
  }, 350);
}
$("ongedaan").addEventListener("click", () => {
  const vorige = geschiedenis.pop();
  if (!vorige) return;
  k = JSON.parse(vorige);
  $("ongedaan").disabled = !geschiedenis.length;
  herbereken();
  tekenAlles();
  bewaar();
});
// past Claude het voorstel aan terwijl de pagina openstaat, dan laten we dat meteen zien
setInterval(async () => {
  if (wachtend) return;
  try {
    const d = await (await fetch("/versie", { cache: "no-store" })).json();
    if (d.versie !== versie && !wachtend) { await laad(); melding("Claude heeft het voorstel bijgewerkt."); }
  } catch { /* programma gestopt */ }
}, 2000);
function melding(t) {
  const m = $("melding");
  m.textContent = t;
  m.hidden = false;
  clearTimeout(melding.timer);
  melding.timer = setTimeout(() => { m.hidden = true; }, 3500);
}

// ---------- afspelen: de ruwe montage ----------
const snel = () => tempoVan(k).snelheid;
const reelTijd = (t) => naarReel(stukken, t, snel());
function bronTijd(r) {
  let acc = 0;
  const x = r * snel();
  for (const [a, b] of stukken) { if (x <= acc + (b - a)) return a + (x - acc); acc += b - a; }
  return stukken.length ? stukken[stukken.length - 1][1] : 0;
}
let speelt = false, laatsteReel = 0;
function speel(aan) {
  speelt = aan;
  $("speel").textContent = aan ? "Pauze" : "Speel de montage";
  $("grootspeel").classList.toggle("weg", aan);
  if (aan) {
    if (reelTijd(v.currentTime) === null || laatsteReel >= lijn.duur - 0.05) v.currentTime = bronTijd(laatsteReel >= lijn.duur - 0.05 ? 0 : laatsteReel);
    v.play().catch(() => {});
  } else v.pause();
}
function springNaar(r) { laatsteReel = Math.max(0, Math.min(lijn.duur, r)); v.currentTime = bronTijd(laatsteReel); }
$("speel").addEventListener("click", () => speel(!speelt));
$("grootspeel").addEventListener("click", () => speel(true));
$("telefoon").addEventListener("click", (e) => { if (e.target === v) speel(!speelt); });
$("terug").addEventListener("click", () => springNaar(laatsteReel - 5));
$("vooruit").addEventListener("click", () => springNaar(laatsteReel + 5));
$("schuif").addEventListener("input", (e) => springNaar(+e.target.value));
addEventListener("keydown", (e) => { if (e.code === "Space" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); speel(!speelt); } });

let huidigeUnit = null;
function lus() {
  if (k && stukken.length) {
    const t = v.currentTime;
    if (speelt) {
      // in een stuk dat eruit gaat? dan door naar het volgende bewaarde stuk
      if (!stukken.some(([a, b]) => t >= a - 0.02 && t < b)) {
        const volgende = stukken.find(([a]) => a > t);
        if (volgende) v.currentTime = volgende[0];
        else { speel(false); laatsteReel = lijn.duur; }
      }
    }
    const r = reelTijd(v.currentTime);
    if (r !== null) laatsteReel = r;
    $("schuif").value = String(laatsteReel);
    $("tijd").textContent = klok(laatsteReel);
    tekenOverlay(laatsteReel);
    // het woord dat nu klinkt oplichten in de tekst
    const u = k.units.find((x) => t >= x.van && t < x.tot);
    if (u?.i !== huidigeUnit) {
      document.querySelectorAll(".w.nu").forEach((el) => el.classList.remove("nu"));
      if (u) document.querySelector(`#tekst .w[data-i="${u.i}"]`)?.classList.add("nu");
      huidigeUnit = u?.i;
    }
  }
  requestAnimationFrame(lus);
}

function tekenOverlay(rt) {
  const st = k.ondertitels?.stijl || "zin", klein = k.ondertitels?.hoofdletters === "klein";
  const o = $("ondertitel");
  o.className = `ondertitel ${st}`;
  o.style.top = `${((k.ondertitels?.y ?? 1240) / 1920) * 100}%`;
  o.style.transform = "translateY(-50%)";
  const tk = (w) => esc(klein ? w.tekst.toLocaleLowerCase("nl") : w.tekst);
  let html = "";
  if (st === "woord") {
    const w = lijn.woorden.find((x, n) => rt >= x.van && rt < Math.min(lijn.woorden[n + 1]?.van ?? x.tot + 0.4, x.tot + 0.6));
    if (w) html = `<span class="${w.nadruk ? "nadruk" : ""}">${tk(w)}</span>`;
  } else {
    const r = lijn.regels.find((x) => rt >= x.van && rt < x.tot);
    if (r) {
      const ws = r.w.map((n) => lijn.woorden[n]).map((w) => `<span class="${w.nadruk ? "nadruk" : ""} ${st === "zin" && rt < w.van - 0.03 ? "straks" : ""}">${tk(w)}</span>`).join(" ");
      html = st === "blok" ? `<span class="blok">${ws}</span>` : ws;
    }
  }
  if (o.innerHTML !== html) o.innerHTML = html;
  const kh = lijn.kaarten.filter((x) => rt >= x.van && rt < x.van + (x.duur || 2.5))
    .map((x) => `<div class="kaart-vak ${esc(x.plek || "boven")}"><small>${esc(SOORT[x.soort] || x.soort)}</small>${esc(x.tekst).replace(/ \/ /g, "<br>")}</div>`).join("");
  if ($("kaartenLaag").innerHTML !== kh) $("kaartenLaag").innerHTML = kh;
}

// ---------- tabbladen ----------
document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".tabs button").forEach((x) => x.classList.toggle("aan", x === b));
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("aan", x.id === `tab-${b.dataset.tab}`));
  if (b.dataset.tab === "kaarten") tekenKaartbeelden();
}));

function zinnen() {
  const uit = [];
  let z = [];
  k.units.forEach((u, n) => {
    z.push(u);
    const volgende = k.units[n + 1];
    if (/[.!?]$/.test(u.tekst) || !volgende || volgende.van - u.tot > 1.0) { uit.push(z); z = []; }
  });
  return uit;
}

function tekenAlles() {
  tekenKnippen();
  tekenOndertitels();
  tekenKaarten();
  tekenLooks();
  $("notities").value = k.notities || "";
  $("klaarTekst").innerHTML = k.klaar ? "Top! Zeg nu in het gesprek met Claude: <b>klaar</b>. Dan maakt Claude je Reel." : "";
}

// ---------- knippen ----------
function tekenKnippen() {
  const weg = k.units.filter((u) => u.weg && u.soort === "woord").length;
  const ehs = k.units.filter((u) => u.weg && u.soort !== "woord").length;
  const ingekort = k.pauzes.filter((p) => p.inkorten).length;
  const delen = [`${weg} ${weg === 1 ? "woord" : "woorden"} eruit`];
  if (ehs) delen.push(`${ehs} keer eh`);
  if (ingekort) delen.push(`${ingekort} ${ingekort === 1 ? "pauze" : "pauzes"} korter`);
  $("samenvatting").innerHTML = `Je opname duurt ${klok(k.duur)}. De Reel wordt <b>${klok(lijn.duur)}</b>. <span style="color:var(--zacht)">${delen.join(", ")}.</span>`;
  document.querySelectorAll('input[name=tempo]').forEach((r) => { r.checked = r.value === (k.tempo || "rustig"); });
  $("tempoUitleg").textContent = TEMPO_UITLEG[k.tempo || "rustig"];
  const pauzeTussen = (a, b) => k.pauzes.findIndex((p) => p.van >= a.tot - 0.08 && p.tot <= b.van + 0.08);
  $("tekst").innerHTML = zinnen().map((z) => {
    const delen = [`<button class="speelzin" data-van="${z[0].i}" title="Kijk vanaf hier">▶</button>`];
    z.forEach((u, n) => {
      const cls = ["w", u.weg ? "weg" : "", u.soort === "eh" ? "eh" : "", u.soort === "geluid" ? "klank" : ""].join(" ");
      const tekst = u.soort === "geluid" ? "(klank)" : esc(u.ondertitel ?? u.tekst);
      delen.push(`<span class="${cls}" data-i="${u.i}" title="${u.soort === "geluid" ? "Hier klinkt iets zonder woord, vaak een eh. Tik om het eruit te halen." : ""}">${tekst}</span>`);
      const volgende = z[n + 1];
      if (volgende) {
        const p = pauzeTussen(u, volgende);
        if (p >= 0) delen.push(`<span class="pauze ${k.pauzes[p].inkorten ? "in" : ""}" data-p="${p}" title="Tik om deze stilte ${k.pauzes[p].inkorten ? "te laten staan" : "korter te maken"}">⏸ ${(k.pauzes[p].tot - k.pauzes[p].van).toFixed(1).replace(".", ",")} s${k.pauzes[p].inkorten ? " → kort" : ""}</span>`);
      }
    });
    const redenen = [...new Set(z.filter((u) => u.weg && u.waarom).map((u) => u.waarom))];
    if (redenen.length) delen.push(`<span class="waarom">Claude haalde eruit: ${redenen.map(esc).join("; ")}</span>`);
    return `<p class="zin">${delen.join(" ")}</p>`;
  }).join("");
}
$("tekst").addEventListener("click", (e) => {
  const w = e.target.closest(".w"), p = e.target.closest(".pauze"), s = e.target.closest(".speelzin");
  if (w) wijzig(() => { const u = k.units.find((x) => x.i === +w.dataset.i); u.weg = !u.weg; if (!u.weg) delete u.waarom; });
  else if (p) wijzig(() => { const x = k.pauzes[+p.dataset.p]; x.inkorten = !x.inkorten; });
  else if (s) {
    const eerste = k.units.find((u) => u.i >= +s.dataset.van && !u.weg);
    if (eerste) { springNaar(reelTijd(eerste.van) ?? 0); speel(true); }
  }
});
document.querySelectorAll('input[name=tempo]').forEach((r) => r.addEventListener("change", () => wijzig(() => {
  k.tempo = r.value;
  for (const p of k.pauzes) p.inkorten = p.tot - p.van > TEMPO[r.value].pauzeMin;
})));

// ---------- ondertitels ----------
let spellingOpen = new Set();
function tekenOndertitels() {
  const o = k.ondertitels || {};
  document.querySelectorAll('input[name=stijl]').forEach((r) => { r.checked = r.value === (o.stijl || "zin"); });
  document.querySelectorAll('input[name=hoofdletters]').forEach((r) => { r.checked = r.value === (o.hoofdletters || "zoals"); });
  $("regels").innerHTML = lijn.regels.map((r, n) => {
    const ws = r.w.map((x) => lijn.woorden[x]);
    const inhoud = spellingOpen.has(n)
      ? ws.map((w) => `<input data-i="${w.i}" value="${esc(w.tekst)}" aria-label="Spelling van ${esc(w.gesproken)}">`).join(" ")
      : ws.map((w) => `<span class="w ${w.nadruk ? "nadruk" : ""}" data-i="${w.i}">${esc(w.tekst)}</span>`).join(" ");
    return `<div class="regel"><span class="t">${klok(r.van)}</span><span>${inhoud}</span><button class="spelling" data-r="${n}" title="Spelling aanpassen">${spellingOpen.has(n) ? "Klaar" : "Aa"}</button></div>`;
  }).join("");
}
$("regels").addEventListener("click", (e) => {
  const w = e.target.closest(".w"), b = e.target.closest(".spelling");
  if (w) wijzig(() => { const u = k.units.find((x) => x.i === +w.dataset.i); u.nadruk = !u.nadruk; });
  if (b) { const n = +b.dataset.r; spellingOpen.has(n) ? spellingOpen.delete(n) : spellingOpen.add(n); tekenOndertitels(); }
});
$("regels").addEventListener("change", (e) => {
  const inp = e.target.closest("input[data-i]");
  if (!inp) return;
  wijzig(() => {
    const u = k.units.find((x) => x.i === +inp.dataset.i);
    const t = inp.value.trim();
    if (!t || t === u.tekst) delete u.ondertitel; else u.ondertitel = t;
  });
});
document.querySelectorAll('input[name=stijl], input[name=hoofdletters]').forEach((r) => r.addEventListener("change", () => wijzig(() => {
  k.ondertitels = { ...(k.ondertitels || {}), [r.name]: r.value };
})));

// ---------- beelden (kaarten) ----------
function kaartTijd(x) {
  const z = lijn.kaarten.find((y) => y.id === x.id);
  if (z) return z.van;
  const u = k.units.find((y) => y.i >= (x.bij ?? 0) && !y.weg);
  return u ? reelTijd(u.van) ?? 0 : 0;
}
function tekenKaarten() {
  const lijst = k.kaarten || [];
  if (!lijst.length) { $("kaarten").innerHTML = `<p class="hint">Claude heeft nog geen beelden voorgesteld.</p>`; return; }
  $("kaarten").innerHTML = lijst.map((x, n) => {
    const t = kaartTijd(x);
    const woord = k.units.find((u) => u.i === x.bij);
    const status = x.status || "houden";
    return `<div class="kaart ${status === "weg" ? "weg" : ""}" data-n="${n}">
      <canvas width="180" height="320" data-n="${n}"></canvas>
      <div>
        <div class="soort">${esc(SOORT[x.soort] || x.soort)}</div>
        <div class="wat">${esc(x.tekst).replace(/ \/ /g, " · ") || "&nbsp;"}</div>
        <div class="meta">${x.bij === 0 ? "Vanaf het eerste beeld" : `Bij "${esc(woord?.tekst || "")}"`} · ${klok(t)} · ${String(x.duur ?? 2.5).replace(".", ",")} s in beeld · ${esc(PLEK[x.plek] || x.plek || "")}${x.geluid ? ` · geluidje: ${esc(x.geluid)}` : ""}</div>
        ${x.waarom ? `<div class="waarom">Waarom: ${esc(x.waarom)}</div>` : ""}
        <div class="drie">
          <button data-s="houden" class="${status === "houden" ? "aan" : ""}">Houden</button>
          <button data-s="wijzigen" class="${status === "wijzigen" ? "aan" : ""}">Aanpassen</button>
          <button data-s="weg" class="${status === "weg" ? "aan" : ""}">Weg</button>
        </div>
        <button class="licht" data-kijk="${n}" style="margin-left:8px;padding:6px 12px">Bekijk</button>
        ${status === "wijzigen" ? `<textarea rows="2" data-notitie="${n}" placeholder="Wat moet er anders? Bijvoorbeeld: andere tekst, later in beeld, liever onderin.">${esc(x.notitie || "")}</textarea>` : ""}
      </div></div>`;
  }).join("");
  if ($("tab-kaarten").classList.contains("aan")) tekenKaartbeelden();
}
$("kaarten").addEventListener("click", (e) => {
  const kaart = e.target.closest(".kaart");
  if (!kaart) return;
  const x = k.kaarten[+kaart.dataset.n];
  const s = e.target.closest("[data-s]"), kijk = e.target.closest("[data-kijk]");
  if (s) wijzig(() => { x.status = s.dataset.s; });
  if (kijk) { springNaar(kaartTijd(x)); speel(true); }
});
$("kaarten").addEventListener("input", (e) => {
  const t = e.target.closest("[data-notitie]");
  if (!t) return;
  k.kaarten[+t.dataset.notitie].notitie = t.value;
  bewaar();
});

// kleine beelden: een tweede, onzichtbare speler zoekt elk moment op en tekent het op een canvas
const grijper = document.createElement("video");
grijper.src = "/montage/proxy.mp4";
grijper.muted = true;
grijper.preload = "auto";
let grijpen = Promise.resolve();
function tekenKaartbeelden() {
  const doeken = [...document.querySelectorAll(".kaart canvas")];
  grijpen = grijpen.then(async () => {
    for (const c of doeken) {
      const x = k.kaarten[+c.dataset.n];
      if (!x || !c.isConnected) continue;
      const t = bronTijd(kaartTijd(x) + Math.min(0.5, (x.duur || 2.5) / 2));
      await new Promise((ok) => { const klaar = () => { grijper.removeEventListener("seeked", klaar); ok(); }; grijper.addEventListener("seeked", klaar); grijper.currentTime = t; setTimeout(klaar, 1500); });
      const g = c.getContext("2d");
      g.drawImage(grijper, 0, 0, 180, 320);
      const y = { boven: 0.13, midden: 0.38, onder: 0.6 }[x.plek] ?? 0.13;
      g.setLineDash([6, 4]);
      g.strokeStyle = "rgba(255,255,255,.95)";
      g.lineWidth = 2;
      g.fillStyle = "rgba(0,0,0,.3)";
      g.fillRect(14, 320 * y, 152, 54);
      g.strokeRect(14, 320 * y, 152, 54);
    }
  });
}

// ---------- kleur ----------
function tekenLooks() {
  const nu = k.kleur?.look || "zoals";
  $("looks").innerHTML = Object.entries(LOOKS).map(([sleutel, l]) => `<button class="look ${sleutel === nu ? "aan" : ""}" data-look="${sleutel}"><img src="/montage/kleur-${sleutel}.jpg" alt=""><span>${esc(l.naam)}</span></button>`).join("");
}
$("looks").addEventListener("click", (e) => {
  const b = e.target.closest("[data-look]");
  if (b) wijzig(() => { k.kleur = { look: b.dataset.look }; });
});

// ---------- klaar ----------
$("notities").addEventListener("input", (e) => { k.notities = e.target.value; bewaar(); });
$("klaarKnop").addEventListener("click", () => { k.klaar = true; bewaar(); tekenAlles(); });

// ---------- merk: accentkleur en lettertype van de zaak, als die er al zijn ----------
async function merk() {
  try {
    const m = await (await fetch("/merk/merk.json", { cache: "no-store" })).json();
    const kl = m.kleuren;
    let accent = kl && !Array.isArray(kl) ? kl.accent : null;
    if (!accent && Array.isArray(kl)) {
      // de meest verzadigde kleur uit de lijst
      const sat = (h) => { const n = parseInt(h.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255; return (Math.max(r, g, b) - Math.min(r, g, b)) / 255; };
      accent = [...kl].sort((a, b) => sat(b) - sat(a))[0];
    }
    if (accent) document.documentElement.style.setProperty("--accent", accent);
  } catch { /* geen merk: standaardkleur */ }
}

await merk();
await laad();
requestAnimationFrame(lus);
