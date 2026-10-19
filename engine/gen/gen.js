/* engine/gen/gen.js — «генерация ИИ» кодом, без диффузии (28.09.2026, Елжан: «используй JavaScript для создания
   анимации как будто генерация ИИ, но кодом без диффузий — для разнообразия визуала и развития завода»).

   Два прохода WebGL2, чистая функция времени (кадр N всегда одинаков — рендер по воркерам его не ломает):
     1. сцена — рэймарчинг SDF: флакон, полка флаконов, стена полок; свет, френель, полосы бликов на стекле,
        мягкая тень. Цвета только из палитры, которую даёт спек (у клиента законы цвета).
     2. «сэмплер» — то, по чему глаз узнаёт генерацию: картинка проявляется из шума шагами. На раннем шаге —
        цветные пятна палитры и крупное зерно, форма плывёт (domain warp); к последнему шагу — резко.
        Размытие = LOD мипмапа сцены, зерно меняет зерно на каждом шаге, а не на каждом кадре (как превью сэмплера).
   Слот может раствориться обратно в шум и проявиться пустым (`lose`): сцена пишет номер слота в альфу.

   API: const g = makeGen(canvas, opts); g.draw(p, time, lose) — p 0…1 прогресс шагов, lose 0…1 распад слотов.
   opts: scene 'bottle' | 'shelf' | 'wall', n (флаконов в ряду), seed, steps, pal {bg, bg2, floor, liquid[], cap, ring, glass},
         empty [номера пустых слотов], loseSlots [номера слотов, которые растворятся], orbit (рад качания камеры), light 'dark'|'light'. */

const VS = `#version 300 es
in vec2 a; out vec2 v; void main(){ v = a * .5 + .5; gl_Position = vec4(a, 0., 1.); }`;

const SCENE = `#version 300 es
precision highp float;
in vec2 v; out vec4 o;
uniform vec2 R; uniform float T, SEED, SCN, N, ORB, DIST, TAY, CAMY;
uniform vec3 BG, BG2, FLOOR, CAP, RING, GLASS; uniform vec3 LIQ[5]; uniform float EMPTY[16];
#define PI 3.14159265
float h1(float x){ return fract(sin(x * 127.1 + SEED * 311.7) * 43758.5453); }
float sdRB(vec3 p, vec3 b, float r){ vec3 q = abs(p) - b + r; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.) - r; }
float sdCyl(vec3 p, float h, float r){ vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h); return min(max(d.x, d.y), 0.) + length(max(d, 0.)); }
float sdEl(vec3 p, vec3 r){ float k0 = length(p / r), k1 = length(p / (r * r)); return k0 * (k0 - 1.) / k1; }
/* флакон стоит на y = 0; kind 0 — квадратный, 1 — круглый, 2 — высокий; id: 1 стекло, 2 колпачок, 3 кольцо */
vec2 bottle(vec3 p, float kind){
  float body, top;
  if (kind < .5) { body = sdRB(p - vec3(0., .42, 0.), vec3(.33, .42, .15), .06); top = .84; }
  else if (kind < 1.5) { body = sdEl(p - vec3(0., .40, 0.), vec3(.34, .40, .21)); top = .80; }
  else { body = sdRB(p - vec3(0., .56, 0.), vec3(.19, .56, .13), .045); top = 1.12; }
  float neck = sdCyl(p - vec3(0., top + .04, 0.), .05, .065);
  float ring = sdCyl(p - vec3(0., top + .1, 0.), .022, .1);
  float cap = kind < 1.5 ? sdRB(p - vec3(0., top + .24, 0.), vec3(.12, .12, .12), .025) : sdCyl(p - vec3(0., top + .26, 0.), .15, .085);
  vec2 r = vec2(min(body, neck), 1.);
  if (ring < r.x) r = vec2(ring, 3.);
  if (cap < r.x) r = vec2(cap, 2.);
  return r;
}
/* сцена: x — расстояние, y — материал (0 фон, 1 стекло, 2 колпачок, 3 кольцо, 4 полка), z — слот */
vec3 map(vec3 p){
  vec3 r = vec3(1e3, 0., -1.);
  if (SCN < .5) {                                   // один флакон-герой на подиуме
    vec2 b = bottle(p, floor(h1(3.) * 3.)); r = vec3(b, 0.);
    float fl = p.y + .0; if (fl < r.x) r = vec3(fl, 4., -1.);
    return r;
  }
  float sp = SCN < 1.5 ? 1.02 : .92, rows = SCN < 1.5 ? 1. : 3., rh = 1.9;
  float ry = SCN < 1.5 ? 0. : clamp(floor(p.y / rh + .5), 0., rows - 1.);
  vec3 q = p; q.y -= ry * rh;
  float id = clamp(floor(p.x / sp + N * .5), 0., N - 1.);
  q.x -= (id - (N - 1.) * .5) * sp;
  float slot = id + ry * N;
  float kind = floor(h1(slot + 1.) * 3.);
  if (EMPTY[int(clamp(slot, 0., 15.))] < .5) { vec2 b = bottle(q * vec3(1., 1., 1.), kind); r = vec3(b, slot); }
  float plank = sdRB(q - vec3(0., -.05, 0.), vec3(sp * .5 + .02, .05, .42), .01);
  if (plank < r.x) r = vec3(plank, 4., slot);
  float wall = .5 - p.z; if (wall < r.x) r = vec3(wall, 0., slot);
  return r;
}
vec3 nrm(vec3 p){ vec2 e = vec2(.0015, -.0015); return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x + e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x); }
float shadow(vec3 ro, vec3 rd){ float s = 1., t = .02; for (int i = 0; i < 24; i++) { float d = map(ro + rd * t).x; s = min(s, 10. * d / t); t += clamp(d, .02, .25); if (s < .01 || t > 4.) break; } return clamp(s, 0., 1.); }
float ao(vec3 p, vec3 n){ float a = 0., w = 1.; for (int i = 1; i < 5; i++) { float h = .04 * float(i); a += w * (h - map(p + n * h).x); w *= .7; } return clamp(1. - 2.2 * a, 0., 1.); }
void main(){
  vec2 uv = (v * R - .5 * R) / R.y;
  float a = ORB * sin(T * .35 + SEED);
  vec3 ta = vec3(0., TAY, 0.);
  vec3 ro = ta + vec3(sin(a) * DIST, CAMY, -cos(a) * DIST);
  vec3 f = normalize(ta - ro), rr = normalize(cross(vec3(0., 1., 0.), f)), up = cross(f, rr);
  vec3 rd = normalize(f * 2.4 + uv.x * rr + uv.y * up);
  float t = 0.; vec3 m = vec3(0., -1., -1.);
  for (int i = 0; i < 110; i++) { m = map(ro + rd * t); if (m.x < .0012 || t > 30.) break; t += m.x * .9; }
  vec3 bg = mix(BG2, BG, smoothstep(-.6, .7, uv.y)) + .08 * exp(-3. * dot(uv - vec2(.1, .25), uv - vec2(.1, .25))) * vec3(1.);
  vec3 col = bg; float slot = -1.;
  vec3 L = normalize(vec3(-.55, .8, -.45));
  if (t < 30.) {
    vec3 p = ro + rd * t, n = nrm(p); slot = m.z;
    float dif = max(dot(n, L), 0.), sh = shadow(p + n * .01, L), oc = ao(p, n);
    float fr = pow(1. - max(dot(n, -rd), 0.), 3.);
    vec3 rf = reflect(rd, n);
    float strip = smoothstep(.82, .97, abs(rf.x)) * smoothstep(-.2, .5, rf.y) + .6 * smoothstep(.93, .99, rf.y);
    float spec = pow(max(dot(rf, L), 0.), 60.);
    if (m.y < .5) { col = bg * (.75 + .25 * oc); }
    else if (m.y < 1.5) {
      vec3 liq = LIQ[int(mod(max(m.z, 0.) + floor(SEED), 5.))];
      float ry = SCN > 1.5 ? clamp(floor(p.y / 1.9 + .5), 0., 2.) : 0., ly = p.y - ry * 1.9;
      float kind = SCN < .5 ? floor(h1(3.) * 3.) : floor(h1(m.z + 1.) * 3.);
      float fill = (kind > 1.5 ? .78 : .5) + .12 * h1(m.z + 7.);
      vec3 base = mix(GLASS * .9, liq, step(ly, fill) * .95);
      col = base * (.28 + .72 * dif * sh) * oc;
      col += liq * .35 * (1. - dif) * step(ly, fill);          // свет проходит сквозь жидкость
      col *= mix(.5, 1., pow(max(dot(n, -rd), 0.), .6));       // толща стекла темнит края — флакон читается объёмом
      col += liq * .25 * smoothstep(.03, 0., abs(ly - fill)) * step(.1, ly);   // мениск
      col = mix(col, vec3(1.), fr * .55) + strip * .85 + spec * 1.2;
    }
    else if (m.y < 2.5) { col = CAP * (.25 + .75 * dif * sh) * oc + spec * .9 + strip * .25; }
    else if (m.y < 3.5) { col = RING * (.35 + .9 * dif) + pow(max(dot(rf, L), 0.), 18.) * 1.4 + strip * .6; }
    else { col = FLOOR * (.35 + .65 * dif * sh) * oc + fr * .08; }
    col = mix(col, bg, smoothstep(12., 28., t));
  }
  col = mix(col, .8 + (col - .8) / (1. + (col - .8) * 2.5), step(.8, col)); col = pow(max(col, 0.), vec3(1. / 2.2));
  /* номер слота пишется только в коробке вокруг флакона на плоскости z = 0: распад слота — силуэт флакона, а не колонка кадра */
  slot = -1.;
  if (SCN > .5 && abs(rd.z) > 1e-4) {
    vec3 q = ro + rd * (-ro.z / rd.z); float sp = SCN < 1.5 ? 1.02 : .92;
    float ry = SCN > 1.5 ? clamp(floor(q.y / 1.9 + .5), 0., 2.) : 0., ly = q.y - ry * 1.9;
    float id = clamp(floor(q.x / sp + N * .5), 0., N - 1.), lx = q.x - (id - (N - 1.) * .5) * sp;
    if (abs(lx) < .44 && ly > -.02 && ly < 1.5) slot = id + ry * N;
  }
  o = vec4(col, (slot + 1.) / 32.);
}`;

const POST = `#version 300 es
precision highp float;
in vec2 v; out vec4 o;
uniform sampler2D S; uniform vec2 R; uniform float P, K, SEED, LOSE, LP, F; uniform float LS[16]; uniform vec3 C0, C1, C2, C3;
float hh(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hh(i), hh(i + vec2(1., 0.)), f.x), mix(hh(i + vec2(0., 1.)), hh(i + 1.), f.x), f.y); }
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 7.1; a *= .5; } return s; }
void main(){
  float id = floor(texelFetch(S, ivec2(v * R), 0).a * 32. + .5) - 1.;
  float lose = (id >= 0. && LS[int(clamp(id, 0., 15.))] > .5) ? LP : 0.;
  float p = min(P, 1. - lose);                       // шаг сэмплера на этом пикселе
  float q = 1. - p, st = p < 1. / K ? F : floor(p * K);   // K шагов; зерно обновляется на шаге, а пока генерация в очереди — каждый кадр
  vec2 w = vec2(fbm(v * 3. + SEED + st * .13), fbm(v * 3. + 11. + SEED - st * .11)) - .5;
  vec2 uv = v + w * .09 * pow(q, 1.3);
  vec3 c = textureLod(S, uv, pow(q, 1.25) * 6.8).rgb;
  float b = fbm(v * (2.2 + 2. * p) + SEED * 3.1 + st * .07 + vec2(F * .004, -F * .003));
  vec3 blob = mix(mix(C0, C1, smoothstep(.3, .55, b)), mix(C2, C3, smoothstep(.45, .7, b)), smoothstep(.35, .65, fbm(v * 1.7 - SEED)));
  c = mix(c, blob, .85 * pow(q, 1.6));
  vec2 px = floor(v * R / max(1., 3. * q * q + 1.));
  float g = (hh(px + st * 17.3 + SEED) + hh(px * 1.7 - st * 5.1) - 1.);
  c += g * .55 * pow(q, .85) * vec3(1.05, 1., .95);
  c += (hh(v * R + st) - .5) * .025;                  // живое зерно плёнки и на чистом кадре
  o = vec4(clamp(c, 0., 1.), 1.);
}`;

const hex = h => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };
const lin = h => hex(h).map(c => Math.pow(c, 2.2));

export function makeGen(canvas, o = {}) {
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false });
  if (!gl) throw new Error('gen: WebGL2 недоступен');
  const W = canvas.width, H = canvas.height;
  const prog = (fs) => {
    const p = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('gen shader: ' + gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('gen link: ' + gl.getProgramInfoLog(p));
    const U = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i), nm = u.name.replace('[0]', ''); U[nm] = gl.getUniformLocation(p, u.name); }
    return { p, U };
  };
  const sc = prog(SCENE), po = prog(POST);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

  const pal = o.pal || {}, liq = (pal.liquid || ['#C4A46B', '#204C3C', '#B7D0C3', '#16362B', '#E9F0EC']).slice(0, 5);
  while (liq.length < 5) liq.push(liq[liq.length - 1]);
  const scn = { bottle: 0, shelf: 1, wall: 2 }[o.scene || 'bottle'], seed = o.seed ?? 1, steps = o.steps ?? 24;
  const empty = new Float32Array(16).fill(0), ls = new Float32Array(16).fill(0);
  (o.empty || []).forEach(i => { empty[i] = 1; }); (o.loseSlots || []).forEach(i => { ls[i] = 1; });
  const blobs = (o.blobs || [pal.bg2 || '#16362B', pal.bg || '#204C3C', '#C4A46B', '#B7D0C3']).map(hex);
  /* камера вписывает сцену в пропорции холста: ширина ряда или высота стены, что упрётся раньше */
  const asp = W / H, n = o.n ?? 5, FOC = 2.4;
  const fitW = w => (w / 2) * FOC / (0.5 * asp), fitH = h => (h / 2) * FOC / 0.5;
  const cam = scn === 0 ? { d: Math.max(fitH(1.75), fitW(1.1)), y: 0.72, c: 0.5 }
    : scn === 1 ? { d: Math.max(fitW(n * 1.02 + 0.5), fitH(1.8)), y: 0.66, c: 0.5 }
    : { d: Math.max(fitW(n * 0.92 + 0.4), fitH(3 * 1.9 + 1.3)), y: 2.6, c: 0.25 };
  if (o.dist) cam.d = o.dist;

  /* lose 0…1: слоты loseSlots растворяются в шум (0 → .5) и проявляются уже пустыми (.5 → 1) */
  function draw(p, time, lose = 0) {
    const gone = lose >= 0.5, lp = lose <= 0 ? 0 : gone ? 2 - 2 * lose : 2 * lose;
    const em = new Float32Array(empty); if (gone) ls.forEach((x, i) => { if (x) em[i] = 1; });
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, W, H); gl.useProgram(sc.p);
    const U = sc.U;
    gl.uniform2f(U.R, W, H); gl.uniform1f(U.T, time); gl.uniform1f(U.SEED, seed); gl.uniform1f(U.SCN, scn);
    gl.uniform1f(U.N, n); gl.uniform1f(U.ORB, o.orbit ?? (scn === 0 ? 0.35 : 0.12));
    gl.uniform1f(U.DIST, cam.d); gl.uniform1f(U.TAY, cam.y); gl.uniform1f(U.CAMY, cam.c * cam.d / 4);
    gl.uniform3fv(U.BG, lin(pal.bg || '#204C3C')); gl.uniform3fv(U.BG2, lin(pal.bg2 || '#16362B'));
    gl.uniform3fv(U.FLOOR, lin(pal.floor || '#E9F0EC')); gl.uniform3fv(U.CAP, lin(pal.cap || '#16362B'));
    gl.uniform3fv(U.RING, lin(pal.ring || '#C4A46B')); gl.uniform3fv(U.GLASS, lin(pal.glass || '#E9F0EC'));
    gl.uniform3fv(U.LIQ, new Float32Array(liq.flatMap(lin))); gl.uniform1fv(U.EMPTY, em);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindTexture(gl.TEXTURE_2D, tex); gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.useProgram(po.p);
    const V = po.U;
    gl.uniform1i(V.S, 0); gl.uniform2f(V.R, W, H); gl.uniform1f(V.P, Math.floor(Math.min(1, Math.max(0, p)) * steps) / steps);
    gl.uniform1f(V.K, steps); gl.uniform1f(V.SEED, seed); gl.uniform1f(V.LP, lp); gl.uniform1fv(V.LS, ls); gl.uniform1f(V.F, Math.floor(time * 15));
    gl.uniform3fv(V.C0, blobs[0]); gl.uniform3fv(V.C1, blobs[1]); gl.uniform3fv(V.C2, blobs[2]); gl.uniform3fv(V.C3, blobs[3]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  return { draw, steps };
}
