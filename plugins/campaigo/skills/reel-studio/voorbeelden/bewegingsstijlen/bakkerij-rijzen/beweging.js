/*
 * Bewegingsstijl van Bakkerij Bolleboos: "Rijzen". Gekozen bij de eerste Reel; elke Reel van deze bakkerij gebruikt hem.
 * Uitleg in gewone woorden: beweging.md naast dit bestand.
 *
 *   Held        de bol: een deegbol die rijst, ademt en tijdens de Reel langzaam goudbruin bakt
 *   Overgang    de nieuwe kleur rijst van onderen op met een bolle bovenkant, als deeg dat over de rand van de kom komt
 *   Tekst       Fraunces (zachte schreefletter), gecentreerd; woorden komen rustig omhoog; nadruk met een getekende krul
 *   Sfeer       zwevend meelstof, warme korrel
 *   Klap        geen knal: een langere stilte, dan rijst een groot vlak en staat de zin er groot en rustig
 *   Geluid      tempo 96, klank "warm" (elektrische piano, vibrafoon), weinig geluidjes
 *
 * Gebruik in reel.html na blokken.js:  <script src="/merk/beweging.js"></script>
 *   BB.reeks({ zinnen: [{ tekst, klap }], oproep: { kop, sub } })   de hele Reel
 *   Losse onderdelen: BB.kleuren(), BB.bol(ouder), BB.zetBol(bol, x, y, B, bak), BB.rijs(el, B, b0, d), BB.meel(ouder),
 *   BB.kop(ouder, tekst, kleur), BB.kopIn(z, B, b0), BB.krul(z, B, b0).
 */
(function () {
  "use strict";
  const { maak, zet, ease, p, mix, clamp, veer, stoot, kleur, toeval } = R;

  const css = document.createElement("style");
  css.textContent = `
    .bb-kop { font-weight: 640; line-height: 1.02; letter-spacing: -.012em; font-optical-sizing: auto; }
    .bb-kop .hl { position: relative; }
    .bb-krul { position: absolute; left: -2%; bottom: -.14em; overflow: visible; }
    .bb-krul path { fill: none; stroke-linecap: round; }
    .bb-sub { position: absolute; margin: 0; text-align: center; font-weight: 500; letter-spacing: -.005em; }
  `;
  document.head.append(css);

  const BB = { tempo: 96, muziek: { klank: "warm", toon: 5, variant: 2, geluid: "muziek" } };
  const MIDX = 500;

  BB.kleuren = () => {
    const M = R.M;
    const op = (k) => M.vlakken.find((c) => c === k);
    const groen = M.vlakken.find((c) => kleur.rgb(c)[1] > kleur.rgb(c)[0] && kleur.lum(c) < 0.3) || M.donker;
    const mosterd = M.vlakken.find((c) => c !== M.accent && kleur.lum(c) > 0.3 && kleur.lum(c) < 0.6) || M.accent;
    return { bruin: M.donker, creme: M.licht, oranje: M.accent, groen, mosterd };
  };

  /** De bol: een broodbol met een korst, een snee en wat bloem erop, met zachte schaduw. Midden-onder op (0, 0). */
  BB.bol = (ouder, r = 200) => {
    const W = r * 1.1, H = r * 0.95;
    const romp = `M${-W},0 C${-W * 1.02},${-H * 1.3} ${W * 0.98},${-H * 1.34} ${W},0 C${W * 0.85},${r * 0.16} ${-W * 0.85},${r * 0.16} ${-W},0 Z`;
    const rnd = toeval(5);
    const bloem = Array.from({ length: 26 }, () => {
      const x = (rnd() - 0.6) * W * 1.1, y = -H * (0.55 + rnd() * 0.42), g = 2 + rnd() * 5;
      return `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="${g.toFixed(1)}" ry="${(g * 0.7).toFixed(1)}" fill="#fffdf6" opacity="${(0.35 + rnd() * 0.4).toFixed(2)}"/>`;
    }).join("");
    const el = maak(`<div style="position:absolute;left:0;top:0;width:0;height:0">
      <svg viewBox="${-r * 1.5} ${-r * 1.5} ${r * 3} ${r * 1.8}" width="${r * 3}" height="${r * 1.8}" style="position:absolute;left:${-r * 1.5}px;top:${-r * 1.5}px;overflow:visible">
        <defs>
          <radialGradient id="bbkorst" cx="42%" cy="28%" r="80%"><stop class="s1" offset="0%"/><stop class="s2" offset="62%"/><stop class="s3" offset="100%"/></radialGradient>
          <clipPath id="bbromp"><path d="${romp}"/></clipPath>
        </defs>
        <ellipse cx="0" cy="${r * 0.1}" rx="${W * 1.08}" ry="${r * 0.13}" fill="rgba(0,0,0,.25)"/>
        <g class="deeg">
          <path d="${romp}" fill="url(#bbkorst)"/>
          <g clip-path="url(#bbromp)">
            <path class="snee-schaduw" d="M${-W * 0.56},${-H * 0.5} Q0,${-H * 0.86} ${W * 0.56},${-H * 0.53}" fill="none" stroke-width="${r * 0.16}" stroke-linecap="round" opacity=".35"/>
            <path class="snee" d="M${-W * 0.54},${-H * 0.56} Q0,${-H * 0.92} ${W * 0.54},${-H * 0.59}" fill="none" stroke-width="${r * 0.09}" stroke-linecap="round"/>
            ${bloem}
          </g>
        </g>
      </svg></div>`, ouder);
    return { el, deeg: el.querySelector(".deeg"), s: [...el.querySelectorAll("stop")], snee: el.querySelector(".snee"), schaduw: el.querySelector(".snee-schaduw"), r };
  };
  /** Bol neerzetten: ademen (rijzen), een hupje bij een overgang, en bakken van 0 (rauw deeg) tot 1 (goudbruin). */
  BB.zetBol = (bol, x, y, B, bak, hup = 0) => {
    const adem = 1 + 0.022 * Math.sin(B * 0.9);
    zet(bol.el, { x, y: y - 46 * hup });
    bol.deeg.setAttribute("transform", `scale(${(adem * (1 + 0.07 * hup)).toFixed(4)},${(adem * (1 - 0.05 * hup) * (0.88 + 0.12 * clamp(bak * 2))).toFixed(4)})`);
    const kl = [kleur.meng("#f7ecd6", "#f2c776", bak), kleur.meng("#ecd9b4", "#cf8a38", bak), kleur.meng("#d8bf92", "#7d4a1d", bak)];
    bol.s.forEach((s, i) => s.setAttribute("stop-color", kl[i]));
    bol.snee.setAttribute("stroke", kleur.meng("#fbf3e2", "#f6dca3", bak));
    bol.schaduw.setAttribute("stroke", kleur.meng("#c9ae80", "#6b3c15", bak));
  };

  /** Een vlak laten rijzen: van onderen omhoog met een bolle bovenkant, vanaf beat b0 in d beats. */
  BB.rijs = (el, B, b0, d = 1.6) => {
    const u = ease.inuit(p(B, b0, d));
    el.style.visibility = B >= b0 ? "" : "hidden";
    if (u >= 1) { el.style.clipPath = "none"; return u; }
    const dome = 360 * (1 - 0.6 * u);
    const Y = mix(1920 + dome, -40, u);
    const golf = 30 * Math.sin(u * 7);
    el.style.clipPath = `path("M0,1920 L0,${Y.toFixed(1)} C${(270 + golf).toFixed(1)},${(Y - dome * 1.33).toFixed(1)} ${(810 + golf).toFixed(1)},${(Y - dome * 1.33).toFixed(1)} 1080,${Y.toFixed(1)} L1080,1920 Z")`;
    return u;
  };

  /** Meelstof: kleine stipjes die langzaam zweven. Geef de frame-functie terug. */
  BB.meel = (ouder) => {
    const rnd = toeval(11);
    const laag = maak(`<div class="laag" style="pointer-events:none"></div>`, ouder);
    const stof = Array.from({ length: 38 }, () => {
      const g = 3 + rnd() * 7;
      return { el: maak(`<div style="position:absolute;left:0;top:0;width:${g}px;height:${g}px;border-radius:50%;background:#fffaf0;opacity:${(0.18 + rnd() * 0.32).toFixed(2)};filter:blur(${g > 7 ? 1.2 : 0}px)"></div>`, laag), x: rnd() * 1080, y: rnd() * 2200, v: 6 + rnd() * 14, f: rnd() * 6.28, a: 12 + rnd() * 30 };
    });
    return (B) => { for (const s of stof) zet(s.el, { x: s.x + Math.sin(B * 0.35 + s.f) * s.a, y: ((s.y - B * s.v) % 2200 + 2200) % 2200 - 140 }); };
  };

  /** Een kop: zachte schreefletter, gecentreerd. */
  BB.kop = (ouder, tekst, kl, nadruk, o = {}) => {
    const z = R.zin(ouder, tekst, { x: 72, breedte: 856, uitlijning: "midden", midY: o.midY ?? 760, maxHoogte: o.maxHoogte ?? 760, max: o.max ?? 230, min: 80, kleur: kl, streep: false, klasse: "bb-kop" });
    // de krul: op de echte breedte van het woord, zodat de lijn overal even dik is
    z.el.querySelectorAll(".hl").forEach((h) => {
      if (nadruk) h.style.color = nadruk;
      const W = h.offsetWidth * 1.04, H = z.grootte * 0.26, sw = Math.max(4, z.grootte * 0.045);
      const d = `M3,${H * 0.6} C${W * 0.14},${H * 0.1} ${W * 0.22},${H} ${W * 0.34},${H * 0.5} S${W * 0.56},${H * 0.1} ${W * 0.68},${H * 0.6} S${W * 0.88},${H * 0.9} ${W - 3},${H * 0.3}`;
      h.insertAdjacentHTML("beforeend", `<svg class="bb-krul" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" style="width:${W.toFixed(1)}px;height:${H.toFixed(1)}px"><path pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" stroke="${nadruk || kl}" stroke-width="${sw.toFixed(1)}" d="${d}"/></svg>`);
    });
    return z;
  };
  /** Woorden komen rustig omhoog uit hun masker. */
  BB.kopIn = (z, B, b0, stap = 0.45) => R.woordenIn(z.ws, B, b0, stap, "masker", 1.2);
  /** De krul onder de nadruk tekenen. */
  BB.krul = (z, B, b0) => { for (const pad of z.el.querySelectorAll(".bb-krul path")) pad.setAttribute("stroke-dashoffset", (1 - ease.inuit(p(B, b0, 1.2))).toFixed(4)); };

  /**
   * De hele Reel. zinnen: de eerste is de haak (staat er vanaf het eerste beeld), { tekst, klap: true } is de klap.
   * oproep: { kop, sub }. Kleuren wisselen vanzelf: bruin, creme, groen; de klap op mosterd.
   */
  BB.reeks = (cfg) => {
    R.tempo(cfg.tempo ?? BB.tempo);
    R.muziek([], { ...BB.muziek, ...(cfg.muziek || {}) });
    R.bouw(() => bouw(cfg));
  };

  function bouw(cfg) {
    const K = BB.kleuren();
    const volgorde = [K.bruin, K.creme, K.groen];
    const kleurOp = (bg) => kleur.leesbaar(bg, [K.creme, K.bruin], 3);
    const nadrukOp = (bg) => (bg !== K.oranje && kleur.contrast(K.oranje, bg) >= 2.2 ? K.oranje : bg === K.bruin || bg === K.groen ? K.mosterd : K.oranje);
    let b = 0, i = 0;
    const plan = cfg.zinnen.map((z, k) => {
      const n = String(z.tekst).replace(/\*/g, "").split(/\s+/).length;
      if (z.klap) b += 2;                                   // een lange stilte voor de klap
      const bg = z.klap ? K.mosterd : volgorde[i++ % volgorde.length];
      const st = { ...z, n, bg, kl: kleurOp(bg), nadruk: nadrukOp(bg), b0: b, haak: k === 0 };
      st.inB = st.haak ? -(n * 0.45) - 1.4 : b + (z.klap ? 1.0 : 0.8);
      st.tot = b + Math.max(z.klap ? 6 : 5, Math.ceil(2.4 + n * 0.5) + (z.klap ? 1 : 0));
      b = st.tot;
      return st;
    });
    const OP = b, T = OP + 8;
    R.lengte(T);
    const opBg = plan[plan.length - 1].bg === K.creme ? K.bruin : K.creme;

    let bol, meel, korrel, op = {};
    R.scene(0, T + 1, (sc) => {
      plan.forEach((z) => {
        z.vlak = R.vlak(sc, z.bg);
        z.kop = BB.kop(z.vlak, z.tekst, z.kl, z.nadruk, { max: z.klap ? 300 : 230, maxHoogte: z.klap ? 820 : 700 });
      });
      op.vlak = R.vlak(sc, opBg);
      const opKl = kleurOp(opBg);
      op.kop = BB.kop(op.vlak, cfg.oproep.kop, opKl, nadrukOp(opBg), { midY: 640, maxHoogte: 520 });
      let y = op.kop.el.offsetTop + op.kop.el.offsetHeight + 44;
      if (cfg.oproep.sub) { op.sub = maak(`<p class="bb-sub r-tekst" style="left:72px;width:856px;top:${y}px;font-size:58px;line-height:1.25;color:${opKl}">${R.opmaak(cfg.oproep.sub, false)}</p>`, op.vlak); y += op.sub.offsetHeight + 30; }
      op.afz = maak(`<p class="bb-sub r-tekst" style="left:72px;width:856px;top:${y}px;font-size:50px;font-style:italic;color:${opKl};opacity:.85">${R.opmaak(R.M.afzender || "", false)}</p>`, op.vlak);
      meel = BB.meel(sc);
      bol = BB.bol(sc);
      korrel = R.korrel(sc, 0.06);
    }, (lb, B) => {
      plan.forEach((z, k) => {
        if (k > 0) BB.rijs(z.vlak, B, z.b0, z.klap ? 2.2 : 1.6); else z.vlak.style.visibility = "";
        const volgende = plan[k + 1];
        const bedekt = volgende ? B >= volgende.b0 + (volgende.klap ? 2.2 : 1.6) : B >= OP + 1.6;
        if (bedekt) z.vlak.style.visibility = "hidden";
        BB.kopIn(z.kop, B, z.inB, z.klap ? 0.6 : 0.45);
        BB.krul(z.kop, B, z.inB + z.n * 0.45 + 0.4);
        const adem = 1 + 0.02 * ease.zacht(p(B, z.b0, z.tot - z.b0 + 1));
        zet(z.kop.el, { s: adem });
      });
      BB.rijs(op.vlak, B, OP, 1.6);
      BB.kopIn(op.kop, B, OP + 0.9);
      BB.krul(op.kop, B, OP + 2.4);
      const u1 = ease.uit(p(B, OP + 2, 1)), u2 = ease.uit(p(B, OP + 2.5, 1));
      if (op.sub) zet(op.sub, { y: (1 - u1) * 30, o: u1 });
      zet(op.afz, { y: (1 - u2) * 30, o: u2 * 0.85 });
      // de bol: eerst rijzen, bij elke overgang een hupje, bakt langzaam, en schuift aan het eind iets omlaag naast de oproep
      const rijzen = ease.uit(p(B, -1, 2.5));
      const hup = Math.max(...plan.slice(1).map((z) => Math.sin(Math.PI * clamp((B - z.b0 - 0.6) / 1.1))), Math.sin(Math.PI * clamp((B - OP - 0.6) / 1.1)), 0);
      const bak = clamp(B / (OP + 2));
      BB.zetBol(bol, MIDX, 1440, B, bak * rijzen, hup);
      bol.el.style.opacity = rijzen.toFixed(3);
      meel(B);
      korrel(B);
    });

    // ---- geluid ----
    const klap = plan.find((z) => z.klap);
    const secties = [{ van: 0, tot: plan[1] ? plan[1].b0 : OP, soort: "intro", akk0: 0 }];
    if (plan.length > 1) secties.push({ van: plan[1].b0, tot: klap ? klap.b0 - 2 : OP, soort: "groei", akk0: 0 });
    if (klap) secties.push({ van: klap.b0 - 2, tot: klap.b0, soort: "stil", akk0: 2 }, { van: klap.b0, tot: OP, soort: "vol", akk0: 0 });
    secties.push({ van: OP, tot: T + 4, soort: "eind" });
    R.muziek(secties);
    plan.forEach((z, k) => {
      if (k > 0) R.cue(z.b0 + 0.2, "whoosh", { lengte: 1.6, vol: 0.45 });
      R.cue(z.inB + z.n * 0.45 + 0.4, "druppel", { vol: 0.35, toon: k * 2 });
    });
    if (klap) R.cue(klap.b0 + 1, "ding", { vol: 0.8 });
    R.cue(OP + 0.2, "whoosh", { lengte: 1.6, vol: 0.45 });
    R.cue(OP + 2.4, "sparkle", { vol: 0.7 });

    R.omslag(0);
    plan.forEach((z, k) => R.moment(z.haak ? "haak" : z.klap ? "klap" : `zin-${k + 1}`, z.tot - 0.3));
    R.moment("oproep", OP + 5);
    R.onscherpte(4, (B) => plan.some((z) => B >= z.b0 && B <= z.b0 + 2.4) || (B >= OP && B <= OP + 2));
  }

  window.BB = BB;
})();
