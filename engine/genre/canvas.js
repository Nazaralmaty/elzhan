/* ~/.claude/engine/genre/canvas.js — motion-canvas genre, v3: built on ae/
   (headless After Effects: layers, keyframes, expressions, camera, text
   animators, shapes, presets). Same spec contract as v2:

   spec = { lines, mark, tail,
     rooms: [{ id, x, y, w, h, bg:'peri'|'cream'|'dark', scale, r, card, z, pattern }],   // global coords
     beats: [{ room, cam: {x,y,z,rot,at,hold} | [..], add: [elements in ROOM-LOCAL coords] }] }
   element kinds: text img card pill cursor brk ring arrow bubble stamp num phone comment blob grid beam glow orbit
                  shot bars wave type flash tl  +  v4 (13.09.2026, from 15 references — /motion-canvas-pro):
                  ghost glass band photo count under   and text { chars: 'shuffle' | 'type' }
                  +  v11 (15.09.2026, four more references — RB.visualsz lamp, motionbylade collage, sumama UI, Vox collage):
                  lamp tear circle hl progress pointer gobo, text voice 'serif', any element { steps: 12 },
                  rooms bg 'paper' | 'news' | 'studio' | 'yellow', cuts 'push' | 'torn' | 'blink' | 'slice'
                  +  v12 (15.09.2026, henryexists iOS story): note streak dust; `on: 'слово@3'` = a word of line 3 (1-based)
                  +  v13 (16.09.2026, abat CTA): search — строка поиска площадки; выдачу к ней даёт `shot` со скриншотом
                  +  v14 (30.09.2026, icon/reel_048 — the /motion-goz moves inside canvas): cut 'focus' (hard cut, the incoming
                  world resolves from 26 px blur and 1.07 scale in 0.20 / 0.34 s), text { smear: true } (each word arrives stretched
                  ×2.4 on x, pale, +34 px, and snaps in 0.17 s), img { kb: [dx, dy, ds] } (a full-bleed plate travels the whole time it is up)
   v4 spec-level: hud: [elements in SCREEN space, pinned over every room, at/until in seconds]
                  beat.cut: { kind: 'iris' | 'band' | 'flash' | 'hard', color, t: '…', lead } — a world change that is
                  NOT a camera flight: the camera snaps under the cover (iris disc / diagonal band / white flash)
   common: { x, y, w, h, at (fraction | '3.2s'), dur, rot, depth, anim, until, id, room } */
import { timeline, beats, css, ready } from '../core.js';
import { Comp, FX, clamp, pr } from '../ae/ae.js';
import * as P from '../ae/presets.js';
import { autoLayout } from '../ae/layout.js';
import { makeGen } from '../gen/gen.js';
import { withClient } from './helpers.js';

const LIGHT = new Set(['cream', 'paper', 'studio', 'yellow']);   // v11: grounds that take dark ink
const svgURI = s => `url("data:image/svg+xml;utf8,${encodeURIComponent(s)}")`;
/* v11 paper fibre (Vox kraft grounds): stretched fractal noise in brown, plus a faint halftone */
const PAPER_TX = svgURI(`<svg xmlns='http://www.w3.org/2000/svg' width='520' height='520'><filter id='f'><feTurbulence type='fractalNoise' baseFrequency='0.8 0.03' numOctaves='3' seed='4'/><feColorMatrix values='0 0 0 0 0.36 0 0 0 0 0.27 0 0 0 0 0.16 0 0 0 0.9 -0.28'/></filter><rect width='100%' height='100%' filter='url(#f)'/></svg>`);
/* v11 newsprint (the dark Vox ground): barely readable italic print and grain — texture, not words to read */
const NEWS_TX = svgURI(`<svg xmlns='http://www.w3.org/2000/svg' width='980' height='760'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='7'/><feColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.35 -0.12'/></filter><rect width='100%' height='100%' filter='url(#g)'/><g font-family='Georgia,Times,serif' font-style='italic' font-weight='700' fill='#fff' opacity='.075' transform='rotate(-7 490 380)'><text x='-40' y='120' font-size='96'>ВЕЧЕРНИЙ ВЫПУСК</text><text x='60' y='250' font-size='58'>сценарий · монтаж · звук · обложка</text><text x='-120' y='400' font-size='110'>ХРОНИКА ДНЯ</text><text x='20' y='530' font-size='54'>редакция · типография · тираж</text><text x='-60' y='680' font-size='92'>НОВОСТИ</text></g></svg>`);
const STYLE = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1080px;height:1920px;overflow:hidden;background:#6B72CC}
#stage{position:relative;width:1080px;height:1920px;overflow:hidden;background:radial-gradient(120% 80% at 50% 30%,#8189DC 0%,#5F65C4 70%,#4C50A8 100%);font-family:var(--f-sans),sans-serif;-webkit-font-smoothing:antialiased}
.room{overflow:hidden}
.room.bled{background:none!important;overflow:visible}
.room.peri{background:linear-gradient(180deg,#9AA1EA 0%,#8189DC 55%,#5E64C2 100%)}
.room.cream{background:var(--c-cream,#F6EDDF)}
.room.dark{background:radial-gradient(120% 90% at 50% 40%,#3A3846 0%,#26242F 100%)}
.room.card{border-radius:40px;box-shadow:0 40px 90px rgba(var(--c-shdRGB,20,20,60),.35),0 0 0 14px var(--c-plate,#EFEDF7)}
.pat{position:absolute;inset:-600px;opacity:.10;background-image:radial-gradient(circle at 30% 30%,#8A6D3B 0 2px,transparent 3px),radial-gradient(circle at 70% 60%,#8A6D3B 0 1.5px,transparent 2.5px);background-size:180px 180px,260px 260px;will-change:transform}
.peri .pat{opacity:.07;background-image:radial-gradient(circle,#fff 0 2px,transparent 3px);background-size:120px 120px}
.dark .pat{opacity:.05;background-image:radial-gradient(circle,#fff 0 1.5px,transparent 2.5px);background-size:90px 90px}
.txt{line-height:1}
.hit{font-family:var(--f-hit),sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:-.005em;line-height:.9;color:#fff;text-shadow:0 8px 30px rgba(var(--c-shdRGB,20,20,60),.28)}
.script{font-family:var(--f-script),cursive;font-weight:400;color:#fff;line-height:1}
.sans{font-family:var(--f-sans),sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#fff;line-height:1.15}
.sub{font-family:var(--f-sans),sans-serif;font-weight:600;color:#fff;line-height:1.2}
.cream .hit,.cream .script,.cream .sans,.cream .sub{color:var(--c-ink,#4A4ABF);text-shadow:none}
.cream .hit{color:var(--c-acc,#5B5BD0)}
.cardel{background:var(--c-plate,#EFEDF7);border-radius:34px;box-shadow:0 30px 60px rgba(var(--c-shdRGB,20,20,60),.25);padding:36px 40px;color:var(--c-ink,#3E3EA8)}
.cardel .ct{font-weight:800;font-size:56px;text-align:center}
.cardel .ca{font-family:var(--f-script),cursive;font-size:40px;text-align:center;opacity:.8;margin-top:6px}
.cardel img{width:70%;margin:18px auto 0;display:block}
.pill{background:var(--c-plate,#F1EEF8);color:var(--c-ink,#4A4ABF);border-radius:999px;padding:16px 40px;font-weight:800;font-size:44px;white-space:nowrap;box-shadow:0 10px 30px rgba(var(--c-shdRGB,20,20,60),.18)}
.dark .pill{background:#fff}
.cursor{border:4px dashed rgba(255,255,255,.9);border-radius:6px}
.cursor::after{content:'';position:absolute;right:-30px;bottom:-34px;width:0;height:0;border-left:16px solid transparent;border-right:16px solid transparent;border-bottom:36px solid #fff;transform:rotate(-38deg);filter:drop-shadow(2px 2px 0 rgba(0,0,0,.35))}
.cursor .cl{position:absolute;left:-16px;top:-16px;width:14px;height:14px;background:#fff;box-shadow:0 0 0 2px rgba(0,0,0,.2)}
.cream .cursor{border-color:var(--c-acc,#5B5BD0)} .cream .cursor::after{border-bottom-color:var(--c-acc,#5B5BD0)}
.brk i{position:absolute;width:54px;height:54px;border:6px solid #fff;font-style:normal}
.brk i:nth-child(1){left:0;top:0;border-right:0;border-bottom:0} .brk i:nth-child(2){right:0;top:0;border-left:0;border-bottom:0}
.brk i:nth-child(3){left:0;bottom:0;border-right:0;border-top:0} .brk i:nth-child(4){right:0;bottom:0;border-left:0;border-top:0}
.cream .brk i{border-color:var(--c-acc,#5B5BD0)}
.bubble{background:#fff;border-radius:50%/56% 56% 44% 44%;box-shadow:0 30px 80px rgba(var(--c-shdRGB,20,20,60),.18)}
.bubble.sharp{border-radius:0;box-shadow:18px 18px 0 rgba(var(--c-shdRGB,20,20,60),.35)}
.bubble.sharp::after{left:60px;bottom:-56px;border-right:90px solid transparent;border-top:90px solid #fff;transform:skewX(28deg)}
.pill.sharp{border-radius:0;box-shadow:10px 10px 0 rgba(var(--c-shdRGB,20,20,60),.28)}
.spot{pointer-events:none;mix-blend-mode:multiply}
.bubble::after{content:'';position:absolute;left:12%;bottom:-70px;border-right:120px solid transparent;border-top:120px solid #fff;transform:skewX(20deg)}
.num{font-family:var(--f-hit),sans-serif;font-weight:700;color:var(--c-ink2,#2E2C5A);line-height:.85;text-align:center;white-space:nowrap}
.num b{color:#fff}
.dark .num{color:#fff}
.phone{width:520px;height:1040px;border-radius:70px;background:#111;padding:18px;box-shadow:0 40px 90px rgba(0,0,0,.35)}
.phone .scr{width:100%;height:100%;border-radius:54px;overflow:hidden;background:#fff}
.phone .scr img{width:100%;height:100%;object-fit:cover}
.comment{background:#fff;border-radius:14px;padding:18px 22px;color:#222;font-size:22px;line-height:1.3;box-shadow:0 14px 34px rgba(0,0,0,.25);font-weight:500}
.comment b{display:block;font-size:20px;color:#666;margin-bottom:6px}
.blob{border-radius:50%}
.grid{display:flex;flex-wrap:wrap}
.grid s{display:block;text-decoration:none;border-radius:10px;background:rgba(255,255,255,.35);will-change:transform,opacity;opacity:0}
.grid s.on{background:var(--c-gold,#F2B640)}
.cream .grid s{background:var(--c-plate2,#DDD8EC)} .cream .grid s.on{background:var(--c-acc,#5B5BD0)}
.cardel .grid{margin-top:14px} .cardel .grid s{background:var(--c-plate2,#DCD8EE)} .cardel .grid s.on{background:var(--c-acc,#5B5BD0)}
.e img{display:block;width:100%;height:auto}
.txt .a{background:var(--c-gold,#F2B640);color:var(--c-ink2,#2E2C5A);border-radius:.22em;padding:.02em .18em;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.cream .txt .a{background:var(--c-acc,#5B5BD0);color:#fff}
.shot{border-radius:28px;overflow:hidden;box-shadow:0 60px 120px rgba(var(--c-shdRGB,10,10,40),.45),0 0 0 3px rgba(255,255,255,.18);background:#111}
.shot img{display:block;width:100%;height:auto}
.lift{border-radius:18px;overflow:hidden;box-shadow:0 40px 80px rgba(var(--c-shdRGB,10,10,40),.5),0 0 0 2px rgba(255,255,255,.35);background:#111}
.lift img{display:block;position:absolute}
.bars{display:flex;align-items:flex-end;gap:16px}
.bars b{display:block;border-radius:10px 10px 4px 4px;background:var(--c-gold,#F2B640);transform-origin:50% 100%;will-change:transform}
.cream .bars b{background:var(--c-acc,#5B5BD0)}
.wave{display:flex;align-items:center;gap:22px;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.35);border-radius:22px;padding:22px 30px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 30px 70px rgba(var(--c-shdRGB,10,10,40),.35)}
.wave .lbl{font-weight:800;font-size:42px;color:#fff;white-space:nowrap;letter-spacing:.02em}
.wave .bw{display:flex;align-items:center;gap:7px;height:76px}
.wave .bw i{display:block;width:9px;border-radius:4px;background:#fff;height:10px;will-change:transform}
.cream .wave{background:rgba(var(--c-accRGB,91,91,208),.10);border-color:rgba(var(--c-accRGB,91,91,208),.5)} .cream .wave .lbl,.cream .wave .bw i{color:var(--c-ink,#4A4ABF);background:var(--c-acc,#5B5BD0)}
.cream .wave .lbl{background:none}
.typebox{display:inline-flex;align-items:center;gap:4px;background:#fff;color:var(--c-ink2,#2E2C5A);border-radius:20px;padding:22px 40px;font-weight:800;box-shadow:0 30px 70px rgba(var(--c-shdRGB,10,10,40),.3);white-space:nowrap}
.typebox .cr{display:block;width:.08em;height:1em;background:var(--c-ink2,#2E2C5A);border-radius:2px}
.typebox span{display:inline-block}
.tl{position:relative}
.tl .ax{position:absolute;left:0;right:0;top:50%;height:4px;background:rgba(255,255,255,.6);transform-origin:0 50%}
.tl .nd{position:absolute;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:var(--c-gold,#F2B640);box-shadow:0 0 0 6px rgba(var(--c-goldRGB,242,182,64),.25)}
.tl .lb{position:absolute;top:50%;margin-top:34px;transform:translateX(-50%);font-weight:800;font-size:40px;color:#fff;white-space:nowrap}
.cream .tl .ax{background:rgba(var(--c-inkRGB,74,74,191),.45)} .cream .tl .nd{background:var(--c-acc,#5B5BD0);box-shadow:0 0 0 6px rgba(var(--c-accRGB,91,91,208),.2)} .cream .tl .lb{color:var(--c-ink,#4A4ABF)}
.ghost{font-family:var(--f-hit),sans-serif;font-weight:700;text-transform:uppercase;line-height:.85;white-space:nowrap;color:#fff;opacity:.09}
.ghost.outline{color:transparent;-webkit-text-stroke:3px rgba(255,255,255,.45);opacity:.5}
.cream .ghost{color:var(--c-acc,#5B5BD0);opacity:.08} .cream .ghost.outline{color:transparent;-webkit-text-stroke:3px rgba(var(--c-accRGB,91,91,208),.4)}
.glass{border-radius:36px;background:rgba(255,255,255,.10);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35),0 30px 80px rgba(var(--c-shdRGB,20,20,60),.18);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.cream .glass{background:rgba(var(--c-accRGB,91,91,208),.06);box-shadow:inset 0 0 0 1px rgba(var(--c-accRGB,91,91,208),.35),0 30px 80px rgba(var(--c-accRGB,91,91,208),.10)}
.dark .glass{background:rgba(255,255,255,.07)}
.glass .gl{position:absolute;inset:0;border-radius:inherit}
.band{font-family:var(--f-hit),sans-serif;font-weight:700;text-transform:uppercase;line-height:1;white-space:nowrap;padding:22px 60px;color:#fff;background:#C8102E;box-shadow:0 30px 70px rgba(0,0,0,.28)}
.band.paper{background:var(--c-cream,#F6EDDF);color:var(--c-ink2,#2E2C5A)} .band.dark{background:#26242F} .band.indigo{background:var(--c-acc,#5B5BD0)} .band.gold{background:var(--c-gold,#F2B640);color:var(--c-ink2,#2E2C5A)} .band.white{background:#fff;color:var(--c-ink2,#2E2C5A)}
.band.strip{display:flex;align-items:center;justify-content:center}
.fig{pointer-events:none}.fig img{display:block;width:100%;height:auto;position:relative}
.fig .fsh{position:absolute;left:45%;bottom:1%;width:240%;height:6%;background:rgba(10,10,20,.5);transform-origin:0 100%;transform:skewX(-58deg);filter:blur(5px)}
.feedcard{background:#fff;padding:12px;box-shadow:0 26px 50px rgba(0,0,0,.28)}.feedcard img{display:block;width:100%}
.search{display:flex;align-items:center;gap:.5em;background:#fff;border-radius:999px;padding:0 .62em;box-shadow:0 18px 40px rgba(var(--c-shdRGB,10,10,40),.22),0 0 0 3px rgba(22,20,15,.10) inset}
.search .q{font-family:var(--f-sans),sans-serif;font-weight:600;color:#16140F;white-space:nowrap;line-height:1}
.search .q i{font-style:normal}
.search .car{width:.06em;height:1.06em;background:#16140F;border-radius:2px;flex:none}
.search .yt,.search .mg{flex:none}
.search .mg{margin-left:auto}
.photo{background:#fff;padding:14px 14px 18px;box-shadow:0 30px 60px rgba(0,0,0,.35),0 2px 0 rgba(0,0,0,.08)}
.gen{overflow:hidden;box-shadow:0 40px 90px rgba(var(--c-shdRGB,0,0,0),.45),0 0 0 2px rgba(255,255,255,.14)}
.gen .gstep{position:absolute;right:18px;bottom:16px;font:600 26px/1 var(--f-sans),sans-serif;letter-spacing:.06em;color:#fff;background:rgba(0,0,0,.38);padding:8px 12px}
.photo img{display:block;width:100%;height:auto}
.photo .cap{font-family:var(--f-script),cursive;font-size:34px;color:var(--c-ink2,#2E2C5A);text-align:center;margin-top:10px;line-height:1}
.photo .tape{position:absolute;width:150px;height:40px;background:rgba(255,236,170,.75);box-shadow:0 2px 6px rgba(0,0,0,.15);left:50%;top:-20px;transform:translateX(-50%) rotate(-3deg)}
.photo .tape.lt{left:14px;top:-16px;transform:rotate(-40deg)} .photo .tape.rt{left:auto;right:-40px;top:-16px;transform:rotate(40deg)}
.count{font-family:var(--f-hit),sans-serif;font-weight:700;color:#fff;line-height:.9;white-space:nowrap}
.count small{font-family:var(--f-sans),sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:.06em;font-size:.32em;margin-left:.2em;vertical-align:.2em}
.cream .count{color:var(--c-acc,#5B5BD0)}
#hud{position:absolute;inset:0;pointer-events:none;z-index:50}
#hud .hudpill{background:rgba(255,255,255,.14);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.45);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#fff;border-radius:999px;padding:14px 34px;font-family:var(--f-sans),sans-serif;font-weight:700;font-size:30px;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
#hud .hudpill b{font-family:var(--f-script),cursive;font-weight:400;text-transform:none;letter-spacing:0;font-size:1.25em;margin-left:.3em}
.ovl-iris{position:absolute;left:0;top:0;width:100px;height:100px;border-radius:50%;pointer-events:none}
.ovl-band{position:absolute;left:50%;top:50%;width:3200px;height:760px;margin:-380px 0 0 -1600px;pointer-events:none;display:flex;align-items:center;justify-content:center;font-family:var(--f-hit),sans-serif;font-weight:700;text-transform:uppercase;font-size:220px;color:#fff;letter-spacing:.02em}
/* v11 (15.09.2026) grounds and kinds from four references: RB.visualsz lamp DcqJvlMh6QT, motionbylade collage DXpQrrFCP-6, sumama UI DcGgRnVi2bn, Vox collage DceFNdVM-NG */
.room.paper{background:#E6D9BF}
.room.news{background:#1C1B1A}
.room.studio{background:radial-gradient(80% 55% at 50% 45%,#FBFBFB 0%,#E1E1E1 55%,#BBBBBB 100%)}
.room.yellow{background:#F3C01E}
.paper .pat{opacity:1;background-image:${PAPER_TX},radial-gradient(circle,rgba(60,40,20,.10) 0 1.4px,transparent 2.4px);background-size:520px 520px,11px 11px}
.news .pat{opacity:1;background-image:${NEWS_TX};background-size:980px 760px}
.studio .pat{display:none}
.yellow .pat{opacity:.07;background-image:radial-gradient(circle,#000 0 1.6px,transparent 2.6px);background-size:13px 13px}
.paper .hit,.studio .hit,.yellow .hit,.paper .script,.studio .script,.yellow .script,.paper .sans,.studio .sans,.yellow .sans,.paper .sub,.studio .sub,.yellow .sub,.paper .count,.studio .count,.yellow .count,.paper .num,.studio .num,.yellow .num,.paper .num b,.studio .num b,.yellow .num b{color:#16140F;text-shadow:none}
.news .hit{color:#F5EEE4}
.serif{font-family:var(--f-serif),serif;font-style:italic;font-weight:900;line-height:.8;letter-spacing:-.035em;color:#F7EDE8;text-transform:none}
.paper .serif,.studio .serif,.yellow .serif{color:#16140F}
.paper .pill,.studio .pill,.yellow .pill{background:#16140F;color:#F7F2E8}
.paper .ghost,.studio .ghost,.yellow .ghost{color:#16140F;opacity:.07}
.paper .ghost.outline,.studio .ghost.outline,.yellow .ghost.outline{color:transparent;-webkit-text-stroke:3px rgba(22,20,15,.35)}
.lamp{pointer-events:none}.lampcone{position:absolute;left:0;top:0}.lampcone .it{position:absolute;white-space:nowrap}
.lampbody i{position:absolute;left:18px;top:-58px;width:134px;height:118px;background:#101010;border-radius:22px;box-shadow:0 18px 30px rgba(0,0,0,.35)}
.lampbody i::after{content:'';position:absolute;left:30px;bottom:-16px;width:74px;height:26px;background:#1E1E1E;border-radius:6px}
.tear{pointer-events:none;filter:drop-shadow(0 14px 18px rgba(0,0,0,.32))}
.tear i{position:absolute;inset:0;display:block}.tear .rim{background:#F6F1E6}.tear .fil{background-size:cover;background-position:50% 50%}
.hl{mix-blend-mode:multiply}
.progress{pointer-events:none}.progress .trk,.progress .fil{position:absolute;top:0;height:100%;border-radius:999px}
.progress svg{position:absolute;left:50%;top:50%;overflow:visible}
.pointer{pointer-events:none;filter:drop-shadow(0 8px 10px rgba(0,0,0,.35))}
.pointer .rip{position:absolute;left:-40px;top:-40px;width:80px;height:80px;border-radius:50%;border:5px solid rgba(255,255,255,.9);opacity:0}
.paper .pointer .rip,.studio .pointer .rip,.yellow .pointer .rip{border-color:rgba(22,20,15,.7)}
.gobo{pointer-events:none;mix-blend-mode:multiply}
.blinkcard{position:absolute;inset:0;display:none;align-items:center;justify-content:center;pointer-events:none;z-index:60}
.blinkcard b{font-family:var(--f-sans),sans-serif;font-weight:700;letter-spacing:-.01em;white-space:nowrap}
.tornrim{position:absolute;left:0;width:100%;height:100px;pointer-events:none;display:none;background-repeat:repeat-x;background-size:720px 100px}
/* v12 iOS story kit (henryexists Db5zGx4O5oa): Notes card, list card with streaks, glyph dust */
.note{background:#FBFBFD;border-radius:44px;box-shadow:0 30px 70px rgba(20,20,40,.16);font-family:var(--f-ui,Inter),sans-serif;color:#15161A}
.note .nh{height:1.9em;border-radius:44px 44px 0 0;background:linear-gradient(180deg,#FFD60A,#F4B400);display:flex;align-items:center;justify-content:center;position:relative;color:#fff;font-weight:600;font-size:.82em}
.note .nh i{position:absolute;left:1em;top:.62em;width:1.05em;height:.78em;border:3px solid #fff;border-radius:5px}
.note .nb{padding:.7em .9em .8em;border-top:3px dotted rgba(0,0,0,.08)}
.note .nt{font-weight:500;text-align:center;line-height:1.25}
.note .nw{display:inline-block;position:relative}
.note .nw::after{content:'';position:absolute;left:0;right:0;bottom:-.06em;height:.07em;border-radius:.04em;background:#E0262B;transform:scaleX(var(--u,0));transform-origin:0 50%}
.note .ni{position:relative;margin-top:.45em}
.note .nr{position:absolute;left:0;right:0;display:flex;align-items:center;gap:.35em;height:1.5em;font-weight:500;white-space:nowrap;opacity:0}
.note .cb{display:block;width:1.05em;height:1.05em;flex:none}
.note .cb svg{display:block;width:100%;height:100%;overflow:visible}
.note .cc{fill:none;stroke:#3A3A3C;stroke-width:2.5}
.note .cx{stroke:#E0262B;stroke-width:4;fill:none;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1}
.note .ck{stroke:#15161A;stroke-width:4;fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1}
.note .nl{display:inline-block}
.note .nd{text-align:center;color:#8E8E93;font-size:.78em;margin-top:.35em}
.streak{background:#FBFBFD;border-radius:48px;padding:1.1em 1em 1.2em;box-shadow:0 30px 70px rgba(20,20,40,.16);font-family:var(--f-ui,Inter),sans-serif;color:#15161A}
.streak .sh{color:#E0262B;font-weight:700;letter-spacing:.04em;text-align:center;font-size:1.05em}
.streak .ss{color:#8E8E93;text-align:center;font-size:.72em;margin:.25em 0 .6em}
.streak .srow{position:relative;display:flex;gap:.55em;align-items:center;padding:.42em 1.5em .42em .7em;font-weight:500;line-height:1.15}
.streak .srow b{font-weight:700;color:#E0262B;min-width:3.1em;position:relative;z-index:1;font-variant-numeric:tabular-nums}
.streak .srow span{position:relative;z-index:1}
.streak .srow.on b{color:#15161A}
.streak .sp{position:absolute;left:0;right:0;top:.1em;bottom:.1em;border-radius:999px;transform-origin:0 50%;transform:scaleX(0);opacity:0}
.streak .sd{position:absolute;right:auto;top:50%;width:1.35em;height:1.35em;margin-left:-1.05em;border-radius:50%;transform:translateY(-50%) scale(0);z-index:2}
.dust{pointer-events:none}.dust i{position:absolute;font-style:normal;font-family:var(--f-ui,Inter),sans-serif;color:rgba(20,20,26,.5)}
#mark{position:absolute;left:0;right:0;bottom:64px;text-align:center;font-weight:700;font-size:24px;letter-spacing:.4em;text-transform:uppercase;color:rgba(255,255,255,.6)}
`;

export function mount(spec) {
  spec = withClient(spec, 'canvas');   // client preset fills what the spec leaves out; no CLIENT (or already applied by speaker-canvas) → same spec
  css(STYLE);
  spec.beats.forEach(b => (b.add || []).forEach(e => { if ((e.around || e.over || e.from) && e.x === undefined) { e.x = 0; e.y = 0; e._bound = true; } }));
  autoLayout(spec);
  const VO = window.VO, LINES = spec.lines || window.LINES || [];
  const NB = spec.beats.length;
  if (!VO || VO.length < NB) throw new Error(`VO has ${VO ? VO.length : 0} lines, spec needs ${NB}`);
  const { A, DUR } = timeline(VO, spec.tail ?? 1.0);

  const stage = document.createElement('div'); stage.id = 'stage'; document.body.appendChild(stage);
  const comp = new Comp({ fps: 30, duration: DUR, stage });
  /* Raylight lens (opt-in): dolly = the camera travels through the depth stack instead of magnifying a flat frame;
     focus/aperture = depth of field, rack-focused per beat through cam keys { focus, ap }. */
  if (spec.lens) { comp.camera.dolly = spec.lens.dolly ?? 0.6; comp.camera.defocus = { focus: spec.lens.focus ?? 1, aperture: spec.lens.aperture ?? 0 }; }
  /* v9 «одно непрерывное движение» (14.09.2026, автор референсов): камера жанра работает как слой на
     движущемся нуле — между ключами она не замирает (creep ползёт 14 % пути за время hold), и поверх всего
     идёт бесконечный медленный снос (drift). Отсюда же и параллакс: слои с depth ≠ 1 расходятся всё время,
     а не только на перелёте. Ручная тряска (wiggle) убрана до трети — она спорила со сносом. */
  comp.camera.creep = spec.creep ?? 0.14;
  comp.camera.drift = spec.drift === false ? null : (spec.drift || { x: 22, y: 15, z: 0.005, px: 11, py: 8.5, pz: 13 });
  comp.camera.wig = spec.wig ?? 0.35;
  /* scene effects, one or two per reel (Raylight: restraint wins): bloom, grain, vignette */
  (spec.fx || []).forEach(f => { if (f === 'bloom') FX.bloom(comp, spec.bloom ?? 0.22); else if (f === 'grain') FX.grainReal(comp, spec.grain ?? 0.07); else if (f === 'vignette') FX.vignette(comp, spec.vignette ?? 0.3); });
  const mark = document.createElement('div'); mark.id = 'mark'; mark.textContent = spec.mark || ''; stage.appendChild(mark);
  comp.overlay('', t => { mark.style.opacity = t > DUR - 1.4 ? '0' : '1'; });

  /* v4: screen-space HUD (a header pinned over every room — «мои работы для BI Group», «шаг 1») */
  const hud = document.createElement('div'); hud.id = 'hud'; stage.appendChild(hud);
  const HUD = { id: '__hud', x: 0, y: 0, w: 1080, h: 1920, bg: 'hud', scale: 1, L: comp.layer(hud, { base: { x: 0, y: 0, w: 1080, h: 1920, ax: 0, ay: 0 } }) };
  HUD.L.node.style.position = 'absolute'; stage.appendChild(hud);   // comp.layer re-parented it under root; put it back on the stage

  /* rooms = parent layers */
  const ROOMS = {};
  /* v8 bleed (Elzhan 14.09.2026: «полотно рассчитано на неподвижную камеру, а во время наклона видны границы мира»): a tilted sheet
     shows its own side edges. Every room of a reel that tilts gets a field of the same ground `bleed` px wide on all sides (a layer
     behind it); the room itself turns transparent so no gradient seam shows where it meets the field. Rooms on the map must stand
     ≥ 2·bleed apart, or one world's field covers its neighbour — warned below. */
  const tiltSpec = spec.beats.some(b => (Array.isArray(b.cam) ? b.cam : [b.cam || {}]).some(k => k.rx || k.ry));
  const BL = spec.bleed ?? (tiltSpec ? 1400 : 0);
  if (BL) spec.rooms.forEach((a, i) => spec.rooms.forEach((b, j) => { if (j <= i) return; const at = a.top || 0, bt = b.top || 0;
    if (a.x - BL < b.x + b.w + BL && b.x - BL < a.x + a.w + BL && a.y - at - BL < b.y + b.h + BL && b.y - bt - BL < a.y + a.h + BL) console.warn(`BLEED OVERLAP: rooms "${a.id}" and "${b.id}" stand closer than 2×bleed (${BL}) — spread them on the map`); }));
  spec.rooms.forEach(r => {
    const n = document.createElement('div'); n.className = 'room ' + r.bg + (r.card ? ' card' : '') + (BL ? ' bled' : ''); n.dataset.room = r.id;
    /* v4: `top` = extra surface above the room's origin (local y stays as written) — the camera never shows the stage outside a world */
    const top = r.top || 0, sc = r.scale ?? 1;
    n.style.cssText = `width:${r.w}px;height:${r.h + top}px;${r.r ? `border-radius:${r.r}px;` : ''}z-index:${r.z ?? 1}`;
    let B = null;
    if (BL) { const bn = document.createElement('div'); bn.className = 'room bleed ' + r.bg; bn.style.cssText = `width:${r.w + BL * 2}px;height:${r.h + top + BL * 2}px;z-index:${(r.z ?? 1) - 1}`;
      B = comp.layer(bn, { base: { x: r.x - BL * sc, y: r.y - (top + BL) * sc, scale: sc, w: r.w + BL * 2, h: r.h + top + BL * 2, ax: 0, ay: 0 } }); }
    if (r.pattern !== false) { const p = document.createElement('div'); p.className = 'pat'; (B ? B.node : n).appendChild(p); r._pat = p; }
    const L = comp.layer(n, { base: { x: r.x, y: r.y - top * sc, scale: sc, w: r.w, h: r.h + top, ax: 0, ay: 0 } });
    ROOMS[r.id] = { ...r, scale: sc, top, L, B, bleed: BL };
  });
  ROOMS.__hud = HUD;
  comp.overlay('', t => { for (const id in ROOMS) { const r = ROOMS[id]; if (r._pat) r._pat.style.transform = `translate(${(Math.sin(t * 0.11 + r.x) * 40).toFixed(1)}px,${(t * 9 % 180).toFixed(1)}px)`; } });

  const onBeat = (t, lo, hi) => { let b = null; (window.BEATS || []).forEach(x => { if (x >= lo && x <= hi && (b === null || Math.abs(x - t) < Math.abs(b - t))) b = x; }); return b; };
  const atTime = (at, li) => typeof at === 'string' && at.endsWith('s') ? parseFloat(at) : li < 0 ? +(at ?? 0) : A[li][0] + (at ?? 0) * (A[li][1] - A[li][0]);
  const wordAt = (li, spec) => { const [w, n] = String(spec).split('#'); const key = w.toLowerCase().replace(/ё/g, 'е'); const ws = ((window.WORDS || [])[li] || []).map(x => ({ ...x, w: x.w.replace(/ё/g, 'е') })); let hits = ws.filter(x => x.w === key); if (!hits.length) hits = ws.filter(x => x.w.startsWith(key)); const m = hits[(+n || 1) - 1]; if (!m) { console.warn(`on: word "${w}" not found in line ${li + 1}`); return null; } return A[li][0] + m.t - 0.06; };
  const rrect = (w, h, r) => `M${r} 0 H${w - r} A${r} ${r} 0 0 1 ${w} ${r} V${h - r} A${r} ${r} 0 0 1 ${w - r} ${h} H${r} A${r} ${r} 0 0 1 0 ${h - r} V${r} A${r} ${r} 0 0 1 ${r} 0 Z`;
  const rnd = i => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  /* `sep` у счётчика: тонкий пробел у Inter почти нулевой, и 15 000 000 читался слитно (icon/reel_042) */
  const fmtN = (n, sep = '\u2009') => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const div = (cls, css, html = '') => { const n = document.createElement('div'); n.className = cls; n.style.cssText = css; n.innerHTML = html; return n; };
  const show = (L, t0) => L.set({ opacity: 0 }).key('opacity', t0 - 0.01, 0, 'hold').key('opacity', t0, 1, 'linear');
  const byId = {}, RECS = [], landAt = {}, liftR = {}, AIMS = [];   // landAt: id → time the element lands (spot follow)

  const ALL = spec.beats.map((b, li) => [b, li]); if (spec.hud) ALL.push([{ room: '__hud', add: spec.hud }, -1]);
  let LIFTED = false, TILTED = false;
  ALL.forEach(([b, li]) => {
    if ((b.add || []).some(e => e.k === 'stack')) b.layered = true;
    (b.add || []).forEach(e => {
      /* v16 (17.09.2026, Елжан на atlas/reel_008: «субтитры появляются все время в разных местах, нет единой концепции»):
         `screen: true` — элемент живёт в ЭКРАННОМ пространстве (слой #hud вне камеры), а не в комнате. Причина замером:
         в лицевых битах y набора был ОДИН (1150/1210/1380/1470), а на экране он вставал на 21 разный ряд — камера
         каждого бита (z 1.06…1.30) растаскивала одну лестницу по кадру, и ни один гейт этого не видел, потому что
         каждый элемент по отдельности был на месте. Композиция — это отношение между битами, поэтому и система
         координат у набора одна на ролик. Ряды и колонки держит engine/qa/rows.js. */
      const R = e.screen ? ROOMS.__hud : ROOMS[e.room || b.room], parent = R.L;
      if (e.screen && e.behind) console.warn(`screen + behind on "${e.t || e.k}": экранный элемент всегда перед спикером — выбери одно`);
      const EL = { act: li, room: R.id, k: e.k, x: e.x, y: e.y, screen: !!e.screen, t: String(e.t || '').slice(0, 26) }; (window.ELS = window.ELS || []).push(EL);
      /* v4: `on: 'слово'` (or 'слово#2' for the second occurrence) lands the element on the spoken word from whisper;
         `at` stays the fallback. `off` shifts in seconds. The reference lands 90 % of its elements on a word. */
      /* v12: `on: 'слово@3'` lands on a word of line 3 (1-based) — a card built in one line gets its rows on the next lines' words */
      const AT = (q, fb) => { if (q === undefined || q === null) return atTime(fb, li); if (typeof q === 'number' || /^[\d.]+s$/.test(q)) return atTime(q, li); const [w, ln] = String(q).split('@'); const L2 = ln ? +ln - 1 : li; return L2 >= 0 ? (wordAt(L2, w) ?? A[L2][0]) : atTime(fb, li); };
      const t0 = (e.on && li >= 0 && !(e.k === 'grid' && typeof e.on === 'number') ? (String(e.on).includes('@') ? AT(e.on) : (wordAt(li, e.on) ?? atTime(e.at, li))) : atTime(e.at, li)) + (e.off || 0), dur = e.dur ?? 0.42;
      const base = { x: e.x, y: (e.y || 0) + (R.top || 0), w: e.w || 0, h: e.h || 0, rot: e.rot || 0 };
      /* qa/master.py READ TIME: when the lettering appears and when `until` takes it away (null = it lives until the camera leaves
         the room). Law: max(1.2, chars/13 + 0.6) + dur — Elzhan 17.09.2026, «тексты появляются и исчезают слишком быстро». */
      Object.assign(EL, { t0: +t0.toFixed(3), t1: e.until !== undefined ? +atTime(e.until, li).toFixed(3) : null, dur, n: String(e.t || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().length, chars: e.chars || null });
      const opts = { parent, depth: e.depth ?? 1, base };
      /* v5 (13.09.2026, hakk «ин ша Аллах» dive): `lift` = px the element hangs IN FRONT of its world's sheet while the camera
         tilts (cam rx/ry). Rooms clip (overflow) and so stay flat; a lifted element is parented to the root in global coords. */
      /* `lift` носит два смысла: число = px перед листом (здесь), объект {x,y,w,h} = кроп самого себя
         у `shot`. Объект уезжал в base.z и ронял кадр на `z.toFixed` — ветка shot+lift не рендерилась
         ни разу (examples/raylight/spec.js:73 написан именно так). Поднимает только число. */
      const LZ = typeof e.lift === 'number' && e.lift;
      if (LZ) { if (e.id) liftR[e.id] = R; opts.parent = comp.root; base.x = R.x + e.x * R.scale; base.y = R.y + (e.y || 0) * R.scale; base.scale = R.scale; base.z = LZ; LIFTED = true; }
      let L = null;
      /* v9 (14.09.2026): входы жанра идут по кривым Flow (P.ENTRY_SOFT) — приход без удара обратной дуги
         и со смазом. `motion: 'hard'` в спеке возвращает прежние входы. */
      const SET = spec.motion === 'hard' ? P.ENTRY : P.ENTRY_SOFT;
      const entry = (L, kind) => { const f = SET[kind || 'pop']; if (f) f(L, t0, dur); return L; };
      switch (e.k) {
        case 'text': {
          const ws = String(e.t).split(/\s+/);
          L = comp.text(e.t, { ...opts, cls: 'e txt ' + (e.voice || 'sans'), css: `font-size:${e.s || 80}px;${e.color ? `color:${e.color};` : ''}${e.align ? `text-align:${e.align};` : ''}`, wrap: e.wrap, split: e.chars ? 'chars' : 'words' });
          let times;
          if (e.chars === 'fly') {   /* 24.09.2026 (icon/reel_039, Елжан: «как появляются текста побуквенно очень красиво»): буквы слетаются
               каждая со своей стороны — сдвиг 40…130 px вправо и 30…90 вниз, поворот ±25°, размытие 7 px, прозрачность 0 → на место
               за 0.30 с ease-out, шаг 0.022 с слева направо. Это движение строки заметки (`note`), вынесенное для любой надписи. /mnt-letterfly */
            const st = e.stagger ?? 0.022;
            times = L.units.map((_, k) => t0 + k * st);
            L.animate({ times, dur: e.fly ?? 0.3, ease: 'out', from: k => { const s0 = rnd(k * 13 + li * 7); return { x: 40 + s0 * 90, y: 30 + rnd(k * 7 + li * 3) * 60, rot: s0 * 50 - 25, blur: 7, opacity: 0 }; } });
            show(L, t0); times.forEach((tw, k) => { if (k % 3 === 0) comp.cue(tw, 'key'); }); if (e.z) L.node.style.zIndex = e.z; break;
          }
          if (e.chars) {   // v4: the word assembles letter by letter — 'shuffle' = ransom order (hakk «РЕКЛАМЫ»), 'type' = left to right (glass-blue «ИСХОДНИКИ»)
            const n = L.units.length, span = e.dur ?? Math.min(0.9, 0.05 * n + 0.25);
            const order = [...Array(n).keys()]; if (e.chars === 'shuffle') order.sort((a, b) => rnd(a + li * 31) - rnd(b + li * 31));
            times = order.map(() => 0); order.forEach((ui, k) => times[ui] = t0 + k / Math.max(1, n - 1) * span);
            L.animate({ times, dur: e.chars === 'type' ? 0.24 : 0.34, from: { y: e.chars === 'type' ? 0 : 22, scale: e.chars === 'type' ? 1.35 : 1.45, opacity: 0, blur: 7, rot: e.chars === 'type' ? 0 : -9 }, ease: 'settle' });
            show(L, t0); times.forEach(tw => comp.cue(tw, e.chars === 'type' ? 'key' : 'word')); if (e.z) L.node.style.zIndex = e.z; break;
          }
          if (e.words !== false) { const [a0, a1] = A[li]; const bt = beats(LINES[li] || '', ws, li, a1 - a0); times = ws.map((w, i) => Math.max(t0, a0 + bt[i] * (a1 - a0) - 0.06)); }
          else times = ws.map((_, i) => t0 + i * 0.06);
          if (e.smear) L.animate({ times, dur: 0.17, from: { x: 34, sx: 2.4, opacity: 0.25, blur: 1.5 }, ease: 'out' });   // v14 goz: pale because stretched (1/sx)
          else if (e.sweep) L.animate({ sweep: { t0, dur: e.dur ?? 0.6, width: 3.4 }, from: { y: 16, scale: 1.16, opacity: 0, blur: 9 }, ease: 'flow' });
          else L.animate({ times, dur: 0.34, from: { y: 11, scale: 1.26, opacity: 0, blur: 7, rot: -2 }, ease: 'settle' });
          show(L, t0);
          if (e.voice === 'hit' || e.cue) times.forEach(tw => comp.cue(tw, 'word'));   // 13.09.2026 Elzhan: too many clicks — only HIT words click; `cue: true` opts a line in
          if (e.z) L.node.style.zIndex = e.z;
          break;
        }
        case 'img': L = entry(comp.layer(div('e' + (e.plate ? ' footage' : ''), `width:${e.w}px`, `<img src="assets/img/${e.src}" alt="">`), opts), e.anim);   // v14: `plate` = a full-bleed photo, footage for the gates
          if (e.kb) {   // v14 goz: a plate never parks — it travels [dx, dy] and grows by ds from its landing to `until` (or 6 s)
            const [kx, ky, ks] = e.kb, T1 = e.until !== undefined ? atTime(e.until, li) : t0 + 6, q = t => clamp((t - t0) / Math.max(0.1, T1 - t0));
            L.expr('x', (t, v) => v + kx * q(t)).expr('y', (t, v) => v + ky * q(t)).expr('scale', (t, v) => v * (1 + ks * q(t)));
          } else P.float(L, t0 + dur, 6, 1.3, li);
          comp.cue(t0, 'pop'); break;
        case 'seq': {   // живая вставка: последовательность кадров внутри рамки (src с %04d, frames, fps).
          // Перенесено из genre/speaker.js 16.09.2026: у canvas-жанров вставка со съёмкой была только
          // статичной (photo/img), и карточка спикера в полотне стояла неподвижно весь мир.
          // Без kb: прогресс акта здесь недоступен, а движение даёт сама смена кадров.
          const n = div('e seq', `width:${e.w}px;height:${e.h || Math.round(e.w * 16 / 9)}px;overflow:hidden;border-radius:${e.r ?? 0}px;${e.shadow === false ? '' : 'box-shadow:0 34px 90px rgba(0,0,0,.38);'}`);
          const im = document.createElement('img'); im.alt = '';
          im.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
          n.appendChild(im);
          L = entry(comp.layer(n, opts), e.anim || 'fade');
          const frames = e.frames || 1, fps = e.fps || 30; let cur = '';
          const ap = L.apply.bind(L);
          L.apply = (t, ex) => {
            if (!ap(t, ex)) return false;
            // 17.09.2026 Elzhan («видео длится 5 секунд, а стоит в кадре 7 — последние 2 секунды это просто фото»):
            // раньше индекс упирался в последний кадр, и вставка замирала на всё, что клип не покрывает. Теперь
            // дорожка идёт маятником — вперёд, назад, вперёд: петля прыгала бы обратно к первому кадру видимым
            // скачком, а разворот на месте движения не рвёт. Клип, равный биту, ведёт себя ровно как раньше.
            const raw = Math.floor((t - t0) * fps);
            const per = frames > 1 ? frames * 2 - 2 : 1;
            const q = ((raw % per) + per) % per;
            const k = Math.max(1, Math.min(frames, (q < frames ? q : per - q) + 1));
            const src = frames > 1 ? e.src.replace('%04d', String(k).padStart(4, '0')) : e.src;
            if (src !== cur) { im.src = src; cur = src; }
            return true;
          };
          if (e.cue !== false) comp.cue(t0, e.cue || 'card'); break;   // cue: false — a wall of 50 cards (icon/reel_077 15.10) would rattle
        }
        case 'three': {   /* v17 (14.10.2026, icon/reel_077 — /triplex-reel × /abat-reel): a three.js mechanism standing in a paper world.
             The spec owns three: it builds `spec.studio = makeStudio()` from engine/vendor/kit.js (one WebGL context) and fills SCENES;
             this kind only draws scene `name` at local time t − t0 into its canvas. `hits` = seconds after landing → 'mech' cues. */
          if (!spec.studio) throw new Error(`three "${e.name}": spec.studio is missing — makeStudio() from engine/vendor/kit.js`);
          const n = div('e three', `width:${e.w}px;height:${e.h}px`), cv = document.createElement('canvas');
          cv.width = e.w; cv.height = e.h; cv.style.cssText = 'width:100%;height:100%;display:block'; n.appendChild(cv);
          L = entry(comp.layer(n, opts), e.anim || 'fade');
          const ap = L.apply.bind(L);
          L.apply = (t, ex) => { if (!ap(t, ex)) return false; spec.studio.draw(cv, e.name, t - t0, e.opt || {}); return true; };
          comp.cue(t0, 'card'); (e.hits || []).forEach(h => comp.cue(t0 + h, 'mech')); break;
        }
        case 'stack': {   // v5 (Taharat DZh2pXnNjj0): a row of cut-out figures receding on a diagonal, each at its own depth with a floor
          // shadow; the camera slides sideways and the row opens up — 2D layers that read as a 3D room. Other elements of the beat with a
          // `depth` sort into the row (a print in front of the far figure, behind the near one). srcs: assets/… paths, near → far.
          const n = e.srcs.length, d0 = e.near ?? 1.22, d1 = e.far ?? 0.86, dx = e.dx ?? 170, dy = e.dy ?? -60, sh = e.shrink ?? 0.84;
          e.srcs.forEach((src, i) => {
            const u = n > 1 ? i / (n - 1) : 0, depth = d0 + (d1 - d0) * u, sc = Math.pow(sh, i);
            const node = div('e fig', `width:${e.w}px`, `<i class="fsh"></i><img src="assets/${src}" alt="" style="opacity:${(1 - u * (e.fade ?? 0.3)).toFixed(2)}">`);
            const FL = comp.layer(node, { parent, depth, base: { x: e.x + dx * i, y: base.y + dy * i, w: e.w, h: e.h || e.w * 1.6, rot: 0, scale: sc, ax: 0, ay: 1 } });
            FL.node.style.zIndex = Math.round(depth * 100); (b._dl || (b._dl = [])).push([FL, depth]);
            entry(FL, e.anim || 'fade'); FL.tracks.opacity = [{ t: t0 + i * (e.step ?? 0.08), v: 0, e: 'hold' }, { t: t0 + i * (e.step ?? 0.08) + dur, v: 1, e: 'out' }];
            P.float(FL, t0 + dur, 3, 0.9 + i * 0.13, li + i);
          });
          b.layered = true; comp.cue(t0, 'card'); break;
        }
        case 'card': {
          const g = e.grid ? `<div class="grid" style="gap:10px">${Array.from({ length: e.grid.n }, (_, i) => `<s class="${i < e.grid.on ? 'on' : ''}" style="width:${e.grid.cell || 44}px;height:${Math.round((e.grid.cell || 44) * 0.8)}px;opacity:1"></s>`).join('')}</div>` : '';
          L = entry(comp.layer(div('e cardel', `width:${e.w}px`, `${e.title ? `<div class="ct">${e.title}</div>` : ''}${e.ar ? `<div class="ca">${e.ar}</div>` : ''}${e.img ? `<img src="assets/img/${e.img}" alt="">` : ''}${g}${e.html || ''}`), opts), e.anim || 'flip');
          if (!e.still) { P.float(L, t0 + dur, 6, 1.3, li); P.sway(L, t0 + dur, 5, 3, li); }   // `still`: a card that is part of a built object (a block in a chart column) must not bob on its own
          comp.cue(t0, 'card'); break;
        }
        case 'pill': L = entry(comp.layer(div('e pill' + (e.sharp ? ' sharp' : ''), `font-size:${e.s || 44}px;${e.r !== undefined ? `border-radius:${e.r}px;` : ''}${e.bg ? `background:${e.bg};` : ''}${e.color ? `color:${e.color};` : ''}`, e.t), opts), e.anim); P.float(L, t0 + dur, 5, 1.1, li); comp.cue(t0, 'pop'); break;
        case 'cursor': L = entry(comp.layer(div('e cursor', `width:${e.w || 100}px;height:${e.h || 100}px`, '<i class="cl"></i>'), opts), e.anim || 'grow'); comp.cue(t0, 'pop'); break;
        case 'brk': L = entry(comp.layer(div('e brk', `width:${e.w || 100}px;height:${e.h || 100}px`, '<i></i><i></i><i></i><i></i>'), opts), e.anim || 'fade'); break;
        case 'bubble': L = entry(comp.layer(div('e bubble' + (e.sharp ? ' sharp' : ''), `width:${e.w}px;height:${e.h}px`), opts), e.anim || 'grow'); P.float(L, t0 + dur, 8, 0.9, li); comp.cue(t0, 'pop'); break;
        case 'num': L = entry(comp.layer(div('e num', `font-size:${e.s || 420}px`, `${e.t}<b>${e.mark || ''}</b>`), opts), e.anim || 'pop'); P.breathe(L, 0.015, 1.1); comp.cue(t0, 'pop'); break;
        case 'phone': L = entry(comp.layer(div('e phone', '', `<div class="scr">${e.src ? `<img src="assets/img/${e.src}" alt="">` : (e.html || '')}</div>`), { ...opts, base: { ...base, w: 520, h: 1040 } }), e.anim || 'up'); P.float(L, t0 + dur, 6, 1.0, li); P.sway(L, t0 + dur, 4, 2, li); comp.cue(t0, 'card'); break;
        case 'comment': L = entry(comp.layer(div('e comment', `width:${e.w || 420}px`, `<b>${e.who || ''}</b>${e.t}`), opts), e.anim || 'pop'); P.float(L, t0 + dur, 5, 1.2, li); comp.cue(t0, 'card'); break;
        case 'blob': L = entry(comp.layer(div('e blob', `width:${e.w}px;height:${e.h}px;background:${e.color || 'rgba(255,255,255,.9)'}`), opts), e.anim || 'grow'); P.drift(L, 18, 0.35); break;
        case 'grid': {
          const cell = e.cell || 80, gap = e.gap || 12;
          const n = div('e grid', `gap:${gap}px;width:${(e.cols || 7) * (cell + gap)}px`);
          const cells = [];
          for (let i = 0; i < e.n; i++) { const c = document.createElement('s'); c.style.cssText = `width:${cell}px;height:${Math.round(cell * (e.ratio || 0.8))}px`; if (i < (e.on ?? e.n)) c.className = 'on'; n.appendChild(c); cells.push(c); }
          L = comp.layer(n, opts); show(L, t0);
          const step = e.step ?? 0.03, ap = L.apply.bind(L);
          L.apply = (t, ex) => { if (!ap(t, ex)) return false; cells.forEach((c, i) => { const q = pr(t, t0 + i * step, 0.22), bk = 1 + 2.6 * Math.pow(q - 1, 3) + 1.6 * Math.pow(q - 1, 2); c.style.opacity = q.toFixed(3); c.style.transform = `scale(${(0.3 + 0.7 * clamp(bk)).toFixed(3)}) translate3d(0,${(Math.sin(t * 2 + i * 0.4) * 2).toFixed(1)}px,0)`; }); return true; };
          comp.cue(t0, 'grid'); cells.forEach((_, i) => { if (i % 10 === 0) comp.cue(t0 + i * step, 'gridtick'); });
          break;
        }
        case 'corridor': {   // v14 (17.09.2026, Elzhan: «используй коридор экранов и вставь кучу экранов, движение медленнее,
          // экраны большие почти до верхней границы»): панели стоят ПАРАМИ двумя стенами, камера идёт по зазору между ними,
          // пол и потолок сходятся в точке схода. Геометрия и числа — /mnt-corridor. Панель с `dir` читает свой кусок дорожки
          // кадров (свой `off`), иначе одно и то же видео в пяти экранах читается как баг рендера.
          const CW = e.w || 1080, CH = e.h || 1920;
          const GAP = e.gap ?? 250, STEP = e.step ?? 520, SPD = e.speed ?? 1200, PSP = e.persp ?? 1250, TURN = e.turn ?? 32;
          const n = div('e corr', `width:${CW}px;height:${CH}px;overflow:hidden;perspective:${PSP}px;perspective-origin:50% 50%`);
          const cam = document.createElement('div');
          cam.style.cssText = `position:absolute;left:50%;top:50%;width:0;height:0;transform-style:preserve-3d`;
          n.appendChild(cam);
          const plane = (sign) => {   // пол и потолок: rotateX(-90deg) — при +90 нижняя кромка валится на объектив
            const g = document.createElement('div');
            g.style.cssText = `position:absolute;left:-1600px;top:-4900px;width:3200px;height:9800px;transform-origin:50% 50%;`
              + `transform:translateY(${sign * (e.floor ?? 800)}px) rotateX(-90deg);`
              + `background:repeating-linear-gradient(90deg,${e.line || 'rgba(255,255,255,.26)'} 0 2px,transparent 2px 220px),`
              + `repeating-linear-gradient(0deg,${e.line || 'rgba(255,255,255,.26)'} 0 2px,transparent 2px 220px)`;
            cam.appendChild(g); return g;
          };
          plane(1); plane(-1);
          {   // свет в конце коридора: без него выход читается дырой, а не выходом
            const g = document.createElement('div');
            g.style.cssText = `position:absolute;width:2600px;height:2600px;margin:-1300px 0 0 -1300px;`
              + `transform:translateZ(${-(e.z0 ?? 600) - ((e.panels || []).length / 2) * (e.step ?? 520) - 900}px);`
              + `background:radial-gradient(circle,${e.end || 'rgba(249,212,89,.55)'} 0%,rgba(249,212,89,.12) 42%,transparent 68%)`;
            cam.appendChild(g);
          }
          const P = (e.panels || []).map((p, i) => {
            const big = i % 2 === 0, side = p.side || (big ? -1 : 1);
            const BG = e.big || [700, 1250], SM = e.small || [520, 940];
            const pw = p.w || (big ? BG[0] : SM[0]), ph = p.h || (big ? BG[1] : SM[1]);
            const box = document.createElement('div');
            box.style.cssText = `position:absolute;width:${pw}px;height:${ph}px;margin-left:${-pw / 2}px;margin-top:${-ph / 2}px;`
              + `overflow:hidden;border-radius:${p.r ?? 10}px;background:#0B0907;box-shadow:0 30px 80px rgba(0,0,0,.5)`;
            const im = document.createElement('img'); im.alt = '';
            im.style.cssText = `width:100%;height:100%;object-fit:cover;display:block;filter:brightness(${e.gain ?? 1}) saturate(1.05)`;
            if (p.dir) { im.className = 'cs'; im.dataset.dir = p.dir; im.dataset.frames = p.frames || 1; im.dataset.off = p.off || 0; im.src = `${p.dir}/f_0001.jpg`; }
            else im.src = `assets/img/${p.src}`;
            box.appendChild(im); cam.appendChild(box);
            const z = -(e.z0 ?? 600) - Math.floor(i / 2) * STEP;
            const x = side * (GAP + pw / 2), y = (p.dy ?? (big ? -120 : 140));
            box.style.transform = `translate3d(${x}px,${y}px,${z}px) rotateY(${-side * TURN}deg)`;
            return { box, z };
          });
          const wash = div('', `position:absolute;inset:0;background:${e.dim || 'rgba(10,8,5,.26)'};pointer-events:none`);
          n.appendChild(wash);
          L = entry(comp.layer(n, opts), e.anim || 'fade');
          const ap = L.apply.bind(L);
          L.apply = (t, ex) => {
            if (!ap(t, ex)) return false;
            const u = Math.max(0, t - t0), camZ = u * SPD;
            cam.style.transform = `translate3d(${(Math.sin(u * 0.7) * 26).toFixed(1)}px,${(Math.cos(u * 0.55) * 18).toFixed(1)}px,${camZ.toFixed(1)}px) rotateZ(${(Math.sin(u * 0.4) * 2.2).toFixed(2)}deg)`;
            P.forEach(p => { const ze = p.z + camZ; p.box.style.opacity = ze > -140 ? Math.max(0, 1 - (ze + 140) / 320).toFixed(3) : '1'; });
            return true;
          };
          comp.cue(t0, 'cut'); comp.cue(t0 + (e.dur || 3) * 0.5, 'cam');   // один свуш на вход, один на пролёт: звук на каждую панель — каша
          break;
        }
        case 'ring': e.w = e.w || 100; L = comp.shape(e.w, e.w, [{ d: 'M50 4 A46 46 0 1 1 49.99 4', stroke: e.color || '#fff', sw: e.sw || 3 }], { ...opts, base: { ...base, w: e.w, h: e.w } }); L.node.querySelector('svg').setAttribute('viewBox', '0 0 100 100'); L.trim(0, t0, e.dur ?? 0.8); show(L, t0); comp.cue(t0, 'draw'); break;
        case 'arrow': { const hasHead = e.head || e.from; L = comp.shape(e.w || 10, e.h || 10, [{ d: e.d || 'M0 0', stroke: e.color || '#fff', sw: e.sw || 5 }, ...(hasHead ? [{ d: e.head || 'M0 0', stroke: e.color || '#fff', sw: e.sw || 5 }] : [])], { ...opts, base: { ...base, w: e.w || 10, h: e.h || 10 } }); L.trim(0, t0, e.dur ?? 0.7); if (hasHead) L.trim(1, t0 + (e.dur ?? 0.7) * 0.8, 0.25); show(L, t0); comp.cue(t0, 'draw'); break; }
        case 'stamp': L = comp.shape(100, 100, [{ d: e.kind === 'cross' ? 'M22 22 L78 78 M78 22 L22 78' : 'M18 52 L42 76 L84 26', stroke: e.color || '#4A4ABF', sw: 11 }], { ...opts, base: { ...base, w: 100, h: 100, scale: (e.w || 100) / 100, ax: 0, ay: 0 } }); L.trim(0, t0, e.dur ?? 0.45); show(L, t0); comp.cue(t0, 'draw'); break;
        case 'beam': L = P.beam(comp, { parent, x: e.x, y: e.y, w: e.w, speed: e.speed ?? 12, o: e.o ?? 0.6, depth: e.depth ?? 0.85, t0, color: LIGHT.has(R.bg) ? (R.bg === 'cream' ? '91,91,208' : '40,30,18') : '255,255,255', blend: LIGHT.has(R.bg) ? 'multiply' : 'screen' }); break;
        case 'glow': L = P.glow(comp, { parent, x: e.x, y: e.y, w: e.w, drift: e.drift ?? 60, depth: e.depth ?? 0.8, t0 }); break;
        case 'orbit': L = P.orbit(comp, { parent, x: e.x, y: e.y, w: e.w || 300, n: e.n || 6, speed: e.speed ?? 40, depth: e.depth ?? 1.05, t0 }); break;
        case 'shot': {   // a screenshot leaned back into the frame (Raylight 3D tilt) + optional `lift`: a crop of itself floated in front
          L = entry(comp.layer(div('e shot', `width:${e.w}px`, `<img src="assets/img/${e.src}" alt="">`), { ...opts, base: { ...base, rx: e.rx ?? 8, ry: e.ry ?? -14 } }), e.anim || 'up');
          P.sway(L, t0 + dur, 2.5, 1.5, li); comp.cue(t0, 'shot');
          if (e.lift) {   // lift = { x, y, w, h } in the screenshot's own pixels (at width e.w); it pops 0.25 s after the shot lands
            const lf = e.lift, ls = lf.scale || 1.6, sc = e.w / (e.natural || e.w) * ls;   // the lifted detail is drawn larger than it sits in the shot: it came closer to the lens
            const node = div('e lift', `width:${lf.w * sc}px;height:${lf.h * sc}px`, `<img src="assets/img/${e.src}" style="width:${e.w * ls}px;left:${-lf.x * sc}px;top:${-lf.y * sc}px" alt="">`);
            const LL = entry(comp.layer(node, { parent, depth: (e.depth ?? 1) + 0.08, base: { x: e.x + (lf.dx ?? lf.x * sc), y: e.y + (lf.dy ?? lf.y * sc), w: lf.w * sc, h: lf.h * sc, rot: e.rot || 0, rx: e.rx ?? 8, ry: e.ry ?? -14 } }), 'pop');
            LL.tracks.opacity = []; LL.set({ opacity: 0 }).key('opacity', t0 + 0.25, 0, 'hold').key('opacity', t0 + 0.4, 1, 'out').key('scale', t0 + 0.25, 0.9, 'hold').key('scale', t0 + 0.75, 1.06, 'spring');
            P.float(LL, t0 + 0.8, 5, 1.2, li + 7); comp.cue(t0 + 0.3, 'pop'); RECS.push({ e: { ...e, k: 'lift' }, L: LL, R });
          }
          break;
        }
        case 'bars': {   // animated bar chart: values 0..1, bars grow one after another with a spring
          const vals = e.v || [0.3, 0.5, 0.45, 0.7, 1], bw = e.bw || 70, H = e.h || 320;
          L = comp.layer(div('e bars', `height:${H}px`, vals.map(v => `<b style="width:${bw}px;height:${Math.round(v * H)}px"></b>`).join('')), opts); show(L, t0);
          const bs = [...L.node.querySelectorAll('b')], ap = L.apply.bind(L), step = e.step ?? 0.12;
          L.apply = (t, ex) => { if (!ap(t, ex)) return false; bs.forEach((b, i) => { const q = P.EASE.spring(pr(t, t0 + i * step, 0.6)); b.style.transform = `scaleY(${Math.max(0.02, q).toFixed(3)})`; }); return true; };
          comp.cue(t0, 'bars');
          break;
        }
        case 'wave': {   // sound made visible: a waveform card that pulses at its own cue (the SFX-reel UI)
          const n = e.n || 18;
          L = entry(comp.layer(div('e wave', '', `${e.t ? `<span class="lbl">${e.t}</span>` : ''}<span class="bw">${'<i></i>'.repeat(n)}</span>`), opts), e.anim || 'pop');
          const bars = [...L.node.querySelectorAll('.bw i')], ap = L.apply.bind(L), hit = e.hit ?? t0 + 0.3;
          L.apply = (t, ex) => { if (!ap(t, ex)) return false; const g = Math.exp(-Math.max(0, t - hit) * 3.2) * (t >= hit ? 1 : 0); bars.forEach((b, i) => { const c = Math.exp(-Math.pow((i - n / 2) / (n / 3.2), 2)); const h = 10 + 54 * c * (0.15 + 0.85 * g) * (0.7 + 0.3 * Math.sin(t * 9 + i * 0.9)); b.style.transform = `scaleY(${(h / 10).toFixed(3)})`; }); return true; };
          comp.cue(hit, e.snd || 'wave'); break;
        }
        case 'type': {   // a word typed into a box with a caret, one key click per character (the comment-word CTA)
          const chars = [...String(e.t)], cps = e.cps ?? 11, sz = e.s || 72;
          L = entry(comp.layer(div('e typebox', `font-size:${sz}px`, chars.map(c => `<span>${c === ' ' ? '&nbsp;' : c}</span>`).join('') + '<i class="cr"></i>'), opts), e.anim || 'pop');
          const sp = [...L.node.querySelectorAll('span')], cr = L.node.querySelector('.cr'), ap = L.apply.bind(L), tstart = t0 + (e.delay ?? 0.35);
          L.apply = (t, ex) => { if (!ap(t, ex)) return false; sp.forEach((s, i) => { const on = t >= tstart + i / cps; s.style.opacity = on ? '1' : '0'; s.style.position = on ? '' : 'absolute'; }); cr.style.opacity = (Math.floor(t * 2.6) % 2 === 0 || t < tstart + chars.length / cps) ? '1' : '0'; return true; };
          chars.forEach((c, i) => { if (c !== ' ') comp.cue(tstart + i / cps, 'key'); }); comp.cue(tstart + chars.length / cps + 0.05, 'typed');
          break;
        }
        case 'flash': {   // white frame flash cut (the "Big Flash" of the SFX reels): screen-space, not moved by the camera
          FX.flash(comp, t0, e.dur ?? 0.28, e.color || '#fff'); comp.cue(t0 + (e.dur ?? 0.28) * 0.5, 'flash'); return;
        }
        case 'tl': {   // timeline diagram: an axis draws on, nodes pop, labels under them
          const items = e.items || [], W = e.w || 800;
          const dot = e.dot || 26, ls = e.ls || 40;   // v4: dot / label size (the references draw nodes 30–40 px on a 6 px axis)
          L = comp.layer(div('e tl', `width:${W}px;height:${e.h || 120}px`, `<i class="ax" style="height:${Math.round(dot / 5)}px"></i>` + items.map((it, i) => { const x = items.length > 1 ? i / (items.length - 1) * W : W / 2; return `<i class="nd" style="left:${x}px;width:${dot}px;height:${dot}px;margin:-${dot / 2}px 0 0 -${dot / 2}px"></i><b class="lb" style="left:${x}px;font-size:${ls}px;margin-top:${Math.round(dot / 2 + 20)}px">${it}</b>`; }).join('')), opts); show(L, t0);
          const ax = L.node.querySelector('.ax'), nds = [...L.node.querySelectorAll('.nd')], lbs = [...L.node.querySelectorAll('.lb')], ap = L.apply.bind(L), d = e.dur ?? 0.9;
          L.apply = (t, ex) => { if (!ap(t, ex)) return false; ax.style.transform = `scaleX(${P.EASE.inOut(pr(t, t0, d)).toFixed(3)})`; nds.forEach((nd, i) => { const q = P.EASE.spring(pr(t, t0 + 0.1 + i * d / Math.max(1, nds.length - 1), 0.4)); nd.style.transform = `scale(${q.toFixed(3)})`; lbs[i].style.opacity = clamp(q * 1.5).toFixed(3); lbs[i].style.transform = `translate(-50%,${((1 - clamp(q)) * 14).toFixed(1)}px)`; }); return true; };
          nds.forEach((_, i) => comp.cue(t0 + 0.1 + i * d / Math.max(1, nds.length - 1), 'tl'));
          break;
        }
        case 'ghost': {   // v4: giant faint word behind the scene (hakk «200 ЗАЯВОК» under the character; 8–10 % opacity or an outline). Inner node keeps the css opacity, the layer animates in.
          L = entry(comp.layer(div('e', '', `<div class="ghost${e.outline ? ' outline' : ''}" style="font-size:${e.s || 360}px;${e.o !== undefined ? `opacity:${e.o};` : ''}${e.color ? `color:${e.color};` : ''}">${e.t}</div>`), { ...opts, depth: e.depth ?? 0.82 }), e.anim || 'fade');
          P.drift(L, e.drift ?? 24, 0.18); break;
        }
        case 'glass': {   // v4: translucent panel: the border draws on as a stroke, then the glass fill fades in (hakk frames its illustration in one; the blue reference builds every step in one)
          const w = e.w || 100, h = e.h || 100, r = e.r ?? 36;
          L = comp.shape(w, h, [{ d: rrect(w, h, r), stroke: e.color || (R.bg === 'cream' ? 'rgba(var(--c-accRGB,91,91,208),.7)' : LIGHT.has(R.bg) ? 'rgba(22,20,15,.7)' : 'rgba(255,255,255,.85)'), sw: e.sw || 3 }], { ...opts, base: { ...base, w, h } });
          L.node.classList.add('e');
          const gl = div('glass gl', `border-radius:${r}px;opacity:0`); L.node.insertBefore(gl, L.node.firstChild);
          L.trim(0, t0, e.dur ?? 0.7); show(L, t0);
          const ap = L.apply.bind(L); L.apply = (t, ex) => { if (!ap(t, ex)) return false; gl.style.opacity = pr(t, t0 + (e.dur ?? 0.7) * 0.6, 0.4).toFixed(3); return true; };
          comp.cue(t0, 'glass'); break;
        }
        case 'band': {   // v4: a rotated stripe with a word on it (the red «НЕ СПАСЕТ» band of the collage reference, the paper «экзамен» label); `strip: true` = frame-wide
          const cls = 'e band ' + (e.style || '') + (e.strip ? ' strip' : '');
          /* v15 (17.09.2026, Елжан: «жёлтый фон не покрывает слово»): `w` — это МИНИМУМ ширины,
             а не потолок. Текст в полосе идёт `nowrap`: при фиксированной ширине длинная строка
             вылезала за заливку и полоса читалась как съехавшая подложка. */
          L = entry(comp.layer(div(cls, `font-size:${e.s || 96}px;${e.w ? `min-width:${e.w}px;` : ''}${e.h ? `height:${e.h}px;` : ''}`, e.t || ''), { ...opts, base: { ...base, rot: e.rot ?? -12 } }), e.anim || (e.strip ? 'left' : 'pop'));
          P.float(L, t0 + dur, 4, 1.0, li); comp.cue(t0, 'card'); break;
        }
        case 'feed': {   // v5 (NurTech): cards scroll through one slot like a site — each enters from above leaning back, straightens in the
          // slot, leans away below and fades. srcs: assets/img files; per: seconds a card holds the slot; the camera need not move.
          const n = e.srcs.length, gap = e.gap ?? (e.h ?? e.w * 1.25) + 60, per = e.per ?? 0.9, tilt = e.tilt ?? 38;
          const box = div('e feedbox', `width:${e.w}px;height:${e.h ?? e.w * 1.25}px`);
          L = comp.layer(box, { ...opts, base: { ...base, ax: 0, ay: 0 } });
          const step = t => { const u = Math.max(0, Math.min(n - 1, (t - t0) / per)); const f = Math.floor(u); return f + P.EASE.inOut(u - f); };
          e.srcs.forEach((src, i) => {
            const card = comp.layer(div('e feedcard', `width:${e.w}px`, `<img src="assets/img/${src}" alt="">`), { parent: L, base: { x: 0, y: 0, w: e.w, h: e.h ?? e.w * 1.25 } });
            card.expr('y', t => (step(t) - i) * gap).expr('rx', t => (i - step(t)) * tilt).expr('opacity', t => t < t0 - 0.3 ? 0 : Math.max(0, 1 - Math.abs(i - step(t)) * 0.7));
          });
          for (let i = 0; i < n; i++) comp.cue(t0 + i * per, 'card');
          break;
        }
        case 'photo': {   // v4: a print taped to the world (dark-desk reference: photos on tape, a clipboard, typed captions)
          L = entry(comp.layer(div('e photo', `width:${e.w}px`, `<i class="tape ${e.tape || 'top'}"></i><img src="assets/img/${e.src}" alt="">${e.cap ? `<div class="cap">${e.cap}</div>` : ''}`), { ...opts, base: { ...base, rot: e.rot ?? -4 } }), e.anim || 'up');
          P.sway(L, t0 + dur, 2, 1.2, li); comp.cue(t0, 'draw'); break;
        }
        case 'search': {   /* v13 (16.09.2026, abat CTA): строка поиска площадки — значок, запрос печатается по буквам, лупа.
             Курсор жмёт её (`pointer` → этот id), выдача приходит отдельным `shot` со скриншотом: рисованной выдачи не бывает,
             в кадр идёт настоящий снимок экрана. Запрос — то, что человек и правда наберёт, а не хендл с собачкой. */
          const H = e.h || 104, fs = e.s || 46, q = String(e.t || ''), W = e.w || 700;
          const badge = e.badge === 'none' ? '' : `<svg class="yt" width="${(H * 0.54).toFixed(0)}" height="${(H * 0.38).toFixed(0)}" viewBox="0 0 54 38"><rect width="54" height="38" rx="10" fill="${e.badgeColor || '#FF0033'}"/><path d="M22 11 L37 19 L22 27 Z" fill="#fff"/></svg>`;
          const mg = `<svg class="mg" width="${(H * 0.4).toFixed(0)}" height="${(H * 0.4).toFixed(0)}" viewBox="0 0 24 24" fill="none" stroke="rgba(22,20,15,.55)" stroke-width="2.3"><circle cx="10.5" cy="10.5" r="7"/><path d="M15.8 15.8 L21 21" stroke-linecap="round"/></svg>`;
          const node = div('e search', `width:${W}px;height:${H}px;font-size:${fs}px`, `${badge}<span class="q">${[...q].map(c => `<i>${c === ' ' ? '&nbsp;' : c}</i>`).join('')}</span><i class="car"></i>${mg}`);
          L = entry(comp.layer(node, { ...opts, base: { ...base, w: W, h: H } }), e.anim || 'up');
          const lets = [...node.querySelectorAll('.q i')], car = node.querySelector('.car');
          const ts = t0 + (e.typeAt ?? 0.3), span = e.typeDur ?? 0.6, per = span / Math.max(1, lets.length);
          const sap = L.apply.bind(L);
          L.apply = (t, ex) => { if (!sap(t, ex)) return false;
            const n = Math.round(P.EASE.inOut(pr(t, ts, span)) * lets.length);
            lets.forEach((el2, k) => el2.style.display = k < n ? 'inline' : 'none');
            car.style.opacity = t < ts ? '0' : (t > ts + span + 0.5 ? '0' : (Math.floor((t - ts) * 2.4) % 2 ? '0' : '1')); return true; };
          lets.forEach((_, k) => { if (k % 2 === 0) comp.cue(ts + k * per, 'key'); });
          P.float(L, t0 + dur, 4, 1.1, li); comp.cue(t0, 'card'); break;
        }
        case 'count': {   // v4: a number counting up to the fact (hakk «2 200 000 просмотров», «200 заявок»); only numbers from the brief
          const to = +e.to, from = +(e.from ?? 0), d = e.dur ?? 1.1, unit = e.unit ? `<small>${e.unit}</small>` : '';
          L = entry(comp.layer(div('e count', `font-size:${e.s || 200}px;${e.color ? `color:${e.color};` : ''}`, `<span>${fmtN(from, e.sep)}</span>${unit}`), opts), e.anim || 'pop');
          const sp = L.node.querySelector('span'), ap = L.apply.bind(L);
          L.apply = (t, ex) => { if (!ap(t, ex)) return false; const q = P.EASE.out(pr(t, t0, d)); sp.textContent = fmtN(from + (to - from) * q, e.sep); return true; };
          comp.cue(t0, 'bars'); comp.cue(t0 + d, 'check'); break;
        }
        case 'spot': {   // v4.1 (Elzhan 13.09: «работа со светом и вниманием зрителя»): a multiply sheet with a soft hole; the hole jumps to each `follow` element when that element lands
          const r = e.r || 320, soft = e.soft ?? 320, o = e.o ?? 0.55, SZ = 5000;
          L = comp.layer(div('e spot', `width:${SZ}px;height:${SZ}px;background:radial-gradient(circle at 50% 50%,rgba(0,0,0,0) ${r}px,rgba(0,0,0,${o}) ${r + soft}px)`), { ...opts, base: { ...base, w: SZ, h: SZ, x: (e.x ?? 540) - SZ / 2, y: (e.y ?? 960) - SZ / 2 } });
          L.set({ opacity: 0 }).key('opacity', t0, 0, 'hold').key('opacity', t0 + 0.4, 1, 'out');
          L._spot = { follow: e.follow || [], SZ, ease: e.ease || 'inOut', dur: e.move ?? 0.35 };
          comp.cue(t0, 'spot'); break;
        }
        case 'under': {   // v4: a hand-drawn stroke under a word; geometry bound to `around` in the fit pass
          L = comp.shape(100, 20, [{ d: 'M0 10 Q 50 0 100 10', stroke: e.color || '#F2B640', sw: e.sw || 8 }], { ...opts, base: { ...base, w: 100, h: 20 } });
          L.trim(0, t0, e.dur ?? 0.45); show(L, t0); comp.cue(t0, 'draw'); break;
        }
        case 'lamp': {   // v11 (RB.visualsz DcqJvlMh6QT): a projector drops into a LIGHT world and swings a dark cone; the cone's `items`
          // exist only inside the light, so the swing IS the reveal. aims: [{ on, a }] — a in degrees (0 right, 90 down), reached on the word.
          const len = e.len ?? 2200, sp = e.spread ?? 32, col = e.color || '#121212', top = R.top || 0, land = t0 + (e.fall ?? 0.5), sw = e.swing ?? 0.42;
          /* items: [{ t, x, y (centre), s, voice, color }] */
          const aims = (e.aims || []).map(q => ({ t: (q.on && li >= 0 ? (wordAt(li, q.on) ?? atTime(q.at, li)) : atTime(q.at, li)) + (q.off ?? -0.1), a: q.a }));
          const a0 = e.a ?? (aims[0] ? aims[0].a : 90);
          const ang = t => { let a = a0; for (const q of aims) a += (q.a - a) * P.EASE.flow(pr(t, q.t - sw, sw)); return a; };
          const W = len * 2, wrap = comp.layer(div('e lamp', `width:${W}px;height:${W}px`), { ...opts, base: { ...base, x: e.x - len, y: (e.y || 0) + top - len, w: W, h: W, rot: 0 } });
          const items = (e.items || []).map(it => `<div class="it ${it.voice || 'hit'}" style="left:${it.x - e.x + len}px;top:${it.y - e.y + len}px;font-size:${it.s || 90}px;color:${it.color || '#fff'};text-shadow:none;transform:translate(-50%,-50%)">${String(it.t).split(/\s+/).map(w => `<span class="ae-u" style="display:inline-block">${w}</span>`).join(' ')}</div>`).join('');
          const coneN = div('lampcone', `width:${W}px;height:${W}px;background:${col}`, items);
          const cone = comp.layer(coneN, { parent: wrap, base: { x: 0, y: 0, w: W, h: W } });
          const body = comp.layer(div('lampbody', '', '<i></i>'), { parent: wrap, base: { x: len - 85, y: len - 60, w: 170, h: 120 } });
          body.key('y', t0, len - 60 - 1100, 'hold').key('y', land, len - 60, 'in').key('y', land + 0.12, len - 74, 'out').key('y', land + 0.32, len - 60, 'settle');
          body.set({ opacity: 0 }).key('opacity', t0 - 0.01, 0, 'hold').key('opacity', t0, 1, 'linear');
          body.expr('rot', t => ang(t) - 90 + Math.sin(pr(t, land, 0.55) * Math.PI * 3) * 9 * (1 - pr(t, land, 0.55)));
          cone.set({ opacity: 0 }).key('opacity', land, 0, 'hold').key('opacity', land + 0.1, 1, 'out');
          const cap = cone.apply.bind(cone);
          cone.apply = (t, ex) => { if (!cap(t, ex)) return false;
            const a = ang(t) * Math.PI / 180, h = sp * Math.PI / 360 * P.EASE.flow(pr(t, land, 0.28)), R2 = len * 1.4;   // the light opens from a slit
            const g = u => `${(len + Math.cos(u) * R2).toFixed(1)}px ${(len + Math.sin(u) * R2).toFixed(1)}px`;
            coneN.style.clipPath = `polygon(${len}px ${len}px,${g(a - h)},${g(a + h)})`; return true; };
          comp.cue(land, 'lamp'); aims.forEach((q, k) => { if (k || q.a !== a0) comp.cue(q.t - sw, 'swing'); });
          L = wrap; break;
        }
        case 'tear': {   // v11 (Vox DceFNdVM-NG): a strip of torn paper — jagged edges, a white paper core along the tear, a drop shadow —
          // holding a colour or a picture (`src`). It lies UNDER the headline and under an object in front of it: the collage sandwich.
          const w = e.w || 1300, h = e.h || 300, amp = e.amp ?? 26, sd = (li + 3) * 17 + (e.seed || 0);
          const edge = (y0, dir, s0) => { const n = Math.max(6, Math.round(w / 34)), pts = []; for (let k = 0; k <= n; k++) pts.push([k / n * w, y0 + dir * rnd(s0 + k * 1.7) * amp]); return pts; };
          const poly = (tp, bt) => 'polygon(' + [...tp, ...bt.reverse()].map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',') + ')';
          const outer = poly(edge(0, 1, sd), edge(h, -1, sd + 50)), inner = poly(edge(amp * 0.5, 1, sd + 9), edge(h - amp * 0.5, -1, sd + 61));
          const fill = e.src ? `background-image:url(assets/img/${e.src})` : `background:${e.color || '#F3C01E'}`;
          L = entry(comp.layer(div('e tear', `width:${w}px;height:${h}px`, `<i class="rim" style="clip-path:${outer}"></i><i class="fil" style="clip-path:${inner};${fill}"></i>`), { ...opts, base: { ...base, w, h, rot: e.rot ?? -4 } }), e.anim || 'left');
          comp.cue(t0, 'tear'); break;
        }
        case 'circle': {   // v11 (Vox): a marker ellipse drawn by hand around a bound element (`around`) — one and a bit turns, the end overshoots
          const c = e.color || '#F3C01E', sw = e.sw || 14;
          L = comp.shape(100, 100, [{ d: 'M0 0', stroke: c, sw }, { d: 'M0 0', stroke: c, sw: Math.round(sw * 0.35), css: 'opacity:.55' }], opts);
          L.node.classList.add('e'); L.trim(0, t0, e.dur ?? 0.5, 'inOut'); L.trim(1, t0 + 0.04, e.dur ?? 0.5, 'inOut'); show(L, t0); comp.cue(t0, 'marker'); break;
        }
        case 'hl': {   // v11 (Vox documents): a highlighter laid BEHIND a bound word (`around`), drawn left → right; light grounds (multiply)
          L = comp.layer(div('e hl', `background:${e.color || '#F3C01E'};border-radius:6px 16px 8px 14px`), opts); L.node.style.zIndex = '-1';
          show(L, t0); const hd = e.dur ?? 0.4, hap = L.apply.bind(L);
          L.apply = (t, ex) => { if (!hap(t, ex)) return false; L.node.style.clipPath = `inset(0 ${((1 - P.EASE.flow(pr(t, t0, hd))) * 100).toFixed(2)}% 0 0)`; return true; };
          comp.cue(t0, 'hl'); break;
        }
        case 'progress': {   // v11 (sumama DcGgRnVi2bn): a bar fills with a soft leading edge, squeezes into a disc, a check draws inside
          const w = e.w || 760, h = e.h || 96, d = e.dur ?? 1.1, col = e.color || '#23C8F0', ts = t0 + 0.2, tm = ts + d + 0.05;
          const node = div('e progress', `width:${w}px;height:${h}px`, `<i class="trk" style="background:${e.track || 'rgba(22,20,15,.88)'}"></i><i class="fil"></i><svg width="${h}" height="${h}" viewBox="0 0 100 100" style="margin:-${h / 2}px 0 0 -${h / 2}px"><path d="M28 52 L44 68 L74 36" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round" pathLength="1" style="stroke-dasharray:1;stroke-dashoffset:1"/></svg>`);
          L = entry(comp.layer(node, { ...opts, base: { ...base, w, h } }), e.anim || 'pop');
          const tk = node.querySelector('.trk'), fl = node.querySelector('.fil'), ck = node.querySelector('path'), sv = node.querySelector('svg'), pap = L.apply.bind(L);
          L.apply = (t, ex) => { if (!pap(t, ex)) return false;
            const q = P.EASE.flow(pr(t, ts, d)), m = P.EASE.inOut(pr(t, tm, 0.36)), c = P.EASE.out(pr(t, tm + 0.3, 0.3)), cw = w + (h - w) * m, lx = ((w - cw) / 2).toFixed(1) + 'px';
            tk.style.left = fl.style.left = lx; tk.style.width = cw.toFixed(1) + 'px'; fl.style.width = (m > 0 ? cw : q * w).toFixed(1) + 'px';
            fl.style.background = m > 0 || q >= 1 ? col : `linear-gradient(90deg,${col} 0,${col} calc(100% - ${(h * 0.7 * (1 - q)).toFixed(0)}px),transparent 100%)`;
            ck.style.strokeDashoffset = (1 - c).toFixed(3); sv.style.transform = `scale(${(1 + 0.25 * Math.sin(Math.PI * c)).toFixed(3)})`; return true; };
          comp.cue(ts, 'bars'); comp.cue(tm + 0.3, 'check'); break;
        }
        case 'pointer': {   // v11 (sumama): an arrow cursor travels to bound elements and clicks each on its word — press, ripple
          const stops = (e.to || []).map(q => ({ ...q, t: (q.on && li >= 0 ? (wordAt(li, q.on) ?? atTime(q.at, li)) : atTime(q.at, li)) + (q.off || 0), x: base.x, y: base.y }));
          const node = div('e pointer', 'width:60px;height:80px', `<i class="rip"></i><svg width="60" height="80" viewBox="0 0 60 80" style="position:absolute;left:0;top:0"><path d="M4 4 L4 64 L20 50 L31 74 L42 69 L31 46 L52 46 Z" fill="${e.color || '#fff'}" stroke="${e.stroke || '#111'}" stroke-width="4" stroke-linejoin="round"/></svg>`);
          L = comp.layer(node, { ...opts, base: { ...base, w: 60, h: 80, ax: 0, ay: 0 } }); P.fade(L, t0, 0.25);
          const mv = e.move ?? 0.55, pos = t => { let x = base.x, y = base.y; for (const q of stops) { const u = P.EASE.flow(pr(t, q.t - mv, mv)); x += (q.x - x) * u; y += (q.y - y) * u; } return [x, y]; };
          L.expr('x', t => pos(t)[0]).expr('y', t => pos(t)[1]).expr('scale', (t, v) => v * (1 - 0.16 * stops.reduce((m, q) => Math.max(m, Math.sin(Math.PI * pr(t, q.t, 0.16))), 0)));
          const rip = node.querySelector('.rip'), pap = L.apply.bind(L);
          L.apply = (t, ex) => { if (!pap(t, ex)) return false; let r = 0; for (const q of stops) if (t >= q.t && t < q.t + 0.5) r = pr(t, q.t, 0.5); rip.style.opacity = r > 0 ? (1 - r).toFixed(3) : '0'; rip.style.transform = `scale(${(0.3 + r * 1.6).toFixed(3)})`; return true; };
          L._ptr = stops; stops.forEach(q => comp.cue(q.t, 'click')); break;
        }
        case 'gobo': {   // v11 (motionbylade): soft window-light shadows drifting over a LIGHT ground — ambient light for paper / studio / yellow (a beam reads as smoke there)
          const SZ = e.w || 3600, o = e.o ?? 0.14, a = e.angle ?? -38, cl = o2 => `rgba(30,22,12,${o2})`;
          L = comp.layer(div('e gobo', `width:${SZ}px;height:${SZ}px;background:repeating-linear-gradient(${a}deg,${cl(0)} 0px,${cl(0)} 150px,${cl(o)} 260px,${cl(o)} 340px,${cl(0)} 450px,${cl(0)} 560px)`), { ...opts, depth: e.depth ?? 0.9, base: { ...base, x: e.x ?? -1200, y: (e.y ?? -1200) + (R.top || 0), w: SZ, h: SZ } });
          L.tracks.opacity = [{ t: t0, v: 0, e: 'hold' }, { t: t0 + 0.6, v: 1, e: 'out' }]; L.expr('x', (t, v) => v + t * (e.speed ?? 16)); break;
        }
        case 'note': {   // v12 (henryexists Db5zGx4O5oa): an iOS Notes card grows out of an icon-sized dot, its title words sharpen one by one,
          // one word turns red and is underlined (`red`, `redOn`), checklist rows arrive on their words (circle, then the letters fly in blurred),
          // and each row gets a red cross (`mark: 'x'`) or a green check (`mark: 'check'`) on `markOn`. The card grows as rows arrive.
          const Wd = e.w || 660, fs = e.s || 46, rowH = fs * 1.5, items = e.items || [], tw = String(e.title || '').split(/\s+/);
          const node = div('e note', `width:${Wd}px;font-size:${fs}px`, `<div class="nh"><i></i><b>${e.head || 'Notes'}</b></div><div class="nb"><div class="nt">${tw.map(w => `<span class="nw">${w}</span>`).join(' ')}</div><div class="ni">${items.map((it, k) => `<div class="nr" style="top:${(k * 1.5).toFixed(2)}em"><i class="cb"><svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17" class="cc"/><path d="M11 11 L29 29 M29 11 L11 29" class="cx" pathLength="1"/><path d="M11 21 L17 27 L30 13" class="ck" pathLength="1"/></svg></i><span class="rt">${[...it.t].map(c => `<span class="nl">${c === ' ' ? '&nbsp;' : c}</span>`).join('')}</span></div>`).join('')}</div>${e.foot ? `<div class="nd">${e.foot}</div>` : ''}</div>`);
          L = comp.layer(node, { ...opts, base: { ...base, w: Wd, h: e.h || Wd * 0.55 } });
          L.set({ opacity: 0 }).key('opacity', t0, 0, 'hold').key('opacity', t0 + 0.08, 1, 'out').key('scale', t0, e.from ?? 0.12, 'hold').key('scale', t0 + 0.45, 1, 'settle').key('blur', t0, 10, 'hold').key('blur', t0 + 0.35, 0, 'flow');
          P.sway(L, t0 + 0.5, e.sway ?? 3, 2, li); P.float(L, t0 + 0.5, 4, 1, li);
          const nws = [...node.querySelectorAll('.nw')], rws = [...node.querySelectorAll('.nr')], ni = node.querySelector('.ni'), lets = rws.map(r => [...r.querySelectorAll('.nl')]);
          const redI = e.red ? tw.findIndex(w => w.toLowerCase().startsWith(String(e.red).toLowerCase())) : -1, redT = e.redOn ? AT(e.redOn) : t0 + 0.9;
          const RT = items.map(it => AT(it.on, it.at)), MT = items.map(it => it.markOn ? AT(it.markOn) + (it.markOff || 0) : null);
          const nap = L.apply.bind(L);
          L.apply = (t, ex) => { if (!nap(t, ex)) return false;
            nws.forEach((w, k) => { const q = P.EASE.out(pr(t, t0 + 0.12 + k * 0.06, 0.25)); w.style.opacity = q.toFixed(3); w.style.filter = q < 1 ? `blur(${((1 - q) * 8).toFixed(1)}px)` : ''; });
            if (redI >= 0) { const q = P.EASE.out(pr(t, redT, 0.25)); const w = nws[redI]; w.style.color = q > 0 ? `rgb(${Math.round(21 + 203 * q)},${Math.round(22 + 16 * q)},${Math.round(26 + 17 * q)})` : ''; w.style.fontWeight = q > 0 ? '700' : ''; w.style.setProperty('--u', P.EASE.out(pr(t, redT + 0.1, 0.3)).toFixed(3)); }
            let shown = 0;
            rws.forEach((r, k) => { const on = t >= RT[k]; if (on) shown = k + P.EASE.out(pr(t, RT[k], 0.25)); r.style.opacity = on ? '1' : '0'; if (!on) return;
              r.querySelector('.cb').style.transform = `scale(${P.EASE.back(pr(t, RT[k], 0.2)).toFixed(3)})`;
              lets[k].forEach((l, j) => { const u = P.EASE.out(pr(t, RT[k] + 0.06 + j * 0.022, 0.3)), s0 = rnd(k * 13 + j); l.style.opacity = u.toFixed(3);
                l.style.transform = u < 1 ? `translate(${((1 - u) * (40 + s0 * 90)).toFixed(1)}px,${((1 - u) * (30 + rnd(j + k * 7) * 60)).toFixed(1)}px) rotate(${((1 - u) * (s0 * 50 - 25)).toFixed(1)}deg)` : ''; l.style.filter = u < 1 ? `blur(${((1 - u) * 7).toFixed(1)}px)` : ''; });
              const m = items[k].mark, mt = MT[k], mq = mt === null ? 0 : P.EASE.out(pr(t, mt, 0.22)), cc = r.querySelector('.cc');
              if (m === 'x') { r.querySelector('.cx').style.strokeDashoffset = (1 - mq).toFixed(3); cc.style.stroke = mq > 0 ? '#E0262B' : ''; }
              if (m === 'check') { cc.style.fill = mq > 0 ? `rgba(125,187,30,${mq.toFixed(3)})` : 'none'; cc.style.stroke = mq > 0 ? '#4E7A12' : ''; r.querySelector('.ck').style.strokeDashoffset = (1 - P.EASE.out(pr(t, (mt ?? 0) + 0.12, 0.22))).toFixed(3); }
            });
            ni.style.height = (shown * rowH).toFixed(1) + 'px'; return true; };
          comp.cue(t0, 'card'); RT.forEach(tt => comp.cue(tt, 'pop')); items.forEach((it, k) => { if (MT[k] !== null) comp.cue(MT[k], it.mark === 'check' ? 'check' : 'xmark'); });
          break;
        }
        case 'streak': {   // v12 (henryexists calendar): a list card whose rows get a translucent red streak drawn left → right, a solid disc leading at its end
          const Wd = e.w || 900, fs = e.s || 40, rows = e.rows || [], col = e.color || '224,38,43', sd = e.dur ?? 0.5;
          const node = div('e streak', `width:${Wd}px;font-size:${fs}px`, `${e.head ? `<div class="sh">${e.head}</div>` : ''}${e.sub ? `<div class="ss">${e.sub}</div>` : ''}<div class="sr">${rows.map(r => `<div class="srow"><i class="sp" style="background:rgba(${col},.55)"></i><i class="sd" style="background:rgb(${col})"></i><b>${r.a || ''}</b><span>${r.t}</span></div>`).join('')}</div>`);
          L = entry(comp.layer(node, { ...opts, base: { ...base, w: Wd, h: e.h || 700 } }), e.anim || 'up');
          P.sway(L, t0 + 0.5, e.sway ?? 2.5, 1.5, li);
          const RT = rows.map(r => AT(r.on, r.at)), rws = [...node.querySelectorAll('.srow')], sap2 = L.apply.bind(L);
          L.apply = (t, ex) => { if (!sap2(t, ex)) return false;
            rws.forEach((r, k) => { const q = P.EASE.inOut(pr(t, RT[k], sd)), sp = r.querySelector('.sp'), dd = r.querySelector('.sd');
              sp.style.opacity = q > 0 ? '1' : '0'; sp.style.transform = `scaleX(${q.toFixed(3)})`; dd.style.left = (q * 100).toFixed(2) + '%';
              dd.style.transform = `translateY(-50%) scale(${(q > 0 ? P.EASE.back(pr(t, RT[k], 0.25)) : 0).toFixed(3)})`; r.classList.toggle('on', q > 0.5); });
            return true; };
          RT.forEach(tt => comp.cue(tt, 'streak')); break;
        }
        case 'dust': {   // v12 (henryexists): stray glyphs drifting around a word — the dust the next word assembles from
          const n = e.n || 10, gl = [...(e.glyphs || 'aeiou?')], w = e.w || 900, h = e.h || 900;
          L = comp.layer(div('e dust', `width:${w}px;height:${h}px`, Array.from({ length: n }, (_, k) => `<i style="left:${(rnd(k * 3.3 + li) * w).toFixed(0)}px;top:${(rnd(k * 7.1 + li) * h).toFixed(0)}px;font-size:${(20 + rnd(k * 5.7) * 30).toFixed(0)}px;filter:blur(${(rnd(k * 9.1) * 2.5).toFixed(1)}px);transform:rotate(${(rnd(k + 0.5) * 80 - 40).toFixed(0)}deg);${e.color ? `color:${e.color}` : ''}">${gl[k % gl.length]}</i>`).join('')), { ...opts, depth: e.depth ?? 0.92, base: { ...base, w, h } });
          L.set({ opacity: 0 }).key('opacity', t0, 0, 'hold').key('opacity', t0 + 0.4, e.o ?? 0.5, 'out'); P.drift(L, 16, 0.3); break;
        }
        /* 21.09.2026: `k: 'rule'` три ролика atlas писали в спеке, а кейса не было — элемент падал в
           `default`, рождался пустым div и не рисовал НИЧЕГО (схема бита 10 reel_016 пропала целиком,
           гейты молчат: overlap.js судит видимость, а не наличие). Линейка — разделитель набора:
           ширина из `w`, высота из `h`, цвет из класса `.rule` темы либо из `color`. */
        case 'gen': {   /* v15 (28.09.2026, fragrancia/reel_039, Елжан: «анимация как будто генерация ИИ, но кодом без диффузий»):
             процедурная сцена WebGL (engine/gen/gen.js — флакон, полка, стена полок) проявляется из шума шагами сэмплера за `gen` с;
             `lose: 'слово'` — слоты `loseSlots` растворяются в шум и проявляются пустыми за `loseDur` с. Палитра — токены бренда из :root
             (+ `pal` поверх). `ui: true` — счётчик шагов в углу. Не больше ~12 вставок gen на ролик: у страницы 16 контекстов WebGL. */
          const w = e.w || 760, h = e.h || 900, dpr = e.dpr ?? 1.25, cs = getComputedStyle(document.documentElement), tk = (n, d) => cs.getPropertyValue(n).trim() || d;
          const pal = { bg: tk('--c-acc', '#5B5BD0'), bg2: tk('--c-ink2', '#2E2C5A'), floor: tk('--c-plate', '#EEF0FA'), cap: tk('--c-ink2', '#2E2C5A'), ring: tk('--c-gold', '#F2B640'), glass: tk('--c-plate', '#EEF0FA'),
            liquid: [tk('--c-gold', '#F2B640'), tk('--c-acc', '#5B5BD0'), tk('--c-plate2', '#C9CCF2'), tk('--c-ink2', '#2E2C5A'), tk('--c-plate', '#EEF0FA')], ...(e.pal || {}) };
          const node = div('e gen', `width:${w}px;height:${h}px`, `<canvas width="${Math.round(w * dpr)}" height="${Math.round(h * dpr)}" style="width:100%;height:100%;display:block"></canvas>${e.ui ? '<b class="gstep"></b>' : ''}`);
          L = entry(comp.layer(node, { ...opts, base: { ...base, w, h } }), e.anim || 'fade');
          P.float(L, t0 + dur, 4, 1.2, li);
          /* `genOn: 'слово'` — холст приходит на своём слове чистым шумом («генерация в очереди»), а проявляется с `genOn`:
             так мир не открывается пустым, пока ждёт слова, на котором картинка должна родиться */
          const G = makeGen(node.querySelector('canvas'), { ...e, pal }), gd = e.gen ?? 1.8, tl = e.lose ? AT(e.lose) + (e.loseOff || 0) : null, ld = e.loseDur ?? 1.4;
          const gs = e.genOn ? AT(e.genOn) + (e.genOff || 0) : t0;
          const ui = node.querySelector('.gstep'), gap = L.apply.bind(L);
          L.apply = (t, ex) => { if (!gap(t, ex)) return false;
            const p = P.EASE.flow(pr(t, gs, gd)), lose = tl === null ? 0 : pr(t, tl, ld);
            G.draw(p, t, lose); if (ui) ui.textContent = `${Math.min(G.steps, Math.floor(p * G.steps))} / ${G.steps}`; return true; };
          comp.cue(gs, 'gen'); comp.cue(gs + gd * 0.92, 'genok'); if (tl !== null) comp.cue(tl, 'genlose'); break;
        }
        case 'rule': L = entry(comp.layer(div('e rule', `width:${e.w || 600}px;height:${e.h || 3}px;${e.color ? `background:${e.color};` : ''}`), opts), e.anim || 'left'); comp.cue(t0, 'draw'); break;
        default: L = entry(comp.layer(div('e uiel', e.w ? `width:${e.w}px` : '', e.html || ''), opts), e.anim); if (e.cue) comp.cue(t0, e.cue === true ? 'pop' : e.cue);   // 24.09.2026: свёрстанный UI-элемент (`k: 'ui'`, html) — событие кадра наравне с img/pill, иначе гейт плотности его не видит
      }
      if (!L) return;
      if (b.layered && e.depth !== undefined && !e.z) L.node.style.zIndex = Math.round(e.depth * 100);   // v5: sort into a stack row by depth
      if (L && e.depth !== undefined) (b._dl || (b._dl = [])).push([L, e.depth]);
      if (LZ) L.node.style.zIndex = 40;   // above the rooms (z 1–3): Chrome paints root children by z-index even inside the 3D context
      else if (e.z && e.k !== 'text') L.node.style.zIndex = e.z;   // 15.09.2026 speaker-canvas: plate / behind-type / matte / front order inside the footage room
      if (e.cls) L.node.classList.add(...String(e.cls).split(/\s+/));
      RECS.push({ e, L, R, li });
      if (e.reveal) (e.reveal === 'wipe' ? FX.wipe : FX.reveal)(L, t0, e.dur ?? 0.6);
      if (e.path) L.follow(e.path, t0, e.pathDur ?? 1.2, { ease: 'inOut', rotate: !!e.pathRot, offset: [0, R.top || 0] });
      if (e.expr) for (const p in e.expr) L.expr(p, e.expr[p]);   // 24.09.2026 (icon/reel_043 весы): движение по формуле времени — коромысло, чаша, груз на чаше; fn(t, v) → значение
      if (e.until !== undefined) P.leave(L, atTime(e.until, li), 0.3);
      if (e.steps) { const sap = L.apply.bind(L), fs = e.steps; L.apply = (t, ex) => sap(Math.floor(t * fs) / fs, ex); }   // v11 (Vox): the collage moves on twos, 12 poses a second; the camera stays smooth
      if (e.id) { byId[e.id] = L; landAt[e.id] = t0; }
    });
    /* v6 truck (Taharat, Elzhan 13.09.2026: «слои просто стоят как кадр»): the layers of a depth row slide at speeds set by their depth —
       near ones one way, far ones the other, depth 1 (the words) stays. Camera parallax alone gave 60 px over a beat: read as a still.
       `truck: { px, from, to }` (fractions of the line); px 500–800. Cards with `depth` ride inside the row and land in its opening gaps. */
    if (b.truck && li >= 0 && b._dl) {
      const tr = typeof b.truck === 'number' ? { px: b.truck } : b.truck, [a0, a1] = A[li], s0 = a0 + (tr.from ?? 0) * (a1 - a0), sd = ((tr.to ?? 1) - (tr.from ?? 0)) * (a1 - a0);
      b._dl.forEach(([L, d]) => L.expr('x', (t, v) => v - (d - 1) * tr.px * (P.EASE.inOut(pr(t, s0, sd)) - 0.5)));
    }
  });

  /* camera keys: room-local → global. v4: a beat with `cut` snaps the camera at the cut time under a screen-space cover
     (iris disc, diagonal band, white flash) or bare (hard) — the reference changes half of its worlds this way, not by flight. */
  const CUTS = [], FOCUS = [];
  let last = { x: 540, y: 960, z: 1, rot: 0 }, lastRoom = spec.beats[0].room, lastT = 0, lastTilt = false;
  spec.beats.forEach((b, i) => {
    const prevCam = { ...last }, prevRoom = lastRoom;
    const R = ROOMS[b.room];
    const keys = Array.isArray(b.cam) ? b.cam : [b.cam || {}];
    const cut = b.cut ? (typeof b.cut === 'string' ? { kind: b.cut } : b.cut) : null;
    const blinkT = cut && cut.kind === 'blink' ? (cut.words || []).map((w, k) => (w.on ? wordAt(i, w.on) : null) ?? A[i][0] + k * (cut.hold ?? 0.34)) : null;
    let tc = cut ? (blinkT && blinkT.length ? blinkT[0] - 0.02 : cut.t !== undefined ? atTime(cut.t, i) : A[i][0] - (cut.lead ?? 0.05)) : null;
    /* v15 (Elzhan 01.10.2026 «делай рилсы под такт музыки»): with a music grid — window.BEATS, written by engine/beat.py fit — a world
       change hits the nearest beat. The hit is the moment its cue and sound fire (a flood's first third, not its snap); it moves
       ≤ 0.3 s and never past the line's first word, so the word still lands in its own world. An explicit `cut.t` is not moved. */
    if (cut && i > 0 && !blinkT && cut.t === undefined) {
      const k = cut.kind, d = cut.dur ?? (k === 'push' ? 0.5 : k === 'torn' ? 0.75 : 0.9);
      const off = k === 'tone' ? -0.7 * d : (k === 'torn' || k === 'push') ? -0.85 * d : 0;
      const w0 = A[i][0] + (((window.WORDS || [])[i] || [])[0]?.t ?? 0.25);
      const b = onBeat(tc + off, tc + off - 0.3, Math.min(tc + off + 0.3, w0 - 0.02 + off));
      if (b !== null) tc = b - off;
    }
    keys.forEach((kk, j) => {
      const c = { ...last, ...kk };
      let t = (i === 0 && j === 0) ? 0 : A[i][0] + (kk.at ?? 0.12) * (A[i][1] - A[i][0]);
      const far = Math.hypot((c.x - last.x), (c.y - last.y)) > 900 || Math.abs(Math.log((c.z ?? 1) / last.z)) > 0.5;
      const snap = cut && j === 0 && i > 0;
      /* Ключ предыдущего бита, упавший ПОЗЖЕ снапа (`at: .95` при lead шва > 5 % бита: 22.91 против 22.90),
         после сортировки возвращал камеру в старый мир, и она три секунды летела над пустой картой
         (icon/reel_037, EMPTY FRAME 23.2–25.5 и 55.3–56.9). Снап главнее: такие ключи встают перед ним. */
      if (snap) { t = tc; comp.camera.keys.forEach(q => { if (q.t >= tc) q.t = tc - 0.02; }); }
      /* v6 aim (Elzhan 13.09.2026: «наклон камеры идёт именно туда, где собирается появиться новая вставка»): a dive is not a wobble,
         it carries the eye to the insert that lands at the end of the move. `aim: 'id'` = the key's x/y become that element's centre
         (measured after fonts), its time = the element's landing + `late` (0.15), the move lasts `move` s (0.9). */
      let hold = kk.hold;
      /* v7 (Elzhan 14.09.2026: «наклон должен менять саму плоскость кадра, и всё после происходит уже в этой плоскости»): the dive has TWO
         jobs — it carries the eye to its insert (aim) AND it sets a new plane in which the rest of the line is delivered. So only the key
         that STARTS a tilt (from a flat camera) needs an aim with a lifted insert; later keys keep rx/ry and glide inside the plane
         (they may aim at the next inserts, lifted or not). A plane is left on a seam or slowly inside the next world. */
      const tilts = !!(kk.rx || kk.ry), starts = tilts && !lastTilt && !snap;
      let mv = kk.move ?? (starts ? 1.3 : 0.9);
      if (kk.aim) {
        if (landAt[kk.aim] === undefined) console.warn(`cam aim: no element "${kk.aim}" in beat ${i + 1}`);
        else { t = landAt[kk.aim] + (kk.late ?? 0.15);
          if (starts) { const b = onBeat(t - mv, t - mv - 0.3, Math.min(t - mv + 0.3, t - 1.1)); if (b !== null && b > lastT) mv = t - b; }   // v15: the dive starts on a beat
          hold = Math.max(0, 1 - mv / Math.max(0.01, t - lastT)); if (starts && !liftR[kk.aim]) console.warn(`cam aim: "${kk.aim}" in beat ${i + 1} is not lifted — the insert that opens the plane should hang in front of the sheet (lift)`); }
      } else if (starts) console.warn(`DIVE WITHOUT AIM: beat ${i + 1} tilts the camera at nothing — aim the key at the insert that lands at the end of the move (aim: 'id')`);
      if (starts && kk.aim && landAt[kk.aim] !== undefined && (kk.move ?? 1.3) < 1.1) console.warn(`DIVE TOO FAST: beat ${i + 1} — the plane change takes ≥ 1.1 s (move)`);
      if (starts && !spec.beats[i].cam.slice(j + 1).some(q => q.rx || q.ry) && !(spec.beats[i + 1] && spec.beats[i + 1].cut)) console.warn(`PLANE NOT HELD: beat ${i + 1} tilts and lays the world flat again inside the line — keep rx/ry on the following keys and deliver the line in the plane`);
      if (snap && cut.kind === 'zoom') {   // zoom-through: dive into a point of the old world, snap deep inside the new one, pull back
        const k = cut.k ?? 4.5, PR = ROOMS[lastRoom], px = cut.x ?? last.x, py = cut.y ?? last.y;
        comp.camera.key(tc - 0.02, { x: PR.x + px * PR.scale, y: PR.y + py * PR.scale, zoom: last.z * k / PR.scale, rot: last.rot, hold: 0, ease: 'in' });
        comp.camera.key(tc, { x: R.x + (c.x ?? 540) * R.scale, y: R.y + (c.y ?? 960) * R.scale, zoom: (c.z ?? 1) * k / R.scale, rot: c.rot ?? 0, hold: 0, ease: 'hold' });
        comp.camera.key(tc + (cut.out ?? 0.45), { x: R.x + (c.x ?? 540) * R.scale, y: R.y + (c.y ?? 960) * R.scale, zoom: (c.z ?? 1) / R.scale, rot: c.rot ?? 0, hold: 0, ease: 'out' });
        last = { x: c.x ?? 540, y: c.y ?? 960, z: c.z ?? 1, rot: c.rot ?? 0 }; lastT = tc + (cut.out ?? 0.45); return;
      }
      if (kk.rx || kk.ry) TILTED = true;   // v5 dive: the world tilts as a sheet in space (not inherited: the next key lays it flat again)
      comp.camera.key(t, { x: R.x + (c.x ?? 540) * R.scale, y: R.y + (c.y ?? 960) * R.scale, zoom: (c.z ?? 1) / R.scale, rot: c.rot ?? 0, rx: kk.rx ?? 0, ry: kk.ry ?? 0, hold: snap ? 0 : (hold ?? 0.35), ease: snap ? 'hold' : (kk.ease || 'flow'), focus: kk.focus, aperture: kk.ap });
      if (kk.aim) AIMS.push({ ko: comp.camera.keys.find(q => q.t === t), id: kk.aim, R, kk });
      /* v9: смена плоскости — свой звук. Раньше нырок на 1.3 с играл тот же короткий whoosh, что и проезд
         камеры: ухо слышало проезд, глаз видел смену плоскости. `dive` начинается со стартом наклона. */
      if (t > 0 && !snap) { if (starts && kk.aim) comp.cue(Math.max(0, t - mv), 'dive'); else comp.cue(t - 0.4, far ? 'tr_blur' : 'cam'); }
      last = { x: c.x ?? 540, y: c.y ?? 960, z: c.z ?? 1, rot: c.rot ?? 0 }; lastT = t; lastTilt = tilts;
    });
    lastRoom = b.room;
    if (cut && i > 0) {
      CUTS.push(tc);
      const col = cut.color || '#fff';
      if (cut.kind === 'iris') {   // a disc grows from (cx,cy) to cover the frame, the world snaps, the disc shrinks away
        const cx = cut.x ?? 540, cy = cut.y ?? 960, din = cut.in ?? 0.28, dout = cut.out ?? 0.32;
        const n = comp.overlay(`opacity:0`, (t, nd) => { const a = pr(t, tc - din, din), b = pr(t, tc, dout); const s = t < tc ? P.EASE.inOut(a) : 1 - P.EASE.inOut(b); const on = t > tc - din && t < tc + dout; nd.style.opacity = on ? '1' : '0'; nd.firstChild.style.transform = `translate(${cx - 50}px,${cy - 50}px) scale(${(s * 30).toFixed(3)})`; });
        n.innerHTML = `<div class="ovl-iris" style="background:${col}"></div>`; n.style.overflow = 'hidden';
        comp.cue(tc, 'iris');
      } else if (cut.kind === 'band') {   // a diagonal band sweeps from bottom-left to top-right; the world snaps when it covers the centre
        const d = cut.dur ?? 0.62, rot = cut.rot ?? -14, txt = cut.label || '';
        const n = comp.overlay(`opacity:0`, (t, nd) => { const q = P.EASE.inOut(pr(t, tc - d / 2, d)); const on = t > tc - d / 2 && t < tc + d / 2; nd.style.opacity = on ? '1' : '0'; nd.firstChild.style.transform = `translate(${((q - 0.5) * 3600).toFixed(1)}px,${((0.5 - q) * 2200).toFixed(1)}px) rotate(${rot}deg)`; });
        n.innerHTML = `<div class="ovl-band" style="background:${col};${cut.textColor ? `color:${cut.textColor}` : ''}">${txt}</div>`; n.style.overflow = 'hidden';
        comp.cue(tc, 'band');
      } else if (cut.kind === 'tone' || cut.kind === 'push' || cut.kind === 'torn') {
        /* v6 (NurTech Dc1PL4hCm58; Elzhan 13.09.2026 «перелив сделан неправильно»): the next world FLOODS IN over the old one, with its
           own ground and its own inserts — not a colour card. v5 swept an opaque veil over the frame: words vanished under it and 0.3 s of
           blank colour followed. Now, for `dur` before the cut, the new room is projected onto the screen exactly where the camera will
           see it after the snap (position and zoom solved against the live camera) and revealed through a soft moving mask; the old
           world shows through the soft band, so the light turns on the wall. At the cut the projection equals the snapped camera —
           no seam. Elements of the new beat that land before the cut are already visible in the flood (lifted ones wait for the snap). */
        /* v11: the same projected flood with two more edges — `push` (lamp reference: a hard edge, the old world is shoved out
           ahead of it, dir left | right | up | down) and `torn` (Vox: the new paper rises with a torn edge and a white paper core). */
        const kind = cut.kind, d = cut.dur ?? (kind === 'push' ? 0.5 : kind === 'torn' ? 0.75 : 0.9);
        const dir = cut.dir || (kind === 'push' ? 'left' : kind === 'torn' ? 'up' : 'down'), horiz = dir === 'left' || dir === 'right';
        const soft = cut.soft ?? (kind === 'push' ? 1.2 : 45), down = dir !== 'up', NR = R, t0 = tc - d, sc = NR.scale, z0 = NR.L.node.style.zIndex;
        const inSweep = t => t >= t0 && t < tc;
        const OLDLIFT = RECS.filter(r => r.li === i - 1 && typeof r.e.lift === 'number' && r.e.lift && r.L).map(r => r.L);
        let CN = null; const cn = () => CN || (CN = comp.camera.at(tc + 0.001));
        [NR.L, NR.B].filter(Boolean).forEach(Q => {   // v8: the room and its bleed field flood in together
          Q.expr('scale', (t, v) => inSweep(t) ? v * cn().zoom / comp.camera.at(t).zoom : v);
          Q.expr('x', (t, v) => { if (!inSweep(t)) return v; const c = comp.camera.at(t), n = cn(); return c.x + (v - n.x) * n.zoom / c.zoom; });
          Q.expr('y', (t, v) => { if (!inSweep(t)) return v; const c = comp.camera.at(t), n = cn(); return c.y + (v - n.y) * n.zoom / c.zoom; });
        });
        const zb = NR.B ? NR.B.node.style.zIndex : '';
        const ny = (sy, off = 0) => { const n = cn(); return ((n.y + (sy - 960) / n.zoom - (NR.y - NR.top * sc)) / sc + off).toFixed(1); };
        const nx = (sx, off = 0) => { const n = cn(); return ((n.x + (sx - 540) / n.zoom - NR.x) / sc + off).toFixed(1); };
        const maskH = (q, off) => { const S = soft * 10.8, edge = dir === 'left' ? 1080 + S - q * (1080 + 2 * S) : -S + q * (1080 + 2 * S);
          return dir === 'left' ? `linear-gradient(90deg,transparent ${nx(edge - S / 2, off)}px,#000 ${nx(edge + S / 2, off)}px)` : `linear-gradient(90deg,#000 ${nx(edge - S / 2, off)}px,transparent ${nx(edge + S / 2, off)}px)`; };
        const JAG = Array.from({ length: 25 }, (_, k) => 30 + 40 * rnd(k * 3.1 + i * 7)); JAG[24] = JAG[0];   // tileable tear line, 720 px period
        const jagD = (fillUp, lift = 0) => `M0 ${fillUp ? 100 : 0} ` + JAG.map((y, k) => `L${k * 30} ${(y + lift).toFixed(1)}`).join(' ') + ` L720 ${fillUp ? 100 : 0} Z`;
        const TORN_M = svgURI(`<svg xmlns='http://www.w3.org/2000/svg' width='720' height='100'><path d='${jagD(!down)}' fill='#000'/></svg>`);
        const rimD = 'M0 ' + JAG[0] + ' ' + JAG.map((y, k) => `L${k * 30} ${y.toFixed(1)}`).join(' ') + ' ' + JAG.slice().reverse().map((y, k) => `L${720 - k * 30} ${(y + (down ? -1 : 1) * (9 + 7 * rnd(k * 5.3 + i))).toFixed(1)}`).join(' ') + ' Z';
        const RIM = kind === 'torn' ? div('tornrim', `background-image:${svgURI(`<svg xmlns='http://www.w3.org/2000/svg' width='720' height='100'><path d='${rimD}' fill='#F5F0E4'/></svg>`)}`) : null;
        if (RIM) NR.L.node.appendChild(RIM);
        const tornAt = (q, off, st) => { const ey = down ? -60 + q * 2040 : 1980 - q * 2040, E = +ny(ey, off);
          st.webkitMaskImage = st.maskImage = `${TORN_M},linear-gradient(180deg,${down ? '#000' : 'transparent'} ${(down ? E - 48 : E + 48).toFixed(1)}px,${down ? 'transparent' : '#000'} ${(down ? E - 48 : E + 48).toFixed(1)}px)`;
          st.webkitMaskSize = st.maskSize = '720px 100px,100% 100%'; st.webkitMaskRepeat = st.maskRepeat = 'repeat-x,no-repeat'; st.webkitMaskPosition = st.maskPosition = `${off}px ${(E - 50).toFixed(1)}px,0 0`;
          return [ey, E]; };
        const SHADE = kind === 'tone' ? null : comp.overlay('display:none');
        /* 17.09.2026 (abat/reel_005, Елжан «здесь переход сломался»): два перелива в ОДНУ комнату — уборка второго
           каждый кадр стирала живую маску первого (`st.maskImage` стоял от чужого перелива), и первый шов не открывал мир.
           Перелив убирает только то, что поставил сам. */
        let MINE = false;
        if (kind === 'push') { const PRm = ROOMS[prevRoom]; [PRm.L, PRm.B].filter(Boolean).forEach(Q => Q.expr(horiz ? 'x' : 'y', (t, v) => { if (!(t >= t0 && t < tc)) return v; const q = P.EASE.inOut(pr(t, t0, d)); return v + (horiz ? 1080 : 1920) * q * (dir === 'left' || dir === 'up' ? -1 : 1) * (cut.shove ?? 0.55) / comp.camera.at(t).zoom; })); }
        const maskAt = (q, off) => { if (horiz) return maskH(q, off); const edge = (-soft + q * (100 + soft * 2)) * 19.2, back = edge - soft * 19.2;
          return down ? `linear-gradient(180deg,#000 ${ny(back, off)}px,transparent ${ny(edge, off)}px)` : `linear-gradient(180deg,transparent ${ny(1920 - edge, off)}px,#000 ${ny(1920 - back, off)}px)`; };
        comp.overlay('display:none', t => {
          const st = NR.L.node.style;
          /* 14.09.2026 (hakk_academy/reel_002): с ДВУМЯ переливами в ролике второй оверлей выполняется после первого
             и затирал флаг — window.SWEEP = false посреди чужого перелива, и qa/overlap.js засчитывал перелив как
             коллизию текстов (3 ложных пары). Флаг теперь собирается со всех переливов, а не пишется последним. */
          const SW = window.__SWEEPS || (window.__SWEEPS = new Set());
          if (inSweep(t)) SW.add(i); else SW.delete(i);
          window.SWEEP = SW.size > 0;   // qa/overlap.js: the flood covering old words is the move, not a collision
          const bs = NR.B ? NR.B.node.style : null;
          const clr = x => { x.webkitMaskImage = x.maskImage = ''; x.webkitMaskSize = x.maskSize = x.webkitMaskRepeat = x.maskRepeat = x.webkitMaskPosition = x.maskPosition = ''; };
          if (!inSweep(t)) { if (SHADE) SHADE.style.display = 'none'; if (RIM) RIM.style.display = 'none'; if (MINE) { MINE = false; clr(st); st.zIndex = z0; if (bs) { clr(bs); bs.zIndex = zb; } OLDLIFT.forEach(L => L.node.style.zIndex = '40'); } return; }
          OLDLIFT.forEach(L => L.node.style.zIndex = '20');   // the old world's lifted inserts go under the flood with their sheet
          const q = P.EASE.inOut(pr(t, t0, d));
          st.zIndex = '30'; if (bs) bs.zIndex = '29'; MINE = true;
          if (kind === 'torn' && !horiz) {
            const [ey, E] = tornAt(q, 0, st); if (bs) tornAt(q, NR.bleed, bs);
            RIM.style.display = 'block'; RIM.style.top = (E - 50).toFixed(1) + 'px';
            SHADE.style.display = 'block'; SHADE.style.background = `linear-gradient(${down ? 180 : 0}deg,rgba(0,0,0,.30),transparent)`; SHADE.style.inset = 'auto'; SHADE.style.left = '0'; SHADE.style.width = '1080px'; SHADE.style.height = '70px'; SHADE.style.top = (down ? ey + 22 : ey - 92).toFixed(1) + 'px';
          } else {
            st.webkitMaskImage = st.maskImage = maskAt(q, 0); if (bs) bs.webkitMaskImage = bs.maskImage = maskAt(q, NR.bleed);
            if (SHADE) { const S = soft * (horiz ? 10.8 : 19.2), ex = horiz ? (dir === 'left' ? 1080 + S - q * (1080 + 2 * S) : -S + q * (1080 + 2 * S)) : (down ? (-soft + q * (100 + soft * 2)) * 19.2 : 1920 - (-soft + q * (100 + soft * 2)) * 19.2);
              const lead = dir === 'left' || dir === 'up' ? -1 : 1;   // the shadow falls on the old world, ahead of the moving edge
              Object.assign(SHADE.style, { display: 'block', inset: 'auto', left: horiz ? (lead > 0 ? ex : ex - 90).toFixed(1) + 'px' : '0', top: horiz ? '0' : (lead > 0 ? ex : ex - 90).toFixed(1) + 'px', width: horiz ? '90px' : '1080px', height: horiz ? '1920px' : '90px',
                background: `linear-gradient(${horiz ? (lead > 0 ? 90 : 270) : (lead > 0 ? 180 : 0)}deg,rgba(0,0,0,.34),transparent)` }); }
          }
        });
        RECS.filter(r => r.li === i && typeof r.e.lift === 'number' && r.e.lift && r.L).forEach(({ L }) => L.expr('opacity', (t, v) => t < tc ? 0 : v));
        comp.cue(kind === 'tone' ? t0 + d * 0.3 : t0 + d * 0.15, kind === 'tone' ? 'iris' : kind);
      } else if (cut.kind === 'blink') {   // v11 (motionbylade): the world changes under one-word flash frames — a small word on a flat field, one per spoken word
        const hold = cut.hold ?? 0.34, words = cut.words || [], WT = blinkT, DEF = [['#FFFFFF', '#16140F'], ['#F3C01E', '#16140F'], ['#16140F', '#FFFFFF']];
        const end = WT[WT.length - 1] + (words[WT.length - 1].hold ?? hold);
        const n = comp.overlay('', (t, nd) => { let k = -1; WT.forEach((wt, j) => { if (t >= wt - 0.02) k = j; }); const on = k >= 0 && t < end; nd.style.display = on ? 'flex' : 'none';
          if (on && nd._k !== k) { nd._k = k; const w = words[k], dc = DEF[k % 3]; nd.style.background = w.bg || dc[0]; nd.innerHTML = `<b style="font-size:${w.s || cut.s || 46}px;color:${w.color || dc[1]}">${w.t}</b>`; } });
        n.className = 'blinkcard'; WT.forEach(wt => comp.cue(wt, 'blink'));
      } else if (cut.kind === 'slice') {   // v11 (Vox gears seam): horizontal strips slide in from alternate sides, the world snaps under them, they slide on out
        const d = cut.dur ?? 0.7, N = cut.n ?? 6, cols = [cut.color || '#16140F', cut.alt || '#E6D9BF'];
        const n = comp.overlay('opacity:0;overflow:hidden', (t, nd) => { const on = t > tc - d / 2 && t < tc + d / 2; nd.style.opacity = on ? '1' : '0'; if (!on) return;
          [...nd.children].forEach((sl, k) => { const sg = k % 2 ? 1 : -1, st = k * 0.015, a = P.EASE.inOut(pr(t, tc - d / 2 + st, d / 2 - 0.1)), b = P.EASE.inOut(pr(t, tc + st, d / 2 - 0.1)); sl.style.transform = `translateX(${((sg * (1 - a) - sg * b) * 1180).toFixed(1)}px)`; }); });
        n.innerHTML = Array.from({ length: N }, (_, k) => `<div class="ovl-band" style="left:-50px;top:${(k * 1920 / N - 2).toFixed(1)}px;width:1180px;height:${(1920 / N + 4).toFixed(1)}px;margin:0;background:${cols[k % 2]};box-shadow:0 10px 24px rgba(0,0,0,.3)"></div>`).join('');
        comp.cue(tc, 'slice');
      } else if (cut.kind === 'focus') {   // v14 goz: a hard cut on the beat; the arriving world resolves from blur and a slight overscale
        FOCUS.push({ tc, b0: cut.blur ?? 26, bd: cut.dur ?? 0.2, s0: cut.s0 ?? 1.07, sd: cut.settle ?? 0.34 }); comp.cue(tc, 'hard');
      } else if (cut.kind === 'flash') { FX.flash(comp, tc - 0.12, 0.3, col); comp.cue(tc, 'flash'); }
      else if (cut.kind === 'zoom') comp.cue(tc, 'zoom');
      else comp.cue(tc, 'hard');
    }
  });
  if (TILTED || LIFTED) comp.threeD(spec.persp ?? 1700, false);   // v5: real 3D only at the root — rooms stay flat clipped sheets, lifted elements hang in front
  if (CUTS.length) comp.overlay('', t => { if (CUTS.some(c => Math.abs(t - c) < 1.6 / 30)) comp.root.style.filter = ''; });   // no motion-blur smear on the snap frame
  /* v14 focus cuts run after the snap-frame reset above: the blur is the move here, and the overscale is laid over the camera's own transform */
  if (FOCUS.length) comp.overlay('', t => { const f = FOCUS.find(q => t >= q.tc && t < q.tc + Math.max(q.bd, q.sd)); if (!f) return;
    const u = t - f.tc, b = f.b0 * (1 - P.EASE.out(clamp(u / f.bd))), s = 1 + (f.s0 - 1) * (1 - P.EASE.out(clamp(u / f.sd))), st = comp.root.style;
    st.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : ''; st.transform = `translate(540px,960px) scale(${s.toFixed(4)}) translate(-540px,-960px) ` + st.transform; });
  comp.cue(DUR - 1.2, 'cta');
  (spec.sfx || []).forEach(q => comp.cue(q.t, 'sfx:' + q.s + '@' + (q.v ?? 0.26) + (q.cut ? '~' + q.cut : '')));   // названный звук на своём кадре: удар груза, гул; `cut` — длина в секундах

  /* geometry pass after fonts: rings / cursors / brackets / orbits wrap `around` an element's measured box,
     stamps sit `over` it, arrows run `from` one element `to` another. Nothing of this is guessed by hand. */
  const box = id => { const T = byId[id]; if (!T) return null; const LR = liftR[id];
    /* v6: a lifted element's base is global (it lives on the root); glass / spot / under wrap it inside the room — convert back, or they land 3400 px away */
    if (LR) return { x: (T.base.x - LR.x) / LR.scale, y: (T.base.y - LR.y) / LR.scale + (LR.top || 0), w: T.node.offsetWidth, h: T.node.offsetHeight };
    return { x: T.base.x, y: T.base.y, w: T.node.offsetWidth, h: T.node.offsetHeight }; };
  const fit = () => {
    /* v7: a lifted element lives on the root, outside its room — `.peri .num`, `.cream .hit` no longer match and it falls back to the
       default colours («1» dark green on green, «1 мл» black on cream). Measure its colours inside the room once and pin them inline. */
    for (const { e, L, R } of RECS) { if (typeof e.lift !== 'number' || !e.lift || !L || L._tinted) continue; L._tinted = true;
      const home = L.node.parentNode, next = L.node.nextSibling; R.L.node.appendChild(L.node);
      const els = [L.node, ...L.node.querySelectorAll('*')], cs = els.map(el => { const c = getComputedStyle(el); return [c.color, c.backgroundColor, c.borderColor]; });
      home.insertBefore(L.node, next);
      els.forEach((el, k) => { el.style.color = cs[k][0]; if (cs[k][1] !== 'rgba(0, 0, 0, 0)') el.style.backgroundColor = cs[k][1]; el.style.borderColor = cs[k][2]; }); }
    for (const { ko, id, R, kk } of AIMS) { const b = box(id); if (!b || !ko) continue;   // room-local node coords (incl. top) → global camera coords
      ko.x = R.x + (b.x + b.w / 2 + (kk.dx || 0)) * R.scale; ko.y = R.y + (b.y - (R.top || 0) + (b.h || b.w) / 2 + (kk.dy || 0)) * R.scale; }
    for (const { e, L, R } of RECS) {
      if (L._spot) {
        const sp = L._spot; let prev = null;
        sp.follow.forEach(id => { const b = box(id), T = byId[id]; if (!b || !T) return; const tt = landAt[id] ?? 0; const cx = b.x + b.w / 2 - sp.SZ / 2, cy = b.y + b.h / 2 - sp.SZ / 2;
          if (prev === null) { L.base.x = cx; L.base.y = cy; L.tracks.x = []; L.tracks.y = []; L.key('x', tt, cx, 'hold').key('y', tt, cy, 'hold'); }
          else { L.key('x', tt, prev.x, 'hold').key('y', tt, prev.y, 'hold').key('x', tt + sp.dur, cx, sp.ease).key('y', tt + sp.dur, cy, sp.ease); comp.cue(tt, 'spot'); }
          prev = { x: cx, y: cy }; });
        continue;
      }
      if (L._ptr) { for (const q of L._ptr) { const bb = box(q.id); if (!bb) { console.warn(`pointer: no element "${q.id}"`); continue; }
        let px = bb.x + bb.w * (q.fx ?? 0.5) + (q.dx || 0), py = bb.y + bb.h * (q.fy ?? 0.5) + (q.dy || 0);
        /* v13 (16.09.2026, abat reel_003): a cursor clicking a LIFTED element must be lifted too — inside its room it is painted
           under the sheet's lifted inserts and the arrow disappears behind the pill. A lifted cursor lives on the root in global
           coords, while the measured box stays room-local: convert, or the stop lands a room away. Same `lift` as its target —
           a different one moves the tip off the element under perspective. */
        if (typeof e.lift === 'number' && e.lift) { px = R.x + px * R.scale; py = R.y + (py - (R.top || 0)) * R.scale; }
        q.x = px; q.y = py; } continue; }
      if (e.around) {
        const b = box(e.around); if (!b) continue;
        const pad = e.pad ?? (e.k === 'cursor' ? 18 : e.k === 'brk' ? 40 : e.k === 'glass' ? 34 : e.k === 'under' ? 0 : e.k === 'circle' ? 26 : 60);
        if (e.k === 'hl') { L.base.x = b.x - 16; L.base.y = b.y + b.h * 0.2; L.w = b.w + 32; L.h = b.h * 0.7; L.node.style.width = L.w + 'px'; L.node.style.height = L.h + 'px'; L.base.rot = e.rot ?? -1.5; continue; }
        if (e.k === 'circle') { const w = b.w + pad * 2, h = b.h + pad * 2; L.base.x = b.x - pad; L.base.y = b.y - pad; L.w = w; L.h = h; const svg = L.node.querySelector('svg'); svg.setAttribute('width', w); svg.setAttribute('height', h); svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
          const ell = (dx, dy, s0) => { let d = ''; for (let k = 0; k <= 60; k++) { const u = k / 60, th = (-100 + u * 392) * Math.PI / 180, g = 1 + 0.06 * u + 0.025 * Math.sin(th * 3 + s0); d += (k ? ' L' : 'M') + `${(w / 2 + Math.cos(th) * w / 2 * g + dx).toFixed(1)} ${(h / 2 + Math.sin(th) * h / 2 * g + dy).toFixed(1)}`; } return d; };
          L.paths[0].setAttribute('d', ell(0, 0, 1)); L.paths[1].setAttribute('d', ell(5, 4, 2.3)); continue; }
        if (e.k === 'under') { const w = b.w + pad * 2 - 60; L.base.x = b.x - pad + 30; L.base.y = b.y + b.h + 6; L.w = w; L.h = 24; const svg = L.node.querySelector('svg'); svg.setAttribute('width', w); svg.setAttribute('height', 24); svg.setAttribute('viewBox', `0 0 ${w} 24`); L.paths[0].setAttribute('d', `M2 14 Q ${w * 0.3} 2 ${w * 0.55} 12 T ${w - 2} 10`); continue; }
        if (e.k === 'glass') { const w = b.w + pad * 2, h = b.h + pad * 2, r = e.r ?? 36; L.base.x = b.x - pad; L.base.y = b.y - pad; L.w = w; L.h = h; L.node.style.width = w + 'px'; L.node.style.height = h + 'px'; const svg = L.node.querySelector('svg'); svg.setAttribute('width', w); svg.setAttribute('height', h); svg.setAttribute('viewBox', `0 0 ${w} ${h}`); L.paths[0].setAttribute('d', rrect(w, h, r)); continue; }
        if (e.k === 'ring' || e.k === 'orbit') { const d = Math.max(b.w, b.h) + pad * 2; const cx = b.x + b.w / 2, cy = b.y + b.h / 2; L.base.x = cx - d / 2; L.base.y = cy - d / 2; L.w = L.h = d; const svg = L.node.querySelector('svg'); if (svg) { svg.setAttribute('width', d); svg.setAttribute('height', d); } L.node.style.width = L.node.style.height = d + 'px'; if (L.dots) { const R = d / 2; L.node.style.width = L.node.style.height = d + 'px'; } }
        else { L.base.x = b.x - pad; L.base.y = b.y - pad; L.w = b.w + pad * 2; L.h = b.h + pad * 2; L.node.style.width = L.w + 'px'; L.node.style.height = L.h + 'px'; }
      }
      if (e.over) {
        const b = box(e.over); if (!b) continue;
        const sz = e.w || Math.round(b.h * 1.7); const cx = e.at_ === 'center' || e.k !== 'stamp' ? b.x + b.w / 2 : b.x + Math.min(b.w / 2, b.h * 0.9);
        L.base.x = cx - sz / 2; L.base.y = b.y + b.h / 2 - sz / 2; L.base.scale = sz / 100;
      }
      if (e.from && e.to && e.k === 'arrow') {
        const a = box(e.from), b = box(e.to); if (!a || !b) continue;
        const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        const dx = bc.x - ac.x, dy = bc.y - ac.y, vert = Math.abs(dy) > Math.abs(dx);
        const p0 = vert ? { x: ac.x, y: dy > 0 ? a.y + a.h + 14 : a.y - 14 } : { x: dx > 0 ? a.x + a.w + 14 : a.x - 14, y: ac.y };
        const p1 = vert ? { x: bc.x, y: dy > 0 ? b.y - 14 : b.y + b.h + 14 } : { x: dx > 0 ? b.x - 14 : b.x + b.w + 14, y: bc.y };
        const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2, len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
        const nx = -(p1.y - p0.y) / len, ny = (p1.x - p0.x) / len, bulge = (e.bulge ?? 0.32) * len * (e.side ?? 1);
        const c = { x: mx + nx * bulge, y: my + ny * bulge };
        const tx = p1.x - c.x, ty = p1.y - c.y, tl = Math.hypot(tx, ty) || 1, ux = tx / tl, uy = ty / tl, hl = e.hl || 26;
        const h1 = { x: p1.x - ux * hl - uy * hl * 0.7, y: p1.y - uy * hl + ux * hl * 0.7 }, h2 = { x: p1.x - ux * hl + uy * hl * 0.7, y: p1.y - uy * hl - ux * hl * 0.7 };
        const minx = Math.min(p0.x, p1.x, c.x, h1.x, h2.x) - 20, miny = Math.min(p0.y, p1.y, c.y, h1.y, h2.y) - 20;
        const W = Math.max(p0.x, p1.x, c.x, h1.x, h2.x) + 20 - minx, H = Math.max(p0.y, p1.y, c.y, h1.y, h2.y) + 20 - miny;
        const r = q => `${(q.x - minx).toFixed(1)} ${(q.y - miny).toFixed(1)}`;
        L.base.x = minx; L.base.y = miny; L.w = W; L.h = H;
        const svg = L.node.querySelector('svg'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        L.paths[0].setAttribute('d', `M${r(p0)} Q ${r(c)} ${r(p1)}`);
        if (L.paths[1]) L.paths[1].setAttribute('d', `M${r(h1)} L${r(p1)} L${r(h2)}`);
      }
    }
  };
  ready(spec.fonts || ['700 100px Osw', '400 100px Marck', '700 100px Golos', '600 100px Golos'], () => { fit(); if (spec.fit) spec.fit(); });   // spec.fit: a wrapper genre (speaker-canvas) measures its own layers here
  comp.expose();
  window.ACTS_A = A;
  window.BEAT_ROOMS = spec.beats.map(b => b.room || null);   // qa/master.py READ TIME: an element without `until` lives while the camera stays in its room
  comp.seek(0);
  if (location.search.includes('play')) { const t0 = performance.now(); (function loop() { comp.seek(((performance.now() - t0) / 1000) % DUR); requestAnimationFrame(loop); })(); }
  return comp;
}
