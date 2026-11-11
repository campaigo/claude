/*
 * Reel-studio van Campaigo: de motor. Zet elk beeld van de Reel neer vanuit de tijd, zonder CSS-animaties, zodat
 * render.mjs elk beeld precies kan neerzetten en fotograferen. Alles staat in beats (standaard 120 BPM, 1 beat is
 * 0,5 s): beeld, geluidjes en muziek lopen zo vanzelf gelijk.
 *
 * In reel.html: <link rel="stylesheet" href="/motor/reel.css">, <div id="stage"></div>, dan /motor/reel.js,
 * /motor/blokken.js, /merk/beweging.js (de bewegingsstijl van de zaak) en een eigen script dat de Reel opbouwt.
 * De volledige uitleg staat in BOUWSTENEN.md naast deze map.
 *
 * Wat de render van de pagina leest: window.__READY__, __T__ (seconden), __seek(t), __MUZIEK__ (voor het geluid),
 * __OMSLAG__, __MOMENTEN__ (beelden om na te kijken), __SUB__ en __MOVING__(t) (bewegingsonscherpte),
 * __CLIPS__ (videofragmenten), __VEILIG__() (tekst buiten de veilige zone) en __MELDINGEN__.
 */
(function () {
  "use strict";
  const qs = new URLSearchParams(location.search);
  const RENDER = qs.has("render");
  const stage = document.getElementById("stage");
  if (!stage) throw new Error('reel.html mist <div id="stage"></div>');
  if (RENDER) document.documentElement.classList.add("render");

  // ---------- rekenen ----------
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const sx = (u) => ((ax * u + bx) * u + cx) * u;
    const sy = (u) => ((ay * u + by) * u + cy) * u;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let lo = 0, hi = 1, u = x;
      for (let i = 0; i < 22; i++) { if (sx(u) < x) lo = u; else hi = u; u = (lo + hi) / 2; }
      return sy(u);
    };
  }
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const ease = {
    uit: bezier(0.22, 1, 0.36, 1),       // binnenkomen: snel en zacht landen
    inuit: bezier(0.65, 0, 0.35, 1),     // verplaatsen
    over: bezier(0.34, 1.56, 0.64, 1),   // speels overschieten
    in: bezier(0.55, 0, 1, 0.45),        // weggaan
    snap: bezier(0.86, 0, 0.07, 1),      // camerazwiep
    zacht: bezier(0.45, 0, 0.55, 1),
    lin: (x) => clamp(x),
  };
  const p = (t, a, d) => clamp((t - a) / d);
  const mix = (a, b, u) => a + (b - a) * u;

  let BPM = 120, BEAT = 0.5;
  /** Gedempte veer in beats: 0 op b0, schiet over en komt tot rust op 1. */
  function veer(B, b0, f = 2.2, z = 0.38) {
    const s = (B - b0) * BEAT;
    if (s <= 0) return 0;
    const w = 2 * Math.PI * f, wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * s) * (Math.cos(wd * s) + (z * w / wd) * Math.sin(wd * s));
  }
  /** Korte stoot 0 -> 1 -> 0 rond b0, d in beats. */
  function puls(B, b0, d = 0.5) {
    const u = (B - b0) / d;
    return u < 0 || u > 1 ? 0 : Math.sin(Math.PI * u) * (1 - u * 0.3);
  }
  /** Klap die snel opkomt en uitsterft (voor een zoompunch of een tik). */
  function stoot(B, b0, f = 7) {
    const s = (B - b0) * BEAT;
    return s < 0 ? 0 : (1 - Math.exp(-s * 60)) * Math.exp(-s * f);
  }
  /** Vast toeval: dezelfde Reel geeft altijd dezelfde wereld. */
  function toeval(seed) {
    let s = seed >>> 0;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ---------- DOM ----------
  function tf(o) {
    let s = "";
    if (o.x || o.y || o.z) s += `translate3d(${(o.x || 0).toFixed(2)}px,${(o.y || 0).toFixed(2)}px,${(o.z || 0).toFixed(2)}px) `;
    if (o.rx || o.ry) s = "perspective(1600px) " + s;
    if (o.rx) s += `rotateX(${o.rx.toFixed(2)}deg) `;
    if (o.ry) s += `rotateY(${o.ry.toFixed(2)}deg) `;
    if (o.r) s += `rotate(${o.r.toFixed(2)}deg) `;
    const sc = o.s ?? 1, sx = (o.sx ?? 1) * sc, sy = (o.sy ?? 1) * sc;
    if (sx !== 1 || sy !== 1) s += `scale(${sx.toFixed(4)},${sy.toFixed(4)}) `;
    return s || "none";
  }
  /** Transform, dekking en vervaging in één keer: zet(el, { x, y, z, s, sx, sy, r, rx, ry, o, blur }). */
  function zet(el, o) {
    if (!el) return;
    el.style.transform = tf(o);
    if ("o" in o) el.style.opacity = clamp(o.o).toFixed(3);
    if ("blur" in o) el.style.filter = o.blur > 0.3 ? `blur(${o.blur.toFixed(1)}px)` : "";
  }
  function zicht(el, aan) { if (el) el.style.visibility = aan ? "" : "hidden"; }
  function maak(html, ouder) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    const el = t.content.firstElementChild;
    (ouder || stage).append(el);
    return el;
  }
  /** Splitst de tekst in .w-spans (ook binnen geneste spans zoals .hl) en geeft ze in leesvolgorde terug. */
  function woorden(el, masker = false) {
    const uit = [];
    (function loop(knoop) {
      for (const kind of [...knoop.childNodes]) {
        if (kind.nodeType === 3) {
          const frag = document.createDocumentFragment();
          // splitsen op gewone spaties; een harde spatie (\u00a0) houdt woorden bij elkaar ("1\u00a0december")
          for (const d of kind.textContent.split(/([ \t\n\r]+)/)) {
            if (!d) continue;
            if (/^[ \t\n\r]+$/.test(d)) { frag.append(" "); continue; }
            const w = document.createElement("span");
            w.className = "w";
            w.textContent = d;
            if (masker) {
              const m = document.createElement("span");
              m.className = "m";
              m.append(w);
              frag.append(m);
            } else frag.append(w);
            uit.push(w);
          }
          knoop.replaceChild(frag, kind);
        } else if (kind.nodeType === 1 && !kind.classList.contains("streep") && kind.tagName !== "BR" && !kind.classList.contains("w")) {
          loop(kind);
        }
      }
    })(el);
    return uit;
  }
  /** Tekst veilig in HTML, met *sterretjes* als nadruk: "Rijst *24 uur*" wordt een markering. */
  function opmaak(tekst, metStreep = true) {
    const veilig = String(tekst).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // een leesteken direct na de nadruk blijft eraan vast ("*proeven*." breekt nooit voor de punt)
    return veilig.replace(/\*([^*]+)\*([.,!?;:]*)/g, (_, s, lt) => {
      const hl = `<span class="hl">${s}${metStreep ? '<span class="streep"></span>' : ""}</span>`;
      return lt ? `<span class="nw">${hl}${lt}</span>` : hl;
    });
  }

  // ---------- kleur ----------
  function rgb(hex) {
    let h = String(hex).trim().replace(/^#/, "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`De kleur "${hex}" begrijp ik niet. Gebruik een kleurcode zoals #1F3A3D.`);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const hex = ([r, g, b]) => "#" + [r, g, b].map((c) => Math.round(clamp(c, 0, 255)).toString(16).padStart(2, "0")).join("");
  function lum(h) {
    const k = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const [r, g, b] = rgb(h);
    return 0.2126 * k(r) + 0.7152 * k(g) + 0.0722 * k(b);
  }
  function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function verzadiging(h) {
    const [r, g, b] = rgb(h).map((c) => c / 255);
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    return mx === mn ? 0 : (mx - mn) / (l > 0.5 ? 2 - mx - mn : mx + mn);
  }
  function meng(a, b, u) { const x = rgb(a), y = rgb(b); return hex(x.map((c, i) => mix(c, y[i], u))); }
  function rgba(h, a) { const [r, g, b] = rgb(h); return `rgba(${r},${g},${b},${a})`; }
  /** Beste tekstkleur op een ondergrond: de merkkleuren eerst, anders wit of bijna zwart. */
  function leesbaar(ondergrond, kandidaten, minimum = 4.5) {
    const lijst = [...(kandidaten || [MERK.tekst, MERK.licht, MERK.donker]), "#ffffff", "#16161a"];
    for (const k of lijst) if (k && contrast(k, ondergrond) >= minimum) return k;
    return lijst.reduce((a, b) => (contrast(b, ondergrond) > contrast(a, ondergrond) ? b : a));
  }
  const kleur = { rgb, hex, lum, contrast, verzadiging, meng, rgba, leesbaar };

  // ---------- merk ----------
  const INGEBOUWD = { outfit: "Outfit", "dm sans": "DM Sans", dmsans: "DM Sans" };
  const meldingen = [];
  const MERK = { achtergrond: "#f4efe6", tekst: "#1e2328", accent: "#e4572e", licht: "#ffffff", donker: "#1e2328", vlakken: [], lettertype: "Outfit", afzender: "", logo: "" };
  let merkBron = null, merkAanvulling = null;

  /** Kiest rollen uit een losse lijst merkkleuren (zoals Mijn merk die geeft). */
  function rollen(lijst) {
    const k = [...new Set(lijst.map((c) => hex(rgb(c))))];
    if (!k.length) return {};
    const opLicht = [...k].sort((a, b) => lum(b) - lum(a));
    const lichtste = opLicht[0], donkerste = opLicht[opLicht.length - 1];
    const licht = lum(lichtste) > 0.55 ? lichtste : "#ffffff";
    const donker = lum(donkerste) < 0.06 ? donkerste : meng(donkerste, "#0d0d10", lum(donkerste) < 0.2 ? 0.45 : 0.75);
    const rest = k.filter((c) => c !== lichtste || lum(c) <= 0.55).filter((c) => c !== donkerste || lum(c) >= 0.06);
    const accent = [...(rest.length ? rest : k)].sort((a, b) => verzadiging(b) * (1 - Math.abs(lum(b) - 0.3)) - verzadiging(a) * (1 - Math.abs(lum(a) - 0.3)))[0];
    return { licht, donker, tekst: donker, accent, achtergrond: licht, vlakken: k };
  }

  function zetMerk(m) {
    if (Array.isArray(m.kleuren)) Object.assign(MERK, rollen(m.kleuren));
    else if (m.kleuren) {
      const k = m.kleuren;
      for (const sleutel of ["achtergrond", "tekst", "accent", "licht", "donker"]) if (k[sleutel]) MERK[sleutel] = hex(rgb(k[sleutel]));
      if (k.vlakken) MERK.vlakken = k.vlakken.map((c) => hex(rgb(c)));
      if (!k.donker && k.tekst && lum(k.tekst) < 0.2) MERK.donker = MERK.tekst;
    }
    if (!MERK.vlakken.length) MERK.vlakken = [MERK.donker, MERK.accent, MERK.licht];
    if (m.afzender != null) MERK.afzender = m.afzender;
    if (m.logo != null) MERK.logo = m.logo ? new URL(m.logo, merkBron || location.href).href : "";
    if (m.lettertype) {
      const lt = m.lettertype;
      if (typeof lt === "string") {
        const naam = INGEBOUWD[lt.trim().toLowerCase()];
        if (naam) MERK.lettertype = naam;
        else { MERK.lettertype = "Outfit"; meldingen.push(`Het lettertype "${lt}" staat niet in de studio; Outfit gebruikt. Zet het als bestand in merk/fonts en geef het op met { naam, bestanden }.`); }
      } else if (lt.naam && lt.bestanden) {
        let css = "";
        // sleutels: "700" (vet), "500" (normaal), en met een i erachter cursief: "700i", "500i"
        for (const [sleutel, pad] of Object.entries(lt.bestanden)) {
          const url = new URL(pad, merkBron || location.href).href;
          const gewicht = parseInt(sleutel, 10), cursief = /i$/.test(sleutel);
          const bereik = gewicht >= 600 ? "600 900" : "100 599";
          css += `@font-face{font-family:"${lt.naam}";src:url("${url}");font-weight:${bereik};font-style:${cursief ? "italic" : "normal"};font-display:block}`;
        }
        const st = document.createElement("style");
        st.textContent = css;
        document.head.append(st);
        MERK.lettertype = lt.naam;
      }
    }
    MERK.accentOp = leesbaar(MERK.accent, [MERK.licht, MERK.donker], 3);
    MERK.accentTekst = contrast(MERK.accent, MERK.licht) >= 3 ? MERK.accent : MERK.donker;
    const s = document.documentElement.style;
    s.setProperty("--achtergrond", MERK.achtergrond);
    s.setProperty("--tekst", MERK.tekst);
    s.setProperty("--accent", MERK.accent);
    s.setProperty("--licht", MERK.licht);
    s.setProperty("--donker", MERK.donker);
    s.setProperty("--accent-op", MERK.accentOp);
    s.setProperty("--accent-tekst", MERK.accentTekst);
    s.setProperty("--font", `"${MERK.lettertype}", "Outfit", system-ui, sans-serif`);
  }

  // ---------- tijdlijn ----------
  const scenes = [];
  const elkFrame = [];
  const bouwers = [];
  const cues = [];
  const momenten = [];
  const clips = [];
  let secties = [], muziekOpties = {};
  let T = 15, omslagT = null, SUB = 2, beweegt = null, laden = [];

  function frame(t) {
    const B = t / BEAT;
    for (const f of elkFrame) f(B, t);
    for (const sc of scenes) {
      const aan = B >= sc.van && B < sc.tot;
      sc.el.style.visibility = aan ? "" : "hidden";
      if (aan) sc.frame?.(B - sc.van, B, sc);
    }
    for (const c of clips) zetClip(c, t);
  }

  function zetClip(c, t) {
    const lokaal = t - c.van * BEAT;
    if (RENDER) {
      const n = Math.max(1, Math.min(c.frames, Math.floor(lokaal * 30 * c.snelheid) + 1));
      const src = `export/frames/${c.naam}/${String(n).padStart(4, "0")}.jpg`;
      if (c.img.getAttribute("src") !== src) {
        c.img.setAttribute("src", src);
        laden.push(c.img.decode().catch(() => meldingen.push(`Beeld ${src} laadt niet.`)));
      }
    } else {
      const doel = c.start + clamp(lokaal * c.snelheid, 0, c.duur - 0.05);
      const v = c.video;
      if (R.speelt && lokaal >= 0 && lokaal < c.duur / c.snelheid) {
        if (v.paused) v.play().catch(() => {});
        if (Math.abs(v.currentTime - doel) > 0.3) v.currentTime = doel;
      } else {
        if (!v.paused) v.pause();
        if (Math.abs(v.currentTime - doel) > 0.04) v.currentTime = doel;
      }
    }
  }

  // ---------- veilige zone ----------
  const VEILIG = { l: 60, r: 940, b: 240, o: 1480 };
  function dekking(el) {
    let o = 1;
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.visibility === "hidden" || cs.display === "none") return 0;
      o *= +cs.opacity;
    }
    return o;
  }
  // het zichtbare deel van een woord: geknipt door zijn masker, in beeldcoördinaten
  function zichtbaarVak(w, st, k) {
    const r = w.getBoundingClientRect();
    let l = r.left, rr = r.right, b = r.top, o = r.bottom;
    const m = w.parentElement;
    if (m && m.classList.contains("m") && getComputedStyle(m).overflow !== "visible") {
      const q = m.getBoundingClientRect();
      l = Math.max(l, q.left); rr = Math.min(rr, q.right); b = Math.max(b, q.top); o = Math.min(o, q.bottom);
    }
    if (rr - l < 2 || o - b < 2) return null;
    return { l: (l - st.left) / k, r: (rr - st.left) / k, b: (b - st.top) / k, o: (o - st.top) / k, deel: ((rr - l) * (o - b)) / Math.max(1, r.width * r.height) };
  }
  /** Delen die nu echt te zien zijn: per woord (met masker), of het hele element (data-veilig, tekst zonder woorden). */
  function zichtbareDelen() {
    const st = stage.getBoundingClientRect(), k = st.width / 1080, uit = [];
    for (const el of stage.querySelectorAll(".r-tekst, [data-veilig]")) {
      if (el.parentElement && el.parentElement.closest(".r-tekst")) continue;   // binnen een ander tekstblok: telt daar mee
      if (el.closest("[data-niet-controleren]")) continue;                      // bijvoorbeeld een kopie voor een overgang
      if (dekking(el) < 0.6) continue;
      const ws = [...el.querySelectorAll(".w")];
      const vakken = [];
      if (ws.length) {
        for (const w of ws) {
          if (dekking(w) < 0.6) continue;
          const v = zichtbaarVak(w, st, k);
          if (v) vakken.push({ ...v, tekst: w.textContent });
        }
      } else {
        const rr = el.getBoundingClientRect();
        if (rr.width >= 2 && rr.height >= 2) vakken.push({ l: (rr.left - st.left) / k, r: (rr.right - st.left) / k, b: (rr.top - st.top) / k, o: (rr.bottom - st.top) / k, deel: 1, tekst: el.textContent.trim() || el.dataset.veilig || "vorm" });
      }
      const inBeeld = vakken.filter((v) => !(v.r < 0 || v.l > 1080 || v.o < 0 || v.b > 1920) && v.r - v.l < 4000 && v.o - v.b < 6000);
      if (inBeeld.length) uit.push({ el, vakken: inBeeld });
    }
    return uit;
  }
  function buitenVeilig() {
    const fout = [];
    for (const { el, vakken } of zichtbareDelen()) {
      const l = Math.min(...vakken.map((v) => v.l)), rr = Math.max(...vakken.map((v) => v.r));
      const b = Math.min(...vakken.map((v) => v.b)), o = Math.max(...vakken.map((v) => v.o));
      const kanten = [];
      if (l < VEILIG.l - 4) kanten.push(`links ${Math.round(VEILIG.l - l)} px`);
      if (rr > VEILIG.r + 4) kanten.push(`rechts ${Math.round(rr - VEILIG.r)} px`);
      if (b < VEILIG.b - 4) kanten.push(`boven ${Math.round(VEILIG.b - b)} px`);
      if (o > VEILIG.o + 4) kanten.push(`onder ${Math.round(o - VEILIG.o)} px`);
      const naam = el.dataset.veilig || (el.innerText || el.textContent).replace(/\s+/g, " ").trim().slice(0, 60);
      if (kanten.length) fout.push({ tekst: naam, buiten: kanten.join(", ") });
    }
    return fout;
  }
  /** De tekst die nu leesbaar in beeld staat (woorden die minstens voor de helft te zien zijn). */
  function tekstNu() {
    return zichtbareDelen().map(({ vakken }) => vakken.filter((v) => v.deel > 0.5 && v.tekst !== "vorm").map((v) => v.tekst).join(" ")).filter(Boolean).join(" / ");
  }

  // ---------- de motor naar buiten ----------
  const R = {
    RENDER, stage, ease, bezier, clamp, p, mix, veer, puls, stoot, toeval, tf, zet, zicht, maak, woorden, opmaak, kleur, rollen,
    VEILIG, M: MERK, meldingen, speelt: false,
    get BEAT() { return BEAT; },
    get BPM() { return BPM; },
    get T() { return T; },
    /** Merk: { kleuren: [lijst] of { achtergrond, tekst, accent, licht, donker, vlakken }, lettertype, afzender, logo }, of de URL van merk.json. */
    merk(m, aanvulling) {
      // aanvulling: iets dat voor deze Reel anders is dan merk.json, bijvoorbeeld een ander lettertype in een proefje
      if (typeof m === "string") { merkBron = new URL(m, location.href).href; merkAanvulling = aanvulling || null; return; }
      zetMerk(m);
    },
    tempo(bpm) { BPM = bpm; BEAT = 60 / bpm; },
    /** Lengte van de Reel in beats. */
    lengte(beats) { T = beats * BEAT; },
    scene(van, tot, maakFn, frameFn) {
      const el = maak(`<div class="scene"></div>`);
      const sc = { van, tot, el, frame: frameFn };
      maakFn?.(el, sc);
      scenes.push(sc);
      return sc;
    },
    /** Wordt elk beeld aangeroepen met (B, t): B in beats, t in seconden. */
    elkFrame(fn) { elkFrame.push(fn); },
    /** Bouwt de Reel pas als het merk en de lettertypen er zijn (tekst meten kan dan). */
    bouw(fn) { bouwers.push(fn); },
    cue(b, soort, opts = {}) { cues.push({ b: +(+b).toFixed(4), soort, ...opts }); },
    /** Muziek in secties: [{ van, tot, soort }] in beats; opties { toon: halve tonen hoger, variant: 0 tot 3, geluid: "muziek" | "effecten" | "stil" }. */
    muziek(s, opties = {}) { secties = s; muziekOpties = { ...muziekOpties, ...opties }; },
    geluid(soort) { muziekOpties.geluid = soort; },
    omslag(b) { omslagT = b * BEAT; },
    moment(naam, b) { momenten.push({ naam, t: +(b * BEAT).toFixed(3) }); },
    /** Bewegingsonscherpte: sub beelden per beeld; beweegtFn(B) zegt wanneer (zonder: altijd). */
    onscherpte(sub, beweegtFn) { SUB = Math.max(1, Math.round(sub)); beweegt = beweegtFn || null; },
    /** Videofragment van de klant: R.clip(ouder, { bron, start, duur, van (beat), snelheid }). */
    clip(ouder, o) {
      const naam = `clip${clips.length + 1}`;
      const el = maak(`<div class="r-beeld" style="left:0;top:0;width:100%;height:100%"></div>`, ouder);
      const c = { naam, bron: o.bron, start: o.start ?? 0, duur: o.duur, van: o.van ?? 0, snelheid: o.snelheid ?? 1, el };
      c.frames = Math.ceil(c.duur * 30) + 1;
      if (RENDER) c.img = maak(`<img alt="">`, el);
      else {
        c.video = maak(`<video muted playsinline preload="auto"></video>`, el);
        c.video.src = new URL(o.bron, location.href).href;
      }
      clips.push(c);
      return el;
    },
    async klaar() {
      if (R._klaar) return;
      R._klaar = true;
      if (merkBron) {
        try {
          const m = await (await fetch(merkBron)).json();
          zetMerk({ ...m, ...(merkAanvulling || {}) });
        } catch (e) { meldingen.push(`merk.json laadt niet: ${e.message}`); zetMerk({}); }
      } else if (!MERK.accentOp) zetMerk({});
      await Promise.all(["400", "500", "700", "800"].map((w) => document.fonts.load(`${w} 100px "${MERK.lettertype}"`)));
      await document.fonts.ready;
      for (const b of bouwers) await b();
      await Promise.all([...stage.querySelectorAll("img")].filter((i) => i.getAttribute("src")).map((i) => i.decode().catch(() => meldingen.push(`Beeld ${i.getAttribute("src")} laadt niet.`))));
      window.__T__ = T;
      window.__MUZIEK__ = { T, bpm: BPM, secties, cues, ...muziekOpties };
      window.__OMSLAG__ = omslagT ?? Math.min(1.5, T / 2);
      window.__MOMENTEN__ = momenten.length ? momenten : [{ naam: "begin", t: 1 }, { naam: "midden", t: T / 2 }, { naam: "eind", t: T - 1 }];
      window.__SUB__ = SUB;
      window.__MOVING__ = beweegt ? (t) => !!beweegt(t / BEAT) : null;
      window.__CLIPS__ = clips.map(({ naam, bron, start, duur, snelheid }) => ({ naam, bron, start, duur: duur, snelheid }));
      window.__MELDINGEN__ = meldingen;
      window.__VEILIG__ = buitenVeilig;
      window.__TEKSTNU__ = tekstNu;
      await window.__seek(0);
      window.__READY__ = true;
      if (!RENDER) {
        const s = document.createElement("script");
        s.src = "/motor/speler.js";
        document.body.append(s);
      }
    },
  };
  R.frame = frame;
  window.__seek = async (t) => {
    frame(t);
    const wacht = laden;
    laden = [];
    await Promise.all(wacht);
    // een tekenronde afwachten: zonder die ronde ontbreekt een foto in een 3D-laag soms op het eerste beeld waarop hij verschijnt
    if (RENDER) await new Promise((ok) => requestAnimationFrame(() => ok()));
  };
  window.R = R;
  // vanzelf klaar als de pagina geladen is; een eigen script hoeft R.klaar() dus niet aan te roepen
  addEventListener("load", () => R.klaar().catch((e) => { meldingen.push(e.message); console.error(e); window.__FOUT__ = e.message; }));
})();
