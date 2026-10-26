// SVG art shared by the arena (ported from game/mockup). Returns markup strings.
import { corners as pts } from '../core/hex.js';
import { UNITS } from '../data/units.js';

export const MORVEN = '#2E3B3F', TOXIC = '#7CFFB2', MANA = '#7B5CFF', SKIN = '#F2C9A0';
export const SIDE_COLOR = { player: '#2F6FDB', enemy: '#D64545' };

export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export const TER = {
  grass: { top: '#7FB069', side: '#5E8F4C', name: 'Трава' },
  forest: { top: '#6FA35B', side: '#4F7E43', name: 'Лес' },
  hill: { top: '#C4AE80', side: '#9E8960', name: 'Холм' },
  rock: { top: '#7FB069', side: '#5E8F4C', name: 'Камень' },
  wall: { top: '#7FB069', side: '#5E8F4C', name: 'Стена' }
};
const tree = (x, y, k) => `<rect x="${x-1.2*k}" y="${y}" width="${2.4*k}" height="${4*k}" fill="#6B4E2E"/><polygon points="${x},${y-14*k} ${x+7*k},${y+1*k} ${x-7*k},${y+1*k}" fill="#3E7C59"/><polygon points="${x},${y-14*k} ${x+7*k},${y+1*k} ${x},${y+1*k}" fill="#356C4D"/>`;
const humps = (x, y, k, c) => `<path d="M${x-15*k} ${y+6*k} Q${x-7*k} ${y-9*k} ${x+1*k} ${y+6*k} Z" fill="${c}"/><path d="M${x-2*k} ${y+7*k} Q${x+6*k} ${y-4*k} ${x+14*k} ${y+7*k} Z" fill="${shade(c,-.08)}"/>`;
const hut = (x, y, k, roof) => `<rect x="${x-5*k}" y="${y-4*k}" width="${10*k}" height="${7*k}" fill="#EFE3C8"/><polygon points="${x-7*k},${y-4*k} ${x},${y-11*k} ${x+7*k},${y-4*k}" fill="${roof}"/><rect x="${x-1.4*k}" y="${y-1*k}" width="${2.8*k}" height="${4*k}" fill="#8A6A48"/>`;
export function decor(type, x, y, s){
  const k = s / 30;
  switch(type){
    case 'grass': return `<path d="M${x-9*k} ${y+5*k} l${2*k} ${-4*k} l${2*k} ${4*k} M${x+6*k} ${y-3*k} l${2*k} ${-4*k} l${2*k} ${4*k}" stroke="#5E8F4C" stroke-width="${1.6*k}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'forest': return tree(x-9*k, y+1*k, k*.85) + tree(x+9*k, y+3*k, k*.8) + tree(x, y-4*k, k);
    case 'hill': return humps(x, y, k, '#A48E64');
    case 'mountain': return `<polygon points="${x-14*k},${y+7*k} ${x-6*k},${y-6*k} ${x+1*k},${y+7*k}" fill="#7E848C"/><polygon points="${x-7*k},${y+7*k} ${x+2*k},${y-15*k} ${x+13*k},${y+7*k}" fill="#878D95"/><polygon points="${x+2*k},${y-15*k} ${x+6*k},${y-8*k} ${x+3*k},${y-9*k} ${x},${y-7*k} ${x-2*k},${y-9*k}" fill="#F2F4F6"/>`;
    case 'water': return `<path d="M${x-10*k} ${y-2*k} q${3*k} ${-3*k} ${6*k} 0 t${6*k} 0 M${x-2*k} ${y+5*k} q${3*k} ${-3*k} ${6*k} 0 t${6*k} 0" stroke="#8CC7F0" stroke-width="${2*k}" fill="none" stroke-linecap="round"/>`;
    case 'ore': return humps(x, y, k, '#A48E64') + `<polygon points="${x-6*k},${y+2*k} ${x-2*k},${y-3*k} ${x+2*k},${y+2*k}" fill="#4B4F57"/><polygon points="${x+3*k},${y+4*k} ${x+6*k},${y} ${x+9*k},${y+4*k}" fill="#5A5F68"/><circle cx="${x-2*k}" cy="${y}" r="${1.1*k}" fill="#B5652B"/>`;
    case 'gold': return humps(x, y, k, '#A48E64') + `<polygon points="${x-6*k},${y+2*k} ${x-2*k},${y-3*k} ${x+2*k},${y+2*k}" fill="#F2C14E"/><polygon points="${x+3*k},${y+4*k} ${x+6*k},${y} ${x+9*k},${y+4*k}" fill="#D9A632"/>`;
    case 'mana': return `<ellipse class="pulse" cx="${x}" cy="${y-2*k}" rx="${13*k}" ry="${11*k}" fill="${MANA}" opacity=".22"/><polygon points="${x},${y-16*k} ${x+6*k},${y-4*k} ${x},${y+5*k} ${x-6*k},${y-4*k}" fill="${MANA}"/><polygon points="${x},${y-16*k} ${x+6*k},${y-4*k} ${x},${y-2*k}" fill="#A28BFF"/>`;
    case 'ruins': return `<rect x="${x-10*k}" y="${y-8*k}" width="${4*k}" height="${12*k}" fill="#EFE8D6"/><polygon points="${x+3*k},${y+4*k} ${x+3*k},${y-12*k} ${x+5*k},${y-14*k} ${x+7*k},${y-11*k} ${x+7*k},${y+4*k}" fill="#EFE8D6"/><rect x="${x-4*k}" y="${y+2*k}" width="${7*k}" height="${3*k}" rx="${1*k}" fill="#D9D0BA"/>`;
    case 'village': return hut(x-6*k, y+3*k, k*.85, '#A0704A') + hut(x+6*k, y-1*k, k*.75, '#8B6142') + `<line x1="${x+1*k}" y1="${y+6*k}" x2="${x+1*k}" y2="${y-12*k}" stroke="#6B4E2E" stroke-width="${1.2*k}"/><polygon points="${x+1*k},${y-12*k} ${x+7*k},${y-10*k} ${x+1*k},${y-8*k}" fill="#C9CDD2"/>`;
    case 'field': return [-6,0,6].map(d => `<line x1="${x-12*k+d*k}" y1="${y+6*k}" x2="${x-2*k+d*k}" y2="${y-8*k}" stroke="#D3BF83" stroke-width="${2.2*k}" stroke-linecap="round"/>`).join('') + `<line x1="${x+6*k}" y1="${y+6*k}" x2="${x+12*k}" y2="${y-2*k}" stroke="#D3BF83" stroke-width="${2.2*k}" stroke-linecap="round"/>`;
    case 'rock': return `<path d="M${x-10*k} ${y+6*k} Q${x-9*k} ${y-6*k} ${x-1*k} ${y-6*k} Q${x+8*k} ${y-6*k} ${x+9*k} ${y+6*k} Z" fill="#9BA1A8"/><path d="M${x-1*k} ${y-6*k} Q${x+8*k} ${y-6*k} ${x+9*k} ${y+6*k} L${x+2*k} ${y+6*k} Z" fill="#878D95"/>`;
    case 'wall': return `<rect x="${x-13*k}" y="${y-14*k}" width="${26*k}" height="${20*k}" fill="#B9B2A4"/><rect x="${x-13*k}" y="${y+2*k}" width="${26*k}" height="${4*k}" fill="#9C9588"/>` + [-13,-6,1,8].map(d => `<rect x="${x+d*k}" y="${y-18*k}" width="${5*k}" height="${4*k}" fill="#B9B2A4"/>`).join('') + `<line x1="${x-13*k}" y1="${y-7*k}" x2="${x+13*k}" y2="${y-7*k}" stroke="#A39C8F" stroke-width="${1*k}"/>`;
    case 'ice': return `<polygon points="${x-12*k},${y+6*k} ${x-9*k},${y-12*k} ${x-2*k},${y-16*k} ${x+4*k},${y-9*k} ${x+11*k},${y-13*k} ${x+12*k},${y+6*k}" fill="#CFEFFF" opacity=".92"/><polygon points="${x-2*k},${y-16*k} ${x+4*k},${y-9*k} ${x+1*k},${y+6*k} ${x-9*k},${y-12*k}" fill="#FFFFFF" opacity=".55"/>`;
  }
  return '';
}
export function tile(type, cx, cy, s, extra = ''){
  const t = TER[type] || TER.grass, d = s * .2;
  return `<polygon points="${pts(cx, cy + d, s)}" fill="${t.side}"/><polygon points="${pts(cx, cy, s)}" fill="${t.top}"/>${decor(type, cx, cy, s)}${extra}`;
}

const armRect = (x) => `<rect x="${x}" y="43" width="5" height="14" rx="2.5" fill="SLEEVE"/>`;
function humanoid(kind, c){
  const dark = shade(c, -.32), light = shade(c, .35), u = UNITS[kind] || {};
  const undead = !!u.undead, robe = ['apprentice','battlemage','irena','acolyte'].includes(kind);
  const body = undead ? MORVEN : c, sleeve = undead ? '#3B4B50' : dark;
  const legs = robe ? '' : `<rect x="25" y="60" width="5.5" height="12" rx="2" fill="${undead ? '#E9E4D6' : '#4A3B30'}"/><rect x="33.5" y="60" width="5.5" height="12" rx="2" fill="${undead ? '#E9E4D6' : '#4A3B30'}"/>`;
  const torso = robe
    ? `<path d="M23 42 Q32 37 41 42 L45 72 Q32 75 19 72 Z" fill="${body}"/><path d="M30 42 L34 42 L35 72 L29 72 Z" fill="${undead ? TOXIC : light}" opacity="${undead ? .5 : .45}"/>`
    : `<path d="M22 42 Q32 37 42 42 L44 63 Q32 66 20 63 Z" fill="${body}"/><rect x="21" y="54" width="22" height="3" fill="${undead ? TOXIC : dark}" opacity="${undead ? .7 : 1}"/>`;
  let head = undead
    ? `<circle cx="32" cy="32" r="8.5" fill="#E9E4D6"/><circle cx="29" cy="31" r="2.2" fill="${MORVEN}"/><circle cx="35" cy="31" r="2.2" fill="${MORVEN}"/><circle cx="29" cy="31" r=".8" fill="${TOXIC}"/><circle cx="35" cy="31" r=".8" fill="${TOXIC}"/><rect x="29" y="36" width="6" height="2.5" rx="1" fill="#CFC8B6"/>`
    : `<circle cx="32" cy="32" r="8.5" fill="${SKIN}"/><circle cx="35" cy="32" r="1.1" fill="#3A2A20"/>`;
  let hat = '', back = '', armL = armRect(22), armR = armRect(37), offhand = '', weapon = '';
  const sword = `<rect x="38.8" y="34" width="2.6" height="22" rx="1" fill="#DDE3EA"/><rect x="36" y="52" width="8.4" height="2.2" rx="1" fill="#8A6A48"/>`;
  const shield = (f) => `<path d="M17 47 h14 v8 q0 7 -7 10 q-7 -3 -7 -10 Z" fill="${f}"/><path d="M24 49 v13" stroke="${shade(f,.45)}" stroke-width="2"/>`;
  const staff = (orb, big) => `<line x1="41" y1="${big ? 22 : 26}" x2="41" y2="70" stroke="#8A6A48" stroke-width="2.2" stroke-linecap="round"/>` + (big ? `<polygon points="41,12 45,20 41,27 37,20" fill="${orb}"/><circle cx="41" cy="20" r="7" fill="${orb}" opacity=".25"/>` : `<circle cx="41" cy="24" r="3.2" fill="${orb}"/>`);
  switch(kind){
    case 'militia': hat = `<path d="M23.5 31 A8.5 8.5 0 0 1 40.5 31 Z" fill="#8A6A48"/>`; offhand = `<circle cx="22" cy="54" r="6.5" fill="#A97C50"/><circle cx="22" cy="54" r="2" fill="#7A5634"/>`; weapon = `<line x1="40" y1="18" x2="40" y2="68" stroke="#8A6A48" stroke-width="2"/><polygon points="40,12 42.6,19 37.4,19" fill="#C9D1DA"/>`; break;
    case 'swordsman': hat = `<path d="M23 30 A9 9 0 0 1 41 30 Z" fill="#AEB6BF"/><rect x="20.5" y="28.5" width="23" height="2.6" rx="1.2" fill="#8F98A2"/>`; offhand = shield(c); weapon = sword; break;
    case 'archer': hat = `<path d="M22 37 Q22 21 32 21 Q42 21 42 37 L39 35 Q39 26 32 26 Q25 26 25 35 Z" fill="${dark}"/>`; offhand = `<path d="M19 36 Q10 52 19 68" stroke="#8A5A33" stroke-width="2.4" fill="none"/><line x1="19" y1="36" x2="19" y2="68" stroke="#E9E4D6" stroke-width=".8"/>`; weapon = `<line x1="40" y1="48" x2="40" y2="60" stroke="#8A6A48" stroke-width="1.4"/>`; break;
    case 'apprentice': hat = `<polygon points="21,29.5 43,29.5 35,9" fill="${light}"/><rect x="19.5" y="28" width="25" height="3" rx="1.5" fill="${light}"/>`; weapon = staff('#A28BFF'); break;
    case 'battlemage': hat = `<polygon points="20,29.5 44,29.5 29,3" fill="${dark}"/><rect x="18.5" y="28" width="27" height="3" rx="1.5" fill="${dark}"/><circle cx="31" cy="20" r="1.8" fill="#FFD86B"/>`; weapon = staff(MANA, true); break;
    case 'alden': back = `<path d="M22 41 Q32 37 42 41 L46 68 Q32 71 18 68 Z" fill="${dark}"/>`; hat = `<path d="M23 25 Q32 19 41 25 L41 37 Q32 40 23 37 Z" fill="#B8C0C8"/><rect x="27" y="30" width="12" height="2" fill="#2B3138"/><path d="M23 25 l3 -5 l3 3 l3 -5 l3 5 l3 -3 l3 5 Z" fill="#F2C14E"/>`; offhand = shield(c); weapon = sword; break;
    case 'irena': back = `<path d="M24 30 Q22 44 25 48 L28 34 Z M40 30 Q42 44 39 48 L36 34 Z" fill="#7A3B2E"/>`; hat = `<polygon points="20,29.5 44,29.5 33,4" fill="${dark}"/><rect x="18.5" y="28" width="27" height="3" rx="1.5" fill="${dark}"/><polygon points="32,22 34.5,25.5 32,29 29.5,25.5" fill="${MANA}"/>`; weapon = staff(MANA, true); break;
    case 'corvin': hat = `<path d="M22 37 Q22 20 32 20 Q42 20 42 37 L39 35 Q39 26 32 26 Q25 26 25 35 Z" fill="#3E5A3E"/><path d="M24 39 Q32 44 40 39 L40 43 Q32 47 24 43 Z" fill="${c}"/>`; offhand = `<path d="M18 34 Q8 52 18 70" stroke="#6B4E2E" stroke-width="2.8" fill="none"/><line x1="18" y1="34" x2="18" y2="70" stroke="#E9E4D6" stroke-width=".8"/>`; break;
    case 'skeleton': offhand = `<circle cx="22" cy="54" r="6" fill="#4B4F57"/>`; weapon = `<rect x="38.8" y="36" width="2.6" height="20" rx="1" fill="#A7ADB4"/>`; break;
    case 'ghoul': head = `<circle cx="34" cy="35" r="8" fill="#8FA38A"/><circle cx="37" cy="34" r="1.6" fill="${TOXIC}"/><path d="M32 40 l2 2 l2 -2 l2 2" stroke="#2B3036" stroke-width="1" fill="none"/>`; weapon = `<path d="M40 56 l4 4 M40 57 l2 6 M39 57 l-1 6" stroke="#E9E4D6" stroke-width="1.4"/>`; offhand = `<path d="M24 56 l-4 4 M24 57 l-2 6" stroke="#E9E4D6" stroke-width="1.4"/>`; break;
    case 'acolyte': hat = `<path d="M22 38 Q22 20 32 20 Q42 20 42 38 L39 36 Q39 26 32 26 Q25 26 25 36 Z" fill="#1A2326"/>`; weapon = staff(TOXIC, true); break;
  }
  const L = armL.replace('SLEEVE', sleeve), R = armR.replace('SLEEVE', sleeve);
  const tilt = kind === 'ghoul' ? ' transform="rotate(10 32 60)"' : '';
  return `${legs}<g class="upper"${tilt}>${back}<g class="armL">${L}${offhand}</g>${torso}${head}${hat}<g class="armR">${R}${weapon}</g></g>`;
}
function rider(kind, c){
  const undead = kind === 'deathknight';
  const horse = undead ? '#3B4B50' : '#8A5A3A', cloth = undead ? MORVEN : c, hem = undead ? TOXIC : shade(c, .4);
  const legs = [17,23,37,43].map(x => `<rect x="${x}" y="60" width="4" height="13" rx="1.5" fill="${shade(horse,-.2)}"/>`).join('');
  const body = `<path d="M10 56 q-4 6 -2 12" stroke="${shade(horse,-.25)}" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="30" cy="57" rx="18" ry="7.5" fill="${horse}"/><polygon points="41,55 49,39 55,41 48,58" fill="${horse}"/><ellipse cx="54" cy="42" rx="5.5" ry="3.6" fill="${horse}" transform="rotate(25 54 42)"/>` + (undead ? `<circle cx="55" cy="41" r="1" fill="${TOXIC}"/>` : `<circle cx="55" cy="41" r="1" fill="#1E1A16"/>`) + `<path d="M15 52 h30 v8 q-15 5 -30 0 Z" fill="${cloth}"/><path d="M15 59 q15 5 30 0" stroke="${hem}" stroke-width="1.6" fill="none"/>`;
  const helm = undead
    ? `<path d="M23 25 Q32 19 41 25 L41 37 Q32 40 23 37 Z" fill="#46545A"/><rect x="27" y="30" width="12" height="2" fill="${TOXIC}"/>`
    : `<path d="M23 25 Q32 19 41 25 L41 37 Q32 40 23 37 Z" fill="#B8C0C8"/><rect x="27" y="30" width="12" height="2" fill="#2B3138"/><path d="M32 21 Q26 12 20 15 Q26 17 30 22 Z" fill="${c}"/>`;
  const torso = `<path d="M22 42 Q32 37 42 42 L43 56 Q32 58 21 56 Z" fill="${undead ? MORVEN : c}"/>`;
  const sleeve = undead ? '#3B4B50' : shade(c, -.32);
  const lance = `<polygon points="39,53 64,38 64,40.5 40,55.5" fill="${undead ? '#5A666C' : '#C9A26A'}"/><polygon points="38,49 44,49 44,57 38,57" fill="#8F98A2"/>`;
  const up = `<g class="upper" transform="translate(-2 -10)"><g class="armL"><rect x="22" y="43" width="5" height="12" rx="2.5" fill="${sleeve}"/><path d="M17 45 h12 v7 q0 6 -6 8 q-6 -2 -6 -8 Z" fill="${undead ? '#46545A' : c}"/></g>${torso}<circle cx="32" cy="32" r="8.5" fill="${SKIN}"/>${helm}<g class="armR"><rect x="37" y="43" width="5" height="12" rx="2.5" fill="${sleeve}"/>${lance}</g></g>`;
  return legs + body + up;
}
function figBody(kind, c){ return (kind === 'knight' || kind === 'deathknight') ? rider(kind, c) : humanoid(kind, c); }
export function figInner(kind, c, flip){
  const inner = `<ellipse cx="32" cy="74" rx="15" ry="3.5" fill="rgba(0,0,0,.22)"/><g class="rig">${figBody(kind, c)}</g><circle class="ring" cx="32" cy="40" r="5" fill="none" stroke="${UNITS[kind]?.undead ? TOXIC : MANA}" stroke-width="1.5"/><text class="dmg" x="32" y="14" text-anchor="middle" font-family="Nunito,system-ui,sans-serif" font-weight="800" font-size="11" fill="#FF6B6B" stroke="#14212A" stroke-width="2.5" paint-order="stroke">−7</text>`;
  return flip ? `<g transform="translate(64 0) scale(-1 1)">${inner}</g>` : inner;
}
export function figSVG(kind, c, anim = '', flip = false){
  return `<svg class="fig ${anim}" viewBox="0 0 64 80" role="img" aria-label="${UNITS[kind]?.name || kind}">${figInner(kind, c, flip)}</svg>`;
}
export function figAt(kind, c, x, y, k, flip, anim = ''){
  return `<g class="fig ${anim}" transform="translate(${(x - 32*k).toFixed(1)} ${(y + 4 - 74*k).toFixed(1)}) scale(${k})">${figInner(kind, c, flip)}</g>`;
}

