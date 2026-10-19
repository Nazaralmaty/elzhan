/* engine/gen/client.js — the client preset in the page (schema: engine/gen/client_schema.md).
   index.html, FIRST script in <head> (new.sh --client writes it):
     <script src="engine/gen/client.js" data-client="../_ассеты/client.json" data-brand="icon"></script>
   Reads КЛИЕНТ/_ассеты/client.json synchronously (render.js opens file:// with --allow-file-access-from-files), sets
   window.CLIENT (= the json, CLIENT.b = the chosen brand with cta resolved, CLIENT.fontList for ready()) and writes ONE
   <style>: @font-face of the brand fonts, :root tokens of every genre vocabulary (speaker --ink/--accent/--paper…,
   canvas --c-acc/--c-ink…, --f-hit/--f-sans/--f-script), brand vars, room grounds and the brand css rules.
   It lands BEFORE the reel's own <style>, so a reel overrides any of it; '#stage …' rules beat the engine defaults.
   No data-client → nothing happens and every genre behaves exactly as without a client. */
(function () {
  const me = document.currentScript, src = me && me.dataset.client;
  if (!src) return;
  const x = new XMLHttpRequest(); x.open('GET', src, false); x.send();
  if (!x.responseText) throw new Error(`client.js: cannot read ${src}`);
  const C = JSON.parse(x.responseText), id = me.dataset.brand || C.brand || Object.keys(C.brands)[0], B = C.brands[id];
  if (!B) throw new Error(`client.js: no brand "${id}" in ${src} (have: ${Object.keys(C.brands)})`);
  const P = B.palette || {}, F = B.fonts || {};
  C.b = { id, ...B, cta: B.cta || C.cta };
  C.fontList = [F.hit && `700 100px ${F.hit}`, F.sans && `800 100px ${F.sans}`, F.sans && `500 100px ${F.sans}`, F.script && `400 100px ${F.script}`].filter(Boolean);
  window.CLIENT = C;

  const rgb = h => { const n = parseInt(h.slice(1, 7), 16); return `${n >> 16},${n >> 8 & 255},${n & 255}`; };
  const v = {}, put = (k, c) => { if (c) v[k] = c; };
  put('--f-hit', F.hit); put('--f-sans', F.sans); put('--f-script', F.script); put('--f-ui', F.sans);
  // speaker.js vocabulary
  put('--ink', P.ink); put('--accent', P.accent); put('--paper', P.paper); put('--paper-ink', P.paperInk); put('--strip-ink', P.stripInk || P.paperInk);
  // canvas.js vocabulary (speaker-canvas reads it through canvas.js)
  put('--c-acc', P.accent); put('--c-ink', P.paperInk); put('--c-ink2', P.paperInk); put('--c-plate', P.paper); put('--c-plate2', P.paper2 || P.paper);
  put('--c-gold', P.accent2 || P.accent); put('--c-cream', P.paper);
  if (P.accent) v['--c-accRGB'] = rgb(P.accent);
  if (P.paperInk) v['--c-inkRGB'] = rgb(P.paperInk);
  if (P.accent2 || P.accent) v['--c-goldRGB'] = rgb(P.accent2 || P.accent);
  if (P.bg) v['--c-shdRGB'] = rgb(P.bg);
  Object.assign(v, B.vars || {});

  const css = [
    ...[...new Set(Object.values(F))].map(f => `@font-face{font-family:'${f}';src:url(engine/fonts/${f}.ttf) format('truetype');font-weight:100 900;font-display:block}`),
    `:root{${Object.entries(v).map(([k, c]) => `${k}:${c}`).join(';')}}`,
    // canvas grounds: without these a client reel opens on the engine's indigo
    P.bg && `html body #stage{background:${P.bg}}`,
    P.bg && `#stage .room.dark{background:linear-gradient(180deg,${P.bg} 0%,${P.bg2 || P.bg} 100%)}`,
    P.paper && `#stage .room.cream{background:${P.paper}}`,
    (P.alt || P.accent) && `#stage .room.peri{background:${P.alt || P.accent}}`,
    ...(B.css || []),
  ].filter(Boolean).join('\n');
  const st = document.createElement('style'); st.dataset.client = id; st.textContent = css; document.head.appendChild(st);
})();
