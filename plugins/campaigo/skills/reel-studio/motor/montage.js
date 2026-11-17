/*
 * Reel-studio van Campaigo: montage van eigen opnames (de skill reel-monteren). Na reel.js en blokken.js laden.
 * Zet de gemonteerde video (master.mp4) onder de hele Reel, de stem (master.wav) eronder, ondertitels erop en zoomt
 * om en om in op elke knip, zodat sprongen niet opvallen. De gegevens komen uit woorden.json (monteren.mjs).
 *
 *   R.montage({ data: "woorden.json", zoom: 0.08, ondertitels: { stijl: "zin", y: 1240, grootte: 92 }, achtergrond: 0.5 })
 *
 * Daarna in een eigen R.bouw: R.MONTAGE (de gegevens), R.sec(s) (seconden naar beats), R.woordTijd(i) (seconde waarop
 * woord i uit de transcriptie te horen is), R.kaart(id) (een goedgekeurde kaart met zijn tijd) en
 * R.ondertitelsUit(van, tot) (ondertitels even weg, in seconden).
 */
(function () {
  "use strict";
  const { maak, zet, ease, clamp } = R;

  const css = document.createElement("style");
  css.textContent = `
    .r-montage-video { overflow: hidden; z-index: 0; }
    .r-montage-video > .laag { transform-origin: 50% 36%; }
    .r-ondertitels { z-index: 50; pointer-events: none; }
    .r-ond { position: absolute; left: 100px; width: 880px; text-align: center; line-height: 1.04; letter-spacing: -.01em; transform-origin: 50% 50%; }
    .r-ond .w { display: inline-block; white-space: pre; transform-origin: 50% 70%; }
    .r-ond-zin, .r-ond-woord { color: #fff; text-shadow: 0 3px 2px rgba(0,0,0,.35), 0 6px 26px rgba(0,0,0,.45); -webkit-text-stroke: .045em rgba(0,0,0,.28); paint-order: stroke fill; }
    .r-ond-blok > span.blok { display: inline; padding: .08em .3em; border-radius: .22em; -webkit-box-decoration-break: clone; box-decoration-break: clone; line-height: 1.36; }
  `;
  document.head.append(css);

  /** Seconden naar beats. */
  R.sec = (s) => s / R.BEAT;

  /** Woord i (index uit de transcriptie): de seconde in de Reel waarop het begint, of null als het eruit geknipt is. */
  R.woordTijd = (i) => {
    const w = (R.MONTAGE?.woorden || []).find((x) => x.i === i);
    return w ? w.van : null;
  };

  /** Een goedgekeurde kaart uit de controlepagina, met van (seconde) en duur. */
  R.kaart = (id) => (R.MONTAGE?.kaarten || []).find((k) => k.id === id) || null;

  /**
   * Ondertitels op het beeld. stijl: "zin" (een paar woorden tegelijk, het woord dat klinkt licht op), "woord" (één woord
   * tegelijk, groot) of "blok" (zinnen op een kleurvlak). y: midden van de ondertitel (240 tot 1480), grootte in px.
   * Woorden met nadruk krijgen de accentkleur. Geeft een functie die je elk beeld met t (seconden) aanroept.
   */
  R.ondertitels = (ouder, d, o = {}) => {
    const M = R.M;
    const stijl = o.stijl || d.ondertitels?.stijl || "zin";
    const y = o.y ?? d.ondertitels?.y ?? 1240;
    const basis = o.grootte ?? (stijl === "woord" ? 118 : 88);
    const klein = (o.hoofdletters ?? d.ondertitels?.hoofdletters) === "klein";
    const accent = o.nadruk || M.accent;
    const kleur = o.kleur || (stijl === "blok" ? M.accentTekst || M.licht : "#ffffff");
    const blokKleur = o.blok || M.donker;
    const tekst = (w) => (klein ? w.tekst.toLocaleLowerCase("nl") : w.tekst);
    const W = d.woorden;
    const items = [];

    const pas = (el, g) => {
      // zo groot als past, maar nooit breder dan de veilige zone
      el.style.fontSize = `${g}px`;
      let s = g;
      // hooguit twee regels, en geen woord breder dan de zone
      while (s > 40 && (el.scrollWidth > 884 || el.offsetHeight > s * (stijl === "blok" ? 2.9 : 2.25))) { s -= 4; el.style.fontSize = `${s}px`; }
      el.style.top = `${y - el.offsetHeight / 2}px`;
    };

    if (stijl === "woord") {
      for (const [k, w] of W.entries()) {
        const el = maak(`<div class="r-ond r-ond-woord r-tekst" style="font-weight:800"></div>`, ouder);
        const s = maak(`<span class="w"></span>`, el);
        s.textContent = tekst(w);
        if (w.nadruk) s.style.color = accent;
        pas(el, basis);
        const tot = Math.min(W[k + 1]?.van ?? w.tot + 0.4, w.tot + 0.6);
        items.push({ el, van: w.van, tot, ws: [{ s, w }] });
      }
    } else {
      for (const r of d.regels) {
        const el = maak(`<div class="r-ond r-ond-${stijl} r-tekst" style="font-weight:800;color:${kleur}"></div>`, ouder);
        const doel = stijl === "blok" ? maak(`<span class="blok" style="background:${blokKleur}"></span>`, el) : el;
        const ws = [];
        r.w.forEach((k, j) => {
          const s = maak(`<span class="w"></span>`, doel);
          s.textContent = tekst(W[k]) + (j < r.w.length - 1 ? " " : "");
          if (W[k].nadruk) s.style.color = accent;
          ws.push({ s, w: W[k] });
        });
        pas(el, basis);
        items.push({ el, van: r.van, tot: r.tot, ws });
      }
    }

    return (t) => {
      for (const it of items) {
        const aan = t >= it.van && t < it.tot;
        it.el.style.visibility = aan ? "" : "hidden";
        if (!aan) continue;
        const u = ease.uit(clamp((t - it.van) / 0.14));
        zet(it.el, { s: 0.9 + 0.1 * u, y: 18 * (1 - u), o: u });
        if (stijl === "zin") {
          for (const { s, w } of it.ws) {
            // het woord dat nu klinkt is vol, de rest iets zachter
            const nu = t >= w.van - 0.03 && t < w.tot + 0.05;
            s.style.opacity = t >= w.van - 0.03 ? "1" : "0.62";
            zet(s, { s: nu ? 1.06 : 1 });
          }
        }
      }
    };
  };

  /** Ondertitels even weg, bijvoorbeeld onder een eindkaart: van en tot in seconden van de Reel. */
  const stil = [];
  R.ondertitelsUit = (van, tot = Infinity) => { stil.push([van, tot]); };

  /** De montage onder de Reel. */
  R.montage = (o = {}) => {
    R.MONTAGE = null;
    R.geluid("effecten");
    R.bouw(async () => {
      const r = await fetch(o.data || "woorden.json", { cache: "no-store" });
      if (!r.ok) throw new Error(`${o.data || "woorden.json"} ontbreekt. Draai eerst monteren.mjs.`);
      const d = await r.json();
      R.MONTAGE = d;
      R.tempo(o.bpm || 120);
      R.lengte(d.duur / R.BEAT);
      R.stem(d.stem || "master.wav", { achtergrond: o.achtergrond });
      const laag = maak(`<div class="laag r-montage-video"></div>`);
      const binnen = maak(`<div class="laag"></div>`, laag);
      R.clip(binnen, { bron: d.video || "master.mp4", start: 0, duur: d.duur, van: 0 });
      const zoom = o.zoom === false ? 0 : typeof o.zoom === "number" ? o.zoom : 0.08;
      const ondLaag = maak(`<div class="laag r-ondertitels"></div>`);
      const ond = o.ondertitels === false ? null : R.ondertitels(ondLaag, d, o.ondertitels || {});
      const naden = d.naden || [];
      R.elkFrame((B, t) => {
        // om en om inzoomen op elke knip: een sprong in beeld voelt dan als een bewuste wissel
        const n = naden.filter((x) => x <= t + 1e-6).length;
        zet(binnen, { s: n % 2 ? 1 + zoom : 1 });
        ondLaag.style.visibility = stil.some(([a, b]) => t >= a && t < b) ? "hidden" : "";
        ond?.(t);
      });
    });
  };
})();
