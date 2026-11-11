/*
 * VOORBEELD, GEEN SJABLOON. Drie studies van een bewegingstaal, om van te leren. Gebruik ze nooit zoals ze zijn voor een
 * klant: dan krijgen alle klanten dezelfde Reels. Elke klant krijgt een eigen bewegingsstijl (zie REGIEBOEK.md).
 *
 * Reel-studio van Campaigo: drie complete stijlen. Na reel.js en blokken.js laden. Elke stijl maakt de hele Reel
 * (beeld, timing, muziek en geluidjes) uit een paar regels tekst en het merk. Zie REGIEBOEK.md voor wanneer je
 * welke kiest en BOUWSTENEN.md voor alle opties.
 *
 *   R.stijl.punch({ haak, zinnen: ["...", { tekst, klap: true }], oproep: { kop, sub, knop } })
 *   R.stijl.wereld({ haak: { boven, kop, sub }, kaarten: [{ boven, kop, tekst, foto }], oproep })
 *   R.stijl.beeld({ shots: [{ foto | video: { bron, start, duur }, tekst, focus }], oproep, boven })
 *
 * Gemeenschappelijke opties: tempo (BPM, standaard 120), geluid ("muziek", "effecten", "stil"), toon, variant.
 */
(function () {
  "use strict";
  const { maak, zet, ease, p, mix, clamp, veer, stoot, kleur, toeval } = R;
  const telWoorden = (t) => String(t || "").replace(/\*/g, "").trim().split(/\s+/).filter(Boolean).length;
  const even = (b) => Math.ceil(b / 2) * 2;
  const stijl = {};

  function begin(cfg) {
    R.tempo(cfg.tempo ?? 120);
    R.muziek([], { geluid: cfg.geluid ?? "muziek", toon: cfg.toon ?? 0, variant: cfg.variant ?? 0 });
  }
  function palet() {
    const M = R.M, lijst = [];
    for (const k of [M.donker, M.accent, ...M.vlakken, M.licht]) if (k && !lijst.includes(k)) lijst.push(k);
    return lijst;
  }
  /** Tekstkleur en nadruk voor grote tekst op een vlak. */
  function opVlak(bg) {
    const M = R.M;
    const kl = kleur.leesbaar(bg, [M.licht, M.donker, M.tekst], 3);
    const accentLeesbaar = M.accent !== bg && kleur.contrast(M.accent, bg) >= 3;
    const stipKleur = kleur.contrast(M.accent, bg) >= 1.8 && M.accent !== bg ? M.accent : kl;
    const streep = accentLeesbaar ? M.accent : kleur.contrast(M.accent, bg) >= 1.6 && M.accent !== bg ? M.accent : kleur.leesbaar(bg, [M.licht, M.donker], 1.6) === kl ? kleur.meng(kl, bg, 0.55) : kleur.leesbaar(bg, [M.licht, M.donker], 1.6);
    return { kl, nadruk: accentLeesbaar ? M.accent : null, stipKleur, streep };
  }

  // ======================================================================================
  // PUNCH: typografie op de beat. Elke zin een eigen kleurvlak, de stip springt van zin naar zin.
  // ======================================================================================
  stijl.punch = (cfg) => {
    begin(cfg);
    R.bouw(() => bouwPunch(cfg));
  };

  function bouwPunch(cfg) {
    const M = R.M;
    const items = [{ tekst: cfg.haak, haak: true }, ...(cfg.zinnen || []).map((z) => (typeof z === "string" ? { tekst: z } : { ...z }))].filter((it) => it.tekst);
    // ---- het draaiboek in beats ----
    let b = 0;
    const plan = items.map((it, k) => {
      const n = telWoorden(it.tekst);
      if (it.klap && k > 0) b += 1;                       // een tel echte stilte voor de klap
      const stap = it.klap ? 0 : n <= 3 ? 0.5 : 0.25;
      const start = it.haak ? -(n - 1) * stap - 0.6 : b + 0.25;   // de haak staat er al helemaal op het eerste beeld
      const binnen = start + (n - 1) * stap;              // laatste woord
      const land = it.klap ? b + 0.5 : it.haak ? 0.75 : binnen + 0.75;   // stip landt na het laatste woord
      const lees = 2 + Math.ceil(n * 0.6) + (it.klap ? 2 : 0);
      const z = { ...it, n, stap, b0: b, start, land, tot: b + even(land - b + lees) };
      b = z.tot;
      return z;
    });
    const OP = b;                                          // de oproep
    const T = OP + 8;
    R.lengte(T);

    // ---- kleuren: haak donker, klap in de accentkleur, de rest wisselt ----
    const pal = palet();
    let vorige = null, i = 1;
    for (const z of plan) {
      let bg;
      if (z.haak) bg = M.donker;
      else if (z.klap) bg = kleur.contrast(M.accent, kleur.leesbaar(M.accent, [M.licht, M.donker], 3)) >= 3 && vorige !== M.accent ? M.accent : M.donker === vorige ? pal[1] : M.donker;
      else {
        do { bg = pal[i++ % pal.length]; } while (bg === vorige && pal.length > 1);
      }
      z.bg = bg;
      Object.assign(z, opVlak(bg));
      vorige = bg;
    }
    let opBg = cfg.oproep?.achtergrond ?? (vorige === M.licht ? M.achtergrond !== M.licht ? M.achtergrond : M.donker : M.licht);
    const opKl = opVlak(opBg);

    let stip, korrel, op, opVlakEl, opKader, opRust;
    R.scene(0, T + 1, (sc) => {
      plan.forEach((z) => {
        z.vlak = R.vlak(sc, z.bg);
        z.kader = maak(`<div class="laag"></div>`, z.vlak);
        z.zin = R.zin(z.kader, z.tekst, {
          punt: true, ruimteNa: 0.32, kleur: z.kl, nadruk: z.nadruk,
          maxHoogte: z.klap ? 1000 : 860, max: z.klap ? 440 : 320, min: 80, midY: 860,
        });
        z.zin.el.style.setProperty("--accent", z.streep);
        z.r = clamp(z.zin.grootte * 0.1, 14, 44);
        z.rust = { x: z.zin.basis.x + z.zin.grootte * 0.04 + z.r, y: z.zin.basis.y - z.r - z.zin.grootte * 0.01 };
        // ademen vanaf de linkerkant: de tekst groeit naar rechts, nooit links de veilige zone uit
        z.kader.style.transformOrigin = `84px ${z.rust.y}px`;
      });
      opVlakEl = R.vlak(sc, opBg);
      opKader = maak(`<div class="laag"></div>`, opVlakEl);
      op = R.oproep(opKader, { ...(cfg.oproep || {}), kleur: opKl.kl, nadruk: opKl.nadruk, midY: 700, ruimteNa: 0.32 });
      op.kop.el.style.setProperty("--accent", opKl.streep);
      const rOp = clamp(op.kop.grootte * 0.1, 14, 40);
      opRust = { x: op.kop.basis.x + op.kop.grootte * 0.04 + rOp, y: op.kop.basis.y - rOp - op.kop.grootte * 0.01, r: rOp, kleur: opKl.stipKleur };
      stip = maak(`<div class="r-stip" data-veilig="de stip" style="left:0;top:0;width:100px;height:100px"></div>`, sc);
      korrel = R.korrel(sc, 0.06);
    }, (lb, B) => {
      // vlakken: elk nieuw vlak stroomt uit de stip op de plek waar hij vandaan springt
      // alles volgt uit B: geen toestand van het vorige beeld gebruiken (de render springt ook terug in de tijd)
      plan.forEach((z, k) => {
        if (k > 0) R.vloed(z.vlak, B, z.b0, z.klap ? 0.3 : 0.8, plan[k - 1].rust.x, plan[k - 1].rust.y);
        else z.vlak.style.visibility = "";
        const volgende = plan[k + 1];
        const bedekt = volgende ? B >= volgende.b0 + (volgende.klap ? 0.3 : 0.8) : B >= OP + 0.8;
        if (bedekt) { z.vlak.style.visibility = "hidden"; return; }
        if (k > 0 && B < z.b0) return;
        if (z.klap) {
          R.woordenIn(z.zin.ws, B, z.b0 + 0.2, 0, "punch");
        } else R.woordenIn(z.zin.ws, B, z.start, z.stap, z.haak ? "punch" : "masker");
        R.streep(z.zin.el, B, z.land, 0.6);
        const adem = 1 + (z.klap ? 0.04 : 0.025) * ease.zacht(p(B, z.land, Math.max(1, z.tot - z.land)));
        const klap = z.klap ? 1 + 0.07 * stoot(B, z.b0 + 0.2, 6) : 1;
        zet(z.kader, { s: adem * klap, y: 12 * stoot(B, z.land, 9) });
      });
      R.vloed(opVlakEl, B, OP, 0.8, plan[plan.length - 1].rust.x, plan[plan.length - 1].rust.y);
      if (B >= OP) {
        R.oproepIn(op, B, OP + 0.25);
        zet(opKader, { s: 1 + 0.02 * ease.zacht(p(B, OP + 1, 7)) });
      }

      // de stip: verschijnt als de haak staat, springt daarna in een boog naar het eind van elke volgende zin
      const rusten = [...plan.map((z) => ({ ...z.rust, r: z.r, b0: z.b0, land: z.land, kleur: z.stipKleur })), { ...opRust, b0: OP, land: OP + 1.75 }];
      let x, y, r, kl, sx = 1, sy = 1, o = 1;
      const eerste = rusten[0];
      if (B < eerste.land) {
        const v = veer(B, eerste.land - 0.5, 2.6, 0.4);
        ({ x, y, r, kleur: kl } = eerste);
        sx = sy = v; o = B >= eerste.land - 0.5 ? 1 : 0;
      } else {
        let k = rusten.length - 1;
        while (k > 0 && B < rusten[k].b0) k--;
        const nu = rusten[k], van = k > 0 ? rusten[k - 1] : nu;
        if (k > 0 && B < nu.land) {
          const u = p(B, nu.b0, nu.land - nu.b0), e = ease.inuit(u);
          const h = Math.min(320, 120 + Math.hypot(nu.x - van.x, nu.y - van.y) * 0.35);
          x = mix(van.x, nu.x, e);
          y = mix(van.y, nu.y, e) - Math.sin(Math.PI * u) * h;
          r = mix(van.r, nu.r, e);
          kl = u < 0.5 ? van.kleur : nu.kleur;
          const rek = Math.sin(Math.PI * u) * 0.25;
          sx = 1 - rek * 0.5; sy = 1 + rek;
        } else {
          ({ x, y, r, kleur: kl } = nu);
          const plet = stoot(B, nu.land, 10) * 0.45;
          sx = 1 + plet; sy = 1 - plet;
          y += r * plet;
        }
      }
      stip.style.background = kl;
      zet(stip, { x: x - 50, y: y - 50, sx: sx * r / 50, sy: sy * r / 50, o });
      korrel(B);
    });

    // ---- geluid ----
    const secties = [];
    const klapZ = plan.find((z) => z.klap);
    const midden = plan.slice(1);
    secties.push({ van: 0, tot: plan[1] ? plan[1].b0 : OP, soort: "puls", akk0: 0 });
    if (midden.length) {
      const grens = klapZ ? klapZ.b0 - 1 : OP;
      const eindBouw = klapZ ? grens : midden.length > 1 ? midden[1].b0 : OP;
      secties.push({ van: midden[0].b0, tot: eindBouw, soort: "bouw", akk0: 0 });
      if (eindBouw < grens) secties.push({ van: eindBouw, tot: grens, soort: "vol", akk0: 0 });
      if (klapZ) secties.push({ van: klapZ.b0, tot: OP, soort: "vol", akk0: 0 });
    }
    secties.push({ van: OP, tot: T + 4, soort: "eind" });
    R.muziek(secties);
    plan.forEach((z, k) => {
      if (k > 0 && !z.klap) R.cue(z.b0 + 0.5, "whoosh", { lengte: 1, vol: 0.8 });
      if (z.klap) { R.cue(z.b0 + 0.2, "inzuig", { lengte: 1.5 }); R.cue(z.b0 + 0.2, "impact"); }
      else R.cue(z.land, k === 0 ? "druppel" : "pop", { toon: (k * 2) % 7 });
    });
    R.cue(OP + 0.5, "swoosh");
    R.cue(OP + 1.75, "pop", { toon: 5 });
    if (cfg.oproep?.knop) R.cue(OP + 1.5, "ding");
    R.cue(OP + 2, "sparkle");

    R.omslag(plan[0].land + 0.6);
    R.moment("haak", plan[0].land + 0.6);
    // het einde van elke zin: dan is hij het grootst (ademen), dus daar valt het eerst iets buiten de zone
    plan.slice(1).forEach((z, k) => R.moment(z.klap ? "klap" : `zin-${k + 2}`, z.tot - 0.3));
    R.moment("oproep", OP + 4);
    // snelle momenten (vloed, sprong van de stip, woorden, klap) met veel tussenbeelden; stilstand met één opname
    R.onscherpte(6, (B) => plan.some((z) => B >= z.b0 - 0.1 && B <= z.land + 0.8) || (B >= OP - 0.1 && B <= OP + 3.5));
  }

  // ======================================================================================
  // WERELD: een camera vliegt door een wereld in de merkkleuren, van kaart naar kaart.
  // Gebouwd op "Kort uitgelegd" van De AI-Brouwerij, zonder hun merk.
  // ======================================================================================
  stijl.wereld = (cfg) => {
    begin(cfg);
    R.bouw(() => bouwWereld(cfg));
  };

  function bouwWereld(cfg) {
    const M = R.M;
    const BEAT = R.BEAT;
    const donker = cfg.donker !== false;
    const bg = donker ? M.donker : M.licht;
    const kaartBg = donker ? M.licht : "#ffffff";
    const kaartKl = kleur.leesbaar(kaartBg, [M.tekst, M.donker]);
    const opKaart = opVlak(kaartBg);
    const opWereld = opVlak(bg);
    const items = cfg.kaarten || [];
    const n = items.length;
    if (n < 2 || n > 5) R.meldingen.push("De stijl wereld werkt met 2 tot 5 kaarten.");
    const P = 1400;
    const HOOK = [0, -3300, 0];
    const SPOTS = [[-1700, -1250, -900], [1700, 250, 250], [-1500, 1750, -1300], [1600, 3250, 100], [-1600, 4750, -700]];
    // seconden: haak 3 s, per kaart 4,5 s (langer bij meer tekst), 0,7 s vliegen, oproep 4 s
    const FIRST = 6 * BEAT;
    const stapVan = items.map((it) => (telWoorden(it.kop) + telWoorden(it.tekst) > 14 ? 11 : 9) * BEAT);
    const LAND = (k) => { let s = FIRST; for (let i = 0; i < k; i++) s += stapVan[i]; return s; };
    const READ = (k) => stapVan[k] - 1.4 * BEAT;
    const CTA = LAND(n - 1) + stapVan[n - 1];
    const T = CTA + 8 * BEAT;
    R.lengte(T / BEAT);
    const flight = (q) => (q < 0.5 ? 16 * q ** 5 : 1 - (-2 * q + 2) ** 5 / 2);
    const r = toeval(cfg.seed ?? 43);

    let world, cards = [], hookEl, hookWs, near = [], glows = [], segs = [], segBar, op, scrim, opLaag, korrel, hold = [];
    R.scene(0, T / BEAT + 1, (sc) => {
      sc.style.background = bg;
      const gloed = maak(`<div class="laag"></div>`, sc);
      glows = [[-0.35, -0.3, 2400, M.accent, 0.3, 0.05], [0.4, 0.1, 2800, M.vlakken[1] || M.accent, 0.4, 0.035], [-0.1, 0.55, 2400, M.vlakken[2] || M.accent, 0.22, 0.06]]
        .map(([fx, fy, s, k, a, sn]) => ({ el: maak(`<div style="position:absolute;left:${540 + fx * 1080 - s / 2}px;top:${960 + fy * 1920 - s / 2}px;width:${s}px;height:${s}px;border-radius:50%;background:radial-gradient(closest-side, ${kleur.rgba(k, donker ? a : a * 0.6)}, transparent)"></div>`, gloed), k: sn }));
      const w = maak(`<div class="laag" style="perspective:${P}px;perspective-origin:540px 960px"></div>`, sc);
      world = maak(`<div style="position:absolute;left:540px;top:960px;width:0;height:0;transform-style:preserve-3d;transform-origin:0 0"></div>`, w);
      const add = (html) => maak(html, world);
      const stipKl = kleur.rgba(donker ? M.licht : M.donker, 0.09);
      add(`<div style="position:absolute;left:-4600px;top:-6800px;width:9200px;height:13600px;transform:translateZ(-1700px);background-image:radial-gradient(circle, ${stipKl} 5px, transparent 6px);background-size:120px 120px"></div>`);
      for (let i = 0; i < 16; i++) {
        const x = -3000 + 6000 * r(), y = -4600 + 9000 * r(), z = -1400 - 250 * r(), s = 400 + 600 * r();
        const k = M.vlakken[i % M.vlakken.length], soort = i % 3;
        const vorm = ["border-radius:50%", `border-radius:${s * 0.22}px`, `border-radius:${s / 2}px;height:${s * 0.45}px`][soort];
        add(`<div style="position:absolute;left:${x - s / 2}px;top:${y - s / 2}px;width:${s}px;height:${s}px;${vorm};background:${kleur.rgba(k, donker ? 0.2 : 0.28)};transform:translateZ(${z.toFixed(0)}px) rotate(${(30 * r()).toFixed(1)}deg)"></div>`);
      }
      // de haak, op de wand
      const h = cfg.haak || {};
      hookEl = add(`<div style="position:absolute;width:840px;left:${HOOK[0] - 420}px;top:${HOOK[1] - 300}px;color:${opWereld.kl}">
        ${h.boven ? `<div class="r-tekst" style="font-size:34px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${opWereld.nadruk || opWereld.kl};opacity:.95">${R.opmaak(h.boven, false)}</div>` : ""}
        <div class="haakkop r-tekst" style="margin-top:24px;font-size:164px;line-height:.98;font-weight:800;letter-spacing:-.035em">${R.opmaak(h.kop || "", false)}</div>
        ${h.sub ? `<p class="r-tekst" style="margin:40px 0 0;font-size:50px;line-height:1.2;font-weight:500;opacity:.85">${R.opmaak(h.sub, false)}</p>` : ""}
      </div>`);
      const haakKop = hookEl.querySelector(".haakkop");
      haakKop.querySelectorAll(".hl").forEach((x) => { x.style.color = opWereld.nadruk || opWereld.kl; });
      for (let g = 164; haakKop.offsetHeight > 3 * g * 1.0 && g > 80; g -= 6) haakKop.style.fontSize = `${g - 6}px`;
      hookWs = R.woorden(haakKop);
      hookEl.style.top = `${HOOK[1] - hookEl.offsetHeight / 2}px`;

      cards = items.map((it, k) => {
        const [x, y, z] = SPOTS[k];
        const el = add(`<div class="r-kaart${it.foto ? "" : " zonder"}" style="left:${x - 470}px;top:${y - 500}px;transform:translateZ(${z}px);background:${kaartBg};color:${kaartKl}">
          <div class="aan" style="position:absolute;inset:0;border-radius:56px;border:4px solid ${opKaart.stipKleur};opacity:0"></div>
          <div class="glans" style="position:absolute;inset:0;border-radius:56px;overflow:hidden"><div style="position:absolute;top:-10%;bottom:-10%;left:0;width:60%;background:linear-gradient(105deg,transparent 30%,rgba(255,255,255,.35) 50%,transparent 70%)"></div></div>
          <div class="boven r-tekst"><span>${R.opmaak(it.boven || "", false)}</span><span class="nr">${k + 1}/${n}</span></div>
          <h2 class="r-tekst">${R.opmaak(it.kop || "", false)}</h2>
          ${it.tekst ? `<p class="r-tekst">${R.opmaak(it.tekst, false)}</p>` : ""}
        </div>`);
        if (it.foto) R.foto(el, it.foto, { focus: it.focus, b: 812, h: 520 });
        el.querySelectorAll("h2 .hl").forEach((x) => { x.style.color = opKaart.nadruk || kaartKl; if (!opKaart.nadruk) x.style.textDecoration = `underline ${M.accent} .12em`; });
        const h2 = el.querySelector("h2");
        const kopMax = it.foto ? 96 : 124, tekstMax = it.foto ? 46 : 58;
        h2.style.fontSize = `${kopMax}px`;
        for (let g = kopMax; h2.offsetHeight > 2.05 * g && g > 60; g -= 4) { h2.style.fontSize = `${g - 4}px`; }
        const pEl = el.querySelector("p");
        if (pEl) { pEl.style.fontSize = `${tekstMax}px`; for (let g = tekstMax; pEl.offsetHeight > 4 * g * 1.22 && g > 34; g -= 2) pEl.style.fontSize = `${g - 2}px`; }
        const hoog = el.offsetHeight;
        el.style.top = `${y - hoog / 2}px`;
        hold[k] = Math.min(0.94, 1160 / hoog);
        return { el, h2, ws: R.woorden(h2), p: pEl, foto: el.querySelector(".r-beeld"), aan: el.firstElementChild, glans: el.children[1].firstElementChild };
      });

      // voorgrond: ringen en vormen dicht bij de camera, niet voor de tekst
      const vrij = [HOOK, ...SPOTS.slice(0, Math.max(4, n))];
      let tries = 0;
      while (near.length < 40 && tries++ < 4000) {
        const x = -3400 + 6800 * r(), y = -4800 + 9600 * r(), z = 150 + 1000 * r(), s = 140 + 360 * r();
        if (vrij.some(([sx, sy]) => Math.abs(x - sx) < 660 && Math.abs(y - sy) < 800)) continue;
        const k = near.length % 2 ? M.accent : (M.vlakken[2] || M.licht);
        near.push({ x, y, z, s, spin: (r() - 0.5) * 16, a: 0.35 + 0.25 * r(),
          el: add(`<div style="position:absolute;left:${x - s / 2}px;top:${y - s / 2}px;width:${s}px;height:${s}px;border-radius:${near.length % 3 ? "50%" : `${s * 0.24}px`};border:${Math.max(6, s * 0.05)}px solid ${k}"></div>`) });
      }

      // laag boven de camera: voortgang, vignet, oproep
      const hud = maak(`<div class="laag"></div>`, sc);
      maak(`<div class="laag" style="background:radial-gradient(120% 75% at 50% 45%, transparent 55%, ${kleur.rgba(donker ? "#000000" : M.donker, donker ? 0.55 : 0.12)} 100%)"></div>`, hud);
      segBar = maak(`<div style="position:absolute;top:262px;left:72px;width:856px;height:10px;display:flex;gap:12px">${items.map(() => `<i style="position:relative;flex:1;border-radius:99px;overflow:hidden;background:${kleur.rgba(opWereld.kl, 0.18)}"><b style="position:absolute;left:0;top:0;bottom:0;width:0;background:${opWereld.stipKleur}"></b></i>`).join("")}</div>`, hud);
      segs = [...segBar.querySelectorAll("b")];
      scrim = maak(`<div class="laag" style="background:radial-gradient(80% 50% at 50% 46%, ${kleur.rgba(bg, 0.94)}, ${kleur.rgba(bg, 0.7)} 60%, ${kleur.rgba(bg, 0.35)});opacity:0"></div>`, hud);
      opLaag = maak(`<div class="laag" style="opacity:0"></div>`, hud);
      op = R.oproep(opLaag, { ...(cfg.oproep || {}), kleur: opWereld.kl, nadruk: opWereld.nadruk, midY: 720 });
      op.kop.el.style.setProperty("--accent", opWereld.streep);
      korrel = R.korrel(sc, 0.05);
    });

    // ---- de camera ----
    const OVER = [n > 4 ? (SPOTS[0][1] + SPOTS[n - 1][1]) / 2 : 1000, 5400];
    const POSES = {
      hook: (u) => ({ x: HOOK[0], y: HOOK[1], z: HOOK[2], D: P * (1 - 0.03 * u), yaw: 0, pitch: 0, roll: 0 }),
      card: (k, u, sec) => {
        const [x, y, z] = SPOTS[k], side = k % 2 ? -1 : 1;
        const punch = sec < 0.32 ? Math.sin(Math.PI * sec / 0.32) : 0;
        return { x, y, z, D: P / (hold[k] || 0.94) * (1.04 - 0.08 * u) * (1 - 0.06 * punch), yaw: side * (6 - 11 * u), pitch: 2 - 3 * u, roll: side * (1.2 - 2 * u) };
      },
      over: (u) => ({ x: 0, y: OVER[0], z: 0, D: OVER[1] - 400 * u, yaw: -9 + 5 * u, pitch: 10 - 4 * u, roll: -2.5 + 2 * u }),
    };
    const SHOTS = [
      { from: 0, to: FIRST - 1.4 * BEAT, pose: POSES.hook, hop: 2 },
      ...items.map((_, k) => ({ from: LAND(k), to: LAND(k) + READ(k), pose: (u, sec) => POSES.card(k, u, sec), hop: 2.4 })),
      { from: CTA, to: T - 0.5, pose: POSES.over, hop: 0 },
      { from: T, to: T + 2, pose: POSES.hook, hop: 0 },
    ];
    function shot(t) {
      for (let i = 0; i < SHOTS.length; i++) {
        const s = SHOTS[i];
        if (t >= s.from && t <= s.to) return s.pose((t - s.from) / (s.to - s.from), t - s.from);
        const nx = SHOTS[i + 1];
        if (nx && t > s.to && t < nx.from) {
          const q = (t - s.to) / (nx.from - s.to), e = flight(q), arc = Math.sin(Math.PI * q);
          const a = s.pose(1, s.to - s.from), b = nx.pose(0, 0), c = {};
          for (const key of Object.keys(a)) c[key] = a[key] + (b[key] - a[key]) * e;
          c.D += Math.min(s.hop, nx.hop) * P * arc;
          const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
          c.yaw += -dx / len * 22 * arc;
          c.pitch += dy / len * 15 * arc;
          c.roll += dx / len * 10 * arc;
          return c;
        }
      }
      return POSES.hook(0);
    }
    const moving = (t) => SHOTS.some((s, i) => SHOTS[i + 1] && t > s.to - 0.02 && t < SHOTS[i + 1].from + 0.02);
    const win = (t, a, b, fin = 0.3, fout = 0.3) => ease.uit(p(t, a, fin)) * (1 - ease.in(p(t, b, fout)));

    R.elkFrame((B, t) => {
      const c = shot(t);
      world.style.transform = `translate(-40px,-100px) translateZ(${P - c.D}px) rotateZ(${c.roll}deg) rotateX(${c.pitch}deg) rotateY(${c.yaw}deg) translate3d(${-c.x}px, ${-c.y}px, ${-c.z}px)`;
      const zoom = Math.sqrt(P / c.D);
      for (const g of glows) g.el.style.transform = `translate(${(-c.x * g.k * zoom).toFixed(1)}px, ${(-c.y * g.k * zoom).toFixed(1)}px) scale(${(0.6 + 0.4 * zoom).toFixed(3)})`;
      const camZ = c.z + c.D;
      for (const v of near) {
        const o = clamp((camZ - v.z - 500) / 500) * v.a;
        v.el.style.visibility = o > 0 ? "" : "hidden";
        if (o <= 0) continue;
        v.el.style.opacity = o.toFixed(3);
        v.el.style.transform = `translateZ(${v.z.toFixed(0)}px) rotate(${(v.spin * t).toFixed(2)}deg)`;
      }
      // haak: woorden veren binnen; in het slotoverzicht wijkt hij naar achteren
      R.woordenIn(hookWs, B, -1.6, 0.25, "veer");
      hookEl.style.opacity = (1 - 0.75 * win(t, CTA - 0.4, T + 5, 0.6, 0.3)).toFixed(3);
      // kaarten: de kaart waar de camera is licht op, de rest wacht gedimd
      const overzicht = win(t, CTA - 0.4, T - 0.4, 0.6, 0.4);
      cards.forEach((card, k) => {
        const L = LAND(k), a = win(t, L - 0.5, L + READ(k) + 0.3);
        card.el.style.opacity = ((0.45 + 0.55 * Math.max(a, overzicht)) * (1 - 0.5 * win(t, CTA, T - 0.6, 0.4, 0.3))).toFixed(3);
        card.aan.style.opacity = a.toFixed(3);
        card.el.style.boxShadow = `0 40px 120px rgba(0,0,0,.18), 0 0 ${(110 * a).toFixed(0)}px ${kleur.rgba(M.accent, 0.45 * a)}`;
        card.glans.style.transform = `translateX(${(-120 + 340 * ease.inuit(p(t, L - 0.15, 0.7))).toFixed(1)}%)`;
        R.woordenIn(card.ws, B, (L - 0.1) / BEAT, 0.25, "veer");
        if (card.p) { const u = ease.uit(p(t, L + 0.5, 0.6)); zet(card.p, { y: (1 - u) * 30, o: 0.3 + 0.7 * u }); }
        if (card.foto) R.kenBurns(card.foto, p(t, L - 0.7, READ(k) + 1.4), { van: 1.02, naar: 1.12 });
      });
      segBar.style.opacity = (1 - win(t, CTA - 0.2, T + 5, 0.3, 0.25)).toFixed(3);
      segs.forEach((s, i) => { s.style.width = t >= CTA ? "0%" : `${clamp((t - (LAND(i) - 0.5)) / stapVan[i]) * 100}%`; });
      const o = win(t, CTA - 0.1, T + 5, 0.5, 0.3);
      scrim.style.opacity = o.toFixed(3);
      opLaag.style.opacity = o > 0 ? "1" : "0";
      if (t >= CTA) R.oproepIn(op, B, CTA / BEAT + 0.5);
      korrel(B);
    });

    // ---- geluid ----
    const kb = (s) => s / BEAT;
    R.muziek([
      { van: 0, tot: kb(FIRST), soort: "intro", akk0: 0 },
      { van: kb(FIRST), tot: kb(LAND(Math.min(2, n - 1))), soort: "bouw", akk0: 0 },
      { van: kb(LAND(Math.min(2, n - 1))), tot: kb(CTA), soort: "vol", akk0: 0 },
      { van: kb(CTA), tot: kb(T) + 4, soort: "eind" },
    ]);
    items.forEach((_, k) => {
      const L = kb(LAND(k));
      R.cue(L, "whoosh", { lengte: 1.4 });
      R.cue(L, "pop", { toon: k * 2 });
    });
    R.cue(kb(CTA), "whoosh", { lengte: 1.6 });
    R.cue(kb(CTA) + 2, "sparkle");
    if (cfg.oproep?.knop) R.cue(kb(CTA) + 2, "ding");

    R.omslag(4);
    R.moment("haak", 4);
    items.forEach((_, k) => R.moment(`kaart-${k + 1}`, kb(LAND(k) + READ(k) * 0.6)));
    R.moment("oproep", kb(CTA) + 5);
    R.onscherpte(10, (B) => moving(B * BEAT));
  }

  // ======================================================================================
  // BEELD: eigen foto's en video's van de klant, met tekst in blokjes, zwiepen en zoomen op de beat.
  // ======================================================================================
  stijl.beeld = (cfg) => {
    begin(cfg);
    R.bouw(() => bouwBeeld(cfg));
  };

  function bouwBeeld(cfg) {
    const M = R.M;
    const shots = (cfg.shots || []).map((s, k) => ({ ...s, tekst: k === 0 && cfg.haak ? cfg.haak : s.tekst }));
    if (!shots.length) { R.meldingen.push("De stijl beeld heeft minstens één shot met een foto of video nodig."); return; }
    // ---- draaiboek ----
    let b = 0;
    const plan = shots.map((s, k) => {
      const n = telWoorden(s.tekst);
      let lengte = k === 0 ? Math.max(6, even(3 + n * 0.6 + 1)) : n ? even(clamp(3 + Math.ceil(n * 0.6), 4, 10)) : 4;
      if (s.video) lengte = Math.max(lengte, even(Math.min(s.video.duur / R.BEAT, 12) - 1));
      const z = { ...s, n, b0: b, tot: b + lengte, overgang: k === 0 ? null : k % 2 ? "zwiep" : "zoom" };
      b = z.tot;
      return z;
    });
    const OP = b;
    const T = OP + 8;
    R.lengte(T);
    const haakBg = M.accent, haakKl = kleur.leesbaar(haakBg, [M.licht, M.donker], 3);
    const labelBg = M.licht, labelKl = kleur.leesbaar(labelBg, [M.tekst, M.donker]);
    const nadrukOpLabel = kleur.contrast(M.accent, labelBg) >= 3 ? M.accent : null;
    let boven = null, korrel, op, opDonker, opLaag, scrim;

    R.scene(0, T + 1, (sc) => {
      sc.style.background = M.donker;
      plan.forEach((z, k) => {
        z.laag = maak(`<div class="laag"></div>`, sc);
        if (z.video) z.beeld = R.clip(z.laag, { ...z.video, van: z.b0 - 0.3 });
        else z.beeld = R.foto(z.laag, z.foto, { focus: z.focus });
        z.tekstLaag = maak(`<div class="laag"></div>`, z.laag);
      });
      scrim = maak(`<div class="laag" style="background:linear-gradient(to top, ${kleur.rgba(M.donker, 0.62)} 0%, ${kleur.rgba(M.donker, 0.25)} 30%, transparent 48%)"></div>`, sc);
      // tekst boven het verloop, per shot
      plan.forEach((z, k) => {
        if (!z.tekst) return;
        const laag = maak(`<div class="laag"></div>`, sc);
        z.labels = k === 0
          ? R.labels(laag, z.tekst, { grootte: 104, achtergrond: haakBg, kleur: haakKl, nadruk: kleur.contrast(M.licht, haakBg) >= 3 && haakKl !== M.licht ? M.licht : null, onder: 1420 })
          : R.labels(laag, z.tekst, { grootte: 78, achtergrond: labelBg, kleur: labelKl, nadruk: nadrukOpLabel, onder: 1420 });
        z.labelLaag = laag;
      });
      if (cfg.boven) boven = R.labels(sc, cfg.boven, { grootte: 40, achtergrond: kleur.rgba(M.donker, 0.55).replace(/rgba/, "rgba"), kleur: "#ffffff", y: 270 });
      opDonker = maak(`<div class="laag" style="background:${kleur.rgba(M.donker, 0.74)};opacity:0"></div>`, sc);
      opLaag = maak(`<div class="laag" style="opacity:0"></div>`, sc);
      const opKl = opVlak(M.donker);
      op = R.oproep(opLaag, { ...(cfg.oproep || {}), kleur: opKl.kl, nadruk: opKl.nadruk, midY: 720 });
      op.kop.el.style.setProperty("--accent", opKl.streep);
      korrel = R.korrel(sc, 0.06);
    }, (lb, B) => {
      plan.forEach((z, k) => {
        const volgende = plan[k + 1];
        const zichtbaar = B >= z.b0 - 0.35 && (!volgende || B < volgende.b0 + 0.35);
        z.laag.style.visibility = zichtbaar ? "visible" : "hidden";
        if (z.labelLaag) z.labelLaag.style.visibility = zichtbaar ? "visible" : "hidden";
        if (!zichtbaar) return;
        // langzaam inzoomen gedurende het hele shot
        R.kenBurns(z.beeld, p(B, z.b0 - 0.3, z.tot - z.b0 + 0.6), { van: 1.06, naar: 1.16 });
        let x = 0, s = 1, o = 1, blur = 0;
        // binnenkomen
        if (z.overgang === "zwiep") { const e = ease.snap(p(B, z.b0 - 0.3, 0.6)); x = 1080 * (1 - e); }
        if (z.overgang === "zoom") { const e = ease.uit(p(B, z.b0 - 0.25, 0.5)); s = 1.35 - 0.35 * e; o = e; }
        // weggaan
        if (volgende?.overgang === "zwiep") { const e = ease.snap(p(B, volgende.b0 - 0.3, 0.6)); x -= 1080 * e; }
        if (volgende?.overgang === "zoom") { const e = ease.in(p(B, volgende.b0 - 0.25, 0.5)); s *= 1 + 0.5 * e; blur = 14 * e; }
        // zoompunch op de tel van het knippen
        s *= 1 + 0.035 * stoot(B, z.b0, 8);
        zet(z.laag, { x, s, o, blur });
        if (z.labels) {
          R.labelsIn(z.labels, B, z.b0 + (k === 0 ? -1.3 : 0.4), 0.5);
          if (volgende) R.labelsUit(z.labels, B, volgende.b0 - 0.6);
          else R.labelsUit(z.labels, B, OP - 0.4);
          zet(z.labels.el, { x: x * 0.6, s: 1 + 0.02 * ease.zacht(p(B, z.b0, z.tot - z.b0)) });
        }
      });
      if (boven) R.labelsIn(boven, B, 0.5, 0.25);
      const u = ease.inuit(p(B, OP, 1));
      opDonker.style.opacity = u.toFixed(3);
      plan[plan.length - 1].beeld.firstElementChild.style.filter = u > 0.01 ? `blur(${(18 * u).toFixed(1)}px)` : "";
      opLaag.style.opacity = B >= OP ? "1" : "0";
      if (B >= OP) R.oproepIn(op, B, OP + 0.5);
      scrim.style.opacity = (1 - u).toFixed(3);
      korrel(B);
    });

    // ---- geluid ----
    const secties = [{ van: 0, tot: plan[1] ? plan[1].b0 : OP, soort: "groei", akk0: 0 }];
    if (plan.length > 1) {
      const midden = plan.length > 2 ? plan[2].b0 : OP;
      secties.push({ van: plan[1].b0, tot: midden, soort: "bouw", akk0: 0 });
      if (midden < OP) secties.push({ van: midden, tot: OP, soort: "vol", akk0: 0 });
    }
    secties.push({ van: OP, tot: T + 4, soort: "eind" });
    R.muziek(secties);
    plan.forEach((z, k) => {
      if (z.overgang === "zwiep") R.cue(z.b0, "swoosh", { vol: 0.9 });
      if (z.overgang === "zoom") R.cue(z.b0 + 0.1, "whoosh", { lengte: 0.8 });
      if (z.labels) z.labels.items.forEach((_, j) => R.cue(z.b0 + (k === 0 ? 0 : 0.4) + j * 0.5, "pop", { toon: j * 2, vol: 0.7 }));
    });
    R.cue(OP + 0.2, "whoosh", { lengte: 1.2 });
    R.cue(OP + 2.5, "sparkle");
    if (cfg.oproep?.knop) R.cue(OP + 2, "ding");

    const haakKlaar = (plan[0].labels ? plan[0].labels.items.length * 0.5 : 0) + 1;
    R.omslag(haakKlaar);
    R.moment("haak", haakKlaar);
    plan.slice(1).forEach((z, k) => R.moment(`shot-${k + 2}`, Math.min(z.tot - 0.7, z.b0 + 2.5)));
    R.moment("oproep", OP + 4.5);
    R.onscherpte(6, (B) => plan.some((z) => z.overgang && Math.abs(B - z.b0) < 0.35));
  }

  R.stijl = stijl;
})();
