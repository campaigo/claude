/**
 * Het hart van de montage: uit keuzes.json volgt welke stukken van de opname blijven, hoe lang de Reel wordt en waar
 * elk woord, elke ondertitel en elke kaart in de Reel valt. Gedeeld door de scripts (Node) en de controlepagina
 * (browser), zodat de ruwe montage op de pagina precies zo knipt als de echte.
 *
 * keuzes.json (in de map van de Reel):
 *   bron, duur                       de opname (ruw.*) en hoe lang die is
 *   tempo                            "rustig" | "strak" | "vlot" (zie TEMPO)
 *   units: [{ i, soort, tekst, van, tot, weg, nadruk, ondertitel, nieuweRegel }]
 *                                    soort "woord", "eh" (een stopwoord) of "geluid" (klank zonder woord, vaak een eh)
 *   pauzes: [{ van, tot, inkorten }] stiltes in de opname
 *   ondertitels: { stijl, hoofdletters, y }
 *   kaarten: [{ id, soort, tekst, bij, duur, plek, geluid, status, notitie, waarom }]
 *                                    bij = index van het woord waarop de kaart begint; status "houden" | "wijzigen" | "weg"
 *   kleur: { look }                  "zoals" | "warm" | "fris" | "helder"
 *   notities, klaar, bijgewerkt
 */

/** Hoe strak er geknipt wordt. pauzeMin: langere stiltes worden ingekort; lucht: wat er aan weerszijden van een knip blijft. */
export const TEMPO = {
  rustig: { pauzeMin: 0.6, lucht: 0.15, snelheid: 1.0, naam: "rustig" },
  strak: { pauzeMin: 0.32, lucht: 0.08, snelheid: 1.0, naam: "strak" },
  vlot: { pauzeMin: 0.25, lucht: 0.06, snelheid: 1.08, naam: "vlot" },
};

/** Stopwoorden die er standaard uit gaan. "nou", "dus" en "zeg maar" zijn echte woorden: die blijven, tenzij iemand ze aantikt. */
export const STOPWOORDEN = ["eh", "ehm", "uh", "uhm", "ehh", "uhh", "eeh", "euh", "hm", "hmm", "mm", "mmm", "um", "umm", "er", "erm"];
export const isStopwoord = (t) => STOPWOORDEN.includes(String(t).toLowerCase().replace(/[^a-zë]/g, ""));

/** Kleurlooks (ffmpeg-filters), licht en natuurlijk: huid blijft huid. */
export const LOOKS = {
  zoals: { naam: "Zoals gefilmd", filter: "" },
  warm: { naam: "Warm", filter: "colorbalance=rs=.035:gs=.01:bs=-.035:rm=.025:bm=-.025,eq=saturation=.96:gamma=1.02,curves=master='0/0.025 0.5/0.515 1/0.97'" },
  fris: { naam: "Fris", filter: "colorbalance=rs=-.01:bs=.025:bm=.015,eq=saturation=1.05:contrast=1.03,curves=master='0/0.01 0.5/0.51 1/0.99'" },
  helder: { naam: "Helder", filter: "eq=brightness=.025:contrast=1.04:saturation=1.03,curves=master='0/0.015 0.45/0.5 1/1'" },
};

export const tempoVan = (k) => TEMPO[k?.tempo] || TEMPO.rustig;

/**
 * De stukken van de opname die blijven, in seconden van de opname: [[van, tot], ...].
 * Tussen twee bewaarde woorden wordt geknipt als er iets weg moet (woorden, stopwoorden) of als er een pauze tussen zit
 * die ingekort moet worden; anders loopt het door, met de gewone ademruimte.
 */
export function bewaardeStukken(k) {
  const { lucht: L } = tempoVan(k);
  const units = [...(k.units || [])].sort((a, b) => a.van - b.van);
  const pos = new Map(units.map((u, n) => [u, n]));
  const bewaard = units.filter((u) => !u.weg);
  if (!bewaard.length) return [];
  const duur = k.duur || bewaard[bewaard.length - 1].tot + 1;
  const pz = (k.pauzes || []).filter((p) => p.inkorten);
  const stukken = [];
  let begin = Math.max(0, bewaard[0].van - L);
  for (let j = 1; j < bewaard.length; j++) {
    const a = bewaard[j - 1], b = bewaard[j];
    const weg = units.slice(pos.get(a) + 1, pos.get(b));
    const pauze = pz.some((p) => p.van >= a.tot - 0.08 && p.tot <= b.van + 0.08);
    if (!weg.length && !pauze) continue;
    // ademruimte rond de knip, maar nooit iets van wat eruit moet
    let eind = a.tot + L, start = b.van - L;
    if (weg.length) { eind = Math.min(eind, weg[0].van); start = Math.max(start, weg[weg.length - 1].tot); }
    if (start - eind > 0.04) {
      stukken.push([begin, eind]);
      begin = start;
    }
  }
  stukken.push([begin, Math.min(duur, bewaard[bewaard.length - 1].tot + L + 0.12)]);
  return stukken.map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)]).filter(([a, b]) => b - a > 0.05);
}

/** Seconde in de opname naar seconde in de Reel (null als die seconde eruit geknipt is). */
export function naarReel(stukken, t, snelheid = 1) {
  let voor = 0;
  for (const [a, b] of stukken) {
    if (t >= a - 1e-6 && t <= b + 1e-6) return (voor + Math.min(Math.max(t, a), b) - a) / snelheid;
    voor += b - a;
  }
  return null;
}

/** De lengte van de Reel in seconden. */
export const reelDuur = (stukken, snelheid = 1) => stukken.reduce((s, [a, b]) => s + b - a, 0) / snelheid;

/** Ondertitelregels: een paar woorden tegelijk, breken na een leesteken, een pauze of bij nieuweRegel. */
export function maakRegels(woorden, stijl = "zin") {
  const maxW = stijl === "blok" ? 6 : 4, maxT = stijl === "blok" ? 32 : 22;
  const regels = [];
  let nu = [];
  const sluit = () => { if (nu.length) regels.push(nu); nu = []; };
  woorden.forEach((w, k) => {
    const lengte = [...nu.map((x) => woorden[x].tekst), w.tekst].join(" ").length;
    // het laatste woord van een zin niet alleen laten staan als het er nog net bij past
    const slot = /[.!?]$/.test(w.tekst) && nu.length <= maxW && lengte <= maxT + 12;
    if (nu.length && (w.nieuweRegel || w.van - woorden[nu[nu.length - 1]].tot > 0.45 || (!slot && (nu.length >= maxW || lengte > maxT)))) sluit();
    nu.push(k);
    if (/[.!?;:,]$/.test(w.tekst)) sluit();
  });
  sluit();
  return regels.map((ws, n) => {
    const eerste = woorden[ws[0]], laatste = woorden[ws[ws.length - 1]];
    const volgende = regels[n + 1] ? woorden[regels[n + 1][0]].van : Infinity;
    return { van: +eerste.van.toFixed(3), tot: +Math.min(volgende, laatste.tot + 0.5).toFixed(3), w: ws };
  });
}

/**
 * Alles in de tijd van de Reel: { stukken, duur, woorden, regels, naden, kaarten }. Dit wordt woorden.json, waar de motor
 * (motor/montage.js) de ondertitels en het inzoomen uit haalt en Claude de kaarten op legt. eigenStukken: de stukken na
 * het verschuiven naar de stilste plek (monteren.mjs); zonder: zoals bewaardeStukken ze geeft.
 */
export function reelTijdlijn(k, eigenStukken = null) {
  const { snelheid } = tempoVan(k);
  const stukken = eigenStukken || bewaardeStukken(k);
  const duur = reelDuur(stukken, snelheid);
  const woorden = [];
  for (const u of [...(k.units || [])].sort((a, b) => a.van - b.van)) {
    if (u.weg || u.soort !== "woord") continue;
    const van = naarReel(stukken, u.van, snelheid), tot = naarReel(stukken, u.tot, snelheid);
    if (van === null) continue;
    const tekst = (u.ondertitel ?? u.tekst).trim();
    if (!tekst) continue;
    woorden.push({ i: u.i, tekst, gesproken: u.tekst, van: +van.toFixed(3), tot: +Math.max(van + 0.08, tot ?? van + 0.25).toFixed(3), nadruk: !!u.nadruk, nieuweRegel: !!u.nieuweRegel });
  }
  const regels = maakRegels(woorden, k.ondertitels?.stijl);
  const naden = [];
  let t = 0;
  for (const [a, b] of stukken.slice(0, -1)) { t += (b - a) / snelheid; naden.push(+t.toFixed(3)); }
  const kaarten = (k.kaarten || []).filter((x) => x.status !== "weg").map((x) => {
    const anker = (k.units || []).filter((u) => u.i >= (x.bij ?? 0) && !u.weg).sort((a, b) => a.i - b.i)[0];
    const van = x.bij === 0 || x.van === 0 ? 0 : anker ? naarReel(stukken, anker.van, snelheid) : null;
    return { ...x, van: van === null ? null : +van.toFixed(3) };
  }).filter((x) => x.van !== null);
  return { stukken, duur: +duur.toFixed(3), snelheid, woorden, regels, naden, kaarten };
}
