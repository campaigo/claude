/*
 * Reel-studio van Campaigo: muziek en geluidjes, helemaal door code gemaakt (geen rechten van anderen nodig).
 * Werkt in de browser (het voorbeeld met geluid, speler.js) en in Node (render.mjs maakt er een WAV van).
 *
 *   ReelGeluid.maak({ T, bpm, secties, cues, toon, variant, geluid })  ->  { sr, l, r }  (Float32Array per kanaal)
 *   ReelGeluid.wav({ sr, l, r })                                        ->  Uint8Array met een WAV-bestand
 *
 * De Reel geeft dit zelf door (window.__MUZIEK__): de lengte, de secties van de muziek en alle geluidjes, in beats.
 * Muziek: vier akkoorden (een per maat), standaard D A Bm G; "toon" zet alles een aantal halve tonen hoger,
 * "variant" (0 tot 3) kiest een andere volgorde van de akkoorden. "geluid": "muziek" (standaard), "effecten"
 * (alleen de geluidjes, voor als er muziek van Instagram onder komt) of "stil".
 * Secties (soort): intro, bouw, vol, stil, eind, puls, groei, nacht. Zie BOUWSTENEN.md voor wat elk doet.
 * Geluidjes (soort): tik, pop, whoosh, swoosh, klik, ding, impact, riser, hartje, sparkle, stempel, hart, klok,
 * dicht, inzuig, druppel, fietsbel, ratel (lengte in beats), knip (schaar). Opties per geluidje: vol, pan (-1 tot 1), toon, lengte, dt (seconden).
 * "klank": "stevig" (standaard: zaagstoten, marimba, clap), "warm" (elektrische piano, vibrafoon, ronde bas, vingerknip)
 * of "fris" (plukjes, heldere melodie, veel hihat). Zo klinkt elk merk anders.
 * Omgezet uit geluid.py van de lanceringsvideo's van Campaigo.
 */
(function (root) {
  "use strict";
  const SR = 48000;

  function maak(cfg) {
    const BPM = cfg.bpm || 120, BEAT = 60 / BPM, BAR = 4 * BEAT;
    const T = +cfg.T;
    const LEN = Math.floor(SR * (T + 2.5));
    const modus = cfg.geluid || "muziek";
    const TOON = Math.round(cfg.toon || 0);
    const VOLGORDE = [[0, 1, 2, 3], [2, 3, 0, 1], [0, 2, 3, 1], [3, 0, 1, 2]][((cfg.variant || 0) % 4 + 4) % 4];
    const uit = { sr: SR, l: new Float32Array(Math.floor(SR * T)), r: new Float32Array(Math.floor(SR * T)) };
    if (modus === "stil") return uit;

    // vast toeval, zodat dezelfde Reel altijd hetzelfde klinkt
    let zaad = 7 >>> 0;
    const rnd = () => { zaad = (zaad + 0x6d2b79f5) >>> 0; let t = zaad; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const gauss = () => { const u = Math.max(1e-12, rnd()), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

    const spoor = () => [new Float32Array(LEN), new Float32Array(LEN)];
    const muziek = spoor(), zij = spoor(), fx = spoor();
    const kicks = [];

    // ---------- bouwstenen ----------
    const N = (d) => Math.max(1, Math.floor(SR * d));
    const hz = (m) => 440 * 2 ** ((m + TOON - 69) / 12);
    function leg(sp, t, sig, vol = 1, pan = 0) {
      const i = Math.round(t * SR);
      if (i >= LEN) return;
      if (Array.isArray(sig)) {
        for (let c = 0; c < 2; c++) { const s = sig[c], d = sp[c]; for (let k = Math.max(0, -i); k < s.length && i + k < LEN; k++) d[i + k] += s[k] * vol; }
        return;
      }
      const gl = Math.sqrt((1 - pan) / 2) * vol, gr = Math.sqrt((1 + pan) / 2) * vol;
      const L = sp[0], Rr = sp[1];
      for (let k = Math.max(0, -i); k < sig.length && i + k < LEN; k++) { L[i + k] += sig[k] * gl; Rr[i + k] += sig[k] * gr; }
    }
    function ruis(d) { const x = new Float32Array(N(d)); for (let i = 0; i < x.length; i++) x[i] = gauss(); return x; }
    function glad(x, n) {
      if (n <= 1) return x;
      const y = new Float32Array(x.length), h = (n - 1) >> 1;
      let s = 0;
      for (let i = -n; i < x.length; i++) {
        const nieuw = i + h, oud = i + h - n;
        if (nieuw >= 0 && nieuw < x.length) s += x[nieuw];
        if (oud >= 0 && oud < x.length) s -= x[oud];
        if (i >= 0) y[i] = s / n;
      }
      return y;
    }
    function hoog(x) { const y = new Float32Array(x.length); let v = 0; for (let i = 0; i < x.length; i++) { y[i] = x[i] - v; v = x[i]; } return y; }
    function maal(x, f) { for (let i = 0; i < x.length; i++) x[i] *= f(i / SR, i); return x; }
    function som(...delen) { const y = new Float32Array(Math.max(...delen.map((x) => x.length))); for (const x of delen) for (let i = 0; i < x.length; i++) y[i] += x[i]; return y; }
    function piek(x) { let m = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > m) m = a; } return m || 1; }
    function omhul(d, aan = 0.003, verval = 6, uitd = 0.02) {
      const x = new Float32Array(N(d));
      for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = Math.min(1, t / aan) * Math.exp(-t * verval) * Math.max(0, Math.min(1, (d - t) / uitd)); }
      return x;
    }
    // sinus met dempende omhullende, via rotatie (snel): som van harmonischen
    const cache = new Map();
    function zaag(f, d, harm = 14, verval = 4, helder = 1, detune = 0) {
      const sleutel = `${f.toFixed(3)}|${d}|${harm}|${verval}|${helder}|${detune}`;
      if (cache.has(sleutel)) return cache.get(sleutel);
      const n = N(d), x = new Float32Array(n);
      for (let k = 1; k <= harm; k++) {
        if (k * f > 14000) break;
        const w = 2 * Math.PI * k * f * (1 + detune) / SR, c = Math.cos(w), s = Math.sin(w);
        const rate = Math.exp(-(verval * 0.2 + k * verval * 0.35 / helder) / SR);
        let re = Math.cos(k), im = Math.sin(k), e = 1 / k;
        for (let i = 0; i < n; i++) {
          x[i] += im * e;
          const nre = re * c - im * s; im = re * s + im * c; re = nre;
          e *= rate;
        }
      }
      cache.set(sleutel, x);
      return x;
    }
    function sinus(f, d, verval, fase = 0, amp = 1) {
      const n = N(d), x = new Float32Array(n);
      const w = 2 * Math.PI * f / SR, c = Math.cos(w), s = Math.sin(w), rate = Math.exp(-verval / SR);
      let re = Math.cos(fase), im = Math.sin(fase), e = amp;
      for (let i = 0; i < n; i++) { x[i] = im * e; const nre = re * c - im * s; im = re * s + im * c; re = nre; e *= rate; }
      return x;
    }
    function marimba(f, d = 0.7) {
      const x = som(sinus(f, d, 7), sinus(f * 3.93, d, 26, 0, 0.35), sinus(f * 9.2, d, 60, 0, 0.12));
      return maal(x, (t) => Math.min(1, t / 0.002));
    }
    function bel(f, d = 1.6) {
      const x = som(...[[1, 1, 3.2], [2.0, 0.5, 4.5], [2.76, 0.35, 6], [5.4, 0.18, 11], [8.93, 0.08, 18]].map(([r, a, v]) => sinus(f * r, d, v, 0, a)));
      return maal(x, (t) => Math.min(1, t / 0.001));
    }
    // toon met verlopende frequentie: fase = 2 pi som(f) / SR
    function glij(d, fFn, ampFn) {
      const n = N(d), x = new Float32Array(n);
      let fase = 0;
      for (let i = 0; i < n; i++) { const t = i / SR; fase += 2 * Math.PI * fFn(t) / SR; x[i] = Math.sin(fase) * ampFn(t); }
      return x;
    }
    function kick(zwaar = 1) {
      const x = glij(0.42, (t) => 46 + 110 * Math.exp(-t * 28), (t) => Math.exp(-t * 7.5) * zwaar);
      const klik = maal(glad(ruis(0.006), 3), (t) => Math.exp(-t * 500));
      for (let i = 0; i < klik.length; i++) x[i] += 0.5 * klik[i];
      for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * 1.6);
      return x;
    }
    function clap() {
      const d = 0.32, x = new Float32Array(N(d));
      [0, 0.011, 0.022].forEach((off, k) => {
        const n = maal(hoog(glad(ruis(0.03), 2)), (t) => Math.exp(-t * 120));
        const i = Math.floor(off * SR);
        for (let j = 0; j < n.length && i + j < x.length; j++) x[i + j] += n[j] * (k < 2 ? 0.8 : 1);
      });
      const staart = maal(hoog(glad(ruis(d), 3)), (t) => Math.exp(-t * 13) * 0.6);
      for (let i = 0; i < x.length; i++) x[i] = (x[i] + staart[i]) * 0.9;
      return x;
    }
    function hat(open = false) {
      const d = open ? 0.16 : 0.045;
      return maal(hoog(hoog(ruis(d))), (t) => Math.exp(-t * (open ? 24 : 95)) * 0.22);
    }
    function pad(noten, d) {
      const n = N(d), l = new Float32Array(n), r = new Float32Array(n);
      for (const m of noten) {
        const f = hz(m);
        const a = sinus(f * 0.997, d, 0), b = sinus(2 * f, d, 0, 1, 0.25), c = sinus(f * 1.003, d, 0, 0.5), e = sinus(2 * f * 1.002, d, 0, 0, 0.25);
        for (let i = 0; i < n; i++) { l[i] += a[i] + b[i]; r[i] += c[i] + e[i]; }
      }
      for (let i = 0; i < n; i++) { const t = i / SR, v = Math.min(1, t / 0.35) * Math.max(0, Math.min(1, (d - t) / 0.4)) / noten.length; l[i] *= v; r[i] *= v; }
      return [l, r];
    }
    const maalOm = (sig, env) => { const y = new Float32Array(Math.min(sig.length, env.length)); for (let i = 0; i < y.length; i++) y[i] = sig[i] * env[i]; return y; };
    const subDreun = (d) => glij(d, (t) => 38 + 30 * Math.exp(-t * 6), (t) => Math.exp(-t * 2.4));

    // ---------- klankkleur: elk merk zijn eigen instrumenten ----------
    const KLANK = cfg.klank || "stevig";
    const WARM = KLANK === "warm", FRIS = KLANK === "fris";
    // zachte elektrische piano: grondtoon, boventonen en een lichte tremolo
    function epiano(f, d = 1.2) {
      const x = som(sinus(f, d, 2.2), sinus(f * 2, d, 5, 0.3, 0.35), sinus(f * 3.01, d, 9, 0, 0.12));
      return maal(x, (t) => Math.min(1, t / 0.004) * (1 + 0.12 * Math.sin(2 * Math.PI * 5.2 * t)));
    }
    function vibrafoon(f, d = 1.4) {
      return maal(som(sinus(f, d, 2.6), sinus(f * 4, d, 9, 0, 0.18), sinus(f * 10.2, d, 30, 0, 0.05)), (t) => Math.min(1, t / 0.002) * (1 + 0.25 * Math.sin(2 * Math.PI * 6 * t)));
    }
    const pluk = (f, d = 0.3) => maalOm(zaag(f, d, 12, 16), omhul(d, 0.002, 9, 0.03));
    function snap() {
      const n = maal(hoog(glad(ruis(0.06), 2)), (t) => Math.exp(-t * 90));
      const toon = sinus(1800, 0.05, 80, 0, 0.3);
      for (let i = 0; i < toon.length && i < n.length; i++) n[i] += toon[i];
      return n;
    }

    // ---------- muziek ----------
    const AKK0 = [[38, [62, 66, 69, 74]], [45, [61, 64, 69, 73]], [47, [62, 66, 71, 74]], [43, [62, 67, 71, 74]]];
    const MEL0 = [
      [78, null, 81, null, 83, 81, null, 78],
      [76, null, 81, null, 85, 83, null, 81],
      [74, null, 78, null, 83, 81, null, 78],
      [79, null, 83, null, 86, null, 83, 81],
    ];
    const AKK = VOLGORDE.map((i) => AKK0[i]);
    const MEL = VOLGORDE.map((i) => MEL0[i]);
    const STOOT = [0, 3, 6, 8, 11, 14];
    const secties = cfg.secties || [];
    const sectieBij = (b) => secties.find((s) => s.van <= b && b < s.tot) || null;

    function maakMuziek() {
      const nbeats = Math.ceil(T / BEAT) + 1;
      for (let z = 0; z < nbeats * 4; z++) {
        const b = z / 4, t = b * BEAT;
        if (t >= T) break;
        const sec = sectieBij(b);
        if (!sec) continue;
        const soort = sec.soort;
        let maat = Math.floor(b / 4);
        if ("akk0" in sec) maat = Math.floor((b - sec.van) / 4) + sec.akk0;
        const [bas, akkoord] = AKK[((maat % 4) + 4) % 4];
        const inMaat = z % 16, opTel = z % 4 === 0, tel = Math.floor(b) % 4;

        const ritme = soort === "bouw" || soort === "vol";
        if (ritme && opTel) { leg(muziek, t, kick(WARM ? 0.75 : 1), WARM ? 0.7 : 0.95); kicks.push(t); }
        if (soort === "intro" && opTel && tel === 0) { leg(muziek, t, kick(0.55), 0.5); kicks.push(t); }
        if (soort === "vol" && opTel && (tel === 1 || tel === 3)) {
          if (WARM) leg(muziek, t, snap(), 0.4, 0.1);
          else leg(muziek, t, clap(), FRIS ? 0.6 : 0.55, 0.05);
        }
        // hihats: warm alleen op de tussentel, fris op elke zestiende
        if (soort === "vol") {
          const open = z % 4 === 2;
          if (WARM) { if (open) leg(muziek, t, hat(false), 0.45, 0.25); }
          else leg(muziek, t, hat(open), open ? 0.9 : (z % 2 ? 0.55 : FRIS ? 0.5 : 0.35), 0.25);
        }
        else if (soort === "bouw" && z % 2 === 0) leg(muziek, t, hat(z % 4 === 2), WARM ? 0.35 : 0.6, 0.25);
        else if (soort === "intro" && z % 4 === 2) leg(muziek, t, hat(false), 0.35, 0.3);
        // bas: warm een ronde lage toon per tel, anders achtsten met een octaaf op de tussentel
        if (ritme && WARM && opTel) leg(zij, t, maalOm(zaag(hz(bas), 0.45, 2, 4), omhul(0.45, 0.006, 3, 0.06)), 0.55);
        if (ritme && !WARM && z % 2 === 0) {
          const m = bas + (z % 4 === 2 ? 12 : 0);
          leg(zij, t, maalOm(zaag(hz(m), 0.24, 10, 9), omhul(0.24, 0.004, 4, 0.04)), 0.42);
        }
        // akkoorden: warm een elektrische piano, fris plukjes een octaaf hoger, stevig korte zaagstoten
        if (ritme && WARM && [0, 6, 10].includes(inMaat)) akkoord.forEach((m, i) => leg(zij, t + i * 0.012, epiano(hz(m), 1.1), 0.07, -0.35 + i * 0.23));
        if (ritme && FRIS && STOOT.includes(inMaat)) akkoord.forEach((m, i) => leg(zij, t, pluk(hz(m + 12), 0.28), 0.055, -0.4 + i * 0.27));
        if (ritme && !WARM && !FRIS && STOOT.includes(inMaat)) {
          akkoord.forEach((m, i) => { for (const dt of [-0.006, 0.006]) leg(zij, t, maalOm(zaag(hz(m), 0.22, 9, 10, 1, dt), omhul(0.22, 0.003, 7, 0.05)), 0.075, -0.4 + i * 0.27); });
        }
        if (soort === "intro" && [0, 6, 12].includes(inMaat)) akkoord.forEach((m, i) => leg(zij, t + i * 0.035, WARM ? vibrafoon(hz(m), 0.9) : marimba(hz(m), 0.6), WARM ? 0.11 : 0.14, -0.3 + i * 0.2));
        if (soort === "vol" && z % 2 === 0) {
          const noot = MEL[((maat % 4) + 4) % 4][(z >> 1) % 8];
          if (noot) {
            const stem = WARM ? vibrafoon(hz(noot - 12), 0.9) : FRIS ? pluk(hz(noot), 0.3) : marimba(hz(noot), 0.55);
            leg(muziek, t, stem, WARM ? 0.24 : FRIS ? 0.2 : 0.28, 0.15);
            leg(fx, t + BEAT * 0.75, WARM ? vibrafoon(hz(noot - 12), 0.6) : marimba(hz(noot), 0.4), 0.06, -0.4);
          }
        }
        if ((soort === "intro" || soort === "stil") && inMaat === 0) leg(zij, t, pad(akkoord, BAR + 0.1), 0.22);
        if (soort === "stil" && inMaat === 0) leg(fx, t, bel(hz(akkoord[3] + 12), 1.4), 0.12, 0.2);

        const uSec = (b - sec.van) / Math.max(0.001, sec.tot - sec.van);
        if (soort === "puls") {
          if (opTel) leg(fx, t, gKlok(), 0.16, tel % 2 ? 0.3 : -0.3);
          if (opTel && tel % 2 === 0) leg(muziek, t, gHart(), 0.8);
          if (inMaat === 0) {
            leg(zij, t, pad([50, 57, 62, 69], BAR + 0.1), 0.17);
            leg(zij, t, maalOm(zaag(hz(38), BAR, 4, 0.6), omhul(BAR, 0.3, 0.4, 0.4)), 0.16);
          }
        }
        if (soort === "groei") {
          if (opTel && (tel === 0 || tel === 2)) { leg(muziek, t, kick(0.7), 0.55); kicks.push(t); }
          const stap = uSec < 0.55 ? 2 : 1;
          if (z % stap === 0) {
            const tonen = [akkoord[0], akkoord[1], akkoord[2], akkoord[3], akkoord[1] + 12, akkoord[2] + 12];
            const i = Math.floor(z / stap) % tonen.length;
            leg(zij, t, marimba(hz(tonen[i]), 0.45), 0.09 + 0.09 * uSec, -0.35 + 0.35 * (i % 3));
          }
          if (z % 2 === 1) leg(muziek, t, hat(false), 0.15 + 0.35 * uSec, 0.3);
          if (opTel) leg(zij, t, maalOm(zaag(hz(bas), 0.42, 8, 6), omhul(0.42, 0.004, 3, 0.06)), 0.12 + 0.3 * uSec);
          if (inMaat === 0) leg(zij, t, pad(akkoord, BAR + 0.1), 0.14 + 0.08 * uSec);
        }
        if (soort === "nacht") {
          if (opTel && tel === 0) { leg(muziek, t, kick(0.95), 0.85); kicks.push(t); }
          if (opTel && tel === 2) leg(fx, t, clap(), 0.4, 0.05);
          if (z % 2 === 0) leg(muziek, t, hat(z % 8 === 4), 0.3, 0.25);
          if (inMaat === 0) {
            leg(zij, t, maalOm(zaag(hz(bas), BAR, 6, 0.9), omhul(BAR, 0.01, 0.7, 0.3)), 0.3);
            leg(zij, t, pad(akkoord, BAR + 0.1), 0.2);
          }
          const patroon = [0, null, 2, null, 1, 3, null, 2];
          if (z % 2 === 0) { const i = patroon[(z >> 1) % 8]; if (i != null) leg(fx, t, bel(hz(akkoord[i] + 12), 1.0), 0.05, -0.3 + 0.2 * i); }
        }
      }
      // eind: slotakkoord op de grondtoon, met dreun en belletjes
      for (const s of secties) {
        if (s.soort !== "eind") continue;
        const t0 = s.van * BEAT;
        const [, akkoord] = AKK0[0];
        leg(muziek, t0, kick(1.3), 1.0);
        leg(muziek, t0, subDreun(1.6), 0.7);
        [...akkoord, 86].forEach((m, i) => { for (const dt of [-0.007, 0, 0.007]) leg(zij, t0, maalOm(zaag(hz(m), 2.4, 10, 1.4, 1, dt), omhul(2.4, 0.004, 1.1, 0.4)), 0.05, -0.5 + i * 0.25); });
        leg(zij, t0, pad(akkoord, Math.max(0.5, T - t0 + 0.4)), 0.24);
        leg(zij, t0, maalOm(zaag(hz(26), 1.2, 8, 2.5), omhul(1.2, 0.004, 2, 0.2)), 0.5);
        [86, 90, 93, 98].forEach((m, k) => leg(fx, t0 + 0.5 + k * BEAT / 2, bel(hz(m), 1.3), 0.11, -0.3 + k * 0.2));
      }
    }

    // ---------- geluidjes ----------
    function gTik() {
      const x = maal(glad(ruis(0.012), 2), (t) => Math.exp(-t * 420) * 0.5);
      const f = 2600 + 1000 * rnd();
      const toon = sinus(f, 0.01, 600, 0, 0.25 * 0.5);
      for (let i = 0; i < toon.length && i < x.length; i++) x[i] += toon[i];
      return x;
    }
    const gPop = (toon = 0) => glij(0.11, (t) => (520 + 520 * Math.exp(-t * 55)) * 2 ** (toon / 12), (t) => Math.exp(-t * 34) * 0.8);
    function gWhoosh(d = 0.45, helder = 1) {
      const n = ruis(d), donker = glad(n, 22), licht = glad(n, 4), x = new Float32Array(n.length);
      for (let i = 0; i < x.length; i++) { const u = Math.min(1, i / SR / d), vorm = Math.sin(Math.PI * u) ** 2; x[i] = (donker[i] * (1 - u) + licht[i] * u * helder) * vorm; }
      const pk = piek(x);
      for (let i = 0; i < x.length; i++) x[i] = x[i] / pk * 0.55;
      return x;
    }
    function gSwoosh() {
      const x = gWhoosh(0.6, 1.3);
      const y = glij(0.6, (t) => 90 + 200 * (t / 0.6), (t) => 0.3 * Math.sin(Math.PI * t / 0.6) ** 2);
      for (let i = 0; i < x.length; i++) x[i] += y[i];
      return x;
    }
    function gKlik() {
      const x = sinus(210, 0.09, 60, 0, 0.7);
      const r = glad(ruis(0.00625), 2);
      for (let i = 0; i < 300 && i < r.length; i++) x[i] += r[i] * 0.6;
      return x;
    }
    const gDing = (toon = 0) => { const f = hz(86 + toon); const b = bel(f, 1.5), m = marimba(f / 2, 0.5); for (let i = 0; i < b.length; i++) b[i] = b[i] * 0.5 + (i < m.length ? 0.25 * m[i] : 0); return b; };
    function gImpact() {
      const uitx = new Float32Array(N(1.1)), k = kick(1.4), s = subDreun(1.1), n = maal(glad(ruis(0.35), 3), (t) => Math.exp(-t * 11) * 0.35);
      for (let i = 0; i < uitx.length; i++) uitx[i] = (i < k.length ? k[i] * 0.9 : 0) + (i < s.length ? s[i] * 0.8 : 0) + (i < n.length ? n[i] : 0);
      return uitx;
    }
    function gRiser(beats) {
      const d = beats * BEAT, n = ruis(d), a = glad(n, 30), b = glad(n, 3), x = new Float32Array(n.length);
      for (let i = 0; i < x.length; i++) { const u = i / SR / d; x[i] = (a[i] * (1 - u) + b[i] * u) * u * u; }
      const pk = piek(x);
      const toon = glij(d, (t) => 220 * 2 ** ((t / d) * 2), (t) => (t / d) ** 3 * 0.25);
      for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = (x[i] / pk * 0.5 + toon[i]) * Math.max(0, Math.min(1, (d - t) / 0.01)); }
      return x;
    }
    const gHartje = (toon = 0) => glij(0.09, (t) => (700 + 900 * t / 0.09) * 2 ** (toon / 12), (t) => Math.exp(-t * 30) * 0.45);
    function gSparkle() {
      const x = new Float32Array(N(1.2));
      [93, 97, 100, 105, 109].forEach((m, k) => { const b = bel(hz(m), 0.8), i = Math.floor(k * 0.045 * SR); for (let j = 0; j < b.length && i + j < x.length; j++) x[i + j] += b[j] * 0.25; });
      return x;
    }
    function gStempel() {
      const x = glij(0.25, (t) => 140 * Math.exp(-t * 8) + 60, (t) => Math.exp(-t * 18));
      const r = glad(ruis(0.0125), 3);
      for (let i = 0; i < 600 && i < r.length; i++) x[i] += r[i] * 0.8;
      for (let i = 0; i < x.length; i++) x[i] *= 0.9;
      return x;
    }
    function gHart() {
      const x = new Float32Array(N(0.5));
      [[0, 1.0], [0.17, 0.6]].forEach(([off, a]) => { const y = glij(0.22, (t) => 48 + 40 * Math.exp(-t * 30), (t) => Math.exp(-t * 16) * a), i = Math.floor(off * SR); for (let j = 0; j < y.length && i + j < x.length; j++) x[i + j] += y[j]; });
      for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * 1.4);
      return x;
    }
    const gKlok = () => som(sinus(1900, 0.05, 110, 0, 0.5), sinus(1260, 0.05, 110, 0, 0.3));
    function gDicht() {
      const x = new Float32Array(N(0.5));
      const klap = glij(0.5, (t) => 62 + 70 * Math.exp(-t * 40), (t) => Math.exp(-t * 14));
      const tik = maal(glad(ruis(0.02), 2), (t) => Math.exp(-t * 260));
      const rat = maal(glad(ruis(0.12), 2), (t) => Math.exp(-t * 50) * 0.25);
      for (let i = 0; i < x.length; i++) x[i] += klap[i] || 0;
      for (let i = 0; i < tik.length; i++) x[i] += tik[i] * 0.9;
      const o = Math.floor(0.03 * SR);
      for (let i = 0; i < rat.length && o + i < x.length; i++) x[o + i] += rat[i];
      for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * 1.5) * 0.9;
      return x;
    }
    function gInzuig(beats) {
      const d = beats * BEAT, staart = maal(hoog(glad(ruis(d), 2)), (t) => Math.exp(-t * 3.2));
      const toon = som(maal(bel(hz(86), d), () => 0.5), maal(bel(hz(93), d), () => 0.3));
      const pk = piek(staart), n = staart.length, x = new Float32Array(n);
      for (let i = 0; i < n; i++) x[n - 1 - i] = staart[i] / pk * 0.7 + (toon[i] || 0) * 0.6;
      for (let i = 0; i < n; i++) x[i] *= Math.max(0, Math.min(1, (d - (n - 1 - i) / SR) / 0.004));
      return x;
    }
    // fietsbel: twee keer trrring, metaalachtig, met de tik van het hamertje
    function gFietsbel() {
      const d = 0.95, x = new Float32Array(N(d));
      for (const begin of [0, 0.3]) {
        const f = 2550, dd = d - begin;
        const toon = som(sinus(f, dd, 5.5), sinus(f * 1.48, dd, 7, 0.4, 0.6), sinus(f * 2.31, dd, 10, 1, 0.35));
        const i0 = Math.floor(begin * SR);
        for (let i = 0; i < toon.length && i0 + i < x.length; i++) {
          const t = i / SR, trr = t < 0.22 ? 0.55 + 0.45 * Math.abs(Math.sin(2 * Math.PI * 14 * t)) : 1;
          x[i0 + i] += toon[i] * trr * Math.min(1, t / 0.001) * 0.35;
        }
      }
      return x;
    }
    // freewheel: tikjes die vertragen, zoals een wiel dat uitrolt
    function gRatel(beats) {
      const d = beats * BEAT, x = new Float32Array(N(d + 0.05));
      let t = 0, k = 0;
      while (t < d) {
        const klik = maal(hoog(glad(ruis(0.006), 2)), (q) => Math.exp(-q * 700));
        const ping = sinus(3200 + 300 * (k++ % 2), 0.008, 500, 0, 0.3);
        const i0 = Math.floor(t * SR);
        for (let i = 0; i < klik.length && i0 + i < x.length; i++) x[i0 + i] += klik[i] * 0.6 + (ping[i] || 0);
        t += 0.022 + 0.05 * (t / d) ** 1.5;
      }
      return x;
    }
    // schaar: twee metalen knipjes vlak na elkaar
    function gKnip() {
      const x = new Float32Array(N(0.16));
      for (const [begin, a] of [[0, 0.8], [0.055, 1]]) {
        const ruis1 = maal(hoog(hoog(ruis(0.03))), (t) => Math.exp(-t * 160));
        const toon = som(sinus(4200, 0.03, 140, 0, 0.35), sinus(6100, 0.03, 180, 0.5, 0.2));
        const i0 = Math.floor(begin * SR);
        for (let i = 0; i < ruis1.length && i0 + i < x.length; i++) x[i0 + i] += (ruis1[i] * 0.5 + (toon[i] || 0)) * a;
      }
      return x;
    }
    const gDruppel = () => glij(0.16, (t) => 320 + 1100 * Math.min(1, t / 0.05) ** 0.6, (t) => Math.exp(-t * 26) * 0.7);

    function maakFx() {
      for (const c of cfg.cues || []) {
        const t = c.b * BEAT + (c.dt || 0), vol = c.vol ?? 1, pan = c.pan ?? 0, toon = c.toon ?? 0;
        switch (c.soort) {
          case "tik": leg(fx, t, gTik(), 0.55 * vol, pan); break;
          case "pop": leg(fx, t, gPop(toon), 0.5 * vol, pan); break;
          case "whoosh": { const d = (c.lengte ?? 0.9) * BEAT; leg(fx, t - d * 0.6, gWhoosh(d), 0.75 * vol, pan); break; }
          case "swoosh": leg(fx, t - 0.36, gSwoosh(), 0.8 * vol, pan); break;
          case "klik": leg(fx, t, gKlik(), 0.8 * vol, pan); break;
          case "ding": leg(fx, t, gDing(toon), 0.55 * vol, pan); break;
          case "impact": leg(muziek, t, gImpact(), 0.8 * vol); kicks.push(t); break;
          case "riser": { const l = c.lengte ?? 4; leg(fx, t - l * BEAT, gRiser(l), 0.55 * vol, pan); break; }
          case "hartje": leg(fx, t, gHartje(toon), 0.45 * vol, pan); break;
          case "sparkle": leg(fx, t, gSparkle(), 0.6 * vol, pan); break;
          case "stempel": leg(fx, t, gStempel(), 0.7 * vol, pan); break;
          case "hart": leg(muziek, t, gHart(), 0.8 * vol, pan); break;
          case "klok": leg(fx, t, gKlok(), 0.5 * vol, pan); break;
          case "dicht": leg(muziek, t, gDicht(), 0.9 * vol, pan); kicks.push(t); break;
          case "inzuig": { const l = c.lengte ?? 2; leg(fx, t - l * BEAT, gInzuig(l), 0.6 * vol, pan); break; }
          case "druppel": leg(fx, t, gDruppel(), 0.5 * vol, pan); break;
          case "fietsbel": leg(fx, t, gFietsbel(), 0.6 * vol, pan); break;
          case "ratel": leg(fx, t, gRatel(c.lengte ?? 2), 0.5 * vol, pan); break;
          case "knip": leg(fx, t, gKnip(), 0.6 * vol, pan); break;
          default: break;
        }
      }
    }

    // ---------- galm (Freeverb: kamfilters en allpass) ----------
    function galm(inL, inR, nat) {
      const n = inL.length, k = SR / 44100;
      const COMB = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => Math.round(d * k));
      const ALL = [556, 441, 341, 225].map((d) => Math.round(d * k));
      const fb = 0.86, demp = 0.25;
      const kanaal = (spread) => {
        const y = new Float32Array(n);
        const kammen = COMB.map((d) => ({ buf: new Float32Array(d + spread), i: 0, f: 0 }));
        const alls = ALL.map((d) => ({ buf: new Float32Array(d + spread), i: 0 }));
        for (let s = 0; s < n; s++) {
          const x = (inL[s] + inR[s]) * 0.015;
          let o = 0;
          for (const c of kammen) {
            const v = c.buf[c.i];
            c.f = v * (1 - demp) + c.f * demp;
            c.buf[c.i] = x + c.f * fb;
            if (++c.i >= c.buf.length) c.i = 0;
            o += v;
          }
          for (const a of alls) {
            const v = a.buf[a.i];
            a.buf[a.i] = o + v * 0.5;
            if (++a.i >= a.buf.length) a.i = 0;
            o = v - o;
          }
          y[s] = o;
        }
        return y;
      };
      const l = kanaal(0), r = kanaal(23);
      const schaal = Math.max(piek(inL), piek(inR)) / Math.max(piek(l), piek(r)) * nat;
      for (let s = 0; s < n; s++) { l[s] *= schaal; r[s] *= schaal; }
      return [l, r];
    }

    // ---------- mixen ----------
    if (modus === "muziek") maakMuziek();
    maakFx();
    const duck = new Float32Array(LEN).fill(1);
    for (const kt of kicks) {
      const i = Math.floor(kt * SR), n = Math.floor(0.36 * SR);
      for (let j = 0; j < n && i + j < LEN; j++) {
        if (i + j < 0) continue;
        const t = j / SR, v = 1 - 0.62 * Math.exp(-t * 11) * Math.min(1, t / 0.004);
        if (v < duck[i + j]) duck[i + j] = v;
      }
    }
    const nT = uit.l.length;
    const inL = new Float32Array(LEN), inR = new Float32Array(LEN);
    for (let i = 0; i < LEN; i++) {
      zij[0][i] *= duck[i]; zij[1][i] *= duck[i];
      inL[i] = zij[0][i] * 0.5 + fx[0][i];
      inR[i] = zij[1][i] * 0.5 + fx[1][i];
    }
    const [gl, gr] = galm(inL, inR, 0.22);
    for (let i = 0; i < nT; i++) {
      uit.l[i] = muziek[0][i] + zij[0][i] + fx[0][i] + gl[i];
      uit.r[i] = muziek[1][i] + zij[1][i] + fx[1][i] + gr[i];
    }
    const nUit = Math.floor(SR * 0.35);
    for (let i = 0; i < nUit && i < nT; i++) { const v = i / nUit; uit.l[nT - 1 - i] *= v; uit.r[nT - 1 - i] *= v; }
    for (let i = 0; i < 240 && i < nT; i++) { const v = i / 240; uit.l[i] *= v; uit.r[i] *= v; }
    const p1 = Math.max(piek(uit.l), piek(uit.r));
    for (let i = 0; i < nT; i++) { uit.l[i] = Math.tanh(uit.l[i] / p1 * 1.6); uit.r[i] = Math.tanh(uit.r[i] / p1 * 1.6); }
    const p2 = Math.max(piek(uit.l), piek(uit.r));
    const doel = modus === "effecten" ? 0.6 : 0.84;   // ruimte voor AAC, anders kraakt de MP4
    for (let i = 0; i < nT; i++) { uit.l[i] = uit.l[i] / p2 * doel; uit.r[i] = uit.r[i] / p2 * doel; }
    return uit;
  }

  /** 16-bit stereo WAV. */
  function wav({ sr, l, r }) {
    const n = l.length, data = n * 4, buf = new ArrayBuffer(44 + data), v = new DataView(buf);
    const tekst = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    tekst(0, "RIFF"); v.setUint32(4, 36 + data, true); tekst(8, "WAVE"); tekst(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); tekst(36, "data"); v.setUint32(40, data, true);
    for (let i = 0, o = 44; i < n; i++, o += 4) {
      v.setInt16(o, Math.max(-1, Math.min(1, l[i])) * 32767, true);
      v.setInt16(o + 2, Math.max(-1, Math.min(1, r[i])) * 32767, true);
    }
    return new Uint8Array(buf);
  }

  root.ReelGeluid = { maak, wav, SR };
})(typeof window !== "undefined" ? window : globalThis);
