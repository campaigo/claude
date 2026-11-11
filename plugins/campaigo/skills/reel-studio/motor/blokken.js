/*
 * Reel-studio van Campaigo: bouwstenen. Na reel.js laden. Alles hangt aan R (zie BOUWSTENEN.md).
 * Tijden in beats (B). Elke bouwsteen maakt elementen; de beweging zet je per beeld in een frame-functie.
 */
(function () {
  "use strict";
  const { maak, zet, ease, p, mix, clamp, veer, stoot, woorden, opmaak, kleur, toeval, stage } = R;

  // ---------- vlakken en vloed ----------
  /** Een vlak in één kleur over het hele beeld. */
  R.vlak = (ouder, k) => maak(`<div class="vlak" style="background:${k}"></div>`, ouder);

  /** Laat een vlak als een vloed uit een punt (x, y) binnenstromen vanaf beat b0, in d beats. Geeft de voortgang. */
  R.vloed = (el, B, b0, d = 0.8, x = 540, y = 960) => {
    const u = ease.inuit(p(B, b0, d));
    const r = Math.hypot(Math.max(x, 1080 - x), Math.max(y, 1920 - y)) * 1.02;
    el.style.visibility = B >= b0 ? "" : "hidden";
    el.style.clipPath = u >= 1 ? "none" : `circle(${(r * u).toFixed(1)}px at ${x.toFixed(1)}px ${y.toFixed(1)}px)`;
    return u;
  };

  // ---------- typografie ----------
  /**
   * Een zin zo groot als past. tekst mag *nadruk* bevatten. Opties:
   *   x (84), midY (860), breedte (816), maxHoogte (760), max (300), min (72) in px,
   *   uitlijning ("links" of "midden"), kleur, nadruk (kleur van de *nadruk*-woorden, anders de streep),
   *   klasse (extra CSS-klasse), punt (true: haalt een punt aan het eind weg, voor de stip),
   *   ruimteNa (em die achter het laatste woord vrij moet blijven, bijvoorbeeld 0.3 voor een stip),
   *   streep (false: geen streep onder de nadruk, bijvoorbeeld als een eigen stijl de nadruk zelf opmaakt).
   * Geeft { el, ws, grootte, regels, basis: { x, y } } terug; basis is het punt direct na het laatste woord,
   * op de grondlijn (daar landt de stip). ws zijn de woorden in leesvolgorde.
   */
  R.zin = (ouder, tekst, o = {}) => {
    const x = o.x ?? 84, breedte = o.breedte ?? 816, maxH = o.maxHoogte ?? 760, midY = o.midY ?? 860;
    let t = String(tekst).trim();
    let eind = "";
    if (o.punt && /[.]$/.test(t)) t = t.slice(0, -1);
    const el = maak(`<h1 class="r-zin r-tekst ${o.klasse || ""}" style="left:${x}px;top:0;width:${breedte}px;${o.uitlijning === "midden" ? "text-align:center;" : ""}${o.kleur ? `color:${o.kleur};` : ""}"></h1>`, ouder);
    el.innerHTML = opmaak(t, o.streep !== false && !o.nadruk) + eind;
    if (o.nadruk) el.querySelectorAll(".hl").forEach((h) => { h.style.color = o.nadruk; });
    const ws = woorden(el, true);
    el.style.whiteSpace = "normal";
    // grootste lettergrootte waarbij alles past: geen woord breder dan de breedte, niet hoger dan maxHoogte
    const past = (g) => {
      el.style.fontSize = `${g}px`;
      if (el.offsetHeight > maxH) return false;
      const r = el.getBoundingClientRect();
      if (!ws.every((w) => { const b = w.getBoundingClientRect(); return b.right - r.left <= breedte + 2 && b.left - r.left >= -2; })) return false;
      // ruimte achter het laatste woord vrijhouden (bijvoorbeeld voor een stip), in em
      if (o.ruimteNa && ws.length) return ws[ws.length - 1].getBoundingClientRect().right - r.left + o.ruimteNa * g <= breedte + 2;
      return true;
    };
    let lo = o.min ?? 72, hi = o.max ?? 300;
    if (!past(lo)) R.meldingen.push(`De zin "${t.slice(0, 40)}" past ook op ${lo} px niet; maak hem korter.`);
    while (hi - lo > 2) { const m = (lo + hi) >> 1; if (past(m)) lo = m; else hi = m; }
    const g = lo;
    el.style.fontSize = `${g}px`;
    // regels vastzetten, zodat bewegen niets meer verschuift
    // de delen van de zin (woord, nadruk, nadruk met leesteken), met of er een spatie voor stond
    const delen = [];
    let spatie = false;
    for (const k of [...el.childNodes]) {
      if (k.nodeType === 3) { if (/\s/.test(k.textContent)) spatie = true; continue; }
      delen.push({ el: k, spatie });
      spatie = false;
    }
    const elTop = el.getBoundingClientRect().top;
    const rijen = [];
    for (const d of delen) {
      const meet = d.el.classList.contains("m") ? d.el : d.el.querySelector(".m") || d.el;
      const top = Math.round(meet.getBoundingClientRect().top - elTop);
      let rij = rijen.find((r) => Math.abs(r.top - top) < g * 0.3);
      if (!rij) { rij = { top, items: [] }; rijen.push(rij); }
      rij.items.push(d);
    }
    const blokken = [];
    for (const r of rijen) {
      const regel = document.createElement("span");
      regel.className = "r-regel";
      for (const d of r.items) {
        if (regel.childNodes.length && d.spatie) regel.append(" ");
        regel.append(d.el);
      }
      blokken.push(regel);
    }
    el.textContent = "";
    for (const r of blokken) el.append(r);
    el.style.whiteSpace = "";
    const basis = document.createElement("span");
    basis.style.cssText = "display:inline-block;width:0;height:0";
    blokken[blokken.length - 1].append(basis);
    el.style.top = `${Math.round(midY - el.offsetHeight / 2)}px`;
    // positie in het beeld (zonder transforms van ouders)
    let bx = 0, by = 0;
    for (let e = basis; e && e !== stage; e = e.offsetParent) { bx += e.offsetLeft; by += e.offsetTop; }
    return { el, ws, grootte: g, regels: blokken.length, basis: { x: bx, y: by } };
  };

  /** Woorden laten binnenkomen vanaf beat b0, stap beats per woord (of een lijst met beats per woord). Soort: "masker", "punch" of "veer". */
  R.woordenIn = (ws, B, b0, stap = 0.5, soort = "masker", d = 0.7) => {
    ws.forEach((w, i) => {
      const b = Array.isArray(stap) ? stap[i] : b0 + i * stap;
      if (b == null) return;
      // knallen en veren schalen groter dan het woord: dan mag het masker het niet afknippen
      if (soort !== "masker" && w.parentElement.classList.contains("m")) w.parentElement.style.overflow = "visible";
      if (soort === "punch") {
        const u = ease.uit(p(B, b, 0.5));
        zet(w, { s: B >= b ? 1.18 - 0.18 * u : 1, o: B >= b ? 1 : 0 });
      } else if (soort === "veer") {
        const v = veer(B, b, 2.4, 0.42);
        zet(w, { y: (1 - v) * 70, s: mix(0.55, 1, v), r: (1 - v) * 6 * (i % 2 ? -1 : 1), o: clamp((B - b) * 6) });
      } else {
        const u = ease.uit(p(B, b, d));
        const fs = parseFloat(getComputedStyle(w).fontSize) || 100;
        zet(w, { y: (1 - u) * fs * 1.5, r: (1 - u) * 6 });
      }
    });
  };
  /** Woorden omhoog en weg laten gaan vanaf b0. */
  R.woordenUit = (ws, B, b0, d = 0.5) => {
    ws.forEach((w, i) => {
      const u = ease.in(p(B, b0 + i * 0.04, d));
      if (u <= 0) return;
      zet(w, { y: -u * 120, s: 1 - u * 0.2, o: 1 - u });
    });
  };
  /** De streep onder *nadruk* tekenen vanaf b0. */
  R.streep = (el, B, b0, d = 0.6) => {
    for (const s of el.querySelectorAll(".streep")) s.style.transform = `rotate(-2deg) scaleX(${ease.inuit(p(B, b0, d)).toFixed(4)})`;
  };
  /** Tekst die getypt wordt: cps tekens per seconde vanaf beat b0. */
  R.typen = (el, tekst, B, b0, cps = 22) => {
    const n = Math.max(0, Math.min(tekst.length, Math.floor((B - b0) * R.BEAT * cps)));
    if (el.textContent.length !== n) el.textContent = tekst.slice(0, n);
    return n >= tekst.length;
  };

  // ---------- labels (tekst in blokjes, voor op foto's) ----------
  /**
   * Regels tekst in blokjes. tekst wordt vanzelf in regels verdeeld (breedte), "\n" dwingt een nieuwe regel af.
   * Opties: x (72), y (boven) of onder (onderkant, standaard 1440), breedte (860), grootte (76),
   * achtergrond (merk licht), kleur (leesbaar), nadruk (kleur), uitlijning ("links", "midden").
   * Geeft { el, items: [{ el, ws }] }.
   */
  R.labels = (ouder, tekst, o = {}) => {
    const M = R.M;
    const bg = o.achtergrond ?? M.licht, kl = o.kleur ?? kleur.leesbaar(bg);
    const g = o.grootte ?? 76, breedte = o.breedte ?? 860, x = o.x ?? 72;
    const el = maak(`<div class="r-labels" style="left:${x}px;width:${breedte}px;${o.uitlijning === "midden" ? "align-items:center;" : ""}"></div>`, ouder);
    const proef = maak(`<span class="r-label" style="font-size:${g}px;position:absolute;visibility:hidden"></span>`, el);
    const regels = [];
    for (const deel of String(tekst).split("\n")) {
      let regel = "";
      for (const w of deel.trim().split(/[ \t\r]+/)) {
        const kandidaat = regel ? `${regel} ${w}` : w;
        proef.innerHTML = opmaak(kandidaat, false);
        if (proef.offsetWidth > breedte && regel) { regels.push(regel); regel = w; } else regel = kandidaat;
      }
      if (regel) regels.push(regel);
    }
    proef.remove();
    // een *nadruk* die over twee regels loopt, sluiten we per regel af
    let open = false;
    const items = regels.map((r) => {
      let tekstRegel = (open ? "*" : "") + r;
      const sterren = (r.match(/\*/g) || []).length;
      if ((sterren + (open ? 1 : 0)) % 2 === 1) { tekstRegel += "*"; open = true; } else open = false;
      const lab = maak(`<span class="r-label r-tekst" style="font-size:${g}px;background:${bg};color:${kl}">${opmaak(tekstRegel, false)}</span>`, el);
      // nadruk: een kleur als die goed leesbaar is, anders een eigen vlakje in een contrasterende kleur
      const vlak2 = bg === M.accent ? M.donker : M.accent;
      lab.querySelectorAll(".hl").forEach((h) => {
        if (o.nadruk) { h.style.color = o.nadruk; return; }
        h.style.cssText = `background:${vlak2};color:${kleur.leesbaar(vlak2, [M.licht, M.donker])};border-radius:.1em;padding:0 .1em;margin:0 -.04em`;
      });
      return { el: lab, ws: woorden(lab) };
    });
    const h = el.offsetHeight;
    el.style.top = `${Math.round(o.y ?? (o.onder ?? 1440) - h)}px`;
    return { el, items, hoogte: h };
  };
  /** Labels binnen laten komen: het blokje veegt open, de woorden schieten erin. stap in beats per regel. */
  R.labelsIn = (lab, B, b0, stap = 0.5) => {
    lab.items.forEach((it, i) => {
      const b = b0 + i * stap;
      const u = ease.inuit(p(B, b, 0.45));
      it.el.style.visibility = B >= b ? "" : "hidden";
      it.el.style.clipPath = u >= 1 ? "none" : `inset(-10% ${(100 * (1 - u)).toFixed(2)}% -10% 0 round .14em)`;
      it.ws.forEach((w, j) => {
        const v = ease.uit(p(B, b + 0.15 + j * 0.08, 0.5));
        zet(w, { y: (1 - v) * 30, o: v });
      });
    });
  };
  /** Labels weg: blokjes vegen dicht naar rechts. */
  R.labelsUit = (lab, B, b0, d = 0.4) => {
    lab.items.forEach((it, i) => {
      const u = ease.in(p(B, b0 + i * 0.06, d));
      if (u <= 0) return;
      it.el.style.clipPath = `inset(-10% 0 -10% ${(100 * u).toFixed(2)}% round .14em)`;
    });
  };

  // ---------- beeld ----------
  /** Foto die zijn vak vult. focus [x, y] van 0 tot 1: het punt dat in beeld moet blijven. */
  R.foto = (ouder, src, o = {}) => {
    const [fx, fy] = o.focus ?? [0.5, 0.5];
    const el = maak(`<div class="r-beeld" style="left:${o.x ?? 0}px;top:${o.y ?? 0}px;width:${o.b ?? 1080}px;height:${o.h ?? 1920}px${o.rond ? `;border-radius:${o.rond}px` : ""}"><img alt="" style="object-position:${fx * 100}% ${fy * 100}%;transform-origin:${fx * 100}% ${fy * 100}%"></div>`, ouder);
    el.firstElementChild.src = src;
    return el;
  };
  /** Langzaam inzoomen en verschuiven over u (0 tot 1). */
  R.kenBurns = (el, u, o = {}) => {
    const img = el.firstElementChild;
    const s = mix(o.van ?? 1.04, o.naar ?? 1.14, ease.zacht(clamp(u)));
    zet(img, { s, x: (o.dx ?? 0) * u, y: (o.dy ?? 0) * u });
  };

  // ---------- sfeer ----------
  /** Korrel over het beeld; beweegt een beetje per beeld, zodat het als film voelt. Geef de update-functie terug. */
  R.korrel = (ouder, sterkte = 0.07) => {
    const el = maak(`<svg class="r-korrel" style="opacity:${sterkte};left:-60px;top:-60px;width:1200px;height:2040px" xmlns="http://www.w3.org/2000/svg"><filter id="rkorrel"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#rkorrel)"/></svg>`, ouder);
    const r = toeval(99);
    const sprongen = Array.from({ length: 24 }, () => [Math.round(r() * 100 - 50), Math.round(r() * 100 - 50)]);
    const fn = (B) => { const [dx, dy] = sprongen[Math.floor(B * 4) % 24]; el.style.transform = `translate(${dx}px,${dy}px)`; };
    fn.el = el;
    return fn;
  };
  /**
   * Zwevende vormen in de merkkleuren (cirkels, pillen, afgeronde vierkanten, ringen), achter de tekst.
   * Opties: aantal (8), kleuren (merk), seed, vrij ([x, y, b, h]: hier geen vormen), dekking (0.9), grootte [min, max].
   */
  R.vormen = (ouder, o = {}) => {
    const r = toeval(o.seed ?? 7);
    const kleuren = o.kleuren ?? R.M.vlakken;
    const [gmin, gmax] = o.grootte ?? [120, 420];
    const laag = maak(`<div class="laag"></div>`, ouder);
    const lijst = [];
    let pogingen = 0;
    while (lijst.length < (o.aantal ?? 8) && pogingen++ < 400) {
      const g = gmin + (gmax - gmin) * r(), x = -100 + 1280 * r(), y = -100 + 2120 * r();
      if (o.vrij && x + g / 2 > o.vrij[0] && x - g / 2 < o.vrij[0] + o.vrij[2] && y + g / 2 > o.vrij[1] && y - g / 2 < o.vrij[1] + o.vrij[3]) continue;
      const soort = Math.floor(r() * 4), k = kleuren[lijst.length % kleuren.length];
      const vorm = ["border-radius:50%", `border-radius:${g / 2}px;height:${g * 0.42}px`, `border-radius:${g * 0.22}px`, `border-radius:50%;background:none;border:${Math.max(8, g * 0.07)}px solid ${k}`][soort];
      const el = maak(`<div style="position:absolute;left:${(x - g / 2).toFixed(0)}px;top:${(y - g / 2).toFixed(0)}px;width:${g.toFixed(0)}px;height:${g.toFixed(0)}px;background:${k};${vorm};opacity:${o.dekking ?? 0.9}"></div>`, laag);
      lijst.push({ el, fase: r() * 6.28, snel: 0.15 + r() * 0.25, amp: 14 + r() * 26, draai: (r() - 0.5) * 30 });
    }
    return { el: laag, frame(B) { for (const v of lijst) zet(v.el, { y: Math.sin(B * v.snel + v.fase) * v.amp, x: Math.cos(B * v.snel * 0.7 + v.fase) * v.amp * 0.6, r: v.draai * Math.sin(B * 0.05 + v.fase) }); } };
  };

  // ---------- oproep ----------
  /**
   * Eindkaart: kop (groot, met *nadruk*), sub, knop, afzender met logo. Gecentreerd, binnen de veilige zone.
   * Opties: kop, sub, knop, kleur (tekstkleur), midY (800). Geeft onderdelen om te bewegen; zie R.oproepIn.
   */
  R.oproep = (ouder, o = {}) => {
    const M = R.M;
    const kl = o.kleur ?? M.tekst;
    const laag = maak(`<div class="laag"></div>`, ouder);
    const kop = R.zin(laag, o.kop || "", { punt: true, ruimteNa: o.ruimteNa, x: 72, breedte: 856, maxHoogte: o.maxHoogte ?? 560, max: 220, min: 70, midY: o.midY ?? 760, uitlijning: "midden", kleur: kl, nadruk: o.nadruk });
    let y = kop.el.offsetTop + kop.el.offsetHeight + 46;
    let sub = null, knop = null, afz = null;
    if (o.sub) {
      sub = maak(`<p class="r-tekst" style="position:absolute;left:72px;width:856px;top:${y}px;margin:0;text-align:center;font-size:52px;line-height:1.2;font-weight:500;color:${kl}">${R.opmaak(o.sub, false)}</p>`, laag);
      y += sub.offsetHeight + 46;
    }
    if (o.knop) {
      knop = maak(`<div class="anker" style="left:500px;top:${y + 60}px"><span class="midden r-knop r-tekst">${R.opmaak(o.knop, false)}</span></div>`, laag);
      y += 150;
    }
    const naam = o.afzender ?? M.afzender, logo = o.logo ?? M.logo;
    if (naam || logo) {
      const yA = Math.min(1400, Math.max(y + 70, 1240));
      afz = maak(`<div class="anker" style="left:500px;top:${yA}px"><span class="midden r-afzender r-tekst" style="color:${kl};white-space:nowrap">${logo ? `<img alt="" src="${logo}">` : ""}${naam ? R.opmaak(naam, false) : ""}</span></div>`, laag);
    }
    return { el: laag, kop, sub, knop, afz };
  };
  /** Oproep binnen laten komen vanaf b0. */
  R.oproepIn = (o, B, b0) => {
    R.woordenIn(o.kop.ws, B, b0, 0.25);
    R.streep(o.kop.el, B, b0 + 1, 0.6);
    if (o.sub) { const u = ease.uit(p(B, b0 + 1, 0.8)); zet(o.sub, { y: (1 - u) * 40, o: u }); }
    if (o.knop) { const v = veer(B, b0 + 1.5, 2.2, 0.4); zet(o.knop, { s: mix(0.6, 1, v), o: clamp((B - b0 - 1.5) * 5) }); }
    if (o.afz) { const v = veer(B, b0 + 2, 2.2, 0.45); zet(o.afz, { y: (1 - v) * 30, o: clamp((B - b0 - 2) * 4) }); }
  };
})();
