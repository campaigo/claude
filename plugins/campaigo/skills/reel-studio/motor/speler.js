/*
 * Reel-studio van Campaigo: het voorbeeld in de browser (bekijk.mjs). Laadt vanzelf als de Reel niet gerenderd wordt.
 * Speelt de Reel af met geluid, laat je scrubben, toont op verzoek de veilige zone van Instagram en ververst
 * vanzelf als een bestand van de Reel verandert (zodat de klant meekijkt terwijl Claude aanpast).
 *   ?t=5   zet de Reel stil op 5 seconden
 */
(function () {
  "use strict";
  const stage = document.getElementById("stage");
  const T = window.__T__;
  const qs = new URLSearchParams(location.search);

  const css = document.createElement("style");
  css.textContent = `
    body { margin: 0; height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #16161a; font-family: system-ui, sans-serif; overflow: hidden; }
    #r-wrap { position: relative; flex: none; box-shadow: 0 30px 80px rgba(0,0,0,.5); border-radius: 18px; overflow: hidden; }
    #r-wrap #stage { position: absolute; left: 0; top: 0; }
    #r-veilig { position: absolute; left: 0; top: 0; width: 1080px; height: 1920px; transform-origin: 0 0; pointer-events: none; display: none; }
    #r-veilig.aan { display: block; }
    #r-veilig .zone { position: absolute; left: 60px; top: 240px; width: 880px; height: 1240px; border: 4px dashed rgba(255,255,255,.9); box-shadow: 0 0 0 4000px rgba(0,0,0,.35); }
    #r-balk { flex: none; display: flex; align-items: center; gap: 12px; margin-top: 14px; color: #eee; font-size: 14px; }
    #r-balk button { background: #2a2a31; color: #fff; border: 0; border-radius: 99px; padding: 8px 14px; font-size: 14px; cursor: pointer; }
    #r-balk button.aan { background: #f2f2f2; color: #16161a; }
    #r-balk input { width: 260px; }
    #r-tijd { font-variant-numeric: tabular-nums; min-width: 92px; text-align: right; }
    #r-start { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.25); cursor: pointer; }
    #r-start span { background: #fff; color: #16161a; border-radius: 99px; padding: 14px 24px; font-size: 18px; font-weight: 600; }
  `;
  document.head.append(css);

  const wrap = document.createElement("div");
  wrap.id = "r-wrap";
  stage.parentNode.insertBefore(wrap, stage);
  wrap.append(stage);
  const veilig = document.createElement("div");
  veilig.id = "r-veilig";
  veilig.innerHTML = '<div class="zone"></div>';
  wrap.append(veilig);
  const start = document.createElement("div");
  start.id = "r-start";
  start.innerHTML = "<span>Klik om af te spelen met geluid</span>";
  wrap.append(start);
  const balk = document.createElement("div");
  balk.id = "r-balk";
  balk.innerHTML = `<button id="r-speel">Pauze</button><input id="r-schuif" type="range" min="0" max="${T}" step="0.01" value="0"><span id="r-tijd"></span><button id="r-geluid">Geluid aan</button><button id="r-zone">Veilige zone</button>`;
  document.body.append(balk);
  const $ = (id) => document.getElementById(id);

  function pas() {
    const k = Math.min((innerWidth - 40) / 1080, (innerHeight - 90) / 1920);
    wrap.style.width = `${1080 * k}px`;
    wrap.style.height = `${1920 * k}px`;
    stage.style.transform = `scale(${k})`;
    veilig.style.transform = `scale(${k})`;
  }
  pas();
  addEventListener("resize", pas);

  // ---------- tijd en geluid ----------
  let speelt = !qs.has("t"), t0 = performance.now(), stil = qs.has("t") ? +qs.get("t") : 0;
  try { const s = sessionStorage.getItem("reel-t"); if (s != null && !qs.has("t")) { stil = +s; t0 = performance.now() - stil * 1000; sessionStorage.removeItem("reel-t"); } } catch (e) { /* geen opslag */ }
  let ctx = null, buffer = null, bron = null, geluidAan = false;
  const nu = () => (speelt ? (((performance.now() - t0) / 1000) % T + T) % T : stil);

  function stopGeluid() { try { bron?.stop(); } catch (e) { /* al gestopt */ } bron = null; }
  function startGeluid(vanaf) {
    stopGeluid();
    if (!geluidAan || !buffer || !speelt) return;
    bron = ctx.createBufferSource();
    bron.buffer = buffer;
    bron.loop = true;
    bron.loopEnd = T;
    bron.connect(ctx.destination);
    bron.start(0, vanaf % T);
  }
  async function maakGeluid() {
    if (buffer || (window.__MUZIEK__ || {}).geluid === "stil") return;
    if (!window.ReelGeluid) await new Promise((ok, fout) => { const s = document.createElement("script"); s.src = "/motor/geluid.js"; s.onload = ok; s.onerror = fout; document.head.append(s); });
    const g = window.ReelGeluid.maak(window.__MUZIEK__);
    ctx = ctx || new AudioContext();
    buffer = ctx.createBuffer(2, g.l.length, g.sr);
    buffer.copyToChannel(g.l, 0);
    buffer.copyToChannel(g.r, 1);
  }
  async function zetGeluid(aan) {
    geluidAan = aan;
    $("r-geluid").textContent = aan ? "Geluid uit" : "Geluid aan";
    $("r-geluid").classList.toggle("aan", aan);
    if (aan) {
      ctx = ctx || new AudioContext();
      await ctx.resume();
      $("r-geluid").textContent = "Geluid laden...";
      await maakGeluid();
      $("r-geluid").textContent = "Geluid uit";
      startGeluid(nu());
    } else stopGeluid();
  }
  function speel(aan) {
    if (aan === speelt) return;
    if (aan) { t0 = performance.now() - stil * 1000; speelt = true; startGeluid(stil); }
    else { stil = nu(); speelt = false; stopGeluid(); }
    $("r-speel").textContent = speelt ? "Pauze" : "Speel";
  }

  start.addEventListener("click", async () => { start.remove(); speel(true); t0 = performance.now(); await zetGeluid(true); });
  if (qs.has("t")) start.remove();
  $("r-speel").addEventListener("click", () => speel(!speelt));
  $("r-geluid").addEventListener("click", () => zetGeluid(!geluidAan));
  $("r-zone").addEventListener("click", () => { veilig.classList.toggle("aan"); $("r-zone").classList.toggle("aan"); });
  $("r-schuif").addEventListener("input", (e) => { stil = +e.target.value; speel(false); window.R.speelt = false; window.R.frame(stil); });
  addEventListener("keydown", (e) => { if (e.code === "Space") { e.preventDefault(); speel(!speelt); } });

  let laatsteLus = -1;
  function lus() {
    const t = nu();
    if (speelt && geluidAan && t < laatsteLus) startGeluid(t);
    laatsteLus = t;
    window.R.speelt = speelt;
    if (speelt) window.R.frame(t);
    $("r-schuif").value = t;
    $("r-tijd").textContent = `${t.toFixed(1).replace(".", ",")} / ${T.toFixed(1).replace(".", ",")} s`;
    requestAnimationFrame(lus);
  }
  window.R.frame(stil);
  requestAnimationFrame(lus);

  // ---------- vanzelf verversen als de Reel verandert ----------
  let versie = null;
  setInterval(async () => {
    try {
      const v = await (await fetch("/__versie", { cache: "no-store" })).text();
      if (versie && v !== versie) { try { sessionStorage.setItem("reel-t", String(nu())); } catch (e) { /* geen opslag */ } location.reload(); }
      versie = v;
    } catch (e) { /* server weg: niets doen */ }
  }, 900);

  if ((window.__MELDINGEN__ || []).length) console.warn("Meldingen van de Reel:", window.__MELDINGEN__);
})();
