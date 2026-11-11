/*
 * Bewegingsstijl van Fietsmaker Van Dam: "Doorrollen". Gekozen bij de eerste Reel; elke Reel van deze zaak gebruikt hem.
 * Uitleg in gewone woorden: beweging.md naast dit bestand.
 *
 *   Held        een fietswiel dat echt rolt: de spaken draaien mee met de afgelegde weg
 *   Overgang    het wiel rolt door het beeld en laat de nieuwe kleur achter zich; daarna rolt het terug naar zijn plek
 *   Tekst       Barlow Condensed, vet, hoofdletters, links; woorden schuiven van rechts binnen; nadruk als gele wegmarkering
 *   Klap        harde knip naar rood, woorden knallen, het wiel remt af en de fietsbel gaat
 *   Geluid      tempo 126, klank "fris"; ratel van de freewheel als het wiel uitrolt, zoef als het voorbijkomt
 *
 * Gebruik in reel.html na blokken.js:  <script src="/merk/beweging.js"></script>
 *   VD.reeks({ zinnen: [{ tekst, klap }], oproep: { kop, sub } })   de hele Reel: haak, zinnen, klap, oproep
 *   Losse onderdelen voor een Reel op maat: VD.kleuren(), VD.wiel(ouder), VD.zetWiel(el, x, y), VD.kop(ouder, tekst, kleur),
 *   VD.kopIn(ws, B, b0), VD.weg(ouder).
 */
(function () {
  "use strict";
  const { maak, zet, ease, p, mix, clamp, veer, stoot, kleur } = R;

  const css = document.createElement("style");
  css.textContent = `
    .vd-kop { text-transform: uppercase; font-weight: 800; line-height: .86; letter-spacing: .004em; word-spacing: .02em; }
    .vd-kop .hl { background: var(--vd-geel); color: var(--vd-donker); padding: 0 .07em; margin: 0 -.02em; border-radius: .03em; }
    .vd-sub { position: absolute; margin: 0; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
  `;
  document.head.append(css);

  const VD = { tempo: 126, muziek: { klank: "fris", toon: 2, variant: 0, geluid: "muziek" } };
  const R_WIEL = 150, Y_WEG = 1600, PARK = 250;

  VD.kleuren = () => {
    const M = R.M;
    const rood = M.vlakken.find((k) => ![M.donker, M.licht, M.accent].includes(k) && kleur.verzadiging(k) > 0.5) || M.accent;
    const k = { donker: M.donker, wit: M.licht, geel: M.accent, rood };
    document.documentElement.style.setProperty("--vd-geel", k.geel);
    document.documentElement.style.setProperty("--vd-donker", k.donker);
    return k;
  };

  /** Het wiel: band, velg, 18 spaken, gele naaf en een ventiel (zo zie je dat hij draait). Midden op (0, 0). */
  VD.wiel = (ouder, r = R_WIEL) => {
    const spaken = Array.from({ length: 18 }, (_, i) => {
      const a = (i * Math.PI * 2) / 18, b = a + 0.32;
      return `<line x1="${(Math.cos(b) * 16).toFixed(1)}" y1="${(Math.sin(b) * 16).toFixed(1)}" x2="${(Math.cos(a) * (r - 24)).toFixed(1)}" y2="${(Math.sin(a) * (r - 24)).toFixed(1)}"/>`;
    }).join("");
    return maak(`<div style="position:absolute;left:${-r}px;top:${-r}px;width:${2 * r}px;height:${2 * r}px">
      <svg viewBox="${-r} ${-r} ${2 * r} ${2 * r}" width="${2 * r}" height="${2 * r}" style="overflow:visible;display:block">
        <ellipse cx="0" cy="${r - 2}" rx="${r * 0.8}" ry="10" fill="rgba(0,0,0,.18)"/>
        <g class="draai">
          <circle r="${r - 10}" fill="none" stroke="#161616" stroke-width="20"/>
          <circle r="${r - 10}" fill="none" stroke="#2c2c2c" stroke-width="3" stroke-dasharray="6 10"/>
          <circle r="${r - 22}" fill="none" stroke="#cfcfcf" stroke-width="6"/>
          <g stroke="#d8d8d8" stroke-width="3" stroke-linecap="round">${spaken}</g>
          <rect x="-5" y="${-(r - 30)}" width="10" height="16" rx="3" fill="#8c8c8c"/>
          <circle r="22" fill="var(--vd-geel)" stroke="#161616" stroke-width="5"/>
          <circle r="6" fill="#161616"/>
        </g>
      </svg></div>`, ouder);
  };
  /** Wiel op x zetten (op de weg); de draaiing volgt uit de afgelegde weg, zodat het echt rolt. */
  VD.zetWiel = (el, x, dy = 0, kantel = 0) => {
    zet(el, { x, y: Y_WEG - R_WIEL + dy, r: kantel });
    el.querySelector(".draai").setAttribute("transform", `rotate(${((x / R_WIEL) * 180 / Math.PI).toFixed(2)})`);
  };

  /** De weg: een dunne lijn met strepen, die meeschuift met het wiel. */
  VD.weg = (ouder) => {
    const el = maak(`<div style="position:absolute;left:0;top:${Y_WEG}px;width:1080px;height:40px;overflow:hidden">
      <div class="lijn" style="position:absolute;left:0;top:0;width:1080px;height:4px"></div>
      <div class="strepen" style="position:absolute;left:-200px;top:22px;width:1480px;height:8px;background:repeating-linear-gradient(90deg, var(--vd-geel) 0 90px, transparent 90px 200px)"></div>
    </div>`, ouder);
    return {
      el,
      zet(x, ondergrond) {
        const lijn = kleur.contrast(ondergrond, "#ffffff") > 3 ? "rgba(255,255,255,.28)" : "rgba(0,0,0,.22)";
        el.firstElementChild.style.background = lijn;
        el.lastElementChild.style.transform = `translateX(${(-((x % 200) + 200) % 200).toFixed(1)}px)`;
        el.lastElementChild.style.opacity = ondergrond === R.M.accent ? "0" : ".55";
      },
    };
  };

  /** Een kop: groot, hoofdletters, links. */
  VD.kop = (ouder, tekst, kl, o = {}) => R.zin(ouder, tekst, { x: 84, breedte: 816, midY: o.midY ?? 800, maxHoogte: o.maxHoogte ?? 860, max: o.max ?? 330, min: 90, kleur: kl, streep: false, klasse: "vd-kop" });
  /** Woorden schuiven van rechts binnen, door hun eigen sleuf (masker). */
  VD.kopIn = (ws, B, b0, stap = 0.25) => {
    ws.forEach((w, i) => {
      const u = ease.snap(p(B, b0 + i * stap, 0.55));
      w.style.transform = `translateX(${((1 - u) * 110).toFixed(1)}%) skewX(${((1 - u) * -14).toFixed(2)}deg)`;
    });
  };

  /**
   * De hele Reel. zinnen: de eerste is de haak (staat er vanaf het eerste beeld), { tekst, klap: true } is de klap.
   * oproep: { kop, sub }. Kleuren wisselen vanzelf: donker, wit, geel, ...; de klap is rood.
   */
  VD.reeks = (cfg) => {
    R.tempo(cfg.tempo ?? VD.tempo);
    R.muziek([], { ...VD.muziek, ...(cfg.muziek || {}) });
    R.bouw(() => bouw(cfg));
  };

  function bouw(cfg) {
    const K = VD.kleuren();
    const volgorde = [K.donker, K.wit, K.geel];
    const leesbaar = (bg) => kleur.leesbaar(bg, [K.wit, K.donker], 3);
    // ---- draaiboek in beats ----
    let b = 0, i = 0;
    const plan = cfg.zinnen.map((z, k) => {
      const n = String(z.tekst).replace(/\*/g, "").split(/\s+/).length;
      if (z.klap) b += 1;                                  // een tel stilte voor de klap
      const bg = z.klap ? K.rood : volgorde[i++ % volgorde.length];
      const st = { ...z, n, bg, kl: leesbaar(bg), b0: b, haak: k === 0 };
      st.inB = st.haak ? -3 : z.klap ? b + 0.1 : b + 0.6;  // woorden binnen (de haak staat er al)
      st.tot = b + Math.max(z.klap ? 6 : 5, Math.ceil(2.6 + n * 0.55) + (z.klap ? 2 : 0));
      b = st.tot;
      return st;
    });
    const OP = b, T = OP + 8;
    R.lengte(T);
    const opBg = plan[plan.length - 1].bg === K.wit ? K.geel : K.wit;

    // ---- het wiel: rollen in beats ----
    // per zin: voorbij (van links naar rechts, laat de kleur achter), daarna terug naar zijn plek (uitrollen met ratel)
    const ritten = [];
    plan.forEach((z) => {
      if (z.haak) ritten.push({ van: 0, tot: 1.6, x0: -R_WIEL - 20, x1: PARK, soort: "park" });
      else if (z.klap) ritten.push({ van: z.b0, tot: z.b0 + 0.9, x0: -R_WIEL - 20, x1: PARK, soort: "rem" });
      else {
        ritten.push({ van: z.b0, tot: z.b0 + 1, x0: PARK, x1: 1080 + R_WIEL + 30, soort: "voorbij" });
        ritten.push({ van: z.b0 + 1.4, tot: z.b0 + 3, x0: -R_WIEL - 20, x1: PARK, soort: "park" });
      }
    });
    ritten.push({ van: OP, tot: OP + 1, x0: PARK, x1: 1080 + R_WIEL + 30, soort: "voorbij" });
    ritten.push({ van: OP + 1.4, tot: OP + 3.2, x0: -R_WIEL - 20, x1: 640, soort: "park" });
    const wielX = (B) => {
      let x = -R_WIEL - 20, kantel = 0, dy = 0;
      for (const r of ritten) {
        if (B < r.van) break;
        const u = p(B, r.van, r.tot - r.van);
        if (r.soort === "voorbij") x = mix(r.x0, r.x1, ease.in(u) * 0.35 + u * 0.65);
        else if (r.soort === "rem") { x = mix(r.x0, r.x1, 1 - (1 - u) ** 4); kantel = -8 * stoot(B, r.tot - 0.05, 5); }
        else { x = mix(r.x0, r.x1, 1 - (1 - u) ** 3); kantel = 3 * Math.sin(Math.PI * clamp((B - r.tot) * 2)) * (B > r.tot ? 1 : 0); }
      }
      return { x, kantel, dy };
    };
    // kleurgrens: het nieuwe vlak ligt links van het wiel terwijl het voorbijrolt
    const grens = (z) => {
      const r = ritten.find((q) => q.soort === "voorbij" && q.van === z.b0);
      return r ? (B) => (B < r.van ? -1 : B >= r.tot ? 2000 : wielX(B).x) : null;
    };

    let wiel, weg, korrel, opKop, opSub, opAfz, opVlak;
    R.scene(0, T + 1, (sc) => {
      plan.forEach((z) => {
        z.vlak = R.vlak(sc, z.bg);
        z.kop = VD.kop(z.vlak, z.tekst, z.kl, { max: z.klap ? 380 : 330 });
        z.grens = grens(z);
      });
      opVlak = R.vlak(sc, opBg);
      const opKl = leesbaar(opBg);
      opKop = VD.kop(opVlak, cfg.oproep.kop, opKl, { midY: 600, maxHoogte: 620 });
      let y = opKop.el.offsetTop + opKop.el.offsetHeight + 40;
      if (cfg.oproep.sub) { opSub = maak(`<p class="vd-sub r-tekst" style="left:84px;top:${y}px;width:816px;font-size:72px;color:${opKl}">${R.opmaak(cfg.oproep.sub, false)}</p>`, opVlak); y += opSub.offsetHeight + 26; }
      opAfz = maak(`<p class="vd-sub r-tekst" style="left:84px;top:${y}px;font-size:58px;color:${opKl};opacity:.85">${R.opmaak(R.M.afzender || "", false)}</p>`, opVlak);
      weg = VD.weg(sc);
      wiel = VD.wiel(sc);
      korrel = R.korrel(sc, 0.05);
    }, (lb, B) => {
      // vlakken: alles volgt uit B
      let huidig = plan[0].bg;
      plan.forEach((z, k) => {
        const volgende = plan[k + 1];
        let zicht = true;
        if (k > 0) {
          if (z.klap) zicht = B >= z.b0;
          else { const g = z.grens(B); zicht = g > 0; z.vlak.style.clipPath = g >= 1080 + R_WIEL ? "none" : `inset(0 ${Math.max(0, 1080 - g).toFixed(1)}px 0 0)`; }
        }
        const bedekt = volgende ? (volgende.klap ? B >= volgende.b0 : B >= volgende.b0 + 1) : B >= OP + 1;
        z.vlak.style.visibility = zicht && !bedekt ? "" : "hidden";
        if (zicht && !bedekt) huidig = z.bg;
        if (z.klap) R.woordenIn(z.kop.ws, B, z.inB, 0, "punch");
        else VD.kopIn(z.kop.ws, B, z.inB);
        const s = z.klap ? 1 + 0.06 * stoot(B, z.inB, 6) : 1;
        zet(z.kop.el, { s, y: 0 });
        z.kop.el.style.transformOrigin = "0 50%";
      });
      const gOp = B < OP ? -1 : B >= OP + 1 ? 2000 : wielX(B).x;
      opVlak.style.visibility = gOp > 0 ? "" : "hidden";
      opVlak.style.clipPath = gOp >= 1080 + R_WIEL ? "none" : `inset(0 ${Math.max(0, 1080 - gOp).toFixed(1)}px 0 0)`;
      if (gOp > 540) huidig = opBg;
      VD.kopIn(opKop.ws, B, OP + 0.6);
      const u1 = ease.uit(p(B, OP + 1.6, 0.8)), u2 = ease.uit(p(B, OP + 2, 0.8));
      if (opSub) zet(opSub, { x: (1 - u1) * 60, o: u1 });
      zet(opAfz, { x: (1 - u2) * 60, o: u2 * 0.85 });
      const w = wielX(B);
      VD.zetWiel(wiel, w.x, w.dy, w.kantel);
      weg.zet(w.x, huidig);
      korrel(B);
    });

    // ---- geluid ----
    const klap = plan.find((z) => z.klap);
    const secties = [{ van: 0, tot: plan[1] ? plan[1].b0 : OP, soort: "intro", akk0: 0 }];
    if (plan.length > 1) secties.push({ van: plan[1].b0, tot: klap ? klap.b0 - 1 : OP, soort: "bouw", akk0: 0 });
    if (klap) secties.push({ van: klap.b0, tot: OP, soort: "vol", akk0: 0 });
    secties.push({ van: OP, tot: T + 4, soort: "eind" });
    R.muziek(secties);
    for (const r of ritten) {
      if (r.soort === "voorbij") R.cue(r.van + 0.55, "whoosh", { lengte: 1, vol: 0.9 });
      if (r.soort === "park") R.cue(r.van + 0.1, "ratel", { lengte: r.tot - r.van, vol: 0.7 });
      if (r.soort === "rem") { R.cue(r.van, "swoosh"); R.cue(r.tot, "fietsbel"); }
    }
    if (klap) R.cue(klap.b0, "impact", { vol: 0.8 });
    R.cue(OP + 3.2, "fietsbel", { vol: 0.8 });

    R.omslag(0);
    plan.forEach((z, k) => R.moment(z.haak ? "haak" : z.klap ? "klap" : `zin-${k + 1}`, z.tot - 0.3));
    R.moment("oproep", OP + 5);
    R.onscherpte(6, (B) => ritten.some((r) => B >= r.van - 0.05 && B <= r.tot + 0.3) || plan.some((z) => B >= z.inB && B <= z.inB + 1.5));
  }

  window.VD = VD;
})();
